// 星火小镇 — NPC 记忆流存储
// T2.5.1 观察/对话/反思/关系4类记忆写入

import { createLogger } from '../utils/index.js'
import { prisma } from '../models/prisma.js'
import { profileLoader } from './profileLoader.js'
import type { MemoryType } from '../types/npc-profile.js'

const logger = createLogger('MemoryStore')

// =============================================
// 记忆流数据结构
// =============================================

/** 记忆流写入项 */
export interface MemoryStreamItem {
  /** NPC ID */
  npcId: string
  /** 记忆类型 */
  type: MemoryType
  /** 记忆内容 */
  content: string
  /** 重要度 (1-10) */
  importance: number
  /** 上下文 */
  context?: Record<string, unknown>
  /** 时间戳 */
  timestamp: number
}

/** 观察记忆输入 */
export interface ObservationInput {
  /** NPC ID */
  npcId: string
  /** 观察内容 */
  content: string
  /** 重要度 */
  importance?: number
  /** 观察来源 */
  source?: 'perception' | 'environment' | 'schedule'
}

/** 对话记忆输入 */
export interface DialogueMemoryInput {
  /** NPC ID */
  npcId: string
  /** 对话内容 */
  content: string
  /** 对话对象 */
  partnerId: string
  /** 对话对象名字 */
  partnerName: string
  /** 对话对象类型 */
  partnerType: 'player' | 'npc'
  /** 重要度 */
  importance?: number
}

/** 反思记忆输入 */
export interface ReflectionInput {
  /** NPC ID */
  npcId: string
  /** 反思摘要 */
  content: string
  /** 来源记忆ID列表 */
  sourceMemoryIds: string[]
  /** 重要度 */
  importance?: number
}

/** 关系记忆输入 */
export interface RelationMemoryInput {
  /** NPC ID */
  npcId: string
  /** 关系变化描述 */
  content: string
  /** 关系目标ID */
  targetId: string
  /** 关系目标名字 */
  targetName: string
  /** 好感度变化 */
  affectionDelta: number
  /** 信任度变化 */
  trustDelta: number
  /** 重要度 */
  importance?: number
}

/** 批量写入结果 */
export interface MemoryStreamResult {
  /** 成功写入的数量 */
  written: number
  /** 失败的数量 */
  failed: number
  /** 写入的记忆ID列表 */
  memoryIds: string[]
}

/**
 * MemoryStream — 记忆流存储
 *
 * 职责：
 * 1. 4类记忆的统一写入接口：观察/对话/反思/关系
 * 2. 批量写入优化：多个记忆可合并为一次数据库操作
 * 3. 异步嵌入：写入记忆后自动触发向量嵌入
 * 4. 容量管理：维护500条记忆上限，低重要性自动归档
 * 5. 反思触发：当低重要性记忆积累到阈值时自动触发反思
 * 6. 记忆生命周期：创建→访问→归档→反思
 */
class MemoryStream {
  /** 待嵌入的记忆队列 */
  private pendingEmbeddings: string[] = []

  /** 批量写入缓冲区 */
  private writeBuffer: MemoryStreamItem[] = []

  /** 批量写入间隔（毫秒） */
  private flushInterval = 1000

  /** 最大记忆容量 */
  private maxMemories = 500

  /** 反思触发阈值 — 低重要性记忆数量 */
  private reflectionThreshold = 10

  /** 是否启用自动嵌入 */
  private autoEmbed = true

  /** 批量写入定时器 */
  private flushTimer: ReturnType<typeof setInterval> | null = null

  constructor() {
    logger.info('Memory stream initialized')
  }

  /**
   * 启动批量写入定时器
   */
  startFlushTimer(): void {
    if (this.flushTimer) return
    this.flushTimer = setInterval(() => this.flush(), this.flushInterval)
  }

  /**
   * 停止批量写入定时器
   */
  stopFlushTimer(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer)
      this.flushTimer = null
    }
  }

  // =============================================
  // 4类记忆写入接口
  // =============================================

  /**
   * 写入观察记忆 — NPC感知到的环境/事件
   */
  async writeObservation(input: ObservationInput): Promise<string> {
    const item: MemoryStreamItem = {
      npcId: input.npcId,
      type: 'observation',
      content: input.content,
      importance: input.importance ?? 4,
      context: {
        source: input.source ?? 'perception',
        timestamp: Date.now(),
      },
      timestamp: Date.now(),
    }

    return this.writeSingle(item)
  }

  /**
   * 写入对话记忆 — NPC的对话内容
   */
  async writeDialogue(input: DialogueMemoryInput): Promise<string> {
    const item: MemoryStreamItem = {
      npcId: input.npcId,
      type: 'dialogue',
      content: input.content,
      importance: input.importance ?? (input.partnerType === 'player' ? 7 : 5),
      context: {
        partnerId: input.partnerId,
        partnerName: input.partnerName,
        partnerType: input.partnerType,
      },
      timestamp: Date.now(),
    }

    return this.writeSingle(item)
  }

  /**
   * 写入反思记忆 — NPC对过去记忆的反思摘要
   */
  async writeReflection(input: ReflectionInput): Promise<string> {
    const item: MemoryStreamItem = {
      npcId: input.npcId,
      type: 'reflection',
      content: input.content,
      importance: input.importance ?? 8,
      context: {
        sourceMemoryIds: input.sourceMemoryIds,
        reflectionGeneratedAt: Date.now(),
      },
      timestamp: Date.now(),
    }

    return this.writeSingle(item)
  }

  /**
   * 写入关系记忆 — NPC关系变化记录
   */
  async writeRelation(input: RelationMemoryInput): Promise<string> {
    const item: MemoryStreamItem = {
      npcId: input.npcId,
      type: 'relation',
      content: input.content,
      importance: input.importance ?? 6,
      context: {
        targetId: input.targetId,
        targetName: input.targetName,
        affectionDelta: input.affectionDelta,
        trustDelta: input.trustDelta,
      },
      timestamp: Date.now(),
    }

    return this.writeSingle(item)
  }

  // =============================================
  // 批量写入
  // =============================================

  /**
   * 追加到写入缓冲区
   */
  enqueue(item: MemoryStreamItem): void {
    this.writeBuffer.push(item)

    // 如果缓冲区超过10条，立即刷新
    if (this.writeBuffer.length >= 10) {
      this.flush()
    }
  }

  /**
   * 刷新写入缓冲区 — 批量写入数据库
   */
  async flush(): Promise<MemoryStreamResult> {
    if (this.writeBuffer.length === 0) {
      return { written: 0, failed: 0, memoryIds: [] }
    }

    const items = [...this.writeBuffer]
    this.writeBuffer = []

    let written = 0
    let failed = 0
    const memoryIds: string[] = []

    for (const item of items) {
      try {
        const id = await this.writeSingle(item)
        memoryIds.push(id)
        written++
      } catch (err) {
        logger.warn(`Flush write failed for ${item.npcId}: ${(err as Error).message}`)
        failed++
      }
    }

    return { written, failed, memoryIds }
  }

  // =============================================
  // 核心写入逻辑
  // =============================================

  /**
   * 写入单条记忆
   */
  private async writeSingle(item: MemoryStreamItem): Promise<string> {
    try {
      // 容量管理
      await this.ensureCapacity(item.npcId)

      // 写入数据库
      const memory = await prisma.nPCMemory.create({
        data: {
          npcId: item.npcId,
          type: item.type,
          content: item.content,
          importance: item.importance,
          context: item.context as any ?? {},
          // embedding 由嵌入服务异步处理，Prisma不支持Unsupported类型的直接赋值
        } as any,
      })

      // 加入待嵌入队列
      if (this.autoEmbed) {
        this.pendingEmbeddings.push(memory.id)
      }

      // 更新ProfileLoader短期记忆
      this.syncToProfileLoader(item)

      logger.debug(`[${item.npcId}] Memory stored: [${item.type}] importance=${item.importance}`)

      // 检查是否需要触发反思
      if (item.type !== 'reflection') {
        await this.checkReflectionTrigger(item.npcId)
      }

      return memory.id
    } catch (err) {
      logger.error(`[${item.npcId}] Memory store failed: ${(err as Error).message}`)
      throw err
    }
  }

  // =============================================
  // 容量管理
  // =============================================

  /**
   * 确保记忆容量未超限
   */
  private async ensureCapacity(npcId: string): Promise<void> {
    const count = await prisma.nPCMemory.count({
      where: { npcId, archived: false },
    })

    if (count >= this.maxMemories) {
      // 归档最低重要性的记忆
      const toArchive = await prisma.nPCMemory.findFirst({
        where: { npcId, archived: false, type: { not: 'reflection' } },
        orderBy: [
          { importance: 'asc' },
          { accessedAt: 'asc' },
        ],
      })

      if (toArchive) {
        await prisma.nPCMemory.update({
          where: { id: toArchive.id },
          data: { archived: true },
        })
        logger.debug(`[${npcId}] Archived memory ${toArchive.id} (importance=${toArchive.importance})`)
      }
    }
  }

  // =============================================
  // 反思触发
  // =============================================

  /**
   * 检查是否需要触发反思
   * 当低重要性记忆（≤3）积累到阈值时自动触发
   */
  private async checkReflectionTrigger(npcId: string): Promise<void> {
    try {
      const lowImportanceCount = await prisma.nPCMemory.count({
        where: {
          npcId,
          archived: false,
          importance: { lte: 3 },
          type: { in: ['observation', 'dialogue'] },
        },
      })

      if (lowImportanceCount >= this.reflectionThreshold) {
        logger.info(`[${npcId}] Reflection triggered: ${lowImportanceCount} low-importance memories`)
        // 反思由外部调度器执行（T2.5.4），这里只标记需要反思
      }
    } catch {
      // 静默失败
    }
  }

  // =============================================
  // ProfileLoader同步
  // =============================================

  /**
   * 同步记忆到ProfileLoader短期记忆缓冲
   */
  private syncToProfileLoader(item: MemoryStreamItem): void {
    if (item.type === 'dialogue') {
      profileLoader.addShortTermMemory(item.npcId, {
        role: 'system',
        speaker: '记忆系统',
        content: `[${item.type}] ${item.content.substring(0, 100)}`,
      })
    }
  }

  // =============================================
  // 嵌入队列管理
  // =============================================

  /**
   * 获取待嵌入的记忆ID列表
   */
  getPendingEmbeddings(): string[] {
    return [...this.pendingEmbeddings]
  }

  /**
   * 清除已嵌入的记忆ID
   */
  clearPendingEmbeddings(ids: string[]): void {
    const idSet = new Set(ids)
    this.pendingEmbeddings = this.pendingEmbeddings.filter((id) => !idSet.has(id))
  }

  /**
   * 获取缓冲区大小
   */
  get bufferSize(): number {
    return this.writeBuffer.length
  }

  /**
   * 获取待嵌入数量
   */
  get pendingEmbeddingCount(): number {
    return this.pendingEmbeddings.length
  }
}

/** 全局记忆流存储实例 */
export const memoryStream = new MemoryStream()
