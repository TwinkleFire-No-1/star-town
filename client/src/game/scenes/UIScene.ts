import Phaser from 'phaser'
import { SceneKey } from '../SceneManager'
import { FONT_BODY, FONT_SIZE } from '../typography'

/**
 * UIScene — UI 覆盖场景
 *
 * 职责：
 * - 作为常驻覆盖层，运行在 GameScene 之上
 * - 管理 HUD 元素（游戏时钟、状态栏等）
 * - 接收其他场景的 UI 请求
 * - 与 React DOM 层配合渲染复杂 UI
 *
 * 设计：此场景始终运行，不随 GameScene 切换而销毁
 */
export class UIScene extends Phaser.Scene {
  constructor() {
    super({ key: SceneKey.UI })
  }

  create(): void {
    // UI 场景不受 GameScene 暂停影响
    console.log('[UIScene] Created — UI overlay ready')
  }

  /**
   * 显示浮动文字提示
   */
  showFloatingText(x: number, y: number, text: string, color = '#ffffff'): void {
    const textObj = this.add.text(x, y, text, {
      fontSize: FONT_SIZE.SM,
      color,
      fontFamily: FONT_BODY,
    })
    textObj.setOrigin(0.5)
    textObj.setDepth(1000)

    this.tweens.add({
      targets: textObj,
      y: y - 120,
      alpha: 0,
      duration: 1000,
      ease: 'Power2',
      onComplete: () => textObj.destroy(),
    })
  }
}
