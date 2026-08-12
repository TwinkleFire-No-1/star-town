// 星火小镇 — NPC关系数据模型（CRUD + 事件系统）
// T3.6.1 关系表CRUD、关系变化事件
//
// 注：relationNetwork.ts 已处理NPC-NPC关系缓存与查询
// 本文件补充：关系CRUD REST API层、关系变化事件总线、玩家-NPC关系扩展

import { prisma } from '../models/prisma.js'
import { createLogger } from '../utils/index.js'
import type { RelationType } from '../types/npc-profile.js'

const logger = createLogger('RelationModel')

// =============================================
// 关系数据模型类型
// =============================================

/** 玩家-NPC关系数据 */
export interface PlayerRelationData {
  id: string
  playerId: string
  npcId: string
  affection: number
  trust: number
  reputation: number
  description: string
  createdAt: Date
  updatedAt: Date
}

/** NPC-NPC关系数据 */
export interface NpcRelationData {
  id: string
  sourceNpcId: string
  targetNpcId: string
  type: RelationType
  affection: number
  trust: number
  description: string
  createdAt: Date
  updatedAt: Date
}

/** 关系变化事件 */
export interface RelationChangeEvent {
  /** 事件ID */
  id: string
  /** 关系类型：玩家-NPC 还是 NPC-NPC */
  relationType: 'player_npc' | 'npc_npc'
  /** 源ID */
  sourceId: string
  /** 目标ID */
  targetId: string
  /** 变化前好感度 */
  beforeAffection: number
  /** 变化后好感度 */
  afterAffection: number
  /** 变化前信任度 */
  beforeTrust: number
  /** 变化后信任度 */
  afterTrust: number
  /** 变化原因 */
  reason: string
  /** 是否跨等级 */
  tierChanged: boolean
  /** 时间戳 */
  timestamp: number
}

// =============================================
// 关系事件总线
// =============================================

/** 关系事件监听器 */
type RelationEventListener = (event: RelationChangeEvent) => void

/**
 * RelationEventBus — 关系变化事件总线
 *
 * 功能：
 * 1. 发射关系变化事件
 * 2. 管理事件监听器（订阅/取消订阅）
 * 3. 保留最近事件历史
 */
class RelationEventBus {
  /** 监听器列表 */
  private listeners: RelationEventListener[] = []

  /** 事件历史（最近200条） */
  private eventHistory: RelationChangeEvent[] = []

  private readonly MAX_HISTORY = 200

  /**
   * 订阅关系变化事件
   */
  subscribe(listener: RelationEventListener): () => void {
    this.listeners.push(listener)
    logger.debug(`Listener subscribed, total: ${this.listeners.length}`)
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener)
      logger.debug(`Listener unsubscribed, total: ${this.listeners.length}`)
    }
  }

  /**
   * 发射关系变化事件
   */
  emit(event: RelationChangeEvent): void {
    // 记录历史
    this.eventHistory.push(event)
    if (this.eventHistory.length > this.MAX_HISTORY) {
      this.eventHistory = this.eventHistory.slice(-this.MAX_HISTORY)
    }

    // 通知监听器
    for (const listener of this.listeners) {
      try {
        listener(event)
      } catch (err) {
        logger.error(`Event listener error: ${(err as Error).message}`)
      }
    }

    if (event.tierChanged) {
      logger.info(
        `Relation tier changed: ${event.relationType} ${event.sourceId}→${event.targetId} ` +
        `affection ${event.beforeAffection}→${event.afterAffection}`,
      )
    }
  }

  /**
   * 获取事件历史
   */
  getHistory(sourceId?: string, targetId?: string, limit: number = 20): RelationChangeEvent[] {
    let result = this.eventHistory
    if (sourceId) result = result.filter((e) => e.sourceId === sourceId)
    if (targetId) result = result.filter((e) => e.targetId === targetId)
    return result.slice(-limit).reverse()
  }

  /**
   * 清空历史
   */
  clearHistory(): void {
    this.eventHistory = []
  }
}

/** 全局关系事件总线 */
export const relationEventBus = new RelationEventBus()

// =============================================
// 关系CRUD服务
// =============================================

/**
 * RelationCrudService — 关系表CRUD操作
 *
 * 统一管理玩家-NPC和NPC-NPC两类关系的数据库操作
 */
class RelationCrudService {
  // =============================================
  // 玩家-NPC关系 CRUD
  // =============================================

  /**
   * 获取玩家与NPC的关系
   */
  async getPlayerNpcRelation(playerId: string, npcId: string): Promise<PlayerRelationData | null> {
    const relation = await prisma.playerRelation.findUnique({
      where: { playerId_npcId: { playerId, npcId } },
    })
    return relation as PlayerRelationData | null
  }

  /**
   * 获取玩家所有NPC关系
   */
  async getPlayerAllRelations(playerId: string): Promise<PlayerRelationData[]> {
    const relations = await prisma.playerRelation.findMany({
      where: { playerId },
      orderBy: { affection: 'desc' },
    })
    return relations as PlayerRelationData[]
  }

  /**
   * 创建或更新玩家-NPC关系
   */
  async upsertPlayerNpcRelation(
    playerId: string,
    npcId: string,
    data: { affection?: number; trust?: number; reputation?: number; description?: string },
  ): Promise<PlayerRelationData> {
    const result = await prisma.playerRelation.upsert({
      where: { playerId_npcId: { playerId, npcId } },
      create: {
        playerId,
        npcId,
        affection: data.affection ?? 50,
        trust: data.trust ?? 50,
        reputation: data.reputation ?? 50,
        description: data.description ?? '',
      },
      update: {
        ...(data.affection !== undefined && { affection: Math.max(0, Math.min(100, data.affection)) }),
        ...(data.trust !== undefined && { trust: Math.max(0, Math.min(100, data.trust)) }),
        ...(data.reputation !== undefined && { reputation: Math.max(0, Math.min(100, data.reputation)) }),
        ...(data.description !== undefined && { description: data.description }),
      },
    })
    return result as PlayerRelationData
  }

  /**
   * 删除玩家-NPC关系
   */
  async deletePlayerNpcRelation(playerId: string, npcId: string): Promise<boolean> {
    try {
      await prisma.playerRelation.delete({
        where: { playerId_npcId: { playerId, npcId } },
      })
      return true
    } catch {
      return false
    }
  }

  // =============================================
  // NPC-NPC关系 CRUD
  // =============================================

  /**
   * 获取两个NPC之间的关系
   */
  async getNpcNpcRelation(sourceNpcId: string, targetNpcId: string): Promise<NpcRelationData | null> {
    const relation = await prisma.nPCRelation.findUnique({
      where: { sourceNpcId_targetNpcId: { sourceNpcId, targetNpcId } },
    })
    return relation as NpcRelationData | null
  }

  /**
   * 获取NPC的所有关系
   */
  async getNpcAllRelations(npcId: string): Promise<NpcRelationData[]> {
    const relations = await prisma.nPCRelation.findMany({
      where: { OR: [{ sourceNpcId: npcId }, { targetNpcId: npcId }] },
      orderBy: { affection: 'desc' },
    })
    return relations as NpcRelationData[]
  }

  /**
   * 创建或更新NPC-NPC关系
   */
  async upsertNpcNpcRelation(
    sourceNpcId: string,
    targetNpcId: string,
    data: { type?: RelationType; affection?: number; trust?: number; description?: string },
  ): Promise<NpcRelationData> {
    const result = await prisma.nPCRelation.upsert({
      where: { sourceNpcId_targetNpcId: { sourceNpcId, targetNpcId } },
      create: {
        sourceNpcId,
        targetNpcId,
        type: data.type ?? 'neutral',
        affection: data.affection ?? 50,
        trust: data.trust ?? 50,
        description: data.description ?? '',
      },
      update: {
        ...(data.type !== undefined && { type: data.type }),
        ...(data.affection !== undefined && { affection: Math.max(0, Math.min(100, data.affection)) }),
        ...(data.trust !== undefined && { trust: Math.max(0, Math.min(100, data.trust)) }),
        ...(data.description !== undefined && { description: data.description }),
      },
    })

    // 发射变化事件
    relationEventBus.emit({
      id: `evt_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      relationType: 'npc_npc',
      sourceId: sourceNpcId,
      targetId: targetNpcId,
      beforeAffection: 50, // 简化：实际应从旧值获取
      afterAffection: data.affection ?? 50,
      beforeTrust: 50,
      afterTrust: data.trust ?? 50,
      reason: data.description ?? 'NPC关系更新',
      tierChanged: false,
      timestamp: Date.now(),
    })

    return result as NpcRelationData
  }

  /**
   * 删除NPC-NPC关系
   */
  async deleteNpcNpcRelation(sourceNpcId: string, targetNpcId: string): Promise<boolean> {
    try {
      await prisma.nPCRelation.delete({
        where: { sourceNpcId_targetNpcId: { sourceNpcId, targetNpcId } },
      })
      return true
    } catch {
      return false
    }
  }

  /**
   * 批量获取NPC关系（用于初始化）
   */
  async batchGetNpcRelations(npcIds: string[]): Promise<NpcRelationData[]> {
    const relations = await prisma.nPCRelation.findMany({
      where: {
        OR: [
          { sourceNpcId: { in: npcIds } },
          { targetNpcId: { in: npcIds } },
        ],
      },
    })
    return relations as NpcRelationData[]
  }

  /**
   * 获取关系网络快照（用于调试和统计）
   */
  async getRelationSnapshot(): Promise<{
    playerRelations: number
    npcRelations: number
    avgPlayerAffection: number
    avgNpcAffection: number
  }> {
    const [playerRelations, npcRelations] = await Promise.all([
      prisma.playerRelation.count(),
      prisma.nPCRelation.count(),
    ])

    let avgPlayerAffection = 50
    let avgNpcAffection = 50

    if (playerRelations > 0) {
      const playerAgg = await prisma.playerRelation.aggregate({ _avg: { affection: true } })
      avgPlayerAffection = Math.round(playerAgg._avg.affection ?? 50)
    }

    if (npcRelations > 0) {
      const npcAgg = await prisma.nPCRelation.aggregate({ _avg: { affection: true } })
      avgNpcAffection = Math.round(npcAgg._avg.affection ?? 50)
    }

    return {
      playerRelations,
      npcRelations,
      avgPlayerAffection,
      avgNpcAffection,
    }
  }
}

/** 全局关系CRUD服务实例 */
export const relationCrudService = new RelationCrudService()
