// 星火小镇 — 背景音乐系统（T7.x.13）
// 星露谷风格程序化合成 BGM：田园轻快 / 室内温暖 / 森林宁静 / 矿洞神秘 / 战斗紧张
//
// 方案说明：
// - 项目无音频资源文件，采用 Web Audio API 离线渲染（OfflineAudioContext）程序化合成
// - 每首曲目 8 小节 × 8 槽（八分音符），64 槽循环，loop 无缝衔接
// - 音色：lead(方波+三角波,类长笛/口琴) / arp(三角波分解和弦) / bass(正弦+三角) / 打击乐(噪声)
// - 浏览器自动播放策略：AudioContext 挂起时监听首次用户手势自动恢复
// - 播放管理：单曲循环 + 淡入淡出无缝切换（800ms）

// =============================================
// 类型定义
// =============================================

/** MIDI 音符编号（0=休止符） */
type MidiSlot = number

/** 曲目定义：8 小节 × 8 槽 = 64 槽（每槽一个八分音符） */
export interface TrackDef {
  key: string
  /** 曲名 */
  name: string
  /** 每分钟节拍数 */
  bpm: number
  /** 主旋律（64槽） */
  lead: MidiSlot[]
  /** 伴奏分解和弦（64槽） */
  arp: MidiSlot[]
  /** 低音（64槽，0=休止） */
  bass: MidiSlot[]
  /** 打击乐（每槽 0/1） */
  perc: {
    kick: number[]
    snare: number[]
    hihat: number[]
  }
  /** 低音音色：'soft' | 'drive'（战斗用锯齿波更凶狠） */
  bassWave?: 'soft' | 'drive'
  /** 主旋律音色：'lead' | 'bright'（战斗更亮） */
  leadWave?: 'lead' | 'bright'
}

/** MIDI 转频率 */
function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12)
}

// =============================================
// 曲目乐谱
// =============================================

/** 通用休止槽 */
const R = 0

/** 4 小节 × 8 槽常用琶音模板（上行分解再回折） */
function arpUp(chord: number[]): number[] {
  const [r, t3, t5] = chord
  return [r, t3, t5, t3 + 12, t5, t3, r, t3]
}
/** 下行分解琶音（神秘感） */
function arpDown(chord: number[]): number[] {
  const [r, t3, t5] = chord
  return [t5, t3, r, t3, t5, t3, r, t3]
}

/** 低音：根音-五度 交替（每槽一个八分音符） */
function bassRootFifth(root: number, fifth: number): number[] {
  return [root, fifth, root, fifth, root, fifth, root, fifth]
}

/**
 * 曲目表 — 全部 G 大调/小调色彩，星露谷田园风
 */
export const TRACKS: TrackDef[] = [
  // ------------------------------------------------------------
  // 1. 小镇晨曦 — 田园轻快（G大调，96bpm）
  // 和弦：G | D/F# | Em | C | G | D | C | G
  // ------------------------------------------------------------
  {
    key: 'town',
    name: '小镇晨曦',
    bpm: 96,
    lead: [
      // G
      74, R, 74, 71, R, 74, 71, 67,
      // D/F# (C#5 A4)
      73, R, 74, 73, R, 74, 73, 69,
      // Em
      71, R, 71, 67, R, 71, 67, 64,
      // C
      72, R, 72, 67, R, 72, 67, 60,
      // G
      74, R, 74, 71, R, 74, 71, 67,
      // D
      69, R, 69, 66, R, 69, 66, 62,
      // C
      67, R, 67, 64, R, 67, 64, 60,
      // G（收尾上行引向下一循环）
      62, R, 62, 59, R, 59, 62, 67,
    ],
    arp: [
      ...arpUp([55, 59, 62]), // G
      ...arpUp([54, 57, 62]), // D/F#
      ...arpUp([52, 55, 59]), // Em
      ...arpUp([55, 60, 64]), // C
      ...arpUp([55, 59, 62]), // G
      ...arpUp([50, 57, 62]), // D
      ...arpUp([55, 60, 64]), // C
      ...arpUp([55, 59, 62]), // G
    ],
    bass: [
      ...bassRootFifth(43, 50), // G
      ...bassRootFifth(42, 49), // F#m
      ...bassRootFifth(40, 47), // E
      ...bassRootFifth(36, 43), // C
      ...bassRootFifth(43, 50), // G
      ...bassRootFifth(38, 45), // D
      ...bassRootFifth(36, 43), // C
      ...bassRootFifth(43, 50), // G
    ],
    perc: {
      kick: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
      snare: [0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
      hihat: [0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1],
    },
  },

  // ------------------------------------------------------------
  // 2. 酒馆夜谈 — 室内温暖民谣（A小调，84bpm）
  // 和弦：Am | F | C | G（×2）
  // ------------------------------------------------------------
  {
    key: 'tavern',
    name: '酒馆夜谈',
    bpm: 84,
    lead: [
      // Am
      69, R, 64, R, 69, R, 72, R,
      // F
      72, R, 69, R, 72, R, 76, R,
      // C
      76, R, 72, R, 69, R, 67, R,
      // G
      67, R, 64, R, 62, R, 64, R,
      // Am
      69, R, 72, R, 76, R, 72, R,
      // F
      72, R, 69, R, 65, R, 69, R,
      // C
      67, R, 64, R, 60, R, 64, R,
      // G（收尾落低音区）
      62, R, 59, R, 55, R, 62, R,
    ],
    arp: [
      ...arpUp([57, 60, 64]), // Am
      ...arpUp([53, 57, 60]), // F
      ...arpUp([55, 60, 64]), // C
      ...arpUp([55, 59, 62]), // G
      ...arpUp([57, 60, 64]), // Am
      ...arpUp([53, 57, 60]), // F
      ...arpUp([55, 60, 64]), // C
      ...arpUp([55, 59, 62]), // G
    ],
    bass: [
      ...bassRootFifth(45, 52), // Am
      ...bassRootFifth(41, 48), // F
      ...bassRootFifth(36, 43), // C
      ...bassRootFifth(43, 50), // G
      ...bassRootFifth(45, 52), // Am
      ...bassRootFifth(41, 48), // F
      ...bassRootFifth(36, 43), // C
      ...bassRootFifth(43, 50), // G
    ],
    perc: {
      kick: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      snare: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      hihat: [0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1],
    },
  },

  // ------------------------------------------------------------
  // 3. 森林低语 — 宁静空灵（D小调，76bpm）
  // 和弦：Dm | Bb | F | C（×2）
  // ------------------------------------------------------------
  {
    key: 'forest',
    name: '森林低语',
    bpm: 76,
    lead: [
      // Dm
      62, R, R, 65, R, R, 69, 65,
      // Bb
      65, R, R, 62, R, R, 58, 62,
      // F
      60, R, R, 65, R, R, 69, 65,
      // C
      67, R, R, 64, R, R, 60, 64,
      // Dm
      62, R, R, 65, R, R, 69, 72,
      // Bb
      74, R, R, 72, R, R, 69, 65,
      // F
      69, R, R, 65, R, R, 62, 65,
      // C（落 D4 导向 Dm）
      67, R, R, 64, R, R, 60, 62,
    ],
    arp: [
      ...arpUp([50, 53, 57]), // Dm
      ...arpUp([58, 62, 65]), // Bb
      ...arpUp([53, 57, 60]), // F
      ...arpUp([55, 60, 64]), // C
      ...arpUp([50, 53, 57]), // Dm
      ...arpUp([58, 62, 65]), // Bb
      ...arpUp([53, 57, 60]), // F
      ...arpUp([55, 60, 64]), // C
    ],
    bass: [
      ...bassRootFifth(38, 45), // Dm
      ...bassRootFifth(46, 53), // Bb
      ...bassRootFifth(41, 48), // F
      ...bassRootFifth(36, 43), // C
      ...bassRootFifth(38, 45), // Dm
      ...bassRootFifth(46, 53), // Bb
      ...bassRootFifth(41, 48), // F
      ...bassRootFifth(36, 43), // C
    ],
    perc: {
      kick: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      snare: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      hihat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    },
  },

  // ------------------------------------------------------------
  // 4. 矿洞回响 — 神秘幽深（C小调，88bpm）
  // 和弦：Cm | Ab | Eb | Bb（×2）
  // ------------------------------------------------------------
  {
    key: 'mine',
    name: '矿洞回响',
    bpm: 88,
    lead: [
      // Cm
      63, R, 60, R, 63, R, 67, R,
      // Ab
      67, R, 63, R, 60, R, 63, R,
      // Eb
      70, R, 67, R, 63, R, 67, R,
      // Bb
      65, R, 62, R, 58, R, 62, R,
      // Cm
      63, R, 67, R, 70, R, 67, R,
      // Ab
      67, R, 63, R, 60, R, 63, R,
      // Eb
      70, R, 67, R, 63, R, 67, R,
      // Bb→Cm（落 C4）
      65, R, 62, R, 58, R, 60, R,
    ],
    arp: [
      ...arpDown([48, 51, 55]), // Cm
      ...arpDown([56, 60, 63]), // Ab
      ...arpDown([51, 55, 58]), // Eb
      ...arpDown([58, 62, 65]), // Bb
      ...arpDown([48, 51, 55]), // Cm
      ...arpDown([56, 60, 63]), // Ab
      ...arpDown([51, 55, 58]), // Eb
      ...arpDown([58, 62, 65]), // Bb
    ],
    bass: [
      ...bassRootFifth(36, 43), // Cm
      ...bassRootFifth(44, 51), // Ab
      ...bassRootFifth(39, 46), // Eb
      ...bassRootFifth(46, 53), // Bb
      ...bassRootFifth(36, 43), // Cm
      ...bassRootFifth(44, 51), // Ab
      ...bassRootFifth(39, 46), // Eb
      ...bassRootFifth(46, 53), // Bb
    ],
    perc: {
      kick: [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
      snare: [0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0],
      hihat: [0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0],
    },
  },

  // ------------------------------------------------------------
  // 5. 战火纷飞 — 紧张战斗（D小调，144bpm，低音锯齿波驱动）
  // 和弦：Dm | Bb | F | A（×2）
  // ------------------------------------------------------------
  {
    key: 'battle',
    name: '战火纷飞',
    bpm: 144,
    bassWave: 'drive',
    leadWave: 'bright',
    lead: [
      // Dm
      62, 65, 62, 65, 57, 62, 57, 62,
      // Bb
      58, 62, 58, 62, 53, 58, 53, 58,
      // F
      60, 65, 60, 65, 57, 60, 57, 60,
      // A
      61, 64, 61, 64, 57, 61, 57, 61,
      // Dm
      62, 65, 62, 65, 57, 62, 57, 62,
      // Bb
      58, 62, 58, 62, 53, 58, 53, 58,
      // F
      60, 65, 60, 65, 57, 60, 57, 60,
      // A（末音落 D4 导向 Dm）
      61, 64, 61, 64, 57, 61, 57, 62,
    ],
    arp: [
      ...arpUp([50, 53, 57]), // Dm
      ...arpUp([58, 62, 65]), // Bb
      ...arpUp([53, 57, 60]), // F
      ...arpUp([57, 61, 64]), // A
      ...arpUp([50, 53, 57]), // Dm
      ...arpUp([58, 62, 65]), // Bb
      ...arpUp([53, 57, 60]), // F
      ...arpUp([57, 61, 64]), // A
    ],
    bass: [
      ...bassRootFifth(38, 45), // Dm
      ...bassRootFifth(46, 53), // Bb
      ...bassRootFifth(41, 48), // F
      ...bassRootFifth(45, 52), // A
      ...bassRootFifth(38, 45), // Dm
      ...bassRootFifth(46, 53), // Bb
      ...bassRootFifth(41, 48), // F
      ...bassRootFifth(45, 52), // A
    ],
    perc: {
      kick: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0],
      snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
      hihat: [0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1],
    },
  },

  // ------------------------------------------------------------
  // 6. 宿命对决 — BOSS战（E小调，160bpm，最强节奏）
  // 和弦：Em | Em | C | D（×2）
  // ------------------------------------------------------------
  {
    key: 'boss',
    name: '宿命对决',
    bpm: 160,
    bassWave: 'drive',
    leadWave: 'bright',
    lead: [
      // Em
      64, 67, 64, 67, 59, 64, 59, 64,
      // Em
      64, 67, 64, 67, 59, 64, 59, 64,
      // C
      60, 64, 60, 64, 55, 60, 55, 60,
      // D
      62, 66, 62, 66, 57, 62, 57, 62,
      // Em
      64, 67, 64, 67, 59, 64, 59, 64,
      // Em
      64, 67, 64, 67, 59, 64, 59, 64,
      // C
      60, 64, 60, 64, 55, 60, 55, 60,
      // D（末音 E4 导向 Em）
      62, 66, 62, 66, 57, 62, 57, 64,
    ],
    arp: [
      ...arpUp([52, 55, 59]), // Em
      ...arpUp([52, 55, 59]), // Em
      ...arpUp([55, 60, 64]), // C
      ...arpUp([50, 57, 62]), // D
      ...arpUp([52, 55, 59]), // Em
      ...arpUp([52, 55, 59]), // Em
      ...arpUp([55, 60, 64]), // C
      ...arpUp([50, 57, 62]), // D
    ],
    bass: [
      ...bassRootFifth(40, 47), // Em
      ...bassRootFifth(40, 47), // Em
      ...bassRootFifth(36, 43), // C
      ...bassRootFifth(38, 45), // D
      ...bassRootFifth(40, 47), // Em
      ...bassRootFifth(40, 47), // Em
      ...bassRootFifth(36, 43), // C
      ...bassRootFifth(38, 45), // D
    ],
    perc: {
      kick: [1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0],
      snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
      hihat: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    },
  },
]

// =============================================
// 离线渲染器
// =============================================

/** 创建白噪声 buffer（打击乐用，复用） */
function createNoiseBuffer(off: OfflineAudioContext, seconds: number): AudioBuffer {
  const sr = off.sampleRate
  const buffer = off.createBuffer(1, Math.floor(sr * seconds), sr)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < data.length; i++) {
    data[i] = Math.random() * 2 - 1
  }
  return buffer
}

/** 调度一个旋律/伴奏/低音音符 */
function scheduleTone(
  off: OfflineAudioContext,
  dest: AudioNode,
  t: number,
  midi: number,
  dur: number,
  voice: 'lead' | 'bright' | 'arp' | 'bass' | 'drive',
): void {
  const freq = midiToFreq(midi)
  const attack = 0.015
  const release = 0.12

  const env = off.createGain()
  env.connect(dest)
  env.gain.setValueAtTime(0, t)
  env.gain.linearRampToValueAtTime(1, t + attack)
  env.gain.setValueAtTime(1, t + dur)
  env.gain.linearRampToValueAtTime(0, t + dur + release)

  const start = t
  const stop = t + dur + release + 0.05

  if (voice === 'lead' || voice === 'bright') {
    // 主旋律：方波 + 八度三角波，低通柔化（类长笛/口琴）
    const o1 = off.createOscillator()
    o1.type = 'square'
    o1.frequency.value = freq
    const g1 = off.createGain()
    g1.gain.value = voice === 'bright' ? 0.32 : 0.22
    o1.connect(g1)
    g1.connect(env)

    const o2 = off.createOscillator()
    o2.type = 'triangle'
    o2.frequency.value = freq * 2
    const g2 = off.createGain()
    g2.gain.value = voice === 'bright' ? 0.28 : 0.4
    o2.connect(g2)
    g2.connect(env)

    o1.start(start); o1.stop(stop)
    o2.start(start); o2.stop(stop)
  } else if (voice === 'arp') {
    // 伴奏分解：三角波（柔和）
    const o = off.createOscillator()
    o.type = 'triangle'
    o.frequency.value = freq
    const g = off.createGain()
    g.gain.value = 0.7
    o.connect(g)
    g.connect(env)
    o.start(start); o.stop(stop)
  } else {
    // 低音：正弦 + 次三角（drive 时用锯齿波更凶狠）
    const o1 = off.createOscillator()
    o1.type = voice === 'drive' ? 'sawtooth' : 'sine'
    o1.frequency.value = freq
    const g1 = off.createGain()
    g1.gain.value = voice === 'drive' ? 0.5 : 0.8
    o1.connect(g1)
    g1.connect(env)

    const o2 = off.createOscillator()
    o2.type = 'triangle'
    o2.frequency.value = freq
    const g2 = off.createGain()
    g2.gain.value = voice === 'drive' ? 0.4 : 0.25
    o2.connect(g2)
    g2.connect(env)

    o1.start(start); o1.stop(stop)
    o2.start(start); o2.stop(stop)
  }
}

/** 调度打击乐：kick / snare / hihat */
function schedulePerc(
  off: OfflineAudioContext,
  dest: AudioNode,
  t: number,
  kind: 'kick' | 'snare' | 'hihat',
  noise: AudioBuffer,
): void {
  const env = off.createGain()
  env.connect(dest)

  if (kind === 'kick') {
    // 底鼓：低频正弦下滑
    const o = off.createOscillator()
    o.type = 'sine'
    o.frequency.setValueAtTime(150, t)
    o.frequency.exponentialRampToValueAtTime(45, t + 0.11)
    env.gain.setValueAtTime(0, t)
    env.gain.linearRampToValueAtTime(0.9, t + 0.005)
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.14)
    o.connect(env)
    o.start(t); o.stop(t + 0.16)
  } else if (kind === 'snare') {
    // 军鼓：带通噪声
    const src = off.createBufferSource()
    src.buffer = noise
    const bp = off.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = 1800
    bp.Q.value = 0.8
    env.gain.setValueAtTime(0.55, t)
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.1)
    src.connect(bp)
    bp.connect(env)
    src.start(t); src.stop(t + 0.12)
  } else {
    // 踩镲：高通噪声短音
    const src = off.createBufferSource()
    src.buffer = noise
    const hp = off.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = 6500
    env.gain.setValueAtTime(0.14, t)
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.045)
    src.connect(hp)
    hp.connect(env)
    src.start(t); src.stop(t + 0.06)
  }
}

/**
 * 渲染一首曲目为 AudioBuffer（离线渲染，loop 无缝）
 */
export function renderTrack(ctx: AudioContext, def: TrackDef): Promise<AudioBuffer> {
  const sr = ctx.sampleRate
  const slotDur = 60 / def.bpm / 2 // 八分音符时长
  const totalSlots = 64
  const tail = 1.5 // 尾部余音
  const duration = totalSlots * slotDur + tail

  const off = new OfflineAudioContext(2, Math.ceil(sr * duration), sr)

  // 输出总总线
  const master = off.createGain()
  master.gain.value = 0.85
  master.connect(off.destination)

  // 主旋律总线（带低通柔化）
  const leadBus = off.createGain()
  leadBus.gain.value = 0.5
  const leadFilter = off.createBiquadFilter()
  leadFilter.type = 'lowpass'
  leadFilter.frequency.value = 3400
  leadBus.connect(leadFilter)
  leadFilter.connect(master)

  // 伴奏总线
  const arpBus = off.createGain()
  arpBus.gain.value = 0.3
  arpBus.connect(master)

  // 低音总线（带低通）
  const bassBus = off.createGain()
  bassBus.gain.value = 0.85
  const bassFilter = off.createBiquadFilter()
  bassFilter.type = 'lowpass'
  bassFilter.frequency.value = 900
  bassBus.connect(bassFilter)
  bassFilter.connect(master)

  // 打击乐总线
  const percBus = off.createGain()
  percBus.gain.value = 0.6
  percBus.connect(master)

  const noise = createNoiseBuffer(off, 0.2)

  for (let s = 0; s < totalSlots; s++) {
    const t = s * slotDur
    const noteDur = slotDur * 0.92

    const m = def.lead[s]
    if (m > 0) {
      scheduleTone(off, leadBus, t, m, noteDur, def.leadWave === 'bright' ? 'bright' : 'lead')
    }
    const a = def.arp[s]
    if (a > 0) {
      scheduleTone(off, arpBus, t, a, noteDur, 'arp')
    }
    const b = def.bass[s]
    if (b > 0) {
      scheduleTone(off, bassBus, t, b, noteDur * 1.05, def.bassWave === 'drive' ? 'drive' : 'bass')
    }
    if (def.perc.kick[s]) schedulePerc(off, percBus, t, 'kick', noise)
    if (def.perc.snare[s]) schedulePerc(off, percBus, t, 'snare', noise)
    if (def.perc.hihat[s]) schedulePerc(off, percBus, t, 'hihat', noise)
  }

  return off.startRendering()
}

// =============================================
// 音乐播放器（单例）
// =============================================

/** 场景 ID → BGM key 映射 */
export const SCENE_BGM_MAP: Record<string, string> = {
  town: 'town',
  blacksmith: 'tavern',
  alchemist: 'tavern',
  tavern: 'tavern',
  market: 'tavern',
  elder_hall: 'tavern',
  residential: 'tavern',
  forest: 'forest',
  mine: 'mine',
}

/**
 * MusicSystem — 背景音乐播放器
 *
 * - 程序化合成所有 BGM（离线渲染 → AudioBuffer 循环播放）
 * - 淡入淡出无缝切换（默认 800ms）
 * - 浏览器自动播放策略：AudioContext 挂起时监听首次手势恢复
 * - 单例：`musicSystem`
 */
export class MusicSystem {
  private ctx: AudioContext | null = null
  private masterGain: GainNode | null = null
  private buffers = new Map<string, AudioBuffer>()
  private currentKey: string | null = null
  private currentSource: AudioBufferSourceNode | null = null
  private currentGain: GainNode | null = null
  private preloaded: Promise<void> | null = null
  private volume = 0.75
  private fadeMs = 800

  /** 初始化 AudioContext（需在用户交互附近调用；挂起时自动监听手势恢复） */
  ensureInit(): void {
    if (this.ctx) return
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) {
      console.warn('[MusicSystem] Web Audio API not supported')
      return
    }
    this.ctx = new Ctor()
    this.masterGain = this.ctx.createGain()
    this.masterGain.gain.value = this.volume
    this.masterGain.connect(this.ctx.destination)

    // 自动播放策略：Chrome/Safari 要求用户手势后才能 resume
    if (this.ctx.state === 'suspended') {
      const resume = (): void => {
        if (this.ctx && this.ctx.state === 'suspended') {
          this.ctx.resume().catch(() => {})
        }
      }
      window.addEventListener('pointerdown', resume, { once: true })
      window.addEventListener('keydown', resume, { once: true })
      // 立即尝试一次（登录点击手势可能已产生用户激活）
      this.ctx.resume().catch(() => {})
    }
  }

  /** 渲染并缓存全部曲目（异步，后台执行不阻塞） */
  preload(): Promise<void> {
    if (this.preloaded) return this.preloaded
    if (!this.ctx) {
      this.ensureInit()
      if (!this.ctx) {
        this.preloaded = Promise.resolve()
        return this.preloaded
      }
    }
    const ctx = this.ctx
    this.preloaded = (async () => {
      const t0 = performance.now()
      for (const def of TRACKS) {
        try {
          this.buffers.set(def.key, await renderTrack(ctx, def))
          console.log(`[MusicSystem] Rendered "${def.name}" (${def.bpm}bpm)`)
        } catch (err) {
          console.warn(`[MusicSystem] Failed to render "${def.name}":`, err)
        }
      }
      console.log(`[MusicSystem] All BGM rendered in ${Math.round(performance.now() - t0)}ms`)
    })()
    return this.preloaded
  }

  /** 播放指定 BGM（淡入淡出切换；同曲不重播） */
  play(key: string, fadeMs?: number): void {
    this.ensureInit()
    if (!this.ctx || !this.masterGain) return
    if (this.currentKey === key) return

    const fade = fadeMs ?? this.fadeMs
    const buffer = this.buffers.get(key)

    // Buffer 未就绪：等待渲染完成后播放（不重复排队）
    if (!buffer) {
      if (!this.pendingKey) this.pendingKey = key
      void this.preload().then(() => {
        if (this.pendingKey === key) {
          this.pendingKey = null
          this.play(key, fade)
        }
      })
      return
    }

    const ctx = this.ctx
    const now = ctx.currentTime

    // 1. 淡出当前曲目
    if (this.currentGain && this.currentSource) {
      const oldGain = this.currentGain
      const oldSrc = this.currentSource
      try {
        oldGain.gain.cancelScheduledValues(now)
        oldGain.gain.setValueAtTime(oldGain.gain.value, now)
        oldGain.gain.linearRampToValueAtTime(0, now + fade / 1000)
      } catch {
        // ignore
      }
      window.setTimeout(() => {
        try {
          oldSrc.stop()
          oldSrc.disconnect()
          oldGain.disconnect()
        } catch {
          // ignore
        }
      }, fade + 120)
    }

    // 2. 淡入新曲目
    const src = ctx.createBufferSource()
    src.buffer = buffer
    src.loop = true
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0, now)
    gain.gain.linearRampToValueAtTime(this.volume, now + fade / 1000)
    src.connect(gain)
    gain.connect(this.masterGain)
    src.start(now)

    this.currentSource = src
    this.currentGain = gain
    this.currentKey = key
    console.log(`[MusicSystem] Playing BGM: ${key}`)
  }

  private pendingKey: string | null = null

  /** 按游戏场景播放对应 BGM */
  playForScene(sceneId: string): void {
    const key = SCENE_BGM_MAP[sceneId]
    if (!key) return
    this.play(key)
  }

  /** 停止 BGM（淡出） */
  stop(fadeMs?: number): void {
    if (!this.ctx || !this.currentGain || !this.currentSource) return
    const fade = fadeMs ?? this.fadeMs
    const now = this.ctx.currentTime
    const oldGain = this.currentGain
    const oldSrc = this.currentSource
    try {
      oldGain.gain.cancelScheduledValues(now)
      oldGain.gain.setValueAtTime(oldGain.gain.value, now)
      oldGain.gain.linearRampToValueAtTime(0, now + fade / 1000)
    } catch {
      // ignore
    }
    window.setTimeout(() => {
      try {
        oldSrc.stop()
        oldSrc.disconnect()
        oldGain.disconnect()
      } catch {
        // ignore
      }
    }, fade + 120)
    this.currentSource = null
    this.currentGain = null
    this.currentKey = null
  }

  /** 设置音量 (0-1) */
  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v))
    if (this.ctx && this.masterGain) {
      this.masterGain.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.05)
    }
  }

  /** 当前播放的 BGM key */
  getCurrentKey(): string | null {
    return this.currentKey
  }

  /** 曲目是否已渲染就绪 */
  isReady(key: string): boolean {
    return this.buffers.has(key)
  }
}

/** 音乐系统单例 */
export const musicSystem = new MusicSystem()
