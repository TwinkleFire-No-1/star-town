import { create } from 'zustand'

/**
 * gameStore — Zustand 游戏状态管理
 *
 * Slice 设计：
 * - connection: 连接状态
 * - player: 玩家数据
 * - npc: NPC 状态
 * - time: 游戏时间
 * - region: 区域/镜头
 * - interaction: 交互状态
 */

// ---- Types ----

export interface PlayerState {
  id: string | null
  name: string
  avatar?: string
  x: number
  y: number
  direction: string
  hp: number
  maxHp: number
  sp: number
  maxSp: number
  starCoins: number
}

export interface NPCState {
  id: string
  name: string
  title: string
  x: number
  y: number
  direction: string
  isActive: boolean
}

export interface TimeState {
  gameDay: number
  gameTime: number // 0-1440 (分钟)
  gameHour?: number // 0-23 游戏小时
  period: 'dawn' | 'morning' | 'afternoon' | 'evening' | 'night'
}

export interface InteractionState {
  activeNPCId: string | null
  activeNPCName: string | null
  isDialogOpen: boolean
  dialogMessages: Array<{ speaker: string; content: string }>
  /** 是否正在流式接收 */
  isStreaming: boolean
  /** 流式接收中的临时消息 */
  streamingMessage: { speaker: string; content: string } | null
}

/** 解锁目标状态（场景/NPC 随剧情解锁） */
export interface UnlockTargetState {
  id: string
  name: string
  type: 'scene' | 'npc'
  unlocked: boolean
  requiredChapter: number
  unlockMessage: string
  lockedMessage: string
}

/** 主线任务目标（T6.8 升级打怪玩法） */
export interface MissionObjective {
  id: string
  description: string
  /** T6.14.2: 目标类型（talk_to_npc/kill_enemy/collect_item/visit_area 等），供地图指引定位 */
  type?: string
  targetId?: string
  requiredCount: number
  currentCount?: number
}

/** 待确认/进行中的主线任务（升级打怪） */
export interface MainlineMission {
  questId: string
  title: string
  description: string
  objectives: MissionObjective[]
  reward?: { exp: number; coins: number }
  suggestedLevel?: number
  index?: number
  triggerAt?: { day: number; hour: number }
}

/** 玩家等级信息（升级打怪玩法） */
export interface LevelState {
  level: number
  exp: number
  expToNext: number
  progressPercent: number
}

/** 时间驱动主线任务状态 slice */
export interface MissionState {
  /** 待玩家确认的任务（弹窗中） */
  pendingMission: MainlineMission | null
  /** 进行中的任务 */
  activeMission: MainlineMission | null
  /** 任务链总进度 */
  currentIndex: number
  total: number
  /** 全部完成 */
  allCompleted: boolean
  /** 下一个待触发的主线任务（用于引导预告） */
  nextMission: MainlineMission | null
  /** 任务引导面板是否展开（右侧悬浮按钮） */
  guideOpen: boolean
  /** 是否有新任务感叹号提示（收到 story:mainline_popup 时为 true，点击按钮后清除） */
  guideHasNew: boolean
}

/** 剧情解锁状态 slice */
export interface StoryState {
  /** 当前章节 */
  currentChapter: number
  /** 已完成章节 */
  completedChapters: number[]
  /** 场景解锁状态（key=场景ID） */
  scenes: Record<string, UnlockTargetState>
  /** NPC解锁状态（key=NPC名字） */
  npcs: Record<string, UnlockTargetState>
  /** 最近解锁通知（章节推进时显示） */
  lastUnlockNotice: Array<{ id: string; name: string; type: string; unlockMessage: string }> | null
}

/** 天气类型（与服务端 weatherService 保持一致） */
export type WeatherType = 'sunny' | 'cloudy' | 'light_rain' | 'storm' | 'snow' | 'fog'

/** 天气状态 slice（T6.9 天气设定） */
export interface WeatherState {
  type: WeatherType
  name: string
  icon: string
  description: string
  gameDay: number
  gameTime: number
  updatedAt: number
}

/** 天气默认状态 */
export const DEFAULT_WEATHER: WeatherState = {
  type: 'sunny',
  name: '晴天',
  icon: '☀️',
  description: '阳光明媚，小镇暖洋洋的。',
  gameDay: 1,
  gameTime: 480,
  updatedAt: 0,
}

/** 玩家间对话消息（T6.17 在线玩家系统） */
export interface PlayerChatMessage {
  /** 说话方 playerId（自己=own，对方=对方ID） */
  fromPlayerId: string
  /** 说话方名字 */
  fromName: string
  content: string
  timestamp: number
}

/** 玩家间对话状态（T6.17 在线玩家互相对话） */
export interface PlayerChatState {
  /** 对话对象 playerId */
  targetPlayerId: string | null
  /** 对话对象名字 */
  targetName: string | null
  /** 对话面板是否打开 */
  isOpen: boolean
  /** 消息列表 */
  messages: PlayerChatMessage[]
}

export interface GameState {
  // --- Connection ---
  isConnected: boolean
  socketId: string | null
  roomId: string | null

  // --- Player ---
  player: PlayerState

  // --- NPCs ---
  npcs: Record<string, NPCState>

  // --- Time ---
  time: TimeState

  // --- Region ---
  currentRegion: string | null

  // --- Interaction ---
  interaction: InteractionState

  // --- Story (剧情解锁) ---
  story: StoryState

  // --- Weather (T6.9 天气设定) ---
  weather: WeatherState

  // --- Mission (时间驱动主线任务·升级打怪) ---
  mission: MissionState

  // --- Level (升级打怪) ---
  level: LevelState
  /** 最近一次升级提示（动画展示） */
  lastLevelUp: { oldLevel: number; newLevel: number; levelsGained: number; stats: Record<string, number> } | null

  // --- PlayerChat (T6.17 在线玩家互相对话) ---
  playerChat: PlayerChatState

  // --- Actions: Connection ---
  setConnected: (connected: boolean, socketId?: string) => void
  setRoomId: (roomId: string | null) => void

  // --- Actions: Player ---
  setPlayer: (player: Partial<PlayerState>) => void
  updatePlayerPosition: (x: number, y: number, direction: string) => void

  // --- Actions: NPCs ---
  setNPC: (id: string, npc: Partial<NPCState>) => void
  setNPCs: (npcs: Record<string, NPCState>) => void
  removeNPC: (id: string) => void
  updateNPCPosition: (id: string, x: number, y: number, direction: string) => void

  // --- Actions: Time ---
  setGameTime: (day: number, time: number) => void
  /** 设置完整时间状态（含 hour 和 period） */
  setGameTimeFull: (data: { day: number; time: number; hour?: number; period?: string; formatted?: string }) => void

  // --- Actions: Region ---
  setCurrentRegion: (region: string | null) => void

  // --- Actions: Interaction ---
  setActiveNPC: (npcId: string | null, npcName: string | null) => void
  setDialogOpen: (open: boolean) => void
  addDialogMessage: (speaker: string, content: string) => void
  clearDialog: () => void
  /** 设置流式接收状态 */
  setDialogStreaming: (streaming: boolean) => void
  /** 追加流式chunk */
  appendStreamingChunk: (speaker: string, chunk: string) => void
  /** 完成流式消息 */
  finalizeStreamingMessage: (speaker: string, fullContent: string) => void

  // --- Actions: Story ---
  /** 设置完整剧情解锁状态 */
  setStoryUnlockState: (state: StoryState) => void
  /** 设置解锁通知（章节推进时） */
  setLastUnlockNotice: (notice: StoryState['lastUnlockNotice']) => void
  /** 标记场景解锁 */
  setSceneUnlocked: (sceneId: string, unlocked: boolean) => void

  // --- Actions: Weather (T6.9) ---
  /** 更新天气状态 */
  setWeather: (weather: Partial<WeatherState>) => void

  // --- Actions: Mission ---
  /** 弹出待确认主线任务 */
  setPendingMission: (mission: MainlineMission | null) => void
  /** 设置进行中的主线任务 */
  setActiveMission: (mission: MainlineMission | null) => void
  /** 设置任务链进度 */
  setMissionProgress: (data: Partial<MissionState>) => void
  /** 设置任务引导面板开合 */
  setGuideOpen: (open: boolean) => void
  /** 设置新任务感叹号提示 */
  setGuideHasNew: (hasNew: boolean) => void

  // --- Actions: Level ---
  /** 更新等级信息 */
  setLevelInfo: (level: Partial<LevelState>) => void
  /** 设置升级提示 */
  setLastLevelUp: (info: { oldLevel: number; newLevel: number; levelsGained: number; stats: Record<string, number> } | null) => void

  // --- Actions: PlayerChat (T6.17) ---
  /** 打开与某玩家的对话面板 */
  openPlayerChat: (targetPlayerId: string, targetName: string) => void
  /** 关闭玩家对话面板 */
  closePlayerChat: () => void
  /** 追加一条自己发出的消息 */
  addOwnPlayerChatMessage: (content: string) => void
  /** 追加一条对方发来的消息（自动打开面板） */
  addIncomingPlayerChatMessage: (fromPlayerId: string, fromName: string, content: string) => void
}

/**
 * 计算当前时段
 */
function getPeriodFromTime(time: number): TimeState['period'] {
  if (time >= 300 && time < 420) return 'dawn'      // 5:00-7:00
  if (time >= 420 && time < 720) return 'morning'    // 7:00-12:00
  if (time >= 720 && time < 1020) return 'afternoon' // 12:00-17:00
  if (time >= 1020 && time < 1140) return 'evening'  // 17:00-19:00
  return 'night'                                     // 19:00-5:00
}

export const useGameStore = create<GameState>((set) => ({
  // --- Connection ---
  isConnected: false,
  socketId: null,
  roomId: null,

  // --- Player ---
  player: {
    id: null,
    name: '旅行者',
    x: 640,
    y: 360,
    direction: 'down',
    hp: 100,
    maxHp: 100,
    sp: 50,
    maxSp: 50,
    starCoins: 100,
  },

  // --- NPCs ---
  npcs: {},

  // --- Time ---
  time: {
    gameDay: 1,
    gameTime: 480, // 8:00 AM
    period: 'morning',
  },

  // --- Region ---
  currentRegion: null,

  // --- Interaction ---
  interaction: {
    activeNPCId: null,
    activeNPCName: null,
    isDialogOpen: false,
    dialogMessages: [],
    isStreaming: false,
    streamingMessage: null,
  },

  // --- Story (剧情解锁) ---
  story: {
    currentChapter: 0,
    completedChapters: [],
    scenes: {},
    npcs: {},
    lastUnlockNotice: null,
  },

  // --- Weather (T6.9 天气设定) ---
  weather: { ...DEFAULT_WEATHER },

  // --- Mission (时间驱动主线任务·升级打怪) ---
  mission: {
    pendingMission: null,
    activeMission: null,
    currentIndex: 0,
    total: 0,
    allCompleted: false,
    nextMission: null,
    guideOpen: false,
    guideHasNew: false,
  },

  // --- Level (升级打怪) ---
  level: {
    level: 1,
    exp: 0,
    expToNext: 80,
    progressPercent: 0,
  },
  lastLevelUp: null,

  // --- PlayerChat (T6.17 在线玩家互相对话) ---
  playerChat: {
    targetPlayerId: null,
    targetName: null,
    isOpen: false,
    messages: [],
  },

  // --- Actions: Connection ---
  setConnected: (connected, socketId) =>
    set({ isConnected: connected, socketId: socketId ?? null }),

  setRoomId: (roomId) => set({ roomId }),

  // --- Actions: Player ---
  setPlayer: (player) =>
    set((state) => ({ player: { ...state.player, ...player } })),

  updatePlayerPosition: (x, y, direction) =>
    set((state) => ({
      player: { ...state.player, x, y, direction },
    })),

  // --- Actions: NPCs ---
  setNPC: (id, npc) =>
    set((state) => ({
      npcs: {
        ...state.npcs,
        [id]: { ...(state.npcs[id] ?? { id, name: '', title: '', x: 0, y: 0, direction: 'down', isActive: true }), ...npc },
      },
    })),

  setNPCs: (npcs) => set({ npcs }),

  removeNPC: (id) =>
    set((state) => {
      const npcs = { ...state.npcs }
      delete npcs[id]
      return { npcs }
    }),

  updateNPCPosition: (id, x, y, direction) =>
    set((state) => ({
      npcs: {
        ...state.npcs,
        [id]: {
          ...(state.npcs[id] ?? { id, name: '', title: '', isActive: true }),
          x,
          y,
          direction,
        },
      },
    })),

  // --- Actions: Time ---
  setGameTime: (day, time) =>
    set({
      time: {
        gameDay: day,
        gameTime: time,
        period: getPeriodFromTime(time),
      },
    }),

  setGameTimeFull: (data) =>
    set({
      time: {
        gameDay: data.day,
        gameTime: data.time,
        gameHour: data.hour,
        period: (data.period as TimeState['period']) ?? getPeriodFromTime(data.time),
      },
    }),

  // --- Actions: Region ---
  setCurrentRegion: (region) => set({ currentRegion: region }),

  // --- Actions: Interaction ---
  setActiveNPC: (npcId, npcName) =>
    set((state) => ({
      interaction: {
        ...state.interaction,
        activeNPCId: npcId,
        activeNPCName: npcName,
      },
    })),

  setDialogOpen: (open) =>
    set((state) => ({
      interaction: { ...state.interaction, isDialogOpen: open },
    })),

  addDialogMessage: (speaker, content) =>
    set((state) => ({
      interaction: {
        ...state.interaction,
        dialogMessages: [...state.interaction.dialogMessages, { speaker, content }],
      },
    })),

  clearDialog: () =>
    set((state) => ({
      interaction: { ...state.interaction, dialogMessages: [], isDialogOpen: false, isStreaming: false, streamingMessage: null },
    })),

  setDialogStreaming: (streaming) =>
    set((state) => ({
      interaction: {
        ...state.interaction,
        isStreaming: streaming,
        streamingMessage: streaming ? { speaker: '', content: '' } : null,
      },
    })),

  appendStreamingChunk: (speaker, chunk) =>
    set((state) => {
      const current = state.interaction.streamingMessage
      const newContent = (current?.content ?? '') + chunk
      return {
        interaction: {
          ...state.interaction,
          isStreaming: true,
          streamingMessage: {
            speaker,
            content: newContent,
          },
        },
      }
    }),

  finalizeStreamingMessage: (speaker, fullContent) =>
    set((state) => {
      // 用完整内容替换流式消息，并添加到对话历史
      const existingMessages = state.interaction.dialogMessages
      // 避免重复添加：如果最后一条已经是相同内容则跳过
      const lastMsg = existingMessages[existingMessages.length - 1]
      if (lastMsg && lastMsg.speaker === speaker && lastMsg.content === fullContent) {
        return {
          interaction: {
            ...state.interaction,
            isStreaming: false,
            streamingMessage: null,
          },
        }
      }
      return {
        interaction: {
          ...state.interaction,
          dialogMessages: [...existingMessages, { speaker, content: fullContent }],
          isStreaming: false,
          streamingMessage: null,
        },
      }
    }),

  // --- Actions: Story ---
  setStoryUnlockState: (story) => set({ story }),
  setLastUnlockNotice: (lastUnlockNotice) =>
    set((state) => ({ story: { ...state.story, lastUnlockNotice } })),
  setSceneUnlocked: (sceneId, unlocked) =>
    set((state) => ({
      story: {
        ...state.story,
        scenes: {
          ...state.story.scenes,
          [sceneId]: {
            ...(state.story.scenes[sceneId] ?? { id: sceneId, name: sceneId, type: 'scene' as const, unlocked, requiredChapter: 0, unlockMessage: '', lockedMessage: '' }),
            unlocked,
          },
        },
      },
    })),

  // --- Actions: Weather (T6.9) ---
  setWeather: (weather) =>
    set((state) => ({ weather: { ...state.weather, ...weather } })),

  // --- Actions: Mission ---
  setPendingMission: (pendingMission) =>
    set((state) => ({ mission: { ...state.mission, pendingMission } })),

  setActiveMission: (activeMission) =>
    set((state) => ({ mission: { ...state.mission, activeMission } })),

  setMissionProgress: (data) =>
    set((state) => ({ mission: { ...state.mission, ...data } })),

  setGuideOpen: (guideOpen) =>
    set((state) => ({ mission: { ...state.mission, guideOpen } })),

  setGuideHasNew: (guideHasNew) =>
    set((state) => ({ mission: { ...state.mission, guideHasNew } })),

  // --- Actions: Level ---
  setLevelInfo: (level) =>
    set((state) => ({ level: { ...state.level, ...level } })),

  setLastLevelUp: (lastLevelUp) => set({ lastLevelUp }),

  // --- Actions: PlayerChat (T6.17) ---
  openPlayerChat: (targetPlayerId, targetName) =>
    set((state) => ({
      playerChat: {
        ...state.playerChat,
        targetPlayerId,
        targetName,
        isOpen: true,
      },
    })),

  closePlayerChat: () =>
    set((state) => ({
      playerChat: {
        ...state.playerChat,
        isOpen: false,
        targetPlayerId: null,
        targetName: null,
        messages: [],
      },
    })),

  addOwnPlayerChatMessage: (content) =>
    set((state) => {
      const ownId = state.player.id ?? 'own'
      const ownName = state.player.name ?? '我'
      return {
        playerChat: {
          ...state.playerChat,
          messages: [
            ...state.playerChat.messages,
            { fromPlayerId: ownId, fromName: ownName, content, timestamp: Date.now() },
          ],
        },
      }
    }),

  addIncomingPlayerChatMessage: (fromPlayerId, fromName, content) =>
    set((state) => {
      // 对方主动发起对话：若当前没有打开任何对话，自动打开与该玩家的面板
      const isTalkingToThem =
        state.playerChat.isOpen && state.playerChat.targetPlayerId === fromPlayerId
      const nextState: PlayerChatState = isTalkingToThem
        ? state.playerChat
        : {
            ...state.playerChat,
            targetPlayerId: fromPlayerId,
            targetName: fromName,
            isOpen: true,
          }
      return {
        playerChat: {
          ...nextState,
          messages: [
            ...nextState.messages,
            { fromPlayerId, fromName, content, timestamp: Date.now() },
          ],
        },
      }
    }),
}))
