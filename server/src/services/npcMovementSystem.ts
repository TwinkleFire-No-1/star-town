// 星火小镇 — NPC移动与寻路系统
// T2.8.2 A*寻路、路径点移动、碰撞避让

import { createLogger } from '../utils/index.js'
import { profileLoader } from './profileLoader.js'

const logger = createLogger('NpcMovement')

// =============================================
// 类型定义
// =============================================

/** 路径点 */
export interface PathWaypoint {
  x: number
  y: number
  /** 到达后的朝向 */
  direction?: string
  /** 该段速度 */
  speed?: number
}

/** 移动状态 */
export type MoveState = 'idle' | 'planning' | 'moving' | 'arrived' | 'blocked'

/** 寻路结果 */
export interface PathfindResult {
  /** 是否找到路径 */
  found: boolean
  /** 路径点列表（含起点和终点） */
  path: PathWaypoint[]
  /** 路径长度（像素） */
  totalDistance: number
  /** 预计耗时（毫秒） */
  estimatedDuration: number
  /** 寻路耗时（毫秒） */
  searchDuration: number
}

/** NPC移动任务 */
export interface MoveTask {
  npcId: string
  start: { x: number; y: number }
  target: { x: number; y: number }
  path: PathWaypoint[]
  currentWaypointIndex: number
  speed: number
  state: MoveState
  /** 创建时间 */
  createdAt: number
  /** 开始移动时间 */
  startedAt: number
  /** 完成回调 */
  onComplete?: () => void
}

/** A*节点 */
interface AStarNode {
  x: number
  y: number
  g: number // 从起点到当前节点的代价
  h: number // 启发式：当前到终点的估计代价
  f: number // f = g + h
  parent: AStarNode | null
}

// =============================================
// NPC移动与寻路系统
// =============================================

/**
 * NpcMovementSystem — NPC移动与寻路系统
 *
 * 职责：
 * 1. A*寻路：在网格上为NPC规划最优路径
 * 2. 路径点移动：NPC沿路径点平滑移动
 * 3. 碰撞避让：移动中与其他NPC避让
 * 4. 移动队列：管理多个NPC的移动任务
 * 5. 移动速度：根据NPC属性和地形调整速度
 *
 * 网格坐标系：
 * - 地图 30×26 tiles，每 tile 64px，总尺寸 1920×1664px
 * - 与前端 MapRenderer 一致（1920×1080 原生高清）
 */
class NpcMovementSystem {
  /** 网格配置 — 与前端地图一致（30×26 tiles × 64px） */
  private readonly GRID_WIDTH = 30
  private readonly GRID_HEIGHT = 26
  private readonly TILE_SIZE = 64

  /** 可通行网格（true=可通行，false=障碍物） */
  private walkableGrid: boolean[][] = []

  /** NPC移动任务表 */
  private moveTasks: Map<string, MoveTask> = new Map()

  /** NPC占用网格（防止重叠） */
  private occupiedCells: Map<string, string> = new Map() // "x,y" → npcId

  /** 移动速度修正 */
  private speedModifiers: Record<string, number> = {}

  /** 默认移动速度（1920×1080 世界坐标） */
  private defaultSpeed = 240

  constructor() {
    this.initWalkableGrid()
    logger.info('NPC movement system initialized')
  }

  // =============================================
  // 网格管理
  // =============================================

  /**
   * 初始化可通行网格
   * 与前端 generateTownMap 布局对齐：
   * - 树木（森林边缘 x<4）不可通行
   * - 建筑外墙（6栋房屋的外框）不可通行
   * - 装饰物（喷泉/水井/长椅/灯柱/招牌）不可通行
   * - 其余（草地/道路/石板/广场/木地板内部）可通行
   */
  private initWalkableGrid(): void {
    for (let y = 0; y < this.GRID_HEIGHT; y++) {
      this.walkableGrid[y] = []
      for (let x = 0; x < this.GRID_WIDTH; x++) {
        this.walkableGrid[y][x] = true
      }
    }

    // === 森林边缘（左侧 4 列，与前端一致）===
    for (let y = 0; y < this.GRID_HEIGHT; y++) {
      for (let x = 0; x < 4; x++) {
        this.walkableGrid[y][x] = false
      }
    }

    // === 建筑外框（不可通行，内部木地板可通行）===
    // 每个建筑：(x, y, w, h) — 外墙为外框一圈
    const buildings = [
      { x: 2, y: 2, w: 6, h: 5 },   // 铁砧工坊（左上）
      { x: 22, y: 2, w: 6, h: 5 },  // 魔法药剂店（右上）
      { x: 22, y: 15, w: 6, h: 5 }, // 星光酒馆（右下）
      { x: 2, y: 15, w: 6, h: 5 },  // 集市（左下）
      { x: 11, y: 2, w: 6, h: 4 },  // 长老大厅（中上）
      { x: 11, y: 18, w: 6, h: 4 }, // 住宅区（中下）
    ]

    for (const b of buildings) {
      // 上墙
      for (let x = b.x; x < b.x + b.w; x++) this.walkableGrid[b.y][x] = false
      // 下墙
      for (let x = b.x; x < b.x + b.w; x++) this.walkableGrid[b.y + b.h - 1][x] = false
      // 左墙
      for (let y = b.y; y < b.y + b.h; y++) this.walkableGrid[y][b.x] = false
      // 右墙
      for (let y = b.y; y < b.y + b.h; y++) this.walkableGrid[y][b.x + b.w - 1] = false
    }

    // === 门（可通行缺口，与前端 door 一致 — 各建筑南墙中央）===
    const doors = [
      { x: 4, y: 6 },   // 铁砧工坊（南墙）
      { x: 24, y: 6 },  // 魔法药剂店（南墙）
      { x: 24, y: 19 }, // 星光酒馆（南墙）
      { x: 4, y: 19 },  // 集市（南墙）
      { x: 14, y: 5 },  // 长老大厅（南墙）
      { x: 14, y: 21 }, // 住宅区（南墙）
      { x: 10, y: 1 },  // 森林入口（北部）
      { x: 27, y: 1 },  // 矿洞入口（东北）
    ]
    for (const d of doors) {
      this.walkableGrid[d.y][d.x] = true
    }

    // === 广场装饰（不可通行）===
    // 喷泉（map[10][14..15], map[11][14..15]）
    for (let dy = 10; dy <= 11; dy++) {
      for (let dx = 14; dx <= 15; dx++) {
        this.walkableGrid[dy][dx] = false
      }
    }
    // 长椅（map[9][12], map[9][17]）
    this.walkableGrid[9][12] = false
    this.walkableGrid[9][17] = false
    // 灯柱（map[8][11], map[8][18], map[13][11], map[13][18]）
    this.walkableGrid[8][11] = false
    this.walkableGrid[8][18] = false
    this.walkableGrid[13][11] = false
    this.walkableGrid[13][18] = false
    // 水井（map[12][9]）
    this.walkableGrid[12][9] = false
    // 散树（map[5][9], map[15][8]）
    this.walkableGrid[5][9] = false
    this.walkableGrid[15][8] = false
    // 镇门口木栅栏（y=25, x<13 或 x>16）
    for (let x = 0; x < 13; x++) this.walkableGrid[25][x] = false
    for (let x = 17; x < 30; x++) this.walkableGrid[25][x] = false

    // === 弯弯曲曲的河（中南部横穿小镇；桥可通行，河水不可通行）===
    // 与前端 TilesetManager.drawRiver 的河道逐格对齐：
    //   西段 x=0..7 y=13..14 → 桥1(x=8..9) → 南弯(最深y=16) → 回北 y=13..14
    //   → 桥2(x=20..21) → 小北弯(x=22..23 y=12..13) → 东段 x=24..29 y=13..14
    // 西段
    for (let x = 0; x <= 7; x++) {
      this.walkableGrid[13][x] = false
      this.walkableGrid[14][x] = false
    }
    // 南弯段（x=10..13）
    this.walkableGrid[14][10] = false
    this.walkableGrid[15][10] = false
    for (let x = 11; x <= 12; x++) {
      this.walkableGrid[15][x] = false
      this.walkableGrid[16][x] = false
    }
    this.walkableGrid[14][13] = false
    this.walkableGrid[15][13] = false
    // 回北段（x=14..19）
    for (let x = 14; x <= 19; x++) {
      this.walkableGrid[13][x] = false
      this.walkableGrid[14][x] = false
    }
    // 小北弯（x=22..23）
    this.walkableGrid[12][22] = false
    this.walkableGrid[13][22] = false
    this.walkableGrid[12][23] = false
    this.walkableGrid[13][23] = false
    // 东段（x=24..29）
    for (let x = 24; x <= 29; x++) {
      this.walkableGrid[13][x] = false
      this.walkableGrid[14][x] = false
    }
    // 桥1（x=8..9 y=13..14）与桥2（x=20..21 y=13..14）默认可通行，无需标记
  }

  /**
   * 设置网格可通行性
   */
  setWalkable(gridX: number, gridY: number, walkable: boolean): void {
    if (this.isValidCell(gridX, gridY)) {
      this.walkableGrid[gridY][gridX] = walkable
    }
  }

  /**
   * 批量设置可通行区域
   */
  setWalkableArea(gridX: number, gridY: number, width: number, height: number, walkable: boolean): void {
    for (let y = gridY; y < gridY + height; y++) {
      for (let x = gridX; x < gridX + width; x++) {
        this.setWalkable(x, y, walkable)
      }
    }
  }

  /**
   * 检查网格是否有效
   */
  private isValidCell(x: number, y: number): boolean {
    return x >= 0 && x < this.GRID_WIDTH && y >= 0 && y < this.GRID_HEIGHT
  }

  /**
   * 检查网格是否可通行
   */
  private isWalkable(x: number, y: number, excludeNpcId?: string): boolean {
    if (!this.isValidCell(x, y)) return false
    if (!this.walkableGrid[y][x]) return false

    // 检查是否被其他NPC占用
    const key = `${x},${y}`
    const occupant = this.occupiedCells.get(key)
    if (occupant && occupant !== excludeNpcId) return false

    return true
  }

  // =============================================
  // A*寻路算法
  // =============================================

  /**
   * A*寻路 — 在网格上寻找最优路径
   * @param startWorld - 起点世界坐标
   * @param targetWorld - 终点世界坐标
   * @param npcId - NPC ID（用于排除自身占用的格子）
   */
  findPath(
    startWorld: { x: number; y: number },
    targetWorld: { x: number; y: number },
    npcId?: string,
  ): PathfindResult {
    const searchStart = Date.now()

    // 世界坐标 → 网格坐标
    const startGrid = this.worldToGrid(startWorld.x, startWorld.y)
    const targetGrid = this.worldToGrid(targetWorld.x, targetWorld.y)

    // 检查边界
    if (!this.isValidCell(startGrid.x, startGrid.y) || !this.isValidCell(targetGrid.x, targetGrid.y)) {
      return { found: false, path: [], totalDistance: 0, estimatedDuration: 0, searchDuration: 0 }
    }

    // A*算法
    const openSet: AStarNode[] = []
    const closedSet: Set<string> = new Set()

    const startNode: AStarNode = {
      x: startGrid.x,
      y: startGrid.y,
      g: 0,
      h: this.heuristic(startGrid.x, startGrid.y, targetGrid.x, targetGrid.y),
      f: 0,
      parent: null,
    }
    startNode.f = startNode.g + startNode.h

    openSet.push(startNode)

    let goalNode: AStarNode | null = null

    while (openSet.length > 0) {
      // 取出f值最小的节点
      openSet.sort((a, b) => a.f - b.f)
      const current = openSet.shift()!

      // 到达终点
      if (current.x === targetGrid.x && current.y === targetGrid.y) {
        goalNode = current
        break
      }

      closedSet.add(`${current.x},${current.y}`)

      // 检查4方向邻居
      const neighbors = [
        { x: current.x, y: current.y - 1 }, // 上
        { x: current.x, y: current.y + 1 }, // 下
        { x: current.x - 1, y: current.y }, // 左
        { x: current.x + 1, y: current.y }, // 右
        // 对角线移动（可选）
        { x: current.x - 1, y: current.y - 1 },
        { x: current.x + 1, y: current.y - 1 },
        { x: current.x - 1, y: current.y + 1 },
        { x: current.x + 1, y: current.y + 1 },
      ]

      for (const neighbor of neighbors) {
        if (!this.isValidCell(neighbor.x, neighbor.y)) continue
        if (closedSet.has(`${neighbor.x},${neighbor.y}`)) continue

        // 检查可通行性（终点格子始终可达）
        const isTarget = neighbor.x === targetGrid.x && neighbor.y === targetGrid.y
        if (!isTarget && !this.isWalkable(neighbor.x, neighbor.y, npcId)) continue

        const isDiagonal = neighbor.x !== current.x && neighbor.y !== current.y
        const moveCost = isDiagonal ? 1.414 : 1 // 对角线代价更大

        const g = current.g + moveCost

        // 查找是否已在openSet中
        const existing = openSet.find((n) => n.x === neighbor.x && n.y === neighbor.y)
        if (existing && g >= existing.g) continue

        const h = this.heuristic(neighbor.x, neighbor.y, targetGrid.x, targetGrid.y)

        const newNode: AStarNode = {
          x: neighbor.x,
          y: neighbor.y,
          g,
          h,
          f: g + h,
          parent: current,
        }

        if (existing) {
          Object.assign(existing, newNode)
        } else {
          openSet.push(newNode)
        }
      }
    }

    if (!goalNode) {
      // 未找到路径 → 降级为直线移动
      logger.debug(`No path found, falling back to direct route`)
      return {
        found: false,
        path: [
          { x: startWorld.x, y: startWorld.y },
          { x: targetWorld.x, y: targetWorld.y },
        ],
        totalDistance: this.distance(startWorld, targetWorld),
        estimatedDuration: this.distance(startWorld, targetWorld) / this.defaultSpeed * 1000,
        searchDuration: Date.now() - searchStart,
      }
    }

    // 回溯路径
    const gridPath: { x: number; y: number }[] = []
    let node: AStarNode | null = goalNode
    while (node) {
      gridPath.unshift({ x: node.x, y: node.y })
      node = node.parent
    }

    // 网格坐标 → 世界坐标路径点
    const path: PathWaypoint[] = gridPath.map((g, i) => {
      const world = this.gridToWorld(g.x, g.y)
      const prev = i > 0 ? gridPath[i - 1] : null
      const direction = prev ? this.calculateDirection(prev.x, prev.y, g.x, g.y) : 'down'

      return {
        x: world.x,
        y: world.y,
        direction,
        speed: this.defaultSpeed,
      }
    })

    // 计算总距离
    let totalDistance = 0
    for (let i = 1; i < path.length; i++) {
      totalDistance += this.distance(path[i - 1], path[i])
    }

    const speed = npcId ? (this.speedModifiers[npcId] ?? this.defaultSpeed) : this.defaultSpeed

    return {
      found: true,
      path,
      totalDistance,
      estimatedDuration: (totalDistance / speed) * 1000,
      searchDuration: Date.now() - searchStart,
    }
  }

  /**
   * 启发式函数（曼哈顿距离 + 对角线修正）
   */
  private heuristic(x1: number, y1: number, x2: number, y2: number): number {
    const dx = Math.abs(x1 - x2)
    const dy = Math.abs(y1 - y2)
    // 切比雪夫距离（支持对角线移动）
    return Math.max(dx, dy) + (Math.sqrt(2) - 1) * Math.min(dx, dy)
  }

  // =============================================
  // 移动任务管理
  // =============================================

  /**
   * 创建移动任务 — 让NPC移动到目标位置
   */
  createMoveTask(
    npcId: string,
    targetWorld: { x: number; y: number },
    speed?: number,
    onComplete?: () => void,
  ): MoveTask | null {
    const profile = profileLoader.getProfile(npcId)
    if (!profile) return null

    const start = { x: profile.x, y: profile.y }

    // 寻路
    const pathfindResult = this.findPath(start, targetWorld, npcId)

    if (!pathfindResult.found && pathfindResult.path.length === 0) {
      logger.warn(`[${npcId}] Pathfinding failed and no fallback`)
      return null
    }

    const npcSpeed = speed ?? this.speedModifiers[npcId] ?? this.defaultSpeed

    const task: MoveTask = {
      npcId,
      start,
      target: targetWorld,
      path: pathfindResult.path,
      currentWaypointIndex: 0,
      speed: npcSpeed,
      state: 'moving',
      createdAt: Date.now(),
      startedAt: Date.now(),
      onComplete,
    }

    this.moveTasks.set(npcId, task)

    // 释放起点格子占用
    const startGrid = this.worldToGrid(start.x, start.y)
    this.occupiedCells.delete(`${startGrid.x},${startGrid.y}`)

    logger.info(
      `[${npcId}] Move task created: (${start.x},${start.y}) → (${targetWorld.x},${targetWorld.y}) ` +
      `${pathfindResult.path.length} waypoints, ${pathfindResult.totalDistance}px`,
    )

    return task
  }

  /**
   * 更新所有移动任务 — 每帧调用
   * @param deltaTime - 帧间隔（毫秒）
   */
  updateMoves(deltaTime: number): void {
    for (const [npcId, task] of this.moveTasks) {
      if (task.state !== 'moving') continue

      const profile = profileLoader.getProfile(npcId)
      if (!profile) {
        this.moveTasks.delete(npcId)
        continue
      }

      // 如果NPC正在对话，暂停移动
      const runtime = profileLoader.getRuntimeState(npcId)
      if (runtime?.talkingTo) {
        task.state = 'blocked'
        continue
      }

      // 当前目标路径点
      const waypoint = task.path[task.currentWaypointIndex]
      if (!waypoint) {
        // 路径完成
        task.state = 'arrived'
        this.onMoveComplete(task, true)
        this.moveTasks.delete(npcId)
        continue
      }

      // 计算移动
      const dx = waypoint.x - profile.x
      const dy = waypoint.y - profile.y
      const dist = Math.sqrt(dx * dx + dy * dy)

      const moveDistance = (task.speed * deltaTime) / 1000

      if (dist <= moveDistance) {
        // 到达当前路径点
        profile.x = waypoint.x
        profile.y = waypoint.y

        // 占用新格子
        const grid = this.worldToGrid(waypoint.x, waypoint.y)
        this.occupiedCells.set(`${grid.x},${grid.y}`, npcId)

        task.currentWaypointIndex++

        // 检查是否到达终点
        if (task.currentWaypointIndex >= task.path.length) {
          task.state = 'arrived'
          this.onMoveComplete(task, true)
          this.moveTasks.delete(npcId)
        }
      } else {
        // 朝路径点移动
        const ratio = moveDistance / dist
        profile.x += dx * ratio
        profile.y += dy * ratio

        // 更新朝向
        if (waypoint.direction) {
          profile.direction = waypoint.direction as any
        }
      }
    }
  }

  /**
   * 移动完成处理
   */
  private onMoveComplete(task: MoveTask, success: boolean): void {
    logger.info(`[${task.npcId}] Move ${success ? 'completed' : 'failed'}`)

    // 更新运行时状态
    profileLoader.updateRuntimeState(task.npcId, {
      currentAction: 'idle',
      lastUpdate: Date.now(),
    })

    // 调用完成回调
    if (task.onComplete) {
      task.onComplete()
    }
  }

  /**
   * 取消NPC移动
   */
  cancelMove(npcId: string): void {
    const task = this.moveTasks.get(npcId)
    if (task) {
      task.state = 'idle'
      this.onMoveComplete(task, false)
      this.moveTasks.delete(npcId)
    }
  }

  // =============================================
  // 坐标转换
  // =============================================

  /**
   * 世界坐标 → 网格坐标
   */
  worldToGrid(worldX: number, worldY: number): { x: number; y: number } {
    return {
      x: Math.floor(worldX / this.TILE_SIZE),
      y: Math.floor(worldY / this.TILE_SIZE),
    }
  }

  /**
   * 网格坐标 → 世界坐标（格子中心）
   */
  gridToWorld(gridX: number, gridY: number): { x: number; y: number } {
    return {
      x: gridX * this.TILE_SIZE + this.TILE_SIZE / 2,
      y: gridY * this.TILE_SIZE + this.TILE_SIZE / 2,
    }
  }

  // =============================================
  // 工具方法
  // =============================================

  /**
   * 计算两点距离
   */
  private distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
    const dx = b.x - a.x
    const dy = b.y - a.y
    return Math.sqrt(dx * dx + dy * dy)
  }

  /**
   * 计算移动方向
   */
  private calculateDirection(fromX: number, fromY: number, toX: number, toY: number): string {
    const dx = toX - fromX
    const dy = toY - fromY
    if (Math.abs(dx) > Math.abs(dy)) {
      return dx > 0 ? 'right' : 'left'
    }
    return dy > 0 ? 'down' : 'up'
  }

  // =============================================
  // 查询与管理
  // =============================================

  /** 获取NPC移动状态 */
  getMoveState(npcId: string): MoveState {
    return this.moveTasks.get(npcId)?.state ?? 'idle'
  }

  /** 检查NPC是否正在移动 */
  isMoving(npcId: string): boolean {
    return this.moveTasks.has(npcId) && this.moveTasks.get(npcId)!.state === 'moving'
  }

  /** 获取活跃移动任务数 */
  getActiveMoveCount(): number {
    let count = 0
    for (const task of this.moveTasks.values()) {
      if (task.state === 'moving') count++
    }
    return count
  }

  /** 设置NPC移动速度修正 */
  setSpeedModifier(npcId: string, multiplier: number): void {
    this.speedModifiers[npcId] = this.defaultSpeed * multiplier
  }

  /** 获取网格大小 */
  getGridSize(): { width: number; height: number } {
    return { width: this.GRID_WIDTH, height: this.GRID_HEIGHT }
  }

  /** 获取可通行网格快照 */
  getWalkableGrid(): boolean[][] {
    return this.walkableGrid.map((row) => [...row])
  }
}

/** 全局NPC移动与寻路系统实例 */
export const npcMovementSystem = new NpcMovementSystem()
