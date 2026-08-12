// 星火小镇 — 时间驱动主线任务服务（升级打怪玩法 + 关系驱动剧情故事）
// T6.8.x 主线剧情内加入升级打怪玩法：
// - 随着游戏时间推移自动弹出主线任务（弹窗提醒）
// - 玩家确认后才正式接受该任务（待确认机制）
// - 完成当前任务后才计时进入下一个任务（串行推进）
// T6.12.x 参考斯坦福小镇：固定打怪主线打完后，主线剧情转为"关系驱动"——
// 大模型读取 NPC 关系网络（敌/友/家庭/竞争），动态生成有意思的联系与冲突作为主线任务。

import { createLogger } from '../utils/index.js'
import { gameClock } from './gameClock.js'
import { questEngine } from './questEngine.js'
import { prisma } from '../models/prisma.js'
import { relationNetwork } from './relationNetwork.js'
import { profileLoader } from './profileLoader.js'
import { llmService } from './llmService.js'
import type { QuestDefinition, QuestObjective } from './questTypes.js'

const logger = createLogger('MainlineQuest')

/** T6.12 现实时间弹窗冷却：最多现实 5 分钟弹一次任务（毫秒） */
const POPUP_REAL_COOLDOWN_MS = 5 * 60 * 1000

// =============================================
// 主线任务（升级打怪）定义
// =============================================

/** 任务触发时间 */
export interface MissionTriggerTime {
  /** 第几天触发 */
  day: number
  /** 触发小时（0-23） */
  hour: number
}

/** 主线任务目标 */
export interface MainlineMissionObjective {
  id: string
  description: string
  /** 目标类型（talk_to_npc 熟悉NPC / visit_area 探索解锁地图 / kill_enemy 打怪） */
  type: 'talk_to_npc' | 'visit_area' | 'kill_enemy'
  /** 目标ID（NPC名字/场景ID/敌人ID） */
  targetId: string
  /** 所需数量 */
  count: number
}

/** 主线任务定义 */
export interface MainlineMissionDef {
  /** 任务ID（mainline_ 前缀） */
  questId: string
  /** 任务标题 */
  title: string
  /** 任务描述 */
  description: string
  /** 触发时间（游戏时间） */
  triggerAt: MissionTriggerTime
  /**
   * 发布所需章节（地图解锁条件，T6.15 逻辑修复）：
   * 任务发布地点必须在已解锁地图内 —— 章节未达到时不发布，等待解锁后再弹出。
   * 0=序章（小镇）/1=第一章（低语森林）/2=第二章（废弃矿洞）/3=第三章（全部开放）
   */
  requiredChapter: number
  /** 发布NPC档案ID（该NPC必须已解锁） */
  giverNpcId: string
  /** 任务目标（支持熟悉NPC/探索解锁地图/打怪） */
  objectives: MainlineMissionObjective[]
  /** 经验奖励 */
  rewardExp: number
  /** 星币奖励 */
  rewardCoins: number
  /** 推荐等级 */
  suggestedLevel: number
}

/** 章节提供器：返回玩家当前剧情章节（由 index.ts 注入，避免循环依赖） */
export type ChapterProvider = (playerId: string) => Promise<{ currentChapter: number } | null>

/**
 * 循序渐进主线任务链（"星火之旅"）
 * T6.15 逻辑修复：任务发布地点必须在已解锁地图内（requiredChapter 绑定地图解锁章节）：
 *  - 序章(0)：小镇 —— 熟悉主要NPC（对话）→ 小镇周边战斗
 *  - 第一章(1)：低语森林解锁 —— 森林探索（visit_area）→ 森林敌人
 *  - 第二章(2)：废弃矿洞解锁 —— 矿洞探索（visit_area）→ 矿洞敌人
 *  - 第三章(3)：全部开放 —— 最终BOSS战
 * 触发节奏：Day1 熟悉小镇/战斗训练 → Day2 森林 → Day3 矿洞 → Day4 BOSS收尾
 */
export const MAINLINE_MISSIONS: MainlineMissionDef[] = [
  // ============ 序章（章节0：星火小镇）============
  {
    questId: 'mainline_greetings',
    title: '初来乍到',
    description: '初到星火小镇，先去星光酒馆、铁砧工坊和魔法药剂店，认识几位关键居民——他们会是你日后冒险的伙伴。',
    triggerAt: { day: 1, hour: 8 },
    requiredChapter: 0,
    giverNpcId: 'npc-margaret',
    objectives: [
      { id: 'obj_talk_margaret', description: '与酒馆老板娘玛格丽特交谈', type: 'talk_to_npc', targetId: '玛格丽特', count: 1 },
      { id: 'obj_talk_bark', description: '与铁匠老巴克交谈', type: 'talk_to_npc', targetId: '老巴克', count: 1 },
      { id: 'obj_talk_ayla', description: '与药剂师艾拉交谈', type: 'talk_to_npc', targetId: '艾拉', count: 1 },
    ],
    rewardExp: 30,
    rewardCoins: 20,
    suggestedLevel: 1,
  },
  {
    questId: 'mainline_town_rounds',
    title: '小镇的问候',
    description: '集市、温馨小屋和广场的居民们也在等着与你打招呼。多认识一些人，消息才会流通起来。',
    triggerAt: { day: 1, hour: 10 },
    requiredChapter: 0,
    giverNpcId: 'npc-rosie',
    objectives: [
      { id: 'obj_talk_rosie', description: '与集市老板罗西交谈', type: 'talk_to_npc', targetId: '罗西', count: 1 },
      { id: 'obj_talk_lily', description: '与温馨小屋的莉莉交谈', type: 'talk_to_npc', targetId: '莉莉', count: 1 },
      { id: 'obj_talk_pip', description: '与广场上的小皮普交谈', type: 'talk_to_npc', targetId: '小皮普', count: 1 },
    ],
    rewardExp: 40,
    rewardCoins: 30,
    suggestedLevel: 1,
  },
  {
    questId: 'mainline_wolves',
    title: '荒野之狼出没',
    description: '镇外荒野的狼群最近异常凶悍，铁匠老巴克说它们已经咬伤了好几头驮马，请求冒险者前往讨伐。',
    triggerAt: { day: 1, hour: 12 },
    requiredChapter: 0,
    giverNpcId: 'npc-bark',
    objectives: [
      { id: 'obj_kill_wolf', description: '击杀荒野之狼', type: 'kill_enemy', targetId: 'enemy_wolf', count: 3 },
    ],
    rewardExp: 60,
    rewardCoins: 40,
    suggestedLevel: 2,
  },
  {
    questId: 'mainline_goblins',
    title: '哥布林骚扰',
    description: '一群哥布林盯上了小镇东边的粮仓，集市老板罗西焦急万分——粮食是全镇过冬的依靠，请务必赶走它们。',
    triggerAt: { day: 1, hour: 14 },
    requiredChapter: 0,
    giverNpcId: 'npc-rosie',
    objectives: [
      { id: 'obj_kill_goblin', description: '击杀洞穴哥布林', type: 'kill_enemy', targetId: 'enemy_goblin', count: 4 },
    ],
    rewardExp: 80,
    rewardCoins: 60,
    suggestedLevel: 3,
  },
  // ============ 第一章（章节1：低语森林解锁）============
  {
    questId: 'mainline_forest_gate',
    title: '森林的低语',
    description: '游商托比带来了消息：小镇北方的低语森林入口雾气正在散开。与托比谈谈，然后前往低语森林一探究竟。',
    triggerAt: { day: 2, hour: 8 },
    requiredChapter: 1,
    giverNpcId: 'npc-toby',
    objectives: [
      { id: 'obj_talk_toby_forest', description: '与托比了解森林情况', type: 'talk_to_npc', targetId: '托比', count: 1 },
      { id: 'obj_visit_forest', description: '前往低语森林', type: 'visit_area', targetId: 'forest', count: 1 },
    ],
    rewardExp: 60,
    rewardCoins: 50,
    suggestedLevel: 3,
  },
  {
    questId: 'mainline_treant',
    title: '腐化树精',
    description: '森林边缘的树木正在被诡异的力量腐化，最大的那棵已经化作树精，堵住了通往低语森林深处的路。',
    triggerAt: { day: 2, hour: 10 },
    requiredChapter: 1,
    giverNpcId: 'npc-toby',
    objectives: [
      { id: 'obj_kill_treant', description: '击败腐化树精', type: 'kill_enemy', targetId: 'enemy_treant', count: 1 },
    ],
    rewardExp: 100,
    rewardCoins: 80,
    suggestedLevel: 4,
  },
  {
    questId: 'mainline_ghosts',
    title: '迷途之影',
    description: '森林深处的迷途幽灵越来越多，它们像是被某种力量从墓穴中驱赶出来，在树影间游荡。',
    triggerAt: { day: 2, hour: 13 },
    requiredChapter: 1,
    giverNpcId: 'npc-sylvia',
    objectives: [
      { id: 'obj_kill_ghost', description: '击杀迷途幽灵', type: 'kill_enemy', targetId: 'enemy_ghost', count: 3 },
    ],
    rewardExp: 120,
    rewardCoins: 100,
    suggestedLevel: 5,
  },
  // ============ 第二章（章节2：废弃矿洞解锁）============
  {
    questId: 'mainline_mine_gate',
    title: '矿洞的呼唤',
    description: '矿工头目铁砧在废弃矿洞入口发现了异常的矿脉与低沉的轰鸣声。与铁砧谈谈，然后进入矿洞查看。',
    triggerAt: { day: 3, hour: 8 },
    requiredChapter: 2,
    giverNpcId: 'npc-anvil',
    objectives: [
      { id: 'obj_talk_anvil', description: '与铁砧了解矿洞情况', type: 'talk_to_npc', targetId: '铁砧', count: 1 },
      { id: 'obj_visit_mine', description: '前往废弃矿洞', type: 'visit_area', targetId: 'mine', count: 1 },
    ],
    rewardExp: 100,
    rewardCoins: 80,
    suggestedLevel: 5,
  },
  {
    questId: 'mainline_cave_worms',
    title: '矿洞蠕虫危机',
    description: '矿洞里冒出了大量被污染的地下蠕虫，托比亚斯怀疑它们的体液正是腐化能量的来源。',
    triggerAt: { day: 3, hour: 10 },
    requiredChapter: 2,
    giverNpcId: 'npc-anvil',
    objectives: [
      { id: 'obj_kill_worm', description: '击杀洞穴蠕虫', type: 'kill_enemy', targetId: 'enemy_cave_worm', count: 5 },
    ],
    rewardExp: 150,
    rewardCoins: 120,
    suggestedLevel: 6,
  },
  {
    questId: 'mainline_shadow_minions',
    title: '暗影先锋入侵',
    description: '夜幕降临后，一群身披暗影的爪牙开始在小镇外集结，一场进攻一触即发。',
    triggerAt: { day: 3, hour: 14 },
    requiredChapter: 2,
    giverNpcId: 'npc-marcus',
    objectives: [
      { id: 'obj_kill_shadow', description: '击杀暗影爪牙', type: 'kill_enemy', targetId: 'enemy_shadow_minion', count: 6 },
    ],
    rewardExp: 180,
    rewardCoins: 150,
    suggestedLevel: 7,
  },
  // ============ 第三章（章节3：全部开放）============
  {
    questId: 'mainline_boss_guardian',
    title: '森林守护者',
    description: '低语森林深处的守护者已被腐化彻底侵蚀，唯有战胜它，才能终结森林的异变，拯救星火小镇。',
    triggerAt: { day: 4, hour: 10 },
    requiredChapter: 3,
    giverNpcId: 'npc-grom',
    objectives: [
      { id: 'obj_kill_boss', description: '击败被腐化的森林守护者', type: 'kill_enemy', targetId: 'boss_forest_guardian', count: 1 },
    ],
    rewardExp: 300,
    rewardCoins: 300,
    suggestedLevel: 8,
  },
]

// =============================================
// 主线剧情故事 — "星火小镇的暗影"（T6.12 关系驱动，参考斯坦福小镇）
// =============================================

/**
 * 主线故事设定：
 * 星火小镇表面平静，但暗影势力正利用居民之间的信任裂痕逐步渗透。
 * 玩家作为冒险者，不仅要战斗，更要游走于居民的关系网络之间，
 * 化解因猜疑、旧怨、利益产生的冲突，才能凝聚小镇对抗真正的敌人。
 *
 * 故事弧（Arc）：
 * 弧0 「信任的裂痕」— 序章：居民间的旧怨被暗影利用
 * 弧1 「猜疑蔓延」   — 第一章：流言与猜疑让朋友反目
 * 弧2 「联盟与背叛」 — 第二章：商业与利益的冲突升级
 * 弧3 「暗影现身」   — 第三章：暗影势力与居民的正面冲突
 * 弧4 「星火重燃」   — 终章：信任重建，共同对抗暗影
 *
 * 关系驱动：每段剧情任务的"冲突双方/参与NPC"从真实的关系网络
 * （relationNetwork）中挑选——敌人、竞争对手、信任破裂的旧友，
 * 再由 LLM 根据这些关系快照动态生成"有意思的联系和冲突"作为主线任务。
 */

export interface StoryArcDef {
  /** 弧序号 */
  arc: number
  /** 弧名 */
  name: string
  /** 弧主题（指导 LLM 生成方向） */
  theme: string
  /** 该弧可挑选的"关系冲突"类型（relationNetwork 中的关系类型） */
  conflictTypes: string[]
  /** 该弧可用的任务目标类型 */
  objectiveTypes: Array<'talk_to_npc' | 'kill_enemy' | 'collect_item' | 'visit_area'>
  /** 每弧最大动态任务数 */
  maxMissions: number
  /** 建议等级 */
  suggestedLevel: number
}

export const STORY_ARCS: StoryArcDef[] = [
  {
    arc: 0,
    name: '信任的裂痕',
    theme: '小镇表面平静，但居民之间的旧怨与猜疑正被暗影势力悄悄利用。需要你去化解冲突、赢得信任。',
    conflictTypes: ['rival', 'enemy', 'neutral'],
    objectiveTypes: ['talk_to_npc', 'collect_item'],
    maxMissions: 2,
    suggestedLevel: 1,
  },
  {
    arc: 1,
    name: '猜疑蔓延',
    theme: '流言在小镇蔓延，朋友之间开始互相猜疑。暗影势力在幕后推波助澜，你需要找到流言的源头。',
    conflictTypes: ['neutral', 'rival', 'friend'],
    objectiveTypes: ['talk_to_npc', 'visit_area', 'collect_item'],
    maxMissions: 2,
    suggestedLevel: 3,
  },
  {
    arc: 2,
    name: '联盟与背叛',
    theme: '商业与利益冲突升级，昔日的盟友开始互相指责。暗影势力趁虚而入，拉拢被孤立的居民。',
    conflictTypes: ['rival', 'enemy', 'friend'],
    objectiveTypes: ['talk_to_npc', 'collect_item', 'kill_enemy'],
    maxMissions: 3,
    suggestedLevel: 5,
  },
  {
    arc: 3,
    name: '暗影现身',
    theme: '暗影势力的爪牙在小镇周边集结，居民们终于意识到共同的敌人。信任危机转为正面冲突。',
    conflictTypes: ['enemy', 'neutral'],
    objectiveTypes: ['kill_enemy', 'visit_area', 'talk_to_npc'],
    maxMissions: 3,
    suggestedLevel: 6,
  },
  {
    arc: 4,
    name: '星火重燃',
    theme: '最终决战：居民们放下分歧并肩作战。你作为冒险者，是凝聚星火的关键。',
    conflictTypes: ['friend', 'family', 'neutral'],
    objectiveTypes: ['kill_enemy', 'talk_to_npc'],
    maxMissions: 2,
    suggestedLevel: 8,
  },
]

// =============================================
// 玩家主线任务状态
// =============================================

interface PlayerMissionState {
  playerId: string
  /** 下一个待触发的任务下标 */
  currentIndex: number
  /** 待确认的任务（弹窗后、确认前） */
  pendingQuestId: string | null
  /** 进行中的任务 */
  activeQuestId: string | null
  /** 拒绝后的重弹冷却（游戏时间：到达该时间后才允许再次弹出同一任务） */
  rejectUntil: { day: number; hour: number } | null
  // --- T6.12 关系驱动剧情故事状态 ---
  /** 固定打怪主线是否已全部完成（完成后进入关系驱动剧情模式） */
  fixedMainlineDone: boolean
  /** 当前所处故事弧（0-4） */
  currentArc: number
  /** 当前故事弧内已生成的任务数 */
  arcMissionCount: number
  /** 已生成过的关系剧情任务ID（去重，避免同一冲突重复弹出） */
  generatedQuestKeys: Set<string>
  /** 最近一次任务弹出/确认/拒绝的现实时间戳（5分钟冷却） */
  lastPopupRealTime: number
}

// =============================================
// 时间驱动主线任务服务
// =============================================

/**
 * MainlineQuestService — 时间驱动主线任务（升级打怪）
 *
 * 流程：
 * 1. 监听游戏时钟 → 到达任务触发时间 → 弹出主线任务（story:mainline_popup）
 * 2. 玩家确认（story:mainline_confirm）→ 正式接受任务（story:mainline_confirmed）
 * 3. 玩家打怪完成 → 任务完成 → 推进到下一个任务（等待下一个触发时间）
 *
 * 核心机制：任务之间严格串行 —— 有"待确认"或"进行中"的任务时，不再触发新任务，
 * 保证"待玩家确认后再进行下一个任务"。
 */
class MainlineQuestService {
  /** Socket.IO 实例 */
  private io: any = null

  /** 是否已初始化 */
  private initialized = false

  /** 玩家任务状态缓存 */
  private playerStates = new Map<string, PlayerMissionState>()

  /** 已注册的任务定义 */
  private definitions = new Map<string, QuestDefinition>()

  /** 已检查过的触发点（避免重复弹窗：key=playerId:index） */
  private triggeredKeys = new Set<string>()

  /** 章节提供器（由 index.ts 注入：读取玩家当前剧情章节，用于地图解锁校验） */
  private chapterProvider: ChapterProvider | null = null

  /**
   * 注入章节提供器（T6.15 地图解锁校验）
   * @param provider 返回玩家当前章节（含 currentChapter）
   */
  setChapterProvider(provider: ChapterProvider | null): void {
    this.chapterProvider = provider
  }

  // =============================================
  // 生命周期
  // =============================================

  /**
   * 设置 Socket.IO
   */
  setIo(io: any): void {
    this.io = io
  }

  /**
   * 初始化：注册任务定义（内存+数据库）+ 监听时钟/任务事件
   */
  async initialize(): Promise<void> {
    if (this.initialized) return

    // 1. 将每个主线任务写入数据库 Quest 表（playerQuest 有外键约束）
    //    并注册为 QuestDefinition（trigger=manual，由本服务控制接受时机）
    for (const mission of MAINLINE_MISSIONS) {
      const objectives: QuestObjective[] = mission.objectives.map((o) => ({
        id: o.id,
        description: o.count > 1 ? `${o.description}（${o.count}只）` : o.description,
        type: o.type,
        targetId: o.targetId,
        requiredCount: o.count,
        currentCount: 0,
        optional: false,
      }))

      const definition: QuestDefinition = {
        id: mission.questId,
        title: mission.title,
        description: mission.description,
        type: 'main',
        chapter: 99, // 独立章节号，避免干扰现有剧情章节推进逻辑
        giverNpcId: mission.giverNpcId,
        trigger: { type: 'manual' },
        prerequisites: [],
        objectives,
        reward: {
          exp: mission.rewardExp,
          coins: mission.rewardCoins,
          items: [],
        },
        repeatable: false,
        timeLimit: 0,
        suggestedLevel: mission.suggestedLevel,
        autoAccept: false,
        canRetry: true,
      }
      this.definitions.set(mission.questId, definition)
      questEngine.registerDefinition(definition)

      // 写入数据库（幂等 upsert），保证 playerQuest 外键约束可用
      const dbObjectives = mission.objectives.map((o) => ({
        id: o.id,
        description: o.description,
        type: o.type,
        targetId: o.targetId,
        requiredCount: o.count,
        currentCount: 0,
        optional: false,
      }))
      try {
        await prisma.quest.upsert({
          where: { id: mission.questId },
          update: {
            title: mission.title,
            description: mission.description,
            type: 'main',
            chapter: 99,
            giverNpcId: mission.giverNpcId,
            triggerCond: { triggerType: 'manual' },
            completeCond: { objectives: dbObjectives },
            rewardExp: mission.rewardExp,
            rewardCoins: mission.rewardCoins,
            rewardItems: [],
            repeatable: false,
          },
          create: {
            id: mission.questId,
            title: mission.title,
            description: mission.description,
            type: 'main',
            chapter: 99,
            giverNpcId: mission.giverNpcId,
            triggerCond: { triggerType: 'manual' },
            completeCond: { objectives: dbObjectives },
            rewardExp: mission.rewardExp,
            rewardCoins: mission.rewardCoins,
            rewardItems: [],
            repeatable: false,
          },
        })
      } catch (err) {
        logger.error(`Failed to upsert quest ${mission.questId} into DB: ${(err as Error).message}`)
      }
    }

    // 2. 监听游戏时钟（小时变化 + 新一天 → 检查任务触发）
    gameClock.on('hour_change', () => {
      this.checkAllPlayers().catch((err) =>
        logger.error(`Hour-change check failed: ${(err as Error).message}`),
      )
    })
    gameClock.on('new_day', () => {
      this.checkAllPlayers().catch((err) =>
        logger.error(`New-day check failed: ${(err as Error).message}`),
      )
    })

    // 3. 监听任务完成事件 → 推进到下一个任务
    questEngine.on('quest_completed', (event) => {
      this.handleQuestCompleted(event.playerId, event.questId).catch((err) =>
        logger.error(`Quest-completed handling failed: ${(err as Error).message}`),
      )
    })

    this.initialized = true
    logger.info(`MainlineQuestService initialized: ${MAINLINE_MISSIONS.length} timed mainline missions (leveling+combat)`)

    // 4. 初始化后立即检查一次（让 Day1 的第一个任务尽快弹出）
    await this.checkAllPlayers()
  }

  // =============================================
  // 玩家状态
  // =============================================

  /**
   * 获取（或初始化）玩家主线任务状态
   */
  async getPlayerState(playerId: string): Promise<PlayerMissionState> {
    const cached = this.playerStates.get(playerId)
    if (cached) return cached

    // 从数据库恢复进度（重连场景）
    const state: PlayerMissionState = {
      playerId,
      currentIndex: 0,
      pendingQuestId: null,
      activeQuestId: null,
      rejectUntil: null,
      fixedMainlineDone: false,
      currentArc: 0,
      arcMissionCount: 0,
      generatedQuestKeys: new Set<string>(),
      lastPopupRealTime: 0,
    }

    try {
      const playerQuests = await prisma.playerQuest.findMany({
        where: { playerId, questId: { startsWith: 'mainline_' } },
      })

      // 恢复进行中任务
      const active = playerQuests.find((pq) => pq.status === 'active')
      if (active) {
        state.activeQuestId = active.questId
        const activeIndex = MAINLINE_MISSIONS.findIndex((m) => m.questId === active.questId)
        state.currentIndex = activeIndex >= 0 ? activeIndex + 1 : 0
        // 固定主线完成后：恢复固定主线已完结标志
        state.fixedMainlineDone = state.currentIndex >= MAINLINE_MISSIONS.length
        // 已完成的之前任务都视为推进过
        this.playerStates.set(playerId, state)
        return state
      }

      // 恢复已完成进度
      const completed = playerQuests.filter((pq) => pq.status === 'completed')
      let maxIndex = 0
      for (const pq of completed) {
        const idx = MAINLINE_MISSIONS.findIndex((m) => m.questId === pq.questId)
        if (idx >= 0 && idx + 1 > maxIndex) maxIndex = idx + 1
      }
      state.currentIndex = maxIndex
      state.fixedMainlineDone = maxIndex >= MAINLINE_MISSIONS.length

      // 若当前有 active 已推进，也保留
      this.playerStates.set(playerId, state)
      return state
    } catch (err) {
      logger.warn(`Failed to restore mission state for ${playerId}: ${(err as Error).message}`)
      this.playerStates.set(playerId, state)
      return state
    }
  }

  /**
   * 检查所有已连接玩家（时钟驱动）
   * T6.14.2 修复：只检查"在线玩家"（socket 已连接），避免 demo-player 等
   * 非连接测试玩家被 checkForPlayer 弹窗并 io 广播打扰真实玩家。
   */
  private async checkAllPlayers(): Promise<void> {
    const players = new Set<string>()
    try {
      if (this.io?.sockets?.sockets) {
        // 在线玩家：使用 socket.data.playerId（真实玩家ID），而非 socket.id
        // T6.14.2 修复：此前用 socket.id 作为 playerId 检查，导致已认证玩家的
        // 任务状态（按真实 playerId 存储）无法命中，弹窗事件也被前端 isSelfPlayer 过滤
        for (const socket of this.io.sockets.sockets.values()) {
          const pid = (socket.data as { playerId?: string })?.playerId ?? socket.id
          players.add(pid)
        }
      } else {
        // 无 io（mock/单测场景）：回退到缓存玩家
        for (const playerId of this.playerStates.keys()) players.add(playerId)
      }
    } catch {
      for (const playerId of this.playerStates.keys()) players.add(playerId)
    }

    for (const playerId of players) {
      await this.checkForPlayer(playerId)
    }
  }

  /**
   * 注册/唤醒玩家（连接建立时调用）
   */
  async registerPlayer(playerId: string): Promise<void> {
    const state = await this.getPlayerState(playerId)
    this.playerStates.set(playerId, state)
    await this.checkForPlayer(playerId)
  }

  /**
   * 检查某玩家是否到了触发下一个任务的时间
   */
  async checkForPlayer(playerId: string): Promise<boolean> {
    const state = await this.getPlayerState(playerId)
    this.playerStates.set(playerId, state)

    // 串行约束：有待确认或进行中的任务时，不触发新任务
    if (state.pendingQuestId || state.activeQuestId) return false

    // T6.12 现实时间冷却：最多现实 5 分钟弹一次任务
    const now = Date.now()
    if (now - state.lastPopupRealTime < POPUP_REAL_COOLDOWN_MS) {
      return false
    }

    const time = gameClock.getTime()

    // 拒绝冷却：玩家拒绝任务后，等待一段时间（2游戏小时）才再次弹出
    if (state.rejectUntil) {
      const rejectReached = time.gameDay > state.rejectUntil.day ||
        (time.gameDay === state.rejectUntil.day && time.gameHour >= state.rejectUntil.hour)
      if (!rejectReached) return false
      // 冷却结束：清除，允许本次检查继续
      state.rejectUntil = null
      this.playerStates.set(playerId, state)
    }

    // 固定打怪主线未完成 → 走固定任务链
    if (!state.fixedMainlineDone) {
      // 没有下一个固定任务了（理论上不会到这，防御）
      if (state.currentIndex >= MAINLINE_MISSIONS.length) {
        state.fixedMainlineDone = true
        this.playerStates.set(playerId, state)
      } else {
        const popped = await this.checkFixedMission(playerId, state, time)
        // T6.15 修复：固定主线未完成时，若当前任务因地图未解锁而延迟发布，
        // 绝不能进入关系驱动剧情模式（否则会跳过固定任务链）
        if (!popped) return false
        return true
      }
    }

    // 固定主线完成 → 关系驱动剧情模式（T6.12）
    return await this.checkRelationshipStory(playerId, state)
  }

  /**
   * 检查固定主线任务（原 T6.8 逻辑 + T6.15 地图解锁校验）
   * 修复逻辑错误：任务发布地点不能在未解锁地图内 ——
   * 任务触发除满足"游戏时间到达"外，还必须满足"requiredChapter 章节已解锁"，
   * 未解锁时不发布（不标记触发点），待章节推进后再检查弹出。
   */
  private async checkFixedMission(
    playerId: string,
    state: PlayerMissionState,
    time: ReturnType<typeof gameClock.getTime>,
  ): Promise<boolean> {
    const mission = MAINLINE_MISSIONS[state.currentIndex]

    // 触发点去重（同一任务同一玩家只弹一次）
    const key = `${playerId}:${state.currentIndex}`
    if (this.triggeredKeys.has(key)) return false

    // 检查触发时间：当前游戏日 > 触发日 或（同日且当前小时 >= 触发小时）
    const reached = time.gameDay > mission.triggerAt.day ||
      (time.gameDay === mission.triggerAt.day && time.gameHour >= mission.triggerAt.hour)

    if (!reached) return false

    // ===== T6.15 地图解锁校验（核心逻辑修复）=====
    // 任务发布地点（NPC对话/区域/敌人所在场景）必须在已解锁地图内：
    // 玩家当前章节 < 任务所需章节 → 不发布，等待解锁
    if (mission.requiredChapter > 0 && this.chapterProvider) {
      let unlocked = false
      try {
        const progress = await this.chapterProvider(playerId)
        unlocked = progress !== null && progress.currentChapter >= mission.requiredChapter
      } catch (err) {
        logger.warn(`[Mainline] Chapter check failed for ${playerId}: ${(err as Error).message}`)
      }
      if (!unlocked) {
        logger.info(
          `[Mainline] Player ${playerId} quest "${mission.title}" requires chapter ${mission.requiredChapter} ` +
          `(map not unlocked) — deferred until unlock`,
        )
        return false
      }
    }

    // 标记已触发，进入待确认状态
    this.triggeredKeys.add(key)
    state.pendingQuestId = mission.questId
    state.lastPopupRealTime = Date.now()

    logger.info(
      `[Mainline] Player ${playerId} timed quest popped: ${mission.title} ` +
      `(Day ${time.gameDay} ${time.gameHour}:00, trigger ${mission.triggerAt.day}D ${mission.triggerAt.hour}:00, ` +
      `chapter ${mission.requiredChapter})`,
    )

    // 广播弹窗
    if (this.io) {
      this.io.to(playerId).emit('story:mainline_popup', {
        playerId,
        index: state.currentIndex,
        questId: mission.questId,
        title: mission.title,
        description: mission.description,
        objectives: mission.objectives.map((o) => ({
          id: o.id,
          description: o.description,
          type: o.type,
          targetId: o.targetId,
          requiredCount: o.count,
        })),
        reward: { exp: mission.rewardExp, coins: mission.rewardCoins },
        suggestedLevel: mission.suggestedLevel,
      })
    }
    return true
  }

  /**
   * 任务完成后"立即"发布下一个固定主线任务（主线串行衔接需求）。
   * 与 checkFixedMission 的区别：
   * - 跳过"游戏时间到达 triggerAt"的触发等待（完成当前任务即接上下一个）
   * - 跳过"现实 5 分钟弹窗冷却"（不阻塞任务链节奏）
   * 仍保留 T6.15 地图解锁校验：下一个任务所在区域未解锁时不发布，
   * 待章节推进后由 storyProgressionManager 联动重检弹出。
   */
  private async releaseNextFixedMission(
    playerId: string,
    state: PlayerMissionState,
  ): Promise<boolean> {
    if (state.currentIndex >= MAINLINE_MISSIONS.length) return false
    const mission = MAINLINE_MISSIONS[state.currentIndex]

    // 触发点去重（直接发布也标记，避免后续时间驱动重复弹出同一任务）
    const key = `${playerId}:${state.currentIndex}`
    if (this.triggeredKeys.has(key)) return false

    // T6.15 地图解锁校验：任务发布地点必须在已解锁地图内，未解锁不发布（等待解锁）
    if (mission.requiredChapter > 0 && this.chapterProvider) {
      let unlocked = false
      try {
        const progress = await this.chapterProvider(playerId)
        unlocked = progress !== null && progress.currentChapter >= mission.requiredChapter
      } catch (err) {
        logger.warn(`[Mainline] Chapter check failed for ${playerId}: ${(err as Error).message}`)
      }
      if (!unlocked) {
        logger.info(
          `[Mainline] Player ${playerId} next quest "${mission.title}" requires chapter ${mission.requiredChapter} ` +
          `(map not unlocked) — deferred until unlock`,
        )
        return false
      }
    }

    // 直接发布：标记触发点 + 进入待确认状态（跳过时间触发/现实冷却）
    this.triggeredKeys.add(key)
    state.pendingQuestId = mission.questId
    state.lastPopupRealTime = Date.now()
    this.playerStates.set(playerId, state)

    logger.info(
      `[Mainline] Player ${playerId} next quest popped immediately: ${mission.title} (index ${state.currentIndex})`,
    )

    // 广播弹窗（前端收到后，右侧任务引导栏立即更新为下一个任务）
    if (this.io) {
      this.io.to(playerId).emit('story:mainline_popup', {
        playerId,
        index: state.currentIndex,
        questId: mission.questId,
        title: mission.title,
        description: mission.description,
        objectives: mission.objectives.map((o) => ({
          id: o.id,
          description: o.description,
          type: o.type,
          targetId: o.targetId,
          requiredCount: o.count,
        })),
        reward: { exp: mission.rewardExp, coins: mission.rewardCoins },
        suggestedLevel: mission.suggestedLevel,
      })
    }
    return true
  }

  // =============================================
  // T6.12 关系驱动剧情故事（参考斯坦福小镇）
  // =============================================

  /**
   * 关系驱动剧情模式：读取 NPC 关系网络 → LLM 生成"有意思的联系与冲突" → 作为主线任务弹出
   * 故事弧推进：每弧生成 maxMissions 个任务后进入下一弧；全部弧完成则主线完结。
   * （时间驱动入口：受现实 5 分钟冷却保护；任务完成后走 releaseNextStoryMission 立即衔接）
   */
  private async checkRelationshipStory(
    playerId: string,
    state: PlayerMissionState,
  ): Promise<boolean> {
    // 防御：串行约束 + 现实冷却（与 checkForPlayer 保持一致）
    if (state.pendingQuestId || state.activeQuestId) return false
    if (Date.now() - state.lastPopupRealTime < POPUP_REAL_COOLDOWN_MS) return false

    // 复用"立即发布"逻辑（含弧推进 + LLM 生成 + 广播）
    return await this.releaseNextStoryMission(playerId, state)
  }

  /**
   * 立即生成并发布下一个关系驱动剧情任务（跳过现实 5 分钟冷却）。
   * - 固定主线全部完成 / 每个故事任务完成后调用 → 主线串行立即衔接
   * - 弧内任务数达上限 → 推进到下一弧
   * - LLM 生成失败返回 false，由调用方决定兜底（后续时钟检查重试）
   */
  private async releaseNextStoryMission(
    playerId: string,
    state: PlayerMissionState,
  ): Promise<boolean> {
    // 防御：串行约束
    if (state.pendingQuestId || state.activeQuestId) return false

    // 所有故事弧已完成 → 主线完结
    if (state.currentArc >= STORY_ARCS.length) return false

    const arc = STORY_ARCS[state.currentArc]

    // 当前弧任务数达上限 → 进入下一弧（弧间由完成节奏自然衔接）
    if (state.arcMissionCount >= arc.maxMissions) {
      state.currentArc += 1
      state.arcMissionCount = 0
      this.playerStates.set(playerId, state)
      logger.info(`[Mainline][Story] Player ${playerId} advanced to arc ${state.currentArc}: ${STORY_ARCS[state.currentArc]?.name ?? '完结'}`)
      if (state.currentArc >= STORY_ARCS.length) return false
    }

    // 生成关系驱动剧情任务
    try {
      // 弧可能已推进，重新取当前弧定义
      const activeArc = STORY_ARCS[state.currentArc]
      const generated = await this.generateRelationshipMission(state)
      if (!generated) return false

      state.pendingQuestId = generated.quest.id
      state.arcMissionCount += 1
      state.generatedQuestKeys.add(generated.questKey)
      state.lastPopupRealTime = Date.now()
      this.playerStates.set(playerId, state)

      logger.info(
        `[Mainline][Story] Player ${playerId} arc ${activeArc.arc} "${activeArc.name}" mission popped: ${generated.quest.title} ` +
        `(${state.arcMissionCount}/${activeArc.maxMissions})`,
      )

      // 广播弹窗（复用主线弹窗链路 → 引导栏立即更新）
      if (this.io) {
        this.io.to(playerId).emit('story:mainline_popup', {
          playerId,
          index: state.currentIndex,
          questId: generated.quest.id,
          title: generated.quest.title,
          description: generated.quest.description,
          objectives: generated.quest.objectives.map((o) => ({
            id: o.id,
            description: o.description,
            type: o.type,
            targetId: o.targetId ?? '',
            requiredCount: o.requiredCount,
          })),
          reward: { exp: generated.quest.reward.exp, coins: generated.quest.reward.coins },
          suggestedLevel: generated.quest.suggestedLevel,
        })
      }
      return true
    } catch (err) {
      logger.error(`[Mainline][Story] Generate mission failed for ${playerId}: ${(err as Error).message}`)
      return false
    }
  }

  /**
   * 生成一条关系驱动剧情任务：
   * 1. 从关系网络挑选"冲突关系对"（敌/竞争/破裂的信任）
   * 2. 构造 LLM Prompt（含关系快照 + 故事弧主题）
   * 3. LLM 生成任务标题/描述/目标/参与NPC
   * 4. 注册 QuestDefinition（manual 触发，沿用主线确认链路）
   */
  private async generateRelationshipMission(
    state: PlayerMissionState,
  ): Promise<{ quest: QuestDefinition; questKey: string } | null> {
    const arc = STORY_ARCS[state.currentArc]

    // 1. 从关系网络收集候选"冲突对"
    const candidates = this.collectConflictPairs(arc.conflictTypes, state)
    if (candidates.length === 0) {
      logger.warn(`[Mainline][Story] No conflict candidates for arc ${arc.arc}`)
      return null
    }

    // 2. 构造 LLM Prompt
    const profileSummary = this.buildProfileSummaries(candidates)
    const relationSummary = this.buildRelationSummaries(candidates)

    const systemPrompt = `你是《星火小镇》的主线剧情作者。游戏是一个AI驱动的像素RPG，NPC有真实的性格与关系网络。
当前故事弧：${arc.name}。主题：${arc.theme}
你的任务：根据给定的NPC关系快照，创作一个"有意思的联系或冲突"作为主线剧情任务。要求：
1. 基于真实的人物关系，写出生动、符合人物性格的情节（参考斯坦福小镇的涌现叙事风格）。
2. 输出严格 JSON：{"title":"任务标题","description":"任务描述（2-3句，包含冲突/联系的核心）","npcIds":["参与NPC的档案ID"],"objectiveType":"talk_to_npc|kill_enemy|collect_item|visit_area","objectiveDesc":"目标描述","enemyId":"若为kill_enemy则填敌人ID否则空字符串","targetNpcId":"若为talk_to_npc/collect_item则填NPC ID否则空字符串","areaName":"若为visit_area则填区域名否则空字符串"}
3. 任务目标类型必须从该弧允许的类型中选择：${arc.objectiveTypes.join('|')}
4. 不要输出任何JSON以外的内容。`

    const userPrompt = `故事弧：${arc.name}
可用的NPC关系快照：
${relationSummary}

NPC档案摘要：
${profileSummary}

请生成一个主线剧情任务。`

    let llmText = ''
    try {
      const resp = await llmService.chat(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        { temperature: 0.9, maxTokens: 512 },
      )
      llmText = resp.content.trim()
    } catch (err) {
      logger.error(`[Mainline][Story] LLM call failed: ${(err as Error).message}`)
      return null
    }

    // 3. 解析 JSON（容错：去掉可能的 markdown 代码块）
    const parsed = this.parseLlmJson(llmText)
    if (!parsed || !parsed.title || !parsed.description) {
      logger.warn(`[Mainline][Story] LLM returned invalid JSON: ${llmText.slice(0, 200)}`)
      return null
    }

    // 4. 构造任务定义（kill_enemy 需要合法敌人ID，用弧1-3常用敌人兜底）
    const questId = `mainline_story_${arc.arc}_${Date.now()}`
    const questKey = `arc${arc.arc}:${parsed.npcIds?.join(',') ?? 'npc'}:${parsed.objectiveType}`

    const enemyId = this.sanitizeEnemyId(parsed.enemyId)
    const targetNpcId = parsed.targetNpcId ?? ''
    const areaName = parsed.areaName ?? '低语森林'

    const objective: QuestObjective = {
      id: `obj_${questId}`,
      description: parsed.objectiveDesc || parsed.description,
      type: parsed.objectiveType,
      targetId: parsed.objectiveType === 'kill_enemy'
        ? enemyId
        : parsed.objectiveType === 'visit_area'
          ? areaName
          : targetNpcId,
      requiredCount: 1,
      currentCount: 0,
      optional: false,
    }

    const level = arc.suggestedLevel
    const quest: QuestDefinition = {
      id: questId,
      title: parsed.title,
      description: parsed.description,
      type: 'main',
      chapter: 99,
      giverNpcId: (parsed.npcIds?.[0] ?? 'lila') as string,
      trigger: { type: 'manual' },
      prerequisites: [],
      objectives: [objective],
      reward: {
        exp: 60 + level * 30,
        coins: 50 + level * 25,
        items: [],
      },
      repeatable: false,
      timeLimit: 0,
      suggestedLevel: level,
      autoAccept: false,
      canRetry: true,
    }

    // 注册任务定义 + 写入数据库（幂等）
    questEngine.registerDefinition(quest)
    try {
      await prisma.quest.upsert({
        where: { id: questId },
        update: {
          title: quest.title,
          description: quest.description,
          type: 'main',
          chapter: 99,
          giverNpcId: quest.giverNpcId,
          triggerCond: { triggerType: 'manual' },
          completeCond: {
            objectives: [{
              id: objective.id,
              description: objective.description,
              type: objective.type,
              targetId: objective.targetId ?? '',
              requiredCount: objective.requiredCount,
              currentCount: 0,
              optional: false,
            }],
          },
          rewardExp: quest.reward.exp,
          rewardCoins: quest.reward.coins,
          rewardItems: [],
          repeatable: false,
        },
        create: {
          id: questId,
          title: quest.title,
          description: quest.description,
          type: 'main',
          chapter: 99,
          giverNpcId: quest.giverNpcId,
          triggerCond: { triggerType: 'manual' },
          completeCond: {
            objectives: [{
              id: objective.id,
              description: objective.description,
              type: objective.type,
              targetId: objective.targetId ?? '',
              requiredCount: objective.requiredCount,
              currentCount: 0,
              optional: false,
            }],
          },
          rewardExp: quest.reward.exp,
          rewardCoins: quest.reward.coins,
          rewardItems: [],
          repeatable: false,
        },
      })
    } catch (err) {
      logger.warn(`[Mainline][Story] Quest upsert failed: ${(err as Error).message}`)
    }

    logger.info(`[Mainline][Story] Generated quest: ${quest.title} (${questId}) | NPC: ${parsed.npcIds?.join(',') ?? '?'} | type: ${objective.type}`)
    return { quest, questKey }
  }

  /**
   * 从关系网络收集候选冲突对（按弧允许的关系类型 + 未用过的去重）
   */
  private collectConflictPairs(
    conflictTypes: string[],
    state: PlayerMissionState,
  ): Array<{ npcAId: string; npcBId: string; type: string; affection: number; trust: number; description: string }> {
    const allProfiles = profileLoader.getAllProfiles()
    const candidates: Array<{ npcAId: string; npcBId: string; type: string; affection: number; trust: number; description: string }> = []

    for (const profile of allProfiles) {
      const relations = relationNetwork.getNpcRelations(profile.id)
      for (const rel of relations) {
        if (!conflictTypes.includes(rel.type)) continue
        const otherId = rel.sourceNpcId === profile.id ? rel.targetNpcId : rel.sourceNpcId
        // 去重（避免 A→B 与 B→A 重复）
        const key = `arc${state.currentArc}:${[profile.id, otherId].sort().join(':')}`
        if (state.generatedQuestKeys.has(key)) continue

        // 偏好：敌对/竞争优先（affection 低）；中立但低信任次之
        const score = rel.type === 'enemy' ? 100 + (100 - rel.affection) : rel.type === 'rival' ? 80 + (100 - rel.affection) : 40 + (100 - rel.trust)
        candidates.push({
          npcAId: profile.id,
          npcBId: otherId,
          type: rel.type,
          affection: rel.affection,
          trust: rel.trust,
          description: rel.description,
          _score: score,
        } as typeof candidates[number] & { _score: number })
      }
    }

    // 按冲突强度排序，取前6个
    candidates.sort((a: any, b: any) => b._score - a._score)
    return candidates.slice(0, 6)
  }

  /** 构建NPC档案摘要（名称/性格/动机） */
  private buildProfileSummaries(
    candidates: Array<{ npcAId: string; npcBId: string }>,
  ): string {
    const seen = new Set<string>()
    const parts: string[] = []
    for (const c of candidates) {
      for (const id of [c.npcAId, c.npcBId]) {
        if (seen.has(id)) continue
        seen.add(id)
        const p = profileLoader.getProfile(id)
        if (p) {
          parts.push(`- ${p.name}（${p.title}）：性格「${p.personality}」，动机「${p.motivations.slice(0, 2).join('、')}」，喜好${p.likes.slice(0, 2).join('、')}，厌恶${p.dislikes.slice(0, 2).join('、')}`)
        }
      }
    }
    return parts.join('\n') || '（暂无档案）'
  }

  /** 构建关系摘要文本 */
  private buildRelationSummaries(
    candidates: Array<{ npcAId: string; npcBId: string; type: string; affection: number; trust: number; description: string }>,
  ): string {
    const parts = candidates.map((c) => {
      const a = profileLoader.getProfile(c.npcAId)
      const b = profileLoader.getProfile(c.npcBId)
      const an = a?.name ?? c.npcAId
      const bn = b?.name ?? c.npcBId
      return `- ${an} → ${bn}：[${c.type}] 好感${c.affection} 信任${c.trust} - ${c.description}`
    })
    return parts.join('\n')
  }

  /** 容错解析 LLM JSON（支持去掉 ```json 代码块） */
  private parseLlmJson(text: string): any {
    let cleaned = text.trim()
    // 去掉 markdown 代码块
    const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
    if (fenceMatch) cleaned = fenceMatch[1].trim()
    // 截取第一个 { 到最后一个 }
    const start = cleaned.indexOf('{')
    const end = cleaned.lastIndexOf('}')
    if (start >= 0 && end > start) {
      cleaned = cleaned.slice(start, end + 1)
    }
    try {
      return JSON.parse(cleaned)
    } catch {
      return null
    }
  }

  /** 敌人ID白名单（兜底合法敌人） */
  private sanitizeEnemyId(enemyId: unknown): string {
    const known = ['enemy_wolf', 'enemy_goblin', 'enemy_treant', 'enemy_cave_worm', 'enemy_shadow_minion', 'boss_forest_guardian']
    if (typeof enemyId === 'string' && enemyId.length > 0) return enemyId
    return known[Math.floor(Math.random() * known.length)]
  }

  // =============================================
  // 玩家确认
  // =============================================

  /**
   * 玩家确认接受待确认的主线任务
   */
  async confirmMission(playerId: string): Promise<{
    success: boolean
    message: string
    questId?: string
    title?: string
  }> {
    const state = await this.getPlayerState(playerId)
    this.playerStates.set(playerId, state)

    if (!state.pendingQuestId) {
      return { success: false, message: '当前没有待确认的主线任务' }
    }

    const mission = MAINLINE_MISSIONS.find((m) => m.questId === state.pendingQuestId)
    if (!mission) {
      // T6.12 兼容关系驱动剧情任务（动态生成，不在固定列表里）
      const storyDef = questEngine.getQuestDefinition(state.pendingQuestId)
      if (!storyDef) {
        state.pendingQuestId = null
        return { success: false, message: '任务定义不存在' }
      }

      const result = await questEngine.acceptQuest(playerId, state.pendingQuestId)
      if (!result.success) {
        return { success: false, message: result.message }
      }

      const questId = state.pendingQuestId
      state.pendingQuestId = null
      state.activeQuestId = questId
      state.lastPopupRealTime = Date.now()

      logger.info(`[Mainline] Player ${playerId} confirmed story mission: ${storyDef.title}`)

      if (this.io) {
        this.io.to(playerId).emit('story:mainline_confirmed', {
          playerId,
          questId,
          title: storyDef.title,
          objectives: storyDef.objectives.map((o) => ({
            id: o.id,
            description: o.description,
            type: o.type,
            targetId: o.targetId ?? '',
            requiredCount: o.requiredCount,
          })),
        })
      }

      return { success: true, message: `已接受任务：${storyDef.title}`, questId, title: storyDef.title }
    }

    // 通过任务引擎正式接受任务
    const result = await questEngine.acceptQuest(playerId, mission.questId)
    if (!result.success) {
      return { success: false, message: result.message }
    }

    // 状态推进：待确认 → 进行中
    const questId = state.pendingQuestId
    state.pendingQuestId = null
    state.activeQuestId = questId
    state.lastPopupRealTime = Date.now()

    logger.info(`[Mainline] Player ${playerId} confirmed mission: ${mission.title}`)

    // 广播确认事件
    if (this.io) {
      this.io.to(playerId).emit('story:mainline_confirmed', {
        playerId,
        questId,
        title: mission.title,
        objectives: mission.objectives.map((o) => ({
          id: o.id,
          description: o.description,
          type: o.type,
          targetId: o.targetId,
          requiredCount: o.count,
        })),
      })
    }

    return { success: true, message: `已接受任务：${mission.title}`, questId, title: mission.title }
  }

  // =============================================
  // 玩家拒绝（取消）
  // =============================================

  /**
   * 玩家拒绝待确认的主线任务
   * - 关闭弹窗（广播 story:mainline_rejected）
   * - 记录拒绝冷却：2 个游戏小时后再弹窗（checkForPlayer 判断）
   * - 清除触发点去重，允许同一任务稍后重新触发
   */
  async rejectMission(playerId: string): Promise<{
    success: boolean
    message: string
    questId?: string
  }> {
    const state = await this.getPlayerState(playerId)
    this.playerStates.set(playerId, state)

    if (!state.pendingQuestId) {
      return { success: false, message: '当前没有待确认的主线任务' }
    }

    const questId = state.pendingQuestId
    const mission = MAINLINE_MISSIONS.find((m) => m.questId === questId)
    const title = mission?.title ?? questEngine.getQuestDefinition(questId)?.title ?? questId

    // 清除触发点去重（允许稍后重新弹出同一任务）
    const key = `${playerId}:${state.currentIndex}`
    this.triggeredKeys.delete(key)

    // 设置拒绝冷却：当前游戏时间 + 2 小时（跨天进位）
    const time = gameClock.getTime()
    let hour = time.gameHour + 2
    let day = time.gameDay
    if (hour >= 24) {
      hour -= 24
      day += 1
    }
    state.pendingQuestId = null
    state.rejectUntil = { day, hour }
    state.lastPopupRealTime = Date.now()

    logger.info(
      `[Mainline] Player ${playerId} rejected mission: ${title} ` +
      `(re-popup after Day ${day} ${hour}:00)`,
    )

    // 广播拒绝事件（前端关闭弹窗）
    if (this.io) {
      this.io.to(playerId).emit('story:mainline_rejected', {
        playerId,
        questId,
        title,
        rePopupAt: { day, hour },
      })
    }

    return { success: true, message: `已拒绝任务：${title}，过一会儿它还会再来`, questId }
  }

  // =============================================
  // 任务完成推进
  // =============================================

  /**
   * 处理任务完成事件：完成的是当前进行中的主线任务 → 推进下标
   */
  private async handleQuestCompleted(playerId: string, questId: string): Promise<void> {
    const state = await this.getPlayerState(playerId)
    if (state.activeQuestId !== questId) return

    const completedIndex = MAINLINE_MISSIONS.findIndex((m) => m.questId === questId)
    if (completedIndex >= 0) {
      // 固定打怪主线完成 → 推进
      state.activeQuestId = null
      state.currentIndex = completedIndex + 1
      // 若固定主线全部完成，进入关系驱动剧情模式
      state.fixedMainlineDone = state.currentIndex >= MAINLINE_MISSIONS.length
      this.playerStates.set(playerId, state)

      logger.info(`[Mainline] Player ${playerId} completed mission ${questId}, next index=${state.currentIndex}`)

      // 立即更新下一个主线任务：还有下一个固定任务时直接发布（跳过"游戏时间到达
      // triggerAt"的等待与"现实 5 分钟弹窗冷却"），让右侧任务引导栏马上显示下一任务。
      if (!state.fixedMainlineDone) {
        const released = await this.releaseNextFixedMission(playerId, state)
        if (released) return
        // 未发布（如下一个任务所在区域未解锁）→ 交由时钟/章节推进联动重检
        await this.checkForPlayer(playerId)
        return
      }

      // 固定主线全部完成 → 立即进入关系驱动剧情模式（跳过现实冷却）
      await this.releaseNextStoryMission(playerId, state)
      return
    }

    // T6.12 关系驱动剧情任务完成 → 立即生成下一个关系驱动任务（弧内计数在生成时递增）
    const isStoryQuest = questId.startsWith('mainline_story_')
    if (isStoryQuest) {
      state.activeQuestId = null
      this.playerStates.set(playerId, state)
      logger.info(`[Mainline][Story] Player ${playerId} completed story mission ${questId} (arc ${state.currentArc} count ${state.arcMissionCount}/${STORY_ARCS[state.currentArc]?.maxMissions ?? '?'})`)

      // 立即发布下一个关系驱动任务（跳过现实 5 分钟冷却，引导栏马上更新）
      const released = await this.releaseNextStoryMission(playerId, state)
      if (!released) {
        // 生成失败（如 LLM 暂不可用）→ 交由后续时钟检查重试
        await this.checkForPlayer(playerId)
      }
      return
    }

    // 其他任务完成不影响主线推进
    logger.debug(`[Mainline] Quest ${questId} completed but not current mainline (ignored)`)
  }

  // =============================================
  // 查询接口
  // =============================================

  /**
   * 获取玩家主线任务状态
   */
  async getStatus(playerId: string) {
    const state = await this.getPlayerState(playerId)
    const pendingDef = state.pendingQuestId
      ? (MAINLINE_MISSIONS.find((m) => m.questId === state.pendingQuestId) ?? null)
      : null
    const pendingStory = state.pendingQuestId && !pendingDef
      ? questEngine.getQuestDefinition(state.pendingQuestId)
      : null
    const activeDef = state.activeQuestId
      ? (MAINLINE_MISSIONS.find((m) => m.questId === state.activeQuestId) ?? null)
      : null
    const activeStory = state.activeQuestId && !activeDef
      ? questEngine.getQuestDefinition(state.activeQuestId)
      : null
    const next = state.currentIndex < MAINLINE_MISSIONS.length
      ? MAINLINE_MISSIONS[state.currentIndex]
      : null

    // 查询进行中任务的打怪进度
    let activeProgress: Array<{ id: string; description: string; type: string; targetId: string; current: number; required: number }> = []
    if (state.activeQuestId) {
      const pq = await questEngine.getPlayerQuestProgress(playerId, state.activeQuestId)
      if (pq) {
        activeProgress = pq.objectives.map((o) => ({
          id: o.id,
          description: o.description,
          // T6.14.2: 附带目标类型与目标ID，供前端绘制"原神式"任务指引箭头定位
          type: o.type,
          targetId: o.targetId ?? '',
          current: o.currentCount,
          required: o.requiredCount,
        }))
      }
    }

    return {
      playerId,
      currentIndex: state.currentIndex,
      total: MAINLINE_MISSIONS.length,
      storyMode: state.fixedMainlineDone,
      currentArc: state.currentArc,
      arcName: state.currentArc < STORY_ARCS.length ? STORY_ARCS[state.currentArc].name : null,
      allStoryDone: state.fixedMainlineDone && state.currentArc >= STORY_ARCS.length,
      pendingMission: pendingDef ? {
        questId: pendingDef.questId,
        title: pendingDef.title,
        description: pendingDef.description,
        objectives: pendingDef.objectives.map((o) => ({
          id: o.id,
          description: o.description,
          type: o.type,
          targetId: o.targetId,
          requiredCount: o.count,
        })),
        rewardExp: pendingDef.rewardExp,
        rewardCoins: pendingDef.rewardCoins,
        suggestedLevel: pendingDef.suggestedLevel,
      } : (pendingStory ? {
        questId: pendingStory.id,
        title: pendingStory.title,
        description: pendingStory.description,
        rewardExp: pendingStory.reward.exp,
        rewardCoins: pendingStory.reward.coins,
        suggestedLevel: pendingStory.suggestedLevel,
      } : null),
      activeMission: activeDef ? {
        questId: activeDef.questId,
        title: activeDef.title,
        description: activeDef.description,
        rewardExp: activeDef.rewardExp,
        rewardCoins: activeDef.rewardCoins,
        objectives: activeProgress,
      } : (activeStory ? {
        questId: activeStory.id,
        title: activeStory.title,
        description: activeStory.description,
        rewardExp: activeStory.reward.exp,
        rewardCoins: activeStory.reward.coins,
        objectives: activeProgress,
      } : null),
      nextMission: next ? {
        questId: next.questId,
        title: next.title,
        description: next.description,
        objectives: next.objectives.map((o) => ({
          id: o.id,
          description: o.description,
          type: o.type,
          targetId: o.targetId,
          requiredCount: o.count,
        })),
        triggerAt: next.triggerAt,
        suggestedLevel: next.suggestedLevel,
        requiredChapter: next.requiredChapter,
      } : null,
      allCompleted: state.currentIndex >= MAINLINE_MISSIONS.length && state.currentArc >= STORY_ARCS.length,
    }
  }

  /**
   * 获取任务链定义
   */
  getMissions(): MainlineMissionDef[] {
    return MAINLINE_MISSIONS.map((m) => ({ ...m }))
  }

  /**
   * 获取统计
   */
  getStats() {
    return {
      missions: MAINLINE_MISSIONS.length,
      initialized: this.initialized,
      trackedPlayers: this.playerStates.size,
    }
  }
}

/** 全局时间驱动主线任务服务实例 */
export const mainlineQuestService = new MainlineQuestService()
