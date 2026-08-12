// 星火小镇 — 经济平衡系统
// T3.3.4 初始价格表、收入/支出平衡调参

import { createLogger } from '../utils/index.js'

const logger = createLogger('EconomyBalance')

// =============================================
// 经济参数类型
// =============================================

/** 经济参数配置 */
export interface EconomyConfig {
  /** 星币初始值 */
  startingStarCoins: number
  /** 星币硬上限 */
  maxStarCoins: number
  /** 任务基础收入倍率 */
  questIncomeMultiplier: number
  /** 战斗基础收入倍率 */
  battleIncomeMultiplier: number
  /** 出售价格倍率（相对购买价） */
  sellPriceRatio: number
  /** 每日衰减率（通货膨胀控制） */
  dailyDecayRate: number
  /** 好感度折扣系数 */
  affectionDiscountRate: number
  /** 声望折扣系数 */
  reputationDiscountRate: number
  /** 物品价格浮动范围 (±%) */
  priceFluctuationPercent: number
}

/** 物品定价规则 */
export interface ItemPricingRule {
  /** 物品ID */
  itemId: string
  /** 基础购买价格 */
  baseBuyPrice: number
  /** 出售价格倍率（覆盖全局） */
  sellPriceOverride?: number
  /** 价格波动敏感度 (0-1) */
  volatility: number
  /** 供需系数 (1.0=正常, >1供不应求, <1供大于求) */
  supplyDemand: number
}

/** 收入来源定义 */
export interface IncomeSource {
  /** 来源类型 */
  type: 'quest' | 'battle' | 'trade' | 'gift' | 'system'
  /** 基础收入 */
  baseAmount: number
  /** 等级缩放 */
  levelScaling: number
}

/** 支出定义 */
export interface ExpenseDefinition {
  /** 支出类型 */
  type: 'purchase' | 'repair' | 'travel' | 'tribute' | 'system'
  /** 基础支出 */
  baseAmount: number
  /** 频率（游戏小时） */
  frequencyHours: number
}

// =============================================
// 默认经济配置
// =============================================

export const DEFAULT_ECONOMY_CONFIG: EconomyConfig = {
  startingStarCoins: 100,
  maxStarCoins: 99999,
  questIncomeMultiplier: 1.0,
  battleIncomeMultiplier: 0.6,
  sellPriceRatio: 0.4,
  dailyDecayRate: 0.0,
  affectionDiscountRate: 0.02,
  reputationDiscountRate: 0.03,
  priceFluctuationPercent: 10,
}

// =============================================
// 初始物品价格表
// =============================================

export const INITIAL_ITEM_PRICES: ItemPricingRule[] = [
  // ---- 武器类 ----
  { itemId: 'item_wooden_sword', baseBuyPrice: 30, volatility: 0.1, supplyDemand: 1.0 },
  { itemId: 'item_iron_sword', baseBuyPrice: 80, volatility: 0.15, supplyDemand: 1.0 },
  { itemId: 'item_steel_sword', baseBuyPrice: 200, volatility: 0.2, supplyDemand: 0.9 },
  { itemId: 'item_enchanted_blade', baseBuyPrice: 500, volatility: 0.25, supplyDemand: 0.8 },
  { itemId: 'item_elf_bow', baseBuyPrice: 150, volatility: 0.2, supplyDemand: 0.85 },
  { itemId: 'item_shadow_dagger', baseBuyPrice: 120, volatility: 0.15, supplyDemand: 1.1 },

  // ---- 防具类 ----
  { itemId: 'item_leather_armor', baseBuyPrice: 40, volatility: 0.1, supplyDemand: 1.0 },
  { itemId: 'item_chain_mail', baseBuyPrice: 100, volatility: 0.15, supplyDemand: 1.0 },
  { itemId: 'item_plate_armor', baseBuyPrice: 250, volatility: 0.2, supplyDemand: 0.9 },
  { itemId: 'item_enchanted_shield', baseBuyPrice: 180, volatility: 0.15, supplyDemand: 0.85 },

  // ---- 消耗品类 ----
  { itemId: 'item_health_potion', baseBuyPrice: 10, volatility: 0.05, supplyDemand: 1.5 },
  { itemId: 'item_mana_potion', baseBuyPrice: 15, volatility: 0.05, supplyDemand: 1.2 },
  { itemId: 'item_antidote', baseBuyPrice: 8, volatility: 0.05, supplyDemand: 1.0 },
  { itemId: 'item_strength_elixir', baseBuyPrice: 50, volatility: 0.1, supplyDemand: 0.8 },
  { itemId: 'item_purification_crystal', baseBuyPrice: 60, volatility: 0.15, supplyDemand: 0.7 },

  // ---- 材料类 ----
  { itemId: 'item_iron_ore', baseBuyPrice: 5, volatility: 0.2, supplyDemand: 1.2 },
  { itemId: 'item_mana_crystal', baseBuyPrice: 25, volatility: 0.15, supplyDemand: 0.9 },
  { itemId: 'item_wood', baseBuyPrice: 3, volatility: 0.1, supplyDemand: 1.5 },
  { itemId: 'item_herb', baseBuyPrice: 4, volatility: 0.1, supplyDemand: 1.3 },
  { itemId: 'item_fabric', baseBuyPrice: 6, volatility: 0.1, supplyDemand: 1.0 },

  // ---- 任务物品（不可购买但有参考价格） ----
  { itemId: 'item_elf_amulet', baseBuyPrice: 300, sellPriceOverride: 0, volatility: 0, supplyDemand: 0 },
  { itemId: 'item_staff_fragment_map', baseBuyPrice: 500, sellPriceOverride: 0, volatility: 0, supplyDemand: 0 },
  { itemId: 'item_spark_trophy', baseBuyPrice: 1000, sellPriceOverride: 0, volatility: 0, supplyDemand: 0 },
]

// =============================================
// 收入来源定义
// =============================================

export const INCOME_SOURCES: Record<string, IncomeSource> = {
  // ---- 任务收入 ----
  'quest_main': { type: 'quest', baseAmount: 80, levelScaling: 1.5 },
  'quest_side': { type: 'quest', baseAmount: 40, levelScaling: 1.2 },
  'quest_daily': { type: 'quest', baseAmount: 20, levelScaling: 1.0 },
  'quest_emergent': { type: 'quest', baseAmount: 30, levelScaling: 1.1 },
  'quest_hidden': { type: 'quest', baseAmount: 100, levelScaling: 1.8 },

  // ---- 战斗收入 ----
  'battle_normal': { type: 'battle', baseAmount: 5, levelScaling: 1.0 },
  'battle_elite': { type: 'battle', baseAmount: 15, levelScaling: 1.3 },
  'battle_boss': { type: 'battle', baseAmount: 50, levelScaling: 1.5 },

  // ---- 交易收入 ----
  'trade_sell': { type: 'trade', baseAmount: 0, levelScaling: 0 },
  'trade_profit': { type: 'trade', baseAmount: 10, levelScaling: 0.5 },

  // ---- 系统赠送 ----
  'gift_npc': { type: 'gift', baseAmount: 0, levelScaling: 0 },
  'gift_system': { type: 'system', baseAmount: 50, levelScaling: 0 },
}

// =============================================
// 支出定义
// =============================================

export const EXPENSE_DEFINITIONS: ExpenseDefinition[] = [
  { type: 'purchase', baseAmount: 50, frequencyHours: 0 },
  { type: 'repair', baseAmount: 20, frequencyHours: 48 },
  { type: 'travel', baseAmount: 5, frequencyHours: 24 },
]

// =============================================
// 经济平衡引擎
// =============================================

class EconomyBalanceEngine {
  private config: EconomyConfig
  private priceTable: Map<string, ItemPricingRule> = new Map()
  private priceFluctuations: Map<string, number> = new Map() // 当前价格波动
  private lastFluctuationTime = 0

  constructor(config?: EconomyConfig) {
    this.config = config ?? DEFAULT_ECONOMY_CONFIG
    this.loadPriceTable()
  }

  /** 加载价格表 */
  private loadPriceTable(): void {
    for (const rule of INITIAL_ITEM_PRICES) {
      this.priceTable.set(rule.itemId, rule)
    }
    void this.lastFluctuationTime
    logger.info(`Loaded ${INITIAL_ITEM_PRICES.length} item pricing rules`)
  }

  /**
   * 获取物品购买价格（含波动和折扣）
   */
  getBuyPrice(
    itemId: string,
    affectionLevel: number = 0,
    reputationLevel: number = 0,
  ): number {
    const rule = this.priceTable.get(itemId)
    if (!rule || rule.baseBuyPrice === 0) return 0

    let price = rule.baseBuyPrice

    // 供需调整
    price *= rule.supplyDemand

    // 价格波动
    const fluctuation = this.priceFluctuations.get(itemId) ?? 0
    price *= (1 + fluctuation)

    // 好感度折扣
    const affectionDiscount = affectionLevel * this.config.affectionDiscountRate
    price *= (1 - affectionDiscount)

    // 声望折扣
    const reputationDiscount = reputationLevel * this.config.reputationDiscountRate
    price *= (1 - reputationDiscount)

    return Math.max(1, Math.round(price))
  }

  /**
   * 获取物品出售价格
   */
  getSellPrice(itemId: string): number {
    const rule = this.priceTable.get(itemId)
    if (!rule) return 0

    // 如果有覆盖的出售倍率
    if (rule.sellPriceOverride !== undefined) {
      return rule.sellPriceOverride
    }

    return Math.max(1, Math.round(rule.baseBuyPrice * this.config.sellPriceRatio))
  }

  /**
   * 更新价格波动（每个游戏日调用一次）
   */
  updatePriceFluctuations(): void {
    for (const [itemId, rule] of this.priceTable) {
      if (rule.volatility <= 0) continue

      // 随机波动
      const range = this.config.priceFluctuationPercent / 100
      const change = (Math.random() * 2 - 1) * range * rule.volatility
      const currentFluctuation = this.priceFluctuations.get(itemId) ?? 0
      // 均值回归 + 随机波动
      const newFluctuation = currentFluctuation * 0.7 + change * 0.3
      this.priceFluctuations.set(itemId, newFluctuation)
    }
    this.lastFluctuationTime = Date.now()
  }

  /**
   * 计算任务收入
   */
  calculateQuestIncome(questType: string, playerLevel: number): number {
    const source = INCOME_SOURCES[`quest_${questType}`]
    if (!source) return Math.round(20 * playerLevel * this.config.questIncomeMultiplier)

    const income = source.baseAmount + source.levelScaling * playerLevel
    return Math.round(income * this.config.questIncomeMultiplier)
  }

  /**
   * 计算战斗收入
   */
  calculateBattleIncome(enemyType: 'normal' | 'elite' | 'boss', enemyLevel: number): number {
    const source = INCOME_SOURCES[`battle_${enemyType}`]
    if (!source) return Math.round(3 * enemyLevel * this.config.battleIncomeMultiplier)

    const income = source.baseAmount + source.levelScaling * enemyLevel
    return Math.round(income * this.config.battleIncomeMultiplier)
  }

  /**
   * 经济健康度评估
   */
  assessEconomyHealth(
    totalPlayerStarCoins: number,
    avgPlayerLevel: number,
    totalItemsTraded: number,
  ): {
    score: number // 0-100
    status: 'healthy' | 'inflation' | 'deflation' | 'stagnant'
    recommendations: string[]
  } {
    const expectedWealth = avgPlayerLevel * 150 // 预期财富
    const wealthRatio = totalPlayerStarCoins / Math.max(1, expectedWealth)

    const recommendations: string[] = []
    let score = 50

    if (wealthRatio > 2.0) {
      score = 30
      recommendations.push('玩家财富过高，建议增加高价值物品或消费渠道')
      return { score, status: 'inflation', recommendations }
    } else if (wealthRatio > 1.5) {
      score = 40
      recommendations.push('玩家财富偏高，注意通胀风险')
    } else if (wealthRatio < 0.3) {
      score = 30
      recommendations.push('玩家财富不足，建议增加任务奖励或降低物品价格')
      return { score, status: 'deflation', recommendations }
    } else if (wealthRatio < 0.5) {
      score = 40
      recommendations.push('玩家财富偏低，关注经济平衡')
    }

    if (totalItemsTraded < 5) {
      score = Math.max(score - 10, 10)
      recommendations.push('交易活跃度低，建议增加物品种类或降低价格')
    }

    if (recommendations.length === 0) {
      recommendations.push('经济运行正常，保持当前参数')
    }

    const status = score >= 60 ? 'healthy' : score >= 40 ? 'stagnant' : wealthRatio > 1.5 ? 'inflation' : 'deflation'
    return { score, status, recommendations }
  }

  /**
   * 获取完整价格表
   */
  getPriceTable(): ItemPricingRule[] {
    return INITIAL_ITEM_PRICES
  }

  /**
   * 获取经济配置
   */
  getConfig(): EconomyConfig {
    return { ...this.config }
  }

  /**
   * 更新经济配置
   */
  updateConfig(partial: Partial<EconomyConfig>): void {
    this.config = { ...this.config, ...partial }
    logger.info('Economy config updated')
  }
}

/** 经济平衡引擎单例 */
export const economyBalance = new EconomyBalanceEngine()
