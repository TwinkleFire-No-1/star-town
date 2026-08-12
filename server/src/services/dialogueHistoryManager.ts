// 星火小镇 — 对话历史管理
// T2.4.2 最近5轮对话存储、上下文截断策略

import { createLogger } from '../utils/index.js'
import { profileLoader } from './profileLoader.js'
import type { ShortTermMemory } from '../types/npc-profile.js'

const logger = createLogger('DialogueHistory')

// =============================================
// 对话历史数据结构
// =============================================

/** 对话消息 */
export interface DialogueMessage {
  /** 角色（player/npc） */
  role: 'player' | 'npc'
  /** 说话者名字 */
  speaker: string
  /** 内容 */
  content: string
  /** 时间戳 */
  timestamp: number
}

/** 对话会话 — NPC与某个对象的一次完整对话 */
export interface DialogueSession {
  /** 会话ID */
  id: string
  /** NPC ID */
  npcId: string
  /** 对话对象ID（玩家或其他NPC） */
  partnerId: string
  /** 对话对象名字 */
  partnerName: string
  /** 对话消息列表 */
  messages: DialogueMessage[]
  /** 会话开始时间 */
  startedAt: number
  /** 最后活跃时间 */
  lastActiveAt: number
  /** 会话状态 */
  status: 'active' | 'closed' | 'expired'
  /** 对话轮次 */
  roundCount: number
}

/** 历史管理配置 */
export interface HistoryConfig {
  /** 最大对话轮数（默认5轮） */
  maxRounds: number
  /** 单条消息最大字符数（默认500） */
  maxMessageLength: number
  /** 会话超时时间（毫秒，默认5分钟） */
  sessionTimeout: number
  /** 最大会话存储数（每个NPC最多同时保存的会话数） */
  maxSessionsPerNpc: number
}

const DEFAULT_CONFIG: HistoryConfig = {
  maxRounds: 5,
  maxMessageLength: 500,
  sessionTimeout: 5 * 60 * 1000,
  maxSessionsPerNpc: 3,
}

/**
 * DialogueHistoryManager — 对话历史管理器
 *
 * 职责：
 * 1. 对话会话管理：创建/获取/关闭对话会话
 * 2. 消息追加：将对话消息添加到会话中
 * 3. 上下文截断：超过5轮时截断最早的消息
 * 4. 会话超时：超过5分钟无活跃则自动关闭
 * 5. 历史格式化：将对话历史格式化为Prompt可用的文本
 */
class DialogueHistoryManager {
  /** 活跃的对话会话 — key: `${npcId}:${partnerId}` */
  private sessions: Map<string, DialogueSession> = new Map()

  /** 已关闭的会话（归档） */
  private archivedSessions: Map<string, DialogueSession[]> = new Map()

  /** 配置 */
  private config: HistoryConfig

  constructor(config?: Partial<HistoryConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    logger.info(`Dialogue history manager initialized (maxRounds=${this.config.maxRounds})`)
  }

  /**
   * 获取或创建对话会话
   */
  getOrCreateSession(npcId: string, partnerId: string, partnerName: string): DialogueSession {
    const key = this.getSessionKey(npcId, partnerId)
    let session = this.sessions.get(key)

    // 检查会话是否存在且未过期
    if (session) {
      if (Date.now() - session.lastActiveAt > this.config.sessionTimeout) {
        // 会话超时，关闭并创建新的
        this.closeSession(npcId, partnerId)
        session = undefined
      }
    }

    if (!session) {
      session = {
        id: `session-${npcId}-${partnerId}-${Date.now()}`,
        npcId,
        partnerId,
        partnerName,
        messages: [],
        startedAt: Date.now(),
        lastActiveAt: Date.now(),
        status: 'active',
        roundCount: 0,
      }
      this.sessions.set(key, session)
      logger.info(`New dialogue session: ${npcId} ↔ ${partnerName}`)
    }

    return session
  }

  /**
   * 添加消息到对话会话
   */
  addMessage(
    npcId: string,
    partnerId: string,
    role: 'player' | 'npc',
    speaker: string,
    content: string,
  ): DialogueMessage {
    const session = this.getOrCreateSession(npcId, partnerId, speaker)

    // 截断消息内容
    const truncatedContent = this.truncateMessage(content)

    const message: DialogueMessage = {
      role,
      speaker,
      content: truncatedContent,
      timestamp: Date.now(),
    }

    session.messages.push(message)
    session.lastActiveAt = Date.now()

    // 更新轮次计数（一轮=玩家+NPC各一条）
    if (role === 'npc') {
      session.roundCount = Math.ceil(session.messages.length / 2)
    }

    // 截断策略：超过最大轮数时移除最早的消息
    if (session.messages.length > this.config.maxRounds * 2) {
      const removeCount = session.messages.length - this.config.maxRounds * 2
      session.messages = session.messages.slice(removeCount)
      logger.debug(`Truncated ${removeCount} messages from session ${session.id}`)
    }

    // 同步到ProfileLoader的短期记忆
    this.syncToProfileLoader(npcId, session)

    return message
  }

  /**
   * 获取对话历史文本 — 用于Prompt注入
   */
  getHistoryText(npcId: string, partnerId: string): string {
    const key = this.getSessionKey(npcId, partnerId)
    const session = this.sessions.get(key)

    if (!session || session.messages.length === 0) {
      return '（对话刚开始）'
    }

    return session.messages
      .map((msg) => {
        const label = msg.role === 'player' ? `冒险者${msg.speaker}` : msg.speaker
        return `${label}：${msg.content}`
      })
      .join('\n')
  }

  /**
   * 获取对话历史消息列表 — 用于LLM messages格式
   */
  getHistoryMessages(npcId: string, partnerId: string): DialogueMessage[] {
    const key = this.getSessionKey(npcId, partnerId)
    const session = this.sessions.get(key)

    if (!session) return []
    return [...session.messages]
  }

  /**
   * 关闭对话会话
   */
  closeSession(npcId: string, partnerId: string): void {
    const key = this.getSessionKey(npcId, partnerId)
    const session = this.sessions.get(key)

    if (session) {
      session.status = 'closed'
      this.archiveSession(npcId, session)
      this.sessions.delete(key)
      logger.info(`Dialogue session closed: ${npcId} ↔ ${session.partnerName} (${session.roundCount} rounds)`)
    }
  }

  /**
   * 检查会话是否活跃
   */
  isSessionActive(npcId: string, partnerId: string): boolean {
    const key = this.getSessionKey(npcId, partnerId)
    const session = this.sessions.get(key)

    if (!session || session.status !== 'active') return false

    // 检查超时
    if (Date.now() - session.lastActiveAt > this.config.sessionTimeout) {
      this.closeSession(npcId, partnerId)
      return false
    }

    return true
  }

  /**
   * 获取NPC当前对话的伙伴ID
   */
  getCurrentPartnerId(npcId: string): string | null {
    for (const [_key, session] of this.sessions) {
      if (session.npcId === npcId && session.status === 'active') {
        return session.partnerId
      }
    }
    return null
  }

  /**
   * 清理所有过期会话 — 定期调用
   */
  cleanupExpiredSessions(): number {
    let cleaned = 0

    for (const [_key, session] of this.sessions) {
      if (Date.now() - session.lastActiveAt > this.config.sessionTimeout) {
        this.closeSession(session.npcId, session.partnerId)
        cleaned++
      }
    }

    if (cleaned > 0) {
      logger.info(`Cleaned up ${cleaned} expired dialogue sessions`)
    }

    return cleaned
  }

  /**
   * 获取NPC的活跃会话数
   */
  getActiveSessionCount(npcId: string): number {
    let count = 0
    for (const session of this.sessions.values()) {
      if (session.npcId === npcId && session.status === 'active') {
        count++
      }
    }
    return count
  }

  /**
   * 获取会话统计
   */
  getStats(): { activeSessions: number; archivedSessions: number; totalMessages: number } {
    let totalMessages = 0
    for (const session of this.sessions.values()) {
      totalMessages += session.messages.length
    }

    let archivedCount = 0
    for (const sessions of this.archivedSessions.values()) {
      archivedCount += sessions.length
    }

    return {
      activeSessions: this.sessions.size,
      archivedSessions: archivedCount,
      totalMessages,
    }
  }

  // =============================================
  // 私有方法
  // =============================================

  /**
   * 生成会话Key
   */
  private getSessionKey(npcId: string, partnerId: string): string {
    return `${npcId}:${partnerId}`
  }

  /**
   * 截断单条消息
   */
  private truncateMessage(content: string): string {
    if (content.length <= this.config.maxMessageLength) return content
    return content.slice(0, this.config.maxMessageLength) + '...'
  }

  /**
   * 归档会话
   */
  private archiveSession(npcId: string, session: DialogueSession): void {
    const archived = this.archivedSessions.get(npcId) ?? []
    archived.push(session)

    // 每个NPC最多保留 maxSessionsPerNpc 个归档会话
    if (archived.length > this.config.maxSessionsPerNpc) {
      archived.shift()
    }

    this.archivedSessions.set(npcId, archived)
  }

  /**
   * 同步对话历史到ProfileLoader的短期记忆
   */
  private syncToProfileLoader(npcId: string, session: DialogueSession): void {
    // 将最近的对话同步到NPCRuntimeState的shortTermMemory
    const recentMessages = session.messages.slice(-10) // 最近5轮=10条消息
    const shortTermMemories: ShortTermMemory[] = recentMessages.map((msg) => ({
      role: msg.role === 'player' ? 'player' : 'npc',
      speaker: msg.speaker,
      content: msg.content,
      timestamp: msg.timestamp,
    }))

    profileLoader.updateRuntimeState(npcId, {
      shortTermMemory: shortTermMemories,
      talkingTo: session.partnerId,
    })
  }
}

/** 全局对话历史管理器实例 */
export const dialogueHistoryManager = new DialogueHistoryManager()
