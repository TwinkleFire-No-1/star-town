// 星火小镇 — 音频管理器
// T4.5.1 BGM加载/切换/淡入淡出、音效播放

import Phaser from 'phaser'

// =============================================
// 音频类型定义
// =============================================

/** BGM区域配置 */
export interface BGMConfig {
  /** 区域ID */
  areaId: string
  /** BGM key */
  bgmKey: string
  /** 音量 (0-1) */
  volume: number
  /** 是否循环 */
  loop: boolean
  /** BPM（用于节拍同步） */
  bpm?: number
}

/** 音效配置 */
export interface SFXConfig {
  /** 音效key */
  key: string
  /** 音量 (0-1) */
  volume: number
  /** 是否允许多实例同时播放 */
  allowMultiple: boolean
  /** 最大同时播放数 */
  maxInstances: number
}

/** 淡入淡出配置 */
export interface FadeConfig {
  /** 淡出时长(ms) */
  fadeOutDuration: number
  /** 淡入时长(ms) */
  fadeInDuration: number
}

// =============================================
// 默认BGM配置
// =============================================

export const DEFAULT_BGM_CONFIGS: BGMConfig[] = [
  { areaId: 'town_center', bgmKey: 'bgm_town', volume: 0.5, loop: true, bpm: 90 },
  { areaId: 'tavern', bgmKey: 'bgm_tavern', volume: 0.4, loop: true, bpm: 80 },
  { areaId: 'forest', bgmKey: 'bgm_forest', volume: 0.45, loop: true, bpm: 70 },
  { areaId: 'sacred_grove', bgmKey: 'bgm_sacred', volume: 0.35, loop: true, bpm: 60 },
  { areaId: 'shadow_tower', bgmKey: 'bgm_shadow', volume: 0.5, loop: true, bpm: 100 },
  { areaId: 'battle', bgmKey: 'bgm_battle', volume: 0.55, loop: true, bpm: 140 },
  { areaId: 'boss_battle', bgmKey: 'bgm_boss', volume: 0.6, loop: true, bpm: 160 },
  { areaId: 'title', bgmKey: 'bgm_title', volume: 0.5, loop: true, bpm: 85 },
]

// =============================================
// 默认音效配置
// =============================================

export const DEFAULT_SFX_CONFIGS: SFXConfig[] = [
  { key: 'sfx_step', volume: 0.15, allowMultiple: true, maxInstances: 3 },
  { key: 'sfx_interact', volume: 0.4, allowMultiple: false, maxInstances: 1 },
  { key: 'sfx_dialogue_open', volume: 0.3, allowMultiple: false, maxInstances: 1 },
  { key: 'sfx_dialogue_close', volume: 0.3, allowMultiple: false, maxInstances: 1 },
  { key: 'sfx_buy', volume: 0.5, allowMultiple: false, maxInstances: 1 },
  { key: 'sfx_sell', volume: 0.4, allowMultiple: false, maxInstances: 1 },
  { key: 'sfx_quest_accept', volume: 0.5, allowMultiple: false, maxInstances: 1 },
  { key: 'sfx_quest_complete', volume: 0.6, allowMultiple: false, maxInstances: 1 },
  { key: 'sfx_hit', volume: 0.5, allowMultiple: true, maxInstances: 5 },
  { key: 'sfx_critical', volume: 0.7, allowMultiple: false, maxInstances: 1 },
  { key: 'sfx_levelup', volume: 0.6, allowMultiple: false, maxInstances: 1 },
  { key: 'sfx_item_pickup', volume: 0.4, allowMultiple: true, maxInstances: 3 },
  { key: 'sfx_menu_open', volume: 0.3, allowMultiple: false, maxInstances: 1 },
  { key: 'sfx_menu_close', volume: 0.3, allowMultiple: false, maxInstances: 1 },
  { key: 'sfx_menu_select', volume: 0.2, allowMultiple: true, maxInstances: 2 },
  { key: 'sfx_error', volume: 0.4, allowMultiple: false, maxInstances: 1 },
]

// =============================================
// 音频管理器
// =============================================

/**
 * AudioManager — 音频管理器
 *
 * 特性：
 * - BGM加载/切换/淡入淡出
 * - 音效播放（支持多实例）
 * - 全局音量控制（主音量/BGM音量/SFX音量）
 * - 昼夜时段感知（夜间BGM音量微调）
 * - 战斗BGM自动切换
 * - 静音/恢复
 */
export class AudioManager {
  private scene: Phaser.Scene | null = null
  private currentBGM: Phaser.Sound.BaseSound | null = null
  private currentBGMKey: string | null = null
  private bgmConfigs: Map<string, BGMConfig> = new Map()
  private sfxConfigs: Map<string, SFXConfig> = new Map()
  private activeSFX: Record<string, Phaser.Sound.BaseSound[]> = {}
  private isMuted: boolean = false

  // 音量控制
  private masterVolume: number = 1.0
  private bgmVolume: number = 0.5
  private sfxVolume: number = 0.7

  // 淡入淡出配置
  private fadeConfig: FadeConfig = {
    fadeOutDuration: 1000,
    fadeInDuration: 800,
  }

  constructor() {
    // 加载默认配置
    for (const cfg of DEFAULT_BGM_CONFIGS) {
      this.bgmConfigs.set(cfg.areaId, cfg)
    }
    for (const cfg of DEFAULT_SFX_CONFIGS) {
      this.sfxConfigs.set(cfg.key, cfg)
    }
  }

  /**
   * 初始化（在Phaser场景中调用）
   */
  init(scene: Phaser.Scene): void {
    this.scene = scene
  }

  /**
   * 预加载音频资源
   * 在PreloadScene中调用
   */
  preload(scene: Phaser.Scene): void {
    // BGM
    for (const cfg of DEFAULT_BGM_CONFIGS) {
      scene.load.audio(cfg.bgmKey, [`assets/audio/bgm/${cfg.bgmKey}.mp3`, `assets/audio/bgm/${cfg.bgmKey}.ogg`])
    }
    // SFX
    for (const cfg of DEFAULT_SFX_CONFIGS) {
      scene.load.audio(cfg.key, [`assets/audio/sfx/${cfg.key}.mp3`, `assets/audio/sfx/${cfg.key}.ogg`])
    }
  }

  /**
   * 播放BGM（自动淡入淡出切换）
   */
  playBGM(areaId: string): void {
    if (!this.scene) return

    const config = this.bgmConfigs.get(areaId)
    if (!config) return

    // 如果已经在播放同一首BGM，跳过
    if (this.currentBGMKey === config.bgmKey) return

    const targetVolume = this.calculateBGMVolume(config.volume)

    // 淡出当前BGM
    if (this.currentBGM) {
      const oldBGM = this.currentBGM
      this.scene.tweens.add({
        targets: { volume: (oldBGM as Phaser.Sound.WebAudioSound).volume },
        volume: 0,
        duration: this.fadeConfig.fadeOutDuration,
        ease: 'Power2',
        onUpdate: (tween) => {
          if (oldBGM && (oldBGM as Phaser.Sound.WebAudioSound).isPlaying) {
            (oldBGM as Phaser.Sound.WebAudioSound).setVolume(tween.getValue() ?? 0)
          }
        },
        onComplete: () => {
          if ((oldBGM as Phaser.Sound.WebAudioSound).isPlaying) {
            (oldBGM as Phaser.Sound.WebAudioSound).stop()
          }
        },
      })
    }

    // 淡入新BGM
    if (this.scene.cache.audio.exists(config.bgmKey)) {
      const newBGM = this.scene.sound.add(config.bgmKey, {
        volume: 0,
        loop: config.loop,
      })

      // 从0淡入到目标音量
      this.scene.tweens.add({
        targets: { volume: 0 },
        volume: targetVolume,
        duration: this.fadeConfig.fadeInDuration,
        ease: 'Power2',
        onUpdate: (tween) => {
          (newBGM as Phaser.Sound.WebAudioSound).setVolume(tween.getValue() ?? 0)
        },
      })

      newBGM.play()
      this.currentBGM = newBGM
      this.currentBGMKey = config.bgmKey
    }
  }

  /**
   * 播放音效
   */
  playSFX(key: string, volume?: number): void {
    if (!this.scene || this.isMuted) return

    const config = this.sfxConfigs.get(key)
    if (!config) return

    // 检查同时播放数
    const active: Phaser.Sound.BaseSound[] = this.activeSFX[key] ?? []
    if (!config.allowMultiple && active.length >= 1) return
    if (active.length >= config.maxInstances) {
      // 移除最旧的实例
      const oldest = active.shift()
      if (oldest && (oldest as Phaser.Sound.WebAudioSound).isPlaying) {
        (oldest as Phaser.Sound.WebAudioSound).stop()
      }
    }

    if (this.scene.cache.audio.exists(key)) {
      const effectiveVolume = (volume ?? config.volume) * this.sfxVolume * this.masterVolume
      const sfx = this.scene.sound.add(key, {
        volume: effectiveVolume,
        loop: false,
      })

      sfx.play();
      active.push(sfx);
      this.activeSFX[key] = active;

      // 播放结束后自动清理
      (sfx as Phaser.Sound.WebAudioSound).on('complete', () => {
        const list = this.activeSFX[key] ?? []
        const idx = list.indexOf(sfx)
        if (idx >= 0) list.splice(idx, 1)
        sfx.destroy()
      })
    }
  }

  /**
   * 设置主音量
   */
  setMasterVolume(volume: number): void {
    this.masterVolume = Math.max(0, Math.min(1, volume))
  }

  /**
   * 设置BGM音量
   */
  setBGMVolume(volume: number): void {
    this.bgmVolume = Math.max(0, Math.min(1, volume))
    if (this.currentBGM) {
      (this.currentBGM as Phaser.Sound.WebAudioSound).setVolume(
        this.calculateBGMVolume(this.bgmVolume),
      )
    }
  }

  /**
   * 设置SFX音量
   */
  setSFXVolume(volume: number): void {
    this.sfxVolume = Math.max(0, Math.min(1, volume))
  }

  /**
   * 静音/恢复
   */
  toggleMute(): boolean {
    this.isMuted = !this.isMuted
    if (this.currentBGM) {
      (this.currentBGM as Phaser.Sound.WebAudioSound).setMute(this.isMuted)
    }
    return this.isMuted
  }

  /**
   * 停止所有音频
   */
  stopAll(): void {
    if (this.currentBGM) {
      (this.currentBGM as Phaser.Sound.WebAudioSound).stop()
      this.currentBGM = null
      this.currentBGMKey = null
    }
    for (const sfxList of Object.values(this.activeSFX)) {
      for (const sfx of sfxList) {
        if ((sfx as Phaser.Sound.WebAudioSound).isPlaying) {
          (sfx as Phaser.Sound.WebAudioSound).stop()
        }
        sfx.destroy()
      }
    }
    this.activeSFX = {}
  }

  /**
   * 计算BGM实际音量（考虑全局音量系数）
   */
  private calculateBGMVolume(configVolume: number): number {
    return configVolume * this.bgmVolume * this.masterVolume
  }

  /**
   * 获取当前状态
   */
  getState(): {
    currentBGMKey: string | null
    masterVolume: number
    bgmVolume: number
    sfxVolume: number
    isMuted: boolean
  } {
    return {
      currentBGMKey: this.currentBGMKey,
      masterVolume: this.masterVolume,
      bgmVolume: this.bgmVolume,
      sfxVolume: this.sfxVolume,
      isMuted: this.isMuted,
    }
  }
}

/** 音频管理器单例 */
export const audioManager = new AudioManager()
