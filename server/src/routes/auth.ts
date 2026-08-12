// 星火小镇 — 多租户认证 API 路由
// POST /api/auth/register  注册（用户名唯一，已存在则自动登录）
// POST /api/auth/login     登录（不存在则自动注册，多租户演示友好）
// GET  /api/auth/me        根据 token 获取当前玩家信息（含进度）

import { Router, Request, Response } from 'express'
import { authService, validateUsername, verifyToken } from '../services/authService.js'
import { createLogger } from '../utils/index.js'

const logger = createLogger('AuthRoute')
export const authRouter = Router()

/** 从请求头提取 Bearer token */
function extractToken(req: Request): string {
  const header = req.headers.authorization ?? ''
  if (header.startsWith('Bearer ')) return header.slice(7).trim()
  return ''
}

/** 响应体统一包装 */
function ok(res: Response, data: unknown): void {
  res.json({ data })
}

// ==========================================
// 注册（仅用户名）
// ==========================================
authRouter.post('/register', async (req: Request, res: Response) => {
  try {
    const { username } = req.body ?? {}
    const invalid = validateUsername(username)
    if (invalid) {
      res.status(400).json({ error: invalid })
      return
    }
    const result = await authService.register(username)
    logger.info(`[Auth] Registered: ${result.player.name}`)
    ok(res, result)
  } catch (err) {
    logger.error(`[Auth] Register error: ${(err as Error).message}`)
    res.status(500).json({ error: (err as Error).message })
  }
})

// ==========================================
// 登录（不存在则自动注册）
// ==========================================
authRouter.post('/login', async (req: Request, res: Response) => {
  try {
    const { username } = req.body ?? {}
    const invalid = validateUsername(username)
    if (invalid) {
      res.status(400).json({ error: invalid })
      return
    }
    const result = await authService.login(username)
    logger.info(`[Auth] Logged in: ${result.player.name}`)
    ok(res, result)
  } catch (err) {
    logger.error(`[Auth] Login error: ${(err as Error).message}`)
    res.status(500).json({ error: (err as Error).message })
  }
})

// ==========================================
// 当前用户信息（token → 玩家进度）
// ==========================================
authRouter.get('/me', async (req: Request, res: Response) => {
  try {
    const token = extractToken(req)
    if (!token) {
      res.status(401).json({ error: '未提供认证凭证' })
      return
    }
    const payload = verifyToken(token)
    if (!payload) {
      res.status(401).json({ error: '登录已过期，请重新登录' })
      return
    }
    const result = await authService.getPlayerByToken(token)
    if (!result) {
      res.status(404).json({ error: '玩家不存在' })
      return
    }
    ok(res, result.player)
  } catch (err) {
    logger.error(`[Auth] Me error: ${(err as Error).message}`)
    res.status(500).json({ error: (err as Error).message })
  }
})

export { authService }
