// 星火小镇 — 声望系统
// T3.5.2 全局声望计算、NPC态度影响、区域权限

import { prisma } from '../models/prisma.js'
import { createLogger } from '../utils/index.js'

const logger = createLogger('ReputationSystem')

// =============================================
// 声望等级定义
// =============================================

/** 声望等级 */
export type ReputationTier = 'outcast' | 'disliked' | 'neutral' | 'respected' | 'exalted'

/** 声望等级配置 */
export interface ReputationTierConfig {
  /** 等级 */
  tier: ReputationTier
  /** 数值下限 */
  min: number
  /** 数值上限 */
  max: number
  /** 中文名 */
  displayName: string
  /** NPC态度修正（用于Prompt注入） */
  npcAttitudeModifier: string
  /** 全局交易折扣 */
  globalDiscount: number // 0-1
  /** 是否可进入所有区域 */
  accessAllAreas: boolean
  /** 是否解锁高级任务 */
  unlockHighLevelQuests: boolean
  /** NPC主动打招呼概率 */
  greetingChance: number // 0-1
  /** NPC主动提供帮助概率 */
  helpChance: number // 0-1
}

/** 5级声望配置 */
export const REPUTATION_TIERS: ReputationTierConfig[] = [
  {
    tier: 'outcast',
    min: 0,
    max: 19,
    displayName: '被驱逐者',
    npcAttitudeModifier: '镇民对你充满敌意和恐惧，不愿与你交谈。',
    globalDiscount: 0,
    accessAllAreas: false,
    unlockHighLevelQuests: false,
    greetingChance: 0,
    helpChance: 0,
  },
  {
    tier: 'disliked',
    min: 20,
    max: 39,
    displayName: '不受欢迎',
    npcAttitudeModifier: '镇民对你有偏见，态度冷淡且警惕。',
    globalDiscount: 0,
    accessAllAreas: false,
    unlockHighLevelQuests: false,
    greetingChance: 0.1,
    helpChance: 0.1,
  },
  {
    tier: 'neutral',
    min: 40,
    max: 59,
    displayName: '普通居民',
    npcAttitudeModifier: '镇民对你态度平常，正常交流。',
    globalDiscount: 0,
    accessAllAreas: false,
    unlockHighLevelQuests: false,
    greetingChance: 0.3,
    helpChance: 0.3,
  },
  {
    tier: 'respected',
    min: 60,
    max: 79,
    displayName: '受人尊敬',
    npcAttitudeModifier: '镇民对你充满敬意，乐于帮助你。',
    globalDiscount: 0.05,
    accessAllAreas: true,
    unlockHighLevelQuests: true,
    greetingChance: 0.6,
    helpChance: 0.5,
  },
  {
    tier: 'exalted',
    min: 80,
    max: 100,
    displayName: '星火英雄',
    npcAttitudeModifier: '你是小镇的英雄，所有人都崇拜你，争相为你效力。',
    globalDiscount: 0.1,
    accessAllAreas: true,
    unlockHighLevelQuests: true,
    greetingChance: 0.9,
    helpChance: 0.8,
  },
]

// =============================================
// 声望变化事件
// =============================================

/** 声望变化事件类型 */
export type ReputationEventType =
  | 'quest_completed'
  | 'quest_failed'
  | 'monster_defeated'
  | 'boss_defeated'
  | 'helped_town'
  | 'harmed_town'
  | 'story_milestone'
  | 'saved_npc'
  | 'stole_item'
  | 'attacked_npc'

/** 声望变化配置 */
export interface ReputationChangeConfig {
  type: ReputationEventType
  delta: number
  description: string
}

/** 预设声望变化事件 */
export const REPUTATION_EVENTS: Record<ReputationEventType, ReputationChangeConfig> = {
  quest_completed: { type: 'quest_completed', delta: 3, description: '完成任务' },
  quest_failed: { type: 'quest_failed', delta: -5, description: '任务失败' },
  monster_defeated: { type: 'monster_defeated', delta: 1, description: '击败怪物' },
  boss_defeated: { type: 'boss_defeated', delta: 10, description: '击败BOSS' },
  helped_town: { type: 'helped_town', delta: 5, description: '帮助小镇' },
  harmed_town: { type: 'harmed_town', delta: -10, description: '损害小镇利益' },
  story_milestone: { type: 'story_milestone', delta: 15, description: '重要剧情节点' },
  saved_npc: { type: 'saved_npc', delta: 8, description: '拯救NPC' },
  stole_item: { type: 'stole_item', delta: -15, description: '偷窃被发现' },
  attacked_npc: { type: 'attacked_npc', delta: -20, description: '攻击镇民' },
}

// =============================================
// 区域权限定义
// =============================================

/** 区域定义 */
export interface AreaDefinition {
  /** 区域ID */
  areaId: string
  /** 区域名 */
  name: string
  /** 进入所需声望等级 */
  requiredReputation: number
  /** 描述 */
  description: string
}

/** 9大区域及声望要求 */
export const AREAS: AreaDefinition[] = [
  { areaId: 'town_center', name: '小镇中心', requiredReputation: 0, description: '所有人可进入' },
  { areaId: 'market', name: '集市', requiredReputation: 0, description: '商业区，所有人可进入' },
  { areaId: 'residential', name: '居民区', requiredReputation: 20, description: '需达到不受欢迎以上' },
  { areaId: 'forge', name: '铁匠铺', requiredReputation: 20, description: '需达到不受欢迎以上' },
  { areaId: 'tavern', name: '酒馆', requiredReputation: 30, description: '需达到一定声望' },
  { areaId: 'forest_edge', name: '森林边缘', requiredReputation: 0, description: '野外区域' },
  { areaId: 'deep_forest', name: '森林深处', requiredReputation: 40, description: '需要一定声望才能探索' },
  { areaId: 'ancient_ruins', name: '古代遗迹', requiredReputation: 50, description: '需要中等声望' },
  { areaId: 'sacred_grove', name: '圣林', requiredReputation: 70, description: '需要受人尊敬以上' },
]

// =============================================
// 声望变化记录
// =============================================

/** 声望变化日志 */
export interface ReputationLogEntry {
  playerId: string
  before: number
  after: number
  delta: number
  eventType: ReputationEventType
  description: string
  tierChanged: boolean
  beforeTier: ReputationTier
  afterTier: ReputationTier
  timestamp: number
}

// =============================================
// 声望系统核心
// =============================================

/**
 * ReputationSystem — 声望系统
 *
 * 功能：
 * 1. 计算全局声望变化
 * 2. 管理5级声望等级
 * 3. 影响NPC对话态度
 * 4. 控制区域进入权限
 * 5. 解锁高级任务
 * 6. 提供全局交易折扣
 */
class ReputationSystem {
  /** 变化历史 */
  private history: ReputationLogEntry[] = []
  private readonly MAX_HISTORY = 500

  /** 玩家声望缓存 */
  private reputationCache: Map<string, number> = new Map()

  // =============================================
  // 查询
  // =============================================

  /**
   * 根据声望值获取等级
   */
  getTier(reputation: number): ReputationTier {
    for (const tier of REPUTATION_TIERS) {
      if (reputation >= tier.min && reputation <= tier.max) {
        return tier.tier
      }
    }
    return reputation < 0 ? 'outcast' : 'exalted'
  }

  /**
   * 获取声望等级配置
   */
  getTierConfig(reputation: number): ReputationTierConfig {
    const tier = this.getTier(reputation)
    return REPUTATION_TIERS.find((t) => t.tier === tier)!
  }

  /**
   * 获取声望等级中文名
   */
  getTierDisplayName(reputation: number): string {
    return this.getTierConfig(reputation).displayName
  }

  /**
   * 获取NPC态度修正描述
   */
  getNpcAttitudeModifier(reputation: number): string {
    return this.getTierConfig(reputation).npcAttitudeModifier
  }

  /**
   * 获取全局交易折扣
   */
  getGlobalDiscount(reputation: number): number {
    return this.getTierConfig(reputation).globalDiscount
  }

  /**
   * 检查是否可以进入指定区域
   */
  canEnterArea(reputation: number, areaId: string): { allowed: boolean; reason: string } {
    const area = this.getAreaById(areaId)
    if (!area) return { allowed: false, reason: '未知区域' }

    if (reputation < area.requiredReputation) {
      const tier = this.getTierConfig(area.requiredReputation)
      return {
        allowed: false,
        reason: `声望不足，需要${tier.displayName}以上才能进入${area.name}`,
      }
    }

    return { allowed: true, reason: '' }
  }

  /**
   * 根据区域ID获取区域定义
   */
  getAreaById(areaId: string): AreaDefinition | undefined {
    return AREAS.find((a) => a.areaId === areaId)
  }

  /**
   * 是否解锁高级任务
   */
  hasHighLevelQuestAccess(reputation: number): boolean {
    return this.getTierConfig(reputation).unlockHighLevelQuests
  }

  /**
   * NPC主动打招呼概率
   */
  getGreetingChance(reputation: number): number {
    return this.getTierConfig(reputation).greetingChance
  }

  /**
   * NPC主动帮助概率
   */
  getHelpChance(reputation: number): number {
    return this.getTierConfig(reputation).helpChance
  }

  // =============================================
  // 变化计算
  // =============================================

  /**
   * 计算声望变化
   */
  calculateChange(
    currentReputation: number,
    eventType: ReputationEventType,
    multiplier: number = 1.0,
  ): { newReputation: number; delta: number; tierChanged: boolean; beforeTier: ReputationTier; afterTier: ReputationTier } {
    const config = REPUTATION_EVENTS[eventType]
    const delta = Math.round(config.delta * multiplier)
    const newReputation = Math.max(0, Math.min(100, currentReputation + delta))
    const beforeTier = this.getTier(currentReputation)
    const afterTier = this.getTier(newReputation)
    const tierChanged = beforeTier !== afterTier

    return {
      newReputation,
      delta: newReputation - currentReputation,
      tierChanged,
      beforeTier,
      afterTier,
    }
  }

  // =============================================
  // 数据库操作
  // =============================================

  /**
   * 获取玩家全局声望
   * 从所有NPC关系的平均声望计算
   */
  async getPlayerReputation(playerId: string): Promise<number> {
    // 检查缓存
    if (this.reputationCache.has(playerId)) {
      return this.reputationCache.get(playerId)!
    }

    const relations = await prisma.playerRelation.findMany({
      where: { playerId },
      select: { reputation: true },
    })

    if (relations.length === 0) {
      return 50 // 默认声望
    }

    const avgReputation = Math.round(
      relations.reduce((sum, r) => sum + r.reputation, 0) / relations.length,
    )

    this.reputationCache.set(playerId, avgReputation)
    return avgReputation
  }

  /**
   * 更新玩家声望
   * 声望变化会传播到所有NPC关系记录
   */
  async updateReputation(
    playerId: string,
    eventType: ReputationEventType,
    multiplier: number = 1.0,
  ): Promise<{
    success: boolean
    newReputation: number
    delta: number
    tierChanged: boolean
    beforeTier: ReputationTier
    afterTier: ReputationTier
    message: string
  }> {
    try {
      const currentReputation = await this.getPlayerReputation(playerId)
      const beforeTier = this.getTier(currentReputation)

      const config = REPUTATION_EVENTS[eventType]
      const rawDelta = Math.round(config.delta * multiplier)
      const newReputation = Math.max(0, Math.min(100, currentReputation + rawDelta))
      const actualDelta = newReputation - currentReputation
      const afterTier = this.getTier(newReputation)
      const tierChanged = beforeTier !== afterTier

      // 将声望变化传播到所有NPC关系记录
      const relations = await prisma.playerRelation.findMany({
        where: { playerId },
      })

      for (const rel of relations) {
        const newRelRep = Math.max(0, Math.min(100, rel.reputation + rawDelta))
        await prisma.playerRelation.update({
          where: { id: rel.id },
          data: { reputation: newRelRep },
        })
      }

      // 如果没有关系记录，创建一条默认的
      if (relations.length === 0) {
        // 声望变化时没有NPC关系，先不处理
        logger.warn(`No relations found for player ${playerId} when updating reputation`)
      }

      // 更新缓存
      this.reputationCache.set(playerId, newReputation)

      // 记录历史
      const logEntry: ReputationLogEntry = {
        playerId,
        before: currentReputation,
        after: newReputation,
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
        const tierConfig = this.getTierConfig(newReputation)
        const arrow = actualDelta > 0 ? '↑' : '↓'
        message = `声望${arrow} ${actualDelta > 0 ? '+' : ''}${actualDelta} (${currentReputation}→${newReputation})，成为【${tierConfig.displayName}】`
      } else {
        message = `声望${actualDelta > 0 ? '+' : ''}${actualDelta} (${currentReputation}→${newReputation})`
      }

      logger.info(`Reputation updated: player=${playerId} ${currentReputation}→${newReputation} (${eventType})`)

      return {
        success: true,
        newReputation,
        delta: actualDelta,
        tierChanged,
        beforeTier,
        afterTier,
        message,
      }
    } catch (err) {
      logger.error(`Failed to update reputation: ${(err as Error).message}`)
      return {
        success: false,
        newReputation: 50,
        delta: 0,
        tierChanged: false,
        beforeTier: 'neutral',
        afterTier: 'neutral',
        message: '声望更新失败',
      }
    }
  }

  /**
   * 初始化玩家与NPC的声望
   */
  async initPlayerReputation(playerId: string, npcId: string, reputation: number = 50): Promise<void> {
    const existing = await prisma.playerRelation.findUnique({
      where: { playerId_npcId: { playerId, npcId } },
    })

    if (!existing) {
      await prisma.playerRelation.create({
        data: { playerId, npcId, affection: 50, trust: 50, reputation },
      })
    }

    // 清除缓存，下次读取时重新计算
    this.reputationCache.delete(playerId)
  }

  // =============================================
  // 综合查询
  // =============================================

  /**
   * 获取玩家完整的声望信息
   */
  async getPlayerReputationInfo(playerId: string): Promise<{
    reputation: number
    tier: ReputationTier
    tierConfig: ReputationTierConfig
    globalDiscount: number
    accessibleAreas: string[]
    lockedAreas: string[]
    hasHighLevelQuests: boolean
  }> {
    const reputation = await this.getPlayerReputation(playerId)
    const tierConfig = this.getTierConfig(reputation)

    const accessibleAreas: string[] = []
    const lockedAreas: string[] = []

    for (const area of AREAS) {
      if (reputation >= area.requiredReputation) {
        accessibleAreas.push(area.areaId)
      } else {
        lockedAreas.push(area.areaId)
      }
    }

    return {
      reputation,
      tier: tierConfig.tier,
      tierConfig,
      globalDiscount: tierConfig.globalDiscount,
      accessibleAreas,
      lockedAreas,
      hasHighLevelQuests: tierConfig.unlockHighLevelQuests,
    }
  }

  // =============================================
  // 历史记录
  // =============================================

  getHistory(playerId?: string, limit: number = 20): ReputationLogEntry[] {
    let result = this.history
    if (playerId) result = result.filter((h) => h.playerId === playerId)
    return result.slice(-limit).reverse()
  }

  private addHistory(entry: ReputationLogEntry): void {
    this.history.push(entry)
    if (this.history.length > this.MAX_HISTORY) {
      this.history = this.history.slice(-this.MAX_HISTORY)
    }
  }

  /**
   * 清除缓存
   */
  clearCache(playerId?: string): void {
    if (playerId) {
      this.reputationCache.delete(playerId)
    } else {
      this.reputationCache.clear()
    }
  }
}

/** 全局声望系统实例 */
export const reputationSystem = new ReputationSystem()
