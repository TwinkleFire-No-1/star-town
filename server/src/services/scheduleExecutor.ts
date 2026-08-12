// 星火小镇 — 日程表执行器
// T2.8.1 读取日程JSON→触发位置移动+行为动画

import { createLogger } from '../utils/index.js'
import { profileLoader } from './profileLoader.js'
import type { ScheduleItem } from '../types/npc-profile.js'

const logger = createLogger('ScheduleExecutor')

// =============================================
// 类型定义
// =============================================

/** 日程执行状态 */
export type ScheduleState = 'idle' | 'moving' | 'arrived' | 'working' | 'transitioning'

/** 日程执行结果 */
export interface ScheduleExecutionResult {
  /** NPC ID */
  npcId: string
  /** 执行前状态 */
  previousAction: string
  /** 执行后状态 */
  currentAction: string
  /** 当前日程项 */
  scheduleItem: ScheduleItem | null
  /** 目标位置 */
  targetLocation: string | null
  /** 目标坐标 */
  targetPosition: { x: number; y: number } | null
  /** 是否发生变化 */
  changed: boolean
  /** 时间戳 */
  timestamp: number
}

/** 日程执行器配置 */
export interface ScheduleExecutorConfig {
  /** 是否启用日程执行，默认true */
  enabled: boolean
  /** 日程切换提前量（分钟），默认5 */
  transitionLeadTime: number
  /** 移动速度（像素/秒），默认240（1920×1080 世界坐标） */
  moveSpeed: number
  /** 到达距离阈值（像素），默认10 */
  arrivalThreshold: number
}

// =============================================
// 区域坐标映射
// =============================================

/** 区域→中心坐标映射（对齐前端 1920×1664 地图：30×26 tiles × 64px） */
const AREA_POSITIONS: Record<string, { x: number; y: number }> = {
  '广场': { x: 992, y: 704 },
  '小镇广场': { x: 992, y: 704 },
  '小镇各处': { x: 992, y: 704 },
  '市场': { x: 352, y: 1120 },
  '集市': { x: 352, y: 1120 },
  '酒馆': { x: 1600, y: 1120 },
  '酒馆大厅': { x: 1600, y: 1088 },
  '酒馆厨房': { x: 1632, y: 1024 },
  '酒馆后院': { x: 1696, y: 1184 },
  '铁匠铺': { x: 352, y: 288 },
  '药草铺': { x: 1632, y: 288 },
  '药草园': { x: 1632, y: 224 },
  '教堂': { x: 928, y: 288 },
  '长老大厅': { x: 928, y: 288 },
  '磨坊': { x: 352, y: 1120 },
  '森林入口': { x: 288, y: 800 },
  '森林': { x: 224, y: 800 },
  '森林深处': { x: 192, y: 736 },
  '森林边缘': { x: 256, y: 800 },
  '镇门口': { x: 992, y: 1568 },
  '矿洞入口': { x: 224, y: 800 },
  '矿洞': { x: 192, y: 736 },
  '矿洞休息区': { x: 256, y: 800 },
  '图书馆': { x: 1632, y: 288 },
  '卫兵所': { x: 928, y: 288 },
  '小镇巡逻': { x: 992, y: 704 },
  '花园': { x: 352, y: 1120 },
  '花店': { x: 352, y: 1120 },
  '面包房': { x: 352, y: 1184 },
  '隐居小屋': { x: 1632, y: 288 },
  '家': { x: 928, y: 1280 },
  '森林暗处': { x: 160, y: 672 },
}

// =============================================
// 日程表执行器
// =============================================

/**
 * ScheduleExecutor — 日程表执行器
 *
 * 职责：
 * 1. 读取NPC日程表（JSON格式）
 * 2. 根据当前游戏时间判断应执行的日程项
 * 3. 触发NPC移动到日程指定位置
 * 4. 触发日程指定行为动画（工作/待机/特殊行为）
 * 5. 处理日程切换时的过渡动画
 * 6. 与移动系统协同实现NPC从A→B的移动
 */
class ScheduleExecutor {
  /** 配置 */
  private config: ScheduleExecutorConfig = {
    enabled: true,
    transitionLeadTime: 5,
    moveSpeed: 240,
    arrivalThreshold: 10,
  }

  /** NPC当前日程状态 */
  private scheduleStates: Map<string, {
    state: ScheduleState
    currentScheduleItem: ScheduleItem | null
    targetScheduleItem: ScheduleItem | null
    lastScheduleHour: number
  }> = new Map()

  /** 上次执行的日程小时 */
  private lastExecutedHour: Map<string, number> = new Map()

  // =============================================
  // 核心：日程执行
  // =============================================

  /**
   * 更新并执行NPC日程 — 每个Tick调用
   * @param npcId - NPC ID
   * @param gameHour - 当前游戏小时
   */
  executeSchedule(npcId: string, gameHour: number): ScheduleExecutionResult {
    if (!this.config.enabled) {
      return this.createIdleResult(npcId)
    }

    const profile = profileLoader.getProfile(npcId)
    if (!profile || !profile.isActive) {
      return this.createIdleResult(npcId)
    }

    const runtimeState = profileLoader.getRuntimeState(npcId)

    // 如果NPC正在对话中，不执行日程
    if (runtimeState?.talkingTo) {
      return {
        npcId,
        previousAction: runtimeState.currentAction,
        currentAction: 'talking',
        scheduleItem: null,
        targetLocation: null,
        targetPosition: null,
        changed: false,
        timestamp: Date.now(),
      }
    }

    // 获取当前应执行的日程项
    const currentSchedule = this.getCurrentSchedule(npcId, gameHour)

    // 检查是否需要切换日程
    const lastHour = this.lastExecutedHour.get(npcId) ?? -1
    const scheduleChanged = lastHour !== gameHour && currentSchedule !== null

    if (scheduleChanged) {
      // 日程切换 → 触发移动和行为变化
      const previousAction = runtimeState?.currentAction ?? 'idle'
      const targetPos = AREA_POSITIONS[currentSchedule.location] ?? null

      // 更新日程状态
      this.scheduleStates.set(npcId, {
        state: 'transitioning',
        currentScheduleItem: currentSchedule,
        targetScheduleItem: currentSchedule,
        lastScheduleHour: gameHour,
      })

      this.lastExecutedHour.set(npcId, gameHour)

      // 更新NPC运行时状态
      profileLoader.updateRuntimeState(npcId, {
        currentAction: 'walking',
        lastUpdate: Date.now(),
      })

      // 添加感知事件
      profileLoader.addPerceivedEvent(npcId, {
        type: 'time_event',
        sourceId: 'schedule',
        content: `日程切换：${currentSchedule.action}（${currentSchedule.location}）`,
        importance: 4,
      })

      logger.info(
        `[${npcId}] Schedule: ${currentSchedule.action} at ${currentSchedule.location} ` +
        `(hour=${gameHour})`,
      )

      return {
        npcId,
        previousAction,
        currentAction: 'walking',
        scheduleItem: currentSchedule,
        targetLocation: currentSchedule.location,
        targetPosition: targetPos,
        changed: true,
        timestamp: Date.now(),
      }
    }

    // 没有日程变化，返回当前状态
    const scheduleState = this.scheduleStates.get(npcId)
    const currentScheduleItem = scheduleState?.currentScheduleItem ?? currentSchedule

    return {
      npcId,
      previousAction: runtimeState?.currentAction ?? 'idle',
      currentAction: runtimeState?.currentAction ?? 'idle',
      scheduleItem: currentScheduleItem,
      targetLocation: currentScheduleItem?.location ?? null,
      targetPosition: currentScheduleItem ? (AREA_POSITIONS[currentScheduleItem.location] ?? null) : null,
      changed: false,
      timestamp: Date.now(),
    }
  }

  /**
   * 批量执行所有NPC的日程
   */
  executeAllSchedules(gameHour: number): ScheduleExecutionResult[] {
    const results: ScheduleExecutionResult[] = []
    const profiles = profileLoader.getAllProfiles().filter((p) => p.isActive)

    for (const profile of profiles) {
      const result = this.executeSchedule(profile.id, gameHour)
      if (result.changed) {
        results.push(result)
      }
    }

    return results
  }

  // =============================================
  // 日程查询
  // =============================================

  /**
   * 获取NPC当前日程项
   */
  getCurrentSchedule(npcId: string, gameHour: number): ScheduleItem | null {
    return profileLoader.getCurrentScheduleItem(npcId, gameHour)
  }

  /**
   * 获取NPC下一个日程项
   */
  getNextSchedule(npcId: string, gameHour: number): ScheduleItem | null {
    const profile = profileLoader.getProfile(npcId)
    if (!profile || profile.schedule.length === 0) return null

    for (const item of profile.schedule) {
      if (item.hour > gameHour) {
        return item
      }
    }

    // 循环：返回第一个日程
    return profile.schedule[0]
  }

  /**
   * 获取NPC当前日程项（驱动用，基于当前游戏时间）
   */
  getCurrentScheduleForNpc(npcId: string): ScheduleItem | null {
    const profile = profileLoader.getProfile(npcId)
    if (!profile || profile.schedule.length === 0) return null

    // 从 gameClock 获取当前小时
    // 为避免循环依赖，由外部注入当前小时；这里使用简单的时间推算：
    // 若未注入，默认返回第一个日程
    const hour = this.currentHourProvider ? this.currentHourProvider() : 0
    if (hour > 0) {
      return profileLoader.getCurrentScheduleItem(npcId, hour)
    }
    return profile.schedule[0] ?? null
  }

  /** 当前小时提供器（由 index.ts 注入，避免循环依赖） */
  private currentHourProvider: (() => number) | null = null

  /** 注入当前游戏小时提供器 */
  setHourProvider(provider: () => number): void {
    this.currentHourProvider = provider
  }

  /**
   * 获取指定位置的所有NPC（按日程）
   */
  getNpcsAtLocation(location: string, gameHour: number): string[] {
    const profiles = profileLoader.getAllProfiles().filter((p) => p.isActive)
    const npcIds: string[] = []

    for (const profile of profiles) {
      const schedule = this.getCurrentSchedule(profile.id, gameHour)
      if (schedule?.location === location) {
        npcIds.push(profile.id)
      }
    }

    return npcIds
  }

  // =============================================
  // 辅助方法
  // =============================================

  /**
   * 获取区域坐标
   */
  getAreaPosition(areaName: string): { x: number; y: number } | null {
    return AREA_POSITIONS[areaName] ?? null
  }

  /**
   * 注册新的区域坐标
   */
  registerAreaPosition(areaName: string, x: number, y: number): void {
    AREA_POSITIONS[areaName] = { x, y }
  }

  /**
   * 创建空闲结果
   */
  private createIdleResult(npcId: string): ScheduleExecutionResult {
    return {
      npcId,
      previousAction: 'idle',
      currentAction: 'idle',
      scheduleItem: null,
      targetLocation: null,
      targetPosition: null,
      changed: false,
      timestamp: Date.now(),
    }
  }

  // =============================================
  // 配置与状态
  // =============================================

  /** 获取NPC日程状态 */
  getScheduleState(npcId: string): ScheduleState {
    return this.scheduleStates.get(npcId)?.state ?? 'idle'
  }

  /** 更新配置 */
  updateConfig(config: Partial<ScheduleExecutorConfig>): void {
    this.config = { ...this.config, ...config }
  }

  /** 获取所有区域坐标 */
  getAllAreaPositions(): Record<string, { x: number; y: number }> {
    return { ...AREA_POSITIONS }
  }
}

/** 全局日程表执行器实例 */
export const scheduleExecutor = new ScheduleExecutor()
