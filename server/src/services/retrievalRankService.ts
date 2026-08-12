// 星火小镇 — 记忆检索排序算法
// T2.5.3 Recency+Importance+Relevance 加权排序

import { createLogger } from '../utils/index.js'
import { prisma } from '../models/prisma.js'
import { embeddingService, type VectorSearchResult } from './embeddingService.js'

const logger = createLogger('RetrievalRank')

// =============================================
// 类型定义
// =============================================

/** 检索排序权重配置 */
export interface RetrievalWeights {
  /** 相关性（语义相似度）权重，默认0.5 */
  alpha: number
  /** 重要性权重，默认0.3 */
  beta: number
  /** 时效性权重，默认0.2 */
  gamma: number
}

/** 排序后的记忆条目 */
export interface RankedMemory extends VectorSearchResult {
  /** 综合得分 */
  score: number
  /** 各维度分数明细 */
  scoreBreakdown: {
    relevance: number
    importance: number
    recency: number
  }
}

/** 检索请求 */
export interface RetrievalRequest {
  /** 查询文本 */
  query: string
  /** NPC ID */
  npcId: string
  /** 返回数量上限，默认10 */
  limit?: number
  /** 记忆类型过滤 */
  type?: string
  /** 自定义权重覆盖 */
  weights?: Partial<RetrievalWeights>
  /** 最低综合得分阈值，默认0.1 */
  minScore?: number
}

/** 检索统计 */
export interface RetrievalStats {
  /** 候选记忆数 */
  candidates: number
  /** 最终返回数 */
  returned: number
  /** 是否使用向量检索 */
  usedVector: boolean
  /** 耗时(ms) */
  duration: number
}

// =============================================
// 检索排序算法
// =============================================

/**
 * RetrievalRankService — 记忆检索排序服务
 *
 * 排序算法核心：
 *   score = α × relevance + β × importance_norm + γ × recency + δ × type_weight
 *
 * - relevance: 语义相似度 (0-1)，来自向量嵌入检索
 * - importance_norm: 归一化重要性 (0-1)，importance/10
 * - recency: 时效性衰减 (0-1)，指数衰减函数
 * - type_weight: 记忆类型权重 (0-1)，对话/观察/反思/关系不同权重
 *
 * T5.2.2 调优：
 * - 对话策略：提高时效性（近期对话更重要）和对话类型权重
 * - 决策策略：平衡相关性和重要性
 * - 反思策略：更重视重要性
 * - 统一 hybridSearch 和本模块的衰减算法（统一使用指数衰减）
 *
 * 支持策略：
 * - 对话上下文检索：α=0.4, β=0.2, γ=0.3, δ=0.1（更重视时效性+对话记忆）
 * - NPC自主决策检索：α=0.35, β=0.35, γ=0.2, δ=0.1（平衡相关性和重要性）
 * - 反思触发检索：α=0.2, β=0.5, γ=0.2, δ=0.1（最重视重要性）
 */
class RetrievalRankService {
  /** 默认权重 — T5.2.2 调优后的参数 */
  private defaultWeights: RetrievalWeights = {
    alpha: 0.4,
    beta: 0.3,
    gamma: 0.25,
  }

  /** 预设权重策略 — T5.2.2 调优：基于实际对话场景调整 */
  private readonly presets: Record<string, RetrievalWeights> = {
    // 对话检索：时效性最重要（近期对话上下文），相关性其次
    dialogue: { alpha: 0.4, beta: 0.2, gamma: 0.35 },
    // 决策检索：平衡相关性和重要性
    decision: { alpha: 0.35, beta: 0.35, gamma: 0.2 },
    // 反思检索：最重视重要性（重要记忆才值得反思）
    reflection: { alpha: 0.2, beta: 0.5, gamma: 0.2 },
  }

  /** 记忆类型权重 — T5.2.2 新增：不同类型记忆在对话中的价值不同 */
  private readonly typeWeights: Record<string, number> = {
    dialogue: 1.0,     // 对话记忆 — 直接相关，最高权重
    observation: 0.7,  // 观察记忆 — 间接相关
    reflection: 0.6,   // 反思摘要 — 高度概括但可能抽象
    relation: 0.8,     // 关系记忆 — 影响对话态度
  }

  /** 时效性半衰期（毫秒），用于指数衰减 — T5.2.2: 从2天缩短到1.5天，更重视近期记忆 */
  private recencyHalflife = 1.5 * 24 * 60 * 60 * 1000 // 1.5天

  /**
   * 执行加权检索排序
   * T5.2.2 调优：提升最低相似度阈值，减少噪音
   */
  async retrieve(request: RetrievalRequest): Promise<{
    memories: RankedMemory[]
    stats: RetrievalStats
  }> {
    const startTime = Date.now()
    const { query, npcId, limit = 10, type, minScore = 0.15 } = request

    // 合并权重
    const weights = { ...this.defaultWeights, ...request.weights }

    try {
      // 1. 向量检索获取候选 — T5.2.2: 提升最低相似度从0.2→0.3，减少噪音
      const candidates = await embeddingService.hybridSearch({
        query,
        npcId,
        limit: limit * 3, // 获取3倍候选用于重排序
        minSimilarity: 0.3, // T5.2.2: 从0.2提升到0.3，过滤不相关结果
        type,
        alpha: 1, // 纯相似度，后续由本模块重排序
        beta: 0,
        gamma: 0,
      })

      const usedVector = candidates.length > 0

      // 2. 如果向量检索无结果，降级到数据库查询
      let memories: RankedMemory[]
      if (!usedVector) {
        memories = await this.databaseFallback(npcId, query, limit, type)
      } else {
        // 3. 重排序：使用完整的加权公式
        memories = this.rankMemories(candidates, weights)
      }

      // 4. 过滤低分结果
      const filtered = memories.filter((m) => m.score >= minScore)

      // 5. 截断到限制数量
      const result = filtered.slice(0, limit)

      const stats: RetrievalStats = {
        candidates: candidates.length || memories.length,
        returned: result.length,
        usedVector,
        duration: Date.now() - startTime,
      }

      logger.debug(
        `Retrieved ${result.length}/${stats.candidates} memories for ${npcId} in ${stats.duration}ms`,
      )

      return { memories: result, stats }
    } catch (err) {
      logger.error(`Retrieval failed for ${npcId}: ${(err as Error).message}`)

      // 完全降级
      const memories = await this.databaseFallback(npcId, query, limit, type)

      return {
        memories,
        stats: {
          candidates: memories.length,
          returned: memories.length,
          usedVector: false,
          duration: Date.now() - startTime,
        },
      }
    }
  }

  /**
   * 使用预设策略检索
   */
  async retrieveWithPreset(
    preset: 'dialogue' | 'decision' | 'reflection',
    request: Omit<RetrievalRequest, 'weights'>,
  ): Promise<{
    memories: RankedMemory[]
    stats: RetrievalStats
  }> {
    const weights = this.presets[preset]
    return this.retrieve({ ...request, weights })
  }

  // =============================================
  // 核心排序算法
  // =============================================

  /**
   * 对候选记忆进行加权排序
   * score = α × relevance + β × importance_norm + γ × recency + δ × type_weight
   * T5.2.2 新增：记忆类型权重维度
   */
  private rankMemories(candidates: VectorSearchResult[], weights: RetrievalWeights): RankedMemory[] {
    const now = Date.now()

    const ranked = candidates.map((memory) => {
      // 相关性分数（直接来自向量相似度）
      const relevance = Math.max(0, Math.min(1, memory.similarity))

      // 重要性归一化
      const importanceNorm = Math.max(0, Math.min(1, memory.importance / 10))

      // 时效性 — 指数衰减函数
      const ageMs = now - memory.createdAt.getTime()
      const recency = Math.exp(-0.693 * ageMs / this.recencyHalflife) // 0.693 = ln(2)

      // T5.2.2 新增：记忆类型权重（对话记忆在对话场景中更有价值）
      const typeWeight = this.typeWeights[memory.type] ?? 0.5

      // 综合得分 — 加入类型权重
      const typeWeightDelta = typeWeight - 0.5 // 以0.5为基准，高于0.5加分，低于0.5减分
      const score =
        weights.alpha * relevance +
        weights.beta * importanceNorm +
        weights.gamma * recency +
        typeWeightDelta * 0.1 // 类型权重影响幅度限制在±0.05

      return {
        ...memory,
        score: Math.round(score * 1000) / 1000,
        scoreBreakdown: {
          relevance: Math.round(relevance * 1000) / 1000,
          importance: Math.round(importanceNorm * 1000) / 1000,
          recency: Math.round(recency * 1000) / 1000,
        },
      }
    })

    // 按综合得分降序排序
    ranked.sort((a, b) => b.score - a.score)

    return ranked
  }

  // =============================================
  // 降级策略
  // =============================================

  /**
   * 数据库降级检索 — 当向量检索不可用时
   */
  private async databaseFallback(
    npcId: string,
    query: string,
    limit: number,
    type?: string,
  ): Promise<RankedMemory[]> {
    logger.debug(`Database fallback retrieval for NPC ${npcId}`)

    const where: any = {
      npcId,
      archived: false,
    }

    if (type) where.type = type

    // 先尝试文本匹配
    let memories = await prisma.nPCMemory.findMany({
      where: {
        ...where,
        content: { contains: query, mode: 'insensitive' },
      },
      orderBy: [{ importance: 'desc' }, { createdAt: 'desc' }],
      take: limit,
    })

    // 如果文本匹配无结果，获取最近的重要记忆
    if (memories.length === 0) {
      memories = await prisma.nPCMemory.findMany({
        where,
        orderBy: [{ importance: 'desc' }, { createdAt: 'desc' }],
        take: limit,
      })
    }

    const now = Date.now()

    return memories.map((m) => {
      const importanceNorm = m.importance / 10
      const ageMs = now - m.createdAt.getTime()
      const recency = Math.exp(-0.693 * ageMs / this.recencyHalflife)
      const score = 0.3 * importanceNorm + 0.7 * recency // 降级时更重视时效性

      return {
        id: m.id,
        npcId: m.npcId,
        type: m.type,
        content: m.content,
        importance: m.importance,
        similarity: 0,
        createdAt: m.createdAt,
        score: Math.round(score * 1000) / 1000,
        scoreBreakdown: {
          relevance: 0,
          importance: Math.round(importanceNorm * 1000) / 1000,
          recency: Math.round(recency * 1000) / 1000,
        },
      }
    })
  }

  // =============================================
  // 管理接口
  // =============================================

  /** 获取预设权重列表 */
  getPresets(): Record<string, RetrievalWeights> {
    return { ...this.presets }
  }

  /** 获取当前默认权重 */
  getDefaultWeights(): RetrievalWeights {
    return { ...this.defaultWeights }
  }

  /** 更新默认权重 */
  setDefaultWeights(weights: Partial<RetrievalWeights>): void {
    this.defaultWeights = { ...this.defaultWeights, ...weights }
    logger.info(`Default weights updated: α=${this.defaultWeights.alpha}, β=${this.defaultWeights.beta}, γ=${this.defaultWeights.gamma}`)
  }

  /** 设置时效性半衰期（小时） */
  setRecencyHalflife(hours: number): void {
    this.recencyHalflife = hours * 60 * 60 * 1000
    logger.info(`Recency halflife set to ${hours}h`)
  }

  /** T5.2.2 新增：获取记忆类型权重 */
  getTypeWeights(): Record<string, number> {
    return { ...this.typeWeights }
  }

  /** T5.2.2 新增：更新记忆类型权重 */
  setTypeWeight(type: string, weight: number): void {
    this.typeWeights[type] = Math.max(0, Math.min(1, weight))
    logger.info(`Type weight updated: ${type} = ${this.typeWeights[type]}`)
  }

  /**
   * T5.2.2 新增：检索质量评估 — 返回检索结果的统计信息
   * 用于验证调优效果，无需手动计算
   */
  async evaluateQuality(request: RetrievalRequest): Promise<{
    retrieval: { memories: RankedMemory[]; stats: RetrievalStats }
    quality: {
      avgScore: number
      scoreRange: { min: number; max: number }
      avgRelevance: number
      avgImportance: number
      avgRecency: number
      typeDistribution: Record<string, number>
    }
  }> {
    const retrieval = await this.retrieve(request)
    const { memories } = retrieval

    if (memories.length === 0) {
      return {
        retrieval,
        quality: {
          avgScore: 0,
          scoreRange: { min: 0, max: 0 },
          avgRelevance: 0,
          avgImportance: 0,
          avgRecency: 0,
          typeDistribution: {},
        },
      }
    }

    const scores = memories.map((m) => m.score)
    const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length
    const avgRelevance = memories.reduce((a, b) => a + b.scoreBreakdown.relevance, 0) / memories.length
    const avgImportance = memories.reduce((a, b) => a + b.scoreBreakdown.importance, 0) / memories.length
    const avgRecency = memories.reduce((a, b) => a + b.scoreBreakdown.recency, 0) / memories.length

    const typeDistribution: Record<string, number> = {}
    for (const m of memories) {
      typeDistribution[m.type] = (typeDistribution[m.type] ?? 0) + 1
    }

    return {
      retrieval,
      quality: {
        avgScore: Math.round(avgScore * 1000) / 1000,
        scoreRange: {
          min: Math.min(...scores),
          max: Math.max(...scores),
        },
        avgRelevance: Math.round(avgRelevance * 1000) / 1000,
        avgImportance: Math.round(avgImportance * 1000) / 1000,
        avgRecency: Math.round(avgRecency * 1000) / 1000,
        typeDistribution,
      },
    }
  }
}

/** 全局检索排序服务实例 */
export const retrievalRankService = new RetrievalRankService()
