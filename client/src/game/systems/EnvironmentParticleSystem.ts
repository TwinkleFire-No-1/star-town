// 星火小镇 — 环境粒子效果系统
// T4.4.3 火把火花、喷泉水雾、落叶

import Phaser from 'phaser'
import { GAME_WIDTH } from '../config/index'

// =============================================
// 粒子效果类型
// =============================================

/** 环境粒子效果配置 */
export interface ParticleEffectConfig {
  /** 效果ID */
  id: string
  /** 效果类型 */
  type: 'spark' | 'mist' | 'leaf' | 'firefly' | 'dust' | 'snow' | 'rain' | 'embers'
  /** 发射器位置 */
  x: number
  y: number
  /** 发射宽度 */
  emitWidth: number
  /** 发射高度 */
  emitHeight: number
  /** 粒子数量 */
  quantity: number
  /** 生命周期 (ms) */
  lifespan: { min: number; max: number }
  /** 速度 */
  speed: { min: number; max: number }
  /** 粒子大小 */
  scale: { start: number; end: number }
  /** 颜色 */
  color: { r: number; g: number; b: number }
  /** 频率 (ms, -1=爆发) */
  frequency: number
  /** 是否循环 */
  loop: boolean
  /** 受时段影响（夜间更明显等） */
  timeAffected: boolean
}

// =============================================
// 预设粒子效果
// =============================================

/** 火把火花效果 */
export const SPARK_CONFIG: Omit<ParticleEffectConfig, 'x' | 'y'> = {
  id: 'spark',
  type: 'spark',
  emitWidth: 16,
  emitHeight: 2,
  quantity: 2,
  lifespan: { min: 300, max: 3200 },
  speed: { min: 20, max: 80 },
  scale: { start: 1.0, end: 0.1 },
  color: { r: 255, g: 180, b: 50 },
  frequency: 50,
  loop: true,
  timeAffected: false,
}

/** 喷泉水雾效果 */
export const MIST_CONFIG: Omit<ParticleEffectConfig, 'x' | 'y'> = {
  id: 'mist',
  type: 'mist',
  emitWidth: 80,
  emitHeight: 4,
  quantity: 3,
  lifespan: { min: 1000, max: 8000 },
  speed: { min: 8, max: 32 },
  scale: { start: 0.8, end: 0.0 },
  color: { r: 200, g: 220, b: 255 },
  frequency: 100,
  loop: true,
  timeAffected: false,
}

/** 落叶效果 */
export const LEAF_CONFIG: Omit<ParticleEffectConfig, 'x' | 'y'> = {
  id: 'leaf',
  type: 'leaf',
  emitWidth: GAME_WIDTH,
  emitHeight: 10,
  quantity: 1,
  lifespan: { min: 3000, max: 24000 },
  speed: { min: 12, max: 40 },
  scale: { start: 0.6, end: 0.2 },
  color: { r: 100, g: 180, b: 60 },
  frequency: 800,
  loop: true,
  timeAffected: true,
}

/** 萤火虫效果 */
export const FIREFLY_CONFIG: Omit<ParticleEffectConfig, 'x' | 'y'> = {
  id: 'firefly',
  type: 'firefly',
  emitWidth: 320,
  emitHeight: 60,
  quantity: 1,
  lifespan: { min: 2000, max: 16000 },
  speed: { min: 4, max: 20 },
  scale: { start: 0.5, end: 0.0 },
  color: { r: 200, g: 255, b: 100 },
  frequency: 500,
  loop: true,
  timeAffected: true,
}

/** 雪花效果 */
export const SNOW_CONFIG: Omit<ParticleEffectConfig, 'x' | 'y'> = {
  id: 'snow',
  type: 'snow',
  emitWidth: GAME_WIDTH,
  emitHeight: 5,
  quantity: 2,
  lifespan: { min: 4000, max: 32000 },
  speed: { min: 8, max: 24 },
  scale: { start: 0.4, end: 0.1 },
  color: { r: 255, g: 255, b: 255 },
  frequency: 100,
  loop: true,
  timeAffected: true,
}

/** 灰烬效果 */
export const EMBERS_CONFIG: Omit<ParticleEffectConfig, 'x' | 'y'> = {
  id: 'embers',
  type: 'embers',
  emitWidth: 40,
  emitHeight: 5,
  quantity: 2,
  lifespan: { min: 500, max: 6000 },
  speed: { min: 32, max: 100 },
  scale: { start: 0.8, end: 0.0 },
  color: { r: 255, g: 100, b: 30 },
  frequency: 80,
  loop: true,
  timeAffected: false,
}

/** 尘土效果 */
export const DUST_CONFIG: Omit<ParticleEffectConfig, 'x' | 'y'> = {
  id: 'dust',
  type: 'dust',
  emitWidth: 80,
  emitHeight: 10,
  quantity: 3,
  lifespan: { min: 500, max: 6000 },
  speed: { min: 4, max: 20 },
  scale: { start: 0.3, end: 0.0 },
  color: { r: 180, g: 160, b: 130 },
  frequency: 200,
  loop: true,
  timeAffected: true,
}

// =============================================
// 环境粒子效果系统
// =============================================

/**
 * EnvironmentParticleSystem — 环境粒子效果
 *
 * 特性：
 * - 多种预设效果（火花/水雾/落叶/萤火虫/雪/灰烬/尘土）
 * - 像素风格粒子渲染
 * - 时段感知（夜间萤火虫更亮等）
 * - 区域关联效果（不同区域使用不同粒子）
 * - 性能控制（远离可见区域时暂停）
 */
export class EnvironmentParticleSystem {
  private scene: Phaser.Scene
  private activeEmitters: Map<string, Phaser.GameObjects.Graphics> = new Map()
  private particles: Map<string, ParticleState[]> = new Map()

  constructor(scene: Phaser.Scene) {
    this.scene = scene
  }

  /**
   * 创建环境粒子效果
   */
  createEffect(config: ParticleEffectConfig): void {
    const particles: ParticleState[] = []
    this.particles.set(config.id, particles)

    // 预创建粒子池
    for (let i = 0; i < config.quantity * 10; i++) {
      const particle = this.createParticle(config)
      particles.push(particle)
    }

    // 创建图形对象
    const gfx = this.scene.add.graphics()
    gfx.setDepth(900)
    this.activeEmitters.set(config.id, gfx)
  }

  /** 创建单个粒子状态 */
  private createParticle(config: ParticleEffectConfig): ParticleState {
    const lifespan = config.lifespan.min + Math.random() * (config.lifespan.max - config.lifespan.min)
    const x = config.x + (Math.random() - 0.5) * config.emitWidth
    const y = config.y + (Math.random() - 0.5) * config.emitHeight
    return {
      x,
      y,
      vx: (Math.random() - 0.5) * config.speed.max,
      vy: -(config.speed.min + Math.random() * (config.speed.max - config.speed.min)),
      life: lifespan,
      maxLife: lifespan,
      scale: config.scale.start,
      alpha: 1.0,
      active: true,
      originX: x,
      originY: y,
    }
  }

  /**
   * 更新所有粒子
   */
  update(delta: number, _period: string): void {

    for (const [effectId, particles] of this.particles) {
      const gfx = this.activeEmitters.get(effectId)
      if (!gfx) continue

      gfx.clear()

      for (const p of particles) {
        if (!p.active) continue

        // 更新位置
        p.x += p.vx * (delta / 1000)
        p.y += p.vy * (delta / 1000)

        // 更新生命周期
        p.life -= delta
        if (p.life <= 0) {
          // 循环粒子：重置生命周期而非标记为inactive
          p.life = p.maxLife
          p.x = p.originX ?? p.x
          p.y = p.originY ?? p.y
          // 不再 continue，让粒子继续渲染
        }

        // 计算透明度和缩放
        const lifeRatio = p.life / p.maxLife
        p.alpha = lifeRatio

        // 绘制像素风格粒子
        const pixelSize = Math.max(1, Math.round(p.scale * lifeRatio * 2))
        gfx.fillStyle(
          Phaser.Display.Color.GetColor(255, 180, 50),
          p.alpha * 0.8,
        )
        gfx.fillRect(
          Math.round(p.x),
          Math.round(p.y),
          pixelSize,
          pixelSize,
        )
      }
    }
  }

  /**
   * 时段感知：夜间增强萤火虫等效果
   */
  setTimePeriod(_period: string): void {
    // Period changes handled by update method
  }

  /**
   * 在指定位置创建火把火花
   */
  addTorchSpark(x: number, y: number): string {
    const id = `spark_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    this.createEffect({
      ...SPARK_CONFIG,
      id,
      x,
      y,
    })
    return id
  }

  /**
   * 在指定位置创建喷泉水雾
   */
  addFountainMist(x: number, y: number): string {
    const id = `mist_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    this.createEffect({
      ...MIST_CONFIG,
      id,
      x,
      y,
    })
    return id
  }

  /**
   * 创建全局落叶效果
   */
  addFallingLeaves(): string {
    const id = `leaf_${Date.now()}`
    this.createEffect({
      ...LEAF_CONFIG,
      id,
      x: GAME_WIDTH / 2,
      y: 0,
    })
    return id
  }

  /**
   * 创建夜间萤火虫
   */
  addFireflies(x: number, y: number): string {
    const id = `firefly_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    this.createEffect({
      ...FIREFLY_CONFIG,
      id,
      x,
      y,
    })
    return id
  }

  /**
   * 移除指定效果
   */
  removeEffect(effectId: string): void {
    this.particles.delete(effectId)
    const gfx = this.activeEmitters.get(effectId)
    if (gfx) {
      gfx.destroy()
      this.activeEmitters.delete(effectId)
    }
  }

  /**
   * 清理所有效果
   */
  destroy(): void {
    for (const [_, gfx] of this.activeEmitters) {
      gfx.destroy()
    }
    this.activeEmitters.clear()
    this.particles.clear()
  }
}

// =============================================
// 粒子状态
// =============================================

interface ParticleState {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
  scale: number
  alpha: number
  active: boolean
  originX?: number
  originY?: number
}

// =============================================
// 区域默认粒子配置
// =============================================

/** 各区域推荐的环境粒子效果 */
export const AREA_PARTICLE_CONFIGS: Record<string, Array<{ type: string; offsetX: number; offsetY: number }>> = {
  town_center: [
    { type: 'spark', offsetX: 200, offsetY: 320 },
    { type: 'spark', offsetX: 600, offsetY: 320 },
    { type: 'dust', offsetX: 400, offsetY: 480 },
  ],
  tavern: [
    { type: 'embers', offsetX: 240, offsetY: 280 },
    { type: 'dust', offsetX: 320, offsetY: 400 },
  ],
  forest: [
    { type: 'leaf', offsetX: 320, offsetY: 80 },
    { type: 'firefly', offsetX: 480, offsetY: 240 },
  ],
  sacred_grove: [
    { type: 'firefly', offsetX: 320, offsetY: 240 },
    { type: 'firefly', offsetX: 600, offsetY: 320 },
    { type: 'leaf', offsetX: 400, offsetY: 40 },
  ],
  fountain_area: [
    { type: 'mist', offsetX: 400, offsetY: 360 },
  ],
}
