import type { Server, Socket } from 'socket.io'
import { setupRoomHandlers } from './roomManager.js'
import { redisSessionManager } from '../services/redisSession.js'
import { profileLoader } from '../services/profileLoader.js'
import { perceiveModule } from '../services/perceiveModule.js'
import { thinkModule } from '../services/thinkModule.js'
import { actModule } from '../services/actModule.js'
import { dialogueHistoryManager } from '../services/dialogueHistoryManager.js'
import { storyProgressionManager } from '../services/storyProgressionManager.js'
import { edgeCaseHandler } from '../services/edgeCaseHandler.js'
import { memoryUpdateModule } from '../services/memoryUpdateModule.js'
import { responseLatencyOptimizer } from '../services/responseLatencyOptimizer.js'
import { createLogger } from '../utils/index.js'
import { gameClock } from '../services/gameClock.js'
import { prisma } from '../models/prisma.js'
import { npcMovementDriver } from '../services/npcMovementDriver.js'
import { ambientNpcService } from '../services/ambientNpcService.js'
import { ambientDialogueService } from '../services/ambientDialogueService.js'
import { mainlineQuestService } from '../services/mainlineQuestService.js'
import { weatherService } from '../services/weatherService.js'
import { SPAWN_X, SPAWN_Y } from '../services/authService.js'

const logger = createLogger('Socket')

/**
 * 设置 WebSocket 事件处理
 * 统一管理所有 Socket 事件分发
 *
 * 事件分类：
 * - 房间管理: room:join / room:leave / room:list
 * - 玩家位置: player:move / player:moved
 * - NPC交互: interaction:trigger / interaction:dialog / interaction:dialog:stream / interaction:dialog:end
 * - 时间同步: time:update
 * - 心跳: ping / pong
 */
export function setupSocketHandlers(io: Server): void {
  io.on('connection', async (socket: Socket) => {
    logger.info(`Client connected: ${socket.id}`)

    // ==========================================
    // 多租户：玩家身份从认证中间件注入（socket.data）
    // 已认证用户 → 真实 Player.id（进度按用户隔离）
    // 游客（无token）→ 退化为 socket.id（兼容旧流程）
    // ==========================================
    const playerId: string = socket.data.playerId ?? socket.id
    const playerName: string = socket.data.playerName ?? `旅行者${socket.id.substring(0, 4)}`
    socket.data.playerId = playerId
    socket.data.playerName = playerName

    // 玩家定向广播：加入以 playerId 命名的房间（io.to(playerId) 才能送达该玩家）
    // T6.14.2 修复：此前主线任务弹窗 io.to(playerId) 因 socket 未 join 而无法送达真实玩家
    socket.join(playerId)

    // ==========================================
    // 房间管理 + 在线玩家系统事件注册（提前到 await 之前）
    // 修复 T6.17 竞态：connection 回调含 await（prisma/redis），若事件监听在 await 之后
    // 才注册，客户端 connect 后立即 emit 的 room:join/player:list 会因监听器未注册而丢失
    // ==========================================
    setupRoomHandlers(io, socket)

    // 查询当前在线玩家列表（带形象 avatar），供新加入玩家渲染其他在线用户
    socket.on('player:list', (_data: unknown) => {
      const online: Array<{
        playerId: string
        name: string
        avatar: string
        x: number
        y: number
        direction: string
        level: number
      }> = []
      for (const s of io.sockets.sockets.values()) {
        const pid = s.data?.playerId as string | undefined
        const pname = s.data?.playerName as string | undefined
        if (!pid) continue
        if (pid === playerId) continue // 跳过自己
        online.push({
          playerId: pid,
          name: pname ?? `旅行者${pid.substring(0, 4)}`,
          avatar: (s.data?.playerAvatar as string) ?? 'avatar_01',
          x: (s.data?.playerX as number) ?? SPAWN_X,
          y: (s.data?.playerY as number) ?? SPAWN_Y,
          direction: (s.data?.playerDir as string) ?? 'down',
          level: (s.data?.playerLevel as number) ?? 1,
        })
      }
      socket.emit('player:list', { players: online })
      logger.info(`[PlayerList] ${playerId} requested online players: ${online.length}`)
    })

    // 玩家间对话：转发消息给目标玩家（T6.17 在线玩家互相对话）
    socket.on('player:chat', async (data: { targetPlayerId?: string; message?: string }) => {
      const targetId = data?.targetPlayerId
      const message = (data?.message ?? '').trim()
      if (!targetId || !message) return
      // 会话级消息记录（可选，先透传）
      io.to(targetId).emit('player:chat', {
        fromPlayerId: playerId,
        fromName: playerName,
        fromAvatar: socket.data.playerAvatar ?? 'avatar_01',
        message,
        timestamp: Date.now(),
      })
      logger.info(`[PlayerChat] ${playerName} → ${targetId}: ${message}`)
    })

    // 加载玩家存档（恢复上次位置/进度）
    let savedPlayer = await prisma.player.findUnique({ where: { id: playerId } }).catch(() => null)
    if (!savedPlayer) {
      savedPlayer = await prisma.player.create({
        data: {
          id: playerId,
          name: playerName,
          avatar: 'avatar_01',
          hp: 100,
          maxHp: 100,
          sp: 50,
          maxSp: 50,
          starCoins: 100,
        },
      }).catch(() => null)
      logger.info(`[Player] Auto-created player record: ${playerId}`)
    }
    // T6.17 在线玩家系统：将玩家形象存到 socket.data，供房间广播与玩家列表使用
    socket.data.playerAvatar = savedPlayer?.avatar ?? 'avatar_01'

    // 创建 Redis 会话（绑定真实 playerId）
    // 出生点统一为温馨小屋门口：所有用户每次进入游戏都从小屋门口开始（不恢复上次位置）
    await redisSessionManager.createSession({
      socketId: socket.id,
      playerId,
      playerName,
      roomId: null,
      lastX: SPAWN_X,
      lastY: SPAWN_Y,
      lastDirection: savedPlayer?.direction ?? 'down',
    })

    // 将数据库中的玩家位置重置为温馨小屋门口（保持持久化一致）
    if (savedPlayer && (savedPlayer.x !== SPAWN_X || savedPlayer.y !== SPAWN_Y)) {
      void prisma.player.update({
        where: { id: playerId },
        data: { x: SPAWN_X, y: SPAWN_Y },
      })
        .then(() => logger.info(`[Player] Spawn reset to 温馨小屋门口: ${playerId}`))
        .catch((err) => logger.warn(`[Player] Spawn reset failed: ${(err as Error).message}`))
    }

    // 发送恢复进度：位置/属性 → 前端在出生点放置角色（位置固定为温馨小屋门口）
    socket.emit('player:state', {
      playerId,
      name: playerName,
      avatar: savedPlayer?.avatar ?? 'avatar_01',
      x: SPAWN_X,
      y: SPAWN_Y,
      direction: savedPlayer?.direction ?? 'down',
      hp: savedPlayer?.hp ?? 100,
      maxHp: savedPlayer?.maxHp ?? 100,
      sp: savedPlayer?.sp ?? 50,
      maxSp: savedPlayer?.maxSp ?? 50,
      starCoins: savedPlayer?.starCoins ?? 100,
      level: savedPlayer?.level ?? 1,
      exp: savedPlayer?.exp ?? 0,
      gameDay: savedPlayer?.gameDay ?? 1,
    })

    // 玩家移动 → 节流保存位置到数据库（进度持久化）
    socket.on('player:move', (data: { x: number; y: number; direction: string }) => {
      logger.info(`[Player] player:move received: (${data.x}, ${data.y}, ${data.direction}) for ${playerId}`)
      // T6.17 缓存位置到 socket.data，供 player:list 在线列表返回实时坐标
      socket.data.playerX = data.x
      socket.data.playerY = data.y
      socket.data.playerDir = data.direction
      // 只节流写库：每 3 秒最多一次（避免高频写）
      const now = Date.now()
      const last = (socket.data as { _lastPosSave?: number })._lastPosSave ?? 0
      if (now - last > 3000) {
        ;(socket.data as { _lastPosSave?: number })._lastPosSave = now
        void prisma.player.update({
          where: { id: playerId },
          data: { x: data.x, y: data.y, direction: data.direction },
        })
          .then(() => logger.info(`[Player] Position saved: ${playerId} → (${data.x}, ${data.y})`))
          .catch((err) => logger.warn(`[Player] Position save failed: ${(err as Error).message}`))
      }
    })

    // 发送当前游戏时间给新客户端
    gameClock.sendTimeToClient(socket)

    // 发送当前天气给新客户端（T6.9 天气系统）
    weatherService.sendWeatherToClient(socket)

    // 注册玩家到时间驱动主线任务服务（T6.8 升级打怪玩法）
    // 连接后立即检查：若到了任务触发时间则弹出主线任务
    mainlineQuestService.registerPlayer(playerId).catch((err) => {
      logger.warn(`[Mainline] Register player failed: ${(err as Error).message}`)
    })

    // 房间管理事件（已在连接开头注册，避免 await 竞态）
    // setupRoomHandlers(io, socket)

    // T6.17 在线玩家系统事件（player:list / player:chat）已在连接开头注册

    // 心跳
    socket.on('ping', () => {
      socket.emit('pong')
      redisSessionManager.heartbeat(socket.id)
    })

    // 断线重连请求
    socket.on('reconnect:request', async (data: { previousSocketId?: string }) => {
      logger.info(`[Reconnect] ${playerId} requesting reconnect, previous=${data.previousSocketId ?? 'none'}`)
      // 多租户：以真实 playerId 为主键恢复，previousSocketId 仅为兼容旧流程保留
      const result = await edgeCaseHandler.handleReconnect(playerId, data.previousSocketId)
      socket.emit('reconnect:result', result)
    })

    // 剧情触发请求（全链路联调用）
    socket.on('story:trigger', async (data: { triggerType: string; npcId?: string; areaId?: string; questId?: string }) => {
      logger.info(`[Story] ${playerId} triggering: ${data.triggerType}`)
      try {
        const result = await storyProgressionManager.triggerScene({
          playerId,
          triggerType: data.triggerType as any,
          npcId: data.npcId,
          areaId: data.areaId,
          questId: data.questId,
        })
        socket.emit('story:triggered', result)

        // === 剧情驱动NPC移动 ===
        // 场景触发成功后，相关NPC走向玩家（让NPC"动起来"，不再原地不动）
        if (result?.scene && data.npcId) {
          // 从会话/房间获取玩家位置
          const session = await redisSessionManager.getSession(socket.id)
          const playerPos = {
            x: session?.lastX ?? 160,
            y: session?.lastY ?? 90,
          }
          npcMovementDriver.moveNpcToPlayer(data.npcId, playerPos)
        }
      } catch (err) {
        logger.error(`[Story] Trigger error: ${(err as Error).message}`)
        socket.emit('story:triggered', { scene: null })
      }
    })

    // ==========================================
    // NPC交互事件 — 接入完整Agent链路
    // ==========================================

    // 交互触发（玩家按下E键/点击NPC）
    socket.on('interaction:trigger', async (data: { npcId: string }) => {
      logger.info(`[Interaction] ${playerId} triggers NPC: ${data.npcId}`)

      try {
        const npcId = data.npcId

        // 普通NPC（amb_ 前缀）：接入大模型对话（不参与主线剧情），LLM失败回退固定台词
        if (ambientNpcService.isAmbientNpc(npcId)) {
          const ambient = ambientNpcService.getById(npcId)
          if (!ambient) {
            socket.emit('interaction:dialog', {
              npcId,
              npcName: '???',
              content: '（这个NPC似乎不存在）',
            })
            return
          }
          socket.emit('interaction:dialog:start', {
            npcId,
            npcName: ambient.name,
          })
          const session = await redisSessionManager.getSession(socket.id)
          const sessionPlayerName = session?.playerName ?? playerName
          const content = await ambientDialogueService.greet(
            npcId,
            playerId,
            sessionPlayerName,
            (chunk) => {
              socket.emit('interaction:dialog:chunk', {
                npcId,
                npcName: ambient.name,
                chunk,
              })
            },
          )
          socket.emit('interaction:dialog:end', {
            npcId,
            npcName: ambient.name,
            content,
          })
          socket.emit('interaction:dialog', {
            npcId,
            npcName: ambient.name,
            content,
          })
          return
        }

        const profile = profileLoader.getProfile(npcId)

        if (!profile) {
          socket.emit('interaction:dialog', {
            npcId,
            npcName: '???',
            content: '（这个NPC似乎不存在）',
          })
          return
        }

        const npcName = profile.name

        // 修复：将"设置对话状态"移到think/act之后。
        // 原逻辑先设置 talkingTo，导致 think 决策（规则2：正在对话→continue）
        // 永远返回 continue，NPC 从不生成问候语。
        // 现在 think 时 talkingTo 为空，会正确选择 dialogue 并生成开场白。

        // T5.3.4: 预生成NPC打招呼回复
        responseLatencyOptimizer.pregenerateGreeting(npcId)

        // T5.3.4: 消费预生成回复（预热缓存，后续对话流程可使用缓存）
        responseLatencyOptimizer.getPregenerated(npcId)

        // 获取玩家信息
        const session = await redisSessionManager.getSession(socket.id)
        const sessionPlayerName = session?.playerName ?? playerName

        // 构造环境快照（使用游戏时钟）
        const gameTime = gameClock.getTime()
        const environment = {
          gameHour: gameTime.gameHour,
          gameDay: gameTime.gameDay,
          currentArea: '广场',
          weather: weatherService.getWeatherSnapshot(),
          nearbyEntities: [
            {
              id: playerId,
              type: 'player' as const,
              name: sessionPlayerName,
              distance: 20,
              inDialogueRange: true,
            },
          ],
          globalEvents: [],
        }

        // 执行Agent循环：感知→思考→行动
        // T5.3.4: 加入延迟计时
        const triggerStartTime = Date.now()
        const perceiveStart = Date.now()
        const perception = await perceiveModule.perceive(npcId, environment)
        const perceiveMs = Date.now() - perceiveStart

        const thinkStart = Date.now()
        const thinkResult = await thinkModule.think(npcId, perception)
        const thinkMs = Date.now() - thinkStart

        const actStart = Date.now()
        const actResult = await actModule.act(thinkResult)
        const actMs = Date.now() - actStart

        // 决策完成后标记NPC正在与玩家对话（防止调度器移走NPC）
        profileLoader.updateRuntimeState(npcId, {
          talkingTo: playerId,
          currentAction: 'talking',
        })

        // 记录延迟数据
        responseLatencyOptimizer.recordLatency({
          totalMs: Date.now() - triggerStartTime,
          perceiveMs,
          thinkMs,
          actMs,
          firstChunkMs: actMs, // 非流式首字延迟=行动延迟
          cacheHit: false,
          wasFallback: false,
        })

        if (actResult.dialogueContent) {
          // 有对话内容 → 流式发送
          socket.emit('interaction:dialog:start', {
            npcId,
            npcName,
          })

          // 逐字流式发送（模拟打字机效果）
          const content = actResult.dialogueContent
          for (let i = 0; i < content.length; i++) {
            socket.emit('interaction:dialog:chunk', {
              npcId,
              npcName,
              chunk: content[i],
            })
            // 20ms每字，模拟流式输出
            await new Promise((r) => setTimeout(r, 20))
          }

          socket.emit('interaction:dialog:end', {
            npcId,
            npcName,
            content,
          })

          // 更新游戏Store中的对话消息
          socket.emit('interaction:dialog', {
            npcId,
            npcName,
            content,
          })

          // T6.15 对话推进 talk_to_npc 任务目标（如主线任务"与玛格丽特交谈"）
          try {
            const { questEngine } = await import('../services/questEngine.js')
            await questEngine.triggerNpcTalk(playerId, npcId)
          } catch (err) {
            logger.warn(`[Interaction] Quest talk trigger failed: ${(err as Error).message}`)
          }

          // 记录对话到记忆
          await memoryUpdateModule.recordDialogue(
            npcId,
            playerId,
            sessionPlayerName,
            `（冒险者${sessionPlayerName}靠近了）`,
            content,
            'player',
          )
        } else {
          // 没有对话内容（如移动/待机等）
          socket.emit('interaction:dialog', {
            npcId,
            npcName,
            content: `${npcName}似乎在忙，没有注意到你。`,
          })
        }
      } catch (err) {
        logger.error(`[Interaction] Error: ${(err as Error).message}`)
        socket.emit('interaction:dialog', {
          npcId: data.npcId,
          npcName: '???',
          content: '（对话出现了问题，请稍后再试）',
        })
      }
    })

    // 玩家发送对话消息
    socket.on('interaction:message', async (data: { npcId: string; message: string }) => {
      logger.info(`[Interaction] ${playerId} -> ${data.npcId}: ${data.message}`)

      try {
        const { npcId, message } = data

        // 普通NPC（amb_ 前缀）：接入大模型对话（不参与主线剧情），LLM失败回退固定台词
        if (ambientNpcService.isAmbientNpc(npcId)) {
          const ambient = ambientNpcService.getById(npcId)
          if (!ambient) return
          const session = await redisSessionManager.getSession(socket.id)
          const sessionPlayerName = session?.playerName ?? playerName
          socket.emit('interaction:dialog:start', {
            npcId,
            npcName: ambient.name,
          })
          const content = await ambientDialogueService.reply(
            npcId,
            playerId,
            sessionPlayerName,
            message,
            (chunk) => {
              socket.emit('interaction:dialog:chunk', {
                npcId,
                npcName: ambient.name,
                chunk,
              })
            },
          )
          socket.emit('interaction:dialog:end', {
            npcId,
            npcName: ambient.name,
            content,
          })
          socket.emit('interaction:dialog', {
            npcId,
            npcName: ambient.name,
            content,
          })
          return
        }

        const profile = profileLoader.getProfile(npcId)

        if (!profile) return

        const npcName = profile.name
        const session = await redisSessionManager.getSession(socket.id)
        const sessionPlayerName = session?.playerName ?? playerName

        // 构造环境快照（使用游戏时钟）
        const gameTime = gameClock.getTime()
        const environment = {
          gameHour: gameTime.gameHour,
          gameDay: gameTime.gameDay,
          currentArea: '广场',
          weather: weatherService.getWeatherSnapshot(),
          nearbyEntities: [
            {
              id: playerId,
              type: 'player' as const,
              name: sessionPlayerName,
              distance: 20,
              inDialogueRange: true,
            },
          ],
          globalEvents: [],
        }

        // 获取感知结果
        const msgStartTime = Date.now()
        const perceiveStart = Date.now()
        const perception = await perceiveModule.perceive(npcId, environment)
        const perceiveMs = Date.now() - perceiveStart

        // T5.3.4: 尝试缓存加速
        let cacheHit = false
        const cacheResult = await responseLatencyOptimizer.tryCacheAcceleration(npcId, message)
        if (cacheResult?.fromCache) {
          cacheHit = true
        }

        // 通知前端：NPC正在思考
        socket.emit('interaction:dialog:start', {
          npcId,
          npcName,
        })

        // 流式生成回复
        let fullContent = ''
        const actStart = Date.now()
        let firstChunkTime = 0
        const replyResult = await actModule.generateReplyStream(
          npcId,
          message,
          sessionPlayerName,
          playerId,
          perception,
          (chunk) => {
            if (firstChunkTime === 0) firstChunkTime = Date.now()
            fullContent += chunk
            socket.emit('interaction:dialog:chunk', {
              npcId,
              npcName,
              chunk,
            })
          },
        )

        // 记录延迟数据
        const actMs = Date.now() - actStart
        const firstChunkMs = firstChunkTime > 0 ? firstChunkTime - actStart : actMs
        responseLatencyOptimizer.recordLatency({
          totalMs: Date.now() - msgStartTime + perceiveMs,
          perceiveMs,
          thinkMs: 0,
          actMs,
          firstChunkMs,
          cacheHit,
          wasFallback: false,
        })

        // 流式结束
        socket.emit('interaction:dialog:end', {
          npcId,
          npcName,
          content: replyResult.content,
        })

        // 完整消息也发一份（用于非流式客户端）
        socket.emit('interaction:dialog', {
          npcId,
          npcName,
          content: replyResult.content,
        })

        // 记录对话到记忆
        await memoryUpdateModule.recordDialogue(
          npcId,
          playerId,
          sessionPlayerName,
          message,
          replyResult.content,
          'player',
        )

        // 全链路联调：触发剧情场景和任务推进
        try {
          const storyResult = await storyProgressionManager.triggerScene({
            playerId,
            triggerType: 'npc_talk',
            npcId,
          })
          if (storyResult.scene) {
            // 如果触发了剧情对话，也发送给前端
            socket.emit('interaction:dialog', {
              npcId,
              npcName: '剧情',
              content: `[剧情触发] ${storyResult.scene.id}`,
            })
          }
          if (storyResult.unlockedArea) {
            socket.emit('story:area_unlocked', { areaId: storyResult.unlockedArea })
          }
        } catch (storyErr) {
          logger.warn(`[Interaction] Story trigger error: ${(storyErr as Error).message}`)
        }
      } catch (err) {
        logger.error(`[Interaction] Message error: ${(err as Error).message}`)
        socket.emit('interaction:dialog', {
          npcId: data.npcId,
          npcName: '???',
          content: '（NPC没有回应...）',
        })
      }
    })

    // 对话结束
    socket.on('interaction:close', (data: { npcId: string }) => {
      logger.info(`[Interaction] ${socket.id} closed dialog with ${data.npcId}`)

      // 清除对话状态
      profileLoader.updateRuntimeState(data.npcId, {
        talkingTo: null,
        currentAction: 'idle',
      })

      // 关闭对话会话（按玩家ID关闭，多租户隔离）
      dialogueHistoryManager.closeSession(data.npcId, playerId)
    })

    // ==========================================
    // 时间驱动主线任务（T6.8 升级打怪玩法）
    // ==========================================

    // 玩家确认接受弹出的主线任务
    socket.on('story:mainline_confirm', async (_data: unknown) => {
      logger.info(`[Mainline] ${playerId} confirming pending mission`)
      try {
        const result = await mainlineQuestService.confirmMission(playerId)
        socket.emit('story:mainline_confirm_result', result)
      } catch (err) {
        logger.error(`[Mainline] Confirm error: ${(err as Error).message}`)
        socket.emit('story:mainline_confirm_result', { success: false, message: '确认失败，请重试' })
      }
    })

    // 玩家拒绝（取消）弹出的主线任务 — 稍后（2游戏小时）再弹
    socket.on('story:mainline_reject', async (_data: unknown) => {
      logger.info(`[Mainline] ${playerId} rejecting pending mission`)
      try {
        const result = await mainlineQuestService.rejectMission(playerId)
        socket.emit('story:mainline_reject_result', result)
      } catch (err) {
        logger.error(`[Mainline] Reject error: ${(err as Error).message}`)
        socket.emit('story:mainline_reject_result', { success: false, message: '操作失败，请重试' })
      }
    })

    // 查询主线任务状态
    socket.on('mainline:status', async (_data: unknown) => {
      try {
        const status = await mainlineQuestService.getStatus(playerId)
        socket.emit('mainline:status', status)
      } catch (err) {
        logger.error(`[Mainline] Status error: ${(err as Error).message}`)
        socket.emit('mainline:status', { playerId, error: (err as Error).message })
      }
    })

    // ==========================================
    // T6.15 区域进入上报 —— 推进 visit_area 主线任务目标
    // 前端场景切换（进入低语森林/废弃矿洞等）后上报，任务引擎据此推进"前往X"目标
    // ==========================================
    socket.on('area:enter', async (data: { sceneId?: string; sceneName?: string }) => {
      const areaName = data?.sceneId ?? data?.sceneName ?? ''
      if (!areaName) return
      try {
        const { questEngine } = await import('../services/questEngine.js')
        await questEngine.triggerAreaEnter(playerId, areaName)
        // 同时触发剧情 area_enter（解锁/推进剧情场景）
        try {
          await storyProgressionManager.triggerScene({
            playerId,
            triggerType: 'area_enter',
            areaId: areaName,
          })
        } catch {
          // 无剧情场景时不报错
        }
      } catch (err) {
        logger.warn(`[Area] area:enter trigger failed: ${(err as Error).message}`)
      }
    })

    // 断开连接
    // T5.4.2 BUG-002修复: 使用原子清理，防止重连竞态
    socket.on('disconnect', async () => {
      logger.info(`Client disconnected: ${socket.id}`)

      // 先标记：原子清理所有与该玩家对话的NPC状态
      // 使用同步遍历+批量更新，防止重连请求在清理间隙到达
      const npcIdsToClean: string[] = []
      for (const profile of profileLoader.getAllProfiles()) {
        const runtimeState = profileLoader.getRuntimeState(profile.id)
        if (runtimeState?.talkingTo === playerId) {
          npcIdsToClean.push(profile.id)
        }
      }

      // 批量原子清理NPC对话状态
      for (const npcId of npcIdsToClean) {
        profileLoader.updateRuntimeState(npcId, {
          talkingTo: null,
          currentAction: 'idle',
        })
        dialogueHistoryManager.closeSession(npcId, playerId)
      }

      // 再执行边界处理（此时NPC状态已清理，重连请求不会冲突）
      // 多租户：以真实 playerId 清理（而非 socket.id）
      await edgeCaseHandler.handleDisconnect(playerId)

      // 最后删除会话（按 socket.id，Redis key 结构不变）
      await redisSessionManager.deleteSession(socket.id)
    })
  })
}
