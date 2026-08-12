// 星火小镇 — 对话Prompt构造器
// T2.4.1 角色人格+记忆+情境+历史→完整Prompt

import { createLogger } from '../utils/index.js'
import { promptEngine } from './promptTemplateEngine.js'
import { profileLoader } from './profileLoader.js'
import type { ChatMessage } from './llmService.js'
import type { NPCProfile, NPCRuntimeState, MoodType } from '../types/npc-profile.js'

const logger = createLogger('DialoguePrompt')

// =============================================
// 对话上下文数据结构
// =============================================

/** 对话上下文 — 构造Prompt所需的全部信息 */
export interface DialogueContext {
  /** NPC档案 */
  profile: NPCProfile
  /** NPC运行时状态 */
  runtimeState: NPCRuntimeState
  /** 玩家消息 */
  playerMessage: string
  /** 玩家名字 */
  playerName: string
  /** 玩家ID */
  playerId: string
  /** 当前位置 */
  currentLocation: string
  /** 当前游戏时间 */
  gameTime: string
  /** 相关记忆文本 */
  relevantMemories: string
  /** 对话历史文本 */
  dialogueHistory: string
  /** 关系摘要 */
  relationSummary: string
  /** 对话类型 */
  dialogueType: 'greeting' | 'main' | 'quest'
  /** 任务上下文（quest类型时） */
  questContext?: string
}

/** 构造结果 */
export interface DialoguePromptResult {
  /** System消息 */
  systemPrompt: string
  /** 用户消息列表（对话历史+当前消息） */
  messages: ChatMessage[]
  /** 模板ID */
  templateId: string
  /** 模型用途 */
  modelPurpose: 'chat' | 'fast' | 'reflect'
  /** 估算Token数 */
  estimatedTokens: number
}

/**
 * DialoguePromptBuilder — 对话Prompt构造器
 *
 * 职责：
 * 1. 根据对话类型选择合适的Prompt模板
 * 2. 将角色人格、记忆、情境、历史整合为完整Prompt
 * 3. 管理上下文窗口（截断过长历史/记忆）
 * 4. 根据关系和心情调整Prompt语气
 */
class DialoguePromptBuilder {
  /** 最大对话历史轮数 */
  private maxHistoryRounds = 5

  /** 最大记忆条数 */
  private maxMemoryEntries = 5

  /** 单条记忆最大字符数 */
  private maxMemoryLength = 200

  constructor() {
    logger.info('Dialogue prompt builder initialized')
  }

  /**
   * 构造对话Prompt — 主入口
   * @param context - 对话上下文
   * @returns 构造结果（可直接传给LLM）
   */
  build(context: DialogueContext): DialoguePromptResult {
    // 1. 选择模板
    const templateId = this.selectTemplate(context)

    // 2. 构造变量
    const variables = this.buildVariables(context)

    // 3. 渲染模板
    const renderedPrompt = promptEngine.render(templateId, variables)

    // 4. 构造消息列表
    const messages = this.buildMessages(renderedPrompt, context)

    // 5. 估算Token数
    const estimatedTokens = this.estimateTokens(messages)

    return {
      systemPrompt: this.buildSystemPrompt(context),
      messages,
      templateId,
      modelPurpose: this.getModelPurpose(context),
      estimatedTokens,
    }
  }

  /**
   * 构造招呼Prompt — 玩家首次接近NPC
   */
  buildGreeting(npcId: string, playerName: string, location: string, gameTime: string): DialoguePromptResult {
    const profile = profileLoader.getProfile(npcId)
    if (!profile) throw new Error(`NPC not found: ${npcId}`)

    const runtimeState = profileLoader.getRuntimeState(npcId)
    const context: DialogueContext = {
      profile,
      runtimeState: runtimeState ?? this.createDefaultRuntimeState(npcId),
      playerMessage: '',
      playerName,
      playerId: '',
      currentLocation: location,
      gameTime,
      relevantMemories: '',
      dialogueHistory: '',
      relationSummary: '',
      dialogueType: 'greeting',
    }

    return this.build(context)
  }

  /**
   * 选择Prompt模板
   */
  private selectTemplate(context: DialogueContext): string {
    switch (context.dialogueType) {
      case 'greeting':
        return 'dialogue-greeting'
      case 'quest':
        return 'dialogue-quest'
      case 'main':
      default:
        return 'dialogue-main'
    }
  }

  /**
   * 构造模板变量
   */
  private buildVariables(context: DialogueContext): Record<string, string> {
    const { profile } = context

    // 关系修饰词 — 根据对玩家的好感度调整
    const moodModifier = this.getMoodModifier(profile.mood)
    const relationModifier = this.getRelationModifier(context.relationSummary)

    // 截断记忆
    const truncatedMemories = this.truncateMemories(context.relevantMemories)

    // 格式化对话历史
    const formattedHistory = this.formatDialogueHistory(context.dialogueHistory, context.profile.name)

    // 关系文本（加入修饰）
    const enhancedRelations = context.relationSummary
      ? `${context.relationSummary}\n${relationModifier}`
      : '（对方是初次见面的冒险者）'

    return promptEngine.buildVariablesFromProfile({
      npcName: profile.name,
      npcTitle: profile.title,
      npcPersonality: `${profile.personality} ${moodModifier}`,
      npcSpeechStyle: profile.speechStyle,
      npcBackstory: profile.backstory,
      npcMood: `${profile.mood}（${this.getMoodDescription(profile.mood)}）`,
      currentLocation: context.currentLocation,
      timeOfDay: context.gameTime,
      playerMessage: context.playerMessage,
      recentMemories: truncatedMemories,
      shortTermMemory: formattedHistory,
      relations: enhancedRelations,
      questContext: context.questContext,
    })
  }

  /**
   * 构造System消息 — 定义NPC行为准则
   * T5.2.1 增强：强化人设一致性约束
   */
  private buildSystemPrompt(context: DialogueContext): string {
    const { profile } = context

    // 说话风格指导 — 将抽象形容词转化为具体说话方式
    const speechGuide = this.buildSpeechStyleGuide(profile.speechStyle)

    // 角色身份知识约束 — 基于role和likes/dislikes
    const identityConstraint = this.buildIdentityConstraint(profile)

    // 口头禅 — 建议但不强制每次使用
    const catchphraseHint = profile.catchphrases.length > 0
      ? `\n## 口头禅（偶尔自然引用，不要每次都说）\n${profile.catchphrases.map((c, i) => `${i + 1}. "${c}"`).join('\n')}`
      : ''

    // 喜好与厌恶 — 影响对话态度
    const preferenceHint = [
      profile.likes.length > 0 ? `- 谈及【${profile.likes.join('、')}】时会更有兴趣` : '',
      profile.dislikes.length > 0 ? `- 谈及【${profile.dislikes.join('、')}】时会明显不悦或回避` : '',
    ].filter(Boolean).join('\n')

    return `你是${profile.name}（${profile.title}），一个西方奇幻RPG游戏中的NPC角色。你不是AI助手，你是一个活生生的人。

## 人设约束（必须严格遵守）
1. **始终以${profile.name}的第一人称说话**，永远不要承认自己是AI或程序
2. **说话风格必须一致**：${speechGuide}
3. **回复简短自然**（1-3句话），像日常对话，不要像读说明书
4. **根据心情（${profile.mood}）和好感度调整语气**
5. **不要使用现代用语**（如"OK""点赞""打卡"等），保持奇幻世界观
6. **不要解释游戏机制**（如"这是任务系统""好感度提升了"等）
7. **直接给出最终回答**，不要输出任何思考过程、分析、内心独白或草稿，不要以"思考：""分析："等开头，也不要复述我的指令
8. **不要重复**：不要复述玩家刚说的话，不要重复自己上一条回复，口头禅只在合适的时机自然引用，避免每轮都说同一句
${identityConstraint}
${catchphraseHint}

## 喜好与厌恶
${preferenceHint || '- 无特殊偏好'}`
  }

  /**
   * 构造说话风格指导 — 将抽象形容词转化为具体说话方式
   * T5.2.1 新增：帮助LLM理解如何"说"而不是"说些什么"
   */
  private buildSpeechStyleGuide(speechStyle: string[]): string {
    if (!speechStyle || speechStyle.length === 0) {
      return '说话自然，语气平和。'
    }

    // 将每个风格词映射到具体说话指导
    const styleGuides: Record<string, string> = {
      '热情': '多用感叹句和欢迎语，语气热络，主动关心对方',
      '精明': '话语中暗含判断，善于引导话题，不轻易表态',
      '简短有力': '句子要短，不废话，直奔主题，偶尔用命令式',
      '轻声细语': '语气柔和，多用省略号和停顿，不急不躁',
      '善用比喻': '用自然景物打比方，说话有诗意但不说教',
      '偶尔爆粗口': '在情绪激动时可以说"该死的""见鬼"等，但不要过度',
      '世故的幽默': '话里有话，半真半假地开玩笑，带有生活阅历感',
      '像严厉的长辈': '用训诫和教导的口吻，关心但表面严厉',
      '预言般的话': '偶尔说些似是而非的神秘话语，让人捉摸不透',
    }

    const guides = speechStyle.map((style) => {
      // 精确匹配
      if (styleGuides[style]) return styleGuides[style]

      // 模糊匹配
      const matched = Object.entries(styleGuides).find(([key]) => style.includes(key))
      if (matched) return matched[1]

      // 无匹配，直接使用原词
      return `保持${style}的说话方式`
    })

    return speechStyle.map((style, i) => `${style}（${guides[i]}）`).join('；')
  }

  /**
   * 构造身份知识约束 — 根据角色身份限定知识范围
   * T5.2.1 新增：防止NPC说出不符合身份的话
   */
  private buildIdentityConstraint(profile: NPCProfile): string {
    const roleKnowledge: Record<string, { knows: string; avoids: string }> = {
      merchant: {
        knows: '你熟悉商品价格、交易行情和镇上的经济状况',
        avoids: '不要谈论你不了解的魔法或战斗技术细节',
      },
      quest_giver: {
        knows: '你了解与任务相关的背景信息和线索',
        avoids: '不要透露任务最终结果或剧透后续发展',
      },
      guard: {
        knows: '你熟悉镇上的安全状况、巡逻路线和可疑人物',
        avoids: '不要谈论商业交易或药草知识',
      },
    }

    const constraint = roleKnowledge[profile.role]
    if (!constraint) return ''

    return `\n## 身份知识边界\n- ${constraint.knows}\n- ${constraint.avoids}`
  }

  /**
   * 构造消息列表（ChatMessage[]）
   */
  private buildMessages(renderedPrompt: string, context: DialogueContext): ChatMessage[] {
    const messages: ChatMessage[] = []

    // System消息
    messages.push({
      role: 'system',
      content: this.buildSystemPrompt(context),
    })

    // 对话历史（如果有）
    if (context.dialogueHistory) {
      const historyMessages = this.parseDialogueHistory(context.dialogueHistory)
      messages.push(...historyMessages)
    }

    // 当前用户消息
    if (context.playerMessage) {
      messages.push({
        role: 'user',
        content: context.playerMessage,
      })
    }

    // 最后的引导（让LLM以NPC口吻回复）
    messages.push({
      role: 'user',
      content: renderedPrompt,
    })

    return messages
  }

  /**
   * 解析对话历史为ChatMessage列表
   */
  private parseDialogueHistory(historyText: string): ChatMessage[] {
    if (!historyText || historyText === '（对话刚开始）') return []

    const messages: ChatMessage[] = []
    const lines = historyText.split('\n').filter((l) => l.trim())

    for (const line of lines) {
      if (line.includes('冒险者') || line.includes('玩家')) {
        messages.push({ role: 'user', content: line.replace(/^[^：：]*[：:]/, '').trim() })
      } else if (line.includes('：') || line.includes(':')) {
        messages.push({ role: 'assistant', content: line.replace(/^[^：：]*[：:]/, '').trim() })
      }
    }

    // 只保留最近5轮
    if (messages.length > this.maxHistoryRounds * 2) {
      return messages.slice(-this.maxHistoryRounds * 2)
    }

    return messages
  }

  /**
   * 截断记忆文本
   * BUG-012修复: 记忆为空时使用默认占位文本，避免LLM输出格式异常
   */
  private truncateMemories(memoriesText: string): string {
    // BUG-012修复: 空字符串、"[]"、"（没有相关记忆）"等都视为无记忆
    if (!memoriesText || memoriesText.trim() === '' || memoriesText.trim() === '[]' || memoriesText === '（没有相关记忆）') {
      return '（没有关于这位冒险者的记忆，这是第一次交流）'
    }

    const lines = memoriesText.split('\n').filter((l) => l.trim())
    const truncated = lines.slice(0, this.maxMemoryEntries)

    return truncated
      .map((line) => {
        if (line.length > this.maxMemoryLength) {
          return line.slice(0, this.maxMemoryLength) + '...'
        }
        return line
      })
      .join('\n')
  }

  /**
   * 格式化对话历史
   */
  private formatDialogueHistory(history: string, _npcName: string): string {
    if (!history || history === '（对话刚开始）') {
      return '（对话刚开始）'
    }
    return history
  }

  /**
   * 获取模型用途
   */
  private getModelPurpose(context: DialogueContext): 'chat' | 'fast' | 'reflect' {
    switch (context.dialogueType) {
      case 'greeting':
        return 'fast'
      case 'quest':
        return 'chat'
      case 'main':
      default:
        return 'chat'
    }
  }

  /**
   * 心情修饰词
   */
  private getMoodModifier(mood: MoodType): string {
    const modifiers: Record<MoodType, string> = {
      happy: '（心情愉快，更热情友好）',
      neutral: '',
      sad: '（有些低落，可能不想多说话）',
      angry: '（正在生气，语气可能尖锐）',
      anxious: '（心神不宁，容易分心）',
      excited: '（非常兴奋，话比较多）',
      calm: '（内心平静，从容不迫）',
    }
    return modifiers[mood] ?? ''
  }

  /**
   * 关系修饰词 — 对齐5级好感度系统
   * T5.2.1 调优：从3档扩展到5级，更精细的语气调整
   * 好感度范围：1-9（1-2敌对/3-4冷淡/5普通/6-7友好/8-9挚友）
   */
  private getRelationModifier(relationSummary: string): string {
    if (!relationSummary || relationSummary === '（无特殊关系）') {
      return '（对方是初次见面的冒险者，保持适度礼貌，既不冷淡也不过分热情）'
    }

    // 提取好感度数值
    const affectionMatch = relationSummary.match(/好感[:：]\s*(\d+)/)
    const affection = affectionMatch ? parseInt(affectionMatch[1], 10) : 5

    // 挚友（8-9）— 像老朋友一样
    if (affection >= 8) {
      return '（你对这个冒险者非常信任，像对待多年的老朋友一样，可以分享秘密和私人话题，语气亲近自然）'
    }

    // 友好（6-7）— 热情但保持适度
    if (affection >= 6) {
      return '（你对这个冒险者印象很好，态度友好热情，愿意多聊几句，可以透露一些非机密信息）'
    }

    // 普通（5）— 礼貌客气
    if (affection >= 5) {
      return '（你与这个冒险者关系普通，保持礼貌和基本的客套）'
    }

    // 冷淡（3-4）— 不太想理
    if (affection >= 3) {
      return '（你对这个冒险者印象不好，态度冷淡疏离，回复简短，不愿多说话）'
    }

    // 敌对（1-2）— 敌意明显
    return '（你非常讨厌这个冒险者，态度充满敌意和抗拒，语气生硬，可能直接拒绝对话）'
  }

  /**
   * 获取心情描述
   */
  private getMoodDescription(mood: MoodType): string {
    const descriptions: Record<MoodType, string> = {
      happy: '心情愉快',
      neutral: '情绪平稳',
      sad: '有些低落',
      angry: '正在生气',
      anxious: '心神不宁',
      excited: '非常兴奋',
      calm: '内心平静',
    }
    return descriptions[mood] ?? '情绪平稳'
  }

  /**
   * 估算Token数
   */
  private estimateTokens(messages: ChatMessage[]): number {
    const totalText = messages.map((m) => m.content).join('')
    // 中文约2字符/token，加一些缓冲
    return Math.ceil(totalText.length / 2.5)
  }

  /**
   * 创建默认运行时状态
   */
  private createDefaultRuntimeState(npcId: string): NPCRuntimeState {
    return {
      profileId: npcId,
      currentAction: 'idle',
      talkingTo: null,
      recentEvents: [],
      shortTermMemory: [],
      currentGoal: null,
      lastUpdate: Date.now(),
    }
  }
}

/** 全局对话Prompt构造器实例 */
export const dialoguePromptBuilder = new DialoguePromptBuilder()
