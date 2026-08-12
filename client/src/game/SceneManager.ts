import Phaser from 'phaser'

/**
 * 游戏场景键名常量
 */
export const SceneKey = {
  Boot: 'BootScene',
  Preload: 'PreloadScene',
  Game: 'GameScene',
  UI: 'UIScene',
  Dialogue: 'DialogueScene',
  Battle: 'BattleScene',
  Inventory: 'InventoryScene',
} as const

export type SceneKeyType = (typeof SceneKey)[keyof typeof SceneKey]

/**
 * 场景过渡动画配置
 */
export interface SceneTransitionConfig {
  /** 过渡持续时间(ms) */
  duration?: number
  /** 过渡效果 */
  effect?: 'fade' | 'fromLeft' | 'fromRight' | 'fromTop' | 'fromBottom' | 'wipe'
  /** 淡出颜色 (r,g,b)，默认深棕 (61,40,23) */
  color?: { r: number; g: number; b: number }
}

/**
 * 场景过渡预设 — 统一各场景切换动画参数（T6.3.1）
 */
export const SceneTransitions = {
  /** 进入建筑：深棕淡入淡出 */
  enterBuilding: { duration: 500, effect: 'fade', color: { r: 61, g: 40, b: 23 } },
  /** 离开建筑：反向淡入淡出 */
  exitBuilding: { duration: 500, effect: 'fade', color: { r: 61, g: 40, b: 23 } },
  /** 进入战斗：红色色带横扫 */
  enterBattle: { duration: 400, effect: 'wipe', color: { r: 139, g: 35, b: 35 } },
  /** 退出战斗：淡出回归 */
  exitBattle: { duration: 400, effect: 'fade', color: { r: 255, g: 255, b: 255 } },
  /** 启动进入游戏 */
  boot: { duration: 800, effect: 'fade', color: { r: 26, g: 18, b: 8 } },
} as const

export type SceneTransitionPreset = keyof typeof SceneTransitions

/**
 * GameSceneManager — 游戏场景管理器
 *
 * 职责：
 * - 统一场景注册与生命周期管理
 * - 场景切换（支持过渡动画）
 * - 场景暂停/恢复
 * - 场景间数据传递
 *
 * 设计：以 Phaser Scene Plugin 模式集成，或作为全局服务使用
 */
export class GameSceneManager {
  private scene: Phaser.Scenes.SceneManager

  constructor(game: Phaser.Game) {
    this.scene = game.scene
  }

  /**
   * 切换到指定场景
   * @param from 当前场景 key
   * @param to 目标场景 key
   * @param data 传递给目标场景的数据
   * @param transition 过渡动画配置（预设或自定义）
   */
  switchScene(
    from: SceneKeyType,
    to: SceneKeyType,
    data: Record<string, unknown> = {},
    transition?: SceneTransitionConfig,
  ): void {
    const targetScene = this.scene.getScene(to)
    if (!targetScene) {
      console.warn(`[SceneManager] Scene "${to}" not found`)
      return
    }

    const config: SceneTransitionConfig = {
      duration: transition?.duration ?? 300,
      effect: transition?.effect ?? 'fade',
      color: transition?.color ?? { r: 61, g: 40, b: 23 },
    }

    if (transition) {
      const fromScene = this.scene.getScene(from)
      if (!fromScene) {
        this.scene.start(to, data)
        return
      }

      const duration = config.duration ?? 300
      const effect = config.effect ?? 'fade'
      const { r, g, b } = config.color!

      // 过渡期间锁定输入
      this.setSceneInputEnabled(from, false)

      if (effect === 'wipe') {
        // wipe：从左到右色带扫过，扫过一半时切换场景
        this.playWipe(fromScene, config, () => {
          this.doSwitch(from, to, data, config)
        })
      } else if (effect === 'fade') {
        fromScene.cameras.main.fadeOut(duration, r, g, b)
        fromScene.cameras.main.once('camerafadeoutcomplete', () => {
          this.doSwitch(from, to, data, config)
        })
        // 兜底：万一事件丢失，超时强制切换
        fromScene.time.delayedCall(duration + 100, () => {
          if (this.scene.isActive(from)) {
            this.doSwitch(from, to, data, config)
          }
        })
      } else {
        // fromLeft/fromRight/fromTop/fromBottom 滑动效果 — 通过相机平移近似
        const cam = fromScene.cameras.main
        const dir = {
          fromLeft: { x: cam.width, y: 0 },
          fromRight: { x: -cam.width, y: 0 },
          fromTop: { x: 0, y: cam.height },
          fromBottom: { x: 0, y: -cam.height },
        }[effect]
        fromScene.tweens.add({
          targets: cam,
          scrollX: cam.scrollX + dir.x,
          scrollY: cam.scrollY + dir.y,
          duration,
          ease: 'Quad.easeIn',
          onComplete: () => this.doSwitch(from, to, data, config),
        })
      }
    } else {
      this.scene.stop(from)
      this.scene.start(to, data)
    }
  }

  /**
   * wipe 效果：色带从左到右扫过
   */
  private playWipe(
    scene: Phaser.Scene,
    config: SceneTransitionConfig,
    onHalf: () => void,
  ): void {
    const duration = config.duration ?? 400
    const { r, g, b } = config.color ?? { r: 139, g: 35, b: 35 }
    const cam = scene.cameras.main
    const { width, height } = cam

    // 全屏色带（从屏幕左侧外开始）
    const band = scene.add.rectangle(-width, 0, width, height, Phaser.Display.Color.GetColor(r, g, b), 1)
    band.setOrigin(0, 0)
    band.setDepth(99999)
    band.setScrollFactor(0)

    let switched = false
    scene.tweens.add({
      targets: band,
      x: width,
      duration,
      ease: 'Linear',
      onUpdate: () => {
        // 扫过一半时切换场景
        if (!switched && band.x >= width / 2) {
          switched = true
          onHalf()
        }
      },
      onComplete: () => {
        band.destroy()
      },
    })
  }

  /**
   * 执行实际场景切换 + 目标场景淡入
   */
  private doSwitch(
    from: SceneKeyType,
    to: SceneKeyType,
    data: Record<string, unknown>,
    config: SceneTransitionConfig,
  ): void {
    const duration = config.duration ?? 300
    const { r, g, b } = config.color ?? { r: 61, g: 40, b: 23 }
    this.scene.stop(from)
    this.scene.start(to, data)

    // 目标场景从过渡色淡入
    const targetScene = this.scene.getScene(to)
    if (targetScene) {
      targetScene.cameras.main.fadeFrom(duration, r, g, b)
      // 淡入完成后恢复输入
      targetScene.time.delayedCall(duration, () => {
        this.setSceneInputEnabled(to, true)
      })
    }
  }

  /**
   * 启用/禁用场景输入（过渡期间锁定）
   */
  private setSceneInputEnabled(key: SceneKeyType, enabled: boolean): void {
    const scene = this.scene.getScene(key)
    if (scene) {
      scene.input.enabled = enabled
    }
  }

  /**
   * 启动一个叠加场景（如 UI 层）
   * 叠加场景不会停止当前运行的场景
   */
  launchOverlay(sceneKey: SceneKeyType, data: Record<string, unknown> = {}): void {
    if (!this.scene.isActive(sceneKey)) {
      // 通过在当前活跃场景上调用 scene.launch 来叠加场景
      const activeScene = this.getActiveScene()
      if (activeScene) {
        activeScene.scene.launch(sceneKey, data)
      }
    }
  }

  /**
   * 停止叠加场景
   */
  stopOverlay(sceneKey: SceneKeyType): void {
    if (this.scene.isActive(sceneKey)) {
      const scene = this.scene.getScene(sceneKey)
      if (scene) scene.scene.stop()
    }
  }

  /**
   * 暂停场景
   */
  pause(sceneKey: SceneKeyType): void {
    this.scene.pause(sceneKey)
  }

  /**
   * 恢复场景
   */
  resume(sceneKey: SceneKeyType): void {
    this.scene.resume(sceneKey)
  }

  /**
   * 获取指定场景
   */
  getScene<T extends Phaser.Scene>(key: SceneKeyType): T | null {
    return (this.scene.getScene(key) as T) ?? null
  }

  /**
   * 检查场景是否活跃
   */
  isActive(key: SceneKeyType): boolean {
    return this.scene.isActive(key)
  }

  /**
   * 获取当前活跃的场景（用于启动叠加场景）
   */
  private getActiveScene(): Phaser.Scene | null {
    const scenes = this.scene.getScenes(true)
    return scenes.length > 0 ? scenes[0] : null
  }
}
