import { wsService } from './websocket'

/**
 * PositionSyncService — 玩家位置同步服务
 *
 * 职责：
 * - 采集玩家位置变化
 * - 节流发送位置到后端（50ms间隔）
 * - 管理同步生命周期
 */

/** 位置同步配置 */
const SYNC_INTERVAL_MS = 50       // 最小发送间隔
const POSITION_THRESHOLD = 1       // 位置变化阈值（像素），小于此值不发送

interface Position {
  x: number
  y: number
  direction: string
}

class PositionSyncService {
  private lastSyncedPosition: Position | null = null
  private syncTimer: ReturnType<typeof setInterval> | null = null
  private pendingPosition: Position | null = null
  private isRunning = false

  /**
   * 启动位置同步
   */
  start(): void {
    if (this.isRunning) return
    this.isRunning = true

    this.syncTimer = setInterval(() => {
      this.flushPendingPosition()
    }, SYNC_INTERVAL_MS)

    console.log('[PositionSync] Started')
  }

  /**
   * 停止位置同步
   */
  stop(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer)
      this.syncTimer = null
    }
    this.isRunning = false
    this.lastSyncedPosition = null
    this.pendingPosition = null
    console.log('[PositionSync] Stopped')
  }

  /**
   * 更新玩家位置（每帧调用）
   * 只记录待发送位置，由定时器节流发送
   */
  updatePosition(x: number, y: number, direction: string): void {
    if (!this.isRunning) return
    this.pendingPosition = { x, y, direction }
  }

  /**
   * 节流发送：定时器触发时检查是否有待发送位置
   * BUG-009修复: 方向变化也触发同步
   */
  private flushPendingPosition(): void {
    if (!this.pendingPosition) return

    const pos = this.pendingPosition
    this.pendingPosition = null

    // 检查位置变化是否超过阈值 或 方向是否变化
    if (this.lastSyncedPosition) {
      const dx = Math.abs(pos.x - this.lastSyncedPosition.x)
      const dy = Math.abs(pos.y - this.lastSyncedPosition.y)
      const dirChanged = pos.direction !== this.lastSyncedPosition.direction

      if (dx < POSITION_THRESHOLD && dy < POSITION_THRESHOLD && !dirChanged) {
        return // 位置变化太小且方向未变，不发送
      }
    }

    // 发送位置
    wsService.sendPlayerMove(
      Math.round(pos.x * 10) / 10,
      Math.round(pos.y * 10) / 10,
      pos.direction,
    )
    this.lastSyncedPosition = { ...pos }
  }
}

/** 全局位置同步服务单例 */
export const positionSync = new PositionSyncService()
