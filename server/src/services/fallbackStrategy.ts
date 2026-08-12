import { createLogger } from '../utils/index.js'
import type { ChatMessage } from './llmService.js'
import { ModelPurpose } from '../types/index.js'

const logger = createLogger('Fallback')

/**
 * 降级策略 — LLM 不可用时回退到预设模板
 *
 * 职责：
 * - 根据用途和上下文选择合适的模板回复
 * - 维护按 NPC 角色的模板库
 * - 记录降级事件
 * - 支持自定义模板注册
 */

/** 模板变量 */
interface TemplateVars {
  npcName?: string
  npcRole?: string
  playerAction?: string
  timeOfDay?: string
  location?: string
  [key: string]: string | undefined
}

/** 降级模板定义 */
interface FallbackTemplate {
  /** 模板ID */
  id: string
  /** 用途 */
  purpose: ModelPurpose
  /** 触发关键词（可选） */
  triggerKeywords?: string[]
  /** 模板内容（支持 {npcName} 等变量） */
  template: string
  /** 优先级（数值越小越优先） */
  priority: number
}

/** 降级事件记录 */
interface FallbackEvent {
  timestamp: number
  purpose: ModelPurpose
  reason: string
  templateUsed: string
}

/**
 * FallbackStrategy — 降级策略
 */
class FallbackStrategy {
  /** 模板库 */
  private templates: FallbackTemplate[] = []

  /** 降级事件日志 */
  private events: FallbackEvent[] = []
  private maxEvents = 100

  /** 降级计数（用于限制定期日志） */
  private fallbackCount = 0

  constructor() {
    this.initializeDefaultTemplates()
  }

  /**
   * 初始化默认降级模板
   */
  private initializeDefaultTemplates(): void {
    // === 对话模板 ===
    this.addTemplate({
      id: 'chat-greeting',
      purpose: ModelPurpose.Chat,
      triggerKeywords: ['你好', '嗨', '哈喽', 'hello', 'hi'],
      template: '{npcName}向你点了点头："欢迎来到星火小镇，旅行者。"',
      priority: 1,
    })

    this.addTemplate({
      id: 'chat-default',
      purpose: ModelPurpose.Chat,
      template: '{npcName}若有所思地说："最近小镇上发生了一些奇怪的事情……"',
      priority: 10,
    })

    this.addTemplate({
      id: 'chat-question',
      purpose: ModelPurpose.Chat,
      triggerKeywords: ['什么', '为什么', '怎么', '哪里', '谁'],
      template: '{npcName}想了想说："这个问题我也不是很确定，也许你可以去问问别人。"',
      priority: 2,
    })

    this.addTemplate({
      id: 'chat-buy',
      purpose: ModelPurpose.Chat,
      triggerKeywords: ['买', '购买', '交易', '价格'],
      template: '{npcName}拿出了商品清单："这些都是我精心挑选的好货。"',
      priority: 2,
    })

    this.addTemplate({
      id: 'chat-quest',
      purpose: ModelPurpose.Chat,
      triggerKeywords: ['任务', '委托', '帮忙', '冒险'],
      template: '{npcName}认真地看了你一眼："确实有件事情需要人手，你可以考虑一下。"',
      priority: 2,
    })

    this.addTemplate({
      id: 'chat-farewell',
      purpose: ModelPurpose.Chat,
      triggerKeywords: ['再见', '拜拜', '告辞', 'bye'],
      template: '{npcName}挥手道别："愿星光指引你的道路。"',
      priority: 2,
    })

    // === 快速回复模板 ===
    this.addTemplate({
      id: 'fast-acknowledge',
      purpose: ModelPurpose.Fast,
      template: '好的。',
      priority: 1,
    })

    this.addTemplate({
      id: 'fast-agree',
      purpose: ModelPurpose.Fast,
      template: '没问题。',
      priority: 2,
    })

    this.addTemplate({
      id: 'fast-think',
      purpose: ModelPurpose.Fast,
      template: '让我想想……',
      priority: 3,
    })

    // === 反思模板 ===
    this.addTemplate({
      id: 'reflect-default',
      purpose: ModelPurpose.Reflect,
      template: '今天发生了一些值得回忆的事情，需要好好整理一下思绪。',
      priority: 1,
    })

    logger.info('Fallback templates initialized')
  }

  /**
   * 添加模板
   */
  addTemplate(template: FallbackTemplate): void {
    this.templates.push(template)
    // 按优先级排序
    this.templates.sort((a, b) => a.priority - b.priority)
  }

  /**
   * 生成降级回复
   * @param purpose - 用途
   * @param messages - 对话历史
   * @param vars - 模板变量
   * @param reason - 降级原因
   */
  generateResponse(
    purpose: ModelPurpose,
    messages: ChatMessage[],
    vars: TemplateVars = {},
    reason: string = 'LLM unavailable',
  ): string {
    this.fallbackCount++

    // 提取最后一条用户消息的关键词
    const lastUserMsg = messages.filter((m) => m.role === 'user').pop()?.content ?? ''

    // 查找匹配的模板
    const response = this.findMatchingTemplate(purpose, lastUserMsg, vars)

    // 记录降级事件
    this.recordEvent(purpose, reason, response)

    if (this.fallbackCount % 10 === 1) {
      logger.warn(`Fallback activated (${reason}), total fallbacks: ${this.fallbackCount}`)
    }

    return response
  }

  /**
   * 查找匹配模板
   */
  private findMatchingTemplate(purpose: ModelPurpose, inputText: string, vars: TemplateVars): string {
    const purposeTemplates = this.templates.filter((t) => t.purpose === purpose)

    if (purposeTemplates.length === 0) {
      return this.applyVars('{npcName}没有说什么。', vars)
    }

    // 尝试关键词匹配
    const inputLower = inputText.toLowerCase()
    for (const template of purposeTemplates) {
      if (template.triggerKeywords) {
        const matched = template.triggerKeywords.some((kw) => inputLower.includes(kw.toLowerCase()))
        if (matched) {
          return this.applyVars(template.template, vars)
        }
      }
    }

    // 没有关键词匹配，使用默认模板（优先级最低的）
    const defaultTemplate = purposeTemplates.find((t) => !t.triggerKeywords)
      ?? purposeTemplates[purposeTemplates.length - 1]

    return this.applyVars(defaultTemplate.template, vars)
  }

  /**
   * 替换模板变量
   */
  private applyVars(template: string, vars: TemplateVars): string {
    let result = template
    for (const [key, value] of Object.entries(vars)) {
      if (value !== undefined) {
        result = result.replaceAll(`{${key}}`, value)
      }
    }
    // 清理未替换的变量
    result = result.replaceAll(/\{[^}]+\}/g, '')
    return result
  }

  /**
   * 记录降级事件
   */
  private recordEvent(purpose: ModelPurpose, reason: string, templateUsed: string): void {
    this.events.push({
      timestamp: Date.now(),
      purpose,
      reason,
      templateUsed,
    })

    // 保持事件日志在最大数量内
    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(-this.maxEvents)
    }
  }

  /**
   * 获取降级统计
   */
  getStats(): {
    totalFallbacks: number
    recentEvents: FallbackEvent[]
    byPurpose: Record<string, number>
  } {
    const byPurpose: Record<string, number> = {}
    for (const event of this.events) {
      byPurpose[event.purpose] = (byPurpose[event.purpose] ?? 0) + 1
    }

    return {
      totalFallbacks: this.fallbackCount,
      recentEvents: this.events.slice(-20),
      byPurpose,
    }
  }

  /**
   * 检查是否应该降级
   * 根据最近的降级频率判断
   */
  shouldFallback(lastError?: Error): boolean {
    // 如果有明确的API错误，降级
    if (lastError) {
      const msg = lastError.message.toLowerCase()
      if (msg.includes('api error') || msg.includes('timeout') || msg.includes('429') || msg.includes('unavailable')) {
        return true
      }
    }

    // 检查最近5分钟降级频率
    const fiveMinAgo = Date.now() - 5 * 60 * 1000
    const recentFallbacks = this.events.filter((e) => e.timestamp > fiveMinAgo).length

    // 最近5分钟超过5次降级，认为LLM持续不可用
    return recentFallbacks > 5
  }

  /**
   * 重置降级计数
   */
  reset(): void {
    this.fallbackCount = 0
    this.events = []
  }
}

/** 全局降级策略实例 */
export const fallbackStrategy = new FallbackStrategy()
