// 星火小镇 — 好感度系统
// T3.5.1 好感度计算、变化事件、5级态度

import { prisma } from '../models/prisma.js'
import { createLogger } from '../utils/index.js'

const logger = createLogger('AffectionSystem')

// =============================================
// 好感度等级定义
// =============================================

/** 好感度等级（5级） */
export type AffectionTier = 'hostile' | 'unfriendly' | 'neutral' | 'friendly' | 'devoted'

/** 好感度等级配置 */
export interface AffectionTierConfig {
  /** 等级名称 */
  tier: AffectionTier
  /** 数值范围下限 */
  min: number
  /** 数值范围上限 */
  max: number
  /** 中文显示名 */
  displayName: string
  /** 对话态度描述（用于Prompt注入） */
  attitude: string
  /** 是否解锁交易折扣 */
  discountRate: number // 0-1, 0=无折扣
  /** 是否可雇佣为队友 */
  canHire: boolean
  /** 是否解锁特殊对话 */
  unlockSpecialDialogue: boolean
  /** 是否会主动提供任务 */
  providesQuests: boolean
}

/** 5级好感度配置表 */
export const AFFECTION_TIERS: AffectionTierConfig[] = [
  {
    tier: 'hostile',
    min: 0,
    max: 19,
    displayName: '敌对',
    attitude: '极度不信任，甚至可能拒绝交流或攻击。',
    discountRate: 0,
    canHire: false,
    unlockSpecialDialogue: false,
    providesQuests: false,
  },
  {
    tier: 'unfriendly',
    min: 20,
    max: 39,
    displayName: '冷淡',
    attitude: '态度冷淡，不愿多说话，回答简短。',
    discountRate: 0,
    canHire: false,
    unlockSpecialDialogue: false,
    providesQuests: false,
  },
  {
    tier: 'neutral',
    min: 40,
    max: 59,
    displayName: '普通',
    attitude: '态度平常，会正常交流，但不主动分享太多信息。',
    discountRate: 0,
    canHire: false,
    unlockSpecialDialogue: false,
    providesQuests: true,
  },
  {
    tier: 'friendly',
    min: 60,
    max: 79,
    displayName: '友好',
    attitude: '态度友善，乐于助人，愿意分享更多信息。',
    discountRate: 0.1,
    canHire: true,
    unlockSpecialDialogue: true,
    providesQuests: true,
  },
  {
    tier: 'devoted',
    min: 80,
    max: 100,
    displayName: '挚友',
    attitude: '完全信任，视为至交好友，愿为玩家两肋插刀。',
    discountRate: 0.2,
    canHire: true,
    unlockSpecialDialogue: true,
    providesQuests: true,
  },
]

// =============================================
// 好感度变化事件
// =============================================

/** 好感度变化事件类型 */
export type AffectionEventType =
  | 'dialogue'         // 对话交互
  | 'gift'             // 赠送礼物
  | 'quest_completed'  // 完成任务
  | 'quest_failed'     // 任务失败
  | 'combat_together'  // 并肩战斗
  | 'helped_npc'       // 帮助NPC
  | 'offended_npc'     // 冒犯NPC
  | 'story_event'      // 剧情事件
  | 'daily_decay'      // 每日衰减

/** 好感度变化配置 */
export interface AffectionChangeConfig {
  /** 事件类型 */
  type: AffectionEventType
  /** 好感度变化值 */
  delta: number
  /** 信任度变化值 */
  trustDelta?: number
  /** 描述 */
  description: string
}

/** 预设好感度变化事件 */
export const AFFECTION_EVENTS: Record<AffectionEventType, AffectionChangeConfig> = {
  dialogue: {
    type: 'dialogue',
    delta: 1,
    trustDelta: 0,
    description: '日常对话',
  },
  gift: {
    type: 'gift',
    delta: 5,
    trustDelta: 2,
    description: '赠送礼物',
  },
  quest_completed: {
    type: 'quest_completed',
    delta: 10,
    trustDelta: 5,
    description: '完成任务',
  },
  quest_failed: {
    type: 'quest_failed',
    delta: -8,
    trustDelta: -5,
    description: '任务失败',
  },
  combat_together: {
    type: 'combat_together',
    delta: 3,
    trustDelta: 2,
    description: '并肩战斗',
  },
  helped_npc: {
    type: 'helped_npc',
    delta: 7,
    trustDelta: 3,
    description: '帮助NPC',
  },
  offended_npc: {
    type: 'offended_npc',
    delta: -10,
    trustDelta: -8,
    description: '冒犯NPC',
  },
  story_event: {
    type: 'story_event',
    delta: 15,
    trustDelta: 10,
    description: '重要剧情事件',
  },
  daily_decay: {
    type: 'daily_decay',
    delta: -1,
    trustDelta: 0,
    description: '每日自然衰减',
  },
}

// =============================================
// 好感度系统核心
// =============================================

/** 好感度变化记录 */
export interface AffectionLogEntry {
  /** 玩家ID */
  playerId: string
  /** NPC ID */
  npcId: string
  /** 变化前好感度 */
  before: number
  /** 变化后好感度 */
  after: number
  /** 变化值 */
  delta: number
  /** 事件类型 */
  eventType: AffectionEventType
  /** 描述 */
  description: string
  /** 是否跨等级 */
  tierChanged: boolean
  /** 变化前等级 */
  beforeTier: AffectionTier
  /** 变化后等级 */
  afterTier: AffectionTier
  /** 时间戳 */
  timestamp: number
}

/**
 * AffectionSystem — 好感度系统
 *
 * 功能：
 * 1. 计算好感度变化（含等级跨域判定）
 * 2. 管理5级态度（敌对/冷淡/普通/友好/挚友）
 * 3. 提供交易折扣、雇佣权限、任务解锁等查询
 * 4. 记录好感度变化历史
 * 5. 每日衰减机制
 */
class AffectionSystem {
  /** 变化历史（最近500条） */
  private history: AffectionLogEntry[] = []

  /** 最大历史记录数 */
  private readonly MAX_HISTORY = 500

  // =============================================
  // 查询
  // =============================================

  /**
   * 根据好感度数值获取等级
   */
  getTier(affection: number): AffectionTier {
    for (const tier of AFFECTION_TIERS) {
      if (affection >= tier.min && affection <= tier.max) {
        return tier.tier
      }
    }
    return affection < 0 ? 'hostile' : 'devoted'
  }

  /**
   * 获取好感度等级配置
   */
  getTierConfig(affection: number): AffectionTierConfig {
    const tier = this.getTier(affection)
    return AFFECTION_TIERS.find((t) => t.tier === tier)!
  }

  /**
   * 获取好感度等级中文名
   */
  getTierDisplayName(affection: number): string {
    return this.getTierConfig(affection).displayName
  }

  /**
   * 获取对玩家的态度描述（用于Prompt注入）
   */
  getAttitudeDescription(affection: number): string {
    return this.getTierConfig(affection).attitude
  }

  /**
   * 获取交易折扣率
   */
  getDiscountRate(affection: number): number {
    return this.getTierConfig(affection).discountRate
  }

  /**
   * 是否可雇佣为队友
   */
  canHireAsCompanion(affection: number): boolean {
    return this.getTierConfig(affection).canHire
  }

  /**
   * 是否解锁特殊对话
   */
  hasSpecialDialogue(affection: number): boolean {
    return this.getTierConfig(affection).unlockSpecialDialogue
  }

  /**
   * 是否会主动提供任务
   */
  providesQuests(affection: number): boolean {
    return this.getTierConfig(affection).providesQuests
  }

  // =============================================
  // 变化计算
  // =============================================

  /**
   * 计算好感度变化后的值
   */
  calculateChange(
    currentAffection: number,
    eventType: AffectionEventType,
    multiplier: number = 1.0,
  ): { newAffection: number; delta: number; tierChanged: boolean; beforeTier: AffectionTier; afterTier: AffectionTier } {
    const config = AFFECTION_EVENTS[eventType]
    const delta = Math.round(config.delta * multiplier)

    const newAffection = Math.max(0, Math.min(100, currentAffection + delta))
    const beforeTier = this.getTier(currentAffection)
    const afterTier = this.getTier(newAffection)
    const tierChanged = beforeTier !== afterTier

    return {
      newAffection,
      delta: newAffection - currentAffection,
      tierChanged,
      beforeTier,
      afterTier,
    }
  }

  // =============================================
  // 数据库操作
  // =============================================

  /**
   * 更新玩家对NPC的好感度
   */
  async updateAffection(
    playerId: string,
    npcId: string,
    eventType: AffectionEventType,
    multiplier: number = 1.0,
    customDelta?: number,
  ): Promise<{
    success: boolean
    newAffection: number
    newTrust: number
    delta: number
    tierChanged: boolean
    beforeTier: AffectionTier
    afterTier: AffectionTier
    message: string
  }> {
    try {
      // 获取当前关系
      let relation = await prisma.playerRelation.findUnique({
        where: { playerId_npcId: { playerId, npcId } },
      })

      if (!relation) {
        // 创建初始关系
        relation = await prisma.playerRelation.create({
          data: { playerId, npcId, affection: 50, trust: 50, reputation: 50 },
        })
      }

      const beforeAffection = relation.affection
      const beforeTier = this.getTier(beforeAffection)

      // 计算变化
      const config = AFFECTION_EVENTS[eventType]
      const rawDelta = customDelta ?? Math.round(config.delta * multiplier)
      const trustDelta = config.trustDelta ? Math.round(config.trustDelta * multiplier) : 0

      const newAffection = Math.max(0, Math.min(100, beforeAffection + rawDelta))
      const newTrust = Math.max(0, Math.min(100, relation.trust + trustDelta))
      const actualDelta = newAffection - beforeAffection
      const afterTier = this.getTier(newAffection)
      const tierChanged = beforeTier !== afterTier

      // 写入数据库
      await prisma.playerRelation.update({
        where: { playerId_npcId: { playerId, npcId } },
        data: {
          affection: newAffection,
          trust: newTrust,
          description: `${config.description}: ${new Date().toISOString().substring(0, 10)}`,
        },
      })

      // 记录历史
      const logEntry: AffectionLogEntry = {
        playerId,
        npcId,
        before: beforeAffection,
        after: newAffection,
        delta: actualDelta,
        eventType,
        description: config.description,
        tierChanged,
        beforeTier,
        afterTier,
        timestamp: Date.now(),
      }
      this.addHistory(logEntry)

      // 生成消息
      let message: string
      if (tierChanged) {
        const tierConfig = this.getTierConfig(newAffection)
        const arrow = actualDelta > 0 ? '↑' : '↓'
        message = `好感度${arrow} ${actualDelta > 0 ? '+' : ''}${actualDelta} (${beforeAffection}→${newAffection})，态度变为【${tierConfig.displayName}】`
      } else {
        message = `好感度${actualDelta > 0 ? '+' : ''}${actualDelta} (${beforeAffection}→${newAffection})`
      }

      logger.info(`Affection updated: player=${playerId} npc=${npcId} ${beforeAffection}→${newAffection} (${eventType})`)

      return {
        success: true,
        newAffection,
        newTrust,
        delta: actualDelta,
        tierChanged,
        beforeTier,
        afterTier,
        message,
      }
    } catch (err) {
      logger.error(`Failed to update affection: ${(err as Error).message}`)
      return {
        success: false,
        newAffection: 50,
        newTrust: 50,
        delta: 0,
        tierChanged: false,
        beforeTier: 'neutral',
        afterTier: 'neutral',
        message: '好感度更新失败',
      }
    }
  }

  /**
   * 获取玩家对某NPC的好感度
   */
  async getAffection(playerId: string, npcId: string): Promise<number> {
    const relation = await prisma.playerRelation.findUnique({
      where: { playerId_npcId: { playerId, npcId } },
    })
    return relation?.affection ?? 50
  }

  /**
   * 获取玩家对所有NPC的好感度
   */
  async getAllAffections(playerId: string): Promise<Array<{ npcId: string; affection: number; tier: AffectionTier }>> {
    const relations = await prisma.playerRelation.findMany({
      where: { playerId },
    })
    return relations.map((r) => ({
      npcId: r.npcId,
      affection: r.affection,
      tier: this.getTier(r.affection),
    }))
  }

  /**
   * 执行每日衰减
   */
  async applyDailyDecay(playerId: string): Promise<{ affectedCount: number }> {
    const relations = await prisma.playerRelation.findMany({
      where: { playerId },
    })

    let affectedCount = 0
    for (const rel of relations) {
      // 只对高于neutral的好感度进行衰减
      if (rel.affection > 40) {
        const newAffection = Math.max(40, rel.affection - 1)
        if (newAffection !== rel.affection) {
          await prisma.playerRelation.update({
            where: { id: rel.id },
            data: { affection: newAffection },
          })
          affectedCount++
        }
      }
    }

    logger.info(`Daily decay applied for player ${playerId}: ${affectedCount} relations affected`)
    return { affectedCount }
  }

  // =============================================
  // 历史记录
  // =============================================

  /**
   * 获取好感度变化历史
   */
  getHistory(playerId?: string, npcId?: string, limit: number = 20): AffectionLogEntry[] {
    let result = this.history
    if (playerId) result = result.filter((h) => h.playerId === playerId)
    if (npcId) result = result.filter((h) => h.npcId === npcId)
    return result.slice(-limit).reverse()
  }

  private addHistory(entry: AffectionLogEntry): void {
    this.history.push(entry)
    if (this.history.length > this.MAX_HISTORY) {
      this.history = this.history.slice(-this.MAX_HISTORY)
    }
  }

  // =============================================
  // 赠礼系统
  // =============================================

  /**
   * 赠送礼物的好感度变化
   */
  calculateGiftAffection(
    giftItemCategory: string,
    npcLikes: string[],
    npcDislikes: string[],
  ): { delta: number; multiplier: number; description: string } {
    // NPC喜欢 → 2倍效果
    if (npcLikes.includes(giftItemCategory)) {
      return { delta: 10, multiplier: 2.0, description: `NPC喜欢${giftItemCategory}类物品，好感度翻倍！` }
    }
    // NPC讨厌 → 负面效果
    if (npcDislikes.includes(giftItemCategory)) {
      return { delta: -5, multiplier: 1.0, description: `NPC讨厌${giftItemCategory}类物品，好感度下降！` }
    }
    // 普通礼物
    return { delta: 5, multiplier: 1.0, description: 'NPC接受了礼物' }
  }
}

/** 全局好感度系统实例 */
export const affectionSystem = new AffectionSystem()
