// 星火小镇 — 天气系统服务
// T6.9 天气设定：晴天/多云/小雨/大雨(雷雨)/雪/雾
// 作用：小镇场景天气渲染、NPC感知环境快照、时间驱动随机天气变化

import { createLogger } from '../utils/index.js'
import { gameClock } from './gameClock.js'

const logger = createLogger('Weather')

// =============================================
// 类型定义
// =============================================

/** 天气类型 */
export type WeatherType = 'sunny' | 'cloudy' | 'light_rain' | 'storm' | 'snow' | 'fog'

/** 天气状态 */
export interface WeatherState {
  /** 天气类型 */
  type: WeatherType
  /** 天气名称 */
  name: string
  /** 图标（emoji） */
  icon: string
  /** 描述 */
  description: string
  /** 游戏日 */
  gameDay: number
  /** 游戏时间（分钟） */
  gameTime: number
  /** 更新时间戳 */
  updatedAt: number
}

/** 天气权重表（时段 → 天气 → 概率权重） */
type WeatherWeights = Record<string, Partial<Record<WeatherType, number>>>

/** 天气服务配置 */
export interface WeatherServiceConfig {
  /** 是否启用自动天气变化 */
  enableAutoChange: boolean
  /** 最小间隔（游戏小时） */
  minIntervalHours: number
}

// =============================================
// 天气配置
// =============================================

/** 天气元数据 */
export const WEATHER_META: Record<WeatherType, { name: string; icon: string; description: string }> = {
  sunny: { name: '晴天', icon: '☀️', description: '阳光明媚，小镇暖洋洋的。' },
  cloudy: { name: '多云', icon: '⛅', description: '云层遮住了阳光，微风拂面。' },
  light_rain: { name: '小雨', icon: '🌦️', description: '细雨绵绵，路面湿漉漉的。' },
  storm: { name: '雷雨', icon: '⛈️', description: '电闪雷鸣，大雨倾盆而下！' },
  snow: { name: '飘雪', icon: '🌨️', description: '雪花纷飞，屋顶盖上了白纱。' },
  fog: { name: '起雾', icon: '🌫️', description: '浓雾弥漫，远处的建筑若隐若现。' },
}

/** 不同时段天气概率权重（清晨/白天/傍晚/夜晚各有倾向） */
const WEATHER_WEIGHTS: WeatherWeights = {
  dawn: { sunny: 3, cloudy: 3, light_rain: 2, fog: 3, snow: 1, storm: 0 },
  morning: { sunny: 4, cloudy: 3, light_rain: 2, fog: 1, snow: 1, storm: 0 },
  afternoon: { sunny: 3, cloudy: 3, light_rain: 2, fog: 1, snow: 1, storm: 1 },
  evening: { sunny: 2, cloudy: 3, light_rain: 2, fog: 2, snow: 1, storm: 1 },
  night: { sunny: 2, cloudy: 3, light_rain: 2, fog: 3, snow: 1, storm: 1 },
}

/** 各时段默认天气（新一天开始时） */
const DEFAULT_WEATHER_BY_PERIOD: Record<string, WeatherType> = {
  dawn: 'cloudy',
  morning: 'sunny',
  afternoon: 'sunny',
  evening: 'cloudy',
  night: 'cloudy',
}

// =============================================
// 天气服务
// =============================================

/**
 * WeatherService — 天气系统
 *
 * 职责：
 * 1. 维护全局天气状态（类型/名称/描述）
 * 2. 按游戏时钟随机推进天气变化（小时级）
 * 3. 新一天重置默认天气
 * 4. 广播 weather:update 给所有客户端
 * 5. 提供 REST API（查询当前天气 / 手动设置调试）
 * 6. 提供 getWeather() 供 NPC 感知环境快照使用
 */
class WeatherService {
  /** 配置 */
  private config: WeatherServiceConfig = {
    enableAutoChange: true,
    minIntervalHours: 3,
  }

  /** 当前天气状态 */
  private state: WeatherState = {
    type: 'sunny',
    name: '晴天',
    icon: '☀️',
    description: '阳光明媚，小镇暖洋洋的。',
    gameDay: 1,
    gameTime: 480,
    updatedAt: Date.now(),
  }

  /** 上次天气变化的时间戳（真实毫秒） */
  private lastChangeRealMs = 0

  /** 事件取消监听列表 */
  private unsubscribeCallbacks: Array<() => void> = []

  /** 是否已初始化 */
  private initialized = false

  /** Socket.IO 实例 */
  private io: any = null

  // =============================================
  // 生命周期
  // =============================================

  /**
   * 初始化天气服务（监听游戏时钟事件）
   */
  initialize(config?: Partial<WeatherServiceConfig>): void {
    if (this.initialized) {
      logger.warn('WeatherService already initialized')
      return
    }
    if (config) {
      this.config = { ...this.config, ...config }
    }

    // 初始天气：按当前时段设置默认天气
    const time = gameClock.getTime()
    this.applyWeather(DEFAULT_WEATHER_BY_PERIOD[time.period] ?? 'sunny', time, true)
    this.lastChangeRealMs = Date.now()

    // 监听时段变化 → 小概率天气过渡（如清晨雾起）
    this.unsubscribeCallbacks.push(
      gameClock.on('period_change', (event) => this.onPeriodChange(event)),
    )

    // 监听小时变化 → 随机天气变化
    this.unsubscribeCallbacks.push(
      gameClock.on('hour_change', (event) => this.onHourChange(event)),
    )

    // 新一天 → 重置默认天气
    this.unsubscribeCallbacks.push(
      gameClock.on('new_day', (event) => this.onNewDay(event)),
    )

    this.initialized = true
    logger.info(`WeatherService initialized: ${this.state.name}`)
  }

  /** 设置 Socket.IO 实例 */
  setIo(io: any): void {
    this.io = io
  }

  // =============================================
  // 事件处理
  // =============================================

  /** 时段变化：傍晚/清晨概率性起雾或转晴 */
  private onPeriodChange(event: { period: string; gameDay: number; gameTime: number }): void {
    if (!this.config.enableAutoChange) return
    if (event.period !== 'dawn' && event.period !== 'evening') return

    // 清晨 25% 起雾；傍晚 20% 保持多云
    const r = Math.random()
    if (event.period === 'dawn' && r < 0.25) {
      this.changeWeather('fog', event.gameDay, event.gameTime)
    } else if (event.period === 'evening' && r >= 0.8) {
      this.changeWeather('cloudy', event.gameDay, event.gameTime)
    }
  }

  /** 小时变化：随机天气变化（带冷却与概率） */
  private onHourChange(event: { period: string; gameDay: number; gameTime: number }): void {
    if (!this.config.enableAutoChange) return

    // 冷却检查：距上次变化不足 minIntervalHours 游戏小时则跳过
    const time = gameClock.getTime()
    const hoursSince = (Date.now() - this.lastChangeRealMs) / 1000 / 60 / time.timeScale
    if (hoursSince < this.config.minIntervalHours) return

    // 每游戏小时 12% 概率变化
    if (Math.random() >= 0.12) return

    this.changeWeather(undefined, event.gameDay, event.gameTime)
  }

  /** 新一天：重置为当日默认天气（高概率晴天开局） */
  private onNewDay(event: { period: string; gameDay: number; gameTime: number }): void {
    const period = event.period
    // 新一天 70% 用默认天气，30% 保留昨日天气延续
    if (Math.random() < 0.7) {
      this.applyWeather(DEFAULT_WEATHER_BY_PERIOD[period] ?? 'sunny', event, false)
    } else {
      // 保留当前天气，仅更新时间戳
      this.state.gameDay = event.gameDay
      this.state.gameTime = event.gameTime
      this.state.updatedAt = Date.now()
      this.broadcastWeather()
    }
  }

  // =============================================
  // 核心方法
  // =============================================

  /**
   * 按时段权重随机选择天气
   */
  private randomWeatherByPeriod(period: string): WeatherType {
    const weights = WEATHER_WEIGHTS[period] ?? WEATHER_WEIGHTS.morning
    const entries = Object.entries(weights) as Array<[WeatherType, number]>
    const total = entries.reduce((sum, [, w]) => sum + w, 0)
    let r = Math.random() * total
    for (const [type, w] of entries) {
      r -= w
      if (r <= 0) return type
    }
    return 'sunny'
  }

  /**
   * 切换天气（type 为空时按时段随机）
   */
  changeWeather(type?: WeatherType, gameDay?: number, gameTime?: number): WeatherState {
    const time = gameClock.getTime()
    const day = gameDay ?? time.gameDay
    const minute = gameTime ?? time.gameTime
    const target = type ?? this.randomWeatherByPeriod(time.period)

    return this.applyWeather(target, { gameDay: day, gameTime: minute }, true)
  }

  /** 应用天气状态并广播 */
  private applyWeather(
    type: WeatherType,
    time: { gameDay: number; gameTime: number },
    broadcast: boolean,
  ): WeatherState {
    const meta = WEATHER_META[type]
    this.state = {
      type,
      name: meta.name,
      icon: meta.icon,
      description: meta.description,
      gameDay: time.gameDay,
      gameTime: time.gameTime,
      updatedAt: Date.now(),
    }
    this.lastChangeRealMs = Date.now()

    logger.info(`Weather changed: ${this.state.name} (Day ${time.gameDay} ${time.gameTime}min)`)
    if (broadcast) {
      this.broadcastWeather()
    }
    return { ...this.state }
  }

  /** 广播天气给所有客户端 */
  broadcastWeather(): void {
    if (!this.io) return
    this.io.emit('weather:update', this.getWeather())
  }

  /** 向新连接的客户端推送当前天气 */
  sendWeatherToClient(socket: any): void {
    socket.emit('weather:update', this.getWeather())
  }

  // =============================================
  // 查询接口
  // =============================================

  /** 获取当前天气状态 */
  getWeather(): WeatherState {
    return { ...this.state }
  }

  /** 获取环境快照（NPC 感知用） */
  getWeatherSnapshot(): string {
    return this.state.name
  }

  /** 获取配置 */
  getConfig(): WeatherServiceConfig {
    return { ...this.config }
  }

  /** 更新配置 */
  updateConfig(config: Partial<WeatherServiceConfig>): void {
    this.config = { ...this.config, ...config }
  }

  /** 是否已初始化 */
  get isInitialized(): boolean {
    return this.initialized
  }

  // =============================================
  // 管理接口
  // =============================================

  /** 销毁：取消所有监听 */
  destroy(): void {
    this.unsubscribeCallbacks.forEach((unsub) => unsub())
    this.unsubscribeCallbacks = []
    this.initialized = false
  }
}

/** 全局天气服务实例 */
export const weatherService = new WeatherService()
