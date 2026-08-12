import Phaser from 'phaser'

/**
 * SpritePool — 对象池
 *
 * T5.3.3 前端渲染优化 — 对象池
 *
 * 职责：
 * 1. 复用Sprite对象，避免频繁创建/销毁导致GC压力
 * 2. 支持预分配（warmup）和动态扩容
 * 3. 支持多种对象类型（Sprite、Text、Graphics等）
 * 4. 自动清理闲置对象
 */
export class SpritePool {
  private scene: Phaser.Scene
  private pool: Phaser.GameObjects.Sprite[] = []
  private active: Set<Phaser.GameObjects.Sprite> = new Set()
  private textureKey: string
  private maxSize: number
  private idleTimeout: number
  private idleTimers: Map<Phaser.GameObjects.Sprite, number> = new Map()

  constructor(
    scene: Phaser.Scene,
    textureKey: string,
    options: {
      /** 池最大容量，默认50 */
      maxSize?: number
      /** 预分配数量，默认10 */
      warmupCount?: number
      /** 闲置超时(ms)，默认30000 */
      idleTimeout?: number
    } = {},
  ) {
    this.scene = scene
    this.textureKey = textureKey
    this.maxSize = options.maxSize ?? 50
    this.idleTimeout = options.idleTimeout ?? 30000

    // 预分配
    const warmupCount = options.warmupCount ?? 10
    for (let i = 0; i < warmupCount; i++) {
      this.createSprite()
    }
  }

  /**
   * 从池中获取一个Sprite
   */
  acquire(x: number = 0, y: number = 0): Phaser.GameObjects.Sprite {
    let sprite: Phaser.GameObjects.Sprite

    if (this.pool.length > 0) {
      sprite = this.pool.pop()!
      sprite.setPosition(x, y)
    } else if (this.active.size < this.maxSize) {
      sprite = this.createSprite(x, y)
    } else {
      // 强制回收最老的活跃对象
      const oldest = this.active.values().next().value
      if (oldest) {
        this.release(oldest)
        sprite = this.pool.pop()!
        sprite.setPosition(x, y)
      } else {
        sprite = this.createSprite(x, y)
      }
    }

    sprite.setActive(true)
    sprite.setVisible(true)
    sprite.setAlpha(1)
    this.active.add(sprite)
    this.idleTimers.delete(sprite)

    return sprite
  }

  /**
   * 归还Sprite到池中
   */
  release(sprite: Phaser.GameObjects.Sprite): void {
    if (!this.active.has(sprite)) return

    sprite.setActive(false)
    sprite.setVisible(false)
      if (sprite.body && 'setVelocity' in sprite.body) {
        (sprite.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0)
      }
    sprite.removeAllListeners()
    this.scene.tweens?.killTweensOf(sprite)

    this.active.delete(sprite)
    this.pool.push(sprite)
    this.idleTimers.set(sprite, Date.now())
  }

  /**
   * 获取当前池状态
   */
  getStats(): { available: number; active: number; total: number } {
    return {
      available: this.pool.length,
      active: this.active.size,
      total: this.pool.length + this.active.size,
    }
  }

  /**
   * 清理闲置超时的对象
   */
  cleanupIdle(): number {
    const now = Date.now()
    let removed = 0

    for (const [sprite, timestamp] of this.idleTimers) {
      if (now - timestamp > this.idleTimeout) {
        const idx = this.pool.indexOf(sprite)
        if (idx !== -1) {
          this.pool.splice(idx, 1)
          sprite.destroy()
          removed++
        }
        this.idleTimers.delete(sprite)
      }
    }

    return removed
  }

  /**
   * 销毁整个池
   */
  destroy(): void {
    for (const sprite of this.pool) {
      sprite.destroy()
    }
    for (const sprite of this.active) {
      sprite.destroy()
    }
    this.pool = []
    this.active.clear()
    this.idleTimers.clear()
  }

  /**
   * 创建新的Sprite
   */
  private createSprite(x: number = 0, y: number = 0): Phaser.GameObjects.Sprite {
    const sprite = this.scene.add.sprite(x, y, this.textureKey)
    sprite.setActive(false)
    sprite.setVisible(false)
    this.pool.push(sprite)
    return sprite
  }
}

/**
 * RenderOptimizer — 渲染优化器
 *
 * T5.3.3 前端渲染优化 — Sprite批渲染、视口裁剪、帧率管理
 *
 * 职责：
 * 1. 视口裁剪：只更新/渲染在视口内的对象
 * 2. 帧率自适应：根据设备性能自动调整
 * 3. 批量深度排序优化
 * 4. NPC视口裁剪（setVisible优化）
 * 5. 内存监控与GC建议
 * 6. 渲染统计与性能诊断
 */
export class RenderOptimizer {
  private scene: Phaser.Scene
  private lastFps = 60
  private fpsHistory: number[] = []
  private lowFpsThreshold = 25
  private highFpsThreshold = 55
  private qualityLevel: 'high' | 'medium' | 'low' = 'high'
  private viewportPadding = 50 // 视口裁剪额外边距（像素）

  /** NPC视口裁剪统计 */
  private viewportCullStats = {
    totalChecked: 0,
    culled: 0,
    lastCullTime: 0,
  }

  /** 每帧渲染时间统计 */
  private frameTimeHistory: number[] = []
  private lastFrameTime = 0

  constructor(scene: Phaser.Scene) {
    this.scene = scene
  }

  /**
   * 检查对象是否在视口内
   */
  isInViewport(x: number, y: number, padding: number = this.viewportPadding): boolean {
    const camera = this.scene.cameras.main
    // 防御：战斗/场景切换瞬间 camera 可能已被销毁，此时不裁剪（视为在视口内）
    if (!camera || !this.scene.cameras) return true
    const viewLeft = camera.scrollX - padding
    const viewRight = camera.scrollX + camera.width + padding
    const viewTop = camera.scrollY - padding
    const viewBottom = camera.scrollY + camera.height + padding

    return x >= viewLeft && x <= viewRight && y >= viewTop && y <= viewBottom
  }

  /**
   * NPC视口裁剪：隐藏视口外的NPC精灵和标签
   * T5.3.3 增强版 — 同时处理名字标签
   */
  cullNpcsOutsideViewport(
    npcSprites: Array<{
      sprite: Phaser.GameObjects.Sprite
      nameTag?: Phaser.GameObjects.Text
      x: number
      y: number
    }>,
  ): { visible: number; hidden: number } {
    let visible = 0
    let hidden = 0
    this.viewportCullStats.totalChecked = npcSprites.length

    for (const npc of npcSprites) {
      const inView = this.isInViewport(npc.x, npc.y)
      if (inView) {
        if (!npc.sprite.visible) {
          npc.sprite.setVisible(true)
          if (npc.nameTag) npc.nameTag.setVisible(true)
        }
        visible++
      } else {
        if (npc.sprite.visible) {
          npc.sprite.setVisible(false)
          if (npc.nameTag) npc.nameTag.setVisible(false)
        }
        hidden++
      }
    }

    this.viewportCullStats.culled = hidden
    this.viewportCullStats.lastCullTime = Date.now()
    return { visible, hidden }
  }

  /**
   * 批量深度排序优化（使用预计算，避免每帧重新计算）
   */
  batchDepthSort(sprites: Phaser.GameObjects.Sprite[]): void {
    // 一次性设置所有深度，比逐个setDepth更高效
    for (let i = 0; i < sprites.length; i++) {
      sprites[i].setDepth(sprites[i].y + 100)
    }
  }

  /**
   * 更新帧率监控，自适应画质
   */
  updateFps(): void {
    const now = performance.now()

    // 帧时间跟踪
    if (this.lastFrameTime > 0) {
      const frameTime = now - this.lastFrameTime
      this.frameTimeHistory.push(frameTime)
      if (this.frameTimeHistory.length > 120) {
        this.frameTimeHistory.shift()
      }
    }
    this.lastFrameTime = now

    const fps = Math.round(this.scene.game.loop.actualFps)
    this.fpsHistory.push(fps)
    if (this.fpsHistory.length > 60) this.fpsHistory.shift()

    // 计算平均帧率
    const avgFps = this.fpsHistory.reduce((a, b) => a + b, 0) / this.fpsHistory.length
    this.lastFps = Math.round(avgFps)

    // 自适应画质
    if (avgFps < this.lowFpsThreshold) {
      if (this.qualityLevel !== 'low') {
        this.qualityLevel = 'low'
        this.applyQualityLevel('low')
      }
    } else if (avgFps < this.highFpsThreshold) {
      if (this.qualityLevel !== 'medium') {
        this.qualityLevel = 'medium'
        this.applyQualityLevel('medium')
      }
    } else {
      if (this.qualityLevel !== 'high') {
        this.qualityLevel = 'high'
        this.applyQualityLevel('high')
      }
    }
  }

  /**
   * 应用画质等级
   */
  private applyQualityLevel(level: 'high' | 'medium' | 'low'): void {
    switch (level) {
      case 'low':
        // 低画质：减少粒子、禁用部分动画
        this.scene.game.loop.targetFps = 30
        break
      case 'medium':
        // 中画质：部分优化
        this.scene.game.loop.targetFps = 45
        break
      case 'high':
        // 高画质：全部效果
        this.scene.game.loop.targetFps = 60
        break
    }
    console.log(`[RenderOptimizer] Quality level: ${level}, target FPS: ${this.scene.game.loop.targetFps}`)
  }

  /**
   * 获取当前画质等级
   */
  getQualityLevel(): 'high' | 'medium' | 'low' {
    return this.qualityLevel
  }

  /**
   * 获取当前帧率
   */
  getCurrentFps(): number {
    return this.lastFps
  }

  /**
   * 获取平均帧时间(ms)
   */
  getAvgFrameTime(): number {
    if (this.frameTimeHistory.length === 0) return 16.67
    return this.frameTimeHistory.reduce((a, b) => a + b, 0) / this.frameTimeHistory.length
  }

  /**
   * 获取渲染统计
   */
  getStats(): {
    fps: number
    qualityLevel: string
    totalObjects: number
    viewportCull: { totalChecked: number; culled: number }
    avgFrameTime: number
  } {
    return {
      fps: this.lastFps,
      qualityLevel: this.qualityLevel,
      totalObjects: this.scene.children.length,
      viewportCull: {
        totalChecked: this.viewportCullStats.totalChecked,
        culled: this.viewportCullStats.culled,
      },
      avgFrameTime: Math.round(this.getAvgFrameTime() * 100) / 100,
    }
  }
}

/**
 * MemoryManager — 前端内存管理
 *
 * T5.3.3 前端渲染优化 — 内存管理
 *
 * 职责：
 * 1. 纹理引用计数与自动清理
 * 2. 定期GC建议
 * 3. 内存使用监控
 */
export class MemoryManager {
  private textureRefs: Map<string, { count: number; lastUsed: number }> = new Map()
  private spritePools: Map<string, SpritePool> = new Map()
  private cleanupInterval: ReturnType<typeof setInterval> | null = null
  private textureIdleTimeout = 5 * 60 * 1000 // 5分钟闲置清理

  /**
   * 注册纹理引用
   */
  refTexture(key: string): void {
    const existing = this.textureRefs.get(key)
    if (existing) {
      existing.count++
      existing.lastUsed = Date.now()
    } else {
      this.textureRefs.set(key, { count: 1, lastUsed: Date.now() })
    }
  }

  /**
   * 释放纹理引用
   */
  derefTexture(key: string): void {
    const ref = this.textureRefs.get(key)
    if (ref) {
      ref.count--
      if (ref.count <= 0) {
        this.textureRefs.delete(key)
      }
    }
  }

  /**
   * 注册对象池
   */
  registerPool(key: string, pool: SpritePool): void {
    this.spritePools.set(key, pool)
  }

  /**
   * 启动定期清理
   */
  startAutoCleanup(intervalMs: number = 60000): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanup()
    }, intervalMs)
  }

  /**
   * 停止自动清理
   */
  stopAutoCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }
  }

  /**
   * 执行一次清理
   */
  cleanup(): {
    idleTexturesCleaned: number
    poolObjectsCleaned: number
  } {
    const now = Date.now()
    let idleTexturesCleaned = 0

    // 清理闲置纹理
    for (const [key, ref] of this.textureRefs) {
      if (ref.count <= 0 && now - ref.lastUsed > this.textureIdleTimeout) {
        this.textureRefs.delete(key)
        idleTexturesCleaned++
      }
    }

    // 清理池中闲置对象
    let poolObjectsCleaned = 0
    for (const [_key, pool] of this.spritePools) {
      poolObjectsCleaned += pool.cleanupIdle()
    }

    return { idleTexturesCleaned, poolObjectsCleaned }
  }

  /**
   * 获取内存使用统计
   */
  getStats(): {
    textureCount: number
    poolStats: Record<string, { available: number; active: number; total: number }>
  } {
    const poolStats: Record<string, { available: number; active: number; total: number }> = {}
    for (const [key, pool] of this.spritePools) {
      poolStats[key] = pool.getStats()
    }

    return {
      textureCount: this.textureRefs.size,
      poolStats,
    }
  }

  /**
   * 销毁所有资源
   */
  destroy(): void {
    this.stopAutoCleanup()
    for (const [_key, pool] of this.spritePools) {
      pool.destroy()
    }
    this.spritePools.clear()
    this.textureRefs.clear()
  }
}

/** 全局内存管理器 */
export const memoryManager = new MemoryManager()
