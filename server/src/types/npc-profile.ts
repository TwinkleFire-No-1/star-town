// 星火小镇 — NPC角色档案系统类型定义
// T2.2.1 角色档案JSON Schema

// =============================================
// 1. 基础枚举与共用类型
// =============================================

/** NPC角色类型 */
export type NPCRole = 'villager' | 'merchant' | 'quest_giver' | 'boss'

/** NPC好感度等级 */
export type AffectionLevel = 'hostile' | 'unfriendly' | 'neutral' | 'friendly' | 'devoted'

/** 情绪状态 */
export type MoodType = 'happy' | 'neutral' | 'sad' | 'angry' | 'anxious' | 'excited' | 'calm'

/** 关系类型 */
export type RelationType = 'friend' | 'rival' | 'family' | 'lover' | 'neutral' | 'enemy'

/** 记忆类型 */
export type MemoryType = 'observation' | 'dialogue' | 'reflection' | 'relation'

/** 方向 */
export type Direction = 'up' | 'down' | 'left' | 'right'

// =============================================
// 2. 日程系统
// =============================================

/** 日程项 */
export interface ScheduleItem {
  /** 游戏内小时 (0-23) */
  hour: number
  /** 所在区域ID */
  location: string
  /** 行为描述 */
  action: string
}

// =============================================
// 3. 角色属性
// =============================================

/** 角色战斗属性 */
export interface CharacterStats {
  hp: number
  maxHp: number
  attack: number
  defense: number
  speed: number
}

// =============================================
// 4. 角色档案核心（Schema定义）
// =============================================

/** NPC角色档案 — 核心数据结构 */
export interface NPCProfile {
  // ---- 身份 ----
  /** 唯一标识符（对应数据库UUID） */
  id: string
  /** NPC名字 */
  name: string
  /** 称号/头衔 */
  title: string
  /** 角色类型 */
  role: NPCRole

  // ---- 人格 ----
  /** 人格核心描述（用于Prompt注入） */
  personality: string
  /** 背景故事 */
  backstory: string
  /** 说话风格关键词（如"冷淡"、"热情"、"隐晦"） */
  speechStyle: string[]
  /** 口头禅/常用语 */
  catchphrases: string[]
  /** 喜好 */
  likes: string[]
  /** 厌恶 */
  dislikes: string[]
  /** 核心目标/动机 */
  motivations: string[]

  // ---- 状态 ----
  /** 当前位置X */
  x: number
  /** 当前位置Y */
  y: number
  /** 朝向 */
  direction: Direction
  /** 日程表 */
  schedule: ScheduleItem[]
  /** 战斗属性 */
  stats: CharacterStats
  /** 当前情绪 */
  mood: MoodType
  /** 是否激活 */
  isActive: boolean

  // ---- 元数据 ----
  /** 档案版本号（用于热更新） */
  version: number
  /** 额外扩展字段 */
  metadata: Record<string, unknown>
}

// =============================================
// 5. 运行时状态（不持久化，由Agent系统维护）
// =============================================

/** NPC运行时状态 — Agent循环使用 */
export interface NPCRuntimeState {
  /** NPC档案ID */
  profileId: string
  /** 当前行为（idle/walking/talking/working...） */
  currentAction: string
  /** 当前对话对象ID（null=无对话） */
  talkingTo: string | null
  /** 最近感知到的事件列表 */
  recentEvents: PerceivedEvent[]
  /** 短期记忆缓冲（最近5轮对话） */
  shortTermMemory: ShortTermMemory[]
  /** 当前目标 */
  currentGoal: string | null
  /** 最后更新时间戳 */
  lastUpdate: number
  /** 每日交互次数 */
  dailyInteractionCount?: number
}

/** 感知到的事件 */
export interface PerceivedEvent {
  /** 事件类型 */
  type: 'player_approach' | 'npc_dialogue' | 'environment_change' | 'time_event' | 'quest_event' | 'world_event'
  /** 事件来源ID */
  sourceId: string
  /** 事件内容 */
  content: string
  /** 时间戳 */
  timestamp: number
  /** 重要度 (1-10) */
  importance: number
  /** 元数据 */
  metadata?: Record<string, any>
}

/** 短期记忆条目 */
export interface ShortTermMemory {
  /** 角色（player/npc/system） */
  role: 'player' | 'npc' | 'system'
  /** 说话者名字 */
  speaker: string
  /** 内容 */
  content: string
  /** 时间戳 */
  timestamp: number
}

// =============================================
// 6. 关系数据
// =============================================

/** NPC间关系 */
export interface NPCRelationship {
  /** 源NPC ID */
  sourceId: string
  /** 目标NPC ID */
  targetId: string
  /** 关系类型 */
  type: RelationType
  /** 好感度 (0-100) */
  affection: number
  /** 信任度 (0-100) */
  trust: number
  /** 关系描述 */
  description: string
}

// =============================================
// 7. Prompt相关类型
// =============================================

/** Prompt模板变量 */
export interface PromptVariables {
  npcName: string
  npcTitle: string
  npcPersonality: string
  npcSpeechStyle: string
  npcBackstory: string
  npcMood: string
  playerMessage: string
  recentMemories: string
  shortTermMemory: string
  currentLocation: string
  timeOfDay: string
  relations: string
  [key: string]: string
}

/** Prompt模板定义 */
export interface PromptTemplate {
  /** 模板ID */
  id: string
  /** 模板类型 */
  type: 'dialogue' | 'think' | 'reflect' | 'npc_interaction'
  /** 模板内容（支持 {variableName} 变量注入） */
  template: string
  /** 描述 */
  description: string
  /** 对应的模型用途 */
  modelPurpose: 'chat' | 'fast' | 'reflect'
}

// =============================================
// 8. 角色档案集合类型
// =============================================

/** 完整的角色档案集合（从JSON加载） */
export interface NPCProfileCollection {
  /** 集合版本 */
  version: string
  /** 档案列表 */
  profiles: NPCProfile[]
}

/** 好感度等级映射 */
export function getAffectionLevel(affection: number): AffectionLevel {
  if (affection >= 80) return 'devoted'
  if (affection >= 60) return 'friendly'
  if (affection >= 40) return 'neutral'
  if (affection >= 20) return 'unfriendly'
  return 'hostile'
}

/** 情绪对行为的影响描述 */
export function getMoodDescription(mood: MoodType): string {
  const descriptions: Record<MoodType, string> = {
    happy: '心情愉快，更愿意分享信息',
    neutral: '情绪平稳，按日常行事',
    sad: '有些低落，可能不太想说话',
    angry: '正在生气，言辞可能偏激',
    anxious: '心神不宁，容易分心',
    excited: '非常兴奋，话可能比较多',
    calm: '内心平静，思路清晰',
  }
  return descriptions[mood]
}
