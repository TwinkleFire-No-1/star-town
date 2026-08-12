// 星火小镇 — 向量嵌入与检索
// T2.5.2 text-embedding嵌入、pgvector相似度查询

import { createLogger } from '../utils/index.js'
import { prisma } from '../models/prisma.js'
import { modelRouter } from './modelRouter.js'
import { memoryStream } from './memoryStream.js'

const logger = createLogger('Embedding')

// =============================================
// 嵌入与检索数据结构
// =============================================

/** 嵌入结果 */
export interface EmbeddingResult {
  /** 记忆ID */
  memoryId: string
  /** 是否成功 */
  success: boolean
  /** 嵌入维度 */
  dimensions?: number
  /** 错误信息 */
  error?: string
}

/** 向量检索结果 */
export interface VectorSearchResult {
  /** 记忆ID */
  id: string
  /** NPC ID */
  npcId: string
  /** 记忆类型 */
  type: string
  /** 记忆内容 */
  content: string
  /** 重要度 */
  importance: number
  /** 相似度分数（0-1） */
  similarity: number
  /** 创建时间 */
  createdAt: Date
}

/** 检索请求 */
export interface VectorSearchRequest {
  /** 查询文本 */
  query: string
  /** NPC ID（限定搜索范围） */
  npcId: string
  /** 返回数量上限 */
  limit?: number
  /** 最低相似度阈值 */
  minSimilarity?: number
  /** 记忆类型过滤 */
  type?: string
  /** 是否包含已归档记忆 */
  includeArchived?: boolean
}

/** 批量嵌入进度 */
export interface EmbeddingBatchProgress {
  /** 总数 */
  total: number
  /** 已完成 */
  completed: number
  /** 失败 */
  failed: number
  /** 是否正在运行 */
  isRunning: boolean
}

/**
 * EmbeddingService — 向量嵌入与检索服务
 *
 * 职责：
 * 1. 向量嵌入：为记忆文本生成embedding向量并写入数据库
 * 2. 余弦相似度检索：使用pgvector进行向量相似度查询
 * 3. 批量嵌入：为未嵌入的记忆批量生成向量
 * 4. 混合检索：结合向量相似度和重要性排序
 * 5. 嵌入队列管理：定时处理待嵌入的记忆
 */
class EmbeddingService {
  /** 批量嵌入大小 */
  private batchSize = 10

  /** 嵌入定时器 */
  private embedTimer: ReturnType<typeof setInterval> | null = null

  /** 嵌入定时器间隔（毫秒） */
  private embedInterval = 30000 // 30秒

  /** 批量嵌入进度 */
  private batchProgress: EmbeddingBatchProgress = {
    total: 0,
    completed: 0,
    failed: 0,
    isRunning: false,
  }

  constructor() {
    logger.info('Embedding service initialized')
  }

  // =============================================
  // 向量嵌入
  // =============================================

  /**
   * 为单条记忆生成嵌入
   * @param memoryId - 记忆ID
   */
  async embedMemory(memoryId: string): Promise<EmbeddingResult> {
    try {
      // 读取记忆内容
      const memory = await prisma.nPCMemory.findUnique({
        where: { id: memoryId },
      })

      if (!memory) {
        return { memoryId, success: false, error: 'Memory not found' }
      }

      // 调用嵌入API
      const embedResult = await modelRouter.embed(memory.content)

      if (!embedResult.embedding || embedResult.embedding.length === 0) {
        return { memoryId, success: false, error: 'Empty embedding returned' }
      }

      // 写入嵌入向量到数据库
      // Prisma不直接支持pgvector写入，使用raw SQL
      const vectorStr = `[${embedResult.embedding.join(',')}]`
      await prisma.$executeRaw`
        UPDATE npc_memories
        SET embedding = ${vectorStr}::vector
        WHERE id = ${memoryId}
      `

      logger.debug(`Embedded memory ${memoryId}: ${embedResult.embedding.length} dimensions`)

      return {
        memoryId,
        success: true,
        dimensions: embedResult.embedding.length,
      }
    } catch (err) {
      logger.error(`Embed memory ${memoryId} failed: ${(err as Error).message}`)
      return {
        memoryId,
        success: false,
        error: (err as Error).message,
      }
    }
  }

  /**
   * 批量嵌入 — 为所有未嵌入的记忆生成向量
   */
  async batchEmbed(): Promise<EmbeddingBatchProgress> {
    if (this.batchProgress.isRunning) {
      logger.warn('Batch embedding already in progress')
      return this.batchProgress
    }

    this.batchProgress = { total: 0, completed: 0, failed: 0, isRunning: true }

    try {
      // 查找未嵌入的记忆（embedding为null）
      const unembedded = await prisma.nPCMemory.findMany({
        where: {
          // embedding: null — Unsupported类型无法用于where，用raw查询
          archived: false,
        } as any,
        orderBy: { importance: 'desc' },
        take: 100, // 单次最多处理100条
      })

      this.batchProgress.total = unembedded.length

      if (unembedded.length === 0) {
        this.batchProgress.isRunning = false
        return this.batchProgress
      }

      logger.info(`Batch embedding: ${unembedded.length} memories to embed`)

      // 分批处理
      for (let i = 0; i < unembedded.length; i += this.batchSize) {
        const batch = unembedded.slice(i, i + this.batchSize)

        // 并行嵌入当前批次
        const results = await Promise.allSettled(
          batch.map((memory) => this.embedMemory(memory.id)),
        )

        for (const result of results) {
          if (result.status === 'fulfilled' && result.value.success) {
            this.batchProgress.completed++
          } else {
            this.batchProgress.failed++
          }
        }

        // 批次间短暂休眠，避免API限流
        if (i + this.batchSize < unembedded.length) {
          await new Promise((r) => setTimeout(r, 500))
        }
      }

      logger.info(
        `Batch embedding done: ${this.batchProgress.completed}/${this.batchProgress.total} success, ${this.batchProgress.failed} failed`,
      )
    } catch (err) {
      logger.error(`Batch embedding error: ${(err as Error).message}`)
    } finally {
      this.batchProgress.isRunning = false
    }

    return this.batchProgress
  }

  // =============================================
  // 向量检索
  // =============================================

  /**
   * 余弦相似度检索 — 使用pgvector
   * @param request - 检索请求
   */
  async search(request: VectorSearchRequest): Promise<VectorSearchResult[]> {
    const {
      query,
      npcId,
      limit = 10,
      minSimilarity = 0.5,
      type,
      includeArchived = false,
    } = request

    try {
      // 1. 生成查询文本的嵌入
      const embedResult = await modelRouter.embed(query)

      if (!embedResult.embedding || embedResult.embedding.length === 0) {
        logger.warn('Query embedding failed, falling back to text search')
        return this.fallbackTextSearch(npcId, query, limit, type)
      }

      const vectorStr = `[${embedResult.embedding.join(',')}]`

      // 2. 构建SQL查询
      // 使用pgvector的余弦距离操作符 <=>
      // cosine_distance = 1 - cosine_similarity
      let typeFilter = ''
      if (type) {
        typeFilter = `AND type = '${type}'`
      }

      const archivedFilter = includeArchived ? '' : 'AND archived = false'

      const sql = `
        SELECT
          id,
          npc_id,
          type,
          content,
          importance,
          created_at,
          1 - (embedding <=> ${vectorStr}::vector) as similarity
        FROM npc_memories
        WHERE npc_id = ${npcId}
          ${archivedFilter}
          ${typeFilter}
          AND embedding IS NOT NULL
        ORDER BY embedding <=> ${vectorStr}::vector
        LIMIT ${limit}
      `

      const results = await prisma.$queryRawUnsafe<Array<{
        id: string
        npc_id: string
        type: string
        content: string
        importance: number
        created_at: Date
        similarity: number
      }>>(sql)

      // 3. 过滤低相似度结果
      const filtered = results
        .filter((r) => r.similarity >= minSimilarity)
        .map((r) => ({
          id: r.id,
          npcId: r.npc_id,
          type: r.type,
          content: r.content,
          importance: r.importance,
          similarity: Math.round(r.similarity * 1000) / 1000, // 保留3位小数
          createdAt: r.created_at,
        }))

      // 4. 更新记忆访问时间
      if (filtered.length > 0) {
        const ids = filtered.map((r) => r.id)
        await prisma.nPCMemory.updateMany({
          where: { id: { in: ids } },
          data: { accessedAt: new Date() },
        })
      }

      return filtered
    } catch (err) {
      logger.error(`Vector search failed: ${(err as Error).message}`)
      return this.fallbackTextSearch(npcId, query, limit, type)
    }
  }

  /**
   * 混合检索 — 结合向量相似度和重要性排序
   * score = α * similarity + β * normalized_importance + γ * recency
   */
  async hybridSearch(
    request: VectorSearchRequest & {
      /** 相似度权重 (0-1) */
      alpha?: number
      /** 重要性权重 (0-1) */
      beta?: number
      /** 时效性权重 (0-1) */
      gamma?: number
    },
  ): Promise<VectorSearchResult[]> {
    const alpha = request.alpha ?? 0.5
    const beta = request.beta ?? 0.3
    const gamma = request.gamma ?? 0.2

    // 先获取向量检索结果
    const vectorResults = await this.search({
      ...request,
      minSimilarity: 0.3, // 降低阈值以获取更多候选
      limit: (request.limit ?? 10) * 3, // 获取3倍候选
    })

    // 如果向量检索无结果，降级到文本搜索
    if (vectorResults.length === 0) {
      return this.fallbackTextSearch(request.npcId, request.query, request.limit ?? 10, request.type)
    }

    // 计算混合得分
    const now = Date.now()
    // T5.2.2 统一衰减算法：使用指数衰减，与 retrievalRankService 一致
    const recencyHalflife = 1.5 * 24 * 60 * 60 * 1000 // 1.5天半衰期

    const scored = vectorResults.map((result) => {
      // 归一化重要性 (0-1)
      const normalizedImportance = result.importance / 10

      // 时效性衰减 — T5.2.2: 统一为指数衰减（与retrievalRankService一致）
      const age = now - result.createdAt.getTime()
      const recency = Math.exp(-0.693 * age / recencyHalflife) // 0.693 = ln(2)

      // 混合得分
      const score = alpha * result.similarity + beta * normalizedImportance + gamma * recency

      return {
        ...result,
        similarity: Math.round(score * 1000) / 1000, // 用混合分数替换相似度
      }
    })

    // 按混合分数排序
    scored.sort((a, b) => b.similarity - a.similarity)

    return scored.slice(0, request.limit ?? 10)
  }

  // =============================================
  // 降级文本搜索
  // =============================================

  /**
   * 降级文本搜索 — 当向量检索不可用时使用
   */
  private async fallbackTextSearch(
    npcId: string,
    query: string,
    limit: number,
    type?: string,
  ): Promise<VectorSearchResult[]> {
    logger.debug(`Falling back to text search for NPC ${npcId}`)

    const where: any = {
      npcId,
      archived: false,
    }

    if (type) where.type = type

    // 使用Prisma的contains搜索
    const memories = await prisma.nPCMemory.findMany({
      where: {
        ...where,
        content: { contains: query, mode: 'insensitive' },
      },
      orderBy: [
        { importance: 'desc' },
        { createdAt: 'desc' },
      ],
      take: limit,
    })

    return memories.map((m) => ({
      id: m.id,
      npcId: m.npcId,
      type: m.type,
      content: m.content,
      importance: m.importance,
      similarity: 0, // 文本搜索无相似度分数
      createdAt: m.createdAt,
    }))
  }

  // =============================================
  // 嵌入队列定时处理
  // =============================================

  /**
   * 启动嵌入定时器
   */
  startEmbedTimer(): void {
    if (this.embedTimer) return

    this.embedTimer = setInterval(async () => {
      const pending = memoryStream.getPendingEmbeddings()
      if (pending.length === 0) return

      logger.info(`Processing ${pending.length} pending embeddings...`)

      const processedIds: string[] = []

      for (const memoryId of pending.slice(0, this.batchSize)) {
        const result = await this.embedMemory(memoryId)
        if (result.success) {
          processedIds.push(memoryId)
        }
      }

      memoryStream.clearPendingEmbeddings(processedIds)
    }, this.embedInterval)

    logger.info('Embed timer started')
  }

  /**
   * 停止嵌入定时器
   */
  stopEmbedTimer(): void {
    if (this.embedTimer) {
      clearInterval(this.embedTimer)
      this.embedTimer = null
      logger.info('Embed timer stopped')
    }
  }

  // =============================================
  // 管理接口
  // =============================================

  /**
   * 获取批量嵌入进度
   */
  getBatchProgress(): EmbeddingBatchProgress {
    return { ...this.batchProgress }
  }

  /**
   * 统计嵌入覆盖率
   */
  async getEmbeddingStats(): Promise<{
    total: number
    embedded: number
    unembedded: number
    coverage: number
  }> {
    const total = await prisma.nPCMemory.count({ where: { archived: false } })
    const embedded = await prisma.nPCMemory.count({
      where: { archived: false, embedding: { not: null } } as any,
    })

    return {
      total,
      embedded,
      unembedded: total - embedded,
      coverage: total > 0 ? Math.round((embedded / total) * 100) : 0,
    }
  }
}

/** 全局嵌入服务实例 */
export const embeddingService = new EmbeddingService()
