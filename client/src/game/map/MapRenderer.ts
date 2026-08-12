import Phaser from 'phaser'
import { TILE_SIZE } from '../config'
import { TileType, TILE_CONFIGS } from '../data/TileData'
import { TilesetManager } from './TilesetManager'
import { TOWN_BACKDROP_COLLISION } from '../data/TownBackdropData'
import { FOREST_BACKDROP_COLLISION, MINE_BACKDROP_COLLISION } from '../data/WildBackdropData'

/**
 * MapRenderer — 地图渲染器
 *
 * 职责：
 * - 从地图数据渲染多层级 Tilemap
 * - 地面层、建筑层、装饰层分离
 * - 碰撞层处理
 * - 区域边界标记
 *
 * 渲染层级：
 * 1. Ground Layer — 地面（草地、石板路、小路、水面等）
 * 2. Structure Layer — 建筑结构（墙壁、门、窗等）
 * 3. Decoration Layer — 装饰物（树、花、家具等）
 * 4. Collision Layer — 不可见碰撞层（物理对象）
 */
export class MapRenderer {
  private scene: Phaser.Scene
  private tilesetManager: TilesetManager
  private mapData: number[][] = []

  /** 渲染的 Tile Sprite 列表（用于碰撞和后续操作） */
  private tileSprites: Phaser.GameObjects.Sprite[][] = []

  /**
   * 全量已创建精灵登记表（含被 tileSprites 覆盖引用丢失的 ground 垫底对象）
   * 场景切换 destroyMap 时全部销毁，防止孤儿精灵残留叠加显示
   */
  private allCreatedSprites: Phaser.GameObjects.GameObject[] = []

  /** 碰撞精灵组 */
  private collisionGroup!: Phaser.Physics.Arcade.StaticGroup

  /** 门口精灵组（用于触发区域检测） */
  private doorGroup!: Phaser.Physics.Arcade.StaticGroup

  /** 地图尺寸 */
  private mapWidth = 0
  private mapHeight = 0

  /** 当前场景的 AI 室内底景纹理 key（室内场景有 AI 底景时设置，否则 null 走程序化 tile） */
  private backdropKey: string | null = null

  /** 底景精灵引用（场景切换 destroy 时清理） */
  private backdropSprite: Phaser.GameObjects.Image | null = null

  constructor(scene: Phaser.Scene, tilesetManager: TilesetManager) {
    this.scene = scene
    this.tilesetManager = tilesetManager
  }

  /**
   * 设置当前场景的 AI 底景（有对应 interior-bg-* / town-bg 素材时启用）
   * 城镇/无素材场景传 null，走程序化 tile 渲染
   *
   * v2：城镇场景启用 AI 大模型生成的小镇底图（town-bg，1920×1664 整图），
   * 底图已包含草地/道路/河流/桥梁/广场，建筑与 NPC 精灵叠加在底图之上。
   *
   * v3：森林/矿洞启用 AI 大模型生成的野外底图（interior-bg-forest / interior-bg-mine，
   * 1920×1088 整图），底图已包含林间草地/小路/树带 / 岩壁/矿脉/碎石地，
   * 碰撞由 WildBackdropData mask 驱动（树带/岩壁/矿脉不可通行，路径可通行）。
   */
  setInteriorBackdrop(sceneId: string | null): void {
    // 城镇：AI 底图模式
    if (sceneId === 'town') {
      this.backdropKey = this.scene.textures.exists('town-bg') ? 'town-bg' : null
      if (this.backdropKey) {
        console.log('[MapRenderer] AI town backdrop enabled: town-bg (大模型生成小镇底图)')
      }
      return
    }
    if (!sceneId) {
      this.backdropKey = null
      return
    }
    const key = `interior-bg-${sceneId}`
    this.backdropKey = this.scene.textures.exists(key) ? key : null
    if (this.backdropKey) {
      console.log(`[MapRenderer] AI backdrop enabled: ${this.backdropKey} (大模型生成${sceneId === 'forest' ? '森林' : sceneId === 'mine' ? '矿洞' : '室内'}底图)`)
    }
  }

  /**
   * 渲染小镇地图（AI 大模型底图模式：整图铺底 + 碰撞 mask）
   */
  renderTownMap(): void {
    // 启用 AI 生成的小镇底图（town-bg），缺失时回退程序化 tile 渲染
    this.setInteriorBackdrop('town')
    this.renderMap(this.tilesetManager.generateTownMap())
  }

  /**
   * 渲染任意地图数据（场景系统用）
   * 支持城镇/室内/森林/矿洞等独立场景地图
   */
  renderMap(mapData: number[][]): void {
    this.mapData = mapData
    this.mapHeight = mapData.length
    this.mapWidth = mapData[0]?.length ?? 0

    // 初始化精灵数组
    this.tileSprites = []
    for (let y = 0; y < this.mapHeight; y++) {
      this.tileSprites[y] = []
    }

    // 创建碰撞组
    this.collisionGroup = this.scene.physics.add.staticGroup()
    this.doorGroup = this.scene.physics.add.staticGroup()

    // 设置物理世界边界
    this.scene.physics.world.setBounds(0, 0, this.mapWidth * TILE_SIZE, this.mapHeight * TILE_SIZE)

    // AI 室内底景模式：渲染整图底景（含地板+墙+氛围装饰），跳过地面/结构 tile，
    // 但家具装饰层、碰撞层、门口触发区全部保留（碰撞与 NPC 站位逻辑不变）
    const hasBackdrop = this.backdropKey !== null && this.scene.textures.exists(this.backdropKey)
    if (hasBackdrop) {
      this.renderInteriorBackdrop()
      // 结构层跳过 tile（墙在底景图内），但门口触发区仍需生成
      this.renderStructureLayer(true)
      this.renderDecorationLayer(true)
    } else {
      // 默认程序化 tile 渲染
      this.renderGroundLayer()
      this.renderStructureLayer(false)
      this.renderDecorationLayer(false)
    }
    this.renderCollisionLayer()

    console.log(`[MapRenderer] Map rendered: ${this.mapWidth}x${this.mapHeight} tiles (backdrop=${hasBackdrop})`)
  }

  /**
   * 登记创建的精灵到全量列表（场景切换时统一销毁）
   * 防止 tileSprites[y][x] 引用被后续渲染覆盖后，旧精灵成为孤儿残留
   */
  private trackCreated(obj: Phaser.GameObjects.GameObject): void {
    if (obj && !(obj as unknown as { destroyed?: boolean }).destroyed) {
      this.allCreatedSprites.push(obj)
    }
  }

  /**
   * 渲染 AI 室内底景图（整图铺底，depth -10 垫底）
   * 底景图已包含地板+墙+氛围装饰，作为场景视觉底层
   */
  private renderInteriorBackdrop(): void {
    if (!this.backdropKey) return
    const img = this.scene.add.image(
      (this.mapWidth * TILE_SIZE) / 2,
      (this.mapHeight * TILE_SIZE) / 2,
      this.backdropKey,
    )
    img.setOrigin(0.5, 0.5)
    img.setDepth(-10)
    this.backdropSprite = img
    this.trackCreated(img)
  }

  /**
   * 销毁当前地图的所有渲染对象（场景切换前调用）
   */
  destroyMap(): void {
    // 销毁底景精灵
    if (this.backdropSprite) {
      this.backdropSprite.destroy()
      this.backdropSprite = null
    }

    // 销毁所有已创建精灵（含 tileSprites 引用被覆盖丢失的 ground 垫底对象）
    for (const obj of this.allCreatedSprites) {
      if (obj && !(obj as unknown as { destroyed?: boolean }).destroyed) {
        obj.destroy()
      }
    }
    this.allCreatedSprites = []

    // 销毁所有瓦片精灵（tileSprites 数组可能仍有引用，双保险）
    for (let y = 0; y < this.tileSprites.length; y++) {
      for (let x = 0; x < this.tileSprites[y].length; x++) {
        this.tileSprites[y][x]?.destroy()
      }
    }
    this.tileSprites = []

    // 销毁碰撞组
    if (this.collisionGroup) {
      this.collisionGroup.clear(true, true)
    }
    if (this.doorGroup) {
      this.doorGroup.clear(true, true)
    }
  }

  /**
   * 渲染地面层
   */
  private renderGroundLayer(): void {
    const groundTypes = new Set([
      TileType.Ground_Grass, TileType.Ground_Dirt, TileType.Ground_Stone,
      TileType.Ground_Wood, TileType.Ground_Water, TileType.Ground_Sand,
      TileType.Ground_Bridge, TileType.Ground_Path,
    ])

    for (let y = 0; y < this.mapHeight; y++) {
      for (let x = 0; x < this.mapWidth; x++) {
        const tileType = this.mapData[y][x]
        if (!groundTypes.has(tileType)) continue

        this.renderTile(x, y, tileType, 0) // depth 0 = 地面
      }
    }
  }

  /**
   * 渲染建筑结构层
   * @param skipTiles 底景模式下跳过墙/窗/屋顶等结构 tile（底景图已包含），但门口触发区仍生成
   */
  private renderStructureLayer(skipTiles: boolean): void {
    const structureTypes = new Set([
      TileType.Wall_Stone, TileType.Wall_Wood, TileType.Fence_Wood, TileType.Wall_Castle,
      TileType.Building_Door, TileType.Building_Window, TileType.Building_Roof,
      TileType.Building_Chimney, TileType.Building_Sign,
    ])

    for (let y = 0; y < this.mapHeight; y++) {
      for (let x = 0; x < this.mapWidth; x++) {
        const tileType = this.mapData[y][x]
        if (!structureTypes.has(tileType)) continue

        // 门口特殊处理：始终生成不可见触发区（进入/离开检测）
        if (tileType === TileType.Building_Door) {
          const doorSprite = this.scene.add.sprite(
            x * TILE_SIZE + TILE_SIZE / 2,
            y * TILE_SIZE + TILE_SIZE / 2,
            `tile_${tileType}`,
          )
          doorSprite.setDepth(10)
          doorSprite.setVisible(false) // 不可见触发区
          this.trackCreated(doorSprite)
          this.doorGroup.add(doorSprite)
          ;(doorSprite.body as Phaser.Physics.Arcade.Body).setSize(TILE_SIZE, TILE_SIZE)
          continue
        }

        // 底景模式下结构 tile 已由底景图表现，跳过渲染（保留碰撞由碰撞层负责）
        if (skipTiles) continue

        // 结构格子下若无地面，补草地垫底（防止透明区域露出背景色）
        this.ensureGroundBelow(x, y)

        this.renderTile(x, y, tileType, 10) // depth 10 = 结构
      }
    }
  }

  /**
   * 渲染装饰层
   * @param skipTiles 底景模式下跳过装饰 tile 渲染（底景图已包含贴墙氛围装饰），仅保留家具 tile
   */
  private renderDecorationLayer(skipTiles: boolean): void {
    const decoTypes = new Set([
      TileType.Deco_Tree, TileType.Deco_Flower, TileType.Deco_Bush,
      TileType.Deco_Rock, TileType.Deco_Barrel, TileType.Deco_Crate,
      TileType.Deco_LampPost, TileType.Deco_Well, TileType.Deco_Fountain,
      TileType.Deco_Bench, TileType.Deco_Anvil, TileType.Deco_Forge,
      TileType.Deco_Bookshelf, TileType.Deco_Counter, TileType.Deco_Table,
      TileType.Deco_Stove, TileType.Deco_Garden, TileType.Deco_Signpost,
      // 室内家具
      TileType.Deco_Bed, TileType.Deco_Cabinet, TileType.Deco_Stairs,
      TileType.Deco_Fireplace, TileType.Deco_Rug, TileType.Deco_Chandelier,
      TileType.Deco_Cauldron, TileType.Deco_Shelf, TileType.Deco_Minecart,
      TileType.Deco_OreVein, TileType.Deco_Torch, TileType.Deco_FishBarrel,
      TileType.Deco_Tapestry, TileType.Deco_Plant, TileType.Deco_Bedroll,
      TileType.Deco_Bar,
    ])

    for (let y = 0; y < this.mapHeight; y++) {
      for (let x = 0; x < this.mapWidth; x++) {
        const tileType = this.mapData[y][x]
        if (!decoTypes.has(tileType)) continue

        // 底景模式下：装饰 tile 已由底景图表现（贴墙氛围装饰），跳过渲染
        if (skipTiles) continue

        // 装饰格子下若无地面，补草地垫底（防止透明区域露出背景色）
        this.ensureGroundBelow(x, y)

        // AI 生成装饰素材（星露谷风：喷泉/树/灌木/路灯），优于程序化瓦片
        const aiDecoKey = MapRenderer.AI_DECO_TEXTURE[tileType as TileType]
        if (aiDecoKey && this.scene.textures.exists(aiDecoKey) && this.isAiDecoEligible(x, y, tileType as TileType)) {
          this.renderAiDeco(x, y, aiDecoKey, tileType)
          continue
        }

        // 装饰物按世界Y排序（实现遮挡效果：玩家在物体上方/下方被正确遮挡）
        // depth = 行像素Y + 20，与玩家 depth(=y+100) 同尺度比较
        this.renderTile(x, y, tileType, y * TILE_SIZE + 20) // depth = 世界Y + 20
      }
    }
  }

  /**
   * AI 生成装饰素材 → 瓦片类型映射（PreloadScene 已加载 town-building-deco_*）
   */
  private static readonly AI_DECO_TEXTURE: Partial<Record<TileType, string>> = {
    [TileType.Deco_Fountain]: 'town-building-plaza_fountain',
    [TileType.Deco_Tree]: 'town-building-deco_tree',
    [TileType.Deco_Bush]: 'town-building-deco_bush',
    [TileType.Deco_LampPost]: 'town-building-deco_lamp',
  }

  /**
   * AI 装饰素材适用范围过滤：
   * - 喷泉/灯柱：任意位置使用（广场核心）
   * - 树/灌木：仅限城镇核心生活区（广场周边 x=3..26, y=2..23），
   *   避开边界树带与密集随机绿化，避免果树大面积重复
   */
  private isAiDecoEligible(x: number, y: number, tileType: TileType): boolean {
    if (tileType === TileType.Deco_Fountain || tileType === TileType.Deco_LampPost) return true
    if (x <= 2 || x >= 27 || y <= 1 || y >= 24) return false
    // 树：只保留城镇核心区内的（建筑间、道路边），按哈希分布约 60% 采样避免密集
    if (tileType === TileType.Deco_Tree) {
      return (x * 31 + y * 17) % 10 < 6
    }
    return true
  }

  /**
   * 渲染 AI 装饰素材（按原图尺寸，底部对齐 tile 底边）
   * 缩放策略：树≈1.6 tile，灌木≈1.2 tile，路灯≈1.6 tile，喷泉≈2.6 tile
   */
  private renderAiDeco(x: number, y: number, textureKey: string, tileType: TileType): void {
    const tex = this.scene.textures.get(textureKey)
    const src = tex.getSourceImage()
    const sw = (src as HTMLImageElement).width
    const sh = (src as HTMLImageElement).height
    if (!sw || !sh) return

    // 缩放倍率（相对 tile 高度）
    const tileH = TILE_SIZE
    let scale: number
    switch (tileType) {
      case TileType.Deco_Fountain: scale = tileH * 2.6 / sh; break
      case TileType.Deco_Tree: scale = tileH * 1.7 / sh; break
      case TileType.Deco_LampPost: scale = tileH * 1.7 / sh; break
      case TileType.Deco_Bush: scale = tileH * 1.25 / sh; break
      default: scale = 1
    }

    const dispW = sw * scale
    const dispH = sh * scale
    const cx = x * TILE_SIZE + TILE_SIZE / 2
    const bottomY = (y + 1) * TILE_SIZE

    const sprite = this.scene.add.sprite(cx, bottomY - dispH / 2, textureKey)
    sprite.setOrigin(0.5, 0.5)
    sprite.setScale(scale)
    // 深度 = 世界Y + 20（与玩家 y+100 同尺度，玩家在下方时显示在前）
    sprite.setDepth(bottomY + 20)
    this.trackCreated(sprite)

    this.tileSprites[y][x] = sprite as unknown as Phaser.GameObjects.Sprite
    void dispW
  }

  /** 地面类型集合（与 renderGroundLayer 一致） */
  private static readonly GROUND_TYPES = new Set<TileType>([
    TileType.Ground_Grass, TileType.Ground_Dirt, TileType.Ground_Stone,
    TileType.Ground_Wood, TileType.Ground_Water, TileType.Ground_Sand,
    TileType.Ground_Bridge, TileType.Ground_Path,
  ])

  /**
   * 确保格子下方有地面精灵
   * 当格子类型为装饰/结构时，地面层不会渲染该位置，需补地面垫底
   * 补的地面类型从相邻格子推断（室内家具下补木地板，野外补草地），
   * 防止透明背景的装饰物露出场景背景色。
   */
  private ensureGroundBelow(x: number, y: number): void {
    // 若该位置已渲染地面（depth 0），无需处理
    const existing = this.tileSprites[y]?.[x]
    if (existing && existing.depth === 0) return

    // 检查地图数据：若该格子本身就是地面类型，说明地面层已处理
    const tileType = this.mapData[y][x]
    if (MapRenderer.GROUND_TYPES.has(tileType)) return

    // 从相邻格子推断场景地板类型（室内→木地板/石地板，野外→草地）
    const inferred = this.inferGroundType(x, y)

    let ground: Phaser.GameObjects.Sprite
    // AI 地面母图优先（tileSprite 平铺）
    if (this.tilesetManager?.hasAiGround(inferred)) {
      const masterKey = this.tilesetManager.getAiGroundMasterKey(inferred)
      if (!masterKey) return
      const ts = this.scene.add.tileSprite(
        x * TILE_SIZE + TILE_SIZE / 2,
        y * TILE_SIZE + TILE_SIZE / 2,
        TILE_SIZE, TILE_SIZE, masterKey,
      )
      ts.setTilePosition(x * TILE_SIZE + TILE_SIZE / 2, y * TILE_SIZE + TILE_SIZE / 2)
      this.trackCreated(ts)
      ground = ts as unknown as Phaser.GameObjects.Sprite
    } else {
      const textureKey = `tile_${inferred}`
      if (!this.scene.textures.exists(textureKey)) return
      ground = this.scene.add.sprite(
        x * TILE_SIZE + TILE_SIZE / 2,
        y * TILE_SIZE + TILE_SIZE / 2,
        textureKey,
      )
      this.trackCreated(ground)
    }
    ground.setOrigin(0.5, 0.5)
    ground.setDepth(0)
    this.tileSprites[y][x] = ground
  }

  /**
   * 推断格子所属场景的地板类型：优先取相邻（上下左右/对角）格子的地面类型
   */
  private inferGroundType(x: number, y: number): TileType {
    const neighbors: Array<[number, number]> = [
      [x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1],
      [x - 1, y - 1], [x + 1, y - 1], [x - 1, y + 1], [x + 1, y + 1],
    ]
    for (const [nx, ny] of neighbors) {
      const t = this.mapData[ny]?.[nx]
      if (t !== undefined && MapRenderer.GROUND_TYPES.has(t)) {
        return t as TileType
      }
    }
    return TileType.Ground_Grass
  }

  /**
   * 渲染碰撞层
   * 为不可通行的 Tile 创建物理碰撞体
   */
  /**
   * 渲染碰撞层
   * 为不可通行的 Tile 创建物理碰撞体
   *
   * v2 碰撞体积策略（让碰撞贴合视觉，像素RPG手感更好）：
   * - 建筑墙/栅栏：全格 64×64（建筑实墙不可穿）
   * - 树木：缩小至中央 44×44（贴树干，玩家可贴树冠边缘绕行）
   * - 灌木：40×40 中央
   * - 岩石：44×44 中央
   * - 灯柱/路灯：20×20 中央（细杆）
   * - 喷泉/井：44×44 中央
   * - 长椅：44×34 中央
   * - 其余装饰：默认 56×56（保留环绕空间）
   */
  private static readonly COLLISION_BODY_SIZES: Partial<Record<TileType, { w: number; h: number }>> = {
    [TileType.Deco_Tree]: { w: 44, h: 44 },
    [TileType.Deco_Bush]: { w: 40, h: 40 },
    [TileType.Deco_Rock]: { w: 44, h: 44 },
    [TileType.Deco_LampPost]: { w: 20, h: 20 },
    [TileType.Deco_Fountain]: { w: 44, h: 44 },
    [TileType.Deco_Well]: { w: 44, h: 44 },
    [TileType.Deco_Bench]: { w: 44, h: 34 },
    [TileType.Deco_Signpost]: { w: 20, h: 30 },
    [TileType.Deco_Anvil]: { w: 44, h: 36 },
    [TileType.Deco_Forge]: { w: 48, h: 44 },
    [TileType.Deco_Barrel]: { w: 34, h: 34 },
    [TileType.Deco_Crate]: { w: 40, h: 40 },
  }

  /**
   * 渲染碰撞层
   * 为不可通行的 Tile 创建物理碰撞体
   *
   * 底景模式（AI室内底景）：仅保留墙壁/围栏等结构碰撞（墙在底景图四周，
   * 与地图边界一致）；家具/装饰不生成碰撞——AI底景图已完整呈现室内摆放，
   * 避免"AI图上是空地却撞隐形墙"的体验问题，玩家可自由在室内走动。
   */
  private renderCollisionLayer(): void {
    const hasBackdrop = this.backdropKey !== null && this.scene.textures.exists(this.backdropKey)

    // 小镇底景模式（AI 大模型底图）：碰撞由底图分析 mask 驱动
    // 水/建筑区域 → 不可通行；道路/桥/广场/草地 → 可通行；门口已置 0（可通行）
    if (this.backdropKey === 'town-bg') {
      this.renderTownBackdropCollision()
      return
    }

    // 森林/矿洞底景模式（AI 大模型底图）：碰撞由 WildBackdropData mask 驱动
    // 树带/岩壁/矿脉/岩石 → 不可通行；林间草地/小路/出口门 → 可通行
    if (this.backdropKey === 'interior-bg-forest') {
      this.renderWildBackdropCollision('forest')
      return
    }
    if (this.backdropKey === 'interior-bg-mine') {
      this.renderWildBackdropCollision('mine')
      return
    }

    const structureTypes = new Set([
      TileType.Wall_Stone, TileType.Wall_Wood, TileType.Fence_Wood, TileType.Wall_Castle,
    ])
    for (let y = 0; y < this.mapHeight; y++) {
      for (let x = 0; x < this.mapWidth; x++) {
        const tileType = this.mapData[y][x]
        const config = TILE_CONFIGS[tileType]
        if (!config || config.walkable) continue
        if (tileType === TileType.Empty) continue

        // 门可通行，跳过碰撞
        if (config.isDoor) continue

        // 底景模式：仅保留结构墙碰撞（家具装饰不产生碰撞）
        if (hasBackdrop && !structureTypes.has(tileType)) continue

        // 创建不可见碰撞体
        const body = this.scene.add.rectangle(
          x * TILE_SIZE + TILE_SIZE / 2,
          y * TILE_SIZE + TILE_SIZE / 2,
          TILE_SIZE,
          TILE_SIZE,
        )
        body.setVisible(false)

        // 按类型缩放碰撞体（贴合视觉形状，改善手感）
        const size = MapRenderer.COLLISION_BODY_SIZES[tileType as TileType]
        if (size) {
          ;(body.body as Phaser.Physics.Arcade.Body | undefined)?.setSize(size.w, size.h)
        }

        this.collisionGroup.add(body)
      }
    }

    this.collisionGroup.refresh()
    console.log(`[MapRenderer] Collision bodies: ${this.collisionGroup.getLength()}`)
  }

  /**
   * 小镇底景碰撞：遍历 AI 底图分析生成的碰撞 mask（30×26）
   * mask=1 → 不可通行（水/建筑区域），mask=0 → 可通行（路/桥/广场/草地）
   */
  private renderTownBackdropCollision(): void {
    for (let y = 0; y < this.mapHeight; y++) {
      for (let x = 0; x < this.mapWidth; x++) {
        const blocked = TOWN_BACKDROP_COLLISION[y]?.[x] === 1
        if (!blocked) continue
        const body = this.scene.add.rectangle(
          x * TILE_SIZE + TILE_SIZE / 2,
          y * TILE_SIZE + TILE_SIZE / 2,
          TILE_SIZE,
          TILE_SIZE,
        )
        body.setVisible(false)
        this.collisionGroup.add(body)
      }
    }
    this.collisionGroup.refresh()
    console.log(`[MapRenderer] Town backdrop collision bodies: ${this.collisionGroup.getLength()}`)
  }

  /**
   * 森林/矿洞底景碰撞：遍历 WildBackdropData 碰撞 mask（30×17）
   * mask=1 → 不可通行（树带/岩壁/矿脉/岩石），mask=0 → 可通行（草地/小路/出口门）
   */
  private renderWildBackdropCollision(wild: 'forest' | 'mine'): void {
    const mask = wild === 'forest' ? FOREST_BACKDROP_COLLISION : MINE_BACKDROP_COLLISION
    let count = 0
    for (let y = 0; y < this.mapHeight; y++) {
      for (let x = 0; x < this.mapWidth; x++) {
        const blocked = mask[y]?.[x] === 1
        if (!blocked) continue
        const body = this.scene.add.rectangle(
          x * TILE_SIZE + TILE_SIZE / 2,
          y * TILE_SIZE + TILE_SIZE / 2,
          TILE_SIZE,
          TILE_SIZE,
        )
        body.setVisible(false)
        this.collisionGroup.add(body)
        count++
      }
    }
    this.collisionGroup.refresh()
    console.log(`[MapRenderer] ${wild} backdrop collision bodies: ${count}`)
  }

  /**
   * 渲染单个 Tile（原生 64px 高清纹理，1920×1080 下精细）
   * 地面类型若已注册 AI 母图 → 用 tileSprite 平铺 + 世界坐标偏移（无缝连续纹理）
   */
  private renderTile(x: number, y: number, tileType: number, depth: number): void {
    const px = x * TILE_SIZE + TILE_SIZE / 2
    const py = y * TILE_SIZE + TILE_SIZE / 2

    // AI 地面母图：tileSprite 平铺，纹理偏移 = 世界像素坐标（512 无缝母图自动 wrap）
    if (this.tilesetManager?.hasAiGround(tileType as TileType)) {
      const masterKey = this.tilesetManager.getAiGroundMasterKey(tileType as TileType)
      if (masterKey) {
        const ts = this.scene.add.tileSprite(px, py, TILE_SIZE, TILE_SIZE, masterKey)
        ts.setTilePosition(px, py)
        ts.setDepth(depth)
        this.trackCreated(ts)
        this.tileSprites[y][x] = ts as unknown as Phaser.GameObjects.Sprite
        return
      }
    }

    const textureKey = `tile_${tileType}`
    const sprite = this.scene.add.sprite(px, py, textureKey)
    sprite.setOrigin(0.5, 0.5)
    sprite.setDepth(depth)
    this.trackCreated(sprite)

    this.tileSprites[y][x] = sprite
  }

  /**
   * 获取碰撞组（供角色移动系统使用）
   */
  getCollisionGroup(): Phaser.Physics.Arcade.StaticGroup {
    return this.collisionGroup
  }

  /**
   * 获取门口组
   */
  getDoorGroup(): Phaser.Physics.Arcade.StaticGroup {
    return this.doorGroup
  }

  /**
   * 获取地图数据
   */
  getMapData(): number[][] {
    return this.mapData
  }

  /**
   * 获取地图像素尺寸
   */
  getMapPixelSize(): { width: number; height: number } {
    return {
      width: this.mapWidth * TILE_SIZE,
      height: this.mapHeight * TILE_SIZE,
    }
  }

  /**
   * 检查指定位置是否可通行
   * 小镇底景模式：使用 AI 底图碰撞 mask（水/建筑不可通行）
   */
  isWalkable(tileX: number, tileY: number): boolean {
    if (tileY < 0 || tileY >= this.mapHeight || tileX < 0 || tileX >= this.mapWidth) {
      return false
    }
    // 小镇底景模式：碰撞 mask 优先
    if (this.backdropKey === 'town-bg') {
      return TOWN_BACKDROP_COLLISION[tileY]?.[tileX] !== 1
    }
    // 森林/矿洞底景模式：WildBackdropData mask 优先
    if (this.backdropKey === 'interior-bg-forest') {
      return FOREST_BACKDROP_COLLISION[tileY]?.[tileX] !== 1
    }
    if (this.backdropKey === 'interior-bg-mine') {
      return MINE_BACKDROP_COLLISION[tileY]?.[tileX] !== 1
    }
    const tileType = this.mapData[tileY][tileX]
    const config = TILE_CONFIGS[tileType]
    return config?.walkable ?? false
  }

  /**
   * 获取指定位置的Tile类型
   */
  getTileAt(tileX: number, tileY: number): TileType {
    if (tileY < 0 || tileY >= this.mapHeight || tileX < 0 || tileX >= this.mapWidth) {
      return TileType.Empty
    }
    return this.mapData[tileY][tileX] as TileType
  }
}
