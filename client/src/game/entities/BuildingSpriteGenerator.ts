// 星火小镇 — 建筑细节精灵
// T4.4.1 9大区域建筑外观细化
//
// 程序化生成像素风建筑精灵纹理，每个区域的建筑有独特外观

import Phaser from 'phaser'

// =============================================
// 区域建筑定义
// =============================================

/** 建筑类型 */
export type BuildingType =
  | 'town_hall'      // 城镇大厅
  | 'market_stall'   // 集市摊位
  | 'house'          // 民居
  | 'forge'          // 铁匠铺
  | 'tavern'         // 酒馆
  | 'shrine'         // 神龛/小祭坛
  | 'ruin_pillar'    // 遗迹石柱
  | 'ruin_arch'      // 遗迹拱门
  | 'sacred_tree'    // 圣树

/** 建筑外观配置 */
export interface BuildingConfig {
  /** 建筑类型 */
  type: BuildingType
  /** 宽度（像素） */
  width: number
  /** 高度（像素） */
  height: number
  /** 主色调 */
  primaryColor: number
  /** 屋顶颜色 */
  roofColor: number
  /** 装饰颜色 */
  accentColor: number
  /** 门窗颜色 */
  detailColor: number
  /** 建筑名 */
  name: string
}

// =============================================
// 9大区域建筑配置
// =============================================

/** 小镇中心建筑 */
export const TOWN_CENTER_BUILDINGS: BuildingConfig[] = [
  {
    type: 'town_hall',
    width: 48,
    height: 40,
    primaryColor: 0xc9a86a,  // 石墙色
    roofColor: 0x8b4513,     // 深棕屋顶
    accentColor: 0xdaa520,   // 金色装饰
    detailColor: 0x4a3728,   // 深棕门窗
    name: '城镇大厅',
  },
  {
    type: 'house',
    width: 32,
    height: 28,
    primaryColor: 0xe8d5b7,   // 米色墙
    roofColor: 0xa0522d,     // 赭色屋顶
    accentColor: 0xffd700,   // 窗户灯光
    detailColor: 0x5c4033,   // 棕色门
    name: '民居',
  },
]

/** 集市建筑 */
export const MARKET_BUILDINGS: BuildingConfig[] = [
  {
    type: 'market_stall',
    width: 24,
    height: 20,
    primaryColor: 0x8b4513,   // 木质框架
    roofColor: 0x2e8b57,      // 绿色帐篷顶
    accentColor: 0xff6347,    // 红色装饰
    detailColor: 0xdaa520,    // 金色摆设
    name: '集市摊位',
  },
  {
    type: 'market_stall',
    width: 24,
    height: 20,
    primaryColor: 0x8b4513,
    roofColor: 0xcd5c5c,      // 红色帐篷顶
    accentColor: 0xffd700,
    detailColor: 0x9370db,    // 紫色摆设
    name: '杂货摊',
  },
]

/** 居民区建筑 */
export const RESIDENTIAL_BUILDINGS: BuildingConfig[] = [
  {
    type: 'house',
    width: 32,
    height: 28,
    primaryColor: 0xe8d5b7,
    roofColor: 0x6b4226,      // 深棕屋顶
    accentColor: 0xffd700,
    detailColor: 0x5c4033,
    name: '民居',
  },
  {
    type: 'house',
    width: 28,
    height: 24,
    primaryColor: 0xd4c4a8,  // 灰色墙
    roofColor: 0x8b4513,
    accentColor: 0x87ceeb,   // 蓝色窗
    detailColor: 0x4a3728,
    name: '小屋',
  },
]

/** 铁匠铺建筑 */
export const FORGE_BUILDINGS: BuildingConfig[] = [
  {
    type: 'forge',
    width: 40,
    height: 36,
    primaryColor: 0x5c4033,   // 深色石墙
    roofColor: 0x2f2f2f,     // 黑色屋顶
    accentColor: 0xff4500,   // 火焰橙
    detailColor: 0x8b0000,   // 暗红门
    name: '铁匠铺',
  },
]

/** 酒馆建筑 */
export const TAVERN_BUILDINGS: BuildingConfig[] = [
  {
    type: 'tavern',
    width: 44,
    height: 38,
    primaryColor: 0x8b4513,   // 木质墙
    roofColor: 0x556b2f,     // 暗绿屋顶
    accentColor: 0xffd700,   // 金色招牌
    detailColor: 0xff8c00,   // 橙色窗灯
    name: '星火酒馆',
  },
]

/** 森林边缘建筑 */
export const FOREST_EDGE_BUILDINGS: BuildingConfig[] = [
  {
    type: 'shrine',
    width: 20,
    height: 24,
    primaryColor: 0x696969,  // 灰色石
    roofColor: 0x2f4f4f,     // 深灰顶
    accentColor: 0x9370db,   // 紫色灵光
    detailColor: 0x228b22,   // 绿色苔藓
    name: '路边神龛',
  },
]

/** 森林深处建筑 */
export const DEEP_FOREST_BUILDINGS: BuildingConfig[] = [
  {
    type: 'ruin_pillar',
    width: 16,
    height: 40,
    primaryColor: 0x696969,
    roofColor: 0x2f4f4f,
    accentColor: 0x4169e1,  // 蓝色魔法纹
    detailColor: 0x228b22,
    name: '古老石柱',
  },
  {
    type: 'ruin_arch',
    width: 32,
    height: 36,
    primaryColor: 0x696969,
    roofColor: 0x2f4f4f,
    accentColor: 0x9370db,
    detailColor: 0x228b22,
    name: '遗迹拱门',
  },
]

/** 古代遗迹建筑 */
export const ANCIENT_RUINS_BUILDINGS: BuildingConfig[] = [
  {
    type: 'ruin_pillar',
    width: 20,
    height: 48,
    primaryColor: 0x808080,   // 灰白石
    roofColor: 0xa9a9a9,
    accentColor: 0x4169e1,    // 蓝色封印纹
    detailColor: 0x9370db,    // 紫色魔法
    name: '精灵石柱',
  },
  {
    type: 'ruin_arch',
    width: 48,
    height: 44,
    primaryColor: 0x808080,
    roofColor: 0xa9a9a9,
    accentColor: 0x9370db,
    detailColor: 0x4169e1,
    name: '封印拱门',
  },
]

/** 圣林建筑 */
export const SACRED_GROVE_BUILDINGS: BuildingConfig[] = [
  {
    type: 'sacred_tree',
    width: 64,
    height: 80,
    primaryColor: 0x556b2f,   // 深绿树干
    roofColor: 0x90ee90,     // 亮绿树冠
    accentColor: 0xc0c0c0,   // 银色光点
    detailColor: 0xffd700,   // 金色果实
    name: '生命之树',
  },
  {
    type: 'shrine',
    width: 24,
    height: 28,
    primaryColor: 0xe0e0e0,   // 白色石
    roofColor: 0xc0c0c0,
    accentColor: 0x90ee90,    // 绿色灵光
    detailColor: 0xffd700,
    name: '精灵祭坛',
  },
]

/** 全部区域建筑配置映射 */
export const ALL_AREA_BUILDINGS: Record<string, BuildingConfig[]> = {
  town_center: TOWN_CENTER_BUILDINGS,
  market: MARKET_BUILDINGS,
  residential: RESIDENTIAL_BUILDINGS,
  forge: FORGE_BUILDINGS,
  tavern: TAVERN_BUILDINGS,
  forest_edge: FOREST_EDGE_BUILDINGS,
  deep_forest: DEEP_FOREST_BUILDINGS,
  ancient_ruins: ANCIENT_RUINS_BUILDINGS,
  sacred_grove: SACRED_GROVE_BUILDINGS,
}

// =============================================
// 建筑精灵生成器
// =============================================

/**
 * BuildingSpriteGenerator — 程序化生成建筑精灵纹理
 *
 * 为每个建筑类型生成独特的像素风纹理：
 * - 墙壁、屋顶、门窗分层绘制
 * - 装饰细节（旗帜、灯笼、苔藓等）
 * - 魔法光效（遗迹/圣林类建筑）
 */
export class BuildingSpriteGenerator {
  private scene: Phaser.Scene

  constructor(scene: Phaser.Scene) {
    this.scene = scene
  }

  /**
   * 生成建筑纹理
   */
  generateBuildingTexture(config: BuildingConfig): Phaser.Textures.Texture {
    const key = `building_${config.type}_${config.width}x${config.height}`

    // 如果纹理已存在则直接返回
    if (this.scene.textures.exists(key)) {
      return this.scene.textures.get(key)
    }

    const texture = this.scene.textures.createCanvas(key, config.width, config.height)
    if (!texture) {
      throw new Error(`Failed to create texture: ${key}`)
    }

    const ctx = texture.getContext()
    if (!ctx) {
      throw new Error(`Failed to get canvas context: ${key}`)
    }

    // 根据建筑类型绘制
    switch (config.type) {
      case 'town_hall':
        this.drawTownHall(ctx, config)
        break
      case 'market_stall':
        this.drawMarketStall(ctx, config)
        break
      case 'house':
        this.drawHouse(ctx, config)
        break
      case 'forge':
        this.drawForge(ctx, config)
        break
      case 'tavern':
        this.drawTavern(ctx, config)
        break
      case 'shrine':
        this.drawShrine(ctx, config)
        break
      case 'ruin_pillar':
        this.drawRuinPillar(ctx, config)
        break
      case 'ruin_arch':
        this.drawRuinArch(ctx, config)
        break
      case 'sacred_tree':
        this.drawSacredTree(ctx, config)
        break
    }

    texture.refresh()
    return this.scene.textures.get(key)
  }

  // =============================================
  // 各类建筑绘制
  // =============================================

  /** 城镇大厅 */
  private drawTownHall(ctx: CanvasRenderingContext2D, c: BuildingConfig): void {
    // 墙体
    ctx.fillStyle = this.toHex(c.primaryColor)
    ctx.fillRect(2, c.height * 0.4, c.width - 4, c.height * 0.6 - 2)

    // 屋顶（三角形）
    ctx.fillStyle = this.toHex(c.roofColor)
    ctx.beginPath()
    ctx.moveTo(0, c.height * 0.45)
    ctx.lineTo(c.width / 2, 0)
    ctx.lineTo(c.width, c.height * 0.45)
    ctx.closePath()
    ctx.fill()

    // 金色装饰条
    ctx.fillStyle = this.toHex(c.accentColor)
    ctx.fillRect(2, c.height * 0.42, c.width - 4, 2)

    // 大门
    ctx.fillStyle = this.toHex(c.detailColor)
    ctx.fillRect(c.width / 2 - 4, c.height * 0.65, 8, c.height * 0.35)

    // 窗户
    ctx.fillStyle = this.toHex(c.accentColor)
    ctx.fillRect(6, c.height * 0.5, 4, 4)
    ctx.fillRect(c.width - 10, c.height * 0.5, 4, 4)

    // 旗杆和旗帜
    ctx.fillStyle = '#888888'
    ctx.fillRect(c.width / 2 - 1, 0, 2, 6)
    ctx.fillStyle = this.toHex(c.accentColor)
    ctx.fillRect(c.width / 2 + 1, 1, 4, 3)
  }

  /** 集市摊位 */
  private drawMarketStall(ctx: CanvasRenderingContext2D, c: BuildingConfig): void {
    // 木质框架
    ctx.fillStyle = this.toHex(c.primaryColor)
    ctx.fillRect(0, c.height * 0.5, c.width, 4)
    ctx.fillRect(0, c.height * 0.5, 2, c.height * 0.5)
    ctx.fillRect(c.width - 2, c.height * 0.5, 2, c.height * 0.5)

    // 帐篷顶（三角形）
    ctx.fillStyle = this.toHex(c.roofColor)
    ctx.beginPath()
    ctx.moveTo(-2, c.height * 0.55)
    ctx.lineTo(c.width / 2, 0)
    ctx.lineTo(c.width + 2, c.height * 0.55)
    ctx.closePath()
    ctx.fill()

    // 帐篷条纹
    ctx.strokeStyle = this.toHex(c.accentColor)
    ctx.lineWidth = 1
    for (let i = 0; i < 4; i++) {
      const x = (c.width / 4) * i
      ctx.beginPath()
      ctx.moveTo(x, c.height * 0.5)
      ctx.lineTo(x + 2, 0)
      ctx.stroke()
    }

    // 摆设
    ctx.fillStyle = this.toHex(c.detailColor)
    ctx.fillRect(4, c.height * 0.65, 4, 4)
    ctx.fillRect(c.width - 8, c.height * 0.65, 4, 4)
  }

  /** 民居 */
  private drawHouse(ctx: CanvasRenderingContext2D, c: BuildingConfig): void {
    // 墙体
    ctx.fillStyle = this.toHex(c.primaryColor)
    ctx.fillRect(2, c.height * 0.4, c.width - 4, c.height * 0.6 - 2)

    // 屋顶
    ctx.fillStyle = this.toHex(c.roofColor)
    ctx.beginPath()
    ctx.moveTo(0, c.height * 0.45)
    ctx.lineTo(c.width / 2, 0)
    ctx.lineTo(c.width, c.height * 0.45)
    ctx.closePath()
    ctx.fill()

    // 门
    ctx.fillStyle = this.toHex(c.detailColor)
    ctx.fillRect(c.width / 2 - 3, c.height * 0.62, 6, c.height * 0.38)

    // 窗户（带灯光）
    ctx.fillStyle = this.toHex(c.accentColor)
    ctx.fillRect(4, c.height * 0.5, 4, 4)
    ctx.fillRect(c.width - 8, c.height * 0.5, 4, 4)

    // 烟囱
    ctx.fillStyle = this.toHex(c.detailColor)
    ctx.fillRect(c.width * 0.7, 2, 3, 6)
  }

  /** 铁匠铺 */
  private drawForge(ctx: CanvasRenderingContext2D, c: BuildingConfig): void {
    // 石墙
    ctx.fillStyle = this.toHex(c.primaryColor)
    ctx.fillRect(2, c.height * 0.35, c.width - 4, c.height * 0.65 - 2)

    // 黑色屋顶
    ctx.fillStyle = this.toHex(c.roofColor)
    ctx.beginPath()
    ctx.moveTo(0, c.height * 0.4)
    ctx.lineTo(c.width / 2, 0)
    ctx.lineTo(c.width, c.height * 0.4)
    ctx.closePath()
    ctx.fill()

    // 熔炉入口（火焰光）
    ctx.fillStyle = this.toHex(c.accentColor)
    ctx.fillRect(c.width / 2 - 5, c.height * 0.5, 10, 8)

    // 火焰效果
    ctx.fillStyle = '#ffff00'
    ctx.fillRect(c.width / 2 - 3, c.height * 0.52, 6, 4)

    // 铁砧标志
    ctx.fillStyle = this.toHex(c.detailColor)
    ctx.fillRect(4, c.height * 0.7, 4, 2)
    ctx.fillRect(5, c.height * 0.68, 2, 4)

    // 烟囱
    ctx.fillStyle = this.toHex(c.detailColor)
    ctx.fillRect(c.width * 0.7, 0, 4, 10)
    ctx.fillStyle = 'rgba(100,100,100,0.5)'
    ctx.fillRect(c.width * 0.7, 0, 4, 4)
  }

  /** 酒馆 */
  private drawTavern(ctx: CanvasRenderingContext2D, c: BuildingConfig): void {
    // 木墙
    ctx.fillStyle = this.toHex(c.primaryColor)
    ctx.fillRect(2, c.height * 0.4, c.width - 4, c.height * 0.6 - 2)

    // 木板纹理
    ctx.strokeStyle = 'rgba(0,0,0,0.2)'
    ctx.lineWidth = 1
    for (let i = 0; i < 4; i++) {
      const x = (c.width / 4) * (i + 1)
      ctx.beginPath()
      ctx.moveTo(x, c.height * 0.4)
      ctx.lineTo(x, c.height - 2)
      ctx.stroke()
    }

    // 屋顶
    ctx.fillStyle = this.toHex(c.roofColor)
    ctx.beginPath()
    ctx.moveTo(0, c.height * 0.45)
    ctx.lineTo(c.width / 2, 0)
    ctx.lineTo(c.width, c.height * 0.45)
    ctx.closePath()
    ctx.fill()

    // 金色招牌
    ctx.fillStyle = this.toHex(c.accentColor)
    ctx.fillRect(c.width / 2 - 6, c.height * 0.3, 12, 4)

    // 门
    ctx.fillStyle = this.toHex(c.detailColor)
    ctx.fillRect(c.width / 2 - 3, c.height * 0.62, 6, c.height * 0.38)

    // 窗户（暖色灯光）
    ctx.fillStyle = this.toHex(c.detailColor)
    ctx.fillRect(4, c.height * 0.5, 5, 5)
    ctx.fillRect(c.width - 9, c.height * 0.5, 5, 5)
  }

  /** 神龛 */
  private drawShrine(ctx: CanvasRenderingContext2D, c: BuildingConfig): void {
    // 石台
    ctx.fillStyle = this.toHex(c.primaryColor)
    ctx.fillRect(2, c.height * 0.6, c.width - 4, c.height * 0.4 - 2)

    // 尖顶
    ctx.fillStyle = this.toHex(c.roofColor)
    ctx.beginPath()
    ctx.moveTo(0, c.height * 0.65)
    ctx.lineTo(c.width / 2, 0)
    ctx.lineTo(c.width, c.height * 0.65)
    ctx.closePath()
    ctx.fill()

    // 紫色灵光
    ctx.fillStyle = this.toHex(c.accentColor)
    ctx.globalAlpha = 0.6
    ctx.beginPath()
    ctx.arc(c.width / 2, c.height * 0.45, 3, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = 1.0

    // 苔藓装饰
    ctx.fillStyle = this.toHex(c.detailColor)
    ctx.fillRect(2, c.height * 0.6, 3, 2)
    ctx.fillRect(c.width - 5, c.height * 0.6, 3, 2)
  }

  /** 遗迹石柱 */
  private drawRuinPillar(ctx: CanvasRenderingContext2D, c: BuildingConfig): void {
    // 石柱主体
    ctx.fillStyle = this.toHex(c.primaryColor)
    ctx.fillRect(c.width * 0.25, 0, c.width * 0.5, c.height)

    // 柱头
    ctx.fillRect(c.width * 0.15, 0, c.width * 0.7, 4)
    // 柱基
    ctx.fillRect(c.width * 0.1, c.height - 6, c.width * 0.8, 6)

    // 蓝色魔法纹路
    ctx.fillStyle = this.toHex(c.accentColor)
    ctx.fillRect(c.width * 0.25, c.height * 0.2, c.width * 0.5, 1)
    ctx.fillRect(c.width * 0.25, c.height * 0.5, c.width * 0.5, 1)
    ctx.fillRect(c.width * 0.25, c.height * 0.8, c.width * 0.5, 1)

    // 裂纹
    ctx.strokeStyle = 'rgba(0,0,0,0.3)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(c.width * 0.4, 5)
    ctx.lineTo(c.width * 0.45, c.height * 0.3)
    ctx.lineTo(c.width * 0.38, c.height * 0.6)
    ctx.stroke()

    // 苔藓
    ctx.fillStyle = this.toHex(c.detailColor)
    ctx.fillRect(c.width * 0.25, c.height - 8, 3, 3)
    ctx.fillRect(c.width * 0.7, c.height - 10, 3, 3)
  }

  /** 遗迹拱门 */
  private drawRuinArch(ctx: CanvasRenderingContext2D, c: BuildingConfig): void {
    // 左柱
    ctx.fillStyle = this.toHex(c.primaryColor)
    ctx.fillRect(0, c.height * 0.3, c.width * 0.2, c.height * 0.7)

    // 右柱
    ctx.fillRect(c.width * 0.8, c.height * 0.3, c.width * 0.2, c.height * 0.7)

    // 拱顶
    ctx.beginPath()
    ctx.arc(c.width / 2, c.height * 0.3, c.width * 0.4, Math.PI, 0)
    ctx.fill()

    // 紫色魔法光效
    ctx.fillStyle = this.toHex(c.accentColor)
    ctx.globalAlpha = 0.5
    ctx.beginPath()
    ctx.arc(c.width / 2, c.height * 0.3, c.width * 0.35, Math.PI, 0)
    ctx.fill()
    ctx.globalAlpha = 1.0

    // 中心蓝色封印纹
    ctx.fillStyle = this.toHex(c.detailColor)
    ctx.globalAlpha = 0.7
    ctx.fillRect(c.width / 2 - 1, c.height * 0.15, 2, 8)
    ctx.fillRect(c.width / 2 - 4, c.height * 0.18, 8, 2)
    ctx.globalAlpha = 1.0

    // 地面苔藓
    ctx.fillStyle = this.toHex(c.detailColor)
    ctx.fillRect(0, c.height - 3, c.width * 0.2, 3)
    ctx.fillRect(c.width * 0.8, c.height - 3, c.width * 0.2, 3)
  }

  /** 生命之树 */
  private drawSacredTree(ctx: CanvasRenderingContext2D, c: BuildingConfig): void {
    // 树干
    ctx.fillStyle = this.toHex(c.primaryColor)
    ctx.fillRect(c.width * 0.4, c.height * 0.4, c.width * 0.2, c.height * 0.6)

    // 树根
    ctx.fillRect(c.width * 0.2, c.height - 4, c.width * 0.6, 4)
    ctx.fillRect(c.width * 0.1, c.height - 6, c.width * 0.8, 2)

    // 树冠（多层圆形）
    ctx.fillStyle = this.toHex(c.roofColor)
    ctx.beginPath()
    ctx.arc(c.width / 2, c.height * 0.3, c.width * 0.45, 0, Math.PI * 2)
    ctx.fill()

    ctx.beginPath()
    ctx.arc(c.width * 0.3, c.height * 0.2, c.width * 0.25, 0, Math.PI * 2)
    ctx.fill()

    ctx.beginPath()
    ctx.arc(c.width * 0.7, c.height * 0.2, c.width * 0.25, 0, Math.PI * 2)
    ctx.fill()

    // 银色光点
    ctx.fillStyle = this.toHex(c.accentColor)
    ctx.globalAlpha = 0.8
    for (let i = 0; i < 8; i++) {
      const angle = (Math.PI * 2 * i) / 8
      const r = c.width * 0.3
      const x = c.width / 2 + Math.cos(angle) * r
      const y = c.height * 0.3 + Math.sin(angle) * r
      ctx.beginPath()
      ctx.arc(x, y, 1.5, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1.0

    // 金色果实
    ctx.fillStyle = this.toHex(c.detailColor)
    ctx.beginPath()
    ctx.arc(c.width * 0.35, c.height * 0.25, 2, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.arc(c.width * 0.65, c.height * 0.35, 2, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.arc(c.width * 0.5, c.height * 0.15, 2, 0, Math.PI * 2)
    ctx.fill()

    // 树干纹路
    ctx.strokeStyle = 'rgba(0,0,0,0.3)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(c.width * 0.45, c.height * 0.4)
    ctx.lineTo(c.width * 0.42, c.height * 0.9)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(c.width * 0.55, c.height * 0.4)
    ctx.lineTo(c.width * 0.58, c.height * 0.9)
    ctx.stroke()
  }

  // =============================================
  // 工具方法
  // =============================================

  /** 数值转十六进制颜色字符串 */
  private toHex(color: number): string {
    return '#' + color.toString(16).padStart(6, '0')
  }

  /**
   * 为指定区域生成所有建筑纹理
   */
  generateAreaBuildings(areaId: string): string[] {
    const configs = ALL_AREA_BUILDINGS[areaId]
    if (!configs) return []

    const keys: string[] = []
    for (const config of configs) {
      const texture = this.generateBuildingTexture(config)
      keys.push(texture.key)
    }

    return keys
  }

  /**
   * 生成全部区域的建筑纹理
   */
  generateAllBuildings(): Record<string, string[]> {
    const result: Record<string, string[]> = {}
    for (const areaId of Object.keys(ALL_AREA_BUILDINGS)) {
      result[areaId] = this.generateAreaBuildings(areaId)
    }
    return result
  }
}
