// 星火小镇 — JRPG风格对话UI组件
// T2.4.4 对话框、像素头像、输入框
// T2.4.3 流式对话响应支持
// T4.3.1 JRPG对话框增强：底部对话框+像素头像+角色名+称号

import { useState, useEffect, useRef, useCallback } from 'react'
import { useGameStore } from '../stores/gameStore'
import { wsService } from '../services/websocket'
import { normalizeNpcAssetId, NPC_ASSET_BY_NAME } from '../game/entities/SpriteGenerator'
import './DialogueBox.css'

/**
 * 像素风头像生成器 — 根据名字生成不同配色的像素头像（fallback）
 */
function PixelAvatar({ name }: { name: string | null }) {
  if (!name) return <span className="avatar-letter">?</span>

  // 根据名字hash生成配色
  const hash = name.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
  const colors = [
    { bg: '#4a2a2a', fg: '#ff6b6b', accent: '#ff9999' },
    { bg: '#2a3a4a', fg: '#6bb6ff', accent: '#99ccff' },
    { bg: '#2a4a2a', fg: '#6bff6b', accent: '#99ff99' },
    { bg: '#4a4a2a', fg: '#e8a93c', accent: '#ffe066' },
    { bg: '#4a2a4a', fg: '#ff6bff', accent: '#ff99ff' },
    { bg: '#2a4a4a', fg: '#6bffff', accent: '#99ffff' },
  ]
  const color = colors[hash % colors.length]

  // 8x8 像素头像网格
  const grid = [
    [0,0,1,1,1,1,0,0],
    [0,1,2,2,2,2,1,0],
    [1,2,3,2,2,3,2,1],
    [1,2,2,2,2,2,2,1],
    [1,2,1,2,2,1,2,1],
    [0,1,2,2,2,2,1,0],
    [0,1,1,1,1,1,1,0],
    [0,0,1,0,0,1,0,0],
  ]

  const colorMap: Record<number, string> = {
    0: 'transparent',
    1: color.fg,
    2: color.bg,
    3: color.accent,
  }

  return (
    <div className="pixel-grid" style={{ width: 48, height: 48, display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gridTemplateRows: 'repeat(8, 1fr)', imageRendering: 'pixelated' }}>
      {grid.flat().map((cell, i) => (
        <div key={i} style={{ backgroundColor: colorMap[cell] }} />
      ))}
    </div>
  )
}

/**
 * T6.3.6: NPC ID → 立绘atlas帧索引映射
 * portraits-atlas.png 为 6行×2列 网格（48×48/帧），帧索引 = 行*2+列
 */
const NPC_PORTRAIT_MAP: Record<string, number> = {
  // 核心NPC
  margaret: 0,   // 玛格丽特
  old_buck: 1,   // 老巴克
  oldbuck: 1,
  ella: 2,       // 艾拉
  anvil: 3,      // 铁砧
  ironanvil: 3,
  toby: 4,       // 托比
  lily: 5,       // 莉莉
  // 次要NPC
  sylvia: 6,     // 西尔维娅
  marcus: 7,     // 马库斯
  rosie: 8,      // 罗西
  rossie: 8,
  pip: 9,        // 小皮普
  // 剧情NPC
  grom: 10,      // 格罗姆
  gromm: 10,
  silas: 11,     // 暗祭司塞拉斯
}

/** 立绘atlas尺寸（规范化后 96×288，每格48×48） */
const PORTRAIT_ATLAS_URL = 'assets/portraits/npc/portraits-atlas.png'
const PORTRAIT_COLS = 2
const PORTRAIT_GRID = 48

/**
 * 立绘组件 — 从 portraits-atlas.png 切取对应 NPC 立绘
 */
function PortraitAvatar({ npcId, npcName }: { npcId: string | null; npcName: string | null }) {
  // 兼容真实后端ID（npc-margaret / npc-ayla）与占位ID（margaret/old_buck/sc_xx）：
  // 依次尝试 原ID → 中文名映射（后端name）→ 规范化ID
  const idx = npcId
    ? (NPC_PORTRAIT_MAP[npcId]
       ?? NPC_PORTRAIT_MAP[NPC_ASSET_BY_NAME[npcName ?? ''] ?? '']
       ?? NPC_PORTRAIT_MAP[normalizeNpcAssetId(npcId)]
       ?? null)
    : null
  // 无映射时回退 hash 色块
  if (idx === null) {
    return <PixelAvatar name={npcName} />
  }

  const row = Math.floor(idx / PORTRAIT_COLS)
  const col = idx % PORTRAIT_COLS

  return (
    <div
      className="portrait-image"
      role="img"
      aria-label={npcName ?? 'NPC立绘'}
      style={{
        width: PORTRAIT_GRID,
        height: PORTRAIT_GRID,
        backgroundImage: `url(${PORTRAIT_ATLAS_URL})`,
        backgroundSize: `${PORTRAIT_GRID * PORTRAIT_COLS * 2}px ${PORTRAIT_GRID * 6 * 2}px`,
        backgroundPosition: `-${col * PORTRAIT_GRID * 2}px -${row * PORTRAIT_GRID * 2}px`,
        imageRendering: 'pixelated',
      }}
    />
  )
}

/**
 * DialogueBox — JRPG风格对话框组件
 *
 * 特性：
 * - 底部固定对话框，半透明像素风边框
 * - NPC像素头像 + 名字 + 称号
 * - 流式打字机效果（WebSocket chunk驱动）
 * - 文本输入框（玩家回复）
 * - 快捷动作按钮（打招呼/赞美/询问/告别）
 * - 按Enter或点击发送
 * - 流式接收中的加载指示器
 */
export function DialogueBox() {
  const interaction = useGameStore((s) => s.interaction)
  const player = useGameStore((s) => s.player)
  const [inputValue, setInputValue] = useState('')
  const [displayedText, setDisplayedText] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [showExpandedActions, setShowExpandedActions] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { isDialogOpen, dialogMessages, activeNPCId, activeNPCName, isStreaming, streamingMessage } = interaction

  // 流式消息实时显示 — 当 streamingMessage 更新时自动渲染
  useEffect(() => {
    if (isStreaming && streamingMessage) {
      setDisplayedText(streamingMessage.content)
      setIsTyping(true)
    } else {
      setIsTyping(false)
      setDisplayedText('')
    }
  }, [isStreaming, streamingMessage?.content])

  // 非流式NPC消息的打字机效果（兜底）
  useEffect(() => {
    if (isStreaming) return // 流式模式下由上面的effect处理

    if (dialogMessages.length === 0) return

    const lastMessage = dialogMessages[dialogMessages.length - 1]

    // 只对NPC消息做打字机效果
    if (lastMessage.speaker !== '系统' && lastMessage.speaker !== player.name) {
      const fullText = lastMessage.content
      setIsTyping(true)
      setDisplayedText('')

      let i = 0
      const typeChar = () => {
        if (i < fullText.length) {
          setDisplayedText(fullText.slice(0, i + 1))
          i++
          typingTimerRef.current = setTimeout(typeChar, 30)
        } else {
          setIsTyping(false)
        }
      }
      typingTimerRef.current = setTimeout(typeChar, 100)

      return () => {
        if (typingTimerRef.current) {
          clearTimeout(typingTimerRef.current)
        }
      }
    }
  }, [dialogMessages.length, isStreaming])

  // 自动滚动到最新消息
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [dialogMessages, streamingMessage?.content])

  // 对话框打开时聚焦输入框
  useEffect(() => {
    if (isDialogOpen) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [isDialogOpen])

  // 发送消息 — 使用新的 sendDialogue
  const handleSend = useCallback(() => {
    const trimmed = inputValue.trim()
    if (!trimmed || !activeNPCId || isStreaming) return

    // 添加玩家消息到对话
    useGameStore.getState().addDialogMessage(player.name, trimmed)

    // 通过WebSocket发送对话消息（替换旧的triggerNPCInteraction）
    wsService.sendDialogue(activeNPCId, trimmed)

    setInputValue('')
  }, [inputValue, activeNPCId, player.name, isStreaming])

  // 快捷动作
  const handleQuickAction = useCallback((action: string) => {
    if (!activeNPCId || isStreaming) return

    useGameStore.getState().addDialogMessage(player.name, action)
    wsService.sendDialogue(activeNPCId, action)
  }, [activeNPCId, player.name, isStreaming])

  // 关闭对话框
  const handleClose = useCallback(() => {
    if (activeNPCId) {
      wsService.closeDialogue(activeNPCId)
    }
    useGameStore.getState().clearDialog()
  }, [activeNPCId])

  // 键盘事件
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
    if (e.key === 'Escape') {
      handleClose()
    }
  }, [handleSend, handleClose])

  // NPC称号映射（根据NPC名称显示称号）
  const npcTitles: Record<string, string> = {
    '玛格丽特': '酒馆老板娘',
    '老巴克': '酒馆老板',
    '艾拉': '药草师',
    '铁砧': '铁匠大师',
    '托比': '吟游诗人',
    '莉莉': '花店少女',
    '西尔维娅': '图书管理员',
    '马库斯': '卫兵队长',
    '罗西': '磨坊主',
    '小皮普': '面包师学徒',
    '格罗姆': '隐居术士',
    '暗祭司塞拉斯': '暗影信徒',
    // 普通NPC（路人）
    '阿福': '赶集农夫',
    '翠花': '洗衣妇',
    '狗蛋': '顽皮孩童',
    '大牛': '搬运工',
    '桂花': '卖菜婆',
    '二丫': '面包学徒',
    '石头': '木匠',
    '胖婶': '茶馆主妇',
    '老杨': '鱼贩',
    '铁牛': '猎户',
  }

  const npcTitle = activeNPCName ? (npcTitles[activeNPCName] ?? '') : ''

  // 不渲染关闭状态的对话框
  if (!isDialogOpen) return null

  const quickActions = [
    { label: '打招呼', icon: '👋', action: '你好！' },
    { label: '赞美', icon: '✨', action: '你真厉害！' },
    { label: '询问', icon: '❓', action: '能告诉我一些事情吗？' },
    { label: '告别', icon: '🚪', action: '再见！' },
  ]

  const expandedActions = [
    { label: '威胁', icon: '⚠️', action: '你最好老实交代！' },
    { label: '赠礼', icon: '🎁', action: '这个送给你。' },
    { label: '闲聊', icon: '💬', action: '最近有什么新鲜事吗？' },
  ]

  const allActions = showExpandedActions ? [...quickActions, ...expandedActions] : quickActions

  // 合并已完成的消息 + 流式中的消息
  void [
    ...dialogMessages,
    ...(isStreaming && streamingMessage?.content ? [{ speaker: streamingMessage.speaker, content: '' }] : []),
  ]

  return (
    <div className="dialogue-overlay">
      <div className="dialogue-container">
        {/* NPC信息栏 */}
        <div className="dialogue-header">
          <div className="npc-avatar">
            <div className="pixel-avatar" data-npc={activeNPCId}>
              <PortraitAvatar npcId={activeNPCId} npcName={activeNPCName} />
            </div>
          </div>
          <div className="npc-info">
            <span className="npc-name">{activeNPCName ?? '???'}</span>
            {npcTitle && <span className="npc-title">{npcTitle}</span>}
            {isStreaming && <span className="streaming-indicator">思考中...</span>}
          </div>
          <button className="dialogue-close" onClick={handleClose} title="关闭 (Esc)">
            ×
          </button>
        </div>

        {/* 对话消息区域 */}
        <div className="dialogue-messages">
          {dialogMessages.map((msg, idx) => {
            const isPlayer = msg.speaker === player.name
            const isLastNpc = idx === dialogMessages.length - 1 && !isPlayer

            return (
              <div key={idx} className={`message-row ${isPlayer ? 'player' : 'npc'}`}>
                {!isPlayer && (
                  <div className="message-avatar-small">
                    <span>{msg.speaker[0]}</span>
                  </div>
                )}
                <div className="message-bubble">
                  {!isPlayer && <div className="message-speaker">{msg.speaker}</div>}
                  <div className="message-text">
                    {isLastNpc && isTyping ? displayedText : msg.content}
                    {isLastNpc && isTyping && <span className="typing-cursor">▎</span>}
                  </div>
                </div>
                {isPlayer && (
                  <div className="message-avatar-small player">
                    <span>{msg.speaker[0]}</span>
                  </div>
                )}
              </div>
            )
          })}

          {/* 流式消息 — 逐字显示 */}
          {isStreaming && streamingMessage && streamingMessage.content && (
            <div className="message-row npc">
              <div className="message-avatar-small">
                <span>{streamingMessage.speaker[0]}</span>
              </div>
              <div className="message-bubble">
                <div className="message-speaker">{streamingMessage.speaker}</div>
                <div className="message-text">
                  {streamingMessage.content}
                  <span className="typing-cursor">▎</span>
                </div>
              </div>
            </div>
          )}

          {/* 流式等待指示器 */}
          {isStreaming && (!streamingMessage || !streamingMessage.content) && (
            <div className="message-row npc">
              <div className="message-avatar-small">
                <span>{activeNPCName?.[0] ?? '?'}</span>
              </div>
              <div className="message-bubble">
                <div className="message-speaker">{activeNPCName ?? '???'}</div>
                <div className="message-text thinking-dots">
                  <span>.</span><span>.</span><span>.</span>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* 快捷动作 */}
        <div className="quick-actions">
          {allActions.map((qa) => (
            <button
              key={qa.label}
              className="quick-action-btn"
              onClick={() => handleQuickAction(qa.action)}
              disabled={isStreaming}
            >
              <span className="qa-icon">{qa.icon}</span>
              <span className="qa-label">{qa.label}</span>
            </button>
          ))}
          <button
            className="quick-action-btn expand-toggle"
            onClick={() => setShowExpandedActions(!showExpandedActions)}
            disabled={isStreaming}
            title={showExpandedActions ? '收起' : '更多动作'}
          >
            <span className="qa-icon">{showExpandedActions ? '▴' : '▾'}</span>
            <span className="qa-label">{showExpandedActions ? '收起' : '更多'}</span>
          </button>
        </div>

        {/* 输入区域 */}
        <div className="dialogue-input-area">
          <input
            ref={inputRef}
            className="dialogue-input"
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入消息... (Enter发送, Esc关闭)"
            disabled={isStreaming}
            maxLength={200}
          />
          <button
            className="send-btn"
            onClick={handleSend}
            disabled={isStreaming || !inputValue.trim()}
          >
            发送
          </button>
        </div>
      </div>
    </div>
  )
}

export default DialogueBox
