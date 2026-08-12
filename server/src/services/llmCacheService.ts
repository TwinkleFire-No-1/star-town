// 星火小镇 — LLM调用缓存
// T5.3.2 相似问题缓存回复、减少重复调用

import { createLogger } from '../utils/index.js'
import { llmService, type ChatMessage, type LLMResponse, type LLMOptions } from './llmService.js'

const logger = createLogger('LLMCache')

// =============================================
// 类型定义
// =============================================

/** 缓存条目 */
interface CacheEntry {
  /** 缓存内容 */
  content: string
  /** 原始响应模型 */
  model: string
  /** 缓存时间戳 */
  timestamp: number
  /** 最后访问时间 */
  lastAccessed: number
  /** 访问次数 */
  hitCount: number
  /** 原始prompt hash */
  promptHash: string
  /** token节省数 */
  tokensSaved: number
  /** 上下文指纹（NPC ID + 人设摘要hash，用于上下文感知缓存） */
  contextFingerprint: string
  /** 用户消息token集合（用于语义近似匹配） */
  userTokens: Set<string>
}

/** 缓存配置 */
export interface LLMCacheConfig {
  /** 最大缓存条目数，默认200 */
  maxEntries: number
  /** 缓存过期时间(ms)，默认30分钟 */
  ttlMs: number
  /** 最小相似度阈值(0-1)，默认0.92 */
  similarityThreshold: number
  /** 是否启用缓存，默认true */
  enabled: boolean
  /** 是否对相同prompt精确匹配缓存 */
  exactMatch: boolean
  /** 是否对相似prompt模糊匹配缓存 */
  fuzzyMatch: boolean
  /** 是否启用上下文感知缓存（同一NPC+相似问题的缓存命中更高），默认true */
  contextAware: boolean
  /** 语义匹配最小用户消息长度，默认5 */
  minMessageLengthForFuzzy: number
  /** 缓存命中率告警阈值(%)，默认低于20%时告警 */
  lowHitRateThreshold: number
}

/** 缓存统计 */
export interface CacheStats {
  /** 命中次数 */
  hits: number
  /** 未命中次数 */
  misses: number
  /** 命中率(%) */
  hitRate: number
  /** 当前缓存条目数 */
  entries: number
  /** 总节省token数 */
  tokensSaved: number
  /** 总节省费用($) */
  costSaved: number
  /** 精确匹配命中数 */
  exactHits: number
  /** 模糊匹配命中数 */
  fuzzyHits: number
  /** 上下文感知命中数 */
  contextHits: number
  /** 平均查找耗时(ms) */
  avgLookupMs: number
  /** 是否低于命中率告警阈值 */
  lowHitRate: boolean
}

// =============================================
// LLM缓存服务
// =============================================

/**
 * LLMCacheService — LLM调用缓存
 *
 * 职责：
 * 1. 精确匹配：相同prompt直接返回缓存结果
 * 2. 模糊匹配：基于关键词相似度匹配相似prompt
 * 3. TTL过期自动清理
 * 4. LRU淘汰策略
 * 5. 缓存命中统计与token节省追踪
 */
class LLMCacheService {
  /** 配置 */
  private config: LLMCacheConfig = {
    maxEntries: 200,
    ttlMs: 30 * 60 * 1000, // 30分钟
    similarityThreshold: 0.92,
    enabled: true,
    exactMatch: true,
    fuzzyMatch: true,
    contextAware: true,
    minMessageLengthForFuzzy: 5,
    lowHitRateThreshold: 20,
  }

  /** 缓存存储 */
  private cache: Map<string, CacheEntry> = new Map()

  /** 统计 */
  private stats = {
    hits: 0,
    misses: 0,
    exactHits: 0,
    fuzzyHits: 0,
    contextHits: 0,
    tokensSaved: 0,
    costSaved: 0,
    totalLookupMs: 0,
    lookupCount: 0,
  }

  // =============================================
  // 核心方法
  // =============================================

  /**
   * 带缓存的聊天调用
   * 先查缓存，命中则直接返回；未命中则调用LLM并缓存结果
   */
  async chat(messages: ChatMessage[], options?: LLMOptions): Promise<LLMResponse & { fromCache: boolean }> {
    if (!this.config.enabled) {
      const response = await llmService.chat(messages, options)
      return { ...response, fromCache: false }
    }

    const lookupStart = Date.now()
    const promptHash = this.hashMessages(messages)
    const promptText = this.extractUserContent(messages)
    const contextFingerprint = this.extractContextFingerprint(messages)
    const userTokens = this.tokenize(promptText)

    // 1. 尝试精确匹配
    if (this.config.exactMatch) {
      const exactEntry = this.cache.get(promptHash)
      if (exactEntry && !this.isExpired(exactEntry)) {
        this.stats.hits++
        this.stats.exactHits++
        exactEntry.lastAccessed = Date.now()
        exactEntry.hitCount++
        const tokensSaved = this.estimateTokens(messages)
        this.stats.tokensSaved += tokensSaved
        this.stats.costSaved += tokensSaved * 0.00000015
        this.recordLookup(Date.now() - lookupStart)

        logger.debug(`Cache exact hit: ${promptHash.substring(0, 8)} (hits: ${exactEntry.hitCount})`)

        return {
          content: exactEntry.content,
          model: `cache:${exactEntry.model}`,
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          finishReason: 'stop',
          fromCache: true,
        }
      }
    }

    // 2. 上下文感知匹配（同一NPC+相似问题的缓存命中更高）
    if (this.config.contextAware && contextFingerprint) {
      const contextEntry = this.findContextMatch(contextFingerprint, userTokens)
      if (contextEntry) {
        this.stats.hits++
        this.stats.contextHits++
        contextEntry.lastAccessed = Date.now()
        contextEntry.hitCount++
        const tokensSaved = this.estimateTokens(messages)
        this.stats.tokensSaved += tokensSaved
        this.stats.costSaved += tokensSaved * 0.00000015
        this.recordLookup(Date.now() - lookupStart)

        logger.debug(`Cache context-aware hit for: ${contextFingerprint.substring(0, 8)}`)

        return {
          content: contextEntry.content,
          model: `cache-ctx:${contextEntry.model}`,
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          finishReason: 'stop',
          fromCache: true,
        }
      }
    }

    // 3. 尝试模糊匹配
    if (this.config.fuzzyMatch && promptText.length > this.config.minMessageLengthForFuzzy) {
      const fuzzyEntry = this.findFuzzyMatch(promptText, userTokens)
      if (fuzzyEntry) {
        this.stats.hits++
        this.stats.fuzzyHits++
        fuzzyEntry.lastAccessed = Date.now()
        fuzzyEntry.hitCount++
        const tokensSaved = this.estimateTokens(messages)
        this.stats.tokensSaved += tokensSaved
        this.stats.costSaved += tokensSaved * 0.00000015
        this.recordLookup(Date.now() - lookupStart)

        logger.debug(`Cache fuzzy hit: similarity above ${this.config.similarityThreshold}`)

        return {
          content: fuzzyEntry.content,
          model: `cache-fuzzy:${fuzzyEntry.model}`,
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          finishReason: 'stop',
          fromCache: true,
        }
      }
    }

    // 4. 缓存未命中，调用LLM
    this.stats.misses++
    const response = await llmService.chat(messages, options)
    this.recordLookup(Date.now() - lookupStart)

    // 5. 缓存结果
    if (response.content && response.content.length > 0) {
      this.addToCache(promptHash, {
        content: response.content,
        model: response.model,
        timestamp: Date.now(),
        lastAccessed: Date.now(),
        hitCount: 0,
        promptHash,
        tokensSaved: 0,
        contextFingerprint,
        userTokens,
      })
    }

    return { ...response, fromCache: false }
  }

  /**
   * 带缓存的流式聊天（流式不缓存，但缓存结果供后续非流式调用使用）
   */
  async chatStream(
    messages: ChatMessage[],
    onChunk: (chunk: string) => void,
    options?: LLMOptions,
  ): Promise<LLMResponse & { fromCache: boolean }> {
    if (!this.config.enabled) {
      const response = await llmService.chatStream(messages, onChunk, options)
      return { ...response, fromCache: false }
    }

    const promptHash = this.hashMessages(messages)
    const contextFingerprint = this.extractContextFingerprint(messages)
    const userTokens = this.tokenize(this.extractUserContent(messages))

    // 流式调用始终调用LLM
    const response = await llmService.chatStream(messages, onChunk, options)

    // 缓存结果供后续使用
    if (response.content && response.content.length > 0) {
      this.addToCache(promptHash, {
        content: response.content,
        model: response.model,
        timestamp: Date.now(),
        lastAccessed: Date.now(),
        hitCount: 0,
        promptHash,
        tokensSaved: 0,
        contextFingerprint,
        userTokens,
      })
    }

    return { ...response, fromCache: false }
  }

  // =============================================
  // 缓存管理
  // =============================================

  /**
   * 添加条目到缓存
   */
  private addToCache(key: string, entry: CacheEntry): void {
    // 容量检查
    if (this.cache.size >= this.config.maxEntries) {
      this.evictLRU()
    }

    this.cache.set(key, entry)
  }

  /**
   * LRU淘汰
   */
  private evictLRU(): void {
    let oldest: string | null = null
    let oldestTime = Infinity

    for (const [key, entry] of this.cache) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed
        oldest = key
      }
    }

    if (oldest) {
      this.cache.delete(oldest)
      logger.debug(`Evicted cache entry: ${oldest.substring(0, 8)}`)
    }
  }

  /**
   * 清理过期条目
   */
  cleanup(): number {
    let removed = 0
    for (const [key, entry] of this.cache) {
      if (this.isExpired(entry)) {
        this.cache.delete(key)
        removed++
      }
    }
    if (removed > 0) {
      logger.info(`Cleaned up ${removed} expired cache entries`)
    }
    return removed
  }

  /**
   * 清空缓存
   */
  clear(): void {
    this.cache.clear()
    logger.info('Cache cleared')
  }

  // =============================================
  // 匹配算法
  // =============================================

  /**
   * 模糊匹配：基于Jaccard相似度（优化版：使用缓存中的userTokens）
   */
  private findFuzzyMatch(_promptText: string, promptTokens: Set<string>): CacheEntry | null {
    let bestEntry: CacheEntry | null = null
    let bestSimilarity = 0

    for (const [_key, entry] of this.cache) {
      if (this.isExpired(entry)) continue

      // 优先使用缓存中的userTokens，更精确匹配用户意图
      const cachedTokens = entry.userTokens.size > 0
        ? entry.userTokens
        : this.tokenize(entry.content)
      const similarity = this.jaccardSimilarity(promptTokens, cachedTokens)

      if (similarity > this.config.similarityThreshold && similarity > bestSimilarity) {
        bestSimilarity = similarity
        bestEntry = entry
      }
    }

    return bestEntry
  }

  /**
   * 上下文感知匹配：同一NPC的相似问题优先匹配
   */
  private findContextMatch(contextFingerprint: string, userTokens: Set<string>): CacheEntry | null {
    let bestEntry: CacheEntry | null = null
    let bestSimilarity = 0

    for (const [_key, entry] of this.cache) {
      if (this.isExpired(entry)) continue
      if (entry.contextFingerprint !== contextFingerprint) continue

      // 同一NPC上下文下，降低相似度阈值
      const cachedTokens = entry.userTokens.size > 0
        ? entry.userTokens
        : this.tokenize(entry.content)
      const similarity = this.jaccardSimilarity(userTokens, cachedTokens)

      const threshold = this.config.similarityThreshold * 0.85 // 上下文匹配降低15%阈值
      if (similarity > threshold && similarity > bestSimilarity) {
        bestSimilarity = similarity
        bestEntry = entry
      }
    }

    return bestEntry
  }

  /**
   * Jaccard相似度
   */
  private jaccardSimilarity(setA: Set<string>, setB: Set<string>): number {
    if (setA.size === 0 && setB.size === 0) return 1
    if (setA.size === 0 || setB.size === 0) return 0

    let intersection = 0
    for (const item of setA) {
      if (setB.has(item)) intersection++
    }

    const union = setA.size + setB.size - intersection
    return union === 0 ? 0 : intersection / union
  }

  /**
   * 简单分词（中文按字/双字分词，英文按空格分词）
   */
  private tokenize(text: string): Set<string> {
    const tokens = new Set<string>()
    // 英文按空格分词
    const words = text.toLowerCase().split(/\s+/)
    for (const word of words) {
      if (word.length > 1) tokens.add(word)
    }
    // 中文按双字分词（bigram）
    const chineseChars = text.match(/[\u4e00-\u9fff]+/g)
    if (chineseChars) {
      for (const segment of chineseChars) {
        for (let i = 0; i < segment.length - 1; i++) {
          tokens.add(segment.substring(i, i + 2))
        }
      }
    }
    return tokens
  }

  // =============================================
  // 工具方法
  // =============================================

  /**
   * 计算消息数组的hash
   */
  private hashMessages(messages: ChatMessage[]): string {
    const content = messages
      .map((m) => `${m.role}:${m.content}`)
      .join('|')
    return this.simpleHash(content)
  }

  /**
   * 简单hash函数
   */
  private simpleHash(str: string): string {
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash // 转为32位整数
    }
    return Math.abs(hash).toString(36)
  }

  /**
   * 提取用户消息内容
   */
  private extractUserContent(messages: ChatMessage[]): string {
    return messages
      .filter((m) => m.role === 'user')
      .map((m) => m.content)
      .join(' ')
  }

  /**
   * 提取上下文指纹（从system消息中提取NPC ID等上下文标识）
   * 格式：npcId:人物名hash
   */
  private extractContextFingerprint(messages: ChatMessage[]): string {
    for (const msg of messages) {
      if (msg.role === 'system') {
        // 从system prompt中提取NPC标识
        const npcMatch = msg.content.match(/(?:角色|NPC|名字)[：:]\s*(\S+)/)
        if (npcMatch) {
          return this.simpleHash(`npc:${npcMatch[1]}`)
        }
        // 提取NPC ID模式
        const idMatch = msg.content.match(/npc[_-]?id[：:]\s*(\S+)/i)
        if (idMatch) {
          return this.simpleHash(`npc:${idMatch[1]}`)
        }
      }
    }
    return ''
  }

  /**
   * 记录查找耗时
   */
  private recordLookup(durationMs: number): void {
    this.stats.totalLookupMs += durationMs
    this.stats.lookupCount++
  }

  /**
   * 检查缓存是否过期
   */
  private isExpired(entry: CacheEntry): boolean {
    return Date.now() - entry.timestamp > this.config.ttlMs
  }

  /**
   * 估算token数
   */
  private estimateTokens(messages: ChatMessage[]): number {
    const text = messages.map((m) => m.content).join('')
    return Math.ceil(text.length / 3)
  }

  // =============================================
  // 管理接口
  // =============================================

  /** 获取缓存统计 */
  getStats(): CacheStats {
    const total = this.stats.hits + this.stats.misses
    const hitRate = total > 0 ? Math.round((this.stats.hits / total) * 100) : 0
    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate,
      entries: this.cache.size,
      tokensSaved: this.stats.tokensSaved,
      costSaved: this.stats.costSaved,
      exactHits: this.stats.exactHits,
      fuzzyHits: this.stats.fuzzyHits,
      contextHits: this.stats.contextHits,
      avgLookupMs: this.stats.lookupCount > 0
        ? Math.round(this.stats.totalLookupMs / this.stats.lookupCount * 100) / 100
        : 0,
      lowHitRate: total > 10 && hitRate < this.config.lowHitRateThreshold,
    }
  }

  /** 更新配置 */
  updateConfig(config: Partial<LLMCacheConfig>): void {
    this.config = { ...this.config, ...config }
    logger.info('LLM Cache config updated')
  }

  /** 获取配置 */
  getConfig(): LLMCacheConfig {
    return { ...this.config }
  }

  /** 预热缓存（批量添加已知问答对） */
  warmup(entries: Array<{ messages: ChatMessage[]; response: string }>): void {
    for (const entry of entries) {
      const promptHash = this.hashMessages(entry.messages)
      const userContent = this.extractUserContent(entry.messages)
      this.addToCache(promptHash, {
        content: entry.response,
        model: 'warmup',
        timestamp: Date.now(),
        lastAccessed: Date.now(),
        hitCount: 0,
        promptHash,
        tokensSaved: 0,
        contextFingerprint: this.extractContextFingerprint(entry.messages),
        userTokens: this.tokenize(userContent),
      })
    }
    logger.info(`Warmed up cache with ${entries.length} entries`)
  }
}

/** 全局LLM缓存服务实例 */
export const llmCacheService = new LLMCacheService()

// 定期清理过期缓存（每10分钟）
setInterval(() => {
  llmCacheService.cleanup()
}, 10 * 60 * 1000)
