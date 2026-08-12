// 星火小镇 — 并发控制
// T2.6.2 信号量限制(最多8-12同时活跃)、排队机制

import { createLogger } from '../utils/index.js'
import { profileLoader } from './profileLoader.js'

const logger = createLogger('Concurrency')

// =============================================
// 类型定义
// =============================================

/** 并发控制配置 */
export interface ConcurrencyConfig {
  /** 最大同时活跃NPC数，默认8 */
  maxConcurrent: number
  /** 每个NPC最大排队等待时间(ms)，默认30000 */
  maxWaitTime: number
  /** 排队超时策略 */
  timeoutPolicy: 'drop' | 'force'
}

/** 排队条目 */
export interface QueueEntry {
  /** NPC ID */
  npcId: string
  /** 入队时间 */
  enqueuedAt: number
  /** 优先级（0=最高） */
  priority: number
  /** 解锁回调 */
  resolve: () => void
  /** 超时定时器 */
  timeoutId: ReturnType<typeof setTimeout>
}

/** 并发状态统计 */
export interface ConcurrencyStats {
  /** 最大并发数 */
  maxConcurrent: number
  /** 当前活跃数 */
  activeCount: number
  /** 当前排队数 */
  queuedCount: number
  /** 总获取次数 */
  totalAcquires: number
  /** 总释放次数 */
  totalReleases: number
  /** 总超时次数 */
  totalTimeouts: number
  /** 总丢弃次数 */
  totalDrops: number
}

// =============================================
// 并发控制模块
// =============================================

/**
 * ConcurrencyControl — NPC并发控制
 *
 * 使用信号量模式限制同时执行的NPC Agent循环数量。
 * 超出限制的请求进入优先级队列等待。
 *
 * 设计目标：
 * - 限制同时活跃NPC为8-12个，避免LLM API过载
 * - 高优先级NPC（对话中）可抢占低优先级NPC的配额
 * - 超时机制防止请求永久等待
 * - 支持优雅降级（排队满时丢弃低优先级请求）
 */
class ConcurrencyControl {
  /** 配置 */
  private config: ConcurrencyConfig = {
    maxConcurrent: 8,
    maxWaitTime: 30000,
    timeoutPolicy: 'drop',
  }

  /** 当前活跃的NPC集合 */
  private activeNpcs: Set<string> = new Set()

  /** 优先级队列 */
  private queue: QueueEntry[] = []

  /** 统计 */
  private stats = {
    totalAcquires: 0,
    totalReleases: 0,
    totalTimeouts: 0,
    totalDrops: 0,
  }

  // =============================================
  // 信号量操作
  // =============================================

  /**
   * 获取执行许可 — 异步等待直到获得配额
   * @param npcId - NPC ID
   * @param priority - 优先级（0=最高，默认50）
   * @returns Promise<void> - resolve时表示已获得许可
   */
  async acquire(npcId: string, priority: number = 50): Promise<boolean> {
    // 如果NPC已在活跃列表中，直接拒绝
    if (this.activeNpcs.has(npcId)) {
      logger.warn(`[${npcId}] Already active, duplicate acquire rejected`)
      return false
    }

    // 如果有可用配额，直接获取
    if (this.activeNpcs.size < this.config.maxConcurrent) {
      this.activeNpcs.add(npcId)
      this.stats.totalAcquires++
      logger.debug(`[${npcId}] Acquired slot (${this.activeNpcs.size}/${this.config.maxConcurrent})`)
      return true
    }

    // 没有配额，尝试抢占低优先级NPC
    if (priority <= 10) {
      const preempted = this.tryPreempt(priority)
      if (preempted) {
        this.activeNpcs.add(npcId)
        this.stats.totalAcquires++
        logger.info(`[${npcId}] Preempted ${preempted}, acquired slot`)
        return true
      }
    }

    // 进入排队
    return new Promise<boolean>((resolve) => {
      const entry: QueueEntry = {
        npcId,
        enqueuedAt: Date.now(),
        priority,
        resolve: () => {
          this.activeNpcs.add(npcId)
          this.stats.totalAcquires++
          resolve(true)
        },
        timeoutId: setTimeout(() => {
          this.removeFromQueue(npcId)
          this.stats.totalTimeouts++

          if (this.config.timeoutPolicy === 'force') {
            // 强制执行
            this.activeNpcs.add(npcId)
            this.stats.totalAcquires++
            logger.warn(`[${npcId}] Queue timeout, forcing execution`)
            resolve(true)
          } else {
            // 丢弃
            this.stats.totalDrops++
            logger.warn(`[${npcId}] Queue timeout, dropping`)
            resolve(false)
          }
        }, this.config.maxWaitTime),
      }

      this.queue.push(entry)
      this.queue.sort((a, b) => a.priority - b.priority) // 优先级排序

      logger.debug(`[${npcId}] Queued (priority=${priority}, queue=${this.queue.length})`)
    })
  }

  /**
   * 释放执行许可
   * @param npcId - NPC ID
   */
  release(npcId: string): void {
    if (!this.activeNpcs.has(npcId)) {
      return
    }

    this.activeNpcs.delete(npcId)
    this.stats.totalReleases++

    logger.debug(`[${npcId}] Released slot (${this.activeNpcs.size}/${this.config.maxConcurrent})`)

    // 从队列中取出下一个等待者
    this.processQueue()
  }

  /**
   * 尝试立即获取许可（不排队）
   */
  tryAcquire(npcId: string): boolean {
    if (this.activeNpcs.size >= this.config.maxConcurrent) {
      return false
    }

    if (this.activeNpcs.has(npcId)) {
      return false
    }

    this.activeNpcs.add(npcId)
    this.stats.totalAcquires++
    return true
  }

  // =============================================
  // 抢占机制
  // =============================================

  /**
   * 尝试抢占低优先级NPC的配额
   * 找到活跃列表中优先级最低且低于requestPriority的NPC，强制释放
   */
  private tryPreempt(requestPriority: number): string | null {
    // 找到活跃NPC中优先级最低的
    let lowestPriorityNpc: string | null = null
    let lowestPriority = requestPriority

    for (const npcId of this.activeNpcs) {
      const runtimeState = profileLoader.getRuntimeState(npcId)
      const npcAction = runtimeState?.currentAction ?? 'idle'

      // 只能抢占空闲NPC
      if (npcAction !== 'idle') continue

      // 计算NPC当前优先级（idle=50）
      const npcPriority = 50

      if (npcPriority > lowestPriority) {
        lowestPriority = npcPriority
        lowestPriorityNpc = npcId
      }
    }

    if (lowestPriorityNpc) {
      this.activeNpcs.delete(lowestPriorityNpc)
      return lowestPriorityNpc
    }

    return null
  }

  // =============================================
  // 队列处理
  // =============================================

  /**
   * 处理等待队列 — 将排队中的请求分配到释放的配额
   */
  private processQueue(): void {
    while (this.queue.length > 0 && this.activeNpcs.size < this.config.maxConcurrent) {
      const entry = this.queue.shift()
      if (!entry) break

      // 清除超时定时器
      clearTimeout(entry.timeoutId)

      // 触发回调
      entry.resolve()

      logger.debug(`[${entry.npcId}] Dequeued and acquired slot`)
    }
  }

  /**
   * 从队列中移除指定NPC
   */
  private removeFromQueue(npcId: string): void {
    const index = this.queue.findIndex((e) => e.npcId === npcId)
    if (index !== -1) {
      clearTimeout(this.queue[index].timeoutId)
      this.queue.splice(index, 1)
    }
  }

  // =============================================
  // 管理接口
  // =============================================

  /** 获取并发状态统计 */
  getStats(): ConcurrencyStats {
    return {
      maxConcurrent: this.config.maxConcurrent,
      activeCount: this.activeNpcs.size,
      queuedCount: this.queue.length,
      totalAcquires: this.stats.totalAcquires,
      totalReleases: this.stats.totalReleases,
      totalTimeouts: this.stats.totalTimeouts,
      totalDrops: this.stats.totalDrops,
    }
  }

  /** 获取当前活跃NPC ID列表 */
  getActiveNpcIds(): string[] {
    return Array.from(this.activeNpcs)
  }

  /** 获取当前排队NPC ID列表 */
  getQueuedNpcIds(): string[] {
    return this.queue.map((e) => e.npcId)
  }

  /** 更新配置 */
  updateConfig(config: Partial<ConcurrencyConfig>): void {
    this.config = { ...this.config, ...config }
    logger.info(
      `Concurrency config updated: maxConcurrent=${this.config.maxConcurrent}, maxWaitTime=${this.config.maxWaitTime}ms`,
    )
  }

  /** 重置统计 */
  resetStats(): void {
    this.stats = {
      totalAcquires: 0,
      totalReleases: 0,
      totalTimeouts: 0,
      totalDrops: 0,
    }
  }

  /** 检查NPC是否在活跃列表中 */
  isActive(npcId: string): boolean {
    return this.activeNpcs.has(npcId)
  }

  /** 检查NPC是否在排队 */
  isQueued(npcId: string): boolean {
    return this.queue.some((e) => e.npcId === npcId)
  }

  /** 获取可用配额数 */
  get availableSlots(): number {
    return this.config.maxConcurrent - this.activeNpcs.size
  }
}

/** 全局并发控制实例 */
export const concurrencyControl = new ConcurrencyControl()
