// 星火小镇 — 时间事件触发服务
// T3.1.3 定时任务检查、NPC日程同步、随机事件触发

import { createLogger } from '../utils/index.js'
import { gameClock, type TimeEvent, type TimePeriod } from './gameClock.js'
import { scheduleExecutor } from './scheduleExecutor.js'
import { profileLoader } from './profileLoader.js'
import { npcMovementSystem } from './npcMovementSystem.js'

const logger = createLogger('TimeEventTrigger')

// =============================================
// 类型定义
// =============================================

/** 随机事件类型 */
export interface RandomTimeEvent {
  /** 事件 ID */
  id: string
  /** 事件名称 */
  name: string
  /** 事件描述 */
  description: string
  /** 可触发的时段 */
  allowedPeriods: TimePeriod[]
  /** 触发概率（0-1） */
  probability: number
  /** 最小间隔（游戏小时） */
  minIntervalHours: number
  /** 上次触发时间 */
  lastTriggered?: number
}

/** 时间事件触发器配置 */
export interface TimeEventTriggerConfig {
  /** 是否启用随机事件 */
  enableRandomEvents: boolean
  /** 是否启用NPC日程同步 */
  enableScheduleSync: boolean
  /** 是否广播时段变化 */
  enablePeriodBroadcast: boolean
  /** 夜晚自动事件概率 */
  nightEventProbability: number
}

// =============================================
// 预定义随机事件
// =============================================

const RANDOM_EVENTS: RandomTimeEvent[] = [
  {
    id: 'market_busy',
    name: '市场繁忙',
    description: '市场区域人流增加，商贩们开始忙碌起来',
    allowedPeriods: ['morning', 'afternoon'],
    probability: 0.15,
    minIntervalHours: 4,
  },
  {
    id: 'tavern_crowd',
    name: '酒馆热闹',
    description: '酒馆迎来了大批客人，老巴克忙得不亦乐乎',
    allowedPeriods: ['evening', 'night'],
    probability: 0.2,
    minIntervalHours: 6,
  },
  {
    id: 'forest_rumor',
    name: '森林传言',
    description: '有人在森林边缘发现了奇怪的足迹',
    allowedPeriods: ['morning', 'afternoon', 'evening'],
    probability: 0.08,
    minIntervalHours: 8,
  },
  {
    id: 'weather_change',
    name: '天气变化',
    description: '天空的云层开始变化，似乎要起风了',
    allowedPeriods: ['dawn', 'morning', 'afternoon', 'evening', 'night'],
    probability: 0.1,
    minIntervalHours: 5,
  },
  {
    id: 'night_patrol',
    name: '夜间巡逻',
    description: '卫兵开始了夜间巡逻，小镇更加安全',
    allowedPeriods: ['night'],
    probability: 0.3,
    minIntervalHours: 3,
  },
  {
    id: 'dawn_bell',
    name: '晨钟敲响',
    description: '教堂的晨钟在小镇上空回荡',
    allowedPeriods: ['dawn'],
    probability: 0.25,
    minIntervalHours: 1,
  },
  {
    id: 'merchant_caravan',
    name: '商队到来',
    description: '一支商队抵达小镇广场，带来了远方的货物',
    allowedPeriods: ['morning', 'afternoon'],
    probability: 0.06,
    minIntervalHours: 12,
  },
]

// =============================================
// 时间事件触发器
// =============================================

/**
 * TimeEventTrigger — 时间事件触发服务
 *
 * 职责：
 * 1. 监听游戏时钟事件（时段变化、新一天、小时变化）
 * 2. 在时间节点触发NPC日程同步
 * 3. 根据时段和概率触发随机世界事件
 * 4. 广播世界事件给所有客户端
 * 5. 与NPC调度器协同触发定时检查
 */
class TimeEventTrigger {
  /** 配置 */
  private config: TimeEventTriggerConfig = {
    enableRandomEvents: true,
    enableScheduleSync: true,
    enablePeriodBroadcast: true,
    nightEventProbability: 0.25,
  }

  /** 事件取消监听列表 */
  private unsubscribeCallbacks: Array<() => void> = []

  /** 是否已初始化 */
  private initialized = false

  /** Socket.IO 实例 */
  private io: any = null

  /** 当前活跃的世界事件 */
  private activeWorldEvents: Map<string, { event: RandomTimeEvent; triggeredAt: number }> = new Map()

  // =============================================
  // 初始化
  // =============================================

  /**
   * 初始化时间事件触发器
   */
  initialize(config?: Partial<TimeEventTriggerConfig>): void {
    if (this.initialized) {
      logger.warn('TimeEventTrigger already initialized')
      return
    }

    if (config) {
      this.config = { ...this.config, ...config }
    }

    // 注册事件监听
    this.registerListeners()

    this.initialized = true
    logger.info('TimeEventTrigger initialized')
  }

  /**
   * 注册时钟事件监听
   */
  private registerListeners(): void {
    // 时段变化 → 触发时段相关事件
    this.unsubscribeCallbacks.push(
      gameClock.on('period_change', (event) => this.onPeriodChange(event)),
    )

    // 新一天 → 重置日常事件、触发每日检查
    this.unsubscribeCallbacks.push(
      gameClock.on('new_day', (event) => this.onNewDay(event)),
    )

    // 小时变化 → NPC日程同步 + 随机事件检查
    this.unsubscribeCallbacks.push(
      gameClock.on('hour_change', (event) => this.onHourChange(event)),
    )

    // 定时Tick → 低频检查
    this.unsubscribeCallbacks.push(
      gameClock.on('schedule_tick', (event) => this.onScheduleTick(event)),
    )
  }

  /**
   * 设置 Socket.IO 实例
   */
  setIo(io: any): void {
    this.io = io
  }

  // =============================================
  // 事件处理
  // =============================================

  /**
   * 时段变化处理
   */
  private onPeriodChange(event: TimeEvent): void {
    logger.info(`Period changed to ${event.period} (Day ${event.gameDay}, ${event.gameHour}:00)`)

    // 广播时段变化
    if (this.config.enablePeriodBroadcast && this.io) {
      this.io.emit('world:period_change', {
        period: event.period,
        oldPeriod: event.oldPeriod ?? null,
        gameDay: event.gameDay,
        gameHour: event.gameHour,
        message: this.getPeriodChangeMessage(event.period, event.oldPeriod),
      })
    }

    // 特殊时段处理
    switch (event.period) {
      case 'night':
        this.triggerNightEvents(event)
        break
      case 'dawn':
        this.triggerDawnEvents(event)
        break
      case 'morning':
        this.triggerMorningEvents(event)
        break
      case 'evening':
        this.triggerEveningEvents(event)
        break
    }
  }

  /**
   * 新一天处理
   */
  private onNewDay(event: TimeEvent): void {
    logger.info(`New day: Day ${event.gameDay}`)

    // 重置随机事件的触发记录
    this.activeWorldEvents.clear()

    // 广播新一天
    if (this.io) {
      this.io.emit('world:new_day', {
        gameDay: event.gameDay,
        message: `第 ${event.gameDay} 天开始了。`,
      })
    }

    // 触发每日NPC状态刷新
    this.refreshDailyNpcStates()
  }

  /**
   * 小时变化处理
   */
  private onHourChange(event: TimeEvent): void {
    logger.debug(`Hour changed: ${event.oldHour} → ${event.gameHour}`)

    // NPC日程同步
    if (this.config.enableScheduleSync) {
      this.syncNpcSchedules(event.gameHour)
    }

    // 随机事件检查
    if (this.config.enableRandomEvents) {
      this.checkRandomEvents(event)
    }

    // 广播小时变化
    if (this.io) {
      this.io.emit('world:hour_change', {
        gameHour: event.gameHour,
        oldHour: event.oldHour ?? null,
        gameDay: event.gameDay,
      })
    }
  }

  /**
   * 定时Tick处理
   */
  private onScheduleTick(_event: TimeEvent): void {
    // 低频检查：清理过期事件
    this.cleanupExpiredEvents()
  }

  // =============================================
  // NPC日程同步
  // =============================================

  /**
   * 同步NPC日程
   */
  private syncNpcSchedules(gameHour: number): void {
    const results = scheduleExecutor.executeAllSchedules(gameHour)

    for (const result of results) {
      if (result.changed && result.targetPosition) {
        logger.info(
          `[${result.npcId}] Schedule sync: ${result.currentAction} → ${result.targetLocation} ` +
          `(${result.targetPosition.x}, ${result.targetPosition.y})`,
        )

        // 真正创建移动任务，让NPC沿寻路走向日程地点
        // （不再是瞬移，由 npcMovementDriver 每 tick 推进并广播 npc:move）
        const moveTask = npcMovementSystem.createMoveTask(
          result.npcId,
          result.targetPosition,
          60,
        )

        // 广播NPC位置更新（标记日程切换，前端可同步）
        if (this.io) {
          this.io.emit('npc:update', {
            npcId: result.npcId,
            x: result.targetPosition.x,
            y: result.targetPosition.y,
            direction: 'down',
            action: result.currentAction,
            scheduleLocation: result.targetLocation,
            moving: !!moveTask,
          })
        }
      }
    }

    if (results.length > 0) {
      logger.info(`Schedule sync: ${results.length} NPCs updated for hour ${gameHour}`)
    }
  }

  // =============================================
  // 随机事件
  // =============================================

  /**
   * 检查并触发随机事件
   */
  private checkRandomEvents(event: TimeEvent): void {
    const currentPeriod = event.period

    for (const eventTemplate of RANDOM_EVENTS) {
      // 检查时段是否允许
      if (!eventTemplate.allowedPeriods.includes(currentPeriod)) continue

      // 检查冷却
      if (eventTemplate.lastTriggered) {
        const hoursSinceLast = this.calculateHoursSince(eventTemplate.lastTriggered)
        if (hoursSinceLast < eventTemplate.minIntervalHours) continue
      }

      // 概率检查
      const probability = currentPeriod === 'night'
        ? Math.max(eventTemplate.probability, this.config.nightEventProbability * 0.5)
        : eventTemplate.probability

      if (Math.random() < probability) {
        this.triggerRandomEvent(eventTemplate, event)
      }
    }
  }

  /**
   * 触发随机事件
   */
  private triggerRandomEvent(eventTemplate: RandomTimeEvent, timeEvent: TimeEvent): void {
    eventTemplate.lastTriggered = Date.now()

    logger.info(`Random event triggered: ${eventTemplate.name} (${eventTemplate.id})`)

    // 记录活跃事件
    this.activeWorldEvents.set(eventTemplate.id, {
      event: eventTemplate,
      triggeredAt: Date.now(),
    })

    // 广播事件
    if (this.io) {
      this.io.emit('world:event', {
        eventId: eventTemplate.id,
        eventName: eventTemplate.name,
        description: eventTemplate.description,
        period: timeEvent.period,
        gameDay: timeEvent.gameDay,
        gameHour: timeEvent.gameHour,
        timestamp: Date.now(),
      })
    }

    // 给附近NPC添加感知事件
    this.notifyNpcsOfEvent(eventTemplate)
  }

  /**
   * 通知NPC世界事件
   */
  private notifyNpcsOfEvent(event: RandomTimeEvent): void {
    const profiles = profileLoader.getAllProfiles().filter((p) => p.isActive)

    for (const profile of profiles) {
      profileLoader.addPerceivedEvent(profile.id, {
        type: 'world_event',
        sourceId: 'world',
        content: event.description,
        importance: 6,
        metadata: { eventId: event.id, eventName: event.name },
      })
    }
  }

  // =============================================
  // 特殊时段事件
  // =============================================

  private triggerNightEvents(event: TimeEvent): void {
    if (this.io) {
      this.io.emit('world:ambient', {
        type: 'night_fall',
        message: '夜幕降临，小镇的灯火逐渐亮起。',
        gameHour: event.gameHour,
      })
    }
  }

  private triggerDawnEvents(event: TimeEvent): void {
    if (this.io) {
      this.io.emit('world:ambient', {
        type: 'dawn_break',
        message: '黎明的阳光穿透薄雾，新的一天即将开始。',
        gameHour: event.gameHour,
      })
    }
  }

  private triggerMorningEvents(event: TimeEvent): void {
    // 早市开始
    if (this.io) {
      this.io.emit('world:ambient', {
        type: 'morning_market',
        message: '小镇的市场热闹起来，商贩们开始了一天的营业。',
        gameHour: event.gameHour,
      })
    }
  }

  private triggerEveningEvents(event: TimeEvent): void {
    if (this.io) {
      this.io.emit('world:ambient', {
        type: 'evening_glow',
        message: '夕阳西下，金色的余晖洒在小镇屋顶上。',
        gameHour: event.gameHour,
      })
    }
  }

  // =============================================
  // 每日NPC状态刷新
  // =============================================

  private refreshDailyNpcStates(): void {
    const profiles = profileLoader.getAllProfiles()

    for (const profile of profiles) {
      if (!profile.isActive) continue

      // 重置每日行为状态
      profileLoader.updateRuntimeState(profile.id, {
        currentAction: 'idle',
        lastUpdate: Date.now(),
        dailyInteractionCount: 0,
      })
    }

    logger.info(`Daily NPC states refreshed: ${profiles.length} NPCs`)
  }

  // =============================================
  // 辅助方法
  // =============================================

  /**
   * 计算距上次触发过了多少游戏小时
   */
  private calculateHoursSince(timestamp: number): number {
    // 简化估算：用真实时间差转换为游戏时间
    const realSecondsElapsed = (Date.now() - timestamp) / 1000
    const gameMinutesElapsed = realSecondsElapsed * gameClock.getTime().timeScale
    return gameMinutesElapsed / 60
  }

  /**
   * 获取时段变化提示语
   */
  private getPeriodChangeMessage(period: TimePeriod, _oldPeriod?: TimePeriod): string {
    const messages: Record<TimePeriod, string> = {
      dawn: '黎明破晓，天边泛起鱼肚白。',
      morning: '阳光明媚，小镇迎来了清晨。',
      afternoon: '午后的阳光温暖而慵懒。',
      evening: '夕阳西沉，暮色渐浓。',
      night: '夜幕降临，星辰点缀天空。',
    }
    return messages[period] ?? ''
  }

  /**
   * 清理过期事件
   */
  private cleanupExpiredEvents(): void {
    const now = Date.now()
    const expireMs = 30 * 60 * 1000 // 30分钟

    for (const [id, record] of this.activeWorldEvents) {
      if (now - record.triggeredAt > expireMs) {
        this.activeWorldEvents.delete(id)
      }
    }
  }

  // =============================================
  // 管理接口
  // =============================================

  /** 获取活跃事件列表 */
  getActiveEvents(): Array<{ id: string; name: string; triggeredAt: number }> {
    return Array.from(this.activeWorldEvents.values()).map((r) => ({
      id: r.event.id,
      name: r.event.name,
      triggeredAt: r.triggeredAt,
    }))
  }

  /** 手动触发随机事件 */
  forceTriggerEvent(eventId: string): boolean {
    const eventTemplate = RANDOM_EVENTS.find((e) => e.id === eventId)
    if (!eventTemplate) return false

    const timeState = gameClock.getTime()
    this.triggerRandomEvent(eventTemplate, {
      type: 'period_change',
      timestamp: Date.now(),
      gameDay: timeState.gameDay,
      gameTime: timeState.gameTime,
      period: timeState.period,
      gameHour: timeState.gameHour,
    })
    return true
  }

  /** 获取所有可用事件 */
  getAvailableEvents(): RandomTimeEvent[] {
    return [...RANDOM_EVENTS]
  }

  /** 更新配置 */
  updateConfig(config: Partial<TimeEventTriggerConfig>): void {
    this.config = { ...this.config, ...config }
  }

  /** 销毁 */
  destroy(): void {
    this.unsubscribeCallbacks.forEach((unsub) => unsub())
    this.unsubscribeCallbacks = []
    this.activeWorldEvents.clear()
    this.initialized = false
  }
}

/** 全局时间事件触发器实例 */
export const timeEventTrigger = new TimeEventTrigger()
