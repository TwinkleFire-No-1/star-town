export interface Player {
  id: string
  name: string
  x: number
  y: number
  direction: Direction
}

export interface NPC {
  id: string
  name: string
  title: string
  x: number
  y: number
  direction: Direction
  schedule: ScheduleItem[]
}

export type Direction = 'up' | 'down' | 'left' | 'right'

export interface ScheduleItem {
  hour: number
  location: string
  action: string
}

export interface ChatMessage {
  id: string
  speaker: string
  content: string
  timestamp: number
}
