// 星火小镇 — 玩家间对话面板（T6.17 在线玩家系统）
// 点击小镇中的其他在线用户（黄名）打开，用户之间可自由对话
// 样式复用 DialogueBox.css 的木质 JRPG 风格，消息即时双向透传（WebSocket player:chat）

import { useState, useEffect, useRef, useCallback } from 'react'
import { useGameStore } from '../stores/gameStore'
import { wsService } from '../services/websocket'
import './PlayerChatPanel.css'

/**
 * PlayerChatPanel — 玩家对玩家聊天面板
 *
 * 特性：
 * - 点击远程玩家触发打开（标题显示对方名字，黄色）
 * - 消息左右分栏：自己靠右（金色），对方靠左（木质）
 * - Enter 发送 / Esc 关闭
 * - 收到对方消息自动打开面板
 */
export function PlayerChatPanel() {
  const playerChat = useGameStore((s) => s.playerChat)
  const player = useGameStore((s) => s.player)
  const [inputValue, setInputValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const { isOpen, targetPlayerId, targetName, messages } = playerChat

  // 面板打开时聚焦输入框
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [isOpen])

  // 自动滚动到最新消息
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  // 发送消息
  const handleSend = useCallback(() => {
    const trimmed = inputValue.trim()
    if (!trimmed || !targetPlayerId) return

    // 本地立即显示自己发出的消息
    useGameStore.getState().addOwnPlayerChatMessage(trimmed)
    // 通过 WebSocket 转发给目标玩家
    wsService.sendPlayerChat(targetPlayerId, trimmed)

    setInputValue('')
  }, [inputValue, targetPlayerId])

  // 关闭面板
  const handleClose = useCallback(() => {
    useGameStore.getState().closePlayerChat()
  }, [])

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

  if (!isOpen || !targetPlayerId) return null

  return (
    <div className="dialogue-overlay player-chat-overlay">
      <div className="dialogue-container player-chat-container">
        {/* 头部：对方信息（黄色名字标识玩家） */}
        <div className="dialogue-header">
          <div className="npc-avatar">
            <div className="pixel-avatar player-chat-avatar">
              <span className="avatar-letter">👤</span>
            </div>
          </div>
          <div className="npc-info">
            <span className="npc-name player-chat-name">{targetName ?? '???'}</span>
            <span className="npc-title player-chat-title">在线玩家</span>
          </div>
          <button className="dialogue-close" onClick={handleClose} title="关闭 (Esc)">
            ×
          </button>
        </div>

        {/* 消息区域 */}
        <div className="dialogue-messages player-chat-messages">
          {messages.length === 0 && (
            <div className="player-chat-empty">与 {targetName} 打个招呼吧～</div>
          )}
          {messages.map((msg, idx) => {
            const isOwn = msg.fromPlayerId === player.id
            return (
              <div key={idx} className={`message-row player-chat-row ${isOwn ? 'own' : 'other'}`}>
                {!isOwn && (
                  <div className="message-avatar-small">
                    <span>{msg.fromName[0]}</span>
                  </div>
                )}
                <div className="message-bubble">
                  {!isOwn && <div className="message-speaker">{msg.fromName}</div>}
                  <div className="message-text">{msg.content}</div>
                </div>
                {isOwn && (
                  <div className="message-avatar-small player">
                    <span>{msg.fromName[0]}</span>
                  </div>
                )}
              </div>
            )
          })}
          <div ref={messagesEndRef} />
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
            placeholder={`对 ${targetName} 说... (Enter发送, Esc关闭)`}
            maxLength={200}
          />
          <button
            className="send-btn"
            onClick={handleSend}
            disabled={!inputValue.trim()}
          >
            发送
          </button>
        </div>
      </div>
    </div>
  )
}

export default PlayerChatPanel
