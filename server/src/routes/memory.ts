import { Router, Request, Response } from 'express'
import { prisma } from '../models/prisma.js'
import { embeddingService } from '../services/embeddingService.js'
import { createLogger } from '../utils/index.js'

const logger = createLogger('MemoryAPI')

/** Express 5 req.params 类型安全提取 */
const p = (req: Request, key: string): string => {
  const val = req.params[key]
  return Array.isArray(val) ? val[0] : (val ?? '')
}

export const memoryRouter = Router()

// ==========================================
// NPC 记忆 API
// ==========================================

memoryRouter.get('/npc/:npcId', async (req: Request, res: Response) => {
  try {
    const { type, limit, archived } = req.query
    const where: any = { npcId: p(req, 'npcId') }

    if (type) where.type = type
    if (archived !== undefined) {
      where.archived = archived === 'true'
    } else {
      where.archived = false
    }

    const memories = await prisma.nPCMemory.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit ? parseInt(String(limit)) : 50,
    })
    res.json({ data: memories })
  } catch (err) {
    logger.error(`GET /memories/npc/:npcId: ${(err as Error).message}`)
    res.status(500).json({ error: 'Failed to fetch memories' })
  }
})

memoryRouter.post('/npc/:npcId', async (req: Request, res: Response) => {
  try {
    const { type, content, importance, context } = req.body
    const npcId = p(req, 'npcId')

    const npc = await prisma.nPC.findUnique({ where: { id: npcId } })
    if (!npc) return res.status(404).json({ error: 'NPC not found' })

    // 检查记忆容量（500条上限）
    const count = await prisma.nPCMemory.count({ where: { npcId, archived: false } })
    if (count >= 500) {
      const toArchive = await prisma.nPCMemory.findMany({
        where: { npcId, archived: false },
        orderBy: { importance: 'asc' },
        take: 1,
      })
      if (toArchive.length > 0) {
        await prisma.nPCMemory.update({ where: { id: toArchive[0].id }, data: { archived: true } })
      }
    }

    const memory = await prisma.nPCMemory.create({
      data: { npcId, type: type ?? 'observation', content, importance: importance ?? 5, context: context ?? {} } as any,
    })

    logger.info(`Memory created for NPC ${npc.name}: ${type}`)
    res.status(201).json({ data: memory })
  } catch (err) {
    logger.error(`POST /memories/npc/:npcId: ${(err as Error).message}`)
    res.status(500).json({ error: 'Failed to create memory' })
  }
})

memoryRouter.get('/npc/:npcId/search', async (req: Request, res: Response) => {
  try {
    const { query, limit, type, useVector, alpha, beta, gamma } = req.query
    const npcId = p(req, 'npcId')
    const searchLimit = limit ? parseInt(String(limit)) : 10

    if (!query) return res.status(400).json({ error: 'query parameter is required' })

    // 优先使用向量检索（除非显式指定 useVector=false）
    if (useVector !== 'false') {
      try {
        const results = await embeddingService.hybridSearch({
          query: String(query),
          npcId,
          limit: searchLimit,
          minSimilarity: 0.3,
          type: type ? String(type) : undefined,
          alpha: alpha ? parseFloat(String(alpha)) : undefined,
          beta: beta ? parseFloat(String(beta)) : undefined,
          gamma: gamma ? parseFloat(String(gamma)) : undefined,
        })
        res.json({ data: results, mode: 'vector' })
        return
      } catch (err) {
        logger.warn(`Vector search failed, falling back to text search: ${(err as Error).message}`)
      }
    }

    // 降级到文本搜索
    const where: any = { npcId, archived: false, content: { contains: String(query), mode: 'insensitive' } }
    if (type) where.type = String(type)

    const memories = await prisma.nPCMemory.findMany({
      where,
      orderBy: [{ importance: 'desc' }, { createdAt: 'desc' }],
      take: searchLimit,
    })

    res.json({ data: memories, mode: 'text' })
  } catch (err) {
    logger.error(`GET /memories/npc/:npcId/search: ${(err as Error).message}`)
    res.status(500).json({ error: 'Failed to search memories' })
  }
})

memoryRouter.patch('/npc/:npcId/:memoryId', async (req: Request, res: Response) => {
  try {
    const { importance, archived, accessedAt } = req.body
    const memory = await prisma.nPCMemory.update({
      where: { id: p(req, 'memoryId') },
      data: {
        ...(importance !== undefined && { importance }),
        ...(archived !== undefined && { archived }),
        ...(accessedAt !== undefined && { accessedAt: new Date(accessedAt) }),
      },
    })
    res.json({ data: memory })
  } catch (err) {
    if ((err as any).code === 'P2025') return res.status(404).json({ error: 'Memory not found' })
    logger.error(`PATCH /memories/npc/:npcId/:memoryId: ${(err as Error).message}`)
    res.status(500).json({ error: 'Failed to update memory' })
  }
})

memoryRouter.delete('/npc/:npcId/:memoryId', async (req: Request, res: Response) => {
  try {
    await prisma.nPCMemory.delete({ where: { id: p(req, 'memoryId') } })
    res.json({ success: true })
  } catch (err) {
    if ((err as any).code === 'P2025') return res.status(404).json({ error: 'Memory not found' })
    logger.error(`DELETE /memories/npc/:npcId/:memoryId: ${(err as Error).message}`)
    res.status(500).json({ error: 'Failed to delete memory' })
  }
})

// ==========================================
// NPC 记忆反思 API
// ==========================================

memoryRouter.post('/npc/:npcId/reflect', async (req: Request, res: Response) => {
  try {
    const npcId = p(req, 'npcId')
    const npc = await prisma.nPC.findUnique({ where: { id: npcId } })
    if (!npc) return res.status(404).json({ error: 'NPC not found' })

    const lowImportanceMemories = await prisma.nPCMemory.findMany({
      where: { npcId, archived: false, importance: { lte: 3 }, type: { in: ['observation', 'dialogue'] } },
      orderBy: { createdAt: 'asc' },
      take: 10,
    })

    if (lowImportanceMemories.length === 0) return res.json({ data: { message: 'No memories to reflect on' } })

    const summary = lowImportanceMemories.map((m) => `[${m.type}] ${m.content}`).join(' | ')

    const reflection = await prisma.nPCMemory.create({
      data: { npcId, type: 'reflection', content: `反思：${summary.substring(0, 500)}`, importance: 7, context: { sourceMemoryIds: lowImportanceMemories.map((m) => m.id) } },
    })

    await prisma.nPCMemory.updateMany({
      where: { id: { in: lowImportanceMemories.map((m) => m.id) } },
      data: { archived: true },
    })

    logger.info(`Reflection created for NPC ${npc.name}`)
    res.status(201).json({ data: reflection })
  } catch (err) {
    logger.error(`POST /memories/npc/:npcId/reflect: ${(err as Error).message}`)
    res.status(500).json({ error: 'Failed to create reflection' })
  }
})

// ==========================================
// 玩家记忆 API
// ==========================================

memoryRouter.get('/player/:playerId', async (req: Request, res: Response) => {
  try {
    const memories = await prisma.playerMemory.findMany({
      where: { playerId: p(req, 'playerId') },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
    res.json({ data: memories })
  } catch (err) {
    logger.error(`GET /memories/player/:playerId: ${(err as Error).message}`)
    res.status(500).json({ error: 'Failed to fetch player memories' })
  }
})

memoryRouter.post('/player/:playerId', async (req: Request, res: Response) => {
  try {
    const { npcId, content, type } = req.body
    const memory = await prisma.playerMemory.create({
      data: { playerId: p(req, 'playerId'), npcId: npcId ?? null, content, type: type ?? 'general' },
    })
    res.status(201).json({ data: memory })
  } catch (err) {
    logger.error(`POST /memories/player/:playerId: ${(err as Error).message}`)
    res.status(500).json({ error: 'Failed to create player memory' })
  }
})

// ==========================================
// 嵌入管理 API
// ==========================================

/** 批量嵌入 — 为未嵌入的记忆生成向量 */
memoryRouter.post('/embed/batch', async (_req: Request, res: Response) => {
  try {
    const progress = await embeddingService.batchEmbed()
    res.json({ data: progress })
  } catch (err) {
    logger.error(`POST /memories/embed/batch: ${(err as Error).message}`)
    res.status(500).json({ error: 'Failed to run batch embedding' })
  }
})

/** 嵌入统计 */
memoryRouter.get('/embed/stats', async (_req: Request, res: Response) => {
  try {
    const stats = await embeddingService.getEmbeddingStats()
    res.json({ data: stats })
  } catch (err) {
    logger.error(`GET /memories/embed/stats: ${(err as Error).message}`)
    res.status(500).json({ error: 'Failed to get embedding stats' })
  }
})
