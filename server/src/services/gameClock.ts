// 星火小镇 — 游戏时钟服务
// T3.1.1 30min现实=1游戏日、昼夜阶段、时间广播

import { createLogger } from '../utils/index.js'

const logger = createLogger('GameClock')

// =============================================
// 常量定义
// =============================================

/** 游戏一天的分钟数 */
const MINUTES_PER_DAY = 1440

/** 时间速率：1 真实秒 = N 游戏分钟 */
// 30分钟现实 = 1440分钟游戏 → 1440/1800 = 0.8 游戏分钟/秒
// 但需求是 30min现实=1游戏日 → 1800秒=1440游戏分钟 → 0.8 游戏分钟/秒
// 为了更快可见效果，使用 2 游戏分钟/秒（1 真实分钟 = 120 游戏分钟 = 2 游戏小时）
const DEFAULT_TIME_SCALE = 0.8

/** Tick 间隔（毫秒） */
const TICK_INTERVAL = 1000

// =============================================
// 类型定义
// =============================================

/** 昼夜时段 */
export type TimePeriod = 'dawn' | 'morning' | 'afternoon' | 'evening' | 'night'

/** 游戏时间状态 */
export interface GameTimeState {
  /** 游戏日（第几天） */
  gameDay: number
  /** 游戏时间（0-1440 分钟） */
  gameTime: number
  /** 当前时段 */
  period: TimePeriod
  /** 游戏小时（0-23） */
  gameHour: number
  /** 时间速率（游戏分钟/真实秒） */
  timeScale: number
}

/** 时间事件 */
export interface TimeEvent {
  /** 事件类型 */
  type: 'period_change' | 'new_day' | 'hour_change' | 'schedule_tick'
  /** 触发时间戳 */
  timestamp: number
  /** 游戏日 */
  gameDay: number
  /** 游戏时间（分钟） */
  gameTime: number
  /** 时段 */
  period: TimePeriod
  /** 旧时段（period_change 时有值） */
  oldPeriod?: TimePeriod
  /** 游戏小时 */
  gameHour: number
  /** 旧小时（hour_change 时有值） */
  oldHour?: number
}

/** 时间事件回调 */
type TimeEventCallback = (event: TimeEvent) => void

/** 时钟配置 */
export interface GameClockConfig {
  /** 时间速率（游戏分钟/真实秒），默认 0.8 */
  timeScale: number
  /** Tick 间隔（毫秒），默认 1000 */
  tickInterval: number
  /** 初始游戏日，默认 1 */
  startDay: number
  /** 初始游戏时间（分钟），默认 480 (8:00 AM) */
  startTime: number
  /** 是否启用时间广播 */
  enableBroadcast: boolean
}

// =============================================
// 时段计算
// =============================================

/**
 * 根据分钟数计算时段
 * 5:00-7:00 黎明 | 7:00-12:00 上午 | 12:00-17:00 下午 | 17:00-19:00 傍晚 | 19:00-5:00 夜晚
 */
export function getPeriodFromTime(time: number): TimePeriod {
  if (time >= 300 && time < 420) return 'dawn'      // 5:00-7:00
  if (time >= 420 && time < 720) return 'morning'    // 7:00-12:00
  if (time >= 720 && time < 1020) return 'afternoon' // 12:00-17:00
  if (time >= 1020 && time < 1140) return 'evening'  // 17:00-19:00
  return 'night'                                     // 19:00-5:00
}

/** 分钟数 → "HH:MM" 格式 */
export function formatGameTime(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24
  const m = Math.floor(minutes % 60)
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`
}

/** 分钟数 → 游戏小时（0-23） */
export function getHourFromTime(minutes: number): number {
  return Math.floor(minutes / 60) % 24
}

// =============================================
// 游戏时钟
// =============================================

/**
 * GameClock — 游戏时钟服务
 *
 * 职责：
 * 1. 推进游戏时间（可配置速率，默认 30min现实=1游戏日）
 * 2. 计算昼夜时段（dawn/morning/afternoon/evening/night）
 * 3. 在时段变化、新一天、小时变化时触发事件回调
 * 4. 广播时间状态给所有已连接客户端
 * 5. 提供 getTime() 给其他服务查询当前游戏时间
 */
class GameClock {
  /** 配置 */
  private config: GameClockConfig = {
    timeScale: DEFAULT_TIME_SCALE,
    tickInterval: TICK_INTERVAL,
    startDay: 1,
    startTime: 480,
    enableBroadcast: true,
  }

  /** 当前游戏时间状态 */
  private state: GameTimeState = {
    gameDay: 1,
    gameTime: 480,
    period: 'morning',
    gameHour: 8,
    timeScale: DEFAULT_TIME_SCALE,
  }

  /** Tick 定时器 */
  private tickTimer: ReturnType<typeof setInterval> | null = null

  /** 上次 Tick 的真实时间戳 */
  private lastRealTime = 0

  /** 是否正在运行 */
  private isRunning = false

  /** Socket.IO 实例（用于广播） */
  private io: any = null

  /** 时间事件监听器列表 */
  private listeners: Map<string, Set<TimeEventCallback>> = new Map()

  // =============================================
  // 生命周期
  // =============================================

  /**
   * 初始化时钟
   */
  initialize(config?: Partial<GameClockConfig>): void {
    if (config) {
      this.config = { ...this.config, ...config }
    }

    this.state = {
      gameDay: this.config.startDay,
      gameTime: this.config.startTime,
      period: getPeriodFromTime(this.config.startTime),
      gameHour: getHourFromTime(this.config.startTime),
      timeScale: this.config.timeScale,
    }

    logger.info(
      `GameClock initialized: Day ${this.state.gameDay}, ${formatGameTime(this.state.gameTime)}, ` +
      `period=${this.state.period}, scale=${this.state.timeScale} min/sec`,
    )
  }

  /**
   * 启动时钟
   */
  start(): void {
    if (this.isRunning) {
      logger.warn('GameClock already running')
      return
    }
    if (this.state.gameDay === 0 && this.state.gameTime === 0) {
      this.initialize()
    }

    this.isRunning = true
    this.lastRealTime = Date.now()

    this.tickTimer = setInterval(() => {
      this.tick()
    }, this.config.tickInterval)

    logger.info('GameClock started')
  }

  /**
   * 停止时钟
   */
  stop(): void {
    if (this.tickTimer) {
      clearInterval(this.tickTimer)
      this.tickTimer = null
    }
    this.isRunning = false
    logger.info('GameClock stopped')
  }

  // =============================================
  // 核心：Tick 推进
  // =============================================

  /**
   * 推进游戏时间
   */
  private tick(): void {
    if (!this.isRunning) return

    const now = Date.now()
    const deltaMs = now - this.lastRealTime
    this.lastRealTime = now

    // 计算推进的游戏分钟数
    const deltaSeconds = deltaMs / 1000
    const gameMinutesAdvance = deltaSeconds * this.config.timeScale

    // 推进时间
    const oldHour = this.state.gameHour
    const oldPeriod = this.state.period
    const oldDay = this.state.gameDay

    let newTime = this.state.gameTime + gameMinutesAdvance
    let newDay = this.state.gameDay

    // 跨天处理
    if (newTime >= MINUTES_PER_DAY) {
      const daysAdvance = Math.floor(newTime / MINUTES_PER_DAY)
      newTime = newTime % MINUTES_PER_DAY
      newDay += daysAdvance
    }

    const newHour = getHourFromTime(newTime)
    const newPeriod = getPeriodFromTime(newTime)

    // 更新状态
    this.state.gameTime = newTime
    this.state.gameDay = newDay
    this.state.gameHour = newHour
    this.state.period = newPeriod

    // 触发事件
    // 1. 新一天
    if (newDay > oldDay) {
      this.emitEvent({
        type: 'new_day',
        timestamp: now,
        gameDay: newDay,
        gameTime: newTime,
        period: newPeriod,
        gameHour: newHour,
      })
      logger.info(`New game day: Day ${newDay}`)
    }

    // 2. 时段变化
    if (newPeriod !== oldPeriod) {
      this.emitEvent({
        type: 'period_change',
        timestamp: now,
        gameDay: newDay,
        gameTime: newTime,
        period: newPeriod,
        oldPeriod,
        gameHour: newHour,
      })
      logger.info(`Period changed: ${oldPeriod} → ${newPeriod} (${formatGameTime(newTime)})`)
    }

    // 3. 小时变化
    if (newHour !== oldHour) {
      this.emitEvent({
        type: 'hour_change',
        timestamp: now,
        gameDay: newDay,
        gameTime: newTime,
        period: newPeriod,
        gameHour: newHour,
        oldHour,
      })
      logger.debug(`Hour changed: ${oldHour} → ${newHour} (Day ${newDay})`)
    }

    // 4. 广播时间（每 Tick 广播）
    if (this.config.enableBroadcast) {
      this.broadcastTime()
    }
  }

  // =============================================
  // 广播
  // =============================================

  /**
   * 设置 Socket.IO 实例
   */
  setIo(io: any): void {
    this.io = io
  }

  /**
   * 广播当前时间给所有客户端
   */
  broadcastTime(): void {
    if (!this.io) return

    this.io.emit('time:update', {
      day: this.state.gameDay,
      time: Math.floor(this.state.gameTime),
      hour: this.state.gameHour,
      period: this.state.period,
      formatted: formatGameTime(this.state.gameTime),
    })
  }

  /**
   * 向新连接的客户端发送当前时间
   */
  sendTimeToClient(socket: any): void {
    socket.emit('time:update', {
      day: this.state.gameDay,
      time: Math.floor(this.state.gameTime),
      hour: this.state.gameHour,
      period: this.state.period,
      formatted: formatGameTime(this.state.gameTime),
    })
  }

  // =============================================
  // 事件系统
  // =============================================

  /**
   * 注册事件监听
   * @param eventType - 事件类型：period_change / new_day / hour_change / schedule_tick
   * @param callback - 回调函数
   * @returns 取消监听函数
   */
  on(eventType: TimeEvent['type'], callback: TimeEventCallback): () => void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set())
    }
    this.listeners.get(eventType)!.add(callback)

    return () => this.off(eventType, callback)
  }

  /**
   * 取消事件监听
   */
  off(eventType: TimeEvent['type'], callback: TimeEventCallback): void {
    this.listeners.get(eventType)?.delete(callback)
  }

  /**
   * 触发事件
   */
  private emitEvent(event: TimeEvent): void {
    const callbacks = this.listeners.get(event.type)
    if (callbacks) {
      callbacks.forEach((cb) => {
        try {
          cb(event)
        } catch (err) {
          logger.error(`Event listener error (${event.type}): ${(err as Error).message}`)
        }
      })
    }
  }

  // =============================================
  // 查询接口
  // =============================================

  /**
   * 获取当前游戏时间状态
   */
  getTime(): GameTimeState {
    return { ...this.state }
  }

  /**
   * 获取当前游戏日
   */
  getDay(): number {
    return this.state.gameDay
  }

  /**
   * 获取当前游戏时间（分钟）
   */
  getGameTime(): number {
    return Math.floor(this.state.gameTime)
  }

  /**
   * 获取当前游戏小时
   */
  getGameHour(): number {
    return this.state.gameHour
  }

  /**
   * 获取当前时段
   */
  getPeriod(): TimePeriod {
    return this.state.period
  }

  /**
   * 获取格式化时间字符串
   */
  getFormattedTime(): string {
    return formatGameTime(this.state.gameTime)
  }

  /**
   * 是否在夜晚
   */
  isNight(): boolean {
    return this.state.period === 'night'
  }

  /**
   * 是否在白天
   */
  isDaytime(): boolean {
    return this.state.period === 'morning' || this.state.period === 'afternoon'
  }

  /**
   * 是否正在运行
   */
  get running(): boolean {
    return this.isRunning
  }

  // =============================================
  // 管理接口
  // =============================================

  /**
   * 设置时间速率
   */
  setTimeScale(scale: number): void {
    this.config.timeScale = scale
    this.state.timeScale = scale
    logger.info(`Time scale changed: ${scale} min/sec`)
  }

  /**
   * 手动设置时间（调试用）
   */
  setTime(day: number, time: number): void {
    this.state.gameDay = day
    this.state.gameTime = time
    this.state.gameHour = getHourFromTime(time)
    this.state.period = getPeriodFromTime(time)
    logger.info(`Time set: Day ${day}, ${formatGameTime(time)}, period=${this.state.period}`)
    this.broadcastTime()
  }

  /**
   * 快进时间（调试用）
   */
  skipTime(minutes: number): void {
    let newTime = this.state.gameTime + minutes
    let newDay = this.state.gameDay

    if (newTime >= MINUTES_PER_DAY) {
      const daysAdvance = Math.floor(newTime / MINUTES_PER_DAY)
      newTime = newTime % MINUTES_PER_DAY
      newDay += daysAdvance
    }

    this.setTime(newDay, newTime)
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<GameClockConfig>): void {
    this.config = { ...this.config, ...config }
    if (config.timeScale !== undefined) {
      this.state.timeScale = config.timeScale
    }
  }

  /**
   * 获取配置
   */
  getConfig(): GameClockConfig {
    return { ...this.config }
  }
}

/** 全局游戏时钟实例 */
export const gameClock = new GameClock()
