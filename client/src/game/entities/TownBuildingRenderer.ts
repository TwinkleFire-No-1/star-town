// 星火小镇 — 城镇建筑外观渲染器 v3（2.5D 立体像素 · 子图拼接体系）
// ============================================================
// 需求：建筑从"平面贴图"升级为"立体像素"，参考原神/西式建筑，
//       用精细子图零件（屋顶件/墙件/底座件/门窗件/装饰件）拼接每栋建筑。
//
// 立体透视体系（统一光源：西北→东南）：
// 1. 等距双坡屋顶：屋脊 + 左坡(受光亮) + 右坡(背光阴) + 屋檐厚度 + 檐下投影
// 2. 主体体积：正立面(南) + 左/右侧立面(暗色斜边) → 建筑"有厚度"
// 3. 底座平台：顶面(亮) + 前侧(中) + 侧(暗) → 建筑"坐在基座上"
// 4. 地面投影：向东南方向投出椭圆阴影，建筑"压"在地面
// 5. 材质语言：砖/石/木/都铎木梁/白灰/瓦片/铁皮，各自纹理与受光
//
// 每栋建筑 = 零件组合（共用工具方法，颜色/尺寸/材质/附加件各不相同），
// 实现"8栋建筑完全不同轮廓与气质"。

import Phaser from 'phaser'
import { TILE_SIZE } from '../config'
import { FONT_TITLE, FONT_SIZE } from '../typography'
import { TOWN_BUILDINGS, type TownBuildingType, type TownBuildingDef } from '../scenes/SceneSystem'
import { isSceneUnlocked } from '../../services/storyUnlock'

// =============================================
// 建筑外观配置（像素尺寸）
// =============================================

interface BuildingVisualConfig {
  width: number
  height: number
}

const BUILDING_VISUALS: Record<TownBuildingType, BuildingVisualConfig> = {
  blacksmith: { width: 384, height: 400 },
  alchemist: { width: 384, height: 404 },
  tavern: { width: 384, height: 404 },
  market: { width: 384, height: 356 },
  elder_hall: { width: 384, height: 408 },
  residential: { width: 384, height: 360 },
  forest_gate: { width: 384, height: 300 },
  mine_entrance: { width: 288, height: 296 },
}

// =============================================
// 颜色工具
// =============================================

function toHex(color: number): string {
  return '#' + color.toString(16).padStart(6, '0')
}

/** 颜色变暗/变亮（factor<1 变暗，>1 变亮）返回 0xRRGGBB */
function shade(color: number, factor: number): number {
  const r = Math.max(0, Math.min(255, Math.round(((color >> 16) & 0xff) * factor)))
  const g = Math.max(0, Math.min(255, Math.round(((color >> 8) & 0xff) * factor)))
  const b = Math.max(0, Math.min(255, Math.round((color & 0xff) * factor)))
  return (r << 16) | (g << 8) | b
}

function shadeHex(color: number, factor: number): string {
  return toHex(shade(color, factor))
}

/** 简单伪随机（固定种子 per-key，保证纹理稳定） */
function seededRand(seed: number): () => number {
  let s = seed
  return () => {
    s = (s * 9301 + 49297) % 233280
    return s / 233280
  }
}

/**
 * TownBuildingRenderer v3 — 2.5D 立体像素城镇建筑渲染器
 */
export class TownBuildingRenderer {
  private scene: Phaser.Scene
  private sprites: Phaser.GameObjects.Sprite[] = []
  private nameTags: Phaser.GameObjects.Text[] = []
  /** 迷雾粒子（锁定建筑的雾气，需随场景销毁） */
  private mistParticles: Phaser.GameObjects.Arc[] = []
  private lockedCount = 0

  constructor(scene: Phaser.Scene) {
    this.scene = scene
  }

  renderAll(): void {
    this.destroyAll()
    for (const def of TOWN_BUILDINGS) {
      this.renderBuilding(def)
    }
    console.log(`[TownBuildingRenderer v3] Rendered ${this.sprites.length} town buildings (${this.lockedCount} locked by story)`)
  }

  destroyAll(): void {
    for (const s of this.sprites) s.destroy()
    for (const t of this.nameTags) t.destroy()
    for (const m of this.mistParticles) m.destroy()
    this.sprites = []
    this.nameTags = []
    this.mistParticles = []
    this.lockedCount = 0
  }

  private renderBuilding(def: TownBuildingDef): void {
    const visual = BUILDING_VISUALS[def.id]
    if (!visual) return

    const unlocked = isSceneUnlocked(def.sceneId)
    if (!unlocked) this.lockedCount++

    // v4：优先使用 AI 生成素材（PreloadScene 已加载 town-building-{id}），回退程序化绘制
    const assetKey = `town-building-${def.id}`
    const useAsset = this.scene.textures.exists(assetKey)

    const textureKey = useAsset ? assetKey : this.generateBuildingTexture(def.id, visual.width, visual.height)
    if (!textureKey) return

    const cx = (def.tileX + def.tileW / 2) * TILE_SIZE
    const bottomY = (def.tileY + def.tileH) * TILE_SIZE

    let sprite: Phaser.GameObjects.Sprite
    if (useAsset) {
      // AI 素材：按原图尺寸放置，底部对齐建筑区域底边
      const tex = this.scene.textures.get(assetKey)
      const sh = tex.getSourceImage().height
      sprite = this.scene.add.sprite(cx, bottomY - sh / 2, assetKey)
      sprite.setOrigin(0.5, 0.5)
    } else {
      sprite = this.scene.add.sprite(cx, bottomY - visual.height / 2, textureKey)
      sprite.setOrigin(0.5, 0.5)
    }
    // 深度 = 建筑底部世界Y + 90：玩家在建筑前(下方)显示在前，绕到建筑后(上方)被建筑遮挡
    sprite.setDepth(bottomY + 90)

    if (!unlocked) {
      sprite.setAlpha(0.35)
      sprite.setTint(0x3a3a4a)
      this.addLockedMist(def, visual)
    }

    this.sprites.push(sprite)

    const topY = bottomY - (useAsset ? sprite.height : visual.height)
    const nameTag = this.scene.add.text(cx, topY - 26, unlocked ? def.name : '？？？', {
      fontSize: FONT_SIZE.SM,
      color: unlocked ? '#ffe9b0' : '#9a9aa8',
      fontFamily: FONT_TITLE,
      backgroundColor: unlocked ? 'rgba(61,40,23,0.9)' : 'rgba(30,30,40,0.85)',
      padding: { x: 14, y: 6 },
    })
    nameTag.setOrigin(0.5, 1)
    nameTag.setDepth(bottomY + 95)
    nameTag.setStroke(unlocked ? '#3d2817' : '#22222a', 5)

    this.nameTags.push(nameTag)
  }

  private addLockedMist(def: TownBuildingDef, visual: BuildingVisualConfig): void {
    const cx = (def.tileX + def.tileW / 2) * TILE_SIZE
    const cy = (def.tileY + def.tileH / 2) * TILE_SIZE

    const blobs: Array<{ ox: number; oy: number; r: number }> = [
      { ox: -visual.width * 0.22, oy: -10, r: visual.width * 0.2 },
      { ox: visual.width * 0.22, oy: 14, r: visual.width * 0.22 },
      { ox: 0, oy: -30, r: visual.width * 0.26 },
    ]

    for (const b of blobs) {
      const mist = this.scene.add.circle(cx + b.ox, cy + b.oy, b.r, 0xffffff, 0.12)
      mist.setDepth((def.tileY + def.tileH) * TILE_SIZE + 88)
      this.scene.tweens.add({
        targets: mist,
        x: cx + b.ox + 14,
        alpha: 0.06,
        duration: 2600 + Math.random() * 1400,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      })
      this.mistParticles.push(mist)
    }
  }

  // =============================================
  // 纹理生成入口
  // =============================================

  private generateBuildingTexture(type: TownBuildingType, width: number, height: number): string | null {
    const key = `town_building_${type}`
    if (this.scene.textures.exists(key)) return key

    const texture = this.scene.textures.createCanvas(key, width, height)
    if (!texture) return null
    const ctx = texture.getContext()
    if (!ctx) return null

    ctx.clearRect(0, 0, width, height)

    switch (type) {
      case 'blacksmith': this.drawBlacksmith(ctx, width, height); break
      case 'alchemist': this.drawAlchemist(ctx, width, height); break
      case 'tavern': this.drawTavern(ctx, width, height); break
      case 'market': this.drawMarket(ctx, width, height); break
      case 'elder_hall': this.drawElderHall(ctx, width, height); break
      case 'residential': this.drawResidential(ctx, width, height); break
      case 'forest_gate': this.drawForestGate(ctx, width, height); break
      case 'mine_entrance': this.drawMineEntrance(ctx, width, height); break
    }

    texture.refresh()
    return key
  }

  // ============================================================
  // v3 立体零件库 — 通用工具（子图拼接的基础积木）
  // ============================================================

  /** 地面投影 — 东南方向的椭圆投影，让建筑"压"在地上 */
  private drawGroundShadow(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    extraW = 1.06,
    squash = 0.14,
    offsetX = 18,
  ): void {
    const cx = w / 2 + offsetX
    const sw = w * extraW
    const sh = h * squash
    const gy = h - sh * 0.32
    const grad = ctx.createRadialGradient(cx, gy, sh * 0.15, cx, gy, sw / 2)
    grad.addColorStop(0, 'rgba(4,3,2,0.62)')
    grad.addColorStop(0.55, 'rgba(4,3,2,0.34)')
    grad.addColorStop(1, 'rgba(4,3,2,0)')
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.ellipse(cx, gy, sw / 2, sh, 0, 0, Math.PI * 2)
    ctx.fill()
  }

  /**
   * 等距双坡屋顶（v3 核心立体件）
   * 屋脊在顶部，左坡受光亮、右坡背光阴，屋檐带厚度并投影到墙体
   */
  private drawIsoRoof(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    roofColor: number,
    ridgeY: number,
    opts: {
      eavesOverhang?: number   // 屋檐外伸量
      thickness?: number       // 屋檐厚度
      ridgeCap?: number        // 屋脊端装饰色（0=无）
      gable?: boolean          // 山墙样式（正面山墙+两侧坡）
      tiles?: boolean          // 瓦片纹理
      thatch?: boolean         // 茅草纹理
      offsetX?: number         // 屋顶中心偏移（组合建筑用）
      roofW?: number           // 屋顶宽度（默认全宽）
      eavesY?: number          // 屋檐高度（默认 h*0.46）
    } = {},
  ): void {
    const cx = w / 2 + (opts.offsetX ?? 0)
    const roofW = opts.roofW ?? w
    const eavesY = opts.eavesY ?? h * 0.46
    const over = opts.eavesOverhang ?? 26
    const thick = opts.thickness ?? 16

    const light = shadeHex(roofColor, 1.16)
    const mid = toHex(roofColor)
    const dark = shadeHex(roofColor, 0.62)
    const darkest = shadeHex(roofColor, 0.46)

    if (opts.gable) {
      // ===== 山墙屋顶：正面能看到山墙（三角）+ 两侧坡面 =====
      // 屋顶厚度（背板）
      ctx.fillStyle = darkest
      ctx.beginPath()
      ctx.moveTo(cx - roofW / 2 - over, eavesY + thick)
      ctx.lineTo(cx, ridgeY + thick)
      ctx.lineTo(cx + roofW / 2 + over, eavesY + thick)
      ctx.closePath()
      ctx.fill()
      // 左坡（受光）
      ctx.fillStyle = light
      ctx.beginPath()
      ctx.moveTo(cx - roofW / 2 - over, eavesY)
      ctx.lineTo(cx, ridgeY)
      ctx.lineTo(cx + 6, ridgeY)
      ctx.lineTo(cx - roofW / 2 - over + 6, eavesY)
      ctx.closePath()
      ctx.fill()
      // 右坡（背光）
      ctx.fillStyle = dark
      ctx.beginPath()
      ctx.moveTo(cx + roofW / 2 + over, eavesY)
      ctx.lineTo(cx, ridgeY)
      ctx.lineTo(cx + 6, ridgeY)
      ctx.lineTo(cx + roofW / 2 + over - 6, eavesY)
      ctx.closePath()
      ctx.fill()
      // 左坡受光带
      const lGrad = ctx.createLinearGradient(cx - roofW / 2 - over, 0, cx, 0)
      lGrad.addColorStop(0, 'rgba(255,245,210,0.3)')
      lGrad.addColorStop(1, 'rgba(255,245,210,0)')
      ctx.fillStyle = lGrad
      ctx.beginPath()
      ctx.moveTo(cx - roofW / 2 - over, eavesY)
      ctx.lineTo(cx, ridgeY)
      ctx.lineTo(cx - roofW / 2 - over + 30, ridgeY + (eavesY - ridgeY) * 0.4)
      ctx.closePath()
      ctx.fill()
      // 屋檐厚度（前檐）
      ctx.fillStyle = dark
      ctx.beginPath()
      ctx.moveTo(cx - roofW / 2 - over, eavesY)
      ctx.lineTo(cx - roofW / 2 - over + 8, eavesY + thick)
      ctx.lineTo(cx + roofW / 2 + over - 8, eavesY + thick)
      ctx.lineTo(cx + roofW / 2 + over, eavesY)
      ctx.closePath()
      ctx.fill()
      ctx.fillStyle = mid
      ctx.fillRect(cx - roofW / 2 - over + 6, eavesY + thick - 5, roofW + over * 2 - 12, 5)
    } else {
      // ===== 标准双坡（侧面看不到山墙） =====
      // 屋顶厚度
      ctx.fillStyle = darkest
      ctx.beginPath()
      ctx.moveTo(cx - roofW / 2 - over, eavesY + thick)
      ctx.lineTo(cx, ridgeY + thick)
      ctx.lineTo(cx + roofW / 2 + over, eavesY + thick)
      ctx.closePath()
      ctx.fill()
      // 左坡（受光）
      ctx.fillStyle = light
      ctx.beginPath()
      ctx.moveTo(cx - roofW / 2 - over, eavesY)
      ctx.lineTo(cx, ridgeY)
      ctx.lineTo(cx + roofW / 2 + over, eavesY)
      ctx.closePath()
      ctx.fill()
      // 左坡渐变
      const grad = ctx.createLinearGradient(cx - roofW / 2 - over, 0, cx + roofW / 2 + over, 0)
      grad.addColorStop(0, 'rgba(255,245,210,0.28)')
      grad.addColorStop(0.45, 'rgba(255,245,210,0.02)')
      grad.addColorStop(0.6, 'rgba(0,0,0,0.05)')
      grad.addColorStop(1, 'rgba(0,0,0,0.26)')
      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.moveTo(cx - roofW / 2 - over, eavesY)
      ctx.lineTo(cx, ridgeY)
      ctx.lineTo(cx + roofW / 2 + over, eavesY)
      ctx.closePath()
      ctx.fill()
      // 屋檐厚度
      ctx.fillStyle = dark
      ctx.beginPath()
      ctx.moveTo(cx - roofW / 2 - over, eavesY)
      ctx.lineTo(cx - roofW / 2 - over + 8, eavesY + thick)
      ctx.lineTo(cx + roofW / 2 + over - 8, eavesY + thick)
      ctx.lineTo(cx + roofW / 2 + over, eavesY)
      ctx.closePath()
      ctx.fill()
    }

    // 屋檐投影到墙
    ctx.fillStyle = 'rgba(0,0,0,0.3)'
    ctx.fillRect(cx - roofW / 2 - over, eavesY + thick, roofW + over * 2, 12)

    // 瓦片纹理（叠瓦横纹 + 竖缝）
    if (opts.tiles) {
      const steps = 6
      const rnd = seededRand(roofColor)
      for (let i = 1; i <= steps; i++) {
        const t = i / steps
        const y = ridgeY + (eavesY - ridgeY) * t
        const halfW = (roofW / 2 + over) * t + 4
        ctx.fillStyle = i % 2 === 0 ? 'rgba(0,0,0,0.16)' : 'rgba(255,255,255,0.07)'
        ctx.fillRect(cx - halfW, y - 2, halfW * 2, 4)
      }
      ctx.strokeStyle = 'rgba(0,0,0,0.1)'
      ctx.lineWidth = 2
      for (let i = 1; i <= steps; i++) {
        const t = i / steps
        const y = ridgeY + (eavesY - ridgeY) * t
        const halfW = (roofW / 2 + over) * t + 4
        const seg = 34
        for (let x = cx - halfW + seg / 2; x < cx + halfW; x += seg) {
          if (rnd() > 0.45) continue
          ctx.beginPath()
          ctx.moveTo(x, y - 3)
          ctx.lineTo(x, Math.min(y + 8, eavesY))
          ctx.stroke()
        }
      }
    }

    // 茅草纹理（横排堆叠 + 草尖）
    if (opts.thatch) {
      const steps = 8
      for (let i = 1; i <= steps; i++) {
        const t = i / steps
        const y = ridgeY + (eavesY - ridgeY) * t
        const halfW = (roofW / 2 + over) * t + 4
        ctx.fillStyle = i % 2 === 0 ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.08)'
        ctx.fillRect(cx - halfW, y - 3, halfW * 2, 6)
        // 草尖锯齿
        ctx.fillStyle = i % 2 === 0 ? shadeHex(roofColor, 1.08) : shadeHex(roofColor, 0.7)
        for (let x = cx - halfW + 8; x < cx + halfW - 4; x += 14) {
          ctx.beginPath()
          ctx.moveTo(x, y + 4)
          ctx.lineTo(x + 5, y - 2)
          ctx.lineTo(x + 10, y + 4)
          ctx.closePath()
          ctx.fill()
        }
      }
    }

    // 屋脊高光
    ctx.strokeStyle = 'rgba(255,255,255,0.4)'
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.moveTo(cx - roofW / 2 - over + 6, ridgeY + 4)
    ctx.lineTo(cx + roofW / 2 + over - 6, ridgeY + 4)
    ctx.stroke()

    // 屋脊端装饰（金色圆珠/兽头）
    if (opts.ridgeCap) {
      ctx.fillStyle = toHex(opts.ridgeCap)
      ctx.beginPath()
      ctx.arc(cx - roofW / 2 - over + 6, ridgeY + 4, 6, 0, Math.PI * 2)
      ctx.fill()
      ctx.beginPath()
      ctx.arc(cx + roofW / 2 + over - 6, ridgeY + 4, 6, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = 'rgba(255,255,255,0.45)'
      ctx.beginPath()
      ctx.arc(cx - roofW / 2 - over + 5, ridgeY + 3, 2.5, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  /**
   * 主体墙体（v3 核心立体件）— 正立面(南) + 左右侧立面(暗斜边) + 受光
   */
  private drawBody(
    ctx: CanvasRenderingContext2D,
    w: number,
    _h: number,
    wallTop: number,
    wallBottom: number,
    wallColor: number,
    material: 'brick' | 'stone' | 'plank' | 'timber' | 'plaster' | 'castle',
    sideDepth = 26,
    bodyX = 0,
    bodyW = w,
  ): void {
    const bodyTop = wallTop
    const bodyH = wallBottom - wallTop
    const x0 = bodyX
    const x1 = bodyX + bodyW

    // ---- 左侧立面（暗，受光较弱）----
    ctx.fillStyle = shadeHex(wallColor, 0.7)
    ctx.fillRect(x0, bodyTop, sideDepth, bodyH)
    ctx.fillStyle = shadeHex(wallColor, 0.82)
    ctx.fillRect(x0 + sideDepth - 8, bodyTop, 8, bodyH)

    // ---- 右侧立面（更暗）----
    ctx.fillStyle = shadeHex(wallColor, 0.5)
    ctx.fillRect(x1 - sideDepth, bodyTop, sideDepth, bodyH)
    ctx.fillStyle = shadeHex(wallColor, 0.62)
    ctx.fillRect(x1 - sideDepth, bodyTop, 8, bodyH)

    // ---- 正立面 ----
    ctx.fillStyle = toHex(wallColor)
    ctx.fillRect(x0 + sideDepth, bodyTop, bodyW - sideDepth * 2, bodyH)

    // 材质细节
    const rnd = seededRand(wallColor)
    if (material === 'brick') {
      // 砖块错缝
      const rowH = 26
      ctx.fillStyle = 'rgba(0,0,0,0.28)'
      for (let row = 0; bodyTop + row * rowH < wallBottom - 4; row++) {
        const y = bodyTop + row * rowH
        ctx.fillRect(x0 + sideDepth, y, bodyW - sideDepth * 2, 3)
        const even = row % 2 === 0
        let x = x0 + sideDepth
        while (x < x1 - sideDepth - 2) {
          const bw = 44 + Math.round(rnd() * 18)
          ctx.fillStyle = shadeHex(wallColor, 0.94 + rnd() * 0.12)
          ctx.fillRect(x + (even ? 0 : bw / 2), y + 3, bw, rowH - 3)
          x += bw
        }
        ctx.fillStyle = 'rgba(0,0,0,0.28)'
      }
    } else if (material === 'stone') {
      const rowH = 30
      ctx.fillStyle = 'rgba(15,15,20,0.35)'
      for (let row = 0; bodyTop + row * rowH < wallBottom - 4; row++) {
        const y = bodyTop + row * rowH
        ctx.fillRect(x0 + sideDepth, y, bodyW - sideDepth * 2, 3)
        const even = row % 2 === 0
        let x = x0 + sideDepth
        while (x < x1 - sideDepth - 2) {
          const sw = 40 + Math.round(rnd() * 30)
          ctx.fillStyle = shadeHex(wallColor, 0.9 + rnd() * 0.2)
          ctx.fillRect(x + (even ? 0 : sw / 2), y + 3 + Math.round(rnd() * 2), sw, rowH - 5)
          x += sw
        }
        ctx.fillStyle = 'rgba(15,15,20,0.35)'
      }
      // 石块高光
      ctx.fillStyle = 'rgba(255,255,255,0.08)'
      for (let i = 0; i < 10; i++) {
        ctx.fillRect(x0 + sideDepth + 10 + rnd() * (bodyW - sideDepth * 2 - 30), bodyTop + 8 + rnd() * (bodyH - 24), 12, 4)
      }
    } else if (material === 'plank') {
      // 竖板
      ctx.strokeStyle = 'rgba(0,0,0,0.28)'
      ctx.lineWidth = 2
      for (let x = x0 + sideDepth + 14; x < x1 - sideDepth - 4; x += 24) {
        ctx.beginPath()
        ctx.moveTo(x, bodyTop)
        ctx.lineTo(x, wallBottom)
        ctx.stroke()
      }
      // 横梁
      ctx.fillStyle = shadeHex(wallColor, 0.72)
      for (let y = bodyTop + 40; y < wallBottom - 10; y += 50) {
        ctx.fillRect(x0 + sideDepth, y, bodyW - sideDepth * 2, 8)
      }
      // 木节
      for (let i = 0; i < 7; i++) {
        const kx = x0 + sideDepth + 16 + Math.round(rnd() * (bodyW - sideDepth * 2 - 40))
        const ky = bodyTop + 14 + Math.round(rnd() * (bodyH - 40))
        ctx.fillStyle = 'rgba(0,0,0,0.16)'
        ctx.beginPath()
        ctx.ellipse(kx, ky, 4, 3, 0, 0, Math.PI * 2)
        ctx.fill()
      }
    } else if (material === 'timber') {
      // 都铎木梁（米白墙 + 深木梁）
      ctx.fillStyle = toHex(0xd8c8a8)
      ctx.fillRect(x0 + sideDepth, bodyTop, bodyW - sideDepth * 2, bodyH)
      ctx.fillStyle = toHex(0x4a2c14)
      ctx.fillRect(x0 + sideDepth, bodyTop, bodyW - sideDepth * 2, 10) // 顶梁
      for (let x = x0 + sideDepth + 34; x < x1 - sideDepth - 14; x += 50) {
        ctx.fillRect(x, bodyTop, 10, bodyH)
      }
      // 斜撑
      ctx.strokeStyle = toHex(0x4a2c14)
      ctx.lineWidth = 8
      for (let x = x0 + sideDepth + 56; x < x1 - sideDepth - 40; x += 50) {
        ctx.beginPath()
        ctx.moveTo(x, bodyTop + 8)
        ctx.lineTo(x + 22, bodyTop + 40)
        ctx.moveTo(x + 22, bodyTop + 8)
        ctx.lineTo(x, bodyTop + 40)
        ctx.stroke()
      }
    } else if (material === 'castle') {
      // 城堡大石（横缝 + 大块）
      ctx.fillStyle = 'rgba(20,20,32,0.4)'
      for (let row = 0; bodyTop + row * 32 < wallBottom - 4; row++) {
        const y = bodyTop + row * 32
        ctx.fillRect(x0 + sideDepth, y, bodyW - sideDepth * 2, 4)
      }
      ctx.strokeStyle = 'rgba(20,20,32,0.3)'
      ctx.lineWidth = 2
      for (let row = 0; bodyTop + row * 32 < wallBottom - 4; row++) {
        const y = bodyTop + row * 32
        let x = x0 + sideDepth + 16
        while (x < x1 - sideDepth - 4) {
          ctx.beginPath()
          ctx.moveTo(x, y)
          ctx.lineTo(x, y + 32)
          ctx.stroke()
          x += 52 + rnd() * 24
        }
      }
    }

    // ---- 正立面受光（左上光源）----
    const grad = ctx.createLinearGradient(x0, 0, x1, 0)
    grad.addColorStop(0, 'rgba(255,242,205,0.22)')
    grad.addColorStop(0.3, 'rgba(255,242,205,0.05)')
    grad.addColorStop(0.72, 'rgba(0,0,0,0)')
    grad.addColorStop(1, 'rgba(0,0,0,0.2)')
    ctx.fillStyle = grad
    ctx.fillRect(x0 + sideDepth, bodyTop, bodyW - sideDepth * 2, bodyH)

    // 侧立面受光（左立面受光更多）
    ctx.fillStyle = 'rgba(255,242,205,0.14)'
    ctx.fillRect(x0, bodyTop, 10, bodyH)

    // 墙脚阴影
    ctx.fillStyle = 'rgba(0,0,0,0.22)'
    ctx.fillRect(x0, wallBottom - 18, bodyW, 14)
  }

  /**
   * 底座平台（等距基座）— 顶面亮 + 前侧中 + 侧暗，建筑"坐在"基座上
   */
  private drawPlinth(
    ctx: CanvasRenderingContext2D,
    w: number,
    _h: number,
    baseY: number,
    color = 0x6a5a4a,
    topH = 10,
    sideH = 14,
  ): void {
    // 顶面（受光）
    ctx.fillStyle = toHex(color)
    ctx.fillRect(6, baseY - topH, w - 12, topH)
    ctx.fillStyle = 'rgba(255,245,210,0.18)'
    ctx.fillRect(6, baseY - topH, 26, topH)
    // 前侧面（中）
    ctx.fillStyle = shadeHex(color, 0.72)
    ctx.fillRect(2, baseY, w - 4, sideH)
    ctx.fillStyle = 'rgba(0,0,0,0.14)'
    ctx.fillRect(2, baseY, w - 4, 4)
    // 左侧面（较亮）
    ctx.fillStyle = shadeHex(color, 0.88)
    ctx.fillRect(0, baseY - topH + 2, 6, topH + sideH - 2)
    // 右侧面（暗）
    ctx.fillStyle = shadeHex(color, 0.56)
    ctx.fillRect(w - 6, baseY - topH + 2, 6, topH + sideH - 2)
    // 底部阴影
    ctx.fillStyle = 'rgba(0,0,0,0.32)'
    ctx.fillRect(2, baseY + sideH, w - 4, 7)
  }

  /** 烟囱（立体：塔身 + 帽檐 + 明暗面 + 炊烟） */
  private drawChimney(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    color = 0x6a5a52,
    smoke = true,
  ): void {
    ctx.fillStyle = toHex(color)
    ctx.fillRect(x, y, w, h)
    // 左受光 / 右背光
    ctx.fillStyle = 'rgba(255,240,200,0.18)'
    ctx.fillRect(x, y, w * 0.38, h)
    ctx.fillStyle = 'rgba(0,0,0,0.2)'
    ctx.fillRect(x + w - 6, y, 6, h)
    // 砖缝
    ctx.fillStyle = 'rgba(0,0,0,0.25)'
    for (let yy = y + 10; yy < y + h - 4; yy += 13) {
      ctx.fillRect(x, yy, w, 3)
    }
    // 帽檐（立体：顶面+沿）
    ctx.fillStyle = shadeHex(color, 0.82)
    ctx.fillRect(x - 6, y - 5, w + 12, 6)
    ctx.fillStyle = shadeHex(color, 0.6)
    ctx.fillRect(x - 6, y + 1, w + 12, 5)
    ctx.fillStyle = 'rgba(255,255,255,0.16)'
    ctx.fillRect(x - 6, y - 5, w + 4, 3)

    if (smoke) {
      const rnd = seededRand(x * 31 + y)
      for (let i = 0; i < 4; i++) {
        const ox = rnd() * 16 - 8
        const oy = -9 - i * 13 - rnd() * 5
        const r = 8 + i * 3
        ctx.fillStyle = `rgba(226,226,226,${0.34 - i * 0.05})`
        ctx.beginPath()
        ctx.arc(x + w / 2 + ox, y + oy, r, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }

  /** 窗（立体窗套：外框凸出 + 玻璃 + 窗台 + 高光，可选花箱） */
  private drawWindow(
    ctx: CanvasRenderingContext2D,
    x: number, y: number, w: number, h: number,
    glow: number,
    flowerBox = false,
  ): void {
    // 外框（凸出立体）
    ctx.fillStyle = 'rgba(38,24,12,0.95)'
    ctx.fillRect(x - 7, y - 7, w + 14, h + 14)
    ctx.fillStyle = 'rgba(0,0,0,0.25)'
    ctx.fillRect(x - 7, y - 4, 5, h + 10)
    ctx.fillRect(x - 4, y + h + 2, w + 8, 5)
    // 玻璃
    const grad = ctx.createLinearGradient(0, y, 0, y + h)
    grad.addColorStop(0, toHex(glow))
    grad.addColorStop(1, shadeHex(glow, 0.5))
    ctx.fillStyle = grad
    ctx.fillRect(x, y, w, h)
    // 玻璃高光（左上）
    ctx.fillStyle = 'rgba(255,255,255,0.3)'
    ctx.fillRect(x + 2, y + 2, w * 0.34, 5)
    ctx.fillStyle = 'rgba(255,255,255,0.12)'
    ctx.fillRect(x + 2, y + 10, w * 0.2, 4)
    // 光晕
    ctx.fillStyle = 'rgba(255,222,150,0.16)'
    ctx.fillRect(x - 10, y - 10, w + 20, h + 20)
    // 十字框
    ctx.strokeStyle = 'rgba(38,24,12,0.92)'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(x + w / 2, y)
    ctx.lineTo(x + w / 2, y + h)
    ctx.moveTo(x, y + h / 2)
    ctx.lineTo(x + w, y + h / 2)
    ctx.stroke()
    // 窗台
    ctx.fillStyle = toHex(0x4a2c14)
    ctx.fillRect(x - 8, y + h + 1, w + 16, 7)
    ctx.fillStyle = 'rgba(0,0,0,0.3)'
    ctx.fillRect(x - 8, y + h + 8, w + 16, 4)

    if (flowerBox) {
      ctx.fillStyle = toHex(0x5a3a20)
      ctx.fillRect(x - 8, y + h - 3, w + 16, 12)
      const cols = 3
      for (let i = 0; i < cols; i++) {
        const fx = x + 6 + i * ((w - 8) / (cols - 1))
        ctx.fillStyle = toHex(i % 2 === 0 ? 0xff6699 : 0xffd94a)
        ctx.fillRect(fx - 3, y + h - 8, 6, 6)
        ctx.fillStyle = toHex(0x2d6a2d)
        ctx.fillRect(fx, y + h - 5, 3, 5)
      }
      ctx.fillStyle = 'rgba(0,0,0,0.2)'
      ctx.fillRect(x - 8, y + h + 9, w + 16, 3)
    }
  }

  /** 圆窗（塔/阁楼用，带辐条） */
  private drawRoundWindow(
    ctx: CanvasRenderingContext2D,
    cx: number, cy: number, r: number,
    glow: number,
  ): void {
    ctx.fillStyle = 'rgba(38,24,12,0.95)'
    ctx.beginPath()
    ctx.arc(cx, cy, r + 6, 0, Math.PI * 2)
    ctx.fill()
    const grad = ctx.createRadialGradient(cx, cy, 2, cx, cy, r)
    grad.addColorStop(0, toHex(glow))
    grad.addColorStop(1, shadeHex(glow, 0.6))
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,0.28)'
    ctx.beginPath()
    ctx.arc(cx - r * 0.3, cy - r * 0.3, r * 0.25, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = 'rgba(38,24,12,0.92)'
    ctx.lineWidth = 3
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 4
      ctx.beginPath()
      ctx.moveTo(cx - Math.cos(a) * r, cy - Math.sin(a) * r)
      ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r)
      ctx.stroke()
    }
    ctx.fillStyle = toHex(0x4a2c14)
    ctx.fillRect(cx - r - 7, cy + r - 2, (r + 7) * 2, 7)
  }

  /** 双开木门（立体门洞 + 门板 + 门环 + 门楣 + 台阶） */
  private drawDoor(
    ctx: CanvasRenderingContext2D,
    cx: number,
    bottomY: number,
    w: number, h: number,
    arch = false,
  ): void {
    // 门洞纵深
    const holeGrad = ctx.createLinearGradient(0, bottomY - h, 0, bottomY)
    holeGrad.addColorStop(0, 'rgba(14,8,4,0.98)')
    holeGrad.addColorStop(1, 'rgba(4,2,1,1)')
    ctx.fillStyle = holeGrad
    if (arch) {
      ctx.beginPath()
      ctx.arc(cx, bottomY - h + w / 2, w / 2 + 10, Math.PI, 0)
      ctx.fillRect(cx - w / 2 - 10, bottomY - h + w / 2, w + 20, h - w / 2 + 8)
      ctx.fill()
    } else {
      ctx.fillRect(cx - w / 2 - 10, bottomY - h - 8, w + 20, h + 8)
    }
    // 门板
    ctx.fillStyle = toHex(0x6b4423)
    if (arch) {
      ctx.beginPath()
      ctx.arc(cx, bottomY - h + w / 2, w / 2, Math.PI, 0)
      ctx.fillRect(cx - w / 2, bottomY - h + w / 2, w, h - w / 2)
      ctx.fill()
    } else {
      ctx.fillRect(cx - w / 2, bottomY - h, w, h)
    }
    // 门板受光
    ctx.fillStyle = 'rgba(255,230,180,0.14)'
    if (arch) {
      ctx.fillRect(cx - w / 2, bottomY - h + w / 2, w * 0.3, h - w / 2)
    } else {
      ctx.fillRect(cx - w / 2, bottomY - h, w * 0.3, h)
    }
    // 竖缝（双开门）
    ctx.strokeStyle = 'rgba(40,25,12,0.9)'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(cx, bottomY - h)
    ctx.lineTo(cx, bottomY)
    ctx.stroke()
    // 横板
    ctx.strokeStyle = 'rgba(40,25,12,0.5)'
    ctx.lineWidth = 2
    for (let yy = bottomY - h + 18; yy < bottomY - 8; yy += 22) {
      ctx.beginPath()
      ctx.moveTo(cx - w / 2 + 4, yy)
      ctx.lineTo(cx + w / 2 - 4, yy)
      ctx.stroke()
    }
    // 门环
    ctx.fillStyle = toHex(0xffd94a)
    ctx.fillRect(cx - w / 4 - 4, bottomY - h * 0.55, 8, 8)
    ctx.fillRect(cx + w / 4 - 4, bottomY - h * 0.55, 8, 8)
    ctx.fillStyle = toHex(0xcc9a2a)
    ctx.fillRect(cx - w / 4 - 2, bottomY - h * 0.55 + 2, 4, 4)
    ctx.fillRect(cx + w / 4 - 2, bottomY - h * 0.55 + 2, 4, 4)
    // 门楣横梁
    ctx.fillStyle = toHex(0x4a2c14)
    ctx.fillRect(cx - w / 2 - 14, bottomY - h - 18, w + 28, 12)
    ctx.fillStyle = 'rgba(0,0,0,0.38)'
    ctx.fillRect(cx - w / 2 - 14, bottomY - h - 6, w + 28, 5)
    // 台阶（两级立体）
    ctx.fillStyle = toHex(0x9a9aa4)
    ctx.fillRect(cx - w / 2 - 18, bottomY - 4, w + 36, 9)
    ctx.fillStyle = 'rgba(255,240,210,0.18)'
    ctx.fillRect(cx - w / 2 - 18, bottomY - 4, w + 36, 3)
    ctx.fillStyle = toHex(0x7a7a84)
    ctx.fillRect(cx - w / 2 - 24, bottomY + 5, w + 48, 8)
    ctx.fillStyle = 'rgba(0,0,0,0.34)'
    ctx.fillRect(cx - w / 2 - 26, bottomY + 13, w + 52, 6)
  }

  /** 木招牌（挂杆式立体牌） */
  private drawHangingSign(
    ctx: CanvasRenderingContext2D,
    cx: number, y: number,
    bg: number,
    icon?: (ctx: CanvasRenderingContext2D, ix: number, iy: number, s: number) => void,
  ): void {
    ctx.fillStyle = toHex(0x4a2c14)
    ctx.fillRect(cx - 3, y - 26, 6, 30)
    ctx.fillStyle = toHex(0x3d2817)
    ctx.fillRect(cx - 46, y - 8, 92, 34)
    ctx.fillStyle = toHex(bg)
    ctx.fillRect(cx - 40, y - 4, 80, 26)
    // 牌体受光
    ctx.fillStyle = 'rgba(255,240,200,0.14)'
    ctx.fillRect(cx - 40, y - 4, 22, 26)
    ctx.fillStyle = toHex(0xffd94a)
    ctx.fillRect(cx - 4, y - 24, 8, 6)
    if (icon) {
      icon(ctx, cx, y + 9, 10)
    }
    ctx.fillStyle = 'rgba(0,0,0,0.3)'
    ctx.fillRect(cx - 46, y + 28, 92, 5)
  }

  /** 灯笼（挂杆式立体发光） */
  private drawLantern(
    ctx: CanvasRenderingContext2D,
    x: number, y: number,
    warm = true,
  ): void {
    const core = warm ? 0xffdd66 : 0x66ddff
    ctx.fillStyle = toHex(0x4a2c14)
    ctx.fillRect(x - 2, y - 20, 4, 22)
    ctx.fillStyle = toHex(0x6b4a1a)
    ctx.fillRect(x - 7, y - 6, 14, 16)
    ctx.fillStyle = toHex(core)
    ctx.fillRect(x - 4, y - 4, 8, 12)
    ctx.fillStyle = 'rgba(255,255,255,0.5)'
    ctx.fillRect(x - 4, y - 4, 8, 3)
    ctx.fillStyle = warm ? 'rgba(255,220,120,0.3)' : 'rgba(120,220,255,0.3)'
    ctx.fillRect(x - 12, y - 12, 24, 26)
  }

  /** 酒桶（立体圆桶） */
  private drawBarrel(
    ctx: CanvasRenderingContext2D,
    x: number, y: number, w: number, h: number,
  ): void {
    ctx.fillStyle = toHex(0x7a5230)
    ctx.beginPath()
    ctx.moveTo(x + w * 0.12, y)
    ctx.quadraticCurveTo(x, y + h / 2, x + w * 0.12, y + h)
    ctx.lineTo(x + w * 0.88, y + h)
    ctx.quadraticCurveTo(x + w, y + h / 2, x + w * 0.88, y)
    ctx.closePath()
    ctx.fill()
    // 木箍（立体）
    ctx.fillStyle = shadeHex(0x4a2c14, 1.18)
    ctx.fillRect(x + w * 0.1, y + h * 0.28, w * 0.8, 6)
    ctx.fillRect(x + w * 0.1, y + h * 0.64, w * 0.8, 6)
    ctx.fillStyle = 'rgba(0,0,0,0.2)'
    ctx.fillRect(x + w * 0.1, y + h * 0.28 + 4, w * 0.8, 2)
    // 受光
    ctx.fillStyle = 'rgba(255,230,180,0.16)'
    ctx.beginPath()
    ctx.moveTo(x + w * 0.12, y)
    ctx.quadraticCurveTo(x, y + h / 2, x + w * 0.12, y + h)
    ctx.lineTo(x + w * 0.4, y + h)
    ctx.lineTo(x + w * 0.4, y)
    ctx.closePath()
    ctx.fill()
    // 桶顶
    ctx.fillStyle = shadeHex(0x7a5230, 1.08)
    ctx.fillRect(x + w * 0.12, y - 4, w * 0.76, 5)
    ctx.fillStyle = 'rgba(255,230,180,0.12)'
    ctx.fillRect(x + w * 0.12, y - 4, w * 0.3, 5)
  }

  /** 木栅栏（立体桩） */
  private drawFence(
    ctx: CanvasRenderingContext2D,
    x: number, y: number, w: number, h: number,
    pickets: number,
  ): void {
    ctx.fillStyle = toHex(0x6b4a1a)
    ctx.fillRect(x, y + h * 0.4, w, 6)
    ctx.fillRect(x, y + h * 0.75, w, 6)
    ctx.fillStyle = 'rgba(0,0,0,0.25)'
    ctx.fillRect(x, y + h * 0.4 + 4, w, 2)
    ctx.fillRect(x, y + h * 0.75 + 4, w, 2)
    for (let i = 0; i < pickets; i++) {
      const px = x + (i * (w - 12)) / (pickets - 1)
      ctx.fillStyle = toHex(0x7a5a2a)
      ctx.fillRect(px, y, 12, h)
      ctx.fillStyle = 'rgba(255,230,180,0.14)'
      ctx.fillRect(px, y, 4, h)
      ctx.fillStyle = 'rgba(0,0,0,0.18)'
      ctx.fillRect(px + 9, y, 3, h)
      ctx.fillStyle = toHex(0x5a3a1a)
      ctx.fillRect(px, y, 12, 4)
    }
  }

  /** 火把（带火光） */
  private drawTorch(
    ctx: CanvasRenderingContext2D,
    x: number, y: number,
  ): void {
    ctx.fillStyle = toHex(0x5a3a1e)
    ctx.fillRect(x - 4, y, 8, 26)
    ctx.fillStyle = toHex(0xff8833)
    ctx.fillRect(x - 6, y - 8, 12, 12)
    ctx.fillStyle = toHex(0xffdd66)
    ctx.fillRect(x - 3, y - 6, 6, 8)
    ctx.fillStyle = 'rgba(255,160,60,0.2)'
    ctx.fillRect(x - 12, y - 16, 24, 26)
  }

  /** 旗帜（布幔 + 飘动感 + 杆） */
  private drawBanner(
    ctx: CanvasRenderingContext2D,
    x: number, y: number,
    flagColor: number,
    w = 34, h = 22,
    wave = true,
  ): void {
    ctx.fillStyle = toHex(0x5a4a3a)
    ctx.fillRect(x, y, 5, 44)
    ctx.fillStyle = toHex(flagColor)
    if (wave) {
      ctx.beginPath()
      ctx.moveTo(x + 4, y)
      ctx.lineTo(x + 4 + w, y + h * 0.3)
      ctx.lineTo(x + 4 + w, y + h)
      ctx.lineTo(x + 4, y + h)
      ctx.closePath()
      ctx.fill()
    } else {
      ctx.fillRect(x + 4, y, w, h)
    }
    // 旗面受光 + 折角
    ctx.fillStyle = 'rgba(255,255,255,0.18)'
    ctx.fillRect(x + 4, y, w * 0.3, h)
    ctx.fillStyle = 'rgba(0,0,0,0.2)'
    ctx.fillRect(x + 4 + w, y + h * 0.3, 6, h * 0.7)
    // 金边
    ctx.fillStyle = toHex(0xffd94a)
    ctx.fillRect(x + 4, y, w, 4)
  }

  // ============================================================
  // 各建筑绘制 v3（2.5D 立体 · 子图零件组合）
  // ============================================================

  /**
   * 铁砧工坊：石墙主车间（红瓦等距双坡）+ 右侧铁皮平顶附楼（熔炉火光）
   * + 大烟囱 + 铁砧招牌 + 门口铁锭堆/柴堆
   */
  private drawBlacksmith(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const groundY = h - 10
    const sideDepth = 28

    // 地面投影（先画铺底）
    this.drawGroundShadow(ctx, w, h, 1.04, 0.13, 16)

    // ---- 右侧铁皮附楼（矮，平顶，波纹铁皮）----
    const shedX = w * 0.66
    const shedTop = h * 0.5
    ctx.fillStyle = toHex(0x6a6a6a)
    ctx.fillRect(shedX, shedTop, w - shedX - 4, groundY - shedTop - 34)
    // 波纹铁皮（竖波纹）
    ctx.strokeStyle = 'rgba(0,0,0,0.32)'
    ctx.lineWidth = 4
    for (let x = shedX + 14; x < w - 10; x += 18) {
      ctx.beginPath()
      ctx.moveTo(x, shedTop)
      ctx.lineTo(x, groundY - 34)
      ctx.stroke()
    }
    ctx.fillStyle = 'rgba(255,255,255,0.1)'
    ctx.fillRect(shedX, shedTop, 10, groundY - shedTop - 34)
    // 附楼平顶（斜一点 + 侧沿厚度）
    ctx.fillStyle = toHex(0x7a7a7a)
    ctx.beginPath()
    ctx.moveTo(shedX - 8, shedTop - 10)
    ctx.lineTo(w - 2, shedTop - 10)
    ctx.lineTo(w - 8, shedTop + 8)
    ctx.lineTo(shedX - 14, shedTop + 8)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = toHex(0x5a5a5a)
    ctx.fillRect(shedX - 8, shedTop - 10, w - shedX + 6, 6)
    // 附楼烟囱（小，冒黑烟）
    ctx.fillStyle = toHex(0x4a4a4a)
    ctx.fillRect(shedX + 26, shedTop - 44, 20, 38)
    ctx.fillStyle = 'rgba(220,220,220,0.26)'
    ctx.beginPath()
    ctx.arc(shedX + 36, shedTop - 52, 8, 0, Math.PI * 2)
    ctx.fill()
    // 附楼熔炉口（橙色火光）
    ctx.fillStyle = 'rgba(16,8,4,0.96)'
    ctx.fillRect(w - 72, h * 0.62, 52, groundY - h * 0.62 - 40)
    ctx.fillStyle = toHex(0xff8833)
    ctx.fillRect(w - 64, h * 0.68, 36, 42)
    ctx.fillStyle = toHex(0xffdd44)
    ctx.fillRect(w - 56, h * 0.76, 20, 22)
    ctx.fillStyle = 'rgba(255,150,60,0.22)'
    ctx.fillRect(w - 84, h * 0.56, 76, 76)
    // 附楼侧门
    this.drawDoor(ctx, w - 96, groundY - 30, 42, 62)

    // ---- 主车间主体（砖墙 + 侧立面）----
    const wallTop = h * 0.5
    const wallBottom = groundY - 20
    this.drawBody(ctx, w, h, wallTop, wallBottom, 0x7a6a68, 'brick', sideDepth, 8, w * 0.64)

    // 主车间大烟囱（左上，立体冒烟）
    this.drawChimney(ctx, w * 0.1, h * 0.02, 34, 92, 0x7a625a, true)

    // 通风口（墙上方方格阵列，红光）
    ctx.fillStyle = 'rgba(18,8,4,0.92)'
    ctx.fillRect(w * 0.2, h * 0.56, 40, 26)
    ctx.fillStyle = 'rgba(255,200,100,0.75)'
    ctx.fillRect(w * 0.22, h * 0.58, 9, 9)
    ctx.fillRect(w * 0.34, h * 0.58, 9, 9)
    ctx.fillRect(w * 0.22, h * 0.68, 9, 9)
    ctx.fillRect(w * 0.34, h * 0.68, 9, 9)

    // 主屋窗（暖光 ×2）
    this.drawWindow(ctx, w * 0.06, h * 0.56, 50, 42, 0xffaa44)
    this.drawWindow(ctx, w * 0.4, h * 0.56, 50, 42, 0xffaa44)

    // 大门（主屋中央偏左）
    this.drawDoor(ctx, w * 0.22, wallBottom + 2, 84, 118)

    // 铁砧招牌（挂杆式）
    this.drawHangingSign(ctx, w * 0.22, h * 0.48, 0x8a8a8a, (c, ix, iy, s) => {
      c.fillStyle = toHex(0x2a2a2a)
      c.fillRect(ix - s, iy + 2, s * 2, s * 0.8)
      c.fillRect(ix - s * 0.6, iy - s * 0.4, s * 1.2, s * 0.8)
    })

    // 门口铁锭堆（立体）
    ctx.fillStyle = toHex(0x9a9aa8)
    ctx.fillRect(w * 0.34, wallBottom - 8, 26, 14)
    ctx.fillRect(w * 0.38, wallBottom - 18, 26, 14)
    ctx.fillRect(w * 0.43, wallBottom - 8, 26, 14)
    ctx.fillStyle = 'rgba(255,255,255,0.18)'
    ctx.fillRect(w * 0.34, wallBottom - 8, 26, 4)
    // 木柴堆（门左）
    ctx.fillStyle = toHex(0x5a3a1e)
    ctx.fillRect(w * 0.04, wallBottom - 24, 30, 24)
    ctx.fillRect(w * 0.08, wallBottom - 34, 30, 24)
    ctx.fillRect(w * 0.04, wallBottom - 16, 30, 12)
    ctx.fillStyle = toHex(0x7a5a3a)
    ctx.fillRect(w * 0.04, wallBottom - 24, 30, 4)

    // 主车间屋顶（红瓦等距双坡）
    this.drawIsoRoof(ctx, w, h, 0x8a3a28, h * 0.13, {
      offsetX: -26,
      roofW: w * 0.68,
      eavesY: wallTop - 14,
      tiles: true,
      eavesOverhang: 26,
      thickness: 16,
      ridgeCap: 0xccaa44,
    })

    // 顶棚横梁（车间大门上方）
    ctx.fillStyle = toHex(0x4a2c14)
    ctx.fillRect(8, wallTop - 20, w * 0.6, 8)
    ctx.fillStyle = 'rgba(0,0,0,0.3)'
    ctx.fillRect(8, wallTop - 12, w * 0.6, 4)

    // 底座平台
    this.drawPlinth(ctx, w, h, groundY - 4, 0x6a5a4a, 10, 14)

    // 地面煤渣
    const rnd = seededRand(0x1234)
    for (let i = 0; i < 22; i++) {
      ctx.fillStyle = `rgba(20,16,10,${0.12 + rnd() * 0.2})`
      ctx.fillRect(6 + rnd() * (w - 12), groundY - 12 + rnd() * 14, 5, 4)
    }
  }

  /**
   * 魔法药剂店：米白都铎主楼（紫灰瓦等距双坡）+ 右侧紫色圆塔（锥顶+星象仪）
   * + 紫光圆窗 + 药草园 + 晾药架 + 紫烟囱
   */
  private drawAlchemist(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const groundY = h - 10
    const sideDepth = 26

    this.drawGroundShadow(ctx, w, h, 1.05, 0.13, 18)

    // ---- 右侧圆塔（紫石 + 锥顶）----
    const towerCx = w * 0.82
    const towerR = 54
    const towerTop = h * 0.2
    // 塔身（圆 + 矩形）
    ctx.fillStyle = toHex(0x9a8ab0)
    ctx.beginPath()
    ctx.arc(towerCx, towerTop + towerR * 1.35, towerR, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillRect(towerCx - towerR, towerTop + towerR * 0.7, towerR * 2, groundY - towerTop - towerR * 0.7)
    // 塔身暗部（右）
    ctx.fillStyle = 'rgba(0,0,0,0.18)'
    ctx.fillRect(towerCx, towerTop + towerR * 0.7, towerR, groundY - towerTop - towerR * 0.7)
    // 石块纹理
    ctx.strokeStyle = 'rgba(40,30,60,0.35)'
    ctx.lineWidth = 3
    for (let y = towerTop + towerR * 0.8; y < groundY - 20; y += 26) {
      ctx.beginPath()
      ctx.moveTo(towerCx - towerR, y)
      ctx.lineTo(towerCx + towerR, y)
      ctx.stroke()
    }
    // 塔锥顶（紫色锥体 + 立体感）
    ctx.fillStyle = toHex(0x5a4a8a)
    ctx.beginPath()
    ctx.moveTo(towerCx - towerR - 8, towerTop + towerR * 0.7)
    ctx.lineTo(towerCx, towerTop - towerR * 0.5)
    ctx.lineTo(towerCx + towerR + 8, towerTop + towerR * 0.7)
    ctx.closePath()
    ctx.fill()
    // 锥顶受光（左亮）
    ctx.fillStyle = 'rgba(255,240,255,0.16)'
    ctx.beginPath()
    ctx.moveTo(towerCx - towerR - 8, towerTop + towerR * 0.7)
    ctx.lineTo(towerCx, towerTop - towerR * 0.5)
    ctx.lineTo(towerCx, towerTop + towerR * 0.7)
    ctx.closePath()
    ctx.fill()
    // 锥顶条纹
    ctx.strokeStyle = 'rgba(30,20,60,0.5)'
    ctx.lineWidth = 3
    for (let y = towerTop + towerR * 0.2; y < towerTop + towerR * 0.6; y += 12) {
      ctx.beginPath()
      ctx.moveTo(towerCx - (y - towerTop) * 2.2, y)
      ctx.lineTo(towerCx + (y - towerTop) * 2.2, y)
      ctx.stroke()
    }
    // 塔尖金球 + 星象仪
    ctx.fillStyle = toHex(0xffd94a)
    ctx.beginPath()
    ctx.arc(towerCx, towerTop - towerR * 0.55, 7, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = toHex(0xffd94a)
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.arc(towerCx, towerTop - towerR * 0.1, 14, 0, Math.PI * 2)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(towerCx - 14, towerTop - towerR * 0.1)
    ctx.lineTo(towerCx + 14, towerTop - towerR * 0.1)
    ctx.stroke()
    // 塔圆窗（紫光）
    this.drawRoundWindow(ctx, towerCx, h * 0.52, 22, 0xaa66dd)
    // 塔门
    this.drawDoor(ctx, towerCx, groundY, 52, 84)

    // ---- 主楼（都铎木梁墙）----
    const wallTop = h * 0.48
    const wallBottom = groundY - 18
    this.drawBody(ctx, w, h, wallTop, wallBottom, 0xd8c8a8, 'timber', sideDepth, 6, w * 0.62)

    // 主楼烟囱（冒紫烟）
    this.drawChimney(ctx, w * 0.06, h * 0.02, 30, 78, 0x6a5a7a, true)

    // 主楼窗（紫光 ×2）
    this.drawWindow(ctx, w * 0.08, h * 0.56, 52, 44, 0xaa66dd)
    this.drawWindow(ctx, w * 0.36, h * 0.56, 52, 44, 0xaa66dd)

    // 大门（主楼）
    this.drawDoor(ctx, w * 0.22, wallBottom + 2, 78, 108)

    // 药剂招牌（药瓶图标）
    this.drawHangingSign(ctx, w * 0.22, h * 0.46, 0x7a5a3a, (c, ix, iy, s) => {
      c.fillStyle = toHex(0xaa66dd)
      c.fillRect(ix - s * 0.4, iy - s * 0.5, s * 0.8, s * 1.5)
      c.fillStyle = toHex(0x6a4a9a)
      c.fillRect(ix - s * 0.5, iy + s * 1.2, s, s * 0.6)
      c.fillStyle = toHex(0x66aadd)
      c.fillRect(ix - s * 1.4, iy - s * 0.3, s * 0.5, s * 0.9)
    })

    // ---- 主屋顶（紫灰瓦等距双坡）----
    this.drawIsoRoof(ctx, w, h, 0x6a5a7a, h * 0.12, {
      offsetX: -56,
      roofW: w * 0.6,
      eavesY: wallTop - 12,
      tiles: true,
      eavesOverhang: 24,
      thickness: 15,
      ridgeCap: 0xffd94a,
    })

    // 门前药草园（围栏 + 各色药草）
    this.drawFence(ctx, w * 0.3, wallBottom - 34, w * 0.24, 36, 4)
    this.drawFence(ctx, w * 0.54, wallBottom - 34, w * 0.13, 36, 3)
    const herbs: Array<[number, number, number]> = [
      [w * 0.34, wallBottom - 26, 0xaa66dd],
      [w * 0.42, wallBottom - 24, 0x44aa44],
      [w * 0.5, wallBottom - 28, 0xffd94a],
      [w * 0.58, wallBottom - 22, 0x66aadd],
    ]
    for (const [hx, hy, hc] of herbs) {
      ctx.fillStyle = toHex(hc)
      ctx.fillRect(hx - 4, hy, 8, 12)
      ctx.fillRect(hx - 8, hy - 6, 6, 6)
      ctx.fillRect(hx + 2, hy - 8, 6, 6)
      ctx.fillStyle = toHex(0x2d6a2d)
      ctx.fillRect(hx - 2, hy + 8, 12, 8)
    }
    // 晾药架（挂瓶）
    ctx.fillStyle = toHex(0x4a2c14)
    ctx.fillRect(w * 0.5, wallBottom - 40, 40, 6)
    ctx.fillRect(w * 0.5, wallBottom - 40, 5, 28)
    ctx.fillRect(w * 0.85, wallBottom - 40, 5, 28)
    const bottleCols = [0xaa66dd, 0x66aadd, 0x66dd66]
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = toHex(bottleCols[i])
      ctx.fillRect(w * 0.53 + i * 12, wallBottom - 34, 9, 14)
      ctx.fillStyle = 'rgba(255,255,255,0.2)'
      ctx.fillRect(w * 0.53 + i * 12, wallBottom - 34, 3, 14)
    }

    // 魔法光点
    const rnd = seededRand(0xabcd)
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = `rgba(200,160,255,${0.15 + rnd() * 0.3})`
      ctx.fillRect(w * 0.1 + rnd() * w * 0.5, h * 0.06 + rnd() * h * 0.4, 4, 4)
    }

    // 底座平台
    this.drawPlinth(ctx, w, h, groundY - 2, 0x6a5a4a, 10, 14)
  }

  /**
   * 星光酒馆：都铎木梁二层（山墙阁楼）+ 石基 + 深绿瓦等距双坡
   * + 大烟囱 + 金色啤酒杯招牌 + 门口酒桶/长凳 + 灯笼 + 暖光窗
   */
  private drawTavern(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const groundY = h - 10
    const sideDepth = 26

    this.drawGroundShadow(ctx, w, h, 1.05, 0.13, 18)

    // ---- 主体墙（都铎木梁，全宽）----
    const wallTop = h * 0.46
    const wallBottom = groundY - 16
    this.drawBody(ctx, w, h, wallTop, wallBottom, 0xd8c8a8, 'timber', sideDepth)

    // ---- 二层阁楼（中央凸出，山墙样式）----
    const atticTop = h * 0.24
    const atticW = w * 0.62
    const atticX = (w - atticW) / 2
    ctx.fillStyle = toHex(0xd8c8a8)
    ctx.fillRect(atticX, atticTop, atticW, wallTop - atticTop)
    // 阁楼侧立面
    ctx.fillStyle = shadeHex(0xd8c8a8, 0.78)
    ctx.fillRect(atticX - 12, atticTop, 12, wallTop - atticTop)
    ctx.fillStyle = shadeHex(0xd8c8a8, 0.5)
    ctx.fillRect(atticX + atticW, atticTop, 12, wallTop - atticTop)
    // 阁楼木梁
    ctx.fillStyle = toHex(0x4a2c14)
    ctx.fillRect(atticX - 6, atticTop, atticW + 12, 9)
    for (let x = atticX + 40; x < atticX + atticW - 30; x += 46) {
      ctx.fillRect(x, atticTop, 9, wallTop - atticTop)
    }
    // 阁楼圆窗（暖光）
    this.drawRoundWindow(ctx, w / 2, atticTop + 40, 20, 0xffcc44)

    // ---- 主屋顶（深绿瓦等距双坡，gable 山墙效果）----
    this.drawIsoRoof(ctx, w, h, 0x3d5a3a, h * 0.1, {
      offsetX: 0,
      roofW: w * 0.78,
      eavesY: wallTop - 12,
      tiles: true,
      gable: true,
      eavesOverhang: 28,
      thickness: 16,
      ridgeCap: 0xccaa44,
    })

    // 大烟囱（中央偏左，石砖）
    this.drawChimney(ctx, w * 0.24, h * 0.06, 40, 90, 0x7a6a5a, true)

    // 一层窗（暖光 ×4）
    this.drawWindow(ctx, w * 0.06, h * 0.56, 52, 44, 0xffcc44)
    this.drawWindow(ctx, w * 0.2, h * 0.56, 52, 44, 0xffcc44)
    this.drawWindow(ctx, w * 0.6, h * 0.56, 52, 44, 0xffcc44)
    this.drawWindow(ctx, w * 0.74, h * 0.56, 52, 44, 0xffcc44)

    // 大门（中央偏左）
    this.drawDoor(ctx, w * 0.41, wallBottom + 2, 92, 126)

    // 金色招牌（门上横匾，啤酒杯）
    ctx.fillStyle = toHex(0x3d2817)
    ctx.fillRect(w * 0.41 - 78, h * 0.44, 156, 40)
    ctx.fillStyle = toHex(0xcc9a2a)
    ctx.fillRect(w * 0.41 - 72, h * 0.455, 144, 28)
    ctx.fillStyle = toHex(0xfff0c0)
    ctx.fillRect(w * 0.41 - 34, h * 0.455, 12, 16)
    ctx.fillRect(w * 0.41 - 40, h * 0.475, 24, 16)
    ctx.fillStyle = 'rgba(255,200,60,0.5)'
    ctx.fillRect(w * 0.41 - 40, h * 0.49, 24, 5)
    ctx.fillStyle = toHex(0x3d2817)
    ctx.fillRect(w * 0.41 - 2, h * 0.46, 6, 10)
    // 招牌受光
    ctx.fillStyle = 'rgba(255,240,200,0.14)'
    ctx.fillRect(w * 0.41 - 72, h * 0.455, 30, 28)

    // 门口酒桶（左）与长凳（右）
    this.drawBarrel(ctx, w * 0.22, wallBottom - 40, 40, 44)
    this.drawBarrel(ctx, w * 0.31, wallBottom - 30, 32, 34)
    ctx.fillStyle = toHex(0x6b4a1a)
    ctx.fillRect(w * 0.52, wallBottom - 16, 74, 10)
    ctx.fillRect(w * 0.54, wallBottom - 8, 8, 12)
    ctx.fillRect(w * 0.66, wallBottom - 8, 8, 12)

    // 门口灯笼
    this.drawLantern(ctx, w * 0.41 - 74, h * 0.62)
    this.drawLantern(ctx, w * 0.41 + 74, h * 0.62)

    // 路侧招牌柱（酒桶图案）
    ctx.fillStyle = toHex(0x4a2c14)
    ctx.fillRect(w * 0.93, h * 0.52, 10, groundY - h * 0.52)
    ctx.fillStyle = toHex(0x8a6a3a)
    ctx.fillRect(w * 0.86, h * 0.52, 52, 26)
    ctx.fillStyle = toHex(0xffe9b0)
    ctx.fillRect(w * 0.88, h * 0.53, 48, 4)
    ctx.fillRect(w * 0.88, h * 0.62, 48, 4)

    // 底座平台
    this.drawPlinth(ctx, w, h, groundY - 2, 0x5a4a42, 10, 14)
  }

  /**
   * 集市：红白条纹波浪大帐篷（立体篷面）+ 木柱 + 满货架 + 三角旗
   * + 中央门帘 + 门前水果摊 + 扫帚
   */
  private drawMarket(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const groundY = h * 0.8

    this.drawGroundShadow(ctx, w, h, 1.08, 0.14, 20)

    // ---- 后帆布围挡 ----
    ctx.fillStyle = toHex(0xc8b890)
    ctx.fillRect(10, h * 0.5, w - 20, groundY - h * 0.5)
    ctx.fillStyle = 'rgba(0,0,0,0.12)'
    ctx.fillRect(10, h * 0.5, w - 20, 8)
    ctx.strokeStyle = 'rgba(0,0,0,0.15)'
    ctx.lineWidth = 3
    for (let x = 30; x < w - 16; x += 34) {
      ctx.beginPath()
      ctx.moveTo(x, h * 0.52)
      ctx.lineTo(x, groundY)
      ctx.stroke()
    }

    // ---- 木柱（前四后二，带受光）----
    const pillars: Array<[number, number, number]> = [
      [22, h * 0.32, groundY],
      [w - 34, h * 0.32, groundY],
      [22, h * 0.32, h * 0.52],
      [w - 34, h * 0.32, h * 0.52],
      [w * 0.26, h * 0.32, groundY],
      [w * 0.74, h * 0.32, groundY],
    ]
    for (const [px, py, pBottom] of pillars) {
      ctx.fillStyle = toHex(0x6b4a1a)
      ctx.fillRect(px, py, 14, pBottom - py)
      ctx.fillStyle = 'rgba(255,230,180,0.18)'
      ctx.fillRect(px, py, 5, pBottom - py)
      ctx.fillStyle = 'rgba(0,0,0,0.2)'
      ctx.fillRect(px + 9, py, 5, pBottom - py)
      ctx.fillStyle = toHex(0x4a2c14)
      ctx.fillRect(px - 4, py, 22, 8)
    }

    // ---- 波浪遮阳篷（立体：条纹篷面 + 波浪褶边 + 顶沿）----
    const drawWaveAwning = (topY: number, height: number, overlapX: number, width: number) => {
      const cx = w / 2 + overlapX
      const halfW = width / 2
      ctx.save()
      ctx.beginPath()
      ctx.moveTo(cx - halfW, topY)
      ctx.lineTo(cx + halfW, topY)
      ctx.lineTo(cx + halfW - 6, topY + height)
      ctx.lineTo(cx - halfW + 6, topY + height)
      ctx.closePath()
      ctx.clip()
      const stripeW = 34
      for (let x = cx - halfW - 20; x < cx + halfW + 20; x += stripeW * 2) {
        ctx.fillStyle = toHex(0xc05050)
        ctx.fillRect(x, topY - 6, stripeW, height + 12)
        ctx.fillStyle = toHex(0xe8e0d0)
        ctx.fillRect(x + stripeW, topY - 6, stripeW, height + 12)
      }
      ctx.restore()
      // 篷面受光（左亮右暗 → 立体感）
      const grad = ctx.createLinearGradient(cx - halfW, 0, cx + halfW, 0)
      grad.addColorStop(0, 'rgba(255,245,220,0.28)')
      grad.addColorStop(0.4, 'rgba(255,245,220,0.05)')
      grad.addColorStop(1, 'rgba(0,0,0,0.24)')
      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.moveTo(cx - halfW, topY)
      ctx.lineTo(cx + halfW, topY)
      ctx.lineTo(cx + halfW - 6, topY + height)
      ctx.lineTo(cx - halfW + 6, topY + height)
      ctx.closePath()
      ctx.fill()
      // 波浪褶边（半圆垂帘，明暗交替）
      for (let x = cx - halfW + 6; x < cx + halfW - 8; x += 26) {
        ctx.fillStyle = toHex(x % 52 === 6 ? 0xd86060 : 0xe0a0a0)
        ctx.beginPath()
        ctx.arc(x + 10, topY + height, 10, 0, Math.PI)
        ctx.fill()
        ctx.fillStyle = 'rgba(0,0,0,0.14)'
        ctx.beginPath()
        ctx.arc(x + 10, topY + height, 10, Math.PI * 0.15, Math.PI * 0.85)
        ctx.fill()
      }
      // 顶沿
      ctx.fillStyle = 'rgba(40,20,20,0.4)'
      ctx.fillRect(cx - halfW, topY - 4, halfW * 2, 6)
    }
    drawWaveAwning(h * 0.2, 44, -12, w * 0.92)
    drawWaveAwning(h * 0.33, 48, 20, w * 0.84)

    // ---- 货架（中间，木架 + 满商品）----
    const shelfY = groundY
    ctx.fillStyle = toHex(0x8a6238)
    ctx.fillRect(w * 0.28, shelfY - 16, w * 0.44, 14)
    ctx.fillStyle = toHex(0x6b4a1a)
    ctx.fillRect(w * 0.28, shelfY - 2, 8, h - shelfY + 2)
    ctx.fillRect(w * 0.72 - 8, shelfY - 2, 8, h - shelfY + 2)
    const goods: Array<[number, number, number]> = [
      [w * 0.3, shelfY - 34, 0xcc8833],
      [w * 0.36, shelfY - 34, 0x44aa44],
      [w * 0.42, shelfY - 34, 0x4488cc],
      [w * 0.48, shelfY - 34, 0xcc4444],
      [w * 0.54, shelfY - 34, 0xccaa44],
      [w * 0.6, shelfY - 34, 0x66aa88],
      [w * 0.66, shelfY - 34, 0xaa66cc],
    ]
    for (const [gx, gy, gc] of goods) {
      ctx.fillStyle = toHex(gc)
      ctx.fillRect(gx, gy, 20, 18)
      ctx.fillStyle = 'rgba(255,255,255,0.16)'
      ctx.fillRect(gx, gy, 20, 4)
      ctx.fillStyle = 'rgba(0,0,0,0.2)'
      ctx.fillRect(gx, gy + 18, 20, 3)
    }
    // 秤
    ctx.fillStyle = toHex(0x6a6a72)
    ctx.fillRect(w * 0.66, shelfY - 48, 16, 8)
    ctx.fillRect(w * 0.68, shelfY - 44, 4, 14)
    ctx.fillRect(w * 0.63, shelfY - 56, 22, 6)

    // ---- 悬挂三角旗 ----
    const flags: Array<[number, number]> = [
      [w * 0.3, h * 0.18],
      [w * 0.42, h * 0.18],
      [w * 0.54, h * 0.18],
      [w * 0.66, h * 0.18],
    ]
    for (const [fx, fy] of flags) {
      ctx.fillStyle = toHex(0xffd94a)
      ctx.beginPath()
      ctx.moveTo(fx - 8, fy)
      ctx.lineTo(fx + 8, fy)
      ctx.lineTo(fx, fy + 18)
      ctx.closePath()
      ctx.fill()
      ctx.fillStyle = 'rgba(255,255,255,0.2)'
      ctx.beginPath()
      ctx.moveTo(fx - 8, fy)
      ctx.lineTo(fx, fy)
      ctx.lineTo(fx, fy + 18)
      ctx.closePath()
      ctx.fill()
    }

    // ---- 中央门洞（门帘）----
    const doorW = 64
    const doorH = 84
    ctx.fillStyle = 'rgba(24,14,8,0.96)'
    ctx.fillRect(w / 2 - doorW / 2 - 8, groundY - doorH - 6, doorW + 16, doorH + 6)
    ctx.fillStyle = toHex(0x6b4423)
    ctx.fillRect(w / 2 - doorW / 2, groundY - doorH, doorW, doorH)
    ctx.fillStyle = 'rgba(255,230,180,0.15)'
    ctx.fillRect(w / 2 - doorW / 2, groundY - doorH, doorW * 0.35, doorH)
    ctx.strokeStyle = 'rgba(40,25,12,0.9)'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(w / 2, groundY - doorH)
    ctx.lineTo(w / 2, groundY)
    ctx.stroke()
    ctx.fillStyle = toHex(0xc05050)
    ctx.fillRect(w / 2 - doorW / 2 - 10, groundY - doorH - 10, doorW + 20, 10)
    ctx.fillStyle = toHex(0xe8e0d0)
    ctx.fillRect(w / 2 - doorW / 2 - 10, groundY - doorH - 6, doorW + 20, 3)

    // 门前水果摊
    ctx.fillStyle = toHex(0x6b4a1a)
    ctx.fillRect(w * 0.14, groundY - 24, 44, 8)
    ctx.fillRect(w * 0.14, groundY - 16, 44, 18)
    ctx.fillRect(w * 0.17, groundY - 6, 6, 10)
    ctx.fillRect(w * 0.47, groundY - 6, 6, 10)
    ctx.fillStyle = toHex(0xcc4444)
    ctx.fillRect(w * 0.15, groundY - 30, 10, 8)
    ctx.fillStyle = toHex(0xccaa44)
    ctx.fillRect(w * 0.28, groundY - 31, 10, 9)
    ctx.fillStyle = toHex(0x44aa44)
    ctx.fillRect(w * 0.41, groundY - 30, 10, 8)

    // 扫帚（柱旁）
    ctx.fillStyle = toHex(0x8a6a3a)
    ctx.fillRect(w * 0.1, groundY - 52, 5, 44)
    ctx.fillStyle = toHex(0xc8b060)
    ctx.fillRect(w * 0.07, groundY - 16, 12, 14)
  }

  /**
   * 长老大厅：城堡式石堡 — 中央高塔（城垛+锥顶+旗帜）+ 两侧翼楼
   * + 彩色玻璃拱窗 + 大拱门 + 盾徽 + 蓝灰瓦平缓顶
   */
  private drawElderHall(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const groundY = h - 10
    const sideDepth = 24

    this.drawGroundShadow(ctx, w, h, 1.04, 0.13, 20)

    // ---- 两侧翼楼（低于主塔，石墙 + 蓝灰瓦）----
    const wingTop = h * 0.42
    const wingBottom = groundY - 18
    // 左翼楼
    this.drawBody(ctx, w, h, wingTop, wingBottom, 0x7a7a8a, 'castle', 18, 6, w * 0.24)
    // 右翼楼
    this.drawBody(ctx, w, h, wingTop, wingBottom, 0x7a7a8a, 'castle', 18, w * 0.76, w * 0.24)
    // 翼楼平缓瓦顶（左）
    this.drawIsoRoof(ctx, w, h, 0x4a5a6a, wingTop - 30, {
      offsetX: -w * 0.38,
      roofW: w * 0.28,
      eavesY: wingTop - 6,
      tiles: true,
      eavesOverhang: 20,
      thickness: 13,
    })
    // 翼楼平缓瓦顶（右）
    this.drawIsoRoof(ctx, w, h, 0x4a5a6a, wingTop - 30, {
      offsetX: w * 0.38,
      roofW: w * 0.28,
      eavesY: wingTop - 6,
      tiles: true,
      eavesOverhang: 20,
      thickness: 13,
    })
    // 翼楼窗
    this.drawWindow(ctx, w * 0.06, h * 0.58, 44, 38, 0x88ccdd)
    this.drawWindow(ctx, w * 0.78, h * 0.58, 44, 38, 0x88ccdd)
    // 翼楼顶旗帜（紫金）
    this.drawBanner(ctx, w * 0.06, wingTop - 56, 0x8844bb, 30, 20)
    this.drawBanner(ctx, w * 0.76, wingTop - 56, 0x8844bb, 30, 20)

    // ---- 中央高塔（主体，更高）----
    const towerW = w * 0.5
    const towerX = (w - towerW) / 2
    const towerTop = h * 0.16
    this.drawBody(ctx, w, h, towerTop, wingBottom, 0x8a8a9a, 'castle', sideDepth, towerX, towerW)

    // 塔顶城垛（垛口，立体）
    const crenelH = 20
    ctx.fillStyle = toHex(0x7a7a8a)
    for (let x = towerX - 6; x < towerX + towerW + 2; x += 24) {
      ctx.fillRect(x, towerTop - crenelH, 16, crenelH + 4)
    }
    ctx.fillStyle = shadeHex(0x7a7a8a, 0.85)
    ctx.fillRect(towerX - 6, towerTop - crenelH, towerW + 12, 5)
    ctx.fillStyle = 'rgba(255,255,255,0.1)'
    ctx.fillRect(towerX - 6, towerTop - crenelH, towerW * 0.3, 4)

    // 塔顶锥盖（蓝灰，覆盖城垛内侧）
    ctx.fillStyle = toHex(0x4a5a6a)
    ctx.beginPath()
    ctx.moveTo(towerX - 4, towerTop + 6)
    ctx.lineTo(w / 2, towerTop - crenelH - 44)
    ctx.lineTo(towerX + towerW + 4, towerTop + 6)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = 'rgba(255,240,210,0.16)'
    ctx.beginPath()
    ctx.moveTo(towerX - 4, towerTop + 6)
    ctx.lineTo(w / 2, towerTop - crenelH - 44)
    ctx.lineTo(w / 2 - 34, towerTop + 6)
    ctx.closePath()
    ctx.fill()
    // 塔尖旗杆 + 紫金旗
    ctx.fillStyle = toHex(0x5a4a3a)
    ctx.fillRect(w / 2 - 3, towerTop - crenelH - 58, 6, 62)
    this.drawBanner(ctx, w / 2, towerTop - crenelH - 56, 0x8844bb, 40, 24)

    // 塔身彩色玻璃窗（拱形）
    const glassW = 40
    const glassH = 64
    const glassX = w / 2 - glassW / 2
    const glassY = h * 0.42
    ctx.fillStyle = toHex(0x3a3a4a)
    ctx.beginPath()
    ctx.arc(w / 2, glassY, glassW / 2 + 6, Math.PI, 0)
    ctx.fillRect(glassX - 6, glassY, glassW + 12, glassH - glassW / 2 + 6)
    ctx.fill()
    const gradG = ctx.createLinearGradient(0, glassY, 0, glassY + glassH)
    gradG.addColorStop(0, toHex(0x88ccdd))
    gradG.addColorStop(0.5, toHex(0xaa66dd))
    gradG.addColorStop(1, toHex(0x4488cc))
    ctx.fillStyle = gradG
    ctx.beginPath()
    ctx.arc(w / 2, glassY, glassW / 2, Math.PI, 0)
    ctx.fillRect(glassX, glassY, glassW, glassH - glassW / 2)
    ctx.fill()
    ctx.strokeStyle = 'rgba(40,40,60,0.9)'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(w / 2, glassY - glassW / 2)
    ctx.lineTo(w / 2, glassY + glassH - glassW / 2)
    ctx.moveTo(glassX, glassY + 16)
    ctx.lineTo(glassX + glassW, glassY + 16)
    ctx.moveTo(glassX, glassY + 36)
    ctx.lineTo(glassX + glassW, glassY + 36)
    ctx.stroke()

    // 中央大拱门（门框石 + 台阶）
    const ax = w / 2
    const doorW = 96
    const doorH = 130
    const gradHole = ctx.createLinearGradient(0, wingBottom - doorH, 0, wingBottom)
    gradHole.addColorStop(0, 'rgba(14,11,8,0.98)')
    gradHole.addColorStop(1, 'rgba(4,3,2,1)')
    ctx.fillStyle = gradHole
    ctx.beginPath()
    ctx.arc(ax, wingBottom - doorH + doorW / 2, doorW / 2, Math.PI, 0)
    ctx.fillRect(ax - doorW / 2, wingBottom - doorH + doorW / 2, doorW, doorH - doorW / 2)
    ctx.fill()
    // 拱门石框
    ctx.fillStyle = toHex(0x6a6a7a)
    ctx.strokeStyle = toHex(0x5a5a6a)
    ctx.lineWidth = 10
    ctx.beginPath()
    ctx.arc(ax, wingBottom - doorH + doorW / 2, doorW / 2 + 8, Math.PI, 0)
    ctx.lineTo(ax + doorW / 2 + 8, wingBottom)
    ctx.lineTo(ax - doorW / 2 - 8, wingBottom)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    // 门楣石梁
    ctx.fillStyle = toHex(0x7a7a8a)
    ctx.fillRect(ax - doorW / 2 - 14, wingBottom - doorH - 12, doorW + 28, 12)
    // 拱内木门
    ctx.fillStyle = toHex(0x5a3a1e)
    ctx.beginPath()
    ctx.arc(ax, wingBottom - doorH + doorW / 2, doorW / 2 - 4, Math.PI, 0)
    ctx.fillRect(ax - doorW / 2 + 4, wingBottom - doorH + doorW / 2, doorW - 8, doorH - doorW / 2)
    ctx.fill()
    ctx.strokeStyle = 'rgba(40,25,12,0.9)'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(ax, wingBottom - doorH + doorW / 2 - 4)
    ctx.lineTo(ax, wingBottom)
    ctx.stroke()
    ctx.fillStyle = toHex(0xffd94a)
    ctx.fillRect(ax - 24, wingBottom - 42, 8, 8)
    ctx.fillRect(ax + 16, wingBottom - 42, 8, 8)
    // 石阶（三级立体）
    ctx.fillStyle = toHex(0x8a8a94)
    ctx.fillRect(ax - 66, wingBottom - 4, 132, 9)
    ctx.fillStyle = 'rgba(255,240,210,0.16)'
    ctx.fillRect(ax - 66, wingBottom - 4, 132, 3)
    ctx.fillStyle = toHex(0x7a7a84)
    ctx.fillRect(ax - 76, wingBottom + 5, 152, 8)
    ctx.fillStyle = 'rgba(0,0,0,0.34)'
    ctx.fillRect(ax - 80, wingBottom + 13, 160, 6)

    // 盾徽（门上方墙饰）
    ctx.fillStyle = toHex(0x4a2c14)
    ctx.fillRect(w / 2 - 30, h * 0.5, 60, 10)
    ctx.fillStyle = toHex(0x8844bb)
    ctx.beginPath()
    ctx.moveTo(w / 2 - 22, h * 0.51)
    ctx.lineTo(w / 2 + 22, h * 0.51)
    ctx.lineTo(w / 2 + 22, h * 0.6)
    ctx.quadraticCurveTo(w / 2, h * 0.7, w / 2 - 22, h * 0.6)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = toHex(0xffd94a)
    ctx.beginPath()
    ctx.moveTo(w / 2 - 12, h * 0.55)
    ctx.lineTo(w / 2 + 12, h * 0.55)
    ctx.lineTo(w / 2, h * 0.62)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,0.18)'
    ctx.fillRect(w / 2 - 20, h * 0.52, 8, 16)

    // 底座平台（加高，城堡基座）
    this.drawPlinth(ctx, w, h, groundY - 2, 0x5a5a68, 12, 16)
  }

  /**
   * 温馨小屋：都铎山墙 + 红瓦等距双坡 + 阁楼圆窗 + 烟囱 + 花箱窗
   * + 花园栅栏 + 门灯 + 柴堆 + 浇水壶
   */
  private drawResidential(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const groundY = h - 10
    const sideDepth = 26

    this.drawGroundShadow(ctx, w, h, 1.03, 0.13, 16)

    // ---- 主体墙（都铎木梁）----
    const wallTop = h * 0.48
    const wallBottom = groundY - 16
    this.drawBody(ctx, w, h, wallTop, wallBottom, 0xe0d5bc, 'timber', sideDepth)

    // 山墙阁楼（中央凸出）
    const atticTop = h * 0.26
    const atticW = w * 0.56
    const atticX = (w - atticW) / 2
    ctx.fillStyle = toHex(0xe0d5bc)
    ctx.fillRect(atticX, atticTop, atticW, wallTop - atticTop)
    ctx.fillStyle = shadeHex(0xe0d5bc, 0.8)
    ctx.fillRect(atticX - 10, atticTop, 10, wallTop - atticTop)
    ctx.fillStyle = shadeHex(0xe0d5bc, 0.52)
    ctx.fillRect(atticX + atticW, atticTop, 10, wallTop - atticTop)
    ctx.fillStyle = toHex(0x5a3a20)
    ctx.fillRect(atticX - 4, atticTop, atticW + 8, 8)
    // 阁楼圆窗
    this.drawRoundWindow(ctx, w / 2, atticTop + 34, 18, 0xffcc66)

    // ---- 主屋顶（红瓦等距双坡，山墙）----
    this.drawIsoRoof(ctx, w, h, 0x8a4a2a, h * 0.11, {
      offsetX: 0,
      roofW: w * 0.82,
      eavesY: wallTop - 12,
      tiles: true,
      gable: true,
      eavesOverhang: 26,
      thickness: 15,
      ridgeCap: 0xccaa44,
    })

    // 烟囱（右，粗，冒烟）
    this.drawChimney(ctx, w * 0.78, h * 0.05, 38, 88, 0x7a5a48, true)

    // 一层窗（花箱）
    this.drawWindow(ctx, w * 0.08, h * 0.58, 52, 44, 0xffcc66, true)
    this.drawWindow(ctx, w * 0.62, h * 0.58, 52, 44, 0xffcc66, true)

    // 大门（中央）
    this.drawDoor(ctx, w / 2, wallBottom + 2, 78, 104)

    // 门灯
    this.drawLantern(ctx, w / 2 - 46, h * 0.66)
    this.drawLantern(ctx, w / 2 + 46, h * 0.66)

    // 门前花园（花坛 + 栅栏）
    this.drawFence(ctx, w * 0.26, wallBottom - 32, w * 0.18, 34, 4)
    this.drawFence(ctx, w * 0.56, wallBottom - 32, w * 0.18, 34, 4)
    ctx.fillStyle = toHex(0x3d7a2d)
    ctx.fillRect(w * 0.28, wallBottom - 18, w * 0.14, 12)
    const flowers: Array<[number, number, number]> = [
      [w * 0.3, wallBottom - 26, 0xff6699],
      [w * 0.36, wallBottom - 28, 0xffd94a],
      [w * 0.4, wallBottom - 24, 0xff6699],
      [w * 0.58, wallBottom - 26, 0xffd94a],
      [w * 0.64, wallBottom - 28, 0x66aadd],
      [w * 0.69, wallBottom - 24, 0xff6699],
    ]
    for (const [fx, fy, fc] of flowers) {
      ctx.fillStyle = toHex(0x2d6a2d)
      ctx.fillRect(fx, fy + 4, 3, 8)
      ctx.fillStyle = toHex(fc)
      ctx.fillRect(fx - 3, fy, 9, 6)
    }

    // 门口脚垫
    ctx.fillStyle = toHex(0x8a7a5a)
    ctx.fillRect(w / 2 - 28, wallBottom - 6, 56, 8)
    ctx.fillStyle = 'rgba(0,0,0,0.2)'
    ctx.fillRect(w / 2 - 28, wallBottom - 6, 56, 3)

    // 柴堆（左）
    ctx.fillStyle = toHex(0x5a3a1e)
    ctx.fillRect(w * 0.05, wallBottom - 24, 26, 26)
    ctx.fillRect(w * 0.09, wallBottom - 34, 26, 26)
    ctx.fillRect(w * 0.05, wallBottom - 14, 26, 12)
    ctx.fillStyle = toHex(0x7a5a3a)
    ctx.fillRect(w * 0.05, wallBottom - 24, 26, 4)
    // 浇水壶
    ctx.fillStyle = toHex(0x4a7a4a)
    ctx.fillRect(w * 0.87, wallBottom - 16, 26, 16)
    ctx.fillRect(w * 0.85, wallBottom - 20, 6, 8)
    ctx.fillRect(w * 0.9, wallBottom - 22, 10, 6)
    ctx.fillStyle = 'rgba(255,255,255,0.2)'
    ctx.fillRect(w * 0.87, wallBottom - 16, 26, 3)

    // 底座平台
    this.drawPlinth(ctx, w, h, groundY - 2, 0x6a5a4a, 10, 13)
  }

  /**
   * 森林入口：两棵立体大树拱门（多层树冠+投影）+ 苔藓石柱
   * + 幽暗入口小路 + 藤蔓 + 路牌 + 萤火虫 + 蘑菇
   */
  private drawForestGate(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const groundY = h - 8

    this.drawGroundShadow(ctx, w, h, 1.02, 0.1, 10)

    // ---- 两侧苔藓石柱（立体）----
    const pillar = (px: number) => {
      ctx.fillStyle = toHex(0x6a6a6a)
      ctx.fillRect(px, h * 0.42, 26, groundY - h * 0.42)
      ctx.fillStyle = 'rgba(0,0,0,0.2)'
      ctx.fillRect(px + 16, h * 0.42, 10, groundY - h * 0.42)
      ctx.fillStyle = 'rgba(40,80,40,0.5)'
      ctx.fillRect(px, h * 0.42, 26, 26)
      ctx.fillRect(px + 8, h * 0.55, 18, 22)
      ctx.fillStyle = 'rgba(0,0,0,0.25)'
      ctx.fillRect(px + 2, groundY - 14, 26, 8)
      ctx.fillStyle = toHex(0x8a8a8a)
      ctx.fillRect(px - 4, h * 0.42 - 8, 34, 10)
      ctx.fillStyle = 'rgba(255,255,255,0.12)'
      ctx.fillRect(px - 4, h * 0.42 - 8, 34, 4)
    }
    pillar(w * 0.16)
    pillar(w * 0.76)

    // ---- 两棵立体大树（向内弯形成拱，树冠分簇+投影）----
    const drawTree = (tx: number, lean: number, col: number) => {
      // 树干（弯曲 + 暗面）
      ctx.fillStyle = toHex(col)
      ctx.beginPath()
      ctx.moveTo(tx - 22, groundY)
      ctx.quadraticCurveTo(tx - 26, h * 0.5, tx - 10 + lean, h * 0.22)
      ctx.lineTo(tx + 10 + lean, h * 0.22)
      ctx.quadraticCurveTo(tx + 20, h * 0.5, tx + 22, groundY)
      ctx.closePath()
      ctx.fill()
      ctx.fillStyle = 'rgba(0,0,0,0.24)'
      ctx.beginPath()
      ctx.moveTo(tx, groundY)
      ctx.quadraticCurveTo(tx - 4, h * 0.5, tx + 4 + lean, h * 0.22)
      ctx.lineTo(tx + 10 + lean, h * 0.22)
      ctx.quadraticCurveTo(tx + 20, h * 0.5, tx + 22, groundY)
      ctx.closePath()
      ctx.fill()
      // 树皮纹
      ctx.strokeStyle = 'rgba(0,0,0,0.25)'
      ctx.lineWidth = 3
      for (let y = h * 0.3; y < groundY - 10; y += 22) {
        ctx.beginPath()
        ctx.moveTo(tx - 14, y)
        ctx.lineTo(tx + 14, y + 8)
        ctx.stroke()
      }
      // 树冠（多层分簇，受光面在左上）
      const blobs: Array<[number, number, number, number]> = [
        [tx + lean * 0.6, h * 0.14, 64, col],
        [tx + lean * 0.6 - 46, h * 0.1, 48, shade(col, 1.22)],
        [tx + lean * 0.6 + 48, h * 0.1, 48, shade(col, 0.82)],
        [tx + lean * 0.6 - 22, h * 0.02, 44, shade(col, 1.08)],
        [tx + lean * 0.6 + 24, h * 0.02, 42, shade(col, 0.9)],
      ]
      for (const [bx, by, br, bc] of blobs) {
        ctx.fillStyle = toHex(bc)
        ctx.beginPath()
        ctx.arc(bx, by, br, 0, Math.PI * 2)
        ctx.fill()
        // 叶簇高光（左上）
        ctx.fillStyle = 'rgba(190,245,170,0.3)'
        ctx.beginPath()
        ctx.arc(bx - br * 0.3, by - br * 0.3, br * 0.35, 0, Math.PI * 2)
        ctx.fill()
        // 叶簇暗部（右下）
        ctx.fillStyle = 'rgba(0,0,0,0.14)'
        ctx.beginPath()
        ctx.arc(bx + br * 0.35, by + br * 0.35, br * 0.3, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    drawTree(w * 0.22, 24, 0x2d5a2d)
    drawTree(w * 0.78, -24, 0x1f4a1f)

    // ---- 中央入口（幽暗小路，弧形）----
    ctx.fillStyle = toHex(0x241a10)
    ctx.beginPath()
    ctx.moveTo(w * 0.44, groundY)
    ctx.quadraticCurveTo(w * 0.44, h * 0.48, w * 0.5, h * 0.3)
    ctx.quadraticCurveTo(w * 0.56, h * 0.48, w * 0.56, groundY)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = 'rgba(90,120,60,0.15)'
    ctx.beginPath()
    ctx.moveTo(w * 0.47, groundY)
    ctx.quadraticCurveTo(w * 0.48, h * 0.52, w * 0.5, h * 0.36)
    ctx.quadraticCurveTo(w * 0.52, h * 0.52, w * 0.53, groundY)
    ctx.closePath()
    ctx.fill()
    // 路缘石
    ctx.fillStyle = toHex(0x5a4a3a)
    ctx.fillRect(w * 0.42, groundY - 8, w * 0.16, 10)
    ctx.fillStyle = 'rgba(255,240,200,0.12)'
    ctx.fillRect(w * 0.42, groundY - 8, w * 0.16, 3)

    // ---- 藤蔓（垂挂）----
    ctx.strokeStyle = toHex(0x3d6a3d)
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.moveTo(w * 0.18, h * 0.3)
    ctx.quadraticCurveTo(w * 0.3, h * 0.34, w * 0.42, h * 0.3)
    ctx.moveTo(w * 0.58, h * 0.3)
    ctx.quadraticCurveTo(w * 0.7, h * 0.34, w * 0.82, h * 0.3)
    ctx.stroke()
    ctx.fillStyle = toHex(0x4a8a4a)
    for (let i = 0; i < 7; i++) {
      const fx = w * 0.2 + i * 0.04 * w
      const fy = h * 0.3 + (i % 2 === 0 ? 6 : 0)
      ctx.fillRect(fx, fy, 8, 5)
    }

    // ---- 石路标（木牌）----
    ctx.fillStyle = toHex(0x6b4a1a)
    ctx.fillRect(w * 0.17, h * 0.58, 8, 34)
    ctx.fillStyle = 'rgba(255,240,200,0.18)'
    ctx.fillRect(w * 0.17, h * 0.58, 3, 34)
    ctx.fillStyle = toHex(0x8a6238)
    ctx.fillRect(w * 0.08, h * 0.55, 46, 26)
    ctx.fillStyle = toHex(0xffe9b0)
    ctx.fillRect(w * 0.1, h * 0.56, 42, 4)
    ctx.fillRect(w * 0.1, h * 0.64, 42, 4)
    ctx.fillRect(w * 0.1, h * 0.72, 26, 4)

    // ---- 萤火虫光点 ----
    const rnd = seededRand(0xf1e)
    for (let i = 0; i < 9; i++) {
      ctx.fillStyle = `rgba(220,255,140,${0.2 + rnd() * 0.4})`
      const fx = w * 0.12 + rnd() * w * 0.76
      const fy = h * 0.05 + rnd() * h * 0.6
      ctx.fillRect(fx, fy, 4, 4)
      ctx.fillStyle = 'rgba(220,255,140,0.1)'
      ctx.fillRect(fx - 3, fy - 3, 10, 10)
    }

    // ---- 蘑菇（入口两侧）----
    const mushroom = (mx: number, my: number, mc: number) => {
      ctx.fillStyle = toHex(0xe8e0c8)
      ctx.fillRect(mx - 3, my, 6, 8)
      ctx.fillStyle = toHex(mc)
      ctx.beginPath()
      ctx.arc(mx, my - 1, 9, Math.PI, 0)
      ctx.fill()
      ctx.fillStyle = 'rgba(255,255,255,0.5)'
      ctx.fillRect(mx - 4, my - 5, 3, 3)
      ctx.fillRect(mx + 2, my - 2, 3, 3)
    }
    mushroom(w * 0.38, groundY - 10, 0xcc6644)
    mushroom(w * 0.6, groundY - 8, 0xaa66cc)
    mushroom(w * 0.64, groundY - 14, 0xcc6644)

    // 草丛（石柱脚下）
    const grass = seededRand(0x9a)
    for (let i = 0; i < 16; i++) {
      ctx.fillStyle = toHex(0x2d6a2d)
      ctx.fillRect(w * 0.1 + grass() * w * 0.8, groundY - 6 - grass() * 6, 3, 8)
    }
  }

  /**
   * 矿洞入口：立体岩壁 + 木支架拱门 + 黑洞 + 轨道矿车 + 火把
   * + 撬棍/镐 + 矿石堆 + 洞口招牌
   */
  private drawMineEntrance(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const groundY = h - 8

    this.drawGroundShadow(ctx, w, h, 1.06, 0.11, 14)

    // ---- 岩壁（立体岩石 + 高光 + 矿脉）----
    ctx.fillStyle = toHex(0x55504a)
    ctx.fillRect(0, 0, w, h)
    const rnd = seededRand(0x51a)
    // 岩石块（错落 + 暗缝）
    ctx.fillStyle = 'rgba(0,0,0,0.28)'
    for (let y = 0; y < h; y += 44) {
      for (let x = 0; x < w; x += 58) {
        const off = (y / 44) % 2 === 0 ? 0 : 29
        ctx.fillRect(x + off, y, 40, 20)
      }
    }
    // 岩壁受光（左上）
    ctx.fillStyle = 'rgba(255,235,200,0.1)'
    ctx.fillRect(0, 0, w, 6)
    ctx.fillStyle = 'rgba(255,235,200,0.06)'
    ctx.fillRect(0, 0, 8, h)
    // 右侧暗部
    ctx.fillStyle = 'rgba(0,0,0,0.16)'
    ctx.fillRect(w * 0.82, 0, w * 0.18, h)
    // 裂纹
    ctx.strokeStyle = 'rgba(0,0,0,0.3)'
    ctx.lineWidth = 2
    for (let i = 0; i < 12; i++) {
      ctx.beginPath()
      ctx.moveTo(rnd() * w, 0)
      ctx.lineTo(rnd() * w, h * (0.3 + rnd() * 0.6))
      ctx.stroke()
    }
    // 水晶/矿脉闪光
    const ores: Array<[number, number, number]> = [
      [w * 0.08, h * 0.28, 0x66ccff],
      [w * 0.2, h * 0.6, 0x66ccff],
      [w * 0.86, h * 0.3, 0xffcc44],
      [w * 0.72, h * 0.64, 0xffcc44],
    ]
    for (const [ox, oy, oc] of ores) {
      ctx.fillStyle = toHex(oc)
      ctx.fillRect(ox, oy, 8, 8)
      ctx.fillRect(ox + 3, oy - 4, 4, 6)
      ctx.fillStyle = 'rgba(255,255,255,0.5)'
      ctx.fillRect(ox, oy, 3, 3)
    }

    // ---- 洞口（黑洞 + 内渐变）----
    ctx.fillStyle = '#080604'
    ctx.beginPath()
    ctx.ellipse(w / 2, h * 0.62, w * 0.27, h * 0.2, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillRect(w / 2 - w * 0.27, h * 0.62, w * 0.54, h * 0.24)
    ctx.fillStyle = 'rgba(36,26,16,0.4)'
    ctx.beginPath()
    ctx.ellipse(w / 2, h * 0.62, w * 0.2, h * 0.14, 0, 0, Math.PI * 2)
    ctx.fill()

    // ---- 木支架（拱形，立体受光）----
    ctx.strokeStyle = toHex(0x6b4a1a)
    ctx.lineWidth = 14
    ctx.beginPath()
    ctx.moveTo(w * 0.2, h * 0.78)
    ctx.lineTo(w * 0.2, h * 0.4)
    ctx.quadraticCurveTo(w * 0.2, h * 0.24, w * 0.5, h * 0.24)
    ctx.quadraticCurveTo(w * 0.8, h * 0.24, w * 0.8, h * 0.4)
    ctx.lineTo(w * 0.8, h * 0.78)
    ctx.stroke()
    ctx.strokeStyle = 'rgba(255,240,200,0.22)'
    ctx.lineWidth = 5
    ctx.beginPath()
    ctx.moveTo(w * 0.17, h * 0.78)
    ctx.lineTo(w * 0.17, h * 0.4)
    ctx.quadraticCurveTo(w * 0.17, h * 0.25, w * 0.47, h * 0.25)
    ctx.stroke()
    // 横撑
    ctx.fillStyle = toHex(0x6b4a1a)
    ctx.fillRect(w * 0.18, h * 0.52, w * 0.64, 10)
    ctx.fillStyle = 'rgba(255,240,200,0.15)'
    ctx.fillRect(w * 0.18, h * 0.52, w * 0.64, 3)

    // ---- 轨道 + 矿车 ----
    ctx.fillStyle = toHex(0x3a3a3a)
    ctx.fillRect(w * 0.1, groundY - 6, w * 0.8, 6)
    ctx.fillStyle = toHex(0x6a6a6a)
    ctx.fillRect(w * 0.1, groundY - 6, w * 0.8, 3)
    ctx.fillStyle = toHex(0x4a3a2a)
    for (let x = w * 0.1; x < w * 0.9; x += 34) {
      ctx.fillRect(x, groundY - 4, 14, 5)
    }
    // 矿车（立体）
    ctx.fillStyle = toHex(0x4a4a3a)
    ctx.fillRect(w * 0.6, groundY - 36, 62, 24)
    ctx.fillStyle = toHex(0x6a6a5a)
    ctx.fillRect(w * 0.62, groundY - 40, 58, 8)
    ctx.fillStyle = toHex(0x8888aa)
    ctx.fillRect(w * 0.63, groundY - 44, 12, 8)
    ctx.fillStyle = toHex(0xccaa44)
    ctx.fillRect(w * 0.72, groundY - 45, 12, 9)
    ctx.fillStyle = 'rgba(255,255,255,0.4)'
    ctx.fillRect(w * 0.63, groundY - 44, 4, 3)
    ctx.fillStyle = toHex(0x22222a)
    ctx.fillRect(w * 0.6, groundY - 12, 12, 12)
    ctx.fillRect(w * 0.7, groundY - 12, 12, 12)

    // ---- 火把（两侧）----
    this.drawTorch(ctx, w * 0.24, h * 0.46)
    this.drawTorch(ctx, w * 0.76, h * 0.46)

    // ---- 撬棍 + 镐（靠在支架）----
    ctx.save()
    ctx.translate(w * 0.13, groundY - 16)
    ctx.rotate(-0.5)
    ctx.fillStyle = toHex(0x8a8a8a)
    ctx.fillRect(-2, -30, 5, 32)
    ctx.fillStyle = toHex(0x6b4a1a)
    ctx.fillRect(-3, 0, 7, 8)
    ctx.restore()
    ctx.fillStyle = toHex(0x8a8a8a)
    ctx.fillRect(w * 0.16, groundY - 12, 6, 24)
    ctx.fillStyle = toHex(0x6a6a7a)
    ctx.fillRect(w * 0.11, groundY - 18, 16, 6)
    ctx.fillRect(w * 0.11, groundY - 12, 16, 6)

    // ---- 矿石堆（洞口旁）----
    ctx.fillStyle = toHex(0x7777aa)
    ctx.fillRect(w * 0.42, groundY - 12, 16, 12)
    ctx.fillStyle = toHex(0x8888bb)
    ctx.fillRect(w * 0.46, groundY - 18, 16, 12)
    ctx.fillStyle = toHex(0x7777aa)
    ctx.fillRect(w * 0.52, groundY - 14, 14, 10)
    ctx.fillStyle = 'rgba(255,255,255,0.35)'
    ctx.fillRect(w * 0.46, groundY - 18, 5, 3)
    ctx.fillRect(w * 0.52, groundY - 14, 4, 3)

    // ---- 洞口招牌（横匾）----
    ctx.fillStyle = toHex(0x3d2817)
    ctx.fillRect(w / 2 - 58, h * 0.12, 116, 30)
    ctx.fillStyle = toHex(0xc9b98a)
    ctx.fillRect(w / 2 - 52, h * 0.135, 104, 22)
    ctx.fillStyle = toHex(0x6a5a4a)
    ctx.fillRect(w / 2 - 42, h * 0.175, 84, 5)
    ctx.fillStyle = toHex(0x3a3a3a)
    ctx.fillRect(w / 2 - 12, h * 0.14, 24, 14)
    ctx.fillStyle = toHex(0xccaa44)
    ctx.fillRect(w / 2 - 8, h * 0.145, 10, 8)
    ctx.fillStyle = 'rgba(0,0,0,0.3)'
    ctx.fillRect(w / 2 - 58, h * 0.12 + 34, 116, 5)
  }
}





