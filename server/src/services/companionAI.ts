// 星火小镇 — NPC队友战斗系统
// T3.4.6 可雇佣NPC参战、简单AI队友行为

import type { CombatStats, StatModifier, DamageResult } from './combatStats.js'
import {
  calculatePhysicalDamage,
  calculateMagicalDamage,
  calculateTrueDamage,
  getModifiedCombatStats,
} from './combatStats.js'

// =============================================
// 队友角色定义
// =============================================

/** 队友行为模式 */
export type CompanionBehaviorType = 'warrior' | 'healer' | 'mage' | 'rogue' | 'guardian'

/** NPC队友技能 */
export interface CompanionSkill {
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
  targetType: 'self' | 'enemy' | 'ally' | 'all_allies' | 'all_enemies'
  /** 效果类型 */
  effectType: 'damage' | 'heal' | 'buff' | 'debuff'
  /** 伤害倍率 */
  damageMultiplier: number
  /** 伤害类型 */
  damageType: 'physical' | 'magical' | 'true'
  /** 治疗百分比（占最大HP） */
  healPercent?: number
  /** Buff/Debuff修正器 */
  modifier?: StatModifier
  /** 优先级 */
  priority: number
}

/** 队友配置 */
export interface CompanionConfig {
  /** NPC ID */
  npcId: string
  /** NPC名字 */
  name: string
  /** 行为模式 */
  behavior: CompanionBehaviorType
  /** 队友技能列表 */
  skills: CompanionSkill[]
  /** AI参数 */
  params: {
    /** 攻击倾向 */
    aggression: number
    /** 使用技能倾向 */
    skillPreference: number
    /** 低HP时治疗倾向 */
    healWhenLow: number
    /** 保护玩家倾向（0-1） */
    protectPlayer: number
  }
  /** 雇佣费用（星币） */
  hireCost: number
  /** 好感度要求（达到才可雇佣） */
  requiredAffection: number
}

// =============================================
// 队友AI决策
// =============================================

/** 队友AI决策结果 */
export interface CompanionDecision {
  /** 行动类型 */
  action: 'attack' | 'skill' | 'heal' | 'buff_ally' | 'defend_player' | 'wait'
  /** 选择的技能 */
  skill?: CompanionSkill
  /** 目标ID */
  targetId?: string
  /** 决策理由 */
  reason: string
}

// =============================================
// 可雇佣NPC预设配置
// =============================================

/** 托比亚斯（学者/法师型队友）— 远程魔法攻击 */
export const TOBIAS_COMPANION: CompanionConfig = {
  npcId: 'npc_tobias',
  name: '托比亚斯',
  behavior: 'mage',
  skills: [
    {
      id: 'tobias_arcane_bolt',
      name: '奥术飞弹',
      description: '发射魔法飞弹攻击目标',
      spCost: 8,
      cooldown: 1,
      currentCooldown: 0,
      targetType: 'enemy',
      effectType: 'damage',
      damageMultiplier: 1.5,
      damageType: 'magical',
      priority: 7,
    },
    {
      id: 'tobias_arcane_shield',
      name: '奥术护盾',
      description: '为玩家施加护盾，提升防御力',
      spCost: 12,
      cooldown: 4,
      currentCooldown: 0,
      targetType: 'ally',
      effectType: 'buff',
      damageMultiplier: 0,
      damageType: 'magical',
      priority: 8,
      modifier: {
        sourceId: 'tobias_arcane_shield',
        stat: 'defense',
        type: 'percent',
        value: 0.4,
        duration: 3,
      },
    },
    {
      id: 'tobias_heal',
      name: '治愈术',
      description: '恢复目标的HP',
      spCost: 15,
      cooldown: 3,
      currentCooldown: 0,
      targetType: 'ally',
      effectType: 'heal',
      damageMultiplier: 0,
      damageType: 'magical',
      healPercent: 0.2,
      priority: 9,
    },
  ],
  params: {
    aggression: 0.5,
    skillPreference: 0.7,
    healWhenLow: 0.6,
    protectPlayer: 0.4,
  },
  hireCost: 30,
  requiredAffection: 40,
}

/** 艾拉（猎人/盗贼型队友）— 高速物理输出 */
export const ELLA_COMPANION: CompanionConfig = {
  npcId: 'npc_ella',
  name: '艾拉',
  behavior: 'rogue',
  skills: [
    {
      id: 'ella_quick_shot',
      name: '速射',
      description: '快速射出箭矢',
      spCost: 5,
      cooldown: 0,
      currentCooldown: 0,
      targetType: 'enemy',
      effectType: 'damage',
      damageMultiplier: 1.2,
      damageType: 'physical',
      priority: 5,
    },
    {
      id: 'ella_poison_arrow',
      name: '毒箭',
      description: '射出毒箭，造成持续伤害',
      spCost: 10,
      cooldown: 3,
      currentCooldown: 0,
      targetType: 'enemy',
      effectType: 'damage',
      damageMultiplier: 1.0,
      damageType: 'physical',
      priority: 7,
    },
    {
      id: 'ella_distract',
      name: '干扰',
      description: '降低目标攻击力',
      spCost: 8,
      cooldown: 4,
      currentCooldown: 0,
      targetType: 'enemy',
      effectType: 'debuff',
      damageMultiplier: 0,
      damageType: 'physical',
      priority: 6,
      modifier: {
        sourceId: 'ella_distract',
        stat: 'attack',
        type: 'percent',
        value: -0.3,
        duration: 3,
      },
    },
    {
      id: 'ella_double_strike',
      name: '双重射击',
      description: '连续射出两支箭矢，高伤害',
      spCost: 15,
      cooldown: 5,
      currentCooldown: 0,
      targetType: 'enemy',
      effectType: 'damage',
      damageMultiplier: 2.2,
      damageType: 'physical',
      priority: 9,
    },
  ],
  params: {
    aggression: 0.7,
    skillPreference: 0.5,
    healWhenLow: 0,
    protectPlayer: 0.3,
  },
  hireCost: 25,
  requiredAffection: 35,
}

/** 老巴克（战士/守护者型队友）— 前排肉盾 */
export const OLD_BUCK_COMPANION: CompanionConfig = {
  npcId: 'npc_old_buck',
  name: '老巴克',
  behavior: 'guardian',
  skills: [
    {
      id: 'buck_cleave',
      name: '横劈',
      description: '大力横劈目标',
      spCost: 0,
      cooldown: 0,
      currentCooldown: 0,
      targetType: 'enemy',
      effectType: 'damage',
      damageMultiplier: 1.3,
      damageType: 'physical',
      priority: 4,
    },
    {
      id: 'buck_taunt',
      name: '嘲讽',
      description: '嘲讽敌人，吸引仇恨',
      spCost: 8,
      cooldown: 3,
      currentCooldown: 0,
      targetType: 'all_enemies',
      effectType: 'debuff',
      damageMultiplier: 0,
      damageType: 'physical',
      priority: 8,
      modifier: {
        sourceId: 'buck_taunt',
        stat: 'attack',
        type: 'percent',
        value: -0.15,
        duration: 2,
      },
    },
    {
      id: 'buck_battle_cry',
      name: '战吼',
      description: '激励队友，提升攻击力',
      spCost: 12,
      cooldown: 5,
      currentCooldown: 0,
      targetType: 'all_allies',
      effectType: 'buff',
      damageMultiplier: 0,
      damageType: 'physical',
      priority: 7,
      modifier: {
        sourceId: 'buck_battle_cry',
        stat: 'attack',
        type: 'percent',
        value: 0.25,
        duration: 3,
      },
    },
    {
      id: 'buck_shield_wall',
      name: '盾墙',
      description: '大幅提升自身防御，保护队友',
      spCost: 15,
      cooldown: 6,
      currentCooldown: 0,
      targetType: 'self',
      effectType: 'buff',
      damageMultiplier: 0,
      damageType: 'physical',
      priority: 9,
      modifier: {
        sourceId: 'buck_shield_wall',
        stat: 'defense',
        type: 'percent',
        value: 0.8,
        duration: 3,
      },
    },
  ],
  params: {
    aggression: 0.4,
    skillPreference: 0.4,
    healWhenLow: 0,
    protectPlayer: 0.7,
  },
  hireCost: 20,
  requiredAffection: 30,
}

/** 莉拉（牧师/治疗型队友）— 专注恢复和辅助 */
export const LILA_COMPANION: CompanionConfig = {
  npcId: 'npc_lila',
  name: '莉拉',
  behavior: 'healer',
  skills: [
    {
      id: 'lila_heal',
      name: '治疗术',
      description: '恢复目标HP',
      spCost: 10,
      cooldown: 1,
      currentCooldown: 0,
      targetType: 'ally',
      effectType: 'heal',
      damageMultiplier: 0,
      damageType: 'magical',
      healPercent: 0.25,
      priority: 8,
    },
    {
      id: 'lila_greater_heal',
      name: '强力治疗',
      description: '大幅恢复目标HP',
      spCost: 20,
      cooldown: 4,
      currentCooldown: 0,
      targetType: 'ally',
      effectType: 'heal',
      damageMultiplier: 0,
      damageType: 'magical',
      healPercent: 0.45,
      priority: 10,
    },
    {
      id: 'lila_bless',
      name: '祝福',
      description: '提升全队攻击和速度',
      spCost: 15,
      cooldown: 5,
      currentCooldown: 0,
      targetType: 'all_allies',
      effectType: 'buff',
      damageMultiplier: 0,
      damageType: 'magical',
      priority: 7,
      modifier: {
        sourceId: 'lila_bless',
        stat: 'attack',
        type: 'percent',
        value: 0.3,
        duration: 4,
      },
    },
    {
      id: 'lila_smite',
      name: '圣光惩击',
      description: '用圣光攻击敌人',
      spCost: 12,
      cooldown: 2,
      currentCooldown: 0,
      targetType: 'enemy',
      effectType: 'damage',
      damageMultiplier: 1.3,
      damageType: 'magical',
      priority: 5,
    },
  ],
  params: {
    aggression: 0.2,
    skillPreference: 0.6,
    healWhenLow: 0.9,
    protectPlayer: 0.5,
  },
  hireCost: 35,
  requiredAffection: 45,
}

/** 所有可雇佣NPC配置映射 */
export const COMPANION_CONFIGS: Record<string, CompanionConfig> = {
  npc_tobias: TOBIAS_COMPANION,
  npc_ella: ELLA_COMPANION,
  npc_old_buck: OLD_BUCK_COMPANION,
  npc_lila: LILA_COMPANION,
}

// =============================================
// 队友AI引擎
// =============================================

/**
 * CompanionAIEngine — NPC队友AI引擎
 *
 * 4种行为模式：
 * 1. warrior — 前排输出，优先攻击
 * 2. healer — 优先治疗低HP队友
 * 3. mage — 远程魔法输出
 * 4. rogue — 高速物理输出，优先攻击弱者
 * 5. guardian — 保护玩家，吸引仇恨
 */
class CompanionAIEngine {
  /**
   * 队友AI决策
   *
   * @param config 队友配置
   * @param selfStats 自身属性
   * @param selfModifiers 自身修正
   * @param playerStats 玩家属性（用于保护决策）
   * @param allies 全队友方（含自己）
   * @param enemies 敌方列表
   * @param turnCount 回合数
   */
  decide(
    config: CompanionConfig,
    selfStats: CombatStats,
    _selfModifiers: StatModifier[],
    playerStats: CombatStats,
    allies: Array<{ id: string; stats: CombatStats; modifiers: StatModifier[] }>,
    enemies: Array<{ id: string; stats: CombatStats; modifiers: StatModifier[] }>,
    turnCount: number,
  ): CompanionDecision {
    const availableSkills = this.getAvailableSkills(config.skills, turnCount)
    const selfHpPercent = selfStats.hp / selfStats.maxHp

    // 1. 检查玩家HP低 → 保护玩家
    const playerHpPercent = playerStats.hp / playerStats.maxHp
    if (playerHpPercent < 0.3) {
      // 玩家HP低于30%时，优先治疗/保护玩家
      if (config.params.protectPlayer > 0.5) {
        // 治疗型：优先治疗玩家
        const healSkill = availableSkills.find((s) => s.effectType === 'heal')
        if (healSkill && selfStats.sp >= healSkill.spCost) {
          return {
            action: 'heal',
            skill: healSkill,
            targetId: 'player',
            reason: '玩家HP危急，优先治疗',
          }
        }
        // 守护型：给玩家加防御buff
        const buffSkill = availableSkills.find(
          (s) => s.effectType === 'buff' && s.targetType === 'ally',
        )
        if (buffSkill && selfStats.sp >= buffSkill.spCost) {
          return {
            action: 'buff_ally',
            skill: buffSkill,
            targetId: 'player',
            reason: '玩家HP危急，施加保护buff',
          }
        }
      }
    }

    // 2. 检查自身或队友HP低 → 治疗
    if (selfHpPercent < 0.4 && config.params.healWhenLow > 0.3) {
      const healSkill = availableSkills.find((s) => s.effectType === 'heal')
      if (healSkill && selfStats.sp >= healSkill.spCost) {
        // 治疗最需要的人
        const lowestAlly = this.findLowestHpAlly(allies)
        return {
          action: 'heal',
          skill: healSkill,
          targetId: lowestAlly?.id ?? 'self',
          reason: '队友HP低，使用治疗',
        }
      }
    }

    // 治疗型角色：总是检查全队HP
    if (config.behavior === 'healer') {
      const lowestAlly = this.findLowestHpAlly(allies)
      if (lowestAlly && lowestAlly.stats.hp / lowestAlly.stats.maxHp < 0.5) {
        const healSkill = availableSkills.find((s) => s.effectType === 'heal')
        if (healSkill && selfStats.sp >= healSkill.spCost) {
          return {
            action: 'heal',
            skill: healSkill,
            targetId: lowestAlly.id,
            reason: '队友HP不足50%，使用治疗',
          }
        }
      }
    }

    // 3. 根据行为模式选择行动
    switch (config.behavior) {
      case 'warrior':
        return this.decideWarrior(config, availableSkills, enemies, selfStats)
      case 'healer':
        return this.decideHealer(config, availableSkills, allies, enemies, selfStats)
      case 'mage':
        return this.decideMage(config, availableSkills, enemies, selfStats)
      case 'rogue':
        return this.decideRogue(config, availableSkills, enemies, selfStats)
      case 'guardian':
        return this.decideGuardian(config, availableSkills, enemies, playerStats, selfStats)
      default:
        return { action: 'attack', targetId: enemies[0]?.id, reason: '默认攻击' }
    }
  }

  /** 战士型 — 优先攻击最强目标 */
  private decideWarrior(
    config: CompanionConfig,
    skills: CompanionSkill[],
    enemies: Array<{ id: string; stats: CombatStats }>,
    selfStats: CombatStats,
  ): CompanionDecision {
    const attackSkills = skills.filter((s) => s.effectType === 'damage')
    const buffSkills = skills.filter((s) => s.effectType === 'buff')

    // 有buff技能时先使用
    if (buffSkills.length > 0 && Math.random() < 0.3 && selfStats.sp >= buffSkills[0].spCost) {
      return {
        action: 'buff_ally',
        skill: buffSkills[0],
        targetId: 'self',
        reason: '使用增益技能提升自身',
      }
    }

    // 使用攻击技能
    if (attackSkills.length > 0 && Math.random() < config.params.skillPreference) {
      const skill = attackSkills.sort((a, b) => b.priority - a.priority)[0]
      if (selfStats.sp >= skill.spCost) {
        const target = this.findHighestThreat(enemies)
        return {
          action: 'skill',
          skill,
          targetId: target?.id,
          reason: '使用攻击技能攻击最强目标',
        }
      }
    }

    const target = this.findHighestThreat(enemies)
    return { action: 'attack', targetId: target?.id, reason: '普攻最强目标' }
  }

  /** 治疗型 — 优先治疗，偶尔攻击 */
  private decideHealer(
    config: CompanionConfig,
    skills: CompanionSkill[],
    allies: Array<{ id: string; stats: CombatStats }>,
    enemies: Array<{ id: string; stats: CombatStats }>,
    selfStats: CombatStats,
  ): CompanionDecision {
    const healSkills = skills.filter((s) => s.effectType === 'heal')
    const damageSkills = skills.filter((s) => s.effectType === 'damage')
    const buffSkills = skills.filter((s) => s.effectType === 'buff')

    // 检查全队HP
    const lowestAlly = this.findLowestHpAlly(allies)
    if (lowestAlly && lowestAlly.stats.hp / lowestAlly.stats.maxHp < 0.6) {
      const healSkill = healSkills.find((s) => selfStats.sp >= s.spCost)
      if (healSkill) {
        return {
          action: 'heal',
          skill: healSkill,
          targetId: lowestAlly.id,
          reason: '队友HP低于60%，使用治疗',
        }
      }
    }

    // 全队HP健康时给buff
    if (buffSkills.length > 0 && Math.random() < 0.4 && selfStats.sp >= buffSkills[0].spCost) {
      return {
        action: 'buff_ally',
        skill: buffSkills[0],
        targetId: 'all_allies',
        reason: '全队健康，施加增益',
      }
    }

    // 偶尔攻击
    if (damageSkills.length > 0 && Math.random() < config.params.aggression) {
      const skill = damageSkills.find((s) => selfStats.sp >= s.spCost)
      if (skill) {
        const target = this.findWeakestTarget(enemies)
        return { action: 'skill', skill, targetId: target?.id, reason: '使用攻击技能' }
      }
    }

    const target = this.findWeakestTarget(enemies)
    return { action: 'attack', targetId: target?.id, reason: '普攻最弱目标' }
  }

  /** 法师型 — 远程魔法输出 */
  private decideMage(
    config: CompanionConfig,
    skills: CompanionSkill[],
    enemies: Array<{ id: string; stats: CombatStats }>,
    selfStats: CombatStats,
  ): CompanionDecision {
    const magicSkills = skills.filter((s) => s.effectType === 'damage' && s.damageType === 'magical')
    const buffSkills = skills.filter((s) => s.effectType === 'buff')

    // 优先使用魔法技能
    if (magicSkills.length > 0 && selfStats.sp >= magicSkills[0].spCost) {
      const skill = magicSkills.sort((a, b) => b.damageMultiplier - a.damageMultiplier)[0]
      if (Math.random() < config.params.skillPreference) {
        const target = this.findWeakestTarget(enemies)
        return { action: 'skill', skill, targetId: target?.id, reason: '使用魔法攻击' }
      }
    }

    // SP不足时使用普攻
    if (buffSkills.length > 0 && selfStats.sp < 10 && Math.random() < 0.2) {
      return { action: 'buff_ally', skill: buffSkills[0], targetId: 'self', reason: 'SP不足，使用辅助技能' }
    }

    const target = this.findWeakestTarget(enemies)
    return { action: 'attack', targetId: target?.id, reason: '普攻' }
  }

  /** 盗贼型 — 高速输出，优先弱者 */
  private decideRogue(
    config: CompanionConfig,
    skills: CompanionSkill[],
    enemies: Array<{ id: string; stats: CombatStats }>,
    selfStats: CombatStats,
  ): CompanionDecision {
    const damageSkills = skills.filter((s) => s.effectType === 'damage')
    const debuffSkills = skills.filter((s) => s.effectType === 'debuff')

    // 优先削弱最强敌人
    if (debuffSkills.length > 0 && Math.random() < 0.4 && selfStats.sp >= debuffSkills[0].spCost) {
      const target = this.findHighestThreat(enemies)
      return { action: 'skill', skill: debuffSkills[0], targetId: target?.id, reason: '削弱最强敌人' }
    }

    // 使用高伤害技能攻击最弱目标
    if (damageSkills.length > 0 && Math.random() < config.params.skillPreference) {
      const skill = damageSkills.sort((a, b) => b.damageMultiplier - a.damageMultiplier)[0]
      if (selfStats.sp >= skill.spCost) {
        const target = this.findWeakestTarget(enemies)
        return { action: 'skill', skill, targetId: target?.id, reason: '使用高伤害技能攻击最弱目标' }
      }
    }

    const target = this.findWeakestTarget(enemies)
    return { action: 'attack', targetId: target?.id, reason: '普攻最弱目标' }
  }

  /** 守护型 — 保护玩家，吸引仇恨 */
  private decideGuardian(
    config: CompanionConfig,
    skills: CompanionSkill[],
    enemies: Array<{ id: string; stats: CombatStats }>,
    playerStats: CombatStats,
    selfStats: CombatStats,
  ): CompanionDecision {
    const buffSkills = skills.filter((s) => s.effectType === 'buff')
    const debuffSkills = skills.filter((s) => s.effectType === 'debuff')
    const damageSkills = skills.filter((s) => s.effectType === 'damage')

    // 玩家HP低时优先保护
    const playerHpPercent = playerStats.hp / playerStats.maxHp
    if (playerHpPercent < 0.5 && config.params.protectPlayer > 0.5) {
      // 使用嘲讽或防御技能
      const tauntSkill = debuffSkills.find((s) => s.targetType === 'all_enemies')
      if (tauntSkill && selfStats.sp >= tauntSkill.spCost) {
        return { action: 'skill', skill: tauntSkill, targetId: 'all_enemies', reason: '嘲讽敌人保护玩家' }
      }
      const shieldSkill = buffSkills.find((s) => s.targetType === 'self')
      if (shieldSkill && selfStats.sp >= shieldSkill.spCost) {
        return { action: 'buff_ally', skill: shieldSkill, targetId: 'self', reason: '使用护盾保护' }
      }
    }

    // 使用攻击技能
    if (damageSkills.length > 0 && Math.random() < config.params.skillPreference) {
      const skill = damageSkills.find((s) => selfStats.sp >= s.spCost)
      if (skill) {
        const target = this.findHighestThreat(enemies)
        return { action: 'skill', skill, targetId: target?.id, reason: '攻击最强敌人' }
      }
    }

    const target = this.findHighestThreat(enemies)
    return { action: 'attack', targetId: target?.id, reason: '普攻最强敌人' }
  }

  // =============================================
  // 辅助方法
  // =============================================

  private getAvailableSkills(skills: CompanionSkill[], _turnCount: number): CompanionSkill[] {
    return skills.filter((s) => s.currentCooldown <= 0)
  }

  private findWeakestTarget(enemies: Array<{ id: string; stats: CombatStats }>): { id: string } | undefined {
    if (enemies.length === 0) return undefined
    return enemies.reduce((min, e) => e.stats.hp < min.stats.hp ? e : min)
  }

  private findHighestThreat(enemies: Array<{ id: string; stats: CombatStats }>): { id: string } | undefined {
    if (enemies.length === 0) return undefined
    return enemies.reduce((max, e) => e.stats.attack > max.stats.attack ? e : max)
  }

  private findLowestHpAlly(allies: Array<{ id: string; stats: CombatStats }>): { id: string; stats: CombatStats } | undefined {
    if (allies.length === 0) return undefined
    return allies.reduce((min, a) => {
      const aRatio = a.stats.hp / a.stats.maxHp
      const minRatio = min.stats.hp / min.stats.maxHp
      return aRatio < minRatio ? a : min
    })
  }
}

// =============================================
// 队友战斗结果计算
// =============================================

/** 队友攻击伤害计算 */
export function calculateCompanionDamage(
  attackerStats: CombatStats,
  attackerModifiers: StatModifier[],
  targetStats: CombatStats,
  skillMultiplier: number = 1.0,
  damageType: 'physical' | 'magical' | 'true' = 'physical',
): DamageResult {
  const effectiveAttacker = getModifiedCombatStats(attackerStats, attackerModifiers)

  switch (damageType) {
    case 'magical':
      return calculateMagicalDamage(effectiveAttacker.attack, 0, skillMultiplier)
    case 'true':
      return calculateTrueDamage(effectiveAttacker.attack, skillMultiplier)
    default:
      return calculatePhysicalDamage(
        effectiveAttacker.attack,
        targetStats.defense,
        effectiveAttacker.critRate,
        effectiveAttacker.critDamage,
        targetStats.dodgeRate,
        skillMultiplier,
      )
  }
}

/** 队友治疗量计算 */
export function calculateCompanionHeal(
  targetMaxHp: number,
  healPercent: number,
  healBonus: number = 0,
): { amount: number; message: string } {
  const baseHeal = targetMaxHp * healPercent
  const healAmount = Math.max(1, Math.floor(baseHeal * (1 + healBonus)))
  return {
    amount: healAmount,
    message: `恢复 ${healAmount} 点HP`,
  }
}

// =============================================
// 雇佣系统
// =============================================

/** 雇佣状态 */
export interface HireStatus {
  /** 是否已雇佣 */
  hired: boolean
  /** 雇佣费用 */
  cost: number
  /** 是否满足好感度要求 */
  affectionMet: boolean
  /** 消息 */
  message: string
}

/**
 * 检查是否可以雇佣NPC队友
 */
export function checkHireCompanion(
  npcId: string,
  playerStarCoins: number,
  playerAffection: number,
): HireStatus {
  const config = COMPANION_CONFIGS[npcId]
  if (!config) {
    return { hired: false, cost: 0, affectionMet: false, message: '该NPC不可雇佣为队友' }
  }

  if (playerAffection < config.requiredAffection) {
    return {
      hired: false,
      cost: config.hireCost,
      affectionMet: false,
      message: `好感度不足，需要${config.requiredAffection}以上`,
    }
  }

  if (playerStarCoins < config.hireCost) {
    return {
      hired: false,
      cost: config.hireCost,
      affectionMet: true,
      message: `星币不足，需要${config.hireCost}星币`,
    }
  }

  return {
    hired: true,
    cost: config.hireCost,
    affectionMet: true,
    message: `成功雇佣${config.name}！花费${config.hireCost}星币`,
  }
}

/** 全局队友AI引擎实例 */
export const companionAIEngine = new CompanionAIEngine()
