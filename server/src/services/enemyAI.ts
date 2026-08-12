// 星火小镇 — 敌人AI与技能系统
// T3.4.4 5种敌人行为模式、BOSS多阶段战斗

import type { CombatStats, StatModifier } from './combatStats.js'

// =============================================
// 敌人技能定义
// =============================================

/** 技能目标类型 */
export type SkillTargetType = 'self' | 'enemy' | 'all_enemies' | 'ally' | 'all_allies'

/** 敌人技能 */
export interface EnemySkill {
  /** 技能ID */
  id: string
  /** 技能名称 */
  name: string
  /** 技能描述 */
  description: string
  /** SP消耗 */
  spCost: number
  /** 冷却回合数 */
  cooldown: number
  /** 当前冷却 */
  currentCooldown: number
  /** 目标类型 */
  targetType: SkillTargetType
  /** 技能效果类型 */
  effectType: 'damage' | 'heal' | 'buff' | 'debuff' | 'dot' | 'summon' | 'phase_change'
  /** 伤害倍率（相对于基础攻击力） */
  damageMultiplier: number
  /** 伤害类型 */
  damageType: 'physical' | 'magical' | 'true'
  /** 治疗量（占最大HP百分比） */
  healPercent?: number
  /** Buff/Debuff效果 */
  modifier?: StatModifier
  /** 持续伤害（每tick） */
  dotDamage?: number
  /** DoT持续tick数 */
  dotDuration?: number
  /** 召唤敌人类型ID */
  summonType?: string
  /** 召唤数量 */
  summonCount?: number
  /** 优先级（AI决策权重） */
  priority: number
  /** 使用条件 */
  condition?: EnemyAICondition
}

/** AI条件判断 */
export interface EnemyAICondition {
  /** 自身HP百分比阈值 */
  hpBelow?: number
  /** 自身HP百分比上限 */
  hpAbove?: number
  /** 目标HP百分比阈值 */
  targetHpBelow?: number
  /** 回合数条件 */
  turnAbove?: number
  /** 是否只在特定阶段 */
  phase?: number
  /** 随机概率 */
  chance?: number
}

// =============================================
// 5种敌人行为模式AI
// =============================================

/** 敌人行为类型 */
export type EnemyBehaviorType = 'aggressive' | 'defensive' | 'cunning' | 'magical' | 'support'

/** 敌人AI配置 */
export interface EnemyAIConfig {
  /** 敌人类型ID */
  enemyType: string
  /** 行为模式 */
  behavior: EnemyBehaviorType
  /** 可用技能列表 */
  skills: EnemySkill[]
  /** AI决策参数 */
  params: {
    /** 攻击倾向（0-1, 越高越倾向攻击） */
    aggression: number
    /** 使用技能倾向（0-1, 越高越倾向使用技能而非普攻） */
    skillPreference: number
    /** 低HP时治疗倾向（0-1） */
    healWhenLow: number
    /** 逃跑阈值（HP百分比, 0=不逃跑） */
    fleeThreshold: number
  }
}

// =============================================
// 敌人AI决策引擎
// =============================================

/** AI决策结果 */
export interface AIDecision {
  /** 选择的行动类型 */
  action: 'attack' | 'skill' | 'heal' | 'flee' | 'wait'
  /** 选择的技能（action=skill时） */
  skill?: EnemySkill
  /** 目标ID */
  targetId?: string
  /** 决策理由 */
  reason: string
}

/**
 * EnemyAIEngine — 敌人AI决策引擎
 *
 * 5种行为模式：
 * 1. aggressive（激进型）— 狼：优先攻击，低HP时更凶猛
 * 2. defensive（防御型）— 树精：优先防御和减伤，高HP才反击
 * 3. cunning（狡诈型）— 哥布林：根据情况灵活选择，低HP偷袭
 * 4. magical（魔法型）— 幽灵：优先使用魔法技能，远程消耗
 * 5. support（辅助型）— 蘑菇怪：优先给队友加buff/debuff敌人
 */
class EnemyAIEngine {
  /**
   * 执行AI决策
   */
  decide(
    aiConfig: EnemyAIConfig,
    selfStats: CombatStats,
    selfModifiers: StatModifier[],
    enemies: Array<{ id: string; stats: CombatStats; modifiers: StatModifier[] }>,
    allies: Array<{ id: string; stats: CombatStats; modifiers: StatModifier[] }>,
    turnCount: number,
    currentPhase?: number,
  ): AIDecision {
    const hpPercent = selfStats.hp / selfStats.maxHp

    // 1. 检查逃跑条件
    if (aiConfig.params.fleeThreshold > 0 && hpPercent <= aiConfig.params.fleeThreshold) {
      return { action: 'flee', reason: 'HP过低，尝试逃跑' }
    }

    // 2. 根据行为模式做决策
    switch (aiConfig.behavior) {
      case 'aggressive':
        return this.decideAggressive(aiConfig, selfStats, selfModifiers, enemies, turnCount, currentPhase)
      case 'defensive':
        return this.decideDefensive(aiConfig, selfStats, selfModifiers, enemies, allies, turnCount, currentPhase)
      case 'cunning':
        return this.decideCunning(aiConfig, selfStats, selfModifiers, enemies, turnCount, currentPhase)
      case 'magical':
        return this.decideMagical(aiConfig, selfStats, selfModifiers, enemies, turnCount, currentPhase)
      case 'support':
        return this.decideSupport(aiConfig, selfStats, selfModifiers, enemies, allies, turnCount, currentPhase)
      default:
        return { action: 'attack', targetId: enemies[0]?.id, reason: '默认攻击' }
    }
  }

  /**
   * 激进型AI — 狼
   * 策略：血量越低越凶猛，优先攻击最弱目标
   */
  private decideAggressive(
    aiConfig: EnemyAIConfig,
    selfStats: CombatStats,
    _selfModifiers: StatModifier[],
    enemies: Array<{ id: string; stats: CombatStats; modifiers: StatModifier[] }>,
    turnCount: number,
    _currentPhase?: number,
  ): AIDecision {
    const hpPercent = selfStats.hp / selfStats.maxHp
    const availableSkills = this.getAvailableSkills(aiConfig.skills, turnCount)

    // 低HP狂暴：优先使用高伤害技能
    if (hpPercent < 0.3 && availableSkills.length > 0) {
      const strongestSkill = availableSkills
        .filter((s) => s.effectType === 'damage')
        .sort((a, b) => b.damageMultiplier - a.damageMultiplier)[0]

      if (strongestSkill && Math.random() < aiConfig.params.skillPreference * 1.5) {
        const weakest = this.findWeakestTarget(enemies)
        return {
          action: 'skill',
          skill: strongestSkill,
          targetId: weakest?.id,
          reason: '狂暴模式：使用最强技能攻击最弱目标',
        }
      }
    }

    // 正常模式：优先攻击低HP目标
    const weakest = this.findWeakestTarget(enemies)
    if (weakest && Math.random() < aiConfig.params.skillPreference && availableSkills.length > 0) {
      const skill = this.selectSkillByPriority(availableSkills, 'damage')
      if (skill) {
        return {
          action: 'skill',
          skill,
          targetId: weakest.id,
          reason: '使用技能攻击最弱目标',
        }
      }
    }

    return {
      action: 'attack',
      targetId: weakest?.id ?? enemies[0]?.id,
      reason: '普攻最弱目标',
    }
  }

  /**
   * 防御型AI — 树精
   * 策略：高HP时才进攻，低HP时加防御buff，偶尔反击
   */
  private decideDefensive(
    aiConfig: EnemyAIConfig,
    selfStats: CombatStats,
    _selfModifiers: StatModifier[],
    enemies: Array<{ id: string; stats: CombatStats; modifiers: StatModifier[] }>,
    _allies: Array<{ id: string; stats: CombatStats; modifiers: StatModifier[] }>,
    turnCount: number,
    _currentPhase?: number,
  ): AIDecision {
    const hpPercent = selfStats.hp / selfStats.maxHp
    const availableSkills = this.getAvailableSkills(aiConfig.skills, turnCount)

    // 低HP时优先防御
    if (hpPercent < 0.5) {
      const defenseBuff = availableSkills.find((s) => s.effectType === 'buff' && s.modifier?.stat === 'defense')
      if (defenseBuff) {
        return {
          action: 'skill',
          skill: defenseBuff,
          targetId: 'self',
          reason: '低HP：加防御buff',
        }
      }

      // 低HP时有概率使用治疗
      if (Math.random() < aiConfig.params.healWhenLow) {
        const healSkill = availableSkills.find((s) => s.effectType === 'heal')
        if (healSkill) {
          return {
            action: 'skill',
            skill: healSkill,
            targetId: 'self',
            reason: '低HP：自我治疗',
          }
        }
      }
    }

    // HP充足时偶尔反击
    if (hpPercent > 0.7 && Math.random() < 0.4 && availableSkills.length > 0) {
      const attackSkill = this.selectSkillByPriority(availableSkills, 'damage')
      if (attackSkill) {
        const target = this.findHighestThreat(enemies)
        return {
          action: 'skill',
          skill: attackSkill,
          targetId: target?.id,
          reason: 'HP充足：使用攻击技能反击',
        }
      }
    }

    // 默认普通攻击
    const target = enemies[Math.floor(Math.random() * enemies.length)]
    return {
      action: 'attack',
      targetId: target?.id,
      reason: '防御型普攻',
    }
  }

  /**
   * 狡诈型AI — 哥布林
   * 策略：灵活切换攻击/技能，低HP时偷袭，善于利用debuff
   */
  private decideCunning(
    aiConfig: EnemyAIConfig,
    selfStats: CombatStats,
    _selfModifiers: StatModifier[],
    enemies: Array<{ id: string; stats: CombatStats; modifiers: StatModifier[] }>,
    turnCount: number,
    _currentPhase?: number,
  ): AIDecision {
    const hpPercent = selfStats.hp / selfStats.maxHp
    const availableSkills = this.getAvailableSkills(aiConfig.skills, turnCount)

    // 先检查是否有可用的debuff技能
    const debuffSkill = availableSkills.find((s) => s.effectType === 'debuff')
    if (debuffSkill && Math.random() < 0.5) {
      const target = this.findHighestAttack(enemies)
      return {
        action: 'skill',
        skill: debuffSkill,
        targetId: target?.id,
        reason: '狡诈策略：削弱最强攻击目标',
      }
    }

    // 低HP时使用偷袭技能（高伤害倍率）
    if (hpPercent < 0.4 && availableSkills.length > 0) {
      const ambushSkill = availableSkills
        .filter((s) => s.effectType === 'damage' && s.damageMultiplier >= 1.5)
        .sort((a, b) => b.damageMultiplier - a.damageMultiplier)[0]

      if (ambushSkill && Math.random() < 0.7) {
        const weakest = this.findWeakestTarget(enemies)
        return {
          action: 'skill',
          skill: ambushSkill,
          targetId: weakest?.id,
          reason: '低HP偷袭：使用高伤害技能',
        }
      }
    }

    // 随机选择攻击或技能
    if (Math.random() < aiConfig.params.skillPreference && availableSkills.length > 0) {
      const skill = this.selectSkillByPriority(availableSkills, 'damage')
      if (skill) {
        const target = this.findWeakestTarget(enemies)
        return {
          action: 'skill',
          skill,
          targetId: target?.id,
          reason: '使用攻击技能',
        }
      }
    }

    const target = this.findWeakestTarget(enemies) ?? enemies[0]
    return {
      action: 'attack',
      targetId: target?.id,
      reason: '普攻最弱目标',
    }
  }

  /**
   * 魔法型AI — 幽灵
   * 策略：优先魔法攻击，远程消耗，闪避高
   */
  private decideMagical(
    aiConfig: EnemyAIConfig,
    selfStats: CombatStats,
    _selfModifiers: StatModifier[],
    enemies: Array<{ id: string; stats: CombatStats; modifiers: StatModifier[] }>,
    turnCount: number,
    _currentPhase?: number,
  ): AIDecision {
    const _unusedHpPercent = selfStats.hp / selfStats.maxHp; void _unusedHpPercent
    const availableSkills = this.getAvailableSkills(aiConfig.skills, turnCount)

    // 优先使用魔法伤害技能
    const magicSkill = availableSkills
      .filter((s) => s.effectType === 'damage' && s.damageType === 'magical')
      .sort((a, b) => b.damageMultiplier - a.damageMultiplier)[0]

    if (magicSkill && selfStats.sp >= magicSkill.spCost) {
      const target = this.findWeakestTarget(enemies)
      return {
        action: 'skill',
        skill: magicSkill,
        targetId: target?.id,
        reason: '使用魔法攻击',
      }
    }

    // SP不足时使用物理技能或普攻
    const physicalSkill = availableSkills.find((s) => s.effectType === 'damage' && s.damageType === 'physical')
    if (physicalSkill) {
      const target = this.findWeakestTarget(enemies)
      return {
        action: 'skill',
        skill: physicalSkill,
        targetId: target?.id,
        reason: 'SP不足，使用物理技能',
      }
    }

    const target = enemies[Math.floor(Math.random() * enemies.length)]
    return {
      action: 'attack',
      targetId: target?.id,
      reason: '魔法型普攻',
    }
  }

  /**
   * 辅助型AI — 蘑菇怪
   * 策略：优先给队友buff/给敌人debuff，偶尔释放毒雾
   */
  private decideSupport(
    aiConfig: EnemyAIConfig,
    _selfStats: CombatStats,
    _selfModifiers: StatModifier[],
    enemies: Array<{ id: string; stats: CombatStats; modifiers: StatModifier[] }>,
    allies: Array<{ id: string; stats: CombatStats; modifiers: StatModifier[] }>,
    turnCount: number,
    _currentPhase?: number,
  ): AIDecision {
    const availableSkills = this.getAvailableSkills(aiConfig.skills, turnCount)

    // 优先给队友加buff
    const buffSkill = availableSkills.find((s) => s.effectType === 'buff')
    if (buffSkill && allies.length > 0 && Math.random() < 0.6) {
      const target = allies[Math.floor(Math.random() * allies.length)]
      return {
        action: 'skill',
        skill: buffSkill,
        targetId: target.id,
        reason: '给队友加buff',
      }
    }

    // 给敌人加debuff
    const debuffSkill = availableSkills.find((s) => s.effectType === 'debuff')
    if (debuffSkill && Math.random() < 0.5) {
      const target = enemies[Math.floor(Math.random() * enemies.length)]
      return {
        action: 'skill',
        skill: debuffSkill,
        targetId: target.id,
        reason: '给敌人加debuff',
      }
    }

    // DoT技能
    const dotSkill = availableSkills.find((s) => s.effectType === 'dot')
    if (dotSkill && Math.random() < 0.4) {
      const target = enemies[Math.floor(Math.random() * enemies.length)]
      return {
        action: 'skill',
        skill: dotSkill,
        targetId: target.id,
        reason: '施加持续伤害',
      }
    }

    // 无辅助技能可用时普攻
    const target = enemies[Math.floor(Math.random() * enemies.length)]
    return {
      action: 'attack',
      targetId: target?.id,
      reason: '辅助型普攻',
    }
  }

  // =============================================
  // 辅助方法
  // =============================================

  /**
   * 获取可用技能（冷却中排除）
   */
  private getAvailableSkills(skills: EnemySkill[], _turnCount: number): EnemySkill[] {
    return skills.filter((s) => s.currentCooldown <= 0)
  }

  /**
   * 按优先级选择技能
   */
  private selectSkillByPriority(skills: EnemySkill[], effectType?: string): EnemySkill | undefined {
    const filtered = effectType
      ? skills.filter((s) => s.effectType === effectType)
      : skills

    return filtered.sort((a, b) => b.priority - a.priority)[0]
  }

  /**
   * 寻找最弱目标（HP最低）
   */
  private findWeakestTarget(enemies: Array<{ id: string; stats: CombatStats }>): { id: string; stats: CombatStats } | undefined {
    if (enemies.length === 0) return undefined
    return enemies.reduce((min, e) => e.stats.hp < min.stats.hp ? e : min)
  }

  /**
   * 寻找最高威胁目标（攻击力最高）
   */
  private findHighestThreat(enemies: Array<{ id: string; stats: CombatStats }>): { id: string; stats: CombatStats } | undefined {
    if (enemies.length === 0) return undefined
    return enemies.reduce((max, e) => e.stats.attack > max.stats.attack ? e : max)
  }

  /**
   * 寻找攻击力最高的目标
   */
  private findHighestAttack(enemies: Array<{ id: string; stats: CombatStats }>): { id: string; stats: CombatStats } | undefined {
    return this.findHighestThreat(enemies)
  }
}

// =============================================
// BOSS多阶段战斗
// =============================================

/** BOSS阶段定义 */
export interface BossPhase {
  /** 阶段编号（0开始） */
  phase: number
  /** 阶段名称 */
  name: string
  /** 进入此阶段的HP百分比阈值 */
  hpThreshold: number // HP百分比，低于此值进入下一阶段
  /** 此阶段的行为模式 */
  behavior: EnemyBehaviorType
  /** 此阶段的可用技能 */
  skills: EnemySkill[]
  /** 此阶段的AI参数 */
  aiParams: EnemyAIConfig['params']
  /** 阶段转换台词 */
  transitionDialogue?: string
  /** 阶段转换效果 */
  transitionEffects?: Array<{
    type: 'heal' | 'buff' | 'summon'
    value?: number
    summonType?: string
    summonCount?: number
  }>
}

/** BOSS战斗状态 */
export interface BossFightState {
  /** 当前阶段 */
  currentPhase: number
  /** 阶段转换历史 */
  phaseHistory: number[]
  /** 是否已转换阶段 */
  hasTransitioned: boolean
}

/**
 * 森林守卫BOSS阶段定义
 *
 * 三阶段战斗：
 * Phase 0（100%-60%HP）：沉睡守护者 — 防御为主，偶尔反击
 * Phase 1（60%-30%HP）：腐化觉醒 — 攻击增强，开始使用魔法
 * Phase 2（30%-0%HP）：绝望挣扎 — 全力攻击，召唤小怪，使用终极技能
 */
export const FOREST_GUARDIAN_PHASES: BossPhase[] = [
  // Phase 0：沉睡守护者
  {
    phase: 0,
    name: '沉睡守护者',
    hpThreshold: 0.6,
    behavior: 'defensive',
    skills: [
      {
        id: 'boss_root_strike',
        name: '根须击打',
        description: '用树根击打目标',
        spCost: 0,
        cooldown: 2,
        currentCooldown: 0,
        targetType: 'enemy',
        effectType: 'damage',
        damageMultiplier: 1.2,
        damageType: 'physical',
        priority: 5,
      },
      {
        id: 'boss_bark_shield',
        name: '树皮护盾',
        description: '增加自身防御力',
        spCost: 10,
        cooldown: 4,
        currentCooldown: 0,
        targetType: 'self',
        effectType: 'buff',
        damageMultiplier: 0,
        damageType: 'physical',
        priority: 8,
        modifier: {
          sourceId: 'boss_bark_shield',
          stat: 'defense',
          type: 'percent',
          value: 0.3,
          duration: 4,
        },
      },
      {
        id: 'boss_natural_heal',
        name: '自然恢复',
        description: '利用森林之力恢复HP',
        spCost: 15,
        cooldown: 6,
        currentCooldown: 0,
        targetType: 'self',
        effectType: 'heal',
        damageMultiplier: 0,
        damageType: 'physical',
        healPercent: 0.08,
        priority: 6,
      },
    ],
    aiParams: {
      aggression: 0.3,
      skillPreference: 0.5,
      healWhenLow: 0.4,
      fleeThreshold: 0,
    },
    transitionDialogue: '（森林守卫的眼中闪过绿色的光芒……）腐化……正在……觉醒……',
  },

  // Phase 1：腐化觉醒
  {
    phase: 1,
    name: '腐化觉醒',
    hpThreshold: 0.3,
    behavior: 'cunning',
    skills: [
      {
        id: 'boss_corruption_blast',
        name: '腐化冲击',
        description: '释放腐化能量攻击所有敌人',
        spCost: 20,
        cooldown: 3,
        currentCooldown: 0,
        targetType: 'all_enemies',
        effectType: 'damage',
        damageMultiplier: 1.5,
        damageType: 'magical',
        priority: 9,
      },
      {
        id: 'boss_vine_bind',
        name: '藤蔓束缚',
        description: '束缚目标，降低速度',
        spCost: 15,
        cooldown: 4,
        currentCooldown: 0,
        targetType: 'enemy',
        effectType: 'debuff',
        damageMultiplier: 0.8,
        damageType: 'physical',
        priority: 7,
        modifier: {
          sourceId: 'boss_vine_bind',
          stat: 'speed',
          type: 'percent',
          value: -0.4,
          duration: 3,
        },
      },
      {
        id: 'boss_root_strike',
        name: '根须击打',
        description: '用树根击打目标',
        spCost: 0,
        cooldown: 2,
        currentCooldown: 0,
        targetType: 'enemy',
        effectType: 'damage',
        damageMultiplier: 1.4,
        damageType: 'physical',
        priority: 5,
      },
      {
        id: 'boss_thorn_rain',
        name: '荆棘雨',
        description: '召唤荆棘攻击',
        spCost: 25,
        cooldown: 5,
        currentCooldown: 0,
        targetType: 'all_enemies',
        effectType: 'damage',
        damageMultiplier: 1.8,
        damageType: 'physical',
        priority: 8,
      },
    ],
    aiParams: {
      aggression: 0.6,
      skillPreference: 0.7,
      healWhenLow: 0.2,
      fleeThreshold: 0,
    },
    transitionDialogue: '（腐化之力完全爆发……）不……能……控制……森林……在……哭泣……',
    transitionEffects: [
      { type: 'buff', value: 0.2 }, // 攻击力+20%
    ],
  },

  // Phase 2：绝望挣扎
  {
    phase: 2,
    name: '绝望挣扎',
    hpThreshold: 0,
    behavior: 'aggressive',
    skills: [
      {
        id: 'boss_desperate_strike',
        name: '绝望一击',
        description: '全力攻击，高伤害但自损HP',
        spCost: 0,
        cooldown: 2,
        currentCooldown: 0,
        targetType: 'enemy',
        effectType: 'damage',
        damageMultiplier: 2.5,
        damageType: 'physical',
        priority: 10,
      },
      {
        id: 'boss_corruption_blast',
        name: '腐化冲击',
        description: '释放腐化能量攻击所有敌人',
        spCost: 20,
        cooldown: 2,
        currentCooldown: 0,
        targetType: 'all_enemies',
        effectType: 'damage',
        damageMultiplier: 2.0,
        damageType: 'magical',
        priority: 9,
      },
      {
        id: 'boss_summon_minions',
        name: '召唤腐化藤蔓',
        description: '召唤小型腐化藤蔓助战',
        spCost: 30,
        cooldown: 8,
        currentCooldown: 0,
        targetType: 'self',
        effectType: 'summon',
        damageMultiplier: 0,
        damageType: 'physical',
        priority: 6,
        summonType: 'enemy_corrupted_vine',
        summonCount: 2,
      },
      {
        id: 'boss_forest_wrath',
        name: '森林之怒',
        description: '终极技能：释放森林的全部怒火',
        spCost: 50,
        cooldown: 10,
        currentCooldown: 0,
        targetType: 'all_enemies',
        effectType: 'damage',
        damageMultiplier: 3.0,
        damageType: 'magical',
        priority: 10,
        condition: {
          hpBelow: 0.3,
        },
      },
    ],
    aiParams: {
      aggression: 0.9,
      skillPreference: 0.8,
      healWhenLow: 0,
      fleeThreshold: 0,
    },
    transitionDialogue: '（森林守卫发出痛苦的嘶吼……）为什么……你们……要……破坏……封印……！',
    transitionEffects: [
      { type: 'summon', summonType: 'enemy_corrupted_vine', summonCount: 1 },
    ],
  },
]

// =============================================
// 5种敌人AI配置
// =============================================

/** 狼型AI配置 */
export const WOLF_AI_CONFIG: EnemyAIConfig = {
  enemyType: 'enemy_wolf',
  behavior: 'aggressive',
  skills: [
    {
      id: 'wolf_bite',
      name: '撕咬',
      description: '用利齿撕咬目标',
      spCost: 0,
      cooldown: 0,
      currentCooldown: 0,
      targetType: 'enemy',
      effectType: 'damage',
      damageMultiplier: 1.0,
      damageType: 'physical',
      priority: 3,
    },
    {
      id: 'wolf_howl',
      name: '狼嚎',
      description: '发出嚎叫，提升自身攻击力',
      spCost: 5,
      cooldown: 5,
      currentCooldown: 0,
      targetType: 'self',
      effectType: 'buff',
      damageMultiplier: 0,
      damageType: 'physical',
      priority: 6,
      modifier: {
        sourceId: 'wolf_howl',
        stat: 'attack',
        type: 'percent',
        value: 0.25,
        duration: 3,
      },
    },
    {
      id: 'wolf_pounce',
      name: '扑击',
      description: '猛扑目标，造成高伤害',
      spCost: 8,
      cooldown: 3,
      currentCooldown: 0,
      targetType: 'enemy',
      effectType: 'damage',
      damageMultiplier: 1.8,
      damageType: 'physical',
      priority: 7,
    },
  ],
  params: {
    aggression: 0.8,
    skillPreference: 0.4,
    healWhenLow: 0,
    fleeThreshold: 0.2,
  },
}

/** 哥布林AI配置 */
export const GOBLIN_AI_CONFIG: EnemyAIConfig = {
  enemyType: 'enemy_goblin',
  behavior: 'cunning',
  skills: [
    {
      id: 'goblin_stab',
      name: '匕首刺击',
      description: '用匕首刺击目标',
      spCost: 0,
      cooldown: 0,
      currentCooldown: 0,
      targetType: 'enemy',
      effectType: 'damage',
      damageMultiplier: 1.0,
      damageType: 'physical',
      priority: 3,
    },
    {
      id: 'goblin_poison',
      name: '毒刃',
      description: '涂毒匕首，施加持续伤害',
      spCost: 8,
      cooldown: 4,
      currentCooldown: 0,
      targetType: 'enemy',
      effectType: 'dot',
      damageMultiplier: 0.6,
      damageType: 'physical',
      dotDamage: 3,
      dotDuration: 3,
      priority: 7,
    },
    {
      id: 'goblin_ambush',
      name: '偷袭',
      description: '趁目标不备发动致命一击',
      spCost: 12,
      cooldown: 5,
      currentCooldown: 0,
      targetType: 'enemy',
      effectType: 'damage',
      damageMultiplier: 2.0,
      damageType: 'physical',
      priority: 8,
      condition: { targetHpBelow: 0.5 },
    },
    {
      id: 'goblin_smokescreen',
      name: '烟雾弹',
      description: '投掷烟雾弹降低目标命中',
      spCost: 6,
      cooldown: 6,
      currentCooldown: 0,
      targetType: 'enemy',
      effectType: 'debuff',
      damageMultiplier: 0,
      damageType: 'physical',
      priority: 5,
      modifier: {
        sourceId: 'goblin_smokescreen',
        stat: 'attack',
        type: 'percent',
        value: -0.2,
        duration: 3,
      },
    },
  ],
  params: {
    aggression: 0.5,
    skillPreference: 0.6,
    healWhenLow: 0.1,
    fleeThreshold: 0.25,
  },
}

/** 树精AI配置 */
export const TREANT_AI_CONFIG: EnemyAIConfig = {
  enemyType: 'enemy_treant',
  behavior: 'defensive',
  skills: [
    {
      id: 'treant_slam',
      name: '树干重击',
      description: '用粗壮的树干重击目标',
      spCost: 0,
      cooldown: 0,
      currentCooldown: 0,
      targetType: 'enemy',
      effectType: 'damage',
      damageMultiplier: 1.3,
      damageType: 'physical',
      priority: 3,
    },
    {
      id: 'treant_bark_armor',
      name: '树皮护甲',
      description: '硬化树皮，大幅提升防御',
      spCost: 10,
      cooldown: 5,
      currentCooldown: 0,
      targetType: 'self',
      effectType: 'buff',
      damageMultiplier: 0,
      damageType: 'physical',
      priority: 9,
      modifier: {
        sourceId: 'treant_bark_armor',
        stat: 'defense',
        type: 'percent',
        value: 0.5,
        duration: 4,
      },
    },
    {
      id: 'treant_natural_heal',
      name: '自然恢复',
      description: '从大地汲取力量恢复HP',
      spCost: 15,
      cooldown: 6,
      currentCooldown: 0,
      targetType: 'self',
      effectType: 'heal',
      damageMultiplier: 0,
      damageType: 'physical',
      healPercent: 0.1,
      priority: 7,
    },
    {
      id: 'treant_root_trap',
      name: '根须束缚',
      description: '伸出根须束缚目标',
      spCost: 12,
      cooldown: 4,
      currentCooldown: 0,
      targetType: 'enemy',
      effectType: 'debuff',
      damageMultiplier: 0.5,
      damageType: 'physical',
      priority: 6,
      modifier: {
        sourceId: 'treant_root_trap',
        stat: 'speed',
        type: 'percent',
        value: -0.5,
        duration: 3,
      },
    },
  ],
  params: {
    aggression: 0.2,
    skillPreference: 0.4,
    healWhenLow: 0.6,
    fleeThreshold: 0,
  },
}

/** 幽灵AI配置 */
export const GHOST_AI_CONFIG: EnemyAIConfig = {
  enemyType: 'enemy_ghost',
  behavior: 'magical',
  skills: [
    {
      id: 'ghost_soul_drain',
      name: '灵魂吸取',
      description: '吸取目标灵魂造成魔法伤害',
      spCost: 10,
      cooldown: 0,
      currentCooldown: 0,
      targetType: 'enemy',
      effectType: 'damage',
      damageMultiplier: 1.5,
      damageType: 'magical',
      priority: 6,
    },
    {
      id: 'ghost_wail',
      name: '幽魂哀嚎',
      description: '发出凄厉的哀嚎攻击所有敌人',
      spCost: 20,
      cooldown: 4,
      currentCooldown: 0,
      targetType: 'all_enemies',
      effectType: 'damage',
      damageMultiplier: 1.2,
      damageType: 'magical',
      priority: 8,
    },
    {
      id: 'ghost_phase_shift',
      name: '相位偏移',
      description: '短暂进入灵界提升闪避',
      spCost: 8,
      cooldown: 5,
      currentCooldown: 0,
      targetType: 'self',
      effectType: 'buff',
      damageMultiplier: 0,
      damageType: 'magical',
      priority: 7,
      modifier: {
        sourceId: 'ghost_phase_shift',
        stat: 'dodgeRate',
        type: 'flat',
        value: 0.3,
        duration: 2,
      },
    },
    {
      id: 'ghost_curse',
      name: '怨灵诅咒',
      description: '诅咒目标降低攻击和防御',
      spCost: 15,
      cooldown: 6,
      currentCooldown: 0,
      targetType: 'enemy',
      effectType: 'debuff',
      damageMultiplier: 0,
      damageType: 'magical',
      priority: 5,
      modifier: {
        sourceId: 'ghost_curse',
        stat: 'attack',
        type: 'percent',
        value: -0.25,
        duration: 4,
      },
    },
  ],
  params: {
    aggression: 0.5,
    skillPreference: 0.8,
    healWhenLow: 0,
    fleeThreshold: 0.15,
  },
}

/** 蘑菇怪AI配置 */
export const MUSHROOM_AI_CONFIG: EnemyAIConfig = {
  enemyType: 'enemy_mushroom',
  behavior: 'support',
  skills: [
    {
      id: 'mushroom_spore',
      name: '孢子喷射',
      description: '喷射有毒孢子',
      spCost: 0,
      cooldown: 0,
      currentCooldown: 0,
      targetType: 'enemy',
      effectType: 'damage',
      damageMultiplier: 0.8,
      damageType: 'physical',
      priority: 3,
    },
    {
      id: 'mushroom_poison_cloud',
      name: '毒雾',
      description: '释放毒雾对目标造成持续伤害',
      spCost: 8,
      cooldown: 3,
      currentCooldown: 0,
      targetType: 'enemy',
      effectType: 'dot',
      damageMultiplier: 0.3,
      damageType: 'magical',
      dotDamage: 4,
      dotDuration: 4,
      priority: 8,
    },
    {
      id: 'mushroom_growth_boost',
      name: '生长促进',
      description: '释放孢子促进队友恢复',
      spCost: 10,
      cooldown: 5,
      currentCooldown: 0,
      targetType: 'ally',
      effectType: 'heal',
      damageMultiplier: 0,
      damageType: 'magical',
      healPercent: 0.12,
      priority: 9,
    },
    {
      id: 'mushroom_paralyze',
      name: '麻痹孢子',
      description: '释放麻痹孢子降低目标速度',
      spCost: 6,
      cooldown: 4,
      currentCooldown: 0,
      targetType: 'enemy',
      effectType: 'debuff',
      damageMultiplier: 0,
      damageType: 'magical',
      priority: 7,
      modifier: {
        sourceId: 'mushroom_paralyze',
        stat: 'speed',
        type: 'percent',
        value: -0.35,
        duration: 3,
      },
    },
  ],
  params: {
    aggression: 0.2,
    skillPreference: 0.7,
    healWhenLow: 0.3,
    fleeThreshold: 0.3,
  },
}

// =============================================
// AI配置映射
// =============================================

/** 所有敌人AI配置 */
export const ENEMY_AI_CONFIGS: Record<string, EnemyAIConfig> = {
  enemy_wolf: WOLF_AI_CONFIG,
  enemy_goblin: GOBLIN_AI_CONFIG,
  enemy_treant: TREANT_AI_CONFIG,
  enemy_ghost: GHOST_AI_CONFIG,
  enemy_mushroom: MUSHROOM_AI_CONFIG,
}

/**
 * 获取敌人AI配置
 */
export function getEnemyAIConfig(enemyType: string): EnemyAIConfig | undefined {
  return ENEMY_AI_CONFIGS[enemyType]
}

/**
 * 获取BOSS当前阶段
 */
export function getBossPhase(phases: BossPhase[], currentHpPercent: number): BossPhase {
  // 从高阶段往低阶段查找
  for (let i = phases.length - 1; i >= 0; i--) {
    if (currentHpPercent <= phases[i].hpThreshold) {
      // 继续检查更低HP的阶段
      continue
    }
    return phases[i]
  }
  // HP最低阶段
  return phases[phases.length - 1]
}

/**
 * 检查是否需要阶段转换
 */
export function checkBossPhaseTransition(
  currentPhase: number,
  currentHpPercent: number,
  phases: BossPhase[],
): { shouldTransition: boolean; newPhase: number; dialogue?: string } {
  const nextPhaseIndex = currentPhase + 1
  if (nextPhaseIndex >= phases.length) {
    return { shouldTransition: false, newPhase: currentPhase }
  }

  const nextPhase = phases[nextPhaseIndex]
  if (currentHpPercent <= nextPhase.hpThreshold) {
    return {
      shouldTransition: true,
      newPhase: nextPhaseIndex,
      dialogue: nextPhase.transitionDialogue,
    }
  }

  return { shouldTransition: false, newPhase: currentPhase }
}

/** 全局敌人AI引擎实例 */
export const enemyAIEngine = new EnemyAIEngine()
