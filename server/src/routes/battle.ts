// 星火小镇 — 战斗 API 路由
// T3.4.2 RTwP战斗引擎API
// T7.x 回合制战斗（赛尔号式）：create 支持 mode='turn' 按玩家等级生成敌人

import { Router, Request, Response } from 'express'
import { battleEngine } from '../services/battleEngine.js'
import { levelSystem } from '../services/levelSystem.js'
import { getEnemyDef, scaleEnemyForLevel } from '../data/enemyDefs.js'
import { createLogger } from '../utils/index.js'

const logger = createLogger('BattleRoute')

export const battleRouter = Router()

const p = (req: Request, key: string): string => {
  const val = req.params[key]
  return Array.isArray(val) ? val[0] : (val ?? '')
}

// ==========================================
// 战斗 API
// ==========================================

/** 创建战斗 */
battleRouter.post('/create', async (req: Request, res: Response) => {
  try {
    const { battleId, player, enemies, mode, playerId, enemyIds } = req.body
    if (!battleId) {
      return res.status(400).json({ error: 'Missing battleId' })
    }

    // T7.x 回合制模式：后端按玩家等级生成敌人属性（保证可过关）
    if (mode === 'turn') {
      if (!playerId) return res.status(400).json({ error: 'Missing playerId for turn battle' })
      if (!Array.isArray(enemyIds) || enemyIds.length === 0) {
        return res.status(400).json({ error: 'Missing enemyIds for turn battle' })
      }

      // 玩家真实属性（等级系统）
      const levelInfo = await levelSystem.getLevelInfo(playerId)
      const playerStats = levelInfo?.stats
      const playerName = playerStats
        ? await (async () => {
            const { prisma } = await import('../models/prisma.js')
            const pl = await prisma.player.findUnique({ where: { id: playerId } })
            return pl?.name ?? '旅行者'
          })()
        : '旅行者'
      if (!playerStats) {
        return res.status(404).json({ error: 'Player not found' })
      }
      const pStats = {
        id: playerId,
        name: playerName,
        hp: playerStats.maxHp, // 进入战斗满状态
        maxHp: playerStats.maxHp,
        attack: playerStats.attack,
        defense: playerStats.defense,
        speed: playerStats.speed,
      }

      // 敌人属性（按玩家等级缩放）
      const level = levelInfo.level
      const enemiesList: Array<{ id: string; name: string; hp: number; maxHp: number; attack: number; defense: number; speed: number }> = []
      for (const eid of enemyIds) {
        const def = getEnemyDef(eid)
        if (!def) {
          logger.warn(`Unknown enemy id: ${eid}, skipped`)
          continue
        }
        const scaled = scaleEnemyForLevel(def, level)
        enemiesList.push({
          id: def.id,
          name: def.name,
          hp: scaled.hp,
          maxHp: scaled.maxHp,
          attack: scaled.attack,
          defense: scaled.defense,
          speed: scaled.speed,
        })
      }
      if (enemiesList.length === 0) {
        return res.status(400).json({ error: 'No valid enemies' })
      }

      const battle = battleEngine.createBattle(battleId, pStats, enemiesList, 'turn')
      return res.json({
        data: {
          id: battle.id,
          mode: 'turn',
          state: battle.state,
          player: { id: pStats.id, name: pStats.name, hp: pStats.hp, maxHp: pStats.maxHp },
          enemies: enemiesList,
        },
      })
    }

    // 原 RTwP 模式
    if (!player || !enemies) {
      return res.status(400).json({ error: 'Missing player or enemies' })
    }
    const battle = battleEngine.createBattle(battleId, player, enemies)
    res.json({ data: { id: battle.id, state: battle.state, combatants: battle.combatants.length } })
  } catch (err) {
    logger.error(`POST /battle/create: ${(err as Error).message}`)
    res.status(500).json({ error: 'Failed to create battle' })
  }
})

/** 获取战斗状态 */
battleRouter.get('/:battleId', async (req: Request, res: Response) => {
  try {
    const battle = battleEngine.getBattleState(p(req, 'battleId'))
    if (!battle) return res.status(404).json({ error: 'Battle not found' })
    res.json({ data: battle })
  } catch (err) {
    logger.error(`GET /battle/:battleId: ${(err as Error).message}`)
    res.status(500).json({ error: 'Failed to fetch battle state' })
  }
})

/** 玩家行动 */
battleRouter.post('/:battleId/action', async (req: Request, res: Response) => {
  try {
    const battleId = p(req, 'battleId')
    const result = battleEngine.executePlayerAction(battleId, req.body)
    if (!result.success) return res.status(400).json({ error: result.message })
    // T7.x 回合制：返回完整回合数据（事件序列/最新HP/战斗状态），前端按事件播放动画
    if ('state' in result && Array.isArray((result as any).events)) {
      return res.json({ success: true, message: result.message, data: result })
    }
    res.json({ success: true, message: result.message })
  } catch (err) {
    logger.error(`POST /battle/action: ${(err as Error).message}`)
    res.status(500).json({ error: 'Failed to execute action' })
  }
})

/** 暂停/恢复 */
battleRouter.post('/:battleId/pause', async (req: Request, res: Response) => {
  try {
    const result = battleEngine.togglePause(p(req, 'battleId'))
    res.json({ success: true, paused: result.paused })
  } catch (err) {
    logger.error(`POST /battle/pause: ${(err as Error).message}`)
    res.status(500).json({ error: 'Failed to toggle pause' })
  }
})

/** 获取战斗结果 */
battleRouter.get('/:battleId/result', async (req: Request, res: Response) => {
  try {
    const result = battleEngine.getBattleResult(p(req, 'battleId'))
    if (!result) return res.status(404).json({ error: 'Battle not found' })
    res.json({ data: result })
  } catch (err) {
    logger.error(`GET /battle/result: ${(err as Error).message}`)
    res.status(500).json({ error: 'Failed to fetch result' })
  }
})

/** 结束战斗 */
battleRouter.post('/:battleId/end', async (req: Request, res: Response) => {
  try {
    const result = battleEngine.endBattle(p(req, 'battleId'))
    if (!result) return res.status(404).json({ error: 'Battle not found' })
    res.json({ data: result })
  } catch (err) {
    logger.error(`POST /battle/end: ${(err as Error).message}`)
    res.status(500).json({ error: 'Failed to end battle' })
  }
})

/** 战斗引擎统计 */
battleRouter.get('/stats', async (_req: Request, res: Response) => {
  try {
    res.json({ data: battleEngine.getStats() })
  } catch (err) {
    logger.error(`GET /battle/stats: ${(err as Error).message}`)
    res.status(500).json({ error: 'Failed to fetch stats' })
  }
})
