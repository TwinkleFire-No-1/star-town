// 星火小镇 — 剧情解锁系统
// 需求：主线剧情驱动的渐进式解锁 —— 场景、建筑、NPC 随剧情推进逐步可见。
// 玩家完成序章后才能进入低语森林，完成第一章后才能进入废弃矿洞，
// 关键剧情 NPC（格罗姆/铁砧/暗祭司塞拉斯）在对应章节才现身。
//
// 设计：
// - 解锁规则表（纯数据）：每个场景/NPC 绑定"所需章节"
// - 章节 = 该章节主线任务链全部完成（由 storyProgressionManager 推进）
// - computeUnlockState(progress) 纯函数：根据剧情进度派生解锁状态（无副作用，可测试）
// - 章节推进时广播 story:unlock_changed（新解锁项 + 提示文案）

import { createLogger } from '../utils/index.js'
import type { StoryProgress } from './storyProgressionManager.js'

const logger = createLogger('StoryUnlock')

// =============================================
// 解锁目标类型
// =============================================

export type UnlockTargetType = 'scene' | 'npc'

/** 解锁规则（一个目标一条） */
export interface UnlockRule {
  /** 目标ID：场景ID（town/forest/mine...）或 NPC 名字（玛格丽特/格罗姆...） */
  id: string
  type: UnlockTargetType
  /** 显示名 */
  name: string
  /** 解锁所需章节（完成该章节主线后解锁；0=初始可见） */
  requiredChapter: number
  /** 解锁提示文案（区域/角色登场） */
  unlockMessage: string
  /** 锁定时的交互提示文案 */
  lockedMessage: string
  /** 可选：额外剧情标志（flags 命中才解锁） */
  requiredFlag?: string
}

// =============================================
// 解锁规则表
// =============================================

/**
 * 场景解锁规则
 * 章节节奏：
 *  - 序章(0)：小镇 + 基础建筑全开放（生活区）
 *  - 第一章(1)：低语森林 + 长老大厅（长老登场，剧情主舞台外延）
 *  - 第二章(2)：废弃矿洞（矿工铁砧登场）
 *  - 第三章(3)：全部开放（终局舞台）
 */
export const SCENE_UNLOCK_RULES: UnlockRule[] = [
  // --- 序章初始开放（小镇生活区） ---
  { id: 'town', type: 'scene', name: '星火小镇', requiredChapter: 0, unlockMessage: '星火小镇 — 你的旅程从这里开始', lockedMessage: '' },
  { id: 'blacksmith', type: 'scene', name: '铁砧工坊', requiredChapter: 0, unlockMessage: '铁砧工坊 — 炉火不灭', lockedMessage: '' },
  { id: 'alchemist', type: 'scene', name: '魔法药剂店', requiredChapter: 0, unlockMessage: '魔法药剂店 — 药香弥漫', lockedMessage: '' },
  { id: 'tavern', type: 'scene', name: '星光酒馆', requiredChapter: 0, unlockMessage: '星光酒馆 — 美酒与传说', lockedMessage: '' },
  { id: 'market', type: 'scene', name: '集市', requiredChapter: 0, unlockMessage: '集市 — 货物云集', lockedMessage: '' },
  { id: 'residential', type: 'scene', name: '温馨小屋', requiredChapter: 0, unlockMessage: '温馨小屋 — 温暖的港湾', lockedMessage: '' },
  { id: 'elder_hall', type: 'scene', name: '长老大厅', requiredChapter: 0, unlockMessage: '长老大厅 — 长老们的议事之所', lockedMessage: '' },
  // --- 第一章解锁 ---
  { id: 'forest', type: 'scene', name: '低语森林', requiredChapter: 1, unlockMessage: '低语森林解锁 — 小镇北方传来神秘的耳语，森林的入口在迷雾中浮现', lockedMessage: '前方雾气弥漫，似有神秘的力量阻隔。或许要先完成小镇的嘱托。' },
  // --- 第二章解锁 ---
  { id: 'mine', type: 'scene', name: '废弃矿洞', requiredChapter: 2, unlockMessage: '废弃矿洞解锁 — 深处的矿脉闪烁着微光，也隐藏着黑暗的秘密', lockedMessage: '矿洞入口被乱石封堵，或许有人在更深处知道开启的方法。' },
]

/**
 * NPC 解锁规则
 * 章节节奏：
 *  - 序章(0)：小镇日常居民
 *  - 第一章(1)：游商托比、守夜人马库斯、占星师西尔维娅
 *  - 第二章(2)：隐居术士格罗姆、矿工头目铁砧
 *  - 第三章(3)：暗影信徒暗祭司塞拉斯（终局关键角色）
 */
export const NPC_UNLOCK_RULES: UnlockRule[] = [
  // --- 序章初始（小镇居民） ---
  { id: '玛格丽特', type: 'npc', name: '玛格丽特', requiredChapter: 0, unlockMessage: '', lockedMessage: '' },
  { id: '老巴克', type: 'npc', name: '老巴克', requiredChapter: 0, unlockMessage: '', lockedMessage: '' },
  { id: '艾拉', type: 'npc', name: '艾拉', requiredChapter: 0, unlockMessage: '', lockedMessage: '' },
  { id: '罗西', type: 'npc', name: '罗西', requiredChapter: 0, unlockMessage: '', lockedMessage: '' },
  { id: '莉莉', type: 'npc', name: '莉莉', requiredChapter: 0, unlockMessage: '', lockedMessage: '' },
  { id: '小皮普', type: 'npc', name: '小皮普', requiredChapter: 0, unlockMessage: '', lockedMessage: '' },
  // --- 第一章解锁 ---
  { id: '托比', type: 'npc', name: '托比', requiredChapter: 1, unlockMessage: '游商托比来到小镇 — 他带来森林异变的消息', lockedMessage: '' },
  { id: '马库斯', type: 'npc', name: '马库斯', requiredChapter: 1, unlockMessage: '守夜人马库斯开始值岗', lockedMessage: '' },
  { id: '西尔维娅', type: 'npc', name: '西尔维娅', requiredChapter: 1, unlockMessage: '占星师西尔维娅在广场仰望星空，预言着不祥的征兆', lockedMessage: '' },
  // --- 第二章解锁 ---
  { id: '格罗姆', type: 'npc', name: '格罗姆', requiredChapter: 2, unlockMessage: '隐居术士格罗姆现身 — 他掌握着关于星火的关键知识', lockedMessage: '' },
  { id: '铁砧', type: 'npc', name: '铁砧', requiredChapter: 2, unlockMessage: '矿工头目铁砧归来 — 废弃矿洞的秘密需要他来解答', lockedMessage: '' },
  // --- 第三章解锁 ---
  { id: '暗祭司塞拉斯', type: 'npc', name: '暗祭司塞拉斯', requiredChapter: 3, unlockMessage: '暗祭司塞拉斯现身 — 小镇的阴影终于浮出水面', lockedMessage: '' },
]

// =============================================
// 解锁状态计算（纯函数）
// =============================================

/** 单目标解锁状态 */
export interface UnlockTargetState {
  id: string
  name: string
  type: UnlockTargetType
  /** 是否已解锁 */
  unlocked: boolean
  /** 所需章节 */
  requiredChapter: number
  /** 解锁提示文案 */
  unlockMessage: string
  /** 锁定提示文案 */
  lockedMessage: string
  /** 是否因额外标志未满足而锁定 */
  flagBlocked?: boolean
}

/** 完整解锁状态 */
export interface UnlockState {
  playerId: string
  currentChapter: number
  completedChapters: number[]
  /** 场景解锁状态（key=场景ID） */
  scenes: Record<string, UnlockTargetState>
  /** NPC解锁状态（key=NPC名字） */
  npcs: Record<string, UnlockTargetState>
  /** 最近一次新解锁项（供广播/提示） */
  newlyUnlocked: UnlockTargetState[]
}

/**
 * 根据剧情进度计算解锁状态
 * @param progress 剧情进度（chapter=该章节主线全部完成后的新章节）
 */
export function computeUnlockState(progress: Pick<StoryProgress, 'playerId' | 'currentChapter' | 'completedChapters' | 'flags'>): UnlockState {
  const { playerId, currentChapter, completedChapters, flags } = progress

  const evalRule = (rule: UnlockRule): UnlockTargetState => {
    let unlocked = currentChapter >= rule.requiredChapter
    let flagBlocked = false
    if (unlocked && rule.requiredFlag) {
      flagBlocked = !(flags[rule.requiredFlag] === true)
      if (flagBlocked) unlocked = false
    }
    return {
      id: rule.id,
      name: rule.name,
      type: rule.type,
      unlocked,
      requiredChapter: rule.requiredChapter,
      unlockMessage: rule.unlockMessage,
      lockedMessage: rule.lockedMessage,
      flagBlocked,
    }
  }

  const scenes: Record<string, UnlockTargetState> = {}
  for (const rule of SCENE_UNLOCK_RULES) {
    scenes[rule.id] = evalRule(rule)
  }

  const npcs: Record<string, UnlockTargetState> = {}
  for (const rule of NPC_UNLOCK_RULES) {
    npcs[rule.id] = evalRule(rule)
  }

  // 新解锁项：所需章节恰好等于当前章节（刚完成上一章推进到本章解锁的内容）
  // 注意：章节推进后 currentChapter=新章节，新解锁项 = requiredChapter === currentChapter 且未被标志阻塞
  const newlyUnlocked = [...SCENE_UNLOCK_RULES, ...NPC_UNLOCK_RULES]
    .filter((r) => r.requiredChapter === currentChapter && currentChapter > 0)
    .map(evalRule)
    .filter((t) => t.unlocked)

  return {
    playerId,
    currentChapter,
    completedChapters,
    scenes,
    npcs,
    newlyUnlocked,
  }
}

/** 获取某场景的锁定提示文案 */
export function getSceneLockedMessage(sceneId: string): string {
  return SCENE_UNLOCK_RULES.find((r) => r.id === sceneId)?.lockedMessage ?? ''
}

/** 获取某NPC的解锁文案 */
export function getNpcUnlockMessage(npcName: string): string {
  return NPC_UNLOCK_RULES.find((r) => r.id === npcName)?.unlockMessage ?? ''
}

// =============================================
// 章节推进联动（广播解锁事件）
// =============================================

/**
 * 章节推进后广播解锁事件
 * @param io Socket.IO 实例
 * @param progress 推进后的剧情进度
 */
export function broadcastUnlock(io: any, progress: StoryProgress): void {
  if (!io) return
  const state = computeUnlockState(progress)
  if (state.newlyUnlocked.length === 0) return

  logger.info(`Player ${progress.playerId} unlocked ${state.newlyUnlocked.length} new targets (chapter ${state.currentChapter})`)

  io.emit('story:unlock_changed', {
    playerId: progress.playerId,
    currentChapter: progress.currentChapter,
    unlocked: state.newlyUnlocked.map((t) => ({
      id: t.id,
      name: t.name,
      type: t.type,
      unlockMessage: t.unlockMessage,
    })),
  })
}
