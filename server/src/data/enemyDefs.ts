// 星火小镇 — 回合制战斗敌人定义
// T7.x 赛尔号式回合制战斗：敌人属性定义 + 等级缩放（保证玩家可过关）

// =============================================
// 敌人定义
// =============================================

export interface EnemyDef {
  id: string
  name: string
  /** 出现场景（town=小镇周边 / forest=低语森林 / mine=矿洞） */
  scenes: string[]
  baseHp: number
  baseAtk: number
  baseDef: number
  baseSpeed: number
  /** 闪避率（0-1） */
  dodgeRate?: number
  /** 是否BOSS（不随等级缩放，固定强度） */
  isBoss?: boolean
  /** 精灵帧尺寸 */
  frameSize: number
  /** 经验倍率（影响结算经验） */
  expMultiplier?: number
}

/**
 * 敌人数值设计原则（数学上保证玩家必赢）：
 * - 玩家先手，每回合伤害 Dp ≈ atk×(1-def/(def+200))
 * - 玩家杀敌回合数 T = ceil(HP_e/Dp)，敌人最多出手 T-1 次
 * - 要求 (T-1) × De < 玩家HP → 玩家稳赢
 * - 普通怪随等级轻微缩放，BOSS 固定强度（玩家等级越高越好打）
 */
export const ENEMY_DEFS: Record<string, EnemyDef> = {
  enemy_wolf: {
    id: 'enemy_wolf',
    name: '荒野之狼',
    scenes: ['town'],
    baseHp: 30, baseAtk: 7, baseDef: 3, baseSpeed: 9,
    dodgeRate: 0.05,
    frameSize: 128,
  },
  enemy_goblin: {
    id: 'enemy_goblin',
    name: '洞穴哥布林',
    scenes: ['town'],
    baseHp: 26, baseAtk: 6, baseDef: 2, baseSpeed: 7,
    frameSize: 128,
  },
  enemy_treant: {
    id: 'enemy_treant',
    name: '腐化树精',
    scenes: ['forest'],
    baseHp: 55, baseAtk: 7, baseDef: 9, baseSpeed: 3,
    frameSize: 128,
  },
  enemy_ghost: {
    id: 'enemy_ghost',
    name: '迷途幽灵',
    scenes: ['forest'],
    baseHp: 24, baseAtk: 6, baseDef: 2, baseSpeed: 8,
    dodgeRate: 0.15,
    frameSize: 128,
  },
  enemy_mushroom: {
    id: 'enemy_mushroom',
    name: '毒雾蘑菇',
    scenes: ['forest'],
    baseHp: 30, baseAtk: 6, baseDef: 4, baseSpeed: 5,
    frameSize: 128,
  },
  enemy_cave_worm: {
    id: 'enemy_cave_worm',
    name: '矿洞蠕虫',
    scenes: ['mine'],
    baseHp: 42, baseAtk: 8, baseDef: 6, baseSpeed: 6,
    frameSize: 128,
  },
  enemy_shadow_minion: {
    id: 'enemy_shadow_minion',
    name: '暗影爪牙',
    scenes: ['mine', 'forest'],
    baseHp: 36, baseAtk: 9, baseDef: 5, baseSpeed: 7,
    dodgeRate: 0.08,
    frameSize: 128,
  },
  boss_forest_guardian: {
    id: 'boss_forest_guardian',
    name: '被腐化的森林守护者',
    scenes: ['forest'],
    baseHp: 90, baseAtk: 9, baseDef: 10, baseSpeed: 5,
    isBoss: true,
    frameSize: 160,
    expMultiplier: 3,
  },
}

// =============================================
// 等级缩放
// =============================================

/**
 * 按玩家等级生成敌人战斗属性
 * - 普通怪：HP×1.4^(lv-1)，ATK×1.25^(lv-1)，DEF×1.15^(lv-1)（有成长但不碾压玩家）
 * - BOSS：固定基础强度（玩家越强越好打）
 */
export function scaleEnemyForLevel(
  def: EnemyDef,
  playerLevel: number,
): { hp: number; maxHp: number; attack: number; defense: number; speed: number; dodgeRate: number } {
  const f = Math.max(0, playerLevel - 1)
  if (def.isBoss) {
    return {
      hp: def.baseHp,
      maxHp: def.baseHp,
      attack: def.baseAtk,
      defense: def.baseDef,
      speed: def.baseSpeed,
      dodgeRate: def.dodgeRate ?? 0.05,
    }
  }
  return {
    hp: Math.max(1, Math.round(def.baseHp * Math.pow(1.4, f))),
    maxHp: Math.max(1, Math.round(def.baseHp * Math.pow(1.4, f))),
    attack: Math.max(1, Math.round(def.baseAtk * Math.pow(1.25, f))),
    defense: Math.max(0, Math.round(def.baseDef * Math.pow(1.15, f))),
    speed: def.baseSpeed,
    dodgeRate: def.dodgeRate ?? 0.05,
  }
}

/** 场景 → 默认遭遇敌人（按剧情：小镇周边/森林/矿洞） */
export const SCENE_ENCOUNTERS: Record<string, string[]> = {
  town: ['enemy_wolf'],
  forest: ['enemy_treant', 'enemy_ghost'],
  mine: ['enemy_cave_worm', 'enemy_shadow_minion'],
}

/** 获取敌人定义 */
export function getEnemyDef(enemyId: string): EnemyDef | undefined {
  return ENEMY_DEFS[enemyId]
}
