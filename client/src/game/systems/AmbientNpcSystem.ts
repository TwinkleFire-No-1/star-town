// 星火小镇 — 普通NPC（路人）系统
// 需求：增加更多普通NPC，只会回复固定回答（后端短路），在城镇中走动，
//       头顶随机气泡台词，营造整个镇子"闹哄哄"的氛围。
// 设计：
// - 从后端 /api/npcs/ambient 拉取普通NPC定义（固定台词、站位、漫游半径）
// - 复用已有 NPC 美术精灵图（assetId → public/assets/sprites/npc/{assetId}.png）
// - 独立管理精灵（不进入 NpcSpriteManager，避免被 loadNPCsFromServer 重建销毁）
// - 随机漫游：围绕出生点 roamRadius 内随机选可走目标点，走走停停
// - 头顶气泡：随机间隔显示固定台词，营造热闹感
// - 仅在城镇场景显示

import Phaser from 'phaser'
import { TILE_SIZE } from '../config'
import { FONT_TITLE, FONT_NAMETAG, FONT_SIZE } from '../typography'
import { SpriteGenerator } from '../entities/SpriteGenerator'
import type { CollisionSystem } from '../systems/CollisionSystem'

/** 名字标签相对精灵顶部的偏移（与 NpcSpriteManager 保持一致） */
const NAMETAG_OFFSET = 74
/** 气泡相对名字标签的偏移 */
const BUBBLE_OFFSET = 46

/** 后端普通NPC定义（tile坐标） */
export interface AmbientNpcDef {
  id: string
  name: string
  title: string
  /** 所在场景ID（town=城镇；室内/野外=对应场景，缺省 town） */
  scene?: string
  x: number
  y: number
  direction: string
  assetId: string
  roamRadius: number
  speed: number
  bubbles: string[]
  /** 行为模式：roam=随机漫游（默认）；river=河边随机跳河；dance=原地跳舞；sing=原地唱歌；sleep=原地睡觉（周期醒来偷拍）；pingpong=原地打乒乓球（对打挥拍） */
  behavior?: 'roam' | 'river' | 'dance' | 'sing' | 'sleep' | 'pingpong'
  /** 结伴跟随目标NPC id（跟随者不自行漫游，始终保持在同伴附近，形影不离） */
  companionId?: string
}

/** 运行中的普通NPC实例 */
interface AmbientNpcInstance {
  def: AmbientNpcDef
  sprite: Phaser.GameObjects.Sprite
  nameTag: Phaser.GameObjects.Text
  shadow: Phaser.GameObjects.Ellipse
  bubble: Phaser.GameObjects.Text | null
  bubbleTween: Phaser.Tweens.Tween | null
  bubbleUntil: number
  nextBubbleIn: number
  /** 出生点（像素中心） */
  homeX: number
  homeY: number
  /** 漫游状态 */
  state: 'idle' | 'moving'
  idleUntil: number
  targetX: number
  targetY: number
  /** 移动速度（像素/秒） */
  moveSpeed: number
  /** 基础显示倍率（跳舞摆动基于它） */
  baseScale: number
  /** 基础Y（跳舞/跳河摆动基于它） */
  baseY: number
  /** river：下一次跳河时间戳 */
  nextRiverJumpAt: number
  /** river：当前阶段 */
  riverPhase: 'idle' | 'jumping' | 'hidden' | 'surfacing'
  /** river：落水点（像素） */
  waterX: number
  waterY: number
  /** sleep：当前阶段（sleeping=趴睡 / waking=醒来伸懒腰 / snapping=偷拍咔嚓） */
  sleepPhase: 'sleeping' | 'waking' | 'snapping'
  /** sleep：下一阶段切换时间戳 */
  nextSleepActionAt: number
  /** 正在向服务器请求新气泡（防并发重复请求） */
  fetchingBubble: boolean
  /** 最近显示的一条气泡台词（避免连续重复同一句） */
  lastBubbleLine: string
}
const API_BASE = '/api/npcs/ambient'

/**
 * AmbientNpcSystem — 普通NPC（路人）渲染与漫游系统
 *
 * 职责：
 * - 从后端按场景拉取普通NPC定义（城镇路人 / 室内·野外氛围NPC）
 * - 复用美术资源创建精灵、名字标签、阴影
 * - 随机漫游（出生点附近随机目标，走走停停 + 行走动画；室内 NPC 走动少）
 * - 头顶随机气泡台词（营造热闹氛围）
 * - 支持场景切换重建（每个场景渲染各自的普通NPC）
 */
export class AmbientNpcSystem {
  private scene: Phaser.Scene
  private spriteGenerator: SpriteGenerator
  private collisionSystem: CollisionSystem
  private npcs: Map<string, AmbientNpcInstance> = new Map()
  /** 按场景缓存的普通NPC定义（sceneId → defs） */
  private defsByScene: Map<string, AmbientNpcDef[]> = new Map()
  /** pingpong：乒乓球桌精灵（一对乒乓球NPC共享） */
  private pingpongTable: Phaser.GameObjects.Sprite | null = null
  /** pingpong：乒乓球（左右往返弹跳） */
  private pingpongBall: Phaser.GameObjects.Arc | null = null
  /** 交互注册回调（由 GameScene 提供：把精灵注册进 NPCInteractionSystem） */
  private onRegisterNpc: ((id: string, name: string, sprite: Phaser.GameObjects.Sprite) => void) | null = null
  /** 交互注销回调 */
  private onUnregisterNpc: ((id: string) => void) | null = null

  constructor(scene: Phaser.Scene, spriteGenerator: SpriteGenerator, collisionSystem: CollisionSystem) {
    this.scene = scene
    this.spriteGenerator = spriteGenerator
    this.collisionSystem = collisionSystem
  }

  /**
   * 设置交互注册/注销回调（GameScene 注入）
   */
  setInteractionHooks(
    onRegister: (id: string, name: string, sprite: Phaser.GameObjects.Sprite) => void,
    onUnregister: (id: string) => void,
  ): void {
    this.onRegisterNpc = onRegister
    this.onUnregisterNpc = onUnregister
  }

  /**
   * 按场景重建普通NPC
   * - 城镇：加载并渲染城镇路人
   * - 室内/野外：加载并渲染该场景的氛围NPC（长老大厅无氛围NPC）
   * 内部先同步清理旧精灵，再异步加载定义后生成新精灵
   */
  async rebuildForScene(sceneId: string): Promise<void> {
    this.destroyAll()
    try {
      const defs = await this.getDefsForScene(sceneId)
      if (!defs || defs.length === 0) return
      for (const def of defs) {
        this.spawnOne(def)
      }
      console.log(`[AmbientNpc] Spawned ${this.npcs.size} ambient NPCs in "${sceneId}"`)
    } catch (err) {
      console.warn(`[AmbientNpc] Failed to rebuild for scene "${sceneId}":`, err)
    }
  }

  /**
   * 按场景拉取普通NPC定义（带缓存）
   */
  private async getDefsForScene(sceneId: string): Promise<AmbientNpcDef[] | null> {
    const cached = this.defsByScene.get(sceneId)
    if (cached) return cached
    try {
      const res = await fetch(`${API_BASE}?scene=${encodeURIComponent(sceneId)}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = (await res.json()) as { data?: AmbientNpcDef[] }
      const defs = json.data ?? []
      this.defsByScene.set(sceneId, defs)
      return defs
    } catch (err) {
      console.warn(`[AmbientNpc] Failed to load ambient NPCs for scene "${sceneId}":`, err)
      return null
    }
  }

  /**
   * 创建单个普通NPC
   */
  private spawnOne(def: AmbientNpcDef): void {
    if (this.npcs.has(def.id)) return

    // tile 坐标 → 像素中心
    const px = def.x * TILE_SIZE + TILE_SIZE / 2
    const py = def.y * TILE_SIZE + TILE_SIZE / 2

    // 复用已有美术资源生成精灵纹理（普通NPC外观直接使用现成NPC精灵图）
    this.spriteGenerator.generateNPCSprite(def.id, undefined, def.assetId)

    const sprite = this.scene.add.sprite(px, py, `npc_${def.id}`)
    sprite.setOrigin(0.5, 0.5)
    sprite.setScale(this.spriteGenerator.getDisplayScale(`npc_${def.id}`))
    sprite.setDepth(py + 100)

    // 启用物理碰撞体并注册进角色碰撞组（玩家不可穿过NPC，NPC之间互相碰撞）
    this.collisionSystem.addNpcCollider(sprite)

    // 脚下落地阴影
    const shadow = this.scene.add.ellipse(px, py + 30, 44, 14, 0x000000, 0.32)
    shadow.setDepth(py + 50)

    // 初始朝向动画
    const dir = this.normalizeDirection(def.direction)
    if (def.behavior === 'pingpong') {
      // 乒乓球对打：直接进入挥拍循环（walk 动画 = 3帧挥拍序列）
      sprite.play(`npc_${def.id}_walk_${dir}`, true)
      // 搭档错开半拍（祝轲轲滞后半程），形成一攻一守的对打节奏
      if (def.id === 'amb_pingpong_zhukeke') {
        sprite.anims.setProgress(0.5)
      }
    } else {
      sprite.play(`npc_${def.id}_idle_${dir}`)
    }

    // 名字标签
    const nameTag = this.scene.add.text(px, py - NAMETAG_OFFSET, def.name, {
      fontSize: FONT_SIZE.XS,
      color: '#ffffff',
      fontFamily: FONT_NAMETAG,
      backgroundColor: 'rgba(0,0,0,0.5)',
      padding: { x: 8, y: 4 },
    })
    nameTag.setOrigin(0.5, 1)
    nameTag.setDepth(py + 200)

    this.npcs.set(def.id, {
      def,
      sprite,
      nameTag,
      shadow,
      bubble: null,
      bubbleTween: null,
      bubbleUntil: 0,
      nextBubbleIn: Phaser.Math.Between(2000, 6000),
      homeX: px,
      homeY: py,
      state: 'idle',
      idleUntil: this.scene.time.now + Phaser.Math.Between(800, 2500),
      targetX: px,
      targetY: py,
      moveSpeed: def.speed * TILE_SIZE,
      baseScale: this.spriteGenerator.getDisplayScale(`npc_${def.id}`),
      baseY: py,
      nextRiverJumpAt: this.scene.time.now + Phaser.Math.Between(5000, 10000),
      riverPhase: 'idle',
      waterX: px,
      // 落水点：站位下方 1.5 格（河床中心，李鹭站 y=12 → 水面 y=13.5）
      waterY: (def.y + 1.5) * TILE_SIZE,
      sleepPhase: 'sleeping',
      nextSleepActionAt: this.scene.time.now + Phaser.Math.Between(8000, 14000),
      fetchingBubble: false,
      lastBubbleLine: '',
    })

    // 注册交互（E键对话 → 后端固定回复）
    this.onRegisterNpc?.(def.id, def.name, sprite)

    // 乒乓球场景：渲染球桌 + 乒乓球（一对搭档共享，首次遇到时创建）
    if (def.behavior === 'pingpong') {
      this.ensurePingpongScene(px, py)
    }
  }

  /**
   * 销毁全部普通NPC并注销交互
   */
  destroyAll(): void {
    for (const [id, inst] of this.npcs) {
      this.collisionSystem.unregisterNpc(inst.sprite)
      inst.sprite.destroy()
      inst.nameTag.destroy()
      inst.shadow.destroy()
      if (inst.bubble) inst.bubble.destroy()
      if (inst.bubbleTween) inst.bubbleTween.stop()
      this.onUnregisterNpc?.(id)
    }
    this.npcs.clear()

    // 清理乒乓球场景（球桌 + 乒乓球）
    if (this.pingpongBall) {
      this.pingpongBall.destroy()
      this.pingpongBall = null
    }
    if (this.pingpongTable) {
      this.pingpongTable.destroy()
      this.pingpongTable = null
    }
  }

  /**
   * 每帧更新：漫游 + 气泡
   * BUG修复：防御精灵已销毁但实例未清理的情况（场景切换竞态）
   */
  update(time: number): void {
    for (const inst of this.npcs.values()) {
      // 精灵已被销毁（如场景切换竞态）→ 跳过并清理
      if (!inst.sprite.active || !inst.sprite.scene) {
        this.destroyOne(inst.def.id)
        continue
      }
      const behavior = inst.def.behavior ?? 'roam'
      if (behavior === 'river') {
        // 跳河NPC：随机跳河动画 + 气泡
        this.updateRiver(inst, time)
        this.updateBubble(inst, time)
        continue
      }
      if (behavior === 'dance') {
        // 跳舞NPC：原地跳舞摆动 + 气泡
        this.updateDance(inst, time)
        this.updateBubble(inst, time)
        continue
      }
      if (behavior === 'sing') {
        // 唱歌NPC：原地轻摆（深情演唱）+ 气泡
        this.updateSing(inst, time)
        this.updateBubble(inst, time)
        continue
      }
      if (behavior === 'sleep') {
        // 睡觉NPC：趴睡 → 醒来伸懒腰 → 偷拍咔嚓，循环
        this.updateSleep(inst, time)
        continue
      }
      if (behavior === 'pingpong') {
        // 乒乓球对打：挥拍循环 + 身体起伏 + 气泡
        this.updatePingpong(inst, time)
        this.updateBubble(inst, time)
        continue
      }
      if (inst.def.companionId) {
        // 结伴NPC：跟随同伴（形影不离）
        this.updateFollow(inst)
      } else {
        this.updateRoam(inst, time)
      }
      this.updateBubble(inst, time)
    }
  }

  /**
   * 跳河NPC行为：随机间隔执行「起跳 → 落水 → 水花 → 潜伏 → 冒头回岸」循环
   * 动画由 tween 链驱动，waterY 为河床水面中心
   */
  private updateRiver(inst: AmbientNpcInstance, time: number): void {
    if (inst.riverPhase !== 'idle') return
    if (time < inst.nextRiverJumpAt) return
    this.startRiverJump(inst)
  }

  private startRiverJump(inst: AmbientNpcInstance): void {
    inst.riverPhase = 'jumping'
    const sprite = inst.sprite
    const { nameTag, shadow } = inst

    // 1) 起跳：向上跃起（抛物线上升）
    this.scene.tweens.add({
      targets: sprite,
      y: inst.baseY - 76,
      duration: 380,
      ease: 'Quad.easeOut',
      onUpdate: () => this.syncTransforms(inst),
      onComplete: () => {
        // 精灵可能已随场景切换销毁 → 防御
        if (!sprite.active || !sprite.scene) return
        // 2) 落水：下坠到水面 + 缩小
        this.scene.tweens.add({
          targets: sprite,
          y: inst.waterY,
          scale: 0.55,
          duration: 300,
          ease: 'Quad.easeIn',
          onUpdate: () => this.syncTransforms(inst),
          onComplete: () => {
            if (!sprite.active || !sprite.scene) return
            // 3) 水花 + 沉入水中隐藏
            this.spawnSplash(inst.waterX, inst.waterY)
            sprite.setVisible(false)
            nameTag.setVisible(false)
            shadow.setVisible(false)
            inst.riverPhase = 'hidden'
            // 4) 水里潜伏几秒后冒头回岸
            this.scene.time.delayedCall(Phaser.Math.Between(2800, 4500), () => this.surfaceRiver(inst))
          },
        })
      },
    })
  }

  /** 冒头：从水里爬回岸边，恢复正常待机 */
  private surfaceRiver(inst: AmbientNpcInstance): void {
    const sprite = inst.sprite
    if (!sprite || !sprite.active || !sprite.scene) return
    sprite.setVisible(true)
    // 冒头回岸：重新启用物理体（此前跳河沉水时已禁用）
    this.collisionSystem.enableNpcBody(sprite)
    sprite.setScale(inst.baseScale)
    sprite.setPosition(inst.homeX, inst.waterY)
    inst.nameTag.setVisible(true)
    inst.shadow.setVisible(true)
    inst.riverPhase = 'surfacing'

    this.scene.tweens.add({
      targets: sprite,
      y: inst.baseY,
      duration: 520,
      ease: 'Quad.easeOut',
      onUpdate: () => this.syncTransforms(inst),
      onComplete: () => {
        if (!sprite.active || !sprite.scene) return
        inst.riverPhase = 'idle'
        const dir = this.normalizeDirection(inst.def.direction)
        sprite.play(`npc_${inst.def.id}_idle_${dir}`, true)
        this.syncTransforms(inst)
        // 随机 8~15 秒后再跳一次
        inst.nextRiverJumpAt = this.scene.time.now + Phaser.Math.Between(8000, 15000)
      },
    })
  }

  /** 落水水花：扩散圆环 + 飞溅水珠 */
  private spawnSplash(x: number, y: number): void {
    const ring = this.scene.add.circle(x, y, 10, 0xffffff, 0.85)
    ring.setDepth(y + 150)
    this.scene.tweens.add({
      targets: ring,
      radius: 46,
      alpha: 0,
      duration: 520,
      ease: 'Quad.easeOut',
      onComplete: () => ring.destroy(),
    })
    for (let i = 0; i < 6; i++) {
      const drop = this.scene.add.circle(
        x + Phaser.Math.Between(-16, 16),
        y + Phaser.Math.Between(-6, 8),
        Phaser.Math.Between(2, 5),
        0xbbddff,
        0.9,
      )
      drop.setDepth(y + 150)
      this.scene.tweens.add({
        targets: drop,
        x: drop.x + Phaser.Math.Between(-34, 34),
        y: drop.y - Phaser.Math.Between(12, 36),
        alpha: 0,
        scale: 0.3,
        duration: Phaser.Math.Between(360, 660),
        ease: 'Quad.easeOut',
        onComplete: () => drop.destroy(),
      })
    }
  }

  /**
   * 跳舞NPC行为：原地左右摇摆 + 旋转微动 + 上下浮动（正弦摆动模拟舞步）
   */
  private updateDance(inst: AmbientNpcInstance, time: number): void {
    const sprite = inst.sprite
    const t = time / 1000
    const sway = Math.sin(t * 4.2) * 0.07
    sprite.setScale(inst.baseScale * (1 + sway))
    sprite.setAngle(Math.sin(t * 3.1) * 6)
    sprite.setY(inst.baseY + Math.sin(t * 2.4) * 8)
    this.syncTransforms(inst)
  }

  /**
   * 唱歌NPC行为：原地轻微摆动 + 上下浮动（深情演唱的律动，节奏比跳舞舒缓）
   * 复用与跳舞相同的 tween 思路，幅度更小、节奏更缓
   */
  private updateSing(inst: AmbientNpcInstance, time: number): void {
    const sprite = inst.sprite
    const t = time / 1000
    const sway = Math.sin(t * 2.6) * 0.05
    sprite.setScale(inst.baseScale * (1 + sway))
    sprite.setAngle(Math.sin(t * 1.8) * 4)
    sprite.setY(inst.baseY + Math.sin(t * 1.6) * 6)
    this.syncTransforms(inst)
  }

  /**
   * 乒乓球对打行为：保持挥拍循环动画 + 击球瞬间轻微身体起伏（模拟发力）
   */
  private updatePingpong(inst: AmbientNpcInstance, time: number): void {
    const sprite = inst.sprite
    const dir = this.normalizeDirection(inst.def.direction)
    const currentAnim = sprite.anims?.currentAnim?.key ?? ''
    if (!currentAnim.includes('_walk_')) {
      sprite.play(`npc_${inst.def.id}_walk_${dir}`, true)
    }
    // 击球节奏起伏（小幅，模拟每次挥拍的发力）
    const t = time / 1000
    sprite.setY(inst.baseY + Math.sin(t * 3.4) * 3)
    this.syncTransforms(inst)
  }

  /**
   * 渲染乒乓球场景（球桌 + 对打乒乓球）
   * - 球桌位置 = 一对乒乓球搭档的水平中点，与搭档同排
   * - 仅创建一次（一对搭档共享），场景重建时随 destroyAll 清理
   */
  private ensurePingpongScene(px: number, py: number): void {
    if (this.pingpongTable && this.pingpongTable.active) return
    if (!this.scene.textures.exists('town-building-pingpong_table')) return

    // 收集所有乒乓球NPC的水平位置（含本NPC），取中点作为球桌中心
    let minX = px
    let maxX = px
    const townDefs = this.defsByScene.get('town') ?? []
    for (const d of townDefs) {
      if (d.behavior === 'pingpong') {
        const dx = d.x * TILE_SIZE + TILE_SIZE / 2
        if (dx < minX) minX = dx
        if (dx > maxX) maxX = dx
      }
    }
    for (const other of this.npcs.values()) {
      if (other.def.behavior === 'pingpong') {
        if (other.homeX < minX) minX = other.homeX
        if (other.homeX > maxX) maxX = other.homeX
      }
    }

    const midX = (minX + maxX) / 2
    const tableY = py + 6

    // 球桌精灵（俯视，置于两搭档之间；深度低于玩家，避免遮挡角色）
    const table = this.scene.add.sprite(midX, tableY, 'town-building-pingpong_table')
    table.setOrigin(0.5, 0.5)
    table.setDepth(tableY + 54)
    this.pingpongTable = table

    // 对打乒乓球：白色小球在两搭档之间往返弹跳，过网划出弧线
    // 搭档相邻1格站位，小球在两人拍前之间往返（略收进桌沿内侧）
    this.startPingpongBall(minX + 30, maxX - 30, tableY)
  }

  /**
   * 乒乓球对打小球：从一侧拍前出发 → 上升过网 → 下落到对侧拍前 → 停顿 → 弹回
   */
  private startPingpongBall(leftX: number, rightX: number, baseY: number): void {
    if (this.pingpongBall) return
    const ball = this.scene.add.circle(leftX, baseY - 24, 5, 0xffffff, 1)
    ball.setDepth(baseY + 80)
    this.pingpongBall = ball

    const midX = (leftX + rightX) / 2
    const arcY = baseY - 40
    const fly = (from: number, to: number): void => {
      if (!ball.active) return
      // 上升过网
      this.scene.tweens.add({
        targets: ball,
        x: midX,
        y: arcY,
        duration: 330,
        ease: 'Sine.easeIn',
        onComplete: () => {
          if (!ball.active) return
          // 下落到对侧搭档拍前
          this.scene.tweens.add({
            targets: ball,
            x: to,
            y: baseY - 24,
            duration: 330,
            ease: 'Sine.easeOut',
            onComplete: () => {
              if (!ball.active) return
              // 触拍停顿后弹回
              this.scene.time.delayedCall(130, () => fly(to, from))
            },
          })
        },
      })
    }
    fly(leftX, rightX)
  }

  /**
   * 睡觉NPC行为（高爽：爱睡觉 + 爱偷拍包鹏宇）
   * 状态机：趴睡（压低+呼吸起伏+Zzz气泡）→ 醒来伸懒腰 → 偷拍咔嚓（闪光+气泡）→ 趴睡循环
   */
  private updateSleep(inst: AmbientNpcInstance, time: number): void {
    const sprite = inst.sprite
    const t = time / 1000
    switch (inst.sleepPhase) {
      case 'sleeping': {
        // 趴睡：身体压低、缩小、轻微起伏模拟呼吸
        sprite.setScale(inst.baseScale * 0.76)
        sprite.setY(inst.baseY + 16)
        sprite.setAngle(Math.sin(t * 1.1) * 2)
        this.syncTransforms(inst)
        // 睡觉时气泡频率加快（Zzz……）
        if (!inst.bubble && inst.nextBubbleIn > time) {
          inst.nextBubbleIn = time + Phaser.Math.Between(2800, 5200)
        }
        this.updateBubble(inst, time)
        if (time >= inst.nextSleepActionAt) {
          inst.sleepPhase = 'waking'
          inst.nextSleepActionAt = time + 1500
        }
        break
      }
      case 'waking': {
        // 醒来伸懒腰：从趴睡状态起身 + 上下舒展
        const progress = Math.min(1, Math.max(0, 1 - (inst.nextSleepActionAt - time) / 1500))
        sprite.setScale(inst.baseScale * (0.76 + 0.24 * progress))
        sprite.setY(inst.baseY + (1 - progress) * 16)
        sprite.setAngle(Math.sin(t * 9) * 3 * progress)
        this.syncTransforms(inst)
        if (time >= inst.nextSleepActionAt) {
          // 起身完成 → 进入偷拍
          inst.sleepPhase = 'snapping'
          inst.nextSleepActionAt = time + 1600
          sprite.setScale(inst.baseScale)
          sprite.setY(inst.baseY)
          sprite.setAngle(0)
          this.syncTransforms(inst)
          this.forceBubble(inst, '咔嚓！包鹏宇来了！')
          this.spawnFlash(sprite.x, sprite.y)
        }
        break
      }
      case 'snapping': {
        // 偷拍：快速举"相机"抖动 + 小幅前倾
        sprite.setScale(inst.baseScale * (1 + Math.sin(t * 22) * 0.035))
        sprite.setAngle(Math.sin(t * 15) * 9)
        sprite.setY(inst.baseY - 3 + Math.sin(t * 18) * 2)
        this.syncTransforms(inst)
        if (time >= inst.nextSleepActionAt) {
          // 拍完重新趴下入睡
          inst.sleepPhase = 'sleeping'
          inst.nextSleepActionAt = time + Phaser.Math.Between(9000, 16000)
          sprite.setAngle(0)
          const dir = this.normalizeDirection(inst.def.direction)
          sprite.play(`npc_${inst.def.id}_idle_${dir}`, true)
          this.syncTransforms(inst)
        }
        break
      }
    }
  }

  /**
   * 强制弹出一条头顶气泡（睡眠偷拍专用：打断当前气泡并立即显示指定台词）
   */
  private forceBubble(inst: AmbientNpcInstance, line: string): void {
    if (inst.bubble) {
      inst.bubbleTween?.stop()
      inst.bubble.destroy()
      inst.bubble = null
      inst.bubbleTween = null
    }
    const bx = inst.sprite.x
    const by = inst.sprite.y - NAMETAG_OFFSET - BUBBLE_OFFSET
    const bubble = this.scene.add.text(bx, by, line, {
      fontSize: FONT_SIZE.XS,
      color: '#3d2817',
      fontFamily: FONT_TITLE,
      backgroundColor: 'rgba(255,250,235,0.92)',
      padding: { x: 10, y: 6 },
      wordWrap: { width: 240 },
      align: 'center',
    })
    bubble.setOrigin(0.5, 1)
    bubble.setDepth(inst.sprite.y + 300)
    const tween = this.scene.tweens.add({
      targets: bubble,
      y: by - 14,
      duration: 1200,
      ease: 'Sine.easeOut',
    })
    inst.bubble = bubble
    inst.bubbleTween = tween
    inst.bubbleUntil = this.scene.time.now + 2600
    inst.lastBubbleLine = line
  }

  /**
   * 偷拍闪光灯效果：白色光斑快速扩散淡出
   */
  private spawnFlash(x: number, y: number): void {
    const flash = this.scene.add.rectangle(x, y - 34, 44, 44, 0xffffff, 0.9)
    flash.setDepth(y + 400)
    this.scene.tweens.add({
      targets: flash,
      alpha: 0,
      scale: 1.5,
      angle: Phaser.Math.Between(-20, 20),
      duration: 300,
      ease: 'Quad.easeOut',
      onComplete: () => flash.destroy(),
    })
  }

  /**
   * 结伴NPC行为：跟随领队（companionId）移动，保持在约1.2格距离处形影不离
   */
  private updateFollow(inst: AmbientNpcInstance): void {
    const leader = this.npcs.get(inst.def.companionId!)
    if (!leader || !leader.sprite.active) {
      this.playIdleIfNeeded(inst)
      return
    }
    const dx = leader.sprite.x - inst.sprite.x
    const dy = leader.sprite.y - inst.sprite.y
    const dist = Math.hypot(dx, dy)
    const followDist = TILE_SIZE * 1.15

    // 已在同伴身边：待机
    if (dist < followDist + 6) {
      this.playIdleIfNeeded(inst)
      return
    }

    // 朝领队移动（保持 followDist 间距，不重叠）
    const step = Math.min(inst.moveSpeed * 0.016, dist - followDist)
    const nx = inst.sprite.x + (dx / dist) * step
    const ny = inst.sprite.y + (dy / dist) * step

    if (!this.collisionSystem.isWalkableAt(nx, ny)) {
      this.playIdleIfNeeded(inst)
      return
    }

    inst.sprite.x = nx
    inst.sprite.y = ny
    this.syncTransforms(inst)

    const moveDir = Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'right' : 'left') : (dy >= 0 ? 'down' : 'up')
    const currentAnim = inst.sprite.anims?.currentAnim?.key ?? ''
    if (!currentAnim.includes('_walk_')) {
      inst.sprite.play(`npc_${inst.def.id}_walk_${moveDir}`, true)
    }
  }

  /** 若正在播放行走动画则切回待机 */
  private playIdleIfNeeded(inst: AmbientNpcInstance): void {
    const currentAnim = inst.sprite.anims?.currentAnim?.key ?? ''
    if (currentAnim.includes('_walk_')) {
      const dir = this.normalizeDirection(inst.def.direction)
      inst.sprite.play(`npc_${inst.def.id}_idle_${dir}`, true)
    }
  }

  /**
   * 销毁单个普通NPC实例（并注销交互）
   */
  private destroyOne(id: string): void {
    const inst = this.npcs.get(id)
    if (!inst) return
    if (inst.sprite.active) {
      this.collisionSystem.unregisterNpc(inst.sprite)
    }
    inst.sprite.destroy()
    inst.nameTag.destroy()
    inst.shadow.destroy()
    if (inst.bubble) inst.bubble.destroy()
    if (inst.bubbleTween) inst.bubbleTween.stop()
    this.onUnregisterNpc?.(id)
    this.npcs.delete(id)
  }

  /**
   * 漫游逻辑：idle 停留 → 随机选目标点 → moving 走过去
   */
  private updateRoam(inst: AmbientNpcInstance, time: number): void {
    if (inst.state === 'idle') {
      if (time < inst.idleUntil) return
      // 停留结束，选择新的随机目标点（出生点 roamRadius 内，可走）
      const target = this.pickWalkableTarget(inst)
      if (target) {
        inst.state = 'moving'
        inst.targetX = target.x
        inst.targetY = target.y
      } else {
        // 没有可走目标：继续停留
        inst.idleUntil = time + Phaser.Math.Between(600, 1500)
      }
      return
    }

    // moving：向目标移动
    const dx = inst.targetX - inst.sprite.x
    const dy = inst.targetY - inst.sprite.y
    const dist = Math.hypot(dx, dy)

    if (dist < 4) {
      // 到达目标：停下，播放待机动画
      inst.sprite.x = inst.targetX
      inst.sprite.y = inst.targetY
      inst.state = 'idle'
      inst.idleUntil = time + Phaser.Math.Between(1200, 4000)
      const dir = this.normalizeDirection(inst.def.direction)
      inst.sprite.play(`npc_${inst.def.id}_idle_${dir}`, true)
      this.syncTransforms(inst)
      return
    }

    // 移动一步
    const step = Math.min(inst.moveSpeed * 0.016, dist)
    const nx = inst.sprite.x + (dx / dist) * step
    const ny = inst.sprite.y + (dy / dist) * step

    // 防卡墙：如果前方不可走则停下换目标
    if (!this.collisionSystem.isWalkableAt(nx, ny)) {
      inst.state = 'idle'
      inst.idleUntil = time + Phaser.Math.Between(400, 900)
      const dir = this.normalizeDirection(inst.def.direction)
      inst.sprite.play(`npc_${inst.def.id}_idle_${dir}`, true)
      return
    }

    inst.sprite.x = nx
    inst.sprite.y = ny
    this.syncTransforms(inst)

    // 行走动画（按移动方向）
    const moveDir = Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'right' : 'left') : (dy >= 0 ? 'down' : 'up')
    // BUG修复：anims 可能未初始化（场景切换竞态），用可选链防御
    const currentAnim = inst.sprite.anims?.currentAnim?.key ?? ''
    if (!currentAnim.includes('_walk_')) {
      inst.sprite.play(`npc_${inst.def.id}_walk_${moveDir}`, true)
    }
  }

  /**
   * 在出生点 roamRadius 内随机选择可走目标点
   */
  private pickWalkableTarget(inst: AmbientNpcInstance): { x: number; y: number } | null {
    const radius = inst.def.roamRadius
    for (let i = 0; i < 12; i++) {
      const tx = Phaser.Math.Between(-radius, radius)
      const ty = Phaser.Math.Between(-radius, radius)
      const wx = inst.homeX + tx * TILE_SIZE
      const wy = inst.homeY + ty * TILE_SIZE

      // 世界边界保护
      if (wx < 32 || wy < 32) continue

      // 与当前距离太近则跳过（保证走动感）
      if (Math.hypot(wx - inst.sprite.x, wy - inst.sprite.y) < TILE_SIZE) continue

      if (this.collisionSystem.isWalkableAt(wx, wy)) {
        return { x: wx, y: wy }
      }
    }
    return null
  }

  /**
   * 头顶气泡：定时向服务器请求大模型生成的新台词（不重复），失败回退预设台词
   * 营造"每个人都在念叨点什么"的热闹氛围
   */
  private updateBubble(inst: AmbientNpcInstance, time: number): void {
    // 已有气泡显示中
    if (inst.bubble) {
      if (time >= inst.bubbleUntil) {
        this.clearBubble(inst)
        // 下一次气泡较长间隔
        inst.nextBubbleIn = time + Phaser.Math.Between(6000, 14000)
      }
      return
    }

    // 未到时间，或上一次请求还没返回（避免并发重复请求）
    if (time < inst.nextBubbleIn || inst.fetchingBubble) return

    // 请求大模型生成一条台词（LLM失败时服务端回退预设台词）
    inst.fetchingBubble = true
    this.fetchBubbleLine(inst.def.id)
      .then((line) => {
        inst.fetchingBubble = false
        // 等待期间气泡可能已被其他逻辑（如睡眠偷拍）显示
        if (inst.bubble) return
        if (line) {
          // 避免连续显示同一条（LLM轮换或预设都可能撞上）
          const finalLine = line === inst.lastBubbleLine
            ? this.pickNonRepeatPreset(inst, line)
            : line
          this.showBubble(inst, finalLine, time)
        }
      })
      .catch(() => {
        inst.fetchingBubble = false
        if (!inst.bubble) {
          const line = this.pickNonRepeatPreset(inst, inst.lastBubbleLine)
          if (line) this.showBubble(inst, line, time)
        }
      })
  }

  /** 向服务器请求一条气泡台词（服务端池轮换 + 失败回退预设） */
  private async fetchBubbleLine(id: string): Promise<string> {
    try {
      const res = await fetch(`${API_BASE}/${encodeURIComponent(id)}/bubble`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = (await res.json()) as { data?: { line: string } }
      return json?.data?.line?.trim() ?? ''
    } catch {
      return ''
    }
  }

  /** 显示一条头顶气泡（上浮动画） */
  private showBubble(inst: AmbientNpcInstance, line: string, time: number): void {
    // 防御：请求返回前 NPC 可能已随场景切换销毁
    if (!inst.sprite || !inst.sprite.active || !inst.sprite.scene) return
    const bx = inst.sprite.x
    const by = inst.sprite.y - NAMETAG_OFFSET - BUBBLE_OFFSET

    const bubble = this.scene.add.text(bx, by, line, {
      fontSize: FONT_SIZE.XS,
      color: '#3d2817',
      fontFamily: FONT_TITLE,
      backgroundColor: 'rgba(255,250,235,0.92)',
      padding: { x: 10, y: 6 },
      wordWrap: { width: 240 },
      align: 'center',
    })
    bubble.setOrigin(0.5, 1)
    bubble.setDepth(inst.sprite.y + 300)

    // 气泡上浮动画
    const tween = this.scene.tweens.add({
      targets: bubble,
      y: by - 14,
      duration: 1200,
      ease: 'Sine.easeOut',
      yoyo: false,
    })

    inst.bubble = bubble
    inst.bubbleTween = tween
    inst.bubbleUntil = time + 2600
    inst.lastBubbleLine = line
  }

  /** 清理当前气泡 */
  private clearBubble(inst: AmbientNpcInstance): void {
    inst.bubbleTween?.stop()
    inst.bubble?.destroy()
    inst.bubble = null
    inst.bubbleTween = null
  }

  /** 从预设台词挑一条（尽量避开 avoid，避免连续重复） */
  private pickNonRepeatPreset(inst: AmbientNpcInstance, avoid: string): string {
    const bubbles = inst.def.bubbles
    if (bubbles.length === 0) return ''
    const others = bubbles.filter((b) => b !== avoid)
    const pool = others.length > 0 ? others : bubbles
    return pool[Phaser.Math.Between(0, pool.length - 1)] ?? ''
  }

  /**
   * 同步精灵/名字标签/阴影/气泡的深度与位置
   */
  private syncTransforms(inst: AmbientNpcInstance): void {
    const { sprite, nameTag, shadow } = inst
    sprite.setDepth(sprite.y + 100)
    nameTag.setPosition(sprite.x, sprite.y - NAMETAG_OFFSET)
    nameTag.setDepth(sprite.y + 200)
    shadow.setPosition(sprite.x, sprite.y + 30)
    shadow.setDepth(sprite.y + 50)
    if (inst.bubble) {
      inst.bubble.setPosition(sprite.x, sprite.y - NAMETAG_OFFSET - BUBBLE_OFFSET)
      inst.bubble.setDepth(sprite.y + 300)
    }
    // 物理碰撞体跟随精灵（防止被物理体拉回原位；跳河沉水禁用期间无副作用）
    this.collisionSystem.syncNpcBody(sprite)
  }

  /**
   * 获取全部普通NPC的注册信息（用于交互系统注册）
   */
  getInteractables(): Array<{ id: string; name: string; sprite: Phaser.GameObjects.Sprite }> {
    return Array.from(this.npcs.values()).map((inst) => ({
      id: inst.def.id,
      name: inst.def.name,
      sprite: inst.sprite,
    }))
  }

  /**
   * 当前是否有已加载的普通NPC
   */
  get size(): number {
    return this.npcs.size
  }

  private normalizeDirection(dir: string): string {
    const lower = dir.toLowerCase()
    if (lower === 'down' || lower === 'up' || lower === 'left' || lower === 'right') {
      return lower
    }
    return 'down'
  }

  // =============================================
  // 李鹭喂猫：位置/状态查询 + 投喂动画（CatSystem 协调调用）
  // =============================================

  /**
   * 获取跳河NPC（李鹭）当前位置与是否空闲（可供喂猫）
   * 无跳河NPC 或正处于跳河/喂食中 → 返回 null
   */
  getRiverFeederState(): { x: number; y: number; canFeed: boolean } | null {
    for (const inst of this.npcs.values()) {
      if (inst.def.behavior === 'river') {
        return {
          x: inst.sprite.x,
          y: inst.sprite.y,
          canFeed: inst.riverPhase === 'idle',
        }
      }
    }
    return null
  }

  /**
   * 执行李鹭投喂动画：蹲下 → 手臂上举投喂 → 恢复待机
   * 动画期间锁定跳河（riverPhase 置为 jumping 防止同时跳河），完成后回调
   */
  playRiverFeedAnimation(onDone: () => void): void {
    let target: AmbientNpcInstance | null = null
    for (const inst of this.npcs.values()) {
      if (inst.def.behavior === 'river') {
        target = inst
        break
      }
    }
    if (!target || !target.sprite.active) {
      onDone()
      return
    }

    const inst = target
    const sprite = inst.sprite
    const baseScale = inst.baseScale
    const baseY = inst.baseY
    // 喂食期间锁定跳河
    inst.riverPhase = 'jumping'
    const dir = this.normalizeDirection(inst.def.direction)
    sprite.play(`npc_${inst.def.id}_idle_${dir}`, true)

    // 蹲下
    this.scene.tweens.add({
      targets: sprite,
      scale: baseScale * 1.12,
      y: baseY + 10,
      duration: 260,
      ease: 'Quad.easeOut',
      onUpdate: () => this.syncTransforms(inst),
      onComplete: () => {
        if (!sprite.active || !sprite.scene) {
          onDone()
          return
        }
        // 手臂上举投喂（快速两下）
        this.scene.tweens.add({
          targets: sprite,
          scale: baseScale * 1.18,
          y: baseY + 6,
          duration: 200,
          ease: 'Sine.easeInOut',
          yoyo: true,
          repeat: 1,
          onUpdate: () => this.syncTransforms(inst),
          onComplete: () => {
            if (!sprite.active || !sprite.scene) {
              onDone()
              return
            }
            // 恢复站姿
            this.scene.tweens.add({
              targets: sprite,
              scale: baseScale,
              y: baseY,
              duration: 260,
              ease: 'Quad.easeOut',
              onUpdate: () => this.syncTransforms(inst),
              onComplete: () => {
                if (!sprite.active || !sprite.scene) {
                  onDone()
                  return
                }
                inst.riverPhase = 'idle'
                sprite.play(`npc_${inst.def.id}_idle_${dir}`, true)
                this.syncTransforms(inst)
                // 喂食后稍等再跳河
                inst.nextRiverJumpAt = this.scene.time.now + Phaser.Math.Between(9000, 15000)
                onDone()
              },
            })
          },
        })
      },
    })
  }
}
