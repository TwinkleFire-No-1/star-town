import Phaser from 'phaser'

/**
 * 游戏内部分辨率 — 原生 1920×1080（现代高清）
 *
 * 设计要点：
 * - 画布原生 1920×1080，不再依赖 CSS 放大，1080p 屏幕上 1:1 原生渲染
 * - 1920×1080 下字体、UI、精灵全部高清锐利
 * - 2K/4K 屏幕由 PixelPerfectRenderer 按整数倍放大（不糊）
 */

/** 原生高清分辨率 1920×1080 */
export const GAME_WIDTH = 1920
export const GAME_HEIGHT = 1080

/**
 * Tile 尺寸 — 64px
 * 地图 30×26 tiles × 64px = 1920×1664px
 * 横向正好铺满一整屏，纵向 1.5 屏支持镜头滚动
 */
export const TILE_SIZE = 64

/** 精灵资源基础帧尺寸（16px 像素美术）→ 显示放大倍数 */
export const SPRITE_BASE_SIZE = 16
export const SPRITE_DISPLAY_SCALE = TILE_SIZE / SPRITE_BASE_SIZE // = 4

/** 基础缩放倍数（原生 1:1） */
export const SCALE = 1

/**
 * Phaser 游戏配置
 *
 * 设计要点：
 * - 内部画布 1920×1080（现代高清原生分辨率）
 * - 不使用 Phaser Scale Manager（手动控制缩放）
 * - 像素完美缩放由 PixelPerfectRenderer 负责
 * - 物理引擎：Arcade（轻量，适合2D RPG）
 * - 无重力（俯视角RPG）
 */
export const GameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: '#2a1f14',
  antialias: true,
  roundPixels: true,
  render: { preserveDrawingBuffer: true },
  scale: {
    // 不自动管理缩放，完全由 PixelPerfectRenderer 手动控制
    mode: Phaser.Scale.NONE,
    autoCenter: Phaser.Scale.NO_CENTER,
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 0 },
      debug: false,
    },
  },
  scene: [], // 场景由 React 组件动态注入
}

/**
 * 计算像素完美缩放倍数
 * 确保缩放为整数，避免像素模糊
 */
export function calculatePixelPerfectScale(
  containerWidth: number,
  containerHeight: number,
): number {
  const scaleX = Math.floor(containerWidth / GAME_WIDTH)
  const scaleY = Math.floor(containerHeight / GAME_HEIGHT)
  return Math.max(1, Math.min(scaleX, scaleY))
}
