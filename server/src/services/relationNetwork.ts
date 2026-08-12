// 星火小镇 — NPC关系网络初始化服务
// T4.1.4 从数据库加载并缓存NPC间关系，提供运行时查询和更新能力

import { prisma } from '../models/prisma.js'
import { createLogger } from '../utils/index.js'
import { profileLoader } from './profileLoader.js'
import type { RelationType, AffectionLevel } from '../types/npc-profile.js'

const logger = createLogger('RelationNetwork')

// =============================================
// 类型定义
// =============================================

/** 关系缓存条目 */
interface CachedRelation {
  /** 关系记录ID */
  id: string
  /** 源NPC ID */
  sourceNpcId: string
  /** 目标NPC ID */
  targetNpcId: string
  /** 关系类型 */
  type: RelationType
  /** 好感度 0-100 */
  affection: number
  /** 信任度 0-100 */
  trust: number
  /** 关系描述 */
  description: string
  /** 最后更新时间戳 */
  updatedAt: number
}

/** 关系更新事件 */
interface RelationUpdateEvent {
  /** 源NPC ID */
  sourceNpcId: string
  /** 目标NPC ID */
  targetNpcId: string
  /** 关系类型（可能已变） */
  type: RelationType
  /** 好感度变化 */
  affectionDelta: number
  /** 信任度变化 */
  trustDelta: number
  /** 变化原因 */
  reason: string
  /** 时间戳 */
  timestamp: number
}

/** 关系网络统计 */
interface RelationNetworkStats {
  /** 总关系对数 */
  totalRelations: number
  /** 各类型关系数量 */
  typeBreakdown: Record<RelationType, number>
  /** 平均好感度 */
  avgAffection: number
  /** 平均信任度 */
  avgTrust: number
  /** 最高好感度关系 */
  highestAffection: CachedRelation | null
  /** 最低好感度关系 */
  lowestAffection: CachedRelation | null
}

// =============================================
// 关系类型自动调整规则
// =============================================

/** 根据好感度和信任度自动推导关系类型 */
function deriveRelationType(affection: number, trust: number): RelationType {
  // 互信极高且好感高 → 家人/恋人级
  if (affection >= 80 && trust >= 80) return 'family'
  // 高好感 → 朋友
  if (affection >= 60) return 'friend'
  // 低好感且低信任 → 敌对
  if (affection <= 20 && trust <= 20) return 'enemy'
  // 低好感但信任尚可 → 竞争对手
  if (affection <= 35 && trust >= 40) return 'rival'
  // 默认中立
  return 'neutral'
}

/** 好感度等级映射 */
function getAffectionLevel(affection: number): AffectionLevel {
  if (affection >= 80) return 'devoted'
  if (affection >= 60) return 'friendly'
  if (affection >= 40) return 'neutral'
  if (affection >= 20) return 'unfriendly'
  return 'hostile'
}

// =============================================
// RelationNetworkService 核心实现
// =============================================

class RelationNetworkService {
  /** 关系缓存：以 "sourceId:targetId" 为key */
  private relationCache: Map<string, CachedRelation> = new Map()

  /** NPC ID → 该NPC的所有关系key列表 */
  private npcRelationIndex: Map<string, Set<string>> = new Map()

  /** 关系更新事件历史（最近100条） */
  private updateHistory: RelationUpdateEvent[] = []

  /** 是否已初始化 */
  private initialized = false

  // =============================================
  // 初始化
  // =============================================

  /**
   * 初始化关系网络 — 从数据库加载所有关系到内存缓存
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      logger.warn('Relation network already initialized')
      return
    }

    logger.info('Initializing NPC relation network...')

    try {
      const relations = await prisma.nPCRelation.findMany()
      let loaded = 0

      for (const rel of relations) {
        const cached: CachedRelation = {
          id: rel.id,
          sourceNpcId: rel.sourceNpcId,
          targetNpcId: rel.targetNpcId,
          type: rel.type as RelationType,
          affection: rel.affection,
          trust: rel.trust,
          description: rel.description,
          updatedAt: rel.updatedAt.getTime(),
        }

        this.addToCache(cached)
        loaded++
      }

      this.initialized = true
      logger.info(`Relation network initialized: ${loaded} relations loaded for ${this.npcRelationIndex.size} NPCs`)
    } catch (err) {
      logger.error(`Failed to initialize relation network: ${(err as Error).message}`)
      throw err
    }
  }

  // =============================================
  // 缓存管理
  // =============================================

  /**
   * 生成缓存key
   */
  private cacheKey(sourceId: string, targetId: string): string {
    return `${sourceId}:${targetId}`
  }

  /**
   * 添加关系到缓存
   */
  private addToCache(relation: CachedRelation): void {
    const key = this.cacheKey(relation.sourceNpcId, relation.targetNpcId)
    this.relationCache.set(key, relation)

    // 更新NPC索引
    if (!this.npcRelationIndex.has(relation.sourceNpcId)) {
      this.npcRelationIndex.set(relation.sourceNpcId, new Set())
    }
    this.npcRelationIndex.get(relation.sourceNpcId)!.add(key)

    if (!this.npcRelationIndex.has(relation.targetNpcId)) {
      this.npcRelationIndex.set(relation.targetNpcId, new Set())
    }
    this.npcRelationIndex.get(relation.targetNpcId)!.add(key)
  }

  /**
   * 从缓存中移除关系
   */
  removeRelation(sourceId: string, targetId: string): void {
    const key = this.cacheKey(sourceId, targetId)
    this.relationCache.delete(key)

    const sourceIndex = this.npcRelationIndex.get(sourceId)
    if (sourceIndex) sourceIndex.delete(key)

    const targetIndex = this.npcRelationIndex.get(targetId)
    if (targetIndex) targetIndex.delete(key)
  }

  // =============================================
  // 查询接口
  // =============================================

  /**
   * 获取两个NPC之间的关系
   * @returns 关系数据，如果不存在返回 null
   */
  getRelation(sourceNpcId: string, targetNpcId: string): CachedRelation | null {
    const key = this.cacheKey(sourceNpcId, targetNpcId)
    return this.relationCache.get(key) ?? null
  }

  /**
   * 获取两个NPC之间的关系（双向查找）
   * 优先返回 A→B 方向，如果没有则返回 B→A
   */
  getRelationBidirectional(npcA: string, npcB: string): CachedRelation | null {
    return this.getRelation(npcA, npcB) ?? this.getRelation(npcB, npcA)
  }

  /**
   * 获取NPC的关系类型（用于信息传播等场景）
   * 简化版接口，只返回关系类型字符串
   */
  getRelationType(npcA: string, npcB: string): RelationType {
    const rel = this.getRelationBidirectional(npcA, npcB)
    return rel?.type ?? 'neutral'
  }

  /**
   * 获取NPC的好感度等级
   */
  getAffectionLevel(npcA: string, npcB: string): AffectionLevel {
    const rel = this.getRelationBidirectional(npcA, npcB)
    return rel ? getAffectionLevel(rel.affection) : 'neutral'
  }

  /**
   * 获取某个NPC的所有关系
   * @returns 该NPC参与的所有限制关系列表
   */
  getNpcRelations(npcId: string): CachedRelation[] {
    const keys = this.npcRelationIndex.get(npcId)
    if (!keys) return []

    const results: CachedRelation[] = []
    for (const key of keys) {
      const rel = this.relationCache.get(key)
      if (rel) results.push(rel)
    }

    // 按好感度降序排列
    results.sort((a, b) => b.affection - a.affection)
    return results
  }

  /**
   * 获取NPC的友好关系列表
   */
  getFriendlyRelations(npcId: string): CachedRelation[] {
    return this.getNpcRelations(npcId).filter(
      (r) => r.type === 'friend' || r.type === 'family'
    )
  }

  /**
   * 获取NPC的敌对关系列表
   */
  getHostileRelations(npcId: string): CachedRelation[] {
    return this.getNpcRelations(npcId).filter(
      (r) => r.type === 'enemy' || r.type === 'rival'
    )
  }

  /**
   * 构建关系摘要文本（用于Prompt注入）
   */
  buildRelationSummary(npcId: string): string {
    const relations = this.getNpcRelations(npcId)

    if (relations.length === 0) return '（无特殊关系）'

    const summaries = relations.map((r) => {
      const isSource = r.sourceNpcId === npcId
      const targetProfile = profileLoader.getProfile(r.targetNpcId)
      const sourceProfile = profileLoader.getProfile(r.sourceNpcId)
      const otherName = isSource
        ? (targetProfile?.name ?? r.targetNpcId)
        : (sourceProfile?.name ?? r.sourceNpcId)

      return `${isSource ? '→' : '←'} [${r.type}] ${otherName}: 好感${r.affection} 信任${r.trust} - ${r.description}`
    })

    return summaries.join('\n')
  }

  /**
   * 构建用于对话Prompt的关系描述
   */
  buildDialogueRelationContext(npcId: string, targetNpcId: string): string {
    const rel = this.getRelationBidirectional(npcId, targetNpcId)
    if (!rel) return '你们之间没有特别的关系。'

    const targetProfile = profileLoader.getProfile(targetNpcId)
    const targetName = targetProfile?.name ?? targetNpcId

    const levelDesc = getAffectionLevel(rel.affection)
    const levelMap: Record<AffectionLevel, string> = {
      devoted: '非常亲密',
      friendly: '友好',
      neutral: '一般',
      unfriendly: '不太友好',
      hostile: '敌对',
    }

    return `你与${targetName}的关系是[${rel.type}]，好感度${rel.affection}（${levelMap[levelDesc]}），信任度${rel.trust}。${rel.description}`
  }

  // =============================================
  // 关系更新
  // =============================================

  /**
   * 更新NPC间关系（核心方法）
   * @returns 更新后的关系数据和变化值
   */
  async updateRelation(
    sourceNpcId: string,
    targetNpcId: string,
    affectionDelta: number,
    trustDelta: number,
    reason: string,
  ): Promise<{ relation: CachedRelation; affectionDelta: number; trustDelta: number; typeChanged: boolean } | null> {
    try {
      const existing = this.getRelation(sourceNpcId, targetNpcId)
      let relation: CachedRelation
      let typeChanged = false

      if (existing) {
        // 更新现有关系
        const newAffection = Math.max(0, Math.min(100, existing.affection + affectionDelta))
        const newTrust = Math.max(0, Math.min(100, existing.trust + trustDelta))
        const newType = deriveRelationType(newAffection, newTrust)

        typeChanged = newType !== existing.type

        // 写入数据库
        await prisma.nPCRelation.update({
          where: { id: existing.id },
          data: {
            affection: newAffection,
            trust: newTrust,
            type: newType,
            description: reason.substring(0, 200),
          },
        })

        relation = {
          ...existing,
          affection: newAffection,
          trust: newTrust,
          type: newType,
          description: reason.substring(0, 200),
          updatedAt: Date.now(),
        }
      } else {
        // 创建新关系
        const initialAffection = Math.max(0, Math.min(100, 50 + affectionDelta))
        const initialTrust = Math.max(0, Math.min(100, 50 + trustDelta))
        const type = deriveRelationType(initialAffection, initialTrust)

        const created = await prisma.nPCRelation.create({
          data: {
            sourceNpcId,
            targetNpcId,
            affection: initialAffection,
            trust: initialTrust,
            type,
            description: reason.substring(0, 200),
          },
        })

        relation = {
          id: created.id,
          sourceNpcId,
          targetNpcId,
          type,
          affection: initialAffection,
          trust: initialTrust,
          description: reason.substring(0, 200),
          updatedAt: Date.now(),
        }
      }

      // 更新缓存
      this.addToCache(relation)

      // 记录更新事件
      const event: RelationUpdateEvent = {
        sourceNpcId,
        targetNpcId,
        type: relation.type,
        affectionDelta,
        trustDelta,
        reason,
        timestamp: Date.now(),
      }
      this.addUpdateEvent(event)

      if (typeChanged) {
        logger.info(`Relation type changed: ${sourceNpcId}→${targetNpcId} is now [${relation.type}]`)
      }

      return { relation, affectionDelta, trustDelta, typeChanged }
    } catch (err) {
      logger.error(`Failed to update relation ${sourceNpcId}→${targetNpcId}: ${(err as Error).message}`)
      return null
    }
  }

  /**
   * 基于对话更新关系（便捷方法）
   */
  async updateRelationFromDialogue(
    npcId: string,
    targetId: string,
    dialogueContent: string,
  ): Promise<{ relation: CachedRelation; affectionDelta: number; trustDelta: number; typeChanged: boolean } | null> {
    // 简单的情感分析
    const sentiment = this.analyzeSentiment(dialogueContent)

    let affectionDelta = 0
    let trustDelta = 0

    switch (sentiment) {
      case 'positive':
        affectionDelta = Math.floor(Math.random() * 3) + 1 // +1~3
        trustDelta = Math.floor(Math.random() * 2) + 1       // +1~2
        break
      case 'negative':
        affectionDelta = -(Math.floor(Math.random() * 3) + 1) // -1~3
        trustDelta = -(Math.floor(Math.random() * 2) + 1)     // -1~2
        break
      default:
        // 中性对话：微幅增加熟悉度
        affectionDelta = Math.random() < 0.5 ? 1 : 0
        trustDelta = 0
        break
    }

    if (affectionDelta === 0 && trustDelta === 0) return null

    return this.updateRelation(npcId, targetId, affectionDelta, trustDelta, `对话影响: ${dialogueContent.substring(0, 100)}`)
  }

  /**
   * 基于事件批量更新关系（用于剧情推进）
   */
  async updateRelationsFromEvent(
    affectedNpcIds: string[],
    affectionDelta: number,
    trustDelta: number,
    reason: string,
  ): Promise<void> {
    for (let i = 0; i < affectedNpcIds.length; i++) {
      for (let j = i + 1; j < affectedNpcIds.length; j++) {
        await this.updateRelation(
          affectedNpcIds[i],
          affectedNpcIds[j],
          affectionDelta,
          trustDelta,
          reason,
        )
      }
    }
  }

  // =============================================
  // 关系网络分析
  // =============================================

  /**
   * 获取关系网络统计
   */
  getNetworkStats(): RelationNetworkStats {
    const all = Array.from(this.relationCache.values())
    const typeBreakdown: Record<RelationType, number> = {
      friend: 0, rival: 0, family: 0, lover: 0, neutral: 0, enemy: 0,
    }

    let totalAffection = 0
    let totalTrust = 0
    let highest: CachedRelation | null = null
    let lowest: CachedRelation | null = null

    for (const rel of all) {
      typeBreakdown[rel.type]++
      totalAffection += rel.affection
      totalTrust += rel.trust

      if (!highest || rel.affection > highest.affection) highest = rel
      if (!lowest || rel.affection < lowest.affection) lowest = rel
    }

    return {
      totalRelations: all.length,
      typeBreakdown,
      avgAffection: all.length > 0 ? Math.round(totalAffection / all.length) : 0,
      avgTrust: all.length > 0 ? Math.round(totalTrust / all.length) : 0,
      highestAffection: highest,
      lowestAffection: lowest,
    }
  }

  /**
   * 获取NPC社交指标
   */
  getNpcSocialMetrics(npcId: string): {
    totalRelations: number
    friendCount: number
    enemyCount: number
    avgAffection: number
    avgTrust: number
    mostLiked: string | null
    mostDisliked: string | null
  } {
    const relations = this.getNpcRelations(npcId)
    const friendCount = relations.filter((r) => r.type === 'friend' || r.type === 'family').length
    const enemyCount = relations.filter((r) => r.type === 'enemy' || r.type === 'rival').length

    let totalAffection = 0
    let totalTrust = 0
    let mostLiked: CachedRelation | null = null
    let mostDisliked: CachedRelation | null = null

    for (const rel of relations) {
      totalAffection += rel.affection
      totalTrust += rel.trust
      if (!mostLiked || rel.affection > mostLiked.affection) mostLiked = rel
      if (!mostDisliked || rel.affection < mostDisliked.affection) mostDisliked = rel
    }

    return {
      totalRelations: relations.length,
      friendCount,
      enemyCount,
      avgAffection: relations.length > 0 ? Math.round(totalAffection / relations.length) : 0,
      avgTrust: relations.length > 0 ? Math.round(totalTrust / relations.length) : 0,
      mostLiked: mostLiked?.targetNpcId ?? mostLiked?.sourceNpcId ?? null,
      mostDisliked: mostDisliked?.targetNpcId ?? mostDisliked?.sourceNpcId ?? null,
    }
  }

  /**
   * 获取关系更新历史
   */
  getUpdateHistory(limit = 20): RelationUpdateEvent[] {
    return this.updateHistory.slice(-limit)
  }

  // =============================================
  // 工具方法
  // =============================================

  /**
   * 简单情感分析
   */
  private analyzeSentiment(text: string): 'positive' | 'negative' | 'neutral' {
    const positiveWords = /谢谢|感谢|帮|喜欢|朋友|信任|好|棒|厉害|真不错|太好了|开心|高兴|亲爱|兄弟|姐妹/
    const negativeWords = /讨厌|恨|滚|走开|骗子|叛徒|绝不|不想|别烦|恶心|愚蠢|废物|可恶/

    if (positiveWords.test(text)) return 'positive'
    if (negativeWords.test(text)) return 'negative'
    return 'neutral'
  }

  /**
   * 记录更新事件
   */
  private addUpdateEvent(event: RelationUpdateEvent): void {
    this.updateHistory.push(event)
    // 保留最近100条
    if (this.updateHistory.length > 100) {
      this.updateHistory = this.updateHistory.slice(-100)
    }
  }

  /**
   * 刷新缓存 — 从数据库重新加载
   */
  async refresh(): Promise<void> {
    logger.info('Refreshing relation network from database...')
    this.relationCache.clear()
    this.npcRelationIndex.clear()
    this.initialized = false
    await this.initialize()
  }

  /**
   * 获取缓存大小
   */
  get size(): number {
    return this.relationCache.size
  }

  /**
   * 是否已初始化
   */
  get isInitialized(): boolean {
    return this.initialized
  }
}

/** 全局关系网络服务实例 */
export const relationNetwork = new RelationNetworkService()
