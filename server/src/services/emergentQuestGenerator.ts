// 星火小镇 — 涌现任务生成
// T3.2.4 NPC间互动产生的新任务触发逻辑

import { createLogger } from '../utils/index.js'
import { questEngine } from './questEngine.js'
// import { emergentNarrativeEngine } from './emergentNarrativeRules.js'
// import { relationNetwork } from './relationNetwork.js'
// import { infoPropagationService } from './infoPropagationService.js'
import type { QuestDefinition } from './questTypes.js'

const logger = createLogger('EmergentQuestGenerator')

// =============================================
// 涌现任务类型
// =============================================

/** 涌现任务触发源 */
export type EmergentQuestSource =
  | 'npc_conflict'       // NPC冲突产生的任务
  | 'info_shared'        // 信息共享产生的调查任务
  | 'rumor_chain'        // 谣言链产生的探索任务
  | 'friendship_request' // 友谊请求产生的协作任务
  | 'crisis_response'    // 危机应对产生的紧急任务
  | 'economic_shift'     // 经济变动产生的收集任务
  | 'mystery_clue'       // 谜团线索产生的发现任务

/** 涌现任务模板 */
export interface EmergentQuestTemplate {
  /** 触发源类型 */
  sourceType: EmergentQuestSource
  /** 任务标题模板 */
  titleTemplate: string
  /** 任务描述模板 */
  descriptionTemplate: string
  /** 目标生成规则 */
  objectiveRules: EmergentObjectiveRule[]
  /** 奖励倍率 */
  rewardMultiplier: number
  /** 时限（游戏小时，0=无限） */
  timeLimitHours: number
  /** 建议等级 */
  suggestedLevel: number
  /** 是否可重复 */
  repeatable: boolean
  /** 最大同时存在数 */
  maxConcurrent: number
}

/** 涌现任务目标生成规则 */
export interface EmergentObjectiveRule {
  /** 目标类型 */
  type: 'kill_enemy' | 'collect_item' | 'visit_area' | 'talk_to_npc' | 'deliver_item'
  /** 目标描述模板 */
  descriptionTemplate: string
  /** 所需数量 */
  requiredCount: number
  /** 是否可选 */
  optional: boolean
}

// =============================================
// 默认涌现任务模板
// =============================================

export const EMERGENT_QUEST_TEMPLATES: EmergentQuestTemplate[] = [
  // ---- NPC冲突任务 ----
  {
    sourceType: 'npc_conflict',
    titleTemplate: '${npc1}与${npc2}的纠纷',
    descriptionTemplate: '${npc1}和${npc2}产生了矛盾，或许你能帮忙调解？',
    objectiveRules: [
      { type: 'talk_to_npc', descriptionTemplate: '与${npc1}交谈了解情况', requiredCount: 1, optional: false },
      { type: 'talk_to_npc', descriptionTemplate: '与${npc2}交谈了解情况', requiredCount: 1, optional: false },
      { type: 'deliver_item', descriptionTemplate: '将${item}送给${npc2}作为和解', requiredCount: 1, optional: true },
    ],
    rewardMultiplier: 0.8,
    timeLimitHours: 12,
    suggestedLevel: 3,
    repeatable: true,
    maxConcurrent: 2,
  },

  // ---- 信息共享任务 ----
  {
    sourceType: 'info_shared',
    titleTemplate: '来自${npc1}的情报',
    descriptionTemplate: '${npc1}分享了一条重要的情报，值得深入调查。',
    objectiveRules: [
      { type: 'visit_area', descriptionTemplate: '前往${area}调查', requiredCount: 1, optional: false },
      { type: 'collect_item', descriptionTemplate: '收集${itemCount}个线索', requiredCount: 3, optional: false },
    ],
    rewardMultiplier: 1.0,
    timeLimitHours: 24,
    suggestedLevel: 5,
    repeatable: true,
    maxConcurrent: 3,
  },

  // ---- 谣言链任务 ----
  {
    sourceType: 'rumor_chain',
    titleTemplate: '关于${topic}的传言',
    descriptionTemplate: '小镇里流传着关于${topic}的传言，真相到底是什么？',
    objectiveRules: [
      { type: 'talk_to_npc', descriptionTemplate: '向${npc_count}位NPC打听消息', requiredCount: 3, optional: false },
      { type: 'visit_area', descriptionTemplate: '前往传言来源地${area}', requiredCount: 1, optional: false },
    ],
    rewardMultiplier: 0.6,
    timeLimitHours: 18,
    suggestedLevel: 4,
    repeatable: true,
    maxConcurrent: 2,
  },

  // ---- 友谊请求任务 ----
  {
    sourceType: 'friendship_request',
    titleTemplate: '${npc1}的请求',
    descriptionTemplate: '${npc1}需要你的帮助来完成一件事。',
    objectiveRules: [
      { type: 'collect_item', descriptionTemplate: '为${npc1}收集${item}', requiredCount: 2, optional: false },
      { type: 'deliver_item', descriptionTemplate: '将${item}交给${npc1}', requiredCount: 1, optional: false },
    ],
    rewardMultiplier: 1.2,
    timeLimitHours: 8,
    suggestedLevel: 3,
    repeatable: true,
    maxConcurrent: 4,
  },

  // ---- 危机应对任务 ----
  {
    sourceType: 'crisis_response',
    titleTemplate: '紧急！${crisis_type}',
    descriptionTemplate: '发生了紧急事件！所有人都在行动，你也不能袖手旁观。',
    objectiveRules: [
      { type: 'kill_enemy', descriptionTemplate: '击退${enemy_count}个入侵者', requiredCount: 5, optional: false },
      { type: 'talk_to_npc', descriptionTemplate: '向${npc1}报告情况', requiredCount: 1, optional: false },
    ],
    rewardMultiplier: 1.5,
    timeLimitHours: 4,
    suggestedLevel: 8,
    repeatable: false,
    maxConcurrent: 1,
  },

  // ---- 经济变动任务 ----
  {
    sourceType: 'economic_shift',
    titleTemplate: '稀缺物资：${material}',
    descriptionTemplate: '${material}最近变得非常稀缺，有人愿意高价收购。',
    objectiveRules: [
      { type: 'collect_item', descriptionTemplate: '收集${count}个${material}', requiredCount: 5, optional: false },
      { type: 'deliver_item', descriptionTemplate: '将${material}交给商人', requiredCount: 1, optional: false },
    ],
    rewardMultiplier: 1.0,
    timeLimitHours: 16,
    suggestedLevel: 5,
    repeatable: true,
    maxConcurrent: 3,
  },

  // ---- 谜团发现任务 ----
  {
    sourceType: 'mystery_clue',
    titleTemplate: '未解之谜：${mystery_topic}',
    descriptionTemplate: '一条神秘的线索指向了${mystery_topic}，真相隐藏在深处。',
    objectiveRules: [
      { type: 'visit_area', descriptionTemplate: '前往${clue_area}查看线索', requiredCount: 1, optional: false },
      { type: 'collect_item', descriptionTemplate: '收集${clue_count}个证据', requiredCount: 3, optional: false },
      { type: 'talk_to_npc', descriptionTemplate: '与知情人${npc1}确认', requiredCount: 1, optional: true },
    ],
    rewardMultiplier: 1.3,
    timeLimitHours: 0,
    suggestedLevel: 6,
    repeatable: true,
    maxConcurrent: 2,
  },
]

// =============================================
// 涌现任务生成器
// =============================================

/** 当前活跃的涌现任务 */
const activeEmergentQuests: Map<string, QuestDefinition> = new Map()

/** 各模板的当前并发计数 */
const concurrentCount: Map<EmergentQuestSource, number> = new Map()

/** 已生成的涌现任务ID */
let emergentQuestCounter = 0

class EmergentQuestGenerator {
  /**
   * 从NPC互动事件中生成涌现任务
   * @param sourceType 触发源类型
   * @param context 上下文信息（NPC名称、区域等）
   * @returns 生成的任务定义（如果触发成功）
   */
  generateFromInteraction(
    sourceType: EmergentQuestSource,
    context: {
      npc1?: string
      npc2?: string
      area?: string
      item?: string
      topic?: string
    },
  ): QuestDefinition | null {
    // 查找匹配的模板
    const template = EMERGENT_QUEST_TEMPLATES.find((t) => t.sourceType === sourceType)
    if (!template) {
      logger.warn(`No template found for source type: ${sourceType}`)
      return null
    }

    // 检查并发上限
    const currentCount = concurrentCount.get(sourceType) ?? 0
    if (currentCount >= template.maxConcurrent) {
      logger.debug(`Max concurrent reached for ${sourceType}: ${currentCount}`)
      return null
    }

    // 模板变量替换
    const vars: Record<string, string> = {
      npc1: context.npc1 ?? '某位NPC',
      npc2: context.npc2 ?? '另一位NPC',
      area: context.area ?? '某个区域',
      item: context.item ?? '某种物品',
      topic: context.topic ?? '某件事',
      itemCount: '3',
      count: '5',
      enemy_count: '5',
      crisis_type: '入侵警报',
      material: '稀有矿石',
      mystery_topic: '古代遗迹',
      clue_area: context.area ?? '遗迹入口',
      clue_count: '3',
      npc_count: '3',
    }

    const replaceTemplateVars = (tpl: string): string => {
      let result = tpl
      for (const [key, val] of Object.entries(vars)) {
        result = result.replace(new RegExp(`\\$\\{${key}\\}`, 'g'), val)
      }
      return result
    }

    // 生成任务ID
    emergentQuestCounter++
    const questId = `emergent_${sourceType}_${emergentQuestCounter}_${Date.now()}`

    // 构建目标
    const objectives = template.objectiveRules.map((rule, idx) => ({
      id: `obj_${questId}_${idx}`,
      description: replaceTemplateVars(rule.descriptionTemplate),
      type: rule.type,
      targetId: '',
      requiredCount: rule.requiredCount,
      currentCount: 0,
      optional: rule.optional,
    }))

    // 计算奖励
    const baseExp = template.suggestedLevel * 20
    const baseCoins = template.suggestedLevel * 15

    const quest: QuestDefinition = {
      id: questId,
      title: replaceTemplateVars(template.titleTemplate),
      description: replaceTemplateVars(template.descriptionTemplate),
      type: 'emergent',
      chapter: 0,
      trigger: {
        type: 'event',
        targetId: `emergent_${sourceType}`,
      },
      prerequisites: [],
      objectives,
      reward: {
        exp: Math.round(baseExp * template.rewardMultiplier),
        coins: Math.round(baseCoins * template.rewardMultiplier),
        items: [],
      },
      repeatable: template.repeatable,
      timeLimit: template.timeLimitHours * 60, // 转换为分钟
      suggestedLevel: template.suggestedLevel,
      autoAccept: false,
      canRetry: true,
    }

    // 注册到活跃涌现任务
    activeEmergentQuests.set(questId, quest)
    concurrentCount.set(sourceType, currentCount + 1)

    // 注册到任务引擎
    questEngine.registerDefinition(quest)

    logger.info(`Generated emergent quest: ${quest.title} (${questId})`)
    return quest
  }

  /**
   * 从信息传播中生成涌现任务
   */
  generateFromInfoPropagation(
    infoType: string,
    sourceNpcId: string,
    content: string,
  ): QuestDefinition | null {
    // 根据信息类型选择对应的涌现任务类型
    const sourceMap: Record<string, EmergentQuestSource> = {
      'secret': 'mystery_clue',
      'gossip': 'rumor_chain',
      'quest': 'info_shared',
      'event': 'crisis_response',
      'observation': 'info_shared',
    }

    const sourceType = sourceMap[infoType] ?? 'info_shared'

    // 概率检查：不是所有信息都产生任务
    if (Math.random() > 0.3) return null

    return this.generateFromInteraction(sourceType, {
      npc1: sourceNpcId,
      topic: content.slice(0, 20),
    })
  }

  /**
   * 完成涌现任务时的回调
   */
  onEmergentQuestCompleted(questId: string): void {
    const quest = activeEmergentQuests.get(questId)
    if (!quest) return

    // 减少并发计数
    const sourceType = questId.split('_')[1] as EmergentQuestSource
    const current = concurrentCount.get(sourceType) ?? 1
    concurrentCount.set(sourceType, Math.max(0, current - 1))

    // 从活跃列表中移除
    activeEmergentQuests.delete(questId)

    logger.info(`Emergent quest completed: ${questId}`)
  }

  /**
   * 获取当前所有活跃的涌现任务
   */
  getActiveEmergentQuests(): QuestDefinition[] {
    return Array.from(activeEmergentQuests.values())
  }

  /**
   * 定时检查：从NPC关系网络中寻找可生成涌现任务的机会
   */
  periodicCheck(): QuestDefinition[] {
    const generated: QuestDefinition[] = []

    // 尝试为每种模板生成任务
    for (const template of EMERGENT_QUEST_TEMPLATES) {
      if (Math.random() > 0.15) continue // 15%概率尝试生成

      const quest = this.generateFromInteraction(template.sourceType, {
        npc1: '随机NPC',
        npc2: '另一个NPC',
        area: '森林',
        item: '药草',
        topic: '失踪的旅人',
      })

      if (quest) generated.push(quest)
    }

    return generated
  }
}

/** 涌现任务生成器单例 */
export const emergentQuestGenerator = new EmergentQuestGenerator()
