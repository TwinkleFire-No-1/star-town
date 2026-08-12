// 星火小镇 — 成就解锁弹出提示（右下角）
// 成就满足时右下角滑入弹出，停留数秒后渐隐消失。
// 数据源：achievements 服务维护的弹出队列（一次只展示一个）

import { useEffect, useState } from 'react'
import {
  peekAchievement,
  popAchievement,
  subscribeAchievements,
} from '../services/achievements'
import type { AchievementDef } from '../services/achievements'
import './AchievementToast.css'

/** 展示时长（与 CSS 动画总时长一致，含渐隐） */
const SHOW_MS = 4200

export function AchievementToast() {
  const [current, setCurrent] = useState<AchievementDef | null>(null)

  // 订阅队列：队列变化且有新成就时取第一个展示
  useEffect(() => {
    const unsub = subscribeAchievements(() => {
      setCurrent((cur) => {
        if (!cur) return peekAchievement()
        return cur
      })
    })
    return unsub
  }, [])

  // 展示中的成就到点后移除，并直接推进到下一个（不能只 setCurrent(null)：
  // popAchievement 触发的 notify 在此时 cur 仍为旧值，next 会被丢弃）
  useEffect(() => {
    if (!current) return
    const t = window.setTimeout(() => {
      popAchievement()
      setCurrent(peekAchievement())
    }, SHOW_MS)
    return () => window.clearTimeout(t)
  }, [current])

  if (!current) return null

  return (
    <div className="achievement-toast" key={current.id}>
      <div className="achievement-icon">{current.icon}</div>
      <div className="achievement-body">
        <div className="achievement-label">✦ 成就解锁 ✦</div>
        <div className="achievement-name">{current.name}</div>
        <div className="achievement-desc">{current.desc}</div>
      </div>
    </div>
  )
}

export default AchievementToast
