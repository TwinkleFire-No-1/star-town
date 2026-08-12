// 星火小镇 — 占位音频素材
// T4.5.2 区域BGM(占位MIDI)、基础音效集
//
// 本文件定义音频素材的元数据和生成方式。
// 实际音频文件会在构建时由占位生成器创建。
// 在开发阶段使用程序化生成的简单音效，
// 后续可替换为专业制作的音频资源。

// =============================================
// 占位音频元数据
// =============================================

/** BGM元数据 */
export interface BGMMeta {
  key: string
  name: string
  areaId: string
  bpm: number
  keySignature: string
  /** 占位MIDI音符序列 */
  placeholderNotes: number[]
  /** 占位音色 */
  placeholderTimbre: 'piano' | 'organ' | 'strings' | 'synth'
  duration: number // 秒
}

/** 音效元数据 */
export interface SFXMeta {
  key: string
  name: string
  category: 'ui' | 'movement' | 'combat' | 'environment' | 'dialogue'
  /** 占位频率（Hz） */
  placeholderFrequency: number
  /** 占位波形 */
  placeholderWaveform: 'sine' | 'square' | 'sawtooth' | 'noise'
  /** 占位时长（ms） */
  placeholderDuration: number
}

// =============================================
// BGM素材列表
// =============================================

export const BGM_META_LIST: BGMMeta[] = [
  {
    key: 'bgm_title',
    name: '星火序曲',
    areaId: 'title',
    bpm: 85,
    keySignature: 'C major',
    placeholderNotes: [60, 64, 67, 72, 67, 64, 60, 55],
    placeholderTimbre: 'piano',
    duration: 30,
  },
  {
    key: 'bgm_town',
    name: '小镇晨曦',
    areaId: 'town_center',
    bpm: 90,
    keySignature: 'G major',
    placeholderNotes: [55, 59, 62, 67, 71, 67, 62, 59],
    placeholderTimbre: 'organ',
    duration: 45,
  },
  {
    key: 'bgm_tavern',
    name: '酒馆夜谈',
    areaId: 'tavern',
    bpm: 80,
    keySignature: 'A minor',
    placeholderNotes: [57, 60, 64, 69, 64, 60, 57, 52],
    placeholderTimbre: 'organ',
    duration: 40,
  },
  {
    key: 'bgm_forest',
    name: '森林低语',
    areaId: 'forest',
    bpm: 70,
    keySignature: 'D minor',
    placeholderNotes: [50, 53, 57, 62, 57, 53, 50, 45],
    placeholderTimbre: 'strings',
    duration: 50,
  },
  {
    key: 'bgm_sacred',
    name: '圣林回响',
    areaId: 'sacred_grove',
    bpm: 60,
    keySignature: 'E minor',
    placeholderNotes: [52, 55, 59, 64, 59, 55, 52, 47],
    placeholderTimbre: 'strings',
    duration: 55,
  },
  {
    key: 'bgm_shadow',
    name: '暗影笼罩',
    areaId: 'shadow_tower',
    bpm: 100,
    keySignature: 'C minor',
    placeholderNotes: [48, 51, 55, 60, 55, 51, 48, 43],
    placeholderTimbre: 'synth',
    duration: 40,
  },
  {
    key: 'bgm_battle',
    name: '战火纷飞',
    areaId: 'battle',
    bpm: 140,
    keySignature: 'D minor',
    placeholderNotes: [50, 53, 57, 62, 65, 62, 57, 50],
    placeholderTimbre: 'synth',
    duration: 30,
  },
  {
    key: 'bgm_boss',
    name: '宿命对决',
    areaId: 'boss_battle',
    bpm: 160,
    keySignature: 'E minor',
    placeholderNotes: [52, 55, 59, 64, 67, 64, 59, 52],
    placeholderTimbre: 'synth',
    duration: 25,
  },
]

// =============================================
// 音效素材列表
// =============================================

export const SFX_META_LIST: SFXMeta[] = [
  // ---- UI音效 ----
  { key: 'sfx_step', name: '脚步声', category: 'movement', placeholderFrequency: 200, placeholderWaveform: 'noise', placeholderDuration: 80 },
  { key: 'sfx_interact', name: '交互', category: 'ui', placeholderFrequency: 440, placeholderWaveform: 'sine', placeholderDuration: 120 },
  { key: 'sfx_dialogue_open', name: '对话打开', category: 'dialogue', placeholderFrequency: 523, placeholderWaveform: 'sine', placeholderDuration: 150 },
  { key: 'sfx_dialogue_close', name: '对话关闭', category: 'dialogue', placeholderFrequency: 392, placeholderWaveform: 'sine', placeholderDuration: 100 },
  { key: 'sfx_menu_open', name: '菜单打开', category: 'ui', placeholderFrequency: 587, placeholderWaveform: 'sine', placeholderDuration: 100 },
  { key: 'sfx_menu_close', name: '菜单关闭', category: 'ui', placeholderFrequency: 330, placeholderWaveform: 'sine', placeholderDuration: 100 },
  { key: 'sfx_menu_select', name: '菜单选择', category: 'ui', placeholderFrequency: 660, placeholderWaveform: 'square', placeholderDuration: 50 },
  { key: 'sfx_error', name: '错误提示', category: 'ui', placeholderFrequency: 150, placeholderWaveform: 'square', placeholderDuration: 200 },

  // ---- 交易音效 ----
  { key: 'sfx_buy', name: '购买', category: 'ui', placeholderFrequency: 784, placeholderWaveform: 'sine', placeholderDuration: 150 },
  { key: 'sfx_sell', name: '出售', category: 'ui', placeholderFrequency: 659, placeholderWaveform: 'sine', placeholderDuration: 150 },
  { key: 'sfx_item_pickup', name: '物品拾取', category: 'environment', placeholderFrequency: 880, placeholderWaveform: 'sine', placeholderDuration: 100 },

  // ---- 任务音效 ----
  { key: 'sfx_quest_accept', name: '任务接受', category: 'ui', placeholderFrequency: 523, placeholderWaveform: 'sine', placeholderDuration: 200 },
  { key: 'sfx_quest_complete', name: '任务完成', category: 'ui', placeholderFrequency: 784, placeholderWaveform: 'sine', placeholderDuration: 300 },

  // ---- 战斗音效 ----
  { key: 'sfx_hit', name: '普通攻击', category: 'combat', placeholderFrequency: 220, placeholderWaveform: 'noise', placeholderDuration: 100 },
  { key: 'sfx_critical', name: '暴击', category: 'combat', placeholderFrequency: 330, placeholderWaveform: 'noise', placeholderDuration: 150 },
  { key: 'sfx_levelup', name: '升级', category: 'combat', placeholderFrequency: 880, placeholderWaveform: 'sine', placeholderDuration: 500 },
]

// =============================================
// 音频占位生成器
// =============================================

/**
 * AudioPlaceholderGenerator — 占位音频文件生成器
 *
 * 使用Web Audio API在运行时动态生成占位音效，
 * 无需预先生成音频文件。
 * 生产环境可替换为真实音频资源。
 */
export class AudioPlaceholderGenerator {
  private audioContext: AudioContext | null = null

  /** 初始化AudioContext */
  init(): void {
    if (!this.audioContext) {
      this.audioContext = new AudioContext()
    }
  }

  /** 生成简单音效并返回AudioBuffer */
  generateSFX(meta: SFXMeta): AudioBuffer | null {
    if (!this.audioContext) return null

    const sampleRate = this.audioContext.sampleRate
    const duration = meta.placeholderDuration / 1000
    const numSamples = Math.round(sampleRate * duration)
    const buffer = this.audioContext.createBuffer(1, numSamples, sampleRate)
    const data = buffer.getChannelData(0)

    const freq = meta.placeholderFrequency

    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate
      const envelope = 1 - (i / numSamples) // 线性衰减

      let sample = 0
      switch (meta.placeholderWaveform) {
        case 'sine':
          sample = Math.sin(2 * Math.PI * freq * t)
          break
        case 'square':
          sample = Math.sin(2 * Math.PI * freq * t) > 0 ? 1 : -1
          break
        case 'sawtooth':
          sample = 2 * ((freq * t) % 1) - 1
          break
        case 'noise':
          sample = Math.random() * 2 - 1
          break
      }

      data[i] = sample * envelope * 0.3 // 低音量避免刺耳
    }

    return buffer
  }

  /** 生成简单BGM音符序列 */
  generateBGMNotes(notes: number[], bpm: number, timbre: string): AudioBuffer | null {
    if (!this.audioContext) return null

    const sampleRate = this.audioContext.sampleRate
    const beatDuration = 60 / bpm
    const totalDuration = notes.length * beatDuration
    const numSamples = Math.round(sampleRate * totalDuration)
    const buffer = this.audioContext.createBuffer(1, numSamples, sampleRate)
    const data = buffer.getChannelData(0)

    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate
      const beatIndex = Math.floor(t / beatDuration)
      const noteFreq = 440 * Math.pow(2, (notes[beatIndex % notes.length] - 69) / 12)

      const beatT = (t % beatDuration) / beatDuration
      const envelope = Math.max(0, 1 - beatT * 1.5) // 快速衰减

      let sample = 0
      switch (timbre) {
        case 'piano':
          sample = Math.sin(2 * Math.PI * noteFreq * t) * envelope
          break
        case 'organ':
          sample = (Math.sin(2 * Math.PI * noteFreq * t) +
                    0.5 * Math.sin(4 * Math.PI * noteFreq * t)) * 0.5 * envelope
          break
        case 'strings':
          sample = (Math.sin(2 * Math.PI * noteFreq * t) +
                    0.3 * Math.sin(6 * Math.PI * noteFreq * t)) * 0.4 * Math.min(1, beatT * 5) * envelope
          break
        case 'synth':
          sample = Math.sin(2 * Math.PI * noteFreq * t) *
                   (0.5 + 0.5 * Math.sin(2 * Math.PI * 6 * t)) * envelope
          break
        default:
          sample = Math.sin(2 * Math.PI * noteFreq * t) * envelope
      }

      data[i] = sample * 0.2
    }

    return buffer
  }

  /** 清理 */
  destroy(): void {
    if (this.audioContext) {
      this.audioContext.close()
      this.audioContext = null
    }
  }
}

/** 占位音频生成器单例 */
export const audioPlaceholderGenerator = new AudioPlaceholderGenerator()
