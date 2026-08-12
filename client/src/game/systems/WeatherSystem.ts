// 星火小镇 — 天气效果系统
// T6.9 天气设定：雨/雪/雾/晴粒子渲染 + 全屏色调滤镜 + 雷雨闪电
// 作用于小镇（GameScene）场景，天气类型由服务端 weatherService 广播驱动

import Phaser from 'phaser'
import { GAME_WIDTH, GAME_HEIGHT } from '../config/index'
import type { WeatherType } from '../../stores/gameStore'

// =============================================
// 天气渲染配置
// =============================================

/** 单个天气粒子的状态 */
interface WeatherParticle {
  x: number
  y: number
  vx: number
  vy: number
  length: number
  alpha: number
  scale: number
  drift: number // 横向飘移基准（雾）
  phase: number // 动画相位（雾/雪摇摆）
}

/** 天气视觉配置 */
interface WeatherVisualConfig {
  /** 全屏滤镜颜色 (RGBA) */
  overlay: { r: number; g: number; b: number; alpha: number }
  /** 粒子数量 */
  particleCount: number
  /** 粒子类型：'rain' 雨丝 | 'snow' 雪花 | 'fog' 雾团 | 'none' 无 */
  particleType: 'rain' | 'snow' | 'fog' | 'none'
  /** 粒子速度范围 */
  speed: { min: number; max: number }
  /** 粒子颜色 */
  particleColor: number
  /** 是否可能闪电（雷雨） */
  lightning?: boolean
}

/** 各天气类型视觉参数 */
const WEATHER_VISUAL: Record<WeatherType, WeatherVisualConfig> = {
  sunny: {
    overlay: { r: 255, g: 248, b: 224, alpha: 0.04 },
    particleCount: 0,
    particleType: 'none',
    speed: { min: 0, max: 0 },
    particleColor: 0xffffff,
  },
  cloudy: {
    overlay: { r: 178, g: 190, b: 200, alpha: 0.10 },
    particleCount: 0,
    particleType: 'none',
    speed: { min: 0, max: 0 },
    particleColor: 0xffffff,
  },
  light_rain: {
    overlay: { r: 150, g: 168, b: 185, alpha: 0.16 },
    particleCount: 160,
    particleType: 'rain',
    speed: { min: 700, max: 1100 },
    particleColor: 0xaecbe8,
  },
  storm: {
    overlay: { r: 90, g: 105, b: 125, alpha: 0.28 },
    particleCount: 320,
    particleType: 'rain',
    speed: { min: 900, max: 1400 },
    particleColor: 0x9db8d8,
    lightning: true,
  },
  snow: {
    overlay: { r: 226, g: 236, b: 248, alpha: 0.18 },
    particleCount: 240,
    particleType: 'snow',
    speed: { min: 50, max: 150 },
    particleColor: 0xf4f8ff,
  },
  fog: {
    overlay: { r: 208, g: 214, b: 220, alpha: 0.22 },
    particleCount: 70,
    particleType: 'fog',
    speed: { min: 12, max: 40 },
    particleColor: 0xffffff,
  },
}

/** 滤镜过渡时长（毫秒） */
const OVERLAY_TRANSITION_MS = 2500

// =============================================
// 天气系统
// =============================================

/**
 * WeatherSystem — 天气效果渲染系统
 *
 * 特性：
 * - 全屏色调滤镜（雨天偏灰蓝、雪天偏白、雾天灰白）
 * - 粒子效果：雨丝 / 雪花 / 漂移雾团（像素风 64px 基准）
 * - 雷雨闪电：随机白闪 + 全屏瞬间提亮
 * - 平滑过渡：天气切换时滤镜渐变
 * - 深度控制：滤镜在最顶层（1000），粒子在 950
 */
export class WeatherSystem {
  private scene: Phaser.Scene

  /** 当前天气类型 */
  private currentWeather: WeatherType = 'sunny'
  /** 目标天气类型（过渡中） */
  private targetWeather: WeatherType = 'sunny'

  /** 全屏滤镜矩形 */
  private overlay: Phaser.GameObjects.Rectangle | null = null
  /** 闪电闪烁矩形 */
  private lightningFlash: Phaser.GameObjects.Rectangle | null = null
  /** 粒子 Graphics */
  private particleGfx: Phaser.GameObjects.Graphics | null = null

  /** 粒子池 */
  private particles: WeatherParticle[] = []

  /** 上次更新毫秒 */
  private lastUpdate = 0
  /** 闪电下次触发时间 */
  private nextLightningAt = 0

  /** 是否已销毁 */
  private destroyed = false

  constructor(scene: Phaser.Scene) {
    this.scene = scene
    this.createOverlay()
    this.createLightningFlash()
    this.createParticleGfx()
    this.lastUpdate = this.scene.time.now
  }

  // =============================================
  // 初始化
  // =============================================

  /** 创建全屏滤镜 */
  private createOverlay(): void {
    const cfg = WEATHER_VISUAL[this.currentWeather]
    const color = Phaser.Display.Color.GetColor(cfg.overlay.r, cfg.overlay.g, cfg.overlay.b)
    this.overlay = this.scene.add.rectangle(
      GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, color, cfg.overlay.alpha,
    )
    this.overlay.setDepth(1000)
    this.overlay.setScrollFactor(0)
    this.overlay.setBlendMode(Phaser.BlendModes.MULTIPLY)
  }

  /** 创建闪电闪烁层（初始透明） */
  private createLightningFlash(): void {
    this.lightningFlash = this.scene.add.rectangle(
      GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0xffffff, 0,
    )
    this.lightningFlash.setDepth(1100)
    this.lightningFlash.setScrollFactor(0)
  }

  /** 创建粒子绘制层 */
  private createParticleGfx(): void {
    this.particleGfx = this.scene.add.graphics()
    this.particleGfx.setDepth(950)
    this.particleGfx.setScrollFactor(0)
  }

  // =============================================
  // 天气切换
  // =============================================

  /**
   * 设置当前天气（平滑过渡滤镜 + 重建粒子）
   */
  setWeather(weather: WeatherType): void {
    if (weather === this.targetWeather && !this.isTransitioningOverlay()) return
    this.targetWeather = weather
    this.currentWeather = weather

    // 1. 重建粒子池
    this.buildParticles(weather)

    // 2. 平滑过渡滤镜
    this.transitionOverlay(weather)
  }

  /** 当前是否处于滤镜过渡中 */
  private isTransitioningOverlay(): boolean {
    return !!this.overlay?.getData('transitioning')
  }

  /** 平滑过渡滤镜颜色与透明度 */
  private transitionOverlay(weather: WeatherType): void {
    if (!this.overlay) return
    const cfg = WEATHER_VISUAL[weather]
    const targetColor = Phaser.Display.Color.GetColor(cfg.overlay.r, cfg.overlay.g, cfg.overlay.b)

    this.overlay.setData('transitioning', true)

    const startColor = this.overlay.fillColor
    const startAlpha = this.overlay.alpha
    const startR = (startColor >> 16) & 0xff
    const startG = (startColor >> 8) & 0xff
    const startB = startColor & 0xff
    const targetR = cfg.overlay.r
    const targetG = cfg.overlay.g
    const targetB = cfg.overlay.b
    const startTime = this.scene.time.now

    const step = () => {
      if (!this.overlay) return
      const elapsed = this.scene.time.now - startTime
      const t = Math.min(1, elapsed / OVERLAY_TRANSITION_MS)
      const ease = t * t * (3 - 2 * t) // smoothstep

      const r = Math.round(startR + (targetR - startR) * ease)
      const g = Math.round(startG + (targetG - startG) * ease)
      const b = Math.round(startB + (targetB - startB) * ease)
      const alpha = startAlpha + (cfg.overlay.alpha - startAlpha) * ease

      this.overlay.setFillStyle(Phaser.Display.Color.GetColor(r, g, b), alpha)

      if (t < 1) {
        this.scene.time.delayedCall(16, step)
      } else {
        this.overlay.setData('transitioning', false)
      }
    }

    step()
    void targetColor
  }

  // =============================================
  // 粒子管理
  // =============================================

  /** 根据天气重建粒子池 */
  private buildParticles(weather: WeatherType): void {
    this.particles = []
    const cfg = WEATHER_VISUAL[weather]

    for (let i = 0; i < cfg.particleCount; i++) {
      this.particles.push(this.createParticle(weather))
    }

    // 雷雨：安排首次闪电
    if (cfg.lightning) {
      this.nextLightningAt = this.scene.time.now + 2000 + Math.random() * 4000
    } else {
      this.nextLightningAt = 0
    }
  }

  /** 创建单个粒子 */
  private createParticle(weather: WeatherType): WeatherParticle {
    const cfg = WEATHER_VISUAL[weather]
    const speed = cfg.speed.min + Math.random() * (cfg.speed.max - cfg.speed.min)

    if (cfg.particleType === 'rain') {
      return {
        x: Math.random() * GAME_WIDTH,
        y: Math.random() * GAME_HEIGHT,
        vx: -speed * 0.12,
        vy: speed,
        length: 18 + Math.random() * 16,
        alpha: 0.35 + Math.random() * 0.45,
        scale: 1 + Math.random(),
        drift: 0,
        phase: 0,
      }
    }

    if (cfg.particleType === 'snow') {
      return {
        x: Math.random() * GAME_WIDTH,
        y: Math.random() * GAME_HEIGHT,
        vx: (Math.random() - 0.5) * 40,
        vy: speed,
        length: 6 + Math.random() * 6,
        alpha: 0.6 + Math.random() * 0.4,
        scale: 4 + Math.random() * 6,
        drift: Math.random() * 0.6,
        phase: Math.random() * Math.PI * 2,
      }
    }

    if (cfg.particleType === 'fog') {
      return {
        x: Math.random() * GAME_WIDTH,
        y: 80 + Math.random() * (GAME_HEIGHT * 0.55),
        vx: speed,
        vy: (Math.random() - 0.5) * 6,
        length: 140 + Math.random() * 160,
        alpha: 0.05 + Math.random() * 0.08,
        scale: 0.8 + Math.random() * 1.2,
        drift: speed,
        phase: Math.random() * Math.PI * 2,
      }
    }

    // none
    return { x: 0, y: 0, vx: 0, vy: 0, length: 0, alpha: 0, scale: 0, drift: 0, phase: 0 }
  }

  // =============================================
  // 帧更新
  // =============================================

  /**
   * 每帧更新粒子与闪电
   */
  update(): void {
    if (this.destroyed) return

    const now = this.scene.time.now
    const delta = Math.min(100, now - this.lastUpdate)
    this.lastUpdate = now

    const cfg = WEATHER_VISUAL[this.currentWeather]

    // 1. 更新并绘制粒子
    if (this.particleGfx && cfg.particleType !== 'none') {
      this.particleGfx.clear()

      for (const p of this.particles) {
        // 位置推进
        p.x += p.vx * (delta / 1000)
        p.y += p.vy * (delta / 1000)
        p.phase += delta * 0.004

        // 雪花横向摇摆
        if (cfg.particleType === 'snow') {
          p.x += Math.sin(p.phase) * p.drift * (delta / 100)
        }
        // 雾团漂移：绕回右侧后从左侧重入
        if (cfg.particleType === 'fog') {
          if (p.x > GAME_WIDTH + p.length) {
            p.x = -p.length
          }
        }

        // 越界重置
        if (cfg.particleType === 'rain') {
          if (p.y > GAME_HEIGHT + 40) {
            p.y = -40
            p.x = Math.random() * GAME_WIDTH
          }
          if (p.x < -40) {
            p.x = GAME_WIDTH + 40
          }
        } else if (cfg.particleType === 'snow') {
          if (p.y > GAME_HEIGHT + 30) {
            p.y = -30
            p.x = Math.random() * GAME_WIDTH
          }
          if (p.x < -30) p.x = GAME_WIDTH + 30
          if (p.x > GAME_WIDTH + 30) p.x = -30
        }

        // 绘制
        if (cfg.particleType === 'rain') {
          this.drawRainDrop(p)
        } else if (cfg.particleType === 'snow') {
          this.drawSnowFlake(p)
        } else if (cfg.particleType === 'fog') {
          this.drawFogBlob(p)
        }
      }
    }

    // 2. 雷雨闪电
    if (cfg.lightning && this.lightningFlash) {
      if (now >= this.nextLightningAt && this.lightningFlash.alpha <= 0.01) {
        this.flashLightning()
        this.nextLightningAt = now + 4000 + Math.random() * 9000
      }
    }
  }

  /** 绘制雨丝（细长斜线） */
  private drawRainDrop(p: WeatherParticle): void {
    if (!this.particleGfx) return
    this.particleGfx.lineStyle(2, p.alpha > 0.6 ? 0xcfe0f0 : 0x9db8d8, p.alpha)
    this.particleGfx.lineBetween(
      Math.round(p.x), Math.round(p.y),
      Math.round(p.x - p.length * 0.18), Math.round(p.y - p.length),
    )
  }

  /** 绘制雪花（圆形亮斑，带高光核心） */
  private drawSnowFlake(p: WeatherParticle): void {
    if (!this.particleGfx) return
    const size = Math.max(2, Math.round(p.scale / 1.5))
    // 外圈（柔光）
    this.particleGfx.fillStyle(0xdce8f5, p.alpha * 0.35)
    this.particleGfx.fillCircle(Math.round(p.x), Math.round(p.y), size)
    // 内芯（亮点）
    this.particleGfx.fillStyle(0xffffff, p.alpha)
    this.particleGfx.fillCircle(Math.round(p.x), Math.round(p.y), Math.max(1, size - 1))
  }

  /** 绘制雾团（横向椭圆淡块） */
  private drawFogBlob(p: WeatherParticle): void {
    if (!this.particleGfx) return
    this.particleGfx.fillStyle(0xffffff, p.alpha)
    this.particleGfx.fillEllipse(
      Math.round(p.x), Math.round(p.y),
      Math.round(p.length * p.scale), Math.round(26 * p.scale),
    )
  }

  /** 触发一次闪电（白闪 + 衰减） */
  private flashLightning(): void {
    if (!this.lightningFlash) return

    this.lightningFlash.setAlpha(0.55)

    // 双闪效果：亮 → 暗 → 微亮 → 消失
    this.scene.tweens.add({
      targets: this.lightningFlash,
      alpha: 0.25,
      duration: 60,
      yoyo: true,
      repeat: 1,
      onComplete: () => {
        this.scene.tweens.add({
          targets: this.lightningFlash,
          alpha: 0,
          duration: 320,
          ease: 'Sine.easeOut',
        })
      },
    })
  }

  // =============================================
  // 查询与清理
  // =============================================

  /** 获取当前天气 */
  getCurrentWeather(): WeatherType {
    return this.currentWeather
  }

  /**
   * 清理：销毁所有游戏对象
   */
  destroy(): void {
    this.destroyed = true
    this.particles = []
    this.overlay?.destroy()
    this.overlay = null
    this.lightningFlash?.destroy()
    this.lightningFlash = null
    this.particleGfx?.destroy()
    this.particleGfx = null
  }
}
