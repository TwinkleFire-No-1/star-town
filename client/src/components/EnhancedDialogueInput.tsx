// 星火小镇 — 自由输入+快捷动作增强
// T4.3.2 文本输入框+动作按钮组（增强版）

import { useState, useRef, useCallback, useEffect } from 'react'
import { useGameStore } from '../stores/gameStore'
import { wsService } from '../services/websocket'
import './DialogueBox.css'

// =============================================
// 快捷动作配置
// =============================================

interface QuickActionDef {
  id: string
  label: string
  icon: string
  /** 动作发送的文本 */
  action: string
  /** 分类标签 */
  category: 'social' | 'combat' | 'explore'
  /** 解锁条件（空=默认可用） */
  unlockCondition?: string
  /** 对NPC好感度最低要求 */
  minAffection?: number
  /** 是否为扩展动作（默认折叠） */
  isExpanded: boolean
}

/** 完整快捷动作列表 */
const QUICK_ACTIONS: QuickActionDef[] = [
  // ---- 社交类（默认展开） ----
  { id: 'qa_greet', label: '打招呼', icon: '👋', action: '你好！', category: 'social', isExpanded: false },
  { id: 'qa_praise', label: '赞美', icon: '✨', action: '你真厉害！', category: 'social', isExpanded: false },
  { id: 'qa_ask', label: '询问', icon: '❓', action: '能告诉我一些事情吗？', category: 'social', isExpanded: false },
  { id: 'qa_farewell', label: '告别', icon: '🚪', action: '再见！', category: 'social', isExpanded: false },
  { id: 'qa_threat', label: '威胁', icon: '⚠️', action: '你最好老实交代！', category: 'social', isExpanded: true },
  { id: 'qa_gift', label: '赠礼', icon: '🎁', action: '这个送给你。', category: 'social', isExpanded: true },
  { id: 'qa_chat', label: '闲聊', icon: '💬', action: '最近有什么新鲜事吗？', category: 'social', isExpanded: true },
  { id: 'qa_flirt', label: '调情', icon: '💕', action: '你今天看起来真不错。', category: 'social', isExpanded: true, minAffection: 30 },

  // ---- 探索类 ----
  { id: 'qa_rumor', label: '打听', icon: '👂', action: '最近有什么传闻吗？', category: 'explore', isExpanded: true },
  { id: 'qa_quest', label: '任务', icon: '📜', action: '有什么我可以帮忙的吗？', category: 'explore', isExpanded: false },
  { id: 'qa_hint', label: '提示', icon: '💡', action: '能给我一些指引吗？', category: 'explore', isExpanded: true },

  // ---- 战斗类 ----
  { id: 'qa_challenge', label: '挑战', icon: '⚔️', action: '来比试一下吧！', category: 'combat', isExpanded: true },
  { id: 'qa_recruit', label: '招募', icon: '🤝', action: '你愿意和我一起冒险吗？', category: 'combat', isExpanded: true, minAffection: 50 },
]

/** 动作分类标签 */
const CATEGORY_LABELS: Record<string, string> = {
  social: '社交',
  explore: '探索',
  combat: '战斗',
}

// =============================================
// 自由输入增强组件
// =============================================

/**
 * EnhancedDialogueInput — 增强版对话输入
 *
 * 特性：
 * - 自由文本输入 + Enter发送
 * - 分组快捷动作按钮（社交/探索/战斗）
 * - 默认显示常用动作，展开显示全部
 * - 输入历史（上下键翻阅）
 * - 字数限制和实时字数显示
 * - 发送状态反馈
 */
export function EnhancedDialogueInput() {
  const interaction = useGameStore((s) => s.interaction)
  const player = useGameStore((s) => s.player)
  const [inputValue, setInputValue] = useState('')
  const [showExpanded, setShowExpanded] = useState(false)
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [inputHistory, setInputHistory] = useState<string[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const [isSending, setIsSending] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const MAX_CHARS = 200

  const { isDialogOpen, activeNPCId, isStreaming } = interaction

  // 对话框打开时聚焦
  useEffect(() => {
    if (isDialogOpen) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [isDialogOpen])

  // 发送消息
  const handleSend = useCallback(() => {
    const trimmed = inputValue.trim()
    if (!trimmed || !activeNPCId || isStreaming) return

    // 添加到输入历史
    setInputHistory((prev) => [trimmed, ...prev.slice(0, 19)])
    setHistoryIndex(-1)

    // 发送到后端
    useGameStore.getState().addDialogMessage(player.name, trimmed)
    wsService.sendDialogue(activeNPCId, trimmed)

    setInputValue('')
    setIsSending(true)
    setTimeout(() => setIsSending(false), 300)
  }, [inputValue, activeNPCId, player.name, isStreaming])

  // 快捷动作点击
  const handleQuickAction = useCallback((action: string) => {
    if (!activeNPCId || isStreaming) return
    useGameStore.getState().addDialogMessage(player.name, action)
    wsService.sendDialogue(activeNPCId, action)
  }, [activeNPCId, player.name, isStreaming])

  // 键盘事件
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    } else if (e.key === 'Escape') {
      useGameStore.getState().clearDialog()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (inputHistory.length > 0) {
        const newIndex = Math.min(historyIndex + 1, inputHistory.length - 1)
        setHistoryIndex(newIndex)
        setInputValue(inputHistory[newIndex])
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (historyIndex > 0) {
        const newIndex = historyIndex - 1
        setHistoryIndex(newIndex)
        setInputValue(inputHistory[newIndex])
      } else {
        setHistoryIndex(-1)
        setInputValue('')
      }
    }
  }, [handleSend, inputHistory, historyIndex])

  // 过滤动作列表
  const visibleActions = QUICK_ACTIONS.filter((a) => {
    if (!showExpanded && !a.isExpanded) return true
    if (showExpanded) return true
    return false
  })

  // 按分类分组
  const groupedActions: Record<string, QuickActionDef[]> = {}
  for (const action of visibleActions) {
    if (activeCategory && action.category !== activeCategory) continue
    if (!groupedActions[action.category]) groupedActions[action.category] = []
    groupedActions[action.category].push(action)
  }

  if (!isDialogOpen) return null

  return (
    <div className="enhanced-input-container">
      {/* 分类筛选栏 */}
      <div className="action-categories">
        <button
          className={`category-btn ${activeCategory === null ? 'active' : ''}`}
          onClick={() => setActiveCategory(null)}
        >
          全部
        </button>
        {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
          <button
            key={key}
            className={`category-btn ${activeCategory === key ? 'active' : ''}`}
            onClick={() => setActiveCategory(activeCategory === key ? null : key)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* 快捷动作按钮组 */}
      <div className="quick-actions-grid">
        {Object.entries(groupedActions).map(([category, actions]) => (
          <div key={category} className="action-group">
            {actions.map((qa) => (
              <button
                key={qa.id}
                className="quick-action-btn enhanced"
                onClick={() => handleQuickAction(qa.action)}
                disabled={isStreaming}
                title={qa.action}
              >
                <span className="qa-icon">{qa.icon}</span>
                <span className="qa-label">{qa.label}</span>
              </button>
            ))}
          </div>
        ))}
        <button
          className="quick-action-btn expand-toggle"
          onClick={() => setShowExpanded(!showExpanded)}
          disabled={isStreaming}
        >
          <span className="qa-icon">{showExpanded ? '▴' : '▾'}</span>
          <span className="qa-label">{showExpanded ? '收起' : '更多动作'}</span>
        </button>
      </div>

      {/* 自由输入框 */}
      <div className="dialogue-input-area enhanced">
        <div className="input-wrapper">
          <input
            ref={inputRef}
            className="dialogue-input enhanced"
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入消息... (Enter发送, ↑↓历史, Esc关闭)"
            disabled={isStreaming}
            maxLength={MAX_CHARS}
          />
          <span className="char-count">
            {inputValue.length}/{MAX_CHARS}
          </span>
        </div>
        <button
          className={`send-btn ${isSending ? 'sending' : ''}`}
          onClick={handleSend}
          disabled={isStreaming || !inputValue.trim()}
        >
          {isSending ? '✓' : '发送'}
        </button>
      </div>
    </div>
  )
}

export default EnhancedDialogueInput
