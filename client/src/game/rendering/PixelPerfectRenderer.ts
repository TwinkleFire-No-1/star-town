import Phaser from 'phaser'
import { GAME_WIDTH, GAME_HEIGHT } from '../config'

/**
 * PixelPerfectRenderer — 高清渲染管线管理器
 *
 * 职责：
 * - 原生 1920×1080 画布，1080p 屏幕 1:1 原生渲染（现代高清）
 * - 2K/4K 屏幕整数倍放大（保持锐利）
 * - 任意窗口尺寸下等比缩放铺满容器（cover 策略，无黑边）
 *
 * 设计要点：
 * - 内部画布 1920×1080 永远不变（原生高清分辨率）
 * - 缩放策略（cover，恰好铺满容器）：
 *   1. 整数缩放若能覆盖容器且不过度溢出 → 用整数倍（1080p=1x 原生，4K=2x）
 *   2. 否则小数缩放恰好铺满容器（等比 cover，非 16:9 窗口边缘略有裁剪）
 * - Canvas roundPixels 开启，消除子像素抖动
 */
export class PixelPerfectRenderer {
  private game: Phaser.Game
  private currentScale: number = 1
  private resizeObserver: ResizeObserver | null = null

  constructor(game: Phaser.Game) {
    this.game = game
    this.setupPipeline()
    // 延迟多帧再计算缩放，确保 React 布局完成、容器已有正确尺寸
    this.retryScaleUntilReady()
  }

  /**
   * 设置渲染管线
   */
  private setupPipeline(): void {
    this.game.scene.getScenes(true).forEach((scene) => {
      scene.cameras.main.setRoundPixels(true)
    })
  }

  /**
   * 容器就绪前多帧重试，避免 React 布局时序导致初始缩放错误
   */
  private retryScaleUntilReady(): void {
    let attempts = 0
    const tryScale = () => {
      attempts += 1
      const container = this.game.canvas.parentElement
      const ok = container && container.clientWidth > 0 && container.clientHeight > 0
      if (ok) {
        this.updateScale()
        return
      }
      if (attempts < 30) {
        requestAnimationFrame(tryScale)
      }
    }
    requestAnimationFrame(tryScale)
  }

  /**
   * 更新缩放倍数（cover 策略：等比铺满容器）
   * 响应窗口大小变化
   */
  updateScale(): void {
    const container = this.game.canvas.parentElement
    if (!container) return

    const containerWidth = container.clientWidth
    const containerHeight = container.clientHeight

    if (containerWidth === 0 || containerHeight === 0) return

    // cover 等比缩放：取较大比例，确保画布铺满容器（不产生黑边）
    const coverScale = Math.max(
      containerWidth / GAME_WIDTH,
      containerHeight / GAME_HEIGHT,
    )

    // 方案A：整数缩放（仅当整数倍能覆盖容器且不过度溢出时使用，保持锐利）
    const intScaleX = Math.max(1, Math.floor(containerWidth / GAME_WIDTH))
    const intScaleY = Math.max(1, Math.floor(containerHeight / GAME_HEIGHT))
    const intScale = Math.min(intScaleX, intScaleY)

    // 整数倍显示尺寸
    const intDisplayW = GAME_WIDTH * intScale
    const intDisplayH = GAME_HEIGHT * intScale

    // 整数倍能覆盖容器（>= 容器尺寸）且溢出不超过 5%（避免边缘内容被裁太多）
    const intCovers = intDisplayW >= containerWidth && intDisplayH >= containerHeight
    const intNotExcessive =
      intDisplayW <= containerWidth * 1.05 && intDisplayH <= containerHeight * 1.05

    let newScale: number
    if (intCovers && intNotExcessive) {
      // 整数缩放恰好覆盖容器 → 使用整数倍（1080p=1x 原生，4K=2x 锐利放大）
      newScale = intScale
    } else {
      // 非 16:9 窗口或容器小于 1080p：小数缩放恰好铺满容器（cover）
      // 保留足够精度（0.0001），16:9 窗口下可精确铺满，避免边缘溢出
      newScale = Math.round(coverScale * 10000) / 10000
      // 至少 1 像素可见，避免极端小窗口下缩放为 0
      newScale = Math.max(newScale, 0.01)
    }

    this.currentScale = newScale

    // 通过 CSS 缩放显示尺寸（内部分辨率不变）
    const displayWidth = Math.round(GAME_WIDTH * newScale)
    const displayHeight = Math.round(GAME_HEIGHT * newScale)

    const canvas = this.game.canvas
    canvas.style.width = `${displayWidth}px`
    canvas.style.height = `${displayHeight}px`
    // 现代高清渲染：取消 pixelated，1080p 下 1:1 原生清晰
    canvas.style.imageRendering = 'auto'

    // 更新所有活跃场景的相机
    this.game.scene.getScenes(true).forEach((scene) => {
      scene.cameras.main.setRoundPixels(true)
    })
  }

  /**
   * 获取当前缩放倍数
   */
  getScale(): number {
    return this.currentScale
  }

  /**
   * 绑定容器尺寸监听（ResizeObserver 比 window resize 更可靠，
   * 覆盖侧边栏缩放、iframe 尺寸变化、全屏切换等场景）
   */
  bindResize(): () => void {
    const container = this.game.canvas.parentElement
    // 兜底：window resize + 全屏事件
    const handleResize = () => this.updateScale()
    window.addEventListener('resize', handleResize)
    document.addEventListener('fullscreenchange', handleResize)

    // 优先使用 ResizeObserver 监听容器尺寸
    let unobserveContainer: (() => void) | null = null
    if (container && typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.updateScale())
      this.resizeObserver.observe(container)
      unobserveContainer = () => this.resizeObserver?.disconnect()
    }

    return () => {
      window.removeEventListener('resize', handleResize)
      document.removeEventListener('fullscreenchange', handleResize)
      unobserveContainer?.()
    }
  }
}

/**
 * 应用像素完美渲染配置
 * 全局单例：多次调用只会创建一个 PixelPerfectRenderer 实例
 */
let _rendererInstance: PixelPerfectRenderer | null = null

export function applyPixelPerfectConfig(game: Phaser.Game): PixelPerfectRenderer {
  if (_rendererInstance) {
    // 已存在实例，仅更新缩放
    _rendererInstance.updateScale()
    return _rendererInstance
  }
  const renderer = new PixelPerfectRenderer(game)
  const cleanup = renderer.bindResize()
  game.events.once('destroy', () => {
    cleanup()
    _rendererInstance = null
  })
  _rendererInstance = renderer
  return renderer
}
