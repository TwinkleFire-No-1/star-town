import Phaser from 'phaser'
import { GAME_WIDTH, GAME_HEIGHT, TILE_SIZE } from '../config'
import { RegionType, REGION_CONFIGS } from '../data/TileData'

/**
 * 区域切换配置
 */
/* interface RegionTransition {
  fromRegion: RegionType
  toRegion: RegionType
  triggerBounds: { x: number; y: number; w: number; h: number }
  teleportTarget?: { tx: number; ty: number }
  effect: 'fade' | 'slide' | 'instant'
} */

/**
 * CameraController — 区域切换与镜头管理器
 *
 * 职责：
 * - Camera 平滑跟随玩家
 * - 区域边界检测与切换效果
 * - 区域切换淡入淡出/滑动过渡
 * - 区域切换事件通知
 * - 镜头约束（不超出地图边界）
 *
 * 设计：
 * - 使用 Phaser Camera 的 lerp 平滑跟随
 * - 区域切换时可选传送玩家 + 过渡动画
 * - 支持 fade / slide / instant 三种过渡效果
 */
export class CameraController {
  private scene: Phaser.Scene
  private camera: Phaser.Cameras.Scene2D.Camera

  /** 当前区域 */
  private currentRegion: RegionType | null = null

  /** 区域切换回调 */
  private onRegionChangeCallbacks: Array<(
    from: RegionType | null,
    to: RegionType,
  ) => void> = []

  /** 区域跟踪开关：仅城镇场景启用（REGION_CONFIGS 是小镇地图坐标，非城镇场景沿用会导致森林/室内误报小镇区域） */
  private regionTrackingEnabled = true

  /** 过渡锁（防止切换过程中重复触发） */
  private isTransitioning = false

  /** 相机平滑系数 */
  private cameraLerp = 0.08

  /** 镜头震屏效果参数 */
  /** 镜头震屏效果参数（预留） */
  // private shakeIntensity = 0
  // private shakeDuration = 0

  constructor(scene: Phaser.Scene) {
    this.scene = scene
    this.camera = scene.cameras.main
  }

  /**
   * 初始化镜头跟随
   * @param target 跟随目标
   * @param worldWidth 地图像素宽
   * @param worldHeight 地图像素高
   */
  init(
    target: Phaser.GameObjects.Sprite,
    worldWidth: number,
    worldHeight: number,
  ): void {
    // 设置相机跟随
    this.camera.startFollow(target, true, this.cameraLerp, this.cameraLerp)
    this.camera.setRoundPixels(true)

    // 设置世界边界
    this.camera.setBounds(0, 0, worldWidth, worldHeight)

    // 设置死区（玩家在中央区域移动时镜头不动）
    const deadZoneX = GAME_WIDTH * 0.3
    const deadZoneY = GAME_HEIGHT * 0.3
    this.camera.setDeadzone(deadZoneX, deadZoneY)

    console.log('[CameraController] Initialized')
  }

  /**
   * 更新世界边界（场景切换后调用）
   * 新场景地图尺寸不同，需重设相机边界并回到玩家位置
   */
  updateWorldBounds(worldWidth: number, worldHeight: number): void {
    this.camera.setBounds(0, 0, worldWidth, worldHeight)
    this.currentRegion = null
    console.log(`[CameraController] World bounds updated: ${worldWidth}x${worldHeight}`)
  }

  /**
   * 设置镜头缩放（室内小地图自动放大铺满屏幕）
   * 城镇 zoom=1；室内 12×10/14×11 → 2；森林 1.25；矿洞 1.5
   */
  setZoomLevel(zoom: number): void {
    this.camera.setZoom(zoom)
  }

  /**
   * 获取当前镜头缩放
   */
  getZoomLevel(): number {
    return this.camera.zoom
  }

  /**
   * 获取当前区域
   */
  getCurrentRegion(): RegionType | null {
    return this.currentRegion
  }

  /**
   * 设置区域跟踪开关（场景切换时调用）
   * 城镇场景启用；森林/矿洞/室内关闭（避免用小镇坐标误匹配小镇区域）
   */
  setRegionTrackingEnabled(enabled: boolean): void {
    this.regionTrackingEnabled = enabled
    if (!enabled) {
      this.currentRegion = null
    }
  }

  /**
   * 每帧更新 — 检测区域变化
   */
  update(playerX: number, playerY: number): void {
    if (this.isTransitioning) return
    // 非城镇场景不检测小镇区域（防止森林/矿洞/室内误报小镇建筑/区域标注）
    if (!this.regionTrackingEnabled) return

    // 检测当前区域
    const tileX = Math.floor(playerX / TILE_SIZE)
    const tileY = Math.floor(playerY / TILE_SIZE)
    const detectedRegion = this.detectRegion(tileX, tileY)

    // 区域变化
    if (detectedRegion !== this.currentRegion) {
      const fromRegion = this.currentRegion
      this.currentRegion = detectedRegion

      if (detectedRegion) {
        console.log(
          `[CameraController] Region changed: ${fromRegion} → ${detectedRegion}`,
        )
        this.notifyRegionChange(fromRegion, detectedRegion)
      }
    }
  }

  /**
   * 检测玩家所在的区域
   */
  private detectRegion(tileX: number, tileY: number): RegionType | null {
    for (const regionType of Object.keys(REGION_CONFIGS)) {
      const config = REGION_CONFIGS[regionType as RegionType]
      if (!config) continue
      const b = config.bounds
      if (tileX >= b.x && tileX < b.x + b.w && tileY >= b.y && tileY < b.y + b.h) {
        return regionType as RegionType
      }
    }
    return null
  }

  /**
   * 通知区域变化
   */
  private notifyRegionChange(
    from: RegionType | null,
    to: RegionType,
  ): void {
    this.onRegionChangeCallbacks.forEach((cb) => cb(from, to))
  }

  /**
   * 执行区域切换过渡效果
   */
  async transitionToRegion(
    targetX: number,
    targetY: number,
    effect: 'fade' | 'slide' | 'instant' = 'fade',
  ): Promise<void> {
    if (this.isTransitioning) return
    this.isTransitioning = true

    switch (effect) {
      case 'fade':
        await this.fadeTransition(targetX, targetY)
        break
      case 'slide':
        await this.slideTransition(targetX, targetY)
        break
      case 'instant':
        this.camera.setScroll(targetX - GAME_WIDTH / 2, targetY - GAME_HEIGHT / 2)
        break
    }

    this.isTransitioning = false
  }

  /**
   * 淡入淡出过渡
   */
  private async fadeTransition(targetX: number, targetY: number): Promise<void> {
    return new Promise((resolve) => {
      // 淡出
      this.camera.fadeOut(200, 0, 0, 0)

      this.camera.once('camerafadeoutcomplete', () => {
        // 移动镜头
        this.camera.setScroll(
          targetX - GAME_WIDTH / 2,
          targetY - GAME_HEIGHT / 2,
        )

        // 淡入
        this.camera.fadeIn(300, 0, 0, 0)

        this.camera.once('camerafadeincomplete', () => {
          resolve()
        })
      })
    })
  }

  /**
   * 滑动过渡
   */
  private async slideTransition(targetX: number, targetY: number): Promise<void> {
    return new Promise((resolve) => {
      this.scene.tweens?.add({
        targets: this.camera,
        scrollX: targetX - GAME_WIDTH / 2,
        scrollY: targetY - GAME_HEIGHT / 2,
        duration: 400,
        ease: 'Power2',
        onComplete: () => resolve(),
      })
    })
  }

  /**
   * 镜头震屏
   */
  shake(intensity: number = 0.005, duration: number = 200): void {
    this.camera.shake(duration, intensity)
  }

  /**
   * 注册区域变化回调
   */
  onRegionChange(
    callback: (from: RegionType | null, to: RegionType) => void,
  ): void {
    this.onRegionChangeCallbacks.push(callback)
  }

  /**
   * 设置镜头平滑系数
   */
  setLerp(lerp: number): void {
    this.cameraLerp = lerp
  }

  /**
   * 是否正在过渡中
   */
  getIsTransitioning(): boolean {
    return this.isTransitioning
  }
}
