// 星火小镇 — 升级打怪 + 主线任务 API 路由
// T6.8.x 升级系统与时间驱动主线任务的服务端接口

import { Router, Request, Response } from 'express'
import { levelSystem } from '../services/levelSystem.js'
import { battleEngine } from '../services/battleEngine.js'
import { questEngine } from '../services/questEngine.js'
import { mainlineQuestService } from '../services/mainlineQuestService.js'
import { createLogger } from '../utils/index.js'

const logger = createLogger('LevelRoute')

export const levelRouter = Router()

const p = (req: Request, key: string): string => {
  const val = req.params[key]
  return Array.isArray(val) ? val[0] : (val ?? '')
}

// ==========================================
// 升级系统
// ==========================================

/** 升级系统统计（放在 /:playerId 之前避免被捕获） */
levelRouter.get('/stats', async (_req: Request, res: Response) => {
  try {
    res.json({ data: { levelSystem: levelSystem.getStats(), mainline: mainlineQuestService.getStats() } })
  } catch (err) {
    logger.error(`GET /level/stats: ${(err as Error).message}`)
    res.status(500).json({ error: 'Failed to fetch stats' })
  }
})

/** 获取玩家等级信息 */
levelRouter.get('/:playerId', async (req: Request, res: Response) => {
  try {
    const info = await levelSystem.getLevelInfo(p(req, 'playerId'))
    if (!info) return res.status(404).json({ error: 'Player not found' })
    res.json({ data: info })
  } catch (err) {
    logger.error(`GET /level/:playerId: ${(err as Error).message}`)
    res.status(500).json({ error: 'Failed to fetch level info' })
  }
})

/**
 * 战斗结算（升级打怪核心接口）
 * 战斗结束后由前端调用：
 * 1. 胜利 → 发放经验（升级）+ 星币
 * 2. 按击杀的敌人推进所有 kill_enemy 任务目标（含时间驱动主线任务）
 */
levelRouter.post('/settle-battle', async (req: Request, res: Response) => {
  try {
    const { battleId, playerId, enemyIds } = req.body
    if (!battleId) {
      return res.status(400).json({ error: 'Missing battleId' })
    }
    if (!playerId) {
      return res.status(400).json({ error: 'Missing playerId' })
    }

    const result = battleEngine.getBattleResult(battleId)
    if (!result) {
      return res.status(404).json({ error: 'Battle not found' })
    }

    const settled = {
      battleId,
      state: result.state,
      expGained: 0,
      coinsGained: 0,
      leveledUp: false,
      levelsGained: 0,
      level: 1,
      questProgress: [] as string[],
    }

    // 只有胜利才结算奖励
    if (result.state === 'victory') {
      // 1. 发放经验（自动升级）
      const expInfo = await levelSystem.grantExp(playerId, result.expGained)
      settled.expGained = result.expGained
      settled.leveledUp = expInfo.leveledUp
      settled.levelsGained = expInfo.levelsGained
      settled.level = expInfo.level

      // 2. 发放星币
      if (result.coinsGained > 0) {
        const { prisma } = await import('../models/prisma.js')
        await prisma.player.update({
          where: { id: playerId },
          data: { starCoins: { increment: result.coinsGained } },
        })
        settled.coinsGained = result.coinsGained
      }

      // 3. 推进 kill_enemy 任务目标（击杀的敌人列表由前端传回）
      const enemyList: string[] = Array.isArray(enemyIds) ? enemyIds : []
      if (enemyList.length > 0) {
        for (const enemyId of enemyList) {
          await questEngine.triggerKillEnemy(playerId, enemyId)
          settled.questProgress.push(enemyId)
        }
      }
    }

    // 清理战斗
    battleEngine.endBattle(battleId)

    res.json({ data: settled })
  } catch (err) {
    logger.error(`POST /level/settle-battle: ${(err as Error).message}`)
    res.status(500).json({ error: 'Failed to settle battle' })
  }
})

// ==========================================
// 时间驱动主线任务（升级打怪玩法）
// ==========================================

/** 获取主线任务状态 */
levelRouter.get('/mainline/status/:playerId', async (req: Request, res: Response) => {
  try {
    const status = await mainlineQuestService.getStatus(p(req, 'playerId'))
    res.json({ data: status })
  } catch (err) {
    logger.error(`GET /level/mainline/status: ${(err as Error).message}`)
    res.status(500).json({ error: 'Failed to fetch mainline status' })
  }
})

/** 主动检查（前端调用：立即检查是否到了任务触发时间） */
levelRouter.post('/mainline/check', async (req: Request, res: Response) => {
  try {
    const { playerId } = req.body
    if (!playerId) return res.status(400).json({ error: 'Missing playerId' })
    const triggered = await mainlineQuestService.checkForPlayer(playerId)
    res.json({ data: { triggered } })
  } catch (err) {
    logger.error(`POST /level/mainline/check: ${(err as Error).message}`)
    res.status(500).json({ error: 'Failed to check mainline' })
  }
})

/** 主线任务链定义 */
levelRouter.get('/mainline/missions', async (_req: Request, res: Response) => {
  try {
    res.json({ data: mainlineQuestService.getMissions() })
  } catch (err) {
    logger.error(`GET /level/mainline/missions: ${(err as Error).message}`)
    res.status(500).json({ error: 'Failed to fetch missions' })
  }
})
