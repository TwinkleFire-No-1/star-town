// 星火小镇 — Agent主循环集成
// T2.3.5 将感知-思考-行动-记忆更新串联为完整Agent循环

import { createLogger } from '../utils/index.js'
import { profileLoader } from './profileLoader.js'
import { perceiveModule, type EnvironmentSnapshot } from './perceiveModule.js'
import { thinkModule } from './thinkModule.js'
import { actModule, type ActResult } from './actModule.js'
import { memoryUpdateModule } from './memoryUpdateModule.js'
import { latencyOptimizer } from './latencyOptimizer.js'

const logger = createLogger('AgentLoop')

// =============================================
// 类型定义
// =============================================

/** Agent循环运行模式 */
export type AgentLoopMode = 'autonomous' | 'reactive' | 'idle'

/** Agent循环执行结果 */
export interface AgentLoopResult {
  /** NPC ID */
  npcId: string
  /** 循环Tick编号 */
  tick: number
  /** 感知结果摘要 */
  perceptionSummary: string
  /** 选择的行动 */
  selectedAction: string
  /** 行动执行结果 */
  actResult: ActResult
  /** 记忆更新数量 */
  memoryUpdates: number
  /** 循环耗时(ms) */
  duration: number
  /** 是否成功 */
  success: boolean
  /** 错误信息 */
  error?: string
}

/** 对话回复结果 */
export interface DialogueReplyResult {
  /** NPC ID */
  npcId: string
  /** NPC名称 */
  npcName: string
  /** 回复内容 */
  content: string
  /** 流式回调的完整内容 */
  fullContent?: string
  /** Token用量 */
  tokenUsage?: { promptTokens: number; completionTokens: number; totalTokens: number }
  /** 耗时(ms) */
  duration: number
}

// =============================================
// AgentLoop 主类
// =============================================

export class AgentLoop {
  private loopCounts: Map<string, number> = new Map()
  private lastTickTime: Map<string, number> = new Map()
  private activeLoops: Set<string> = new Set()

  /**
   * 执行完整的Agent循环：感知→思考→行动→记忆更新
   * 适用于NPC自主行为（定时Tick驱动）
   */
  async runAutonomousLoop(
    npcId: string,
    environment: EnvironmentSnapshot,
  ): Promise<AgentLoopResult> {
    const startTime = Date.now()
    const tick = this.getNextTick(npcId)

    // 防止同一NPC并发执行
    if (this.activeLoops.has(npcId)) {
      logger.warn(`[${npcId}] Agent loop already active, skipping tick ${tick}`)
      return {
        npcId,
        tick,
        perceptionSummary: 'skipped',
        selectedAction: 'idle',
        actResult: {
          npcId,
          actionType: 'idle',
          description: '循环被跳过（并发保护）',
          success: false,
          stateChanges: {
            currentAction: 'idle',
            talkingTo: null,
            positionChanged: false,
          },
        },
        memoryUpdates: 0,
        duration: Date.now() - startTime,
        success: false,
        error: 'concurrent_loop_detected',
      }
    }

    this.activeLoops.add(npcId)

    try {
      logger.debug(`[${npcId}] Agent loop tick=${tick}`)

      // 1. 感知
      const perception = await perceiveModule.perceive(npcId, environment)

      // 2. 思考
      const thinkResult = await thinkModule.think(npcId, perception, tick)

      // 3. 行动
      const actResult = await actModule.act(thinkResult)

      // 4. 记忆更新
      let memoryUpdates = 0
      try {
        const updateResults = await memoryUpdateModule.updateFromAction(actResult, perception)
        memoryUpdates = updateResults.length
      } catch (err) {
        logger.warn(`[${npcId}] Memory update failed: ${(err as Error).message}`)
      }

      // 5. 更新运行时状态
      profileLoader.updateRuntimeState(npcId, {
        currentAction: actResult.actionType,
        talkingTo: actResult.stateChanges.talkingTo,
        lastUpdate: Date.now(),
      })

      // 6. 如果是移动行动，更新位置
      if (actResult.actionType === 'move' && actResult.targetLocation) {
        const pos = actModule.getAreaPosition(actResult.targetLocation)
        if (pos) {
          profileLoader.updateRuntimeState(npcId, {
            currentAction: 'walking',
            lastUpdate: Date.now(),
          })
          actResult.stateChanges.positionChanged = true
          actResult.stateChanges.newPosition = { ...pos, direction: 'down' }
        }
      }

      this.lastTickTime.set(npcId, Date.now())

      return {
        npcId,
        tick,
        perceptionSummary: perception.perceptionText.substring(0, 100),
        selectedAction: thinkResult.selectedAction.type,
        actResult,
        memoryUpdates,
        duration: Date.now() - startTime,
        success: true,
      }
    } catch (err) {
      const errorMsg = (err as Error).message
      logger.error(`[${npcId}] Agent loop failed: ${errorMsg}`)

      return {
        npcId,
        tick,
        perceptionSummary: 'error',
        selectedAction: 'idle',
        actResult: {
          npcId,
          actionType: 'idle',
          description: `Agent循环错误: ${errorMsg}`,
          success: false,
          stateChanges: {
            currentAction: 'idle',
            talkingTo: null,
            positionChanged: false,
          },
        },
        memoryUpdates: 0,
        duration: Date.now() - startTime,
        success: false,
        error: errorMsg,
      }
    } finally {
      this.activeLoops.delete(npcId)
    }
  }

  /**
   * 响应式对话回复：玩家触发→感知→流式生成回复→记忆更新
   * 适用于玩家交互场景
   */
  async runReactiveDialogue(
    npcId: string,
    playerMessage: string,
    playerName: string,
    playerId: string,
    environment: EnvironmentSnapshot,
    onChunk?: (chunk: string) => void,
  ): Promise<DialogueReplyResult> {
    const startTime = latencyOptimizer.startTimer()
    const profile = profileLoader.getProfile(npcId)

    if (!profile) {
      throw new Error(`NPC profile not found: ${npcId}`)
    }

    const npcName = profile.name

    try {
      // 1. 感知（用于构建上下文）
      const perception = await perceiveModule.perceive(npcId, environment)

      // 2. 流式生成对话回复
      let fullContent = ''
      const replyResult = await actModule.generateReplyStream(
        npcId,
        playerMessage,
        playerName,
        playerId,
        perception,
        (chunk) => {
          fullContent += chunk
          onChunk?.(chunk)
        },
      )

      // 3. 记忆更新（异步，不阻塞回复）
      memoryUpdateModule
        .recordDialogue(npcId, playerId, playerName, playerMessage, replyResult.content, 'player')
        .catch((err) =>
          logger.warn(`[${npcId}] Async memory update failed: ${(err as Error).message}`),
        )

      // 4. 更新运行时状态
      profileLoader.updateRuntimeState(npcId, {
        currentAction: 'talking',
        talkingTo: playerId,
        lastUpdate: Date.now(),
      })

      // T5.3.4 延迟监控：记录对话延迟
      latencyOptimizer.endAndRecord(startTime, npcId, 'dialogue')

      return {
        npcId,
        npcName,
        content: replyResult.content,
        fullContent,
        tokenUsage: replyResult.tokenUsage
          ? {
              promptTokens: replyResult.tokenUsage.promptTokens,
              completionTokens: replyResult.tokenUsage.completionTokens,
              totalTokens: (replyResult.tokenUsage.promptTokens ?? 0) + (replyResult.tokenUsage.completionTokens ?? 0),
            }
          : undefined,
        duration: Date.now() - startTime,
      }
    } catch (err) {
      logger.error(`[${npcId}] Reactive dialogue failed: ${(err as Error).message}`)
      throw err
    }
  }

  /**
   * 开场白生成：玩家首次触发NPC交互
   */
  async runOpeningDialogue(
    npcId: string,
    playerName: string,
    playerId: string,
    environment: EnvironmentSnapshot,
    onChunk?: (chunk: string) => void,
  ): Promise<DialogueReplyResult> {
    const startTime = Date.now()
    const profile = profileLoader.getProfile(npcId)

    if (!profile) {
      throw new Error(`NPC profile not found: ${npcId}`)
    }

    const npcName = profile.name

    try {
      // 1. 感知
      const perception = await perceiveModule.perceive(npcId, environment)

      // 2. 思考（决策是否要对话）
      const thinkResult = await thinkModule.think(npcId, perception)

      // 3. 行动（生成开场白）
      const actResult = await actModule.act(thinkResult)

      let content: string
      if (actResult.dialogueContent) {
        content = actResult.dialogueContent

        // 流式模拟（开场白是预生成的，逐字发送）
        if (onChunk) {
          for (let i = 0; i < content.length; i++) {
            onChunk(content[i])
            await new Promise((r) => setTimeout(r, 20))
          }
        }
      } else {
        content = `${npcName}似乎在忙，没有注意到你。`
      }

      // 4. 记忆更新
      memoryUpdateModule
        .recordDialogue(
          npcId,
          playerId,
          playerName,
          `（冒险者${playerName}靠近了）`,
          content,
          'player',
        )
        .catch((err) =>
          logger.warn(`[${npcId}] Opening memory update failed: ${(err as Error).message}`),
        )

      // 5. 更新运行时状态
      profileLoader.updateRuntimeState(npcId, {
        currentAction: 'talking',
        talkingTo: playerId,
        lastUpdate: Date.now(),
      })

      return {
        npcId,
        npcName,
        content,
        tokenUsage: actResult.tokenUsage
          ? {
              promptTokens: actResult.tokenUsage.promptTokens,
              completionTokens: actResult.tokenUsage.completionTokens,
              totalTokens: (actResult.tokenUsage.promptTokens ?? 0) + (actResult.tokenUsage.completionTokens ?? 0),
            }
          : undefined,
        duration: Date.now() - startTime,
      }
    } catch (err) {
      logger.error(`[${npcId}] Opening dialogue failed: ${(err as Error).message}`)
      throw err
    }
  }

  /**
   * 关闭对话会话
   */
  closeDialogue(npcId: string, _playerId: string): void {
    profileLoader.updateRuntimeState(npcId, {
      talkingTo: null,
      currentAction: 'idle',
      lastUpdate: Date.now(),
    })
  }

  // =============================================
  // 辅助方法
  // =============================================

  /** 获取下一个Tick编号 */
  private getNextTick(npcId: string): number {
    const current = this.loopCounts.get(npcId) ?? 0
    const next = current + 1
    this.loopCounts.set(npcId, next)
    return next
  }

  /** 获取NPC当前Tick */
  getTick(npcId: string): number {
    return this.loopCounts.get(npcId) ?? 0
  }

  /** 获取NPC上次Tick时间 */
  getLastTickTime(npcId: string): number | undefined {
    return this.lastTickTime.get(npcId)
  }

  /** 检查NPC是否正在执行循环 */
  isActive(npcId: string): boolean {
    return this.activeLoops.has(npcId)
  }

  /** 获取所有活跃NPC ID */
  getActiveNpcIds(): string[] {
    return Array.from(this.activeLoops)
  }

  /** 重置NPC的循环计数 */
  resetTick(npcId: string): void {
    this.loopCounts.delete(npcId)
    this.lastTickTime.delete(npcId)
  }
}

/** Agent主循环单例 */
export const agentLoop = new AgentLoop()
