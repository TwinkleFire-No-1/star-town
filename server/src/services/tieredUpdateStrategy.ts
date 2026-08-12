// 星火小镇 — 分级更新策略
// T2.6.3 附近NPC高频、远处NPC低频/暂停

import { createLogger } from '../utils/index.js'
import { profileLoader } from './profileLoader.js'
import type { SchedulePriority } from './npcScheduler.js'

const logger = createLogger('TieredUpdate')

// =============================================
// 类型定义
// =============================================

/** 更新频率等级 */
export type UpdateTier = 'high' | 'medium' | 'low' | 'paused'

/** NPC更新策略条目 */
export interface NpcUpdatePolicy {
  /** NPC ID */
  npcId: string
  /** 当前更新频率等级 */
  tier: UpdateTier
  /** 更新间隔(ms) */
  updateInterval: number
  /** 距离最近玩家的距离（像素） */
  distanceToPlayer: number
  /** 是否在对话中 */
  inDialogue: boolean
  /** 下次允许更新的时间戳 */
  nextUpdateTime: number
}

/** 分级更新配置 */
export interface TieredUpdateConfig {
  /** 高频更新间隔(ms)，默认2000 — 对话中/很近的NPC */
  highFrequencyInterval: number
  /** 中频更新间隔(ms)，默认10000 — 附近可见的NPC */
  mediumFrequencyInterval: number
  /** 低频更新间隔(ms)，默认30000 — 远处NPC */
  lowFrequencyInterval: number
  /** 暂停更新间隔(ms)，默认60000 — 很远/不可见的NPC */
  pausedInterval: number
  /** 高频距离阈值（像素），默认200 */
  highFrequencyDistance: number
  /** 中频距离阈值（像素），默认600 */
  mediumFrequencyDistance: number
  /** 低频距离阈值（像素），默认1200 */
  lowFrequencyDistance: number
  /** 对话中的NPC始终高频 */
  dialogueAlwaysHigh: boolean
}

/** 分级更新统计 */
export interface TieredUpdateStats {
  /** 各等级NPC数量 */
  tierCounts: Record<UpdateTier, number>
  /** 总NPC数 */
  totalNpcs: number
  /** 高频NPC列表 */
  highFrequencyNpcs: string[]
  /** 距离计算方式 */
  distanceMode: 'pixel' | 'tile'
  /** 更新策略调用次数 */
  updateCount: number
  /** 最后更新时间 */
  lastUpdateTime: number
  /** 分级策略是否生效（有paused NPC则生效） */
  isEffective: boolean
}

// =============================================
// 分级更新策略
// =============================================

/**
 * TieredUpdateStrategy — 分级更新策略
 *
 * 根据NPC与玩家的距离和状态，将NPC分为4个更新频率等级：
 * - high (2s):  对话中、非常近的NPC — 完整Agent循环
 * - medium (10s): 附近可见的NPC — 简化感知+思考
 * - low (30s):  远处NPC — 仅日程检查
 * - paused (60s):  很远/不可见的NPC — 暂停更新
 *
 * 距离分级：
 * - 0-200px:   high
 * - 200-600px:  medium
 * - 600-1200px: low
 * - >1200px:    paused
 */
class TieredUpdateStrategy {
  /** 配置 */
  private config: TieredUpdateConfig = {
    highFrequencyInterval: 2000,
    mediumFrequencyInterval: 10000,
    lowFrequencyInterval: 30000,
    pausedInterval: 60000,
    highFrequencyDistance: 200,
    mediumFrequencyDistance: 600,
    lowFrequencyDistance: 1200,
    dialogueAlwaysHigh: true,
  }

  /** NPC更新策略表 */
  private policies: Map<string, NpcUpdatePolicy> = new Map()

  /** 玩家位置缓存 */
  private playerPositions: Map<string, { x: number; y: number }> = new Map()

  // =============================================
  // 核心方法
  // =============================================

  /** 统计 */
  private updateCount = 0
  private lastUpdateTime = 0

  /**
   * 更新所有NPC的分级策略
   * 根据NPC位置、状态和与玩家的距离重新计算更新频率
   */
  updateAllPolicies(): void {
    this.updateCount++
    this.lastUpdateTime = Date.now()
    const profiles = profileLoader.getAllProfiles()

    let tierChanges = 0

    for (const profile of profiles) {
      if (!profile.isActive) continue

      const runtimeState = profileLoader.getRuntimeState(profile.id)
      const inDialogue = !!runtimeState?.talkingTo

      // 计算NPC到最近玩家的距离
      const distanceToPlayer = this.getDistanceToNearestPlayer(profile.x, profile.y)

      // 确定更新等级
      const { tier, interval } = this.determineTier(
        distanceToPlayer,
        inDialogue,
        runtimeState?.currentAction ?? 'idle',
      )

      // 更新或创建策略条目
      const existing = this.policies.get(profile.id)
      const nextUpdateTime = existing
        ? Math.max(Date.now(), existing.nextUpdateTime)
        : Date.now()

      // 记录等级变化
      if (existing && existing.tier !== tier) {
        tierChanges++
      }

      this.policies.set(profile.id, {
        npcId: profile.id,
        tier,
        updateInterval: interval,
        distanceToPlayer,
        inDialogue,
        nextUpdateTime,
      })
    }

    // 每5次更新输出一次分级统计
    if (this.updateCount % 5 === 0) {
      const stats = this.getStats()
      logger.debug(
        `Tiered update #${this.updateCount}: changes=${tierChanges}, ` +
        `high=${stats.tierCounts.high} medium=${stats.tierCounts.medium} ` +
        `low=${stats.tierCounts.low} paused=${stats.tierCounts.paused}`,
      )
    }
  }

  /**
   * 检查NPC是否应该在本Tick执行
   */
  shouldUpdate(npcId: string): boolean {
    const policy = this.policies.get(npcId)

    if (!policy) {
      // 没有策略条目，默认需要更新
      return true
    }

    return Date.now() >= policy.nextUpdateTime
  }

  /**
   * 标记NPC已执行更新，计算下次更新时间
   */
  markUpdated(npcId: string): void {
    const policy = this.policies.get(npcId)

    if (policy) {
      policy.nextUpdateTime = Date.now() + policy.updateInterval
    }
  }

  /**
   * 获取NPC的更新频率等级
   */
  getTier(npcId: string): UpdateTier {
    return this.policies.get(npcId)?.tier ?? 'medium'
  }

  /**
   * 获取NPC的更新策略
   */
  getPolicy(npcId: string): NpcUpdatePolicy | undefined {
    return this.policies.get(npcId)
  }

  /**
   * 获取指定等级的所有NPC
   */
  getNpcsByTier(tier: UpdateTier): string[] {
    const result: string[] = []
    for (const [npcId, policy] of this.policies) {
      if (policy.tier === tier) {
        result.push(npcId)
      }
    }
    return result
  }

  /**
   * 将NPC的更新策略映射为调度优先级
   * 供NpcScheduler使用
   */
  toSchedulePriority(npcId: string): SchedulePriority {
    const tier = this.getTier(npcId)
    switch (tier) {
      case 'high':
        return 'high'
      case 'medium':
        return 'normal'
      case 'low':
        return 'low'
      case 'paused':
        return 'idle'
    }
  }

  // =============================================
  // 玩家位置更新
  // =============================================

  /**
   * 更新玩家位置
   */
  updatePlayerPosition(playerId: string, x: number, y: number): void {
    this.playerPositions.set(playerId, { x, y })
  }

  /**
   * 移除玩家位置
   */
  removePlayer(playerId: string): void {
    this.playerPositions.delete(playerId)
  }

  // =============================================
  // 分级决策逻辑
  // =============================================

  /**
   * 根据距离和状态确定NPC更新等级
   */
  private determineTier(
    distance: number,
    inDialogue: boolean,
    currentAction: string,
  ): { tier: UpdateTier; interval: number } {
    // 对话中的NPC始终高频
    if (inDialogue && this.config.dialogueAlwaysHigh) {
      return { tier: 'high', interval: this.config.highFrequencyInterval }
    }

    // 正在执行特殊行动的NPC高频
    if (currentAction === 'walking' || currentAction === 'move') {
      return { tier: 'high', interval: this.config.highFrequencyInterval }
    }

    // 根据距离分级
    if (distance <= this.config.highFrequencyDistance) {
      return { tier: 'high', interval: this.config.highFrequencyInterval }
    }

    if (distance <= this.config.mediumFrequencyDistance) {
      return { tier: 'medium', interval: this.config.mediumFrequencyInterval }
    }

    if (distance <= this.config.lowFrequencyDistance) {
      return { tier: 'low', interval: this.config.lowFrequencyInterval }
    }

    return { tier: 'paused', interval: this.config.pausedInterval }
  }

  /**
   * 计算NPC到最近玩家的距离
   */
  private getDistanceToNearestPlayer(npcX: number, npcY: number): number {
    let minDistance = Infinity

    for (const _playerId of this.playerPositions.keys()) {
      const pos = this.playerPositions.get(_playerId)!
      const dx = pos.x - npcX
      const dy = pos.y - npcY
      const distance = Math.sqrt(dx * dx + dy * dy)
      minDistance = Math.min(minDistance, distance)
    }

    // 如果没有玩家在线，所有NPC使用中频
    // BUG-010修复: 无玩家时直接返回medium距离，不略超阈值导致判断为low
    if (minDistance === Infinity) {
      return this.config.highFrequencyDistance // 在high和medium之间，determineTier会返回medium
    }

    return minDistance
  }

  // =============================================
  // 管理接口
  // =============================================

  /** 获取统计信息 */
  getStats(): TieredUpdateStats {
    const tierCounts: Record<UpdateTier, number> = {
      high: 0,
      medium: 0,
      low: 0,
      paused: 0,
    }

    const highFrequencyNpcs: string[] = []

    for (const [_npcId, policy] of this.policies) {
      tierCounts[policy.tier]++
      if (policy.tier === 'high') {
        highFrequencyNpcs.push(policy.npcId)
      }
    }

    return {
      tierCounts,
      totalNpcs: this.policies.size,
      highFrequencyNpcs,
      distanceMode: 'pixel',
      updateCount: this.updateCount,
      lastUpdateTime: this.lastUpdateTime,
      isEffective: tierCounts.paused > 0 || tierCounts.low > 0,
    }
  }

  /** 更新配置 */
  updateConfig(config: Partial<TieredUpdateConfig>): void {
    this.config = { ...this.config, ...config }
    logger.info('Tiered update config updated')

    // 重新计算所有策略
    this.updateAllPolicies()
  }

  /** 获取当前配置 */
  getConfig(): TieredUpdateConfig {
    return { ...this.config }
  }

  /** 重置所有策略 */
  reset(): void {
    this.policies.clear()
  }
}

/** 全局分级更新策略实例 */
export const tieredUpdateStrategy = new TieredUpdateStrategy()
