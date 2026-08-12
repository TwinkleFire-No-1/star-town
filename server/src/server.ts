import express from 'express'
import { createServer as createHttpServer } from 'http'
import { Server as SocketIOServer } from 'socket.io'
import cors from 'cors'
import { setupSocketHandlers } from './socket/handler.js'
import { healthRouter } from './routes/health.js'
import { crudRouter } from './routes/crud.js'
import { memoryRouter } from './routes/memory.js'
import { llmRouter } from './routes/llm.js'
import { questRouter } from './routes/quest.js'
import { itemRouter } from './routes/item.js'
import { battleRouter } from './routes/battle.js'
import { levelRouter } from './routes/level.js'
import { integrationRouter } from './routes/integration.js'
import { weatherRouter } from './routes/weather.js'
import { authRouter } from './routes/auth.js'
import { verifyToken } from './services/authService.js'
import { redisSessionManager } from './services/redisSession.js'
import { config } from './config/index.js'
import { createLogger } from './utils/index.js'

const logger = createLogger('Server')

export async function createServer() {
  const app = express()

  // 中间件
  app.use(cors({
    origin: config.cors.origins,
    credentials: true,
  }))
  app.use(express.json())

  // API 路由
  app.use('/api', healthRouter)
  app.use('/api', crudRouter)
  app.use('/api/memories', memoryRouter)
  app.use('/api/llm', llmRouter)
  app.use('/api/quest', questRouter)
  app.use('/api', itemRouter)
  app.use('/api/battle', battleRouter)
  app.use('/api/level', levelRouter)
  app.use('/api/integration', integrationRouter)
  app.use('/api/weather', weatherRouter)
  app.use('/api/auth', authRouter)

  // HTTP + WebSocket 服务
  const httpServer = createHttpServer(app)

  // Socket.io
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: config.cors.origins,
      credentials: true,
    },
  })

  // ==========================================
  // 多租户认证中间件：解析 handshake token → socket.data
  // 未认证的连接仍放行（自动游客），但 socket.data.playerId 会指向游客档案
  // ==========================================
  io.use((socket, next) => {
    const token: string | undefined = socket.handshake.auth?.token
    if (token) {
      const payload = verifyToken(token)
      if (payload) {
        socket.data.playerId = payload.playerId
        socket.data.playerName = payload.name
        return next()
      }
    }
    // 未认证/无效token：游客模式，playerId 退化为 socket.id（兼容旧流程）
    socket.data.playerId = socket.id
    socket.data.playerName = `旅行者${socket.id.substring(0, 4)}`
    next()
  })

  // 初始化 Redis 会话管理
  try {
    await redisSessionManager.connect(config.redis.url)
    logger.info('Redis session manager connected')
  } catch (err) {
    logger.warn(`Redis connection failed: ${(err as Error).message}. Using in-memory fallback.`)
  }

  // 设置 WebSocket 事件处理
  setupSocketHandlers(io)

  return { httpServer, io, app }
}
