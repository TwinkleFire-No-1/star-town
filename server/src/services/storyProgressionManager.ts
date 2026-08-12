// 星火小镇 — 剧情进度管理器
// T5.1.1/T5.1.2 全链路联调：将剧情脚本注册到任务引擎，串联NPC交互→任务→战斗→剧情推进

import { createLogger } from '../utils/index.js'
import { questEngine } from './questEngine.js'
import { prisma } from '../models/prisma.js'

// 剧情脚本导入
import { PROLOGUE_QUESTS, PROLOGUE_TRIGGER_MAP, getPrologueDialogue } from './storyPrologue.js'
import { CHAPTER1_QUESTS, CHAPTER1_TRIGGER_MAP, getChapter1Dialogue } from './storyChapter1.js'
import { CHAPTER2_QUESTS, CHAPTER2_TRIGGERS } from './storyChapter2.js'
import { CHAPTER3_QUESTS, CHAPTER3_TRIGGERS } from './storyChapter3.js'
import { FINALE_QUESTS, FINALE_TRIGGERS, FINALE_ENDINGS } from './storyFinale.js'
import type { DialogueScene } from './storyPrologue.js'
import type { QuestDefinition } from './questTypes.js'
import { broadcastUnlock } from './storyUnlockService.js'

const logger = createLogger('StoryProgression')

// =============================================
// 类型定义
// =============================================

/** 剧情章节 */
export type StoryChapter = 0 | 1 | 2 | 3 | 4 | 5

/** 剧情进度记录 */
export interface StoryProgress {
  playerId: string
  currentChapter: StoryChapter
  completedChapters: StoryChapter[]
  /** 已触发的对话场景ID */
  triggeredScenes: string[]
  /** 已解锁的区域 */
  unlockedAreas: string[]
  /** 当前结局路径（终章） */
  endingPath: 'seal' | 'redemption' | 'destruction' | null
  /** 剧情标志位 */
  flags: Record<string, boolean>
  updatedAt: number
}

/** 剧情触发上下文 */
export interface StoryTriggerContext {
  playerId: string
  triggerType: 'game_start' | 'npc_talk' | 'area_enter' | 'quest_complete' | 'combat_end' | 'custom'
  npcId?: string
  areaId?: string
  questId?: string
  customTriggerId?: string
}

// =============================================
// 章节数据注册表
// =============================================

interface ChapterData {
  chapter: StoryChapter
  title: string
  quests: QuestDefinition[]
  triggerMap: Record<string, string>
  dialogues: DialogueScene[]
  newAreas: string[]
}

const CHAPTER_REGISTRY: ChapterData[] = [
  {
    chapter: 0,
    title: '序章：星火初燃',
    quests: PROLOGUE_QUESTS,
    triggerMap: PROLOGUE_TRIGGER_MAP,
    dialogues: [], // 从 PROLOGUE_DIALOGUES 填充
    newAreas: [],
  },
  {
    chapter: 1,
    title: '第一章：森林低语',
    quests: CHAPTER1_QUESTS,
    triggerMap: CHAPTER1_TRIGGER_MAP,
    dialogues: [],
    newAreas: ['whispering_forest', 'forest_entrance', 'ancient_ruins'],
  },
  {
    chapter: 2,
    title: '第二章：深处的秘密',
    quests: CHAPTER2_QUESTS,
    triggerMap: CHAPTER2_TRIGGERS as unknown as Record<string, string>,
    dialogues: [],
    newAreas: ['ancient_ruins', 'ruins_inner'],
  },
  {
    chapter: 3,
    title: '第三章：暗影崛起',
    quests: CHAPTER3_QUESTS,
    triggerMap: CHAPTER3_TRIGGERS as unknown as Record<string, string>,
    dialogues: [],
    newAreas: ['shadow_camp', 'corrupted_mine'],
  },
  {
    chapter: 5,
    title: '终章：星火重燃',
    quests: FINALE_QUESTS,
    triggerMap: FINALE_TRIGGERS as unknown as Record<string, string>,
    dialogues: [],
    newAreas: ['underground_chamber', 'corruption_nest_depths', 'shadow_tower'],
  },
]

// 内存缓存：playerId → StoryProgress
const progressCache = new Map<string, StoryProgress>()

// =============================================
// 剧情进度管理器
// =============================================

class StoryProgressionManager {
  private initialized = false
  private io: any = null

  // =============================================
  // 初始化
  // =============================================

  /**
   * 初始化：将所有章节任务注册到任务引擎
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      logger.warn('StoryProgressionManager already initialized')
      return
    }

    // 将所有章节的任务定义注册到任务引擎
    let registeredCount = 0
    for (const chapterData of CHAPTER_REGISTRY) {
      for (const quest of chapterData.quests) {
        questEngine.registerDefinition(quest)
        registeredCount++
      }
    }

    this.initialized = true
    logger.info(`StoryProgressionManager initialized: ${registeredCount} story quests registered across ${CHAPTER_REGISTRY.length} chapters`)
  }

  /**
   * 设置 Socket.IO
   */
  setIo(io: any): void {
    this.io = io
  }

  // =============================================
  // 玩家进度管理
  // =============================================

  /**
   * 获取或创建玩家剧情进度
   */
  async getPlayerProgress(playerId: string): Promise<StoryProgress> {
    // 先查缓存
    const cached = progressCache.get(playerId)
    if (cached) return cached

    // 查数据库
    const player = await prisma.player.findUnique({ where: { id: playerId } })
    
    const progress: StoryProgress = {
      playerId,
      currentChapter: 0,
      completedChapters: [],
      triggeredScenes: [],
      unlockedAreas: [],
      endingPath: null,
      flags: {},
      updatedAt: Date.now(),
    }

    // 如果玩家存在，从玩家的自定义数据恢复进度
    if (player) {
      // 简单恢复：检查已完成的主线任务推断章节进度
      const completedMainQuests = await prisma.playerQuest.findMany({
        where: { playerId, status: 'completed' },
        include: { quest: true },
      })

      for (const pq of completedMainQuests) {
        if (pq.quest?.type === 'main') {
          const chapter = (pq.quest.chapter ?? 0) as StoryChapter
          if (!progress.completedChapters.includes(chapter)) {
            progress.completedChapters.push(chapter)
          }
        }
      }

      // 推断当前章节
      progress.currentChapter = this.inferCurrentChapter(progress.completedChapters) as StoryChapter
    }

    progressCache.set(playerId, progress)
    return progress
  }

  /**
   * 根据已完成章节推断当前章节
   */
  private inferCurrentChapter(completed: StoryChapter[]): StoryChapter {
    if (completed.includes(5)) return 5
    if (completed.includes(3)) return 5
    if (completed.includes(2)) return 3
    if (completed.includes(1)) return 2
    if (completed.includes(0)) return 1
    return 0
  }

  /**
   * 更新玩家剧情进度
   */
  async updateProgress(playerId: string, updates: Partial<StoryProgress>): Promise<StoryProgress> {
    const progress = await this.getPlayerProgress(playerId)
    const updated: StoryProgress = {
      ...progress,
      ...updates,
      playerId,
      updatedAt: Date.now(),
    }
    progressCache.set(playerId, updated)
    return updated
  }

  /**
   * 标记对话场景已触发
   */
  async markSceneTriggered(playerId: string, sceneId: string): Promise<void> {
    const progress = await this.getPlayerProgress(playerId)
    if (!progress.triggeredScenes.includes(sceneId)) {
      progress.triggeredScenes.push(sceneId)
      progressCache.set(playerId, progress)
    }
  }

  /**
   * 解锁区域
   */
  async unlockArea(playerId: string, areaId: string): Promise<void> {
    const progress = await this.getPlayerProgress(playerId)
    if (!progress.unlockedAreas.includes(areaId)) {
      progress.unlockedAreas.push(areaId)
      progressCache.set(playerId, progress)
    }
  }

  /**
   * 设置剧情标志
   */
  async setFlag(playerId: string, flag: string, value: boolean = true): Promise<void> {
    const progress = await this.getPlayerProgress(playerId)
    progress.flags[flag] = value
    progressCache.set(playerId, progress)
  }

  // =============================================
  // 剧情触发
  // =============================================

  /**
   * 触发剧情场景
   * 
   * 这是全链路联调的核心方法：
   * 玩家行为 → 触发条件检查 → 对话场景 → 任务推进 → 区域解锁 → 战斗触发
   */
  async triggerScene(ctx: StoryTriggerContext): Promise<{
    scene: DialogueScene | null
    questUpdate?: { questId: string; objectiveId: string; completed: boolean }
    unlockedArea?: string
    battleTrigger?: { enemyType: string; questId: string }
  }> {
    const progress = await this.getPlayerProgress(ctx.playerId)
    
    // 根据触发类型构造触发器ID
    const triggerId = this.buildTriggerId(ctx)
    if (!triggerId) {
      return { scene: null }
    }

    // 查找对话场景
    const scene = this.findDialogueScene(progress.currentChapter, triggerId)
    if (!scene) {
      return { scene: null }
    }

    // 检查是否已触发过（一次性场景）
    if (scene.once && progress.triggeredScenes.includes(scene.id)) {
      return { scene: null }
    }

    // 标记已触发
    await this.markSceneTriggered(ctx.playerId, scene.id)

    // 处理对话中的效果
    let questUpdate: { questId: string; objectiveId: string; completed: boolean } | undefined
    let unlockedArea: string | undefined
    let battleTrigger: { enemyType: string; questId: string } | undefined

    for (const line of scene.lines) {
      const effect = line.effect
      if (!effect) continue

      switch (effect.type) {
        case 'complete_objective': {
          // 推进任务目标
          const objectiveId = effect.targetId
          if (objectiveId) {
            // 查找玩家活跃任务中匹配的目标
            const activeQuests = await prisma.playerQuest.findMany({
              where: { playerId: ctx.playerId, status: 'active' },
            })
            for (const pq of activeQuests) {
              const progressData = pq.progress as any
              const objectives = progressData?.objectives ?? []
              const matched = objectives.find((o: any) => o.id === objectiveId || o.targetId === effect.targetId)
              if (matched) {
                await questEngine.updateQuestProgress(ctx.playerId, pq.questId, matched.id, 1)
                questUpdate = { questId: pq.questId, objectiveId: matched.id, completed: true }
              }
            }
          }
          break
        }
        case 'unlock_area': {
          if (effect.targetId) {
            await this.unlockArea(ctx.playerId, effect.targetId)
            unlockedArea = effect.targetId
          }
          break
        }
        case 'start_quest': {
          if (effect.targetId) {
            await questEngine.acceptQuest(ctx.playerId, effect.targetId)
          }
          break
        }
        case 'change_affection': {
          if (effect.targetId && typeof effect.value === 'number') {
            await this.changeAffection(ctx.playerId, effect.targetId, effect.value)
          }
          break
        }
        case 'give_item': {
          // 通过API层处理
          break
        }
      }
    }

    // 检查是否需要推进章节
    await this.checkChapterProgression(ctx.playerId)

    logger.info(`Triggered scene: ${scene.id} for player ${ctx.playerId}`)
    return { scene, questUpdate, unlockedArea, battleTrigger }
  }

  /**
   * 根据上下文构造触发器ID
   */
  private buildTriggerId(ctx: StoryTriggerContext): string | null {
    switch (ctx.triggerType) {
      case 'game_start':
        return 'game_start'
      case 'npc_talk':
        if (!ctx.npcId) return null
        return `npc_talk_${ctx.npcId}_first`
      case 'area_enter':
        if (!ctx.areaId) return null
        return `area_enter_${ctx.areaId}`
      case 'quest_complete':
        if (!ctx.questId) return null
        return `quest_complete_${ctx.questId}`
      case 'combat_end':
        if (!ctx.customTriggerId) return null
        return `combat_end_${ctx.customTriggerId}`
      case 'custom':
        return ctx.customTriggerId ?? null
      default:
        return null
    }
  }

  /**
   * 查找对话场景
   */
  private findDialogueScene(chapter: StoryChapter, triggerId: string): DialogueScene | null {
    // 先在当前章节查找
    const chapterData = CHAPTER_REGISTRY.find((c) => c.chapter === chapter)
    if (chapterData) {
      const sceneId = chapterData.triggerMap[triggerId]
      if (sceneId) {
        const scene = chapterData.dialogues.find((d) => d.id === sceneId)
        if (scene) return scene
      }
    }

    // 在所有章节查找（跨章节触发）
    for (const ch of CHAPTER_REGISTRY) {
      const sceneId = ch.triggerMap[triggerId]
      if (sceneId) {
        const scene = ch.dialogues.find((d) => d.id === sceneId)
        if (scene) return scene
      }
    }

    // 使用函数查找（序章和第一章有函数式查找）
    const prologueScene = getPrologueDialogue(triggerId)
    if (prologueScene) return prologueScene

    const chapter1Scene = getChapter1Dialogue(triggerId)
    if (chapter1Scene) return chapter1Scene

    return null
  }

  /**
   * 检查章节推进
   */
  private async checkChapterProgression(playerId: string): Promise<void> {
    const progress = await this.getPlayerProgress(playerId)

    // 检查当前章节的所有主线任务是否完成
    const chapterData = CHAPTER_REGISTRY.find((c) => c.chapter === progress.currentChapter)
    if (!chapterData) return

    const mainQuests = chapterData.quests.filter((q) => q.type === 'main')
    if (mainQuests.length === 0) return

    let allCompleted = true
    for (const quest of mainQuests) {
      const pq = await questEngine.getPlayerQuestProgress(playerId, quest.id)
      if (!pq || pq.status !== 'completed') {
        allCompleted = false
        break
      }
    }

    if (allCompleted && !progress.completedChapters.includes(progress.currentChapter)) {
      // 章节完成，推进到下一章
      const completedChapters = [...progress.completedChapters, progress.currentChapter]
      const nextChapter = this.getNextChapter(progress.currentChapter)
      
      await this.updateProgress(playerId, {
        completedChapters,
        currentChapter: nextChapter,
      })

      // 解锁下一章的区域
      const nextChapterData = CHAPTER_REGISTRY.find((c) => c.chapter === nextChapter)
      if (nextChapterData) {
        for (const area of nextChapterData.newAreas) {
          await this.unlockArea(playerId, area)
        }
      }

      logger.info(`Player ${playerId} advanced to chapter ${nextChapter}`)

      // 广播章节完成事件
      if (this.io) {
        this.io.emit('story:chapter_complete', {
          playerId,
          completedChapter: progress.currentChapter,
          nextChapter,
          title: chapterData.title,
        })
      }

      // 剧情解锁系统：广播新解锁的场景/NPC
      const advancedProgress = await this.getPlayerProgress(playerId)
      broadcastUnlock(this.io, advancedProgress)

      // T6.15 地图解锁联动主线任务：章节推进后立即检查该玩家的主线任务
      // （requiredChapter 已满足 → 之前因地图未解锁而延迟的任务此时弹出）
      try {
        const { mainlineQuestService } = await import('./mainlineQuestService.js')
        await mainlineQuestService.checkForPlayer(playerId)
      } catch (err) {
        logger.warn(`Failed to trigger mainline check after chapter advance: ${(err as Error).message}`)
      }
    }
  }

  /**
   * 获取下一章节
   */
  private getNextChapter(current: StoryChapter): StoryChapter {
    switch (current) {
      case 0: return 1
      case 1: return 2
      case 2: return 3
      case 3: return 5
      case 5: return 5 // 终章是最后一章
      default: return current
    }
  }

  /**
   * 修改好感度
   */
  private async changeAffection(playerId: string, npcId: string, change: number): Promise<void> {
    try {
      await prisma.playerRelation.upsert({
        where: { playerId_npcId: { playerId, npcId } },
        create: { playerId, npcId, affection: change, trust: 0, reputation: 50 },
        update: { affection: { increment: change } },
      })
    } catch (err) {
      logger.warn(`Failed to change affection for ${playerId}→${npcId}: ${(err as Error).message}`)
    }
  }

  // =============================================
  // 全链路联调：模拟完整游戏流程
  // =============================================

  /**
   * 全链路联调测试
   * 
   * 模拟：玩家进入 → NPC对话 → 任务接受 → 战斗 → 完成
   */
  async runIntegrationTest(playerId: string): Promise<{
    steps: Array<{ step: string; success: boolean; detail: string }>
    overall: boolean
  }> {
    const steps: Array<{ step: string; success: boolean; detail: string }> = []

    // Step 1: 游戏开始触发序章
    try {
      const result = await this.triggerScene({
        playerId,
        triggerType: 'game_start',
      })
      steps.push({
        step: '1. 游戏开始触发序章',
        success: result.scene !== null,
        detail: result.scene ? `触发场景: ${result.scene.id}` : '未触发场景',
      })
    } catch (err) {
      steps.push({ step: '1. 游戏开始触发序章', success: false, detail: (err as Error).message })
    }

    // Step 2: NPC对话触发
    try {
      const testNpcIds = ['eldric', 'meriel', 'tobias', 'lila']
      let npcDialogSuccess = false
      for (const npcId of testNpcIds) {
        const result = await this.triggerScene({
          playerId,
          triggerType: 'npc_talk',
          npcId,
        })
        if (result.scene) {
          npcDialogSuccess = true
          steps.push({
            step: `2. NPC对话: ${npcId}`,
            success: true,
            detail: `触发场景: ${result.scene.id}`,
          })
          break
        }
      }
      if (!npcDialogSuccess) {
        steps.push({ step: '2. NPC对话', success: false, detail: '未找到NPC对话场景' })
      }
    } catch (err) {
      steps.push({ step: '2. NPC对话', success: false, detail: (err as Error).message })
    }

    // Step 3: 任务接受
    try {
      const available = await questEngine.getAvailableQuests(playerId)
      if (available.length > 0) {
        const firstQuest = available[0]
        const acceptResult = await questEngine.acceptQuest(playerId, firstQuest.id)
        steps.push({
          step: '3. 任务接受',
          success: acceptResult.success,
          detail: acceptResult.success ? `接受任务: ${firstQuest.title}` : acceptResult.message,
        })
      } else {
        // 尝试直接接受序章任务
        const acceptResult = await questEngine.acceptQuest(playerId, 'prologue_wake_up')
        steps.push({
          step: '3. 任务接受',
          success: acceptResult.success,
          detail: acceptResult.message,
        })
      }
    } catch (err) {
      steps.push({ step: '3. 任务接受', success: false, detail: (err as Error).message })
    }

    // Step 4: 任务进度更新
    try {
      const playerQuests = await questEngine.getPlayerQuests(playerId)
      const activeQuest = playerQuests.find((q) => q.status === 'active')
      if (activeQuest && activeQuest.objectives.length > 0) {
        const firstObjective = activeQuest.objectives[0]
        const progressResult = await questEngine.updateQuestProgress(
          playerId,
          activeQuest.questId,
          firstObjective.id,
          firstObjective.requiredCount,
        )
        steps.push({
          step: '4. 任务进度更新',
          success: progressResult.success,
          detail: progressResult.message,
        })
      } else {
        steps.push({ step: '4. 任务进度更新', success: false, detail: '无活跃任务' })
      }
    } catch (err) {
      steps.push({ step: '4. 任务进度更新', success: false, detail: (err as Error).message })
    }

    // Step 5: 物品系统
    try {
      const items = await prisma.item.findFirst()
      if (items) {
        const existing = await prisma.playerItem.findUnique({
          where: { playerId_itemId: { playerId, itemId: items.id } },
        })
        if (existing) {
          steps.push({ step: '5. 物品系统', success: true, detail: `已有物品: ${items.name}` })
        } else {
          await prisma.playerItem.create({
            data: { playerId, itemId: items.id, quantity: 1 },
          })
          steps.push({ step: '5. 物品系统', success: true, detail: `获得物品: ${items.name}` })
        }
      } else {
        steps.push({ step: '5. 物品系统', success: false, detail: '无物品定义' })
      }
    } catch (err) {
      steps.push({ step: '5. 物品系统', success: false, detail: (err as Error).message })
    }

    // Step 6: 关系系统
    try {
      const npcs = await prisma.nPC.findMany({ take: 1 })
      if (npcs.length > 0) {
        const npc = npcs[0]
        await prisma.playerRelation.upsert({
          where: { playerId_npcId: { playerId, npcId: npc.id } },
          create: { playerId, npcId: npc.id, affection: 50, trust: 40, reputation: 50 },
          update: {},
        })
        steps.push({ step: '6. 关系系统', success: true, detail: `与NPC ${npc.name} 建立关系` })
      } else {
        steps.push({ step: '6. 关系系统', success: false, detail: '无NPC数据' })
      }
    } catch (err) {
      steps.push({ step: '6. 关系系统', success: false, detail: (err as Error).message })
    }

    const overall = steps.every((s) => s.success)
    return { steps, overall }
  }

  // =============================================
  // 主线走查
  // =============================================

  /**
   * 主线剧情走查：验证从序章到终章的完整链路
   */
  async runStoryWalkthrough(): Promise<{
    chapters: Array<{
      chapter: StoryChapter
      title: string
      questCount: number
      dialogueCount: number
      triggerCount: number
      questChainValid: boolean
      details: string[]
    }>
    overall: boolean
  }> {
    const chapters = CHAPTER_REGISTRY.map((ch) => {
      const details: string[] = []
      
      // 检查任务链是否完整
      let questChainValid = true
      const questIds = ch.quests.map((q) => q.id)
      
      for (const quest of ch.quests) {
        // 检查前置条件是否在当前章节或前序章节中
        if (quest.prerequisites && quest.prerequisites.length > 0) {
          for (const prereq of quest.prerequisites) {
            if (!questIds.includes(prereq)) {
              // 检查是否是前序章节的任务
              const isFromPreviousChapter = CHAPTER_REGISTRY
                .filter((c) => c.chapter < ch.chapter)
                .some((c) => c.quests.some((q) => q.id === prereq))
              
              if (!isFromPreviousChapter) {
                details.push(`⚠ 任务 ${quest.id} 的前置 ${prereq} 未找到`)
                questChainValid = false
              }
            }
          }
        }
        
        // 检查任务目标是否完整
        if (!quest.objectives || quest.objectives.length === 0) {
          details.push(`⚠ 任务 ${quest.id} 没有目标`)
          questChainValid = false
        }
        
        // 检查奖励是否完整
        if (!quest.reward) {
          details.push(`⚠ 任务 ${quest.id} 没有奖励定义`)
          questChainValid = false
        }
      }

      // 检查触发器映射
      const triggerCount = Object.keys(ch.triggerMap).length

      // 检查对话场景
      const dialogueCount = ch.dialogues?.length ?? 0

      if (questChainValid) {
        details.push(`✓ ${ch.quests.length}个任务链完整`)
        details.push(`✓ ${triggerCount}个触发器映射`)
        details.push(`✓ ${dialogueCount}个对话场景`)
      }

      return {
        chapter: ch.chapter,
        title: ch.title,
        questCount: ch.quests.length,
        dialogueCount,
        triggerCount,
        questChainValid,
        details,
      }
    })

    const overall = chapters.every((ch) => ch.questChainValid)
    return { chapters, overall }
  }

  // =============================================
  // 获取章节信息
  // =============================================

  /**
   * 获取所有章节信息
   */
  getChapterInfo(): Array<{ chapter: StoryChapter; title: string; questCount: number }> {
    return CHAPTER_REGISTRY.map((ch) => ({
      chapter: ch.chapter,
      title: ch.title,
      questCount: ch.quests.length,
    }))
  }

  /**
   * 获取结局信息
   */
  getEndings(): typeof FINALE_ENDINGS {
    return FINALE_ENDINGS
  }

  /**
   * 获取章节任务定义
   * @param chapterNum - 章节编号
   */
  getChapterQuests(chapterNum: StoryChapter): QuestDefinition[] {
    const ch = CHAPTER_REGISTRY.find((c) => c.chapter === chapterNum)
    return ch?.quests ?? []
  }
}

/** 全局剧情进度管理器实例 */
export const storyProgressionManager = new StoryProgressionManager()
