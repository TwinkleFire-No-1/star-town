// 星火小镇 — 全链路联调 API 路由
// T5.1.1 前后端全链路联调 + T5.1.2 主线剧情走查 + T5.1.3 数据一致性验证 + T5.1.4 边界情况处理

import { Router, Request, Response } from 'express'
import { storyProgressionManager } from '../services/storyProgressionManager.js'
import { dataConsistencyValidator } from '../services/dataConsistencyValidator.js'
import { edgeCaseHandler } from '../services/edgeCaseHandler.js'
import { computeUnlockState } from '../services/storyUnlockService.js'
import { createLogger } from '../utils/index.js'

const logger = createLogger('IntegrationRoute')

export const integrationRouter = Router()

const p = (req: Request, key: string): string => {
  const val = req.params[key]
  return Array.isArray(val) ? val[0] : (val ?? '')
}

// ==========================================
// T5.1.1 全链路联调
// ==========================================

/** 运行全链路联调测试 */
integrationRouter.post('/integration-test/:playerId', async (req: Request, res: Response) => {
  try {
    const playerId = p(req, 'playerId')
    const result = await storyProgressionManager.runIntegrationTest(playerId)
    res.json({ data: result })
  } catch (err) {
    logger.error(`POST /integration-test: ${(err as Error).message}`)
    res.status(500).json({ error: 'Failed to run integration test' })
  }
})

/** 触发剧情场景 */
integrationRouter.post('/trigger-scene', async (req: Request, res: Response) => {
  try {
    const { playerId, triggerType, npcId, areaId, questId, customTriggerId } = req.body
    const result = await storyProgressionManager.triggerScene({
      playerId,
      triggerType,
      npcId,
      areaId,
      questId,
      customTriggerId,
    })
    res.json({ data: result })
  } catch (err) {
    logger.error(`POST /trigger-scene: ${(err as Error).message}`)
    res.status(500).json({ error: 'Failed to trigger scene' })
  }
})

/** 获取玩家剧情进度 */
integrationRouter.get('/story-progress/:playerId', async (req: Request, res: Response) => {
  try {
    const progress = await storyProgressionManager.getPlayerProgress(p(req, 'playerId'))
    res.json({ data: progress })
  } catch (err) {
    logger.error(`GET /story-progress: ${(err as Error).message}`)
    res.status(500).json({ error: 'Failed to fetch story progress' })
  }
})

/** 获取章节信息 */
integrationRouter.get('/chapters', async (_req: Request, res: Response) => {
  try {
    const chapters = storyProgressionManager.getChapterInfo()
    const endings = storyProgressionManager.getEndings()
    res.json({ data: { chapters, endings } })
  } catch (err) {
    logger.error(`GET /chapters: ${(err as Error).message}`)
    res.status(500).json({ error: 'Failed to fetch chapter info' })
  }
})

/** 获取玩家解锁状态（场景/NPC 随剧情推进逐步可见） */
integrationRouter.get('/unlock-state/:playerId', async (req: Request, res: Response) => {
  try {
    const progress = await storyProgressionManager.getPlayerProgress(p(req, 'playerId'))
    const state = computeUnlockState(progress)
    res.json({ data: state })
  } catch (err) {
    logger.error(`GET /unlock-state: ${(err as Error).message}`)
    res.status(500).json({ error: 'Failed to fetch unlock state' })
  }
})

// ==========================================
// T5.1.2 主线剧情走查
// ==========================================

/** 运行主线走查 */
integrationRouter.get('/story-walkthrough', async (_req: Request, res: Response) => {
  try {
    const result = await storyProgressionManager.runStoryWalkthrough()
    res.json({ data: result })
  } catch (err) {
    logger.error(`GET /story-walkthrough: ${(err as Error).message}`)
    res.status(500).json({ error: 'Failed to run story walkthrough' })
  }
})

// ==========================================
// T5.1.3 数据一致性验证
// ==========================================

/** 运行数据一致性检查 */
integrationRouter.get('/consistency-check', async (_req: Request, res: Response) => {
  try {
    const report = await dataConsistencyValidator.runAllChecks()
    res.json({ data: report })
  } catch (err) {
    logger.error(`GET /consistency-check: ${(err as Error).message}`)
    res.status(500).json({ error: 'Failed to run consistency check' })
  }
})

/** 修复数据不一致 */
integrationRouter.post('/consistency-fix', async (_req: Request, res: Response) => {
  try {
    const result = await dataConsistencyValidator.fixInconsistencies()
    res.json({ data: result })
  } catch (err) {
    logger.error(`POST /consistency-fix: ${(err as Error).message}`)
    res.status(500).json({ error: 'Failed to fix inconsistencies' })
  }
})

// ==========================================
// T5.1.4 边界情况处理
// ==========================================

/** 运行边界情况测试 */
integrationRouter.get('/edge-case-test', async (_req: Request, res: Response) => {
  try {
    const result = await edgeCaseHandler.runEdgeCaseTests()
    res.json({ data: result })
  } catch (err) {
    logger.error(`GET /edge-case-test: ${(err as Error).message}`)
    res.status(500).json({ error: 'Failed to run edge case tests' })
  }
})

/** 模拟断线重连 */
integrationRouter.post('/reconnect/:socketId', async (req: Request, res: Response) => {
  try {
    const { previousSocketId } = req.body
    const result = await edgeCaseHandler.handleReconnect(p(req, 'socketId'), previousSocketId)
    res.json({ data: result })
  } catch (err) {
    logger.error(`POST /reconnect: ${(err as Error).message}`)
    res.status(500).json({ error: 'Failed to handle reconnect' })
  }
})

/** 并发安全操作 */
integrationRouter.post('/safe-operation', async (req: Request, res: Response) => {
  try {
    const { operation, playerId, questId } = req.body

    let result
    switch (operation) {
      case 'accept_quest':
        result = await edgeCaseHandler.safeAcceptQuest(playerId, questId)
        break
      default:
        return res.status(400).json({ error: `Unknown operation: ${operation}` })
    }

    res.json({ data: result })
  } catch (err) {
    logger.error(`POST /safe-operation: ${(err as Error).message}`)
    res.status(500).json({ error: 'Failed to execute safe operation' })
  }
})

// ==========================================
// 全部联调测试（一键运行所有验证）
// ==========================================

/** 一键运行全部联调测试 */
integrationRouter.get('/full-test', async (_req: Request, res: Response) => {
  try {
    logger.info('Running full integration test...')

    // 并行运行独立测试
    const [walkthroughResult, consistencyResult, edgeCaseResult] = await Promise.all([
      storyProgressionManager.runStoryWalkthrough(),
      dataConsistencyValidator.runAllChecks(),
      edgeCaseHandler.runEdgeCaseTests(),
    ])

    const result = {
      storyWalkthrough: walkthroughResult,
      dataConsistency: consistencyResult,
      edgeCases: edgeCaseResult,
      overall: walkthroughResult.overall && consistencyResult.overall && edgeCaseResult.overall,
      timestamp: Date.now(),
    }

    logger.info(`Full integration test completed: ${result.overall ? 'PASS' : 'FAIL'}`)
    res.json({ data: result })
  } catch (err) {
    logger.error(`GET /full-test: ${(err as Error).message}`)
    res.status(500).json({ error: 'Failed to run full test' })
  }
})
