import Phaser from 'phaser'
import { TILE_SIZE } from '../config'
import { useGameStore } from '../../stores/gameStore'
import type { MissionObjective } from '../../stores/gameStore'
import {
  SCENES,
  SCENE_PORTALS,
  INTERIOR_EXIT_PORTALS,
  NPC_SCENE_MAP,
  NPC_TOWN_STANDS,
  type SceneId,
} from '../scenes/SceneSystem'

/**
 * QuestGuideArrows — 原神式任务指引箭头（T6.14.2）
 *
 * 玩家接受主线任务（activeMission）后，在玩家与目标之间的"路上"绘制
 * 一枚闪动的白色箭头，告诉玩家应该往哪个方向走：
 * - 目标在当前场景（NPC 站位 / 区域中心）→ 箭头直接指向目标点
 * - 目标在其他场景（打怪/访问区域）→ 指向通往该场景的入口（城镇门）
 * - 玩家身处室内/野外、目标在别处 → 指向当前场景的出口
 * - 接近目标（<160px）→ 箭头自动隐藏（已到达）
 *
 * 视觉：白色三角箭头 + 尾部光带 + 圆形光晕，alpha 呼吸闪动（原神指引质感）
 */
export class QuestGuideArrows {
  /** 箭头绘制对象（单 Graphics，每帧重绘） */
  private arrow: Phaser.GameObjects.Graphics

  /** 当前所处场景ID（GameScene 场景切换时同步） */
  private currentScene: SceneId = 'town'

  /** 后端 NPC 档案ID → 名字（由 GameScene 加载后端数据后注入，用于解析 UUID 目标） */
  private npcIdToName = new Map<string, string>()

  /** 已解析指引目标的缓存 key（目标不变时避免重复解析） */
  private lastResolveKey = ''
  /** 缓存的指引目标 */
  private cachedTarget: GuideTarget | null = null

  constructor(scene: Phaser.Scene) {
    this.arrow = scene.add.graphics()
    this.arrow.setDepth(2200)
  }

  /** 设置当前场景（场景切换时调用） */
  setCurrentScene(sceneId: SceneId): void {
    this.currentScene = sceneId
    this.lastResolveKey = ''
  }

  /** 注入后端 NPC 档案ID → 名字 映射（解析 talk_to_npc 的 UUID 目标） */
  setNpcIdToName(idToName: Map<string, string>): void {
    this.npcIdToName = idToName
    this.lastResolveKey = ''
  }

  /** 销毁 */
  destroy(): void {
    this.arrow.destroy()
  }

  /**
   * 每帧更新箭头
   * @param now 场景时间
   * @param playerX 玩家世界X
   * @param playerY 玩家世界Y
   */
  update(now: number, playerX: number, playerY: number): void {
    // 无进行中任务 → 隐藏
    const mission = useGameStore.getState().mission.activeMission
    if (!mission || !mission.objectives || mission.objectives.length === 0) {
      this.arrow.clear()
      return
    }

    const target = this.resolveActiveTarget()
    if (!target) {
      this.arrow.clear()
      return
    }

    // 目标点 → 当前场景世界坐标
    const point = this.getGuideWorldPoint(target)
    if (!point) {
      this.arrow.clear()
      return
    }

    // 接近目标（已到达）→ 隐藏
    const dx = point.x - playerX
    const dy = point.y - playerY
    const dist = Math.hypot(dx, dy)
    if (dist < 160) {
      this.arrow.clear()
      return
    }

    // 箭头置于玩家前方 150px 的道路上
    const angle = Math.atan2(dy, dx)
    const ax = playerX + (dx / dist) * 150
    const ay = playerY + (dy / dist) * 150

    // 白色呼吸闪动（0.35 ~ 1.0）
    const alpha = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(now / 260))
    this.drawArrow(ax, ay, angle, alpha)
  }

  // ============================================
  // 目标解析
  // ============================================

  /**
   * 解析当前第一个未完成目标 → 指引目标（场景 + 场景内tile坐标）
   */
  private resolveActiveTarget(): GuideTarget | null {
    const mission = useGameStore.getState().mission.activeMission
    if (!mission) return null

    // 第一个未完成目标（进度未满）
    const objective = mission.objectives.find((o) => (o.currentCount ?? 0) < o.requiredCount)
    if (!objective) return null

    const key = `${mission.questId}:${objective.id}`
    if (key === this.lastResolveKey) return this.cachedTarget
    this.lastResolveKey = key
    this.cachedTarget = this.resolveObjective(objective)
    return this.cachedTarget
  }

  /** 单个目标 → 指引目标 */
  private resolveObjective(objective: MissionObjective): GuideTarget | null {
    const type = objective.type ?? this.guessType(objective.description)
    const targetId = objective.targetId ?? ''

    switch (type) {
      case 'talk_to_npc':
      case 'collect_item': {
        // targetId 可能是 NPC 名字（关系剧情任务）或后端档案ID（UUID）
        const npcName = this.matchNpcName(targetId)
        if (!npcName) return null // 无法定位（未知UUID）→ 不显示指引
        return this.resolveNpcTarget(npcName)
      }
      case 'kill_enemy': {
        // 敌人归属场景（战斗发生地）
        const scene = ENEMY_SCENE_MAP[targetId] ?? 'forest'
        return { scene, tileX: 15, tileY: 8 } // 场景中央深处为战斗聚集点
      }
      case 'visit_area': {
        // targetId 是区域名（如"低语森林"），匹配场景名
        const scene = matchSceneByName(targetId) ?? 'forest'
        return { scene, tileX: 15, tileY: 8 }
      }
      default:
        return null
    }
  }

  /** 解析 NPC 名字 → 指引目标（该NPC归属场景内的站位） */
  private resolveNpcTarget(npcName: string): GuideTarget | null {
    const scene = NPC_SCENE_MAP[npcName] ?? 'town'

    if (scene === 'town') {
      // 城镇场景：NPC_TOWN_STANDS 直接给出 tile 站位
      const stand = NPC_TOWN_STANDS[npcName]
      return { scene, tileX: stand?.x ?? 14, tileY: stand?.y ?? 12 }
    }

    // 室内/野外场景：匹配该场景的 npcSpawns 站位
    const def = SCENES[scene]
    const spawn = def.npcSpawns.find(
      (s) => s.npcId === npcName || this.npcShortIdToName(s.npcId) === npcName,
    )
    return {
      scene,
      tileX: spawn?.x ?? def.spawnPoint.x,
      tileY: spawn?.y ?? def.spawnPoint.y,
    }
  }

  /**
   * 把 targetId 解析成 NPC 名字：
   * 1. 直接是名字（NPC_SCENE_MAP / NPC_TOWN_STANDS 的键）
   * 2. 后端档案ID（UUID）→ 通过注入的 npcIdToName 反查
   */
  private matchNpcName(targetId: string): string | null {
    if (!targetId) return null
    if (NPC_SCENE_MAP[targetId] || NPC_TOWN_STANDS[targetId]) return targetId
    return this.npcIdToName.get(targetId) ?? null
  }

  /** 场景内 NPC 短ID（如 margaret）→ 显示名 */
  private npcShortIdToName(id: string): string {
    const names: Record<string, string> = {
      margaret: '玛格丽特', old_buck: '老巴克', ella: '艾拉',
      anvil: '铁砧', toby: '托比', lily: '莉莉',
      sylvia: '西尔维娅', marcus: '马库斯', rosie: '罗西',
      pip: '小皮普', grom: '格罗姆', silas: '暗祭司塞拉斯',
    }
    return names[id] ?? id
  }

  /** 根据目标描述猜测类型（后端未下发 type 时的兜底） */
  private guessType(description: string): string | null {
    if (!description) return null
    if (/击败|消灭|猎杀|打退|击杀|剿灭/.test(description)) return 'kill_enemy'
    if (/对话|交谈|拜访|询问|寻找.{0,6}谈谈/.test(description)) return 'talk_to_npc'
    if (/前往|到达|进入|探索/.test(description)) return 'visit_area'
    if (/收集|取得|找到|带回/.test(description)) return 'collect_item'
    return null
  }

  // ============================================
  // 目标点 → 当前场景世界坐标
  // ============================================

  /**
   * 把指引目标映射到"当前场景坐标系"下的世界坐标：
   * - 目标在当前场景 → 场景内目标点
   * - 当前在城镇、目标在其他场景 → 指向该场景入口（城镇门）
   * - 当前在室内/野外、目标在别处 → 指向当前场景出口
   */
  private getGuideWorldPoint(target: GuideTarget): { x: number; y: number } | null {
    if (target.scene === this.currentScene) {
      return {
        x: target.tileX * TILE_SIZE + TILE_SIZE / 2,
        y: target.tileY * TILE_SIZE + TILE_SIZE / 2,
      }
    }

    if (this.currentScene === 'town') {
      // 城镇：找通往目标场景的门
      const portal = SCENE_PORTALS.find((p) => p.from === 'town' && p.to === target.scene)
      if (!portal) return null
      return {
        x: portal.doorX * TILE_SIZE + TILE_SIZE / 2,
        y: portal.doorY * TILE_SIZE + TILE_SIZE / 2,
      }
    }

    // 室内/野外：指向当前场景的出口门（底部中央）
    const exit = INTERIOR_EXIT_PORTALS[this.currentScene]
    if (exit.doorX < 0 || exit.doorY < 0) return null
    return {
      x: exit.doorX * TILE_SIZE + TILE_SIZE / 2,
      y: exit.doorY * TILE_SIZE + TILE_SIZE / 2,
    }
  }

  // ============================================
  // 箭头绘制
  // ============================================

  /**
   * 绘制白色闪动箭头：圆形光晕 + 三角箭头 + 尾部光带
   */
  private drawArrow(x: number, y: number, angle: number, alpha: number): void {
    const g = this.arrow
    g.clear()

    const cos = Math.cos(angle)
    const sin = Math.sin(angle)

    // 1. 圆形光晕（地面光斑）
    g.fillStyle(0xffffff, alpha * 0.15)
    g.fillCircle(x, y, 32)

    // 2. 三角箭头
    const size = 42
    const halfW = 22
    const tipX = x + cos * size * 0.8
    const tipY = y + sin * size * 0.8
    const backX = x - cos * size * 0.45
    const backY = y - sin * size * 0.45
    // 底边两角（垂直方向）
    const bx = -sin
    const by = cos

    g.fillStyle(0xffffff, alpha)
    g.lineStyle(6, 0xffffff, alpha)
    g.beginPath()
    g.moveTo(tipX, tipY)
    g.lineTo(backX + bx * halfW, backY + by * halfW)
    g.lineTo(backX - bx * halfW, backY - by * halfW)
    g.closePath()
    g.fillPath()
    g.strokePath()

    // 3. 尾部光带（箭头后方延伸，形成"路标"感）
    g.lineStyle(7, 0xffffff, alpha * 0.6)
    g.lineBetween(backX - cos * 30, backY - sin * 30, backX + cos * 10, backY + sin * 10)
  }
}

/** 指引目标：目标场景 + 场景内 tile 坐标 */
interface GuideTarget {
  scene: SceneId
  tileX: number
  tileY: number
}

/** 敌人ID → 归属场景（战斗发生地）
 * T6.15 与主线任务解锁适配：荒野之狼/哥布林在"小镇周边荒野"（序章即可遭遇），
 * 树精/幽灵/暗影爪牙/守护者BOSS在低语森林（第一章解锁），洞穴蠕虫在矿洞（第二章解锁）
 */
const ENEMY_SCENE_MAP: Record<string, SceneId> = {
  enemy_wolf: 'town',
  enemy_goblin: 'town',
  enemy_treant: 'forest',
  enemy_ghost: 'forest',
  enemy_mushroom: 'forest',
  enemy_cave_worm: 'mine',
  enemy_shadow_minion: 'forest',
  boss_forest_guardian: 'forest',
}

/** 场景名（或场景ID）→ 场景ID */
function matchSceneByName(name: string): SceneId | null {
  if (!name) return null
  const trimmed = name.trim()
  for (const id of Object.keys(SCENES) as SceneId[]) {
    if (SCENES[id].name === trimmed || id === trimmed) return id
  }
  return null
}
