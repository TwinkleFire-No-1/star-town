import { TileType } from './TileData'

/**
 * TileTextures — 瓦片美术资源映射表
 *
 * 每个瓦片类型对应一个外部 PNG 文件（位于 client/public/assets/tileset/）。
 * 规格：64×64 PNG（与 TILE_SIZE=64 原生 1:1 显示，1920×1080 下精细不放大）
 *
 * 接入规则：
 * - 代码优先尝试加载外部 PNG（assets/tileset/{file}）
 * - 加载成功 → 用外部图片生成 tile_{type} 纹理
 * - 加载失败/缺失 → 自动回退到程序化绘制（不崩溃、不空白）
 * - 放置新资源只需放入对应文件，无需改任何代码
 */
export interface TileTextureDef {
  /** TileType 枚举 */
  type: TileType
  /** 外部 PNG 文件名（放置于 assets/tileset/） */
  file: string
  /** 中文用途说明 */
  label: string
}

/** 瓦片尺寸基准（与 config.TILE_SIZE 一致） */
export const TILE_TEXTURE_SIZE = 64

/**
 * 全部瓦片映射表（51 种）
 * 命名规则：{区域}-{名称}.png，小写英文连字符
 */
export const TILE_TEXTURES: TileTextureDef[] = [
  // ============ 地面（8 种）============
  { type: TileType.Ground_Grass, file: 'ground-grass.png', label: '草地-基础地面' },
  { type: TileType.Ground_Dirt, file: 'ground-dirt.png', label: '泥地-土路/田垄' },
  { type: TileType.Ground_Stone, file: 'ground-stone.png', label: '石板路-广场/主干道' },
  { type: TileType.Ground_Wood, file: 'ground-wood.png', label: '木地板-室内地面' },
  { type: TileType.Ground_Water, file: 'ground-water.png', label: '水面-河流/水塘' },
  { type: TileType.Ground_Sand, file: 'ground-sand.png', label: '沙地-河滩/荒地' },
  { type: TileType.Ground_Bridge, file: 'ground-bridge.png', label: '木桥-过河通道' },
  { type: TileType.Ground_Path, file: 'ground-path.png', label: '小路-连接道路' },

  // ============ 墙壁与围栏（4 种）============
  { type: TileType.Wall_Stone, file: 'wall-stone.png', label: '石墙-石砌建筑外墙' },
  { type: TileType.Wall_Wood, file: 'wall-wood.png', label: '木墙-木质建筑外墙' },
  { type: TileType.Wall_Castle, file: 'wall-castle.png', label: '城堡墙-大厅/要塞' },
  { type: TileType.Fence_Wood, file: 'fence-wood.png', label: '木栅栏-城镇边界' },

  // ============ 建筑结构（5 种）============
  { type: TileType.Building_Door, file: 'building-door.png', label: '门-建筑出入口' },
  { type: TileType.Building_Window, file: 'building-window.png', label: '窗户-外墙开窗' },
  { type: TileType.Building_Roof, file: 'building-roof.png', label: '屋顶-建筑顶部' },
  { type: TileType.Building_Chimney, file: 'building-chimney.png', label: '烟囱-屋顶烟道' },
  { type: TileType.Building_Sign, file: 'building-sign.png', label: '招牌-店铺标识' },

  // ============ 户外装饰（18 种）============
  { type: TileType.Deco_Tree, file: 'deco-tree.png', label: '树木-森林/绿化' },
  { type: TileType.Deco_Flower, file: 'deco-flower.png', label: '花朵-花园点缀' },
  { type: TileType.Deco_Bush, file: 'deco-bush.png', label: '灌木-矮丛' },
  { type: TileType.Deco_Rock, file: 'deco-rock.png', label: '岩石-地表石块' },
  { type: TileType.Deco_Barrel, file: 'deco-barrel.png', label: '木桶-储藏容器' },
  { type: TileType.Deco_Crate, file: 'deco-crate.png', label: '木箱-货物' },
  { type: TileType.Deco_LampPost, file: 'deco-lamppost.png', label: '灯柱-道路照明' },
  { type: TileType.Deco_Well, file: 'deco-well.png', label: '水井-取水点' },
  { type: TileType.Deco_Fountain, file: 'deco-fountain.png', label: '喷泉-广场中心' },
  { type: TileType.Deco_Bench, file: 'deco-bench.png', label: '长椅-休憩座位' },
  { type: TileType.Deco_Anvil, file: 'deco-anvil.png', label: '铁砧-铁匠铺' },
  { type: TileType.Deco_Forge, file: 'deco-forge.png', label: '锻造炉-打铁熔炉' },
  { type: TileType.Deco_Bookshelf, file: 'deco-bookshelf.png', label: '书架-书籍存放' },
  { type: TileType.Deco_Counter, file: 'deco-counter.png', label: '柜台-店铺收银' },
  { type: TileType.Deco_Table, file: 'deco-table.png', label: '桌子-家具' },
  { type: TileType.Deco_Stove, file: 'deco-stove.png', label: '炉灶-烹饪' },
  { type: TileType.Deco_Garden, file: 'deco-garden.png', label: '花园-花圃' },
  { type: TileType.Deco_Signpost, file: 'deco-signpost.png', label: '路牌-道路指引' },

  // ============ 室内家具（16 种）============
  { type: TileType.Deco_Bed, file: 'deco-bed.png', label: '床-卧室休息' },
  { type: TileType.Deco_Cabinet, file: 'deco-cabinet.png', label: '柜子-收纳' },
  { type: TileType.Deco_Stairs, file: 'deco-stairs.png', label: '楼梯-上下层' },
  { type: TileType.Deco_Fireplace, file: 'deco-fireplace.png', label: '壁炉-取暖' },
  { type: TileType.Deco_Rug, file: 'deco-rug.png', label: '地毯-地面装饰' },
  { type: TileType.Deco_Chandelier, file: 'deco-chandelier.png', label: '吊灯-室内照明' },
  { type: TileType.Deco_Cauldron, file: 'deco-cauldron.png', label: '大锅-炼药/煮汤' },
  { type: TileType.Deco_Shelf, file: 'deco-shelf.png', label: '货架-货物陈列' },
  { type: TileType.Deco_Minecart, file: 'deco-minecart.png', label: '矿车-矿洞运输' },
  { type: TileType.Deco_OreVein, file: 'deco-orevein.png', label: '矿脉-矿洞资源' },
  { type: TileType.Deco_Torch, file: 'deco-torch.png', label: '火把-洞穴照明' },
  { type: TileType.Deco_FishBarrel, file: 'deco-fishbarrel.png', label: '鱼桶-渔获' },
  { type: TileType.Deco_Tapestry, file: 'deco-tapestry.png', label: '挂毯-墙面装饰' },
  { type: TileType.Deco_Plant, file: 'deco-plant.png', label: '盆栽-绿植' },
  { type: TileType.Deco_Bedroll, file: 'deco-bedroll.png', label: '睡袋-露营休息' },
  { type: TileType.Deco_Bar, file: 'deco-bar.png', label: '吧台-酒馆柜台' },
]

/** 按 TileType 快速索引 */
export const TILE_TEXTURE_BY_TYPE: Map<TileType, TileTextureDef> = new Map(
  TILE_TEXTURES.map((def) => [def.type, def]),
)

/** 生成外部图片加载 key（PreloadScene 加载用） */
export function tileImageKey(file: string): string {
  return `tile-img-${file.replace(/\.png$/i, '')}`
}
