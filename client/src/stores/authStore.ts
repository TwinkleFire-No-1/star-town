import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

/**
 * authStore — 多租户登录状态管理
 *
 * 职责：
 * - token 与玩家信息的持久化（localStorage）
 * - 注册 / 登录 / 登出 API 调用
 * - 提供当前登录用户的 playerId（真实玩家 ID，非 socket.id）
 *
 * 多租户隔离：每个用户名对应一个独立 Player 档案，
 * 再次进入时通过 token 恢复该用户的完整进度。
 */

export interface AuthPlayer {
  id: string
  name: string
  avatar: string
  x: number
  y: number
  direction: string
  starCoins: number
  gameDay: number
  level: number
  exp: number
  createdAt?: string
}

interface AuthState {
  /** 认证 token（localStorage 持久化） */
  token: string | null
  /** 当前登录玩家信息 */
  player: AuthPlayer | null
  /** 是否已认证 */
  isAuthenticated: () => boolean
  /** 注册（已存在则自动登录） */
  register: (username: string) => Promise<AuthPlayer>
  /** 登录（不存在则自动注册） */
  login: (username: string) => Promise<AuthPlayer>
  /** 静默恢复：用本地 token 拉取最新进度 */
  restore: () => Promise<AuthPlayer | null>
  /** 更新本地玩家进度快照 */
  updatePlayer: (partial: Partial<AuthPlayer>) => void
  /** 登出 */
  logout: () => void
}

/** 认证 API 基础路径 */
const AUTH_BASE = '/api/auth'

async function authFetch(path: string, body?: unknown, token?: string | null): Promise<any> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`
  const res = await fetch(`${AUTH_BASE}${path}`, {
    method: body ? 'POST' : 'GET',
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = (await res.json().catch(() => ({}))) as { data?: any; error?: string }
  if (!res.ok) {
    throw new Error(json.error ?? `请求失败(${res.status})`)
  }
  return json.data
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      player: null,

      isAuthenticated: () => Boolean(get().token),

      register: async (username: string) => {
        const data = await authFetch('/register', { username })
        set({ token: data.token, player: data.player })
        return data.player as AuthPlayer
      },

      login: async (username: string) => {
        const data = await authFetch('/login', { username })
        set({ token: data.token, player: data.player })
        return data.player as AuthPlayer
      },

      restore: async () => {
        const token = get().token
        if (!token) return null
        try {
          const player = await authFetch('/me', undefined, token)
          set({ player })
          return player as AuthPlayer
        } catch {
          // token 失效 → 清除本地状态
          set({ token: null, player: null })
          return null
        }
      },

      updatePlayer: (partial: Partial<AuthPlayer>) => {
        const current = get().player
        if (current) set({ player: { ...current, ...partial } })
      },

      logout: () => {
        set({ token: null, player: null })
      },
    }),
    {
      name: 'sparktown-auth', // localStorage key
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        token: state.token,
        player: state.player,
      }),
    },
  ),
)

/** 便捷获取当前登录用户 ID */
export function getCurrentPlayerId(): string | null {
  return useAuthStore.getState().player?.id ?? null
}

/** 便捷获取当前登录用户名 */
export function getCurrentPlayerName(): string {
  return useAuthStore.getState().player?.name ?? '旅行者'
}
