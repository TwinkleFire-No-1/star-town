// 星火小镇 — 属性与伤害计算系统
// T3.4.3 HP/SP/攻击/防御/速度属性体系、伤害计算公式

// =============================================
// 角色属性体系
// =============================================

/** 角色属性定义 */
export interface CombatStats {
  /** 生命值 */
  hp: number
  /** 最大生命值 */
  maxHp: number
  /** 技能点（施放技能消耗） */
  sp: number
  /** 最大技能点 */
  maxSp: number
  /** 攻击力（物理伤害基础） */
  attack: number
  /** 防御力（物理减伤基础） */
  defense: number
  /** 速度（决定行动顺序与频率） */
  speed: number
  /** 暴击率（0-1） */
  critRate: number
  /** 暴击伤害倍率（1.0=无加成, 1.5=50%加成） */
  critDamage: number
  /** 闪避率（0-1） */
  dodgeRate: number
}

/** 属性修正器（buff/debuff来源） */
export interface StatModifier {
  /** 修正来源ID */
  sourceId: string
  /** 修正属性名 */
  stat: keyof Pick<CombatStats, 'attack' | 'defense' | 'speed' | 'critRate' | 'critDamage' | 'dodgeRate'>
  /** 修正类型：flat=固定值加成, percent=百分比加成 */
  type: 'flat' | 'percent'
  /** 修正值 */
  value: number
  /** 持续tick数（-1=永久） */
  duration: number
}

/** 伤害类型 */
export type DamageType = 'physical' | 'magical' | 'true'

/** 伤害结果 */
export interface DamageResult {
  /** 最终伤害值 */
  damage: number
  /** 是否暴击 */
  isCrit: boolean
  /** 是否闪避 */
  isDodge: boolean
  /** 伤害类型 */
  damageType: DamageType
  /** 伤害来源ID */
  attackerId: string
  /** 目标ID */
  targetId: string
  /** 实际HP变化 */
  hpChange: number
  /** 详细文字 */
  message: string
}

/** 治疗结果 */
export interface HealResult {
  /** 治疗量 */
  amount: number
  /** 是否暴击治疗 */
  isCrit: boolean
  /** 目标ID */
  targetId: string
  /** 实际HP变化 */
  hpChange: number
  /** 详细文字 */
  message: string
}

// =============================================
// 属性创建工具
// =============================================

/** 默认玩家属性 */
export const DEFAULT_PLAYER_STATS: Omit<CombatStats, 'hp' | 'maxHp' | 'sp' | 'maxSp'> = {
  attack: 10,
  defense: 5,
  speed: 10,
  critRate: 0.05,
  critDamage: 1.5,
  dodgeRate: 0.03,
}

/**
 * 创建战斗属性
 */
export function createCombatStats(base: {
  maxHp: number
  maxSp: number
  attack: number
  defense: number
  speed: number
  critRate?: number
  critDamage?: number
  dodgeRate?: number
}): CombatStats {
  return {
    hp: base.maxHp,
    maxHp: base.maxHp,
    sp: base.maxSp,
    maxSp: base.maxSp,
    attack: base.attack,
    defense: base.defense,
    speed: base.speed,
    critRate: base.critRate ?? 0.05,
    critDamage: base.critDamage ?? 1.5,
    dodgeRate: base.dodgeRate ?? 0.03,
  }
}

/**
 * 根据等级缩放属性
 */
export function scaleStatsByLevel(baseStats: CombatStats, level: number): CombatStats {
  const levelFactor = 1 + (level - 1) * 0.12 // 每级增长12%
  return {
    ...baseStats,
    maxHp: Math.floor(baseStats.maxHp * levelFactor),
    hp: Math.floor(baseStats.maxHp * levelFactor),
    maxSp: Math.floor(baseStats.maxSp * (1 + (level - 1) * 0.08)),
    sp: Math.floor(baseStats.maxSp * (1 + (level - 1) * 0.08)),
    attack: Math.floor(baseStats.attack * levelFactor),
    defense: Math.floor(baseStats.defense * levelFactor),
    speed: Math.floor(baseStats.speed * (1 + (level - 1) * 0.05)),
  }
}

// =============================================
// 属性修正计算
// =============================================

/**
 * 计算修正后的属性值
 */
export function getModifiedStat(
  baseValue: number,
  statName: 'attack' | 'defense' | 'speed' | 'critRate' | 'critDamage' | 'dodgeRate',
  modifiers: StatModifier[],
): number {
  let flatBonus = 0
  let percentBonus = 0

  for (const mod of modifiers) {
    if (mod.stat !== statName) continue
    if (mod.type === 'flat') {
      flatBonus += mod.value
    } else {
      percentBonus += mod.value
    }
  }

  return (baseValue + flatBonus) * (1 + percentBonus)
}

/**
 * 获取完整修正后的战斗属性
 */
export function getModifiedCombatStats(stats: CombatStats, modifiers: StatModifier[]): CombatStats {
  return {
    hp: stats.hp,
    maxHp: stats.maxHp,
    sp: stats.sp,
    maxSp: stats.maxSp,
    attack: Math.max(0, Math.floor(getModifiedStat(stats.attack, 'attack', modifiers))),
    defense: Math.max(0, Math.floor(getModifiedStat(stats.defense, 'defense', modifiers))),
    speed: Math.max(1, Math.floor(getModifiedStat(stats.speed, 'speed', modifiers))),
    critRate: Math.min(1, Math.max(0, getModifiedStat(stats.critRate, 'critRate', modifiers))),
    critDamage: Math.max(1, getModifiedStat(stats.critDamage, 'critDamage', modifiers)),
    dodgeRate: Math.min(0.75, Math.max(0, getModifiedStat(stats.dodgeRate, 'dodgeRate', modifiers))),
  }
}

// =============================================
// 伤害计算核心
// =============================================

/**
 * 计算物理伤害
 *
 * 公式设计思路：
 * - 基础伤害 = 攻击力 × 技能倍率
 * - 防御减伤 = 基础伤害 × (1 - 防御/(防御+200))
 * - 暴击加成 = 伤害 × 暴击倍率
 * - 随机波动 = ±10%
 *
 * 伤害公式：damage = max(1, atk × multiplier × (1 - def/(def+200)) × crit × random)
 */
export function calculatePhysicalDamage(
  attackerAttack: number,
  defenderDefense: number,
  attackerCritRate: number,
  attackerCritDamage: number,
  defenderDodgeRate: number,
  skillMultiplier: number = 1.0,
): DamageResult & { isDodge: boolean; isCrit: boolean } {
  // 闪避判定
  if (Math.random() < defenderDodgeRate) {
    return {
      damage: 0,
      isCrit: false,
      isDodge: true,
      damageType: 'physical',
      attackerId: '',
      targetId: '',
      hpChange: 0,
      message: '攻击被闪避!',
    }
  }

  // 基础伤害
  const baseDamage = attackerAttack * skillMultiplier

  // 防御减伤（防御收益递减，不会完全免疫）
  const defenseReduction = defenderDefense / (defenderDefense + 200)
  const afterDefense = baseDamage * (1 - defenseReduction)

  // 暴击判定
  const isCrit = Math.random() < attackerCritRate
  const critMultiplier = isCrit ? attackerCritDamage : 1.0
  const afterCrit = afterDefense * critMultiplier

  // 随机波动 ±10%
  const randomFactor = 0.9 + Math.random() * 0.2
  const finalDamage = Math.max(1, Math.floor(afterCrit * randomFactor))

  return {
    damage: finalDamage,
    isCrit,
    isDodge: false,
    damageType: 'physical',
    attackerId: '',
    targetId: '',
    hpChange: -finalDamage,
    message: isCrit ? `暴击! 造成 ${finalDamage} 点伤害!` : `造成 ${finalDamage} 点伤害`,
  }
}

/**
 * 计算魔法伤害（无视物理防御，但有独立减伤系数）
 *
 * 公式：damage = max(1, basePower × multiplier × (1 - magicResist) × random)
 */
export function calculateMagicalDamage(
  basePower: number,
  magicResist: number, // 0-1, 目标魔法抗性
  skillMultiplier: number = 1.0,
): DamageResult {
  const afterResist = basePower * skillMultiplier * (1 - magicResist)
  const randomFactor = 0.9 + Math.random() * 0.2
  const finalDamage = Math.max(1, Math.floor(afterResist * randomFactor))

  return {
    damage: finalDamage,
    isCrit: false,
    isDodge: false,
    damageType: 'magical',
    attackerId: '',
    targetId: '',
    hpChange: -finalDamage,
    message: `造成 ${finalDamage} 点魔法伤害`,
  }
}

/**
 * 计算真实伤害（无视防御和抗性）
 */
export function calculateTrueDamage(
  baseDamage: number,
  skillMultiplier: number = 1.0,
): DamageResult {
  const finalDamage = Math.max(1, Math.floor(baseDamage * skillMultiplier))

  return {
    damage: finalDamage,
    isCrit: false,
    isDodge: false,
    damageType: 'true',
    attackerId: '',
    targetId: '',
    hpChange: -finalDamage,
    message: `造成 ${finalDamage} 点真实伤害`,
  }
}

// =============================================
// 治疗计算
// =============================================

/**
 * 计算治疗量
 *
 * 公式：heal = max(1, baseHeal × (1 + healBonus) × random)
 */
export function calculateHeal(
  baseHeal: number,
  healBonus: number = 0, // 治疗加成（0=无加成, 0.2=20%加成）
  canCrit: boolean = false,
  critRate: number = 0,
  critDamage: number = 1.5,
): HealResult {
  let healAmount = baseHeal * (1 + healBonus)

  const isCrit = canCrit && Math.random() < critRate
  if (isCrit) {
    healAmount *= critDamage
  }

  const randomFactor = 0.9 + Math.random() * 0.2
  healAmount = Math.max(1, Math.floor(healAmount * randomFactor))

  return {
    amount: healAmount,
    isCrit,
    targetId: '',
    hpChange: healAmount,
    message: isCrit ? `暴击治疗! 恢复 ${healAmount} 点HP!` : `恢复 ${healAmount} 点HP`,
  }
}

// =============================================
// SP消耗与恢复
// =============================================

/**
 * 计算技能SP消耗（含减免）
 */
export function calculateSpCost(baseCost: number, spReduction: number = 0): number {
  return Math.max(0, Math.floor(baseCost * (1 - spReduction)))
}

/**
 * 计算SP恢复量（每tick自然恢复）
 */
export function calculateSpRegen(maxSp: number, baseRegen: number = 2): number {
  return Math.min(baseRegen, maxSp) // 每tick恢复固定量
}

// =============================================
// 属性差值比较（用于技能条件判定）
// =============================================

/**
 * 属性优势判定（攻击方 vs 防御方）
 * 返回优势等级：-2(极大劣势) ~ +2(极大优势)
 */
export function getStatAdvantage(
  attackerStats: CombatStats,
  defenderStats: CombatStats,
): number {
  let advantage = 0

  // 攻击力 vs 防御力
  const atkDefRatio = attackerStats.attack / Math.max(1, defenderStats.defense)
  if (atkDefRatio > 3) advantage += 2
  else if (atkDefRatio > 2) advantage += 1
  else if (atkDefRatio < 0.5) advantage -= 2
  else if (atkDefRatio < 0.7) advantage -= 1

  // 速度优势
  const speedRatio = attackerStats.speed / Math.max(1, defenderStats.speed)
  if (speedRatio > 2) advantage += 1
  else if (speedRatio < 0.5) advantage -= 1

  return Math.max(-2, Math.min(2, advantage))
}

// =============================================
// 预制属性模板（5种敌人类型+BOSS）
// =============================================

/** 敌人属性模板 */
export interface EnemyStatTemplate {
  /** 模板ID */
  id: string
  /** 敌人类型名 */
  name: string
  /** 基础属性 */
  baseStats: Omit<CombatStats, 'hp' | 'sp'>
  /** HP倍率（乘以基础HP） */
  hpMultiplier: number
  /** SP倍率 */
  spMultiplier: number
  /** 特殊属性标签 */
  tags: string[]
}

/** 狼型敌人模板 */
export const WOLF_TEMPLATE: EnemyStatTemplate = {
  id: 'enemy_wolf',
  name: '荒野之狼',
  baseStats: {
    maxHp: 40,
    maxSp: 0,
    attack: 12,
    defense: 4,
    speed: 14,
    critRate: 0.08,
    critDamage: 1.4,
    dodgeRate: 0.1,
  },
  hpMultiplier: 1.0,
  spMultiplier: 0,
  tags: ['beast', 'fast'],
}

/** 哥布林敌人模板 */
export const GOBLIN_TEMPLATE: EnemyStatTemplate = {
  id: 'enemy_goblin',
  name: '洞穴哥布林',
  baseStats: {
    maxHp: 30,
    maxSp: 10,
    attack: 8,
    defense: 3,
    speed: 10,
    critRate: 0.05,
    critDamage: 1.3,
    dodgeRate: 0.08,
  },
  hpMultiplier: 1.0,
  spMultiplier: 1.0,
  tags: ['humanoid', 'cunning'],
}

/** 树精敌人模板 */
export const TREANT_TEMPLATE: EnemyStatTemplate = {
  id: 'enemy_treant',
  name: '腐化树精',
  baseStats: {
    maxHp: 80,
    maxSp: 20,
    attack: 10,
    defense: 12,
    speed: 4,
    critRate: 0.03,
    critDamage: 2.0,
    dodgeRate: 0.0,
  },
  hpMultiplier: 1.0,
  spMultiplier: 1.0,
  tags: ['plant', 'tank', 'slow'],
}

/** 幽灵敌人模板 */
export const GHOST_TEMPLATE: EnemyStatTemplate = {
  id: 'enemy_ghost',
  name: '迷途幽灵',
  baseStats: {
    maxHp: 25,
    maxSp: 30,
    attack: 14,
    defense: 2,
    speed: 8,
    critRate: 0.1,
    critDamage: 1.8,
    dodgeRate: 0.2,
  },
  hpMultiplier: 1.0,
  spMultiplier: 1.0,
  tags: ['undead', 'magical', 'evasive'],
}

/** 蘑菇怪敌人模板 */
export const MUSHROOM_TEMPLATE: EnemyStatTemplate = {
  id: 'enemy_mushroom',
  name: '毒雾蘑菇',
  baseStats: {
    maxHp: 35,
    maxSp: 15,
    attack: 6,
    defense: 6,
    speed: 5,
    critRate: 0.02,
    critDamage: 1.2,
    dodgeRate: 0.0,
  },
  hpMultiplier: 1.0,
  spMultiplier: 1.0,
  tags: ['plant', 'poison', 'support'],
}

/** BOSS模板：森林守卫 */
export const FOREST_GUARDIAN_BOSS_TEMPLATE: EnemyStatTemplate = {
  id: 'boss_forest_guardian',
  name: '森林守卫',
  baseStats: {
    maxHp: 200,
    maxSp: 50,
    attack: 18,
    defense: 15,
    speed: 6,
    critRate: 0.1,
    critDamage: 2.0,
    dodgeRate: 0.05,
  },
  hpMultiplier: 1.0,
  spMultiplier: 1.0,
  tags: ['boss', 'plant', 'multi_phase'],
}

/**
 * 根据模板创建战斗属性
 */
export function createStatsFromTemplate(template: EnemyStatTemplate, level: number = 1): CombatStats {
  const baseStats = template.baseStats
  const scaledHp = Math.floor(baseStats.maxHp * template.hpMultiplier)
  const scaledSp = Math.floor(baseStats.maxSp * template.spMultiplier)

  const stats = createCombatStats({
    maxHp: scaledHp,
    maxSp: scaledSp,
    attack: baseStats.attack,
    defense: baseStats.defense,
    speed: baseStats.speed,
    critRate: baseStats.critRate,
    critDamage: baseStats.critDamage,
    dodgeRate: baseStats.dodgeRate,
  })

  if (level > 1) {
    return scaleStatsByLevel(stats, level)
  }

  return stats
}

/** 所有敌人模板映射 */
export const ENEMY_TEMPLATES: Record<string, EnemyStatTemplate> = {
  enemy_wolf: WOLF_TEMPLATE,
  enemy_goblin: GOBLIN_TEMPLATE,
  enemy_treant: TREANT_TEMPLATE,
  enemy_ghost: GHOST_TEMPLATE,
  enemy_mushroom: MUSHROOM_TEMPLATE,
  boss_forest_guardian: FOREST_GUARDIAN_BOSS_TEMPLATE,
}

/**
 * 获取敌人模板
 */
export function getEnemyTemplate(templateId: string): EnemyStatTemplate | undefined {
  return ENEMY_TEMPLATES[templateId]
}
