// 星火小镇 — 任务UI组件
// T3.2.3 任务列表、任务详情、进度追踪面板

import { useState, useEffect, useCallback } from 'react'
import { useGameStore } from '../stores/gameStore'
import { wsService } from '../services/websocket'
import './QuestPanel.css'

// =============================================
// 类型定义
// =============================================

/** 任务类型 */
type QuestType = 'main' | 'side' | 'daily' | 'emergent' | 'hidden'
/** 任务状态 */
type QuestStatus = 'locked' | 'available' | 'active' | 'completed' | 'failed' | 'abandoned'

/** 任务目标 */
interface QuestObjective {
  id: string
  description: string
  type: string
  requiredCount: number
  currentCount: number
  optional: boolean
}

/** 任务定义 */
interface QuestDefinition {
  id: string
  title: string
  description: string
  type: QuestType
  chapter: number
  objectives: QuestObjective[]
  reward: {
    exp: number
    coins: number
    items: Array<{ itemId: string; itemName: string; quantity: number }>
  }
  repeatable: boolean
}

/** 玩家任务进度 */
interface PlayerQuestProgress {
  id: string
  playerId: string
  questId: string
  questTitle?: string
  status: QuestStatus
  objectives: QuestObjective[]
  acceptedAt: number
}

// =============================================
// 常量
// =============================================

const QUEST_TYPE_LABELS: Record<QuestType, string> = {
  main: '主线',
  side: '支线',
  daily: '日常',
  emergent: '涌现',
  hidden: '隐藏',
}

const QUEST_TYPE_COLORS: Record<QuestType, string> = {
  main: '#e8a93c',
  side: '#4fc3f7',
  daily: '#81c784',
  emergent: '#ba68c8',
  hidden: '#ff8a65',
}

const QUEST_STATUS_LABELS: Record<QuestStatus, string> = {
  locked: '未解锁',
  available: '可接受',
  active: '进行中',
  completed: '已完成',
  failed: '已失败',
  abandoned: '已放弃',
}

const API_BASE = '/api/quest'

// =============================================
// 工具函数
// =============================================

function getProgressPercent(objectives: QuestObjective[]): number {
  if (objectives.length === 0) return 0
  const total = objectives.reduce((s, o) => s + o.requiredCount, 0)
  const current = objectives.reduce((s, o) => s + Math.min(o.currentCount, o.requiredCount), 0)
  return total > 0 ? Math.round((current / total) * 100) : 0
}

/**
 * QuestPanel — 任务面板组件
 *
 * 特性：
 * - 侧边栏可收起/展开
 * - 按状态分组显示任务
 * - 点击任务查看详情
 * - 接受/放弃任务按钮
 * - 进度条显示
 * - 像素风边框
 */
export function QuestPanel() {
  const player = useGameStore((s) => s.player)
  const [isOpen, setIsOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<'active' | 'available' | 'completed'>('active')
  const [selectedQuestId, setSelectedQuestId] = useState<string | null>(null)
  const [playerQuests, setPlayerQuests] = useState<PlayerQuestProgress[]>([])
  const [availableQuests, setAvailableQuests] = useState<QuestDefinition[]>([])
  const [loading, setLoading] = useState(false)

  const playerId = player.id || wsService.getPlayerId() || 'default-player'

  // 获取玩家任务列表
  const fetchPlayerQuests = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/player/${playerId}`)
      const data = await res.json()
      if (data.data) setPlayerQuests(data.data)
    } catch (err) {
      console.error('[QuestPanel] Failed to fetch player quests:', err)
    }
  }, [playerId])

  // 获取可接受的任务
  const fetchAvailableQuests = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/player/${playerId}/available`)
      const data = await res.json()
      if (data.data) setAvailableQuests(data.data)
    } catch (err) {
      console.error('[QuestPanel] Failed to fetch available quests:', err)
    }
  }, [playerId])

  // 加载所有数据
  const fetchAll = useCallback(async () => {
    setLoading(true)
    await Promise.all([fetchPlayerQuests(), fetchAvailableQuests()])
    setLoading(false)
  }, [fetchPlayerQuests, fetchAvailableQuests])

  useEffect(() => {
    if (isOpen) fetchAll()
  }, [isOpen, fetchAll])

  // 接受任务
  const handleAccept = useCallback(async (questId: string) => {
    try {
      const res = await fetch(`${API_BASE}/player/${playerId}/accept/${questId}`, { method: 'POST' })
      const data = await res.json()
      if (data.data) {
        await fetchAll()
      }
    } catch (err) {
      console.error('[QuestPanel] Failed to accept quest:', err)
    }
  }, [playerId, fetchAll])

  // 放弃任务
  const handleAbandon = useCallback(async (questId: string) => {
    try {
      await fetch(`${API_BASE}/player/${playerId}/abandon/${questId}`, { method: 'POST' })
      await fetchAll()
      if (selectedQuestId === questId) setSelectedQuestId(null)
    } catch (err) {
      console.error('[QuestPanel] Failed to abandon quest:', err)
    }
  }, [playerId, fetchAll, selectedQuestId])

  // 按状态筛选任务
  const activeQuests = playerQuests.filter((q) => q.status === 'active')
  const completedQuests = playerQuests.filter((q) => q.status === 'completed')

  // 选中的任务详情
  const selectedQuest = playerQuests.find((q) => q.questId === selectedQuestId)
  const selectedAvailable = availableQuests.find((q) => q.id === selectedQuestId)

  // 快捷键
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'q' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const target = e.target as HTMLElement
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return
        setIsOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [])

  return (
    <>
      {/* 快捷按钮 */}
      <button
        className="quest-toggle-btn"
        onClick={() => setIsOpen(!isOpen)}
        title="任务面板 (Q)"
      >
        <span className="quest-icon">&#9998;</span>
        {activeQuests.length > 0 && (
          <span className="quest-badge">{activeQuests.length}</span>
        )}
      </button>

      {/* 任务面板 */}
      {isOpen && (
        <div className="quest-panel">
          <div className="quest-panel-header">
            <h3>任务日志</h3>
            <button className="quest-panel-close" onClick={() => setIsOpen(false)}>x</button>
          </div>

          {/* 标签页 */}
          <div className="quest-tabs">
            <button
              className={`quest-tab ${activeTab === 'active' ? 'active' : ''}`}
              onClick={() => setActiveTab('active')}
            >
              进行中 ({activeQuests.length})
            </button>
            <button
              className={`quest-tab ${activeTab === 'available' ? 'active' : ''}`}
              onClick={() => setActiveTab('available')}
            >
              可接受 ({availableQuests.length})
            </button>
            <button
              className={`quest-tab ${activeTab === 'completed' ? 'active' : ''}`}
              onClick={() => setActiveTab('completed')}
            >
              已完成 ({completedQuests.length})
            </button>
          </div>

          {/* 任务列表 */}
          <div className="quest-list">
            {loading && <div className="quest-loading">加载中...</div>}

            {activeTab === 'active' && activeQuests.map((quest) => (
              <div
                key={quest.questId}
                className={`quest-item ${selectedQuestId === quest.questId ? 'selected' : ''}`}
                onClick={() => setSelectedQuestId(quest.questId)}
              >
                <div className="quest-item-icon" />
                <div className="quest-item-body">
                  <div className="quest-item-header">
                    <span className="quest-item-title">{quest.questTitle ?? quest.questId}</span>
                    <span className="quest-item-progress">{getProgressPercent(quest.objectives)}%</span>
                  </div>
                  <div className="quest-item-bar">
                    <div
                      className="quest-item-bar-fill"
                      style={{ width: `${getProgressPercent(quest.objectives)}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}

            {activeTab === 'available' && availableQuests.map((quest) => (
              <div
                key={quest.id}
                className={`quest-item available ${selectedQuestId === quest.id ? 'selected' : ''}`}
                onClick={() => setSelectedQuestId(quest.id)}
              >
                <div className="quest-item-icon" />
                <div className="quest-item-body">
                  <div className="quest-item-header">
                    <span className="quest-item-title">{quest.title}</span>
                    <span className="quest-type-tag" style={{ color: QUEST_TYPE_COLORS[quest.type] ?? '#fff' }}>
                      {QUEST_TYPE_LABELS[quest.type] ?? quest.type}
                    </span>
                  </div>
                  <div className="quest-item-desc">{quest.description}</div>
                </div>
              </div>
            ))}

            {activeTab === 'completed' && completedQuests.map((quest) => (
              <div
                key={quest.questId}
                className={`quest-item completed ${selectedQuestId === quest.questId ? 'selected' : ''}`}
                onClick={() => setSelectedQuestId(quest.questId)}
              >
                <div className="quest-item-icon" />
                <div className="quest-item-body">
                  <div className="quest-item-header">
                    <span className="quest-item-title">{quest.questTitle ?? quest.questId}</span>
                    <span className="quest-status-done">&#10003;</span>
                  </div>
                </div>
              </div>
            ))}

            {!loading && activeTab === 'active' && activeQuests.length === 0 && (
              <div className="quest-empty">当前没有进行中的任务</div>
            )}
            {!loading && activeTab === 'available' && availableQuests.length === 0 && (
              <div className="quest-empty">暂无可接受的任务</div>
            )}
            {!loading && activeTab === 'completed' && completedQuests.length === 0 && (
              <div className="quest-empty">还没有完成的任务</div>
            )}
          </div>

          {/* 任务详情 */}
          {(selectedQuest || selectedAvailable) && (
            <div className="quest-detail">
              {selectedQuest && (
                <>
                  <div className="quest-detail-title">{selectedQuest.questTitle}</div>
                  <div className="quest-detail-status">
                    状态: {QUEST_STATUS_LABELS[selectedQuest.status]}
                  </div>
                  <div className="quest-detail-objectives">
                    {selectedQuest.objectives.map((obj) => (
                      <div key={obj.id} className={`quest-objective ${obj.currentCount >= obj.requiredCount ? 'complete' : ''}`}>
                        <span className="obj-check">{obj.currentCount >= obj.requiredCount ? '+' : ' '}</span>
                        <span className="obj-desc">{obj.description}</span>
                        <span className="obj-count">
                          {Math.min(obj.currentCount, obj.requiredCount)}/{obj.requiredCount}
                        </span>
                      </div>
                    ))}
                  </div>
                  {selectedQuest.status === 'active' && (
                    <button
                      className="quest-abandon-btn"
                      onClick={() => handleAbandon(selectedQuest.questId)}
                    >
                      放弃任务
                    </button>
                  )}
                </>
              )}

              {selectedAvailable && !selectedQuest && (
                <>
                  <div className="quest-detail-title">{selectedAvailable.title}</div>
                  <div className="quest-detail-desc">{selectedAvailable.description}</div>
                  <div className="quest-detail-reward">
                    <div>奖励: {selectedAvailable.reward.exp} 经验, {selectedAvailable.reward.coins} 星币</div>
                  </div>
                  <button
                    className="quest-accept-btn"
                    onClick={() => handleAccept(selectedAvailable.id)}
                  >
                    接受任务
                  </button>
                </>
              )}
            </div>
          )}

          {/* 刷新 */}
          <button className="quest-refresh-btn" onClick={fetchAll} disabled={loading}>
            刷新
          </button>
        </div>
      )}
    </>
  )
}

export default QuestPanel
