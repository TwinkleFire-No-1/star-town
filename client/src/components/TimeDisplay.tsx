// 星火小镇 — 时间UI组件
// T3.1.2 游戏时钟显示、昼夜视觉变化

import { useGameStore } from '../stores/gameStore'
import './TimeDisplay.css'

/**
 * 时段图标和标签
 */
const PERIOD_INFO: Record<string, { icon: string; label: string; color: string }> = {
  dawn: { icon: '🌅', label: '黎明', color: '#ff9a56' },
  morning: { icon: '☀️', label: '上午', color: '#e8a93c' },
  afternoon: { icon: '🌤', label: '下午', color: '#87ceeb' },
  evening: { icon: '🌇', label: '傍晚', color: '#ff7f50' },
  night: { icon: '🌙', label: '夜晚', color: '#7080ff' },
}

/**
 * 将分钟数格式化为 HH:MM
 */
function formatTime(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24
  const m = Math.floor(minutes % 60)
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`
}

/**
 * TimeDisplay — 时间显示组件
 *
 * 特性：
 * - 右上角显示游戏日期和时间
 * - 昼夜图标随时段变化
 * - 背景色调随时段变化
 * - 像素风时钟边框
 */
export function TimeDisplay() {
  const time = useGameStore((s) => s.time)
  const periodInfo = PERIOD_INFO[time.period] ?? PERIOD_INFO.morning

  return (
    <div className={`time-display period-${time.period}`}>
      <div className="time-display-inner">
        <span className="time-icon">{periodInfo.icon}</span>
        <div className="time-info">
          <div className="time-day">第 {time.gameDay} 天</div>
          <div className="time-clock">{formatTime(time.gameTime)}</div>
          <div className="time-period">{periodInfo.label}</div>
        </div>
      </div>
    </div>
  )
}

export default TimeDisplay
