// 星火小镇 — 交互触发引擎
// T2.7.1 日程交集/主动寻人/随机社交/事件驱动

import { createLogger } from '../utils/index.js'
import { profileLoader } from './profileLoader.js'

const logger = createLogger('InteractionTrigger')

// =============================================
// 类型定义
// =============================================

/** 交互触发类型 */
export type InteractionTriggerType =
  | 'schedule_overlap'   // 日程交集：两个NPC同一时间在同一地点
  | 'active_seek'       // 主动寻人：NPC因目标/情绪主动寻找其他NPC
  | 'random_social'     // 随机社交：空闲NPC随机与其他空闲NPC交流
  | 'event_driven'      // 事件驱动：特殊事件触发NPC交互
  | 'proximity'         // 接近触发：两个NPC靠近时自动触发

/** 交互触发条件 */
export interface InteractionTrigger {
  /** 触发类型 */
  type: InteractionTriggerType
  /** 发起NPC ID */
  initiatorId: string
  /** 目标NPC ID */
  targetId: string
  /** 触发原因描述 */
  reason: string
  /** 优先级（0=最高） */
  priority: number
  /** 触发时间戳 */
  timestamp: number
  /** 额外上下文 */
  context?: Record<string, unknown>
}

/** 交互触发配置 */
export interface InteractionTriggerConfig {
  /** 随机社交概率（每个Tick每NPC），默认0.05 */
  randomSocialChance: number
  /** 接近触发距离（像素），默认80 */
  proximityDistance: number
  /** 每Tick最大触发交互数，默认3 */
  maxTriggersPerTick: number
  /** 同一对NPC交互冷却时间（秒），默认300 */
  interactionCooldown: number
  /** 是否启用日程交集触发，默认true */
  enableScheduleOverlap: boolean
  /** 是否启用随机社交，默认true */
  enableRandomSocial: boolean
  /** 是否启用接近触发，默认true */
  enableProximity: boolean
}

/** 触发引擎统计 */
export interface TriggerEngineStats {
  /** 总触发次数 */
  totalTriggers: number
  /** 各类型触发次数 */
  triggersByType: Record<InteractionTriggerType, number>
  /** 上次检查时间 */
  lastCheckTime: number
  /** 活跃的触发队列长度 */
  pendingQueueSize: number
}

// =============================================
// 交互触发引擎
// =============================================

/**
 * InteractionTriggerEngine — NPC交互触发引擎
 *
 * 职责：
 * 1. 日程交集触发：当两个NPC日程在同一时间同一地点时，触发交互
 * 2. 主动寻人：NPC因目标/情绪需要，主动寻找其他NPC
 * 3. 随机社交：空闲NPC随机选择其他空闲NPC交流
 * 4. 事件驱动：特殊事件（如任务完成、战斗结束）触发NPC交互
 * 5. 接近触发：两个NPC靠近时自动触发对话
 * 6. 冷却管理：防止同一对NPC频繁交互
 */
class InteractionTriggerEngine {
  /** 配置 */
  private config: InteractionTriggerConfig = {
    randomSocialChance: 0.05,
    proximityDistance: 80,
    maxTriggersPerTick: 3,
    interactionCooldown: 300,
    enableScheduleOverlap: true,
    enableRandomSocial: true,
    enableProximity: true,
  }

  /** 交互冷却表 (key: "npcA-npcB" sorted) */
  private cooldowns: Map<string, number> = new Map()

  /** 统计 */
  private stats = {
    totalTriggers: 0,
    triggersByType: {
      schedule_overlap: 0,
      active_seek: 0,
      random_social: 0,
      event_driven: 0,
      proximity: 0,
    } as Record<InteractionTriggerType, number>,
    lastCheckTime: 0,
  }

  /** 待处理触发队列 */
  private pendingQueue: InteractionTrigger[] = []

  // =============================================
  // 核心：检测交互触发
  // =============================================

  /**
   * 执行一次完整的触发检测 — 在每个调度器Tick中调用
   * @param gameHour - 当前游戏小时
   * @returns 本Tick产生的交互触发列表
   */
  detectTriggers(gameHour: number): InteractionTrigger[] {
    const triggers: InteractionTrigger[] = []
    this.stats.lastCheckTime = Date.now()

    // 1. 日程交集触发
    if (this.config.enableScheduleOverlap) {
      const scheduleTriggers = this.detectScheduleOverlaps(gameHour)
      triggers.push(...scheduleTriggers)
    }

    // 2. 随机社交触发
    if (this.config.enableRandomSocial) {
      const randomTriggers = this.detectRandomSocial()
      triggers.push(...randomTriggers)
    }

    // 3. 接近触发
    if (this.config.enableProximity) {
      const proximityTriggers = this.detectProximity()
      triggers.push(...proximityTriggers)
    }

    // 4. 主动寻人
    const seekTriggers = this.detectActiveSeek()
    triggers.push(...seekTriggers)

    // 过滤冷却中的交互
    const validTriggers = triggers.filter((t) => !this.isOnCooldown(t.initiatorId, t.targetId))

    // 按优先级排序
    validTriggers.sort((a, b) => a.priority - b.priority)

    // 限制每Tick触发数
    const limitedTriggers = validTriggers.slice(0, this.config.maxTriggersPerTick)

    // 加入队列
    this.pendingQueue.push(...limitedTriggers)

    // 更新统计
    for (const trigger of limitedTriggers) {
      this.stats.totalTriggers++
      this.stats.triggersByType[trigger.type]++
      // 设置冷却
      this.setCooldown(trigger.initiatorId, trigger.targetId)
    }

    return limitedTriggers
  }

  // =============================================
  // 各类触发检测
  // =============================================

  /**
   * 日程交集触发 — 当两个NPC日程在同一时间同一地点
   */
  private detectScheduleOverlaps(gameHour: number): InteractionTrigger[] {
    const triggers: InteractionTrigger[] = []
    const profiles = profileLoader.getAllProfiles()

    // 构建位置→NPC映射
    const locationMap: Map<string, string[]> = new Map()

    for (const profile of profiles) {
      if (!profile.isActive) continue

      const schedule = profileLoader.getCurrentScheduleItem(profile.id, gameHour)
      if (schedule) {
        const loc = schedule.location
        if (!locationMap.has(loc)) {
          locationMap.set(loc, [])
        }
        locationMap.get(loc)!.push(profile.id)
      }
    }

    // 同一地点2+NPC → 可能触发交互
    for (const [location, npcIds] of locationMap) {
      if (npcIds.length < 2) continue

      // 从同一地点的NPC中随机选一对
      for (let i = 0; i < npcIds.length - 1; i++) {
        for (let j = i + 1; j < npcIds.length; j++) {
          const initiatorId = npcIds[i]
          const targetId = npcIds[j]

          // 检查双方是否都空闲
          const initRuntime = profileLoader.getRuntimeState(initiatorId)
          const targetRuntime = profileLoader.getRuntimeState(targetId)

          if (initRuntime?.talkingTo || targetRuntime?.talkingTo) continue
          if (initRuntime?.currentAction === 'talking' || targetRuntime?.currentAction === 'talking') continue

          triggers.push({
            type: 'schedule_overlap',
            initiatorId,
            targetId,
            reason: `日程交集：都在${location}`,
            priority: 30,
            timestamp: Date.now(),
            context: { location, gameHour },
          })

          break // 每个地点最多触发一对
        }
      }
    }

    return triggers
  }

  /**
   * 随机社交触发 — 空闲NPC随机选择其他空闲NPC
   */
  private detectRandomSocial(): InteractionTrigger[] {
    const triggers: InteractionTrigger[] = []
    const profiles = profileLoader.getAllProfiles()
    const idleNpcs: string[] = []

    for (const profile of profiles) {
      if (!profile.isActive) continue
      const runtime = profileLoader.getRuntimeState(profile.id)
      if (!runtime) continue

      // 只考虑空闲或工作状态且不在对话中的NPC
      if (!runtime.talkingTo && runtime.currentAction !== 'talking') {
        idleNpcs.push(profile.id)
      }
    }

    // 对每个空闲NPC以一定概率触发社交
    for (const npcId of idleNpcs) {
      if (Math.random() > this.config.randomSocialChance) continue

      // 随机选择一个目标（排除自己）
      const candidates = idleNpcs.filter((id) => id !== npcId)
      if (candidates.length === 0) continue

      const targetId = candidates[Math.floor(Math.random() * candidates.length)]

      triggers.push({
        type: 'random_social',
        initiatorId: npcId,
        targetId,
        reason: '随机社交',
        priority: 50,
        timestamp: Date.now(),
      })
    }

    return triggers
  }

  /**
   * 接近触发 — 两个NPC距离在阈值内
   */
  private detectProximity(): InteractionTrigger[] {
    const triggers: InteractionTrigger[] = []
    const profiles = profileLoader.getAllProfiles().filter((p) => p.isActive)

    for (let i = 0; i < profiles.length; i++) {
      for (let j = i + 1; j < profiles.length; j++) {
        const a = profiles[i]
        const b = profiles[j]

        const dx = a.x - b.x
        const dy = a.y - b.y
        const distance = Math.sqrt(dx * dx + dy * dy)

        if (distance <= this.config.proximityDistance) {
          const aRuntime = profileLoader.getRuntimeState(a.id)
          const bRuntime = profileLoader.getRuntimeState(b.id)

          // 排除正在对话的NPC
          if (aRuntime?.talkingTo || bRuntime?.talkingTo) continue

          triggers.push({
            type: 'proximity',
            initiatorId: a.id,
            targetId: b.id,
            reason: `接近触发（距离=${Math.round(distance)}px）`,
            priority: 20,
            timestamp: Date.now(),
          })
        }
      }
    }

    return triggers
  }

  /**
   * 主动寻人 — NPC因目标或情绪需要，主动寻找特定NPC
   */
  private detectActiveSeek(): InteractionTrigger[] {
    const triggers: InteractionTrigger[] = []
    const profiles = profileLoader.getAllProfiles().filter((p) => p.isActive)

    for (const profile of profiles) {
      const runtime = profileLoader.getRuntimeState(profile.id)
      if (!runtime || runtime.talkingTo) continue

      // 基于NPC目标决定是否主动寻人
      const goal = runtime.currentGoal
      if (!goal) continue

      // 目标中包含特定NPC名字时触发寻人
      // 例如："和老巴克讨论矿石" → 主动找老巴克
      const allProfiles = profileLoader.getAllProfiles()
      for (const other of allProfiles) {
        if (other.id === profile.id) continue

        if (goal.includes(other.name)) {
          triggers.push({
            type: 'active_seek',
            initiatorId: profile.id,
            targetId: other.id,
            reason: `主动寻人：目标「${goal}」提到${other.name}`,
            priority: 10,
            timestamp: Date.now(),
          })
          break // 每个NPC每Tick最多主动寻一人
        }
      }
    }

    return triggers
  }

  /**
   * 事件驱动触发 — 由外部系统调用
   * @param eventType - 事件类型
   * @param sourceNpcId - 事件源NPC
   * @param targetNpcId - 事件目标NPC
   * @param context - 事件上下文
   */
  triggerEventDriven(
    eventType: string,
    sourceNpcId: string,
    targetNpcId: string,
    context?: Record<string, unknown>,
  ): InteractionTrigger {
    const trigger: InteractionTrigger = {
      type: 'event_driven',
      initiatorId: sourceNpcId,
      targetId: targetNpcId,
      reason: `事件触发：${eventType}`,
      priority: 5, // 事件驱动优先级最高
      timestamp: Date.now(),
      context: { eventType, ...context },
    }

    this.pendingQueue.push(trigger)
    this.stats.totalTriggers++
    this.stats.triggersByType.event_driven++
    this.setCooldown(sourceNpcId, targetNpcId)

    logger.info(`Event-driven trigger: ${sourceNpcId} → ${targetNpcId} (${eventType})`)
    return trigger
  }

  // =============================================
  // 冷却管理
  // =============================================

  /**
   * 生成交互对Key（保证对称性）
   */
  private getCooldownKey(npcA: string, npcB: string): string {
    return npcA < npcB ? `${npcA}-${npcB}` : `${npcB}-${npcA}`
  }

  /**
   * 检查交互是否在冷却中
   */
  isOnCooldown(npcA: string, npcB: string): boolean {
    const key = this.getCooldownKey(npcA, npcB)
    const lastInteraction = this.cooldowns.get(key)

    if (!lastInteraction) return false

    return (Date.now() - lastInteraction) < this.config.interactionCooldown * 1000
  }

  /**
   * 设置交互冷却
   */
  private setCooldown(npcA: string, npcB: string): void {
    const key = this.getCooldownKey(npcA, npcB)
    this.cooldowns.set(key, Date.now())
  }

  /**
   * 清理过期的冷却记录
   */
  cleanupExpiredCooldowns(): void {
    const now = Date.now()
    for (const [key, timestamp] of this.cooldowns) {
      if (now - timestamp > this.config.interactionCooldown * 1000) {
        this.cooldowns.delete(key)
      }
    }
  }

  // =============================================
  // 队列管理
  // =============================================

  /**
   * 取出下一个待处理触发
   */
  dequeueNext(): InteractionTrigger | undefined {
    return this.pendingQueue.shift()
  }

  /**
   * 获取待处理队列
   */
  getPendingQueue(): InteractionTrigger[] {
    return [...this.pendingQueue]
  }

  /**
   * 清空待处理队列
   */
  clearQueue(): void {
    this.pendingQueue = []
  }

  // =============================================
  // 统计与配置
  // =============================================

  /** 获取统计 */
  getStats(): TriggerEngineStats {
    return {
      totalTriggers: this.stats.totalTriggers,
      triggersByType: { ...this.stats.triggersByType },
      lastCheckTime: this.stats.lastCheckTime,
      pendingQueueSize: this.pendingQueue.length,
    }
  }

  /** 更新配置 */
  updateConfig(config: Partial<InteractionTriggerConfig>): void {
    this.config = { ...this.config, ...config }
    logger.info('Interaction trigger config updated')
  }

  /** 获取配置 */
  getConfig(): InteractionTriggerConfig {
    return { ...this.config }
  }
}

/** 全局交互触发引擎实例 */
export const interactionTriggerEngine = new InteractionTriggerEngine()
