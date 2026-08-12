// 星火小镇 — 多租户认证服务
// 仅用户名注册/登录：用户名即租户唯一标识
// token 使用 HMAC-SHA256 签名（无外部依赖，Node 内置 crypto）

import crypto from 'crypto'
import { prisma } from '../models/prisma.js'
import { createLogger } from '../utils/index.js'

const logger = createLogger('Auth')

/** token 有效期（秒），默认 30 天 */
const TOKEN_TTL_SEC = parseInt(process.env.AUTH_TOKEN_TTL || String(30 * 24 * 3600), 10)
/** token 签名密钥（环境变量注入，生产环境务必覆盖） */
const TOKEN_SECRET = process.env.AUTH_TOKEN_SECRET || 'sparktown-dev-secret-change-me'

/** 用户名合法字符（中文/字母/数字/下划线/连字符，2-16位） */
const USERNAME_RULE = /^[\u4e00-\u9fa5a-zA-Z0-9_-]{2,16}$/

/**
 * T6.17 在线玩家系统：玩家外观形象预设（注册时随机分配）
 * 每个 avatar 对应前端一套颜色方案，实现"注册后随机生成形象"
 */
export const PLAYER_AVATARS = [
  'avatar_01', 'avatar_02', 'avatar_03', 'avatar_04',
  'avatar_05', 'avatar_06', 'avatar_07', 'avatar_08',
  'avatar_09', 'avatar_10', 'avatar_11', 'avatar_12',
]

/** 随机分配一个外观形象 */
export function randomAvatar(): string {
  return PLAYER_AVATARS[Math.floor(Math.random() * PLAYER_AVATARS.length)]
}

// =============================================
// 出生点：温馨小屋门口
// 温馨小屋门 tile(14,21)，门外引道 tile(14,22) 为可走石板路
// 像素坐标 = tile * 64 + 32 → (14*64+32, 22*64+32) = (928, 1440)
// =============================================
export const SPAWN_X = 928
export const SPAWN_Y = 1440

export interface AuthPlayerInfo {
  id: string
  name: string
  avatar: string
  x: number
  y: number
  direction: string
  starCoins: number
  gameDay: number
  level: number
  exp: number
  createdAt: Date
}

export interface AuthResult {
  token: string
  player: AuthPlayerInfo
}

export interface TokenPayload {
  /** 玩家真实 ID（Player.id） */
  playerId: string
  /** 用户名 */
  name: string
  /** 过期时间（Unix秒） */
  exp: number
}

/** 校验用户名合法性，返回错误信息或 null */
export function validateUsername(username: string): string | null {
  if (!username || typeof username !== 'string') return '请输入用户名'
  const trimmed = username.trim()
  if (!USERNAME_RULE.test(trimmed)) {
    return '用户名需为2-16位中文/字母/数字/下划线/连字符'
  }
  return null
}

/** 用户名标准化：去除首尾空白 */
function normalizeUsername(username: string): string {
  return (username ?? '').trim()
}

/**
 * 签发 token
 * payload.signature = HMAC-SHA256(payload, secret)
 */
function signToken(payload: Omit<TokenPayload, 'exp'>): string {
  const body: TokenPayload = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SEC,
  }
  const bodyB64 = Buffer.from(JSON.stringify(body)).toString('base64url')
  const sig = crypto
    .createHmac('sha256', TOKEN_SECRET)
    .update(bodyB64)
    .digest('base64url')
  return `${bodyB64}.${sig}`
}

/**
 * 验证并解析 token
 * 返回 payload；无效/过期返回 null
 */
export function verifyToken(token: string): TokenPayload | null {
  if (!token || !token.includes('.')) return null
  const [bodyB64, sig] = token.split('.')
  if (!bodyB64 || !sig) return null

  // 签名校验（防篡改）
  const expectedSig = crypto
    .createHmac('sha256', TOKEN_SECRET)
    .update(bodyB64)
    .digest('base64url')
  // 恒定时间比较
  const a = Buffer.from(sig)
  const b = Buffer.from(expectedSig)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return null
  }

  try {
    const payload = JSON.parse(Buffer.from(bodyB64, 'base64url').toString('utf8')) as TokenPayload
    if (!payload.playerId || !payload.name) return null
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null // 过期
    return payload
  } catch {
    return null
  }
}

/** 将 Player 记录映射为对外信息（不含敏感字段） */
function toPlayerInfo(p: {
  id: string
  name: string
  avatar?: string
  x: number
  y: number
  direction: string
  starCoins: number
  gameDay: number
  level: number
  exp: number
  createdAt: Date
}): AuthPlayerInfo {
  return {
    id: p.id,
    name: p.name,
    avatar: p.avatar ?? 'avatar_01',
    x: p.x,
    y: p.y,
    direction: p.direction,
    starCoins: p.starCoins,
    gameDay: p.gameDay,
    level: p.level,
    exp: p.exp,
    createdAt: p.createdAt,
  }
}

/**
 * 注册新用户（用户名即租户）
 * - 用户名唯一（players.name 已建唯一索引）
 * - 已存在 → 视为登录（幂等，方便演示环境）
 */
export async function register(username: string): Promise<AuthResult> {
  const name = normalizeUsername(username)
  const invalid = validateUsername(name)
  if (invalid) throw new Error(invalid)

  // 已存在用户 → 直接登录（多租户下同一用户名进入同一存档）
  const existing = await prisma.player.findUnique({ where: { name } })
  if (existing) {
    logger.info(`[Auth] Register→login (existing user): ${name}`)
    return login(name)
  }

  const player = await prisma.player.create({
    data: {
      name,
      avatar: randomAvatar(), // T6.17 注册时随机生成形象
      x: SPAWN_X, // 温馨小屋门口出生点（门 tile(14,21) 外一格 14*64+32）
      y: SPAWN_Y,
      direction: 'down',
      starCoins: 100,
    },
  })
  logger.info(`[Auth] New user registered: ${name} (${player.id})`)

  const token = signToken({ playerId: player.id, name })
  return { token, player: toPlayerInfo(player) }
}

/**
 * 登录：按用户名查找玩家
 * - 不存在 → 自动注册（多租户演示友好行为）
 */
export async function login(username: string): Promise<AuthResult> {
  const name = normalizeUsername(username)
  const invalid = validateUsername(name)
  if (invalid) throw new Error(invalid)

  let player = await prisma.player.findUnique({ where: { name } })
  if (!player) {
    logger.info(`[Auth] Login→auto-register (new user): ${name}`)
    player = await prisma.player.create({
      data: {
        name,
        avatar: randomAvatar(), // T6.17 登录自动注册同样随机形象
        x: SPAWN_X, // 温馨小屋门口出生点
        y: SPAWN_Y,
        direction: 'down',
        starCoins: 100,
      },
    })
  }

  logger.info(`[Auth] User logged in: ${name} (${player.id})`)
  const token = signToken({ playerId: player.id, name })
  return { token, player: toPlayerInfo(player) }
}

/** 按 token 获取玩家信息（供 /api/auth/me） */
export async function getPlayerByToken(token: string): Promise<{ payload: TokenPayload; player: AuthPlayerInfo } | null> {
  const payload = verifyToken(token)
  if (!payload) return null

  const player = await prisma.player.findUnique({ where: { id: payload.playerId } })
  if (!player) return null

  return { payload, player: toPlayerInfo(player) }
}

/** 更新玩家位置（进度恢复用：断线时保存） */
export async function savePlayerPosition(
  playerId: string,
  x: number,
  y: number,
  direction: string,
): Promise<void> {
  try {
    await prisma.player.update({
      where: { id: playerId },
      data: { x, y, direction },
    })
  } catch (err) {
    logger.warn(`[Auth] Save position failed for ${playerId}: ${(err as Error).message}`)
  }
}

export const authService = { register, login, verifyToken, getPlayerByToken, savePlayerPosition }
