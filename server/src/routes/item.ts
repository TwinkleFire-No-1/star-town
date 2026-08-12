// 星火小镇 — 物品 API 路由
// T3.3.1 物品查询（交易系统已移除，仅保留物品定义查询）

import { Router, Request, Response } from 'express'
import { itemService } from '../services/itemService.js'
import { createLogger } from '../utils/index.js'

const logger = createLogger('ItemRoute')

export const itemRouter = Router()

const p = (req: Request, key: string): string => {
  const val = req.params[key]
  return Array.isArray(val) ? val[0] : (val ?? '')
}

// ==========================================
// 物品定义 API
// ==========================================

/** 获取所有物品 */
itemRouter.get('/items', async (_req: Request, res: Response) => {
  try {
    const items = itemService.getAllItems()
    res.json({ data: items })
  } catch (err) {
    logger.error(`GET /items: ${(err as Error).message}`)
    res.status(500).json({ error: 'Failed to fetch items' })
  }
})

/** 按分类获取物品 */
itemRouter.get('/items/category/:category', async (req: Request, res: Response) => {
  try {
    const category = p(req, 'category')
    const items = itemService.getItemsByCategory(category as any)
    res.json({ data: items })
  } catch (err) {
    logger.error(`GET /items/category: ${(err as Error).message}`)
    res.status(500).json({ error: 'Failed to fetch items by category' })
  }
})

/** 物品服务统计 */
itemRouter.get('/items/stats', async (_req: Request, res: Response) => {
  try {
    res.json({ data: itemService.getStats() })
  } catch (err) {
    logger.error(`GET /items/stats: ${(err as Error).message}`)
    res.status(500).json({ error: 'Failed to fetch item stats' })
  }
})
