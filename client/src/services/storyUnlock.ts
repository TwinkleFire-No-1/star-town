// 星火小镇 — 前端剧情解锁管理器
// 需求：场景、NPC 随剧情推进逐步可见。
// 职责：
// - 从后端拉取玩家解锁状态（/api/integration/unlock-state/:playerId）
// - 缓存到 gameStore（story slice）
// - 监听 WebSocket story:unlock_changed / story:chapter_complete 实时刷新
// - 提供查询辅助：isSceneUnlocked / isNpcUnlocked / getLockedMessage

import { useGameStore } from '../stores/gameStore'
import type { StoryState } from '../stores/gameStore'
import { wsService } from './websocket'

// 同源相对路径：开发环境由 Vite 代理到 4000，生产环境由 Nginx 反代
const API_BASE = '/api/integration'

/**
 * 从后端拉取玩家解锁状态
 * @param playerId 玩家ID（无则使用真实 playerId）
 */
export async function fetchUnlockState(playerId?: string): Promise<StoryState | null> {
  const pid = playerId ?? wsService.getPlayerId() ?? 'default-player'
  try {
    const res = await fetch(`${API_BASE}/unlock-state/${pid}`)
    if (!res.ok) return null
    const json = (await res.json()) as { data: StoryState | null }
    const data = json.data
    if (!data) return null

    const store = useGameStore.getState()
    store.setStoryUnlockState({
      currentChapter: data.currentChapter,
      completedChapters: data.completedChapters ?? [],
      scenes: data.scenes ?? {},
      npcs: data.npcs ?? {},
      lastUnlockNotice: store.story.lastUnlockNotice,
    })
    return data
  } catch (err) {
    console.warn('[StoryUnlock] Failed to fetch unlock state:', err)
    return null
  }
}

/**
 * 场景是否已解锁
 */
export function isSceneUnlocked(sceneId: string): boolean {
  const state = useGameStore.getState().story
  const scene = state.scenes[sceneId]
  // 解锁规则表中没有的场景（如室内场景）视为已解锁
  if (!scene) return true
  return scene.unlocked
}

/**
 * NPC是否已解锁（未在规则表中视为已解锁）
 */
export function isNpcUnlocked(npcName: string): boolean {
  const state = useGameStore.getState().story
  const npc = state.npcs[npcName]
  if (!npc) return true
  return npc.unlocked
}

/**
 * 获取场景锁定提示文案
 */
export function getSceneLockedMessage(sceneId: string): string {
  const state = useGameStore.getState().story
  return state.scenes[sceneId]?.lockedMessage ?? '前方迷雾弥漫，暂时无法通行。'
}

/**
 * 监听剧情解锁事件（章节推进 → 新场景/NPC解锁 → 提示）
 * 返回取消订阅函数
 */
export function watchStoryUnlockEvents(onUnlocked?: (unlocked: Array<{ id: string; name: string; type: string; unlockMessage: string }>) => void): () => void {
  const handleUnlockChanged = (data: { currentChapter: number; unlocked: Array<{ id: string; name: string; type: string; unlockMessage: string }> }) => {
    const unlocked = data.unlocked ?? []
    const store = useGameStore.getState()
    if (unlocked.length > 0) {
      store.setLastUnlockNotice(unlocked)
      // 刷新解锁状态
      fetchUnlockState().then(() => {
        onUnlocked?.(unlocked)
      })
    }
  }

  const handleChapterComplete = () => {
    // 章节完成也主动刷新（可能解锁多章节内容）
    fetchUnlockState()
  }

  wsService.on('story:unlock_changed', handleUnlockChanged)
  wsService.on('story:chapter_complete', handleChapterComplete)

  return () => {
    wsService.off('story:unlock_changed', handleUnlockChanged)
    wsService.off('story:chapter_complete', handleChapterComplete)
  }
}
