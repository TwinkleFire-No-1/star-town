// 星火小镇 — 剧情解锁通知组件
// 需求：主线剧情推进时，显示"章节完成 + 新场景/NPC解锁"通知。
// 数据源：gameStore.story（由 storyUnlock 服务通过 API + WebSocket 更新）
// 注：右下角常驻章节指引已移除（原位置由成就系统占用）

import { useEffect, useRef } from 'react'
import { useGameStore } from '../stores/gameStore'
import { watchStoryUnlockEvents } from '../services/storyUnlock'
import './StoryUnlockNotice.css'

/**
 * StoryUnlockNotice — 剧情解锁通知
 * 章节推进/场景/NPC解锁时，屏幕中上方弹出横幅，自动消失
 */
export function StoryUnlockNotice() {
  const lastUnlockNotice = useGameStore((s) => s.story.lastUnlockNotice)
  const timerRef = useRef<number | null>(null)

  // 监听解锁事件（若本组件先挂载，提前开始监听，避免事件丢失）
  useEffect(() => {
    const unsub = watchStoryUnlockEvents()
    return () => {
      unsub()
      if (timerRef.current) window.clearTimeout(timerRef.current)
    }
  }, [])

  // 解锁通知出现时自动计时消失
  useEffect(() => {
    if (lastUnlockNotice && lastUnlockNotice.length > 0) {
      if (timerRef.current) window.clearTimeout(timerRef.current)
      timerRef.current = window.setTimeout(() => {
        useGameStore.getState().setLastUnlockNotice(null)
      }, 4200)
    }
  }, [lastUnlockNotice])

  return (
    <>
      {/* 解锁通知横幅（屏幕中上方） */}
      {lastUnlockNotice && lastUnlockNotice.length > 0 && (
        <div className="story-unlock-banner">
          <div className="story-unlock-title">✦ 剧情推进 ✦</div>
          {lastUnlockNotice.map((u) => (
            <div key={`${u.type}-${u.id}`} className="story-unlock-item">
              <span className="story-unlock-icon">{u.type === 'scene' ? '📍' : '💬'}</span>
              <span className="story-unlock-text">{u.unlockMessage || `${u.name} 解锁`}</span>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

export default StoryUnlockNotice
