// 星火小镇 — 信息传播机制
// T2.7.3 八卦传播、传播概率、信息失真

import { createLogger } from '../utils/index.js'
import { profileLoader } from './profileLoader.js'
import { memoryStream } from './memoryStream.js'
import { modelRouter, ModelPurpose } from './modelRouter.js'
import { relationNetwork } from './relationNetwork.js'

const logger = createLogger('InfoPropagation')

// =============================================
// 类型定义
// =============================================

/** 信息传播方式 */
export type PropagationMethod = 'direct' | 'gossip' | 'overhear'

/** 传播信息 */
export interface PropagatableInfo {
  /** 信息ID */
  id: string
  /** 信息来源NPC ID */
  sourceNpcId: string
  /** 信息内容 */
  content: string
  /** 原始内容（未失真） */
  originalContent: string
  /** 信息类型 */
  infoType: 'secret' | 'gossip' | 'quest' | 'event' | 'observation'
  /** 重要度 (1-10) */
  importance: number
  /** 传播次数 */
  propagationCount: number
  /** 最大传播次数 */
  maxPropagations: number
  /** 已知此信息的NPC ID集合 */
  knownByNpcIds: string[]
  /** 创建时间 */
  createdAt: number
  /** 失真级别（0=原始，每传播一次+1） */
  distortionLevel: number
}

/** 传播事件 */
export interface PropagationEvent {
  /** 传播方式 */
  method: PropagationMethod
  /** 传播者NPC ID */
  propagatorId: string
  /** 接收者NPC ID */
  receiverId: string
  /** 传播的信息 */
  info: PropagatableInfo
  /** 传播后的内容（可能失真） */
  propagatedContent: string
  /** 传播概率 */
  probability: number
  /** 是否成功 */
  success: boolean
  /** 时间戳 */
  timestamp: number
}

/** 信息传播配置 */
export interface PropagationConfig {
  /** 基础传播概率，默认0.3 */
  baseProbability: number
  /** 好友加成概率，默认0.2 */
  friendBonus: number
  /** 八卦类加成概率，默认0.3 */
  gossipBonus: number
  /** 秘密类传播惩罚，默认-0.2 */
  secretPenalty: number
  /** 每次传播的失真概率，默认0.3 */
  distortionChance: number
  /** 最大传播次数，默认10 */
  maxPropagations: number
  /** 传播间隔（秒），默认60 */
  propagationInterval: number
  /** 是否启用信息失真，默认true */
  enableDistortion: boolean
}

/** 传播统计 */
export interface PropagationStats {
  /** 总传播次数 */
  totalPropagations: number
  /** 成功传播次数 */
  successfulPropagations: number
  /** 总信息数 */
  totalInfos: number
  /** 平均传播次数 */
  avgPropagations: number
  /** 失真事件数 */
  distortionEvents: number
}

// =============================================
// 信息传播机制
// =============================================

/**
 * InfoPropagationService — 信息传播机制
 *
 * 设计理念：
 * 1. NPC获得的信息可通过社交对话传播给其他NPC
 * 2. 传播概率受关系、信息类型、重要度等因素影响
 * 3. 信息在传播过程中可能失真（细节改变、夸大、遗漏）
 * 4. 秘密类信息传播概率低但更有趣
 * 5. 八卦类信息传播概率高（NPC喜欢传八卦）
 * 6. 传播次数有限，防止信息无限扩散
 */
class InfoPropagationService {
  /** 配置 */
  private config: PropagationConfig = {
    baseProbability: 0.3,
    friendBonus: 0.2,
    gossipBonus: 0.3,
    secretPenalty: -0.2,
    distortionChance: 0.3,
    maxPropagations: 10,
    propagationInterval: 60,
    enableDistortion: true,
  }

  /** 活跃信息池 */
  private infoPool: Map<string, PropagatableInfo> = new Map()

  /** 信息ID计数器 */
  private infoCounter = 0

  /** 传播定时器 */
  private propagationTimer: ReturnType<typeof setInterval> | null = null

  /** 统计 */
  private stats = {
    totalPropagations: 0,
    successfulPropagations: 0,
    totalInfos: 0,
    distortionEvents: 0,
  }

  // =============================================
  // 信息管理
  // =============================================

  /**
   * 创建可传播信息
   */
  createInfo(params: {
    sourceNpcId: string
    content: string
    infoType: PropagatableInfo['infoType']
    importance?: number
  }): PropagatableInfo {
    const info: PropagatableInfo = {
      id: `info-${++this.infoCounter}`,
      sourceNpcId: params.sourceNpcId,
      content: params.content,
      originalContent: params.content,
      infoType: params.infoType,
      importance: params.importance ?? 5,
      propagationCount: 0,
      maxPropagations: this.config.maxPropagations,
      knownByNpcIds: [params.sourceNpcId],
      createdAt: Date.now(),
      distortionLevel: 0,
    }

    this.infoPool.set(info.id, info)
    this.stats.totalInfos++

    logger.debug(`[${info.id}] Created: ${params.content.substring(0, 40)}... (type=${params.infoType})`)

    return info
  }

  /**
   * 从NPC对话结果中提取可传播信息
   */
  extractInfoFromDialogue(
    sourceNpcId: string,
    keyInformation: string[],
    infoType: PropagatableInfo['infoType'] = 'gossip',
  ): PropagatableInfo[] {
    const infos: PropagatableInfo[] = []

    for (const content of keyInformation) {
      // 只传播非空且有意义的信息
      if (!content || content.length < 5) continue

      const importance = this.estimateImportance(content, infoType)
      const info = this.createInfo({
        sourceNpcId,
        content,
        infoType,
        importance,
      })

      infos.push(info)
    }

    return infos
  }

  // =============================================
  // 核心传播逻辑
  // =============================================

  /**
   * 执行一次传播检查 — 在NPC间对话时调用
   * @param propagatorId - 传播者NPC ID
   * @param receiverId - 接收者NPC ID
   */
  async propagateBetween(
    propagatorId: string,
    receiverId: string,
  ): Promise<PropagationEvent[]> {
    const events: PropagationEvent[] = []

    // 获取传播者知道的信息
    const propagatorInfos = this.getInfosKnownBy(propagatorId)

    for (const info of propagatorInfos) {
      // 跳过接收者已知的
      if (info.knownByNpcIds.includes(receiverId)) continue

      // 跳过已达到最大传播次数的
      if (info.propagationCount >= info.maxPropagations) continue

      // 计算传播概率
      const probability = this.calculatePropagationProbability(
        propagatorId,
        receiverId,
        info,
      )

      // 掷骰
      const success = Math.random() < probability

      const event = await this.executePropagation(
        propagatorId,
        receiverId,
        info,
        probability,
        success,
      )

      events.push(event)
      this.stats.totalPropagations++

      if (success) {
        this.stats.successfulPropagations++
      }
    }

    return events
  }

  /**
   * 计算传播概率
   */
  private calculatePropagationProbability(
    propagatorId: string,
    receiverId: string,
    info: PropagatableInfo,
  ): number {
    let probability = this.config.baseProbability

    // 信息类型影响
    switch (info.infoType) {
      case 'gossip':
        probability += this.config.gossipBonus
        break
      case 'secret':
        probability += this.config.secretPenalty
        break
      case 'quest':
        probability += 0.1
        break
      case 'event':
        probability += 0.15
        break
    }

    // 关系影响 — 好友之间更容易分享
    // 简化：使用NPC间关系（如果有）
    const relation = this.getNpcRelation(propagatorId, receiverId)
    if (relation === 'friend') {
      probability += this.config.friendBonus
    } else if (relation === 'enemy') {
      probability -= 0.3
    }

    // 重要度影响 — 重要信息更可能传播
    probability += (info.importance - 5) * 0.03

    // 失真越高，传播概率略降低（信息变模糊了）
    probability -= info.distortionLevel * 0.05

    // 限制在 [0.05, 0.95]
    return Math.max(0.05, Math.min(0.95, probability))
  }

  /**
   * 执行单次传播
   */
  private async executePropagation(
    propagatorId: string,
    receiverId: string,
    info: PropagatableInfo,
    probability: number,
    success: boolean,
  ): Promise<PropagationEvent> {
    let propagatedContent = info.content

    if (success) {
      // 信息失真
      if (this.config.enableDistortion && Math.random() < this.config.distortionChance) {
        propagatedContent = await this.distortInfo(info.content, info.distortionLevel)
        info.distortionLevel++
        this.stats.distortionEvents++
      }

      // 更新信息状态
      info.propagationCount++
      info.knownByNpcIds.push(receiverId)
      info.content = propagatedContent

      // 写入接收者的记忆
      const receiverProfile = profileLoader.getProfile(receiverId)
      if (receiverProfile) {
        await memoryStream.writeObservation({
          npcId: receiverId,
          content: `听说：${propagatedContent}`,
          importance: Math.max(1, info.importance - info.distortionLevel),
          source: 'perception',
        })
      }

      logger.debug(
        `[${info.id}] Propagated: ${propagatorId} → ${receiverId} ` +
        `(prob=${probability.toFixed(2)}, distort=${info.distortionLevel})`,
      )
    }

    return {
      method: 'gossip',
      propagatorId,
      receiverId,
      info: { ...info },
      propagatedContent,
      probability,
      success,
      timestamp: Date.now(),
    }
  }

  // =============================================
  // 信息失真
  // =============================================

  /**
   * 信息失真 — 改变信息的某些细节
   *
   * 失真类型：
   * 1. 夸大：数字变大、程度加深
   * 2. 遗漏：丢失部分细节
   * 3. 混淆：相似概念替换
   */
  private async distortInfo(content: string, currentLevel: number): Promise<string> {
    // 低级别失真使用规则，高级别调用LLM
    if (currentLevel < 2) {
      return this.ruleBasedDistortion(content)
    }

    try {
      const response = await modelRouter.chat(
        [
          {
            role: 'system',
            content: '你是一个信息传播失真模拟器。在传播过程中，信息会有细微变化。保持大致意思但改变一些细节。',
          },
          {
            role: 'user',
            content: `请将以下信息稍微扭曲一下（保持大意但改变一些细节，比如数字可能变大、描述可能夸大）：

原文：${content}

要求：只输出失真后的内容，不要解释。`,
          },
        ],
        ModelPurpose.Fast,
        undefined,
        { skipReasoning: true },
      )

      return response.content.trim()
    } catch {
      // 降级到规则失真
      return this.ruleBasedDistortion(content)
    }
  }

  /**
   * 规则基础的信息失真
   */
  private ruleBasedDistortion(content: string): string {
    // 数字夸大
    let distorted = content.replace(/(\d+)(个|只|次|块|件)/g, (_match, num, unit) => {
      const n = parseInt(num)
      const factor = 1 + Math.random() * 0.5 // 夸大1-1.5倍
      return `${Math.ceil(n * factor)}${unit}`
    })

    // 程度词增强
    const intensifiers: Record<string, string> = {
      '有点': '相当',
      '一些': '很多',
      '可能': '肯定',
      '据说': '确实',
      '好像': '绝对是',
    }

    for (const [from, to] of Object.entries(intensifiers)) {
      if (distorted.includes(from)) {
        distorted = distorted.replace(from, to)
        break // 只替换一个
      }
    }

    return distorted
  }

  // =============================================
  // 批量传播（定时触发）
  // =============================================

  /**
   * 执行一轮批量传播 — 所有活跃信息的传播检查
   */
  async runPropagationRound(): Promise<PropagationEvent[]> {
    const events: PropagationEvent[] = []
    const profiles = profileLoader.getAllProfiles().filter((p) => p.isActive)

    for (const info of this.infoPool.values()) {
      if (info.propagationCount >= info.maxPropagations) continue

      // 找到知道这个信息的NPC
      const knowers = info.knownByNpcIds.filter((id) =>
        profiles.some((p) => p.id === id),
      )

      for (const knowerId of knowers) {
        // 找到不知道这个信息的NPC
        const unknowns = profiles.filter(
          (p) => !info.knownByNpcIds.includes(p.id) && p.id !== knowerId,
        )

        if (unknowns.length === 0) continue

        // 随机选一个接收者
        const receiver = unknowns[Math.floor(Math.random() * unknowns.length)]

        const result = await this.propagateBetween(knowerId, receiver.id)
        events.push(...result)
      }
    }

    // 清理过老的信息
    this.cleanupOldInfos()

    return events
  }

  /**
   * 启动定时传播
   */
  startPropagationTimer(): void {
    if (this.propagationTimer) return

    this.propagationTimer = setInterval(async () => {
      await this.runPropagationRound()
    }, this.config.propagationInterval * 1000)

    logger.info(`Propagation timer started (interval: ${this.config.propagationInterval}s)`)
  }

  /**
   * 停止定时传播
   */
  stopPropagationTimer(): void {
    if (this.propagationTimer) {
      clearInterval(this.propagationTimer)
      this.propagationTimer = null
      logger.info('Propagation timer stopped')
    }
  }

  // =============================================
  // 辅助方法
  // =============================================

  /** 获取NPC已知的信息列表 */
  private getInfosKnownBy(npcId: string): PropagatableInfo[] {
    return Array.from(this.infoPool.values()).filter(
      (info) => info.knownByNpcIds.includes(npcId),
    )
  }

  /** 估算信息重要度 */
  private estimateImportance(content: string, infoType: PropagatableInfo['infoType']): number {
    let base = 5

    // 秘密重要度高
    if (infoType === 'secret') base = 8
    if (infoType === 'quest') base = 7
    if (infoType === 'event') base = 6
    if (infoType === 'gossip') base = 4

    // 内容包含关键词提升重要度
    const highImportanceKeywords = ['秘密', '封印', '暗影', '星火', '遗迹', '失踪']
    for (const keyword of highImportanceKeywords) {
      if (content.includes(keyword)) {
        base += 1
        break
      }
    }

    return Math.min(10, base)
  }

  /** 获取NPC间关系类型（通过关系网络服务） */
  private getNpcRelation(npcA: string, npcB: string): string {
    if (relationNetwork.isInitialized) {
      return relationNetwork.getRelationType(npcA, npcB)
    }
    // 兜底：如果关系网络未初始化，返回neutral
    return 'neutral'
  }

  /** 清理过期信息 */
  private cleanupOldInfos(): void {
    const maxAge = 24 * 60 * 60 * 1000 // 24小时
    const now = Date.now()

    for (const [_id, info] of this.infoPool) {
      if (now - info.createdAt > maxAge || info.propagationCount >= info.maxPropagations) {
        // 标记但不删除（可能还需要查询）
      }
    }
  }

  // =============================================
  // 查询与统计
  // =============================================

  /** 获取信息池 */
  getInfoPool(): PropagatableInfo[] {
    return Array.from(this.infoPool.values())
  }

  /** 获取指定NPC已知的信息 */
  getNpcKnownInfos(npcId: string): PropagatableInfo[] {
    return this.getInfosKnownBy(npcId)
  }

  /** 获取统计 */
  getStats(): PropagationStats {
    const totalInfos = this.infoPool.size
    const avgPropagations = totalInfos > 0
      ? Array.from(this.infoPool.values()).reduce((sum, i) => sum + i.propagationCount, 0) / totalInfos
      : 0

    return {
      totalPropagations: this.stats.totalPropagations,
      successfulPropagations: this.stats.successfulPropagations,
      totalInfos,
      avgPropagations: Math.round(avgPropagations * 10) / 10,
      distortionEvents: this.stats.distortionEvents,
    }
  }

  /** 更新配置 */
  updateConfig(config: Partial<PropagationConfig>): void {
    this.config = { ...this.config, ...config }
  }
}

/** 全局信息传播服务实例 */
export const infoPropagationService = new InfoPropagationService()
