// 星火小镇 — NPC 记忆更新模块
// T2.3.4 交互记录、关系更新、关键信息提取

import { createLogger } from '../utils/index.js'
import { prisma } from '../models/prisma.js'
import type { MemoryType } from '../types/npc-profile.js'
import type { ActResult } from './actModule.js'
import type { PerceptionResult } from './perceiveModule.js'

const logger = createLogger('MemoryUpdate')

// =============================================
// 记忆更新输入/输出数据结构
// =============================================

/** 记忆更新触发类型 */
export type MemoryUpdateTrigger =
  | 'dialogue_end'      // 对话结束
  | 'action_complete'   // 行动完成
  | 'observation'       // 环境观察
  | 'relationship'      // 关系变化
  | 'reflection'        // 反思生成

/** 记忆更新请求 */
export interface MemoryUpdateRequest {
  /** NPC ID */
  npcId: string
  /** 触发类型 */
  trigger: MemoryUpdateTrigger
  /** 记忆内容 */
  content: string
  /** 记忆类型 */
  memoryType: MemoryType
  /** 重要度 (1-10) */
  importance: number
  /** 上下文信息 */
  context?: Record<string, unknown>
  /** 是否立即嵌入向量 */
  embedNow?: boolean
}

/** 记忆更新结果 */
export interface MemoryUpdateResult {
  /** 创建的记忆ID */
  memoryId: string
  /** NPC ID */
  npcId: string
  /** 记忆类型 */
  type: MemoryType
  /** 重要度 */
  importance: number
  /** 是否触发了关系更新 */
  relationUpdated: boolean
  /** 关系变化描述（如果有的话） */
  relationChange?: string
  /** 关键信息提取结果 */
  keyInfo?: string[]
}

/** 关系更新结果 */
export interface RelationUpdateResult {
  /** 关系ID */
  relationId: string
  /** 源NPC */
  sourceNpcId: string
  /** 目标NPC/玩家 */
  targetId: string
  /** 好感度变化 */
  affectionDelta: number
  /** 信任度变化 */
  trustDelta: number
  /** 更新描述 */
  description: string
}

/**
 * MemoryUpdateModule — 记忆更新模块
 *
 * 职责：
 * 1. 交互记录：对话结束/行动完成时写入NPC记忆
 * 2. 关系更新：根据交互内容调整好感度和信任度
 * 3. 关键信息提取：从对话/观察中提取重要信息
 * 4. 记忆去重：避免重复写入相似记忆
 * 5. 容量管理：维护500条记忆上限
 */
class MemoryUpdateModule {
  /** 记忆去重窗口（秒） — 相同类型30秒内不重复写入 */
  private dedupWindowMs = 30000

  /** 最近写入的记忆指纹（用于去重） */
  private recentMemoryFingerprints: Map<string, { fingerprint: string; timestamp: number }[]> = new Map()

  /** 好感度单次最大变化量 */
  private maxAffectionDelta = 15

  /** 信任度单次最大变化量 */
  private maxTrustDelta = 10

  constructor() {
    logger.info('Memory update module initialized')
  }

  /**
   * 记忆更新主入口 — 从行动结果触发
   * @param actResult - 行动模块的输出
   * @param perception - 感知结果
   */
  async updateFromAction(actResult: ActResult, _perception: PerceptionResult): Promise<MemoryUpdateResult[]> {
    const results: MemoryUpdateResult[] = []

    switch (actResult.actionType) {
      case 'dialogue':
      case 'social': {
        // 对话结束 → 记录对话记忆 + 更新关系
        if (actResult.dialogueContent && actResult.targetId) {
          const dialogueMem = await this.writeMemory({
            npcId: actResult.npcId,
            trigger: 'dialogue_end',
            content: `与${actResult.description}：${actResult.dialogueContent.substring(0, 200)}`,
            memoryType: 'dialogue',
            importance: actResult.actionType === 'dialogue' ? 7 : 5,
            context: {
              targetId: actResult.targetId,
              dialogueType: actResult.actionType,
            },
          })
          results.push(dialogueMem)

          // 更新关系
          if (actResult.targetId) {
            const relationResult = await this.updateRelationFromDialogue(
              actResult.npcId,
              actResult.targetId,
              actResult.dialogueContent,
              actResult.actionType === 'dialogue' ? 'player' : 'npc',
            )
            if (relationResult) {
              dialogueMem.relationUpdated = true
              dialogueMem.relationChange = relationResult.description
            }
          }
        }
        break
      }

      case 'move': {
        // 移动 → 记录位置变化观察
        const moveMem = await this.writeMemory({
          npcId: actResult.npcId,
          trigger: 'action_complete',
          content: `前往${actResult.targetLocation ?? '新位置'}`,
          memoryType: 'observation',
          importance: 2,
          context: { targetLocation: actResult.targetLocation },
        })
        results.push(moveMem)
        break
      }

      case 'schedule': {
        // 日程执行 → 低重要性记录
        const scheduleMem = await this.writeMemory({
          npcId: actResult.npcId,
          trigger: 'action_complete',
          content: `按日程执行：${actResult.description}`,
          memoryType: 'observation',
          importance: 3,
          context: { scheduleAction: actResult.description },
        })
        results.push(scheduleMem)
        break
      }

      default:
        // idle/continue/work — 不记录
        break
    }

    return results
  }

  /**
   * 记录对话交互 — 供WebSocket直接调用
   * @param npcId - NPC ID
   * @param partnerId - 对话对象ID
   * @param partnerName - 对话对象名字
   * @param playerMessage - 玩家消息
   * @param npcResponse - NPC回复
   * @param partnerType - 对话对象类型
   */
  async recordDialogue(
    npcId: string,
    partnerId: string,
    partnerName: string,
    playerMessage: string,
    npcResponse: string,
    partnerType: 'player' | 'npc' = 'player',
  ): Promise<MemoryUpdateResult> {
    // 写入对话记忆
    const content = `${partnerName}说："${playerMessage.substring(0, 100)}"，我回答："${npcResponse.substring(0, 100)}"`
    const result = await this.writeMemory({
      npcId,
      trigger: 'dialogue_end',
      content,
      memoryType: 'dialogue',
      importance: partnerType === 'player' ? 7 : 5,
      context: { partnerId, partnerName, partnerType, playerMessage, npcResponse },
    })

    // 提取关键信息
    const keyInfo = await this.extractKeyInformation(playerMessage, npcResponse)
    result.keyInfo = keyInfo

    // 如果有关键信息，追加观察记忆
    if (keyInfo.length > 0) {
      await this.writeMemory({
        npcId,
        trigger: 'observation',
        content: `从对话中了解到：${keyInfo.join('；')}`,
        memoryType: 'observation',
        importance: 8,
        context: { source: 'dialogue_extraction', partnerName },
      })
    }

    // 更新关系
    const relationResult = await this.updateRelationFromDialogue(
      npcId,
      partnerId,
      `${playerMessage} | ${npcResponse}`,
      partnerType,
    )
    if (relationResult) {
      result.relationUpdated = true
      result.relationChange = relationResult.description
    }

    return result
  }

  /**
   * 写入记忆 — 核心方法
   */
  async writeMemory(request: MemoryUpdateRequest): Promise<MemoryUpdateResult> {
    const { npcId, content, memoryType, importance, context } = request

    // 去重检查
    if (this.isDuplicate(npcId, memoryType, content)) {
      logger.debug(`[${npcId}] Duplicate memory skipped: ${content.substring(0, 50)}`)
      return {
        memoryId: '',
        npcId,
        type: memoryType,
        importance,
        relationUpdated: false,
      }
    }

    try {
      // 容量管理 — 检查500条上限
      const count = await prisma.nPCMemory.count({
        where: { npcId, archived: false },
      })

      if (count >= 500) {
        // 归档最低重要性的记忆
        const toArchive = await prisma.nPCMemory.findFirst({
          where: { npcId, archived: false },
          orderBy: [{ importance: 'asc' }, { accessedAt: 'asc' }],
        })
        if (toArchive) {
          await prisma.nPCMemory.update({
            where: { id: toArchive.id },
            data: { archived: true },
          })
          logger.debug(`[${npcId}] Archived low-importance memory: ${toArchive.id}`)
        }
      }

      const memory = await prisma.nPCMemory.create({
        data: {
          npcId,
          type: memoryType,
          content,
          importance,
          context: context as any ?? {},
          // embedding 由嵌入服务异步处理，Prisma不支持Unsupported类型的直接赋值
        } as any,
      })

      // 记录指纹用于去重
      this.recordFingerprint(npcId, memoryType, content)

      logger.debug(`[${npcId}] Memory written: [${memoryType}] ${content.substring(0, 50)}... (importance=${importance})`)

      return {
        memoryId: memory.id,
        npcId,
        type: memoryType,
        importance,
        relationUpdated: false,
      }
    } catch (err) {
      logger.error(`[${npcId}] Failed to write memory: ${(err as Error).message}`)
      return {
        memoryId: '',
        npcId,
        type: memoryType,
        importance,
        relationUpdated: false,
      }
    }
  }

  // =============================================
  // 关系更新
  // =============================================

  /**
   * 根据对话内容更新关系
   */
  async updateRelationFromDialogue(
    npcId: string,
    targetId: string,
    dialogueContent: string,
    targetType: 'player' | 'npc',
  ): Promise<RelationUpdateResult | null> {
    try {
      // 分析对话情感倾向
      const sentiment = this.analyzeSentiment(dialogueContent)

      // 计算好感度和信任度变化
      let affectionDelta = 0
      let trustDelta = 0

      switch (sentiment) {
        case 'positive':
          affectionDelta = Math.floor(Math.random() * 3) + 1  // +1~3
          trustDelta = Math.floor(Math.random() * 2) + 1       // +1~2
          break
        case 'negative':
          affectionDelta = -(Math.floor(Math.random() * 3) + 1) // -1~3
          trustDelta = -(Math.floor(Math.random() * 2) + 1)     // -1~2
          break
        case 'neutral':
        default:
          // 中性对话：微幅增加（表示熟悉度提升）
          affectionDelta = Math.random() < 0.5 ? 1 : 0
          trustDelta = 0
          break
      }

      // 限制单次变化量
      affectionDelta = Math.max(-this.maxAffectionDelta, Math.min(this.maxAffectionDelta, affectionDelta))
      trustDelta = Math.max(-this.maxTrustDelta, Math.min(this.maxTrustDelta, trustDelta))

      if (affectionDelta === 0 && trustDelta === 0) return null

      if (targetType === 'npc') {
        // NPC间关系
        return this.updateNPCRelation(npcId, targetId, affectionDelta, trustDelta, dialogueContent)
      } else {
        // 玩家-NPC关系
        return this.updatePlayerRelation(npcId, targetId, affectionDelta, trustDelta)
      }
    } catch (err) {
      logger.warn(`[${npcId}] Relation update failed: ${(err as Error).message}`)
      return null
    }
  }

  /**
   * 更新NPC间关系
   */
  private async updateNPCRelation(
    sourceNpcId: string,
    targetNpcId: string,
    affectionDelta: number,
    trustDelta: number,
    reason: string,
  ): Promise<RelationUpdateResult | null> {
    // 查找或创建关系
    let relation = await prisma.nPCRelation.findUnique({
      where: {
        sourceNpcId_targetNpcId: {
          sourceNpcId,
          targetNpcId,
        },
      },
    })

    if (!relation) {
      // 创建新关系
      relation = await prisma.nPCRelation.create({
        data: {
          sourceNpcId,
          targetNpcId,
          affection: 50 + affectionDelta,
          trust: 50 + trustDelta,
          description: reason.substring(0, 200),
        },
      })
    } else {
      // 更新现有关系
      const newAffection = Math.max(0, Math.min(100, relation.affection + affectionDelta))
      const newTrust = Math.max(0, Math.min(100, relation.trust + trustDelta))

      relation = await prisma.nPCRelation.update({
        where: { id: relation.id },
        data: {
          affection: newAffection,
          trust: newTrust,
          description: reason.substring(0, 200),
        },
      })
    }

    return {
      relationId: relation.id,
      sourceNpcId,
      targetId: targetNpcId,
      affectionDelta,
      trustDelta,
      description: `好感${affectionDelta > 0 ? '+' : ''}${affectionDelta} 信任${trustDelta > 0 ? '+' : ''}${trustDelta}`,
    }
  }

  /**
   * 更新玩家-NPC关系
   */
  private async updatePlayerRelation(
    npcId: string,
    playerId: string,
    affectionDelta: number,
    trustDelta: number,
  ): Promise<RelationUpdateResult | null> {
    try {
      // 查找玩家记录
      let player = await prisma.player.findFirst({ where: { id: playerId } })
      if (!player) {
        // 尝试按socket ID查找
        player = await prisma.player.findFirst()
        if (!player) return null
      }

      const relation = await prisma.playerRelation.upsert({
        where: {
          playerId_npcId: {
            playerId: player.id,
            npcId,
          },
        },
        create: {
          playerId: player.id,
          npcId,
          affection: 50 + affectionDelta,
          trust: 50 + trustDelta,
        },
        update: {
          affection: { increment: affectionDelta },
          trust: { increment: trustDelta },
        },
      })

      return {
        relationId: relation.id,
        sourceNpcId: npcId,
        targetId: player.id,
        affectionDelta,
        trustDelta,
        description: `好感${affectionDelta > 0 ? '+' : ''}${affectionDelta} 信任${trustDelta > 0 ? '+' : ''}${trustDelta}`,
      }
    } catch {
      return null
    }
  }

  // =============================================
  // 关键信息提取
  // =============================================

  /**
   * 从对话中提取关键信息
   * 使用规则引擎进行轻量级提取，避免每次调用LLM
   */
  async extractKeyInformation(playerMessage: string, _npcResponse: string): Promise<string[]> {
    const keyInfo: string[] = []

    // 规则1：提取玩家透露的名字
    const nameMatch = playerMessage.match(/(?:我叫|我的名字是|我是)([^\s，。！？]{2,8})/)
    if (nameMatch) {
      keyInfo.push(`对方名叫${nameMatch[1]}`)
    }

    // 规则2：提取地点信息
    const locationKeywords = ['森林', '洞穴', '神殿', '废墟', '宝箱', '秘密', '藏宝']
    for (const kw of locationKeywords) {
      if (playerMessage.includes(kw)) {
        keyInfo.push(`对方提到了"${kw}"`)
        break
      }
    }

    // 规则3：提取任务相关关键词
    const questKeywords = ['任务', '委托', '帮忙', '寻找', '收集', '击败', '护送']
    for (const kw of questKeywords) {
      if (playerMessage.includes(kw)) {
        keyInfo.push(`对方提到了"${kw}"相关的事`)
        break
      }
    }

    // 规则4：提取情绪表达
    const emotionMap: Record<string, string> = {
      '谢谢': '对方表达了感谢',
      '对不起': '对方表示了歉意',
      '再见': '对方准备离开',
      '帮忙': '对方请求帮助',
      '危险': '对方提到了危险',
    }
    for (const [keyword, info] of Object.entries(emotionMap)) {
      if (playerMessage.includes(keyword)) {
        keyInfo.push(info)
      }
    }

    return keyInfo
  }

  // =============================================
  // 去重逻辑
  // =============================================

  /**
   * 检查是否为重复记忆
   */
  private isDuplicate(npcId: string, type: MemoryType, content: string): boolean {
    const entries = this.recentMemoryFingerprints.get(npcId)
    if (!entries) return false

    const fingerprint = this.computeFingerprint(type, content)
    const now = Date.now()

    return entries.some(
      (e) => e.fingerprint === fingerprint && now - e.timestamp < this.dedupWindowMs,
    )
  }

  /**
   * 记录记忆指纹
   */
  private recordFingerprint(npcId: string, type: MemoryType, content: string): void {
    if (!this.recentMemoryFingerprints.has(npcId)) {
      this.recentMemoryFingerprints.set(npcId, [])
    }

    const entries = this.recentMemoryFingerprints.get(npcId)!
    entries.push({
      fingerprint: this.computeFingerprint(type, content),
      timestamp: Date.now(),
    })

    // 只保留最近50条指纹
    if (entries.length > 50) {
      entries.splice(0, entries.length - 50)
    }
  }

  /**
   * 计算记忆指纹（简化版：类型+内容前50字符）
   */
  private computeFingerprint(type: MemoryType, content: string): string {
    return `${type}:${content.substring(0, 50)}`
  }

  // =============================================
  // 情感分析（规则引擎，非LLM）
  // =============================================

  /**
   * 简单情感分析 — 基于关键词
   */
  private analyzeSentiment(text: string): 'positive' | 'negative' | 'neutral' {
    const positiveWords = ['谢谢', '感谢', '喜欢', '开心', '棒', '厉害', '好', '帮', '朋友', '信任', '赞美', '你好', '礼物']
    const negativeWords = ['讨厌', '恨', '生气', '愤怒', '坏', '恶', '骗', '威胁', '滚', '笨', '蠢', '不行', '拒绝']

    let positiveScore = 0
    let negativeScore = 0

    for (const word of positiveWords) {
      if (text.includes(word)) positiveScore++
    }

    for (const word of negativeWords) {
      if (text.includes(word)) negativeScore++
    }

    if (positiveScore > negativeScore) return 'positive'
    if (negativeScore > positiveScore) return 'negative'
    return 'neutral'
  }

  /**
   * 清理过期指纹
   */
  cleanupExpiredFingerprints(): void {
    const now = Date.now()
    for (const [npcId, entries] of this.recentMemoryFingerprints) {
      const filtered = entries.filter((e) => now - e.timestamp < this.dedupWindowMs)
      if (filtered.length === 0) {
        this.recentMemoryFingerprints.delete(npcId)
      } else {
        this.recentMemoryFingerprints.set(npcId, filtered)
      }
    }
  }
}

/** 全局记忆更新模块实例 */
export const memoryUpdateModule = new MemoryUpdateModule()
