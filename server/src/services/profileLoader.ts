// 星火小镇 — NPC角色档案加载器
// T2.2.3 从数据库/JSON文件加载NPC档案到内存

import { readFile } from 'fs/promises'
import { resolve, join } from 'path'
import { createLogger } from '../utils/index.js'
import { prisma } from '../models/prisma.js'
import type {
  NPCProfile,
  NPCProfileCollection,
  NPCRuntimeState,
  ScheduleItem,
  NPCRole,
  PerceivedEvent,
} from '../types/npc-profile.js'

const logger = createLogger('ProfileLoader')

/**
 * NPCProfileLoader — 角色档案加载器
 *
 * 职责：
 * - 从JSON文件加载NPC档案（开发/初始数据）
 * - 从数据库加载NPC档案（运行时）
 * - 合并数据库和JSON文件数据（JSON覆盖数据库基础字段）
 * - 维护内存中的档案缓存
 * - 提供按ID/名字/角色的查询接口
 * - 初始化NPC运行时状态
 */
class NPCProfileLoader {
  /** 档案缓存（按ID索引） */
  private profiles: Map<string, NPCProfile> = new Map()

  /** 名字→ID映射 */
  private nameToId: Map<string, string> = new Map()

  /** 别名映射（npc-* 旧 id → 规范化后的 DB id）— 兼容主线任务/旧代码用 npc-* id 查询 */
  private aliases: Map<string, string> = new Map()

  /** NPC运行时状态（按ID索引） */
  private runtimeStates: Map<string, NPCRuntimeState> = new Map()

  /** BUG-006修复: 运行时状态版本号（CAS机制防止竞态） */
  private runtimeStateVersions: Map<string, number> = new Map()

  /** 是否已初始化 */
  private initialized = false

  /**
   * 初始化 — 从JSON文件和数据库加载所有NPC档案
   * @param dataDir - JSON档案文件所在目录（默认 server/data）
   */
  async initialize(dataDir?: string): Promise<void> {
    if (this.initialized) {
      logger.warn('Profile loader already initialized')
      return
    }

    logger.info('Initializing NPC profile loader...')

    // 1. 尝试从JSON文件加载核心NPC档案
    try {
      const dir = dataDir ?? resolve(process.cwd(), 'server/data')
      await this.loadFromDirectory(dir)
    } catch (err) {
      logger.warn(`Failed to load JSON profiles: ${(err as Error).message}`)
    }

    // 2. 从数据库加载并合并
    try {
      await this.loadFromDatabase()
    } catch (err) {
      logger.warn(`Failed to load database profiles: ${(err as Error).message}`)
    }

    // 3. 归一化世界坐标（DB/JSON 存储为旧 480×416 系坐标 → ×4 到 1920×1664 世界坐标）
    this.normalizeWorldCoordinates()

    // 4. 为每个NPC初始化运行时状态
    this.initializeRuntimeStates()

    this.initialized = true
    logger.info(`Profile loader initialized: ${this.profiles.size} NPCs loaded`)
  }

  /**
   * 归一化NPC世界坐标
   * 数据库/JSON 中存储的是旧坐标系（480×416 世界，16px tile），
   * 1920×1080 原生分辨率下地图为 1920×1664（64px tile），坐标 ×4 映射。
   * 注意：仅初始化时执行一次，避免重复放大。
   */
  private normalizeWorldCoordinates(): void {
    const SCALE = 4
    for (const profile of this.profiles.values()) {
      profile.x = Math.round(profile.x * SCALE)
      profile.y = Math.round(profile.y * SCALE)
    }
    logger.info(`NPC world coordinates normalized to 1920×1664 (×${SCALE})`)
  }

  /**
   * 从目录加载JSON档案文件（支持多个档案文件）
   */
  private async loadFromDirectory(dataDir: string): Promise<void> {
    // 加载核心NPC档案
    const coreFile = join(dataDir, 'npc-profiles-core.json')
    try {
      const content = await readFile(coreFile, 'utf-8')
      const collection: NPCProfileCollection = JSON.parse(content)
      this.mergeProfiles(collection.profiles)
      logger.info(`Loaded ${collection.profiles.length} core NPC profiles from JSON`)
    } catch {
      logger.info('No core NPC profile JSON file found')
    }

    // 加载次要NPC档案
    const secondaryFile = join(dataDir, 'npc-profiles-secondary.json')
    try {
      const content = await readFile(secondaryFile, 'utf-8')
      const collection: NPCProfileCollection = JSON.parse(content)
      this.mergeProfiles(collection.profiles)
      logger.info(`Loaded ${collection.profiles.length} secondary NPC profiles from JSON`)
    } catch {
      logger.info('No secondary NPC profile JSON file found')
    }

    // 加载剧情NPC档案
    const storyFile = join(dataDir, 'npc-profiles-story.json')
    try {
      const content = await readFile(storyFile, 'utf-8')
      const collection: NPCProfileCollection = JSON.parse(content)
      this.mergeProfiles(collection.profiles)
      logger.info(`Loaded ${collection.profiles.length} story NPC profiles from JSON`)
    } catch {
      logger.info('No story NPC profile JSON file found')
    }
  }

  /**
   * 从数据库加载NPC档案
   */
  private async loadFromDatabase(): Promise<void> {
    const dbNpcs = await prisma.nPC.findMany()
    let loaded = 0

    for (const npc of dbNpcs) {
      // 匹配 JSON 档案：DB id 是 uuid，JSON 用 npc-* id，按 id 找不到时按名字匹配，
      // 否则同一 NPC 会以两个 key 常驻内存（重复），且 JSON 里的对话数据（speechStyle 等）永远用不上
      let existingProfile = this.profiles.get(npc.id)
      if (!existingProfile) {
        existingProfile = this.getProfileByName(npc.name)
      }
      const schedule = this.parseSchedule(npc.schedule)

      const profile: NPCProfile = {
        id: npc.id,
        name: npc.name,
        // 人设/背景/头衔优先用 JSON 详细版（对话质量更好），缺省回退 DB 精简版
        title: existingProfile?.title ?? npc.title,
        role: npc.role as NPCRole,
        personality: existingProfile?.personality ?? npc.personality,
        backstory: existingProfile?.backstory ?? npc.backstory,
        speechStyle: existingProfile?.speechStyle ?? [],
        catchphrases: existingProfile?.catchphrases ?? [],
        likes: existingProfile?.likes ?? [],
        dislikes: existingProfile?.dislikes ?? [],
        motivations: existingProfile?.motivations ?? [],
        x: npc.x,
        y: npc.y,
        direction: npc.direction as NPCProfile['direction'],
        schedule,
        stats: {
          hp: npc.hp,
          maxHp: npc.maxHp,
          attack: npc.attack,
          defense: npc.defense,
          speed: npc.speed,
        },
        mood: existingProfile?.mood ?? 'neutral',
        isActive: npc.isActive,
        version: existingProfile?.version ?? 1,
        metadata: existingProfile?.metadata ?? {},
      }

      // 合并 JSON 扩展数据
      if (existingProfile) {
        profile.speechStyle = existingProfile.speechStyle
        profile.catchphrases = existingProfile.catchphrases
        profile.likes = existingProfile.likes
        profile.dislikes = existingProfile.dislikes
        profile.motivations = existingProfile.motivations
        profile.mood = existingProfile.mood
        profile.metadata = { ...existingProfile.metadata, dbId: npc.id }
      }

      this.profiles.set(npc.id, profile)
      this.nameToId.set(npc.name, npc.id)

      // JSON 的 npc-* 旧 key 注册为别名，指向合并后的 DB 档案（主线任务/旧代码仍用 npc-* id 查询）。
      // 注意只做别名映射、不写入 profiles Map，避免同一对象被 normalizeWorldCoordinates 重复缩放
      if (existingProfile && existingProfile.id !== npc.id) {
        this.aliases.set(existingProfile.id, npc.id)
      }
      loaded++
    }

    if (loaded > 0) {
      logger.info(`Loaded/merged ${loaded} NPC profiles from database`)
    }
  }

  /**
   * 合并档案列表到缓存
   */
  private mergeProfiles(profiles: NPCProfile[]): void {
    for (const profile of profiles) {
      this.profiles.set(profile.id, profile)
      this.nameToId.set(profile.name, profile.id)
    }
  }

  /**
   * 解析Schedule JSON
   */
  private parseSchedule(scheduleJson: unknown): ScheduleItem[] {
    if (Array.isArray(scheduleJson)) {
      return scheduleJson.map((item: any) => ({
        hour: item.hour ?? 0,
        location: item.location ?? '',
        action: item.action ?? '',
      }))
    }
    return []
  }

  /**
   * 为所有NPC初始化运行时状态
   */
  private initializeRuntimeStates(): void {
    for (const [id] of this.profiles) {
      if (!this.runtimeStates.has(id)) {
        this.runtimeStates.set(id, {
          profileId: id,
          currentAction: 'idle',
          talkingTo: null,
          recentEvents: [],
          shortTermMemory: [],
          currentGoal: null,
          lastUpdate: Date.now(),
        })
      }
    }
  }

  // =============================================
  // 查询接口
  // =============================================

  /**
   * 按ID获取NPC档案
   * 修复：前端可能传入占位短ID/名字（如ella/艾拉），回退到名字匹配
   */
  getProfile(id: string): NPCProfile | undefined {
    const direct = this.profiles.get(id)
    if (direct) return direct
    // 回退1：别名（npc-* 旧 id → DB id）
    const canonical = this.aliases.get(id)
    if (canonical) return this.profiles.get(canonical)
    // 回退2：按名字匹配
    const byName = this.nameToId.get(id)
    if (byName) return this.profiles.get(byName)
    // 回退2：遍历名字包含匹配（兼容别名）
    for (const profile of this.profiles.values()) {
      if (profile.name === id || profile.title === id) return profile
    }
    return undefined
  }

  /**
   * 按名字获取NPC档案
   */
  getProfileByName(name: string): NPCProfile | undefined {
    const id = this.nameToId.get(name)
    return id ? this.profiles.get(id) : undefined
  }

  /**
   * 按角色类型获取NPC列表
   */
  getProfilesByRole(role: NPCRole): NPCProfile[] {
    return Array.from(this.profiles.values()).filter((p) => p.role === role)
  }

  /**
   * 获取所有NPC档案
   */
  getAllProfiles(): NPCProfile[] {
    return Array.from(this.profiles.values())
  }

  /**
   * 获取NPC运行时状态
   */
  getRuntimeState(id: string): NPCRuntimeState | undefined {
    return this.runtimeStates.get(id)
  }

  /**
   * 更新NPC运行时状态
   * BUG-006修复: 添加版本号CAS机制，防止并发修改导致数据覆盖
   */
  updateRuntimeState(id: string, update: Partial<NPCRuntimeState>, expectedVersion?: number): boolean {
    const current = this.runtimeStates.get(id)
    if (!current) return false

    // CAS: 如果传入了expectedVersion，检查是否匹配
    if (expectedVersion !== undefined) {
      const currentVersion = this.runtimeStateVersions.get(id) ?? 0
      if (currentVersion !== expectedVersion) {
        // 版本不匹配，拒绝更新（CAS失败）
        return false
      }
    }

    // 执行更新
    Object.assign(current, update, { lastUpdate: Date.now() })

    // 递增版本号
    const newVersion = (this.runtimeStateVersions.get(id) ?? 0) + 1
    this.runtimeStateVersions.set(id, newVersion)

    return true
  }

  /**
   * BUG-006修复: 获取运行时状态版本号
   */
  getRuntimeStateVersion(id: string): number {
    return this.runtimeStateVersions.get(id) ?? 0
  }

  /**
   * 添加短期记忆
   */
  addShortTermMemory(npcId: string, memory: { role: 'player' | 'npc' | 'system'; speaker: string; content: string }): void {
    const state = this.runtimeStates.get(npcId)
    if (!state) return

    state.shortTermMemory.push({
      ...memory,
      timestamp: Date.now(),
    })

    // 保留最近5轮（10条消息）
    if (state.shortTermMemory.length > 10) {
      state.shortTermMemory = state.shortTermMemory.slice(-10)
    }
  }

  /**
   * 添加感知事件
   */
  addPerceivedEvent(npcId: string, event: { type: PerceivedEvent['type']; sourceId: string; content: string; importance: number; metadata?: Record<string, any> }): void {
    const state = this.runtimeStates.get(npcId)
    if (!state) return

    state.recentEvents.push({
      ...event,
      timestamp: Date.now(),
    })

    // 保留最近20个事件
    if (state.recentEvents.length > 20) {
      state.recentEvents = state.recentEvents.slice(-20)
    }
  }

  /**
   * 清空NPC感知事件
   */
  clearEvents(npcId: string): void {
    const state = this.runtimeStates.get(npcId)
    if (state) {
      state.recentEvents = []
    }
  }

  /**
   * 获取加载的NPC数量
   */
  get size(): number {
    return this.profiles.size
  }

  /**
   * 是否已初始化
   */
  get isInitialized(): boolean {
    return this.initialized
  }

  /**
   * 获取NPC的当前日程项
   */
  getCurrentScheduleItem(npcId: string, gameHour: number): ScheduleItem | null {
    const profile = this.profiles.get(npcId)
    if (!profile || profile.schedule.length === 0) return null

    let current: ScheduleItem | null = null
    for (const item of profile.schedule) {
      if (item.hour <= gameHour) {
        current = item
      } else {
        break
      }
    }
    return current ?? profile.schedule[0]
  }

  /**
   * 刷新 — 重新从数据库加载（用于热更新）
   */
  async refresh(): Promise<void> {
    logger.info('Refreshing NPC profiles from database...')
    this.profiles.clear()
    this.nameToId.clear()
    this.aliases.clear()
    this.runtimeStates.clear()
    this.initialized = false
    await this.initialize()
  }
}

/** 全局NPC档案加载器实例 */
export const profileLoader = new NPCProfileLoader()
