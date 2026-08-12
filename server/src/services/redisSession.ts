import { createClient, RedisClientType } from 'redis'
import { createLogger } from '../utils/index.js'

const logger = createLogger('RedisSession')

/**
 * SessionData — Socket 会话数据
 */
interface SessionData {
  socketId: string
  playerId: string
  playerName: string
  roomId: string | null
  connectedAt: number
  lastActiveAt: number
  /** 断线前的位置（用于重连恢复） */
  lastX: number
  lastY: number
  lastDirection: string
}

/**
 * RedisSessionManager — Redis 会话管理
 *
 * 职责：
 * - Socket 会话的创建/更新/删除
 * - 断线重连支持（会话保持60秒）
 * - 心跳超时检测
 * - 在线玩家列表
 *
 * 设计：
 * - 使用 Redis Hash 存储会话数据
 * - Key 格式: session:{socketId}
 * - Player → Session 映射: player_session:{playerId}
 * - TTL 60秒，每次心跳续期
 */
class RedisSessionManager {
  private client: RedisClientType | null = null
  private isConnected = false

  /** T5.4.2 BUG-001修复: 内存降级层 — Redis不可用时自动切换 */
  private memoryFallback: Map<string, SessionData> = new Map()
  private playerSessionMap: Map<string, string> = new Map()
  private isUsingFallback = false

  /** 会话TTL（秒） */
  private sessionTTL = 60

  /** 心跳清理间隔（毫秒） */
  private cleanupInterval = 30000

  private cleanupTimer: ReturnType<typeof setInterval> | null = null

  /**
   * 连接 Redis
   */
  async connect(redisUrl: string): Promise<void> {
    try {
      this.client = createClient({ url: redisUrl }) as RedisClientType

      this.client.on('connect', () => {
        this.isConnected = true
        this.isUsingFallback = false
        logger.info('Connected to Redis')

        // T5.4.2 BUG-001修复: Redis重连时将内存降级数据迁移回Redis
        if (this.memoryFallback.size > 0) {
          this.migrateFallbackToRedis()
        }
      })

      this.client.on('disconnect', () => {
        this.isConnected = false
        this.isUsingFallback = true
        logger.warn('Disconnected from Redis, falling back to in-memory storage')
      })

      this.client.on('error', (err) => {
        logger.error(`Redis error: ${err.message}`)
      })

      await this.client.connect()

      // 启动心跳清理
      this.startCleanup()

      logger.info('RedisSessionManager initialized')
    } catch (err) {
      logger.error(`Failed to connect Redis: ${(err as Error).message}`)
      this.isUsingFallback = true
      logger.info('Falling back to in-memory session storage')
    }
  }

  /**
   * 创建会话
   */
  async createSession(data: Omit<SessionData, 'connectedAt' | 'lastActiveAt'>): Promise<void> {
    const session: SessionData = {
      ...data,
      connectedAt: Date.now(),
      lastActiveAt: Date.now(),
      lastX: data.lastX ?? 160,
      lastY: data.lastY ?? 90,
      lastDirection: data.lastDirection ?? 'down',
    }

    if (this.client && this.isConnected) {
      const key = `session:${data.socketId}`
      const playerKey = `player_session:${data.playerId}`
      await this.client.setEx(key, this.sessionTTL, JSON.stringify(session))
      await this.client.setEx(playerKey, this.sessionTTL, data.socketId)
    } else {
      // T5.4.2 BUG-001修复: 内存降级
      this.memoryFallback.set(data.socketId, session)
      this.playerSessionMap.set(data.playerId, data.socketId)
    }

    logger.info(`Session created: ${data.playerName} (${data.socketId})${this.isUsingFallback ? ' [fallback]' : ''}`)
  }

  /**
   * 更新会话心跳
   */
  async heartbeat(socketId: string): Promise<SessionData | null> {
    const session = await this.getSession(socketId)
    if (!session) return null

    session.lastActiveAt = Date.now()

    if (this.client && this.isConnected) {
      const key = `session:${socketId}`
      await this.client.setEx(key, this.sessionTTL, JSON.stringify(session))
      await this.client.expire(`player_session:${session.playerId}`, this.sessionTTL)
    } else {
      // T5.4.2 BUG-001修复: 内存降级
      this.memoryFallback.set(socketId, session)
    }

    return session
  }

  /**
   * 更新会话中的位置信息
   */
  async updatePosition(socketId: string, x: number, y: number, direction: string): Promise<void> {
    const session = await this.getSession(socketId)
    if (!session) return

    session.lastX = x
    session.lastY = y
    session.lastDirection = direction
    session.lastActiveAt = Date.now()

    if (this.client && this.isConnected) {
      const key = `session:${socketId}`
      await this.client.setEx(key, this.sessionTTL, JSON.stringify(session))
    } else {
      // T5.4.2 BUG-001修复: 内存降级
      this.memoryFallback.set(socketId, session)
    }
  }

  /**
   * 获取会话
   */
  async getSession(socketId: string): Promise<SessionData | null> {
    if (this.client && this.isConnected) {
      const key = `session:${socketId}`
      const data = await this.client.get(key)
      if (!data) return null
      return JSON.parse(data) as SessionData
    }

    // T5.4.2 BUG-001修复: 内存降级
    return this.memoryFallback.get(socketId) ?? null
  }

  /**
   * 通过 Player ID 查找会话（用于断线重连）
   */
  async findSessionByPlayerId(playerId: string): Promise<SessionData | null> {
    if (this.client && this.isConnected) {
      const playerKey = `player_session:${playerId}`
      const socketId = await this.client.get(playerKey)
      if (!socketId) return null
      return this.getSession(socketId)
    }

    // T5.4.2 BUG-001修复: 内存降级
    const socketId = this.playerSessionMap.get(playerId)
    if (!socketId) return null
    return this.memoryFallback.get(socketId) ?? null
  }

  /**
   * 删除会话
   */
  async deleteSession(socketId: string): Promise<void> {
    const session = await this.getSession(socketId)

    if (this.client && this.isConnected) {
      if (session) {
        await this.client.del(`player_session:${session.playerId}`)
      }
      await this.client.del(`session:${socketId}`)
    }

    // T5.4.2 BUG-001修复: 内存降级也同步清理
    if (session) {
      this.playerSessionMap.delete(session.playerId)
    }
    this.memoryFallback.delete(socketId)

    logger.info(`Session deleted: ${socketId}`)
  }

  /**
   * 更新会话的房间ID
   */
  async updateRoom(socketId: string, roomId: string | null): Promise<void> {
    const session = await this.getSession(socketId)
    if (!session) return

    session.roomId = roomId
    session.lastActiveAt = Date.now()

    if (this.client && this.isConnected) {
      const key = `session:${socketId}`
      await this.client.setEx(key, this.sessionTTL, JSON.stringify(session))
    }
  }

  /**
   * 获取在线玩家数量
   */
  async getOnlineCount(): Promise<number> {
    if (this.client && this.isConnected) {
      const keys = await this.client.keys('session:*')
      return keys.length
    }
    // T5.4.2 BUG-001修复: 内存降级
    return this.memoryFallback.size
  }

  /**
   * 断线重连检测
   * 如果 Player ID 对应的旧会话还存在（TTL内），允许重连并恢复状态
   */
  async tryReconnect(
    playerId: string,
    newSocketId: string,
  ): Promise<SessionData | null> {
    const oldSession = await this.findSessionByPlayerId(playerId)
    if (!oldSession) return null

    // 删除旧会话
    await this.deleteSession(oldSession.socketId)

    // 创建新会话（保留旧位置和房间信息）
    const newSession: Omit<SessionData, 'connectedAt' | 'lastActiveAt'> = {
      socketId: newSocketId,
      playerId: oldSession.playerId,
      playerName: oldSession.playerName,
      roomId: oldSession.roomId,
      lastX: oldSession.lastX,
      lastY: oldSession.lastY,
      lastDirection: oldSession.lastDirection,
    }

    await this.createSession(newSession)

    logger.info(`Reconnected: ${oldSession.playerName} (${oldSession.socketId} → ${newSocketId})`)
    return { ...newSession, connectedAt: Date.now(), lastActiveAt: Date.now() }
  }

  /**
   * 启动心跳清理定时器
   */
  private startCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpired()
    }, this.cleanupInterval)
  }

  /**
   * 清理过期会话
   * Redis TTL自动清理，这里仅做日志
   */
  private async cleanupExpired(): Promise<void> {
    if (!this.client || !this.isConnected) return
    const count = await this.getOnlineCount()
    logger.info(`Online sessions: ${count}`)
  }

  /**
   * 关闭连接
   */
  async disconnect(): Promise<void> {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
    }
    if (this.client && this.isConnected) {
      await this.client.quit()
    }
    this.memoryFallback.clear()
    this.playerSessionMap.clear()
  }

  /**
   * T5.4.2 BUG-001修复: 将内存降级数据迁移回Redis
   */
  private async migrateFallbackToRedis(): Promise<void> {
    if (!this.client || !this.isConnected) return

    const count = this.memoryFallback.size
    for (const [socketId, session] of this.memoryFallback) {
      try {
        const key = `session:${socketId}`
        const playerKey = `player_session:${session.playerId}`
        await this.client.setEx(key, this.sessionTTL, JSON.stringify(session))
        await this.client.setEx(playerKey, this.sessionTTL, socketId)
      } catch (err) {
        logger.warn(`Failed to migrate session ${socketId}: ${(err as Error).message}`)
      }
    }

    this.memoryFallback.clear()
    this.playerSessionMap.clear()
    this.isUsingFallback = false
    logger.info(`Migrated ${count} sessions from memory fallback to Redis`)
  }
}

/** 全局 Redis 会话管理器单例 */
export const redisSessionManager = new RedisSessionManager()
