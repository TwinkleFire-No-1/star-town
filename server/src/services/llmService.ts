import { config } from '../config/index.js'
import { createLogger } from '../utils/index.js'

const logger = createLogger('LLM')

/**
 * LLM服务 — OpenAI兼容API封装
 *
 * 职责：
 * - 统一的LLM调用接口（兼容OpenAI/Anthropic/国产模型）
 * - 流式响应处理（SSE → WebSocket 转发）
 * - 聊天/补全/嵌入三种调用模式
 * - 错误处理与重试
 *
 * 设计：
 * - 通过 LLM_API_BASE 配置任何OpenAI兼容端点
 * - 支持 streaming 和 non-streaming 两种模式
 * - 内置重试逻辑（最多3次）
 * - Token 计数与计费追踪
 */

/** 聊天消息格式 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/** LLM 响应格式 */
export interface LLMResponse {
  content: string
  model: string
  usage: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
  finishReason: string | null
}

/** LLM 调用选项 */
export interface LLMOptions {
  model?: string
  temperature?: number
  maxTokens?: number
  topP?: number
  stream?: boolean
  /** 流式回调 */
  onChunk?: (chunk: string) => void
  /** 跳过 reasoning_content（推理模型思考过程），只输出正式回答 */
  skipReasoning?: boolean
}

/** 嵌入响应格式 */
export interface EmbeddingResponse {
  embedding: number[]
  model: string
  usage: {
    promptTokens: number
    totalTokens: number
  }
}

/** Token 使用统计 */
interface TokenUsage {
  totalPromptTokens: number
  totalCompletionTokens: number
  totalRequests: number
}

/**
 * LLMService — OpenAI兼容API封装
 */
class LLMService {
  private apiBase: string
  private apiKey: string
  private defaultModel: string
  private embedModel: string
  private maxRetries = 3
  private retryDelay = 1000

  /** Token使用统计 */
  private usage: TokenUsage = {
    totalPromptTokens: 0,
    totalCompletionTokens: 0,
    totalRequests: 0,
  }

  constructor() {
    this.apiBase = config.llm.apiBase
    this.apiKey = config.llm.apiKey
    this.defaultModel = config.llm.model
    this.embedModel = config.llm.embedModel
  }

  /**
   * 聊天补全（非流式）
   */
  async chat(messages: ChatMessage[], options?: LLMOptions): Promise<LLMResponse> {
    const model = options?.model ?? this.defaultModel
    const url = `${this.apiBase}/chat/completions`

    const body = {
      model,
      messages,
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens ?? 512,
      top_p: options?.topP ?? 1,
      stream: false,
    }

    const response = await this.request(url, body, this.maxRetries)

    const choice = response.choices?.[0]
    const usage = response.usage

    // 先取正式回答，再统一清洗思考内容（去 <think> 块/推理前缀），保证对话不泄露思考过程
    let content = choice?.message?.content ?? ''
    // BUG修复: 推理模型（如Qwen3.5-9B）max_tokens 不足时 content 为空。
    // 仅在非对话用途（如 Think 决策）下用 reasoning_content 兜底；
    // 对话用途（skipReasoning=true）绝不回退思考内容，返回空由上层降级固定台词
    if (!content && choice?.message?.reasoning_content && !options?.skipReasoning) {
      content = choice.message.reasoning_content
    }
    content = this.stripThinking(content)

    const result: LLMResponse = {
      content,
      model: response.model ?? model,
      usage: {
        promptTokens: usage?.prompt_tokens ?? 0,
        completionTokens: usage?.completion_tokens ?? 0,
        totalTokens: usage?.total_tokens ?? 0,
      },
      finishReason: choice?.finish_reason ?? null,
    }

    // 更新统计
    this.usage.totalPromptTokens += result.usage.promptTokens
    this.usage.totalCompletionTokens += result.usage.completionTokens
    this.usage.totalRequests++

    return result
  }

  /** BUG-003修复: 流式SSE超时时间(ms) */
  private streamTimeout = 30000 // 30秒超时

  /**
   * 聊天补全（流式）
   * 通过 onChunk 回调逐步返回内容
   * BUG-003修复: 添加超时机制，防止SSE连接挂起导致Agent循环永久阻塞
   */
  async chatStream(
    messages: ChatMessage[],
    onChunk: (chunk: string) => void,
    options?: LLMOptions,
  ): Promise<LLMResponse> {
    const model = options?.model ?? this.defaultModel
    const url = `${this.apiBase}/chat/completions`

    const body = {
      model,
      messages,
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens ?? 512,
      top_p: options?.topP ?? 1,
      stream: true,
    }

    let fullContent = ''
    let reasoningBuffer = ''
    let promptTokens = 0
    let completionTokens = 0

    try {
      // BUG-003修复: 使用AbortController实现超时
      const abortController = new AbortController()
      const timeoutId = setTimeout(() => {
        abortController.abort()
        logger.warn(`Stream timeout after ${this.streamTimeout}ms, aborting...`)
      }, this.streamTimeout)

      const response = await fetch(url, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(body),
        signal: abortController.signal,
      })

      if (!response.ok) {
        clearTimeout(timeoutId)
        const error = await response.text()
        throw new Error(`LLM API error: ${response.status} - ${error}`)
      }

      const reader = response.body?.getReader()
      if (!reader) {
        clearTimeout(timeoutId)
        throw new Error('No response body')
      }

      const decoder = new TextDecoder()
      let buffer = ''

      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          // 收到数据时重置超时
          clearTimeout(timeoutId)
          setTimeout(() => {
            abortController.abort()
            logger.warn(`Stream timeout (inter-chunk), aborting...`)
          }, this.streamTimeout)

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''

          for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed || !trimmed.startsWith('data: ')) continue

            const data = trimmed.slice(6)
            if (data === '[DONE]') break

            try {
              const parsed = JSON.parse(data)
              const delta = parsed.choices?.[0]?.delta
              if (delta?.content) {
                fullContent += delta.content
                onChunk(delta.content)
              } else if (delta?.reasoning_content) {
                // BUG修复: 推理模型流式输出时content可能为空，用reasoning_content兜底
                if (options?.skipReasoning) {
                  // 跳过思考过程，但保留一份作为极端兜底
                  reasoningBuffer += delta.reasoning_content
                } else {
                  fullContent += delta.reasoning_content
                  onChunk(delta.reasoning_content)
                }
              }
              // 流式中的 usage 信息（某些API在最后一个chunk中返回）
              if (parsed.usage) {
                promptTokens = parsed.usage.prompt_tokens ?? 0
                completionTokens = parsed.usage.completion_tokens ?? 0
              }
            } catch {
              // 忽略解析错误
            }
          }
        }
      } finally {
        clearTimeout(timeoutId)
      }

      // 估算 token 数（如果API没有返回）
      if (promptTokens === 0) {
        promptTokens = this.estimateTokens(messages.map((m) => m.content).join(''))
      }
      if (completionTokens === 0) {
        completionTokens = this.estimateTokens(fullContent || reasoningBuffer)
      }

      this.usage.totalPromptTokens += promptTokens
      this.usage.totalCompletionTokens += completionTokens
      this.usage.totalRequests++

      // 正式回答为空时仅对非对话用途（Think 决策）用思考过程兜底；
      // 对话用途（skipReasoning=true）绝不回退思考内容，返回空由上层降级固定台词
      const finalContent = this.stripThinking(
        fullContent || (options?.skipReasoning ? '' : reasoningBuffer),
      )

      return {
        content: finalContent,
        model,
        usage: {
          promptTokens,
          completionTokens,
          totalTokens: promptTokens + completionTokens,
        },
        finishReason: 'stop',
      }
    } catch (err) {
      logger.error(`Stream error: ${(err as Error).message}`)
      throw err
    }
  }

  /**
   * 文本嵌入
   */
  async embed(text: string, model?: string): Promise<EmbeddingResponse> {
    const embedModel = model ?? this.embedModel
    const url = `${this.apiBase}/embeddings`

    const body = {
      model: embedModel,
      input: text,
    }

    const response = await this.request(url, body, this.maxRetries)

    const data = response.data?.[0]
    return {
      embedding: data?.embedding ?? [],
      model: embedModel,
      usage: {
        promptTokens: response.usage?.prompt_tokens ?? 0,
        totalTokens: response.usage?.total_tokens ?? 0,
      },
    }
  }

  /**
   * 是否已配置 API Key（调用方据此决定是否走 LLM 或回退固定台词）
   */
  isConfigured(): boolean {
    return Boolean(this.apiKey)
  }

  /**
   * 检查 API 是否可用
   */
  async healthCheck(): Promise<{ available: boolean; model: string }> {
    if (!this.apiKey) {
      return { available: false, model: this.defaultModel }
    }

    try {
      // 轻量级请求测试
      const response = await this.chat(
        [{ role: 'user', content: 'ping' }],
        { maxTokens: 5, temperature: 0 },
      )
      return { available: true, model: response.model }
    } catch {
      return { available: false, model: this.defaultModel }
    }
  }

  /**
   * 获取Token使用统计
   */
  getUsage(): TokenUsage & { estimatedCost: number } {
    // 估算费用（基于GPT-4o-mini定价）
    const costPerPromptToken = 0.00000015  // $0.15/1M tokens
    const costPerCompletionToken = 0.0000006 // $0.60/1M tokens
    const estimatedCost =
      this.usage.totalPromptTokens * costPerPromptToken +
      this.usage.totalCompletionTokens * costPerCompletionToken

    return { ...this.usage, estimatedCost }
  }

  /**
   * 构建请求头
   */
  private getHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.apiKey}`,
    }
  }

  /**
   * 发送请求（含重试）
   */
  private async request(url: string, body: unknown, retries: number): Promise<any> {
    let lastError: Error | null = null

    for (let i = 0; i < retries; i++) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: this.getHeaders(),
          body: JSON.stringify(body),
        })

        if (!response.ok) {
          const errorText = await response.text()
          // 429 Too Many Requests — 等待后重试
          if (response.status === 429 && i < retries - 1) {
            const waitTime = this.retryDelay * Math.pow(2, i)
            logger.warn(`Rate limited, retrying in ${waitTime}ms...`)
            await new Promise((r) => setTimeout(r, waitTime))
            continue
          }
          throw new Error(`API error ${response.status}: ${errorText}`)
        }

        return await response.json()
      } catch (err) {
        lastError = err as Error
        if (i < retries - 1) {
          const waitTime = this.retryDelay * Math.pow(2, i)
          logger.warn(`Request failed, retrying in ${waitTime}ms: ${lastError.message}`)
          await new Promise((r) => setTimeout(r, waitTime))
        }
      }
    }

    throw lastError ?? new Error('Request failed')
  }

  /**
   * 粗略估算 Token 数
   * 英文约 4 字符/token，中文约 2 字符/token
   */
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 3)
  }

  /**
   * 清洗思考类内容 — 剔除 <think> 块、思考代码块与常见推理前缀，只保留正式回答
   * DeepSeek 等推理模型可能把思考过程混入 content，这里统一兜底（含流式最终内容）
   */
  private stripThinking(raw: string): string {
    if (!raw) return ''
    let c = raw
    // <think>...</think> 与 ```think/thinking/reasoning``` 代码块
    c = c.replace(/<think>[\s\S]*?<\/think>/gi, '')
    c = c.replace(/```(?:think|thinking|reasoning)[\s\S]*?```/gi, '')
    // 行首的思考/分析前缀行（如 "思考：..."、"Thought: ..."）
    c = c.replace(/^(?:思考|思考过程|思考流程|分析|角色扮演分析|Thought|Thinking|Reasoning)[：:].*\n?/gi, '')
    // 去除残留 Markdown 强调符
    c = c.replace(/\*\*/g, '').replace(/\*/g, '')
    return c.trim()
  }

  /**
   * 更新配置（运行时切换模型等）
   */
  updateConfig(opts: { apiBase?: string; apiKey?: string; model?: string; embedModel?: string }): void {
    if (opts.apiBase) this.apiBase = opts.apiBase
    if (opts.apiKey) this.apiKey = opts.apiKey
    if (opts.model) this.defaultModel = opts.model
    if (opts.embedModel) this.embedModel = opts.embedModel
  }
}

/** 全局 LLM 服务实例 */
export const llmService = new LLMService()
