// 星火小镇 — 任务提醒弹出队列（右下角）
// 任务完成 / 新任务发布时弹出提示，一次只展示一个（复用成就弹窗的队列模式）
// 数据源：WebSocket 事件（quest:event 的 quest_completed / story:mainline_popup）

export interface QuestNotification {
  kind: 'completed' | 'new'
  title: string
  sub: string
}

/** 弹出队列上限：任务连续完成时最多排队展示条数，其余静默丢弃 */
const MAX_QUEUE = 4

type Listener = () => void
const listeners = new Set<Listener>()
let queue: QuestNotification[] = []

function notify(): void {
  listeners.forEach((l) => l())
}

/** 订阅队列变化，返回取消订阅函数 */
export function subscribeQuestNotifications(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** 当前队列第一项（正在展示中的提醒） */
export function peekQuestNotification(): QuestNotification | null {
  return queue.length > 0 ? queue[0] : null
}

/** 移除已展示的提醒（由 Toast 组件在展示结束后调用） */
export function popQuestNotification(): void {
  queue.shift()
  notify()
}

/** 入队一条任务提醒（新任务 / 任务完成） */
export function pushQuestNotification(n: QuestNotification): void {
  if (queue.length >= MAX_QUEUE) return
  queue.push(n)
  notify()
}
