// 星火小镇 — 物品服务层
// T3.3.1 物品数据模型、查询、分类

import { createLogger } from '../utils/index.js'
import { prisma } from '../models/prisma.js'

const logger = createLogger('ItemService')

// =============================================
// 类型定义
// =============================================

/** 物品分类 */
export type ItemCategory = 'weapon' | 'armor' | 'consumable' | 'material' | 'quest' | 'misc'

/** 物品分类标签 */
export const ITEM_CATEGORY_LABELS: Record<ItemCategory, string> = {
  weapon: '武器',
  armor: '防具',
  consumable: '消耗品',
  material: '材料',
  quest: '任务物品',
  misc: '杂项',
}

/** 物品分类图标 */
export const ITEM_CATEGORY_ICONS: Record<ItemCategory, string> = {
  weapon: 'sword',
  armor: 'shield',
  consumable: 'potion',
  material: 'gem',
  quest: 'scroll',
  misc: 'box',
}

/** 物品详情（从数据库读取后的完整信息） */
export interface ItemInfo {
  id: string
  name: string
  description: string
  category: ItemCategory
  attack: number
  defense: number
  healHp: number
  healSp: number
  buyPrice: number
  sellPrice: number
  stackable: boolean
  maxStack: number
  iconKey: string
}

/** 背包物品条目 */
export interface InventoryItem {
  id: string
  itemId: string
  name: string
  description: string
  category: ItemCategory
  quantity: number
  equipped: boolean
  attack: number
  defense: number
  healHp: number
  healSp: number
  buyPrice: number
  sellPrice: number
  stackable: boolean
  maxStack: number
}

// =============================================
// 物品服务
// =============================================

/**
 * ItemService — 物品数据管理
 *
 * 职责：
 * 1. 物品CRUD
 * 2. 按分类查询
 * 3. 可交易物品过滤（buyPrice > 0 的可购买，sellPrice > 0 的可出售）
 * 4. 背包查询（含物品详情）
 */
class ItemService {
  /** 是否已初始化 */
  private initialized = false

  /** 物品缓存 */
  private itemCache = new Map<string, ItemInfo>()

  /**
   * 初始化 — 从数据库加载所有物品到缓存
   */
  async initialize(): Promise<void> {
    if (this.initialized) return

    const items = await prisma.item.findMany()
    this.itemCache.clear()

    for (const item of items) {
      this.itemCache.set(item.id, {
        id: item.id,
        name: item.name,
        description: item.description,
        category: item.category as ItemCategory,
        attack: item.attack,
        defense: item.defense,
        healHp: item.healHp,
        healSp: item.healSp,
        buyPrice: item.buyPrice,
        sellPrice: item.sellPrice,
        stackable: item.stackable,
        maxStack: item.maxStack,
        iconKey: item.iconKey,
      })
    }

    this.initialized = true
    logger.info(`ItemService initialized: ${this.itemCache.size} items cached`)
  }

  /**
   * 获取所有物品
   */
  getAllItems(): ItemInfo[] {
    return Array.from(this.itemCache.values())
  }

  /**
   * 获取单个物品
   */
  getItem(itemId: string): ItemInfo | undefined {
    return this.itemCache.get(itemId)
  }

  /**
   * 按分类获取物品
   */
  getItemsByCategory(category: ItemCategory): ItemInfo[] {
    return Array.from(this.itemCache.values()).filter((i) => i.category === category)
  }

  /**
   * 获取可购买物品列表（buyPrice > 0）
   */
  getBuyableItems(): ItemInfo[] {
    return Array.from(this.itemCache.values()).filter((i) => i.buyPrice > 0)
  }

  /**
   * 获取可出售物品列表（sellPrice > 0）
   */
  getSellableItems(): ItemInfo[] {
    return Array.from(this.itemCache.values()).filter((i) => i.sellPrice > 0)
  }

  /**
   * 获取玩家背包
   */
  async getPlayerInventory(playerId: string): Promise<InventoryItem[]> {
    const playerItems = await prisma.playerItem.findMany({
      where: { playerId },
      include: { item: true },
    })

    return playerItems.map((pi) => ({
      id: pi.id,
      itemId: pi.itemId,
      name: pi.item.name,
      description: pi.item.description,
      category: pi.item.category as ItemCategory,
      quantity: pi.quantity,
      equipped: pi.equipped,
      attack: pi.item.attack,
      defense: pi.item.defense,
      healHp: pi.item.healHp,
      healSp: pi.item.healSp,
      buyPrice: pi.item.buyPrice,
      sellPrice: pi.item.sellPrice,
      stackable: pi.item.stackable,
      maxStack: pi.item.maxStack,
    }))
  }

  /**
   * 购买物品
   */
  async buyItem(playerId: string, itemId: string, quantity: number = 1): Promise<{ success: boolean; message: string }> {
    const item = this.itemCache.get(itemId)
    if (!item) return { success: false, message: '物品不存在' }

    if (item.buyPrice <= 0) return { success: false, message: '该物品不可购买' }

    const totalCost = item.buyPrice * quantity

    // 检查玩家星币
    const player = await prisma.player.findUnique({ where: { id: playerId } })
    if (!player) return { success: false, message: '玩家不存在' }

    if (player.starCoins < totalCost) {
      return { success: false, message: `星币不足（需要 ${totalCost}，当前 ${player.starCoins}）` }
    }

    // 检查堆叠上限
    if (!item.stackable && quantity > 1) {
      return { success: false, message: '该物品不可堆叠' }
    }

    // 扣除星币
    await prisma.player.update({
      where: { id: playerId },
      data: { starCoins: { decrement: totalCost } },
    })

    // 添加物品到背包
    if (item.stackable) {
      await prisma.playerItem.upsert({
        where: { playerId_itemId: { playerId, itemId } },
        create: { playerId, itemId, quantity },
        update: { quantity: { increment: quantity } },
      })
    } else {
      // 不可堆叠物品逐个添加
      for (let i = 0; i < quantity; i++) {
        await prisma.playerItem.create({
          data: { playerId, itemId, quantity: 1 },
        })
      }
    }

    logger.info(`Player ${playerId} bought ${quantity}x ${item.name} for ${totalCost} coins`)
    return { success: true, message: `购买了 ${quantity} 个 ${item.name}（花费 ${totalCost} 星币）` }
  }

  /**
   * 出售物品
   */
  async sellItem(playerId: string, itemId: string, quantity: number = 1): Promise<{ success: boolean; message: string }> {
    const item = this.itemCache.get(itemId)
    if (!item) return { success: false, message: '物品不存在' }

    if (item.sellPrice <= 0) return { success: false, message: '该物品不可出售' }

    // 检查背包
    const pi = await prisma.playerItem.findUnique({
      where: { playerId_itemId: { playerId, itemId } },
    })

    if (!pi || pi.quantity < quantity) {
      return { success: false, message: '背包中物品数量不足' }
    }

    const totalRevenue = item.sellPrice * quantity

    // 增加星币
    await prisma.player.update({
      where: { id: playerId },
      data: { starCoins: { increment: totalRevenue } },
    })

    // 减少物品数量
    if (pi.quantity === quantity) {
      await prisma.playerItem.delete({ where: { id: pi.id } })
    } else {
      await prisma.playerItem.update({
        where: { id: pi.id },
        data: { quantity: { decrement: quantity } },
      })
    }

    logger.info(`Player ${playerId} sold ${quantity}x ${item.name} for ${totalRevenue} coins`)
    return { success: true, message: `出售了 ${quantity} 个 ${item.name}（获得 ${totalRevenue} 星币）` }
  }

  /**
   * 使用消耗品
   */
  async useConsumable(playerId: string, itemId: string): Promise<{ success: boolean; message: string; healHp?: number; healSp?: number }> {
    const item = this.itemCache.get(itemId)
    if (!item) return { success: false, message: '物品不存在' }

    if (item.category !== 'consumable') {
      return { success: false, message: '该物品不可使用' }
    }

    // 检查背包
    const pi = await prisma.playerItem.findUnique({
      where: { playerId_itemId: { playerId, itemId } },
    })

    if (!pi || pi.quantity <= 0) {
      return { success: false, message: '背包中没有该物品' }
    }

    // 恢复HP/SP
    const player = await prisma.player.findUnique({ where: { id: playerId } })
    if (!player) return { success: false, message: '玩家不存在' }

    const newHp = Math.min(player.maxHp, player.hp + item.healHp)
    const newSp = Math.min(player.maxSp, player.sp + item.healSp)

    await prisma.player.update({
      where: { id: playerId },
      data: { hp: newHp, sp: newSp },
    })

    // 消耗物品
    if (pi.quantity === 1) {
      await prisma.playerItem.delete({ where: { id: pi.id } })
    } else {
      await prisma.playerItem.update({
        where: { id: pi.id },
        data: { quantity: { decrement: 1 } },
      })
    }

    logger.info(`Player ${playerId} used ${item.name} (HP+${item.healHp}, SP+${item.healSp})`)
    return {
      success: true,
      message: `使用了 ${item.name}`,
      healHp: item.healHp,
      healSp: item.healSp,
    }
  }

  /**
   * 装备/卸下装备
   */
  async toggleEquip(playerId: string, itemId: string): Promise<{ success: boolean; message: string; equipped: boolean }> {
    const pi = await prisma.playerItem.findUnique({
      where: { playerId_itemId: { playerId, itemId } },
      include: { item: true },
    })

    if (!pi) return { success: false, message: '背包中没有该物品', equipped: false }

    if (pi.item.category !== 'weapon' && pi.item.category !== 'armor') {
      return { success: false, message: '该物品不可装备', equipped: false }
    }

    const newEquipped = !pi.equipped

    // 如果要装备，先卸下同类型装备
    if (newEquipped) {
      const sameCategory = await prisma.playerItem.findMany({
        where: { playerId, equipped: true },
        include: { item: true },
      })

      for (const existing of sameCategory) {
        if (existing.item.category === pi.item.category && existing.id !== pi.id) {
          await prisma.playerItem.update({
            where: { id: existing.id },
            data: { equipped: false },
          })
        }
      }
    }

    await prisma.playerItem.update({
      where: { id: pi.id },
      data: { equipped: newEquipped },
    })

    // 更新玩家属性
    if (newEquipped) {
      await prisma.player.update({
        where: { id: playerId },
        data: {
          attack: { increment: pi.item.attack },
          defense: { increment: pi.item.defense },
        },
      })
    } else {
      await prisma.player.update({
        where: { id: playerId },
        data: {
          attack: { decrement: pi.item.attack },
          defense: { decrement: pi.item.defense },
        },
      })
    }

    return {
      success: true,
      message: newEquipped ? `装备了 ${pi.item.name}` : `卸下了 ${pi.item.name}`,
      equipped: newEquipped,
    }
  }

  /** 获取统计 */
  getStats() {
    return {
      totalItems: this.itemCache.size,
      initialized: this.initialized,
    }
  }

  /** 销毁 */
  destroy(): void {
    this.itemCache.clear()
    this.initialized = false
  }
}

/** 全局物品服务实例 */
export const itemService = new ItemService()
