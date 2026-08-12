// 星火小镇 — 关系影响行为系统
// T3.6.2 关系影响对话态度、折扣、信息共享
//
// 整合好感度系统(T3.5.1)和声望系统(T3.5.2)，
// 将关系数值转化为实际的游戏行为效果

import { prisma } from '../models/prisma.js'
import { affectionSystem } from './affectionSystem.js'
import { reputationSystem } from './reputationSystem.js'

// =============================================
// 行为影响类型
// =============================================

/** 对话态度结果 */
export interface DialogueAttitude {
  /** NPC态度描述（注入Prompt） */
  attitudeText: string
  /** 好感度等级名 */
  affectionTier: string
  /** 声望等级名 */
  reputationTier: string
  /** 是否愿意交谈 */
  willingToTalk: boolean
  /** 是否愿意分享秘密信息 */
  sharesSecrets: boolean
  /** 对话选项数量修正 */
  dialogueOptionModifier: number
}

/** 交易折扣结果 */
export interface TradeDiscount {
  /** 总折扣率（0-1） */
  totalDiscount: number
  /** 好感度折扣 */
  affectionDiscount: number
  /** 声望折扣 */
  reputationDiscount: number
  /** 最终价格倍率 */
  priceMultiplier: number
  /** 说明 */
  description: string
}

/** 信息共享结果 */
export interface InformationSharing {
  /** 是否愿意共享 */
  willing: boolean
  /** 共享信息深度（0=无, 1=基础, 2=详细, 3=秘密） */
  depth: number
  /** 可分享的情报类型 */
  infoTypes: string[]
  /** 说明 */
  reason: string
}

/** 任务提供结果 */
export interface QuestAvailability {
  /** 是否提供任务 */
  available: boolean
  /** 可提供任务等级 */
  questLevel: 'low' | 'medium' | 'high'
  /** 说明 */
  reason: string
}

/** 区域访问结果 */
export interface AreaAccessResult {
  /** 是否允许进入 */
  allowed: boolean
  /** 区域ID */
  areaId: string
  /** 所需声望 */
  requiredReputation: number
  /** 说明 */
  reason: string
}

// =============================================
// 关系行为服务
// =============================================

/**
 * RelationBehaviorService — 关系影响行为
 *
 * 将好感度+声望+关系类型转化为具体游戏效果：
 * 1. 对话态度：NPC的说话语气、是否愿意交流
 * 2. 交易折扣：好感度+声望叠加折扣
 * 3. 信息共享：高好感度的NPC会分享秘密情报
 * 4. 任务提供：声望和好感度共同决定可接任务
 * 5. 区域访问：声望控制可进入的区域
 * 6. 雇佣队友：好感度决定是否可雇佣NPC为战斗队友
 */
class RelationBehaviorService {
  // =============================================
  // 1. 对话态度
  // =============================================

  /**
   * 获取NPC对玩家的对话态度
   */
  async getDialogueAttitude(playerId: string, npcId: string): Promise<DialogueAttitude> {
    const relation = await prisma.playerRelation.findUnique({
      where: { playerId_npcId: { playerId, npcId } },
    })

    const affection = relation?.affection ?? 50
    const trust = relation?.trust ?? 50
    const reputation = await reputationSystem.getPlayerReputation(playerId)

    const affectionTier = affectionSystem.getTierConfig(affection)
    const reputationTier = reputationSystem.getTierConfig(reputation)

    // 构建态度描述
    const affectionDesc = affectionSystem.getAttitudeDescription(affection)
    const reputationDesc = reputationSystem.getNpcAttitudeModifier(reputation)

    const attitudeText = [
      `【好感度：${affectionTier.displayName}】${affectionDesc}`,
      `【信任度：${trust}/100】${trust >= 60 ? '对你较为信任' : trust >= 40 ? '一般信任' : '不太信任你'}`,
      `【声望：${reputationTier.displayName}】${reputationDesc}`,
    ].join('\n')

    // 是否愿意交谈
    const willingToTalk = affection >= 20 && reputation >= 20

    // 是否分享秘密
    const sharesSecrets = affection >= 60 && trust >= 50

    // 对话选项数量修正
    let dialogueOptionModifier = 0
    if (affection >= 80) dialogueOptionModifier = 2
    else if (affection >= 60) dialogueOptionModifier = 1
    else if (affection < 20) dialogueOptionModifier = -2
    else if (affection < 40) dialogueOptionModifier = -1

    return {
      attitudeText,
      affectionTier: affectionTier.displayName,
      reputationTier: reputationTier.displayName,
      willingToTalk,
      sharesSecrets,
      dialogueOptionModifier,
    }
  }

  // =============================================
  // 2. 交易折扣
  // =============================================

  /**
   * 计算玩家的交易折扣
   */
  async getTradeDiscount(playerId: string, npcId?: string): Promise<TradeDiscount> {
    let affectionDiscount = 0

    if (npcId) {
      const relation = await prisma.playerRelation.findUnique({
        where: { playerId_npcId: { playerId, npcId } },
      })
      if (relation) {
        affectionDiscount = affectionSystem.getDiscountRate(relation.affection)
      }
    }

    const reputation = await reputationSystem.getPlayerReputation(playerId)
    const reputationDiscount = reputationSystem.getGlobalDiscount(reputation)

    // 折扣叠加（但不叠加超过30%）
    const totalDiscount = Math.min(0.3, affectionDiscount + reputationDiscount)
    const priceMultiplier = 1 - totalDiscount

    const parts: string[] = []
    if (affectionDiscount > 0) parts.push(`好感度${Math.round(affectionDiscount * 100)}%`)
    if (reputationDiscount > 0) parts.push(`声望${Math.round(reputationDiscount * 100)}%`)
    const description = parts.length > 0
      ? `折扣来源：${parts.join(' + ')}，总折扣${Math.round(totalDiscount * 100)}%`
      : '无折扣'

    return {
      totalDiscount,
      affectionDiscount,
      reputationDiscount,
      priceMultiplier,
      description,
    }
  }

  /**
   * 计算折后价格
   */
  async getDiscountedPrice(playerId: string, npcId: string, basePrice: number): Promise<{ originalPrice: number; finalPrice: number; discount: number }> {
    const discount = await this.getTradeDiscount(playerId, npcId)
    const finalPrice = Math.max(1, Math.floor(basePrice * discount.priceMultiplier))
    return {
      originalPrice: basePrice,
      finalPrice,
      discount: basePrice - finalPrice,
    }
  }

  // =============================================
  // 3. 信息共享
  // =============================================

  /**
   * 检查NPC是否愿意共享信息
   */
  async getInformationSharing(playerId: string, npcId: string): Promise<InformationSharing> {
    const relation = await prisma.playerRelation.findUnique({
      where: { playerId_npcId: { playerId, npcId } },
    })

    const affection = relation?.affection ?? 50
    const trust = relation?.trust ?? 50

    // 好感度和信任度共同决定信息深度
    const combined = (affection + trust) / 2

    if (combined < 30) {
      return {
        willing: false,
        depth: 0,
        infoTypes: [],
        reason: '好感度和信任度过低，NPC不愿分享任何信息',
      }
    }

    if (combined < 50) {
      return {
        willing: true,
        depth: 1,
        infoTypes: ['gossip', 'rumor', 'basic_info'],
        reason: 'NPC愿意分享一些基本的闲言碎语',
      }
    }

    if (combined < 70) {
      return {
        willing: true,
        depth: 2,
        infoTypes: ['gossip', 'rumor', 'basic_info', 'personal_story', 'local_news', 'quest_hint'],
        reason: 'NPC信任你，愿意分享更多详细情报',
      }
    }

    return {
      willing: true,
      depth: 3,
      infoTypes: ['gossip', 'rumor', 'basic_info', 'personal_story', 'local_news', 'quest_hint', 'secret', 'hidden_location', 'treasure_info'],
      reason: 'NPC完全信任你，愿意分享秘密情报',
    }
  }

  /**
   * 检查NPC是否会通过信息传播告知其他NPC关于玩家的事
   */
  async checkInfoPropagation(playerId: string, npcId: string): Promise<{ willPropagate: boolean; targetNpcIds: string[] }> {
    const relation = await prisma.playerRelation.findUnique({
      where: { playerId_npcId: { playerId, npcId } },
    })

    const affection = relation?.affection ?? 50

    // 好感度高 → 正面传播；好感度低 → 不传播或负面传播
    if (affection >= 60) {
      return {
        willPropagate: true,
        targetNpcIds: [], // 由NPC关系网络决定
      }
    }

    if (affection <= 20) {
      return {
        willPropagate: true, // 负面八卦
        targetNpcIds: [],
      }
    }

    return {
      willPropagate: false,
      targetNpcIds: [],
    }
  }

  // =============================================
  // 4. 任务提供
  // =============================================

  /**
   * 检查NPC是否会对玩家提供任务
   */
  async getQuestAvailability(playerId: string, npcId: string): Promise<QuestAvailability> {
    const relation = await prisma.playerRelation.findUnique({
      where: { playerId_npcId: { playerId, npcId } },
    })

    const affection = relation?.affection ?? 50
    const reputation = await reputationSystem.getPlayerReputation(playerId)

    // 好感度过低 → 不提供任务
    if (affection < 20) {
      return {
        available: false,
        questLevel: 'low',
        reason: '好感度过低，NPC不愿给你任务',
      }
    }

    // 高级任务需要高好感度+高声望
    if (affection >= 70 && reputation >= 60) {
      return {
        available: true,
        questLevel: 'high',
        reason: 'NPC完全信任你，提供高级任务',
      }
    }

    // 中级任务需要中等好感度
    if (affection >= 50) {
      return {
        available: true,
        questLevel: 'medium',
        reason: 'NPC愿意给你一些任务',
      }
    }

    // 低级任务
    return {
      available: true,
      questLevel: 'low',
      reason: 'NPC提供一些简单的任务',
    }
  }

  // =============================================
  // 5. 区域访问
  // =============================================

  /**
   * 检查玩家是否可以进入指定区域
   */
  async checkAreaAccess(playerId: string, areaId: string): Promise<AreaAccessResult> {
    const reputation = await reputationSystem.getPlayerReputation(playerId)
    const result = reputationSystem.canEnterArea(reputation, areaId)

    const area = reputationSystem.getAreaById(areaId)

    return {
      allowed: result.allowed,
      areaId,
      requiredReputation: area?.requiredReputation ?? 0,
      reason: result.reason,
    }
  }

  // =============================================
  // 6. 队友雇佣
  // =============================================

  /**
   * 检查是否可以雇佣NPC为队友
   */
  async checkCompanionHire(playerId: string, npcId: string, _playerStarCoins: number): Promise<{
    canHire: boolean
    cost: number
    reason: string
  }> {
    const relation = await prisma.playerRelation.findUnique({
      where: { playerId_npcId: { playerId, npcId } },
    })

    const affection = relation?.affection ?? 50

    // 使用companionAI的雇佣检查（通过好感度系统）
    if (!affectionSystem.canHireAsCompanion(affection)) {
      return {
        canHire: false,
        cost: 0,
        reason: `好感度不足，需要达到「友好」等级（当前${affection}）`,
      }
    }

    // 具体的雇佣费用由companionAI配置决定
    // 这里只做好感度检查
    return {
      canHire: true,
      cost: 0, // 具体费用在companionAI中查询
      reason: '满足好感度要求，可以雇佣',
    }
  }

  // =============================================
  // 综合查询
  // =============================================

  /**
   * 获取玩家与某NPC的完整关系行为摘要
   */
  async getFullRelationBehavior(playerId: string, npcId: string): Promise<{
    attitude: DialogueAttitude
    tradeDiscount: TradeDiscount
    infoSharing: InformationSharing
    questAvailability: QuestAvailability
    canHire: boolean
  }> {
    const [attitude, tradeDiscount, infoSharing, questAvailability] = await Promise.all([
      this.getDialogueAttitude(playerId, npcId),
      this.getTradeDiscount(playerId, npcId),
      this.getInformationSharing(playerId, npcId),
      this.getQuestAvailability(playerId, npcId),
    ])

    const hireCheck = await this.checkCompanionHire(playerId, npcId, 0)

    return {
      attitude,
      tradeDiscount,
      infoSharing,
      questAvailability,
      canHire: hireCheck.canHire,
    }
  }

  /**
   * 构建用于NPC对话Prompt的关系上下文
   */
  async buildRelationPromptContext(playerId: string, npcId: string): Promise<string> {
    const behavior = await this.getFullRelationBehavior(playerId, npcId)

    const lines: string[] = []

    lines.push('=== 玩家关系信息 ===')
    lines.push(behavior.attitude.attitudeText)

    if (behavior.tradeDiscount.totalDiscount > 0) {
      lines.push(`交易折扣：${Math.round(behavior.tradeDiscount.totalDiscount * 100)}%`)
    }

    if (behavior.infoSharing.depth >= 3) {
      lines.push('情报共享：NPC愿意分享秘密信息')
    } else if (behavior.infoSharing.willing) {
      lines.push('情报共享：NPC愿意分享基础信息')
    } else {
      lines.push('情报共享：NPC不愿分享信息')
    }

    if (behavior.questAvailability.available) {
      lines.push(`任务提供：可提供${behavior.questAvailability.questLevel}级任务`)
    } else {
      lines.push('任务提供：当前不提供任务')
    }

    return lines.join('\n')
  }
}

/** 全局关系行为服务实例 */
export const relationBehavior = new RelationBehaviorService()
