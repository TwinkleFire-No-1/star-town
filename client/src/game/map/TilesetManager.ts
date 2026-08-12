import Phaser from 'phaser'
import { TILE_SIZE } from '../config'
import { TileType, TILE_CONFIGS } from '../data/TileData'
import { TILE_TEXTURE_BY_TYPE, tileImageKey } from '../data/TileTextures'

/**
 * TilesetManager — 瓦片集管理器
 *
 * 职责：
 * - 优先加载外部 PNG 瓦片（assets/tileset/{file}.png，64×64 高清）
 * - 城镇核心地面/装饰走「高清程序化 Canvas 绘制」（v2 像素引擎，质量优先）
 * - 外部资源缺失时自动回退到程序化绘制（不崩溃、不空白）
 * - 程序化绘制带立体感明暗（顶部受光 + 底部阴影）
 * - 生成完整小镇地图数据
 */
export class TilesetManager {
  private scene: Phaser.Scene
  private tileTextures: Map<number, string> = new Map()

  /**
   * AI 地面母图映射：地面类型 → 512×512 无缝母图 PNG
   * 由 AI 生成 → make_seamless.py 无缝化 → PreloadScene 加载（tile-img-ground-{id}）
   * 渲染时用 tileSprite 平铺 + tilePosition 偏移，实现自然无缝连续
   */
  private static readonly AI_GROUND_MASTER: Partial<Record<TileType, string>> = {
    [TileType.Ground_Grass]: 'ground-grass.png',
    [TileType.Ground_Dirt]: 'ground-dirt.png',
    [TileType.Ground_Stone]: 'ground-stone.png',
    [TileType.Ground_Path]: 'ground-path.png',
    [TileType.Ground_Water]: 'ground-water.png',
    [TileType.Ground_Bridge]: 'ground-bridge.png',
    [TileType.Ground_Sand]: 'ground-sand.png',
    [TileType.Ground_Wood]: 'ground-wood.png',
  }

  /** AI 地面母图纹理 key（type → master texture key） */
  private groundMasters: Map<number, string> = new Map()

  /**
   * 程序化优先类型 — 这些类型不加载外部 PNG，直接用 v2 像素引擎高清绘制。
   * 覆盖城镇所有地面与核心装饰（广场/道路/植被/地标），保证风格统一。
   */
  private static readonly PROCEDURAL_FIRST = new Set<TileType>([
    // 地面
    TileType.Ground_Grass, TileType.Ground_Dirt, TileType.Ground_Stone,
    TileType.Ground_Wood, TileType.Ground_Water, TileType.Ground_Sand,
    TileType.Ground_Bridge, TileType.Ground_Path,
    // 城镇装饰
    TileType.Deco_Tree, TileType.Deco_Bush, TileType.Deco_Rock,
    TileType.Deco_Flower, TileType.Deco_Fountain, TileType.Deco_LampPost,
    TileType.Deco_Well, TileType.Deco_Bench, TileType.Deco_Garden,
    TileType.Deco_Signpost, TileType.Deco_Barrel, TileType.Deco_Crate,
    TileType.Deco_Torch, TileType.Deco_Anvil,
  ])

  constructor(scene: Phaser.Scene) {
    this.scene = scene
  }

  /**
   * 生成所有 Tile 纹理（程序化优先 → 外部 PNG → 兜底）
   * 在 GameScene 中调用
   */
  generateTileset(): void {
    const gfx = this.scene.add.graphics()
    let externalCount = 0
    let proceduralCount = 0
    let fallbackCount = 0

    Object.entries(TILE_CONFIGS).forEach(([id, config]) => {
      if (config.type === TileType.Empty) return
      if (this.tileTextures.has(config.type)) return

      const textureKey = `tile_${id}`

      // 场景重建（战斗退出/场景切换）时纹理已存在于纹理管理器：直接复用并登记，
      // 避免重复注册报 "Texture key already in use"（T7.x.13 验收发现）
      if (this.scene.textures.exists(textureKey)) {
        this.tileTextures.set(config.type, textureKey)
        return
      }

      const def = TILE_TEXTURE_BY_TYPE.get(config.type)

      // AI 地面母图优先：512×512 无缝纹理，渲染时 tileSprite 平铺偏移
      const aiMasterFile = TilesetManager.AI_GROUND_MASTER[config.type as TileType]
      if (aiMasterFile) {
        const masterKey = this.tryRegisterGroundMaster(config.type, aiMasterFile)
        if (masterKey) {
          this.tileTextures.set(config.type, masterKey)
          externalCount++
          return
        }
      }

      // 程序化优先类型 → 直接走 v2 高清像素引擎
      if (TilesetManager.PROCEDURAL_FIRST.has(config.type)) {
        const canvas = this.drawTileCanvas(config.type, config.color)
        if (canvas) {
          this.scene.textures.addCanvas(textureKey, canvas)
          this.tileTextures.set(config.type, textureKey)
          proceduralCount++
          return
        }
      }

      // 优先使用外部 PNG（成功则不再程序化绘制）
      if (def && this.tryGenerateFromImage(def.type, def.file, textureKey)) {
        externalCount++
        this.tileTextures.set(config.type, textureKey)
        return
      }

      // 程序化兜底绘制
      gfx.clear()
      // 基础颜色填充
      gfx.fillStyle(config.color, 1)
      gfx.fillRect(0, 0, TILE_SIZE, TILE_SIZE)
      // 根据类型添加精细细节
      this.addTileDetails(gfx, config.type)
      // 立体感：顶部受光 + 底部阴影
      this.addTileShading(gfx)
      // 生成纹理
      gfx.generateTexture(textureKey, TILE_SIZE, TILE_SIZE)
      this.tileTextures.set(config.type, textureKey)
      fallbackCount++
    })

    gfx.destroy()
    console.log(
      `[TilesetManager] HD tiles ready: ${this.tileTextures.size} (procedural=${proceduralCount}, external=${externalCount}, fallback=${fallbackCount})`,
    )
  }

  /**
   * v2 像素引擎 — 用 Canvas 2D 高清绘制 64×64 瓦片（程序化优先类型）
   *
   * 相比 Phaser Graphics 兜底，Canvas 拥有完整 2D 能力：
   * 渐变 / 曲线 / 多重叠加，让像素纹理更有层次与光影。
   * 统一光源：西北→东南（左亮右暗，上亮下暗）。
   */
  private drawTileCanvas(type: TileType, baseColor: number): HTMLCanvasElement | null {
    const T = 64
    const canvas = document.createElement('canvas')
    canvas.width = T
    canvas.height = T
    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    ctx.imageSmoothingEnabled = false

    switch (type) {
      case TileType.Ground_Grass: this.pxGrass(ctx, T); break
      case TileType.Ground_Dirt: this.pxDirt(ctx, T); break
      case TileType.Ground_Stone: this.pxMagicStone(ctx, T); break
      case TileType.Ground_Path: this.pxCobblePath(ctx, T); break
      case TileType.Ground_Water: this.pxWater(ctx, T); break
      case TileType.Ground_Bridge: this.pxBridge(ctx, T); break
      case TileType.Ground_Sand: this.pxSand(ctx, T); break
      case TileType.Ground_Wood: this.pxWoodFloor(ctx, T); break
      case TileType.Deco_Tree: this.pxTree(ctx, T, baseColor); break
      case TileType.Deco_Bush: this.pxBush(ctx, T, baseColor); break
      case TileType.Deco_Rock: this.pxRock(ctx, T, baseColor); break
      case TileType.Deco_Flower: this.pxFlower(ctx, T, baseColor); break
      case TileType.Deco_Fountain: this.pxMagicFountain(ctx, T, baseColor); break
      case TileType.Deco_LampPost: this.pxMagicLamp(ctx, T, baseColor); break
      case TileType.Deco_Well: this.pxWell(ctx, T, baseColor); break
      case TileType.Deco_Bench: this.pxBench(ctx, T, baseColor); break
      case TileType.Deco_Garden: this.pxGarden(ctx, T, baseColor); break
      case TileType.Deco_Signpost: this.pxSignpost(ctx, T, baseColor); break
      case TileType.Deco_Barrel: this.pxBarrel(ctx, T, baseColor); break
      case TileType.Deco_Crate: this.pxCrate(ctx, T, baseColor); break
      case TileType.Deco_Torch: this.pxTorch(ctx, T, baseColor); break
      case TileType.Deco_Anvil: this.pxAnvil(ctx, T, baseColor); break
      default: return null
    }
    return canvas
  }

  // =====================================================
  // 地面系列（64×64 像素纹理）
  // =====================================================

  /** 草地：多层绿色 + 草叶簇 + 零星野花 + 左上受光 */
  private pxGrass(ctx: CanvasRenderingContext2D, T: number): void {
    const rnd = this.pxRand(0x6A5C)
    // 基色（三块深浅渐变）
    ctx.fillStyle = '#3a7d2a'
    ctx.fillRect(0, 0, T, T)
    ctx.fillStyle = 'rgba(0,0,0,0.10)'
    ctx.fillRect(0, 0, T, 26)
    // 色斑
    const patchColors = ['#2d6a1f', '#4a9430', '#357a24', '#53a038', '#2b5f1d']
    for (let i = 0; i < 30; i++) {
      ctx.fillStyle = patchColors[Math.floor(rnd() * patchColors.length)]
      const s = 2 + Math.floor(rnd() * 3)
      ctx.fillRect(Math.floor(rnd() * T), Math.floor(rnd() * T), s, s)
    }
    // 草叶簇（像素草叶）
    const tuftColors = ['#63b540', '#3d8a28', '#57b03a']
    for (let i = 0; i < 9; i++) {
      const gx = 4 + Math.floor(rnd() * (T - 12))
      const gy = 4 + Math.floor(rnd() * (T - 12))
      ctx.fillStyle = tuftColors[Math.floor(rnd() * tuftColors.length)]
      ctx.fillRect(gx, gy, 2, 3)
      ctx.fillRect(gx + 3, gy + 1, 2, 2)
      ctx.fillRect(gx + 6, gy, 2, 3)
      ctx.fillRect(gx + 1, gy - 2, 2, 2)
    }
    // 野花（白/黄/粉点）
    const flowerColors = ['#ffffff', '#ffd94a', '#ff88bb']
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = flowerColors[Math.floor(rnd() * flowerColors.length)]
      const fx = 4 + Math.floor(rnd() * (T - 8))
      const fy = 4 + Math.floor(rnd() * (T - 8))
      ctx.fillRect(fx, fy, 2, 2)
      ctx.fillRect(fx - 1, fy + 1, 4, 1)
    }
    // 光照（左上亮、右下暗）
    const light = ctx.createLinearGradient(0, 0, T, T)
    light.addColorStop(0, 'rgba(255,255,200,0.10)')
    light.addColorStop(0.5, 'rgba(255,255,200,0)')
    light.addColorStop(1, 'rgba(0,0,0,0.12)')
    ctx.fillStyle = light
    ctx.fillRect(0, 0, T, T)
  }

  /** 泥地：土黄渐变 + 细碎石 + 脚印凹陷 */
  private pxDirt(ctx: CanvasRenderingContext2D, T: number): void {
    const rnd = this.pxRand(0xD17E)
    ctx.fillStyle = '#8b6914'
    ctx.fillRect(0, 0, T, T)
    ctx.fillStyle = '#7a5a12'
    ctx.fillRect(0, 0, T, 22)
    ctx.fillStyle = '#6b4f12'
    ctx.fillRect(0, 42, T, 22)
    // 碎石
    for (let i = 0; i < 10; i++) {
      ctx.fillStyle = rnd() > 0.5 ? '#a8853a' : '#6e5a2a'
      ctx.fillRect(Math.floor(rnd() * T), Math.floor(rnd() * T), 3 + Math.floor(rnd() * 3), 2 + Math.floor(rnd() * 2))
    }
    // 凹陷
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = 'rgba(0,0,0,0.18)'
      ctx.fillRect(Math.floor(rnd() * T), Math.floor(rnd() * T), 8, 3)
      ctx.fillStyle = 'rgba(255,240,180,0.12)'
      ctx.fillRect(Math.floor(rnd() * T), Math.floor(rnd() * T), 8, 2)
    }
    const light = ctx.createLinearGradient(0, 0, T, T)
    light.addColorStop(0, 'rgba(255,240,180,0.10)')
    light.addColorStop(1, 'rgba(0,0,0,0.14)')
    ctx.fillStyle = light
    ctx.fillRect(0, 0, T, T)
  }

  /** 星象魔法地砖（广场）：蓝紫石砖 + 金色符文线 + 星点 */
  private pxMagicStone(ctx: CanvasRenderingContext2D, T: number): void {
    ctx.fillStyle = '#6a6a8a'
    ctx.fillRect(0, 0, T, T)
    // 4块大石砖（错缝，蓝紫调）
    ctx.fillStyle = '#5a5a7a'
    ctx.fillRect(0, 0, 30, 30)
    ctx.fillRect(34, 0, 30, 30)
    ctx.fillRect(16, 34, 30, 30)
    ctx.fillRect(0, 34, 14, 30)
    ctx.fillRect(48, 34, 16, 30)
    // 砖块渐变（每块左上亮右下暗）
    const brickLight = ['#7a7a9a', '#72729a']
    const brickDark = ['#4a4a6a', '#454565']
    for (let i = 0; i < 5; i++) {
      const bx = [0, 34, 16, 0, 48][i]
      const by = i < 2 ? 0 : 34
      const bw = [30, 30, 30, 14, 16][i]
      ctx.fillStyle = brickLight[i % 2]
      ctx.fillRect(bx + 1, by + 1, bw - 2, 3)
      ctx.fillStyle = brickDark[i % 2]
      ctx.fillRect(bx + 1, by + 27, bw - 2, 3)
    }
    // 接缝
    ctx.fillStyle = '#3a3a52'
    ctx.fillRect(0, 30, T, 4)
    ctx.fillRect(30, 0, 4, 30)
    ctx.fillRect(14, 34, 4, 30)
    // 金色符文线（磨亮嵌线）
    ctx.fillStyle = 'rgba(255,215,110,0.55)'
    ctx.fillRect(2, 2, 6, 1)
    ctx.fillRect(40, 6, 10, 1)
    ctx.fillRect(24, 42, 12, 1)
    ctx.fillRect(50, 40, 6, 1)
    // 星点（微光）
    const starX = [10, 44, 20, 56, 8, 36]
    const starY = [14, 22, 48, 50, 54, 8]
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = 'rgba(180,220,255,0.7)'
      ctx.fillRect(starX[i], starY[i], 2, 2)
      ctx.fillStyle = 'rgba(180,220,255,0.25)'
      ctx.fillRect(starX[i] - 1, starY[i] - 1, 4, 4)
    }
    // 全局受光
    const light = ctx.createLinearGradient(0, 0, T, T)
    light.addColorStop(0, 'rgba(255,240,220,0.12)')
    light.addColorStop(1, 'rgba(0,0,20,0.18)')
    ctx.fillStyle = light
    ctx.fillRect(0, 0, T, T)
  }

  /** 卵石小路：圆润卵石 + 土缝 + 边缘微过渡 */
  private pxCobblePath(ctx: CanvasRenderingContext2D, T: number): void {
    const rnd = this.pxRand(0xC08B)
    ctx.fillStyle = '#a08a60'
    ctx.fillRect(0, 0, T, T)
    // 卵石（错落铺满，各色）
    const pebbles = ['#b8a482', '#8d7a58', '#c4b290', '#96825e', '#a89874']
    for (let i = 0; i < 14; i++) {
      const px = 2 + Math.floor(rnd() * (T - 12))
      const py = 2 + Math.floor(rnd() * (T - 10))
      const pw = 7 + Math.floor(rnd() * 5)
      ctx.fillStyle = pebbles[Math.floor(rnd() * pebbles.length)]
      ctx.beginPath()
      ctx.ellipse(px + pw / 2, py + 3, pw / 2, 3.5, 0, 0, Math.PI * 2)
      ctx.fill()
      // 卵石高光（左上）
      ctx.fillStyle = 'rgba(255,240,210,0.35)'
      ctx.beginPath()
      ctx.ellipse(px + pw / 2 - 2, py + 1, pw * 0.18, 1.5, 0, 0, Math.PI * 2)
      ctx.fill()
    }
    // 土缝（卵石间隙的深色）
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = 'rgba(0,0,0,0.15)'
      ctx.fillRect(Math.floor(rnd() * T), Math.floor(rnd() * T), 4 + Math.floor(rnd() * 4), 2)
    }
    const light = ctx.createLinearGradient(0, 0, T, T)
    light.addColorStop(0, 'rgba(255,240,200,0.12)')
    light.addColorStop(1, 'rgba(0,0,0,0.14)')
    ctx.fillStyle = light
    ctx.fillRect(0, 0, T, T)
  }

  /** 水面：深蓝渐变 + 波光横线 + 微浪 */
  private pxWater(ctx: CanvasRenderingContext2D, T: number): void {
    const rnd = this.pxRand(0xA0E)
    const g = ctx.createLinearGradient(0, 0, 0, T)
    g.addColorStop(0, '#2a5599')
    g.addColorStop(0.5, '#2255aa')
    g.addColorStop(1, '#1a4070')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, T, T)
    // 波光横线（亮）
    for (let i = 0; i < 5; i++) {
      const wy = 4 + Math.floor(rnd() * (T - 10))
      ctx.fillStyle = 'rgba(180,220,255,0.35)'
      ctx.fillRect(Math.floor(rnd() * 20), wy, 14 + Math.floor(rnd() * 10), 2)
      ctx.fillStyle = 'rgba(180,220,255,0.15)'
      ctx.fillRect(Math.floor(rnd() * 30), wy + 4, 10 + Math.floor(rnd() * 8), 2)
    }
    // 深水波纹（暗）
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = 'rgba(0,0,40,0.2)'
      ctx.fillRect(Math.floor(rnd() * T), Math.floor(rnd() * T), 12, 2)
    }
    // 水面高光带
    ctx.fillStyle = 'rgba(255,255,255,0.10)'
    ctx.fillRect(0, T * 0.35, T, 3)
  }

  /** 木桥：横向厚木板 + 木纹 + 两侧桥沿 */
  private pxBridge(ctx: CanvasRenderingContext2D, T: number): void {
    ctx.fillStyle = '#6b4423'
    ctx.fillRect(0, 0, T, T)
    // 木板（3块横向）
    ctx.fillStyle = '#7a5230'
    ctx.fillRect(0, 2, T, 18)
    ctx.fillRect(0, 24, T, 18)
    ctx.fillRect(0, 46, T, 16)
    // 木板接缝
    ctx.fillStyle = '#4a2c14'
    ctx.fillRect(0, 20, T, 4)
    ctx.fillRect(0, 42, T, 4)
    // 木纹
    ctx.strokeStyle = 'rgba(0,0,0,0.22)'
    ctx.lineWidth = 1
    for (let y = 6; y < T; y += 10) {
      ctx.beginPath()
      ctx.moveTo(2, y)
      ctx.lineTo(T - 2, y + 2)
      ctx.stroke()
    }
    // 木板明暗（随机深浅板）
    const rnd = this.pxRand(0xB0A7)
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = rnd() > 0.5 ? 'rgba(255,230,180,0.08)' : 'rgba(0,0,0,0.10)'
      ctx.fillRect(Math.floor(rnd() * T), Math.floor(rnd() * T), 6 + Math.floor(rnd() * 8), 10)
    }
    // 桥沿亮线
    ctx.fillStyle = 'rgba(255,235,190,0.3)'
    ctx.fillRect(0, 2, T, 2)
    // 木节
    ctx.fillStyle = 'rgba(0,0,0,0.3)'
    ctx.beginPath()
    ctx.ellipse(20, 30, 4, 2.5, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.ellipse(46, 55, 3, 2, 0, 0, Math.PI * 2)
    ctx.fill()
  }

  /** 沙地：沙黄 + 细波纹 + 亮点 */
  private pxSand(ctx: CanvasRenderingContext2D, T: number): void {
    const rnd = this.pxRand(0x5A0D)
    ctx.fillStyle = '#c2b280'
    ctx.fillRect(0, 0, T, T)
    // 沙粒
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = rnd() > 0.5 ? 'rgba(255,240,200,0.4)' : 'rgba(0,0,0,0.12)'
      ctx.fillRect(Math.floor(rnd() * T), Math.floor(rnd() * T), 2, 2)
    }
    // 风纹
    ctx.strokeStyle = 'rgba(120,100,60,0.4)'
    ctx.lineWidth = 1
    for (let i = 0; i < 4; i++) {
      const y = 8 + Math.floor(rnd() * (T - 16))
      ctx.beginPath()
      ctx.moveTo(4, y)
      ctx.bezierCurveTo(T * 0.3, y + 4, T * 0.6, y - 4, T - 4, y)
      ctx.stroke()
    }
    const light = ctx.createLinearGradient(0, 0, T, T)
    light.addColorStop(0, 'rgba(255,245,210,0.12)')
    light.addColorStop(1, 'rgba(60,40,10,0.10)')
    ctx.fillStyle = light
    ctx.fillRect(0, 0, T, T)
  }

  /** 木地板（室内）：横板 + 木纹 + 节疤 + 接缝 */
  private pxWoodFloor(ctx: CanvasRenderingContext2D, T: number): void {
    ctx.fillStyle = '#966f33'
    ctx.fillRect(0, 0, T, T)
    ctx.fillStyle = '#8a6228'
    ctx.fillRect(0, 20, T, 4)
    ctx.fillRect(0, 42, T, 4)
    ctx.fillStyle = '#7a5520'
    ctx.fillRect(0, 46, T, 18)
    // 木纹线
    ctx.strokeStyle = 'rgba(0,0,0,0.2)'
    ctx.lineWidth = 1
    for (let y = 5; y < T; y += 9) {
      ctx.beginPath()
      ctx.moveTo(2, y)
      ctx.lineTo(T - 2, y + 1)
      ctx.stroke()
    }
    // 节疤
    ctx.fillStyle = '#6b4a1a'
    ctx.fillRect(14, 12, 6, 4)
    ctx.fillRect(42, 34, 6, 4)
    ctx.fillStyle = '#4a3310'
    ctx.fillRect(16, 13, 2, 2)
    // 受光
    ctx.fillStyle = 'rgba(255,235,180,0.14)'
    ctx.fillRect(0, 0, T, 3)
    ctx.fillStyle = 'rgba(0,0,0,0.16)'
    ctx.fillRect(0, T - 5, T, 5)
  }

  // =====================================================
  // 装饰系列（64×64 像素精灵，立在地面之上）
  // =====================================================

  /** 树：立体树冠（多层）+ 树干 + 投影 + 高光 */
  private pxTree(ctx: CanvasRenderingContext2D, T: number, _base: number): void {
    // 地面投影
    ctx.fillStyle = 'rgba(0,20,0,0.22)'
    ctx.beginPath()
    ctx.ellipse(T / 2, T - 4, 22, 7, 0, 0, Math.PI * 2)
    ctx.fill()
    // 树干（立体：左亮右暗）
    ctx.fillStyle = '#5a3a1e'
    ctx.fillRect(T / 2 - 6, T - 30, 12, 26)
    ctx.fillStyle = '#7a5230'
    ctx.fillRect(T / 2 - 6, T - 30, 5, 26)
    ctx.fillStyle = '#4a2c14'
    ctx.fillRect(T / 2 + 1, T - 30, 5, 26)
    // 树根
    ctx.fillStyle = '#5a3a1e'
    ctx.fillRect(T / 2 - 10, T - 8, 8, 4)
    ctx.fillRect(T / 2 + 3, T - 8, 8, 4)
    // 树冠（多簇圆形，主色 + 亮/暗变体）
    const clusters: Array<[number, number, number, string]> = [
      [T / 2, 18, 22, '#2d6a1f'],
      [T / 2 - 14, 14, 14, '#3d8a28'],
      [T / 2 + 14, 14, 14, '#265a1a'],
      [T / 2 - 6, 8, 13, '#357a24'],
      [T / 2 + 4, 10, 12, '#4a9430'],
      [T / 2, 20, 16, '#1f4a17'],
    ]
    for (const [cx, cy, cr, col] of clusters) {
      ctx.fillStyle = col
      ctx.beginPath()
      ctx.arc(cx, cy, cr, 0, Math.PI * 2)
      ctx.fill()
    }
    // 叶簇高光（左上）
    ctx.fillStyle = 'rgba(160,230,120,0.35)'
    ctx.beginPath()
    ctx.arc(T / 2 - 8, 8, 7, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.arc(T / 2 - 16, 11, 4, 0, Math.PI * 2)
    ctx.fill()
    // 叶簇暗部（右下）
    ctx.fillStyle = 'rgba(0,30,0,0.25)'
    ctx.beginPath()
    ctx.arc(T / 2 + 12, 24, 8, 0, Math.PI * 2)
    ctx.fill()
    // 零星果实
    ctx.fillStyle = '#ffd94a'
    ctx.fillRect(T / 2 - 16, 14, 3, 3)
    ctx.fillRect(T / 2 + 8, 12, 3, 3)
  }

  /** 灌木：圆球丛 + 高光 + 投影 */
  private pxBush(ctx: CanvasRenderingContext2D, T: number, base: number): void {
    ctx.fillStyle = 'rgba(0,20,0,0.2)'
    ctx.beginPath()
    ctx.ellipse(T / 2, T - 6, 20, 6, 0, 0, Math.PI * 2)
    ctx.fill()
    // 球丛
    const blobs: Array<[number, number, number, number]> = [
      [T / 2, 22, 16, 0.9],
      [T / 2 - 12, 20, 12, 1.1],
      [T / 2 + 12, 20, 12, 0.8],
      [T / 2, 12, 11, 1.0],
    ]
    for (const [cx, cy, cr, f] of blobs) {
      ctx.fillStyle = this.pxShadeStr(base, f)
      ctx.beginPath()
      ctx.arc(cx, cy, cr, 0, Math.PI * 2)
      ctx.fill()
    }
    // 高光
    ctx.fillStyle = 'rgba(190,255,150,0.3)'
    ctx.beginPath()
    ctx.arc(T / 2 - 10, 8, 6, 0, Math.PI * 2)
    ctx.fill()
    // 小红果
    ctx.fillStyle = '#ff6666'
    ctx.fillRect(T / 2 + 8, 14, 3, 3)
    ctx.fillRect(T / 2 - 14, 16, 3, 3)
  }

  /** 岩石：立体多面石 + 裂纹 + 苔藓 */
  private pxRock(ctx: CanvasRenderingContext2D, T: number, base: number): void {
    ctx.fillStyle = 'rgba(0,0,0,0.2)'
    ctx.beginPath()
    ctx.ellipse(T / 2, T - 5, 22, 6, 0, 0, Math.PI * 2)
    ctx.fill()
    // 主石体（多边形）
    ctx.fillStyle = this.pxShadeStr(base, 1.0)
    ctx.beginPath()
    ctx.moveTo(T / 2 - 20, T - 10)
    ctx.lineTo(T / 2 - 16, 22)
    ctx.lineTo(T / 2 - 4, 12)
    ctx.lineTo(T / 2 + 10, 18)
    ctx.lineTo(T / 2 + 22, T - 12)
    ctx.closePath()
    ctx.fill()
    // 亮面（左）
    ctx.fillStyle = this.pxShadeStr(base, 1.35)
    ctx.beginPath()
    ctx.moveTo(T / 2 - 16, 22)
    ctx.lineTo(T / 2 - 4, 12)
    ctx.lineTo(T / 2 - 2, T - 12)
    ctx.lineTo(T / 2 - 18, T - 12)
    ctx.closePath()
    ctx.fill()
    // 暗面（右）
    ctx.fillStyle = this.pxShadeStr(base, 0.6)
    ctx.beginPath()
    ctx.moveTo(T / 2 - 2, T - 12)
    ctx.lineTo(T / 2 + 10, 18)
    ctx.lineTo(T / 2 + 22, T - 12)
    ctx.closePath()
    ctx.fill()
    // 裂纹
    ctx.strokeStyle = 'rgba(0,0,0,0.3)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(T / 2 - 8, 20)
    ctx.lineTo(T / 2 - 4, 34)
    ctx.lineTo(T / 2 - 10, 44)
    ctx.stroke()
    // 苔藓
    ctx.fillStyle = 'rgba(60,120,60,0.6)'
    ctx.fillRect(T / 2 - 20, T - 14, 14, 5)
    ctx.fillRect(T / 2 + 8, T - 12, 10, 4)
  }

  /** 花丛：多彩花朵 + 花茎 + 叶 */
  private pxFlower(ctx: CanvasRenderingContext2D, T: number, _base: number): void {
    // 地影
    ctx.fillStyle = 'rgba(0,20,0,0.18)'
    ctx.beginPath()
    ctx.ellipse(T / 2, T - 5, 22, 6, 0, 0, Math.PI * 2)
    ctx.fill()
    const cols = [0xff6699, 0xffd94a, 0xffffff, 0xaa66dd, 0x66aadd]
    const spots: Array<[number, number]> = [
      [T / 2 - 12, T - 18], [T / 2 + 2, T - 26], [T / 2 + 14, T - 16],
      [T / 2 - 20, T - 12], [T / 2 + 20, T - 12],
    ]
    for (let i = 0; i < spots.length; i++) {
      const [fx, fy] = spots[i]
      // 茎
      ctx.fillStyle = '#2d6a2d'
      ctx.fillRect(fx, fy, 2, T - fy - 4)
      // 叶
      ctx.fillStyle = '#3d8a3d'
      ctx.fillRect(fx - 3, fy + 6, 8, 3)
      // 花
      const c = this.pxShadeStr(cols[i % cols.length], 1.0)
      ctx.fillStyle = c
      ctx.fillRect(fx - 4, fy - 4, 9, 5)
      ctx.fillRect(fx - 2, fy - 6, 5, 9)
      ctx.fillStyle = '#ffd94a'
      ctx.fillRect(fx - 1, fy - 2, 3, 3)
      ctx.fillStyle = 'rgba(255,255,255,0.4)'
      ctx.fillRect(fx - 3, fy - 3, 3, 2)
    }
  }

  /** 魔法喷泉（广场）：星蓝水池 + 中央浮空水晶 + 魔法光晕 + 符文环 */
  private pxMagicFountain(ctx: CanvasRenderingContext2D, T: number, _base: number): void {
    // 地影
    ctx.fillStyle = 'rgba(0,10,40,0.3)'
    ctx.beginPath()
    ctx.ellipse(T / 2, T - 5, 26, 8, 0, 0, Math.PI * 2)
    ctx.fill()
    // 水池（圆台，双层）
    ctx.fillStyle = '#4a4a6a'
    ctx.beginPath()
    ctx.ellipse(T / 2, T - 12, 22, 9, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#6a6a8a'
    ctx.beginPath()
    ctx.ellipse(T / 2, T - 14, 22, 9, 0, 0, Math.PI * 2)
    ctx.fill()
    // 池内水面（星蓝）
    ctx.fillStyle = '#2a4a8a'
    ctx.beginPath()
    ctx.ellipse(T / 2, T - 15, 16, 6, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = 'rgba(120,200,255,0.5)'
    ctx.fillRect(T / 2 - 10, T - 18, 7, 2)
    // 中央基座（符文）
    ctx.fillStyle = '#7a7a9a'
    ctx.fillRect(T / 2 - 5, T - 26, 10, 8)
    ctx.fillStyle = '#5a5a7a'
    ctx.fillRect(T / 2 - 5, T - 26, 10, 3)
    ctx.fillStyle = '#ffd94a'
    ctx.fillRect(T / 2 - 2, T - 22, 4, 2)
    // 中央浮空水晶（菱形发光）
    ctx.fillStyle = '#88ddff'
    ctx.beginPath()
    ctx.moveTo(T / 2, T - 48)
    ctx.lineTo(T / 2 + 8, T - 34)
    ctx.lineTo(T / 2, T - 20)
    ctx.lineTo(T / 2 - 8, T - 34)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,0.6)'
    ctx.beginPath()
    ctx.moveTo(T / 2, T - 46)
    ctx.lineTo(T / 2 + 4, T - 35)
    ctx.lineTo(T / 2, T - 34)
    ctx.lineTo(T / 2 - 2, T - 40)
    ctx.closePath()
    ctx.fill()
    // 魔法光晕
    const glow = ctx.createRadialGradient(T / 2, T - 34, 2, T / 2, T - 34, 20)
    glow.addColorStop(0, 'rgba(120,200,255,0.35)')
    glow.addColorStop(1, 'rgba(120,200,255,0)')
    ctx.fillStyle = glow
    ctx.fillRect(T / 2 - 20, T - 54, 40, 40)
    // 水珠（上升）
    ctx.fillStyle = '#aaddff'
    ctx.fillRect(T / 2 - 14, T - 38, 3, 3)
    ctx.fillRect(T / 2 + 10, T - 42, 3, 3)
    ctx.fillRect(T / 2 - 4, T - 52, 2, 3)
  }

  /** 魔法水晶灯柱：黑金杆 + 发光水晶球 */
  private pxMagicLamp(ctx: CanvasRenderingContext2D, T: number, _base: number): void {
    ctx.fillStyle = 'rgba(0,0,0,0.2)'
    ctx.beginPath()
    ctx.ellipse(T / 2, T - 5, 14, 5, 0, 0, Math.PI * 2)
    ctx.fill()
    // 基座
    ctx.fillStyle = '#3a3a3a'
    ctx.fillRect(T / 2 - 8, T - 10, 16, 6)
    ctx.fillStyle = '#555'
    ctx.fillRect(T / 2 - 8, T - 10, 16, 2)
    // 灯杆
    ctx.fillStyle = '#4a3520'
    ctx.fillRect(T / 2 - 3, 14, 6, T - 22)
    ctx.fillStyle = 'rgba(255,230,180,0.25)'
    ctx.fillRect(T / 2 - 3, 14, 3, T - 22)
    ctx.fillStyle = 'rgba(0,0,0,0.3)'
    ctx.fillRect(T / 2, 14, 3, T - 22)
    // 灯臂（弯曲）
    ctx.fillStyle = '#4a3520'
    ctx.fillRect(T / 2 - 3, 18, 14, 4)
    ctx.fillRect(T / 2 - 3, 24, 14, 4)
    // 水晶球（发光）
    ctx.fillStyle = '#88ddff'
    ctx.beginPath()
    ctx.arc(T / 2 + 8, 12, 7, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,0.7)'
    ctx.beginPath()
    ctx.arc(T / 2 + 5, 10, 3, 0, Math.PI * 2)
    ctx.fill()
    const glow = ctx.createRadialGradient(T / 2 + 8, 12, 1, T / 2 + 8, 12, 16)
    glow.addColorStop(0, 'rgba(140,220,255,0.4)')
    glow.addColorStop(1, 'rgba(140,220,255,0)')
    ctx.fillStyle = glow
    ctx.fillRect(T / 2 - 8, -4, 32, 32)
  }

  /** 石井：井沿石 + 井口 + 绳架 */
  private pxWell(ctx: CanvasRenderingContext2D, T: number, _base: number): void {
    ctx.fillStyle = 'rgba(0,0,0,0.22)'
    ctx.beginPath()
    ctx.ellipse(T / 2, T - 5, 22, 7, 0, 0, Math.PI * 2)
    ctx.fill()
    // 井身（石圈）
    ctx.fillStyle = '#7a7a84'
    ctx.beginPath()
    ctx.arc(T / 2, T - 16, 16, 0, Math.PI)
    ctx.fillRect(T / 2 - 16, T - 34, 32, 22)
    ctx.fill()
    ctx.fillStyle = '#8a8a94'
    ctx.beginPath()
    ctx.arc(T / 2, T - 18, 14, 0, Math.PI)
    ctx.fillRect(T / 2 - 14, T - 32, 28, 18)
    ctx.fill()
    // 井口（暗）
    ctx.fillStyle = '#1a1a24'
    ctx.beginPath()
    ctx.ellipse(T / 2, T - 18, 9, 4, 0, 0, Math.PI * 2)
    ctx.fill()
    // 井沿高光
    ctx.fillStyle = 'rgba(255,255,255,0.2)'
    ctx.fillRect(T / 2 - 10, T - 30, 20, 3)
    // 绳架
    ctx.fillStyle = '#5a3a1e'
    ctx.fillRect(T / 2 - 2, 8, 5, T - 24)
    ctx.fillRect(T / 2 - 12, 8, 24, 5)
    ctx.fillStyle = '#4a2c14'
    ctx.fillRect(T / 2 - 12, 8, 24, 2)
    // 桶
    ctx.fillStyle = '#7a5230'
    ctx.fillRect(T / 2 + 6, T - 34, 10, 10)
    ctx.fillStyle = '#5a3a1e'
    ctx.fillRect(T / 2 + 6, T - 34, 10, 2)
    // 绳
    ctx.strokeStyle = '#8a6a3a'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(T / 2, 12)
    ctx.lineTo(T / 2 + 11, T - 34)
    ctx.stroke()
  }

  /** 长椅：立体木椅（座板+靠背+扶手） */
  private pxBench(ctx: CanvasRenderingContext2D, T: number, _base: number): void {
    ctx.fillStyle = 'rgba(0,0,0,0.2)'
    ctx.beginPath()
    ctx.ellipse(T / 2, T - 6, 22, 7, 0, 0, Math.PI * 2)
    ctx.fill()
    // 座板
    ctx.fillStyle = '#6b4a1a'
    ctx.fillRect(T / 2 - 20, T - 16, 40, 7)
    ctx.fillStyle = 'rgba(255,230,180,0.2)'
    ctx.fillRect(T / 2 - 20, T - 16, 40, 2)
    // 靠背（后）
    ctx.fillStyle = '#5a3a1e'
    ctx.fillRect(T / 2 - 20, T - 30, 40, 6)
    ctx.fillRect(T / 2 - 20, T - 24, 40, 3)
    // 靠背立柱
    ctx.fillStyle = '#4a2c14'
    ctx.fillRect(T / 2 - 19, T - 30, 5, 14)
    ctx.fillRect(T / 2 + 14, T - 30, 5, 14)
    // 腿
    ctx.fillStyle = '#4a2c14'
    ctx.fillRect(T / 2 - 18, T - 8, 5, 6)
    ctx.fillRect(T / 2 + 13, T - 8, 5, 6)
    // 扶手（前）
    ctx.fillStyle = '#5a3a1e'
    ctx.fillRect(T / 2 + 12, T - 22, 4, 12)
    // 座椅受光
    ctx.fillStyle = 'rgba(255,240,200,0.12)'
    ctx.fillRect(T / 2 - 20, T - 16, 14, 2)
  }

  /** 花圃：土畦 + 彩色花列 */
  private pxGarden(ctx: CanvasRenderingContext2D, T: number, _base: number): void {
    ctx.fillStyle = '#5a3a20'
    ctx.fillRect(8, T - 18, T - 16, 12)
    ctx.fillStyle = '#7a5230'
    ctx.fillRect(8, T - 18, T - 16, 3)
    // 花列
    const cols = [0xff6699, 0xffd94a, 0xaa66dd, 0xff8844, 0x66aadd]
    for (let i = 0; i < 5; i++) {
      const fx = 14 + i * 9
      ctx.fillStyle = '#2d6a2d'
      ctx.fillRect(fx, T - 26, 3, 9)
      ctx.fillStyle = this.pxShadeStr(cols[i], 1)
      ctx.fillRect(fx - 3, T - 30, 9, 6)
      ctx.fillStyle = '#ffd94a'
      ctx.fillRect(fx - 1, T - 28, 3, 3)
    }
    // 土粒
    ctx.fillStyle = 'rgba(0,0,0,0.2)'
    ctx.fillRect(10, T - 10, 4, 2)
    ctx.fillRect(40, T - 8, 4, 2)
  }

  /** 木路牌：立柱 + 牌面 + 箭头 */
  private pxSignpost(ctx: CanvasRenderingContext2D, T: number, _base: number): void {
    ctx.fillStyle = 'rgba(0,0,0,0.18)'
    ctx.beginPath()
    ctx.ellipse(T / 2, T - 5, 14, 5, 0, 0, Math.PI * 2)
    ctx.fill()
    // 立柱
    ctx.fillStyle = '#5a3a1e'
    ctx.fillRect(T / 2 - 3, 16, 6, T - 20)
    ctx.fillStyle = 'rgba(255,230,180,0.2)'
    ctx.fillRect(T / 2 - 3, 16, 3, T - 20)
    // 牌面
    ctx.fillStyle = '#7a5230'
    ctx.fillRect(T / 2 - 14, 12, 34, 20)
    ctx.fillStyle = '#c9b98a'
    ctx.fillRect(T / 2 - 11, 15, 28, 14)
    // 箭头（左 + 右）
    ctx.fillStyle = '#5a3a1e'
    ctx.fillRect(T / 2 - 8, 19, 16, 3)
    ctx.fillRect(T / 2 - 8, 19, 4, 2)
    ctx.fillRect(T / 2 + 4, 19, 4, 2)
    ctx.fillStyle = '#5a3a1e'
    ctx.beginPath()
    ctx.moveTo(T / 2 - 8, 17)
    ctx.lineTo(T / 2 - 13, 20.5)
    ctx.lineTo(T / 2 - 8, 24)
    ctx.closePath()
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(T / 2 + 8, 17)
    ctx.lineTo(T / 2 + 13, 20.5)
    ctx.lineTo(T / 2 + 8, 24)
    ctx.closePath()
    ctx.fill()
  }

  /** 木桶：立体圆桶 + 木箍 */
  private pxBarrel(ctx: CanvasRenderingContext2D, T: number, _base: number): void {
    ctx.fillStyle = 'rgba(0,0,0,0.2)'
    ctx.beginPath()
    ctx.ellipse(T / 2, T - 6, 16, 5, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#7a5230'
    ctx.beginPath()
    ctx.moveTo(T / 2 - 14, T - 30)
    ctx.quadraticCurveTo(T / 2 - 18, T - 18, T / 2 - 14, T - 6)
    ctx.lineTo(T / 2 + 14, T - 6)
    ctx.quadraticCurveTo(T / 2 + 18, T - 18, T / 2 + 14, T - 30)
    ctx.closePath()
    ctx.fill()
    // 木箍
    ctx.fillStyle = '#4a2c14'
    ctx.fillRect(T / 2 - 16, T - 26, 32, 5)
    ctx.fillRect(T / 2 - 16, T - 14, 32, 5)
    // 受光
    ctx.fillStyle = 'rgba(255,230,180,0.2)'
    ctx.beginPath()
    ctx.moveTo(T / 2 - 14, T - 30)
    ctx.quadraticCurveTo(T / 2 - 18, T - 18, T / 2 - 14, T - 6)
    ctx.lineTo(T / 2 - 6, T - 6)
    ctx.lineTo(T / 2 - 6, T - 30)
    ctx.closePath()
    ctx.fill()
    // 顶面
    ctx.fillStyle = '#8a6238'
    ctx.beginPath()
    ctx.ellipse(T / 2, T - 30, 13, 4, 0, 0, Math.PI * 2)
    ctx.fill()
  }

  /** 木箱：立体箱 + 木板 + 边角 */
  private pxCrate(ctx: CanvasRenderingContext2D, T: number, _base: number): void {
    ctx.fillStyle = 'rgba(0,0,0,0.2)'
    ctx.beginPath()
    ctx.ellipse(T / 2, T - 6, 18, 5, 0, 0, Math.PI * 2)
    ctx.fill()
    // 箱体
    ctx.fillStyle = '#8a6238'
    ctx.fillRect(T / 2 - 18, T - 30, 36, 24)
    // 亮面（左上）
    ctx.fillStyle = '#a07848'
    ctx.fillRect(T / 2 - 18, T - 30, 18, 24)
    // 暗面（右）
    ctx.fillStyle = '#6b4a24'
    ctx.fillRect(T / 2, T - 30, 18, 24)
    // 横木板
    ctx.fillStyle = '#5a3a1e'
    ctx.fillRect(T / 2 - 18, T - 22, 36, 3)
    // 竖缝
    ctx.fillRect(T / 2 - 6, T - 30, 3, 24)
    ctx.fillRect(T / 2 + 6, T - 30, 3, 24)
    // 顶面
    ctx.fillStyle = '#9a7444'
    ctx.beginPath()
    ctx.moveTo(T / 2 - 18, T - 30)
    ctx.lineTo(T / 2, T - 36)
    ctx.lineTo(T / 2 + 18, T - 30)
    ctx.lineTo(T / 2, T - 24)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = '#c0a068'
    ctx.beginPath()
    ctx.moveTo(T / 2 - 18, T - 30)
    ctx.lineTo(T / 2 - 6, T - 33)
    ctx.lineTo(T / 2, T - 30)
    ctx.lineTo(T / 2 - 12, T - 27)
    ctx.closePath()
    ctx.fill()
  }

  /** 火把：木柄 + 火苗 + 光晕 */
  private pxTorch(ctx: CanvasRenderingContext2D, T: number, _base: number): void {
    ctx.fillStyle = 'rgba(0,0,0,0.16)'
    ctx.beginPath()
    ctx.ellipse(T / 2, T - 5, 12, 4, 0, 0, Math.PI * 2)
    ctx.fill()
    // 木柄
    ctx.fillStyle = '#5a3a1e'
    ctx.fillRect(T / 2 - 4, 24, 8, T - 26)
    ctx.fillStyle = 'rgba(255,230,180,0.2)'
    ctx.fillRect(T / 2 - 4, 24, 4, T - 26)
    // 火苗
    ctx.fillStyle = '#ff8833'
    ctx.beginPath()
    ctx.moveTo(T / 2, 4)
    ctx.quadraticCurveTo(T / 2 + 10, 16, T / 2 + 6, 22)
    ctx.quadraticCurveTo(T / 2, 28, T / 2 - 6, 22)
    ctx.quadraticCurveTo(T / 2 - 10, 16, T / 2, 4)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = '#ffdd66'
    ctx.beginPath()
    ctx.moveTo(T / 2, 8)
    ctx.quadraticCurveTo(T / 2 + 6, 16, T / 2 + 3, 20)
    ctx.quadraticCurveTo(T / 2, 23, T / 2 - 3, 20)
    ctx.quadraticCurveTo(T / 2 - 6, 16, T / 2, 8)
    ctx.closePath()
    ctx.fill()
    // 光晕
    const glow = ctx.createRadialGradient(T / 2, 14, 2, T / 2, 14, 20)
    glow.addColorStop(0, 'rgba(255,180,80,0.4)')
    glow.addColorStop(1, 'rgba(255,180,80,0)')
    ctx.fillStyle = glow
    ctx.fillRect(T / 2 - 20, -6, 40, 40)
  }

  /** 铁砧：立体铁砧 */
  private pxAnvil(ctx: CanvasRenderingContext2D, T: number, _base: number): void {
    ctx.fillStyle = 'rgba(0,0,0,0.22)'
    ctx.beginPath()
    ctx.ellipse(T / 2, T - 6, 18, 6, 0, 0, Math.PI * 2)
    ctx.fill()
    // 底座
    ctx.fillStyle = '#4a4a52'
    ctx.fillRect(T / 2 - 16, T - 14, 32, 8)
    ctx.fillStyle = 'rgba(255,255,255,0.15)'
    ctx.fillRect(T / 2 - 16, T - 14, 32, 2)
    // 砧身
    ctx.fillStyle = '#5a5a64'
    ctx.fillRect(T / 2 - 12, T - 26, 24, 13)
    ctx.fillStyle = '#6a6a74'
    ctx.fillRect(T / 2 - 12, T - 26, 12, 13)
    // 砧面（亮）
    ctx.fillStyle = '#8a8a94'
    ctx.fillRect(T / 2 - 14, T - 30, 28, 5)
    ctx.fillStyle = '#9a9aa4'
    ctx.fillRect(T / 2 - 14, T - 30, 14, 5)
    // 尖角（锤击面）
    ctx.fillStyle = '#6a6a74'
    ctx.beginPath()
    ctx.moveTo(T / 2 + 10, T - 30)
    ctx.lineTo(T / 2 + 18, T - 26)
    ctx.lineTo(T / 2 + 14, T - 25)
    ctx.lineTo(T / 2 + 10, T - 25)
    ctx.closePath()
    ctx.fill()
    // 高光
    ctx.fillStyle = 'rgba(255,255,255,0.3)'
    ctx.fillRect(T / 2 - 10, T - 29, 8, 2)
  }

  // =====================================================
  // 像素工具
  // =====================================================

  /** 固定种子伪随机 */
  private pxRand(seed: number): () => number {
    let s = seed
    return () => {
      s = (s * 1103515245 + 12345) & 0x7fffffff
      return s / 0x7fffffff
    }
  }

  /** 颜色明暗（factor<1 暗，>1 亮）返回 #RRGGBB */
  private pxShadeStr(color: number, factor: number): string {
    const r = Math.max(0, Math.min(255, Math.round(((color >> 16) & 0xff) * factor)))
    const g = Math.max(0, Math.min(255, Math.round(((color >> 8) & 0xff) * factor)))
    const b = Math.max(0, Math.min(255, Math.round((color & 0xff) * factor)))
    return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')
  }

  /**
   * 注册 AI 地面母图（512×512 无缝纹理，由 PreloadScene 经 TILE_TEXTURES 加载）
   * @returns 母图纹理 key；失败返回 null
   */
  private tryRegisterGroundMaster(type: TileType, file: string): string | null {
    const imgKey = tileImageKey(file)
    if (!this.scene.textures.exists(imgKey)) return null
    this.groundMasters.set(type, imgKey)
    return imgKey
  }

  /**
   * 获取地面瓦片在 AI 母图中的纹理 key
   */
  getAiGroundMasterKey(type: TileType): string | null {
    return this.groundMasters.get(type) ?? null
  }

  /**
   * 检查指定类型是否已用 AI 地面母图
   */
  hasAiGround(type: TileType): boolean {
    return this.groundMasters.has(type)
  }

  /**
   * 尝试从外部 PNG 生成瓦片纹理
   * 将任意尺寸的外部图片缩放到 TILE_SIZE×TILE_SIZE（保持 1:1 原生清晰）
   * @returns 是否成功
   */
  private tryGenerateFromImage(_type: TileType, file: string, textureKey: string): boolean {
    const imgKey = tileImageKey(file)
    if (!this.scene.textures.exists(imgKey)) return false

    const source = this.scene.textures.get(imgKey).getSourceImage()
    if (!source) return false

    // 通过 Canvas 缩放到 64×64（提升低分辨率资源的清晰度，使用双线性插值）
    const canvas = document.createElement('canvas')
    canvas.width = TILE_SIZE
    canvas.height = TILE_SIZE
    const ctx = canvas.getContext('2d')
    if (!ctx) return false

    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.clearRect(0, 0, TILE_SIZE, TILE_SIZE)
    ctx.drawImage(source as CanvasImageSource, 0, 0, TILE_SIZE, TILE_SIZE)

    this.scene.textures.addCanvas(textureKey, canvas)
    return true
  }

  /**
   * 立体感增强：顶部受光渐变 + 底部阴影
   * 让程序化瓦片呈现统一的光照方向（左上光源，与星露谷风格一致）
   */
  private addTileShading(gfx: Phaser.GameObjects.Graphics): void {
    // 地面类与装饰类都适用；结构性内容（墙/门/家具）加阴影增强厚度感
    const T = TILE_SIZE
    // 顶部受光（微弱高光）
    gfx.fillStyle(0xffffff, 0.05)
    gfx.fillRect(0, 0, T, 3)
    // 底部阴影（增加落地感）
    gfx.fillStyle(0x000000, 0.12)
    gfx.fillRect(0, T - 5, T, 5)
    // 左侧微光（强化左上光源）
    gfx.fillStyle(0xffffff, 0.03)
    gfx.fillRect(0, 0, 3, T)
  }

  /**
   * 为特定 Tile 类型添加 64px 精细像素细节
   * 使用大色块+噪声点+渐变层次，保证 1920×1080 下画面细腻
   */
  private addTileDetails(gfx: Phaser.GameObjects.Graphics, type: TileType): void {
    const T = TILE_SIZE
    switch (type) {
      case TileType.Ground_Grass:
        // 草地：深浅绿噪点 + 草叶簇 + 零星野花
        this.noise(gfx, T, 0x3a7d2a, 0x1d4a17, 0x55a030, 90, type)
        // 草叶簇
        gfx.fillStyle(0x2d6a1f, 0.8)
        gfx.fillRect(8, 6, 3, 6)
        gfx.fillRect(14, 4, 3, 5)
        gfx.fillRect(40, 38, 3, 6)
        gfx.fillRect(48, 12, 3, 5)
        gfx.fillRect(24, 48, 3, 6)
        gfx.fillStyle(0x63b540, 0.7)
        gfx.fillRect(9, 8, 2, 4)
        gfx.fillRect(15, 6, 2, 3)
        gfx.fillRect(41, 40, 2, 4)
        // 野花
        gfx.fillStyle(0xffffff, 0.9)
        gfx.fillRect(30, 24, 2, 2)
        gfx.fillRect(54, 50, 2, 2)
        gfx.fillStyle(0xffd94a, 0.9)
        gfx.fillRect(30, 24, 2, 1)
        gfx.fillRect(54, 50, 2, 1)
        break
      case TileType.Ground_Dirt:
        // 泥土：土黄渐变 + 碎石 + 凹陷
        this.noise(gfx, T, 0x8b6914, 0x6b4f12, 0xa8853a, 70, type)
        gfx.fillStyle(0x7a5a12, 0.5)
        gfx.fillRect(10, 10, 6, 3)
        gfx.fillRect(42, 30, 6, 3)
        gfx.fillRect(26, 48, 6, 3)
        gfx.fillStyle(0x9a7a2a, 0.6)
        gfx.fillRect(12, 11, 3, 2)
        gfx.fillRect(44, 31, 3, 2)
        break
      case TileType.Ground_Stone:
        // 石板广场：大块石砖错缝 + 接缝阴影
        gfx.fillStyle(0x8a8a8a, 1)
        gfx.fillRect(0, 0, T, T)
        this.noise(gfx, T, 0x8a8a8a, 0x777777, 0x9a9a9a, 40, type)
        // 4块石砖 + 接缝
        gfx.fillStyle(0x666666, 0.9)
        gfx.fillRect(0, 30, T, 4)   // 水平接缝
        gfx.fillRect(30, 0, 4, 30)  // 竖直接缝（上半）
        gfx.fillRect(14, 34, 4, 30) // 竖直接缝（下半错缝）
        // 砖块高光
        gfx.fillStyle(0xaaaaaa, 0.25)
        gfx.fillRect(2, 2, 26, 3)
        gfx.fillRect(36, 2, 24, 3)
        gfx.fillRect(4, 36, 8, 3)
        break
      case TileType.Ground_Path:
        // 小路：踩实的土路 + 碎石 + 脚印凹陷（不像耕地垄沟）
        gfx.fillStyle(0xa08a60, 1)
        gfx.fillRect(0, 0, T, T)
        this.noise(gfx, T, 0xa08a60, 0x7d6a48, 0xbfa678, 45, type)
        // 碎石（浅色小石子随机散布）
        gfx.fillStyle(0xccb89a, 0.85)
        gfx.fillRect(6, 8, 5, 4)
        gfx.fillRect(38, 30, 5, 4)
        gfx.fillRect(50, 10, 4, 3)
        gfx.fillRect(16, 48, 4, 3)
        gfx.fillStyle(0x8a7450, 0.9)
        gfx.fillRect(28, 22, 4, 4)
        gfx.fillRect(48, 44, 4, 4)
        // 踩踏凹陷（松软土块）
        gfx.fillStyle(0x6f5c3e, 0.5)
        gfx.fillRect(20, 34, 8, 3)
        gfx.fillRect(44, 20, 8, 3)
        break
      case TileType.Ground_Wood:
        // 木地板：宽木条 + 木纹 + 节疤
        gfx.fillStyle(0x966f33, 1)
        gfx.fillRect(0, 0, T, T)
        // 3条横木板
        gfx.fillStyle(0x8a6228, 1)
        gfx.fillRect(0, 20, T, 4)
        gfx.fillRect(0, 42, T, 4)
        // 木纹线
        gfx.lineStyle(2, 0x7a5520, 0.35)
        gfx.lineBetween(4, 8, 56, 8)
        gfx.lineBetween(4, 30, 56, 30)
        gfx.lineBetween(4, 52, 56, 52)
        gfx.lineStyle(1, 0x6b4a1a, 0.3)
        gfx.lineBetween(8, 14, 52, 14)
        gfx.lineBetween(12, 36, 50, 36)
        // 节疤
        gfx.fillStyle(0x6b4a1a, 0.6)
        gfx.fillRect(14, 12, 6, 4)
        gfx.fillRect(42, 34, 6, 4)
        gfx.fillStyle(0x4a3310, 0.5)
        gfx.fillRect(16, 13, 2, 2)
        break
      case TileType.Wall_Stone:
        // 石墙：错缝砖块 + 明暗层次
        gfx.fillStyle(0x777777, 1)
        gfx.fillRect(0, 0, T, T)
        // 砖块（错缝）
        gfx.fillStyle(0x666666, 0.5)
        gfx.fillRect(0, 20, T, 22)
        // 砖缝
        gfx.fillStyle(0x3d3d3d, 0.8)
        gfx.fillRect(0, 20, T, 3)
        gfx.fillRect(0, 42, T, 3)
        gfx.fillRect(20, 0, 3, 20)
        gfx.fillRect(42, 0, 3, 20)
        gfx.fillRect(10, 23, 3, 19)
        gfx.fillRect(32, 23, 3, 19)
        gfx.fillRect(54, 23, 3, 19)
        // 砖块高光
        gfx.fillStyle(0x9a9a9a, 0.2)
        gfx.fillRect(2, 2, 16, 3)
        gfx.fillRect(24, 2, 16, 3)
        gfx.fillRect(46, 2, 14, 3)
        gfx.fillRect(2, 26, 6, 3)
        gfx.fillRect(24, 26, 6, 3)
        gfx.fillRect(46, 26, 6, 3)
        break
      case TileType.Wall_Wood:
        // 木墙：横板 + 铆钉
        gfx.fillStyle(0x7a5230, 1)
        gfx.fillRect(0, 0, T, T)
        gfx.lineStyle(3, 0x5a3a1e, 0.9)
        gfx.lineBetween(0, 16, T, 16)
        gfx.lineBetween(0, 32, T, 32)
        gfx.lineBetween(0, 48, T, 48)
        gfx.fillStyle(0x8a6238, 0.5)
        gfx.fillRect(0, 0, T, 5)
        // 铆钉
        gfx.fillStyle(0x333333, 0.8)
        gfx.fillRect(8, 12, 4, 4)
        gfx.fillRect(52, 28, 4, 4)
        gfx.fillRect(28, 44, 4, 4)
        break
      case TileType.Fence_Wood:
        // 木栅栏：竖桩 + 横梁
        gfx.fillStyle(0x8b6914, 1)
        gfx.fillRect(0, 0, T, T)
        gfx.fillStyle(0x6b4f12, 1)
        gfx.fillRect(4, 0, 6, T)
        gfx.fillRect(54, 0, 6, T)
        gfx.fillRect(0, 10, T, 8)
        gfx.fillRect(0, 38, T, 8)
        gfx.fillStyle(0xa8853a, 0.6)
        gfx.fillRect(0, 12, T, 3)
        gfx.fillRect(0, 40, T, 3)
        break
      case TileType.Wall_Castle:
        // 城堡墙：青石大砖 + 垛口
        gfx.fillStyle(0x777788, 1)
        gfx.fillRect(0, 0, T, T)
        gfx.fillStyle(0x555566, 0.6)
        gfx.fillRect(0, 24, T, 40)
        gfx.fillStyle(0x3d3d50, 0.8)
        gfx.fillRect(0, 24, T, 3)
        gfx.fillRect(16, 0, 3, 24)
        gfx.fillRect(48, 0, 3, 24)
        gfx.fillRect(8, 27, 3, 37)
        gfx.fillRect(40, 27, 3, 37)
        // 垛口（顶部）
        gfx.fillStyle(0x9999aa, 0.3)
        gfx.fillRect(0, 2, 14, 4)
        gfx.fillRect(32, 2, 14, 4)
        break
      case TileType.Building_Door:
        // 木门：竖板 + 门环 + 门框
        gfx.fillStyle(0x5a3a1e, 1)
        gfx.fillRect(0, 0, T, T)
        gfx.fillStyle(0x6b4423, 1)
        gfx.fillRect(4, 4, T - 8, T - 8)
        gfx.lineStyle(3, 0x3d2817, 0.8)
        gfx.lineBetween(10, 4, 10, T - 4)
        gfx.lineBetween(28, 4, 28, T - 4)
        gfx.lineBetween(46, 4, 46, T - 4)
        // 门环
        gfx.fillStyle(0xe8b93c, 1)
        gfx.fillRect(30, 30, 8, 8)
        gfx.fillStyle(0xcc9a2a, 1)
        gfx.fillRect(32, 32, 4, 4)
        break
      case TileType.Deco_Tree:
        // 树：树冠多层 + 树干 + 高光
        gfx.fillStyle(0x553311, 1)
        gfx.fillRect(24, 42, 16, 20)
        gfx.fillStyle(0x44220f, 1)
        gfx.fillRect(24, 42, 5, 20)
        // 树冠（三层）
        gfx.fillStyle(0x1a5a1a, 1)
        gfx.fillRect(10, 14, 44, 32)
        gfx.fillStyle(0x2d7a2d, 1)
        gfx.fillRect(14, 8, 36, 38)
        gfx.fillStyle(0x3d9a3d, 1)
        gfx.fillRect(18, 4, 28, 34)
        // 高光
        gfx.fillStyle(0x55b44a, 0.6)
        gfx.fillRect(22, 8, 12, 6)
        gfx.fillRect(26, 18, 8, 6)
        // 树干阴影
        gfx.fillStyle(0x331a08, 0.6)
        gfx.fillRect(38, 48, 4, 14)
        break
      case TileType.Deco_Flower:
        // 花：花瓣 + 花心 + 茎叶
        gfx.fillStyle(0x2d8a2d, 1)
        gfx.fillRect(30, 34, 4, 26)
        gfx.fillRect(20, 44, 24, 4)
        gfx.fillStyle(0x2d8a2d, 0.7)
        gfx.fillRect(16, 42, 6, 3)
        gfx.fillRect(42, 46, 6, 3)
        // 花瓣
        gfx.fillStyle(0xff4488, 1)
        gfx.fillRect(26, 20, 12, 12)
        gfx.fillStyle(0xff6699, 0.9)
        gfx.fillRect(29, 24, 6, 4)
        // 花心
        gfx.fillStyle(0xffd94a, 1)
        gfx.fillRect(30, 26, 4, 4)
        break
      case TileType.Deco_Well:
        // 水井：石砌井沿 + 井水 + 木架
        gfx.fillStyle(0x8a8a8a, 1)
        gfx.fillRect(8, 20, 48, 40)
        gfx.fillStyle(0x666666, 0.7)
        gfx.fillRect(8, 20, 8, 40)
        gfx.fillRect(48, 20, 8, 40)
        gfx.fillStyle(0x2a4a7a, 1)
        gfx.fillRect(16, 24, 32, 32)
        gfx.fillStyle(0x3a6a9a, 0.7)
        gfx.fillRect(20, 30, 24, 20)
        // 木架
        gfx.fillStyle(0x6b4a1a, 1)
        gfx.fillRect(24, 4, 6, 18)
        gfx.fillRect(40, 4, 6, 18)
        gfx.fillRect(18, 2, 34, 6)
        break
      case TileType.Deco_Fountain:
        // 喷泉：水池 + 喷水 + 水花
        gfx.fillStyle(0x99aabb, 1)
        gfx.fillRect(4, 4, T - 8, T - 8)
        gfx.fillStyle(0x4488bb, 1)
        gfx.fillRect(8, 8, T - 16, T - 16)
        gfx.fillStyle(0x66aadd, 0.6)
        gfx.fillRect(12, 12, T - 24, T - 24)
        // 中央喷柱
        gfx.fillStyle(0xbbddee, 1)
        gfx.fillRect(30, 16, 8, 18)
        gfx.fillStyle(0x88bbdd, 1)
        gfx.fillRect(26, 8, 16, 10)
        // 水花
        gfx.fillStyle(0xffffff, 0.7)
        gfx.fillRect(24, 4, 3, 6)
        gfx.fillRect(36, 6, 3, 4)
        gfx.fillRect(30, 2, 3, 4)
        break
      case TileType.Deco_LampPost:
        // 灯柱：立柱 + 灯罩 + 光晕
        gfx.fillStyle(0x666644, 1)
        gfx.fillRect(29, 20, 6, 44)
        gfx.fillStyle(0x555533, 1)
        gfx.fillRect(29, 20, 2, 44)
        gfx.fillStyle(0x333322, 1)
        gfx.fillRect(20, 10, 24, 8)
        gfx.fillStyle(0xffff88, 0.9)
        gfx.fillRect(24, 14, 16, 10)
        gfx.fillStyle(0xffff44, 0.35)
        gfx.fillRect(18, 8, 28, 22)
        break
      case TileType.Ground_Water:
        // 水面：渐变蓝 + 波纹
        gfx.fillStyle(0x3366bb, 1)
        gfx.fillRect(0, 0, T, T)
        gfx.fillStyle(0x4488cc, 0.6)
        gfx.fillRect(0, 0, T, 14)
        gfx.fillStyle(0x66aadd, 0.5)
        gfx.fillRect(0, 18, T, 3)
        gfx.fillRect(0, 34, T, 3)
        gfx.fillRect(0, 50, T, 3)
        gfx.fillStyle(0xffffff, 0.35)
        gfx.fillRect(8, 22, 10, 2)
        gfx.fillRect(40, 38, 12, 2)
        gfx.fillRect(20, 54, 8, 2)
        break
      case TileType.Ground_Bridge:
        // 木桥：横板 + 两侧栏杆
        gfx.fillStyle(0x7a5230, 1)
        gfx.fillRect(0, 0, T, T)
        gfx.lineStyle(4, 0x5a3a1e, 0.9)
        gfx.lineBetween(0, 12, T, 12)
        gfx.lineBetween(0, 52, T, 52)
        gfx.fillStyle(0x8a6238, 0.5)
        gfx.fillRect(0, 4, T, 6)
        gfx.fillRect(0, 42, T, 8)
        gfx.fillStyle(0x5a3a1e, 1)
        gfx.fillRect(2, 0, 6, T)
        gfx.fillRect(56, 0, 6, T)
        break
      // ============================================
      // 室内家具（80-95）
      // ============================================
      case TileType.Deco_Bed:
        // 床：床头板 + 床垫 + 枕头 + 被子
        gfx.fillStyle(0x5a3a1e, 1) // 床头板
        gfx.fillRect(4, 6, 56, 10)
        gfx.fillStyle(0x8a6a4a, 1) // 床垫
        gfx.fillRect(4, 16, 56, 26)
        gfx.fillStyle(0xccaa66, 1) // 被子
        gfx.fillRect(4, 30, 56, 16)
        gfx.fillStyle(0xffffff, 0.85) // 枕头
        gfx.fillRect(6, 18, 14, 8)
        gfx.fillStyle(0x5a3a1e, 0.7) // 床腿
        gfx.fillRect(6, 42, 8, 16)
        gfx.fillRect(50, 42, 8, 16)
        break
      case TileType.Deco_Cabinet:
        // 柜子：柜体 + 抽屉 + 把手
        gfx.fillStyle(0x6b4a1a, 1)
        gfx.fillRect(6, 6, 52, 52)
        gfx.fillStyle(0x8a6238, 1)
        gfx.fillRect(10, 10, 44, 44)
        gfx.fillStyle(0x6b4a1a, 0.9)
        gfx.fillRect(10, 22, 44, 4)
        gfx.fillRect(10, 38, 44, 4)
        gfx.fillStyle(0xccaa44, 1) // 把手
        gfx.fillRect(30, 26, 4, 3)
        gfx.fillRect(30, 42, 4, 3)
        break
      case TileType.Deco_Stairs:
        // 楼梯：阶梯 + 扶手
        gfx.fillStyle(0x6a4a2a, 1)
        gfx.fillRect(0, 0, T, T)
        gfx.fillStyle(0x7a5a32, 1)
        for (let i = 0; i < 4; i++) {
          gfx.fillRect(i * 16, T - 16 - i * 16, T, 16)
        }
        gfx.fillStyle(0x5a3a1e, 0.8)
        gfx.fillRect(0, 0, 8, T)
        break
      case TileType.Deco_Fireplace:
        // 壁炉：石砌炉体 + 火焰
        gfx.fillStyle(0x555555, 1)
        gfx.fillRect(8, 20, 48, 40)
        gfx.fillStyle(0x3d3d3d, 1)
        gfx.fillRect(8, 20, 48, 8)
        gfx.fillStyle(0x1a1208, 1) // 炉膛
        gfx.fillRect(16, 30, 32, 30)
        gfx.fillStyle(0xff8833, 1) // 火焰
        gfx.fillRect(24, 42, 6, 16)
        gfx.fillRect(34, 38, 6, 20)
        gfx.fillStyle(0xffdd44, 1)
        gfx.fillRect(26, 46, 3, 10)
        gfx.fillRect(35, 42, 3, 14)
        // 烟囱
        gfx.fillStyle(0x444444, 1)
        gfx.fillRect(14, 4, 16, 18)
        break
      case TileType.Deco_Rug:
        // 地毯：编织纹理 + 边饰
        gfx.fillStyle(0x9a3333, 1)
        gfx.fillRect(4, 4, T - 8, T - 8)
        gfx.fillStyle(0x7a2424, 1)
        gfx.fillRect(4, 4, T - 8, 6)
        gfx.fillRect(4, T - 10, T - 8, 6)
        gfx.fillStyle(0xcc6666, 0.7)
        for (let i = 8; i < T - 8; i += 12) {
          gfx.fillRect(i, 14, 6, T - 28)
        }
        break
      case TileType.Deco_Chandelier:
        // 吊灯：灯架 + 蜡烛
        gfx.fillStyle(0x8a6a3a, 1)
        gfx.fillRect(10, 24, 44, 8)
        gfx.fillStyle(0x555533, 1)
        gfx.fillRect(28, 10, 8, 16)
        gfx.fillStyle(0xffdd88, 1)
        gfx.fillRect(16, 32, 8, 8)
        gfx.fillRect(40, 32, 8, 8)
        gfx.fillStyle(0xffff88, 0.4)
        gfx.fillRect(12, 28, 16, 16)
        gfx.fillRect(36, 28, 16, 16)
        break
      case TileType.Deco_Cauldron:
        // 大锅：圆锅 + 液体 + 热气
        gfx.fillStyle(0x333333, 1)
        gfx.fillRect(12, 26, 40, 28)
        gfx.fillStyle(0x1a1a1a, 1)
        gfx.fillRect(12, 26, 40, 6)
        gfx.fillStyle(0x447733, 1) // 魔药
        gfx.fillRect(16, 32, 32, 18)
        gfx.fillStyle(0x88bb66, 0.5)
        gfx.fillRect(20, 36, 24, 10)
        gfx.fillStyle(0x999999, 0.5) // 热气
        gfx.fillRect(24, 14, 6, 8)
        gfx.fillRect(36, 10, 6, 10)
        break
      case TileType.Deco_Shelf:
        // 架子：层板 + 物品
        gfx.fillStyle(0x7a5a32, 1)
        gfx.fillRect(6, 10, 52, 8)
        gfx.fillRect(6, 34, 52, 8)
        gfx.fillStyle(0x5a3a1e, 1)
        gfx.fillRect(6, 6, 8, T - 12)
        gfx.fillRect(50, 6, 8, T - 12)
        gfx.fillStyle(0xcc4444, 1) // 小罐
        gfx.fillRect(14, 20, 8, 14)
        gfx.fillStyle(0x44aa44, 1)
        gfx.fillRect(30, 20, 8, 14)
        gfx.fillStyle(0x4488cc, 1)
        gfx.fillRect(42, 20, 6, 14)
        break
      case TileType.Deco_Minecart:
        // 矿车：车斗 + 矿石
        gfx.fillStyle(0x555544, 1)
        gfx.fillRect(8, 24, 48, 22)
        gfx.fillStyle(0x333322, 1)
        gfx.fillRect(8, 24, 48, 6)
        gfx.fillStyle(0x9999aa, 1) // 矿石
        gfx.fillRect(14, 30, 10, 8)
        gfx.fillStyle(0xcc8833, 1)
        gfx.fillRect(28, 30, 8, 8)
        gfx.fillStyle(0x888855, 1) // 轮子
        gfx.fillRect(16, 46, 12, 12)
        gfx.fillRect(40, 46, 12, 12)
        break
      case TileType.Deco_OreVein:
        // 矿脉：岩石 + 闪光矿石
        gfx.fillStyle(0x666666, 1)
        gfx.fillRect(8, 10, 48, 44)
        gfx.fillStyle(0x555555, 0.7)
        gfx.fillRect(8, 10, 48, 8)
        gfx.fillStyle(0x88aacc, 1) // 水晶
        gfx.fillRect(20, 20, 10, 14)
        gfx.fillStyle(0x88ccaa, 1)
        gfx.fillRect(36, 26, 8, 12)
        gfx.fillStyle(0xccddee, 0.8) // 闪光
        gfx.fillRect(22, 22, 3, 5)
        break
      case TileType.Deco_Torch:
        // 火把：木杆 + 火焰
        gfx.fillStyle(0x6b4a1a, 1)
        gfx.fillRect(29, 18, 6, 46)
        gfx.fillStyle(0xcc6622, 1)
        gfx.fillRect(26, 8, 12, 12)
        gfx.fillStyle(0xffaa44, 1)
        gfx.fillRect(29, 4, 6, 12)
        gfx.fillStyle(0xffdd66, 0.6)
        gfx.fillRect(31, 2, 3, 8)
        break
      case TileType.Deco_FishBarrel:
        // 鱼桶：木桶 + 鱼
        gfx.fillStyle(0x6b4a1a, 1)
        gfx.fillRect(10, 16, 44, 42)
        gfx.fillStyle(0x8a6238, 1)
        gfx.fillRect(10, 16, 44, 8)
        gfx.fillStyle(0x3366aa, 1) // 水
        gfx.fillRect(16, 26, 32, 14)
        gfx.fillStyle(0x99bbdd, 1) // 鱼
        gfx.fillRect(22, 30, 16, 6)
        gfx.fillStyle(0xffffff, 0.7)
        gfx.fillRect(34, 30, 4, 3)
        break
      case TileType.Deco_Tapestry:
        // 挂毯：织物 + 图案
        gfx.fillStyle(0x663399, 1)
        gfx.fillRect(10, 6, 44, 52)
        gfx.fillStyle(0x8844bb, 1)
        gfx.fillRect(14, 10, 36, 44)
        gfx.fillStyle(0xcc8833, 1) // 图案
        gfx.fillRect(26, 20, 12, 12)
        gfx.fillStyle(0xddbb66, 0.8)
        gfx.fillRect(30, 36, 4, 12)
        gfx.fillStyle(0x553388, 1)
        gfx.fillRect(10, 6, 44, 4)
        gfx.fillRect(10, 54, 44, 4)
        break
      case TileType.Deco_Plant:
        // 盆栽：花盆 + 植物
        gfx.fillStyle(0x8a5a2a, 1)
        gfx.fillRect(20, 44, 24, 16)
        gfx.fillStyle(0x6b4423, 1)
        gfx.fillRect(20, 44, 24, 4)
        gfx.fillStyle(0x2d6a2d, 1)
        gfx.fillRect(28, 18, 8, 26)
        gfx.fillStyle(0x3d8a3d, 1)
        gfx.fillRect(16, 24, 14, 18)
        gfx.fillRect(34, 20, 14, 18)
        gfx.fillStyle(0x55aa44, 0.7)
        gfx.fillRect(20, 26, 8, 12)
        break
      case TileType.Deco_Bedroll:
        // 睡袋：卷起的睡袋
        gfx.fillStyle(0x6a7a4a, 1)
        gfx.fillRect(6, 8, 52, 44)
        gfx.fillStyle(0x7a8a5a, 1)
        gfx.fillRect(6, 8, 52, 10)
        gfx.fillStyle(0x5a6a3a, 1)
        gfx.fillRect(6, 46, 52, 6)
        gfx.fillStyle(0x8a9a6a, 0.8)
        gfx.fillRect(40, 20, 10, 20)
        break
      case TileType.Deco_Bar:
        // 吧台：台面 + 酒桶
        gfx.fillStyle(0x6b4423, 1)
        gfx.fillRect(4, 10, 56, 14)
        gfx.fillStyle(0x8a6238, 1)
        gfx.fillRect(4, 10, 56, 4)
        gfx.fillStyle(0x5a3a1e, 1)
        gfx.fillRect(8, 24, 6, 36)
        gfx.fillRect(50, 24, 6, 36)
        gfx.fillStyle(0x8b6914, 1) // 酒桶
        gfx.fillRect(18, 34, 16, 24)
        gfx.fillRect(38, 34, 12, 24)
        break
      case TileType.Deco_Table:
        // 木桌：桌面 + 木纹 + 桌腿
        gfx.fillStyle(0x7a5230, 1)
        gfx.fillRect(4, 12, 56, 14)
        gfx.fillStyle(0x9a6a3a, 1)
        gfx.fillRect(4, 12, 56, 5)
        gfx.fillStyle(0x5a3a1e, 0.8) // 桌腿
        gfx.fillRect(10, 26, 8, 34)
        gfx.fillRect(46, 26, 8, 34)
        gfx.fillStyle(0x6b4423, 0.5)
        gfx.fillRect(12, 32, 4, 20)
        gfx.fillRect(48, 32, 4, 20)
        break
      case TileType.Deco_Crate:
        // 木箱：外框 + 木板条 + 把手
        gfx.fillStyle(0x8a6238, 1)
        gfx.fillRect(6, 8, 52, 48)
        gfx.fillStyle(0x6b4a1a, 1)
        gfx.fillRect(6, 8, 52, 8)
        gfx.fillRect(6, 8, 8, 48)
        gfx.fillRect(50, 8, 8, 48)
        gfx.fillStyle(0x9a7a4a, 0.8) // 板条
        gfx.fillRect(14, 16, 36, 6)
        gfx.fillRect(14, 30, 36, 6)
        gfx.fillRect(14, 44, 36, 6)
        gfx.fillStyle(0x5a3a1e, 1) // 把手
        gfx.fillRect(28, 24, 8, 4)
        break
      case TileType.Deco_Barrel:
        // 木桶：桶身 + 桶箍 + 底部阴影
        gfx.fillStyle(0x8b6914, 1)
        gfx.fillRect(10, 10, 44, 44)
        gfx.fillStyle(0xa8853a, 1)
        gfx.fillRect(10, 10, 10, 44) // 受光
        gfx.fillStyle(0x6b4f12, 1)
        gfx.fillRect(44, 10, 10, 44) // 暗面
        gfx.fillStyle(0x4a3510, 1) // 桶箍
        gfx.fillRect(6, 18, 52, 6)
        gfx.fillRect(6, 40, 52, 6)
        gfx.fillStyle(0x3a2a0e, 0.6)
        gfx.fillRect(10, 10, 44, 4)
        break
      case TileType.Deco_Anvil:
        // 铁砧：砧体 + 砧面 + 底座
        gfx.fillStyle(0x555555, 1)
        gfx.fillRect(12, 20, 40, 12)
        gfx.fillStyle(0x8a8a8a, 1) // 砧面高光
        gfx.fillRect(12, 20, 40, 5)
        gfx.fillStyle(0x444444, 1) // 砧座
        gfx.fillRect(18, 32, 28, 10)
        gfx.fillStyle(0x333333, 1) // 底座
        gfx.fillRect(10, 42, 44, 10)
        gfx.fillStyle(0x222222, 0.7)
        gfx.fillRect(10, 42, 44, 4)
        // 铁砧尖
        gfx.fillStyle(0x666666, 1)
        gfx.fillRect(48, 16, 10, 8)
        break
      case TileType.Deco_Forge:
        // 锻造炉：炉体 + 火焰 + 烟囱
        gfx.fillStyle(0x664433, 1)
        gfx.fillRect(8, 16, 48, 40)
        gfx.fillStyle(0x884422, 1)
        gfx.fillRect(8, 16, 48, 8)
        gfx.fillStyle(0x221108, 1) // 炉口
        gfx.fillRect(20, 34, 24, 22)
        gfx.fillStyle(0xff8833, 1) // 火焰
        gfx.fillRect(24, 40, 16, 12)
        gfx.fillStyle(0xffdd44, 1)
        gfx.fillRect(28, 44, 8, 8)
        gfx.fillStyle(0x777777, 1) // 烟囱
        gfx.fillRect(14, 4, 10, 14)
        gfx.fillStyle(0xaaaaaa, 1)
        gfx.fillRect(14, 4, 4, 14)
        break
      case TileType.Deco_Bookshelf:
        // 书架：柜体 + 三层书（彩色书脊）
        gfx.fillStyle(0x6b4423, 1)
        gfx.fillRect(6, 6, 52, 52)
        gfx.fillStyle(0x4a2c14, 1) // 内框
        gfx.fillRect(10, 10, 44, 44)
        // 三层书架隔板
        gfx.fillStyle(0x7a5230, 1)
        gfx.fillRect(8, 24, 48, 4)
        gfx.fillRect(8, 40, 48, 4)
        // 书籍（彩色）
        const bookColors = [0xcc4444, 0x4488cc, 0x44aa44, 0xccaa44, 0xaa66cc, 0xdd8855]
        for (let row = 0; row < 3; row++) {
          const bookY = 14 + row * 16
          let bx = 12
          let bi = 0
          while (bx < 52) {
            const w = 6 + ((bi + row) % 2) * 3
            gfx.fillStyle(bookColors[(bi + row) % bookColors.length], 1)
            gfx.fillRect(bx, bookY, w, 10)
            gfx.fillStyle(0xffffff, 0.25)
            gfx.fillRect(bx, bookY, 2, 10)
            bx += w + 1
            bi++
          }
        }
        break
      case TileType.Deco_Counter:
        // 柜台：台面 + 柜体 + 门板
        gfx.fillStyle(0x8a6238, 1)
        gfx.fillRect(4, 10, 56, 12)
        gfx.fillStyle(0xa8853a, 1)
        gfx.fillRect(4, 10, 56, 4)
        gfx.fillStyle(0x6b4a1a, 1)
        gfx.fillRect(6, 22, 52, 38)
        gfx.fillStyle(0x7a5a2a, 0.8) // 柜门
        gfx.fillRect(10, 26, 20, 30)
        gfx.fillRect(36, 26, 18, 30)
        gfx.fillStyle(0xccaa44, 1) // 把手
        gfx.fillRect(26, 40, 4, 4)
        break
      case TileType.Deco_Stove:
        // 炉灶：灶体 + 灶口 + 铁锅
        gfx.fillStyle(0x55554a, 1)
        gfx.fillRect(8, 20, 48, 36)
        gfx.fillStyle(0x3a3a33, 1)
        gfx.fillRect(8, 20, 48, 6)
        gfx.fillStyle(0x222220, 1) // 灶口
        gfx.fillRect(14, 30, 16, 6)
        gfx.fillRect(38, 30, 16, 6)
        gfx.fillStyle(0xff6633, 0.9) // 火
        gfx.fillRect(16, 32, 12, 4)
        gfx.fillStyle(0x333333, 1) // 铁锅
        gfx.fillRect(32, 26, 26, 14)
        gfx.fillStyle(0x555555, 1)
        gfx.fillRect(30, 22, 30, 6)
        break
      case TileType.Deco_Bench:
        // 长椅：椅面 + 椅背 + 椅腿
        gfx.fillStyle(0x7a5230, 1)
        gfx.fillRect(6, 24, 52, 8)
        gfx.fillStyle(0x9a6a3a, 1)
        gfx.fillRect(6, 24, 52, 3)
        gfx.fillStyle(0x5a3a1e, 1) // 椅背
        gfx.fillRect(6, 10, 52, 6)
        gfx.fillStyle(0x6b4423, 1)
        gfx.fillRect(10, 14, 5, 10)
        gfx.fillRect(50, 14, 5, 10)
        gfx.fillStyle(0x5a3a1e, 1) // 椅腿
        gfx.fillRect(10, 32, 7, 26)
        gfx.fillRect(48, 32, 7, 26)
        gfx.fillStyle(0x3a2a14, 0.6)
        gfx.fillRect(6, 56, 52, 4)
        break
      case TileType.Deco_Bush:
        // 灌木：绿色圆簇 + 高光
        gfx.fillStyle(0x2d6a2d, 1)
        gfx.fillRect(10, 30, 44, 26)
        gfx.fillStyle(0x3d8a3d, 1)
        gfx.beginPath()
        gfx.fillCircle(18, 26, 14)
        gfx.fillCircle(46, 26, 14)
        gfx.fillCircle(32, 20, 16)
        gfx.fillStyle(0x5aaa3a, 1)
        gfx.beginPath()
        gfx.fillCircle(28, 16, 8)
        gfx.fillStyle(0x1f4a1f, 0.8)
        gfx.fillRect(10, 44, 44, 12)
        break
      case TileType.Deco_Rock:
        // 岩石：灰色岩体 + 高光 + 阴影
        gfx.fillStyle(0x999999, 1)
        gfx.beginPath()
        gfx.fillCircle(20, 34, 16)
        gfx.fillCircle(42, 32, 18)
        gfx.fillCircle(32, 26, 14)
        gfx.fillStyle(0xaaaaaa, 1)
        gfx.beginPath()
        gfx.fillCircle(30, 22, 9)
        gfx.fillStyle(0x777777, 1)
        gfx.beginPath()
        gfx.fillCircle(42, 42, 12)
        gfx.fillStyle(0x555555, 0.8)
        gfx.fillRect(12, 46, 40, 10)
        break
      case TileType.Deco_Garden:
        // 花园：花坛 + 围栏 + 花朵
        gfx.fillStyle(0x4a3520, 1)
        gfx.fillRect(4, 40, 56, 16)
        gfx.fillStyle(0x3d7a2d, 1)
        gfx.fillRect(8, 20, 48, 20)
        gfx.fillStyle(0x55a03a, 1)
        gfx.fillRect(8, 20, 48, 6)
        gfx.fillStyle(0xff6699, 1) // 花
        gfx.fillRect(14, 14, 8, 8)
        gfx.fillRect(42, 12, 8, 8)
        gfx.fillStyle(0xffd94a, 1)
        gfx.fillRect(28, 16, 8, 8)
        gfx.fillStyle(0x55aadd, 1)
        gfx.fillRect(24, 8, 6, 6)
        gfx.fillStyle(0x2d5a27, 1) // 叶
        gfx.fillRect(16, 20, 6, 4)
        gfx.fillRect(44, 18, 6, 4)
        gfx.fillStyle(0x6b4a1a, 1) // 围栏
        gfx.fillRect(4, 36, 6, 4)
        gfx.fillRect(54, 36, 6, 4)
        break
      case TileType.Deco_Signpost:
        // 路牌：木柱 + 木牌
        gfx.fillStyle(0x6b4a1a, 1)
        gfx.fillRect(28, 18, 8, 42)
        gfx.fillStyle(0x8a6a3a, 1)
        gfx.fillRect(28, 18, 3, 42)
        gfx.fillStyle(0x7a5230, 1)
        gfx.fillRect(12, 10, 40, 14)
        gfx.fillStyle(0x9a7a4a, 1)
        gfx.fillRect(12, 10, 40, 5)
        gfx.fillStyle(0xffe9b0, 1) // 箭头
        gfx.fillRect(30, 14, 2, 5)
        gfx.fillStyle(0x5a3a1e, 1)
        gfx.fillRect(12, 24, 40, 3)
        break
      default:
        // 其他类型：简单噪点增加质感
        this.noise(gfx, T, configTypeColor(type), this.shadeColor(configTypeColor(type), 0.7), this.shadeColor(configTypeColor(type), 1.3), 30, type)
        break
    }
  }

  /**
   * 在瓦片内撒随机噪点（明暗色块）
   */
  private noise(
    gfx: Phaser.GameObjects.Graphics,
    size: number,
    base: number,
    dark: number,
    light: number,
    count: number,
    seedType?: number,
  ): void {
    // 固定种子伪随机（不同瓦片类型不同噪声，保证每次生成一致）
    let seed = size * 7919 + (seedType ?? 0) * 104729
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      return seed / 0x7fffffff
    }
    for (let i = 0; i < count; i++) {
      const x = Math.floor(rand() * size)
      const y = Math.floor(rand() * size)
      const r = rand()
      gfx.fillStyle(r < 0.4 ? dark : r < 0.75 ? base : light, 0.5)
      const s = r < 0.75 ? 3 : 2
      gfx.fillRect(x, y, s, s)
    }
  }

  /**
   * 获取 Tile 纹理 Key
   */
  getTileTexture(type: TileType): string | undefined {
    return this.tileTextures.get(type)
  }

  /** 颜色明暗 */
  private shadeColor(color: number, factor: number): number {
    const r = Math.max(0, Math.min(255, Math.round(((color >> 16) & 0xff) * factor)))
    const g = Math.max(0, Math.min(255, Math.round(((color >> 8) & 0xff) * factor)))
    const b = Math.max(0, Math.min(255, Math.round((color & 0xff) * factor)))
    return (r << 16) | (g << 8) | b
  }

  /**
   * 生成完整小镇地图数据
   * 返回二维数组 [y][x] → TileType
   *
   * 设计要点（让小镇"像真正的镇子"）：
   * - 道路成网：纵向双主街 + 横向北/南/中三条干道，连接每栋建筑门口
   * - 中央广场：石砖铺装 + 喷泉 + 长椅 + 路灯 + 花坛
   * - 自然绿化：边界树带 + 随机树木/灌木/花丛（错落不复制）
   * - 镇界：四周树林带 + 底部栅栏与入口
   * - 建筑位置与 TOWN_BUILDINGS / SCENE_PORTALS 保持一致（门口传送不失效）
   */
  generateTownMap(): number[][] {
    const MAP_W = 30
    const MAP_H = 26
    const map: number[][] = []

    // 初始化为草地
    for (let y = 0; y < MAP_H; y++) {
      map[y] = []
      for (let x = 0; x < MAP_W; x++) {
        map[y][x] = TileType.Ground_Grass
      }
    }

    // === 镇界：四周树林带（上/左/右），让小镇被森林环绕 ===
    for (let y = 0; y < MAP_H; y++) {
      map[y][0] = TileType.Deco_Tree
      if (y % 3 !== 0) map[y][1] = TileType.Deco_Tree // 第二列错落（部分灌木/草地）
      map[y][29] = TileType.Deco_Tree
    }
    map[1][1] = TileType.Deco_Bush
    map[4][1] = TileType.Deco_Bush
    map[7][1] = TileType.Deco_Flower
    map[10][1] = TileType.Deco_Bush
    map[13][1] = TileType.Deco_Flower
    map[16][1] = TileType.Deco_Bush
    map[19][1] = TileType.Deco_Flower
    map[22][1] = TileType.Deco_Bush
    map[25][1] = TileType.Deco_Bush
    // 顶部树林带（避开森林/矿洞入口）
    for (let x = 0; x < MAP_W; x++) {
      if (x < 8 || x > 12) map[0][x] = TileType.Deco_Tree
      if (x < 25 || x > 29) map[0][x] = TileType.Deco_Tree
    }
    map[0][8] = TileType.Deco_Bush
    map[0][12] = TileType.Deco_Bush
    map[1][8] = TileType.Deco_Bush
    map[1][12] = TileType.Deco_Bush

    // === 中央广场（城镇中心，星象魔法广场：魔法喷泉+符文花坛+水晶灯柱）===
    this.fillRect(map, 10, 8, 10, 6, TileType.Ground_Stone) // 星象魔法地砖（程序化绘制自带符文/星点）
    // 魔法喷泉（中央，浮空水晶）
    map[10][14] = TileType.Deco_Fountain
    // 喷泉四周魔法花（代替多余的重复喷泉格）
    map[9][14] = TileType.Deco_Flower
    map[9][15] = TileType.Deco_Flower
    map[10][15] = TileType.Deco_Flower
    // 符文花坛（广场四角，魔法草）
    map[8][10] = TileType.Deco_Garden
    map[8][19] = TileType.Deco_Garden
    map[14][10] = TileType.Deco_Garden
    map[14][19] = TileType.Deco_Garden
    // 长椅（广场两侧，供NPC歇脚）
    map[8][12] = TileType.Deco_Bench
    map[8][17] = TileType.Deco_Bench
    map[13][12] = TileType.Deco_Bench
    map[13][17] = TileType.Deco_Bench
    // 魔法水晶灯柱（广场内四角，发光水晶球）
    map[11][10] = TileType.Deco_LampPost
    map[11][19] = TileType.Deco_LampPost
    map[12][10] = TileType.Deco_LampPost
    map[12][19] = TileType.Deco_LampPost
    // 魔法花点缀（广场北缘）
    map[9][11] = TileType.Deco_Flower
    map[9][13] = TileType.Deco_Flower
    map[9][16] = TileType.Deco_Flower
    map[9][18] = TileType.Deco_Flower

    // === 铁砧工坊（左上）===
    this.buildHouse(map, 2, 2, 6, 5, TileType.Wall_Stone, TileType.Ground_Grass)
    map[6][4] = TileType.Building_Door // 南墙中央（玩家可从门前进入）

    // === 魔法药剂店（右上）===
    this.buildHouse(map, 22, 2, 6, 5, TileType.Wall_Stone, TileType.Ground_Grass)
    map[6][24] = TileType.Building_Door

    // === 星光酒馆（右下）===
    this.buildHouse(map, 22, 15, 6, 5, TileType.Wall_Wood, TileType.Ground_Grass)
    map[19][24] = TileType.Building_Door

    // === 集市（左下）===
    this.buildHouse(map, 2, 15, 6, 5, TileType.Wall_Wood, TileType.Ground_Grass)
    map[19][4] = TileType.Building_Door

    // === 长老大厅（中上）===
    this.buildHouse(map, 11, 2, 6, 4, TileType.Wall_Castle, TileType.Ground_Grass)
    map[5][14] = TileType.Building_Door

    // === 住宅区（中下）===
    this.buildHouse(map, 11, 18, 6, 4, TileType.Wall_Wood, TileType.Ground_Grass)
    map[21][14] = TileType.Building_Door

    // === 城镇入口（南，喇叭口弧形大道，不再笔直）===
    // 底部宽入口（逐级收窄成喇叭）
    this.fillRect(map, 11, 25, 8, 1, TileType.Ground_Path) // 最底部 x=11..18
    this.fillRect(map, 12, 24, 6, 1, TileType.Ground_Path) // x=12..17
    this.fillRect(map, 13, 23, 4, 1, TileType.Ground_Path) // x=13..16
    // 斜向过渡（右缘斜出，形成弧线）
    map[22][16] = TileType.Ground_Path
    map[22][13] = TileType.Ground_Path
    // 民居门前引道（连接入口大道与民居南门）
    this.fillRect(map, 13, 22, 4, 1, TileType.Ground_Path)
    // 欢迎路牌（大道两侧草地上）
    map[24][11] = TileType.Deco_Signpost
    map[24][18] = TileType.Deco_Signpost

    // === 道路网络 v3（细径小路，连接每栋建筑门口；宽 1 格，穿过草地）===
    // 左主干道：铁匠铺 → 广场西缘 → 集市（S 形微弯，桥处被河覆盖）
    this.drawPath(map, [
      [7, 7], [8, 8], [8, 9], [8, 10], [8, 11],
      [9, 12], [8, 13], [8, 14], [8, 15], [8, 16],
      [8, 17], [7, 18], [7, 19],
    ], 1, TileType.Ground_Path)
    // 集市门前引道（弧形）
    this.drawPath(map, [[7, 19], [6, 19], [5, 19], [4, 19]], 1, TileType.Ground_Path)

    // 右主干道：药剂店 → 广场东缘 → 酒馆（S 形微弯，桥处被河覆盖）
    this.drawPath(map, [
      [21, 7], [21, 8], [21, 9], [21, 10],
      [20, 11], [20, 12], [20, 13], [20, 14], [20, 15],
      [21, 16], [21, 17], [21, 18], [21, 19],
    ], 1, TileType.Ground_Path)
    // 酒馆门前引道（弧形）
    this.drawPath(map, [[21, 19], [22, 19], [23, 19], [24, 19]], 1, TileType.Ground_Path)

    // 横向北街（y=7，连接铁匠铺/长老厅/药剂店/森林/矿洞门前，微微起伏）
    this.drawPath(map, [
      [2, 7], [4, 7], [6, 7], [8, 7], [10, 7],
      [12, 7], [14, 7], [16, 7], [18, 7], [20, 7],
      [22, 7], [24, 7], [26, 7], [27, 7],
    ], 1, TileType.Ground_Path)

    // 横向南街（分两段：避开民居内部，连接集市/酒馆）
    this.drawPath(map, [[3, 20], [4, 20], [6, 20], [8, 20], [10, 20]], 1, TileType.Ground_Path)
    this.drawPath(map, [[17, 20], [19, 20], [21, 20], [23, 20], [24, 20], [26, 20]], 1, TileType.Ground_Path)

    // 广场西/东缘纵路（广场 ↔ 南街，弧线连接）
    this.drawPath(map, [[10, 14], [10, 15], [10, 16], [10, 17], [10, 18], [10, 19], [10, 20]], 1, TileType.Ground_Path)
    this.drawPath(map, [[19, 14], [19, 15], [19, 16], [19, 17], [19, 18], [19, 19], [19, 20]], 1, TileType.Ground_Path)

    // 长老厅门前纵向路（14,6 → 北街）
    this.drawPath(map, [[14, 5], [14, 6], [14, 7]], 1, TileType.Ground_Path)
    // 森林入口前小路（北，蜿蜒到北街）
    this.drawPath(map, [[10, 2], [10, 3], [10, 4], [10, 5], [10, 6], [10, 7]], 1, TileType.Ground_Path)
    // 矿洞入口前小路（东北，蜿蜒到北街）
    this.drawPath(map, [[27, 2], [27, 3], [27, 4], [27, 5], [27, 6], [27, 7]], 1, TileType.Ground_Path)
    // 右上连接路（矿洞前小路与右主干间的小径）
    this.drawPath(map, [[25, 6], [26, 6], [27, 6]], 1, TileType.Ground_Path)

    // === 森林入口（北侧 x=10，通往低语森林场景）===
    map[1][10] = TileType.Building_Door
    map[0][9] = TileType.Deco_Tree
    map[0][10] = TileType.Deco_Tree
    map[0][11] = TileType.Deco_Tree
    map[1][9] = TileType.Deco_Tree
    map[1][11] = TileType.Deco_Tree

    // === 矿洞入口（东北 x=27，通往废弃矿洞场景）===
    map[1][27] = TileType.Building_Door
    map[0][26] = TileType.Wall_Stone
    map[0][27] = TileType.Wall_Stone
    map[0][28] = TileType.Wall_Stone
    map[1][26] = TileType.Wall_Stone
    map[1][28] = TileType.Wall_Stone

    // === 自然绿化（错落的树木/灌木/花丛，不复制粘贴）===
    // 建筑之间的空地上散落树木
    map[8][4] = TileType.Deco_Tree
    map[9][5] = TileType.Deco_Tree
    map[5][9] = TileType.Deco_Tree
    map[21][4] = TileType.Deco_Tree
    map[21][5] = TileType.Deco_Tree
    map[20][4] = TileType.Deco_Tree
    map[20][5] = TileType.Deco_Bush
    map[9][3] = TileType.Deco_Bush
    map[20][23] = TileType.Deco_Tree
    map[20][24] = TileType.Deco_Bush
    map[5][21] = TileType.Deco_Tree
    map[24][21] = TileType.Deco_Tree
    map[24][22] = TileType.Deco_Bush
    // 花丛（建筑旁、道路边）
    map[6][9] = TileType.Deco_Flower
    map[6][10] = TileType.Deco_Flower
    map[9][6] = TileType.Deco_Bush
    map[21][6] = TileType.Deco_Bush
    map[23][9] = TileType.Deco_Flower
    map[23][10] = TileType.Deco_Flower
    // 注：原 map[22][13] 花丛覆盖了民居门前引道（fillRect 13,22,4,1），已移除
    map[9][16] = TileType.Deco_Flower
    // 入口两侧花丛（大道 x=10..19 之外）
    map[8][23] = TileType.Deco_Flower
    map[8][24] = TileType.Deco_Flower
    map[9][22] = TileType.Deco_Flower
    map[9][23] = TileType.Deco_Flower
    map[22][23] = TileType.Deco_Flower
    map[22][24] = TileType.Deco_Flower
    map[21][22] = TileType.Deco_Flower
    map[21][23] = TileType.Deco_Flower
    // 民居旁水井与灌木（大道左侧空地）
    map[8][21] = TileType.Deco_Well
    map[8][22] = TileType.Deco_Bush
    // 广场与建筑之间的生活区域（错落装饰，不挡路）
    map[12][15] = TileType.Deco_Tree
    map[17][15] = TileType.Deco_Tree
    map[12][14] = TileType.Deco_Tree
    map[17][16] = TileType.Deco_Bush
    map[11][14] = TileType.Deco_Bench
    map[18][17] = TileType.Deco_Bench
    map[14][17] = TileType.Deco_Flower
    map[15][16] = TileType.Deco_Flower
    map[13][15] = TileType.Deco_Flower
    map[18][18] = TileType.Deco_Flower
    map[11][17] = TileType.Deco_Rock
    map[17][18] = TileType.Deco_Rock
    // 底部入口门柱（入口大道两侧的灯柱）
    map[25][11] = TileType.Deco_LampPost
    map[25][18] = TileType.Deco_LampPost

    // === 底部栅栏（镇界，入口处留空）===
    for (let x = 1; x < 29; x++) {
      if (x < 12 || x > 17) {
        map[25][x] = TileType.Fence_Wood
      }
    }

    // === 弯弯曲曲的河（中南部，从西到东蜿蜒穿过小镇，主街处设桥）===
    // 河道走向（2格宽河床，S形弯曲）：
    //   西段 y=13..14 → 桥1(x=8..9) → 南弯(最深至y=16) → 回北 y=13..14
    //   → 桥2(x=20..21) → 小北弯(y=12..13) → 东段 y=13..14
    this.drawRiver(map)

    // === 建筑间空地规整化（v3）：恢复建筑外墙/门 + 周围空地 + 统一草地 + 小路 + 随机树点缀 ===
    this.polishTown(map)

    return map
  }

  /**
   * 小镇建筑间空地规整化（v3 优化，广场/桥/河保持不变）：
   * 1. 恢复建筑外墙与门（道路铺设可能覆盖了墙/门，重新置为结构 tile，保证按 F 可进）
   * 2. 建筑外墙外一圈空地：清除紧贴建筑的装饰物（树/花/灌木/岩石等）→ 草地
   * 3. 除桥、河外，其余地面统一为草地（湿沙岸 → 草地），广场石板与小路保留
   * 4. 建筑之间的通路用小路铺设（补齐民居↔左右主干道短径，保证全部建筑门口连通）
   * 5. 空地上随机点缀树木（避开广场/建筑周边/道路与桥旁，避免挡路）
   */
  private polishTown(map: number[][]): void {
    const MAP_W = map[0].length
    const MAP_H = map.length

    // 建筑定义（含外墙范围与门口），与 buildHouse / SCENE_PORTALS 布局一致
    const buildings: Array<{ x: number; y: number; w: number; h: number; wall: TileType; door: [number, number] }> = [
      { x: 2, y: 2, w: 6, h: 5, wall: TileType.Wall_Stone, door: [4, 6] },   // 铁匠铺
      { x: 22, y: 2, w: 6, h: 5, wall: TileType.Wall_Stone, door: [24, 6] },  // 药剂店
      { x: 22, y: 15, w: 6, h: 5, wall: TileType.Wall_Wood, door: [24, 19] }, // 酒馆
      { x: 2, y: 15, w: 6, h: 5, wall: TileType.Wall_Wood, door: [4, 19] },   // 集市
      { x: 11, y: 2, w: 6, h: 4, wall: TileType.Wall_Castle, door: [14, 5] }, // 长老厅
      { x: 11, y: 18, w: 6, h: 4, wall: TileType.Wall_Wood, door: [14, 21] }, // 民居
    ]

    // 中央广场范围（用户要求不改）
    const plaza = { x0: 10, y0: 8, x1: 19, y1: 13 }
    const inPlaza = (x: number, y: number): boolean =>
      x >= plaza.x0 && x <= plaza.x1 && y >= plaza.y0 && y <= plaza.y1

    // 建筑周边一圈（外扩1格，含外墙），用于"建筑周围小圈空地"判定
    const aroundBuilding = (x: number, y: number): boolean =>
      buildings.some((b) => x >= b.x - 1 && x <= b.x + b.w && y >= b.y - 1 && y <= b.y + b.h)

    // 需从建筑周边清除的装饰物类型（腾出空地）
    const DECO_TYPES = new Set<TileType>([
      TileType.Deco_Tree, TileType.Deco_Flower, TileType.Deco_Bush, TileType.Deco_Rock,
      TileType.Deco_Barrel, TileType.Deco_Crate, TileType.Deco_LampPost, TileType.Deco_Well,
      TileType.Deco_Fountain, TileType.Deco_Bench, TileType.Deco_Anvil, TileType.Deco_Forge,
      TileType.Deco_Signpost, TileType.Deco_Garden,
    ])

    // 1. 恢复建筑外墙与门（避免道路铺设覆盖，保证墙完整、门口可进）
    for (const b of buildings) {
      this.fillRect(map, b.x, b.y, b.w, 1, b.wall)            // 顶墙
      this.fillRect(map, b.x, b.y + b.h - 1, b.w, 1, b.wall)  // 底墙
      this.fillRect(map, b.x, b.y, 1, b.h, b.wall)            // 左墙
      this.fillRect(map, b.x + b.w - 1, b.y, 1, b.h, b.wall)  // 右墙
      map[b.door[1]][b.door[0]] = TileType.Building_Door      // 门
    }

    // 2. 建筑周边一圈：装饰物 → 草地（广场/道路/桥/河/建筑墙体保留）
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        if (!aroundBuilding(x, y) || inPlaza(x, y)) continue
        const t = map[y][x] as TileType
        if (DECO_TYPES.has(t) || t === TileType.Ground_Sand) {
          map[y][x] = TileType.Ground_Grass
        }
      }
    }

    // 3. 除桥、河外，其余地面统一为草地（全图湿沙岸 → 草地）
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        if (map[y][x] === TileType.Ground_Sand) {
          map[y][x] = TileType.Ground_Grass
        }
      }
    }

    // 4. 建筑之间的通路用小路铺设（补齐民居与左右主干道之间的短径）
    //    民居西侧：南街(x=8,y=20) → 民居门前大道(y=22)
    this.fillRect(map, 8, 21, 1, 2, TileType.Ground_Path)  // (8,21),(8,22)
    this.fillRect(map, 9, 22, 4, 1, TileType.Ground_Path)  // y=22 x=9..12
    //    民居东侧：门前大道(y=22) → 南街(x=20,y=20)
    this.fillRect(map, 17, 22, 4, 1, TileType.Ground_Path) // y=22 x=17..20
    this.fillRect(map, 20, 21, 1, 2, TileType.Ground_Path) // (20,21),(20,22)

    // 5. 空地上随机点缀树木（坐标哈希伪随机，每局稳定；避开广场/建筑周边/道路与桥旁）
    for (let y = 1; y < MAP_H - 1; y++) {
      for (let x = 1; x < MAP_W - 1; x++) {
        if (map[y][x] !== TileType.Ground_Grass) continue
        if (inPlaza(x, y) || aroundBuilding(x, y)) continue
        const nearRoad =
          map[y][x - 1] === TileType.Ground_Path || map[y][x + 1] === TileType.Ground_Path ||
          map[y - 1][x] === TileType.Ground_Path || map[y + 1][x] === TileType.Ground_Path ||
          map[y][x - 1] === TileType.Ground_Bridge || map[y][x + 1] === TileType.Ground_Bridge ||
          map[y - 1][x] === TileType.Ground_Bridge || map[y + 1][x] === TileType.Ground_Bridge
        if (nearRoad) continue
        if ((x * 37 + y * 53 + 11) % 100 < 5) {
          map[y][x] = TileType.Deco_Tree
        }
      }
    }
  }

  /**
   * 绘制直河（中南部横穿小镇，两座木桥跨主街）
   * 河床用 Ground_Water（不可通行），桥用 Ground_Bridge（可通行）
   * 河道为一条直线：y=13..14 两格宽横贯全图，桥跨主街
   * 河道不覆盖任何建筑（集市/酒馆北墙外 y<=14；民居/南街均在河以南）
   */
  private drawRiver(map: number[][]): void {
    const W = TileType.Ground_Water
    const B = TileType.Ground_Bridge

    // 直线河床：x=0..29，y=13..14（从西到东横贯小镇）
    for (let x = 0; x <= 29; x++) {
      map[13][x] = W
      map[14][x] = W
    }
    // 桥1：横跨左主街（x=8..9）
    map[13][8] = B
    map[14][8] = B
    map[13][9] = B
    map[14][9] = B
    // 桥2：横跨右主街（x=20..21）
    map[13][20] = B
    map[14][20] = B
    map[13][21] = B
    map[14][21] = B
  }

  private fillRect(map: number[][], x: number, y: number, w: number, h: number, type: TileType): void {
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        const py = y + dy
        const px = x + dx
        if (py >= 0 && py < map.length && px >= 0 && px < map[0].length) {
          map[py][px] = type
        }
      }
    }
  }

  /**
   * 绘制曲线路径 — 沿折线中心点铺设道路，圆形膨胀产生自然弯曲/圆角
   * @param map 地图数据
   * @param pts 中心点序列 [[x,y],...]
   * @param width 路径宽度等级（1=1格宽细径小路，2=3格宽主干道）
   * @param type 铺设的瓦片类型
   */
  private drawPath(
    map: number[][],
    pts: Array<[number, number]>,
    width: number,
    type: TileType,
  ): void {
    // 宽度等级 → 半径：1 → r=0（1格细径），2 → r=1（3格宽主干道）
    const r = Math.max(0, width - 1)
    const cells = new Set<string>()

    const addCircle = (cx: number, cy: number): void => {
      for (let ox = -r; ox <= r; ox++) {
        for (let oy = -r; oy <= r; oy++) {
          if (ox * ox + oy * oy <= r * r) {
            cells.add(`${cx + ox},${cy + oy}`)
          }
        }
      }
    }

    // Bresenham 直线连接每个折点，并在每个点圆形膨胀
    for (let i = 0; i < pts.length - 1; i++) {
      const [x1, y1] = pts[i]
      const [x2, y2] = pts[i + 1]
      let x = x1
      let y = y1
      const dx = Math.abs(x2 - x1)
      const sx = x1 < x2 ? 1 : -1
      const dy = -Math.abs(y2 - y1)
      const sy = y1 < y2 ? 1 : -1
      let err = dx + dy
      addCircle(x, y)
      while (x !== x2 || y !== y2) {
        const e2 = 2 * err
        if (e2 >= dy) {
          err += dy
          x += sx
        }
        if (e2 <= dx) {
          err += dx
          y += sy
        }
        addCircle(x, y)
      }
    }

    cells.forEach((key) => {
      const [cx, cy] = key.split(',').map(Number)
      if (cy >= 0 && cy < map.length && cx >= 0 && cx < map[0].length) {
        map[cy][cx] = type
      }
    })
  }

  private buildHouse(
    map: number[][],
    x: number, y: number, w: number, h: number,
    wallType: TileType,
    floorType: TileType,
  ): void {
    this.fillRect(map, x, y, w, 1, wallType)
    this.fillRect(map, x, y + h - 1, w, 1, wallType)
    this.fillRect(map, x, y, 1, h, wallType)
    this.fillRect(map, x + w - 1, y, 1, h, wallType)
    this.fillRect(map, x + 1, y + 1, w - 2, h - 2, floorType)
  }

  /**
   * 获取地图尺寸
   */
  static getMapSize(): { width: number; height: number; pixelWidth: number; pixelHeight: number } {
    return {
      width: 30,
      height: 26,
      pixelWidth: 30 * TILE_SIZE,
      pixelHeight: 26 * TILE_SIZE,
    }
  }
}

/** 瓦片基础色辅助（用于默认噪点） */
function configTypeColor(type: TileType): number {
  return TILE_CONFIGS[type]?.color ?? 0x666666
}
