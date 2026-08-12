// 星火小镇 — 天气系统 API 路由
// T6.9 天气设定：查询当前天气 / 手动设置调试天气

import { Router, Request, Response } from 'express'
import { weatherService, WEATHER_META, type WeatherType } from '../services/weatherService.js'
import { createLogger } from '../utils/index.js'

const logger = createLogger('WeatherRoute')

export const weatherRouter = Router()

/** 获取当前天气 */
weatherRouter.get('/', (_req: Request, res: Response) => {
  try {
    res.json({ data: weatherService.getWeather() })
  } catch (err) {
    logger.error(`GET /weather: ${(err as Error).message}`)
    res.status(500).json({ error: 'Failed to fetch weather' })
  }
})

/** 获取天气类型元数据（前端渲染用） */
weatherRouter.get('/types', (_req: Request, res: Response) => {
  try {
    res.json({ data: WEATHER_META })
  } catch (err) {
    logger.error(`GET /weather/types: ${(err as Error).message}`)
    res.status(500).json({ error: 'Failed to fetch weather types' })
  }
})

/** 手动设置天气（调试/演示用） */
weatherRouter.post('/set', (req: Request, res: Response) => {
  try {
    const { type } = req.body as { type?: string }
    if (!type || !(type in WEATHER_META)) {
      return res.status(400).json({
        error: `Invalid weather type. Valid: ${Object.keys(WEATHER_META).join(', ')}`,
      })
    }
    const state = weatherService.changeWeather(type as WeatherType)
    res.json({ data: state })
  } catch (err) {
    logger.error(`POST /weather/set: ${(err as Error).message}`)
    res.status(500).json({ error: 'Failed to set weather' })
  }
})
