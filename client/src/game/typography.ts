/**
 * typography — 星火小镇统一字体系统（星露谷像素风）
 *
 * 设计原则：
 * - 全局唯一字体栈常量，禁止在代码中散写裸 'monospace'（系统字体与像素画风冲突）
 * - 标题/强调用 Press Start 2P（英文像素方块），中文回退 ZCOOL KuaiLe（站酷快乐体）
 * - 正文/长文本用 VT323（紧凑像素字体，可读性更好），中文回退 ZCOOL KuaiLe
 * - 字号分级：XL 大标题 / LG 场景标签 / MD 强调 / SM 正文提示 / XS 名字标签
 *   1080p 下统一"大小适中"，不出现 80px+ 的巨型字也不出现 22px 的蚂蚁字
 */

/** 标题像素字体栈（星火小镇 / 场景名 / 战斗大标题） */
export const FONT_TITLE = "'Press Start 2P', 'ZCOOL KuaiLe', monospace"

/** 正文像素字体栈（对话 / 状态 / 按钮 / 浮动提示） */
export const FONT_BODY = "'VT323', 'ZCOOL KuaiLe', monospace"

/** 名字标签字体栈（NPC/猫/在线玩家头顶名字，中文优先保证清晰） */
export const FONT_NAMETAG = "'ZCOOL KuaiLe', 'VT323', monospace"

/** 字号分级 — 1080p 原生分辨率下的适中字号 */
export const FONT_SIZE = {
  /** XL：超大标题（加载页"星火小镇"、结算标题）72px */
  XL: '72px',
  /** LG：场景/区域名标签 56px */
  LG: '56px',
  /** MD：强调文字/战斗核心文本 40px */
  MD: '40px',
  /** SM：正文/提示/按钮 32px */
  SM: '32px',
  /** XS：名字标签 26px */
  XS: '26px',
} as const

export type FontSizeKey = keyof typeof FONT_SIZE
