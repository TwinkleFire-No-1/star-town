// 星火小镇 — 任务提醒弹出提示（右下角，悬浮在成就弹窗上方）
// 任务完成 / 新任务发布时右下角滑入弹出，停留数秒后渐隐消失。
// 数据源：questNotifications 队列（WebSocket quest:event / story:mainline_popup 驱动）

import { useEffect, useState } from 'react'
import {
  peekQuestNotification,
  popQuestNotification,
  subscribeQuestNotifications,
  type QuestNotification,
} from '../services/questNotifications'
import './QuestToast.css'

/** 展示时长（与 CSS 动画总时长一致，含渐隐） */
const SHOW_MS = 4200

export function QuestToast() {
  const [current, setCurrent] = useState<QuestNotification | null>(null)

  // 订阅队列：队列变化且有新提醒时取第一个展示
  useEffect(() => {
    const unsub = subscribeQuestNotifications(() => {
      setCurrent((cur) => (cur ? cur : peekQuestNotification()))
    })
    return unsub
  }, [])

  // 展示中的提醒到点后移除，并直接推进到下一个（不能只 setCurrent(null)：
  // popQuestNotification 触发的 notify 在此时 cur 仍为旧值，next 会被丢弃）
  useEffect(() => {
    if (!current) return
    const t = window.setTimeout(() => {
      popQuestNotification()
      setCurrent(peekQuestNotification())
    }, SHOW_MS)
    return () => window.clearTimeout(t)
  }, [current])

  if (!current) return null

  return (
    <div
      className={`quest-toast ${current.kind === 'completed' ? 'is-completed' : 'is-new'}`}
      key={`${current.kind}-${current.title}`}
    >
      <div className="quest-toast-icon">{current.kind === 'completed' ? '✓' : '✦'}</div>
      <div className="quest-toast-body">
        <div className="quest-toast-label">{current.kind === 'completed' ? '任务完成' : '新任务'}</div>
        <div className="quest-toast-title">{current.title}</div>
        {current.sub && <div className="quest-toast-sub">{current.sub}</div>}
      </div>
    </div>
  )
}

export default QuestToast
