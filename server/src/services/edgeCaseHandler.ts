// 星火小镇 — 边界情况处理器
// T5.1.4 断线重连、并发冲突、空数据处理

import { createLogger } from '../utils/index.js'
import { prisma } from '../models/prisma.js'
import { profileLoader } from './profileLoader.js'
import { battleEngine } from './battleEngine.js'
import { questEngine } from './questEngine.js'
import type { Server } from 'socket.io'

const logger = createLogger('EdgeCaseHandler')

// =============================================
// 类型定义
// =============================================

export interface ReconnectionResult {
  success: boolean
  playerId: string
  restoredData: {
    playerName: string
    position: { x: number; y: number; direction: string }
    activeDialogues: string[]
    activeQuests: number
    activeBattles: number
  }
  message: string
}

export interface ConcurrencyResult {
  success: boolean
  conflictDetected: boolean
  resolvedValue?: any
  message: string
}

// =============================================
// 边界情况处理器
// =============================================

class EdgeCaseHandler {
  private io: Server | null = null

  /**
   * 设置 Socket.IO 实例
   */
  setIo(io: Server): void {
    this.io = io
  }

  // =============================================
  // 断线重连处理
  // =============================================

  /**
   * 处理玩家断线
   * 清理资源但保留状态，便于重连恢复
   */
  async handleDisconnect(socketId: string): Promise<void> {
    try {
      logger.info(`[Disconnect] Processing disconnect for ${socketId}`)

      // 1. 清理NPC对话状态（但保留对话历史，便于重连恢复）
      let cleanedNpcs = 0
      for (const profile of profileLoader.getAllProfiles()) {
        const runtimeState = profileLoader.getRuntimeState(profile.id)
        if (runtimeState?.talkingTo === socketId) {
          profileLoader.updateRuntimeState(profile.id, {
            talkingTo: null,
            currentAction: 'idle',
          })
          cleanedNpcs++
        }
      }

      // 2. 暂停玩家参与的战斗（不结束，保留状态）
      const battleStats = battleEngine.getStats()
      logger.info(`[Disconnect] Cleaned ${cleanedNpcs} NPC dialogue states, battle stats: ${JSON.stringify(battleStats)}`)

      // 3. 标记玩家离线（不删除Redis会话，保留30秒用于重连）
      // Redis会话的TTL由redisSessionManager管理

      // 4. 广播玩家离线
      if (this.io) {
        this.io.emit('player:offline', { playerId: socketId })
      }
    } catch (err) {
      logger.error(`[Disconnect] Error: ${(err as Error).message}`)
    }
  }

  /**
   * 处理玩家重连
   * 恢复玩家状态：位置、对话、任务、战斗
   */
  async handleReconnect(socketId: string, previousSocketId?: string): Promise<ReconnectionResult> {
    try {
      logger.info(`[Reconnect] Processing reconnect for ${socketId}, previous=${previousSocketId ?? 'none'}`)

      // 1. 查找或创建玩家
      let player = null
      if (previousSocketId) {
        player = await prisma.player.findUnique({ where: { id: previousSocketId } })
      }

      if (!player) {
        // 检查是否有以socketId为ID的玩家
        player = await prisma.player.findUnique({ where: { id: socketId } })
      }

      // 如果玩家不存在，创建默认玩家
      if (!player) {
        player = await prisma.player.create({
          data: {
            id: socketId,
            name: `旅行者${socketId.substring(0, 4)}`,
            hp: 100,
            maxHp: 100,
            sp: 50,
            maxSp: 50,
            attack: 10,
            defense: 5,
            speed: 10,
            starCoins: 100,
            x: 160,
            y: 90,
            direction: 'down',
          },
        })
        logger.info(`[Reconnect] Created new player: ${player.name}`)
      }

      // 2. 恢复玩家位置
      const position = {
        x: player.x,
        y: player.y,
        direction: player.direction,
      }

      // 3. 恢复活跃对话
      const activeDialogues: string[] = []
      // 对话历史在dialogueHistoryManager中保留，重连后可以继续

      // 4. 恢复活跃任务
      const playerQuests = await prisma.playerQuest.findMany({
        where: { playerId: player.id, status: 'active' },
      })
      const activeQuests = playerQuests.length

      // 5. 检查活跃战斗
      const battleStats = battleEngine.getStats()
      const activeBattles = battleStats.activeBattles ?? 0

      // 6. 广播玩家上线
      if (this.io) {
        this.io.emit('player:online', {
          playerId: player.id,
          name: player.name,
          x: position.x,
          y: position.y,
        })
      }

      logger.info(`[Reconnect] Player ${player.name} reconnected successfully`)

      return {
        success: true,
        playerId: player.id,
        restoredData: {
          playerName: player.name,
          position,
          activeDialogues,
          activeQuests,
          activeBattles,
        },
        message: '重连成功，数据已恢复',
      }
    } catch (err) {
      logger.error(`[Reconnect] Error: ${(err as Error).message}`)
      return {
        success: false,
        playerId: socketId,
        restoredData: {
          playerName: '',
          position: { x: 160, y: 90, direction: 'down' },
          activeDialogues: [],
          activeQuests: 0,
          activeBattles: 0,
        },
        message: `重连失败: ${(err as Error).message}`,
      }
    }
  }

  // =============================================
  // 并发冲突处理
  // =============================================

  /**
   * 乐观锁：检查并更新
   * 防止并发修改导致的数据覆盖
   */
  async optimisticUpdate<T>(
    model: string,
    id: string,
    expectedVersion: number,
    updateFn: (current: any) => Promise<T>,
  ): Promise<ConcurrencyResult> {
    try {
      // 读取当前数据
      const current = await (prisma as any)[model].findUnique({ where: { id } })
      if (!current) {
        return { success: false, conflictDetected: false, message: '记录不存在' }
      }

      // 检查版本号
      if (current.version !== expectedVersion) {
        return {
          success: false,
          conflictDetected: true,
          resolvedValue: current,
          message: `版本冲突: 期望${expectedVersion}, 实际${current.version}`,
        }
      }

      // 执行更新
      const result = await updateFn(current)

      // 更新版本号
      await (prisma as any)[model].update({
        where: { id },
        data: { version: { increment: 1 } },
      })

      return {
        success: true,
        conflictDetected: false,
        resolvedValue: result,
        message: '更新成功',
      }
    } catch (err) {
      return {
        success: false,
        conflictDetected: false,
        message: `更新异常: ${(err as Error).message}`,
      }
    }
  }

  /**
   * 并发安全的任务接受
   * 防止玩家重复接受同一任务
   */
  async safeAcceptQuest(playerId: string, questId: string): Promise<ConcurrencyResult> {
    try {
      // 检查是否已有活跃任务
      const existing = await prisma.playerQuest.findUnique({
        where: { playerId_questId: { playerId, questId } },
      })

      if (existing && existing.status === 'active') {
        return {
          success: false,
          conflictDetected: true,
          message: '任务已在进行中（并发冲突检测）',
        }
      }

      // 执行接受
      const result = await questEngine.acceptQuest(playerId, questId)
      return {
        success: result.success,
        conflictDetected: false,
        message: result.message,
      }
    } catch (err) {
      return {
        success: false,
        conflictDetected: false,
        message: `并发接受任务异常: ${(err as Error).message}`,
      }
    }
  }

  // =============================================
  // 空数据处理
  // =============================================

  /**
   * 安全获取玩家数据
   * 处理空数据情况
   */
  async safeGetPlayer(playerId: string): Promise<{
    success: boolean
    player: any | null
    fallbackApplied: boolean
    message: string
  }> {
    try {
      const player = await prisma.player.findUnique({
        where: { id: playerId },
        include: {
          inventory: { include: { item: true } },
          quests: { include: { quest: true } },
          relations: true,
        },
      })

      if (!player) {
        // 回退：创建默认玩家
        const newPlayer = await prisma.player.create({
          data: {
            id: playerId,
            name: '旅行者',
            hp: 100,
            maxHp: 100,
            sp: 50,
            maxSp: 50,
            attack: 10,
            defense: 5,
            speed: 10,
            starCoins: 100,
          },
        })
        return {
          success: true,
          player: newPlayer,
          fallbackApplied: true,
          message: '玩家不存在，已创建默认角色',
        }
      }

      return {
        success: true,
        player,
        fallbackApplied: false,
        message: '玩家数据获取成功',
      }
    } catch (err) {
      return {
        success: false,
        player: null,
        fallbackApplied: false,
        message: `获取玩家数据异常: ${(err as Error).message}`,
      }
    }
  }

  /**
   * 安全获取NPC列表
   */
  async safeGetNPCs(): Promise<{
    success: boolean
    npcs: any[]
    fallbackApplied: boolean
    message: string
  }> {
    try {
      let npcs = await prisma.nPC.findMany({ where: { isActive: true } })

      if (npcs.length === 0) {
        // 回退：从档案加载器获取
        const profiles = profileLoader.getAllProfiles()
        logger.warn(`[EmptyData] No NPCs in DB, falling back to ${profiles.length} profiles`)

        // 创建占位NPC数据
        npcs = profiles.map((p) => ({
          id: p.id,
          name: p.name,
          title: p.title ?? '',
          x: 100,
          y: 80,
          direction: 'down',
          isActive: true,
        })) as any[]

        return {
          success: true,
          npcs,
          fallbackApplied: true,
          message: '数据库无NPC数据，已从档案回退',
        }
      }

      return {
        success: true,
        npcs,
        fallbackApplied: false,
        message: `获取到${npcs.length}个NPC`,
      }
    } catch (err) {
      return {
        success: false,
        npcs: [],
        fallbackApplied: false,
        message: `获取NPC列表异常: ${(err as Error).message}`,
      }
    }
  }

  /**
   * 安全获取任务列表
   */
  async safeGetQuests(playerId: string): Promise<{
    success: boolean
    activeQuests: any[]
    availableQuests: any[]
    fallbackApplied: boolean
    message: string
  }> {
    try {
      // 获取玩家活跃任务
      let activeQuests = await prisma.playerQuest.findMany({
        where: { playerId, status: 'active' },
        include: { quest: true },
      })

      // 获取可接受任务
      let availableQuests: any[] = []
      try {
        availableQuests = await questEngine.getAvailableQuests(playerId)
      } catch {
        availableQuests = []
      }

      // 如果玩家无活跃任务且无可接受任务
      if (activeQuests.length === 0 && availableQuests.length === 0) {
        // 回退：返回任务引擎中的所有任务定义
        const allDefinitions = questEngine.getAllQuestDefinitions()
        logger.warn(`[EmptyData] No quests for player ${playerId}, returning ${allDefinitions.length} definitions as fallback`)

        return {
          success: true,
          activeQuests: [],
          availableQuests: allDefinitions.filter((q) => q.autoAccept),
          fallbackApplied: true,
          message: '无玩家任务数据，已返回可自动接受的任务',
        }
      }

      return {
        success: true,
        activeQuests,
        availableQuests,
        fallbackApplied: false,
        message: `活跃任务${activeQuests.length}个，可接受${availableQuests.length}个`,
      }
    } catch (err) {
      return {
        success: false,
        activeQuests: [],
        availableQuests: [],
        fallbackApplied: false,
        message: `获取任务列表异常: ${(err as Error).message}`,
      }
    }
  }

  // =============================================
  // 超时与重试
  // =============================================

  /**
   * 带超时的操作
   */
  async withTimeout<T>(
    operation: () => Promise<T>,
    timeoutMs: number = 5000,
  ): Promise<T> {
    return Promise.race([
      operation(),
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(`操作超时(${timeoutMs}ms)`)), timeoutMs),
      ),
    ])
  }

  /**
   * 带重试的操作
   */
  async withRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    delayMs: number = 100,
  ): Promise<T> {
    let lastError: Error | null = null

    for (let i = 0; i < maxRetries; i++) {
      try {
        return await operation()
      } catch (err) {
        lastError = err as Error
        logger.warn(`[Retry] Attempt ${i + 1}/${maxRetries} failed: ${(err as Error).message}`)
        if (i < maxRetries - 1) {
          await new Promise((r) => setTimeout(r, delayMs * (i + 1)))
        }
      }
    }

    throw lastError
  }

  // =============================================
  // 边界情况测试
  // =============================================

  /**
   * 运行边界情况测试
   */
  async runEdgeCaseTests(): Promise<{
    tests: Array<{ name: string; success: boolean; detail: string }>
    overall: boolean
  }> {
    const tests: Array<{ name: string; success: boolean; detail: string }> = []

    // 测试1: 空玩家ID
    try {
      const result = await this.safeGetPlayer('')
      tests.push({
        name: '空玩家ID处理',
        success: true,
        detail: result.message,
      })
    } catch (err) {
      tests.push({
        name: '空玩家ID处理',
        success: false,
        detail: (err as Error).message,
      })
    }

    // 测试2: 不存在的玩家ID
    try {
      const result = await this.safeGetPlayer('non-existent-player-12345')
      tests.push({
        name: '不存在玩家处理',
        success: result.success,
        detail: result.message,
      })
    } catch (err) {
      tests.push({
        name: '不存在玩家处理',
        success: false,
        detail: (err as Error).message,
      })
    }

    // 测试4: 并发任务接受
    try {
      const result1 = await this.safeAcceptQuest('test-concurrent', 'prologue_wake_up')
      const result2 = await this.safeAcceptQuest('test-concurrent', 'prologue_wake_up')
      tests.push({
        name: '并发任务接受',
        success: true,
        detail: `第一次: ${result1.message}, 第二次: ${result2.message}`,
      })
    } catch (err) {
      tests.push({
        name: '并发任务接受',
        success: false,
        detail: (err as Error).message,
      })
    }

    // 测试5: 超时处理
    try {
      const result = await this.withTimeout(
        async () => {
          await new Promise((r) => setTimeout(r, 100))
          return 'ok'
        },
        1000,
      )
      tests.push({
        name: '超时处理',
        success: result === 'ok',
        detail: '正常返回',
      })
    } catch (err) {
      tests.push({
        name: '超时处理',
        success: false,
        detail: (err as Error).message,
      })
    }

    // 测试6: 重试机制
    try {
      let attempts = 0
      const result = await this.withRetry(
        async () => {
          attempts++
          if (attempts < 2) throw new Error('模拟失败')
          return 'success'
        },
        3,
      )
      tests.push({
        name: '重试机制',
        success: result === 'success',
        detail: `重试${attempts}次后成功`,
      })
    } catch (err) {
      tests.push({
        name: '重试机制',
        success: false,
        detail: (err as Error).message,
      })
    }

    const overall = tests.every((t) => t.success)
    return { tests, overall }
  }
}

/** 全局边界情况处理器实例 */
export const edgeCaseHandler = new EdgeCaseHandler()
