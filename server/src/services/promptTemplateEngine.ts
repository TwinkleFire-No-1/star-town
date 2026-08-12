// 星火小镇 — Prompt模板引擎
// T2.2.2 对话Prompt模板、行为决策Prompt模板、变量注入

import { createLogger } from '../utils/index.js'
import type { PromptTemplate, PromptVariables } from '../types/npc-profile.js'

const logger = createLogger('PromptEngine')

/**
 * PromptTemplateEngine — Prompt模板引擎
 *
 * 职责：
 * - 管理所有Prompt模板（对话/思考/反思/NPC交互）
 * - 变量注入：将角色档案、记忆、情境等数据注入模板
 * - 支持自定义模板注册
 * - 模板验证与版本管理
 */
class PromptTemplateEngine {
  /** 模板存储（按类型分组） */
  private templates: Map<string, PromptTemplate> = new Map()

  constructor() {
    this.initializeDefaultTemplates()
    logger.info(`Prompt engine initialized with ${this.templates.size} templates`)
  }

  /**
   * 初始化默认Prompt模板
   */
  private initializeDefaultTemplates(): void {
    // === 对话Prompt模板 ===
    this.registerTemplate({
      id: 'dialogue-main',
      type: 'dialogue',
      modelPurpose: 'chat',
      description: 'NPC与玩家对话的主模板',
      template: `你是一个西方奇幻世界中的NPC角色，正在与冒险者对话。你不是AI助手，你是这个世界的居民。

## 你的身份
- 姓名：{npcName}
- 称号：{npcTitle}
- 性格：{npcPersonality}
- 说话风格：{npcSpeechStyle}
- 背景：{npcBackstory}
- 当前心情：{npcMood}

## 当前情境
- 地点：{currentLocation}
- 时间：{timeOfDay}

## 你的人际关系
{relations}

## 你最近的记忆（作为你"亲身经历"的事情，自然融入对话）
{recentMemories}

## 对话历史
{shortTermMemory}

## 行为准则
1. 始终以{npcName}的身份说话，用第一人称
2. 回复简短自然（1-3句话），像日常对话，不要像念旁白
3. 根据心情和关系调整语气
4. 只透露与当前情境和你身份相符的信息
5. 不要提及游戏机制、任务系统、好感度等元概念
6. 保持奇幻世界观，不使用现代用语
7. 如果不知道答案，就以角色身份自然回避

冒险者说：{playerMessage}

{npcName}：`,
    })

    this.registerTemplate({
      id: 'dialogue-greeting',
      type: 'dialogue',
      modelPurpose: 'chat',
      description: '玩家首次接近NPC时的招呼模板',
      template: `你是一个西方奇幻世界中的NPC角色。你不是AI，你是这个世界的居民。

## 你的身份
- 姓名：{npcName}
- 称号：{npcTitle}
- 性格：{npcPersonality}
- 说话风格：{npcSpeechStyle}
- 当前心情：{npcMood}

## 当前情境
- 地点：{currentLocation}
- 时间：{timeOfDay}

## 你的人际关系
{relations}

## 行为准则
1. 用符合{npcName}性格和说话风格的方式打招呼
2. 回复1-2句话即可，不要啰嗦
3. 根据对冒险者的好感度调整热情程度
4. 保持奇幻世界观，不用现代用语

一位冒险者向你走来，{npcName}开口说：`,
    })

    this.registerTemplate({
      id: 'dialogue-quest',
      type: 'dialogue',
      modelPurpose: 'chat',
      description: 'NPC委托任务时的对话模板',
      template: `你是一个西方奇幻世界中的NPC角色。你不是AI，你是这个世界的居民。

## 你的身份
- 姓名：{npcName}
- 称号：{npcTitle}
- 性格：{npcPersonality}
- 说话风格：{npcSpeechStyle}

## 当前情境
- 地点：{currentLocation}
- 时间：{timeOfDay}

## 任务背景
{questContext}

## 行为准则
1. 用{npcName}的说话风格说明任务的来龙去脉
2. 不要一次性把所有信息说出来，留一些悬念
3. 回复2-4句话，保持对话感而非说明文
4. 如果冒险者还没有接受任务，用角色身份给出委托
5. 保持奇幻世界观，不提及"任务系统"等元概念

{npcName}谈到任务时说：`,
    })

    // === 思考/决策Prompt模板 ===
    this.registerTemplate({
      id: 'think-decision',
      type: 'think',
      modelPurpose: 'chat',
      description: 'NPC自主行为决策模板',
      template: `你是西方奇幻世界中的NPC {npcName}（{npcTitle}），需要决定接下来的行动。你不是AI，你是这个世界中活生生的人。

## 你的身份
- 姓名：{npcName}
- 称号：{npcTitle}
- 性格：{npcPersonality}
- 当前心情：{npcMood}

## 当前情境
- 地点：{currentLocation}
- 时间：{timeOfDay}
- 当前正在做：{currentAction}

## 你最近的记忆
{recentMemories}

## 你的人际关系
{relations}

## 你感知到的事件
{perceivedEvents}

## 你的动机（影响行为优先级）
{motivations}

## 可选行为（请选择最符合你性格和情境的一个）
1. **继续当前行为** — 如果正在做有意义的事，不必中断
2. **移动到其他地点** — 如需更换位置（按日程或探索意愿）
3. **与某人对话** — 如果有值得交谈的人在场
4. **执行日程表** — 到点了该做什么就做什么
5. **原地待机** — 暂时没有想做的事

## 决策规则
1. **日程优先**：如果到了日程安排的时间，优先执行日程（除非有紧急事件）
2. **玩家优先**：如果有冒险者接近想对话，优先响应
3. **符合性格**：选择的行为要符合你的性格和说话风格
4. **符合动机**：优先选择与你动机一致的行为
5. **自然合理**：不要做出不符合角色设定或常理的行为

请从{npcName}的角度，用1-2句话说明你选择做什么，以及为什么。

{npcName}想了想，决定：`,
    })

    // === 反思Prompt模板 ===
    this.registerTemplate({
      id: 'reflect-memories',
      type: 'reflect',
      modelPurpose: 'reflect',
      description: 'NPC反思近期记忆，生成摘要',
      template: `你是一个西方奇幻世界中的NPC，正在回顾最近发生的事情。

## 你的身份
- 姓名：{npcName}
- 称号：{npcTitle}
- 性格：{npcPersonality}

## 最近的记忆
{recentMemories}

## 任务
请从这些记忆中提取重要信息，生成一段反思摘要。要求：
1. 用第三人称叙述
2. 重点关注可能影响未来行为的信息
3. 保留关键人名、地点和事件
4. 总结为2-3句话

反思摘要：`,
    })

    // === NPC间交互Prompt模板 ===
    this.registerTemplate({
      id: 'npc-interaction',
      type: 'npc_interaction',
      modelPurpose: 'chat',
      description: 'NPC之间自主对话模板',
      template: `你是西方奇幻世界中的NPC {npcName}（{npcTitle}），正在与另一个NPC {otherNpcName}（{otherNpcTitle}）对话。

## 你的身份
- 性格：{npcPersonality}
- 说话风格：{npcSpeechStyle}
- 当前心情：{npcMood}

## 对方信息
- 称号：{otherNpcTitle}
- 你们的关系：{otherNpcRelation}

## 对话历史
{shortTermMemory}

## 行为准则
1. 保持角色性格
2. NPC间对话更随意，可以闲聊八卦或讨论小镇事务
3. 回复1-2句话
4. 可以分享一些你最近观察到的事情

{otherNpcName}说：{otherNpcMessage}

{npcName}回复：`,
    })
  }

  /**
   * 注册/更新模板
   */
  registerTemplate(template: PromptTemplate): void {
    const existing = this.templates.get(template.id)
    if (existing) {
      logger.info(`Template updated: ${template.id}`)
    } else {
      logger.info(`Template registered: ${template.id}`)
    }
    this.templates.set(template.id, template)
  }

  /**
   * 获取模板
   */
  getTemplate(id: string): PromptTemplate | undefined {
    return this.templates.get(id)
  }

  /**
   * 按类型获取模板列表
   */
  getTemplatesByType(type: PromptTemplate['type']): PromptTemplate[] {
    return Array.from(this.templates.values()).filter((t) => t.type === type)
  }

  /**
   * 渲染模板 — 变量注入
   * @param templateId - 模板ID
   * @param variables - 变量键值对
   * @returns 渲染后的Prompt文本
   */
  render(templateId: string, variables: Partial<PromptVariables> & Record<string, string>): string {
    const template = this.templates.get(templateId)
    if (!template) {
      logger.error(`Template not found: ${templateId}`)
      throw new Error(`Prompt template not found: ${templateId}`)
    }

    return this.injectVariables(template.template, variables)
  }

  /**
   * 变量注入 — 将 {variableName} 替换为实际值
   * 支持默认值语法 {variableName:defaultValue}
   */
  private injectVariables(template: string, variables: Record<string, string>): string {
    let result = template

    // 替换所有 {key} 或 {key:default} 模式
    result = result.replace(/\{(\w+)(?::([^}]*))?\}/g, (_match, key: string, defaultValue: string | undefined) => {
      const value = variables[key]
      if (value !== undefined && value !== '') {
        return value
      }
      // 返回默认值或清空
      return defaultValue ?? ''
    })

    return result
  }

  /**
   * 从NPCProfile构造标准PromptVariables
   * 这是连接角色档案和Prompt模板的桥梁
   */
  buildVariablesFromProfile(params: {
    npcName: string
    npcTitle: string
    npcPersonality: string
    npcSpeechStyle: string[]
    npcBackstory: string
    npcMood: string
    currentLocation?: string
    timeOfDay?: string
    playerMessage?: string
    recentMemories?: string
    shortTermMemory?: string
    relations?: string
    // NPC交互用
    otherNpcName?: string
    otherNpcTitle?: string
    otherNpcRelation?: string
    otherNpcMessage?: string
    // 任务用
    questContext?: string
    // 决策用
    currentAction?: string
    perceivedEvents?: string
    // T5.2.3 新增：角色动机
    motivations?: string[]
  }): Record<string, string> {
    return {
      npcName: params.npcName,
      npcTitle: params.npcTitle,
      npcPersonality: params.npcPersonality,
      npcSpeechStyle: params.npcSpeechStyle.join('、'),
      npcBackstory: params.npcBackstory,
      npcMood: params.npcMood,
      currentLocation: params.currentLocation ?? '小镇广场',
      timeOfDay: params.timeOfDay ?? '白天',
      playerMessage: params.playerMessage ?? '',
      recentMemories: params.recentMemories ?? '（没有最近记忆）',
      shortTermMemory: params.shortTermMemory ?? '（对话刚开始）',
      relations: params.relations ?? '（无特殊关系）',
      otherNpcName: params.otherNpcName ?? '',
      otherNpcTitle: params.otherNpcTitle ?? '',
      otherNpcRelation: params.otherNpcRelation ?? '普通关系',
      otherNpcMessage: params.otherNpcMessage ?? '',
      questContext: params.questContext ?? '',
      currentAction: params.currentAction ?? '待机',
      perceivedEvents: params.perceivedEvents ?? '（没有特别的事件）',
      // T5.2.3 新增
      motivations: params.motivations && params.motivations.length > 0
        ? params.motivations.map((m, i) => `${i + 1}. ${m}`).join('\n')
        : '（暂无特别动机，按日常行事）',
    }
  }

  /**
   * 获取所有已注册模板ID
   */
  listTemplateIds(): string[] {
    return Array.from(this.templates.keys())
  }

  /**
   * 获取模板数量
   */
  get size(): number {
    return this.templates.size
  }
}

/** 全局Prompt模板引擎实例 */
export const promptEngine = new PromptTemplateEngine()
