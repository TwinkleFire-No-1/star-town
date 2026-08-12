import { Router, Request, Response } from 'express'
import { llmService } from '../services/llmService.js'
import { modelRouter } from '../services/modelRouter.js'
import { fallbackStrategy } from '../services/fallbackStrategy.js'
import { rateLimiter } from '../services/rateLimiter.js'
import { llmCacheService } from '../services/llmCacheService.js'
import { latencyOptimizer } from '../services/latencyOptimizer.js'
import { npcScheduler } from '../services/npcScheduler.js'
import { createLogger } from '../utils/index.js'

const logger = createLogger('LLMRoute')

/**
 * LLM API 路由 — 提供前端可调用的 LLM 接口
 *
 * 路由：
 * - POST /api/llm/chat      非流式聊天
 * - POST /api/llm/chat/stream  流式聊天（SSE）
 * - POST /api/llm/embed      文本嵌入
 * - GET  /api/llm/health     健康检查
 * - GET  /api/llm/usage      使用统计
 */
export const llmRouter = Router()

/** POST /api/llm/chat — 非流式聊天 */
llmRouter.post('/chat', async (req: Request, res: Response) => {
  try {
    const { messages, model, temperature, maxTokens } = req.body

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'messages is required and must be an array' })
    }

    // 速率限制检查
    const callerId = (req as any).user?.id ?? req.ip ?? 'anonymous'
    const rateCheck = rateLimiter.canProceed(callerId)
    if (!rateCheck.allowed) {
      return res.status(429).json({
        error: 'Rate limit exceeded',
        reason: rateCheck.reason,
        retryAfter: Math.ceil((rateCheck.waitMs ?? 1000) / 1000),
      })
    }

    const result = await llmService.chat(messages, {
      model,
      temperature,
      maxTokens,
    })

    // 记录 Token 用量
    rateLimiter.recordUsage(callerId, result.model, result.usage.promptTokens, result.usage.completionTokens)

    res.json({ data: result })
  } catch (err) {
    logger.error(`POST /llm/chat: ${(err as Error).message}`)
    res.status(500).json({ error: 'LLM request failed', detail: (err as Error).message })
  }
})

/** POST /api/llm/chat/stream — 流式聊天（SSE） */
llmRouter.post('/chat/stream', async (req: Request, res: Response) => {
  try {
    const { messages, model, temperature, maxTokens } = req.body

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'messages is required and must be an array' })
    }

    // 速率限制检查
    const callerId = (req as any).user?.id ?? req.ip ?? 'anonymous'
    const rateCheck = rateLimiter.canProceed(callerId)
    if (!rateCheck.allowed) {
      return res.status(429).json({
        error: 'Rate limit exceeded',
        reason: rateCheck.reason,
        retryAfter: Math.ceil((rateCheck.waitMs ?? 1000) / 1000),
      })
    }

    // 设置 SSE 头
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')

    // 流式输出
    const result = await llmService.chatStream(
      messages,
      (chunk: string) => {
        res.write(`data: ${JSON.stringify({ chunk })}\n\n`)
      },
      { model, temperature, maxTokens },
    )

    // 记录 Token 用量
    rateLimiter.recordUsage(callerId, result.model, result.usage.promptTokens, result.usage.completionTokens)

    // 发送完成事件
    res.write(`data: ${JSON.stringify({ done: true, usage: result.usage })}\n\n`)
    res.end()
  } catch (err) {
    logger.error(`POST /llm/chat/stream: ${(err as Error).message}`)
    res.write(`data: ${JSON.stringify({ error: (err as Error).message })}\n\n`)
    res.end()
  }
})

/** POST /api/llm/embed — 文本嵌入 */
llmRouter.post('/embed', async (req: Request, res: Response) => {
  try {
    const { text, model } = req.body

    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'text is required and must be a string' })
    }

    // 速率限制检查
    const callerId = (req as any).user?.id ?? req.ip ?? 'anonymous'
    const rateCheck = rateLimiter.canProceed(callerId)
    if (!rateCheck.allowed) {
      return res.status(429).json({
        error: 'Rate limit exceeded',
        reason: rateCheck.reason,
        retryAfter: Math.ceil((rateCheck.waitMs ?? 1000) / 1000),
      })
    }

    const result = await llmService.embed(text, model)
    res.json({ data: result })
  } catch (err) {
    logger.error(`POST /llm/embed: ${(err as Error).message}`)
    res.status(500).json({ error: 'Embedding request failed', detail: (err as Error).message })
  }
})

/** GET /api/llm/health — 健康检查 */
llmRouter.get('/health', async (_req: Request, res: Response) => {
  const health = await llmService.healthCheck()
  res.json({ data: health })
})

/** GET /api/llm/usage — 使用统计 */
llmRouter.get('/usage', (_req: Request, res: Response) => {
  const usage = llmService.getUsage()
  res.json({ data: usage })
})

/** GET /api/llm/routes — 模型路由表 */
llmRouter.get('/routes', (_req: Request, res: Response) => {
  const routingTable = modelRouter.getRoutingTable()
  res.json({ data: routingTable })
})

/** POST /api/llm/routes/health — 模型健康检查 */
llmRouter.post('/routes/health', async (_req: Request, res: Response) => {
  try {
    const health = await modelRouter.checkHealth()
    res.json({ data: health })
  } catch (err) {
    logger.error(`POST /llm/routes/health: ${(err as Error).message}`)
    res.status(500).json({ error: 'Health check failed', detail: (err as Error).message })
  }
})

/** PUT /api/llm/routes/availability — 设置模型可用性 */
llmRouter.put('/routes/availability', (req: Request, res: Response) => {
  const { modelId, available } = req.body
  if (!modelId || typeof available !== 'boolean') {
    return res.status(400).json({ error: 'modelId and available (boolean) are required' })
  }
  modelRouter.setModelAvailability(modelId, available)
  res.json({ data: { modelId, available } })
})

/** GET /api/llm/fallback/stats — 降级策略统计 */
llmRouter.get('/fallback/stats', (_req: Request, res: Response) => {
  const stats = fallbackStrategy.getStats()
  res.json({ data: stats })
})

/** GET /api/llm/rate-limit/stats — 速率限制统计 */
llmRouter.get('/rate-limit/stats', (_req: Request, res: Response) => {
  const stats = rateLimiter.getStats()
  res.json({ data: stats })
})

/** GET /api/llm/cache/stats — 缓存统计 */
llmRouter.get('/cache/stats', (_req: Request, res: Response) => {
  const stats = llmCacheService.getStats()
  res.json({ data: stats })
})

/** PUT /api/llm/cache/config — 更新缓存配置 */
llmRouter.put('/cache/config', (req: Request, res: Response) => {
  llmCacheService.updateConfig(req.body)
  res.json({ data: llmCacheService.getConfig() })
})

/** POST /api/llm/cache/warmup — 预热缓存 */
llmRouter.post('/cache/warmup', (req: Request, res: Response) => {
  const { entries } = req.body
  if (!Array.isArray(entries)) {
    return res.status(400).json({ error: 'entries must be an array' })
  }
  llmCacheService.warmup(entries)
  res.json({ data: { warmed: entries.length } })
})

/** GET /api/llm/latency/stats — 延迟优化统计 */
llmRouter.get('/latency/stats', (_req: Request, res: Response) => {
  const stats = latencyOptimizer.getStats()
  res.json({ data: stats })
})

/** GET /api/llm/scheduler/stats — 调度器统计 */
llmRouter.get('/scheduler/stats', (_req: Request, res: Response) => {
  const stats = npcScheduler.getStats()
  res.json({ data: stats })
})
