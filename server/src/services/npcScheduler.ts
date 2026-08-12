// 星火小镇 — NPC调度器
// T2.6.1 5秒Tick调度、优先级队列
// T5.3.1 NPC调度优化 — 分级策略集成、远处NPC暂停、动态Tick频率

import { createLogger } from '../utils/index.js'
import { profileLoader } from './profileLoader.js'
import { agentLoop, type AgentLoopResult } from './agentLoop.js'
import { reflectionService } from './reflectionService.js'
import { tieredUpdateStrategy, type UpdateTier } from './tieredUpdateStrategy.js'
import type { EnvironmentSnapshot } from './perceiveModule.js'
import { gameClock } from './gameClock.js'

const logger = createLogger('Scheduler')

// =============================================
// 类型定义
// =============================================

/** NPC调度优先级 */
export type SchedulePriority = 'critical' | 'high' | 'normal' | 'low' | 'idle'

/** NPC调度条目 */
export interface NpcScheduleEntry {
  /** NPC ID */
  npcId: string
  /** 调度优先级 */
  priority: SchedulePriority
  /** 优先级分数（自动计算） */
  priorityScore: number
  /** 调度原因 */
  reason: string
  /** 上次执行时间戳 */
  lastExecuted: number
  /** 下次计划执行时间戳 */
  nextExecution: number
}

/** 调度器统计 */
export interface SchedulerStats {
  /** Tick编号 */
  tick: number
  /** 总NPC数 */
  totalNpcs: number
  /** 本Tick已调度 */
  scheduled: number
  /** 本Tick已跳过 */
  skipped: number
  /** 当前活跃NPC数 */
  activeNpcs: number
  /** 调度器运行时间(ms) */
  uptime: number
  /** 平均每Tick耗时(ms) */
  avgTickDuration: number
  /** 各分级NPC数量 */
  tierCounts: Record<UpdateTier, number>
  /** 暂停NPC数量 */
  pausedCount: number
  /** 动态Tick间隔(ms) */
  currentTickInterval: number
  /** 分级策略生效次数 */
  tieredEffectiveCount: number
  /** 远处NPC暂停验证（上次Tick paused数） */
  lastPausedCount: number
}

/** 调度器配置 */
export interface SchedulerConfig {
  /** Tick间隔（毫秒），默认5000 */
  tickInterval: number
  /** 每Tick最大执行NPC数，默认8 */
  maxExecPerTick: number
  /** 是否启用反思触发，默认true */
  enableReflection: boolean
  /** 是否启用分级更新，默认true */
  enableTieredUpdate: boolean
  /** 是否启用动态Tick频率（根据负载自动调整），默认true */
  enableDynamicTick: boolean
  /** 高负载Tick耗时阈值(ms)，默认2000 */
  highLoadThreshold: number
  /** 低负载Tick耗时阈值(ms)，默认200 */
  lowLoadThreshold: number
  /** 最大Tick间隔(ms)，默认10000 */
  maxTickInterval: number
  /** 最小Tick间隔(ms)，默认3000 */
  minTickInterval: number
}

// =============================================
// NPC调度器
// =============================================

/**
 * NpcScheduler — NPC调度器
 *
 * 职责：
 * 1. 每5秒一个Tick，决定哪些NPC需要执行Agent循环
 * 2. 优先级队列：正在对话的NPC > 附近有玩家的NPC > 空闲NPC
 * 3. 与并发控制模块协作，控制同时活跃的NPC数量
 * 4. 触发反思和记忆维护任务
 */
class NpcScheduler {
  /** 配置 */
  private config: SchedulerConfig = {
    tickInterval: 5000,
    maxExecPerTick: 8,
    enableReflection: true,
    enableTieredUpdate: true,
    enableDynamicTick: true,
    highLoadThreshold: 2000,
    lowLoadThreshold: 200,
    maxTickInterval: 10000,
    minTickInterval: 3000,
  }

  /** 当前实际Tick间隔（动态调整） */
  private currentTickInterval = 5000

  /** Tick计数器 */
  private tickCount = 0

  /** 调度定时器 */
  private schedulerTimer: ReturnType<typeof setInterval> | null = null

  /** NPC调度表 */
  private scheduleTable: Map<string, NpcScheduleEntry> = new Map()

  /** 上次Tick时间 */
  private _lastTickTime = 0

  /** Tick耗时记录（最近10次） */
  private tickDurations: number[] = []

  /** 调度器启动时间 */
  private startTime = 0

  /** 是否正在运行 */
  private isRunning = false

  /** 当前环境快照 */
  private currentEnvironment: EnvironmentSnapshot | null = null

  /** 本Tick执行结果 */
  private lastTickResults: AgentLoopResult[] = []

  /** 分级策略更新计数器（每5个Tick更新一次策略） */
  private tieredUpdateCounter = 0

  /** 本Tick暂停跳过的NPC数量 */
  private _pausedSkippedCount = 0

  /** 分级策略生效验证：记录连续有效分级次数 */
  private tieredEffectiveCount = 0

  /** 性能采样：每Tick执行详情 */
  private tickDetails: Array<{
    tick: number
    scheduled: number
    skipped: number
    paused: number
    duration: number
    tierDistribution: Record<UpdateTier, number>
  }> = []

  // =============================================
  // 调度器生命周期
  // =============================================

  /**
   * 启动调度器
   */
  start(config?: Partial<SchedulerConfig>): void {
    if (this.isRunning) {
      logger.warn('Scheduler already running')
      return
    }

    if (config) {
      this.config = { ...this.config, ...config }
    }

    this.isRunning = true
    this.startTime = Date.now()

    // 初始化调度表
    this.initializeScheduleTable()

    // 启动Tick定时器
    this.currentTickInterval = this.config.tickInterval
    this.scheduleNextTick()

    logger.info(
      `Scheduler started (interval: ${this.currentTickInterval}ms, maxExec: ${this.config.maxExecPerTick}, tiered: ${this.config.enableTieredUpdate})`,
    )
  }

  /**
   * 调度下一次Tick
   */
  private scheduleNextTick(): void {
    this.schedulerTimer = setTimeout(() => {
      this.tick().then(() => this.scheduleNextTick()).catch((err) => {
        logger.error(`Tick ${this.tickCount} error: ${(err as Error).message}`)
        this.scheduleNextTick()
      })
    }, this.currentTickInterval) as unknown as ReturnType<typeof setInterval>
  }

  /**
   * 停止调度器
   */
  stop(): void {
    if (this.schedulerTimer) {
      clearTimeout(this.schedulerTimer as unknown as number)
      this.schedulerTimer = null
    }

    this.isRunning = false
    logger.info(`Scheduler stopped after ${this.tickCount} ticks`)
  }

  // =============================================
  // 核心：Tick 执行
  // =============================================

  /**
   * 执行一次调度Tick
   */
  async tick(): Promise<void> {
    const tickStart = Date.now()
    this.tickCount++
    this._lastTickTime = tickStart
    this.lastTickResults = []

    // 1. 更新环境快照
    this.updateEnvironment()

    // 2. 每5个Tick更新一次分级策略
    if (this.config.enableTieredUpdate) {
      this.tieredUpdateCounter++
      if (this.tieredUpdateCounter % 5 === 0) {
        tieredUpdateStrategy.updateAllPolicies()
      }
    }

    // 3. 计算NPC优先级
    const entries = this.computePriorities()

    // 4. 按优先级排序
    entries.sort((a, b) => b.priorityScore - a.priorityScore)

    // 5. 选取本Tick要执行的NPC（过滤paused + 分级策略生效验证）
    let pausedCount = 0
    let tierFilteredCount = 0
    const eligibleEntries = this.config.enableTieredUpdate
      ? entries.filter((entry) => {
          const tier = tieredUpdateStrategy.getTier(entry.npcId)
          if (tier === 'paused') {
            pausedCount++
            return false
          }
          if (!tieredUpdateStrategy.shouldUpdate(entry.npcId)) {
            tierFilteredCount++
            return false
          }
          return true
        })
      : entries

    // 分级策略生效验证：如果分级过滤生效，记录
    if (this.config.enableTieredUpdate && (pausedCount > 0 || tierFilteredCount > 0)) {
      this.tieredEffectiveCount++
    }

    this._pausedSkippedCount = pausedCount

    const toExecute = eligibleEntries.slice(0, this.config.maxExecPerTick)

    let scheduled = 0
    let skipped = 0

    // 5. 执行Agent循环
    for (const entry of toExecute) {
      // 跳过正在活跃的NPC（并发控制）
      if (agentLoop.isActive(entry.npcId)) {
        skipped++
        continue
      }

      // 跳过冷却中的NPC
      if (tickStart < entry.nextExecution) {
        skipped++
        continue
      }

      try {
        const result = await this.executeNpc(entry)
        this.lastTickResults.push(result)
        scheduled++

        entry.lastExecuted = tickStart
        entry.nextExecution = this.calculateNextExecution(entry)

        if (this.config.enableTieredUpdate) {
          tieredUpdateStrategy.markUpdated(entry.npcId)
        }
      } catch (err) {
        logger.error(`[${entry.npcId}] Execution failed: ${(err as Error).message}`)
        skipped++
      }
    }

    // 6. 定期触发反思（每10个Tick）
    if (this.config.enableReflection && this.tickCount % 10 === 0) {
      reflectionService
        .batchReflection()
        .catch((err) => logger.error(`Batch reflection failed: ${(err as Error).message}`))
    }

    // 7. 记录Tick耗时
    const tickDuration = Date.now() - tickStart
    this.tickDurations.push(tickDuration)
    if (this.tickDurations.length > 10) {
      this.tickDurations.shift()
    }

    // 8. 动态调整Tick频率
    if (this.config.enableDynamicTick) {
      this.adjustTickInterval(tickDuration)
    }

    // 9. 记录Tick详情采样（最近20次）
    const tierCounts = this.config.enableTieredUpdate
      ? tieredUpdateStrategy.getStats().tierCounts
      : { high: 0, medium: 0, low: 0, paused: 0 } as Record<UpdateTier, number>
    this.tickDetails.push({
      tick: this.tickCount,
      scheduled,
      skipped,
      paused: pausedCount,
      duration: tickDuration,
      tierDistribution: tierCounts,
    })
    if (this.tickDetails.length > 20) {
      this.tickDetails.shift()
    }

    logger.debug(
      `Tick ${this.tickCount}: ${scheduled} scheduled, ${skipped} skipped, ${pausedCount} paused, ${tierFilteredCount} tier-filtered, ${tickDuration}ms (interval: ${this.currentTickInterval}ms)`,
    )
  }

  // =============================================
  // 优先级计算
  // =============================================

  /**
   * 计算所有NPC的调度优先级
   */
  private computePriorities(): NpcScheduleEntry[] {
    const profiles = profileLoader.getAllProfiles()
    const entries: NpcScheduleEntry[] = []

    for (const profile of profiles) {
      if (!profile.isActive) continue

      let entry = this.scheduleTable.get(profile.id)

      if (!entry) {
        entry = {
          npcId: profile.id,
          priority: 'normal',
          priorityScore: 0,
          reason: '',
          lastExecuted: 0,
          nextExecution: 0,
        }
      }

      // 计算优先级分数
      const runtimeState = profileLoader.getRuntimeState(profile.id)
      let score = 50 // 基础分
      let reason = 'normal'

      // 正在对话 → 最高优先级
      if (runtimeState?.talkingTo) {
        score = 100
        reason = 'in_dialogue'
        entry.priority = 'critical'
      }
      // 正在移动 → 高优先级
      else if (runtimeState?.currentAction === 'walking' || runtimeState?.currentAction === 'move') {
        score = 80
        reason = 'moving'
        entry.priority = 'high'
      }
      // 正在工作 → 中高优先级
      else if (runtimeState?.currentAction === 'working') {
        score = 70
        reason = 'working'
        entry.priority = 'high'
      }
      // 附近有玩家 → 较高优先级（使用分级策略距离）
      else if (this.isNearPlayer(profile.id)) {
        score = 75
        reason = 'near_player'
        entry.priority = 'high'
      }
      // 分级策略决定的中频NPC
      else if (this.config.enableTieredUpdate && tieredUpdateStrategy.getTier(profile.id) === 'medium') {
        score = 55
        reason = 'medium_tier'
        entry.priority = 'normal'
      }
      // 日程切换时间点 → 较高优先级
      else if (this.isScheduleTransition(profile.id)) {
        score = 65
        reason = 'schedule_transition'
        entry.priority = 'high'
      }
      // 低频NPC → 低优先级
      else if (this.config.enableTieredUpdate && tieredUpdateStrategy.getTier(profile.id) === 'low') {
        score = 25
        reason = 'low_tier'
        entry.priority = 'low'
      }
      // 空闲NPC → 最低优先级
      else {
        score = 15
        reason = 'idle'
        entry.priority = 'idle'
      }

      // 时效性加成：越久没执行越优先
      const timeSinceLastExec = Date.now() - entry.lastExecuted
      const stalenessBonus = Math.min(20, timeSinceLastExec / 30000) // 最多+20分
      score += stalenessBonus

      entry.priorityScore = Math.round(score * 10) / 10
      entry.reason = reason

      entries.push(entry)
      this.scheduleTable.set(profile.id, entry)
    }

    return entries
  }

  // =============================================
  // NPC执行
  // =============================================

  /**
   * 执行单个NPC的Agent循环
   */
  private async executeNpc(entry: NpcScheduleEntry): Promise<AgentLoopResult> {
    const environment = this.currentEnvironment ?? this.getDefaultEnvironment(entry.npcId)

    return agentLoop.runAutonomousLoop(entry.npcId, environment)
  }

  // =============================================
  // 辅助方法
  // =============================================

  /** 初始化调度表 */
  private initializeScheduleTable(): void {
    const profiles = profileLoader.getAllProfiles()

    for (const profile of profiles) {
      this.scheduleTable.set(profile.id, {
        npcId: profile.id,
        priority: 'normal',
        priorityScore: 50,
        reason: 'initialized',
        lastExecuted: 0,
        nextExecution: 0,
      })
    }

    logger.info(`Initialized schedule table with ${profiles.length} NPCs`)
  }

  /** 更新环境快照 */
  private updateEnvironment(): void {
    const gameTime = gameClock.getTime()
    this.currentEnvironment = {
      gameHour: gameTime.gameHour,
      gameDay: gameTime.gameDay,
      currentArea: '广场',
      weather: '晴朗',
      nearbyEntities: [],
      globalEvents: [],
    }
  }

  /** 获取默认环境 */
  private getDefaultEnvironment(_npcId: string): EnvironmentSnapshot {
    const gameTime = gameClock.getTime()
    return {
      gameHour: gameTime.gameHour,
      gameDay: gameTime.gameDay,
      currentArea: '广场',
      weather: '晴朗',
      nearbyEntities: [],
      globalEvents: [],
    }
  }

  /** 检查NPC是否靠近玩家（基于分级策略距离计算） */
  private isNearPlayer(npcId: string): boolean {
    if (!this.config.enableTieredUpdate) return false
    const tier = tieredUpdateStrategy.getTier(npcId)
    return tier === 'high'
  }

  /** 检查是否是NPC日程切换时间（基于游戏时间） */
  private isScheduleTransition(npcId: string): boolean {
    const gameTime = gameClock.getTime()
    const schedule = profileLoader.getCurrentScheduleItem(npcId, gameTime.gameHour)
    return schedule !== null
  }

  /** 计算下次执行时间 */
  private calculateNextExecution(entry: NpcScheduleEntry): number {
    const base = Date.now()
    switch (entry.priority) {
      case 'critical':
        return base // 立即执行
      case 'high':
        return base + 2000 // 2秒
      case 'normal':
        return base + 5000 // 5秒
      case 'low':
        return base + 10000 // 10秒
      case 'idle':
        return base + 30000 // 30秒
      default:
        return base + 5000
    }
  }

  // =============================================
  // 管理接口
  // =============================================

  /** 更新玩家位置（供外部调用） */
  updatePlayerPosition(playerId: string, x: number, y: number): void {
    if (this.config.enableTieredUpdate) {
      tieredUpdateStrategy.updatePlayerPosition(playerId, x, y)
    }
  }

  /** 移除玩家 */
  removePlayer(playerId: string): void {
    if (this.config.enableTieredUpdate) {
      tieredUpdateStrategy.removePlayer(playerId)
    }
  }

  /**
   * 动态调整Tick间隔
   * 高负载时延长间隔，低负载时缩短间隔
   */
  private adjustTickInterval(tickDuration: number): void {
    const avgDuration =
      this.tickDurations.length > 0
        ? this.tickDurations.reduce((a, b) => a + b, 0) / this.tickDurations.length
        : tickDuration

    if (avgDuration > this.config.highLoadThreshold) {
      this.currentTickInterval = Math.min(
        this.config.maxTickInterval,
        this.currentTickInterval * 1.2,
      )
    } else if (avgDuration < this.config.lowLoadThreshold) {
      this.currentTickInterval = Math.max(
        this.config.minTickInterval,
        this.currentTickInterval * 0.9,
      )
    }
  }

  /** 获取调度器统计 */
  getStats(): SchedulerStats {
    const avgDuration =
      this.tickDurations.length > 0
        ? this.tickDurations.reduce((a, b) => a + b, 0) / this.tickDurations.length
        : 0

    const tieredStats = this.config.enableTieredUpdate
      ? tieredUpdateStrategy.getStats()
      : { tierCounts: { high: 0, medium: 0, low: 0, paused: 0 } as Record<UpdateTier, number> }

    return {
      tick: this.tickCount,
      totalNpcs: this.scheduleTable.size,
      scheduled: this.lastTickResults.filter((r) => r.success).length,
      skipped: this._pausedSkippedCount,
      activeNpcs: agentLoop.getActiveNpcIds().length,
      uptime: this.isRunning ? Date.now() - this.startTime : 0,
      avgTickDuration: Math.round(avgDuration),
      tierCounts: tieredStats.tierCounts,
      pausedCount: tieredStats.tierCounts.paused ?? 0,
      currentTickInterval: this.currentTickInterval,
      tieredEffectiveCount: this.tieredEffectiveCount,
      lastPausedCount: this._pausedSkippedCount,
    }
  }

  /** 获取调度表 */
  getScheduleTable(): NpcScheduleEntry[] {
    return Array.from(this.scheduleTable.values())
  }

  /** 手动触发NPC执行 */
  async forceExecute(npcId: string): Promise<AgentLoopResult> {
    const environment = this.currentEnvironment ?? this.getDefaultEnvironment(npcId)
    return agentLoop.runAutonomousLoop(npcId, environment)
  }

  /** 手动触发反思 */
  async forceReflection(npcId: string) {
    return reflectionService.generateReflection(npcId)
  }

  /** 更新配置 */
  updateConfig(config: Partial<SchedulerConfig>): void {
    this.config = { ...this.config, ...config }
    logger.info('Scheduler config updated')
  }

  /** 获取上次Tick时间 */
  getLastTickTime(): number {
    return this._lastTickTime
  }

  /** 检查是否正在运行 */
  get running(): boolean {
    return this.isRunning
  }
}

/** 全局NPC调度器实例 */
export const npcScheduler = new NpcScheduler()
