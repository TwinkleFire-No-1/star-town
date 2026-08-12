// 星火小镇 — 猫咪服务
// 需求：小镇有两只随机出现的猫咪（小橘/小狸花），不参与主线剧情，不加模型。
// 设计：
// - 猫咪不是数据库实体，不接入 Agent/LLM 链路（纯氛围）
// - id 统一使用 cat_ 前缀
// - 每个猫咪使用模型生成的专属美术资源（client/public/assets/sprites/cat/{assetId}.png）
// - spawnPoints：随机出生点（小镇可走区域），前端每过一段时间随机瞬移实现"随机出现"
// - 李鹭喂猫逻辑在前端 CatSystem 实现（随机间隔召唤猫咪进食）

export interface CatDef {
  id: string
  name: string
  title: string
  /** 美术资源别名（public/assets/sprites/cat/{assetId}.png，精灵表 256×64 = 4帧行走） */
  assetId: string
  /** 随机出生点（tile 坐标，小镇可走区域，避开河流/建筑） */
  spawnPoints: Array<{ x: number; y: number }>
  /** 漫游半径（tile） */
  roamRadius: number
  /** 移动速度（tile/秒） */
  speed: number
}

/** 猫咪前缀（前后端约定） */
export const CAT_PREFIX = 'cat_'

const cats: CatDef[] = [
  {
    id: 'cat_xiaoju',
    name: '小橘',
    title: '小镇橘猫',
    assetId: 'cat-xiaoju',
    spawnPoints: [
      { x: 10, y: 9 },
      { x: 19, y: 9 },
      { x: 8, y: 16 },
      { x: 21, y: 16 },
      { x: 13, y: 22 },
      { x: 17, y: 12 },
      { x: 10, y: 18 },
      { x: 18, y: 19 },
      { x: 14, y: 9 },
      { x: 7, y: 7 },
      { x: 22, y: 7 },
      { x: 13, y: 6 },
    ],
    roamRadius: 4,
    speed: 1.6,
  },
  {
    id: 'cat_xiaolihua',
    name: '小狸花',
    title: '小镇狸花猫',
    assetId: 'cat-xiaolihua',
    spawnPoints: [
      { x: 12, y: 17 },
      { x: 19, y: 15 },
      { x: 6, y: 9 },
      { x: 23, y: 9 },
      { x: 15, y: 22 },
      { x: 11, y: 12 },
      { x: 17, y: 12 },
      { x: 8, y: 8 },
      { x: 21, y: 8 },
      { x: 13, y: 11 },
      { x: 24, y: 20 },
      { x: 5, y: 11 },
    ],
    roamRadius: 4,
    speed: 1.7,
  },
]

class AmbientCatService {
  private catList: CatDef[] = cats

  /** 获取全部猫咪 */
  getAll(): CatDef[] {
    return this.catList
  }

  /** 按ID获取猫咪 */
  getById(id: string): CatDef | undefined {
    return this.catList.find((c) => c.id === id)
  }

  /** 判断是否为猫咪（cat_ 前缀） */
  isCat(id: string): boolean {
    return id.startsWith(CAT_PREFIX)
  }
}

/** 全局猫咪服务实例 */
export const ambientCatService = new AmbientCatService()
