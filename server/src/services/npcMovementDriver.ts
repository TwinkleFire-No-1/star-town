// 星火小镇 — NPC移动驱动服务
// 将 npcMovementSystem 接入运行时循环：
// 1. 定期调用 updateMoves 推进NPC移动
// 2. 移动中的NPC位置通过 socket 广播 npc:move 给前端
// 3. 提供日程/剧情驱动的移动指令封装

import { createLogger } from '../utils/index.js'
import { npcMovementSystem } from './npcMovementSystem.js'
import { scheduleExecutor } from './scheduleExecutor.js'
import { profileLoader } from './profileLoader.js'

const logger = createLogger('NpcMoveDriver')

/** 移动广播配置 */
const BROADCAST_INTERVAL = 200 // ms
const POSITION_CHANGE_THRESHOLD = 0.5 // 像素，超过才广播

class NpcMovementDriver {
  private io: any = null
  private timer: ReturnType<typeof setInterval> | null = null
  private lastBroadcastPositions = new Map<string, { x: number; y: number }>()
  private isRunning = false

  /** 设置 Socket.IO 实例 */
  setIo(io: any): void {
    this.io = io
  }

  /**
   * 启动移动循环
   */
  start(): void {
    if (this.isRunning) return
    this.isRunning = true

    this.timer = setInterval(() => {
      this.tick()
    }, BROADCAST_INTERVAL)

    logger.info(`NpcMovementDriver started (interval=${BROADCAST_INTERVAL}ms)`)
  }

  /**
   * 停止移动循环
   */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    this.isRunning = false
    this.lastBroadcastPositions.clear()
    logger.info('NpcMovementDriver stopped')
  }

  /**
   * 每 Tick：推进NPC移动 + 广播位置变化
   */
  private tick(): void {
    // 1. 推进所有移动任务（deltaTime = 广播间隔）
    npcMovementSystem.updateMoves(BROADCAST_INTERVAL)

    // 2. 广播移动中NPC的位置
    if (!this.io) return

    const profiles = profileLoader.getAllProfiles()
    for (const profile of profiles) {
      if (!profile.isActive) continue
      if (!npcMovementSystem.isMoving(profile.id)) {
        // 未移动的NPC无需广播
        this.lastBroadcastPositions.delete(profile.id)
        continue
      }

      const prev = this.lastBroadcastPositions.get(profile.id)
      const moved =
        !prev ||
        Math.abs(prev.x - profile.x) >= POSITION_CHANGE_THRESHOLD ||
        Math.abs(prev.y - profile.y) >= POSITION_CHANGE_THRESHOLD

      if (moved) {
        this.lastBroadcastPositions.set(profile.id, { x: profile.x, y: profile.y })
        this.io.emit('npc:move', {
          npcId: profile.id,
          x: Math.round(profile.x * 10) / 10,
          y: Math.round(profile.y * 10) / 10,
          direction: profile.direction,
        })
      }
    }
  }

  // =============================================
  // 移动指令封装
  // =============================================

  /**
   * 日程驱动：让NPC前往当前日程地点
   * @returns 是否创建了移动任务
   */
  moveNpcToSchedule(npcId: string): boolean {
    const profile = profileLoader.getProfile(npcId)
    if (!profile || !profile.isActive) return false

    // 如果正在对话，不移动
    const runtime = profileLoader.getRuntimeState(npcId)
    if (runtime?.talkingTo) return false

    const schedule = scheduleExecutor.getCurrentScheduleForNpc(npcId)
    if (!schedule) return false

    const target = scheduleExecutor.getAreaPosition(schedule.location)
    if (!target) return false

    const task = npcMovementSystem.createMoveTask(npcId, target)
    if (task) {
      logger.info(`[${profile.name}] Moving to schedule: ${schedule.location} (${target.x},${target.y})`)
      return true
    }
    return false
  }

  /**
   * 剧情驱动：让NPC走向指定位置
   */
  moveNpcTo(npcId: string, target: { x: number; y: number }): boolean {
    const profile = profileLoader.getProfile(npcId)
    if (!profile || !profile.isActive) return false

    const runtime = profileLoader.getRuntimeState(npcId)
    if (runtime?.talkingTo) return false

    const task = npcMovementSystem.createMoveTask(npcId, target)
    if (task) {
      logger.info(`[${profile.name}] Story move to (${target.x},${target.y})`)
      return true
    }
    return false
  }

  /**
   * 剧情驱动：让NPC走向某玩家所在位置
   */
  moveNpcToPlayer(npcId: string, playerPos: { x: number; y: number }): boolean {
    // 走向玩家旁边 1 tile（64px）的距离
    const offset = { x: playerPos.x + 64, y: playerPos.y }
    return this.moveNpcTo(npcId, offset)
  }
}

/** 全局NPC移动驱动单例 */
export const npcMovementDriver = new NpcMovementDriver()
