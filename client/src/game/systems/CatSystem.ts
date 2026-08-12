// 星火小镇 — 猫咪系统
// 需求：小镇两只随机出现的猫咪（小橘/小狸花），不参与主线剧情，不加模型。
//       李鹭随机喂猫（猫咪走向李鹭 → 李鹭投喂 → 猫咪低头吃 → 爱心 → 离开）。
// 设计：
// - 从后端 /api/npcs/cats 拉取猫咪定义（随机出生点 + 漫游半径）
// - 使用模型生成的美术精灵表（cat-{assetId}.png，256×64 = 4帧行走，朝右）
// - 朝左移动时 flipX 翻转；随机漫游避水避墙（isWalkableAt）
// - "随机出现"：每隔一段时间随机瞬移到新的出生点（淡出→瞬移→淡入）
// - 喂食协调：随机间隔触发「猫走向李鹭 → 吃食 → 离开」，通过 hooks 驱动李鹭喂食动画
// - 仅在城镇场景渲染

import Phaser from 'phaser'
import { TILE_SIZE } from '../config'
import { FONT_NAMETAG, FONT_BODY, FONT_SIZE } from '../typography'
import type { CollisionSystem } from '../systems/CollisionSystem'

/** 名字标签相对精灵顶部的偏移 */
const NAMETAG_OFFSET = 50
/** 猫显示倍率（猫比人小，约 0.78） */
const CAT_SCALE = 0.78

/** 后端猫咪定义（tile坐标） */
export interface CatDef {
  id: string
  name: string
  title: string
  assetId: string
  spawnPoints: Array<{ x: number; y: number }>
  roamRadius: number
  speed: number
}

/** 运行中的猫咪实例 */
interface CatInstance {
  def: CatDef
  sprite: Phaser.GameObjects.Sprite
  nameTag: Phaser.GameObjects.Text
  shadow: Phaser.GameObjects.Ellipse
  /** 漫游状态 */
  state: 'idle' | 'roam' | 'coming' | 'eating' | 'leaving'
  homeX: number
  homeY: number
  targetX: number
  targetY: number
  idleUntil: number
  nextRoamAt: number
  /** 随机出现：下一次瞬移时间 */
  nextRespawnAt: number
  /** 移动速度（像素/秒） */
  moveSpeed: number
  /** 朝向（false=右，true=左） */
  facingLeft: boolean
}

/** 喂食协调 hooks（由 GameScene 注入，驱动李鹭喂食动画） */
export interface CatSystemHooks {
  /** 获取李鹭位置与空闲状态；无李鹭或忙则返回 null */
  getFeeder?: () => { x: number; y: number; canFeed: boolean } | null
  /** 让李鹭执行喂食动画（蹲下投喂），完成后回调 */
  playFeederFeed?: (onDone: () => void) => void
}

const API_BASE = '/api/npcs/cats'

export class CatSystem {
  private scene: Phaser.Scene
  private collisionSystem: CollisionSystem
  private cats: Map<string, CatInstance> = new Map()
  private hooks: CatSystemHooks = {}
  /** 下一次喂食触发时间 */
  private nextFeedAt = 0

  constructor(scene: Phaser.Scene, collisionSystem: CollisionSystem) {
    this.scene = scene
    this.collisionSystem = collisionSystem
  }

  setHooks(hooks: CatSystemHooks): void {
    this.hooks = hooks
  }

  /** 按场景重建猫咪（城镇渲染，其他场景清空） */
  async rebuildForScene(sceneId: string): Promise<void> {
    this.destroyAll()
    if (sceneId !== 'town') return
    try {
      const defs = await this.getDefs()
      if (!defs || defs.length === 0) return
      for (const def of defs) {
        this.spawnOne(def)
      }
      // 喂食计时随机起点
      this.nextFeedAt = this.scene.time.now + Phaser.Math.Between(12000, 20000)
      console.log(`[CatSystem] Spawned ${this.cats.size} cats in "${sceneId}"`)
    } catch (err) {
      console.warn('[CatSystem] Failed to rebuild:', err)
    }
  }

  private async getDefs(): Promise<CatDef[] | null> {
    try {
      const res = await fetch(API_BASE)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = (await res.json()) as { data?: CatDef[] }
      return json.data ?? []
    } catch (err) {
      console.warn('[CatSystem] Failed to load cats:', err)
      return null
    }
  }

  /** 创建单只猫咪：随机选出生点 + 创建精灵/名字/阴影 + 动画 */
  private spawnOne(def: CatDef): void {
    if (this.cats.has(def.id)) return
    const spawn = def.spawnPoints[Phaser.Math.Between(0, def.spawnPoints.length - 1)]
    const px = spawn.x * TILE_SIZE + TILE_SIZE / 2
    const py = spawn.y * TILE_SIZE + TILE_SIZE / 2

    // 注册动画（精灵表 4 帧行走；纹理 key 直接复用资源名）
    this.createAnim(def)
    const sprite = this.scene.add.sprite(px, py, def.assetId)
    sprite.setOrigin(0.5, 0.5)
    sprite.setScale(CAT_SCALE)
    sprite.setDepth(py + 100)
    sprite.play(`${def.id}_walk`, true)

    // 启用小尺寸物理碰撞体并注册进角色碰撞组（猫体型小，碰撞体也更小）
    this.collisionSystem.addNpcCollider(sprite, { sizeX: 28, sizeY: 16, offsetX: 18, offsetY: 32 })

    const shadow = this.scene.add.ellipse(px, py + 22, 40, 12, 0x000000, 0.28)
    shadow.setDepth(py + 50)

    const nameTag = this.scene.add.text(px, py - NAMETAG_OFFSET, def.name, {
      fontSize: FONT_SIZE.XS,
      color: '#ffffff',
      fontFamily: FONT_NAMETAG,
      backgroundColor: 'rgba(0,0,0,0.5)',
      padding: { x: 7, y: 3 },
    })
    nameTag.setOrigin(0.5, 1)
    nameTag.setDepth(py + 200)

    this.cats.set(def.id, {
      def,
      sprite,
      nameTag,
      shadow,
      state: 'idle',
      homeX: px,
      homeY: py,
      targetX: px,
      targetY: py,
      idleUntil: this.scene.time.now + Phaser.Math.Between(500, 1800),
      nextRoamAt: this.scene.time.now + Phaser.Math.Between(1500, 4000),
      nextRespawnAt: this.scene.time.now + Phaser.Math.Between(60000, 120000),
      moveSpeed: def.speed * TILE_SIZE,
      facingLeft: false,
    })
  }

  /** 创建猫行走动画（4帧循环；待机用首帧） */
  private createAnim(def: CatDef): void {
    const key = `${def.id}_walk`
    if (this.scene.anims.exists(key)) return
    this.scene.anims.create({
      key,
      frames: Array.from({ length: 4 }, (_, i) => ({ key: def.assetId, frame: i })),
      frameRate: 8,
      repeat: -1,
    })
  }

  destroyAll(): void {
    for (const inst of this.cats.values()) {
      this.collisionSystem.unregisterNpc(inst.sprite)
      inst.sprite.destroy()
      inst.nameTag.destroy()
      inst.shadow.destroy()
    }
    this.cats.clear()
  }

  /** 每帧更新：漫游 + 随机出现 + 喂食协调 */
  update(time: number): void {
    for (const inst of this.cats.values()) {
      if (!inst.sprite.active || !inst.sprite.scene) {
        this.destroyOne(inst.def.id)
        continue
      }
      if (inst.state === 'coming' || inst.state === 'eating' || inst.state === 'leaving') {
        // 喂食流程由 feed 逻辑控制
        continue
      }
      this.updateRoam(inst, time)
      this.updateRespawn(inst, time)
    }
    this.updateFeed(time)
  }

  private destroyOne(id: string): void {
    const inst = this.cats.get(id)
    if (!inst) return
    this.collisionSystem.unregisterNpc(inst.sprite)
    inst.sprite.destroy()
    inst.nameTag.destroy()
    inst.shadow.destroy()
    this.cats.delete(id)
  }

  /** 随机漫游：在家园附近随机走动（走走停停），避水避墙 */
  private updateRoam(inst: CatInstance, time: number): void {
    if (inst.state === 'idle') {
      if (time < inst.idleUntil) return
      const target = this.pickWalkableTarget(inst)
      if (target) {
        inst.state = 'roam'
        inst.targetX = target.x
        inst.targetY = target.y
        this.setFacing(inst, target.x >= inst.sprite.x)
        inst.sprite.play(`${inst.def.id}_walk`, true)
      } else {
        inst.idleUntil = time + Phaser.Math.Between(600, 1500)
      }
      return
    }

    // roam：向目标移动
    const dx = inst.targetX - inst.sprite.x
    const dy = inst.targetY - inst.sprite.y
    const dist = Math.hypot(dx, dy)

    if (dist < 6) {
      inst.sprite.x = inst.targetX
      inst.sprite.y = inst.targetY
      inst.state = 'idle'
      inst.idleUntil = time + Phaser.Math.Between(800, 2600)
      this.syncTransforms(inst)
      return
    }

    const step = Math.min(inst.moveSpeed * 0.016, dist)
    const nx = inst.sprite.x + (dx / dist) * step
    const ny = inst.sprite.y + (dy / dist) * step

    if (!this.collisionSystem.isWalkableAt(nx, ny)) {
      inst.state = 'idle'
      inst.idleUntil = time + Phaser.Math.Between(400, 900)
      return
    }

    inst.sprite.x = nx
    inst.sprite.y = ny
    this.setFacing(inst, dx >= 0)
    this.syncTransforms(inst)
  }

  /** 随机出现：每隔一段时间瞬移到新出生点（淡出→移动→淡入） */
  private updateRespawn(inst: CatInstance, time: number): void {
    if (time < inst.nextRespawnAt) return
    const spawn = inst.def.spawnPoints[Phaser.Math.Between(0, inst.def.spawnPoints.length - 1)]
    const px = spawn.x * TILE_SIZE + TILE_SIZE / 2
    const py = spawn.y * TILE_SIZE + TILE_SIZE / 2

    inst.nextRespawnAt = time + Phaser.Math.Between(60000, 120000)
    this.scene.tweens.add({
      targets: inst.sprite,
      alpha: 0,
      duration: 350,
      ease: 'Quad.easeOut',
      onComplete: () => {
        if (!inst.sprite.active || !inst.sprite.scene) return
        inst.sprite.setPosition(px, py)
        inst.homeX = px
        inst.homeY = py
        inst.state = 'idle'
        inst.idleUntil = this.scene.time.now + Phaser.Math.Between(400, 1200)
        this.syncTransforms(inst)
        this.scene.tweens.add({ targets: inst.sprite, alpha: 1, duration: 400, ease: 'Quad.easeIn' })
      },
    })
  }

  /** 在出生点 roamRadius 内随机选可走目标点 */
  private pickWalkableTarget(inst: CatInstance): { x: number; y: number } | null {
    const radius = inst.def.roamRadius
    for (let i = 0; i < 12; i++) {
      const tx = Phaser.Math.Between(-radius, radius)
      const ty = Phaser.Math.Between(-radius, radius)
      const wx = inst.homeX + tx * TILE_SIZE
      const wy = inst.homeY + ty * TILE_SIZE
      if (wx < 32 || wy < 32) continue
      if (Math.hypot(wx - inst.sprite.x, wy - inst.sprite.y) < TILE_SIZE) continue
      if (this.collisionSystem.isWalkableAt(wx, wy)) {
        return { x: wx, y: wy }
      }
    }
    return null
  }

  private setFacing(inst: CatInstance, facingRight: boolean): void {
    inst.facingLeft = !facingRight
    inst.sprite.setFlipX(inst.facingLeft)
  }

  /** 同步名字/阴影位置与深度 */
  private syncTransforms(inst: CatInstance): void {
    inst.sprite.setDepth(inst.sprite.y + 100)
    inst.nameTag.setPosition(inst.sprite.x, inst.sprite.y - NAMETAG_OFFSET)
    inst.nameTag.setDepth(inst.sprite.y + 200)
    inst.shadow.setPosition(inst.sprite.x, inst.sprite.y + 22)
    inst.shadow.setDepth(inst.sprite.y + 50)
    // 物理碰撞体跟随精灵（防止被物理体拉回原位）
    this.collisionSystem.syncNpcBody(inst.sprite)
  }

  // =============================================
  // 喂食协调：李鹭随机喂猫
  // =============================================

  /** 每帧检查是否触发喂猫：李鹭空闲 + 有猫空闲 + 冷却到 */
  private updateFeed(time: number): void {
    if (time < this.nextFeedAt) return
    const feeder = this.hooks.getFeeder?.() ?? null
    if (!feeder || !feeder.canFeed) {
      this.nextFeedAt = time + Phaser.Math.Between(5000, 9000)
      return
    }
    // 选一只空闲猫
    const idleCats = Array.from(this.cats.values()).filter((c) => c.state === 'idle' || c.state === 'roam')
    if (idleCats.length === 0) {
      this.nextFeedAt = time + Phaser.Math.Between(6000, 12000)
      return
    }
    const cat = idleCats[Phaser.Math.Between(0, idleCats.length - 1)]
    this.startFeed(cat, feeder)
    // 下一轮喂食
    this.nextFeedAt = time + Phaser.Math.Between(25000, 40000)
  }

  /** 启动喂食流程：猫走向李鹭 → 吃食 → 爱心 → 离开 */
  private startFeed(cat: CatInstance, feeder: { x: number; y: number; canFeed: boolean }): void {
    cat.state = 'coming'
    const tx = feeder.x
    const ty = feeder.y + 34 // 猫停在李鹭脚前
    const dx = tx - cat.sprite.x
    const dy = ty - cat.sprite.y
    const dist = Math.hypot(dx, dy)
    if (dist < 10) {
      this.beginEating(cat, feeder)
      return
    }

    this.setFacing(cat, dx >= 0)
    cat.sprite.play(`${cat.def.id}_walk`, true)

    // 移动 tween：走到李鹭脚前（避障：若中途不可走则直接跳过去）
    this.scene.tweens.add({
      targets: cat.sprite,
      x: tx,
      y: ty,
      duration: Math.min(2400, dist / cat.moveSpeed * 1000),
      ease: 'Linear',
      onUpdate: () => {
        if (!cat.sprite.active) return
        if (!this.collisionSystem.isWalkableAt(cat.sprite.x, cat.sprite.y)) {
          cat.sprite.x = tx
          cat.sprite.y = ty
        }
        // 物理碰撞体跟随（tween 逐帧移动，需同步防止被物理体拉回）
        this.syncTransforms(cat)
      },
      onComplete: () => this.beginEating(cat, feeder),
    })
  }

  /** 开始吃食：李鹭投喂 + 猫咪低头吃 + 爱心粒子 */
  private beginEating(cat: CatInstance, feeder: { x: number; y: number; canFeed: boolean }): void {
    if (!cat.sprite.active) return
    cat.state = 'eating'
    this.syncTransforms(cat)
    // 停住，播放待机（首帧）
    cat.sprite.play(`${cat.def.id}_walk`, true)

    // 李鹭喂食动画（蹲下投喂）
    this.hooks.playFeederFeed?.(() => {
      if (!cat.sprite.active) return
      // 撒食物：小鱼干从李鹭手中飞到猫嘴
      this.throwTreat(feeder.x, feeder.y - 30, cat.sprite.x, cat.sprite.y - 8)
      // 猫低头吃（点头 3 次）
      this.playEating(cat, () => {
        // 爱心粒子
        this.spawnHearts(cat.sprite.x, cat.sprite.y - 30)
        // 吃完走开
        this.leaveAfterFeed(cat)
      })
    })
  }

  /** 小鱼干投掷：从李鹭手飞向猫嘴 */
  private throwTreat(sx: number, sy: number, tx: number, ty: number): void {
    for (let i = 0; i < 2; i++) {
      const treat = this.scene.add.rectangle(sx + Phaser.Math.Between(-6, 6), sy, 10, 5, i === 0 ? 0x8a5a2a : 0xa87840)
      treat.setDepth(ty + 400)
      this.scene.tweens.add({
        targets: treat,
        x: tx + Phaser.Math.Between(-8, 8),
        y: ty - 2,
        angle: 180,
        duration: 480,
        ease: 'Quad.easeIn',
        onComplete: () => treat.destroy(),
      })
    }
  }

  /** 猫低头吃食：向下压 + 点头 */
  private playEating(cat: CatInstance, onDone: () => void): void {
    const sprite = cat.sprite
    const origY = sprite.y
    const count = 3
    let n = 0
    const doNod = () => {
      if (!sprite.active || !sprite.scene) {
        onDone()
        return
      }
      n++
      if (n > count) {
        sprite.setY(origY)
        onDone()
        return
      }
      this.scene.tweens.add({
        targets: sprite,
        scaleY: CAT_SCALE * 0.78,
        y: origY + 9,
        duration: 180,
        ease: 'Quad.easeIn',
        onUpdate: () => this.collisionSystem.syncNpcBody(sprite),
        onComplete: () => {
          if (!sprite.active) return
          this.scene.tweens.add({
            targets: sprite,
            scaleY: CAT_SCALE,
            y: origY,
            duration: 160,
            ease: 'Quad.easeOut',
            onUpdate: () => this.collisionSystem.syncNpcBody(sprite),
            onComplete: doNod,
          })
        },
      })
    }
    doNod()
  }

  /** 爱心粒子：粉色小心心向上飘散 */
  private spawnHearts(x: number, y: number): void {
    for (let i = 0; i < 3; i++) {
      const heart = this.scene.add.text(x + Phaser.Math.Between(-14, 14), y, '♥', {
        fontSize: FONT_SIZE.XS,
        color: i === 1 ? '#ff88aa' : '#ff5577',
        fontFamily: FONT_BODY,
      })
      heart.setOrigin(0.5, 1)
      heart.setDepth(y + 400)
      this.scene.tweens.add({
        targets: heart,
        y: heart.y - Phaser.Math.Between(26, 44),
        alpha: 0,
        scale: 1.3,
        duration: Phaser.Math.Between(700, 1100),
        ease: 'Quad.easeOut',
        onComplete: () => heart.destroy(),
      })
    }
  }

  /** 吃完后猫转身走开，恢复漫游 */
  private leaveAfterFeed(cat: CatInstance): void {
    if (!cat.sprite.active || !cat.sprite.scene) return
    cat.state = 'leaving'
    this.setFacing(cat, !cat.facingLeft)
    cat.sprite.play(`${cat.def.id}_walk`, true)
    const tx = cat.sprite.x + (cat.facingLeft ? -1 : 1) * TILE_SIZE * 2.2
    const ty = cat.sprite.y + Phaser.Math.Between(-20, 20)
    this.scene.tweens.add({
      targets: cat.sprite,
      x: tx,
      y: ty,
      duration: 900,
      ease: 'Sine.easeOut',
      onComplete: () => {
        if (!cat.sprite.active) return
        cat.state = 'idle'
        cat.homeX = tx
        cat.homeY = ty
        cat.idleUntil = this.scene.time.now + Phaser.Math.Between(1000, 2500)
        this.syncTransforms(cat)
      },
    })
  }

  get size(): number {
    return this.cats.size
  }
}
