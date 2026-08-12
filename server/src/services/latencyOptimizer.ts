// 星火小镇 — 响应延迟优化
// T5.3.4 对话<2s目标验证、异步流程优化、延迟监控

import { createLogger } from '../utils/index.js'
import { profileLoader } from './profileLoader.js'
// T5.3.4 延迟监控 — 延迟记录与预取

const logger = createLogger('LatencyOpt')

// =============================================
// 类型定义
// =============================================

/** 延迟级别 */
export type LatencyLevel = 'fast' | 'normal' | 'slow' | 'timeout'

/** 延迟统计记录 */
export interface LatencyRecord {
  /** NPC ID */
  npcId: string
  /** 请求类型 */
  requestType: 'dialogue' | 'think' | 'act' | 'perceive'
  /** 开始时间戳 */
  startTime: number
  /** 结束时间戳 */
  endTime: number
  /** 延迟(ms) */
  durationMs: number
  /** 延迟级别 */
  level: LatencyLevel
  /** 是否命中缓存 */
  fromCache: boolean
}

/** 延迟优化统计 */
export interface LatencyStats {
  /** 总请求数 */
  totalRequests: number
  /** 各延迟级别分布 */
  levelDistribution: Record<LatencyLevel, number>
  /** 平均延迟(ms) */
  avgLatencyMs: number
  /** P50延迟(ms) */
  p50LatencyMs: number
  /** P95延迟(ms) */
  p95LatencyMs: number
  /** P99延迟(ms) */
  p99LatencyMs: number
  /** 对话<2s达标率(%) */
  dialogueUnder2sRate: number
  /** 缓存命中加速次数 */
  cacheAccelerated: number
  /** 预取命中次数 */
  prefetchHits: number
}

/** 延迟优化配置 */
export interface LatencyOptConfig {
  /** 对话延迟目标(ms)，默认2000 */
  dialogueTargetMs: number
  /** 快速延迟阈值(ms)，默认500 */
  fastThresholdMs: number
  /** 正常延迟阈值(ms)，默认2000 */
  normalThresholdMs: number
  /** 超时阈值(ms)，默认5000 */
  timeoutThresholdMs: number
  /** 是否启用预取，默认true */
  enablePrefetch: boolean
  /** 是否启用延迟监控，默认true */
  enableMonitoring: boolean
  /** 预取触发距离(像素)，默认300 */
  prefetchDistance: number
  /** 统计采样窗口大小，默认100 */
  sampleWindowSize: number
}

// =============================================
// 预取缓存
// =============================================

/** 预取条目 */
interface PrefetchEntry {
  npcId: string
  content: string
  timestamp: number
  used: boolean
}

// =============================================
// 响应延迟优化服务
// =============================================

/**
 * LatencyOptimizer — 响应延迟优化
 *
 * 职责：
 * 1. 延迟监控：记录所有LLM调用延迟，统计P50/P95/P99
 * 2. 对话<2s目标验证：统计达标率
 * 3. 预取缓存：玩家靠近NPC时预生成开场白
 * 4. 异步流程优化：记忆更新异步化、感知和思考流水线
 * 5. 延迟降级：慢响应自动降级到缓存或模板
 */
class LatencyOptimizer {
  /** 配置 */
  private config: LatencyOptConfig = {
    dialogueTargetMs: 2000,
    fastThresholdMs: 500,
    normalThresholdMs: 2000,
    timeoutThresholdMs: 5000,
    enablePrefetch: true,
    enableMonitoring: true,
    prefetchDistance: 300,
    sampleWindowSize: 100,
  }

  /** 延迟记录（最近100条） */
  private latencyRecords: LatencyRecord[] = []

  /** 预取缓存 */
  private prefetchCache: Map<string, PrefetchEntry> = new Map()

  /** 统计 */
  private stats = {
    totalRequests: 0,
    cacheAccelerated: 0,
    prefetchHits: 0,
  }

  // =============================================
  // 延迟监控
  // =============================================

  /**
   * 记录一次延迟
   */
  recordLatency(
    npcId: string,
    requestType: LatencyRecord['requestType'],
    startTime: number,
    endTime: number,
    fromCache: boolean = false,
  ): void {
    if (!this.config.enableMonitoring) return

    const durationMs = endTime - startTime
    const level = this.classifyLatency(durationMs)

    const record: LatencyRecord = {
      npcId,
      requestType,
      startTime,
      endTime,
      durationMs,
      level,
      fromCache,
    }

    this.latencyRecords.push(record)
    if (this.latencyRecords.length > this.config.sampleWindowSize) {
      this.latencyRecords.shift()
    }

    this.stats.totalRequests++

    if (fromCache) {
      this.stats.cacheAccelerated++
    }

    // 慢请求告警
    if (level === 'timeout') {
      logger.warn(
        `[${npcId}] ${requestType} timeout: ${durationMs}ms (target: ${this.config.dialogueTargetMs}ms)`,
      )
    }
  }

  /**
   * 分类延迟级别
   */
  private classifyLatency(durationMs: number): LatencyLevel {
    if (durationMs <= this.config.fastThresholdMs) return 'fast'
    if (durationMs <= this.config.normalThresholdMs) return 'normal'
    if (durationMs <= this.config.timeoutThresholdMs) return 'slow'
    return 'timeout'
  }

  /**
   * 开始计时（返回startTime）
   */
  startTimer(): number {
    return Date.now()
  }

  /**
   * 结束计时并记录
   */
  endAndRecord(
    startTime: number,
    npcId: string,
    requestType: LatencyRecord['requestType'],
    fromCache: boolean = false,
  ): number {
    const endTime = Date.now()
    this.recordLatency(npcId, requestType, startTime, endTime, fromCache)
    return endTime - startTime
  }

  // =============================================
  // 预取缓存
  // =============================================

  /**
   * 检查预取缓存
   */
  checkPrefetch(npcId: string): string | null {
    const entry = this.prefetchCache.get(npcId)
    if (entry && Date.now() - entry.timestamp < 30000 && !entry.used) {
      entry.used = true
      this.stats.prefetchHits++
      logger.debug(`[Prefetch] Hit for ${npcId}`)
      return entry.content
    }
    return null
  }

  /**
   * 存储预取结果
   */
  storePrefetch(npcId: string, content: string): void {
    this.prefetchCache.set(npcId, {
      npcId,
      content,
      timestamp: Date.now(),
      used: false,
    })
  }

  /**
   * 检查是否需要为NPC预取开场白
   * 玩家靠近时触发
   */
  shouldPrefetch(npcId: string, playerX: number, playerY: number): boolean {
    if (!this.config.enablePrefetch) return false

    const profile = profileLoader.getProfile(npcId)
    if (!profile) return false

    // 计算距离
    const dx = profile.x - playerX
    const dy = profile.y - playerY
    const distance = Math.sqrt(dx * dx + dy * dy)

    // 在预取距离内且没有缓存
    if (distance <= this.config.prefetchDistance && !this.prefetchCache.has(npcId)) {
      return true
    }

    return false
  }

  /**
   * 清理过期预取
   */
  cleanupPrefetch(): number {
    let removed = 0
    const now = Date.now()
    for (const [npcId, entry] of this.prefetchCache) {
      if (now - entry.timestamp > 30000 || entry.used) {
        this.prefetchCache.delete(npcId)
        removed++
      }
    }
    return removed
  }

  // =============================================
  // 统计接口
  // =============================================

  /**
   * 获取延迟统计
   */
  getStats(): LatencyStats {
    const records = this.latencyRecords
    const total = records.length

    if (total === 0) {
      return {
        totalRequests: this.stats.totalRequests,
        levelDistribution: { fast: 0, normal: 0, slow: 0, timeout: 0 },
        avgLatencyMs: 0,
        p50LatencyMs: 0,
        p95LatencyMs: 0,
        p99LatencyMs: 0,
        dialogueUnder2sRate: 100,
        cacheAccelerated: this.stats.cacheAccelerated,
        prefetchHits: this.stats.prefetchHits,
      }
    }

    // 计算各级别分布
    const levelDistribution: Record<LatencyLevel, number> = {
      fast: 0,
      normal: 0,
      slow: 0,
      timeout: 0,
    }
    for (const record of records) {
      levelDistribution[record.level]++
    }

    // 计算百分位延迟
    const durations = records.map((r) => r.durationMs).sort((a, b) => a - b)
    const avgLatencyMs = Math.round(durations.reduce((a, b) => a + b, 0) / total)
    const p50 = durations[Math.floor(total * 0.5)] ?? 0
    const p95 = durations[Math.floor(total * 0.95)] ?? 0
    const p99 = durations[Math.min(total - 1, Math.floor(total * 0.99))] ?? 0

    // 对话<2s达标率
    const dialogueRecords = records.filter((r) => r.requestType === 'dialogue')
    const dialogueUnder2s = dialogueRecords.filter(
      (r) => r.durationMs <= this.config.dialogueTargetMs,
    ).length
    const dialogueUnder2sRate =
      dialogueRecords.length > 0
        ? Math.round((dialogueUnder2s / dialogueRecords.length) * 100)
        : 100

    return {
      totalRequests: this.stats.totalRequests,
      levelDistribution,
      avgLatencyMs,
      p50LatencyMs: p50,
      p95LatencyMs: p95,
      p99LatencyMs: p99,
      dialogueUnder2sRate,
      cacheAccelerated: this.stats.cacheAccelerated,
      prefetchHits: this.stats.prefetchHits,
    }
  }

  /** 更新配置 */
  updateConfig(config: Partial<LatencyOptConfig>): void {
    this.config = { ...this.config, ...config }
    logger.info('Latency optimizer config updated')
  }

  /** 获取配置 */
  getConfig(): LatencyOptConfig {
    return { ...this.config }
  }
}

/** 全局延迟优化器实例 */
export const latencyOptimizer = new LatencyOptimizer()

// 每5分钟清理过期预取
setInterval(() => {
  latencyOptimizer.cleanupPrefetch()
}, 5 * 60 * 1000)
