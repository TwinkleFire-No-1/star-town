// 星火小镇 — 任务引擎
// T3.2.2 任务发现→激活→进度追踪→完成/失败

import { createLogger } from '../utils/index.js'
import { prisma } from '../models/prisma.js'
import { gameClock } from './gameClock.js'
import {
  type QuestDefinition,
  type QuestType,
  type QuestStatus,
  type PlayerQuestProgress,
  type QuestObjective,
  type QuestCondition,
  type QuestEvent,
  type QuestEventType,
  canTransition,
  isObjectiveComplete,
  areAllRequiredObjectivesComplete,
  getQuestProgressPercent,
  updateObjectiveProgress,
} from './questTypes.js'

const logger = createLogger('QuestEngine')

// =============================================
// 任务引擎配置
// =============================================

export interface QuestEngineConfig {
  /** 是否自动检查可触发任务 */
  autoDiscover: boolean
  /** 检查间隔（游戏小时） */
  checkIntervalHours: number
  /** 是否自动完成满足条件的任务 */
  autoComplete: boolean
  /** 是否自动失败超时任务 */
  autoFailTimeout: boolean
}

// =============================================
// 事件回调类型
// =============================================

type QuestEventCallback = (event: QuestEvent) => void

// =============================================
// 内存任务定义缓存
// =============================================

/** 任务定义缓存（从数据库加载后缓存） */
const questDefinitions = new Map<string, QuestDefinition>()

// =============================================
// 任务引擎
// =============================================

/**
 * QuestEngine — 任务引擎
 *
 * 职责：
 * 1. 从数据库加载任务定义到内存缓存
 * 2. 任务发现：检查前置条件，将 locked → available
 * 3. 任务激活：玩家接受任务，available → active
 * 4. 进度追踪：监听游戏事件，更新任务目标进度
 * 5. 完成判定：检查所有目标完成，active → completed
 * 6. 失败判定：检查失败条件和超时，active → failed
 * 7. 任务事件广播：状态变化时通知客户端
 */
class QuestEngine {
  /** 配置 */
  private config: QuestEngineConfig = {
    autoDiscover: true,
    checkIntervalHours: 1,
    autoComplete: true,
    autoFailTimeout: true,
  }

  /** 是否已初始化 */
  private initialized = false

  /** Socket.IO 实例 */
  private io: any = null

  /** 事件监听器 */
  private listeners: Map<QuestEventType, Set<QuestEventCallback>> = new Map()

  /** 上次检查的小时 */
  private lastCheckHour = -1

  // =============================================
  // 初始化
  // =============================================

  /**
   * 初始化任务引擎
   */
  async initialize(config?: Partial<QuestEngineConfig>): Promise<void> {
    if (this.initialized) {
      logger.warn('QuestEngine already initialized')
      return
    }

    if (config) {
      this.config = { ...this.config, ...config }
    }

    // 从数据库加载所有任务定义
    await this.loadQuestDefinitions()

    // 注册时钟事件
    this.registerClockListeners()

    this.initialized = true
    logger.info(`QuestEngine initialized: ${questDefinitions.size} quests loaded`)
  }

  /**
   * 从数据库加载任务定义
   */
  private async loadQuestDefinitions(): Promise<void> {
    try {
      const quests = await prisma.quest.findMany()
      questDefinitions.clear()

      for (const quest of quests) {
        const definition = this.parseQuestDefinition(quest)
        if (definition) {
          questDefinitions.set(definition.id, definition)
        }
      }

      logger.info(`Loaded ${questDefinitions.size} quest definitions from database`)
    } catch (err) {
      logger.error(`Failed to load quest definitions: ${(err as Error).message}`)
    }
  }

  /**
   * 将数据库记录转换为任务定义
   */
  private parseQuestDefinition(quest: any): QuestDefinition | null {
    try {
      const triggerCond = quest.triggerCond as any
      const completeCond = quest.completeCond as any

      return {
        id: quest.id,
        title: quest.title,
        description: quest.description,
        type: (quest.type as QuestType) ?? 'side',
        chapter: quest.chapter ?? 0,
        giverNpcId: triggerCond?.giverNpcId,
        trigger: {
          type: triggerCond?.triggerType ?? 'manual',
          targetId: triggerCond?.targetId,
          params: triggerCond?.params,
          conditions: triggerCond?.conditions,
        },
        prerequisites: triggerCond?.prerequisites ?? (quest.prerequisiteId ? [quest.prerequisiteId] : []),
        objectives: (completeCond?.objectives as QuestObjective[]) ?? [
          {
            id: 'default',
            description: quest.description || '完成任务',
            type: 'custom',
            requiredCount: 1,
            currentCount: 0,
            optional: false,
          },
        ],
        completeConditions: completeCond?.conditions,
        failConditions: completeCond?.failConditions,
        reward: {
          exp: quest.rewardExp ?? 0,
          coins: quest.rewardCoins ?? 0,
          items: (quest.rewardItems as any[]) ?? [],
        },
        repeatable: triggerCond?.repeatable ?? false,
        timeLimit: triggerCond?.timeLimit ?? 0,
        suggestedLevel: triggerCond?.suggestedLevel ?? 1,
        autoAccept: triggerCond?.autoAccept ?? false,
        canRetry: triggerCond?.canRetry ?? true,
      }
    } catch (err) {
      logger.error(`Failed to parse quest ${quest.id}: ${(err as Error).message}`)
      return null
    }
  }

  /**
   * 设置 Socket.IO
   */
  setIo(io: any): void {
    this.io = io
  }

  /**
   * 注册任务定义到内存缓存（用于涌现任务等动态生成的任务）
   */
  registerDefinition(definition: QuestDefinition): void {
    questDefinitions.set(definition.id, definition)
    logger.info(`Registered quest definition: ${definition.id} (${definition.title})`)
  }

  /**
   * 注册时钟监听
   */
  private registerClockListeners(): void {
    gameClock.on('hour_change', () => {
      this.onHourChange().catch((err) =>
        logger.error(`Hour change check failed: ${(err as Error).message}`),
      )
    })
  }

  // =============================================
  // 核心逻辑
  // =============================================

  /**
   * 每小时检查
   */
  private async onHourChange(): Promise<void> {
    const currentHour = gameClock.getGameHour()
    if (currentHour === this.lastCheckHour) return
    this.lastCheckHour = currentHour

    if (this.config.autoDiscover) {
      await this.discoverAvailableQuests()
    }

    if (this.config.autoFailTimeout) {
      await this.checkTimeoutQuests()
    }
  }

  /**
   * 任务发现 — 检查所有 locked 任务的触发条件
   */
  async discoverAvailableQuests(playerId?: string): Promise<string[]> {
    const newlyAvailable: string[] = []

    for (const [questId, definition] of questDefinitions) {
      // 跳过自动接受的任务（由 trigger 逻辑处理）
      if (definition.autoAccept) continue

      // 如果指定了玩家，只检查该玩家的任务
      if (playerId) {
        const progress = await this.getPlayerQuestProgress(playerId, questId)
        if (progress && progress.status !== 'locked' && progress.status !== 'available') continue
      }

      // 检查前置条件
      const isAvailable = await this.checkPrerequisites(questId, playerId)
      if (isAvailable) {
        newlyAvailable.push(questId)
      }
    }

    if (newlyAvailable.length > 0) {
      logger.info(`Discovered ${newlyAvailable.length} available quests`)
    }

    return newlyAvailable
  }

  /**
   * 接受任务
   */
  async acceptQuest(playerId: string, questId: string): Promise<{ success: boolean; message: string; progress?: PlayerQuestProgress }> {
    const definition = questDefinitions.get(questId)
    if (!definition) {
      return { success: false, message: '任务不存在' }
    }

    // 检查前置条件
    const canAccept = await this.checkPrerequisites(questId, playerId)
    if (!canAccept) {
      return { success: false, message: '前置条件不满足' }
    }

    // 检查已有进度
    const existing = await this.getPlayerQuestProgress(playerId, questId)
    if (existing) {
      if (existing.status === 'active') {
        return { success: false, message: '任务已在进行中' }
      }
      if (existing.status === 'completed' && !definition.repeatable) {
        return { success: false, message: '任务已完成，不可重复' }
      }

      // 更新已有记录
      const updated = await prisma.playerQuest.update({
        where: { id: existing.id },
        data: {
          status: 'active',
          acceptedAt: new Date(),
          progress: { objectives: definition.objectives } as any,
        },
      })

      const progress = this.parsePlayerProgress(updated, definition)
      this.emitQuestEvent({
        type: 'quest_accepted',
        questId,
        questTitle: definition.title,
        playerId,
        timestamp: Date.now(),
        message: `接受任务：${definition.title}`,
      })

      return { success: true, message: '任务已接受', progress }
    }

    // 创建新的任务进度记录
    const created = await prisma.playerQuest.create({
      data: {
        playerId,
        questId,
        status: 'active',
        acceptedAt: new Date(),
        progress: { objectives: definition.objectives } as any,
      },
    })

    const progress = this.parsePlayerProgress(created, definition)

    this.emitQuestEvent({
      type: 'quest_accepted',
      questId,
      questTitle: definition.title,
      playerId,
      timestamp: Date.now(),
      message: `接受任务：${definition.title}`,
    })

    logger.info(`Player ${playerId} accepted quest: ${definition.title}`)
    return { success: true, message: '任务已接受', progress }
  }

  /**
   * 放弃任务
   */
  async abandonQuest(playerId: string, questId: string): Promise<{ success: boolean; message: string }> {
    const progress = await this.getPlayerQuestProgress(playerId, questId)
    if (!progress) {
      return { success: false, message: '任务进度不存在' }
    }

    if (!canTransition(progress.status, 'abandoned')) {
      return { success: false, message: `无法放弃${progress.status}状态的任务` }
    }

    await prisma.playerQuest.update({
      where: { id: progress.id },
      data: { status: 'abandoned' },
    })

    this.emitQuestEvent({
      type: 'quest_abandoned',
      questId,
      questTitle: progress.questTitle ?? questId,
      playerId,
      timestamp: Date.now(),
      message: `放弃任务：${progress.questTitle ?? questId}`,
    })

    logger.info(`Player ${playerId} abandoned quest: ${questId}`)
    return { success: true, message: '任务已放弃' }
  }

  /**
   * 更新任务目标进度
   */
  async updateQuestProgress(
    playerId: string,
    questId: string,
    objectiveId: string,
    increment: number,
  ): Promise<{ success: boolean; message: string; completed?: boolean }> {
    const definition = questDefinitions.get(questId)
    if (!definition) {
      return { success: false, message: '任务不存在' }
    }

    const progress = await this.getPlayerQuestProgress(playerId, questId)
    if (!progress || progress.status !== 'active') {
      return { success: false, message: '任务不在进行中' }
    }

    // 找到对应目标
    const objectives = progress.objectives.map((obj) => {
      if (obj.id === objectiveId) {
        return updateObjectiveProgress(obj, increment)
      }
      return obj
    })

    // 更新数据库
    await prisma.playerQuest.update({
      where: { id: progress.id },
      data: {
        progress: { objectives } as any,
      },
    })

    // 检查目标是否完成
    const updatedObjective = objectives.find((o) => o.id === objectiveId)
    if (updatedObjective && isObjectiveComplete(updatedObjective)) {
      this.emitQuestEvent({
        type: 'quest_objective_complete',
        questId,
        questTitle: definition.title,
        playerId,
        timestamp: Date.now(),
        objectiveId,
        progress: {
          current: updatedObjective.currentCount,
          required: updatedObjective.requiredCount,
          description: updatedObjective.description,
        },
        message: `目标完成：${updatedObjective.description}`,
      })
    }

    // 检查整体是否完成
    if (this.config.autoComplete && areAllRequiredObjectivesComplete(objectives)) {
      const result = await this.completeQuest(playerId, questId)
      return { success: true, message: '任务目标完成', completed: result.success }
    }

    this.emitQuestEvent({
      type: 'quest_progress',
      questId,
      questTitle: definition.title,
      playerId,
      timestamp: Date.now(),
      progress: {
        current: objectives.reduce((s, o) => s + Math.min(o.currentCount, o.requiredCount), 0),
        required: objectives.reduce((s, o) => s + o.requiredCount, 0),
        description: `进度: ${getQuestProgressPercent(objectives)}%`,
      },
      message: `任务进度更新`,
    })

    return { success: true, message: '进度已更新' }
  }

  /**
   * 完成任务
   */
  async completeQuest(playerId: string, questId: string): Promise<{ success: boolean; message: string }> {
    const definition = questDefinitions.get(questId)
    if (!definition) {
      return { success: false, message: '任务不存在' }
    }

    const progress = await this.getPlayerQuestProgress(playerId, questId)
    if (!progress) {
      return { success: false, message: '任务进度不存在' }
    }

    if (!canTransition(progress.status, 'completed')) {
      return { success: false, message: `无法完成${progress.status}状态的任务` }
    }

    // 检查是否所有目标完成
    if (!areAllRequiredObjectivesComplete(progress.objectives)) {
      return { success: false, message: '任务目标未全部完成' }
    }

    // 发放奖励
    await this.grantRewards(playerId, definition)

    // 更新状态
    await prisma.playerQuest.update({
      where: { id: progress.id },
      data: {
        status: 'completed',
        completedAt: new Date(),
      },
    })

    this.emitQuestEvent({
      type: 'quest_completed',
      questId,
      questTitle: definition.title,
      playerId,
      timestamp: Date.now(),
      message: `任务完成：${definition.title}！获得 ${definition.reward.exp} 经验，${definition.reward.coins} 星币`,
    })

    logger.info(`Player ${playerId} completed quest: ${definition.title}`)

    // 检查后续任务是否解锁
    await this.discoverAvailableQuests(playerId)

    return { success: true, message: '任务完成！' }
  }

  /**
   * 失败任务
   */
  async failQuest(playerId: string, questId: string, reason: string): Promise<{ success: boolean; message: string }> {
    const definition = questDefinitions.get(questId)
    if (!definition) {
      return { success: false, message: '任务不存在' }
    }

    const progress = await this.getPlayerQuestProgress(playerId, questId)
    if (!progress) {
      return { success: false, message: '任务进度不存在' }
    }

    if (!canTransition(progress.status, 'failed')) {
      return { success: false, message: `无法失败${progress.status}状态的任务` }
    }

    await prisma.playerQuest.update({
      where: { id: progress.id },
      data: { status: 'failed' },
    })

    this.emitQuestEvent({
      type: 'quest_failed',
      questId,
      questTitle: definition.title,
      playerId,
      timestamp: Date.now(),
      message: `任务失败：${definition.title}（${reason}）`,
    })

    logger.info(`Player ${playerId} failed quest: ${definition.title} (${reason})`)
    return { success: true, message: '任务失败' }
  }

  // =============================================
  // 条件检查
  // =============================================

  /**
   * 检查前置条件是否满足
   */
  private async checkPrerequisites(questId: string, playerId?: string): Promise<boolean> {
    const definition = questDefinitions.get(questId)
    if (!definition) return false

    // 检查前置任务
    if (definition.prerequisites.length > 0) {
      if (!playerId) return false

      for (const prereqId of definition.prerequisites) {
        const prereqProgress = await this.getPlayerQuestProgress(playerId, prereqId)
        if (!prereqProgress || prereqProgress.status !== 'completed') {
          return false
        }
      }
    }

    // 检查触发条件
    if (definition.trigger.conditions) {
      const conditionsMet = await this.checkConditionGroup(definition.trigger.conditions, playerId)
      if (!conditionsMet) return false
    }

    return true
  }

  /**
   * 检查条件组
   */
  private async checkConditionGroup(group: { conditions: QuestCondition[]; logic?: 'AND' | 'OR' }, playerId?: string): Promise<boolean> {
    const logic = group.logic ?? 'AND'

    if (logic === 'AND') {
      for (const cond of group.conditions) {
        if (!(await this.checkCondition(cond, playerId))) return false
      }
      return true
    } else {
      for (const cond of group.conditions) {
        if (await this.checkCondition(cond, playerId)) return true
      }
      return false
    }
  }

  /**
   * 检查单个条件
   */
  private async checkCondition(cond: QuestCondition, playerId?: string): Promise<boolean> {
    switch (cond.type) {
      case 'quest_completed':
        if (!playerId) return false
        const qProgress = await this.getPlayerQuestProgress(playerId, cond.targetId ?? '')
        return qProgress?.status === 'completed'

      case 'game_day': {
        const day = gameClock.getDay()
        return this.compareValue(day, cond.value, cond.operator)
      }

      case 'game_hour': {
        const hour = gameClock.getGameHour()
        return this.compareValue(hour, cond.value, cond.operator)
      }

      case 'npc_affection':
        if (!playerId) return false
        const relation = await prisma.playerRelation.findUnique({
          where: { playerId_npcId: { playerId, npcId: cond.targetId ?? '' } },
        })
        return this.compareValue(relation?.affection ?? 0, cond.value, cond.operator)

      case 'player_reputation':
        if (!playerId) return false
        const playerRel = await prisma.playerRelation.findFirst({ where: { playerId } })
        return this.compareValue(playerRel?.reputation ?? 50, cond.value, cond.operator)

      case 'item_owned':
        if (!playerId) return false
        const item = await prisma.playerItem.findUnique({
          where: { playerId_itemId: { playerId, itemId: cond.targetId ?? '' } },
        })
        return this.compareValue(item?.quantity ?? 0, cond.value, cond.operator)

      default:
        // 未知条件类型，默认通过
        return true
    }
  }

  /**
   * 比较值
   */
  private compareValue(actual: number, expected: number | string | boolean, operator: string): boolean {
    switch (operator) {
      case 'equals': return actual === Number(expected)
      case 'not_equals': return actual !== Number(expected)
      case 'greater': return actual > Number(expected)
      case 'less': return actual < Number(expected)
      default: return false
    }
  }

  // =============================================
  // 奖励发放
  // =============================================

  /**
   * 发放任务奖励
   */
  private async grantRewards(playerId: string, definition: QuestDefinition): Promise<void> {
    try {
      // 更新星币
      if (definition.reward.coins > 0) {
        await prisma.player.update({
          where: { id: playerId },
          data: { starCoins: { increment: definition.reward.coins } },
        })
      }

      // 发放物品
      for (const item of definition.reward.items) {
        await prisma.playerItem.upsert({
          where: { playerId_itemId: { playerId, itemId: item.itemId } },
          create: { playerId, itemId: item.itemId, quantity: item.quantity },
          update: { quantity: { increment: item.quantity } },
        })
      }

      // 更新好感度
      if (definition.reward.affectionChanges) {
        for (const change of definition.reward.affectionChanges) {
          await prisma.playerRelation.update({
            where: { playerId_npcId: { playerId, npcId: change.npcId } },
            data: { affection: { increment: change.change } },
          }).catch(() => {
            // 关系记录可能不存在，忽略
          })
        }
      }

      logger.info(`Rewards granted for ${definition.title}: ${definition.reward.coins} coins, ${definition.reward.items.length} items`)
    } catch (err) {
      logger.error(`Failed to grant rewards: ${(err as Error).message}`)
    }
  }

  // =============================================
  // 超时检查
  // =============================================

  /**
   * 检查超时任务
   */
  private async checkTimeoutQuests(): Promise<void> {
    const activeQuests = await prisma.playerQuest.findMany({
      where: { status: 'active' },
    })

    const currentDay = gameClock.getDay()

    for (const pq of activeQuests) {
      const definition = questDefinitions.get(pq.questId)
      if (!definition || definition.timeLimit <= 0) continue

      const progress = pq.progress as any
      const acceptedDay = progress?.acceptedGameDay ?? currentDay
      const daysElapsed = currentDay - acceptedDay

      if (daysElapsed * 24 > definition.timeLimit) {
        await this.failQuest(pq.playerId, pq.questId, '任务超时')
      }
    }
  }

  // =============================================
  // 查询接口
  // =============================================

  /**
   * 获取玩家任务进度
   */
  async getPlayerQuestProgress(playerId: string, questId: string): Promise<PlayerQuestProgress | null> {
    const pq = await prisma.playerQuest.findUnique({
      where: { playerId_questId: { playerId, questId } },
    })

    if (!pq) return null

    const definition = questDefinitions.get(questId)
    return this.parsePlayerProgress(pq, definition)
  }

  /**
   * 解析玩家进度记录
   */
  private parsePlayerProgress(pq: any, definition?: QuestDefinition): PlayerQuestProgress {
    const progressData = pq.progress as any
    return {
      id: pq.id,
      playerId: pq.playerId,
      questId: pq.questId,
      questTitle: definition?.title,
      status: pq.status as QuestStatus,
      objectives: (progressData?.objectives as QuestObjective[]) ?? definition?.objectives ?? [],
      acceptedAt: pq.acceptedAt?.getTime() ?? 0,
      acceptedGameDay: progressData?.acceptedGameDay ?? 1,
      completedAt: pq.updatedAt?.getTime(),
      updatedAt: pq.updatedAt?.getTime() ?? Date.now(),
      customData: progressData?.customData ?? {},
    }
  }

  /**
   * 获取玩家所有任务
   */
  async getPlayerQuests(playerId: string): Promise<PlayerQuestProgress[]> {
    const pqs = await prisma.playerQuest.findMany({
      where: { playerId },
      include: { quest: true },
    })

    return pqs.map((pq) => {
      const definition = questDefinitions.get(pq.questId)
      return this.parsePlayerProgress(pq, definition)
    })
  }

  /**
   * 获取可接受的任务
   */
  async getAvailableQuests(playerId: string): Promise<QuestDefinition[]> {
    const available: QuestDefinition[] = []

    for (const [questId, definition] of questDefinitions) {
      const progress = await this.getPlayerQuestProgress(playerId, questId)
      if (progress && progress.status !== 'locked' && progress.status !== 'available') continue

      const canAccept = await this.checkPrerequisites(questId, playerId)
      if (canAccept) {
        available.push(definition)
      }
    }

    return available
  }

  /**
   * 获取所有任务定义
   */
  getAllQuestDefinitions(): QuestDefinition[] {
    return Array.from(questDefinitions.values())
  }

  /**
   * 获取任务定义
   */
  getQuestDefinition(questId: string): QuestDefinition | undefined {
    return questDefinitions.get(questId)
  }

  // =============================================
  // 事件系统
  // =============================================

  /**
   * 注册事件监听
   */
  on(eventType: QuestEventType, callback: QuestEventCallback): () => void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set())
    }
    this.listeners.get(eventType)!.add(callback)
    return () => this.listeners.get(eventType)?.delete(callback)
  }

  /**
   * 触发任务事件
   */
  private emitQuestEvent(event: QuestEvent): void {
    // 通知监听器
    const callbacks = this.listeners.get(event.type)
    if (callbacks) {
      callbacks.forEach((cb) => {
        try {
          cb(event)
        } catch (err) {
          logger.error(`Quest event listener error: ${(err as Error).message}`)
        }
      })
    }

    // 广播给客户端
    if (this.io) {
      this.io.emit('quest:event', event)
    }
  }

  // =============================================
  // 触发器接口（外部事件调用）
  // =============================================

  /**
   * 触发：与NPC对话（推进 talk_to_npc 目标）
   * T6.15: 支持中文名匹配 —— 前端传入的 npcId 可能是 `sc_玛格丽特` 占位ID或档案ID，
   * 而任务目标的 targetId 使用中文名（如"玛格丽特"），这里做多路匹配。
   */
  async triggerNpcTalk(playerId: string, npcId: string): Promise<void> {
    const activeQuests = await prisma.playerQuest.findMany({
      where: { playerId, status: 'active' },
    })

    // 解析可能的显示名（去除 sc_ 占位前缀；或通过档案反查中文名）
    const candidateNames = new Set<string>([npcId])
    const displayName = npcId.startsWith('sc_') ? npcId.slice(3) : null
    if (displayName) candidateNames.add(displayName)
    try {
      const { profileLoader } = await import('./profileLoader.js')
      const profile = profileLoader.getProfile(npcId)
      if (profile?.name) candidateNames.add(profile.name)
      const byName = profileLoader.getProfileByName(displayName ?? npcId)
      if (byName?.name) candidateNames.add(byName.name)
    } catch {
      // 档案加载失败不阻塞推进
    }

    for (const pq of activeQuests) {
      const definition = questDefinitions.get(pq.questId)
      if (!definition) continue

      // 检查是否有 talk_to_npc 目标
      const progress = this.parsePlayerProgress(pq, definition)
      for (const obj of progress.objectives) {
        if (obj.type === 'talk_to_npc' && candidateNames.has(obj.targetId ?? '') && !isObjectiveComplete(obj)) {
          await this.updateQuestProgress(playerId, pq.questId, obj.id, 1)
        }
      }
    }
  }

  /**
   * 触发：获得物品
   */
  async triggerItemObtain(playerId: string, itemId: string, count: number = 1): Promise<void> {
    const activeQuests = await prisma.playerQuest.findMany({
      where: { playerId, status: 'active' },
    })

    for (const pq of activeQuests) {
      const definition = questDefinitions.get(pq.questId)
      if (!definition) continue

      const progress = this.parsePlayerProgress(pq, definition)
      for (const obj of progress.objectives) {
        if (obj.type === 'collect_item' && obj.targetId === itemId && !isObjectiveComplete(obj)) {
          await this.updateQuestProgress(playerId, pq.questId, obj.id, count)
        }
      }
    }
  }

  /**
   * 触发：进入区域
   */
  async triggerAreaEnter(playerId: string, areaName: string): Promise<void> {
    const activeQuests = await prisma.playerQuest.findMany({
      where: { playerId, status: 'active' },
    })

    for (const pq of activeQuests) {
      const definition = questDefinitions.get(pq.questId)
      if (!definition) continue

      const progress = this.parsePlayerProgress(pq, definition)
      for (const obj of progress.objectives) {
        if (obj.type === 'visit_area' && obj.targetId === areaName && !isObjectiveComplete(obj)) {
          await this.updateQuestProgress(playerId, pq.questId, obj.id, 1)
        }
      }
    }
  }

  /**
   * 触发：击杀敌人（T6.8 升级打怪玩法）
   * 战斗结算时按被击杀的敌人ID推进所有 kill_enemy 目标
   */
  async triggerKillEnemy(playerId: string, enemyId: string): Promise<void> {
    const activeQuests = await prisma.playerQuest.findMany({
      where: { playerId, status: 'active' },
    })

    for (const pq of activeQuests) {
      const definition = questDefinitions.get(pq.questId)
      if (!definition) continue

      const progress = this.parsePlayerProgress(pq, definition)
      for (const obj of progress.objectives) {
        if (obj.type === 'kill_enemy' && obj.targetId === enemyId && !isObjectiveComplete(obj)) {
          await this.updateQuestProgress(playerId, pq.questId, obj.id, 1)
        }
      }
    }
  }

  // =============================================
  // 管理
  // =============================================

  /** 重新加载任务定义 */
  async reloadDefinitions(): Promise<void> {
    await this.loadQuestDefinitions()
  }

  /** 获取统计 */
  getStats() {
    return {
      totalDefinitions: questDefinitions.size,
      initialized: this.initialized,
      lastCheckHour: this.lastCheckHour,
    }
  }

  /** 销毁 */
  destroy(): void {
    this.listeners.clear()
    this.initialized = false
  }
}

/** 全局任务引擎实例 */
export const questEngine = new QuestEngine()
