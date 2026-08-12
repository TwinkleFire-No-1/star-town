import Phaser from 'phaser'
import { emitToReact } from '../../components/PhaserGame'
import { applyPixelPerfectConfig } from '../rendering/PixelPerfectRenderer'
import { TILE_SIZE } from '../config'

/**
 * BootScene — 引导场景
 *
 * 职责：
 * - 设置游戏全局配置（物理、缩放等）
 * - 通知 React 游戏已就绪
 * - 立即切换到 PreloadScene
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' })
  }

  create(): void {
    // 应用像素完美缩放（确保初始启动时 canvas 铺满容器）
    applyPixelPerfectConfig(this.game)

    // 地图像素尺寸（30×26 tiles × 64px = 1920×1664）
    const mapPixelWidth = 30 * TILE_SIZE // 1920
    const mapPixelHeight = 26 * TILE_SIZE // 1664

    // 设置物理世界边界（匹配地图尺寸）
    this.physics.world.setBounds(0, 0, mapPixelWidth, mapPixelHeight)

    // 通知 React 游戏就绪
    emitToReact(this, 'scene:ready')

    // 立即切换到 PreloadScene
    this.scene.start('PreloadScene')
  }
}
