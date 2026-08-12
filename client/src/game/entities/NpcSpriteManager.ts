import Phaser from 'phaser'
import { FONT_NAMETAG, FONT_SIZE } from '../typography'
import {
  SpriteGenerator,
  NPC_COLOR_SCHEMES,
  NPC_ASSET_BY_NAME,
  normalizeNpcAssetId,
  Direction,
} from './SpriteGenerator'
import type { CollisionSystem } from '../systems/CollisionSystem'

/** NPC名字标签相对精灵顶部的偏移（64px精灵高清：标签在其上方） */
const NAMETAG_OFFSET = 74

/**
 * NPC数据接口（从后端同步或本地配置）
 */
export interface NPCData {
  id: string
  name: string
  title: string
  x: number
  y: number
  direction: string
  /** 复用的外部美术资源别名（普通NPC：amb_villager_01 等复用已有精灵图） */
  assetId?: string
}

/**
 * NPC精灵管理信息
 */
interface NPCSpriteInfo {
  sprite: Phaser.GameObjects.Sprite
  nameTag: Phaser.GameObjects.Text
  /** 脚下落地阴影（椭圆） */
  shadow: Phaser.GameObjects.Ellipse
  npcId: string
  npcName: string
}

/**
 * NpcSpriteManager — NPC精灵渲染管理器
 *
 * 职责：
 * - 管理所有NPC精灵的创建、销毁
 * - 为每个NPC生成独特配色的占位像素精灵
 * - 管理4方向行走/待机动画切换
 * - 管理NPC名字标签
 * - 支持位置更新和方向切换
 *
 * T2.8.3: NPC精灵渲染 — 占位NPC像素角色、4方向动画、待机呼吸
 */
export class NpcSpriteManager {
  private scene: Phaser.Scene
  private spriteGenerator: SpriteGenerator
  private collisionSystem: CollisionSystem
  private npcs = new Map<string, NPCSpriteInfo>()

  constructor(scene: Phaser.Scene, spriteGenerator: SpriteGenerator, collisionSystem: CollisionSystem) {
    this.scene = scene
    this.spriteGenerator = spriteGenerator
    this.collisionSystem = collisionSystem
  }

  /**
   * 批量创建NPC精灵
   * @param npcDataList NPC数据列表
   */
  createNPCs(npcDataList: NPCData[]): void {
    for (const data of npcDataList) {
      this.createNPC(data)
    }
  }

  /**
   * 创建单个NPC精灵
   */
  createNPC(data: NPCData): void {
    // 如果已存在则跳过
    if (this.npcs.has(data.id)) {
      console.warn(`[NpcSpriteManager] NPC ${data.id} already exists`)
      return
    }

    // 生成NPC精灵纹理（优先复用外部美术资源；程序化配色仅作为资源缺失时的兜底）
    // - assetId：显式传入 > 中文名映射（后端NPC name 为中文）> 规范化ID
    const assetId = data.assetId ?? NPC_ASSET_BY_NAME[data.name] ?? undefined
    const normalizedId = normalizeNpcAssetId(data.id)
    const colorScheme = NPC_COLOR_SCHEMES[normalizedId] ?? NPC_COLOR_SCHEMES[data.name] ?? undefined
    this.spriteGenerator.generateNPCSprite(data.id, colorScheme, assetId)

    // 创建精灵（原生64px高清帧，scale 由生成器决定：程序化=1 / 高清外部=1）
    const sprite = this.scene.add.sprite(data.x, data.y, `npc_${data.id}`)
    sprite.setOrigin(0.5, 0.5)
    sprite.setScale(this.spriteGenerator.getDisplayScale(`npc_${data.id}`))
    sprite.setDepth(data.y + 100)

    // 启用物理碰撞体并注册进角色碰撞组（玩家不可穿过NPC，NPC之间互相碰撞）
    this.collisionSystem.addNpcCollider(sprite)

    // 脚下落地阴影（椭圆，加深与地面的融合感）
    const shadow = this.scene.add.ellipse(data.x, data.y + 30, 44, 14, 0x000000, 0.32)
    shadow.setDepth(data.y + 50)
    shadow.setVisible(true)

    // 播放待机动画（默认朝下）
    const dir = this.normalizeDirection(data.direction)
    sprite.play(`npc_${data.id}_idle_${dir}`)

    // 名字标签（1080p 下 26px 清晰可读）
    const nameTag = this.scene.add.text(data.x, data.y - NAMETAG_OFFSET, data.name, {
      fontSize: FONT_SIZE.XS,
      color: '#ffffff',
      fontFamily: FONT_NAMETAG,
      backgroundColor: 'rgba(0,0,0,0.5)',
      padding: { x: 8, y: 4 },
    })
    nameTag.setOrigin(0.5, 1)
    nameTag.setDepth(data.y + 200)

    this.npcs.set(data.id, {
      sprite,
      nameTag,
      shadow,
      npcId: data.id,
      npcName: data.name,
    })

    console.log(`[NpcSpriteManager] Created NPC sprite: ${data.name} (${data.id}) at (${data.x}, ${data.y})`)
  }

  /**
   * 更新NPC位置和方向
   */
  updateNPCPosition(npcId: string, x: number, y: number, direction?: string): void {
    const info = this.npcs.get(npcId)
    if (!info) return

    // BUG修复：精灵可能已被销毁（场景切换竞态），防御处理
    if (!info.sprite.active || !info.sprite.scene || !info.sprite.anims) return

    // 平滑移动
    this.scene.tweens.add({
      targets: info.sprite,
      x,
      y,
      duration: 200,
      ease: 'Linear',
      onUpdate: () => {
        info.sprite.setDepth(info.sprite.y + 100)
        info.nameTag.setPosition(info.sprite.x, info.sprite.y - NAMETAG_OFFSET)
        info.nameTag.setDepth(info.sprite.y + 200)
        // 阴影跟随
        info.shadow.setPosition(info.sprite.x, info.sprite.y + 30)
        info.shadow.setDepth(info.sprite.y + 50)
        // 物理碰撞体跟随精灵（防止被物理体拉回原位）
        this.collisionSystem.syncNpcBody(info.sprite)
      },
    })

    // 方向切换
    if (direction) {
      const dir = this.normalizeDirection(direction)
      const currentAnim = info.sprite.anims?.currentAnim?.key ?? ''

      // 如果在移动中，播放行走动画；否则播放待机动画
      if (currentAnim.includes('_walk_') || currentAnim.includes('_idle_')) {
        const isMoving = Math.abs(x - info.sprite.x) > 1 || Math.abs(y - info.sprite.y) > 1
        if (isMoving) {
          info.sprite.play(`npc_${npcId}_walk_${dir}`, true)
        } else {
          info.sprite.play(`npc_${npcId}_idle_${dir}`, true)
        }
      }
    }
  }

  /**
   * 切换NPC动画（行走/待机）
   */
  playAnimation(npcId: string, animType: 'walk' | 'idle', direction: Direction | string): void {
    const info = this.npcs.get(npcId)
    if (!info) return

    const dir = this.normalizeDirection(direction)
    const animKey = `npc_${npcId}_${animType}_${dir}`
    info.sprite.play(animKey, true)
  }

  /**
   * 销毁NPC精灵
   */
  destroyNPC(npcId: string): void {
    const info = this.npcs.get(npcId)
    if (!info) return

    this.collisionSystem.unregisterNpc(info.sprite)
    info.sprite.destroy()
    info.nameTag.destroy()
    info.shadow.destroy()
    this.npcs.delete(npcId)
    console.log(`[NpcSpriteManager] Destroyed NPC: ${npcId}`)
  }

  /**
   * 获取NPC精灵
   */
  getSprite(npcId: string): Phaser.GameObjects.Sprite | null {
    return this.npcs.get(npcId)?.sprite ?? null
  }

  /**
   * 获取所有NPC的ID
   */
  getNPCIds(): string[] {
    return Array.from(this.npcs.keys())
  }

  /**
   * 获取NPC数据列表（用于交互系统注册）
   */
  getNPCDataList(): Array<{ id: string; name: string; sprite: Phaser.GameObjects.Sprite }> {
    return Array.from(this.npcs.values()).map((info) => ({
      id: info.npcId,
      name: info.npcName,
      sprite: info.sprite,
    }))
  }

  /**
   * 更新所有NPC的深度排序（Y轴排序）
   * T5.3.3 优化：批量设置，减少单次调用开销
   * 同时同步名字标签位置（NPC被玩家推动后名字跟随精灵）
   */
  updateDepthSort(): void {
    for (const info of this.npcs.values()) {
      const depth = info.sprite.y + 100
      info.sprite.setDepth(depth)
      info.nameTag.setDepth(depth + 100)
      info.nameTag.setPosition(info.sprite.x, info.sprite.y - NAMETAG_OFFSET)
    }
  }

  /**
   * 视口裁剪：只更新视口内NPC的深度排序
   * T5.3.3 优化：当NPC数量较多时，只处理可见NPC
   */
  updateDepthSortInView(cameraScrollX: number, cameraScrollY: number, cameraWidth: number, cameraHeight: number): void {
    const padding = 50
    const viewLeft = cameraScrollX - padding
    const viewRight = cameraScrollX + cameraWidth + padding
    const viewTop = cameraScrollY - padding
    const viewBottom = cameraScrollY + cameraHeight + padding

    for (const info of this.npcs.values()) {
      const x = info.sprite.x
      const y = info.sprite.y
      const inView = x >= viewLeft && x <= viewRight && y >= viewTop && y <= viewBottom

      // 视口外的NPC隐藏以节省渲染
      info.sprite.setVisible(inView)
      info.nameTag.setVisible(inView)

      if (inView) {
        const depth = y + 100
        info.sprite.setDepth(depth)
        info.nameTag.setDepth(depth + 100)
        info.nameTag.setPosition(x, y - NAMETAG_OFFSET)
      }
    }
  }

  /**
   * 将方向字符串标准化为Direction枚举值
   */
  private normalizeDirection(dir: string): string {
    const lower = dir.toLowerCase()
    if (lower === 'down' || lower === 'up' || lower === 'left' || lower === 'right') {
      return lower
    }
    return 'down' // 默认朝下
  }
}
