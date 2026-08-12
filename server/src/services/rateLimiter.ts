import { createLogger } from '../utils/index.js'

const logger = createLogger('RateLimiter')

/**
 * 令牌桶算法实现
 */
class TokenBucket {
  private tokens: number
  private readonly maxTokens: number
  private readonly refillRate: number // tokens per second
  private lastRefillTime: number

  constructor(maxTokens: number, refillRatePerSecond: number) {
    this.maxTokens = maxTokens
    this.tokens = maxTokens
    this.refillRate = refillRatePerSecond
    this.lastRefillTime = Date.now()
  }

  /**
   * 尝试消费一个令牌
   */
  consume(count: number = 1): boolean {
    this.refill()
    if (this.tokens >= count) {
      this.tokens -= count
      return true
    }
    return false
  }

  /**
   * 获取当前可用令牌数
   */
  getAvailableTokens(): number {
    this.refill()
    return this.tokens
  }

  /**
   * 获取等待下一个令牌的时间（毫秒）
   */
  getWaitTime(): number {
    this.refill()
    if (this.tokens >= 1) return 0
    return Math.ceil((1 - this.tokens) / this.refillRate * 1000)
  }

  /**
   * 重新填充令牌
   */
  private refill(): void {
    const now = Date.now()
    const elapsed = (now - this.lastRefillTime) / 1000
    const tokensToAdd = elapsed * this.refillRate
    this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd)
    this.lastRefillTime = now
  }
}

/** 调用者限流配置 */
interface CallerRateLimit {
  /** 每分钟最大请求数 */
  maxRequestsPerMin: number
  /** 当前分钟已用请求数 */
  requestCount: number
  /** 当前分钟窗口起始时间 */
  windowStart: number
}

/** Token 计费记录 */
interface TokenBillingRecord {
  timestamp: number
  callerId: string
  model: string
  promptTokens: number
  completionTokens: number
  totalTokens: number
  estimatedCost: number
}

/** 超限告警 */
interface RateLimitAlert {
  timestamp: number
  callerId: string
  type: 'rate_limit' | 'token_budget'
  message: string
  currentUsage: number
  limit: number
}

/**
 * RateLimiter — 速率限制与Token计费
 *
 * 职责：
 * - 令牌桶算法限制全局 API 调用频率
 * - 按调用者（NPC ID）限制每分钟请求数
 * - Token 用量追踪与费用估算
 * - 超限告警
 */
class RateLimiter {
  /** 全局令牌桶（每秒5次，最大突发20次） */
  private globalBucket = new TokenBucket(20, 5)

  /** 按调用者的速率限制 */
  private callerLimits = new Map<string, CallerRateLimit>()

  /** 每个调用者每分钟最大请求数 */
  private maxRequestsPerCallerPerMin = 30

  /** Token 计费记录 */
  private billingRecords: TokenBillingRecord[] = []
  private maxRecords = 1000

  /** 超限告警列表 */
  private alerts: RateLimitAlert[] = []
  private maxAlerts = 100

  /** Token 预算（每日上限） */
  private dailyTokenBudget = 500000
  private dailyTokenUsed = 0
  private dailyResetDate = ''

  /** 费用模型 */
  private costPerPromptToken = 0.00000015   // $0.15/1M tokens
  private costPerCompletionToken = 0.0000006 // $0.60/1M tokens

  constructor() {
    this.checkDailyReset()
  }

  /**
   * 检查是否允许请求（全局 + 调用者维度）
   */
  canProceed(callerId: string): { allowed: boolean; reason?: string; waitMs?: number } {
    // 检查每日预算
    this.checkDailyReset()
    if (this.dailyTokenUsed >= this.dailyTokenBudget) {
      this.addAlert(callerId, 'token_budget', 'Daily token budget exceeded', this.dailyTokenUsed, this.dailyTokenBudget)
      return { allowed: false, reason: 'daily_budget_exceeded' }
    }

    // 检查全局令牌桶
    if (!this.globalBucket.consume()) {
      const waitMs = this.globalBucket.getWaitTime()
      this.addAlert(callerId, 'rate_limit', 'Global rate limit exceeded', 0, 20)
      return { allowed: false, reason: 'global_rate_limit', waitMs }
    }

    // 检查调用者频率限制
    const callerLimit = this.getOrCreateCallerLimit(callerId)
    const now = Date.now()

    // 重置窗口
    if (now - callerLimit.windowStart > 60000) {
      callerLimit.requestCount = 0
      callerLimit.windowStart = now
    }

    if (callerLimit.requestCount >= callerLimit.maxRequestsPerMin) {
      this.addAlert(callerId, 'rate_limit', `Caller ${callerId} exceeded rate limit`, callerLimit.requestCount, callerLimit.maxRequestsPerMin)
      return { allowed: false, reason: 'caller_rate_limit', waitMs: 60000 - (now - callerLimit.windowStart) }
    }

    callerLimit.requestCount++
    return { allowed: true }
  }

  /**
   * 记录 Token 使用
   */
  recordUsage(callerId: string, model: string, promptTokens: number, completionTokens: number): void {
    this.checkDailyReset()

    const totalTokens = promptTokens + completionTokens
    const estimatedCost = promptTokens * this.costPerPromptToken + completionTokens * this.costPerCompletionToken

    // 添加计费记录
    const record: TokenBillingRecord = {
      timestamp: Date.now(),
      callerId,
      model,
      promptTokens,
      completionTokens,
      totalTokens,
      estimatedCost,
    }
    this.billingRecords.push(record)
    if (this.billingRecords.length > this.maxRecords) {
      this.billingRecords = this.billingRecords.slice(-this.maxRecords)
    }

    // 更新每日用量
    this.dailyTokenUsed += totalTokens

    // 接近预算时发出告警
    if (this.dailyTokenUsed > this.dailyTokenBudget * 0.8 && this.dailyTokenUsed < this.dailyTokenBudget * 0.82) {
      this.addAlert('system', 'token_budget', 'Daily token budget at 80%', this.dailyTokenUsed, this.dailyTokenBudget)
    }
  }

  /**
   * 获取使用统计
   */
  getStats(): {
    dailyTokenUsed: number
    dailyTokenBudget: number
    dailyUtilization: number
    estimatedDailyCost: number
    globalBucketAvailable: number
    recentRecords: TokenBillingRecord[]
    recentAlerts: RateLimitAlert[]
    callerStats: Record<string, { requestCount: number; maxRequests: number }>
  } {
    // 计算费用
    let estimatedDailyCost = 0
    for (const record of this.billingRecords) {
      estimatedDailyCost += record.estimatedCost
    }

    // 调用者统计
    const callerStats: Record<string, { requestCount: number; maxRequests: number }> = {}
    for (const [callerId, limit] of this.callerLimits) {
      callerStats[callerId] = {
        requestCount: limit.requestCount,
        maxRequests: limit.maxRequestsPerMin,
      }
    }

    return {
      dailyTokenUsed: this.dailyTokenUsed,
      dailyTokenBudget: this.dailyTokenBudget,
      dailyUtilization: Math.round((this.dailyTokenUsed / this.dailyTokenBudget) * 100),
      estimatedDailyCost,
      globalBucketAvailable: this.globalBucket.getAvailableTokens(),
      recentRecords: this.billingRecords.slice(-20),
      recentAlerts: this.alerts.slice(-20),
      callerStats,
    }
  }

  /**
   * 设置每日Token预算
   */
  setDailyBudget(budget: number): void {
    this.dailyTokenBudget = budget
    logger.info(`Daily token budget set to ${budget}`)
  }

  /**
   * 设置调用者每分钟最大请求数
   */
  setCallerRateLimit(maxRequests: number): void {
    this.maxRequestsPerCallerPerMin = maxRequests
    logger.info(`Caller rate limit set to ${maxRequests}/min`)
  }

  /**
   * 获取或创建调用者限流配置
   */
  private getOrCreateCallerLimit(callerId: string): CallerRateLimit {
    let limit = this.callerLimits.get(callerId)
    if (!limit) {
      limit = {
        maxRequestsPerMin: this.maxRequestsPerCallerPerMin,
        requestCount: 0,
        windowStart: Date.now(),
      }
      this.callerLimits.set(callerId, limit)
    }
    return limit
  }

  /**
   * 检查并重置每日计数
   */
  private checkDailyReset(): void {
    const today = new Date().toISOString().slice(0, 10)
    if (this.dailyResetDate !== today) {
      this.dailyResetDate = today
      this.dailyTokenUsed = 0
      logger.info(`Daily token counter reset for ${today}`)
    }
  }

  /**
   * 添加告警
   */
  private addAlert(callerId: string, type: 'rate_limit' | 'token_budget', message: string, currentUsage: number, limit: number): void {
    const alert: RateLimitAlert = {
      timestamp: Date.now(),
      callerId,
      type,
      message,
      currentUsage,
      limit,
    }
    this.alerts.push(alert)
    if (this.alerts.length > this.maxAlerts) {
      this.alerts = this.alerts.slice(-this.maxAlerts)
    }

    logger.warn(`[Alert] ${type}: ${message} (${currentUsage}/${limit}) caller=${callerId}`)
  }
}

/** 全局速率限制器实例 */
export const rateLimiter = new RateLimiter()
