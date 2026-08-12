// 星火小镇 — NPC Perceive感知模块
// T2.3.1 环境状态获取、事件感知、记忆检索

import { createLogger } from '../utils/index.js'
import { prisma } from '../models/prisma.js'
import { profileLoader } from './profileLoader.js'
import { relationNetwork } from './relationNetwork.js'
import type {
  NPCProfile,
  NPCRuntimeState,
  ScheduleItem,
} from '../types/npc-profile.js'

const logger = createLogger('Perceive')

// =============================================
// 感知输入数据结构
// =============================================

/** 环境快照 — NPC可感知的全局环境信息 */
export interface EnvironmentSnapshot {
  /** 当前游戏小时 (0-23) */
  gameHour: number
  /** 当前游戏天数 */
  gameDay: number
  /** 当前区域 */
  currentArea: string
  /** 天气（预留） */
  weather: string
  /** 附近的实体列表 */
  nearbyEntities: NearbyEntity[]
  /** 最近的全局事件 */
  globalEvents: string[]
}

/** 附近实体 */
export interface NearbyEntity {
  /** 实体ID */
  id: string
  /** 实体类型 */
  type: 'player' | 'npc'
  /** 名字 */
  name: string
  /** 距离（像素距离，用于判断交互范围） */
  distance: number
  /** 是否在对话距离内 */
  inDialogueRange: boolean
}

// =============================================
// 感知输出数据结构
// =============================================

/** 感知结果 — NPC感知到的一切信息汇总 */
export interface PerceptionResult {
  /** NPC档案 */
  profile: NPCProfile
  /** 运行时状态 */
  runtimeState: NPCRuntimeState
  /** 当前环境 */
  environment: EnvironmentSnapshot
  /** 当前日程项 */
  currentSchedule: ScheduleItem | null
  /** 检索到的相关记忆 */
  relevantMemories: MemoryEntry[]
  /** 关系摘要 */
  relationSummary: string
  /** 感知摘要（用于Prompt注入的文本） */
  perceptionText: string
}

/** 记忆条目（简化版） */
export interface MemoryEntry {
  id: string
  type: string
  content: string
  importance: number
  createdAt: Date
}

/**
 * PerceiveModule — NPC感知模块
 *
 * 职责：
 * 1. 环境状态获取：收集NPC周围的实体、位置、时间等
 * 2. 事件感知：处理玩家接近、NPC对话、环境变化等事件
 * 3. 记忆检索：从数据库检索与当前情境相关的记忆
 * 4. 感知综合：将以上信息整合为PerceptionResult，供Think模块使用
 */
class PerceiveModule {
  /** 感知范围（像素距离） */
  private perceptionRange = 80

  /** 对话触发范围（像素距离） */
  private dialogueRange = 40

  /** 最大记忆检索数量 */
  private maxMemories = 10

  constructor() {
    logger.info('Perceive module initialized')
  }

  /**
   * 执行感知 — Agent循环入口
   * @param npcId - NPC ID
   * @param environment - 当前环境快照
   * @returns 感知结果
   */
  async perceive(npcId: string, environment: EnvironmentSnapshot): Promise<PerceptionResult> {
    // 1. 加载NPC档案
    const profile = profileLoader.getProfile(npcId)
    if (!profile) {
      throw new Error(`NPC profile not found: ${npcId}`)
    }

    // 2. 获取运行时状态
    const runtimeState = profileLoader.getRuntimeState(npcId)
    if (!runtimeState) {
      throw new Error(`NPC runtime state not found: ${npcId}`)
    }

    // 3. 获取当前日程
    const currentSchedule = profileLoader.getCurrentScheduleItem(npcId, environment.gameHour)

    // 4. 感知环境事件（更新运行时状态）
    this.processEnvironmentEvents(npcId, environment)

    // 5. 检索相关记忆
    const relevantMemories = await this.retrieveMemories(npcId)

    // 6. 构建关系摘要
    const relationSummary = await this.buildRelationSummary(npcId)

    // 7. 生成感知文本
    const perceptionText = this.buildPerceptionText(
      profile,
      runtimeState,
      environment,
      currentSchedule,
      relevantMemories,
      relationSummary,
    )

    return {
      profile,
      runtimeState,
      environment,
      currentSchedule,
      relevantMemories,
      relationSummary,
      perceptionText,
    }
  }

  /**
   * 处理环境事件 — 根据附近实体和全局事件生成感知事件
   */
  private processEnvironmentEvents(
    npcId: string,
    environment: EnvironmentSnapshot,
  ): void {
    const runtimeState = profileLoader.getRuntimeState(npcId)
    if (!runtimeState) return

    // 检测玩家接近
    for (const entity of environment.nearbyEntities) {
      if (entity.type === 'player' && entity.inDialogueRange) {
        const existingEvent = runtimeState.recentEvents.find(
          (e) => e.type === 'player_approach' && e.sourceId === entity.id && Date.now() - e.timestamp < 5000,
        )
        if (!existingEvent) {
          profileLoader.addPerceivedEvent(npcId, {
            type: 'player_approach',
            sourceId: entity.id,
            content: `冒险者${entity.name}靠近了你`,
            importance: 6,
          })
        }
      }

      // 检测NPC接近
      if (entity.type === 'npc' && entity.inDialogueRange && entity.id !== npcId) {
        const existingEvent = runtimeState.recentEvents.find(
          (e) => e.type === 'npc_dialogue' && e.sourceId === entity.id && Date.now() - e.timestamp < 5000,
        )
        if (!existingEvent) {
          profileLoader.addPerceivedEvent(npcId, {
            type: 'npc_dialogue',
            sourceId: entity.id,
            content: `${entity.name}在你附近`,
            importance: 4,
          })
        }
      }
    }

    // 处理全局事件
    for (const eventText of environment.globalEvents) {
      profileLoader.addPerceivedEvent(npcId, {
        type: 'environment_change',
        sourceId: 'world',
        content: eventText,
        importance: 5,
      })
    }

    // 时间事件 — 日程变化
    if (runtimeState.currentAction === 'idle' && environment.gameHour % 2 === 0) {
      const schedule = profileLoader.getCurrentScheduleItem(npcId, environment.gameHour)
      if (schedule && schedule.action !== runtimeState.currentAction) {
        profileLoader.addPerceivedEvent(npcId, {
          type: 'time_event',
          sourceId: 'clock',
          content: `现在是${environment.gameHour}点，按照日程应该：${schedule.action}（${schedule.location}）`,
          importance: 7,
        })
      }
    }
  }

  /**
   * 检索相关记忆
   */
  private async retrieveMemories(npcId: string): Promise<MemoryEntry[]> {
    try {
      const recentMemories = await prisma.nPCMemory.findMany({
        where: {
          npcId,
          archived: false,
        },
        orderBy: [
          { importance: 'desc' },
          { createdAt: 'desc' },
        ],
        take: this.maxMemories,
      })

      return recentMemories.map((m) => ({
        id: m.id,
        type: m.type,
        content: m.content,
        importance: m.importance,
        createdAt: m.createdAt,
      }))
    } catch (err) {
      logger.warn(`Failed to retrieve memories for ${npcId}: ${(err as Error).message}`)
      return []
    }
  }

  /**
   * 构建关系摘要（优先使用关系网络缓存，兜底查数据库）
   */
  private async buildRelationSummary(npcId: string): Promise<string> {
    try {
      // 优先使用关系网络缓存
      if (relationNetwork.isInitialized) {
        return relationNetwork.buildRelationSummary(npcId)
      }

      // 兜底：直接查数据库
      const relations = await prisma.nPCRelation.findMany({
        where: {
          OR: [
            { sourceNpcId: npcId },
            { targetNpcId: npcId },
          ],
        },
        take: 10,
      })

      if (relations.length === 0) return '（无特殊关系）'

      const summaries = relations.map((r) => {
        const isSource = r.sourceNpcId === npcId
        return `${isSource ? '→' : '←'} [${r.type}] 好感:${r.affection} 信任:${r.trust} - ${r.description}`
      })

      return summaries.join('\n')
    } catch {
      return '（关系数据不可用）'
    }
  }

  /**
   * 生成感知文本 — 将所有感知信息整合为可注入Prompt的文本
   */
  private buildPerceptionText(
    profile: NPCProfile,
    runtimeState: NPCRuntimeState,
    environment: EnvironmentSnapshot,
    currentSchedule: ScheduleItem | null,
    memories: MemoryEntry[],
    relationSummary: string,
  ): string {
    const lines: string[] = []

    lines.push(`【${profile.name}的感知】`)
    lines.push(`时间：第${environment.gameDay}天 ${environment.gameHour}:00`)
    lines.push(`位置：${currentSchedule?.location ?? '当前位置'}`)
    lines.push(`状态：${runtimeState.currentAction}`)
    lines.push(`心情：${profile.mood}`)

    if (environment.nearbyEntities.length > 0) {
      lines.push(`附近：${environment.nearbyEntities.map((e) => `${e.name}(${e.type})`).join('、')}`)
    }

    if (currentSchedule) {
      lines.push(`日程：${currentSchedule.action}（${currentSchedule.location}）`)
    }

    if (runtimeState.recentEvents.length > 0) {
      const recentEvents = runtimeState.recentEvents
        .filter((e) => Date.now() - e.timestamp < 30000)
        .slice(-5)
      if (recentEvents.length > 0) {
        lines.push('近期事件：')
        for (const event of recentEvents) {
          lines.push(`  - [${event.type}] ${event.content}`)
        }
      }
    }

    if (memories.length > 0) {
      lines.push('相关记忆：')
      for (const mem of memories.slice(0, 5)) {
        lines.push(`  - [${mem.type}] ${mem.content}`)
      }
    }

    if (relationSummary && relationSummary !== '（无特殊关系）') {
      lines.push(`关系：${relationSummary}`)
    }

    return lines.join('\n')
  }

  /**
   * 获取NPC附近的实体（从游戏状态中计算）
   * 辅助方法，供外部调用构建EnvironmentSnapshot
   */
  getNearbyEntities(
    npcX: number,
    npcY: number,
    allEntities: Array<{ id: string; type: 'player' | 'npc'; name: string; x: number; y: number }>,
  ): NearbyEntity[] {
    return allEntities
      .map((entity) => {
        const dx = entity.x - npcX
        const dy = entity.y - npcY
        const distance = Math.sqrt(dx * dx + dy * dy)
        return {
          id: entity.id,
          type: entity.type,
          name: entity.name,
          distance,
          inDialogueRange: distance <= this.dialogueRange,
        }
      })
      .filter((entity) => entity.distance <= this.perceptionRange)
      .sort((a, b) => a.distance - b.distance)
  }

  /**
   * 快速感知 — 只检查是否有玩家在对话范围内
   * 用于高频Tick的轻量级感知
   */
  quickPerceive(_npcId: string, environment: EnvironmentSnapshot): {
    hasPlayerNearby: boolean
    nearbyPlayerId: string | null
    nearbyPlayerName: string | null
  } {
    const nearbyPlayers = environment.nearbyEntities.filter(
      (e) => e.type === 'player' && e.inDialogueRange,
    )

    if (nearbyPlayers.length > 0) {
      return {
        hasPlayerNearby: true,
        nearbyPlayerId: nearbyPlayers[0].id,
        nearbyPlayerName: nearbyPlayers[0].name,
      }
    }

    return { hasPlayerNearby: false, nearbyPlayerId: null, nearbyPlayerName: null }
  }
}

/** 全局感知模块实例 */
export const perceiveModule = new PerceiveModule()
