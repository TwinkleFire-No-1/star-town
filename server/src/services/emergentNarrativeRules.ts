// 星火小镇 — 涌现叙事规则
// T4.2.6 涌现场景触发规则、信息传播配置

import { createLogger } from '../utils/index.js'

const logger = createLogger('EmergentNarrative')

// =============================================
// 涌现叙事类型
// =============================================

/** 涌现叙事场景类型 */
export type EmergentSceneType =
  | 'npc_conflict'      // NPC冲突
  | 'information_share'  // 信息共享
  | 'rumor_spread'       // 谣言传播
  | 'mutual_quest'       // 共同任务
  | 'friendship_form'    // 友谊形成
  | 'rivalry_form'       // 对立形成
  | 'economic_event'      // 经济事件
  | 'social_gathering'    // 社交聚会
  | 'mystery_discovery'   // 谜团发现
  | 'crisis_response'     // 危机应对

/** 涌现场景触发条件 */
export interface EmergentTrigger {
  /** 触发类型 */
  type: 'time_based' | 'relationship_based' | 'event_based' | 'location_based' | 'random'
  /** 触发概率 (0-1) */
  probability: number
  /** 前置条件 */
  conditions: EmergentCondition[]
  /** 冷却时间（游戏小时） */
  cooldownHours: number
  /** 最大触发次数（0=无限） */
  maxTriggers: number
}

/** 涌现条件 */
export interface EmergentCondition {
  /** 条件类型 */
  type: 'affection_above' | 'affection_below' | 'reputation_above' | 'reputation_below'
       | 'quest_completed' | 'area_visited' | 'item_owned' | 'time_period'
       | 'npc_nearby' | 'day_after' | 'relationship_type'
  /** 条件目标 */
  targetId?: string
  /** 条件值 */
  value?: number | string
}

/** 涌现场景模板 */
export interface EmergentSceneTemplate {
  /** 场景ID */
  id: string
  /** 场景类型 */
  sceneType: EmergentSceneType
  /** 场景名称 */
  name: string
  /** 场景描述 */
  description: string
  /** 参与NPC数量范围 */
  participantRange: [number, number]
  /** 触发条件 */
  trigger: EmergentTrigger
  /** 场景对话模板 */
  dialogueTemplates: {
    /** 开场白 */
    opening: string[]
    /** 发展 */
    development: string[]
    /** 结束 */
    closing: string[]
  }
  /** 场景效果 */
  effects: EmergentEffect[]
  /** 是否需要玩家在场 */
  requiresPlayer: boolean
  /** 优先级（高=优先触发） */
  priority: number
}

/** 涌现效果 */
export interface EmergentEffect {
  /** 效果类型 */
  type: 'change_affection' | 'change_reputation' | 'give_item' | 'start_quest'
       | 'add_memory' | 'spread_info' | 'change_relationship' | 'unlock_area'
  /** 目标 */
  targetId?: string
  /** 值 */
  value?: number | string
}

// =============================================
// 涌现叙事规则配置
// =============================================

/** 涌现叙事规则集 */
export interface EmergentNarrativeRules {
  /** 全局触发概率系数 */
  globalProbabilityMultiplier: number
  /** 每游戏日最大涌现事件数 */
  maxEventsPerDay: number
  /** 同一NPC冷却时间（游戏小时） */
  npcCooldownHours: number
  /** 同一场景类型冷却 */
  sceneTypeCooldownHours: number
  /** 信息传播规则 */
  propagationRules: PropagationRule[]
  /** 场景模板 */
  sceneTemplates: EmergentSceneTemplate[]
}

/** 信息传播规则 */
export interface PropagationRule {
  /** 信息类型 */
  infoType: 'secret' | 'gossip' | 'quest' | 'event' | 'observation'
  /** 传播方式权重 */
  methodWeights: {
    direct: number
    gossip: number
    overhear: number
  }
  /** 传播概率基准 */
  baseProbability: number
  /** 关系加成系数（关系越好越容易传播） */
  relationshipBonus: number
  /** 好感度加成系数 */
  affectionBonus: number
  /** 失真概率（每次传播） */
  distortionChance: number
  /** 最大传播跳数 */
  maxHops: number
  /** 是否可被玩家截获 */
  playerCanIntercept: boolean
}

// =============================================
// 默认涌现叙事规则
// =============================================

export const DEFAULT_EMERGENT_RULES: EmergentNarrativeRules = {
  globalProbabilityMultiplier: 1.0,
  maxEventsPerDay: 5,
  npcCooldownHours: 4,
  sceneTypeCooldownHours: 8,

  propagationRules: [
    {
      infoType: 'secret',
      methodWeights: { direct: 0.8, gossip: 0.15, overhear: 0.05 },
      baseProbability: 0.3,
      relationshipBonus: 0.2,
      affectionBonus: 0.15,
      distortionChance: 0.1,
      maxHops: 3,
      playerCanIntercept: true,
    },
    {
      infoType: 'gossip',
      methodWeights: { direct: 0.2, gossip: 0.7, overhear: 0.1 },
      baseProbability: 0.6,
      relationshipBonus: 0.1,
      affectionBonus: 0.05,
      distortionChance: 0.3,
      maxHops: 5,
      playerCanIntercept: true,
    },
    {
      infoType: 'quest',
      methodWeights: { direct: 0.9, gossip: 0.05, overhear: 0.05 },
      baseProbability: 0.2,
      relationshipBonus: 0.3,
      affectionBonus: 0.2,
      distortionChance: 0.05,
      maxHops: 2,
      playerCanIntercept: true,
    },
    {
      infoType: 'event',
      methodWeights: { direct: 0.5, gossip: 0.3, overhear: 0.2 },
      baseProbability: 0.5,
      relationshipBonus: 0.15,
      affectionBonus: 0.1,
      distortionChance: 0.15,
      maxHops: 4,
      playerCanIntercept: true,
    },
    {
      infoType: 'observation',
      methodWeights: { direct: 0.6, gossip: 0.2, overhear: 0.2 },
      baseProbability: 0.4,
      relationshipBonus: 0.1,
      affectionBonus: 0.1,
      distortionChance: 0.2,
      maxHops: 3,
      playerCanIntercept: false,
    },
  ],

  sceneTemplates: [
    // ---- NPC冲突 ----
    {
      id: 'emg_npc_conflict',
      sceneType: 'npc_conflict',
      name: 'NPC冲突',
      description: '两个NPC因意见分歧产生冲突，玩家可介入调解',
      participantRange: [2, 2],
      trigger: {
        type: 'relationship_based',
        probability: 0.15,
        conditions: [
          { type: 'relationship_type', value: 'hostile' },
        ],
        cooldownHours: 12,
        maxTriggers: 0,
      },
      dialogueTemplates: {
        opening: [
          '你怎么能这样做！',
          '我不同意你的看法。',
          '你太过分了！',
        ],
        development: [
          '这不是第一次了，你总是这样。',
          '我受够了你的态度。',
          '我们之间的问题不是一天两天了。',
        ],
        closing: [
          '我需要冷静一下。',
          '这件事我们以后再说。',
          '算了，我不想再争论了。',
        ],
      },
      effects: [
        { type: 'change_affection', value: -5 },
        { type: 'add_memory', value: 'npc_conflict' },
      ],
      requiresPlayer: false,
      priority: 5,
    },

    // ---- 信息共享 ----
    {
      id: 'emg_info_share',
      sceneType: 'information_share',
      name: '信息共享',
      description: 'NPC之间分享有价值的情报',
      participantRange: [2, 3],
      trigger: {
        type: 'relationship_based',
        probability: 0.25,
        conditions: [
          { type: 'affection_above', value: '30' },
        ],
        cooldownHours: 6,
        maxTriggers: 0,
      },
      dialogueTemplates: {
        opening: [
          '嘿，我有个消息想告诉你。',
          '你听说了吗？',
          '我最近发现了一些有趣的事情。',
        ],
        development: [
          '关于那个事情，我知道一些内情……',
          '这件事我只跟你说，你可别外传。',
          '我觉得你应该知道这件事。',
        ],
        closing: [
          '希望能帮到你。',
          '有什么发现记得告诉我。',
          '我们之间的事，不用客气。',
        ],
      },
      effects: [
        { type: 'spread_info' },
        { type: 'change_affection', value: 3 },
      ],
      requiresPlayer: false,
      priority: 3,
    },

    // ---- 谣言传播 ----
    {
      id: 'emg_rumor_spread',
      sceneType: 'rumor_spread',
      name: '谣言传播',
      description: 'NPC传播小镇中的谣言，可能失真',
      participantRange: [2, 4],
      trigger: {
        type: 'random',
        probability: 0.2,
        conditions: [],
        cooldownHours: 8,
        maxTriggers: 0,
      },
      dialogueTemplates: {
        opening: [
          '你听说了吗？关于……',
          '大家都在议论……',
          '小镇上最近有个传言……',
        ],
        development: [
          '据说那个事情比我们想象的还要严重。',
          '我亲耳听到的，千真万确！',
          '不过别太当真，毕竟只是传言。',
        ],
        closing: [
          '你可得保密啊。',
          '这件事别让我说是我告诉你的。',
          '反正传到你这了，怎么处理看你自己。',
        ],
      },
      effects: [
        { type: 'spread_info' },
      ],
      requiresPlayer: false,
      priority: 2,
    },

    // ---- 友谊形成 ----
    {
      id: 'emg_friendship',
      sceneType: 'friendship_form',
      name: '友谊形成',
      description: '两个NPC在共同经历后建立友谊',
      participantRange: [2, 2],
      trigger: {
        type: 'relationship_based',
        probability: 0.1,
        conditions: [
          { type: 'affection_above', value: '60' },
        ],
        cooldownHours: 24,
        maxTriggers: 1,
      },
      dialogueTemplates: {
        opening: [
          '你真的很可靠。',
          '和你合作总是让人安心。',
        ],
        development: [
          '我们以后应该多交流。',
          '你是我信任的人。',
        ],
        closing: [
          '从今以后，我们是朋友了。',
          '有什么需要尽管找我。',
        ],
      },
      effects: [
        { type: 'change_affection', value: 10 },
        { type: 'change_relationship', value: 'friendly' },
      ],
      requiresPlayer: false,
      priority: 4,
    },

    // ---- 社交聚会 ----
    {
      id: 'emg_social_gathering',
      sceneType: 'social_gathering',
      name: '社交聚会',
      description: '多个NPC在特定场合聚集交流',
      participantRange: [3, 6],
      trigger: {
        type: 'time_based',
        probability: 0.3,
        conditions: [
          { type: 'time_period', value: 'evening' },
        ],
        cooldownHours: 24,
        maxTriggers: 0,
      },
      dialogueTemplates: {
        opening: [
          '今晚真热闹啊！',
          '大家都来了！',
          '难得聚在一起。',
        ],
        development: [
          '来来来，喝一杯！',
          '说起来，最近发生的事情可真不少。',
          '我有个主意，不如我们……',
        ],
        closing: [
          '今晚真开心。',
          '下次再聚！',
          '夜深了，该回去休息了。',
        ],
      },
      effects: [
        { type: 'change_affection', value: 2 },
      ],
      requiresPlayer: true,
      priority: 6,
    },

    // ---- 危机应对 ----
    {
      id: 'emg_crisis_response',
      sceneType: 'crisis_response',
      name: '危机应对',
      description: '突发危机事件，NPC协同应对',
      participantRange: [2, 5],
      trigger: {
        type: 'event_based',
        probability: 0.1,
        conditions: [
          { type: 'quest_completed', targetId: 'ch2_diary_pages' },
        ],
        cooldownHours: 48,
        maxTriggers: 3,
      },
      dialogueTemplates: {
        opening: [
          '出事了！大家快过来！',
          '紧急情况！',
          '不好了，有麻烦了！',
        ],
        development: [
          '我们必须立刻行动！',
          '我来处理这边，你负责那边！',
          '大家不要慌，按计划来！',
        ],
        closing: [
          '暂时安全了，但我们要保持警惕。',
          '这次多亏了大家配合。',
          '危机还没有完全解除。',
        ],
      },
      effects: [
        { type: 'change_affection', value: 5 },
        { type: 'add_memory', value: 'crisis_cooperation' },
      ],
      requiresPlayer: true,
      priority: 10,
    },

    // ---- 谜团发现 ----
    {
      id: 'emg_mystery_discovery',
      sceneType: 'mystery_discovery',
      name: '谜团发现',
      description: 'NPC偶然发现隐藏的线索或秘密',
      participantRange: [1, 2],
      trigger: {
        type: 'location_based',
        probability: 0.08,
        conditions: [],
        cooldownHours: 24,
        maxTriggers: 5,
      },
      dialogueTemplates: {
        opening: [
          '等等，这是什么？',
          '我从没注意过这个地方……',
          '这里有些不对劲。',
        ],
        development: [
          '这些符号……好像在哪里见过。',
          '我需要更仔细地看看。',
          '这可能和那个传闻有关。',
        ],
        closing: [
          '这件事得让其他人知道。',
          '我要继续调查下去。',
          '先记下来，回头再研究。',
        ],
      },
      effects: [
        { type: 'add_memory', value: 'mystery_clue' },
        { type: 'spread_info' },
      ],
      requiresPlayer: false,
      priority: 7,
    },
  ],
}

// =============================================
// 涌现叙事引擎
// =============================================

/** 已触发的涌现事件记录 */
interface EmergentEventRecord {
  sceneId: string
  sceneType: EmergentSceneType
  participantIds: string[]
  triggeredAt: number // 游戏时间
}

class EmergentNarrativeEngine {
  private rules: EmergentNarrativeRules
  private eventHistory: EmergentEventRecord[] = []
  private npcCooldowns: Map<string, number> = new Map() // npcId -> 可再次触发的时间
  private sceneTypeCooldowns: Map<string, number> = new Map()
  private dailyEventCount = 0
  private currentGameDay = 1

  constructor(rules?: EmergentNarrativeRules) {
    this.rules = rules ?? DEFAULT_EMERGENT_RULES
  }

  /**
   * 检查并触发涌现事件
   * @param gameTime 当前游戏时间（分钟）
   * @param gameDay 当前游戏日
   * @param nearbyNpcIds 附近NPC列表
   * @returns 触发的场景模板列表
   */
  checkAndTrigger(
    gameTime: number,
    gameDay: number,
    nearbyNpcIds: string[],
  ): EmergentSceneTemplate[] {
    // 检查日切
    if (gameDay !== this.currentGameDay) {
      this.currentGameDay = gameDay
      this.dailyEventCount = 0
    }

    // 检查每日上限
    if (this.dailyEventCount >= this.rules.maxEventsPerDay) {
      return []
    }

    const triggered: EmergentSceneTemplate[] = []

    for (const template of this.rules.sceneTemplates) {
      // 检查冷却
      const sceneCooldown = this.sceneTypeCooldowns.get(template.sceneType) ?? 0
      if (gameTime < sceneCooldown) continue

      // 检查概率
      const prob = template.trigger.probability * this.rules.globalProbabilityMultiplier
      if (Math.random() > prob) continue

      // 检查参与者数量
      if (nearbyNpcIds.length < template.participantRange[0]) continue

      // 检查NPC冷却
      const availableNpcs = nearbyNpcIds.filter((id) => {
        const cooldown = this.npcCooldowns.get(id) ?? 0
        return gameTime >= cooldown
      })

      if (availableNpcs.length < template.participantRange[0]) continue

      // 触发！
      triggered.push(template)
      this.dailyEventCount++

      // 设置冷却
      for (const npcId of availableNpcs.slice(0, template.participantRange[1])) {
        this.npcCooldowns.set(npcId, gameTime + this.rules.npcCooldownHours * 60)
      }
      this.sceneTypeCooldowns.set(
        template.sceneType,
        gameTime + this.rules.sceneTypeCooldownHours * 60,
      )

      // 记录历史
      this.eventHistory.push({
        sceneId: template.id,
        sceneType: template.sceneType,
        participantIds: availableNpcs.slice(0, template.participantRange[1]),
        triggeredAt: gameTime,
      })

      if (this.dailyEventCount >= this.rules.maxEventsPerDay) break
    }

    return triggered
  }

  /**
   * 获取信息传播规则
   */
  getPropagationRule(infoType: string): PropagationRule | undefined {
    return this.rules.propagationRules.find((r) => r.infoType === infoType)
  }

  /**
   * 计算传播概率
   */
  calculatePropagationProbability(
    infoType: string,
    relationshipScore: number,
    affectionScore: number,
  ): number {
    const rule = this.getPropagationRule(infoType)
    if (!rule) return 0.1

    let prob = rule.baseProbability
    prob += relationshipScore * rule.relationshipBonus
    prob += affectionScore * rule.affectionBonus

    return Math.min(1.0, Math.max(0.0, prob))
  }

  /**
   * 计算信息失真
   */
  calculateDistortion(content: string, hopCount: number): string {
    const _rule = this.rules.propagationRules.find(() => true)

    const distortionChance = _rule?.distortionChance ?? 0.2

    if (hopCount <= 0 || Math.random() > distortionChance) {
      return content
    }

    // 简单失真：添加不确定的修饰词
    const qualifiers = ['据说', '好像', '可能', '听说', '似乎']
    const qualifier = qualifiers[Math.floor(Math.random() * qualifiers.length)]
    return `${qualifier}${content}`
  }

  /**
   * 获取事件历史
   */
  getHistory(): EmergentEventRecord[] {
    return [...this.eventHistory]
  }

  /**
   * 更新规则
   */
  updateRules(rules: Partial<EmergentNarrativeRules>): void {
    this.rules = { ...this.rules, ...rules }
    logger.info('Emergent narrative rules updated')
  }
}

/** 涌现叙事引擎单例 */
export const emergentNarrativeEngine = new EmergentNarrativeEngine()
