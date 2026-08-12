import Phaser from 'phaser'
import { GAME_WIDTH, GAME_HEIGHT, TILE_SIZE } from '../config'
import { FONT_TITLE, FONT_NAMETAG, FONT_SIZE } from '../typography'
import { emitToReact, getSceneManager } from '../../components/PhaserGame'
import { applyPixelPerfectConfig } from '../rendering/PixelPerfectRenderer'
import { TilesetManager } from '../map/TilesetManager'
import { MapRenderer } from '../map/MapRenderer'
import { CollisionSystem } from '../systems/CollisionSystem'
import { MovementSystem } from '../systems/MovementSystem'
import { CameraController } from '../systems/CameraController'
import { NPCInteractionSystem } from '../systems/NPCInteractionSystem'
import { AmbientNpcSystem } from '../systems/AmbientNpcSystem'
import { CatSystem } from '../systems/CatSystem'
import { DayNightLightingSystem } from '../systems/DayNightLightingSystem'
import { EnvironmentParticleSystem } from '../systems/EnvironmentParticleSystem'
import { WeatherSystem } from '../systems/WeatherSystem'
import { QuestGuideArrows } from '../systems/QuestGuideArrows'
import { musicSystem } from '../systems/MusicSystem'
import { SpriteGenerator } from '../entities/SpriteGenerator'
import { NpcSpriteManager } from '../entities/NpcSpriteManager'
import { TownBuildingRenderer } from '../entities/TownBuildingRenderer'
import type { NPCData } from '../entities/NpcSpriteManager'
import { RegionType, REGION_CONFIGS } from '../data/TileData'
import { SceneTransitions, SceneKey } from '../SceneManager'
import { positionSync } from '../../services/positionSync'
import { wsService } from '../../services/websocket'
import { RenderOptimizer, memoryManager } from '../rendering/RenderOptimizer'
import { isSceneUnlocked, isNpcUnlocked, getSceneLockedMessage, fetchUnlockState, watchStoryUnlockEvents } from '../../services/storyUnlock'
import { useGameStore } from '../../stores/gameStore'
import type { WeatherType } from '../../stores/gameStore'
import {
  SCENES, SCENE_PORTALS, INTERIOR_EXIT_PORTALS,
  generateInteriorMap,
  getNpcNamesForScene,
  getNpcTownStandPixel,
  type SceneId,
  type SceneDef,
} from './SceneSystem'

/** 占位NPC数据 — 后续从后端同步（坐标为 1920×1080 世界坐标） */
const PLACEHOLDER_NPCS: NPCData[] = [
  { id: 'margaret', name: '玛格丽特', title: '酒馆老板娘', x: 400, y: 320, direction: 'down' },
  { id: 'old_buck', name: '老巴克', title: '铁匠', x: 800, y: 240, direction: 'down' },
  { id: 'ella', name: '艾拉', title: '草药师', x: 1040, y: 400, direction: 'down' },
  { id: 'anvil', name: '铁砧', title: '矿工头目', x: 720, y: 480, direction: 'down' },
  { id: 'toby', name: '托比', title: '游商', x: 560, y: 560, direction: 'down' },
  { id: 'lily', name: '莉莉', title: '面包师', x: 320, y: 400, direction: 'down' },
  { id: 'sylvia', name: '西尔维娅', title: '占星师', x: 1200, y: 160, direction: 'up' },
  { id: 'marcus', name: '马库斯', title: '守夜人', x: 480, y: 640, direction: 'down' },
  { id: 'rosie', name: '罗西', title: '花商', x: 880, y: 440, direction: 'down' },
  { id: 'pip', name: '小皮普', title: '报信童', x: 720, y: 560, direction: 'right' },
  { id: 'grom', name: '格罗姆', title: '隐居术士', x: 1160, y: 200, direction: 'down' },
  { id: 'silas', name: '暗祭司塞拉斯', title: '暗影信徒', x: 240, y: 160, direction: 'down' },
]

/**
 * GameScene — 主游戏场景
 *
 * 职责：
 * - 渲染小镇地图、玩家、NPC
 * - 管理移动、碰撞、镜头、交互等系统
 * - 管理游戏主循环
 * - 与 React 层通信
 */
export class GameScene extends Phaser.Scene {
  /** T7.x 场景→遭遇敌人（按剧情：小镇周边/森林/矿洞），与后端 SCENE_ENCOUNTERS 一致 */
  private static readonly SCENE_ENCOUNTERS: Record<string, string[]> = {
    town: ['enemy_wolf'],
    forest: ['enemy_treant', 'enemy_ghost'],
    mine: ['enemy_cave_worm', 'enemy_shadow_minion'],
  }

  // --- 系统引用 ---
  private mapRenderer!: MapRenderer
  private collisionSystem!: CollisionSystem
  private movementSystem!: MovementSystem
  private cameraController!: CameraController
  private npcInteraction!: NPCInteractionSystem
  private dayNightLighting!: DayNightLightingSystem
  private envParticles!: EnvironmentParticleSystem
  /** T6.9 天气效果系统（雨/雪/雾/晴渲染到小镇） */
  private weatherSystem!: WeatherSystem
  private tilesetManager!: TilesetManager
  private spriteGenerator!: SpriteGenerator
  private npcSpriteManager!: NpcSpriteManager
  private renderOptimizer!: RenderOptimizer
  /** 普通NPC（路人）系统 — 固定台词、随机漫游、头顶气泡 */
  private ambientNpcSystem!: AmbientNpcSystem
  /** T6.14.2 原神式任务指引箭头系统（接受任务后路上闪动白色箭头） */
  private questGuideArrows!: QuestGuideArrows
  /** 猫咪系统 — 小橘/小狸花随机出现漫游 + 李鹭随机喂猫 */
  private catSystem!: CatSystem

  // --- 区域名标签 ---
  private regionLabel: Phaser.GameObjects.Text | null = null
  private currentRegion: RegionType | null = null

  // --- T6.11.3: 门口进入提示（[F] 进入 xxx） ---
  private doorPrompt: Phaser.GameObjects.Text | null = null

  // --- 远程玩家精灵 ---
  private remotePlayers = new Map<string, Phaser.GameObjects.Sprite>()
  /** 远程玩家名字标签（T6.17 黄名显示，需随玩家移动跟随） */
  private remotePlayerNames = new Map<string, Phaser.GameObjects.Text>()

  // --- BUG-004修复: 清理标记 ---
  private isDestroyed = false

  // --- BUG-004修复: Zustand unsubscribe ---
  private storeUnsubscribe: (() => void) | null = null

  // --- T6.3.2: 场景过渡状态 ---
  /** 过渡进行中标记（防止重复触发） */
  private isTransitioning = false

  // --- 场景系统（独立场景切换） ---
  /** 当前场景ID（town/建筑室内/森林/矿洞） */
  private currentSceneId: SceneId = 'town'

  // --- 城镇建筑外观渲染 ---
  private townBuildingRenderer!: TownBuildingRenderer

  /** 缓存从后端加载的真实NPC数据（名字→数据），供场景切换时按归属重建 */
  private serverNpcMap = new Map<string, { id: string; name: string; title: string; direction: string }>()

  /** 场景 → 镜头缩放（T6.11.5 分辨率统一：所有场景原生 1920×1080 渲染，缩放统一为 1） */
  private static readonly SCENE_ZOOM: Record<SceneId, number> = {
    town: 1,
    blacksmith: 1,
    alchemist: 1,
    tavern: 1,
    market: 1,
    elder_hall: 1,
    residential: 1,
    forest: 1,
    mine: 1,
  }

  constructor() {
    super({ key: 'GameScene' })
  }

  /**
   * BUG-004修复: 场景销毁时清理定时器
   */
  shutdown(): void {
    if (this.isDestroyed) return
    this.isDestroyed = true

    // 清理位置同步定时器
    positionSync.stop()

    // 清理内存管理器自动清理
    memoryManager.stopAutoCleanup()

    // 清理Zustand订阅
    if (this.storeUnsubscribe) {
      this.storeUnsubscribe()
      this.storeUnsubscribe = null
    }

    // 清理NPC移动监听
    if (this.wsNpcMoveHandler) {
      wsService.off('npc:move', this.wsNpcMoveHandler)
      this.wsNpcMoveHandler = null
    }
    if (this.wsNpcUpdateHandler) {
      wsService.off('npc:update', this.wsNpcUpdateHandler)
      this.wsNpcUpdateHandler = null
    }

    // 清理天气监听（T6.9 天气系统）
    if (this.wsWeatherHandler) {
      wsService.off('weather:update', this.wsWeatherHandler)
      this.wsWeatherHandler = null
    }
    this.weatherSystem?.destroy()

    // 清理剧情解锁事件监听
    if (this.storyUnlockUnsubscribe) {
      this.storyUnlockUnsubscribe()
      this.storyUnlockUnsubscribe = null
    }

    // 清理普通NPC（路人）
    this.ambientNpcSystem?.destroyAll()

    // 清理猫咪系统
    this.catSystem?.destroyAll()

    // 清理任务指引箭头（T6.14.2）
    this.questGuideArrows?.destroy()
    this.questGuideArrows = null as unknown as QuestGuideArrows

    // 清理门口提示（T6.11.3）
    this.doorPrompt?.destroy()
    this.doorPrompt = null

    // 清理远程玩家精灵
    for (const [_id, sprite] of this.remotePlayers) {
      sprite.destroy()
    }
    for (const [_id, nameText] of this.remotePlayerNames) {
      nameText.destroy()
    }
    this.remotePlayers.clear()
    this.remotePlayerNames.clear()

    console.log('[GameScene] Shutdown: all timers and subscriptions cleaned')
  }

  /**
   * BUG-004修复: 场景完全销毁（Phaser.Scene.destroy不可直接override）
   */
  shutdownAndDestroy(): void {
    this.shutdown()
  }

  create(): void {
    // 1. 像素完美渲染配置
    applyPixelPerfectConfig(this.game)

    // 2. 生成 Tileset 纹理（外部 PNG 优先，缺失自动回退程序化）
    this.tilesetManager = new TilesetManager(this)
    this.tilesetManager.generateTileset()

    // 3. 生成角色精灵
    this.spriteGenerator = new SpriteGenerator(this)
    // T6.17 随机形象：主角使用登录注册时分配的形象（avatar），无则默认
    this.spriteGenerator.generatePlayerSprite(useGameStore.getState().player.avatar)

    // 4. 渲染小镇地图
    this.mapRenderer = new MapRenderer(this, this.tilesetManager)
    this.mapRenderer.renderTownMap()

    // 4.1 城镇建筑外观（立体镇子：铁匠铺/药剂店/酒馆/集市/长老大厅/民居/森林入口/矿洞）
    this.townBuildingRenderer = new TownBuildingRenderer(this)
    this.townBuildingRenderer.renderAll()

    // 5. 初始化碰撞系统
    this.collisionSystem = new CollisionSystem(this, this.mapRenderer)
    this.collisionSystem.init()

    // 6. 创建玩家并初始化移动系统（原生64px高清帧）
    const startPos = this.getPlayerStartPosition()
    const player = this.add.sprite(startPos.x, startPos.y, 'player')
    player.setOrigin(0.5, 0.5)
    player.setScale(this.spriteGenerator.getDisplayScale('player'))
    player.setDepth(startPos.y + 100)

    this.movementSystem = new MovementSystem(this)
    this.movementSystem.init(player, 'player', this.collisionSystem)

    // 7. 初始化镜头控制器
    const mapSize = this.mapRenderer.getMapPixelSize()
    this.cameraController = new CameraController(this)
    this.cameraController.init(player, mapSize.width, mapSize.height)
    this.cameraController.onRegionChange((from, to) => {
      this.onRegionChange(from, to)
    })

    // 8. 初始化NPC交互系统
    this.npcInteraction = new NPCInteractionSystem(this)
    this.npcInteraction.init()
    this.npcInteraction.onInteract((npcId, npcName) => {
      this.onNPCInteract(npcId, npcName)
    })

    // 9. 创建NPC精灵
    this.npcSpriteManager = new NpcSpriteManager(this, this.spriteGenerator, this.collisionSystem)
    this.npcSpriteManager.createNPCs(PLACEHOLDER_NPCS)

    // 将NPC注册到交互系统
    for (const npcData of this.npcSpriteManager.getNPCDataList()) {
      this.npcInteraction.registerNPC(npcData.id, npcData.name, npcData.sprite)
    }

    // 9.1 修复核心Bug：从后端同步真实NPC数据（真实UUID ID + 位置）
    // 占位数据ID（ella/old_buck等）与后端profile ID（UUID）不匹配，
    // 导致对话时后端返回"NPC似乎不存在"。加载后端数据后用真实ID重建NPC。
    this.loadNPCsFromServer()

    // 9.2 普通NPC（路人）系统：固定台词、随机漫游、头顶气泡，营造热闹氛围
    this.ambientNpcSystem = new AmbientNpcSystem(this, this.spriteGenerator, this.collisionSystem)
    this.ambientNpcSystem.setInteractionHooks(
      (npcId, npcName, sprite) => this.npcInteraction.registerNPC(npcId, npcName, sprite),
      (npcId) => this.npcInteraction.unregisterNPC(npcId),
    )
    // 城镇初始场景：加载并渲染城镇路人
    this.ambientNpcSystem.rebuildForScene('town')

    // 9.2.1 猫咪系统：小橘/小狸花随机出现 + 李鹭随机喂猫
    this.catSystem = new CatSystem(this, this.collisionSystem)
    this.catSystem.setHooks({
      // 喂食时李鹭的位置与空闲状态（河边的李鹭不跳河时才能喂猫）
      getFeeder: () => this.ambientNpcSystem.getRiverFeederState(),
      // 让李鹭执行投喂动画（蹲下+上举）
      playFeederFeed: (onDone) => this.ambientNpcSystem.playRiverFeedAnimation(onDone),
    })
    this.catSystem.rebuildForScene('town')

    // 9.3 T6.14.2 任务指引箭头系统（原神式白色闪动箭头，接受任务后指路）
    this.questGuideArrows = new QuestGuideArrows(this)

    // 9. 区域名标签 — 木质小标签风格（1080p 大字）
    this.regionLabel = this.add.text(GAME_WIDTH / 2, 120, '', {
      fontSize: FONT_SIZE.LG,
      color: '#e8a93c',
      fontFamily: FONT_TITLE,
      backgroundColor: 'rgba(61,40,23,0.85)',
      padding: { x: 40, y: 20 },
    })
    this.regionLabel.setOrigin(0.5, 0)
    this.regionLabel.setDepth(1000)
    this.regionLabel.setScrollFactor(0)
    this.regionLabel.setAlpha(0)

    // 10. 昼夜光影效果系统
    this.dayNightLighting = new DayNightLightingSystem(this)
    this.dayNightLighting.setPeriod('morning')

    // 10.1 T6.9 天气效果系统（初始化当前天气 + 监听天气变化广播）
    this.weatherSystem = new WeatherSystem(this)
    this.weatherSystem.setWeather(useGameStore.getState().weather.type)
    this.wsWeatherHandler = (data: { type: string; name: string }) => {
      console.log('[GameScene] Weather changed:', data.name)
      this.weatherSystem?.setWeather(data.type as WeatherType)
    }
    wsService.on('weather:update', this.wsWeatherHandler)

    // 11. 环境粒子效果系统
    this.envParticles = new EnvironmentParticleSystem(this)
    // 默认区域添加一些火把和落叶效果（1920×1080 世界坐标）
    this.envParticles.addTorchSpark(200, 320)
    this.envParticles.addTorchSpark(600, 320)
    this.envParticles.addFallingLeaves()

    // 11.5 渲染优化器
    this.renderOptimizer = new RenderOptimizer(this)

    // 12. 门口触发回调 — T6.3.2 建筑进出淡入淡出过渡
    this.collisionSystem.onDoorEnter((tileX: number, tileY: number) => {
      this.handleDoorTransition(tileX, tileY)
    })

    // 13. 启动位置同步服务
    positionSync.start()

    // 14. 监听远程玩家位置更新
    this.setupRemotePlayerSync()

    // 14.0 T6.17 在线玩家系统：GameScene 就绪后主动请求在线列表
    // 修复竞态：App 在连接后 800ms 请求 player:list，此时 GameScene 可能尚未创建，
    // room:playerJoined 监听器未注册导致在线用户丢失 → 场景就绪后重新请求兜底
    wsService.requestPlayerList()

    // 14.1 监听NPC移动事件（日程/剧情驱动）— 让NPC真正在地图上移动
    this.setupNpcMovementSync()

    // 14.2 剧情解锁：拉取解锁状态并监听解锁事件（场景/NPC随剧情逐步可见）
    this.initStoryUnlock()

    // 15. 监听时段变化更新光影
    // BUG-004修复: 保存unsubscribe函数以便场景销毁时清理
    const store = useGameStore
    this.storeUnsubscribe = store.subscribe((state, prev) => {
      if (state.time.period !== prev.time.period) {
        this.dayNightLighting.setPeriod(state.time.period)
      }
    })

    // 16. 启动内存管理器自动清理
    memoryManager.startAutoCleanup(60000)

    // 17. T6.3.3: 战斗触发 — B 键演示入口（白闪+红wipe过渡）
    this.input.keyboard?.on('keydown-B', () => {
      this.startBattle()
    })

    // 17.1 T6.11.3: 建筑按 F 进入（代替踩门自动进入；未解锁建筑由 handleDoorTransition 拦截）
    this.input.keyboard?.on('keydown-F', () => {
      if (this.isTransitioning) return
      this.collisionSystem.tryEnterDoor()
    })

    // 17.2 T6.11.3: 门口进入提示（屏幕底部，NPC 交互提示上方）
    this.doorPrompt = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 190, '', {
      fontSize: FONT_SIZE.SM,
      color: '#ffe9b0',
      fontFamily: FONT_TITLE,
      backgroundColor: 'rgba(61,40,23,0.9)',
      padding: { x: 24, y: 12 },
    })
    this.doorPrompt.setOrigin(0.5, 0.5)
    this.doorPrompt.setDepth(2050)
    this.doorPrompt.setScrollFactor(0)
    this.doorPrompt.setVisible(false)

    // 通知 React GameScene 已就绪
    emitToReact(this, 'game:state', 'GameScene')

    // 18. T7.x.13 背景音乐：初始化并播放当前场景 BGM（城镇/室内/森林/矿洞）
    // 战斗切回 GameScene 时本方法会重新执行，自动恢复场景音乐
    musicSystem.ensureInit()
    void musicSystem.preload()
    musicSystem.playForScene(this.currentSceneId)
    console.log('[GameScene] BGM started for scene:', this.currentSceneId)
    // 场景指示器更新（T6.3.9 打磨：显示当前实际场景名，如 星火小镇/低语森林/废弃矿洞）
    this.emitSceneName()

    console.log('[GameScene] Created with all systems')
  }

  update(): void {
    // 更新移动系统
    this.movementSystem.update()

    // 渲染优化：帧率监控与自适应
    this.renderOptimizer.updateFps()

    // 获取玩家位置
    const pos = this.movementSystem.getPlayerPosition()
    const dir = this.movementSystem.getDirection()

    // 更新镜头控制器（区域检测）
    this.cameraController.update(pos.x, pos.y)

    // 更新区域检测（兼容旧逻辑）
    this.updateRegionDetection()

    // 更新NPC交互检测
    this.npcInteraction.update(pos.x, pos.y)

    // T6.11.3: 门口近邻检测（F 键进入）+ 门口提示更新
    this.collisionSystem.updateDoorProximity(pos.x, pos.y)
    this.updateDoorPrompt()

    // 更新普通NPC（路人）漫游与气泡
    this.ambientNpcSystem?.update(this.time.now)

    // 更新猫咪系统（漫游 + 随机出现 + 李鹭喂猫协调）
    this.catSystem?.update(this.time.now)

    // T6.14.2 任务指引箭头：接受任务后路上闪动白色箭头指路
    this.questGuideArrows?.update(this.time.now, pos.x, pos.y)

    // T5.3.3 渲染优化：NPC视口裁剪（每5帧检查一次，避免频繁遍历）
    if (this.game.loop.frame % 5 === 0) {
      const npcDataList = this.npcSpriteManager.getNPCDataList()
      const npcCullList = npcDataList.map((npc) => ({
        sprite: npc.sprite,
        x: npc.sprite.x,
        y: npc.sprite.y,
      }))
      this.renderOptimizer.cullNpcsOutsideViewport(npcCullList)
    }

    // 更新NPC精灵深度排序（Y轴排序）
    this.npcSpriteManager.updateDepthSort()

    // 更新昼夜光影
    this.dayNightLighting.update()

    // 更新天气效果（T6.9 雨/雪/雾/晴渲染到小镇）
    this.weatherSystem?.update()

    // 更新环境粒子效果
    const currentPeriod = useGameStore.getState().time.period
    this.envParticles.update(this.game.loop.delta, currentPeriod)

    // 同步玩家位置到服务器
    const dirMap: Record<string, string> = { up: 'up', right: 'right', down: 'down', left: 'left' }
    const dirName = dirMap[dir as string] || 'down'
    positionSync.updatePosition(pos.x, pos.y, dirName)

    // 同步 Store 中的玩家位置
    useGameStore.getState().updatePlayerPosition(pos.x, pos.y, dirName)
  }

  /**
   * 获取玩家出生位置
   * 多租户：优先使用登录存档中的位置（进度恢复）；无存档数据则用城镇入口默认点
   */
  private getPlayerStartPosition(): { x: number; y: number } {
    const saved = useGameStore.getState().player
    if (saved?.x != null && saved?.y != null && saved.id) {
      return { x: saved.x, y: saved.y }
    }
    return {
      x: 14 * TILE_SIZE + TILE_SIZE / 2,
      y: 24 * TILE_SIZE + TILE_SIZE / 2,
    }
  }

  /**
   * 更新当前区域检测
   */
  private updateRegionDetection(): void {
    // 区域标注仅在小镇场景有效：REGION_CONFIGS 的 bounds 是"小镇地图坐标"，
    // 玩家在森林/矿洞/室内时若沿用该检测，会错误弹出小镇建筑/区域名（如"镇中心广场"）。
    if (this.currentSceneId !== 'town') {
      this.currentRegion = null
      return
    }

    const pos = this.movementSystem.getPlayerPosition()
    const px = pos.x / TILE_SIZE
    const py = pos.y / TILE_SIZE

    let detectedRegion: RegionType | null = null

    for (const regionType of Object.keys(REGION_CONFIGS)) {
      const config = REGION_CONFIGS[regionType as RegionType]
      if (!config) continue
      const b = config.bounds
      if (px >= b.x && px < b.x + b.w && py >= b.y && py < b.y + b.h) {
        detectedRegion = regionType as RegionType
        break
      }
    }

    if (detectedRegion !== this.currentRegion) {
      this.currentRegion = detectedRegion
      if (this.regionLabel) {
        // 先终止可能的旧动画
        this.tweens?.killTweensOf(this.regionLabel)

        if (detectedRegion) {
          const config = REGION_CONFIGS[detectedRegion]
          if (config) {
            this.regionLabel.setText(config.name)
            // 起始状态：上方 + 透明
            this.regionLabel.setY(90)
            this.regionLabel.setAlpha(0)

            // 滑入动画：translateY 90→120 + opacity 0→1
            this.tweens?.add({
              targets: this.regionLabel,
              y: 120,
              alpha: 1,
              duration: 400,
              ease: 'Back.easeOut',
              onComplete: () => {
                // 停留 2 秒后淡出
                this.tweens?.add({
                  targets: this.regionLabel,
                  alpha: 0,
                  duration: 600,
                  delay: 2000,
                  ease: 'Sine.easeIn',
                })
              },
            })
          }
        } else {
          this.regionLabel.setText('')
          this.regionLabel.setAlpha(0)
        }
      }
    }
  }

  /**
   * 区域变化回调
   */
  private onRegionChange(_from: RegionType | null, to: RegionType): void {
    const config = REGION_CONFIGS[to]
    if (config) {
      console.log(`[GameScene] Entered region: ${config.name}`)
    }
  }

  /**
   * 从后端加载真实NPC数据并用真实ID重建NPC精灵
   * 修复：占位NPC ID（ella等）与后端profile ID（UUID）不匹配，
   * 导致 interaction:trigger 时 getProfile 返回 undefined
   * 需求（小镇建筑）：城镇中NPC站在各自建筑门口/区域（NPC在建筑内），
   * 而非服务器旧坐标；真实ID缓存供室内场景按归属重建（可对话）。
   */
  private async loadNPCsFromServer(): Promise<void> {
    try {
      const res = await fetch('/api/npcs?limit=100')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = (await res.json()) as {
        data?: Array<{ id: string; name: string; title?: string; x: number; y: number; direction?: string }>
      }
      const serverNpcs = json.data ?? []
      if (serverNpcs.length === 0) return

      // 缓存真实NPC数据（名字→数据），供室内场景按归属重建（保留真实ID可对话）
      this.serverNpcMap.clear()
      // T6.14.2: 反查映射（档案ID→名字），供任务指引箭头解析 UUID 目标
      const idToName = new Map<string, string>()
      for (const n of serverNpcs) {
        this.serverNpcMap.set(n.name, {
          id: n.id,
          name: n.name,
          title: n.title ?? '',
          direction: n.direction ?? 'down',
        })
        idToName.set(n.id, n.name)
      }
      this.questGuideArrows?.setNpcIdToName(idToName)

      // 剧情解锁过滤：未解锁NPC不渲染（随剧情推进逐步可见）
      const unlockedServerNpcs = serverNpcs.filter((n) => isNpcUnlocked(n.name))

      // 服务器数据加载成功 → 销毁全部本地占位NPC（解锁状态以服务器过滤为准；
      // 占位NPC仅在后端不可用时兜底）
      for (const local of this.npcSpriteManager.getNPCDataList()) {
        this.npcSpriteManager.destroyNPC(local.id)
        this.npcInteraction.unregisterNPC(local.id)
      }

      // 用后端真实数据重建NPC：城镇场景按 NPC_TOWN_STANDS 站位
      // （每个NPC站在自己建筑门口/区域内，实现"NPC在建筑内"）
      const realNpcs: NPCData[] = unlockedServerNpcs.map((n) => {
        const stand = getNpcTownStandPixel(n.name)
        return {
          id: n.id,
          name: n.name,
          title: n.title ?? '',
          x: stand.x,
          y: stand.y,
          direction: stand.direction,
        }
      })
      this.npcSpriteManager.createNPCs(realNpcs)
      for (const npcData of this.npcSpriteManager.getNPCDataList()) {
        this.npcInteraction.registerNPC(npcData.id, npcData.name, npcData.sprite)
      }
      console.log(`[GameScene] Synced ${realNpcs.length} NPCs (${serverNpcs.length - realNpcs.length} locked by story)`)
    } catch (err) {
      console.warn('[GameScene] Failed to load NPCs from server, keeping placeholders:', err)
    }
  }

  /**
   * NPC交互回调
   */
  private onNPCInteract(npcId: string, npcName: string): void {
    console.log(`[GameScene] Interacting with NPC: ${npcName} (${npcId})`)
    // 通知 React 层打开对话框
    emitToReact(this, 'game:interaction', { npcId, npcName })
  }

  // ============================================================
  // T6.3.3 战斗场景过渡
  // ============================================================

  /**
   * 触发战斗 — 白闪 200ms → 红色 wipe 400ms → 进入 BattleScene
   * T7.x 回合制：按场景遭遇敌人（按剧情），BOSS由主线任务驱动；后端按玩家等级生成敌人
   */
  startBattle(): void {
    if (this.isTransitioning) return
    this.isTransitioning = true

    // 锁定输入
    this.movementSystem.setInputLocked(true)
    this.input.enabled = false

    // 1. 白闪 200ms
    this.cameras.main.flash(200, 255, 255, 255)

    this.time.delayedCall(200, async () => {
      try {
        const playerId = wsService.getPlayerId() ?? 'demo-player'
        const scene = this.currentSceneId ?? 'town'

        // 1. 选择敌人（按剧情/场景：小镇周边/森林/矿洞）
        let enemyIds = (GameScene.SCENE_ENCOUNTERS[scene] ?? GameScene.SCENE_ENCOUNTERS.town).slice()

        // 2. BOSS战：当前主线任务要求击杀森林守护者时，野外遭遇固定为BOSS（按剧情）
        const hasBossQuest = await this.checkBossQuest(playerId)
        if (hasBossQuest && (scene === 'forest' || scene === 'town')) {
          enemyIds = ['boss_forest_guardian']
        }

        // 3. 创建回合制战斗（后端按玩家等级生成敌人属性，保证可过关）
        const battleId = `battle_${Date.now()}`
        const res = await fetch('/api/battle/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: 'turn', battleId, playerId, enemyIds }),
        })
        const json = await res.json()
        const data = json?.data
        if (!res.ok || !data || !Array.isArray(data.enemies)) {
          throw new Error(json?.error ?? 'create battle failed')
        }

        const sm = getSceneManager()
        if (!sm) {
          this.isTransitioning = false
          return
        }
        sm.switchScene(
          SceneKey.Game,
          SceneKey.Battle,
          {
            battleId,
            player: data.player,
            enemies: data.enemies,
            sourceArea: scene,
          },
          SceneTransitions.enterBattle,
        )
      } catch (err) {
        console.warn('[GameScene] Battle create error:', err)
        // 创建失败：恢复游戏（提示无法进入战斗）
        this.isTransitioning = false
        this.input.enabled = true
        this.movementSystem.setInputLocked(false)
        this.cameras.main.flash(300, 255, 60, 60)
      }
    })
  }

  /**
   * T7.x 检查当前主线任务是否要求击杀BOSS（按剧情触发BOSS战）
   */
  private async checkBossQuest(playerId: string): Promise<boolean> {
    try {
      const res = await fetch(`/api/level/mainline/status/${playerId}`)
      if (!res.ok) return false
      const json = await res.json()
      const progress: Array<{ type: string; targetId: string; current: number; required: number }> =
        json?.data?.activeProgress ?? []
      return progress.some(
        (o) => o.type === 'kill_enemy' && o.targetId === 'boss_forest_guardian' && o.current < o.required,
      )
    } catch {
      return false
    }
  }

  /**
   * 退出战斗（由 BattleScene 调用，避免循环依赖用事件）
   */
  exitBattle(): void {
    this.isTransitioning = false
    this.input.enabled = true
    this.movementSystem.setInputLocked(false)
  }

  // ============================================================
  // T6.3.2 建筑进出过渡
  // ============================================================

  /**
   * 门口触发过渡 — fadeOut(深棕) → 切场景/位移 → fadeIn
   * 使用纯时间线（不依赖 camera fade 事件），保证任意帧率可靠切换
   */
  private handleDoorTransition(tileX: number, tileY: number): void {
    if (this.isTransitioning) return
    this.isTransitioning = true

    const transition = this.currentSceneId !== 'town'
      ? SceneTransitions.exitBuilding
      : SceneTransitions.enterBuilding

    // 1. 锁定玩家输入
    this.movementSystem.setInputLocked(true)
    this.input.enabled = false

    // 2. fadeOut(深棕) — 通过全屏遮罩矩形 + tween 实现（不依赖 camera 事件）
    const overlay = this.add.rectangle(
      GAME_WIDTH / 2, GAME_HEIGHT / 2,
      GAME_WIDTH, GAME_HEIGHT,
      Phaser.Display.Color.GetColor(transition.color.r, transition.color.g, transition.color.b),
      0,
    )
    overlay.setDepth(5000)
    overlay.setScrollFactor(0)

    this.tweens.add({
      targets: overlay,
      alpha: 1,
      duration: transition.duration,
      ease: 'Linear',
      onComplete: () => {
        // 3. 计算目标场景
        let targetScene: SceneId | null = null
        let spawnX = 0
        let spawnY = 0

        if (this.currentSceneId === 'town') {
          const portal = SCENE_PORTALS.find(
            (p) => p.from === 'town' && p.doorX === tileX && p.doorY === tileY,
          )
          if (portal) {
            // 剧情解锁检查：未解锁的场景阻止进入
            if (!isSceneUnlocked(portal.to)) {
              this.showLockedSceneHint(portal.to, getSceneLockedMessage(portal.to))
              overlay.destroy()
              this.finishTransition()
              return
            }
            targetScene = portal.to
            spawnX = portal.spawnX
            spawnY = portal.spawnY
          }
        } else {
          const exit = INTERIOR_EXIT_PORTALS[this.currentSceneId]
          if (exit) {
            targetScene = 'town'
            spawnX = exit.townSpawnX
            spawnY = exit.townSpawnY
          }
        }

        if (!targetScene) {
          overlay.destroy()
          this.finishTransition()
          return
        }

        // 4. 切换到目标场景（重渲染地图 + NPC + 传送玩家）
        this.switchScene(targetScene, spawnX, spawnY)

        // 5. fadeIn（遮罩淡出）
        this.tweens.add({
          targets: overlay,
          alpha: 0,
          duration: transition.duration,
          ease: 'Linear',
          onComplete: () => {
            overlay.destroy()
            this.finishTransition()
          },
        })
      },
    })
  }

  /**
   * 完成过渡（恢复输入）
   */
  private finishTransition(): void {
    this.input.enabled = true
    this.movementSystem.setInputLocked(false)
    this.isTransitioning = false
  }

  /**
   * T6.11.3: 更新门口进入提示（[F] 进入 xxx / 🔒 xxx 尚未开放）
   * 城镇场景匹配 SCENE_PORTALS 得到目标建筑名；室内场景显示"离开"
   */
  private updateDoorPrompt(): void {
    if (!this.doorPrompt) return
    const door = this.collisionSystem.getNearestDoorTile()

    if (!door) {
      this.doorPrompt.setVisible(false)
      return
    }

    // 室内场景：出口门提示"离开"
    if (this.currentSceneId !== 'town') {
      this.doorPrompt.setText('[F] 离开')
      this.doorPrompt.setColor('#ffe9b0')
      this.doorPrompt.setVisible(true)
      return
    }

    // 城镇场景：匹配 SCENE_PORTALS 得到目标建筑名
    const portal = SCENE_PORTALS.find(
      (p) => p.doorX === door.tileX && p.doorY === door.tileY,
    )
    if (!portal) {
      this.doorPrompt.setVisible(false)
      return
    }

    const label = SCENES[portal.to]?.name ?? null
    if (!label) {
      this.doorPrompt.setVisible(false)
      return
    }

    if (!isSceneUnlocked(portal.to)) {
      // 剧情未解锁的建筑：显示锁定提示（不可按 F 进入）
      this.doorPrompt.setText(`🔒 ${label} 尚未开放`)
      this.doorPrompt.setColor('#ffb07a')
    } else {
      this.doorPrompt.setText(`[F] 进入 ${label}`)
      this.doorPrompt.setColor('#ffe9b0')
    }
    this.doorPrompt.setVisible(true)
  }

  /**
   * 切换到指定场景
   * 重渲染地图、重建碰撞、重建NPC布局、传送玩家、更新镜头边界
   */
  private switchScene(sceneId: SceneId, spawnTileX: number, spawnTileY: number): void {
    const def = SCENES[sceneId]
    if (!def) return

    const prevScene = this.currentSceneId
    this.currentSceneId = sceneId

    // 1. 销毁旧地图渲染
    this.mapRenderer.destroyMap()

    // 1.1 销毁旧建筑外观精灵（仅在城镇渲染）
    if (this.townBuildingRenderer) {
      this.townBuildingRenderer.destroyAll()
    }

    // 2. 生成并渲染新场景地图
    const mapData = sceneId === 'town'
      ? this.tilesetManager.generateTownMap()
      : generateInteriorMap(sceneId)
    // AI 室内底景：室内场景有 interior-bg-* 素材则启用整图底景渲染
    this.mapRenderer.setInteriorBackdrop(sceneId)
    this.mapRenderer.renderMap(mapData)

    // 2.1 城镇场景：渲染立体建筑外观
    if (sceneId === 'town' && this.townBuildingRenderer) {
      this.townBuildingRenderer.renderAll()
    }

    // 3. 重建碰撞
    this.collisionSystem = new CollisionSystem(this, this.mapRenderer)
    this.collisionSystem.init()
    this.collisionSystem.onDoorEnter((dx: number, dy: number) => {
      this.handleDoorTransition(dx, dy)
    })
    // 重新绑定玩家碰撞
    this.movementSystem.setCollisionSystem(this.collisionSystem)

    // 4. 更新物理世界边界与镜头边界
    const mapSize = this.mapRenderer.getMapPixelSize()
    this.cameraController.updateWorldBounds(mapSize.width, mapSize.height)
    // 区域跟踪仅在小镇场景启用（森林/矿洞/室内关闭，防止误报小镇区域标注）
    this.cameraController.setRegionTrackingEnabled(sceneId === 'town')
    // 室内/野外小地图：自动缩放镜头铺满屏幕（城镇恢复1:1）
    this.cameraController.setZoomLevel(GameScene.SCENE_ZOOM[sceneId] ?? 1)
    // 镜头回正到玩家

    // 5. 重建场景NPC
    this.rebuildSceneNPCs()

    // 5.0 场景切换后清空交互提示（防止残留上一场景的 NPC 提示，如"与托比对话"出现在矿洞）
    this.npcInteraction.clearPrompt()

    // 5.1 普通NPC（路人）随场景重建：城镇渲染路人，室内/野外渲染该场景氛围NPC
    void this.ambientNpcSystem?.rebuildForScene(sceneId)

    // 5.1.1 猫咪随场景重建：仅城镇渲染（室内/野外无猫）
    void this.catSystem?.rebuildForScene(sceneId)

    // 5.2 T6.14.2 任务指引箭头同步场景（跨场景目标自动改指入口/出口）
    this.questGuideArrows?.setCurrentScene(sceneId)

    // 5.3 T6.17 在线玩家系统：仅小镇渲染其他在线用户（进室内/野外隐藏，回小镇重建）
    this.rebuildRemotePlayersForScene(sceneId)

    // 6. 传送玩家到目标位置（tile → 像素坐标）
    const px = spawnTileX * TILE_SIZE + TILE_SIZE / 2
    const py = spawnTileY * TILE_SIZE + TILE_SIZE / 2
    this.movementSystem.teleportTo(px, py)

    // 7. 区域标签更新
    this.currentRegion = null
    if (this.regionLabel) {
      this.regionLabel.setText(def.name)
      this.regionLabel.setAlpha(1)
      this.regionLabel.setY(90)
      this.tweens?.killTweensOf(this.regionLabel)
      this.tweens?.add({
        targets: this.regionLabel,
        y: 120,
        duration: 400,
        ease: 'Back.easeOut',
        onComplete: () => {
          this.tweens?.add({
            targets: this.regionLabel,
            alpha: 0,
            duration: 600,
            delay: 2000,
            ease: 'Sine.easeIn',
          })
        },
      })
    }

    console.log(`[GameScene] Scene switched: ${prevScene} → ${sceneId} (${def.name}) @ (${spawnTileX},${spawnTileY})`)

    // T6.15 上报区域进入 → 推进 visit_area 主线任务目标（"前往低语森林/废弃矿洞"）
    // 仅在进入"可探索场景"（非建筑内部）时上报，且非初始加载，避免重复
    const isExplorable = sceneId === 'forest' || sceneId === 'mine'
    if (isExplorable && prevScene && prevScene !== sceneId) {
      import('../../services/websocket')
        .then(({ wsService }) => wsService.reportAreaEnter(sceneId))
        .catch((err) => console.warn('[GameScene] area:enter report failed:', err))
    }

    // T7.x.13 背景音乐：场景切换时切换对应 BGM（淡入淡出）
    musicSystem.playForScene(sceneId)

    // 场景指示器同步为实际场景名（如 星火小镇/低语森林/废弃矿洞）
    this.emitSceneName()
  }

  /**
   * 向 React 层广播当前实际场景名（scene-indicator 右上角指示器使用）
   */
  private emitSceneName(): void {
    const name = SCENES[this.currentSceneId]?.name ?? this.currentSceneId
    emitToReact(this, 'scene:switch', name)
  }

  /**
   * 重建当前场景的NPC布局（按场景定义，保留真实ID）
   * - 城镇：全部真实NPC按建筑门口/区域站位
   * - 室内/野外：该场景归属的NPC（真实ID可对话），放置在该场景的站位
   */
  private rebuildSceneNPCs(): void {
    const def = SCENES[this.currentSceneId]
    if (!def) return

    // 清理当前NPC
    for (const npc of this.npcSpriteManager.getNPCDataList()) {
      this.npcSpriteManager.destroyNPC(npc.id)
      this.npcInteraction.unregisterNPC(npc.id)
    }

    // 城镇场景：从后端同步全部真实NPC（按建筑门口/区域站位）
    if (this.currentSceneId === 'town') {
      this.loadNPCsFromServer()
      return
    }

    // 室内/野外场景：放置该场景归属的真实NPC（优先真实ID，回退占位ID）
    const sceneNpcNames = getNpcNamesForScene(this.currentSceneId)
      // 剧情解锁过滤：未解锁NPC不渲染
      .filter((name) => isNpcUnlocked(name))
    const npcsToSpawn: NPCData[] = []

    for (const name of sceneNpcNames) {
      // 场景站位：优先匹配 SCENES[scene].npcSpawns（短ID → 名字）
      const spawn = def.npcSpawns.find(
        (s) => s.npcId === name || this.npcDisplayName(s.npcId) === name,
      )
      const server = this.serverNpcMap.get(name)
      const px = spawn ? spawn.x * TILE_SIZE + TILE_SIZE / 2 : def.spawnPoint.x * TILE_SIZE + TILE_SIZE / 2
      const py = spawn ? spawn.y * TILE_SIZE + TILE_SIZE / 2 : def.spawnPoint.y * TILE_SIZE + TILE_SIZE / 2

      npcsToSpawn.push({
        id: server?.id ?? `sc_${name}`,
        name,
        title: server?.title ?? '',
        x: px,
        y: py,
        direction: spawn?.direction ?? 'down',
      })
    }

    this.npcSpriteManager.createNPCs(npcsToSpawn)
    for (const npcData of this.npcSpriteManager.getNPCDataList()) {
      this.npcInteraction.registerNPC(npcData.id, npcData.name, npcData.sprite)
    }
    console.log(`[GameScene] Scene NPCs rebuilt for "${this.currentSceneId}": ${npcsToSpawn.length}`)
  }

  /** NPC ID → 显示名（室内场景占位） */
  private npcDisplayName(id: string): string {
    const names: Record<string, string> = {
      margaret: '玛格丽特', old_buck: '老巴克', ella: '艾拉',
      anvil: '铁砧', toby: '托比', lily: '莉莉',
      sylvia: '西尔维娅', marcus: '马库斯', rosie: '罗西',
      pip: '小皮普', grom: '格罗姆', silas: '暗祭司塞拉斯',
    }
    return names[id] ?? id
  }

  /**
   * 注册NPC到交互系统
   */
  public registerNPCForInteraction(
    npcId: string,
    npcName: string,
    sprite: Phaser.GameObjects.Sprite,
  ): void {
    this.npcInteraction.registerNPC(npcId, npcName, sprite)
  }

  // --- Getter 方法 ---

  getMovementSystem(): MovementSystem {
    return this.movementSystem
  }

  getCollisionSystem(): CollisionSystem {
    return this.collisionSystem
  }

  getMapRenderer(): MapRenderer {
    return this.mapRenderer
  }

  getCameraController(): CameraController {
    return this.cameraController
  }

  getNPCInteraction(): NPCInteractionSystem {
    return this.npcInteraction
  }

  /**
   * 设置NPC移动同步监听
   * - npc:move：日程/剧情驱动的连续移动（平滑行走动画）
   * - npc:update：日程切换广播（目标位置）
   */
  private setupNpcMovementSync(): void {
    // NPC连续移动（后端 npcMovementDriver 每 200ms 广播）
    // 仅城镇场景同步（室内/野外场景 NPC 固定在建筑内站位，避免被城镇坐标覆盖）
    this.wsNpcMoveHandler = (data: { npcId: string; x: number; y: number; direction: string }) => {
      if (this.currentSceneId !== 'town') return
      this.npcSpriteManager?.updateNPCPosition(data.npcId, data.x, data.y, data.direction)
    }
    wsService.on('npc:move', this.wsNpcMoveHandler)

    // NPC日程切换广播
    this.wsNpcUpdateHandler = (data: { npcId: string; x: number; y: number; direction?: string; moving?: boolean }) => {
      if (this.currentSceneId !== 'town') return
      // 移动中的NPC由 npc:move 平滑驱动；这里仅处理未在移动中的瞬移/校正
      if (data.moving === false) {
        this.npcSpriteManager?.updateNPCPosition(data.npcId, data.x, data.y, data.direction)
      }
    }
    wsService.on('npc:update', this.wsNpcUpdateHandler)
    console.log('[GameScene] NPC movement sync listeners registered (town only)')
  }

  /** ws npc:move 回调引用（用于清理） */
  private wsNpcMoveHandler: ((data: { npcId: string; x: number; y: number; direction: string }) => void) | null = null
  /** ws npc:update 回调引用（用于清理） */
  private wsNpcUpdateHandler: ((data: { npcId: string; x: number; y: number; direction?: string; moving?: boolean }) => void) | null = null
  /** ws weather:update 回调引用（T6.9 天气系统） */
  private wsWeatherHandler: ((data: { type: string; name: string }) => void) | null = null
  /** 剧情解锁事件取消订阅（用于清理） */
  private storyUnlockUnsubscribe: (() => void) | null = null

  /**
   * 初始化剧情解锁系统
   * - 拉取玩家解锁状态 → 渲染未解锁建筑为迷雾锁定态
   * - 监听 story:unlock_changed（章节推进）→ 刷新解锁状态 + 重建NPC + 显示解锁横幅
   */
  private initStoryUnlock(): void {
    // 拉取解锁状态（成功后重建NPC：隐藏未解锁NPC）
    fetchUnlockState().then(() => {
      // 解锁状态已就绪 → 重渲染建筑（未解锁建筑变为迷雾锁定态）
      this.townBuildingRenderer?.renderAll()
      // 未解锁NPC过滤重建
      if (this.currentSceneId === 'town') {
        this.loadNPCsFromServer()
      } else {
        this.rebuildSceneNPCs()
      }
    })

    // 监听解锁事件
    this.storyUnlockUnsubscribe = watchStoryUnlockEvents((unlocked) => {
      // 解锁通知横幅（显示新解锁的场景/NPC）
      this.showUnlockBanner(unlocked)
      // 若当前在城镇，重建建筑外观（迷雾解除）与NPC
      if (this.currentSceneId === 'town') {
        this.townBuildingRenderer?.renderAll()
        this.loadNPCsFromServer()
      }
    })
  }

  /**
   * 显示场景锁定提示（玩家试图进入未解锁场景时）
   */
  private showLockedSceneHint(sceneId: string, message: string): void {
    const def = (SCENES as Record<string, SceneDef | undefined>)[sceneId]
    const name = def?.name ?? sceneId

    const hint = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT * 0.42, `🔒 ${name} 尚未开放\n${message}`, {
      fontSize: FONT_SIZE.SM,
      color: '#ffd9a0',
      fontFamily: FONT_TITLE,
      backgroundColor: 'rgba(61,40,23,0.92)',
      padding: { x: 36, y: 20 },
      align: 'center',
      lineSpacing: 14,
    })
    hint.setOrigin(0.5, 0.5)
    hint.setDepth(4000)
    hint.setScrollFactor(0)
    hint.setAlpha(0)
    hint.setStroke('#8a4a2a', 5)

    this.tweens.add({
      targets: hint,
      alpha: 1,
      duration: 250,
      onComplete: () => {
        this.tweens.add({
          targets: hint,
          alpha: 0,
          duration: 500,
          delay: 1800,
          ease: 'Sine.easeIn',
          onComplete: () => hint.destroy(),
        })
      },
    })
  }

  /**
   * 显示剧情解锁通知横幅（屏幕中上方，滚动展示）
   */
  private showUnlockBanner(unlocked: Array<{ id: string; name: string; type: string; unlockMessage: string }>): void {
    if (!unlocked || unlocked.length === 0) return

    const lines = unlocked.map((u) => {
      const msg = u.unlockMessage || `${u.name} 解锁`
      return `✦ ${msg}`
    })
    const text = lines.join('\n')

    const banner = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT * 0.3, text, {
      fontSize: FONT_SIZE.MD,
      color: '#ffe9b0',
      fontFamily: FONT_TITLE,
      backgroundColor: 'rgba(61,40,23,0.92)',
      padding: { x: 40, y: 24 },
      align: 'center',
      lineSpacing: 16,
    })
    banner.setOrigin(0.5, 0.5)
    banner.setDepth(4000)
    banner.setScrollFactor(0)
    banner.setAlpha(0)

    // 金色描边（解锁横幅质感）
    banner.setStroke('#e8a93c', 6)

    // 出现 → 停留 → 淡出
    this.tweens.add({
      targets: banner,
      alpha: 1,
      y: GAME_HEIGHT * 0.3 - 20,
      duration: 400,
      ease: 'Back.easeOut',
      onComplete: () => {
        this.tweens.add({
          targets: banner,
          alpha: 0,
          y: GAME_HEIGHT * 0.3 - 60,
          duration: 600,
          delay: 2600,
          ease: 'Sine.easeIn',
          onComplete: () => banner.destroy(),
        })
      },
    })
  }

  /**
   * 设置远程玩家位置同步监听
   * T6.17 在线玩家系统：小镇中渲染其他在线用户（黄名+随机形象），点击可对话
   */
  private setupRemotePlayerSync(): void {
    // 监听其他玩家加入 — 创建精灵（含 avatar 形象）
    wsService.on('room:playerJoined', (data: { playerId: string; name: string; avatar?: string; x: number; y: number; direction: string }) => {
      this.createRemotePlayer(data.playerId, data.name, data.x, data.y, data.avatar)
    })

    // 监听其他玩家离开 — 销毁精灵
    wsService.on('room:playerLeft', (data: { playerId: string }) => {
      this.removeRemotePlayer(data.playerId)
    })

    // 监听其他玩家移动 — 更新精灵位置
    wsService.on('player:moved', (data: { playerId: string; x: number; y: number; direction: string }) => {
      this.updateRemotePlayer(data.playerId, data.x, data.y, data.direction)
    })
  }

  /**
   * 创建远程玩家精灵（T6.17：随机形象 + 黄色名字 + 点击对话）
   * @param avatar 玩家形象 ID（avatar_01~avatar_12），决定精灵配色
   */
  private createRemotePlayer(playerId: string, name: string, x: number, y: number, avatar?: string): void {
    if (this.remotePlayers.has(playerId)) return

    // 使用该玩家注册时分配的形象生成精灵（复用同形象纹理）
    const avatarId = avatar ?? 'avatar_01'
    this.spriteGenerator.generatePlayerAvatarSprite(avatarId)
    const textureKey = this.spriteGenerator.getAvatarTextureKey(avatarId)
    const sprite = this.add.sprite(x, y, textureKey)
    sprite.setOrigin(0.5, 0.5)
    sprite.setScale(this.spriteGenerator.getDisplayScale(textureKey))
    sprite.setDepth(y + 100)

    // 启用物理碰撞体并注册进角色碰撞组（在线玩家与其他角色/玩家不可互相穿过）
    this.collisionSystem.addNpcCollider(sprite)

    // T6.17 名字为黄色（区分 NPC）：远程玩家名标签改为黄名
    // 样式与NPC名字标签保持一致（半透明黑底+padding，顶到人物头上），仅颜色不同
    const nameText = this.add.text(x, y - 74, name, {
      fontSize: FONT_SIZE.XS,
      color: '#ffd700',
      fontFamily: FONT_NAMETAG,
      backgroundColor: 'rgba(0,0,0,0.5)',
      padding: { x: 8, y: 4 },
    })
    nameText.setOrigin(0.5, 1)
    nameText.setDepth(y + 200)

    // 点击远程玩家 → 打开玩家间对话（T6.17 用户之间互相对话）
    sprite.setInteractive({ useHandCursor: true })
    sprite.on('pointerdown', () => {
      emitToReact(this, 'game:playerChat', { playerId, playerName: name, avatar: avatarId })
    })

    this.remotePlayers.set(playerId, sprite)
    this.remotePlayerNames.set(playerId, nameText)
    console.log(`[GameScene] Remote player created: ${name} (${playerId}, ${avatarId})`)
  }

  /**
   * 更新远程玩家位置（带平滑插值 + 名字跟随）
   */
  private updateRemotePlayer(playerId: string, x: number, y: number, _direction: string): void {
    const sprite = this.remotePlayers.get(playerId)
    if (!sprite) return

    // 平滑插值移动
    this.tweens.add({
      targets: sprite,
      x,
      y,
      duration: 50,
      ease: 'Linear',
      onUpdate: () => this.collisionSystem.syncNpcBody(sprite),
    })
    sprite.setDepth(y + 100)

    // 名字标签跟随移动
    const nameText = this.remotePlayerNames.get(playerId)
    if (nameText) {
      this.tweens.add({
        targets: nameText,
        x,
        y: y - 74,
        duration: 50,
        ease: 'Linear',
      })
      nameText.setDepth(y + 200)
    }
  }

  /**
   * 移除远程玩家精灵（含名字标签）
   */
  private removeRemotePlayer(playerId: string): void {
    const sprite = this.remotePlayers.get(playerId)
    if (sprite) {
      this.collisionSystem.unregisterNpc(sprite)
      sprite.destroy()
      this.remotePlayers.delete(playerId)
      console.log(`[GameScene] Remote player removed: ${playerId}`)
    }
    const nameText = this.remotePlayerNames.get(playerId)
    if (nameText) {
      nameText.destroy()
      this.remotePlayerNames.delete(playerId)
    }
  }

  /**
   * T6.17 场景切换时重建远程玩家：仅小镇渲染在线用户，室内/野外隐藏
   * （在线用户"显现在镇子里"，进入建筑/森林/矿洞不显示其他玩家）
   */
  private rebuildRemotePlayersForScene(sceneId: SceneId): void {
    // 离开小镇 → 清理全部远程玩家（进入室内/野外不显示）
    if (sceneId !== 'town') {
      for (const [pid] of this.remotePlayers) {
        this.removeRemotePlayer(pid)
      }
      return
    }
    // 回到小镇 → 请求在线列表，重新创建远程玩家精灵
    wsService.requestPlayerList()
  }
}
