import { Router } from 'express'

export const healthRouter = Router()

healthRouter.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'star-town-server',
    timestamp: new Date().toISOString(),
  })
})
