// 星火小镇 — NPC Think思考模块
// T2.3.2 目标更新、行为决策LLM调用、选项生成

import { createLogger } from '../utils/index.js'
import { promptEngine } from './promptTemplateEngine.js'
import { modelRouter, ModelPurpose } from './modelRouter.js'
import { profileLoader } from './profileLoader.js'
import type { PerceptionResult } from './perceiveModule.js'
import type { NPCProfile } from '../types/npc-profile.js'

const logger = createLogger('Think')

// =============================================
// 思考输入/输出数据结构
// =============================================

/** 行为选项 — NPC可选择的行为 */
export interface ActionOption {
  /** 行为类型 */
  type: 'continue' | 'move' | 'dialogue' | 'schedule' | 'idle' | 'work' | 'social'
  /** 行为描述 */
  description: string
  /** 目标位置（type=move时） */
  targetLocation?: string
  /** 对话目标ID（type=dialogue时） */
  targetId?: string
  /** 优先级权重（LLM返回或计算得出） */
  weight: number
}

/** 思考结果 — Think模块输出 */
export interface ThinkResult {
  /** NPC ID */
  npcId: string
  /** 感知结果（透传） */
  perception: PerceptionResult
  /** 选定的行为 */
  selectedAction: ActionOption
  /** 更新后的目标 */
  updatedGoal: string | null
  /** 思考过程（用于调试/日志） */
  reasoning: string
  /** 是否使用了LLM（false=纯规则决策） */
  usedLLM: boolean
  /** Token消耗 */
  tokenUsage?: {
    promptTokens: number
    completionTokens: number
  }
}

/**
 * ThinkModule — NPC思考模块
 *
 * 职责：
 * 1. 目标更新：根据感知结果决定是否更新当前目标
 * 2. 行为决策：通过LLM或规则引擎选择最优行为
 * 3. 选项生成：列出可选行为并评估优先级
 * 4. 决策降级：LLM不可用时使用规则引擎决策
 */
class ThinkModule {
  /** 高优先级事件类型 — 触发LLM决策 */
  private highPriorityEvents = new Set([
    'player_approach',
    'quest_event',
  ])

  /** 目标最大持续Tick数（超时自动清除） */
  private maxGoalDuration = 50

  /** 目标缓存 — 记录目标开始Tick */
  private goalStartTick: Map<string, number> = new Map()

  /** 当前Tick计数器 */
  private currentTick = 0

  constructor() {
    logger.info('Think module initialized')
  }

  /**
   * 执行思考 — Agent循环入口
   * @param npcId - NPC ID
   * @param perception - 感知结果
   * @param tick - 当前Tick计数
   * @returns 思考结果
   */
  async think(npcId: string, perception: PerceptionResult, tick?: number): Promise<ThinkResult> {
    if (tick !== undefined) this.currentTick = tick

    // 1. 生成可选行为
    const options = this.generateOptions(npcId, perception)

    // 2. 判断是否需要LLM决策
    const needsLLM = this.shouldUseLLM(npcId, perception)

    // 3. 执行决策
    let result: ThinkResult

    if (needsLLM) {
      result = await this.thinkWithLLM(npcId, perception, options)
    } else {
      result = this.thinkWithRules(npcId, perception, options)
    }

    // 4. 更新目标
    this.updateGoal(npcId, result)

    return result
  }

  /**
   * 生成可选行为 — 基于感知结果列出所有可能的行为
   * T5.2.3 调优：社交触发概率受角色性格影响
   */
  private generateOptions(npcId: string, perception: PerceptionResult): ActionOption[] {
    const options: ActionOption[] = []
    const { profile, runtimeState, currentSchedule } = perception

    // 选项1：继续当前行为
    if (runtimeState.currentAction !== 'idle') {
      options.push({
        type: 'continue',
        description: `继续${runtimeState.currentAction}`,
        weight: 3,
      })
    }

    // 选项2：执行日程
    if (currentSchedule && currentSchedule.action !== runtimeState.currentAction) {
      options.push({
        type: 'schedule',
        description: `按日程${currentSchedule.action}（${currentSchedule.location}）`,
        targetLocation: currentSchedule.location,
        weight: 5,
      })
    }

    // 选项3：与附近玩家对话
    const nearbyPlayers = perception.environment.nearbyEntities.filter(
      (e) => e.type === 'player' && e.inDialogueRange,
    )
    for (const player of nearbyPlayers) {
      options.push({
        type: 'dialogue',
        description: `与冒险者${player.name}对话`,
        targetId: player.id,
        weight: 8,
      })
    }

    // 选项4：与附近NPC社交 — T5.2.3: 社交概率受性格影响
    const nearbyNpcs = perception.environment.nearbyEntities.filter(
      (e) => e.type === 'npc' && e.inDialogueRange && e.id !== npcId,
    )
    if (nearbyNpcs.length > 0) {
      // T5.2.3: 根据角色性格调整社交意愿
      const socialProbability = this.getSocialProbability(profile)
      if (Math.random() < socialProbability) {
        const target = nearbyNpcs[Math.floor(Math.random() * nearbyNpcs.length)]
        options.push({
          type: 'social',
          description: `和${target.name}聊聊天`,
          targetId: target.id,
          weight: 2,
        })
      }
    }

    // 选项5：移动到其他地点（根据日程或随机）
    if (!runtimeState.talkingTo) {
      const moveTarget = this.getMoveTarget(profile, perception)
      if (moveTarget) {
        options.push({
          type: 'move',
          description: `前往${moveTarget}`,
          targetLocation: moveTarget,
          weight: 4,
        })
      }
    }

    // 选项6：待机
    options.push({
      type: 'idle',
      description: '原地待机',
      weight: 1,
    })

    return options
  }

  /**
   * T5.2.3 新增：根据角色性格计算社交意愿概率
   * 热情/活泼的性格更愿意社交，沉默/孤僻的性格社交意愿低
   */
  private getSocialProbability(profile: NPCProfile): number {
    const personality = profile.personality
    let probability = 0.3 // 基础概率30%

    // 性格关键词影响
    const extrovertKeywords = ['热情', '活泼', '开朗', '健谈', '友善', '好客']
    const introvertKeywords = ['沉默', '寡言', '孤僻', '内向', '冷淡', '神秘']

    for (const keyword of extrovertKeywords) {
      if (personality.includes(keyword)) probability += 0.15
    }
    for (const keyword of introvertKeywords) {
      if (personality.includes(keyword)) probability -= 0.15
    }

    // 心情影响
    const moodModifiers: Record<string, number> = {
      happy: 0.1,
      excited: 0.15,
      neutral: 0,
      calm: 0.05,
      sad: -0.15,
      angry: -0.2,
      anxious: -0.1,
    }
    probability += moodModifiers[profile.mood] ?? 0

    // 限制范围
    return Math.max(0.05, Math.min(0.8, probability))
  }

  /**
   * 判断是否需要LLM决策
   * 规则：有高优先级事件/有玩家在对话范围内/随机10%概率触发反思
   */
  private shouldUseLLM(npcId: string, perception: PerceptionResult): boolean {
    // 有玩家接近 — 必须LLM
    const hasHighPriority = perception.environment.nearbyEntities.some(
      (e) => e.type === 'player' && e.inDialogueRange,
    )
    if (hasHighPriority) return true

    // 有高优先级事件
    const runtimeState = profileLoader.getRuntimeState(npcId)
    if (runtimeState) {
      const hasHighEvent = runtimeState.recentEvents.some(
        (e) => this.highPriorityEvents.has(e.type) && Date.now() - e.timestamp < 10000,
      )
      if (hasHighEvent) return true
    }

    // 10%概率触发LLM反思（保持NPC行为自然性）
    if (Math.random() < 0.1) return true

    return false
  }

  /**
   * LLM决策 — 调用LLM进行行为决策
   * T5.2.3 调优：注入角色动机，改进System Prompt
   */
  private async thinkWithLLM(
    npcId: string,
    perception: PerceptionResult,
    options: ActionOption[],
  ): Promise<ThinkResult> {
    try {
      // 构造Prompt — T5.2.3: 注入角色动机
      const variables = promptEngine.buildVariablesFromProfile({
        npcName: perception.profile.name,
        npcTitle: perception.profile.title,
        npcPersonality: perception.profile.personality,
        npcSpeechStyle: perception.profile.speechStyle,
        npcBackstory: perception.profile.backstory,
        npcMood: perception.profile.mood,
        currentLocation: perception.environment.currentArea,
        timeOfDay: `${perception.environment.gameHour}:00`,
        currentAction: perception.runtimeState.currentAction,
        perceivedEvents: perception.runtimeState.recentEvents
          .slice(-5)
          .map((e) => `[${e.type}] ${e.content}`)
          .join('\n') || '（没有特别的事件）',
        recentMemories: perception.relevantMemories
          .slice(0, 3)
          .map((m) => `[${m.type}] ${m.content}`)
          .join('\n') || '（没有最近记忆）',
        relations: perception.relationSummary,
        // T5.2.3 新增：注入角色动机
        motivations: perception.profile.motivations,
      })

      const prompt = promptEngine.render('think-decision', variables)

      // T5.2.3: 改进System Prompt — 更明确的输出格式要求
      const messages = [
        { role: 'system' as const, content: `你是RPG游戏中NPC「${perception.profile.name}」的行为决策助手。请帮助NPC以符合角色设定和当前情境的方式决定下一步行动。

输出格式要求：
- 第一行：行为类型（继续/移动/对话/日程/待机）
- 第二行：简要描述（1句话）
- 第三行：原因（1句话，从角色角度说明）

示例：
对话
与冒险者交谈
正好有人过来，不如聊聊` },
        { role: 'user' as const, content: prompt },
      ]

      const response = await modelRouter.chat(messages, ModelPurpose.Fast, variables)

      // 解析LLM输出
      const selectedAction = this.parseLLMOutput(response.content, options)
      const reasoning = response.content

      return {
        npcId,
        perception,
        selectedAction,
        updatedGoal: this.extractGoalFromReasoning(reasoning),
        reasoning,
        usedLLM: true,
        tokenUsage: {
          promptTokens: response.usage.promptTokens,
          completionTokens: response.usage.completionTokens,
        },
      }
    } catch (err) {
      logger.warn(`LLM think failed for ${npcId}, falling back to rules: ${(err as Error).message}`)
      return this.thinkWithRules(npcId, perception, options)
    }
  }

  /**
   * 规则引擎决策 — 无LLM时使用规则
   */
  private thinkWithRules(
    npcId: string,
    perception: PerceptionResult,
    options: ActionOption[],
  ): ThinkResult {
    const { runtimeState, currentSchedule } = perception

    // 规则1：玩家在对话范围内 → 对话
    // 修复：不再要求 talkingTo === null。interaction:trigger 会预先设置 talkingTo，
    // 若仍要求 null，则永远命中规则2(continue)，NPC永远不会生成开场白问候。
    const dialogueOption = options.find((o) => o.type === 'dialogue')
    const playerNearby = perception.environment.nearbyEntities.some(
      (e) => e.type === 'player' && e.inDialogueRange,
    )
    if (dialogueOption && playerNearby) {
      return {
        npcId,
        perception,
        selectedAction: dialogueOption,
        updatedGoal: runtimeState.currentGoal,
        reasoning: '[规则] 玩家在对话范围内，选择对话',
        usedLLM: false,
      }
    }

    // 规则2：正在对话中 → 继续
    if (runtimeState.talkingTo) {
      return {
        npcId,
        perception,
        selectedAction: {
          type: 'continue',
          description: '继续对话',
          weight: 10,
        },
        updatedGoal: runtimeState.currentGoal,
        reasoning: '[规则] 正在对话中，继续对话',
        usedLLM: false,
      }
    }

    // 规则3：日程与当前行为不一致 → 执行日程
    if (currentSchedule && currentSchedule.action !== runtimeState.currentAction) {
      const scheduleOption = options.find((o) => o.type === 'schedule')
      if (scheduleOption) {
        return {
          npcId,
          perception,
          selectedAction: scheduleOption,
          updatedGoal: `执行日程：${currentSchedule.action}`,
          reasoning: `[规则] 按日程执行：${currentSchedule.action}`,
          usedLLM: false,
        }
      }
    }

    // 规则4：选择权重最高的选项
    const sortedOptions = [...options].sort((a, b) => b.weight - a.weight)
    const selected = sortedOptions[0]

    return {
      npcId,
      perception,
      selectedAction: selected,
      updatedGoal: runtimeState.currentGoal,
      reasoning: `[规则] 选择最高权重行为：${selected.description}`,
      usedLLM: false,
    }
  }

  /**
   * 解析LLM输出为ActionOption
   * T5.2.3 调优：支持多行格式和更鲁棒的匹配
   */
  private parseLLMOutput(output: string, options: ActionOption[]): ActionOption {
    const normalized = output.trim().toLowerCase()

    // T5.2.3: 先尝试解析多行格式（第一行为行为类型）
    const firstLine = normalized.split('\n')[0].trim()

    // 尝试匹配行为类型
    const typeMap: Record<string, ActionOption['type']> = {
      '继续': 'continue',
      'continue': 'continue',
      '移动': 'move',
      'move': 'move',
      '对话': 'dialogue',
      'dialogue': 'dialogue',
      '社交': 'social',
      'social': 'social',
      '日程': 'schedule',
      'schedule': 'schedule',
      '工作': 'work',
      'work': 'work',
      '待机': 'idle',
      'idle': 'idle',
    }

    // 先检查第一行
    for (const [keyword, type] of Object.entries(typeMap)) {
      if (firstLine.includes(keyword)) {
        const matched = options.find((o) => o.type === type)
        if (matched) return matched
      }
    }

    // 回退：检查整个输出
    for (const [keyword, type] of Object.entries(typeMap)) {
      if (normalized.includes(keyword)) {
        const matched = options.find((o) => o.type === type)
        if (matched) return matched
      }
    }

    // 无法匹配时选择权重最高的
    const sorted = [...options].sort((a, b) => b.weight - a.weight)
    return sorted[0]
  }

  /**
   * 从思考推理中提取目标
   * T5.2.3 调优：增强正则匹配，支持多行输出格式
   */
  private extractGoalFromReasoning(reasoning: string): string | null {
    // T5.2.3: 先尝试解析多行格式（行为类型/描述/原因）
    const lines = reasoning.trim().split('\n').filter((l) => l.trim())
    if (lines.length >= 2) {
      // 如果有第二行（描述），作为目标
      const description = lines[1].trim()
      if (description && description.length <= 50) {
        return description
      }
    }

    // 回退：正则提取关键词
    const goalMatch = reasoning.match(/(?:目标|决定|想要|打算|准备)(.{1,50}?)(?:[。\n]|$)/)
    return goalMatch ? goalMatch[1].trim() : null
  }

  /**
   * 获取移动目标 — 根据日程或当前位置推断
   */
  private getMoveTarget(_profile: NPCProfile, perception: PerceptionResult): string | null {
    const schedule = perception.currentSchedule
    if (schedule && schedule.location !== perception.environment.currentArea) {
      return schedule.location
    }

    // 如果在当前位置待得太久，随机换一个地点
    if (perception.runtimeState.currentAction === 'idle' && Math.random() < 0.2) {
      const areas = ['广场', '市场', '酒馆', '铁匠铺', '药草园']
      return areas[Math.floor(Math.random() * areas.length)]
    }

    return null
  }

  /**
   * 更新NPC目标
   */
  private updateGoal(npcId: string, thinkResult: ThinkResult): void {
    const runtimeState = profileLoader.getRuntimeState(npcId)
    if (!runtimeState) return

    // 如果有新目标，更新
    if (thinkResult.updatedGoal !== undefined) {
      if (thinkResult.updatedGoal !== null && thinkResult.updatedGoal !== runtimeState.currentGoal) {
        profileLoader.updateRuntimeState(npcId, {
          currentGoal: thinkResult.updatedGoal,
        })
        this.goalStartTick.set(npcId, this.currentTick)
      }
    }

    // 目标超时清除
    const startTick = this.goalStartTick.get(npcId) ?? 0
    if (runtimeState.currentGoal && this.currentTick - startTick > this.maxGoalDuration) {
      profileLoader.updateRuntimeState(npcId, { currentGoal: null })
      this.goalStartTick.delete(npcId)
    }

    // 更新当前行为
    profileLoader.updateRuntimeState(npcId, {
      currentAction: this.actionToState(thinkResult.selectedAction),
    })
  }

  /**
   * 将ActionOption转换为运行时状态字符串
   */
  private actionToState(action: ActionOption): string {
    switch (action.type) {
      case 'continue':
        return 'continuing'
      case 'move':
        return 'moving'
      case 'dialogue':
        return 'talking'
      case 'schedule':
        return 'working'
      case 'social':
        return 'socializing'
      case 'work':
        return 'working'
      case 'idle':
      default:
        return 'idle'
    }
  }

  /**
   * 获取当前Tick
   */
  getTick(): number {
    return this.currentTick
  }

  /**
   * 设置当前Tick（外部调度器调用）
   */
  setTick(tick: number): void {
    this.currentTick = tick
  }
}

/** 全局Think模块实例 */
export const thinkModule = new ThinkModule()
