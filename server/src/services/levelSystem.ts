// 星火小镇 — 升级打怪系统：等级与经验
// T6.8.x 升级打怪玩法：战斗胜利获得经验，经验累积升级，升级提升基础属性

import { createLogger } from '../utils/index.js'
import { prisma } from '../models/prisma.js'

const logger = createLogger('LevelSystem')

// =============================================
// 升级配置
// =============================================

/** 每级升级所需经验：80 + (level-1)*60 → Lv1→2需80，Lv2→3需140，Lv3→4需200... */
export function expToNext(level: number): number {
  return 80 + (level - 1) * 60
}

/** 升级属性成长表（每升一级增加） */
export const LEVEL_UP_GROWTH = {
  maxHp: 12,
  maxSp: 5,
  attack: 2,
  defense: 1,
  speed: 1,
}

/** 升级上限 */
export const MAX_LEVEL = 50

// =============================================
// 类型定义
// =============================================

/** 玩家等级信息 */
export interface PlayerLevelInfo {
  playerId: string
  level: number
  exp: number
  expToNext: number
  /** 升级进度百分比 0-100 */
  progressPercent: number
  /** 基础属性（受等级影响） */
  stats: {
    hp: number
    maxHp: number
    sp: number
    maxSp: number
    attack: number
    defense: number
    speed: number
  }
}

// =============================================
// 升级系统
// =============================================

/**
 * LevelSystem — 升级打怪系统
 *
 * 职责：
 * 1. 发放经验（战斗胜利 / 任务奖励）
 * 2. 经验满后自动升级，属性成长 + 满血满蓝
 * 3. 升级事件广播（level:up），前端展示升级动画
 */
class LevelSystem {
  /** Socket.IO 实例 */
  private io: any = null

  /**
   * 设置 Socket.IO
   */
  setIo(io: any): void {
    this.io = io
  }

  /**
   * 获取玩家等级信息
   */
  async getLevelInfo(playerId: string): Promise<PlayerLevelInfo | null> {
    const player = await prisma.player.findUnique({ where: { id: playerId } })
    if (!player) return null

    const level = player.level ?? 1
    const exp = player.exp ?? 0
    const need = expToNext(level)
    const progressPercent = Math.min(100, Math.round((exp / need) * 100))

    return {
      playerId,
      level,
      exp,
      expToNext: need,
      progressPercent,
      stats: {
        hp: player.hp,
        maxHp: player.maxHp,
        sp: player.sp,
        maxSp: player.maxSp,
        attack: player.attack,
        defense: player.defense,
        speed: player.speed,
      },
    }
  }

  /**
   * 发放经验：战斗胜利/任务奖励调用
   * 经验满则自动升级（可连续升级），升级后属性成长并回满HP/SP
   * @returns 升级信息（若有升级）
   */
  async grantExp(playerId: string, amount: number): Promise<{
    level: number
    exp: number
    leveledUp: boolean
    levelsGained: number
  }> {
    if (amount <= 0) {
      return { level: 1, exp: 0, leveledUp: false, levelsGained: 0 }
    }

    const player = await prisma.player.findUnique({ where: { id: playerId } })
    if (!player) return { level: 1, exp: 0, leveledUp: false, levelsGained: 0 }

    let level = player.level ?? 1
    let exp = (player.exp ?? 0) + amount
    let levelsGained = 0

    // 循环升级（可能一次获得大量经验连升多级）
    while (level < MAX_LEVEL && exp >= expToNext(level)) {
      exp -= expToNext(level)
      level++
      levelsGained++
    }
    // 达到上限后封顶经验
    if (level >= MAX_LEVEL) {
      exp = Math.min(exp, expToNext(level))
    }

    // 更新数据库
    const updated = await prisma.player.update({
      where: { id: playerId },
      data: {
        level,
        exp,
        // 升级成长：每升一级按成长表叠加
        maxHp: player.maxHp + LEVEL_UP_GROWTH.maxHp * levelsGained,
        maxSp: player.maxSp + LEVEL_UP_GROWTH.maxSp * levelsGained,
        attack: player.attack + LEVEL_UP_GROWTH.attack * levelsGained,
        defense: player.defense + LEVEL_UP_GROWTH.defense * levelsGained,
        speed: player.speed + LEVEL_UP_GROWTH.speed * levelsGained,
        // 升级时回满 HP/SP
        hp: player.maxHp + LEVEL_UP_GROWTH.maxHp * levelsGained,
        sp: player.maxSp + LEVEL_UP_GROWTH.maxSp * levelsGained,
      },
    })

    logger.info(
      `Player ${playerId} gained ${amount} exp → Lv.${level} (exp ${exp}/${expToNext(level)}), levelsGained=${levelsGained}`,
    )

    // 广播经验/升级事件
    if (this.io) {
      this.io.emit('level:update', {
        playerId,
        level,
        exp,
        expToNext: expToNext(level),
        progressPercent: Math.min(100, Math.round((exp / expToNext(level)) * 100)),
        stats: {
          maxHp: updated.maxHp,
          maxSp: updated.maxSp,
          attack: updated.attack,
          defense: updated.defense,
          speed: updated.speed,
        },
      })
    }

    // 升级时额外广播升级动画事件
    if (levelsGained > 0 && this.io) {
      this.io.emit('level:up', {
        playerId,
        oldLevel: (player.level ?? 1) - levelsGained + 1,
        newLevel: level,
        levelsGained,
        stats: {
          maxHp: updated.maxHp,
          maxSp: updated.maxSp,
          attack: updated.attack,
          defense: updated.defense,
          speed: updated.speed,
        },
      })
    }

    return { level, exp, leveledUp: levelsGained > 0, levelsGained }
  }

  /**
   * 直接设置等级（调试/测试用）
   */
  async setLevel(playerId: string, level: number): Promise<void> {
    const clamped = Math.max(1, Math.min(MAX_LEVEL, level))
    const player = await prisma.player.findUnique({ where: { id: playerId } })
    if (!player) return

    // 计算从1级升到目标等级的总成长
    const totalGrowth = (g: number) => g * (clamped - 1)
    await prisma.player.update({
      where: { id: playerId },
      data: {
        level: clamped,
        exp: 0,
        maxHp: player.maxHp + totalGrowth(LEVEL_UP_GROWTH.maxHp),
        maxSp: player.maxSp + totalGrowth(LEVEL_UP_GROWTH.maxSp),
        attack: player.attack + totalGrowth(LEVEL_UP_GROWTH.attack),
        defense: player.defense + totalGrowth(LEVEL_UP_GROWTH.defense),
        speed: player.speed + totalGrowth(LEVEL_UP_GROWTH.speed),
      },
    })
  }

  /**
   * 获取统计
   */
  getStats() {
    return {
      maxLevel: MAX_LEVEL,
      growth: LEVEL_UP_GROWTH,
      expCurve: { level1: expToNext(1), level2: expToNext(2), level5: expToNext(5), level10: expToNext(10) },
    }
  }
}

/** 全局升级系统实例 */
export const levelSystem = new LevelSystem()
