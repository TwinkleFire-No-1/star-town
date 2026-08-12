import Phaser from 'phaser'
import { TILE_SIZE } from '../config'
import { MapRenderer } from '../map/MapRenderer'

/**
 * CollisionSystem — 碰撞系统
 *
 * 职责：
 * - 管理玩家/角色与地图碰撞体的交互
 * - 处理门口触发区域
 * - 提供碰撞检测回调
 * - 支持动态添加/移除碰撞体
 *
 * 设计：
 * - 使用 Arcade Physics 静态组实现碰撞
 * - 门口用 overlap 检测（可穿过但有触发事件）
 * - 障碍物用 collide 检测（不可穿过）
 */
export class CollisionSystem {
  private scene: Phaser.Scene
  private mapRenderer: MapRenderer

  /** 门口触发回调列表 */
  private doorCallbacks: Array<(doorX: number, doorY: number) => void> = []

  /** 碰撞组引用 */
  private collisionGroup!: Phaser.Physics.Arcade.StaticGroup
  private doorGroup!: Phaser.Physics.Arcade.StaticGroup

  /** 角色碰撞组（NPC/猫/在线玩家等动态角色）：玩家不可穿过角色，角色之间互相碰撞 */
  private npcGroup!: Phaser.Physics.Arcade.Group

  // --- T6.11.3: 建筑按 F 进入（门口近邻检测，代替踩门自动进入） ---
  /** 最近门口（玩家靠近时记录，F 键触发进入） */
  private nearestDoor: { tileX: number; tileY: number } | null = null
  /** 门口进入距离（像素，约 1.7 tile） */
  private static readonly DOOR_ENTER_DISTANCE = 110

  constructor(scene: Phaser.Scene, mapRenderer: MapRenderer) {
    this.scene = scene
    this.mapRenderer = mapRenderer
  }

  /**
   * 初始化碰撞系统
   * 在地图渲染完成后调用
   */
  init(): void {
    this.collisionGroup = this.mapRenderer.getCollisionGroup()
    this.doorGroup = this.mapRenderer.getDoorGroup()
    this.nearestDoor = null

    // 角色碰撞组（动态）：所有NPC/角色精灵注册进来，实现玩家-NPC、NPC-NPC 互相碰撞
    this.npcGroup = this.scene.physics.add.group()
    this.scene.physics.add.collider(this.npcGroup, this.npcGroup)
  }

  /**
   * 为玩家设置碰撞检测
   * @param player 玩家精灵
   */
  setupPlayerColliders(player: Phaser.GameObjects.Sprite): void {
    // 障碍物碰撞（不可穿过）
    this.scene.physics.add.collider(player, this.collisionGroup)

    // 角色碰撞：玩家与NPC/其他角色不可穿过（NPC 为活动障碍）
    this.scene.physics.add.collider(player, this.npcGroup)

    // 门口不再踩上自动进入：改为 updateDoorProximity 检测 + F 键 tryEnterDoor 触发
  }

  // ============================================
  // T6.11.3 门口近邻检测（按 F 进入）
  // ============================================

  /**
   * 每帧检测玩家附近的门口（记录最近门口供 F 键触发与提示 UI 使用）
   */
  updateDoorProximity(playerX: number, playerY: number): void {
    // 防御：场景切换竞态时 doorGroup 尚未初始化或被 clear 破坏
    if (!this.doorGroup) {
      this.nearestDoor = null
      return
    }
    let nearest: { tileX: number; tileY: number } | null = null
    let nearestDist = Infinity

    try {
      for (const doorObj of this.doorGroup.getChildren()) {
        const door = doorObj as Phaser.GameObjects.Rectangle
        const dx = playerX - door.x
        const dy = playerY - door.y
        const dist = Math.hypot(dx, dy)
        if (dist < CollisionSystem.DOOR_ENTER_DISTANCE && dist < nearestDist) {
          nearestDist = dist
          nearest = {
            tileX: Math.floor(door.x / TILE_SIZE),
            tileY: Math.floor(door.y / TILE_SIZE),
          }
        }
      }
    } catch {
      // 场景切换中：门组不可用，忽略本帧
      this.nearestDoor = null
      return
    }
    this.nearestDoor = nearest
  }

  /**
   * F 键按下时尝试进入附近门口；有可进入的门口则触发回调并返回 true
   */
  tryEnterDoor(): boolean {
    if (!this.nearestDoor) return false
    this.onDoorTrigger(this.nearestDoor.tileX, this.nearestDoor.tileY)
    return true
  }

  /**
   * 获取最近门口 tile 坐标（用于提示 UI；无则 null）
   */
  getNearestDoorTile(): { tileX: number; tileY: number } | null {
    return this.nearestDoor
  }

  /**
   * 注册门口触发回调
   */
  onDoorEnter(callback: (doorX: number, doorY: number) => void): void {
    this.doorCallbacks.push(callback)
  }

  /**
   * 门口触发处理
   */
  private onDoorTrigger(tileX: number, tileY: number): void {
    this.doorCallbacks.forEach((cb) => cb(tileX, tileY))
  }

  /**
   * 检查指定世界坐标是否可通行
   */
  isWalkableAt(worldX: number, worldY: number): boolean {
    const tileX = Math.floor(worldX / TILE_SIZE)
    const tileY = Math.floor(worldY / TILE_SIZE)
    return this.mapRenderer.isWalkable(tileX, tileY)
  }

  /**
   * 获取碰撞组
   */
  getCollisionGroup(): Phaser.Physics.Arcade.StaticGroup {
    return this.collisionGroup
  }

  // ============================================
  // 角色碰撞组（NPC/猫/在线玩家共用）
  // ============================================

  /**
   * 为角色精灵启用物理碰撞体并注册进角色碰撞组
   * @param sprite 角色精灵（创建后调用）
   * @param opts 碰撞体尺寸/偏移（默认 40×24，居中偏下，与玩家一致）
   * @remarks body 设为不可移动（immovable）：
   * 玩家撞到 NPC 时被阻挡、无法推动 NPC（原为动态体，静止 NPC 会被玩家顶走）；
   * NPC 走位由精灵直接控制 + syncNpcBody 粘合，物理体不再受碰撞反推影响。
   */
  addNpcCollider(
    sprite: Phaser.GameObjects.Sprite,
    opts?: { sizeX?: number; sizeY?: number; offsetX?: number; offsetY?: number },
  ): Phaser.Physics.Arcade.Body {
    this.scene.physics.add.existing(sprite)
    const body = sprite.body as Phaser.Physics.Arcade.Body
    body.setSize(opts?.sizeX ?? 40, opts?.sizeY ?? 24)
    body.setOffset(opts?.offsetX ?? 12, opts?.offsetY ?? 40)
    // 不可移动：阻挡玩家但不会被玩家推动（碰撞分离只作用于玩家/对方，本角色不动）
    body.immovable = true
    this.npcGroup.add(sprite)
    return body
  }

  /**
   * 同步角色物理体到精灵当前位置（直接设置精灵位置移动后调用，防止被物理体拉回）
   */
  syncNpcBody(sprite: Phaser.GameObjects.Sprite): void {
    const body = sprite.body as Phaser.Physics.Arcade.Body
    if (body) body.reset(sprite.x, sprite.y)
  }

  /**
   * 禁用角色物理体（如跳河沉入水中时，避免形成隐形墙）
   * 注：Body 类型未声明 disableBody 方法（运行时存在），此处直接设置 enable 属性
   */
  disableNpcBody(sprite: Phaser.GameObjects.Sprite): void {
    const body = sprite.body as Phaser.Physics.Arcade.Body
    if (body) body.enable = false
  }

  /**
   * 重新启用角色物理体
   */
  enableNpcBody(sprite: Phaser.GameObjects.Sprite): void {
    const body = sprite.body as Phaser.Physics.Arcade.Body
    if (body) body.enable = true
  }

  /**
   * 从角色碰撞组移除（销毁精灵时调用；精灵 destroy 也会自动移除，此方法为兜底）
   * 修复：场景切换瞬间 Physics world 已被清理时，body.world 可能为 undefined，
   * npcGroup.remove 内部会崩溃 —— 加防护 + try-catch 兜底
   */
  unregisterNpc(sprite: Phaser.GameObjects.Sprite): void {
    if (!this.npcGroup) return
    try {
      const body = sprite.body as Phaser.Physics.Arcade.Body | undefined
      if (!sprite.active || !body || !body.world) return
      this.npcGroup.remove(sprite)
    } catch {
      // 场景切换/销毁竞态：忽略
    }
  }

  /**
   * 获取门口组
   */
  getDoorGroup(): Phaser.Physics.Arcade.StaticGroup {
    return this.doorGroup
  }
}
