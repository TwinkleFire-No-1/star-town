import Phaser from 'phaser'
import { GAME_WIDTH, GAME_HEIGHT } from '../config'
import { FONT_TITLE, FONT_SIZE } from '../typography'

/**
 * NPC交互配置
 */
interface NPCInteractionConfig {
  /** 触发距离（像素） */
  triggerDistance: number
  /** 交互提示精灵大小 */
  promptSize: number
  /** 交互键 */
  interactKey: string
}

/**
 * NPC交互信息
 */
interface NPCInteractInfo {
  /** NPC精灵 */
  sprite: Phaser.GameObjects.Sprite
  /** NPC唯一ID */
  npcId: string
  /** NPC名称 */
  npcName: string
  /** 交互提示图标 */
  promptIcon: Phaser.GameObjects.Container | null
  /** 是否可交互 */
  interactable: boolean
}

/**
 * NPCInteractionSystem — NPC交互触发系统
 *
 * 职责：
 * - 检测玩家与NPC的距离
 * - 接近NPC时显示交互提示（如气泡图标）
 * - 按交互键（E/Enter）触发交互事件
 * - 管理NPC交互状态
 *
 * 设计：
 * - 每帧检测玩家与所有NPC的距离
 * - 在触发距离内显示提示，超出隐藏
 * - 交互键按下时向GameScene发送交互事件
 * - 支持动态注册/注销NPC
 */
export class NPCInteractionSystem {
  private scene: Phaser.Scene
  private config: NPCInteractionConfig = {
    triggerDistance: 100, // 约1.5个Tile（64px tile），1920×1080 世界坐标
    promptSize: 32,
    interactKey: 'E',
  }

  /** 已注册的NPC列表 */
  private npcs: Map<string, NPCInteractInfo> = new Map()

  /** 当前可交互的NPC ID */
  private activeNPCId: string | null = null

  /** 交互键 */
  private interactKey!: Phaser.Input.Keyboard.Key

  /** 交互事件回调 */
  private onInteractCallbacks: Array<(npcId: string, npcName: string) => void> = []

  /** 交互提示容器（UI层） */
  private promptContainer: Phaser.GameObjects.Container | null = null

  /** 交互提示文字 */
  private promptText: Phaser.GameObjects.Text | null = null

  constructor(scene: Phaser.Scene) {
    this.scene = scene
  }

  /**
   * 初始化交互系统
   */
  init(): void {
    // 交互键绑定
    this.interactKey = this.scene.input.keyboard!.addKey(
      Phaser.Input.Keyboard.KeyCodes.E,
    )

    // 交互提示UI（固定在屏幕底部，适配 1920×1080）
    this.promptContainer = this.scene.add.container(
      GAME_WIDTH / 2,
      GAME_HEIGHT - 100,
    )
    this.promptContainer.setDepth(2000)
    this.promptContainer.setScrollFactor(0)
    this.promptContainer.setVisible(false)

    // 提示背景
    const bg = this.scene.add.rectangle(0, 0, 520, 88, 0x000000, 0.7)
    this.promptContainer.add(bg)

    // 提示文字
    this.promptText = this.scene.add.text(0, 0, '', {
      fontSize: FONT_SIZE.SM,
      fontFamily: FONT_TITLE,
      color: '#ffffff',
      align: 'center',
    })
    this.promptText.setOrigin(0.5, 0.5)
    this.promptContainer.add(this.promptText)

    console.log('[NPCInteraction] Initialized')
  }

  /**
   * 每帧更新
   * @param playerX 玩家X坐标
   * @param playerY 玩家Y坐标
   */
  update(playerX: number, playerY: number): void {
    // 检测最近的NPC
    let closestNPC: NPCInteractInfo | null = null
    let closestDist = Infinity

    for (const npc of this.npcs.values()) {
      if (!npc.interactable) continue

      const dx = playerX - npc.sprite.x
      const dy = playerY - npc.sprite.y
      const dist = Math.sqrt(dx * dx + dy * dy)

      if (dist < this.config.triggerDistance && dist < closestDist) {
        closestDist = dist
        closestNPC = npc
      }
    }

    // 更新可交互状态
    const newActiveId = closestNPC?.npcId ?? null
    // 修复：当 activeNPCId 已为 null 但提示仍残留可见时（场景切换后旧NPC销毁），
    // 需要强制触发隐藏，否则会残留上一场景的 NPC 提示（如森林NPC"托比"出现在矿洞）
    const promptDirty = newActiveId === null && (this.activeNPCId !== null || this.promptContainer?.visible)
    if (newActiveId !== this.activeNPCId || promptDirty) {
      this.activeNPCId = newActiveId
      this.updatePromptDisplay(closestNPC)
    }

    // 检测交互键
    if (this.interactKey.isDown && this.activeNPCId) {
      this.triggerInteraction(this.activeNPCId)
    }
  }

  /**
   * 更新交互提示显示
   */
  private updatePromptDisplay(npc: NPCInteractInfo | null): void {
    if (!this.promptContainer) return

    if (npc) {
      this.promptText?.setText(`[E] 与${npc.npcName}对话`)
      this.promptContainer.setVisible(true)
    } else {
      this.promptContainer.setVisible(false)
    }
  }

  /**
   * 触发交互
   */
  private triggerInteraction(npcId: string): void {
    const npc = this.npcs.get(npcId)
    if (!npc) return

    // 防止重复触发（按键防抖）
    if (this.interactKey.getDuration() > 100) return

    console.log(`[NPCInteraction] Interacting with NPC: ${npc.npcName} (${npcId})`)
    this.onInteractCallbacks.forEach((cb) => cb(npcId, npc.npcName))
  }

  /**
   * 注册NPC到交互系统
   * @param npcId NPC唯一ID
   * @param npcName NPC名称
   * @param sprite NPC精灵
   * @param interactable 是否可交互（默认true）
   */
  registerNPC(
    npcId: string,
    npcName: string,
    sprite: Phaser.GameObjects.Sprite,
    interactable = true,
  ): void {
    this.npcs.set(npcId, {
      sprite,
      npcId,
      npcName,
      promptIcon: null,
      interactable,
    })
    console.log(`[NPCInteraction] Registered NPC: ${npcName} (${npcId})`)
  }

  /**
   * 注销NPC
   */
  unregisterNPC(npcId: string): void {
    const npc = this.npcs.get(npcId)
    if (npc?.promptIcon) {
      npc.promptIcon.destroy()
    }
    this.npcs.delete(npcId)

    if (this.activeNPCId === npcId) {
      this.activeNPCId = null
    }
  }

  /**
   * 清空交互提示（场景切换时调用）
   * 防止残留上一场景的 NPC 提示（如森林NPC"托比"出现在矿洞）
   */
  clearPrompt(): void {
    this.activeNPCId = null
    this.updatePromptDisplay(null)
  }

  /**
   * 注册交互回调
   */
  onInteract(callback: (npcId: string, npcName: string) => void): void {
    this.onInteractCallbacks.push(callback)
  }

  /**
   * 获取当前可交互的NPC ID
   */
  getActiveNPCId(): string | null {
    return this.activeNPCId
  }

  /**
   * 设置触发距离
   */
  setTriggerDistance(distance: number): void {
    this.config.triggerDistance = distance
  }

  /**
   * 获取所有注册的NPC ID列表
   */
  getRegisteredNPCs(): string[] {
    return Array.from(this.npcs.keys())
  }
}
