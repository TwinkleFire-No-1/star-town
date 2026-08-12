import { io, Socket } from 'socket.io-client'
import { useGameStore } from '../stores/gameStore'
import { useAuthStore, getCurrentPlayerId } from '../stores/authStore'
import { pushQuestNotification } from './questNotifications'

/**
 * WebSocketService — 前端 Socket 连接管理
 *
 * 职责：
 * - Socket.IO 客户端连接/断开
 * - 事件监听与分发
 * - 游戏状态同步
 * - 断线重连
 * - 流式对话支持
 *
 * 事件列表：
 * - room:join / room:leave / room:joined / room:playerJoined / room:playerLeft
 * - player:move / player:moved
 * - npc:update / npc:move
 * - time:update
 * - interaction:trigger / interaction:message / interaction:close
 * - interaction:dialog / interaction:dialog:start / interaction:dialog:chunk / interaction:dialog:end
 */

type EventCallback = (...args: any[]) => void

/**
 * 多租户：判断某 playerId 是否为当前登录用户
 * 已登录 → 与真实 playerId 比较；未登录 → 与 socket.id 比较
 */
function isSelfPlayer(playerId: string | null | undefined): boolean {
  if (!playerId) return false
  const realId = getCurrentPlayerId()
  if (realId) return playerId === realId
  const ws = wsService.getSocketId()
  return ws ? playerId === ws : false
}

class WebSocketService {
  private socket: Socket | null = null
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private reconnectDelay = 1000

  /** 自定义事件监听器 */
  private listeners: Map<string, Set<EventCallback>> = new Map()

  /**
   * 连接服务器
   * 默认连接同源地址（开发环境由 Vite 代理，生产环境由 Nginx 反代）
   * 多租户：携带认证 token，服务端解析出真实 playerId
   */
  connect(url?: string): void {
    if (this.socket?.connected) return

    const token = useAuthStore.getState().token

    this.socket = io(url ?? '/', {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: this.maxReconnectAttempts,
      reconnectionDelay: this.reconnectDelay,
      timeout: 10000,
      auth: token ? { token } : undefined,
    })

    this.setupEventHandlers()
  }

  /**
   * 设置 Socket 事件处理
   */
  private setupEventHandlers(): void {
    if (!this.socket) return
    const store = useGameStore

    // --- 连接事件 ---
    this.socket.on('connect', () => {
      console.log('[WS] Connected:', this.socket?.id)
      this.reconnectAttempts = 0
      store.getState().setConnected(true, this.socket?.id ?? undefined)
      // T6.17 修复竞态：Phaser handleReady 可能先 setConnected(true)（无socketId）
      // 导致 store subscribe 的 prev.isConnected 已是 true → joinRoom 永不触发。
      // 改为直接通过自定义事件通知 App joinRoom（不依赖 store 时序）
      this.emitLocal('ws:connected', { socketId: this.socket?.id })
    })

    // --- 多租户进度恢复事件：后端下发玩家存档（位置/属性/等级） ---
    this.socket.on('player:state', (data: {
      playerId: string
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
      level?: number
      exp?: number
      gameDay?: number
    }) => {
      console.log('[WS] Player state restored:', data.name, `(${data.x}, ${data.y})`)
      // 用真实 playerId 覆盖 store 中的玩家标识（多租户核心）
      store.getState().setPlayer({
        id: data.playerId,
        name: data.name,
        x: data.x,
        y: data.y,
        direction: data.direction,
        hp: data.hp,
        maxHp: data.maxHp,
        sp: data.sp,
        maxSp: data.maxSp,
        starCoins: data.starCoins,
      })
      // T6.17 随机形象：将 avatar 同步到本地玩家，用于生成主角精灵
      if (data.avatar) {
        store.getState().setPlayer({ avatar: data.avatar })
        useAuthStore.getState().updatePlayer({ avatar: data.avatar })
      }
      // 同步等级信息（若下发）
      if (typeof data.level === 'number') {
        store.getState().setLevelInfo({
          level: data.level,
          exp: data.exp ?? 0,
        })
      }
      // 更新 authStore 的进度快照（位置）
      useAuthStore.getState().updatePlayer({
        x: data.x,
        y: data.y,
        direction: data.direction,
        starCoins: data.starCoins,
      })
      this.emitLocal('player:state', data)
    })

    this.socket.on('disconnect', (reason) => {
      console.log('[WS] Disconnected:', reason)
      store.getState().setConnected(false)
    })

    this.socket.on('connect_error', (err) => {
      console.error('[WS] Connection error:', err.message)
      this.reconnectAttempts++
    })

    // --- 房间事件 ---
    this.socket.on('room:joined', (data: { roomId: string; players: any[] }) => {
      console.log('[WS] Joined room:', data.roomId)
      store.getState().setRoomId(data.roomId)
      // T6.17 在线玩家系统：room:joined 返回的 players 为"加入时已在线的玩家列表"，
      // 逐个转成 room:playerJoined 事件，让 GameScene 创建远程玩家精灵（跳过自己）
      const selfId = this.getPlayerId()
      for (const p of data.players ?? []) {
        if (p?.playerId && p.playerId !== selfId) {
          this.emitLocal('room:playerJoined', {
            playerId: p.playerId,
            name: p.name,
            avatar: p.avatar ?? 'avatar_01',
            x: p.x,
            y: p.y,
            direction: p.direction,
          })
        }
      }
      this.emitLocal('room:joined', data)
    })

    this.socket.on('room:playerJoined', (data: { playerId: string; name: string; avatar?: string; x: number; y: number; direction: string }) => {
      console.log('[WS] Player joined:', data.name)
      store.getState().setNPC(data.playerId, {
        id: data.playerId,
        name: data.name,
        title: '',
        x: data.x,
        y: data.y,
        direction: data.direction,
        isActive: true,
      })
      this.emitLocal('room:playerJoined', data)
    })

    this.socket.on('room:playerLeft', (data: { playerId: string }) => {
      console.log('[WS] Player left:', data.playerId)
      store.getState().removeNPC(data.playerId)
      this.emitLocal('room:playerLeft', data)
    })

    this.socket.on('room:error', (data: { message: string }) => {
      console.error('[WS] Room error:', data.message)
      this.emitLocal('room:error', data)
    })

    // --- 玩家位置同步事件 ---
    this.socket.on('player:moved', (data: { playerId: string; x: number; y: number; direction: string }) => {
      if (data.playerId && !isSelfPlayer(data.playerId)) {
        store.getState().updateNPCPosition(data.playerId, data.x, data.y, data.direction)
      }
      this.emitLocal('player:moved', data)
    })

    // --- 时间同步事件 ---
    this.socket.on('time:update', (data: { day: number; time: number; hour?: number; period?: string; formatted?: string }) => {
      store.getState().setGameTimeFull(data)
    })

    // --- 天气同步事件（T6.9 天气设定） ---
    this.socket.on('weather:update', (data: {
      type: string
      name: string
      icon: string
      description: string
      gameDay?: number
      gameTime?: number
      updatedAt?: number
    }) => {
      console.log('[WS] Weather update:', data.name)
      store.getState().setWeather({
        type: data.type as import('../stores/gameStore').WeatherType,
        name: data.name,
        icon: data.icon,
        description: data.description,
        gameDay: data.gameDay ?? store.getState().weather.gameDay,
        gameTime: data.gameTime ?? store.getState().weather.gameTime,
        updatedAt: data.updatedAt ?? Date.now(),
      })
      this.emitLocal('weather:update', data)
    })

    // --- NPC 更新事件 ---
    this.socket.on('npc:update', (data: { npcId: string; x: number; y: number; direction: string }) => {
      store.getState().updateNPCPosition(data.npcId, data.x, data.y, data.direction)
    })

    // --- 交互事件（流式对话） ---
    // 对话开始
    this.socket.on('interaction:dialog:start', (data: { npcId: string; npcName: string }) => {
      console.log('[WS] Dialog stream start:', data.npcName)
      store.getState().setDialogStreaming(true)
      this.emitLocal('interaction:dialog:start', data)
    })

    // 对话流式chunk
    this.socket.on('interaction:dialog:chunk', (data: { npcId: string; npcName: string; chunk: string }) => {
      store.getState().appendStreamingChunk(data.npcName, data.chunk)
    })

    // 对话流式结束
    this.socket.on('interaction:dialog:end', (data: { npcId: string; npcName: string; content: string }) => {
      console.log('[WS] Dialog stream end:', data.npcName)
      store.getState().finalizeStreamingMessage(data.npcName, data.content)
      this.emitLocal('interaction:dialog:end', data)
    })

    // 完整对话消息（兼容非流式客户端）
    this.socket.on('interaction:dialog', (data: { npcId: string; npcName: string; content: string }) => {
      const state = store.getState()
      // 如果不在流式状态，直接添加完整消息
      if (!state.interaction.isStreaming) {
        state.addDialogMessage(data.npcName, data.content)
      }
      this.emitLocal('interaction:dialog', data)
    })

    // --- BUG-008修复: 补充缺失的前端事件监听器 ---

    // 剧情触发结果
    this.socket.on('story:triggered', (data: { scene: any }) => {
      console.log('[WS] Story triggered:', data.scene?.id ?? 'none')
      this.emitLocal('story:triggered', data)
    })

    // 剧情解锁变化（章节推进 → 新场景/NPC 解锁）
    this.socket.on('story:unlock_changed', (data: { playerId: string; currentChapter: number; unlocked: Array<{ id: string; name: string; type: string; unlockMessage: string }> }) => {
      console.log('[WS] Story unlock changed:', data.unlocked?.map((u) => u.name).join(', '))
      this.emitLocal('story:unlock_changed', data)
    })

    // 章节完成
    this.socket.on('story:chapter_complete', (data: { playerId: string; completedChapter: number; nextChapter: number; title: string }) => {
      console.log('[WS] Chapter complete:', data.title)
      this.emitLocal('story:chapter_complete', data)
    })

    // 区域解锁
    this.socket.on('story:area_unlocked', (data: { areaId: string }) => {
      console.log('[WS] Area unlocked:', data.areaId)
      this.emitLocal('story:area_unlocked', data)
    })

    // 重连结果
    this.socket.on('reconnect:result', (data: { success: boolean; message: string }) => {
      console.log('[WS] Reconnect result:', data.success ? 'success' : 'failed')
      this.emitLocal('reconnect:result', data)
    })

    // 玩家离线
    this.socket.on('player:offline', (data: { playerId: string }) => {
      console.log('[WS] Player offline:', data.playerId)
      this.emitLocal('player:offline', data)
    })

    // 玩家上线
    this.socket.on('player:online', (data: { playerId: string; name: string; x: number; y: number }) => {
      console.log('[WS] Player online:', data.name)
      this.emitLocal('player:online', data)
    })

    // --- T6.17 在线玩家系统：在线列表 + 玩家间对话 ---

    // 在线玩家列表（新加入时请求，渲染已在线的用户）
    this.socket.on('player:list', (data: {
      players: Array<{
        playerId: string
        name: string
        avatar: string
        x: number
        y: number
        direction: string
        level: number
      }>
    }) => {
      console.log('[WS] Online players:', data.players?.length ?? 0)
      const selfId = this.getPlayerId()
      for (const p of data.players ?? []) {
        if (p?.playerId && p.playerId !== selfId) {
          this.emitLocal('room:playerJoined', {
            playerId: p.playerId,
            name: p.name,
            avatar: p.avatar ?? 'avatar_01',
            x: p.x,
            y: p.y,
            direction: p.direction,
          })
        }
      }
      this.emitLocal('player:list', data)
    })

    // 玩家间对话消息（对方发来的）
    this.socket.on('player:chat', (data: {
      fromPlayerId: string
      fromName: string
      fromAvatar?: string
      message: string
      timestamp: number
    }) => {
      console.log('[WS] Player chat from:', data.fromName, ':', data.message)
      const selfId = this.getPlayerId()
      if (selfId && data.fromPlayerId === selfId) return // 忽略自己的回显
      // 转发给 React 层（PlayerChatPanel 显示）
      this.emitLocal('player:chat', data)
    })

    // NPC移动事件
    this.socket.on('npc:move', (data: { npcId: string; x: number; y: number; direction: string }) => {
      store.getState().updateNPCPosition(data.npcId, data.x, data.y, data.direction)
      this.emitLocal('npc:move', data)
    })

    // --- Pong ---
    this.socket.on('pong', () => {
      // 心跳响应
    })
    // --- 战斗事件（RTwP引擎广播 → 转发给Phaser BattleScene）---
    this.socket.on('battle:event', (data: unknown) => {
      this.emitLocal('battle:event', data)
      // 同时转发到 Phaser 游戏事件总线（BattleScene 监听 game.events 'battle:event'）
      try {
        const game = (window as unknown as { __starTownGame?: { events?: { emit: (e: string, d: unknown) => void } } }).__starTownGame
        if (game?.events && typeof game.events.emit === 'function') {
          game.events.emit('battle:event', data)
        }
      } catch {
        // 忽略转发错误
      }
    })

    // --- T6.8 升级打怪玩法事件 ---

    // 时间驱动主线任务弹出（需要玩家确认）→ 不再弹大窗，改为右侧悬浮按钮感叹号提示
    this.socket.on('story:mainline_popup', (data: {
      playerId: string
      index: number
      questId: string
      title: string
      description: string
      objectives: Array<{ id: string; description: string; targetId?: string; requiredCount: number }>
      reward?: { exp: number; coins: number }
      suggestedLevel?: number
    }) => {
      // T6.14.2: 仅处理本玩家的任务弹窗（防其他玩家/测试玩家广播干扰）
      if (data.playerId && this.socket && !isSelfPlayer(data.playerId)) return
      console.log('[WS] Mainline mission popup (guide):', data.title)
      store.getState().setPendingMission({
        questId: data.questId,
        title: data.title,
        description: data.description,
        objectives: data.objectives,
        reward: data.reward,
        suggestedLevel: data.suggestedLevel,
        index: data.index,
      })
      // 亮起感叹号提示（新任务到来）+ 右下角任务提醒
      store.getState().setGuideHasNew(true)
      pushQuestNotification({
        kind: 'new',
        title: data.title,
        sub: data.description ? data.description.slice(0, 36) : '',
      })
      this.emitLocal('story:mainline_popup', data)
    })

    // 玩家确认主线任务（弹窗 → 进行中）
    this.socket.on('story:mainline_confirmed', (data: {
      playerId: string
      questId: string
      title: string
      objectives: Array<{ id: string; description: string; targetId?: string; requiredCount: number }>
    }) => {
      // T6.14.2: 仅处理本玩家的确认事件
      if (data.playerId && this.socket && !isSelfPlayer(data.playerId)) return
      console.log('[WS] Mainline mission confirmed:', data.title)
      store.getState().setPendingMission(null)
      store.getState().setActiveMission({
        questId: data.questId,
        title: data.title,
        description: '',
        objectives: (data.objectives ?? []).map((o: any) => ({
          id: o.id,
          description: o.description,
          type: o.type,
          targetId: o.targetId,
          requiredCount: o.requiredCount ?? 0,
          currentCount: o.currentCount ?? 0,
        })),
      })
      // 确认后清除感叹号
      store.getState().setGuideHasNew(false)
      this.emitLocal('story:mainline_confirmed', data)
    })

    // 玩家拒绝主线任务（弹窗关闭，稍后重新弹出）
    this.socket.on('story:mainline_rejected', (data: {
      playerId: string
      questId: string
      title: string
      rePopupAt?: { day: number; hour: number }
    }) => {
      // T6.14.2: 仅处理本玩家的拒绝事件
      if (data.playerId && this.socket && !isSelfPlayer(data.playerId)) return
      console.log('[WS] Mainline mission rejected:', data.title)
      store.getState().setPendingMission(null)
      // 拒绝后清除感叹号
      store.getState().setGuideHasNew(false)
      this.emitLocal('story:mainline_rejected', data)
    })

    // 任务引擎事件：主线任务打怪进度实时刷新引导面板
    this.socket.on('quest:event', (event: {
      type: string
      questId: string
      questTitle: string
      playerId: string
      progress?: { current: number; required: number; description: string }
      message?: string
    }) => {
      // 仅处理当前玩家自己的任务事件
      if (event.playerId && this.socket && !isSelfPlayer(event.playerId)) return
      const mission = store.getState().mission
      const isActive = mission.activeMission && mission.activeMission.questId === event.questId
      if ((event.type === 'quest_progress' || event.type === 'quest_objective_complete') && isActive) {
        // 拉取最新状态以更新目标计数
        this.socket?.emit('mainline:status', {})
      }
      // 任务完成：右下角任务提醒 + 主动拉取状态推进下一个任务（后端也会推送 status）
      if (event.type === 'quest_completed') {
        pushQuestNotification({
          kind: 'completed',
          title: event.questTitle,
          sub: (event.message ?? '').replace(/^任务完成：[^！]+！/, ''),
        })
        if (isActive) this.socket?.emit('mainline:status', {})
      }
      this.emitLocal('quest:event', event)
    })

    // 主线任务状态同步
    this.socket.on('mainline:status', (data: {
      playerId: string
      currentIndex: number
      total: number
      pendingMission?: any
      activeMission?: any
      nextMission?: any
      allCompleted: boolean
    }) => {
      if (data.pendingMission) {
        store.getState().setPendingMission({
          questId: data.pendingMission.questId,
          title: data.pendingMission.title,
          description: data.pendingMission.description,
          objectives: (data.pendingMission.objectives ?? []).map((o: any) => ({
            id: o.id,
            description: o.description,
            type: o.type,
            targetId: o.targetId,
            requiredCount: o.requiredCount ?? o.required ?? 0,
            currentCount: o.currentCount ?? 0,
          })),
          reward: { exp: data.pendingMission.rewardExp ?? 0, coins: data.pendingMission.rewardCoins ?? 0 },
          suggestedLevel: data.pendingMission.suggestedLevel,
        })
        // 有待确认任务时亮起感叹号
        store.getState().setGuideHasNew(true)
      }
      if (data.activeMission) {
        store.getState().setActiveMission({
          questId: data.activeMission.questId,
          title: data.activeMission.title,
          description: data.activeMission.description,
          objectives: (data.activeMission.objectives ?? []).map((o: any) => ({
            id: o.id,
            description: o.description,
            type: o.type,
            targetId: o.targetId,
            requiredCount: o.required ?? o.requiredCount ?? 0,
            currentCount: o.current ?? o.currentCount ?? 0,
          })),
        })
      }
      const nextMission = data.nextMission
        ? {
            questId: data.nextMission.questId,
            title: data.nextMission.title,
            description: data.nextMission.description ?? '',
            objectives: (data.nextMission.objectives ?? []).map((o: any) => ({
              id: o.id,
              description: o.description,
              type: o.type,
              targetId: o.targetId,
              requiredCount: o.requiredCount ?? 0,
            })),
            suggestedLevel: data.nextMission.suggestedLevel,
            triggerAt: data.nextMission.triggerAt,
          }
        : null
      store.getState().setMissionProgress({
        currentIndex: data.currentIndex,
        total: data.total,
        allCompleted: data.allCompleted,
        nextMission,
      })
      this.emitLocal('mainline:status', data)
    })

    // 经验/等级更新
    this.socket.on('level:update', (data: {
      playerId: string
      level: number
      exp: number
      expToNext: number
      progressPercent: number
    }) => {
      store.getState().setLevelInfo({
        level: data.level,
        exp: data.exp,
        expToNext: data.expToNext,
        progressPercent: data.progressPercent,
      })
      this.emitLocal('level:update', data)
    })

    // 升级事件（升级动画提示）
    this.socket.on('level:up', (data: {
      playerId: string
      oldLevel: number
      newLevel: number
      levelsGained: number
      stats: Record<string, number>
    }) => {
      console.log(`[WS] LEVEL UP: ${data.oldLevel} → ${data.newLevel}`)
      store.getState().setLastLevelUp({
        oldLevel: data.oldLevel,
        newLevel: data.newLevel,
        levelsGained: data.levelsGained,
        stats: data.stats,
      })
      this.emitLocal('level:up', data)
    })
  }

  // ==========================================
  // 房间操作
  // ==========================================

  joinRoom(roomId: string, playerId: string, name: string): void {
    this.socket?.emit('room:join', { roomId, playerId, name })
  }

  leaveRoom(): void {
    this.socket?.emit('room:leave')
  }

  getRoomList(): void {
    this.socket?.emit('room:list')
  }

  // ==========================================
  // 玩家操作
  // ==========================================

  sendPlayerMove(x: number, y: number, direction: string): void {
    this.socket?.emit('player:move', { x, y, direction })
  }

  // ==========================================
  // 交互操作
  // ==========================================

  /** 触发NPC交互（首次/打招呼） */
  triggerNPCInteraction(npcId: string): void {
    this.socket?.emit('interaction:trigger', { npcId })
  }

  /** 发送对话消息 */
  sendDialogue(npcId: string, message: string): void {
    this.socket?.emit('interaction:message', { npcId, message })
  }

  /** 关闭对话 */
  closeDialogue(npcId: string): void {
    this.socket?.emit('interaction:close', { npcId })
  }

  // ==========================================
  // T6.8 升级打怪玩法操作
  // ==========================================

  /** 确认接受弹出的主线任务 */
  confirmMainlineMission(): void {
    console.log('[WS] Sending story:mainline_confirm')
    this.socket?.emit('story:mainline_confirm', {})
  }

  /** 拒绝（取消）弹出的主线任务 — 稍后（2游戏小时）会再次弹出 */
  rejectMainlineMission(): void {
    console.log('[WS] Sending story:mainline_reject')
    this.socket?.emit('story:mainline_reject', {})
  }

  /** 查询主线任务状态 */
  requestMainlineStatus(): void {
    this.socket?.emit('mainline:status', {})
  }

  // ==========================================
  // T6.15 区域进入上报（推进 visit_area 主线任务目标）
  // ==========================================

  /** 上报进入某可探索场景（低语森林/废弃矿洞等） */
  reportAreaEnter(sceneId: string): void {
    this.socket?.emit('area:enter', { sceneId })
  }

  // ==========================================
  // T6.17 在线玩家系统操作
  // ==========================================

  /** 请求当前在线玩家列表（新加入/回到小镇时渲染其他在线用户） */
  requestPlayerList(): void {
    this.socket?.emit('player:list', {})
  }

  /** 发送玩家间对话消息 */
  sendPlayerChat(targetPlayerId: string, message: string): void {
    this.socket?.emit('player:chat', { targetPlayerId, message })
  }

  // ==========================================
  // 自定义事件系统
  // ==========================================

  on(event: string, callback: EventCallback): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }
    this.listeners.get(event)!.add(callback)
  }

  off(event: string, callback: EventCallback): void {
    this.listeners.get(event)?.delete(callback)
  }

  private emitLocal(event: string, ...args: any[]): void {
    this.listeners.get(event)?.forEach((cb) => cb(...args))
  }

  // ==========================================
  // 连接管理
  // ==========================================

  /**
   * BUG-007修复: 断开连接时清理所有Socket事件监听器
   * 防止组件卸载时内存泄漏和重复触发
   */
  disconnect(): void {
    if (this.socket) {
      // 移除所有事件监听器，防止内存泄漏
      this.socket.removeAllListeners()
      this.socket.disconnect()
      this.socket = null
    }
    this.listeners.clear()
    useGameStore.getState().setConnected(false)
  }

  getSocketId(): string | null {
    return this.socket?.id ?? null
  }

  /**
   * 多租户：获取当前玩家的真实 playerId
   * 已登录 → authStore 中的 Player.id；未登录 → socket.id
   */
  getPlayerId(): string | null {
    return getCurrentPlayerId() ?? this.socket?.id ?? null
  }

  isConnected(): boolean {
    return this.socket?.connected ?? false
  }
}

/** 全局 WebSocket 服务单例 */
export const wsService = new WebSocketService()
