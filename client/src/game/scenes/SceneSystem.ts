import { TileType } from '../data/TileData'

/**
 * SceneSystem — 场景系统
 *
 * 定义游戏的独立场景（城镇 + 各建筑室内 + 森林 + 矿洞），
 * 每个场景有独立的地图数据、入口/出口传送门、NPC站位。
 * 玩家通过门进入不同场景，而不是所有内容堆在同一张地图。
 */

/** 场景ID */
export type SceneId =
  | 'town'
  | 'blacksmith'
  | 'alchemist'
  | 'tavern'
  | 'market'
  | 'elder_hall'
  | 'residential'
  | 'forest'
  | 'mine'

/** 场景元信息 */
export interface SceneDef {
  id: SceneId
  name: string
  /** 地图尺寸（tiles） */
  mapWidth: number
  mapHeight: number
  /** 场景描述 */
  description: string
  /** 场景内的NPC站位（id → 位置tile坐标） */
  npcSpawns: Array<{ npcId: string; x: number; y: number; direction: string }>
  /** 玩家出生点（tile坐标） */
  spawnPoint: { x: number; y: number }
}

/** 场景切换入口（城镇地图门 → 目标场景） */
export interface ScenePortal {
  /** 来源场景ID */
  from: SceneId
  /** 来源场景中的门口 tile 坐标 */
  doorX: number
  doorY: number
  /** 目标场景 */
  to: SceneId
  /** 目标场景内的出生点 tile 坐标 */
  spawnX: number
  spawnY: number
}

// =============================================
// 场景注册表
// =============================================

export const SCENES: Record<SceneId, SceneDef> = {
  town: {
    id: 'town',
    name: '星火小镇',
    mapWidth: 30,
    mapHeight: 26,
    description: '小镇主街，连接各建筑与广场',
    npcSpawns: [
      // v2：位置对齐 AI 底图碰撞（水/建筑区域不可通行），NPC 站门口外/广场
      { npcId: 'margaret', x: 12, y: 8, direction: 'down' },
      { npcId: 'old_buck', x: 3, y: 7, direction: 'down' }, // 铁匠铺门口外
      { npcId: 'ella', x: 25, y: 7, direction: 'down' }, // 药剂店门口外
      { npcId: 'anvil', x: 16, y: 12, direction: 'down' }, // 广场东缘（原18,12 在河水中）
      { npcId: 'toby', x: 8, y: 16, direction: 'down' },
      { npcId: 'lily', x: 5, y: 20, direction: 'down' }, // 集市门口外
      { npcId: 'sylvia', x: 25, y: 20, direction: 'down' }, // 酒馆门口外
      { npcId: 'marcus', x: 13, y: 22, direction: 'down' }, // 民居门口外（原14,21 挡门）
      { npcId: 'rosie', x: 3, y: 20, direction: 'down' }, // 集市门口外
      { npcId: 'pip', x: 14, y: 10, direction: 'down' }, // 广场
      { npcId: 'grom', x: 13, y: 6, direction: 'down' }, // 长老大厅门口外
      { npcId: 'silas', x: 15, y: 6, direction: 'down' }, // 长老大厅门口外
    ],
    spawnPoint: { x: 14, y: 22 },
  },
  blacksmith: {
    id: 'blacksmith',
    name: '铁砧工坊',
    mapWidth: 30,
    mapHeight: 17,
    description: '老巴克的铁匠铺，炉火不灭',
    npcSpawns: [
      { npcId: 'old_buck', x: 8, y: 7, direction: 'up' }, // 站在铁砧旁，面向铁砧
    ],
    spawnPoint: { x: 15, y: 15 }, // 距门口2格，避免出生即触发出口
  },
  alchemist: {
    id: 'alchemist',
    name: '魔法药剂店',
    mapWidth: 30,
    mapHeight: 17,
    description: '艾拉的药剂店，药香弥漫',
    npcSpawns: [
      { npcId: 'ella', x: 23, y: 8, direction: 'down' }, // 站在坩埚旁
    ],
    spawnPoint: { x: 15, y: 15 },
  },
  tavern: {
    id: 'tavern',
    name: '星光酒馆',
    mapWidth: 30,
    mapHeight: 17,
    description: '玛格丽特的酒馆，美酒与传说',
    npcSpawns: [
      { npcId: 'margaret', x: 5, y: 7, direction: 'down' },
    ],
    spawnPoint: { x: 15, y: 15 },
  },
  market: {
    id: 'market',
    name: '集市',
    mapWidth: 30,
    mapHeight: 17,
    description: '罗西的集市，货物云集',
    npcSpawns: [
      { npcId: 'rosie', x: 15, y: 7, direction: 'down' },
    ],
    spawnPoint: { x: 15, y: 15 },
  },
  elder_hall: {
    id: 'elder_hall',
    name: '长老大厅',
    mapWidth: 30,
    mapHeight: 17,
    description: '长老议事之所',
    npcSpawns: [
      { npcId: 'silas', x: 15, y: 7, direction: 'down' },
      { npcId: 'grom', x: 20, y: 7, direction: 'down' },
    ],
    spawnPoint: { x: 15, y: 15 },
  },
  residential: {
    id: 'residential',
    name: '温馨小屋',
    mapWidth: 30,
    mapHeight: 17,
    description: '居民的家，温暖舒适',
    npcSpawns: [
      { npcId: 'lily', x: 8, y: 6, direction: 'down' },
    ],
    spawnPoint: { x: 15, y: 15 },
  },
  forest: {
    id: 'forest',
    name: '低语森林',
    mapWidth: 30,
    mapHeight: 17,
    description: '小镇北方的神秘森林',
    npcSpawns: [
      { npcId: 'toby', x: 15, y: 12, direction: 'down' },
    ],
    spawnPoint: { x: 15, y: 15 },
  },
  mine: {
    id: 'mine',
    name: '废弃矿洞',
    mapWidth: 30,
    mapHeight: 17,
    description: '深处的矿洞，闪烁的矿脉',
    npcSpawns: [
      { npcId: 'anvil', x: 20, y: 8, direction: 'left' }, // 站在矿脉区旁
    ],
    spawnPoint: { x: 15, y: 15 },
  },
}

// =============================================
// 场景传送门表
// =============================================

export const SCENE_PORTALS: ScenePortal[] = [
  // 城镇 → 铁砧工坊（南墙门口 4,6）
  { from: 'town', doorX: 4, doorY: 6, to: 'blacksmith', spawnX: 15, spawnY: 15 },
  // 城镇 → 魔法药剂店（南墙门口 24,6）
  { from: 'town', doorX: 24, doorY: 6, to: 'alchemist', spawnX: 15, spawnY: 15 },
  // 城镇 → 星光酒馆（南墙门口 24,19）
  { from: 'town', doorX: 24, doorY: 19, to: 'tavern', spawnX: 15, spawnY: 15 },
  // 城镇 → 集市（南墙门口 4,19）
  { from: 'town', doorX: 4, doorY: 19, to: 'market', spawnX: 15, spawnY: 15 },
  // 城镇 → 长老大厅（南墙门口 14,5）
  { from: 'town', doorX: 14, doorY: 5, to: 'elder_hall', spawnX: 15, spawnY: 15 },
  // 城镇 → 住宅区（南墙门口 14,21）
  { from: 'town', doorX: 14, doorY: 21, to: 'residential', spawnX: 15, spawnY: 15 },
  // 城镇 → 森林（北部入口）
  { from: 'town', doorX: 10, doorY: 1, to: 'forest', spawnX: 15, spawnY: 15 },
  // 城镇 → 矿洞（东北入口）
  { from: 'town', doorX: 27, doorY: 1, to: 'mine', spawnX: 15, spawnY: 15 },
]

/** 室内场景 → 城镇 的出口传送门（所有室内场景的出口都在地图底部中央） */
export const INTERIOR_EXIT_PORTALS: Record<SceneId, { doorX: number; doorY: number; townSpawnX: number; townSpawnY: number }> = {
  // 室内出口门在底部墙中央；出建筑后站在各自南墙门口前一格
  blacksmith: { doorX: 15, doorY: 16, townSpawnX: 4, townSpawnY: 7 },
  alchemist: { doorX: 15, doorY: 16, townSpawnX: 24, townSpawnY: 7 },
  tavern: { doorX: 15, doorY: 16, townSpawnX: 24, townSpawnY: 20 },
  market: { doorX: 15, doorY: 16, townSpawnX: 4, townSpawnY: 20 },
  elder_hall: { doorX: 15, doorY: 16, townSpawnX: 14, townSpawnY: 6 },
  residential: { doorX: 15, doorY: 16, townSpawnX: 14, townSpawnY: 22 },
  forest: { doorX: 15, doorY: 16, townSpawnX: 10, townSpawnY: 2 },
  mine: { doorX: 15, doorY: 16, townSpawnX: 27, townSpawnY: 2 },
  town: { doorX: -1, doorY: -1, townSpawnX: 0, townSpawnY: 0 },
}

// =============================================
// 城镇建筑布局（每个场景对应一栋可进入建筑）
// =============================================

/** 城镇建筑类型（美术外观类型） */
export type TownBuildingType =
  | 'blacksmith' // 铁砧工坊
  | 'alchemist' // 魔法药剂店
  | 'tavern' // 星光酒馆
  | 'market' // 集市
  | 'elder_hall' // 长老大厅
  | 'residential' // 温馨小屋
  | 'forest_gate' // 森林入口
  | 'mine_entrance' // 矿洞入口

/** 城镇建筑定义 */
export interface TownBuildingDef {
  id: TownBuildingType
  /** 进入后对应的室内场景 */
  sceneId: SceneId
  /** 建筑显示名 */
  name: string
  /** 建筑区域（tile 坐标，左上角 + 宽高） */
  tileX: number
  tileY: number
  tileW: number
  tileH: number
  /** 门口 tile 坐标（与 SCENE_PORTALS 对应） */
  doorTileX: number
  doorTileY: number
  /** 建筑说明 */
  description: string
}

/** 城镇建筑注册表（位置与 generateTownMap/buildHouse 布局一致） */
export const TOWN_BUILDINGS: TownBuildingDef[] = [
  {
    id: 'blacksmith',
    sceneId: 'blacksmith',
    name: '铁砧工坊',
    tileX: 2, tileY: 2, tileW: 6, tileH: 5,
    doorTileX: 4, doorTileY: 6,
    description: '老巴克的铁匠铺，炉火不灭',
  },
  {
    id: 'alchemist',
    sceneId: 'alchemist',
    name: '魔法药剂店',
    tileX: 22, tileY: 2, tileW: 6, tileH: 5,
    doorTileX: 24, doorTileY: 6,
    description: '艾拉的药剂店，药香弥漫',
  },
  {
    id: 'tavern',
    sceneId: 'tavern',
    name: '星光酒馆',
    tileX: 22, tileY: 15, tileW: 6, tileH: 5,
    doorTileX: 24, doorTileY: 19,
    description: '玛格丽特的酒馆，美酒与传说',
  },
  {
    id: 'market',
    sceneId: 'market',
    name: '集市',
    tileX: 2, tileY: 15, tileW: 6, tileH: 5,
    doorTileX: 4, doorTileY: 19,
    description: '罗西的集市，货物云集',
  },
  {
    id: 'elder_hall',
    sceneId: 'elder_hall',
    name: '长老大厅',
    tileX: 11, tileY: 2, tileW: 6, tileH: 4,
    doorTileX: 14, doorTileY: 5,
    description: '长老议事之所',
  },
  {
    id: 'residential',
    sceneId: 'residential',
    name: '温馨小屋',
    tileX: 11, tileY: 18, tileW: 6, tileH: 4,
    doorTileX: 14, doorTileY: 21,
    description: '居民的家，温暖舒适',
  },
  {
    id: 'forest_gate',
    sceneId: 'forest',
    name: '低语森林',
    tileX: 8, tileY: 0, tileW: 5, tileH: 2,
    doorTileX: 10, doorTileY: 1,
    description: '小镇北方的神秘森林',
  },
  {
    id: 'mine_entrance',
    sceneId: 'mine',
    name: '废弃矿洞',
    tileX: 25, tileY: 0, tileW: 4, tileH: 2,
    doorTileX: 27, doorTileY: 1,
    description: '深处的矿洞，闪烁的矿脉',
  },
]

/** 按场景ID查找城镇建筑 */
export const TOWN_BUILDING_BY_SCENE: Partial<Record<SceneId, TownBuildingDef>> = Object.fromEntries(
  TOWN_BUILDINGS.map((b) => [b.sceneId, b]),
) as Partial<Record<SceneId, TownBuildingDef>>

// =============================================
// NPC 场景归属（每个NPC待在自己对应的建筑/区域）
// =============================================

/** NPC名字 → 所属场景（进入对应建筑后可遇到） */
export const NPC_SCENE_MAP: Record<string, SceneId> = {
  玛格丽特: 'tavern',
  老巴克: 'blacksmith',
  艾拉: 'alchemist',
  罗西: 'market',
  莉莉: 'residential',
  塞拉斯: 'elder_hall',
  暗祭司塞拉斯: 'elder_hall',
  格罗姆: 'elder_hall',
  铁砧: 'mine',
  托比: 'forest',
  // 户外活动 NPC
  马库斯: 'town',
  西尔维娅: 'town',
  小皮普: 'town',
}

/** NPC名字 → 城镇地图上的站立点（各建筑门口侧面/户外区域，避免挡门口，tile坐标） */
export const NPC_TOWN_STANDS: Record<string, { x: number; y: number; direction?: string }> = {
  玛格丽特: { x: 25, y: 20, direction: 'left' }, // 星光酒馆门右侧
  老巴克: { x: 5, y: 7, direction: 'left' }, // 铁砧工坊门右侧
  艾拉: { x: 23, y: 7, direction: 'right' }, // 魔法药剂店门左侧
  罗西: { x: 5, y: 20, direction: 'left' }, // 集市门右侧
  莉莉: { x: 16, y: 22, direction: 'left' }, // 温馨小屋门右侧
  暗祭司塞拉斯: { x: 15, y: 6, direction: 'left' }, // 长老大厅门右侧
  格罗姆: { x: 13, y: 6, direction: 'right' }, // 长老大厅门左侧
  铁砧: { x: 26, y: 3, direction: 'right' }, // 矿洞入口前
  托比: { x: 9, y: 3, direction: 'right' }, // 森林入口前
  马库斯: { x: 17, y: 12, direction: 'left' }, // 广场巡逻
  西尔维娅: { x: 11, y: 13, direction: 'right' }, // 广场
  小皮普: { x: 15, y: 11, direction: 'down' }, // 广场
}

/** 按场景获取该场景内的NPC名字列表 */
export function getNpcNamesForScene(sceneId: SceneId): string[] {
  return Object.entries(NPC_SCENE_MAP)
    .filter(([, scene]) => scene === sceneId)
    .map(([name]) => name)
}

/** 获取NPC名字在城镇地图上的站立像素坐标（tile → 像素中心） */
export function getNpcTownStandPixel(name: string): { x: number; y: number; direction: string } {
  const stand = NPC_TOWN_STANDS[name] ?? { x: 14, y: 12, direction: 'down' }
  return {
    x: stand.x * 64 + 32,
    y: stand.y * 64 + 32,
    direction: stand.direction ?? 'down',
  }
}

// =============================================
// 室内地图生成器
// =============================================

/**
 * 生成室内地图（建筑内部）
 * 每个场景有确定性的室内布局：入口玄关 + 功能区（吧台/熔炉/床/书架等）+ 装饰，
 * 家具布局手工设计（而非随机），NPC 站位在布局中预留空位。
 */
export function generateInteriorMap(
  sceneId: SceneId,
): number[][] {
  const def = SCENES[sceneId]
  const W = def.mapWidth
  const H = def.mapHeight
  const map: number[][] = []

  // 主题配置
  const themes: Record<string, { wall: TileType; floor: TileType }> = {
    blacksmith: { wall: TileType.Wall_Stone, floor: TileType.Ground_Stone },
    alchemist: { wall: TileType.Wall_Wood, floor: TileType.Ground_Wood },
    tavern: { wall: TileType.Wall_Wood, floor: TileType.Ground_Wood },
    market: { wall: TileType.Wall_Wood, floor: TileType.Ground_Stone },
    elder_hall: { wall: TileType.Wall_Castle, floor: TileType.Ground_Stone },
    residential: { wall: TileType.Wall_Wood, floor: TileType.Ground_Wood },
    forest: { wall: TileType.Deco_Tree, floor: TileType.Ground_Grass },
    mine: { wall: TileType.Wall_Stone, floor: TileType.Ground_Stone },
    town: { wall: TileType.Wall_Stone, floor: TileType.Ground_Grass },
  }
  const theme = themes[sceneId]

  // 初始化地板
  for (let y = 0; y < H; y++) {
    map[y] = []
    for (let x = 0; x < W; x++) {
      map[y][x] = theme.floor
    }
  }

  if (sceneId === 'forest' || sceneId === 'mine') {
    // 野外场景：不建四墙，用树木/岩石围边
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (x === 0 || y === 0 || x === W - 1 || y === H - 1) {
          map[y][x] = sceneId === 'forest' ? TileType.Deco_Tree : TileType.Wall_Stone
        }
      }
    }
  } else {
    // 室内：建外墙
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (x === 0 || y === 0 || x === W - 1 || y === H - 1) {
          map[y][x] = theme.wall
        }
      }
    }
  }

  // 门口（室内底部出口 → 城镇）
  const exit = INTERIOR_EXIT_PORTALS[sceneId]
  if (exit.doorX >= 0 && exit.doorY >= 0) {
    map[exit.doorY][exit.doorX] = TileType.Building_Door
    // 门口内侧玄关留空两格（玩家进房不被家具堵住）
    if (exit.doorY - 1 >= 1) map[exit.doorY - 1][exit.doorX] = theme.floor
  }

  // 按场景放置确定性室内家具
  switch (sceneId) {
    case 'blacksmith': placeBlacksmith(map); break
    case 'alchemist': placeAlchemist(map); break
    case 'tavern': placeTavern(map); break
    case 'market': placeMarket(map); break
    case 'elder_hall': placeElderHall(map); break
    case 'residential': placeResidential(map); break
    case 'forest': placeForest(map, H); break
    case 'mine': placeMine(map); break
    default: break
  }

  return map
}

/** 放置物品到格子（越界安全） */
function put(map: number[][], x: number, y: number, type: TileType): void {
  if (y >= 0 && y < map.length && x >= 0 && x < map[0].length) {
    map[y][x] = type
  }
}

/** 铁砧工坊：熔炉 + 铁砧 + 货架 + 木桶木箱（老巴克站在铁砧旁） */
function placeBlacksmith(map: number[][]): void {
  // 熔炉（右上，大熔炉）
  put(map, 22, 2, TileType.Deco_Forge)
  put(map, 23, 2, TileType.Deco_Forge)
  put(map, 24, 2, TileType.Deco_Forge)
  put(map, 22, 3, TileType.Deco_Forge)
  put(map, 23, 3, TileType.Deco_Forge)
  put(map, 24, 3, TileType.Deco_Forge)
  // 铁砧（左上，老巴克工作位）
  put(map, 8, 6, TileType.Deco_Anvil)
  put(map, 9, 6, TileType.Deco_Anvil)
  // 货架（靠左墙，一排）
  put(map, 1, 3, TileType.Deco_Shelf)
  put(map, 1, 4, TileType.Deco_Shelf)
  put(map, 1, 5, TileType.Deco_Shelf)
  put(map, 1, 6, TileType.Deco_Shelf)
  put(map, 1, 7, TileType.Deco_Shelf)
  // 右墙货架（武器/材料）
  put(map, 28, 3, TileType.Deco_Shelf)
  put(map, 28, 4, TileType.Deco_Shelf)
  put(map, 28, 5, TileType.Deco_Shelf)
  put(map, 28, 6, TileType.Deco_Shelf)
  // 木桶与木箱（左下，成堆）
  put(map, 3, 10, TileType.Deco_Barrel)
  put(map, 4, 10, TileType.Deco_Crate)
  put(map, 3, 11, TileType.Deco_Crate)
  put(map, 4, 11, TileType.Deco_Barrel)
  put(map, 24, 10, TileType.Deco_Barrel)
  put(map, 25, 10, TileType.Deco_Crate)
  put(map, 24, 11, TileType.Deco_Crate)
  put(map, 25, 11, TileType.Deco_Barrel)
  // 火把（两侧墙上）
  put(map, 1, 2, TileType.Deco_Torch)
  put(map, 28, 2, TileType.Deco_Torch)
  // 中央地毯（锻打区）
  put(map, 13, 8, TileType.Deco_Rug)
  put(map, 14, 8, TileType.Deco_Rug)
  put(map, 15, 8, TileType.Deco_Rug)
  put(map, 16, 8, TileType.Deco_Rug)
  // 中部木桌（待修装备）
  put(map, 13, 5, TileType.Deco_Table)
  put(map, 14, 5, TileType.Deco_Table)
  put(map, 15, 5, TileType.Deco_Table)
  put(map, 16, 5, TileType.Deco_Table)
  // 装饰植物
  put(map, 5, 4, TileType.Deco_Plant)
  put(map, 26, 8, TileType.Deco_Plant)
}

/** 魔法药剂店：书架 + 货架 + 坩埚 + 草药（艾拉站在坩埚旁） */
function placeAlchemist(map: number[][]): void {
  // 书架（两侧墙上，各两格）
  put(map, 1, 3, TileType.Deco_Bookshelf)
  put(map, 1, 4, TileType.Deco_Bookshelf)
  put(map, 1, 5, TileType.Deco_Bookshelf)
  put(map, 28, 3, TileType.Deco_Bookshelf)
  put(map, 28, 4, TileType.Deco_Bookshelf)
  put(map, 28, 5, TileType.Deco_Bookshelf)
  // 货架（左墙下、右墙下）
  put(map, 1, 8, TileType.Deco_Shelf)
  put(map, 1, 9, TileType.Deco_Shelf)
  put(map, 28, 8, TileType.Deco_Shelf)
  put(map, 28, 9, TileType.Deco_Shelf)
  // 坩埚（右下，冒泡药剂）
  put(map, 23, 8, TileType.Deco_Cauldron)
  put(map, 24, 8, TileType.Deco_Cauldron)
  // 草药植物（分散布置）
  put(map, 5, 4, TileType.Deco_Plant)
  put(map, 6, 4, TileType.Deco_Plant)
  put(map, 24, 10, TileType.Deco_Plant)
  put(map, 25, 10, TileType.Deco_Plant)
  put(map, 5, 9, TileType.Deco_Plant)
  put(map, 6, 9, TileType.Deco_Plant)
  // 木箱
  put(map, 3, 10, TileType.Deco_Crate)
  put(map, 26, 10, TileType.Deco_Crate)
  // 中央工作台（配药）
  put(map, 13, 5, TileType.Deco_Table)
  put(map, 14, 5, TileType.Deco_Table)
  put(map, 15, 5, TileType.Deco_Table)
  put(map, 16, 5, TileType.Deco_Table)
  // 中央地毯
  put(map, 13, 8, TileType.Deco_Rug)
  put(map, 14, 8, TileType.Deco_Rug)
  put(map, 15, 8, TileType.Deco_Rug)
  put(map, 16, 8, TileType.Deco_Rug)
  // 火把
  put(map, 1, 2, TileType.Deco_Torch)
  put(map, 28, 2, TileType.Deco_Torch)
}

/** 星光酒馆：连贯吧台 + 吧台酒桶 + 中央用餐区 + 壁炉（玛格丽特在吧台后） */
function placeTavern(map: number[][]): void {
  // 吧台（左上，连贯长条）
  put(map, 2, 4, TileType.Deco_Bar)
  put(map, 3, 4, TileType.Deco_Bar)
  put(map, 4, 4, TileType.Deco_Bar)
  put(map, 5, 4, TileType.Deco_Bar)
  put(map, 6, 4, TileType.Deco_Bar)
  put(map, 7, 4, TileType.Deco_Bar)
  // 吧台后酒桶（一排）
  put(map, 2, 5, TileType.Deco_Barrel)
  put(map, 3, 5, TileType.Deco_Barrel)
  put(map, 4, 5, TileType.Deco_Barrel)
  put(map, 5, 5, TileType.Deco_Barrel)
  put(map, 6, 5, TileType.Deco_Barrel)
  put(map, 7, 5, TileType.Deco_Barrel)
  // 中央用餐区（两排木桌）
  put(map, 11, 3, TileType.Deco_Table)
  put(map, 12, 3, TileType.Deco_Table)
  put(map, 14, 3, TileType.Deco_Table)
  put(map, 15, 3, TileType.Deco_Table)
  put(map, 11, 6, TileType.Deco_Table)
  put(map, 12, 6, TileType.Deco_Table)
  put(map, 14, 6, TileType.Deco_Table)
  put(map, 15, 6, TileType.Deco_Table)
  put(map, 11, 9, TileType.Deco_Table)
  put(map, 12, 9, TileType.Deco_Table)
  put(map, 14, 9, TileType.Deco_Table)
  put(map, 15, 9, TileType.Deco_Table)
  put(map, 17, 3, TileType.Deco_Table)
  put(map, 18, 3, TileType.Deco_Table)
  put(map, 20, 3, TileType.Deco_Table)
  put(map, 21, 3, TileType.Deco_Table)
  put(map, 17, 6, TileType.Deco_Table)
  put(map, 18, 6, TileType.Deco_Table)
  put(map, 20, 6, TileType.Deco_Table)
  put(map, 21, 6, TileType.Deco_Table)
  put(map, 17, 9, TileType.Deco_Table)
  put(map, 18, 9, TileType.Deco_Table)
  put(map, 20, 9, TileType.Deco_Table)
  put(map, 21, 9, TileType.Deco_Table)
  // 用餐区地毯
  put(map, 12, 5, TileType.Deco_Rug)
  put(map, 13, 5, TileType.Deco_Rug)
  put(map, 13, 4, TileType.Deco_Rug)
  put(map, 18, 5, TileType.Deco_Rug)
  put(map, 19, 5, TileType.Deco_Rug)
  put(map, 19, 4, TileType.Deco_Rug)
  // 壁炉（右墙）
  put(map, 28, 3, TileType.Deco_Fireplace)
  // 装饰木桶（角落与墙边）
  put(map, 1, 8, TileType.Deco_Barrel)
  put(map, 1, 9, TileType.Deco_Barrel)
  put(map, 2, 10, TileType.Deco_Crate)
  put(map, 3, 10, TileType.Deco_Barrel)
  put(map, 26, 10, TileType.Deco_Crate)
  put(map, 27, 10, TileType.Deco_Barrel)
  put(map, 28, 9, TileType.Deco_Crate)
  // 墙上挂饰
  put(map, 11, 2, TileType.Deco_Tapestry)
  put(map, 13, 2, TileType.Deco_Tapestry)
  put(map, 17, 2, TileType.Deco_Tapestry)
  put(map, 20, 2, TileType.Deco_Tapestry)
}

/** 集市：货架 + 木箱 + 鱼桶 + 木桌（罗西在货架间） */
function placeMarket(map: number[][]): void {
  // 货架（两侧墙上）
  put(map, 1, 3, TileType.Deco_Shelf)
  put(map, 1, 4, TileType.Deco_Shelf)
  put(map, 28, 3, TileType.Deco_Shelf)
  put(map, 28, 4, TileType.Deco_Shelf)
  put(map, 1, 7, TileType.Deco_Shelf)
  put(map, 1, 8, TileType.Deco_Shelf)
  put(map, 28, 7, TileType.Deco_Shelf)
  put(map, 28, 8, TileType.Deco_Shelf)
  // 中间展桌（两排）
  put(map, 10, 4, TileType.Deco_Table)
  put(map, 11, 4, TileType.Deco_Table)
  put(map, 14, 4, TileType.Deco_Table)
  put(map, 15, 4, TileType.Deco_Table)
  put(map, 18, 4, TileType.Deco_Table)
  put(map, 19, 4, TileType.Deco_Table)
  put(map, 10, 8, TileType.Deco_Table)
  put(map, 11, 8, TileType.Deco_Table)
  put(map, 14, 8, TileType.Deco_Table)
  put(map, 15, 8, TileType.Deco_Table)
  put(map, 18, 8, TileType.Deco_Table)
  put(map, 19, 8, TileType.Deco_Table)
  // 木箱堆（左下）
  put(map, 3, 10, TileType.Deco_Crate)
  put(map, 4, 10, TileType.Deco_Crate)
  put(map, 3, 11, TileType.Deco_Crate)
  put(map, 4, 11, TileType.Deco_Crate)
  // 鱼桶（右下）
  put(map, 25, 10, TileType.Deco_FishBarrel)
  put(map, 26, 10, TileType.Deco_FishBarrel)
  put(map, 25, 11, TileType.Deco_Barrel)
  put(map, 26, 11, TileType.Deco_Barrel)
  // 木桶
  put(map, 6, 10, TileType.Deco_Barrel)
  put(map, 23, 10, TileType.Deco_Barrel)
  // 中央地毯
  put(map, 13, 6, TileType.Deco_Rug)
  put(map, 14, 6, TileType.Deco_Rug)
  put(map, 15, 6, TileType.Deco_Rug)
  put(map, 16, 6, TileType.Deco_Rug)
  // 火把
  put(map, 1, 2, TileType.Deco_Torch)
  put(map, 28, 2, TileType.Deco_Torch)
}

/** 长老大厅：书架 + 挂毯 + 长桌 + 地毯（塞拉斯与格罗姆在桌旁） */
function placeElderHall(map: number[][]): void {
  // 书架（两侧）
  put(map, 1, 3, TileType.Deco_Bookshelf)
  put(map, 1, 4, TileType.Deco_Bookshelf)
  put(map, 1, 5, TileType.Deco_Bookshelf)
  put(map, 28, 3, TileType.Deco_Bookshelf)
  put(map, 28, 4, TileType.Deco_Bookshelf)
  put(map, 28, 5, TileType.Deco_Bookshelf)
  // 挂毯（墙上）
  put(map, 3, 2, TileType.Deco_Tapestry)
  put(map, 5, 2, TileType.Deco_Tapestry)
  put(map, 24, 2, TileType.Deco_Tapestry)
  put(map, 26, 2, TileType.Deco_Tapestry)
  // 长桌（中央横条）
  put(map, 11, 6, TileType.Deco_Table)
  put(map, 12, 6, TileType.Deco_Table)
  put(map, 13, 6, TileType.Deco_Table)
  put(map, 14, 6, TileType.Deco_Table)
  put(map, 15, 6, TileType.Deco_Table)
  put(map, 16, 6, TileType.Deco_Table)
  put(map, 17, 6, TileType.Deco_Table)
  put(map, 18, 6, TileType.Deco_Table)
  // 桌下地毯
  put(map, 11, 7, TileType.Deco_Rug)
  put(map, 12, 7, TileType.Deco_Rug)
  put(map, 13, 7, TileType.Deco_Rug)
  put(map, 14, 7, TileType.Deco_Rug)
  put(map, 15, 7, TileType.Deco_Rug)
  put(map, 16, 7, TileType.Deco_Rug)
  put(map, 17, 7, TileType.Deco_Rug)
  put(map, 18, 7, TileType.Deco_Rug)
  // 两侧火把
  put(map, 1, 8, TileType.Deco_Torch)
  put(map, 28, 8, TileType.Deco_Torch)
  // 木箱（角落）
  put(map, 3, 11, TileType.Deco_Crate)
  put(map, 26, 11, TileType.Deco_Crate)
  // 讲台（长老席位）
  put(map, 15, 3, TileType.Deco_Table)
  put(map, 14, 3, TileType.Deco_Table)
}

/** 温馨小屋：床 + 衣柜 + 炉灶 + 木桌 + 地毯（莉莉在家） */
function placeResidential(map: number[][]): void {
  // 床（左上，2格）
  put(map, 3, 4, TileType.Deco_Bed)
  put(map, 4, 4, TileType.Deco_Bed)
  put(map, 3, 5, TileType.Deco_Bed)
  put(map, 4, 5, TileType.Deco_Bed)
  // 床头柜
  put(map, 6, 4, TileType.Deco_Cabinet)
  // 衣柜（右墙）
  put(map, 27, 3, TileType.Deco_Cabinet)
  put(map, 27, 4, TileType.Deco_Cabinet)
  // 炉灶（右墙下）
  put(map, 26, 7, TileType.Deco_Stove)
  put(map, 27, 7, TileType.Deco_Stove)
  // 木桌（中央）
  put(map, 14, 7, TileType.Deco_Table)
  put(map, 15, 7, TileType.Deco_Table)
  // 地毯
  put(map, 12, 9, TileType.Deco_Rug)
  put(map, 13, 9, TileType.Deco_Rug)
  put(map, 14, 9, TileType.Deco_Rug)
  put(map, 15, 9, TileType.Deco_Rug)
  put(map, 16, 9, TileType.Deco_Rug)
  put(map, 17, 9, TileType.Deco_Rug)
  // 植物与木箱
  put(map, 3, 9, TileType.Deco_Plant)
  put(map, 26, 9, TileType.Deco_Crate)
  put(map, 5, 11, TileType.Deco_Crate)
  // 挂画/壁毯
  put(map, 14, 2, TileType.Deco_Tapestry)
  put(map, 16, 2, TileType.Deco_Tapestry)
  // 椅子（桌旁）
  put(map, 13, 6, TileType.Deco_Table)
  put(map, 16, 6, TileType.Deco_Table)
}

/** 低语森林：树带 + 灌木 + 岩石 + 花（托比在林间小路） */
function placeForest(map: number[][], H: number): void {
  // 林间小路（中央纵路）
  for (let y = 4; y < H - 3; y++) {
    put(map, 15, y, TileType.Ground_Path)
  }
  // 树丛（错落，30×17 布局）
  const trees: Array<[number, number]> = [
    [3, 3], [4, 4], [5, 3], [7, 5], [20, 4], [22, 5], [24, 4], [25, 3],
    [3, 9], [5, 10], [6, 12], [3, 13], [5, 14], [7, 15], [21, 11], [23, 12],
    [22, 14], [20, 15], [24, 15], [4, 15], [8, 13], [18, 8], [20, 6], [8, 6],
    [10, 3], [12, 3], [18, 3], [22, 8], [10, 12], [12, 13],
  ]
  for (const [x, y] of trees) put(map, x, y, TileType.Deco_Tree)
  // 灌木
  const bushes: Array<[number, number]> = [
    [7, 7], [17, 7], [11, 12], [17, 13], [6, 13], [23, 9], [9, 15], [19, 15],
  ]
  for (const [x, y] of bushes) put(map, x, y, TileType.Deco_Bush)
  // 岩石与花
  const rocks: Array<[number, number]> = [[10, 6], [20, 10], [7, 12], [22, 13], [13, 9]]
  for (const [x, y] of rocks) put(map, x, y, TileType.Deco_Rock)
  const flowers: Array<[number, number]> = [[13, 11], [17, 11], [11, 14], [19, 14], [16, 12], [14, 12]]
  for (const [x, y] of flowers) put(map, x, y, TileType.Deco_Flower)
}

/** 废弃矿洞：矿脉 + 矿车 + 火把 + 睡袋 + 木箱（铁砧在矿脉区） */
function placeMine(map: number[][]): void {
  // 矿脉（两侧岩壁内）
  const veins: Array<[number, number]> = [
    [2, 3], [3, 3], [4, 2], [25, 3], [26, 3], [25, 2],
    [3, 8], [4, 8], [25, 8], [26, 8],
    [2, 12], [3, 12], [26, 12], [27, 12],
  ]
  for (const [x, y] of veins) put(map, x, y, TileType.Deco_OreVein)
  // 矿车
  put(map, 5, 7, TileType.Deco_Minecart)
  put(map, 24, 7, TileType.Deco_Minecart)
  put(map, 5, 11, TileType.Deco_Minecart)
  // 火把（通道两侧）
  put(map, 2, 5, TileType.Deco_Torch)
  put(map, 27, 5, TileType.Deco_Torch)
  put(map, 2, 10, TileType.Deco_Torch)
  put(map, 27, 10, TileType.Deco_Torch)
  // 睡袋（矿工休息处）
  put(map, 7, 12, TileType.Deco_Bedroll)
  put(map, 8, 12, TileType.Deco_Bedroll)
  put(map, 21, 12, TileType.Deco_Bedroll)
  put(map, 22, 12, TileType.Deco_Bedroll)
  // 木箱与木桶
  put(map, 6, 13, TileType.Deco_Crate)
  put(map, 23, 13, TileType.Deco_Barrel)
  put(map, 13, 12, TileType.Deco_Crate)
  put(map, 16, 12, TileType.Deco_Barrel)
  // 中央矿石堆
  put(map, 14, 7, TileType.Deco_OreVein)
  put(map, 15, 7, TileType.Deco_OreVein)
  put(map, 14, 8, TileType.Deco_Crate)
  put(map, 15, 8, TileType.Deco_Crate)
}
