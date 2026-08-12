// 星火小镇 — 天气显示组件
// T6.9 天气设定：HUD 顶部显示当前天气图标+名称+描述
// 新需求：天气只在「改变」时弹出提示几秒，随后自动消失，不再常驻

import { useState, useEffect, useRef } from 'react'
import { useGameStore } from '../stores/gameStore'
import './WeatherDisplay.css'

/**
 * WeatherDisplay — 天气变化提示组件（HUD 右上角）
 *
 * 特性：
 * - 平时不显示，仅在天气 type 变化时（weather:update 驱动）弹出提示
 * - 弹出 4 秒后自动淡出消失
 * - 星露谷木质风格面板
 */
export function WeatherDisplay() {
  const weather = useGameStore((s) => s.weather)
  const [visible, setVisible] = useState(false)
  const prevTypeRef = useRef<string>(weather.type)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 天气类型变化 → 弹出提示，几秒后自动消失
  useEffect(() => {
    if (weather.type === prevTypeRef.current) return
    prevTypeRef.current = weather.type

    // 弹出
    setVisible(true)

    // 重置隐藏定时器
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    hideTimerRef.current = setTimeout(() => setVisible(false), 4000)
  }, [weather.type])

  // 组件卸载时清理定时器
  useEffect(() => {
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    }
  }, [])

  // 平时隐藏，只有天气变化时短暂弹出
  if (!visible) return null

  return (
    <div className={`weather-display weather-${weather.type}`}>
      <div className="weather-display-inner">
        <span className="weather-icon">{weather.icon}</span>
        <div className="weather-info">
          <div className="weather-name">{weather.name}</div>
          <div className="weather-desc">{weather.description}</div>
        </div>
      </div>
    </div>
  )
}

export default WeatherDisplay
