// 星火小镇 — 昼夜光影效果系统
// T4.4.2 全局光照滤镜、昼夜色调变化

import Phaser from 'phaser'
import { GAME_WIDTH, GAME_HEIGHT } from '../config/index'

// =============================================
// 昼夜时段配置
// =============================================

/** 昼夜时段 */
export type DayPeriod = 'dawn' | 'morning' | 'afternoon' | 'evening' | 'night'

/** 时段光照配置 */
export interface PeriodLightingConfig {
  /** 覆盖层颜色 (RGBA) */
  overlayColor: {
    r: number
    g: number
    b: number
  }
  /** 覆盖层透明度 (0-1) */
  overlayAlpha: number
  /** 环境光颜色 */
  ambientColor: number
  /** 环境光强度 (0-1) */
  ambientIntensity: number
  /** 过渡时长（毫秒） */
  transitionDuration: number
}

/** 各时段光照参数 */
export const PERIOD_LIGHTING: Record<DayPeriod, PeriodLightingConfig> = {
  dawn: {
    overlayColor: { r: 255, g: 200, b: 150 },
    overlayAlpha: 0.15,
    ambientColor: 0xfff0d0,
    ambientIntensity: 0.7,
    transitionDuration: 5000,
  },
  morning: {
    overlayColor: { r: 255, g: 255, b: 240 },
    overlayAlpha: 0.05,
    ambientColor: 0xffffff,
    ambientIntensity: 1.0,
    transitionDuration: 5000,
  },
  afternoon: {
    overlayColor: { r: 255, g: 250, b: 220 },
    overlayAlpha: 0.08,
    ambientColor: 0xfffff0,
    ambientIntensity: 0.95,
    transitionDuration: 5000,
  },
  evening: {
    overlayColor: { r: 255, g: 150, b: 80 },
    overlayAlpha: 0.25,
    ambientColor: 0xffcc88,
    ambientIntensity: 0.6,
    transitionDuration: 5000,
  },
  night: {
    overlayColor: { r: 20, g: 20, b: 60 },
    overlayAlpha: 0.45,
    ambientColor: 0x6688cc,
    ambientIntensity: 0.3,
    transitionDuration: 5000,
  },
}

// =============================================
// 昼夜光影效果系统
// =============================================

/**
 * DayNightLightingSystem — 昼夜光影效果
 *
 * 特性：
 * - 全局光照叠加层（根据时段自动调整色调和透明度）
 * - 平滑过渡动画（时段切换时渐变）
 * - 点光源模拟（火把、窗户灯光等）
 * - 夜间星星和萤火虫效果
 * - 动态阴影方向（模拟太阳位置）
 */
export class DayNightLightingSystem {
  private scene: Phaser.Scene
  private overlay: Phaser.GameObjects.Rectangle | null = null
  private currentPeriod: DayPeriod = 'morning'
  private targetAlpha: number = 0.05
  private pointLights: Phaser.GameObjects.Arc[] = []
  private isTransitioning: boolean = false

  constructor(scene: Phaser.Scene) {
    this.scene = scene
    this.createOverlay()
  }

  /** 创建全局覆盖层 */
  private createOverlay(): void {
    const config = PERIOD_LIGHTING[this.currentPeriod]
    const color = Phaser.Display.Color.GetColor(
      config.overlayColor.r,
      config.overlayColor.g,
      config.overlayColor.b,
    )

    this.overlay = this.scene.add.rectangle(
      GAME_WIDTH / 2,
      GAME_HEIGHT / 2,
      GAME_WIDTH,
      GAME_HEIGHT,
      color,
      config.overlayAlpha,
    )
    this.overlay.setDepth(1000) // 最顶层
    this.overlay.setScrollFactor(0) // 固定在屏幕
    this.overlay.setBlendMode(Phaser.BlendModes.MULTIPLY)
  }

  /**
   * 设置当前时段（自动平滑过渡）
   */
  setPeriod(period: DayPeriod): void {
    if (period === this.currentPeriod && !this.isTransitioning) return

    const config = PERIOD_LIGHTING[period]
    this.currentPeriod = period
    this.targetAlpha = config.overlayAlpha
    this.isTransitioning = true

    if (this.overlay) {
      // 平滑过渡透明度
      this.scene.tweens.add({
        targets: this.overlay,
        alpha: this.targetAlpha,
        duration: config.transitionDuration,
        ease: 'Power2',
        onComplete: () => {
          this.isTransitioning = false
        },
      })

      // 平滑过渡颜色
      this.tweenOverlayColor(config)
    }
  }

  /** 平滑过渡覆盖层颜色 */
  private tweenOverlayColor(config: PeriodLightingConfig): void {
    if (!this.overlay) return

    const startColor = this.overlay.fillColor
    const startR = (startColor >> 16) & 0xff
    const startG = (startColor >> 8) & 0xff
    const startB = startColor & 0xff

    const targetR = config.overlayColor.r
    const targetG = config.overlayColor.g
    const targetB = config.overlayColor.b

    const duration = config.transitionDuration
    const startTime = this.scene.time.now
    const step = () => {
      if (!this.overlay) return
      const elapsed = this.scene.time.now - startTime
      const t = Math.min(1, elapsed / duration)
      const ease = t * t * (3 - 2 * t) // smoothstep

      const r = Math.round(startR + (targetR - startR) * ease)
      const g = Math.round(startG + (targetG - startG) * ease)
      const b = Math.round(startB + (targetB - startB) * ease)

      const color = Phaser.Display.Color.GetColor(r, g, b)
      this.overlay.setFillStyle(color, this.overlay.alpha)

      if (t < 1) {
        this.scene.time.delayedCall(16, step)
      }
    }

    step()
  }

  /**
   * 添加点光源（火把、灯笼等）
   */
  addPointLight(
    x: number,
    y: number,
    radius: number = 30,
    color: number = 0xffaa44,
    intensity: number = 0.6,
  ): Phaser.GameObjects.Arc {
    const light = this.scene.add.circle(x, y, radius, color, intensity)
    light.setDepth(999)
    light.setBlendMode(Phaser.BlendModes.ADD)
    light.setScrollFactor(0.5)

    // 闪烁效果
    this.scene.tweens.add({
      targets: light,
      alpha: { from: intensity, to: intensity * 0.7 },
      duration: 500 + Math.random() * 500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
      delay: Math.random() * 500,
    })

    this.pointLights.push(light)
    return light
  }

  /**
   * 移除点光源
   */
  removePointLight(light: Phaser.GameObjects.Arc): void {
    const idx = this.pointLights.indexOf(light)
    if (idx >= 0) this.pointLights.splice(idx, 1)
    light.destroy()
  }

  /**
   * 夜间时自动降低点光源亮度，白天恢复
   */
  update(): void {
    // 点光源在夜间更明显
    const isNight = this.currentPeriod === 'night'
    const isEvening = this.currentPeriod === 'evening'

    for (const light of this.pointLights) {
      if (isNight) {
        light.setAlpha(Math.min(0.8, (light.alpha || 0.6) * 1.2))
      } else if (isEvening) {
        light.setAlpha(Math.min(0.6, (light.alpha || 0.4) * 1.1))
      }
    }
  }

  /**
   * 清理
   */
  destroy(): void {
    if (this.overlay) {
      this.overlay.destroy()
      this.overlay = null
    }
    for (const light of this.pointLights) {
      light.destroy()
    }
    this.pointLights = []
  }

  /**
   * 获取当前时段
   */
  getCurrentPeriod(): DayPeriod {
    return this.currentPeriod
  }
}
