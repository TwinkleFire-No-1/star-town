// 星火小镇 — 反思生成模块
// T2.5.4 低优先级记忆→反思摘要、定时批量触发

import { createLogger } from '../utils/index.js'
import { prisma } from '../models/prisma.js'
import { modelRouter, ModelPurpose } from './modelRouter.js'
import { profileLoader } from './profileLoader.js'
import { memoryStream } from './memoryStream.js'
import { retrievalRankService } from './retrievalRankService.js'

const logger = createLogger('Reflection')

// =============================================
// 类型定义
// =============================================

/** 反思生成结果 */
export interface ReflectionResult {
  /** NPC ID */
  npcId: string
  /** 反思内容 */
  content: string
  /** 参与反思的源记忆ID列表 */
  sourceMemoryIds: string[]
  /** 反思重要度 (1-10) */
  importance: number
  /** 反思触发的洞察 */
  insights: string[]
  /** 生成耗时(ms) */
  duration: number
  /** 是否成功 */
  success: boolean
  /** Token用量 */
  tokenUsage?: { promptTokens: number; completionTokens: number; totalTokens: number }
}

/** 反思触发条件 */
export interface ReflectionTrigger {
  /** NPC ID */
  npcId: string
  /** 触发原因 */
  reason: 'low_importance_accumulated' | 'time_interval' | 'significant_event' | 'manual'
  /** 可供反思的记忆数 */
  candidateCount: number
}

/** 批量反思进度 */
export interface ReflectionBatchProgress {
  /** 总NPC数 */
  totalNpcs: number
  /** 已完成 */
  completed: number
  /** 成功 */
  succeeded: number
  /** 失败 */
  failed: number
  /** 是否正在运行 */
  isRunning: boolean
}

// =============================================
// 反思生成模块
// =============================================

/**
 * ReflectionService — 反思生成服务
 *
 * 设计理念（参考 Generative Agents）：
 * 1. 当NPC的低重要性记忆积累到阈值（≥10条）时触发反思
 * 2. 反思过程：
 *    a. 检索最近的低重要性记忆
 *    b. 让LLM生成3个反思问题
 *    c. 针对每个问题检索相关记忆
 *    d. 综合生成反思摘要
 * 3. 反思结果作为高重要性记忆写回记忆流
 * 4. 定时批量触发（每2小时游戏时间）
 */
class ReflectionService {
  /** 触发反思的低重要性记忆阈值 */
  private reflectionThreshold = 10

  /** 低重要性阈值 */
  private lowImportanceThreshold = 3

  /** 反思间隔（毫秒），默认30分钟现实时间 */
  private reflectionInterval = 30 * 60 * 1000

  /** 上次反思时间 */
  private lastReflectionTime: Map<string, number> = new Map()

  /** 批量反思进度 */
  private batchProgress: ReflectionBatchProgress = {
    totalNpcs: 0,
    completed: 0,
    succeeded: 0,
    failed: 0,
    isRunning: false,
  }

  /** BUG-011修复: 反思服务并发锁，防止多个调度器Tick同时触发batchReflection */
  private reflectionLock: Map<string, boolean> = new Map()

  /** 定时器 */
  private reflectionTimer: ReturnType<typeof setInterval> | null = null

  /**
   * 检查NPC是否需要反思
   */
  async checkReflectionNeeded(npcId: string): Promise<ReflectionTrigger | null> {
    // 检查冷却时间
    const lastTime = this.lastReflectionTime.get(npcId) ?? 0
    const now = Date.now()
    if (now - lastTime < this.reflectionInterval) {
      return null // 还在冷却中
    }

    // 检查低重要性记忆数量
    const lowImportanceCount = await prisma.nPCMemory.count({
      where: {
        npcId,
        importance: { lte: this.lowImportanceThreshold },
        archived: false,
        type: { in: ['observation', 'dialogue'] },
      },
    })

    if (lowImportanceCount >= this.reflectionThreshold) {
      return {
        npcId,
        reason: 'low_importance_accumulated',
        candidateCount: lowImportanceCount,
      }
    }

    return null
  }

  /**
   * 执行反思生成 — 核心方法
   * BUG-011修复: 添加per-NPC锁，防止同一NPC的反思被并发调用
   *
   * 步骤：
   * 1. 获取最近的低重要性记忆
   * 2. 生成反思问题
   * 3. 针对每个问题检索相关记忆
   * 4. 综合生成反思摘要
   * 5. 写回记忆流
   */
  async generateReflection(npcId: string): Promise<ReflectionResult> {
    // BUG-011修复: 检查锁
    if (this.reflectionLock.get(npcId)) {
      logger.debug(`[${npcId}] Reflection already in progress, skipping`)
      return {
        npcId,
        content: '',
        sourceMemoryIds: [],
        importance: 0,
        insights: [],
        duration: 0,
        success: false,
      }
    }

    this.reflectionLock.set(npcId, true)
    const startTime = Date.now()
    const profile = profileLoader.getProfile(npcId)

    if (!profile) {
      throw new Error(`NPC profile not found: ${npcId}`)
    }

    try {
      logger.info(`[${npcId}] Generating reflection for ${profile.name}`)

      // 1. 获取最近低重要性记忆
      const lowMemories = await prisma.nPCMemory.findMany({
        where: {
          npcId,
          importance: { lte: this.lowImportanceThreshold },
          archived: false,
          type: { in: ['observation', 'dialogue'] },
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      })

      if (lowMemories.length < 3) {
        return {
          npcId,
          content: '',
          sourceMemoryIds: [],
          importance: 0,
          insights: [],
          duration: Date.now() - startTime,
          success: false,
        }
      }

      const memorySummaries = lowMemories
        .map((m, i) => `[${i + 1}] (${m.type}, 重要度${m.importance}) ${m.content}`)
        .join('\n')

      // 2. 生成反思问题
      const questionPrompt = `你是一个名为${profile.name}的角色，生活在星火小镇。
你的性格：${profile.personality}
你最近的经历：
${memorySummaries}

基于以上经历，生成3个最深层的反思问题，这些问题应该帮助你理解这些经历背后的含义。
格式：每行一个问题，不带编号。`

      const questionResponse = await modelRouter.chat(
        [{ role: 'user', content: questionPrompt }],
        ModelPurpose.Reflect,
      )

      const questions = questionResponse.content
        .split('\n')
        .map((q) => q.trim())
        .filter((q) => q.length > 0)
        .slice(0, 3)

      // 3. 针对每个问题检索相关记忆
      const relevantMemories: Map<string, VectorSearchResult[]> = new Map()

      for (const question of questions) {
        try {
          const searchResults = await retrievalRankService.retrieveWithPreset('reflection', {
            query: question,
            npcId,
            limit: 5,
          })
          relevantMemories.set(question, searchResults.memories)
        } catch {
          // 检索失败时跳过
          relevantMemories.set(question, [])
        }
      }

      // 4. 综合生成反思摘要
      let reflectionContext = `你是${profile.name}。你的性格：${profile.personality}\n\n`
      reflectionContext += '=== 最近经历 ===\n' + memorySummaries + '\n\n'
      reflectionContext += '=== 反思问题与相关记忆 ===\n'

      for (const [question, memories] of relevantMemories) {
        reflectionContext += `\n问题：${question}\n`
        if (memories.length > 0) {
          reflectionContext += '相关记忆：\n'
          for (const m of memories) {
            reflectionContext += `- ${m.content}\n`
          }
        } else {
          reflectionContext += '（无相关记忆）\n'
        }
      }

      const reflectionPrompt = `${reflectionContext}

请基于以上所有信息，以${profile.name}的第一人称视角写一段深刻的反思。
要求：
1. 总结最近的经历给你带来的感悟
2. 分析这些经历如何影响你的想法和目标
3. 提出至少2个具体的洞察或决定
4. 语气要符合你的性格：${profile.speechStyle.join('、')}
5. 字数100-200字`

      const reflectionResponse = await modelRouter.chat(
        [{ role: 'user', content: reflectionPrompt }],
        ModelPurpose.Reflect,
      )

      const reflectionContent = reflectionResponse.content.trim()
      const insights = this.extractInsights(reflectionContent)

      // 5. 计算反思重要度（比源记忆高）
      const sourceImportance = lowMemories.reduce((sum, m) => sum + m.importance, 0) / lowMemories.length
      const reflectionImportance = Math.min(10, Math.round(sourceImportance + 3))

      // 6. 写回记忆流
      const sourceMemoryIds = lowMemories.map((m) => m.id)
      await memoryStream.writeReflection({
        npcId,
        content: reflectionContent,
        sourceMemoryIds,
        importance: reflectionImportance,
      })

      // 7. 归档已反思的低重要性记忆
      await prisma.nPCMemory.updateMany({
        where: {
          id: { in: sourceMemoryIds },
        },
        data: { archived: true },
      })

      // 8. 更新反思时间
      this.lastReflectionTime.set(npcId, Date.now())

      // 9. 更新NPC运行时目标（如果有洞察）
      if (insights.length > 0) {
        profileLoader.updateRuntimeState(npcId, {
          currentGoal: insights[0],
          lastUpdate: Date.now(),
        })
      }

      logger.info(`[${npcId}] Reflection generated: ${reflectionContent.substring(0, 50)}...`)

      return {
        npcId,
        content: reflectionContent,
        sourceMemoryIds,
        importance: reflectionImportance,
        insights,
        duration: Date.now() - startTime,
        success: true,
        tokenUsage: {
          promptTokens:
            (questionResponse.usage?.promptTokens ?? 0) +
            (reflectionResponse.usage?.promptTokens ?? 0),
          completionTokens:
            (questionResponse.usage?.completionTokens ?? 0) +
            (reflectionResponse.usage?.completionTokens ?? 0),
          totalTokens:
            (questionResponse.usage?.totalTokens ?? 0) +
            (reflectionResponse.usage?.totalTokens ?? 0),
        },
      }
    } catch (err) {
      logger.error(`[${npcId}] Reflection generation failed: ${(err as Error).message}`)

      return {
        npcId,
        content: '',
        sourceMemoryIds: [],
        importance: 0,
        insights: [],
        duration: Date.now() - startTime,
        success: false,
      }
    } finally {
      // BUG-011修复: 释放锁
      this.reflectionLock.delete(npcId)
    }
  }

  /**
   * 批量执行所有NPC的反思
   */
  async batchReflection(): Promise<ReflectionBatchProgress> {
    if (this.batchProgress.isRunning) {
      return this.batchProgress
    }

    const profiles = profileLoader.getAllProfiles()
    this.batchProgress = {
      totalNpcs: profiles.length,
      completed: 0,
      succeeded: 0,
      failed: 0,
      isRunning: true,
    }

    for (const profile of profiles) {
      try {
        const trigger = await this.checkReflectionNeeded(profile.id)
        if (!trigger) {
          this.batchProgress.completed++
          continue
        }

        const result = await this.generateReflection(profile.id)

        if (result.success) {
          this.batchProgress.succeeded++
        } else {
          this.batchProgress.failed++
        }
      } catch {
        this.batchProgress.failed++
      }

      this.batchProgress.completed++
    }

    this.batchProgress.isRunning = false
    return this.batchProgress
  }

  /**
   * 启动定时反思
   */
  startReflectionTimer(): void {
    if (this.reflectionTimer) return

    this.reflectionTimer = setInterval(async () => {
      logger.info('Scheduled reflection tick...')
      await this.batchReflection()
    }, this.reflectionInterval)

    logger.info(`Reflection timer started (interval: ${this.reflectionInterval}ms)`)
  }

  /**
   * 停止定时反思
   */
  stopReflectionTimer(): void {
    if (this.reflectionTimer) {
      clearInterval(this.reflectionTimer)
      this.reflectionTimer = null
      logger.info('Reflection timer stopped')
    }
  }

  // =============================================
  // 辅助方法
  // =============================================

  /**
   * 从反思文本中提取洞察
   */
  private extractInsights(reflectionContent: string): string[] {
    const insights: string[] = []

    // 按句号分割，提取包含决定性词语的句子
    const sentences = reflectionContent
      .split(/[。！？\n]/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0)

    const decisionKeywords = ['决定', '应该', '需要', '必须', '打算', '以后', '不再', '想要']
    const insightKeywords = ['意识到', '发现', '明白', '理解', '认识到', '体会到', '领悟']

    for (const sentence of sentences) {
      const isDecision = decisionKeywords.some((kw) => sentence.includes(kw))
      const isInsight = insightKeywords.some((kw) => sentence.includes(kw))

      if (isDecision || isInsight) {
        insights.push(sentence)
      }
    }

    return insights.slice(0, 3) // 最多3个洞察
  }

  // =============================================
  // 管理接口
  // =============================================

  /** 设置反思触发阈值 */
  setReflectionThreshold(threshold: number): void {
    this.reflectionThreshold = threshold
    logger.info(`Reflection threshold set to ${threshold}`)
  }

  /** 设置反思间隔（分钟） */
  setReflectionInterval(minutes: number): void {
    this.reflectionInterval = minutes * 60 * 1000
    logger.info(`Reflection interval set to ${minutes}min`)

    // 如果定时器正在运行，重启
    if (this.reflectionTimer) {
      this.stopReflectionTimer()
      this.startReflectionTimer()
    }
  }

  /** 获取批量反思进度 */
  getBatchProgress(): ReflectionBatchProgress {
    return { ...this.batchProgress }
  }

  /** 获取NPC上次反思时间 */
  getLastReflectionTime(npcId: string): number | undefined {
    return this.lastReflectionTime.get(npcId)
  }
}

/** 全局反思生成服务实例 */
export const reflectionService = new ReflectionService()

// 避免未使用导入的编译错误
type VectorSearchResult = import('./embeddingService.js').VectorSearchResult
