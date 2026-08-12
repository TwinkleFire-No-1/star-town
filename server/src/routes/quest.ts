// 星火小镇 — 任务引擎 API 路由
// T3.2.2 任务接受/放弃/完成/进度查询

import { Router, Request, Response } from 'express'
import { questEngine } from '../services/questEngine.js'
import { createLogger } from '../utils/index.js'

const logger = createLogger('QuestRoute')

export const questRouter = Router()

const p = (req: Request, key: string): string => {
  const val = req.params[key]
  return Array.isArray(val) ? val[0] : (val ?? '')
}

// ==========================================
// 任务引擎 API
// ==========================================

/** 获取所有任务定义 */
questRouter.get('/definitions', async (_req: Request, res: Response) => {
  try {
    const definitions = questEngine.getAllQuestDefinitions()
    res.json({ data: definitions })
  } catch (err) {
    logger.error(`GET /quest/definitions: ${(err as Error).message}`)
    res.status(500).json({ error: 'Failed to fetch quest definitions' })
  }
})

/** 获取单个任务定义 */
questRouter.get('/definitions/:id', async (req: Request, res: Response) => {
  try {
    const definition = questEngine.getQuestDefinition(p(req, 'id'))
    if (!definition) return res.status(404).json({ error: 'Quest not found' })
    res.json({ data: definition })
  } catch (err) {
    logger.error(`GET /quest/definitions/:id: ${(err as Error).message}`)
    res.status(500).json({ error: 'Failed to fetch quest definition' })
  }
})

/** 获取玩家所有任务进度 */
questRouter.get('/player/:playerId', async (req: Request, res: Response) => {
  try {
    const quests = await questEngine.getPlayerQuests(p(req, 'playerId'))
    res.json({ data: quests })
  } catch (err) {
    logger.error(`GET /quest/player/:playerId: ${(err as Error).message}`)
    res.status(500).json({ error: 'Failed to fetch player quests' })
  }
})

/** 获取玩家可接受的任务 */
questRouter.get('/player/:playerId/available', async (req: Request, res: Response) => {
  try {
    const available = await questEngine.getAvailableQuests(p(req, 'playerId'))
    res.json({ data: available })
  } catch (err) {
    logger.error(`GET /quest/player/:playerId/available: ${(err as Error).message}`)
    res.status(500).json({ error: 'Failed to fetch available quests' })
  }
})

/** 接受任务 */
questRouter.post('/player/:playerId/accept/:questId', async (req: Request, res: Response) => {
  try {
    const result = await questEngine.acceptQuest(p(req, 'playerId'), p(req, 'questId'))
    if (!result.success) return res.status(400).json({ error: result.message })
    res.status(201).json({ data: result.progress, message: result.message })
  } catch (err) {
    logger.error(`POST /quest/accept: ${(err as Error).message}`)
    res.status(500).json({ error: 'Failed to accept quest' })
  }
})

/** 放弃任务 */
questRouter.post('/player/:playerId/abandon/:questId', async (req: Request, res: Response) => {
  try {
    const result = await questEngine.abandonQuest(p(req, 'playerId'), p(req, 'questId'))
    if (!result.success) return res.status(400).json({ error: result.message })
    res.json({ success: true, message: result.message })
  } catch (err) {
    logger.error(`POST /quest/abandon: ${(err as Error).message}`)
    res.status(500).json({ error: 'Failed to abandon quest' })
  }
})

/** 更新任务进度 */
questRouter.post('/player/:playerId/progress/:questId/:objectiveId', async (req: Request, res: Response) => {
  try {
    const { increment } = req.body
    const result = await questEngine.updateQuestProgress(
      p(req, 'playerId'),
      p(req, 'questId'),
      p(req, 'objectiveId'),
      increment ?? 1,
    )
    if (!result.success) return res.status(400).json({ error: result.message })
    res.json({ success: true, message: result.message, completed: result.completed })
  } catch (err) {
    logger.error(`POST /quest/progress: ${(err as Error).message}`)
    res.status(500).json({ error: 'Failed to update quest progress' })
  }
})

/** 完成任务 */
questRouter.post('/player/:playerId/complete/:questId', async (req: Request, res: Response) => {
  try {
    const result = await questEngine.completeQuest(p(req, 'playerId'), p(req, 'questId'))
    if (!result.success) return res.status(400).json({ error: result.message })
    res.json({ success: true, message: result.message })
  } catch (err) {
    logger.error(`POST /quest/complete: ${(err as Error).message}`)
    res.status(500).json({ error: 'Failed to complete quest' })
  }
})

/** 手动触发任务发现 */
questRouter.post('/discover/:playerId', async (req: Request, res: Response) => {
  try {
    const available = await questEngine.discoverAvailableQuests(p(req, 'playerId'))
    res.json({ data: available })
  } catch (err) {
    logger.error(`POST /quest/discover: ${(err as Error).message}`)
    res.status(500).json({ error: 'Failed to discover quests' })
  }
})

/** 触发：与NPC对话（推进任务） */
questRouter.post('/trigger/npc-talk', async (req: Request, res: Response) => {
  try {
    const { playerId, npcId } = req.body
    await questEngine.triggerNpcTalk(playerId, npcId)
    res.json({ success: true })
  } catch (err) {
    logger.error(`POST /quest/trigger/npc-talk: ${(err as Error).message}`)
    res.status(500).json({ error: 'Failed to trigger npc talk' })
  }
})

/** 触发：进入区域（推进任务） */
questRouter.post('/trigger/area-enter', async (req: Request, res: Response) => {
  try {
    const { playerId, areaName } = req.body
    await questEngine.triggerAreaEnter(playerId, areaName)
    res.json({ success: true })
  } catch (err) {
    logger.error(`POST /quest/trigger/area-enter: ${(err as Error).message}`)
    res.status(500).json({ error: 'Failed to trigger area enter' })
  }
})

/** 获取任务引擎统计 */
questRouter.get('/stats', async (_req: Request, res: Response) => {
  try {
    res.json({ data: questEngine.getStats() })
  } catch (err) {
    logger.error(`GET /quest/stats: ${(err as Error).message}`)
    res.status(500).json({ error: 'Failed to fetch quest stats' })
  }
})
