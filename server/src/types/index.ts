// 星火小镇 - 核心类型定义

/** 模型用途枚举 */
export enum ModelPurpose {
  /** 深度对话、复杂决策 */
  Chat = 'chat',
  /** 轻量任务：快速回复、简单判断 */
  Fast = 'fast',
  /** 文本嵌入：语义搜索、相似度 */
  Embed = 'embed',
  /** 反思生成：长上下文、重要度判断 */
  Reflect = 'reflect',
}

/** 方向枚举 */
export type Direction = 'up' | 'down' | 'left' | 'right'

/** 玩家基础信息 */
export interface Player {
  id: string
  name: string
  x: number
  y: number
  direction: Direction
}

/** NPC基础信息 */
export interface NPC {
  id: string
  name: string
  title: string
  x: number
  y: number
  direction: Direction
  schedule: ScheduleItem[]
}

/** 日程项 */
export interface ScheduleItem {
  hour: number
  location: string
  action: string
}

/** 聊天消息 */
export interface ChatMessage {
  id: string
  speaker: string
  content: string
  timestamp: number
}

/** WebSocket事件类型 */
export interface SocketEvents {
  'player:join': (data: { playerId: string; name: string }) => void
  'player:move': (data: { x: number; y: number; direction: Direction }) => void
  'player:moved': (data: { playerId: string; x: number; y: number; direction: Direction }) => void
  'players:count': (data: { count: number }) => void
  'npc:dialogue': (data: { npcId: string; message: string }) => void
  'game:time': (data: { day: number; time: number }) => void
}
