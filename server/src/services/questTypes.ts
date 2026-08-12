// 星火小镇 — 任务系统类型定义
// T3.2.1 5种任务类型、状态机、前置条件

// =============================================
// 任务类型枚举
// =============================================

/** 任务类型 */
export type QuestType = 'main' | 'side' | 'daily' | 'emergent' | 'hidden'

/** 任务类型标签 */
export const QUEST_TYPE_LABELS: Record<QuestType, string> = {
  main: '主线任务',
  side: '支线任务',
  daily: '日常任务',
  emergent: '涌现任务',
  hidden: '隐藏任务',
}

/** 任务类型颜色（UI用） */
export const QUEST_TYPE_COLORS: Record<QuestType, string> = {
  main: '#ffd700',
  side: '#4fc3f7',
  daily: '#81c784',
  emergent: '#ba68c8',
  hidden: '#ff8a65',
}

// =============================================
// 任务状态机
// =============================================

/** 任务状态 */
export type QuestStatus = 'locked' | 'available' | 'active' | 'completed' | 'failed' | 'abandoned'

/** 状态标签 */
export const QUEST_STATUS_LABELS: Record<QuestStatus, string> = {
  locked: '未解锁',
  available: '可接受',
  active: '进行中',
  completed: '已完成',
  failed: '已失败',
  abandoned: '已放弃',
}

/**
 * 任务状态机转换规则
 * locked → available (前置条件满足)
 * available → active (玩家接受)
 * available → locked (前置条件不再满足)
 * active → completed (完成条件满足)
 * active → failed (失败条件满足/超时)
 * active → abandoned (玩家放弃)
 * completed → active (可重复任务)
 * failed → active (可重试任务)
 */
export const QUEST_STATE_TRANSITIONS: Record<QuestStatus, QuestStatus[]> = {
  locked: ['available'],
  available: ['active', 'locked'],
  active: ['completed', 'failed', 'abandoned'],
  completed: ['active'], // 可重复任务
  failed: ['active'], // 可重试
  abandoned: ['active'], // 可重新接受
}

/**
 * 检查状态转换是否合法
 */
export function canTransition(from: QuestStatus, to: QuestStatus): boolean {
  const allowed = QUEST_STATE_TRANSITIONS[from]
  return allowed ? allowed.includes(to) : false
}

// =============================================
// 任务条件定义
// =============================================

/** 条件操作符 */
export type ConditionOperator =
  | 'equals'      // 等于
  | 'not_equals' // 不等于
  | 'greater'    // 大于
  | 'less'       // 小于
  | 'in'         // 在列表中
  | 'contains'   // 包含

/** 单个条件 */
export interface QuestCondition {
  /** 条件类型 */
  type:
    | 'quest_completed'   // 前置任务完成
    | 'level'             // 等级要求
    | 'game_day'          // 游戏天数
    | 'game_hour'         // 游戏小时（时段）
    | 'npc_affection'     // NPC好感度
    | 'player_reputation' // 玩家声望
    | 'item_owned'        // 拥有物品
    | 'npc_met'           // 遇见过NPC
    | 'area_visited'      // 到达过区域
    | 'dialogue_count'    // 对话次数
    | 'custom'            // 自定义（用key查value）
  /** 目标ID（任务ID/NPC ID/物品ID/区域名） */
  targetId?: string
  /** 比较值 */
  value: number | string | boolean
  /** 操作符 */
  operator: ConditionOperator
  /** 自定义键名（type=custom 时使用） */
  key?: string
}

/** 条件组（AND 逻辑） */
export interface QuestConditionGroup {
  /** 所有条件必须满足 */
  conditions: QuestCondition[]
  /** 组内逻辑（默认AND） */
  logic?: 'AND' | 'OR'
}

// =============================================
// 触发条件
// =============================================

/** 触发条件定义 */
export interface QuestTrigger {
  /** 触发类型 */
  type:
    | 'auto'           // 自动触发（前置完成即触发）
    | 'npc_talk'       // 与NPC对话
    | 'area_enter'     // 进入区域
    | 'item_obtain'    // 获得物品
    | 'time_reached'   // 到达指定时间
    | 'quest_complete' // 另一个任务完成
    | 'event'          // 世界事件
    | 'manual'         // 手动触发（NPC给予）
  /** 触发目标ID */
  targetId?: string
  /** 触发参数 */
  params?: Record<string, any>
  /** 触发前置条件 */
  conditions?: QuestConditionGroup
}

// =============================================
// 完成条件
// =============================================

/** 完成条件定义 */
export interface QuestObjective {
  /** 目标ID */
  id: string
  /** 目标描述 */
  description: string
  /** 目标类型 */
  type:
    | 'talk_to_npc'      // 与NPC对话
    | 'collect_item'     // 收集物品
    | 'kill_enemy'       // 击败敌人
    | 'visit_area'       // 到达区域
    | 'deliver_item'     // 交付物品给NPC
    | 'reach_level'      // 达到等级
    | 'reach_affection'  // 好感度达标
    | 'wait_time'        // 等待时间
    | 'custom'           // 自定义
  /** 目标ID（NPC/物品/区域/敌人） */
  targetId?: string
  /** 所需数量 */
  requiredCount: number
  /** 当前数量 */
  currentCount: number
  /** 是否可选 */
  optional: boolean
  /** 完成条件 */
  conditions?: QuestConditionGroup
}

// =============================================
// 任务奖励
// =============================================

/** 任务奖励 */
export interface QuestReward {
  /** 经验奖励 */
  exp: number
  /** 星币奖励 */
  coins: number
  /** 奖励物品列表 */
  items: Array<{
    itemId: string
    itemName: string
    quantity: number
  }>
  /** 好感度变化 */
  affectionChanges?: Array<{
    npcId: string
    npcName: string
    change: number
  }>
  /** 解锁内容 */
  unlocks?: Array<{
    type: 'area' | 'quest' | 'npc' | 'feature'
    id: string
    name: string
  }>
}

// =============================================
// 完整任务定义
// =============================================

/** 任务定义 */
export interface QuestDefinition {
  /** 任务ID */
  id: string
  /** 任务标题 */
  title: string
  /** 任务描述 */
  description: string
  /** 任务类型 */
  type: QuestType
  /** 章节（0=序章, 1-5=主线章节） */
  chapter: number
  /** 给予任务的NPC ID */
  giverNpcId?: string
  /** 触发条件 */
  trigger: QuestTrigger
  /** 前置任务ID列表 */
  prerequisites: string[]
  /** 任务目标列表 */
  objectives: QuestObjective[]
  /** 完成条件（满足任一即可完成，如果objectives全部满足则自动检查） */
  completeConditions?: QuestConditionGroup
  /** 失败条件 */
  failConditions?: QuestConditionGroup
  /** 奖励 */
  reward: QuestReward
  /** 是否可重复 */
  repeatable: boolean
  /** 时间限制（游戏小时，0=无限制） */
  timeLimit: number
  /** 建议等级 */
  suggestedLevel: number
  /** 自动接受（满足触发条件后自动激活） */
  autoAccept: boolean
  /** 失败后是否可重试 */
  canRetry: boolean
}

// =============================================
// 玩家任务进度
// =============================================

/** 玩家任务进度 */
export interface PlayerQuestProgress {
  /** 进度ID */
  id: string
  /** 玩家ID */
  playerId: string
  /** 任务ID */
  questId: string
  /** 任务标题（从定义中获取） */
  questTitle?: string
  /** 任务状态 */
  status: QuestStatus
  /** 目标进度 */
  objectives: QuestObjective[]
  /** 接受时间 */
  acceptedAt: number
  /** 接受时的游戏日 */
  acceptedGameDay: number
  /** 完成时间 */
  completedAt?: number
  /** 最后更新时间 */
  updatedAt: number
  /** 自定义进度数据 */
  customData: Record<string, any>
}

// =============================================
// 任务事件
// =============================================

/** 任务事件类型 */
export type QuestEventType =
  | 'quest_available'   // 任务可接受
  | 'quest_accepted'    // 任务接受
  | 'quest_progress'    // 任务进度更新
  | 'quest_objective_complete' // 目标完成
  | 'quest_completed'   // 任务完成
  | 'quest_failed'      // 任务失败
  | 'quest_abandoned'   // 任务放弃

/** 任务事件 */
export interface QuestEvent {
  type: QuestEventType
  questId: string
  questTitle: string
  playerId: string
  timestamp: number
  /** 目标ID（objective_complete 时有值） */
  objectiveId?: string
  /** 进度信息 */
  progress?: {
    current: number
    required: number
    description: string
  }
  /** 消息 */
  message: string
}

// =============================================
// 工具函数
// =============================================

/**
 * 判断任务目标是否完成
 */
export function isObjectiveComplete(objective: QuestObjective): boolean {
  return objective.currentCount >= objective.requiredCount
}

/**
 * 判断所有必选目标是否完成
 */
export function areAllRequiredObjectivesComplete(objectives: QuestObjective[]): boolean {
  const required = objectives.filter((o) => !o.optional)
  if (required.length === 0) return true
  return required.every(isObjectiveComplete)
}

/**
 * 获取任务总进度百分比
 */
export function getQuestProgressPercent(objectives: QuestObjective[]): number {
  if (objectives.length === 0) return 0
  const total = objectives.reduce((sum, o) => sum + o.requiredCount, 0)
  const current = objectives.reduce((sum, o) => sum + Math.min(o.currentCount, o.requiredCount), 0)
  return total > 0 ? Math.round((current / total) * 100) : 0
}

/**
 * 更新目标进度
 */
export function updateObjectiveProgress(
  objective: QuestObjective,
  increment: number,
): QuestObjective {
  const newCount = Math.max(0, Math.min(objective.requiredCount, objective.currentCount + increment))
  return { ...objective, currentCount: newCount }
}
