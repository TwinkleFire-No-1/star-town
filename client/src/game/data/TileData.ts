/**
 * TileType — 所有可用 Tile 类型枚举
 *
 * 命名规则：{区域}_{类型}
 * 占位阶段使用纯色块，后续替换为正式美术
 */
export enum TileType {
  // --- 通用 ---
  Empty = 0,
  
  // --- 地面 (1-19) ---
  Ground_Grass = 1,
  Ground_Dirt = 2,
  Ground_Stone = 3,
  Ground_Wood = 4,
  Ground_Water = 5,
  Ground_Sand = 6,
  Ground_Bridge = 7,
  Ground_Path = 8,
  
  // --- 墙壁与围栏 (20-39) ---
  Wall_Stone = 20,
  Wall_Wood = 21,
  Fence_Wood = 22,
  Wall_Castle = 23,
  
  // --- 建筑结构 (40-59) ---
  Building_Door = 40,
  Building_Window = 41,
  Building_Roof = 42,
  Building_Chimney = 43,
  Building_Sign = 44,
  
  // --- 装饰 (60-79) ---
  Deco_Tree = 60,
  Deco_Flower = 61,
  Deco_Bush = 62,
  Deco_Rock = 63,
  Deco_Barrel = 64,
  Deco_Crate = 65,
  Deco_LampPost = 66,
  Deco_Well = 67,
  Deco_Fountain = 68,
  Deco_Bench = 69,
  Deco_Anvil = 70,
  Deco_Forge = 71,
  Deco_Bookshelf = 72,
  Deco_Counter = 73,
  Deco_Table = 74,
  Deco_Stove = 75,
  Deco_Garden = 76,
  Deco_Signpost = 77,

  // --- 室内家具 (80-95) ---
  Deco_Bed = 80,
  Deco_Cabinet = 81,
  Deco_Stairs = 82,
  Deco_Fireplace = 83,
  Deco_Rug = 84,
  Deco_Chandelier = 85,
  Deco_Cauldron = 86,
  Deco_Shelf = 87,
  Deco_Minecart = 88,
  Deco_OreVein = 89,
  Deco_Torch = 90,
  Deco_FishBarrel = 91,
  Deco_Tapestry = 92,
  Deco_Plant = 93,
  Deco_Bedroll = 94,
  Deco_Bar = 95,

  // --- 碰撞层标记 ---
  Collision_Block = 99,
}

/**
 * Tile 渲染配置
 */
export interface TileConfig {
  type: TileType
  name: string
  color: number
  walkable: boolean
  isDoor?: boolean
  region?: RegionType
}

/**
 * 区域类型 — 小镇的9大区域
 */
export enum RegionType {
  TownSquare = 'town_square',
  Blacksmith = 'blacksmith',
  Alchemist = 'alchemist',
  Tavern = 'tavern',
  Market = 'market',
  ElderHall = 'elder_hall',
  Residential = 'residential',
  TownGate = 'town_gate',
  ForestEdge = 'forest_edge',
}

/**
 * 区域元数据
 */
export interface RegionConfig {
  type: RegionType
  name: string
  bounds: { x: number; y: number; w: number; h: number }
  themeColor: number
  description: string
}

/**
 * 全部 Tile 配置表
 */
export const TILE_CONFIGS: Record<number, TileConfig> = {
  [TileType.Empty]: { type: TileType.Empty, name: '空', color: 0x000000, walkable: false },
  
  // 地面
  [TileType.Ground_Grass]: { type: TileType.Ground_Grass, name: '草地', color: 0x2d5a27, walkable: true },
  [TileType.Ground_Dirt]: { type: TileType.Ground_Dirt, name: '泥地', color: 0x8b6914, walkable: true },
  [TileType.Ground_Stone]: { type: TileType.Ground_Stone, name: '石板路', color: 0x888888, walkable: true },
  [TileType.Ground_Wood]: { type: TileType.Ground_Wood, name: '木地板', color: 0x966f33, walkable: true },
  [TileType.Ground_Water]: { type: TileType.Ground_Water, name: '水面', color: 0x2255aa, walkable: false },
  [TileType.Ground_Sand]: { type: TileType.Ground_Sand, name: '沙地', color: 0xc2b280, walkable: true },
  [TileType.Ground_Bridge]: { type: TileType.Ground_Bridge, name: '木桥', color: 0x7a5230, walkable: true },
  [TileType.Ground_Path]: { type: TileType.Ground_Path, name: '小路', color: 0xa0855c, walkable: true },
  
  // 墙壁
  [TileType.Wall_Stone]: { type: TileType.Wall_Stone, name: '石墙', color: 0x666666, walkable: false },
  [TileType.Wall_Wood]: { type: TileType.Wall_Wood, name: '木墙', color: 0x6b4226, walkable: false },
  [TileType.Fence_Wood]: { type: TileType.Fence_Wood, name: '木栅栏', color: 0x8b6914, walkable: false },
  [TileType.Wall_Castle]: { type: TileType.Wall_Castle, name: '城堡墙', color: 0x555555, walkable: false },
  
  // 建筑
  [TileType.Building_Door]: { type: TileType.Building_Door, name: '门', color: 0xcc8844, walkable: true, isDoor: true },
  [TileType.Building_Window]: { type: TileType.Building_Window, name: '窗户', color: 0x88ccff, walkable: false },
  [TileType.Building_Roof]: { type: TileType.Building_Roof, name: '屋顶', color: 0xcc3333, walkable: false },
  [TileType.Building_Chimney]: { type: TileType.Building_Chimney, name: '烟囱', color: 0x884444, walkable: false },
  [TileType.Building_Sign]: { type: TileType.Building_Sign, name: '招牌', color: 0xddaa55, walkable: false },
  
  // 装饰
  [TileType.Deco_Tree]: { type: TileType.Deco_Tree, name: '树木', color: 0x1a4a1a, walkable: false },
  [TileType.Deco_Flower]: { type: TileType.Deco_Flower, name: '花朵', color: 0xff6699, walkable: true },
  [TileType.Deco_Bush]: { type: TileType.Deco_Bush, name: '灌木', color: 0x2d6a2d, walkable: false },
  [TileType.Deco_Rock]: { type: TileType.Deco_Rock, name: '岩石', color: 0x999999, walkable: false },
  [TileType.Deco_Barrel]: { type: TileType.Deco_Barrel, name: '木桶', color: 0x8b5a2b, walkable: false },
  [TileType.Deco_Crate]: { type: TileType.Deco_Crate, name: '箱子', color: 0xb8860b, walkable: false },
  [TileType.Deco_LampPost]: { type: TileType.Deco_LampPost, name: '灯柱', color: 0xcccc55, walkable: false },
  [TileType.Deco_Well]: { type: TileType.Deco_Well, name: '水井', color: 0x667788, walkable: false },
  [TileType.Deco_Fountain]: { type: TileType.Deco_Fountain, name: '喷泉', color: 0x5599bb, walkable: false },
  [TileType.Deco_Bench]: { type: TileType.Deco_Bench, name: '长椅', color: 0x7a5230, walkable: false },
  [TileType.Deco_Anvil]: { type: TileType.Deco_Anvil, name: '铁砧', color: 0x555555, walkable: false },
  [TileType.Deco_Forge]: { type: TileType.Deco_Forge, name: '锻造炉', color: 0x993333, walkable: false },
  [TileType.Deco_Bookshelf]: { type: TileType.Deco_Bookshelf, name: '书架', color: 0x6b4226, walkable: false },
  [TileType.Deco_Counter]: { type: TileType.Deco_Counter, name: '柜台', color: 0x8b6914, walkable: false },
  [TileType.Deco_Table]: { type: TileType.Deco_Table, name: '桌子', color: 0x7a5230, walkable: false },
  [TileType.Deco_Stove]: { type: TileType.Deco_Stove, name: '炉灶', color: 0x666655, walkable: false },
  [TileType.Deco_Garden]: { type: TileType.Deco_Garden, name: '花园', color: 0x3d8a3d, walkable: true },
  [TileType.Deco_Signpost]: { type: TileType.Deco_Signpost, name: '路牌', color: 0xaa8855, walkable: false },

  // 室内家具
  [TileType.Deco_Bed]: { type: TileType.Deco_Bed, name: '床', color: 0x8a6a4a, walkable: false },
  [TileType.Deco_Cabinet]: { type: TileType.Deco_Cabinet, name: '柜子', color: 0x7a5230, walkable: false },
  [TileType.Deco_Stairs]: { type: TileType.Deco_Stairs, name: '楼梯', color: 0x6a4a2a, walkable: true },
  [TileType.Deco_Fireplace]: { type: TileType.Deco_Fireplace, name: '壁炉', color: 0x993333, walkable: false },
  [TileType.Deco_Rug]: { type: TileType.Deco_Rug, name: '地毯', color: 0x9a3333, walkable: true },
  [TileType.Deco_Chandelier]: { type: TileType.Deco_Chandelier, name: '吊灯', color: 0xccaa33, walkable: false },
  [TileType.Deco_Cauldron]: { type: TileType.Deco_Cauldron, name: '大锅', color: 0x333333, walkable: false },
  [TileType.Deco_Shelf]: { type: TileType.Deco_Shelf, name: '架子', color: 0x8a6a3a, walkable: false },
  [TileType.Deco_Minecart]: { type: TileType.Deco_Minecart, name: '矿车', color: 0x555544, walkable: false },
  [TileType.Deco_OreVein]: { type: TileType.Deco_OreVein, name: '矿脉', color: 0x8899aa, walkable: false },
  [TileType.Deco_Torch]: { type: TileType.Deco_Torch, name: '火把', color: 0xcc6622, walkable: false },
  [TileType.Deco_FishBarrel]: { type: TileType.Deco_FishBarrel, name: '鱼桶', color: 0x4466aa, walkable: false },
  [TileType.Deco_Tapestry]: { type: TileType.Deco_Tapestry, name: '挂毯', color: 0x663399, walkable: false },
  [TileType.Deco_Plant]: { type: TileType.Deco_Plant, name: '盆栽', color: 0x3d8a3d, walkable: false },
  [TileType.Deco_Bedroll]: { type: TileType.Deco_Bedroll, name: '睡袋', color: 0x6a7a4a, walkable: true },
  [TileType.Deco_Bar]: { type: TileType.Deco_Bar, name: '吧台', color: 0x6b4423, walkable: false },

  // 碰撞
  [TileType.Collision_Block]: { type: TileType.Collision_Block, name: '碰撞块', color: 0xff00ff, walkable: false },
}

/**
 * 9大区域配置
 */
export const REGION_CONFIGS: Record<RegionType, RegionConfig> = {
  [RegionType.TownSquare]: {
    type: RegionType.TownSquare,
    name: '镇中心广场',
    bounds: { x: 10, y: 7, w: 10, h: 8 },
    themeColor: 0x888888,
    description: '小镇的核心区域，喷泉、公告板和居民聚会之地',
  },
  [RegionType.Blacksmith]: {
    type: RegionType.Blacksmith,
    name: '铁砧工坊',
    bounds: { x: 2, y: 2, w: 6, h: 5 },
    themeColor: 0x993333,
    description: '铁砧·锻的工坊，炉火不灭，锤声不绝',
  },
  [RegionType.Alchemist]: {
    type: RegionType.Alchemist,
    name: '魔法药剂店',
    bounds: { x: 22, y: 2, w: 6, h: 5 },
    themeColor: 0x663399,
    description: '玛格丽特的药剂店，瓶瓶罐罐散发着奇异光芒',
  },
  [RegionType.Tavern]: {
    type: RegionType.Tavern,
    name: '星光酒馆',
    bounds: { x: 22, y: 15, w: 6, h: 5 },
    themeColor: 0xcc8844,
    description: '老巴克的酒馆，美酒与传说的汇聚地',
  },
  [RegionType.Market]: {
    type: RegionType.Market,
    name: '集市',
    bounds: { x: 2, y: 15, w: 6, h: 5 },
    themeColor: 0xcc9933,
    description: '罗西的集市，来自各地的货物在此交易',
  },
  [RegionType.ElderHall]: {
    type: RegionType.ElderHall,
    name: '长老大厅',
    bounds: { x: 11, y: 2, w: 6, h: 4 },
    themeColor: 0x556677,
    description: '长老议事之所，小镇的权力中心',
  },
  [RegionType.Residential]: {
    type: RegionType.Residential,
    name: '住宅区',
    bounds: { x: 11, y: 16, w: 6, h: 4 },
    themeColor: 0x886644,
    description: '居民的生活区域，温馨的小屋排列其间',
  },
  [RegionType.TownGate]: {
    type: RegionType.TownGate,
    name: '城镇入口',
    bounds: { x: 10, y: 22, w: 10, h: 4 },
    themeColor: 0x665544,
    description: '小镇的南大门，通往外界的通道',
  },
  [RegionType.ForestEdge]: {
    type: RegionType.ForestEdge,
    name: '暗影森林边缘',
    bounds: { x: 0, y: 0, w: 4, h: 26 },
    themeColor: 0x1a3a1a,
    description: '森林的边缘，树木愈发浓密，光线渐暗',
  },
}
