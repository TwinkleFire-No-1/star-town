// 星火小镇 — RTwP战斗引擎
// T3.4.2 实时暂停战斗逻辑：行动队列、暂停控制、伤害计算
// T3.4.3 集成属性与伤害计算系统
// T3.4.4 集成敌人AI与技能系统

import { createLogger } from '../utils/index.js'
import {
  type CombatStats,
  type StatModifier,
  type DamageResult,
  calculatePhysicalDamage,
  calculateMagicalDamage,
  calculateTrueDamage,
  getModifiedCombatStats,
} from './combatStats.js'
import {
  type EnemySkill,
  type AIDecision,
  type BossFightState,
  enemyAIEngine,
  getEnemyAIConfig,
} from './enemyAI.js'

const logger = createLogger('BattleEngine')

// =============================================
// 战斗类型定义
// =============================================

/** 战斗参与者阵营 */
export type BattleSide = 'player' | 'enemy'

/** 战斗状态 */
export type BattleState = 'preparing' | 'active' | 'paused' | 'victory' | 'defeat' | 'fled'

/** 战斗参与者 */
export interface BattleCombatant {
  id: string
  name: string
  side: BattleSide
  hp: number
  maxHp: number
  attack: number
  defense: number
  /** 速度（决定行动顺序与频率） */
  speed: number
  /** SP（技能点） */
  sp: number
  /** 最大SP */
  maxSp: number
  /** 暴击率（0-1） */
  critRate: number
  /** 暴击伤害倍率 */
  critDamage: number
  /** 闪避率（0-1） */
  dodgeRate: number
  /** 当前行动冷却（游戏tick） */
  cooldown: number
  /** 是否已被击败 */
  defeated: boolean
  /** 额外属性修正 */
  modifiers: StatModifier[]
  /** 敌人类型ID（AI用） */
  enemyType?: string
  /** BOSS阶段状态 */
  bossState?: BossFightState
  /** 持续伤害列表 */
  dots: DotEffect[]
}

/** 持续伤害效果 */
export interface DotEffect {
  id: string
  sourceId: string
  damagePerTick: number
  remainingTicks: number
}

/** 战斗增益/减益效果（兼容旧buff接口） */
export interface BattleBuff {
  id: string
  name: string
  type: 'buff' | 'debuff'
  stat: 'attack' | 'defense' | 'speed'
  value: number
  duration: number // 剩余tick数
}

/** 战斗行动 */
export interface BattleAction {
  type: 'attack' | 'skill' | 'item' | 'flee'
  actorId: string
  targetId: string
  skillId?: string
  itemId?: string
  damage?: number
  heal?: number
  message: string
}

/** 战斗事件 */
export interface BattleEvent {
  type: 'action' | 'damage' | 'heal' | 'defeat' | 'victory' | 'defeat_all' | 'buff' | 'debuff' | 'turn_start'
  battleId: string
  timestamp: number
  data: Record<string, any>
}

/** 战斗结果 */
export interface BattleResult {
  battleId: string
  state: BattleState
  playerHp: number
  playerMaxHp: number
  expGained: number
  coinsGained: number
  itemsDropped: Array<{ itemId: string; name: string; quantity: number }>
  messages: string[]
}

// =============================================
// RTwP 战斗引擎
// =============================================

/**
 * BattleEngine — RTwP战斗引擎
 *
 * RTwP (Real-Time with Pause) 模式：
 * - 实时：所有参与者同时行动，按速度决定行动频率
 * - 暂停：玩家可随时暂停战斗，规划策略
 * - 行动队列：暂停时可预排行动
 *
 * 核心机制：
 * 1. 行动冷却：每个参与者有独立冷却条，速度越快冷却越短
 * 2. 暂停/恢复：暂停时所有冷却冻结，玩家可下达指令
 * 3. 伤害计算：攻击力 - 防御力 + 随机波动
 * 4. 行动选择：AI自动选择目标，玩家可手动指定
 */
class BattleEngine {
  /** 活跃战斗映射 */
  private battles = new Map<string, BattleInstance>()

  /** Socket.IO */
  private io: any = null

  /** Tick间隔（ms） */
  private tickInterval = 500

  /** Tick定时器 */
  private tickTimer: ReturnType<typeof setInterval> | null = null

  /** 是否运行中 */
  private running = false

  // =============================================
  // 初始化
  // =============================================

  /**
   * 设置Socket.IO
   */
  setIo(io: any): void {
    this.io = io
  }

  /**
   * 启动战斗引擎
   */
  start(): void {
    if (this.running) return
    this.running = true
    this.tickTimer = setInterval(() => this.tick(), this.tickInterval)
    logger.info('BattleEngine started')
  }

  /**
   * 停止战斗引擎
   */
  stop(): void {
    if (this.tickTimer) {
      clearInterval(this.tickTimer)
      this.tickTimer = null
    }
    this.running = false
    logger.info('BattleEngine stopped')
  }

  // =============================================
  // 战斗创建
  // =============================================

  /**
   * 创建战斗
   * @param mode 'rtwp'=实时暂停（原RTwP模式）| 'turn'=回合制（赛尔号式：玩家先手→敌人反击）
   */
  createBattle(
    battleId: string,
    player: { id: string; name: string; hp: number; maxHp: number; attack: number; defense: number; speed: number },
    enemies: Array<{ id: string; name: string; hp: number; maxHp: number; attack: number; defense: number; speed: number }>,
    mode: 'rtwp' | 'turn' = 'rtwp',
  ): BattleInstance {
    const combatants: BattleCombatant[] = [
      {
        id: player.id,
        name: player.name,
        side: 'player',
        hp: player.hp,
        maxHp: player.maxHp,
        attack: player.attack,
        defense: player.defense,
        speed: player.speed,
        sp: (player as any).sp ?? 50,
        maxSp: (player as any).maxSp ?? 50,
        critRate: (player as any).critRate ?? 0.05,
        critDamage: (player as any).critDamage ?? 1.5,
        dodgeRate: (player as any).dodgeRate ?? 0.03,
        cooldown: 0,
        defeated: false,
        modifiers: [],
        dots: [],
      },
      ...enemies.map((e) => {
        const aiConfig = getEnemyAIConfig(e.id)
        return {
          id: e.id,
          name: e.name,
          side: 'enemy' as BattleSide,
          hp: e.hp,
          maxHp: e.maxHp,
          attack: e.attack,
          defense: e.defense,
          speed: e.speed,
          sp: (e as any).sp ?? 0,
          maxSp: (e as any).maxSp ?? 0,
          critRate: (e as any).critRate ?? 0.05,
          critDamage: (e as any).critDamage ?? 1.5,
          dodgeRate: (e as any).dodgeRate ?? 0.03,
          cooldown: 0,
          defeated: false,
          modifiers: [] as StatModifier[],
          enemyType: aiConfig?.enemyType,
          bossState: e.id === 'boss_forest_guardian' ? { currentPhase: 0, phaseHistory: [0], hasTransitioned: false } : undefined,
          dots: [] as DotEffect[],
        }
      }),
    ]

    const battle: BattleInstance = {
      id: battleId,
      mode,
      state: 'active',
      combatants,
      actions: [],
      tickCount: 0,
      messages: [],
      roundEvents: [],
    }

    this.battles.set(battleId, battle)
    logger.info(`Battle ${battleId} created: ${combatants.length} combatants`)

    // 通知客户端
    this.emitBattleEvent(battleId, {
      type: 'turn_start',
      timestamp: Date.now(),
      data: { message: '战斗开始!' },
    })

    return battle
  }

  // =============================================
  // 主循环
  // =============================================

  /**
   * 每个tick执行
   */
  private tick(): void {
    for (const [battleId, battle] of this.battles) {
      if (battle.state !== 'active') continue
      // 回合制战斗由玩家指令驱动，tick不自动行动
      if (battle.mode === 'turn') continue

      battle.tickCount++

      // 减少所有战斗者的冷却
      for (const combatant of battle.combatants) {
        if (combatant.defeated) continue

        combatant.cooldown -= combatant.speed

        // 冷却归零，执行行动
        if (combatant.cooldown <= 0) {
          this.executeCombatantAction(battleId, combatant)
          combatant.cooldown = Math.floor(100 / Math.max(1, this.getEffectiveStat(combatant, 'speed') / 10))
        }
      }

      // 处理modifier持续时间
      for (const combatant of battle.combatants) {
        combatant.modifiers = combatant.modifiers.filter((mod) => {
          if (mod.duration === -1) return true // 永久
          mod.duration -= 1
          return mod.duration > 0
        })
      }

      // 处理DoT效果
      for (const combatant of battle.combatants) {
        if (combatant.defeated) continue
        for (const dot of combatant.dots) {
          if (dot.remainingTicks > 0) {
            combatant.hp = Math.max(0, combatant.hp - dot.damagePerTick)
            dot.remainingTicks--
            this.emitBattleEvent(battleId, {
              type: 'damage',
              timestamp: Date.now(),
              data: {
                attackerId: dot.sourceId,
                targetId: combatant.id,
                damage: dot.damagePerTick,
                targetHp: combatant.hp,
                targetMaxHp: combatant.maxHp,
                message: `${combatant.name} 受到 ${dot.damagePerTick} 点持续伤害!`,
              },
            })
            if (combatant.hp <= 0) {
              combatant.defeated = true
            }
          }
        }
        combatant.dots = combatant.dots.filter((d) => d.remainingTicks > 0)
      }
    }
  }

  /**
   * 执行战斗者行动
   */
  private executeCombatantAction(battleId: string, combatant: BattleCombatant): void {
    const battle = this.battles.get(battleId)
    if (!battle) return

    if (combatant.side === 'enemy') {
      // 敌人AI决策
      const aiConfig = getEnemyAIConfig(combatant.enemyType ?? combatant.id)
      if (aiConfig) {
        const enemies = battle.combatants.filter((c) => c.side === 'player' && !c.defeated)
        const allies = battle.combatants.filter((c) => c.side === 'enemy' && !c.defeated && c.id !== combatant.id)

        const decision = enemyAIEngine.decide(
          aiConfig,
          this.toCombatStats(combatant),
          combatant.modifiers,
          enemies.map((e) => ({ id: e.id, stats: this.toCombatStats(e), modifiers: e.modifiers })),
          allies.map((a) => ({ id: a.id, stats: this.toCombatStats(a), modifiers: a.modifiers })),
          battle.tickCount,
        )

        // 执行AI决策
        this.executeAIDecision(battleId, combatant, decision)
      } else {
        // 无AI配置，默认攻击玩家
        const player = battle.combatants.find((c) => c.side === 'player' && !c.defeated)
        if (player) {
          this.executeAttack(battleId, combatant, player)
        }
      }
    }
    // 玩家行动由客户端指令触发（executePlayerAction）
    // 如果没有指令，玩家自动攻击
    else {
      const enemy = battle.combatants.find((c) => c.side === 'enemy' && !c.defeated)
      if (enemy) {
        this.executeAttack(battleId, combatant, enemy)
      }
    }

    // 检查战斗结束
    this.checkBattleEnd(battleId)
  }

  /**
   * 执行AI决策
   */
  private executeAIDecision(battleId: string, combatant: BattleCombatant, decision: AIDecision): void {
    const battle = this.battles.get(battleId)
    if (!battle) return

    switch (decision.action) {
      case 'attack': {
        const target = battle.combatants.find((c) => c.id === decision.targetId && !c.defeated)
        if (target) {
          this.executeAttack(battleId, combatant, target)
        }
        break
      }
      case 'skill': {
        if (decision.skill) {
          this.executeEnemySkill(battleId, combatant, decision.skill, decision.targetId)
        }
        break
      }
      case 'heal': {
        if (decision.skill) {
          this.executeEnemySkill(battleId, combatant, decision.skill, decision.targetId)
        }
        break
      }
      case 'flee': {
        // 敌人逃跑
        combatant.defeated = true
        this.emitBattleEvent(battleId, {
          type: 'action',
          timestamp: Date.now(),
          data: { message: `${combatant.name} 逃跑了!` },
        })
        break
      }
      case 'wait':
      default:
        // 不行动
        break
    }
  }

  /**
   * 执行敌人技能
   */
  private executeEnemySkill(battleId: string, combatant: BattleCombatant, skill: EnemySkill, targetId?: string): void {
    const battle = this.battles.get(battleId)
    if (!battle) return

    // 消耗SP
    combatant.sp = Math.max(0, combatant.sp - skill.spCost)

    // 设置冷却
    skill.currentCooldown = skill.cooldown

    switch (skill.effectType) {
      case 'damage': {
        const target = battle.combatants.find((c) => c.id === targetId && !c.defeated)
        if (target) {
          if (skill.targetType === 'all_enemies') {
            // AOE技能
            const targets = battle.combatants.filter((c) => c.side === 'player' && !c.defeated)
            for (const t of targets) {
              this.applyDamage(battleId, combatant, t, skill.damageMultiplier, skill.damageType)
            }
          } else {
            this.applyDamage(battleId, combatant, target, skill.damageMultiplier, skill.damageType)
          }
        }
        break
      }
      case 'heal': {
        const healTarget = targetId === 'self'
          ? combatant
          : battle.combatants.find((c) => c.id === targetId && !c.defeated)
        if (healTarget && skill.healPercent) {
          const healAmount = Math.floor(healTarget.maxHp * skill.healPercent)
          healTarget.hp = Math.min(healTarget.maxHp, healTarget.hp + healAmount)
          this.emitBattleEvent(battleId, {
            type: 'heal',
            timestamp: Date.now(),
            data: {
              healerId: combatant.id,
              targetId: healTarget.id,
              amount: healAmount,
              targetHp: healTarget.hp,
              targetMaxHp: healTarget.maxHp,
              message: `${combatant.name} 使用 ${skill.name}，恢复 ${healAmount} 点HP!`,
            },
          })
        }
        break
      }
      case 'buff':
      case 'debuff': {
        const modTarget = targetId === 'self'
          ? combatant
          : battle.combatants.find((c) => c.id === targetId && !c.defeated)
        if (modTarget && skill.modifier) {
          modTarget.modifiers.push({ ...skill.modifier })
          const effectName = skill.effectType === 'buff' ? '增益' : '减益'
          this.emitBattleEvent(battleId, {
            type: skill.effectType === 'buff' ? 'buff' : 'debuff',
            timestamp: Date.now(),
            data: {
              casterId: combatant.id,
              targetId: modTarget.id,
              skillName: skill.name,
              message: `${modTarget.name} 获得了 ${skill.name} ${effectName}效果!`,
            },
          })
        }
        break
      }
      case 'dot': {
        const dotTarget = battle.combatants.find((c) => c.id === targetId && !c.defeated)
        if (dotTarget && skill.dotDamage && skill.dotDuration) {
          dotTarget.dots.push({
            id: `${skill.id}_dot_${Date.now()}`,
            sourceId: combatant.id,
            damagePerTick: skill.dotDamage,
            remainingTicks: skill.dotDuration,
          })
          // 同时造成初始伤害
          this.applyDamage(battleId, combatant, dotTarget, skill.damageMultiplier, skill.damageType)
          this.emitBattleEvent(battleId, {
            type: 'action',
            timestamp: Date.now(),
            data: {
              message: `${dotTarget.name} 被施加了 ${skill.name} 的持续伤害!`,
            },
          })
        }
        break
      }
      case 'summon': {
        // 召唤小怪（简化：在消息中提示）
        this.emitBattleEvent(battleId, {
          type: 'action',
          timestamp: Date.now(),
          data: {
            message: `${combatant.name} 使用 ${skill.name}，召唤了 ${skill.summonCount ?? 1} 个${skill.summonType ?? '小怪'}!`,
          },
        })
        break
      }
      default:
        break
    }
  }

  /**
   * 使用新的伤害计算系统造成伤害
   */
  private applyDamage(
    battleId: string,
    attacker: BattleCombatant,
    target: BattleCombatant,
    multiplier: number = 1.0,
    damageType: 'physical' | 'magical' | 'true' = 'physical',
  ): void {
    const battle = this.battles.get(battleId)
    const attackerStats = this.getEffectiveStats(attacker)
    const targetStats = this.getEffectiveStats(target)

    let result: DamageResult

    switch (damageType) {
      case 'magical':
        result = calculateMagicalDamage(attackerStats.attack, 0, multiplier)
        break
      case 'true':
        result = calculateTrueDamage(attackerStats.attack, multiplier)
        break
      default:
        result = calculatePhysicalDamage(
          attackerStats.attack,
          targetStats.defense,
          attackerStats.critRate,
          attackerStats.critDamage,
          targetStats.dodgeRate,
          multiplier,
        )
    }

    // 填充攻击者和目标ID
    result.attackerId = attacker.id
    result.targetId = target.id

    if (result.isDodge) {
      const ev: Omit<BattleEvent, 'battleId'> = {
        type: 'action',
        timestamp: Date.now(),
        data: {
          attackerId: attacker.id,
          targetId: target.id,
          message: `${attacker.name} 攻击 ${target.name}，但被闪避了!`,
        },
      }
      this.emitBattleEvent(battleId, ev)
      battle?.roundEvents?.push({ ...ev, battleId })
      return
    }

    target.hp = Math.max(0, target.hp - result.damage)

    const critText = result.isCrit ? '暴击! ' : ''
    const dmgTypeText = damageType === 'magical' ? '魔法' : damageType === 'true' ? '真实' : ''
    const ev: Omit<BattleEvent, 'battleId'> = {
      type: 'damage',
      timestamp: Date.now(),
      data: {
        attackerId: attacker.id,
        targetId: target.id,
        damage: result.damage,
        targetHp: target.hp,
        targetMaxHp: target.maxHp,
        isCrit: result.isCrit,
        damageType,
        message: `${attacker.name} ${critText}${dmgTypeText}攻击 ${target.name}，造成 ${result.damage} 点伤害!`,
      },
    }
    this.emitBattleEvent(battleId, ev)
    battle?.roundEvents?.push({ ...ev, battleId })

    if (target.hp <= 0) {
      target.defeated = true
      const defeatEv: Omit<BattleEvent, 'battleId'> = {
        type: 'defeat',
        timestamp: Date.now(),
        data: {
          defeatedId: target.id,
          defeatedName: target.name,
          side: target.side,
          message: `${target.name} 被击败了!`,
        },
      }
      this.emitBattleEvent(battleId, defeatEv)
      battle?.roundEvents?.push({ ...defeatEv, battleId })
    }
  }

  /**
   * 执行攻击（兼容旧接口，使用新的伤害计算）
   */
  private executeAttack(battleId: string, attacker: BattleCombatant, target: BattleCombatant): void {
    this.applyDamage(battleId, attacker, target, 1.0, 'physical')
  }

  /**
   * 获取有效属性值（含modifier，兼容旧接口）
   */
  private getEffectiveStat(combatant: BattleCombatant, stat: 'attack' | 'defense' | 'speed'): number {
    return this.getEffectiveStats(combatant)[stat]
  }

  /**
   * 获取完整有效属性（使用combatStats系统）
   */
  private getEffectiveStats(combatant: BattleCombatant): CombatStats {
    const baseStats: CombatStats = {
      hp: combatant.hp,
      maxHp: combatant.maxHp,
      sp: combatant.sp,
      maxSp: combatant.maxSp,
      attack: combatant.attack,
      defense: combatant.defense,
      speed: combatant.speed,
      critRate: combatant.critRate,
      critDamage: combatant.critDamage,
      dodgeRate: combatant.dodgeRate,
    }
    return getModifiedCombatStats(baseStats, combatant.modifiers)
  }

  /**
   * BattleCombatant → CombatStats
   */
  private toCombatStats(c: BattleCombatant): CombatStats {
    return this.getEffectiveStats(c)
  }

  /**
   * 检查战斗结束
   */
  private checkBattleEnd(battleId: string): void {
    const battle = this.battles.get(battleId)
    if (!battle || battle.state !== 'active') return

    const playerDefeated = battle.combatants.filter((c) => c.side === 'player').every((c) => c.defeated)
    const enemiesDefeated = battle.combatants.filter((c) => c.side === 'enemy').every((c) => c.defeated)

    if (enemiesDefeated) {
      battle.state = 'victory'
      const ev: Omit<BattleEvent, 'battleId'> = {
        type: 'victory',
        timestamp: Date.now(),
        data: { message: '战斗胜利!' },
      }
      this.emitBattleEvent(battleId, ev)
      battle?.roundEvents?.push({ ...ev, battleId })
      logger.info(`Battle ${battleId}: Victory`)
    } else if (playerDefeated) {
      battle.state = 'defeat'
      const ev: Omit<BattleEvent, 'battleId'> = {
        type: 'defeat_all',
        timestamp: Date.now(),
        data: { message: '战斗失败...' },
      }
      this.emitBattleEvent(battleId, ev)
      battle?.roundEvents?.push({ ...ev, battleId })
      logger.info(`Battle ${battleId}: Defeat`)
    }
  }

  // =============================================
  // 玩家操作
  // =============================================

  /**
   * 玩家执行行动
   */
  executePlayerAction(battleId: string, action: BattleAction): { success: boolean; message: string } {
    const battle = this.battles.get(battleId)
    if (!battle) return { success: false, message: '战斗不存在' }

    // T7.x 回合制模式：玩家行动驱动整回合（玩家先手 → 敌人反击）
    if (battle.mode === 'turn') {
      return this.executeTurnRound(battleId, action)
    }

    if (battle.state === 'paused') {
      // 暂停模式下将行动加入队列
      battle.actions.push(action)
      return { success: true, message: '行动已加入队列' }
    }

    if (battle.state !== 'active') {
      return { success: false, message: '战斗未在进行中' }
    }

    const actor = battle.combatants.find((c) => c.id === action.actorId)
    if (!actor || actor.defeated) {
      return { success: false, message: '行动者无效' }
    }

    switch (action.type) {
      case 'attack': {
        const target = battle.combatants.find((c) => c.id === action.targetId)
        if (!target || target.defeated) return { success: false, message: '目标无效' }
        this.executeAttack(battleId, actor, target)
        this.checkBattleEnd(battleId)
        return { success: true, message: '攻击执行' }
      }

      case 'flee': {
        // 逃跑概率：速度差 + 随机
        const fastestEnemy = battle.combatants
          .filter((c) => c.side === 'enemy' && !c.defeated)
          .sort((a, b) => b.speed - a.speed)[0]

        if (fastestEnemy) {
          const fleeChance = 0.3 + (actor.speed - fastestEnemy.speed) * 0.05
          if (Math.random() < Math.max(0.1, Math.min(0.8, fleeChance))) {
            battle.state = 'fled'
            this.emitBattleEvent(battleId, {
              type: 'action',
              timestamp: Date.now(),
              data: { message: '成功逃离战斗!' },
            })
            return { success: true, message: '逃离成功' }
          } else {
            return { success: true, message: '逃离失败!' }
          }
        }
        return { success: false, message: '没有可逃离的敌人' }
      }

      default:
        return { success: false, message: '未知行动类型' }
    }
  }

  /**
   * T7.x 回合制整回合执行（赛尔号式：玩家先手 → 小怪反击）
   * 玩家发出攻击指令后，一次调用完成：玩家攻击 → 判定结束 → 全部存活敌人反击 → 判定结束
   * @returns 本回合全部事件（前端按顺序播放动画）+ 最新状态
   */
  private executeTurnRound(
    battleId: string,
    action: BattleAction,
  ): {
    success: boolean
    message: string
    state: BattleState
    events: BattleEvent[]
    playerHp: number
    playerMaxHp: number
    enemies: Array<{ id: string; name: string; hp: number; maxHp: number; defeated: boolean }>
    expGained: number
    coinsGained: number
  } {
    const battle = this.battles.get(battleId)
    const emptyResult = {
      success: false,
      message: '',
      state: 'active' as BattleState,
      events: [] as BattleEvent[],
      playerHp: 0,
      playerMaxHp: 0,
      enemies: [] as Array<{ id: string; name: string; hp: number; maxHp: number; defeated: boolean }>,
      expGained: 0,
      coinsGained: 0,
    }
    if (!battle) return { ...emptyResult, message: '战斗不存在' }
    if (battle.state !== 'active') {
      return { ...emptyResult, state: battle.state, message: '战斗未在进行中' }
    }

    // 清空本轮事件收集器
    battle.roundEvents = []

    const actor = battle.combatants.find((c) => c.id === action.actorId)
    if (!actor || actor.defeated) return { ...emptyResult, message: '行动者无效' }

    // ---- 1. 玩家起手攻击 ----
    if (action.type === 'attack') {
      const target = battle.combatants.find((c) => c.id === action.targetId)
      if (!target || target.defeated) {
        // 目标已倒下：自动选择存活敌人
        const alive = battle.combatants.find((c) => c.side === 'enemy' && !c.defeated)
        if (!alive) return { ...emptyResult, message: '没有可攻击的目标' }
        this.executeAttack(battleId, actor, alive)
      } else {
        this.executeAttack(battleId, actor, target)
      }
      this.checkBattleEnd(battleId)
    } else if (action.type === 'flee') {
      // 逃跑概率：速度差 + 随机
      const fastestEnemy = battle.combatants
        .filter((c) => c.side === 'enemy' && !c.defeated)
        .sort((a, b) => b.speed - a.speed)[0]
      if (fastestEnemy) {
        const fleeChance = 0.3 + (actor.speed - fastestEnemy.speed) * 0.05
        if (Math.random() < Math.max(0.1, Math.min(0.8, fleeChance))) {
          battle.state = 'fled'
          battle?.roundEvents?.push({
            type: 'action',
            battleId,
            timestamp: Date.now(),
            data: { message: '成功逃离战斗!' },
          })
        }
      }
    } else {
      return { ...emptyResult, message: '未知行动类型' }
    }

    // ---- 2. 玩家胜利判定 ----
    const afterPlayerState = this.battles.get(battleId)?.state ?? 'active'
    if (afterPlayerState === 'victory' || afterPlayerState === 'fled') {
      return this.buildTurnResult(battleId)
    }

    // ---- 3. 小怪反击（全部存活敌人依次攻击玩家） ----
    if (battle.state === 'active') {
      const player = battle.combatants.find((c) => c.side === 'player' && !c.defeated)
      const aliveEnemies = battle.combatants.filter((c) => c.side === 'enemy' && !c.defeated)
      if (player && aliveEnemies.length > 0) {
        for (const enemy of aliveEnemies) {
          const aiConfig = getEnemyAIConfig(enemy.enemyType ?? enemy.id)
          if (aiConfig) {
            const enemies = battle.combatants.filter((c) => c.side === 'player' && !c.defeated)
            const allies = battle.combatants.filter((c) => c.side === 'enemy' && !c.defeated && c.id !== enemy.id)
            const decision = enemyAIEngine.decide(
              aiConfig,
              this.toCombatStats(enemy),
              enemy.modifiers,
              enemies.map((e) => ({ id: e.id, stats: this.toCombatStats(e), modifiers: e.modifiers })),
              allies.map((a) => ({ id: a.id, stats: this.toCombatStats(a), modifiers: a.modifiers })),
              battle.tickCount,
            )
            if (decision.action === 'attack' || decision.action === 'skill' || decision.action === 'heal') {
              if (decision.action === 'attack') {
                const t = battle.combatants.find((c) => c.id === decision.targetId && !c.defeated)
                if (t) this.executeAttack(battleId, enemy, t)
                else if (player) this.executeAttack(battleId, enemy, player)
              } else if (decision.skill) {
                this.executeEnemySkill(battleId, enemy, decision.skill, decision.targetId)
              }
            } else if (player) {
              this.executeAttack(battleId, enemy, player)
            }
          } else if (player) {
            this.executeAttack(battleId, enemy, player)
          }
        }
      }
      // 敌人反击后检查玩家是否战败
      this.checkBattleEnd(battleId)
    }

    // ---- 4. 返回完整回合结果 ----
    return this.buildTurnResult(battleId)
  }

  /** 组装回合结果（当前战斗状态 + 本轮事件 + HP快照） */
  private buildTurnResult(
    battleId: string,
  ): {
    success: boolean
    message: string
    state: BattleState
    events: BattleEvent[]
    playerHp: number
    playerMaxHp: number
    enemies: Array<{ id: string; name: string; hp: number; maxHp: number; defeated: boolean }>
    expGained: number
    coinsGained: number
  } {
    const battle = this.battles.get(battleId)
    if (!battle) {
      return { success: false, message: '战斗不存在', state: 'active', events: [], playerHp: 0, playerMaxHp: 0, enemies: [], expGained: 0, coinsGained: 0 }
    }
    const player = battle.combatants.find((c) => c.side === 'player')
    const enemies = battle.combatants
      .filter((c) => c.side === 'enemy')
      .map((c) => ({ id: c.id, name: c.name, hp: c.hp, maxHp: c.maxHp, defeated: c.defeated }))

    let expGained = 0
    let coinsGained = 0
    if (battle.state === 'victory') {
      expGained = battle.combatants.filter((c) => c.side === 'enemy').reduce((s, e) => s + e.attack * 2, 0)
      coinsGained = battle.combatants.filter((c) => c.side === 'enemy').reduce((s, e) => s + e.defense * 3, 0)
    }

    return {
      success: true,
      message: battle.state,
      state: battle.state,
      events: battle.roundEvents ?? [],
      playerHp: player?.hp ?? 0,
      playerMaxHp: player?.maxHp ?? 0,
      enemies,
      expGained,
      coinsGained,
    }
  }

  /**
   * 暂停/恢复战斗
   */
  togglePause(battleId: string): { paused: boolean } {
    const battle = this.battles.get(battleId)
    if (!battle) return { paused: false }

    if (battle.state === 'active') {
      battle.state = 'paused'
      return { paused: true }
    } else if (battle.state === 'paused') {
      battle.state = 'active'
      // 执行暂停期间排队的行动
      const queued = [...battle.actions]
      battle.actions = []
      for (const action of queued) {
        this.executePlayerAction(battleId, action)
      }
      return { paused: false }
    }
    return { paused: battle.state === ('paused' as BattleState) }
  }

  // =============================================
  // 查询
  // =============================================

  /**
   * 获取战斗状态
   */
  getBattleState(battleId: string): BattleInstance | undefined {
    return this.battles.get(battleId)
  }

  /**
   * 获取战斗结果
   */
  getBattleResult(battleId: string): BattleResult | null {
    const battle = this.battles.get(battleId)
    if (!battle) return null

    const player = battle.combatants.find((c) => c.side === 'player')

    let expGained = 0
    let coinsGained = 0

    if (battle.state === 'victory') {
      // 胜利奖励：敌人攻击力总和*2经验，敌人防御力总和星币
      const enemies = battle.combatants.filter((c) => c.side === 'enemy')
      expGained = enemies.reduce((s, e) => s + e.attack * 2, 0)
      coinsGained = enemies.reduce((s, e) => s + e.defense * 3, 0)
    }

    return {
      battleId,
      state: battle.state,
      playerHp: player?.hp ?? 0,
      playerMaxHp: player?.maxHp ?? 0,
      expGained,
      coinsGained,
      itemsDropped: [],
      messages: battle.messages,
    }
  }

  /**
   * 结束并清理战斗
   */
  endBattle(battleId: string): BattleResult | null {
    const result = this.getBattleResult(battleId)
    this.battles.delete(battleId)
    logger.info(`Battle ${battleId} ended and cleaned up`)
    return result
  }

  /**
   * 获取活跃战斗数
   */
  getActiveBattleCount(): number {
    let count = 0
    for (const battle of this.battles.values()) {
      if (battle.state === 'active' || battle.state === 'paused') count++
    }
    return count
  }

  // =============================================
  // 事件
  // =============================================

  /**
   * 广播战斗事件
   */
  private emitBattleEvent(battleId: string, event: Omit<BattleEvent, 'battleId'>): void {
    const fullEvent: BattleEvent = {
      ...event,
      battleId,
    }

    if (this.io) {
      this.io.emit('battle:event', fullEvent)
    }
  }

  // =============================================
  // 统计
  // =============================================

  getStats() {
    return {
      activeBattles: this.getActiveBattleCount(),
      totalBattles: this.battles.size,
      running: this.running,
      tickInterval: this.tickInterval,
    }
  }
}

// =============================================
// 战斗实例类型
// =============================================

interface BattleInstance {
  id: string
  /** 战斗模式：'rtwp'=实时暂停（原） | 'turn'=回合制（赛尔号式） */
  mode: 'rtwp' | 'turn'
  state: BattleState
  combatants: BattleCombatant[]
  actions: BattleAction[]
  tickCount: number
  messages: string[]
  /** T7.x 回合制：本轮事件收集器（前端按顺序播放动画） */
  roundEvents: BattleEvent[]
}

/** 全局战斗引擎实例 */
export const battleEngine = new BattleEngine()
