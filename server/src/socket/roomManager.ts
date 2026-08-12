import type { Server, Socket } from 'socket.io'
import { createLogger } from '../utils/index.js'

const logger = createLogger('RoomManager')

/** 房间内玩家信息 */
interface RoomPlayer {
  playerId: string
  name: string
  avatar: string
  socketId: string
  joinedAt: number
  x: number
  y: number
  direction: string
}

/** 房间状态 */
interface Room {
  id: string
  name: string
  players: Map<string, RoomPlayer>
  createdAt: number
  maxPlayers: number
  status: 'waiting' | 'playing' | 'finished'
}

/** 房间管理器 — 管理游戏房间生命周期 */
class RoomManager {
  private rooms = new Map<string, Room>()
  private playerRoomMap = new Map<string, string>() // socketId → roomId

  /**
   * 创建房间
   */
  createRoom(roomId: string, name: string, maxPlayers = 10): Room {
    if (this.rooms.has(roomId)) {
      throw new Error(`Room ${roomId} already exists`)
    }

    const room: Room = {
      id: roomId,
      name,
      players: new Map(),
      createdAt: Date.now(),
      maxPlayers,
      status: 'waiting',
    }

    this.rooms.set(roomId, room)
    logger.info(`Room created: ${roomId} "${name}" (max: ${maxPlayers})`)
    return room
  }

  /**
   * 玩家加入房间
   */
  joinRoom(
    roomId: string,
    playerId: string,
    name: string,
    socketId: string,
    avatar = 'avatar_01',
  ): Room {
    let room = this.rooms.get(roomId)

    // 自动创建默认房间
    if (!room) {
      room = this.createRoom(roomId, `Room ${roomId}`)
    }

    if (room.players.size >= room.maxPlayers) {
      throw new Error(`Room ${roomId} is full`)
    }

    if (room.players.has(playerId)) {
      throw new Error(`Player ${playerId} already in room ${roomId}`)
    }

    const player: RoomPlayer = {
      playerId,
      name,
      avatar,
      socketId,
      joinedAt: Date.now(),
      x: 160,
      y: 90,
      direction: 'down',
    }

    room.players.set(playerId, player)
    this.playerRoomMap.set(socketId, roomId)
    logger.info(`Player ${name} joined room ${roomId} (${room.players.size}/${room.maxPlayers})`)

    return room
  }

  /**
   * 玩家离开房间
   */
  leaveRoom(socketId: string): { room: Room; playerId: string } | null {
    const roomId = this.playerRoomMap.get(socketId)
    if (!roomId) return null

    const room = this.rooms.get(roomId)
    if (!room) return null

    // 找到该 socket 对应的玩家
    let playerId = ''
    for (const [pid, player] of room.players) {
      if (player.socketId === socketId) {
        playerId = pid
        break
      }
    }

    if (!playerId) return null

    room.players.delete(playerId)
    this.playerRoomMap.delete(socketId)
    logger.info(`Player ${playerId} left room ${roomId} (${room.players.size}/${room.maxPlayers})`)

    // 房间为空时自动删除
    if (room.players.size === 0) {
      this.rooms.delete(roomId)
      logger.info(`Room ${roomId} deleted (empty)`)
    }

    return { room, playerId }
  }

  /**
   * 更新玩家位置
   */
  updatePlayerPosition(
    socketId: string,
    x: number,
    y: number,
    direction: string,
  ): Room | null {
    const roomId = this.playerRoomMap.get(socketId)
    if (!roomId) return null

    const room = this.rooms.get(roomId)
    if (!room) return null

    for (const player of room.players.values()) {
      if (player.socketId === socketId) {
        player.x = x
        player.y = y
        player.direction = direction
        break
      }
    }

    return room
  }

  /**
   * 获取房间信息
   */
  getRoom(roomId: string): Room | undefined {
    return this.rooms.get(roomId)
  }

  /**
   * 获取所有房间列表
   */
  getRoomList(): Array<{
    id: string
    name: string
    playerCount: number
    maxPlayers: number
    status: string
  }> {
    return Array.from(this.rooms.values()).map((room) => ({
      id: room.id,
      name: room.name,
      playerCount: room.players.size,
      maxPlayers: room.maxPlayers,
      status: room.status,
    }))
  }

  /**
   * 获取房间内所有玩家
   */
  getRoomPlayers(roomId: string): RoomPlayer[] {
    const room = this.rooms.get(roomId)
    if (!room) return []
    return Array.from(room.players.values())
  }
}

/** 全局房间管理器实例 */
const roomManager = new RoomManager()

// 自动创建默认大厅房间
roomManager.createRoom('town-square', '小镇广场', 20)

/**
 * 设置房间相关的 Socket 事件处理
 */
export function setupRoomHandlers(_io: Server, socket: Socket): void {
  // 加入房间
  socket.on('room:join', (data: { roomId: string; playerId: string; name: string; avatar?: string }) => {
    try {
      roomManager.joinRoom(data.roomId, data.playerId, data.name, socket.id, data.avatar)
      socket.join(data.roomId)

      // 通知房间内其他玩家（带形象 avatar，供前端渲染远程玩家精灵）
      socket.to(data.roomId).emit('room:playerJoined', {
        playerId: data.playerId,
        name: data.name,
        avatar: data.avatar ?? 'avatar_01',
        x: 160,
        y: 90,
        direction: 'down',
      })

      // 返回房间信息给加入者（含全部在线玩家列表，带 avatar）
      socket.emit('room:joined', {
        roomId: data.roomId,
        players: roomManager.getRoomPlayers(data.roomId).map((p) => ({
          playerId: p.playerId,
          name: p.name,
          avatar: p.avatar,
          x: p.x,
          y: p.y,
          direction: p.direction,
        })),
      })

      logger.info(`[Room] ${data.name} joined ${data.roomId}`)
    } catch (err) {
      socket.emit('room:error', { message: (err as Error).message })
    }
  })

  // 离开房间
  socket.on('room:leave', () => {
    const result = roomManager.leaveRoom(socket.id)
    if (result) {
      socket.leave(result.room.id)
      socket.to(result.room.id).emit('room:playerLeft', {
        playerId: result.playerId,
      })
      logger.info(`[Room] Player ${result.playerId} left ${result.room.id}`)
    }
  })

  // 获取房间列表
  socket.on('room:list', () => {
    socket.emit('room:list', roomManager.getRoomList())
  })

  // 玩家位置广播（包含 playerId 以区分不同玩家）
  socket.on('player:move', (data: { x: number; y: number; direction: string }) => {
    const room = roomManager.updatePlayerPosition(socket.id, data.x, data.y, data.direction)
    if (room) {
      // 查找 playerId
      let playerId = ''
      for (const [pid, player] of room.players) {
        if (player.socketId === socket.id) {
          playerId = pid
          break
        }
      }
      socket.to(room.id).emit('player:moved', {
        playerId,
        x: data.x,
        y: data.y,
        direction: data.direction,
      })
    }
  })

  // 断开连接时自动离开房间
  socket.on('disconnect', () => {
    const result = roomManager.leaveRoom(socket.id)
    if (result) {
      socket.to(result.room.id).emit('room:playerLeft', {
        playerId: result.playerId,
      })
    }
  })
}

export { roomManager }
