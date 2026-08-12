// 星火小镇 — 成就系统（前端检测 + 右下角弹出）
// 职责：
// - 定义成就清单（有趣、贴合小镇冒险主题）
// - 监听 gameStore 变化 + WebSocket 事件，检测成就是否满足
// - localStorage 持久化解锁记录（同一次会话不重复弹出）
// - 维护弹出队列（一次显示一个，避免刷屏）
//
// 触发数据源：
// - store.level / lastLevelUp          → 升级成就
// - store.story.scenes/npcs/chapter    → 探索/社交/章节成就
// - store.mission.allCompleted         → 主线通关成就
// - store.weather / store.time         → 天气/深夜成就
// - ws 'quest:event' / 'battle:event' / 'story:mainline_confirmed' → 任务/击杀成就

import { useGameStore } from '../stores/gameStore'
import type { GameState } from '../stores/gameStore'
import { wsService } from './websocket'

const STORAGE_KEY = 'star-town:achievements'
const KILL_COUNT_KEY = 'star-town:kill-count'
/** 弹出队列上限：初始批量解锁时最多排队展示条数，其余静默记录 */
const MAX_QUEUE = 4

export interface AchievementDef {
  id: string
  icon: string
  name: string
  desc: string
}

/** 成就清单 */
export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first_step', icon: '🥾', name: '初来乍到', desc: '接下第一个主线任务，踏上旅途' },
  { id: 'first_kill', icon: '⚔️', name: '第一滴血', desc: '首次击败一名敌人' },
  { id: 'hunter_10', icon: '🏹', name: '荒野猎手', desc: '累计击败 10 名敌人' },
  { id: 'first_up', icon: '🎉', name: '小试牛刀', desc: '第一次升级' },
  { id: 'level_5', icon: '🎖️', name: '崭露头角', desc: '等级达到 5 级' },
  { id: 'level_10', icon: '👑', name: '小镇英雄', desc: '等级达到 10 级' },
  { id: 'quest_first', icon: '📜', name: '使命必达', desc: '完成第一个主线任务' },
  { id: 'quest_all', icon: '🌟', name: '星火传说', desc: '完成全部主线任务' },
  { id: 'deep_forest', icon: '🌲', name: '深入密林', desc: '剧情推进至第一章' },
  { id: 'explorer', icon: '🗺️', name: '足迹遍野', desc: '解锁小镇全部区域' },
  { id: 'social', icon: '🤝', name: '交游广阔', desc: '结识小镇全部居民' },
  { id: 'rain', icon: '☔', name: '雨中漫步', desc: '在雨天出门冒险' },
  { id: 'snow', icon: '❄️', name: '雪之访客', desc: '在雪天出门冒险' },
  { id: 'storm', icon: '⚡', name: '风暴行者', desc: '在暴风雨中穿行' },
  { id: 'night_owl', icon: '🌙', name: '深夜守望者', desc: '凌晨时分仍在冒险' },
]

const ACH_BY_ID = new Map(ACHIEVEMENTS.map((a) => [a.id, a]))

// ==========================================
// 持久化（localStorage）
// ==========================================

function loadUnlocked(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return new Set()
    return new Set(JSON.parse(raw) as string[])
  } catch {
    return new Set()
  }
}

function saveUnlocked(ids: Set<string>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]))
  } catch {
    // 忽略存储失败（如隐私模式）
  }
}

function loadKillCount(): number {
  try {
    return Number(localStorage.getItem(KILL_COUNT_KEY) ?? 0) || 0
  } catch {
    return 0
  }
}

function saveKillCount(count: number): void {
  try {
    localStorage.setItem(KILL_COUNT_KEY, String(count))
  } catch {
    // ignore
  }
}

// ==========================================
// 弹出队列（模块级状态 + 订阅）
// ==========================================

type Listener = () => void
const listeners = new Set<Listener>()
let queue: AchievementDef[] = []

function notify(): void {
  listeners.forEach((l) => l())
}

/** 订阅队列变化，返回取消订阅函数 */
export function subscribeAchievements(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** 当前队列第一项（正在展示中的成就） */
export function peekAchievement(): AchievementDef | null {
  return queue.length > 0 ? queue[0] : null
}

/** 移除已展示的成就（由 Toast 组件在展示结束后调用） */
export function popAchievement(): void {
  queue.shift()
  notify()
}

/**
 * 解锁成就：已解锁则忽略；否则记录并进入弹出队列
 * 队列积压超过 MAX_QUEUE 时只记录不弹出（避免初始批量刷屏）
 */
export function unlockAchievement(id: string): void {
  const def = ACH_BY_ID.get(id)
  if (!def) return
  const unlocked = loadUnlocked()
  if (unlocked.has(id)) return
  unlocked.add(id)
  saveUnlocked(unlocked)
  if (queue.length < MAX_QUEUE) {
    queue.push(def)
    notify()
  }
}

/** 是否已解锁（供其他 UI 使用） */
export function isAchievementUnlocked(id: string): boolean {
  return loadUnlocked().has(id)
}

// ==========================================
// 检测逻辑
// ==========================================

/** 凌晨判定（23:00 - 4:59） */
function isDeepNight(state: GameState): boolean {
  const hour = state.time.gameHour ?? Math.floor((state.time.gameTime ?? 0) / 60)
  return hour >= 23 || hour < 5
}

/** 基于当前完整状态检测（用于连接恢复 & store 变化时） */
function checkState(state: GameState): void {
  const level = state.level.level

  if (level >= 2) unlockAchievement('first_up')
  if (level >= 5) unlockAchievement('level_5')
  if (level >= 10) unlockAchievement('level_10')

  if (state.mission.allCompleted) unlockAchievement('quest_all')

  const chapter = state.story.currentChapter
  if (chapter >= 1) unlockAchievement('deep_forest')

  // 探索：场景全部解锁
  const sceneEntries = Object.values(state.story.scenes)
  if (sceneEntries.length > 0 && sceneEntries.every((s) => s.unlocked)) {
    unlockAchievement('explorer')
  }

  // 社交：NPC 全部解锁（结识）
  const npcEntries = Object.values(state.story.npcs)
  if (npcEntries.length > 0 && npcEntries.every((n) => n.unlocked)) {
    unlockAchievement('social')
  }

  // 天气
  const w = state.weather.type
  if (w === 'light_rain') unlockAchievement('rain')
  if (w === 'storm') unlockAchievement('storm')
  if (w === 'snow') unlockAchievement('snow')

  // 深夜
  if (state.time.period === 'night' && isDeepNight(state)) unlockAchievement('night_owl')
}

/** 当前活跃的清理函数（支持登出/重登时重新绑定） */
let activeCleanup: (() => void) | null = null

/**
 * 初始化成就检测器：订阅 store + WS 事件
 * 返回清理函数。若已有活跃实例，先清理再重建（避免重复监听；React StrictMode / 登出重登安全）。
 */
export function initAchievementDetector(): () => void {
  // 已有活跃实例 → 先清理（登出后重登时重新绑定）
  if (activeCleanup) {
    activeCleanup()
    activeCleanup = null
  }

  // 连接恢复：对当前状态全量检测一次（已满足的成就直接入队）
  checkState(useGameStore.getState())

  // store 变化检测
  const unsubStore = useGameStore.subscribe((state, prev) => {
    // 只关心相关字段变化，减少无谓检测
    const levelChanged = prev.level.level !== state.level.level
    const missionDone = prev.mission.allCompleted !== state.mission.allCompleted
    const storyChanged =
      prev.story.currentChapter !== state.story.currentChapter ||
      prev.story.scenes !== state.story.scenes ||
      prev.story.npcs !== state.story.npcs
    const weatherChanged = prev.weather.type !== state.weather.type
    const nightEntered =
      prev.time.period !== state.time.period &&
      state.time.period === 'night'

    if (levelChanged || missionDone || storyChanged || weatherChanged || nightEntered) {
      checkState(state)
    }
  })

  // --- WS 事件 ---

  // 接受第一个主线任务
  const handleMainlineConfirmed = () => {
    unlockAchievement('first_step')
  }

  // 任务完成
  const handleQuestEvent = (event: { type?: string }) => {
    if (event?.type === 'quest_completed') {
      unlockAchievement('quest_first')
      // 完成全部主线时后端会推送 status，此处同步兜底
      const state = useGameStore.getState()
      if (state.mission.allCompleted) unlockAchievement('quest_all')
    }
  }

  // 战斗胜利（击杀计数）
  const handleBattleEvent = (data: { type?: string }) => {
    if (data?.type === 'victory') {
      const count = loadKillCount() + 1
      saveKillCount(count)
      if (count >= 1) unlockAchievement('first_kill')
      if (count >= 10) unlockAchievement('hunter_10')
    }
  }

  wsService.on('story:mainline_confirmed', handleMainlineConfirmed)
  wsService.on('quest:event', handleQuestEvent)
  wsService.on('battle:event', handleBattleEvent)

  const cleanup = () => {
    unsubStore()
    wsService.off('story:mainline_confirmed', handleMainlineConfirmed)
    wsService.off('quest:event', handleQuestEvent)
    wsService.off('battle:event', handleBattleEvent)
    if (activeCleanup === cleanup) activeCleanup = null
  }
  activeCleanup = cleanup
  return cleanup
}
