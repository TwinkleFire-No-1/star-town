import { useEffect, useRef, useCallback } from 'react'
import Phaser from 'phaser'
import { GameConfig } from '../game/config'
import { BootScene } from '../game/scenes/BootScene'
import { PreloadScene } from '../game/scenes/PreloadScene'
import { GameScene } from '../game/scenes/GameScene'
import { UIScene } from '../game/scenes/UIScene'
import { BattleScene } from '../game/scenes/BattleScene'
import { GameSceneManager } from '../game/SceneManager'
import { applyPixelPerfectConfig } from '../game/rendering/PixelPerfectRenderer'
import { useGameStore } from '../stores/gameStore'
import { wsService } from '../services/websocket'

/** React ↔ Phaser 事件桥接键 */
export const PHASER_EVENT = {
  /** Phaser → React: 场景就绪 */
  SCENE_READY: 'scene:ready',
  /** Phaser → React: 游戏状态更新 */
  GAME_STATE: 'game:state',
  /** React → Phaser: 暂停/恢复 */
  PAUSE: 'game:pause',
  /** React → Phaser: 场景切换 */
  SWITCH_SCENE: 'scene:switch',
} as const

export interface PhaserGameProps {
  /** 场景就绪回调 */
  onReady?: () => void
  /** 场景切换回调 */
  onSceneChange?: (sceneKey: string) => void
  /** className 传递给游戏容器 */
  className?: string
}

/** 全局 SceneManager 单例引用 */
let _sceneManager: GameSceneManager | null = null

/**
 * 获取全局 SceneManager 实例
 * 在 PhaserGame 组件挂载后才可用
 */
export function getSceneManager(): GameSceneManager | null {
  return _sceneManager
}

/**
 * PhaserGame — React 封装的 Phaser 游戏容器
 *
 * 职责：
 * - 创建/销毁 Phaser.Game 实例
 * - 注册所有场景
 * - 初始化 SceneManager
 * - 暴露 React → Phaser 事件桥
 */
export function PhaserGame({ onReady, onSceneChange, className }: PhaserGameProps) {
  const gameRef = useRef<Phaser.Game | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // React → Phaser 事件桥：监听 Phaser 场景事件
  const handleSceneEvent = useCallback(
    (event: { type: string; data?: unknown }) => {
      switch (event.type) {
        case PHASER_EVENT.SCENE_READY:
          onReady?.()
          break
        case PHASER_EVENT.SWITCH_SCENE:
          if (event.data && typeof event.data === 'string') {
            onSceneChange?.(event.data)
          }
          break
        // 修复核心Bug：NPC交互事件未传递到React层，导致E键对话无法打开
        case 'game:interaction': {
          const d = event.data as { npcId: string; npcName: string }
          if (d?.npcId) {
            useGameStore.getState().setActiveNPC(d.npcId, d.npcName)
            useGameStore.getState().setDialogOpen(true)
            // 触发NPC主动打招呼（后端生成开场白）
            wsService.triggerNPCInteraction(d.npcId)
          }
          break
        }
        // T6.17 玩家间对话：点击远程玩家 → 打开玩家对话面板
        case 'game:playerChat': {
          const d = event.data as { playerId: string; playerName: string }
          if (d?.playerId) {
            useGameStore.getState().openPlayerChat(d.playerId, d.playerName)
          }
          break
        }
      }
    },
    [onReady, onSceneChange],
  )

  useEffect(() => {
    if (!containerRef.current || gameRef.current) return

    const config: Phaser.Types.Core.GameConfig = {
      ...GameConfig,
      parent: containerRef.current,
      scene: [BootScene, PreloadScene, GameScene, UIScene, BattleScene],
      callbacks: {
        preBoot: (game) => {
          // 注入 React 桥接回调
          game.registry.set('_reactBridge', handleSceneEvent)
        },
      },
    }

    gameRef.current = new Phaser.Game(config)

    // 调试辅助：暴露游戏实例（T6.3.9 验收用；生产亦暴露便于远程验收）
    ;(window as unknown as Record<string, unknown>).__starTownGame = gameRef.current

    // 初始化像素完美缩放，确保 canvas 铺满容器
    applyPixelPerfectConfig(gameRef.current)

    // 初始化 SceneManager
    _sceneManager = new GameSceneManager(gameRef.current)

    return () => {
      if (gameRef.current) {
        gameRef.current.destroy(true)
        gameRef.current = null
        _sceneManager = null
      }
    }
  }, [handleSceneEvent])

  return (
    <div className={className}>
      <div ref={containerRef} className="game-container" />
    </div>
  )
}

/**
 * 获取 React 桥接回调的辅助函数
 * 在 Phaser 场景中使用：emitToReact(scene, 'scene:ready')
 */
export function emitToReact(scene: Phaser.Scene, type: string, data?: unknown) {
  const bridge = scene.game.registry.get('_reactBridge') as
    | ((e: { type: string; data?: unknown }) => void)
    | undefined
  bridge?.({ type, data })
}
