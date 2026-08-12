import Phaser from 'phaser'
import { Direction } from '../entities/SpriteGenerator'
import { TILE_SIZE } from '../config'
import { CollisionSystem } from './CollisionSystem'



/**
 * MovementSystem — 角色移动系统
 *
 * 职责：
 * - 处理键盘输入（WASD / 方向键）
 * - 8方向移动（含归一化斜向速度）
 * - 碰撞检测（与地图碰撞体交互）
 * - 行走动画切换（4方向 + 行走/待机）
 * - 玩家跟随相机
 *
 * 设计要点：
 * - 移动速度：250像素/秒（1920×1080 原生分辨率下，约每秒 3.9 tiles，悠闲冒险步伐）
 * - 斜向移动归一化：避免斜向速度为√2倍
 * - 停止时自动切换到待机动画
 * - 精灵碰撞体居中偏下，更真实
 */
export class MovementSystem {
  private scene: Phaser.Scene
  private player: Phaser.GameObjects.Sprite | null = null
  private body: Phaser.Physics.Arcade.Body | null = null
  private collisionSys: CollisionSystem | null = null

  /** 输入键 */
  private cursors: Phaser.Types.Input.Keyboard.CursorKeys | null = null
  private wasd: Record<string, Phaser.Input.Keyboard.Key> | null = null

  /** 移动参数 — 1920×1080 原生分辨率下 250px/s（约每秒 3.9 tiles）
   *  T6.14.1: 原 340px/s 过快，调慢营造悠闲的冒险步伐 */
  private speed = 250
  private currentDirection: Direction = Direction.Down
  private isMoving = false
  private spriteKey = 'player'

  /** 相机偏移 */
  private cameraLerp = 0.1

  /** T6.3.2: 过渡期间锁定玩家输入 */
  private inputLocked = false

  // --- T6.11.2: 待机动作（主角不动时的小动作，营造生动感） ---
  /** 精灵基础缩放（待机动作恢复用） */
  private baseScale = 1
  /** 下次可触发待机动作的时间戳 */
  private nextIdleActionAt = 0
  /** 是否正在播放待机动作 */
  private idleActionPlaying = false
  /** 进行中的待机动作 tween */
  private idleActionTweens: Phaser.Tweens.Tween[] = []
  /** 进行中的待机动作定时器（张望恢复等） */
  private idleActionTimers: Phaser.Time.TimerEvent[] = []

  constructor(scene: Phaser.Scene) {
    this.scene = scene
  }

  /**
   * T6.3.2: 锁定/解锁玩家移动输入（场景过渡期间调用）
   */
  setInputLocked(locked: boolean): void {
    this.inputLocked = locked
    if (locked) {
      // 停止当前移动
      this.body?.setVelocity(0, 0)
      // 取消进行中的待机动作（场景过渡/战斗期间）
      this.cancelIdleAction()
    }
  }

  /**
   * 是否处于输入锁定状态
   */
  isInputLocked(): boolean {
    return this.inputLocked
  }

  /**
   * 初始化玩家和输入
   */
  init(player: Phaser.GameObjects.Sprite, spriteKey: string, collisionSys?: CollisionSystem): void {
    this.player = player
    this.spriteKey = spriteKey
    this.collisionSys = collisionSys ?? null

    // 启用物理
    this.scene.physics.add.existing(player)
    this.body = player.body as Phaser.Physics.Arcade.Body

    // 设置碰撞体（64px精灵：身体 40×24，居中偏下，更真实）
    this.body.setSize(40, 24)
    this.body.setOffset(12, 40)
    this.body.setCollideWorldBounds(true)

    // 碰撞检测
    if (this.collisionSys) {
      this.collisionSys.setupPlayerColliders(player)
    }

    // 键盘输入
    this.cursors = this.scene.input.keyboard!.createCursorKeys()
    this.wasd = this.scene.input.keyboard!.addKeys({
      W: Phaser.Input.Keyboard.KeyCodes.W,
      A: Phaser.Input.Keyboard.KeyCodes.A,
      S: Phaser.Input.Keyboard.KeyCodes.S,
      D: Phaser.Input.Keyboard.KeyCodes.D,
    }) as Record<string, Phaser.Input.Keyboard.Key>

    // 设置初始动画
    player.play(`${spriteKey}_idle_${Direction.Down}`)

    // 记录基础缩放（待机动作缩放恢复用）
    this.baseScale = player.scaleX || 1

    // 相机跟随
    this.scene.cameras.main.startFollow(player, true, this.cameraLerp, this.cameraLerp)
    this.scene.cameras.main.setRoundPixels(true)

    console.log('[MovementSystem] Initialized')
  }

  /**
   * 每帧更新
   */
  update(): void {
    if (!this.body || !this.cursors || !this.wasd) return

    let vx = 0
    let vy = 0

    // T6.3.2: 过渡期间忽略输入
    if (!this.inputLocked) {
      // 读取输入
      const left = this.cursors.left.isDown || this.wasd.A.isDown
      const right = this.cursors.right.isDown || this.wasd.D.isDown
      const up = this.cursors.up.isDown || this.wasd.W.isDown
      const down = this.cursors.down.isDown || this.wasd.S.isDown

      if (left) vx -= 1
      if (right) vx += 1
      if (up) vy -= 1
      if (down) vy += 1
    }

    // 归一化斜向速度
    if (vx !== 0 && vy !== 0) {
      const factor = 1 / Math.SQRT2
      vx *= factor
      vy *= factor
    }

    // 应用速度
    this.body.setVelocity(vx * this.speed, vy * this.speed)

    // 更新方向和动画
    const moving = vx !== 0 || vy !== 0
    if (moving) {
      this.isMoving = true
      // 移动：重置待机计时并取消进行中的待机动作
      this.nextIdleActionAt = this.scene.time.now + Phaser.Math.Between(6000, 10000)
      this.cancelIdleAction()
      // 确定主方向
      if (Math.abs(vx) > Math.abs(vy)) {
        this.currentDirection = vx > 0 ? Direction.Right : Direction.Left
      } else {
        this.currentDirection = vy > 0 ? Direction.Down : Direction.Up
      }
      this.playWalkAnimation()
    } else {
      if (this.isMoving) {
        // 刚停下：开始待机计时
        this.isMoving = false
        this.nextIdleActionAt = this.scene.time.now + Phaser.Math.Between(6000, 10000)
        this.playIdleAnimation()
      }
      // 待机状态：检测并播放待机小动作
      this.updateIdleAction()
    }

    // 深度排序：按Y坐标排序实现遮挡效果
    if (this.player) {
      this.player.setDepth(this.player.y + 100)
    }
  }

  // ============================================
  // T6.11.2 待机动作（主角不动一段时间后做小动作）
  // ============================================

  /**
   * 待机动作调度：玩家停下 6-10 秒后随机触发一个小动作（伸懒腰/张望/打哈欠）
   */
  private updateIdleAction(): void {
    // 动作播放中：由 tween/定时器 onComplete 负责结束，无需调度
    if (this.idleActionPlaying) return
    // 未到触发时间
    if (this.scene.time.now < this.nextIdleActionAt) return
    if (!this.player) return

    this.idleActionPlaying = true
    const actions: Array<() => void> = [
      () => this.playStretchAction(),
      () => this.playLookAroundAction(),
      () => this.playYawnAction(),
    ]
    actions[Phaser.Math.Between(0, actions.length - 1)]()
  }

  /** 待机动作：伸懒腰（身体上浮 + 微微放大 + 舒展） */
  private playStretchAction(): void {
    const sprite = this.player
    if (!sprite) return this.finishIdleAction()
    const baseY = sprite.y

    const tween = this.scene.tweens.add({
      targets: sprite,
      y: baseY - 10,
      scale: this.baseScale * 1.08,
      duration: 450,
      ease: 'Sine.easeOut',
      yoyo: true,
      repeat: 1,
      onUpdate: () => {
        // 同步物理体位置，防止 Arcade 每帧把精灵拉回原位
        this.body?.reset(sprite.x, sprite.y)
      },
      onComplete: () => {
        sprite.setScale(this.baseScale)
        sprite.setY(baseY)
        this.body?.reset(sprite.x, sprite.y)
        this.finishIdleAction()
      },
    })
    this.idleActionTweens.push(tween)
  }

  /** 待机动作：转头张望（临时转向侧面，再回到当前方向） */
  private playLookAroundAction(): void {
    const sprite = this.player
    if (!sprite) return this.finishIdleAction()

    const sideDir = Phaser.Math.RND.pick([Direction.Left, Direction.Right])
    sprite.play(`${this.spriteKey}_idle_${sideDir}`)

    const timer = this.scene.time.delayedCall(950, () => {
      sprite.play(`${this.spriteKey}_idle_${this.currentDirection}`)
      this.finishIdleAction()
    })
    this.idleActionTimers.push(timer)
  }

  /** 待机动作：打哈欠（低头下压 + 轻微晃动） */
  private playYawnAction(): void {
    const sprite = this.player
    if (!sprite) return this.finishIdleAction()
    const baseY = sprite.y

    const tween = this.scene.tweens.add({
      targets: sprite,
      y: baseY + 4,
      angle: 3,
      duration: 380,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: 2,
      onUpdate: () => {
        this.body?.reset(sprite.x, sprite.y)
      },
      onComplete: () => {
        sprite.setY(baseY)
        sprite.setAngle(0)
        this.body?.reset(sprite.x, sprite.y)
        this.finishIdleAction()
      },
    })
    this.idleActionTweens.push(tween)
  }

  /**
   * 取消待机动作（玩家开始移动/场景切换时）
   * 停止所有 tween/定时器并恢复精灵显示状态
   */
  private cancelIdleAction(): void {
    if (!this.idleActionPlaying && this.idleActionTweens.length === 0 && this.idleActionTimers.length === 0) return
    for (const tween of this.idleActionTweens) tween.stop()
    for (const timer of this.idleActionTimers) timer.remove()
    this.idleActionTweens = []
    this.idleActionTimers = []
    if (this.player) {
      this.player.setScale(this.baseScale)
      this.player.setAngle(0)
    }
    this.idleActionPlaying = false
  }

  /**
   * 结束一次待机动作：复位状态并安排下一次动作时间
   */
  private finishIdleAction(): void {
    this.idleActionPlaying = false
    this.idleActionTweens = []
    this.idleActionTimers = []
    this.nextIdleActionAt = this.scene.time.now + Phaser.Math.Between(8000, 14000)
  }

  /**
   * 播放行走动画
   */
  private playWalkAnimation(): void {
    const animKey = `${this.spriteKey}_walk_${this.currentDirection}`
    if (this.player?.anims.currentAnim?.key !== animKey) {
      this.player?.play(animKey)
    }
  }

  /**
   * 播放待机动画
   */
  private playIdleAnimation(): void {
    const animKey = `${this.spriteKey}_idle_${this.currentDirection}`
    if (this.player?.anims.currentAnim?.key !== animKey) {
      this.player?.play(animKey)
    }
  }

  /**
   * 获取当前方向
   */
  getDirection(): Direction {
    return this.currentDirection
  }

  /**
   * 获取是否正在移动
   */
  getIsMoving(): boolean {
    return this.isMoving
  }

  /**
   * 设置速度
   */
  setSpeed(speed: number): void {
    this.speed = speed
  }

  /**
   * 重新绑定碰撞系统（场景切换后调用）
   * 场景地图重建后，旧碰撞组已销毁，需要重新注册玩家碰撞
   */
  setCollisionSystem(collisionSys: CollisionSystem): void {
    this.collisionSys = collisionSys
    if (this.player && this.body) {
      this.collisionSys.setupPlayerColliders(this.player)
    }
  }

  /**
   * 传送玩家到指定位置
   */
  teleportTo(worldX: number, worldY: number): void {
    if (this.player) {
      this.player.setPosition(worldX, worldY)
    }
  }

  /**
   * 传送玩家到指定 Tile 坐标
   */
  teleportToTile(tileX: number, tileY: number): void {
    this.teleportTo(
      tileX * TILE_SIZE + TILE_SIZE / 2,
      tileY * TILE_SIZE + TILE_SIZE / 2,
    )
  }

  /**
   * 获取玩家像素坐标
   */
  getPlayerPosition(): { x: number; y: number } {
    return this.player ? { x: this.player.x, y: this.player.y } : { x: 0, y: 0 }
  }

  /**
   * 获取玩家 Tile 坐标
   */
  getPlayerTile(): { tx: number; ty: number } {
    if (!this.player) return { tx: 0, ty: 0 }
    return {
      tx: Math.floor(this.player.x / TILE_SIZE),
      ty: Math.floor(this.player.y / TILE_SIZE),
    }
  }

  /**
   * 获取玩家精灵引用
   */
  getPlayer(): Phaser.GameObjects.Sprite | null {
    return this.player
  }
}
