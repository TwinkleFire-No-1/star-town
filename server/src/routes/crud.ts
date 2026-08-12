import { Router, Request, Response } from 'express'
import { prisma } from '../models/prisma.js'
import { createLogger } from '../utils/index.js'
import { relationNetwork } from '../services/relationNetwork.js'
import { profileLoader } from '../services/profileLoader.js'
import { ambientNpcService } from '../services/ambientNpcService.js'
import { ambientCatService } from '../services/ambientCatService.js'
import { ambientDialogueService } from '../services/ambientDialogueService.js'

const logger = createLogger('CRUD')

/** Express 5 req.params 类型安全提取 */
const p = (req: Request, key: string): string => {
  const val = req.params[key]
  return Array.isArray(val) ? val[0] : (val ?? '')
}

export const crudRouter = Router()

// ==========================================
// 玩家 API
// ==========================================

crudRouter.get('/players', async (_req: Request, res: Response) => {
  try {
    const players = await prisma.player.findMany({
      select: { id: true, name: true, hp: true, maxHp: true, x: true, y: true, direction: true, starCoins: true, gameDay: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    })
    res.json({ data: players })
  } catch (err) {
    logger.error(`GET /players: ${(err as Error).message}`)
    res.status(500).json({ error: 'Failed to fetch players' })
  }
})

crudRouter.get('/players/:id', async (req: Request, res: Response) => {
  try {
    const player = await prisma.player.findUnique({
      where: { id: p(req, 'id') },
      include: { inventory: { include: { item: true } }, memories: true, quests: { include: { quest: true } }, relations: true },
    })
    if (!player) return res.status(404).json({ error: 'Player not found' })
    res.json({ data: player })
  } catch (err) {
    logger.error(`GET /players/:id: ${(err as Error).message}`)
    res.status(500).json({ error: 'Failed to fetch player' })
  }
})

crudRouter.post('/players', async (req: Request, res: Response) => {
  try {
    const { name, hp, maxHp, sp, maxSp, attack, defense, speed } = req.body
    const player = await prisma.player.create({
      data: { name, hp: hp ?? 100, maxHp: maxHp ?? 100, sp: sp ?? 50, maxSp: maxSp ?? 50, attack: attack ?? 10, defense: defense ?? 5, speed: speed ?? 10 },
    })
    logger.info(`Player created: ${name}`)
    res.status(201).json({ data: player })
  } catch (err) {
    logger.error(`POST /players: ${(err as Error).message}`)
    res.status(500).json({ error: 'Failed to create player' })
  }
})

crudRouter.patch('/players/:id', async (req: Request, res: Response) => {
  try {
    const { name, hp, sp, x, y, direction, starCoins, gameDay } = req.body
    const player = await prisma.player.update({
      where: { id: p(req, 'id') },
      data: {
        ...(name !== undefined && { name }),
        ...(hp !== undefined && { hp }),
        ...(sp !== undefined && { sp }),
        ...(x !== undefined && { x }),
        ...(y !== undefined && { y }),
        ...(direction !== undefined && { direction }),
        ...(starCoins !== undefined && { starCoins }),
        ...(gameDay !== undefined && { gameDay }),
      },
    })
    res.json({ data: player })
  } catch (err) {
    if ((err as any).code === 'P2025') return res.status(404).json({ error: 'Player not found' })
    logger.error(`PATCH /players/:id: ${(err as Error).message}`)
    res.status(500).json({ error: 'Failed to update player' })
  }
})

crudRouter.delete('/players/:id', async (req: Request, res: Response) => {
  try {
    await prisma.player.delete({ where: { id: p(req, 'id') } })
    res.json({ success: true })
  } catch (err) {
    if ((err as any).code === 'P2025') return res.status(404).json({ error: 'Player not found' })
    logger.error(`DELETE /players/:id: ${(err as Error).message}`)
    res.status(500).json({ error: 'Failed to delete player' })
  }
})

// ==========================================
// NPC API
// ==========================================

crudRouter.get('/npcs', async (_req: Request, res: Response) => {
  try {
    const npcs = await prisma.nPC.findMany({ orderBy: { name: 'asc' } })
    res.json({ data: npcs })
  } catch (err) {
    logger.error(`GET /npcs: ${(err as Error).message}`)
    res.status(500).json({ error: 'Failed to fetch NPCs' })
  }
})

// 普通NPC（路人）列表 — 固定台词、复用美术资源、本地漫游，不接入Agent/LLM
// 支持 ?scene=blacksmith 按场景过滤（室内氛围NPC）
crudRouter.get('/npcs/ambient', (req: Request, res: Response) => {
  const scene = typeof req.query.scene === 'string' ? req.query.scene : ''
  if (scene) {
    res.json({ data: ambientNpcService.getByScene(scene) })
  } else {
    res.json({ data: ambientNpcService.getAll() })
  }
})

// 普通NPC（路人）头顶气泡台词 — LLM生成（台词池轮换不重复，失败回退预设）
crudRouter.get('/npcs/ambient/:id/bubble', async (req: Request, res: Response) => {
  const id = p(req, 'id')
  if (!ambientNpcService.isAmbientNpc(id) || !ambientNpcService.getById(id)) {
    return res.status(404).json({ error: 'Ambient NPC not found' })
  }
  try {
    const line = await ambientDialogueService.generateBubble(id)
    res.json({ data: { id, line } })
  } catch (err) {
    logger.error(`GET /npcs/ambient/:id/bubble: ${(err as Error).message}`)
    res.status(500).json({ error: 'Failed to generate bubble' })
  }
})

// 猫咪列表 — 小镇随机出现的猫咪（小橘/小狸花），不参与主线剧情，不加模型
crudRouter.get('/npcs/cats', (_req: Request, res: Response) => {
  res.json({ data: ambientCatService.getAll() })
})

crudRouter.get('/npcs/:id', async (req: Request, res: Response) => {
  try {
    const npc = await prisma.nPC.findUnique({
      where: { id: p(req, 'id') },
      include: { memories: { where: { archived: false }, orderBy: { createdAt: 'desc' }, take: 20 }, relationsAsSource: true, relationsAsTarget: true },
    })
    if (!npc) return res.status(404).json({ error: 'NPC not found' })
    res.json({ data: npc })
  } catch (err) {
    logger.error(`GET /npcs/:id: ${(err as Error).message}`)
    res.status(500).json({ error: 'Failed to fetch NPC' })
  }
})

crudRouter.patch('/npcs/:id', async (req: Request, res: Response) => {
  try {
    const { x, y, direction, isActive, personality } = req.body
    const npc = await prisma.nPC.update({
      where: { id: p(req, 'id') },
      data: {
        ...(x !== undefined && { x }),
        ...(y !== undefined && { y }),
        ...(direction !== undefined && { direction }),
        ...(isActive !== undefined && { isActive }),
        ...(personality !== undefined && { personality }),
      },
    })
    res.json({ data: npc })
  } catch (err) {
    if ((err as any).code === 'P2025') return res.status(404).json({ error: 'NPC not found' })
    logger.error(`PATCH /npcs/:id: ${(err as Error).message}`)
    res.status(500).json({ error: 'Failed to update NPC' })
  }
})

// ==========================================
// 任务 API
// ==========================================

crudRouter.get('/quests', async (_req: Request, res: Response) => {
  try {
    const quests = await prisma.quest.findMany({ orderBy: [{ chapter: 'asc' }, { createdAt: 'asc' }] })
    res.json({ data: quests })
  } catch (err) {
    logger.error(`GET /quests: ${(err as Error).message}`)
    res.status(500).json({ error: 'Failed to fetch quests' })
  }
})

crudRouter.post('/quests', async (req: Request, res: Response) => {
  try {
    const { title, description, type, chapter, triggerCond, completeCond, rewardExp, rewardCoins } = req.body
    const quest = await prisma.quest.create({
      data: { title, description: description ?? '', type: type ?? 'side', chapter: chapter ?? 0, triggerCond: triggerCond ?? {}, completeCond: completeCond ?? {}, rewardExp: rewardExp ?? 0, rewardCoins: rewardCoins ?? 0 },
    })
    logger.info(`Quest created: ${title}`)
    res.status(201).json({ data: quest })
  } catch (err) {
    logger.error(`POST /quests: ${(err as Error).message}`)
    res.status(500).json({ error: 'Failed to create quest' })
  }
})

crudRouter.patch('/quests/:id', async (req: Request, res: Response) => {
  try {
    const quest = await prisma.quest.update({ where: { id: p(req, 'id') }, data: req.body })
    res.json({ data: quest })
  } catch (err) {
    if ((err as any).code === 'P2025') return res.status(404).json({ error: 'Quest not found' })
    logger.error(`PATCH /quests/:id: ${(err as Error).message}`)
    res.status(500).json({ error: 'Failed to update quest' })
  }
})

// ==========================================
// 物品 API
// ==========================================

crudRouter.get('/items', async (_req: Request, res: Response) => {
  try {
    const items = await prisma.item.findMany({ orderBy: { category: 'asc' } })
    res.json({ data: items })
  } catch (err) {
    logger.error(`GET /items: ${(err as Error).message}`)
    res.status(500).json({ error: 'Failed to fetch items' })
  }
})

crudRouter.post('/items', async (req: Request, res: Response) => {
  try {
    const item = await prisma.item.create({ data: req.body })
    logger.info(`Item created: ${req.body.name}`)
    res.status(201).json({ data: item })
  } catch (err) {
    logger.error(`POST /items: ${(err as Error).message}`)
    res.status(500).json({ error: 'Failed to create item' })
  }
})

// ==========================================
// 关系 API
// ==========================================

crudRouter.get('/relations/player/:playerId', async (req: Request, res: Response) => {
  try {
    const relations = await prisma.playerRelation.findMany({ where: { playerId: p(req, 'playerId') } })
    res.json({ data: relations })
  } catch (err) {
    logger.error(`GET /relations/player/:playerId: ${(err as Error).message}`)
    res.status(500).json({ error: 'Failed to fetch relations' })
  }
})

crudRouter.get('/relations/npc', async (_req: Request, res: Response) => {
  try {
    // 优先使用关系网络缓存
    if (relationNetwork.isInitialized) {
      const stats = relationNetwork.getNetworkStats()
      // 从关系网络获取所有NPC ID并遍历关系
      const allNpcIds = profileLoader.getAllProfiles().map((p) => p.id)
      const allRelations: any[] = []
      for (const npcId of allNpcIds) {
        allRelations.push(...relationNetwork.getNpcRelations(npcId))
      }
      res.json({ data: { stats, relations: allRelations, relationCount: allRelations.length } })
    } else {
      const relations = await prisma.nPCRelation.findMany()
      res.json({ data: relations })
    }
  } catch (err) {
    logger.error(`GET /relations/npc: ${(err as Error).message}`)
    res.status(500).json({ error: 'Failed to fetch NPC relations' })
  }
})

// 获取指定NPC的关系详情（使用关系网络缓存）
crudRouter.get('/relations/npc/:npcId', async (req: Request, res: Response) => {
  try {
    const npcId = p(req, 'npcId')
    if (relationNetwork.isInitialized) {
      const relations = relationNetwork.getNpcRelations(npcId)
      const metrics = relationNetwork.getNpcSocialMetrics(npcId)
      res.json({ data: { relations, metrics } })
    } else {
      // 兜底查数据库
      const relations = await prisma.nPCRelation.findMany({
        where: { OR: [{ sourceNpcId: npcId }, { targetNpcId: npcId }] },
      })
      res.json({ data: { relations, metrics: null } })
    }
  } catch (err) {
    logger.error(`GET /relations/npc/:npcId: ${(err as Error).message}`)
    res.status(500).json({ error: 'Failed to fetch NPC relation details' })
  }
})

// 获取关系网络统计
crudRouter.get('/relations/stats', async (_req: Request, res: Response) => {
  try {
    if (relationNetwork.isInitialized) {
      const stats = relationNetwork.getNetworkStats()
      res.json({ data: stats })
    } else {
      res.json({ data: null, message: 'Relation network not initialized' })
    }
  } catch (err) {
    logger.error(`GET /relations/stats: ${(err as Error).message}`)
    res.status(500).json({ error: 'Failed to fetch relation stats' })
  }
})

crudRouter.patch('/relations/player/:playerId/:npcId', async (req: Request, res: Response) => {
  try {
    const { affection, trust, reputation } = req.body
    const relation = await prisma.playerRelation.update({
      where: { playerId_npcId: { playerId: p(req, 'playerId'), npcId: p(req, 'npcId') } },
      data: {
        ...(affection !== undefined && { affection }),
        ...(trust !== undefined && { trust }),
        ...(reputation !== undefined && { reputation }),
      },
    })
    res.json({ data: relation })
  } catch (err) {
    if ((err as any).code === 'P2025') return res.status(404).json({ error: 'Relation not found' })
    logger.error(`PATCH /relations: ${(err as Error).message}`)
    res.status(500).json({ error: 'Failed to update relation' })
  }
})

// ==========================================
// 玩家背包 API
// ==========================================

crudRouter.get('/players/:id/inventory', async (req: Request, res: Response) => {
  try {
    const inventory = await prisma.playerItem.findMany({ where: { playerId: p(req, 'id') }, include: { item: true } })
    res.json({ data: inventory })
  } catch (err) {
    logger.error(`GET /players/:id/inventory: ${(err as Error).message}`)
    res.status(500).json({ error: 'Failed to fetch inventory' })
  }
})

crudRouter.post('/players/:id/inventory', async (req: Request, res: Response) => {
  try {
    const { itemId, quantity } = req.body
    const playerItem = await prisma.playerItem.upsert({
      where: { playerId_itemId: { playerId: p(req, 'id'), itemId } },
      create: { playerId: p(req, 'id'), itemId, quantity: quantity ?? 1 },
      update: { quantity: { increment: quantity ?? 1 } },
    })
    res.status(201).json({ data: playerItem })
  } catch (err) {
    logger.error(`POST /players/:id/inventory: ${(err as Error).message}`)
    res.status(500).json({ error: 'Failed to add item' })
  }
})
