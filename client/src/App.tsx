import { useState, useEffect, useCallback } from 'react'
import { PhaserGame } from './components/PhaserGame'
import { LandingPage } from './components/LandingPage'
import { DialogueBox } from './components/DialogueBox'
import { EnhancedDialogueInput } from './components/EnhancedDialogueInput'
import { TimeDisplay } from './components/TimeDisplay'
import { WeatherDisplay } from './components/WeatherDisplay'
import { QuestPanel } from './components/QuestPanel'
import { StoryUnlockNotice } from './components/StoryUnlockNotice'
import { QuestGuide } from './components/QuestGuide'
import { LevelBadge, LevelUpNotice } from './components/LevelBadge'
import { AchievementToast } from './components/AchievementToast'
import { QuestToast } from './components/QuestToast'
import { PlayerChatPanel } from './components/PlayerChatPanel'
import { useGameStore } from './stores/gameStore'
import { useAuthStore, getCurrentPlayerName } from './stores/authStore'
import { wsService } from './services/websocket'
import { initAchievementDetector } from './services/achievements'
import './App.css'

function App() {
  const [currentScene, setCurrentScene] = useState<string>('Boot')
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const isConnected = useGameStore((s) => s.isConnected)
  const timePeriod = useGameStore((s) => s.time.period)
  // 多租户：认证状态（token 存在才渲染游戏，否则显示 LandingPage）
  const token = useAuthStore((s) => s.token)
  const player = useAuthStore((s) => s.player)

  // 前后端联调：登录后自动连接 WebSocket 并加入房间
  useEffect(() => {
    // 未登录 → 不连接 WS（游戏不会渲染，由 LandingPage 门禁拦截）
    if (!token) return

    wsService.connect()

    // 连接成功后自动加入默认房间（使用真实 playerId + 用户名）
    // T6.17 竞态修复：改用 wsService 的 ws:connected 自定义事件驱动（不依赖 store subscribe 时序）
    // 注意：server 端 connection handler 含 await（prisma/redis），监听器注册有延迟；
    // 若 connect 后立即 emit room:join 会因监听器未注册而丢失 → 延迟 800ms 再 joinRoom
    const onWsConnected = () => {
      console.log('[App] WS connected, joining room...')
      setTimeout(() => {
        const socketId = wsService.getSocketId() ?? undefined
        wsService.joinRoom('town-square', wsService.getPlayerId() ?? socketId ?? '', getCurrentPlayerName())
        // T6.17 在线玩家系统：加入后请求在线列表，渲染已在线的其他用户
        wsService.requestPlayerList()
        // T6.8 升级打怪：连接后拉取主线任务状态 + 等级信息
        wsService.requestMainlineStatus()
        fetchLevelInfo(wsService.getPlayerId() ?? socketId ?? '')
      }, 800)
    }
    wsService.on('ws:connected', onWsConnected)
    // 如果已连接（HMR恢复场景），直接加入
    if (wsService.isConnected()) {
      onWsConnected()
    }

    // T6.17 玩家间对话：收到对方消息 → 写入 store（PlayerChatPanel 显示）
    const chatHandler = (data: { fromPlayerId: string; fromName: string; message: string }) => {
      useGameStore.getState().addIncomingPlayerChatMessage(data.fromPlayerId, data.fromName, data.message)
    }
    wsService.on('player:chat', chatHandler)

    return () => {
      wsService.off('ws:connected', onWsConnected)
      wsService.off('player:chat', chatHandler)
      wsService.disconnect()
    }
  }, [token]) // 登录状态变化时（重新）连接

  const handleReady = useCallback(() => {
    useGameStore.getState().setConnected(true)
  }, [])

  const handleSceneChange = useCallback((_sceneKey: string) => {
    setCurrentScene(_sceneKey)
  }, [])

  /**
   * T6.8 升级打怪：拉取玩家等级信息（连接后调用）
   */
  const fetchLevelInfo = useCallback((playerId: string) => {
    fetch(`/api/level/${playerId}`)
      .then((res) => res.json())
      .then((json) => {
        const data = json?.data
        if (data) {
          useGameStore.getState().setLevelInfo({
            level: data.level,
            exp: data.exp,
            expToNext: data.expToNext,
            progressPercent: data.progressPercent,
          })
        }
      })
      .catch((err) => console.warn('[App] Fetch level info failed:', err))
  }, [])

  // 成就系统：进入游戏后初始化检测器（监听 store 与 WS 事件）
  useEffect(() => {
    if (!token) return
    const cleanup = initAchievementDetector()
    return cleanup
  }, [token])

  // 多租户门禁：未登录 → 显示 LandingPage
  if (!token) {
    return <LandingPage />
  }

  return (
    <div className="app-container">
      {/* 昼夜光影遮罩 */}
      <div className={`day-night-overlay ${timePeriod}`} />
      <PhaserGame
        onReady={handleReady}
        onSceneChange={handleSceneChange}
        className="game-wrapper"
      />
      {/* UI overlay layer — 对话框、HUD等在此渲染 */}
      <div className="ui-overlay" id="ui-overlay">
        {/* 时间显示 */}
        <TimeDisplay />
        {/* T6.9 天气显示（HUD 右上角） */}
        <WeatherDisplay />
        {/* T6.8 升级打怪：等级徽章 HUD + 升级提示 */}
        <LevelBadge />
        <LevelUpNotice />
        {/* 连接状态指示器（多租户：右上角只保留用户名，点击可退出） */}
        <div className="status-bar">
          <button
            className="username-btn"
            title="点击打开菜单"
            onClick={() => setUserMenuOpen((v) => !v)}
          >
            <span className={`status-dot ${isConnected ? 'connected' : ''}`} />
            {isConnected ? `${player?.name ?? '旅行者'}` : 'Offline'}
            <span className="username-caret">▾</span>
          </button>
          {userMenuOpen && (
            <div className="user-menu">
              <div className="user-menu-name">{player?.name ?? '旅行者'}</div>
              <button
                className="logout-btn"
                title="退出登录"
                onClick={() => {
                  setUserMenuOpen(false)
                  wsService.disconnect()
                  useAuthStore.getState().logout()
                }}
              >
                退出登录
              </button>
            </div>
          )}
        </div>
        {/* 场景指示器（显示当前实际场景名，如 星火小镇/低语森林/废弃矿洞） */}
        <div className="scene-indicator">{currentScene}</div>
        {/* JRPG对话UI */}
        <DialogueBox />
        {/* 增强输入+快捷动作 */}
        <EnhancedDialogueInput />
        {/* 任务面板 (Q) */}
        <QuestPanel />
        {/* 剧情解锁通知 + 章节指引 */}
        <StoryUnlockNotice />
        {/* 成就解锁弹出提示（右下角） */}
        <AchievementToast />
        {/* 任务提醒弹出提示（右下角，悬浮在成就弹窗上方） */}
        <QuestToast />
        {/* T6.13 任务引导：右侧悬浮按钮 + 感叹号提示（替换原大弹窗） */}
        <QuestGuide />
        {/* T6.17 在线玩家系统：玩家间对话面板（点击小镇黄名玩家打开） */}
        <PlayerChatPanel />
      </div>
    </div>
  )
}

export default App
