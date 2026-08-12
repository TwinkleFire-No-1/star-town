// 星火小镇 — 等级徽章 HUD + 升级提示（T6.8 升级打怪玩法）
// 左上角显示 Lv 等级 + 经验条；升级时屏幕中央弹出"LEVEL UP"动画提示

import { useEffect, useRef } from 'react'
import { useGameStore } from '../stores/gameStore'
import './LevelBadge.css'

/**
 * LevelBadge — 等级徽章（左上角 HUD）
 * 显示：Lv.X 徽章 + 经验进度条（当前经验 / 升级所需）
 */
export function LevelBadge() {
  const level = useGameStore((s) => s.level)

  return (
    <div className="level-badge">
      <div className="level-badge-lv">
        <span className="level-lv-text">Lv.{level.level}</span>
      </div>
      <div className="level-badge-exp">
        <div className="level-exp-bar">
          <div
            className="level-exp-bar-fill"
            style={{ width: `${level.progressPercent}%` }}
          />
        </div>
        <div className="level-exp-text">
          {level.exp} / {level.expToNext} EXP
        </div>
      </div>
    </div>
  )
}

/**
 * LevelUpNotice — 升级动画提示
 * 收到 level:up 事件后屏幕中央弹出"LEVEL UP!"横幅，数秒后自动消失
 */
export function LevelUpNotice() {
  const lastLevelUp = useGameStore((s) => s.lastLevelUp)
  const timerRef = useRef<number | null>(null)

  useEffect(() => {
    if (lastLevelUp) {
      if (timerRef.current) window.clearTimeout(timerRef.current)
      timerRef.current = window.setTimeout(() => {
        useGameStore.getState().setLastLevelUp(null)
      }, 3200)
    }
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current)
    }
  }, [lastLevelUp])

  if (!lastLevelUp) return null

  return (
    <div className="level-up-notice">
      <div className="level-up-title">✦ LEVEL UP! ✦</div>
      <div className="level-up-sub">
        Lv.{lastLevelUp.oldLevel} → <span className="level-up-new">Lv.{lastLevelUp.newLevel}</span>
      </div>
      <div className="level-up-stats">
        <span className="stat-chip">生命 +{12 * lastLevelUp.levelsGained}</span>
        <span className="stat-chip">精神 +{5 * lastLevelUp.levelsGained}</span>
        <span className="stat-chip">攻击 +{2 * lastLevelUp.levelsGained}</span>
        <span className="stat-chip">防御 +{1 * lastLevelUp.levelsGained}</span>
        <span className="stat-chip">速度 +{1 * lastLevelUp.levelsGained}</span>
      </div>
    </div>
  )
}

export default LevelBadge
