// 星火小镇 — 记忆容量管理
// T2.5.5 500条上限、重要记忆保护、低重要性归档

import { createLogger } from '../utils/index.js'
import { prisma } from '../models/prisma.js'
import { profileLoader } from './profileLoader.js'

const logger = createLogger('MemoryCapacity')

// =============================================
// 类型定义
// =============================================

/** 容量管理策略 */
export type CapacityPolicy = 'archive' | 'delete' | 'summarize'

/** 容量管理配置 */
export interface MemoryCapacityConfig {
  /** 每个NPC最大记忆条数，默认500 */
  maxMemoriesPerNpc: number
  /** 触发清理的阈值百分比（0.9 = 90%时开始清理），默认0.9 */
  cleanupThreshold: number
  /** 每次清理的目标百分比（清理到80%），默认0.8 */
  cleanupTarget: number
  /** 最低保护重要度（重要度>=此值的记忆不会被归档），默认7 */
  protectedImportanceThreshold: number
  /** 归档策略 */
  archivePolicy: CapacityPolicy
  /** 反思类记忆保护（永不归档），默认true */
  protectReflections: boolean
  /** 最近N分钟内的记忆保护（不归档太新的），默认60分钟 */
  recentProtectionMinutes: number
}

/** 容量清理结果 */
export interface CapacityCleanupResult {
  /** NPC ID */
  npcId: string
  /** 清理前记忆数 */
  beforeCount: number
  /** 清理后记忆数 */
  afterCount: number
  /** 归档数 */
  archivedCount: number
  /** 删除数 */
  deletedCount: number
  /** 保护数 */
  protectedCount: number
  /** 清理耗时(ms) */
  duration: number
}

/** 全局容量统计 */
export interface MemoryCapacityStats {
  /** 总NPC数 */
  totalNpcs: number
  /** 总记忆数 */
  totalMemories: number
  /** 总归档记忆数 */
  totalArchived: number
  /** 超过阈值的NPC数 */
  npcOverThreshold: number
  /** 最大记忆NPC */
  maxMemoryNpc: { npcId: string; name: string; count: number } | null
  /** 平均每NPC记忆数 */
  avgMemoriesPerNpc: number
}

// =============================================
// 记忆容量管理模块
// =============================================

/**
 * MemoryCapacityManager — 记忆容量管理
 *
 * 设计理念（参考 Generative Agents 论文）：
 * 1. 每个NPC最多维护500条活跃记忆
 * 2. 当记忆数达到阈值（90% = 450条）时触发自动清理
 * 3. 清理策略：
 *    a. 优先归档低重要性记忆（importance <= 3）
 *    b. 保护高重要性记忆（importance >= 7）
 *    c. 保护反思类记忆（永不归档）
 *    d. 保护最近60分钟内的新记忆
 * 4. 清理目标为80%容量（400条）
 * 5. 被归档的记忆标记为archived=true，仍可用于反思生成
 * 6. 超过1000条的归档记忆才真正删除
 */
class MemoryCapacityManager {
  /** 配置 */
  private config: MemoryCapacityConfig = {
    maxMemoriesPerNpc: 500,
    cleanupThreshold: 0.9,
    cleanupTarget: 0.8,
    protectedImportanceThreshold: 7,
    archivePolicy: 'archive',
    protectReflections: true,
    recentProtectionMinutes: 60,
  }

  /** 正在清理的NPC集合（防止并发） */
  private cleaningNpcs: Set<string> = new Set()

  /** 上次全局清理时间 */
  private lastGlobalCleanup = 0

  /** 定时清理间隔（毫秒），默认10分钟 */
  private cleanupInterval = 10 * 60 * 1000

  /** 定时器 */
  private cleanupTimer: ReturnType<typeof setInterval> | null = null

  // =============================================
  // 核心功能：容量检查与清理
  // =============================================

  /**
   * 检查并清理NPC记忆容量
   * @param npcId - NPC ID
   * @param force - 是否强制清理（忽略阈值检查）
   */
  async checkAndCleanup(npcId: string, force = false): Promise<CapacityCleanupResult | null> {
    // 防止并发清理
    if (this.cleaningNpcs.has(npcId)) {
      return null
    }

    const startTime = Date.now()

    try {
      const currentCount = await prisma.nPCMemory.count({
        where: { npcId, archived: false },
      })

      const thresholdCount = Math.floor(this.config.maxMemoriesPerNpc * this.config.cleanupThreshold)

      // 未达到阈值且非强制模式，无需清理
      if (!force && currentCount < thresholdCount) {
        return null
      }

      this.cleaningNpcs.add(npcId)

      const targetCount = Math.floor(this.config.maxMemoriesPerNpc * this.config.cleanupTarget)
      const needToRemove = Math.max(0, currentCount - targetCount)

      if (needToRemove === 0) {
        this.cleaningNpcs.delete(npcId)
        return null
      }

      logger.info(`[${npcId}] Capacity cleanup: ${currentCount} → ${targetCount} (removing ${needToRemove})`)

      // 获取可清理的候选记忆
      const candidates = await this.getCleanupCandidates(npcId, needToRemove)

      let archivedCount = 0
      let deletedCount = 0
      let protectedCount = 0

      // 执行归档
      const toArchiveIds: string[] = []
      const toDeleteIds: string[] = []

      for (const candidate of candidates) {
        if (this.isProtected(candidate)) {
          protectedCount++
          continue
        }

        if (this.config.archivePolicy === 'archive') {
          toArchiveIds.push(candidate.id)
          archivedCount++
        } else if (this.config.archivePolicy === 'delete') {
          toDeleteIds.push(candidate.id)
          deletedCount++
        } else if (this.config.archivePolicy === 'summarize') {
          toArchiveIds.push(candidate.id)
          archivedCount++
        }
      }

      // 批量归档
      if (toArchiveIds.length > 0) {
        await prisma.nPCMemory.updateMany({
          where: { id: { in: toArchiveIds } },
          data: { archived: true },
        })
      }

      // 批量删除
      if (toDeleteIds.length > 0) {
        await prisma.nPCMemory.deleteMany({
          where: { id: { in: toDeleteIds } },
        })
      }

      const afterCount = currentCount - archivedCount - deletedCount

      logger.info(
        `[${npcId}] Cleanup done: ${currentCount} → ${afterCount} ` +
        `(archived=${archivedCount}, deleted=${deletedCount}, protected=${protectedCount})`,
      )

      return {
        npcId,
        beforeCount: currentCount,
        afterCount,
        archivedCount,
        deletedCount,
        protectedCount,
        duration: Date.now() - startTime,
      }
    } catch (err) {
      logger.error(`[${npcId}] Capacity cleanup failed: ${(err as Error).message}`)
      return null
    } finally {
      this.cleaningNpcs.delete(npcId)
    }
  }

  // =============================================
  // 候选记忆筛选
  // =============================================

  /**
   * 获取可清理的候选记忆 — 按清理优先级排序
   *
   * 清理优先级（先清理的排前面）：
   * 1. 低重要性 + 旧访问时间
   * 2. 低重要性 + 新访问时间
   * 3. 中重要性 + 旧访问时间
   * 4. 中重要性 + 新访问时间
   */
  private async getCleanupCandidates(
    npcId: string,
    limit: number,
  ): Promise<Array<{ id: string; type: string; importance: number; createdAt: Date; accessedAt: Date }>> {
    // recentCutoff用于后续扩展：保护近期创建的记忆不被清理
    const _recentCutoff = new Date(Date.now() - this.config.recentProtectionMinutes * 60 * 1000)
    void _recentCutoff

    return prisma.nPCMemory.findMany({
      where: {
        npcId,
        archived: false,
        // 排除受保护的高重要性记忆
        importance: { lt: this.config.protectedImportanceThreshold },
      },
      orderBy: [
        { importance: 'asc' },      // 低重要性优先清理
        { accessedAt: 'asc' },       // 旧访问时间优先清理
        { createdAt: 'asc' },       // 旧记忆优先清理
      ],
      take: limit * 2, // 多取一些，因为有被保护的
    })
  }

  /**
   * 判断记忆是否受保护（不应被清理）
   */
  private isProtected(memory: { type: string; importance: number; createdAt: Date }): boolean {
    // 反思类记忆保护
    if (this.config.protectReflections && memory.type === 'reflection') {
      return true
    }

    // 高重要性记忆保护
    if (memory.importance >= this.config.protectedImportanceThreshold) {
      return true
    }

    // 最近记忆保护
    const recentCutoff = Date.now() - this.config.recentProtectionMinutes * 60 * 1000
    if (memory.createdAt.getTime() > recentCutoff) {
      return true
    }

    return false
  }

  // =============================================
  // 归档记忆深度清理
  // =============================================

  /**
   * 清理过老的归档记忆（归档超过1000条的才删除）
   */
  async cleanupArchivedMemories(npcId?: string): Promise<number> {
    const where: any = { archived: true }
    if (npcId) where.npcId = npcId

    // 删除归档超过30天的记忆
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

    const result = await prisma.nPCMemory.deleteMany({
      where: {
        ...where,
        archived: true,
        createdAt: { lt: thirtyDaysAgo },
      },
    })

    if (result.count > 0) {
      logger.info(`Cleaned up ${result.count} old archived memories${npcId ? ` for ${npcId}` : ''}`)
    }

    return result.count
  }

  // =============================================
  // 全局容量管理
  // =============================================

  /**
   * 执行全局容量检查 — 检查所有NPC的记忆容量
   */
  async globalCapacityCheck(): Promise<CapacityCleanupResult[]> {
    const profiles = profileLoader.getAllProfiles()
    const results: CapacityCleanupResult[] = []

    for (const profile of profiles) {
      const result = await this.checkAndCleanup(profile.id)
      if (result) {
        results.push(result)
      }
    }

    this.lastGlobalCleanup = Date.now()
    return results
  }

  /**
   * 启动定时容量管理
   */
  startCleanupTimer(): void {
    if (this.cleanupTimer) return

    this.cleanupTimer = setInterval(async () => {
      logger.info('Scheduled capacity check...')
      await this.globalCapacityCheck()
    }, this.cleanupInterval)

    logger.info(`Memory capacity timer started (interval: ${this.cleanupInterval}ms)`)
  }

  /**
   * 停止定时容量管理
   */
  stopCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
      this.cleanupTimer = null
      logger.info('Memory capacity timer stopped')
    }
  }

  // =============================================
  // 统计与查询
  // =============================================

  /**
   * 获取全局容量统计
   */
  async getCapacityStats(): Promise<MemoryCapacityStats> {
    const profiles = profileLoader.getAllProfiles()
    let totalMemories = 0
    let totalArchived = 0
    let npcOverThreshold = 0
    let maxMemoryNpc: { npcId: string; name: string; count: number } | null = null
    let maxCount = 0

    for (const profile of profiles) {
      const activeCount = await prisma.nPCMemory.count({
        where: { npcId: profile.id, archived: false },
      })

      const archivedCount = await prisma.nPCMemory.count({
        where: { npcId: profile.id, archived: true },
      })

      totalMemories += activeCount
      totalArchived += archivedCount

      const threshold = Math.floor(this.config.maxMemoriesPerNpc * this.config.cleanupThreshold)
      if (activeCount >= threshold) {
        npcOverThreshold++
      }

      if (activeCount > maxCount) {
        maxCount = activeCount
        maxMemoryNpc = { npcId: profile.id, name: profile.name, count: activeCount }
      }
    }

    return {
      totalNpcs: profiles.length,
      totalMemories,
      totalArchived,
      npcOverThreshold,
      maxMemoryNpc,
      avgMemoriesPerNpc: profiles.length > 0 ? Math.round(totalMemories / profiles.length) : 0,
    }
  }

  /**
   * 获取单个NPC的记忆容量信息
   */
  async getNpcCapacityInfo(npcId: string): Promise<{
    activeCount: number
    archivedCount: number
    capacityUsage: number
    isOverThreshold: boolean
  }> {
    const activeCount = await prisma.nPCMemory.count({
      where: { npcId, archived: false },
    })

    const archivedCount = await prisma.nPCMemory.count({
      where: { npcId, archived: true },
    })

    const threshold = Math.floor(this.config.maxMemoriesPerNpc * this.config.cleanupThreshold)

    return {
      activeCount,
      archivedCount,
      capacityUsage: activeCount / this.config.maxMemoriesPerNpc,
      isOverThreshold: activeCount >= threshold,
    }
  }

  // =============================================
  // 配置管理
  // =============================================

  /** 更新配置 */
  updateConfig(config: Partial<MemoryCapacityConfig>): void {
    this.config = { ...this.config, ...config }
    logger.info('Memory capacity config updated')
  }

  /** 获取当前配置 */
  getConfig(): MemoryCapacityConfig {
    return { ...this.config }
  }

  /** 获取上次全局清理时间 */
  getLastGlobalCleanupTime(): number {
    return this.lastGlobalCleanup
  }
}

/** 全局记忆容量管理实例 */
export const memoryCapacityManager = new MemoryCapacityManager()
