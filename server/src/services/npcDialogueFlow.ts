// 星火小镇 — NPC间对话流程
// T2.7.2 开场白→回复→轮次限制(5轮)→记忆更新

import { createLogger } from '../utils/index.js'
import { profileLoader } from './profileLoader.js'
import { dialogueHistoryManager } from './dialogueHistoryManager.js'
import { memoryUpdateModule } from './memoryUpdateModule.js'
import { modelRouter, ModelPurpose } from './modelRouter.js'
import { interactionTriggerEngine } from './interactionTriggerEngine.js'

const logger = createLogger('NpcDialogue')

// =============================================
// 类型定义
// =============================================

/** NPC间对话消息 */
export interface NpcDialogueMessage {
  /** 说话者NPC ID */
  speakerId: string
  /** 说话者名字 */
  speakerName: string
  /** 消息内容 */
  content: string
  /** 轮次编号 */
  round: number
  /** 时间戳 */
  timestamp: number
}

/** NPC间对话结果 */
export interface NpcDialogueResult {
  /** 对话ID */
  dialogueId: string
  /** 发起NPC ID */
  initiatorId: string
  /** 目标NPC ID */
  targetId: string
  /** 对话消息列表 */
  messages: NpcDialogueMessage[]
  /** 总轮次 */
  totalRounds: number
  /** 对话是否完整完成 */
  completed: boolean
  /** 结束原因 */
  endReason: 'max_rounds' | 'natural_end' | 'interrupted' | 'error'
  /** 对话摘要 */
  summary: string
  /** 关键信息（用于信息传播） */
  keyInformation: string[]
  /** 耗时(ms) */
  duration: number
  /** Token用量 */
  tokenUsage?: { promptTokens: number; completionTokens: number; totalTokens: number }
}

/** NPC间对话配置 */
export interface NpcDialogueConfig {
  /** 最大对话轮次，默认5 */
  maxRounds: number
  /** 每轮最大延迟(ms)，默认3000 */
  roundDelay: number
  /** 是否启用记忆更新，默认true */
  enableMemoryUpdate: boolean
  /** 是否生成对话摘要，默认true */
  enableSummary: boolean
  /** 对话触发后冷却时间(秒)，默认600 */
  postDialogueCooldown: number
}

// =============================================
// NPC间对话流程
// =============================================

/**
 * NpcDialogueFlow — NPC间自主对话流程
 *
 * 流程：
 * 1. 触发阶段：由交互触发引擎发起
 * 2. 开场白：发起者生成开场白
 * 3. 回复轮次：双方交替回复（最多5轮）
 * 4. 结束阶段：自然结束或达到轮次限制
 * 5. 记忆更新：双方各自更新对话记忆
 * 6. 摘要生成：提取关键信息用于信息传播
 */
class NpcDialogueFlow {
  /** 配置 */
  private config: NpcDialogueConfig = {
    maxRounds: 5,
    roundDelay: 3000,
    enableMemoryUpdate: true,
    enableSummary: true,
    postDialogueCooldown: 600,
  }

  /** 正在进行的对话 */
  private activeDialogues: Map<string, NpcDialogueResult> = new Map()

  /** 对话历史记录（最近100次） */
  private dialogueHistory: NpcDialogueResult[] = []

  /** 对话ID计数器 */
  private dialogueCounter = 0

  /** 统计 */
  private stats = {
    totalDialogues: 0,
    totalRounds: 0,
    totalTokens: 0,
    avgDuration: 0,
  }

  // =============================================
  // 核心：执行NPC间对话
  // =============================================

  /**
   * 执行NPC间对话 — 主入口
   * @param initiatorId - 发起者NPC ID
   * @param targetId - 目标NPC ID
   * @param context - 额外上下文（如触发原因）
   */
  async executeDialogue(
    initiatorId: string,
    targetId: string,
    context?: { reason?: string; location?: string },
  ): Promise<NpcDialogueResult> {
    const startTime = Date.now()
    const dialogueId = `npc-dlg-${++this.dialogueCounter}`

    // 验证NPC存在
    const initiatorProfile = profileLoader.getProfile(initiatorId)
    const targetProfile = profileLoader.getProfile(targetId)

    if (!initiatorProfile || !targetProfile) {
      logger.warn(`Dialogue ${dialogueId}: NPC not found`)
      return this.createErrorResult(dialogueId, initiatorId, targetId, 'NPC不存在')
    }

    // 防止正在对话的NPC参与新对话
    if (this.isInDialogue(initiatorId) || this.isInDialogue(targetId)) {
      return this.createErrorResult(dialogueId, initiatorId, targetId, 'NPC正在对话中')
    }

    const messages: NpcDialogueMessage[] = []
    let totalPromptTokens = 0
    let totalCompletionTokens = 0

    // 标记对话中
    profileLoader.updateRuntimeState(initiatorId, {
      talkingTo: targetId,
      currentAction: 'talking',
    })
    profileLoader.updateRuntimeState(targetId, {
      talkingTo: initiatorId,
      currentAction: 'talking',
    })

    try {
      logger.info(`[${dialogueId}] Starting dialogue: ${initiatorProfile.name} ↔ ${targetProfile.name}`)

      // 轮次循环
      let round = 0
      let endedNaturally = false

      for (round = 1; round <= this.config.maxRounds; round++) {
        // --- 发起者发言 ---
        const initiatorMsg = await this.generateNpcMessage(
          initiatorId,
          targetId,
          round,
          messages,
          context,
        )

        if (!initiatorMsg) break

        messages.push(initiatorMsg)
        totalPromptTokens += 0 // TODO: 从response中获取
        totalCompletionTokens += 0

        // 检查自然结束信号
        if (this.isEndSignal(initiatorMsg.content)) {
          endedNaturally = true
          break
        }

        // --- 目标回复 ---
        const targetMsg = await this.generateNpcMessage(
          targetId,
          initiatorId,
          round,
          messages,
          context,
        )

        if (!targetMsg) break

        messages.push(targetMsg)

        // 检查自然结束信号
        if (this.isEndSignal(targetMsg.content)) {
          endedNaturally = true
          break
        }

        // 轮次间延迟
        if (round < this.config.maxRounds) {
          await new Promise((r) => setTimeout(r, this.config.roundDelay))
        }
      }

      // 确定结束原因
      const endReason: string = endedNaturally
        ? 'natural_end'
        : round > this.config.maxRounds
          ? 'max_rounds'
          : 'interrupted'

      // 生成摘要和关键信息
      const { summary, keyInformation } = this.config.enableSummary
        ? await this.generateSummary(messages, initiatorProfile.name, targetProfile.name)
        : { summary: '', keyInformation: [] }

      const result: NpcDialogueResult = {
        dialogueId,
        initiatorId,
        targetId,
        messages,
        totalRounds: round,
        completed: endReason !== 'error',
        endReason: endReason as NpcDialogueResult['endReason'],
        summary,
        keyInformation,
        duration: Date.now() - startTime,
        tokenUsage: {
          promptTokens: totalPromptTokens,
          completionTokens: totalCompletionTokens,
          totalTokens: totalPromptTokens + totalCompletionTokens,
        },
      }

      // 记忆更新
      if (this.config.enableMemoryUpdate) {
        await this.updateMemories(result)
      }

      // 保存对话记录
      this.activeDialogues.delete(dialogueId)
      this.dialogueHistory.push(result)
      if (this.dialogueHistory.length > 100) {
        this.dialogueHistory.shift()
      }

      // 更新统计
      this.stats.totalDialogues++
      this.stats.totalRounds += round
      this.stats.avgDuration = Math.round(
        (this.stats.avgDuration * (this.stats.totalDialogues - 1) + result.duration) / this.stats.totalDialogues,
      )

      logger.info(
        `[${dialogueId}] Dialogue completed: ${round} rounds, ${endReason}, ${result.duration}ms`,
      )

      return result
    } catch (err) {
      logger.error(`[${dialogueId}] Dialogue failed: ${(err as Error).message}`)

      return {
        dialogueId,
        initiatorId,
        targetId,
        messages,
        totalRounds: messages.length / 2,
        completed: false,
        endReason: 'error',
        summary: '',
        keyInformation: [],
        duration: Date.now() - startTime,
      }
    } finally {
      // 清除对话状态
      profileLoader.updateRuntimeState(initiatorId, {
        talkingTo: null,
        currentAction: 'idle',
      })
      profileLoader.updateRuntimeState(targetId, {
        talkingTo: null,
        currentAction: 'idle',
      })

      // 设置交互冷却
      interactionTriggerEngine.isOnCooldown(initiatorId, targetId)
    }
  }

  // =============================================
  // 消息生成
  // =============================================

  /**
   * 生成NPC在对话中的发言
   */
  private async generateNpcMessage(
    speakerId: string,
    listenerId: string,
    round: number,
    existingMessages: NpcDialogueMessage[],
    context?: { reason?: string; location?: string },
  ): Promise<NpcDialogueMessage | null> {
    const speakerProfile = profileLoader.getProfile(speakerId)
    const listenerProfile = profileLoader.getProfile(listenerId)

    if (!speakerProfile || !listenerProfile) return null

    try {
      // 构造对话上下文
      const previousMessages = existingMessages
        .map((m) => `${m.speakerName}: ${m.content}`)
        .join('\n')

      // 构造Prompt
      const prompt = this.buildNpcDialoguePrompt(
        speakerProfile.name,
        listenerProfile.name,
        speakerProfile.personality,
        speakerProfile.speechStyle.join('、'),
        round,
        previousMessages,
        context,
      )

      // 调用LLM生成回复
      const response = await modelRouter.chat(
        [
          {
            role: 'system',
            content: `你是${speakerProfile.name}，${speakerProfile.title}。性格：${speakerProfile.personality}。说话风格：${speakerProfile.speechStyle.join('、')}。你正在和${listenerProfile.name}对话。保持角色设定，回复1-3句话。`,
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        ModelPurpose.Fast,
        undefined,
        { skipReasoning: true },
      )

      // 记录到对话历史管理器
      dialogueHistoryManager.addMessage(
        speakerId,
        listenerId,
        'npc',
        speakerProfile.name,
        response.content,
      )

      return {
        speakerId,
        speakerName: speakerProfile.name,
        content: response.content.trim(),
        round,
        timestamp: Date.now(),
      }
    } catch (err) {
      logger.warn(`[${speakerId}] Message generation failed: ${(err as Error).message}`)
      return null
    }
  }

  /**
   * 构造NPC间对话Prompt
   */
  private buildNpcDialoguePrompt(
    speakerName: string,
    listenerName: string,
    _personality: string,
    _speechStyle: string,
    round: number,
    previousMessages: string,
    context?: { reason?: string; location?: string },
  ): string {
    let prompt = ''

    if (round === 1 && !previousMessages) {
      // 开场白
      prompt = `你遇到了${listenerName}。`
      if (context?.location) {
        prompt += `你们在${context.location}。`
      }
      if (context?.reason) {
        prompt += `原因：${context.reason}。`
      }
      prompt += `\n请向${listenerName}打个招呼，开始一段对话。保持你${speakerName}的性格和说话风格。`
    } else {
      // 回复
      prompt = `以下是你和${listenerName}的对话：\n${previousMessages}\n\n请继续对话。保持你${speakerName}的性格和说话风格。`
    }

    return prompt
  }

  /**
   * 判断是否为对话结束信号
   */
  private isEndSignal(content: string): boolean {
    const endSignals = ['再见', '告辞', '回头见', '以后再聊', '那就这样吧', '我走了']
    return endSignals.some((signal) => content.includes(signal))
  }

  // =============================================
  // 摘要与关键信息
  // =============================================

  /**
   * 生成对话摘要和关键信息
   */
  private async generateSummary(
    messages: NpcDialogueMessage[],
    initiatorName: string,
    targetName: string,
  ): Promise<{ summary: string; keyInformation: string[] }> {
    if (messages.length === 0) {
      return { summary: '', keyInformation: [] }
    }

    try {
      const dialogueText = messages.map((m) => `${m.speakerName}: ${m.content}`).join('\n')

      const prompt = `以下是一段${initiatorName}和${targetName}的对话：

${dialogueText}

请用1-2句话总结这段对话的主要内容，并提取出2-3个关键信息点（八卦、秘密、计划等）。
格式：
摘要：...
关键信息：
1. ...
2. ...
3. ...`

      const response = await modelRouter.chat(
        [{ role: 'user', content: prompt }],
        ModelPurpose.Fast,
      )

      const content = response.content

      // 解析摘要
      const summaryMatch = content.match(/摘要[：:]\s*(.+)/)
      const summary = summaryMatch ? summaryMatch[1].trim() : content.substring(0, 100)

      // 解析关键信息
      const keyInfo: string[] = []
      const infoRegex = /\d\.\s*(.+)/g
      let match
      while ((match = infoRegex.exec(content)) !== null) {
        keyInfo.push(match[1].trim())
      }

      return { summary, keyInformation: keyInfo.slice(0, 3) }
    } catch {
      // 降级：简单拼接
      const firstMsg = messages[0]
      return {
        summary: `${firstMsg.speakerName}和${messages.length > 1 ? messages[1].speakerName : targetName}聊了几句。`,
        keyInformation: [],
      }
    }
  }

  // =============================================
  // 记忆更新
  // =============================================

  /**
   * 更新双方的对话记忆
   */
  private async updateMemories(result: NpcDialogueResult): Promise<void> {
    const { initiatorId, targetId, messages, summary } = result

    const initiatorProfile = profileLoader.getProfile(initiatorId)
    const targetProfile = profileLoader.getProfile(targetId)

    if (!initiatorProfile || !targetProfile) return

    // 发起者视角的记忆
    await memoryUpdateModule.recordDialogue(
      initiatorId,
      targetId,
      targetProfile.name,
      '（NPC间对话）',
      summary || messages.map((m) => m.content).join(' | '),
      'npc',
    )

    // 目标视角的记忆
    await memoryUpdateModule.recordDialogue(
      targetId,
      initiatorId,
      initiatorProfile.name,
      '（NPC间对话）',
      summary || messages.map((m) => m.content).join(' | '),
      'npc',
    )
  }

  // =============================================
  // 辅助方法
  // =============================================

  /**
   * 检查NPC是否在对话中
   */
  isInDialogue(npcId: string): boolean {
    const runtime = profileLoader.getRuntimeState(npcId)
    return !!runtime?.talkingTo
  }

  /**
   * 创建错误结果
   */
  private createErrorResult(
    dialogueId: string,
    initiatorId: string,
    targetId: string,
    error: string,
  ): NpcDialogueResult {
    return {
      dialogueId,
      initiatorId,
      targetId,
      messages: [],
      totalRounds: 0,
      completed: false,
      endReason: 'error',
      summary: error,
      keyInformation: [],
      duration: 0,
    }
  }

  // =============================================
  // 查询与管理
  // =============================================

  /** 获取对话历史 */
  getDialogueHistory(limit = 20): NpcDialogueResult[] {
    return this.dialogueHistory.slice(-limit)
  }

  /** 获取统计 */
  getStats() {
    return { ...this.stats }
  }

  /** 获取活跃对话数 */
  get activeDialogueCount(): number {
    return this.activeDialogues.size
  }

  /** 更新配置 */
  updateConfig(config: Partial<NpcDialogueConfig>): void {
    this.config = { ...this.config, ...config }
    logger.info('NPC dialogue config updated')
  }
}

/** 全局NPC间对话流程实例 */
export const npcDialogueFlow = new NpcDialogueFlow()
