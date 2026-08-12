// 星火小镇 — NPC Act行动模块
// T2.3.3 移动执行、对话发起、行为动画触发

import { createLogger } from '../utils/index.js'
import { profileLoader } from './profileLoader.js'
import { dialoguePromptBuilder } from './dialoguePromptBuilder.js'
import { dialogueHistoryManager } from './dialogueHistoryManager.js'
import { modelRouter, ModelPurpose } from './modelRouter.js'
import type { ThinkResult, ActionOption } from './thinkModule.js'
import type { PerceptionResult } from './perceiveModule.js'

const logger = createLogger('Act')

// =============================================
// 行动输出数据结构
// =============================================

/** 行动执行结果 */
export interface ActResult {
  /** NPC ID */
  npcId: string
  /** 执行的行动类型 */
  actionType: ActionOption['type']
  /** 行动描述 */
  description: string
  /** 行动是否成功执行 */
  success: boolean
  /** 目标ID（对话对象等） */
  targetId?: string
  /** 目标位置 */
  targetLocation?: string
  /** 生成的对话内容（type=dialogue/social时） */
  dialogueContent?: string
  /** 状态变更 */
  stateChanges: {
    /** 更新后的行为状态 */
    currentAction: string
    /** 更新后的对话对象 */
    talkingTo: string | null
    /** 是否位置变更 */
    positionChanged: boolean
    /** 新位置 */
    newPosition?: { x: number; y: number; direction: string }
  }
  /** Token消耗（如果调用了LLM生成对话） */
  tokenUsage?: {
    promptTokens: number
    completionTokens: number
  }
}

/** 移动路径点 */
export interface MoveWaypoint {
  x: number
  y: number
  direction: string
  speed?: number
}

/**
 * ActModule — NPC行动模块
 *
 * 职责：
 * 1. 移动执行：将决策中的移动目标转为坐标和路径点
 * 2. 对话发起：为NPC生成开场白/回复内容
 * 3. 行为动画触发：根据行动类型触发对应动画
 * 4. 日程执行：按日程表切换位置和行为
 * 5. 状态更新：执行行动后更新NPC运行时状态
 */
class ActModule {
  /** 移动速度（像素/秒） */
  private moveSpeed = 60

  /** NPC区域坐标映射（区域名→中心坐标） */
  private areaPositions: Record<string, { x: number; y: number }> = {
    '广场': { x: 160, y: 90 },
    '市场': { x: 240, y: 90 },
    '酒馆': { x: 80, y: 130 },
    '铁匠铺': { x: 240, y: 130 },
    '药草园': { x: 80, y: 50 },
    '教堂': { x: 160, y: 50 },
    '磨坊': { x: 240, y: 50 },
    '森林入口': { x: 40, y: 90 },
    '镇门口': { x: 160, y: 160 },
  }

  /** 行为→动画映射 */
  private actionAnimations: Record<string, string> = {
    'idle': 'idle',
    'walking': 'walk',
    'talking': 'talk',
    'working': 'work',
    'socializing': 'talk',
    'moving': 'walk',
    'continuing': 'idle',
  }

  constructor() {
    logger.info('Act module initialized')
  }

  /**
   * 执行行动 — Agent循环入口
   * @param thinkResult - 思考模块的输出
   * @returns 行动执行结果
   */
  async act(thinkResult: ThinkResult): Promise<ActResult> {
    const { npcId, selectedAction, perception } = thinkResult

    try {
      let result: ActResult

      switch (selectedAction.type) {
        case 'dialogue':
          result = await this.executeDialogue(npcId, selectedAction, perception)
          break
        case 'social':
          result = await this.executeSocial(npcId, selectedAction, perception)
          break
        case 'move':
          result = this.executeMove(npcId, selectedAction, perception)
          break
        case 'schedule':
          result = this.executeSchedule(npcId, selectedAction, perception)
          break
        case 'work':
          result = this.executeWork(npcId, selectedAction, perception)
          break
        case 'continue':
          result = this.executeContinue(npcId, selectedAction, perception)
          break
        case 'idle':
        default:
          result = this.executeIdle(npcId, perception)
          break
      }

      // 更新运行时状态
      this.updateRuntimeState(npcId, result)

      logger.info(`[${npcId}] Act: ${result.actionType} - ${result.description} (${result.success ? 'OK' : 'FAIL'})`)
      return result
    } catch (err) {
      logger.error(`[${npcId}] Act error: ${(err as Error).message}`)

      // 降级到待机
      return this.executeIdle(npcId, perception)
    }
  }

  // =============================================
  // 行动执行方法
  // =============================================

  /**
   * 执行对话 — NPC与玩家对话
   */
  private async executeDialogue(
    npcId: string,
    action: ActionOption,
    perception: PerceptionResult,
  ): Promise<ActResult> {
    const targetId = action.targetId ?? perception.environment.nearbyEntities.find(
      (e) => e.type === 'player' && e.inDialogueRange,
    )?.id

    if (!targetId) {
      return this.executeIdle(npcId, perception)
    }

    // 获取对话目标名字
    const targetEntity = perception.environment.nearbyEntities.find((e) => e.id === targetId)
    const targetName = targetEntity?.name ?? '旅行者'

    // 构造对话开场白
    const dialogueResult = await this.generateGreeting(npcId, targetName, perception)

    return {
      npcId,
      actionType: 'dialogue',
      description: `与${targetName}对话`,
      success: true,
      targetId,
      dialogueContent: dialogueResult.content,
      stateChanges: {
        currentAction: 'talking',
        talkingTo: targetId,
        positionChanged: false,
      },
      tokenUsage: dialogueResult.tokenUsage,
    }
  }

  /**
   * 执行社交 — NPC与NPC交互
   */
  private async executeSocial(
    npcId: string,
    action: ActionOption,
    perception: PerceptionResult,
  ): Promise<ActResult> {
    const targetId = action.targetId ?? perception.environment.nearbyEntities.find(
      (e) => e.type === 'npc' && e.id !== npcId,
    )?.id

    if (!targetId) {
      return this.executeIdle(npcId, perception)
    }

    const targetEntity = perception.environment.nearbyEntities.find((e) => e.id === targetId)
    const targetName = targetEntity?.name ?? '某人'

    // 生成NPC间社交对话
    const dialogueResult = await this.generateGreeting(npcId, targetName, perception)

    return {
      npcId,
      actionType: 'social',
      description: `和${targetName}聊天`,
      success: true,
      targetId,
      dialogueContent: dialogueResult.content,
      stateChanges: {
        currentAction: 'socializing',
        talkingTo: targetId,
        positionChanged: false,
      },
      tokenUsage: dialogueResult.tokenUsage,
    }
  }

  /**
   * 执行移动 — NPC前往目标位置
   */
  private executeMove(
    npcId: string,
    action: ActionOption,
    perception: PerceptionResult,
  ): ActResult {
    const targetLocation = action.targetLocation
    const profile = perception.profile

    // 计算目标坐标
    let targetPos: { x: number; y: number }
    if (targetLocation && this.areaPositions[targetLocation]) {
      targetPos = this.areaPositions[targetLocation]
    } else {
      // 随机偏移当前位置
      targetPos = {
        x: profile.x + (Math.random() - 0.5) * 40,
        y: profile.y + (Math.random() - 0.5) * 40,
      }
    }

    // 计算朝向
    const dx = targetPos.x - profile.x
    const dy = targetPos.y - profile.y
    const direction = this.calculateDirection(dx, dy)

    // 计算路径点（简化版：直线移动）
    this.generateWaypoints(profile.x, profile.y, targetPos.x, targetPos.y)

    return {
      npcId,
      actionType: 'move',
      description: action.description,
      success: true,
      targetLocation,
      stateChanges: {
        currentAction: 'moving',
        talkingTo: null,
        positionChanged: true,
        newPosition: {
          x: targetPos.x,
          y: targetPos.y,
          direction,
        },
      },
    }
  }

  /**
   * 执行日程 — NPC按日程表行动
   */
  private executeSchedule(
    npcId: string,
    _action: ActionOption,
    perception: PerceptionResult,
  ): ActResult {
    const schedule = perception.currentSchedule
    if (!schedule) {
      return this.executeIdle(npcId, perception)
    }

    const targetPos = this.areaPositions[schedule.location]

    return {
      npcId,
      actionType: 'schedule',
      description: `按日程${schedule.action}（${schedule.location}）`,
      success: true,
      targetLocation: schedule.location,
      stateChanges: {
        currentAction: 'working',
        talkingTo: null,
        positionChanged: !!targetPos,
        newPosition: targetPos ? {
          x: targetPos.x,
          y: targetPos.y,
          direction: 'down',
        } : undefined,
      },
    }
  }

  /**
   * 执行工作 — NPC进行工作行为
   */
  private executeWork(
    npcId: string,
    action: ActionOption,
    _perception: PerceptionResult,
  ): ActResult {
    return {
      npcId,
      actionType: 'work',
      description: action.description,
      success: true,
      stateChanges: {
        currentAction: 'working',
        talkingTo: null,
        positionChanged: false,
      },
    }
  }

  /**
   * 继续当前行为
   */
  private executeContinue(
    npcId: string,
    action: ActionOption,
    perception: PerceptionResult,
  ): ActResult {

    const currentAction = perception.runtimeState.currentAction

    return {
      npcId,
      actionType: 'continue',
      description: action.description,
      success: true,
      stateChanges: {
        currentAction,
        talkingTo: perception.runtimeState.talkingTo,
        positionChanged: false,
      },
    }
  }

  /**
   * 待机
   */
  private executeIdle(
    npcId: string,
    _perception: PerceptionResult,
  ): ActResult {
    return {
      npcId,
      actionType: 'idle',
      description: '原地待机',
      success: true,
      stateChanges: {
        currentAction: 'idle',
        talkingTo: null,
        positionChanged: false,
      },
    }
  }

  // =============================================
  // 对话生成辅助
  // =============================================

  /**
   * 生成问候/开场白
   */
  private async generateGreeting(
    npcId: string,
    targetName: string,
    perception: PerceptionResult,
  ): Promise<{ content: string; tokenUsage?: { promptTokens: number; completionTokens: number } }> {
    try {
      // 获取对话历史
      const historySession = dialogueHistoryManager.getOrCreateSession(npcId, targetName, targetName)
      const historyText = dialogueHistoryManager.getHistoryText(npcId, targetName)

      // 使用DialoguePromptBuilder生成招呼
      const promptResult = dialoguePromptBuilder.buildGreeting(
        npcId,
        targetName,
        perception.environment.currentArea,
        `${perception.environment.gameHour}:00`,
      )

      // 如果有历史对话，用main模板
      if (historySession.messages.length > 0) {
        const context = {
          profile: perception.profile,
          runtimeState: perception.runtimeState,
          playerMessage: '你好',
          playerName: targetName,
          playerId: targetName,
          currentLocation: perception.environment.currentArea,
          gameTime: `${perception.environment.gameHour}:00`,
          relevantMemories: perception.relevantMemories.map((m) => `[${m.type}] ${m.content}`).join('\n'),
          dialogueHistory: historyText,
          relationSummary: perception.relationSummary,
          dialogueType: 'greeting' as const,
        }

        const mainPrompt = dialoguePromptBuilder.build(context)
        const response = await modelRouter.chat(mainPrompt.messages, ModelPurpose.Chat, undefined, { skipReasoning: true })

        // 记录到对话历史
        dialogueHistoryManager.addMessage(npcId, targetName, 'player', targetName, '你好')
        dialogueHistoryManager.addMessage(npcId, targetName, 'npc', perception.profile.name, response.content)

        return {
          content: response.content,
          tokenUsage: {
            promptTokens: response.usage.promptTokens,
            completionTokens: response.usage.completionTokens,
          },
        }
      }

      // 首次对话 — 使用greeting模板
      const response = await modelRouter.chat(promptResult.messages, ModelPurpose.Fast, undefined, { skipReasoning: true })

      // 记录到对话历史
      dialogueHistoryManager.addMessage(npcId, targetName, 'npc', perception.profile.name, response.content)

      return {
        content: response.content,
        tokenUsage: {
          promptTokens: response.usage.promptTokens,
          completionTokens: response.usage.completionTokens,
        },
      }
    } catch (err) {
      logger.warn(`[${npcId}] Greeting generation failed: ${(err as Error).message}`)

      // 降级：使用角色口头禅或默认问候
      const profile = perception.profile
      const fallback = profile.catchphrases.length > 0
        ? profile.catchphrases[Math.floor(Math.random() * profile.catchphrases.length)]
        : `你好，${targetName}。`

      return { content: fallback }
    }
  }

  /**
   * 生成NPC回复（玩家发言后）
   */
  async generateReply(
    npcId: string,
    playerMessage: string,
    playerName: string,
    playerId: string,
    perception: PerceptionResult,
  ): Promise<{ content: string; tokenUsage?: { promptTokens: number; completionTokens: number } }> {
    try {
      const historyText = dialogueHistoryManager.getHistoryText(npcId, playerId)

      const context = {
        profile: perception.profile,
        runtimeState: perception.runtimeState,
        playerMessage,
        playerName,
        playerId,
        currentLocation: perception.environment.currentArea,
        gameTime: `${perception.environment.gameHour}:00`,
        relevantMemories: perception.relevantMemories.map((m) => `[${m.type}] ${m.content}`).join('\n'),
        dialogueHistory: historyText,
        relationSummary: perception.relationSummary,
        dialogueType: 'main' as const,
      }

      const promptResult = dialoguePromptBuilder.build(context)
      const response = await modelRouter.chat(promptResult.messages, ModelPurpose.Chat, undefined, { skipReasoning: true })

      // 记录对话历史
      dialogueHistoryManager.addMessage(npcId, playerId, 'player', playerName, playerMessage)
      dialogueHistoryManager.addMessage(npcId, playerId, 'npc', perception.profile.name, response.content)

      return {
        content: response.content,
        tokenUsage: {
          promptTokens: response.usage.promptTokens,
          completionTokens: response.usage.completionTokens,
        },
      }
    } catch (err) {
      logger.warn(`[${npcId}] Reply generation failed: ${(err as Error).message}`)
      return { content: '...' }
    }
  }

  /**
   * 生成流式NPC回复 — 支持SSE/WebSocket流式输出
   */
  async generateReplyStream(
    npcId: string,
    playerMessage: string,
    playerName: string,
    playerId: string,
    perception: PerceptionResult,
    onChunk: (chunk: string) => void,
  ): Promise<{ content: string; tokenUsage?: { promptTokens: number; completionTokens: number } }> {
    try {
      const historyText = dialogueHistoryManager.getHistoryText(npcId, playerId)

      const context = {
        profile: perception.profile,
        runtimeState: perception.runtimeState,
        playerMessage,
        playerName,
        playerId,
        currentLocation: perception.environment.currentArea,
        gameTime: `${perception.environment.gameHour}:00`,
        relevantMemories: perception.relevantMemories.map((m) => `[${m.type}] ${m.content}`).join('\n'),
        dialogueHistory: historyText,
        relationSummary: perception.relationSummary,
        dialogueType: 'main' as const,
      }

      const promptResult = dialoguePromptBuilder.build(context)
      const response = await modelRouter.chatStream(
        promptResult.messages,
        onChunk,
        ModelPurpose.Chat,
        undefined,
        { skipReasoning: true },
      )

      // 记录对话历史
      dialogueHistoryManager.addMessage(npcId, playerId, 'player', playerName, playerMessage)
      dialogueHistoryManager.addMessage(npcId, playerId, 'npc', perception.profile.name, response.content)

      return {
        content: response.content,
        tokenUsage: {
          promptTokens: response.usage.promptTokens,
          completionTokens: response.usage.completionTokens,
        },
      }
    } catch (err) {
      logger.warn(`[${npcId}] Stream reply generation failed: ${(err as Error).message}`)
      return { content: '...' }
    }
  }

  // =============================================
  // 工具方法
  // =============================================

  /**
   * 计算移动方向
   */
  private calculateDirection(dx: number, dy: number): string {
    if (Math.abs(dx) > Math.abs(dy)) {
      return dx > 0 ? 'right' : 'left'
    }
    return dy > 0 ? 'down' : 'up'
  }

  /**
   * 生成移动路径点（简化版：直线）
   */
  private generateWaypoints(fromX: number, fromY: number, toX: number, toY: number): MoveWaypoint[] {
    const dx = toX - fromX
    const dy = toY - fromY
    const distance = Math.sqrt(dx * dx + dy * dy)

    if (distance < 1) return [{ x: toX, y: toY, direction: 'down' }]

    // 每隔10像素一个路径点
    const steps = Math.max(1, Math.ceil(distance / 10))
    const waypoints: MoveWaypoint[] = []

    for (let i = 1; i <= steps; i++) {
      const t = i / steps
      const x = fromX + dx * t
      const y = fromY + dy * t
      const direction = this.calculateDirection(dx, dy)

      waypoints.push({ x, y, direction, speed: this.moveSpeed })
    }

    return waypoints
  }

  /**
   * 更新运行时状态
   */
  private updateRuntimeState(npcId: string, result: ActResult): void {
    const { stateChanges } = result

    profileLoader.updateRuntimeState(npcId, {
      currentAction: stateChanges.currentAction,
      talkingTo: stateChanges.talkingTo,
    })

    // 如果位置变化，更新Profile坐标
    if (stateChanges.positionChanged && stateChanges.newPosition) {
      const profile = profileLoader.getProfile(npcId)
      if (profile) {
        // 运行时状态中不直接改Profile坐标（由调度器统一更新）
        // 这里通过updateRuntimeState标记移动目标
        profileLoader.updateRuntimeState(npcId, {
          currentAction: stateChanges.currentAction,
        })
      }
    }
  }

  /**
   * 获取行为对应的动画名
   */
  getAnimationForAction(action: string): string {
    return this.actionAnimations[action] ?? 'idle'
  }

  /**
   * 获取区域坐标
   */
  getAreaPosition(areaName: string): { x: number; y: number } | undefined {
    return this.areaPositions[areaName]
  }

  /**
   * 设置区域坐标（运行时更新）
   */
  setAreaPosition(areaName: string, x: number, y: number): void {
    this.areaPositions[areaName] = { x, y }
  }
}

/** 全局行动模块实例 */
export const actModule = new ActModule()
