import { config } from '../config/index.js'
import { createLogger } from '../utils/index.js'
import type { ChatMessage, LLMResponse, EmbeddingResponse } from './llmService.js'
import { llmService } from './llmService.js'
import { fallbackStrategy } from './fallbackStrategy.js'
import { ModelPurpose } from '../types/index.js'

// 重新导出以保持向后兼容
export { ModelPurpose }

const logger = createLogger('ModelRouter')

/** 模型配置 */
interface ModelConfig {
  /** 模型ID（OpenAI兼容） */
  model: string
  /** 最大Token */
  maxTokens: number
  /** 温度 */
  temperature: number
  /** 每百万Token成本（美元） */
  costPerMToken: number
  /** 优先级（数值越小越优先） */
  priority: number
  /** 是否可用 */
  available: boolean
  /** 最后健康检查时间 */
  lastHealthCheck: number
}

/** 路由策略结果 */
export interface RouteResult {
  purpose: ModelPurpose
  model: string
  maxTokens: number
  temperature: number
  fallbackChain: string[]
}

/**
 * ModelRouter — 模型路由器
 *
 * 职责：
 * - 按用途（对话/快速/嵌入/反思）选择最优模型
 * - 健康检查驱动的可用性管理
 * - 路由降级链（主模型不可用时自动切换）
 * - 运行时配置更新
 *
 * 设计：
 * - chat: 主力对话模型（GPT-4o-mini/Qwen等）
 * - fast: 轻量模型（GPT-3.5-turbo/ChatGLM等）
 * - embed: 嵌入模型（text-embedding-3-small等）
 * - reflect: 反思模型（复用chat模型，增大maxTokens）
 */
class ModelRouter {
  /** 各用途的模型配置列表（按优先级排序） */
  private models: Map<ModelPurpose, ModelConfig[]> = new Map()

  /** 健康检查间隔（5分钟） */
  private healthCheckInterval = 5 * 60 * 1000

  constructor() {
    this.initializeModels()
  }

  /**
   * 初始化默认模型配置
   */
  private initializeModels(): void {
    const primaryModel = config.llm.model
    const embedModel = config.llm.embedModel

    // 对话模型链
    this.models.set(ModelPurpose.Chat, [
      {
        model: primaryModel,
        maxTokens: 512,
        temperature: 0.7,
        costPerMToken: 0.15,
        priority: 1,
        available: true,
        lastHealthCheck: 0,
      },
      // 降级：Qwen3.5-9B
      {
        model: 'Qwen/Qwen3.5-9B',
        maxTokens: 512,
        temperature: 0.7,
        costPerMToken: 0.05,
        priority: 2,
        available: true,
        lastHealthCheck: 0,
      },
    ])

    // 快速模型链（修复：优先用主力模型DeepSeek-V4-Flash，
    // Qwen3.5-9B是推理模型，max_tokens内常只输出reasoning导致content为空）
    this.models.set(ModelPurpose.Fast, [
      {
        model: primaryModel,
        maxTokens: 512,
        temperature: 0.5,
        costPerMToken: 0.15,
        priority: 1,
        available: true,
        lastHealthCheck: 0,
      },
      {
        model: 'Qwen/Qwen3.5-9B',
        maxTokens: 1024,
        temperature: 0.5,
        costPerMToken: 0.05,
        priority: 2,
        available: true,
        lastHealthCheck: 0,
      },
    ])

    // 反思模型链（复用对话模型，增大上下文）
    this.models.set(ModelPurpose.Reflect, [
      {
        model: primaryModel,
        maxTokens: 1024,
        temperature: 0.5,
        costPerMToken: 0.15,
        priority: 1,
        available: true,
        lastHealthCheck: 0,
      },
      {
        model: 'Qwen/Qwen3.5-9B',
        maxTokens: 1024,
        temperature: 0.5,
        costPerMToken: 0.05,
        priority: 2,
        available: true,
        lastHealthCheck: 0,
      },
    ])

    // 嵌入模型链
    this.models.set(ModelPurpose.Embed, [
      {
        model: embedModel,
        maxTokens: 512,
        temperature: 0,
        costPerMToken: 0.02,
        priority: 1,
        available: true,
        lastHealthCheck: 0,
      },
    ])

    logger.info('Model router initialized with default configuration')
  }

  /**
   * 路由：根据用途选择最优模型
   */
  route(purpose: ModelPurpose): RouteResult {
    const modelChain = this.models.get(purpose)
    if (!modelChain || modelChain.length === 0) {
      logger.warn(`No models configured for purpose: ${purpose}`)
      return {
        purpose,
        model: config.llm.model,
        maxTokens: 256,
        temperature: 0.7,
        fallbackChain: [],
      }
    }

    // 找到第一个可用的模型
    const selected = modelChain.find((m) => m.available)
    if (selected) {
      const fallbackChain = modelChain
        .filter((m) => m.model !== selected.model)
        .map((m) => m.model)

      return {
        purpose,
        model: selected.model,
        maxTokens: selected.maxTokens,
        temperature: selected.temperature,
        fallbackChain,
      }
    }

    // 全部不可用，返回第一个模型（允许降级策略处理）
    const first = modelChain[0]
    logger.warn(`All models unavailable for ${purpose}, using: ${first.model}`)

    return {
      purpose,
      model: first.model,
      maxTokens: first.maxTokens,
      temperature: first.temperature,
      fallbackChain: modelChain.slice(1).map((m) => m.model),
    }
  }

  /**
   * 使用路由结果调用聊天
   * 支持降级链 + 模板降级
   * @param extraOptions 透传给 llmService.chat 的额外选项（如 skipReasoning）
   */
  async chat(
    messages: ChatMessage[],
    purpose: ModelPurpose = ModelPurpose.Chat,
    vars?: Record<string, string>,
    extraOptions?: { skipReasoning?: boolean },
  ): Promise<LLMResponse> {
    const route = this.route(purpose)
    logger.info(`[Route] ${purpose} → ${route.model}`)

    try {
      return await llmService.chat(messages, {
        model: route.model,
        maxTokens: route.maxTokens,
        temperature: route.temperature,
        skipReasoning: extraOptions?.skipReasoning,
      })
    } catch (err) {
      // 尝试降级链
      for (const fallbackModel of route.fallbackChain) {
        logger.info(`[Route] Fallback to: ${fallbackModel}`)
        try {
          return await llmService.chat(messages, {
            model: fallbackModel,
            maxTokens: route.maxTokens,
            temperature: route.temperature,
            skipReasoning: extraOptions?.skipReasoning,
          })
        } catch {
          continue
        }
      }

      // 所有模型都失败，使用模板降级
      if (fallbackStrategy.shouldFallback(err as Error)) {
        const templateResponse = fallbackStrategy.generateResponse(purpose, messages, vars, (err as Error).message)
        logger.warn(`[Route] All models failed, using fallback template`)
        return {
          content: templateResponse,
          model: 'fallback-template',
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          finishReason: 'fallback',
        }
      }

      throw err
    }
  }

  /**
   * 使用路由结果调用流式聊天
   * 支持降级链 + 模板降级
   * @param extraOptions 透传给 llmService.chatStream 的额外选项（如 skipReasoning）
   */
  async chatStream(
    messages: ChatMessage[],
    onChunk: (chunk: string) => void,
    purpose: ModelPurpose = ModelPurpose.Chat,
    vars?: Record<string, string>,
    extraOptions?: { skipReasoning?: boolean },
  ): Promise<LLMResponse> {
    const route = this.route(purpose)
    logger.info(`[Route] ${purpose} stream → ${route.model}`)

    try {
      return await llmService.chatStream(messages, onChunk, {
        model: route.model,
        maxTokens: route.maxTokens,
        temperature: route.temperature,
        skipReasoning: extraOptions?.skipReasoning,
      })
    } catch (err) {
      for (const fallbackModel of route.fallbackChain) {
        logger.info(`[Route] Fallback stream to: ${fallbackModel}`)
        try {
          return await llmService.chatStream(messages, onChunk, {
            model: fallbackModel,
            maxTokens: route.maxTokens,
            temperature: route.temperature,
            skipReasoning: extraOptions?.skipReasoning,
          })
        } catch {
          continue
        }
      }

      // 模板降级
      if (fallbackStrategy.shouldFallback(err as Error)) {
        const templateResponse = fallbackStrategy.generateResponse(purpose, messages, vars, (err as Error).message)
        logger.warn(`[Route] All models failed (stream), using fallback template`)
        // 流式输出模拟
        for (let i = 0; i < templateResponse.length; i += 2) {
          onChunk(templateResponse.slice(i, i + 2))
        }
        return {
          content: templateResponse,
          model: 'fallback-template',
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          finishReason: 'fallback',
        }
      }

      throw err
    }
  }

  /**
   * 使用路由结果调用嵌入
   */
  async embed(text: string): Promise<EmbeddingResponse> {
    const route = this.route(ModelPurpose.Embed)
    logger.info(`[Route] embed → ${route.model}`)

    try {
      return await llmService.embed(text, route.model)
    } catch (err) {
      for (const fallbackModel of route.fallbackChain) {
        logger.info(`[Route] Fallback embed to: ${fallbackModel}`)
        try {
          return await llmService.embed(text, fallbackModel)
        } catch {
          continue
        }
      }
      throw err
    }
  }

  /**
   * 执行健康检查，更新模型可用性
   */
  async checkHealth(): Promise<Record<ModelPurpose, { model: string; available: boolean }[]>> {
    const results: Record<string, { model: string; available: boolean }[]> = {}

    for (const [purpose, modelChain] of this.models) {
      results[purpose] = []

      for (const modelConfig of modelChain) {
        // 只检查距离上次检查超过间隔的模型
        const now = Date.now()
        if (now - modelConfig.lastHealthCheck < this.healthCheckInterval) {
          results[purpose].push({
            model: modelConfig.model,
            available: modelConfig.available,
          })
          continue
        }

        modelConfig.lastHealthCheck = now

        try {
          // 轻量级健康检查
          const health = await llmService.healthCheck()
          const isAvailable = health.available && health.model === modelConfig.model
          modelConfig.available = isAvailable
        } catch {
          modelConfig.available = false
        }

        results[purpose].push({
          model: modelConfig.model,
          available: modelConfig.available,
        })
      }
    }

    return results as Record<ModelPurpose, { model: string; available: boolean }[]>
  }

  /**
   * 标记模型不可用
   */
  markUnavailable(modelId: string): void {
    for (const [, modelChain] of this.models) {
      for (const modelConfig of modelChain) {
        if (modelConfig.model === modelId) {
          modelConfig.available = false
          logger.warn(`Model marked unavailable: ${modelId}`)
        }
      }
    }
  }

  /**
   * 手动设置模型可用性
   */
  setModelAvailability(modelId: string, available: boolean): void {
    for (const [, modelChain] of this.models) {
      for (const modelConfig of modelChain) {
        if (modelConfig.model === modelId) {
          modelConfig.available = available
          modelConfig.lastHealthCheck = Date.now()
          logger.info(`Model ${modelId} set to ${available ? 'available' : 'unavailable'}`)
        }
      }
    }
  }

  /**
   * 获取所有路由配置
   */
  getRoutingTable(): Record<string, { model: string; maxTokens: number; available: boolean; priority: number }[]> {
    const result: Record<string, { model: string; maxTokens: number; available: boolean; priority: number }[]> = {}

    for (const [purpose, modelChain] of this.models) {
      result[purpose] = modelChain.map((m) => ({
        model: m.model,
        maxTokens: m.maxTokens,
        available: m.available,
        priority: m.priority,
      }))
    }

    return result
  }

  /**
   * 动态添加/更新模型配置
   */
  addModel(purpose: ModelPurpose, modelConfig: Omit<ModelConfig, 'lastHealthCheck'>): void {
    const chain = this.models.get(purpose) ?? []
    const existingIdx = chain.findIndex((m) => m.model === modelConfig.model)

    const newEntry: ModelConfig = {
      ...modelConfig,
      lastHealthCheck: 0,
    }

    if (existingIdx >= 0) {
      chain[existingIdx] = newEntry
    } else {
      chain.push(newEntry)
      chain.sort((a, b) => a.priority - b.priority)
    }

    this.models.set(purpose, chain)
    logger.info(`Model added: ${modelConfig.model} for ${purpose}`)
  }
}

/** 全局模型路由器实例 */
export const modelRouter = new ModelRouter()
