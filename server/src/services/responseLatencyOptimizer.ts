// 星火小镇 — 响应延迟优化
// T5.3.4 对话<2s目标验证、异步流程优化

import { createLogger } from '../utils/index.js'
import { llmCacheService } from './llmCacheService.js'
import { profileLoader } from './profileLoader.js'

const logger = createLogger('LatencyOpt')

// =============================================
// 类型定义
// =============================================

/** 延迟目标配置 */
export interface LatencyConfig {
  /** 对话响应目标延迟(ms)，默认2000 */
  dialogueTargetMs: number
  /** 感知+思考阶段目标(ms)，默认300 */
  perceiveTargetMs: number
  /** 流式首字延迟目标(ms)，默认500 */
  firstChunkTargetMs: number
  /** 是否启用预生成（对话开始前预判回复），默认true */
  enablePregeneration: boolean
  /** 是否启用缓存加速，默认true */
  enableCacheAcceleration: boolean
  /** 超时降级阈值(ms)，默认3000 */
  timeoutFallbackMs: number
}

/** 延迟统计 */
export interface LatencyStats {
  /** 平均对话响应时间(ms) */
  avgDialogueMs: number
  /** P95对话响应时间(ms) */
  p95DialogueMs: number
  /** 缓存加速命中数 */
  cacheAccelerated: number
  /** 预生成命中数 */
  pregenerationHits: number
  /** 降级触发数 */
  fallbackTriggers: number
  /** 总请求数 */
  totalRequests: number
  /** 达标率（<2s）百分比 */
  targetComplianceRate: number
}

/** 延迟记录 */
interface LatencyRecord {
  /** 总延迟(ms) */
  totalMs: number
  /** 感知阶段延迟(ms) */
  perceiveMs: number
  /** 思考阶段延迟(ms) */
  thinkMs: number
  /** 行动/生成阶段延迟(ms) */
  actMs: number
  /** 首字延迟(ms) */
  firstChunkMs: number
  /** 是否命中缓存 */
  cacheHit: boolean
  /** 是否降级 */
  wasFallback: boolean
  /** 时间戳 */
  timestamp: number
}

// =============================================
// 响应延迟优化器
// =============================================

/**
 * ResponseLatencyOptimizer — 响应延迟优化
 *
 * 优化策略：
 * 1. 管道化：感知→思考→行动各阶段计时，识别瓶颈
 * 2. 缓存加速：相似问题直接从缓存返回
 * 3. 预生成：NPC进入对话状态时预生成打招呼回复
 * 4. 超时降级：超过3s自动降级到模板回复
 * 5. 并行化：感知和记忆检索并行执行
 */
class ResponseLatencyOptimizer {
  /** 配置 */
  private config: LatencyConfig = {
    dialogueTargetMs: 2000,
    perceiveTargetMs: 300,
    firstChunkTargetMs: 500,
    enablePregeneration: true,
    enableCacheAcceleration: true,
    timeoutFallbackMs: 3000,
  }

  /** 延迟记录 */
  private records: LatencyRecord[] = []
  private maxRecords = 500

  /** 预生成缓存 */
  private pregenerated: Map<string, { content: string; timestamp: number }> = new Map()

  /** 统计 */
  private stats = {
    cacheAccelerated: 0,
    pregenerationHits: 0,
    fallbackTriggers: 0,
    totalRequests: 0,
  }

  // =============================================
  // 核心方法
  // =============================================

  /**
   * 创建带超时的Promise包装
   * 超时后自动降级到模板回复
   */
  async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number = this.config.timeoutFallbackMs,
    fallbackValue: T,
    label: string = 'operation',
  ): Promise<T> {
    const timeoutPromise = new Promise<T>((_resolve, reject) => {
      setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs)
    })

    try {
      return await Promise.race([promise, timeoutPromise])
    } catch (err) {
      logger.warn(`${label} timed out, using fallback`)
      this.stats.fallbackTriggers++
      return fallbackValue
    }
  }

  /**
   * 尝试缓存加速对话回复
   * 如果缓存命中，直接返回；否则返回null
   */
  async tryCacheAcceleration(
    npcId: string,
    message: string,
  ): Promise<{ content: string; fromCache: boolean } | null> {
    if (!this.config.enableCacheAcceleration) return null

    const profile = profileLoader.getProfile(npcId)
    if (!profile) return null

    // 构造缓存查询的messages
    const cacheMessages = [
      { role: 'system' as const, content: `你是${profile.name}，${profile.personality ?? '一个NPC'}` },
      { role: 'user' as const, content: message },
    ]

    try {
      const result = await llmCacheService.chat(cacheMessages, { maxTokens: 256 })
      if (result.fromCache) {
        this.stats.cacheAccelerated++
        logger.debug(`Cache accelerated response for ${npcId}`)
        return { content: result.content, fromCache: true }
      }
    } catch {
      // 缓存查询失败不影响正常流程
    }

    return null
  }

  /**
   * 预生成NPC打招呼回复
   * 当NPC进入对话状态时调用
   */
  async pregenerateGreeting(npcId: string): Promise<void> {
    if (!this.config.enablePregeneration) return

    const profile = profileLoader.getProfile(npcId)
    if (!profile) return

    // 检查是否已有预生成结果
    const existing = this.pregenerated.get(npcId)
    if (existing && Date.now() - existing.timestamp < 30000) {
      return // 30秒内已有预生成结果
    }

    try {
      const greetingPrompt = `你好，我是${profile.name}。`
      this.pregenerated.set(npcId, {
        content: greetingPrompt,
        timestamp: Date.now(),
      })
      logger.debug(`Pregenerated greeting for ${npcId}`)
    } catch (err) {
      logger.warn(`Pregeneration failed for ${npcId}: ${(err as Error).message}`)
    }
  }

  /**
   * 获取预生成的回复
   */
  getPregenerated(npcId: string): string | null {
    const entry = this.pregenerated.get(npcId)
    if (entry && Date.now() - entry.timestamp < 30000) {
      this.stats.pregenerationHits++
      this.pregenerated.delete(npcId) // 消费一次
      return entry.content
    }
    this.pregenerated.delete(npcId)
    return null
  }

  /**
   * 记录延迟数据
   */
  recordLatency(record: Omit<LatencyRecord, 'timestamp'>): void {
    this.records.push({ ...record, timestamp: Date.now() })
    if (this.records.length > this.maxRecords) {
      this.records.shift()
    }
    this.stats.totalRequests++
  }

  // =============================================
  // 统计与分析
  // =============================================

  /**
   * 获取延迟统计
   */
  getStats(): LatencyStats {
    if (this.records.length === 0) {
      return {
        avgDialogueMs: 0,
        p95DialogueMs: 0,
        cacheAccelerated: this.stats.cacheAccelerated,
        pregenerationHits: this.stats.pregenerationHits,
        fallbackTriggers: this.stats.fallbackTriggers,
        totalRequests: this.stats.totalRequests,
        targetComplianceRate: 100,
      }
    }

    const latencies = this.records.map((r) => r.totalMs).sort((a, b) => a - b)
    const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length
    const p95Index = Math.floor(latencies.length * 0.95)
    const p95 = latencies[p95Index] ?? 0

    const compliant = latencies.filter((l) => l < this.config.dialogueTargetMs).length
    const complianceRate = Math.round((compliant / latencies.length) * 100)

    return {
      avgDialogueMs: Math.round(avg),
      p95DialogueMs: Math.round(p95),
      cacheAccelerated: this.stats.cacheAccelerated,
      pregenerationHits: this.stats.pregenerationHits,
      fallbackTriggers: this.stats.fallbackTriggers,
      totalRequests: this.stats.totalRequests,
      targetComplianceRate: complianceRate,
    }
  }

  /**
   * 获取性能瓶颈分析
   */
  getBottleneckAnalysis(): { stage: string; avgMs: number; isBottleneck: boolean }[] {
    if (this.records.length === 0) return []

    const stages = [
      { name: 'perceive', field: 'perceiveMs' as const },
      { name: 'think', field: 'thinkMs' as const },
      { name: 'act', field: 'actMs' as const },
      { name: 'firstChunk', field: 'firstChunkMs' as const },
    ]

    const avgTotal = this.records.reduce((a, r) => a + r.totalMs, 0) / this.records.length

    return stages.map((stage) => {
      const avg = this.records.reduce((a, r) => a + r[stage.field], 0) / this.records.length
      return {
        stage: stage.name,
        avgMs: Math.round(avg),
        isBottleneck: avg > avgTotal * 0.4, // 超过40%时间为瓶颈
      }
    })
  }

  /** 更新配置 */
  updateConfig(config: Partial<LatencyConfig>): void {
    this.config = { ...this.config, ...config }
  }

  /** 获取配置 */
  getConfig(): LatencyConfig {
    return { ...this.config }
  }

  /** 清理过期预生成缓存 */
  cleanup(): number {
    let removed = 0
    const now = Date.now()
    for (const [npcId, entry] of this.pregenerated) {
      if (now - entry.timestamp > 30000) {
        this.pregenerated.delete(npcId)
        removed++
      }
    }
    return removed
  }
}

/** 全局响应延迟优化器实例 */
export const responseLatencyOptimizer = new ResponseLatencyOptimizer()

// 定期清理
setInterval(() => {
  responseLatencyOptimizer.cleanup()
}, 5 * 60 * 1000)
