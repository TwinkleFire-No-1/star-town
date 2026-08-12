// 星火小镇 — 战斗UI组件
// T3.4.5 血条/技能栏/暂停菜单、战斗结算界面

import React, { useEffect } from 'react'
import './BattleUI.css'

// =============================================
// 类型定义
// =============================================

/** 战斗参与者UI数据 */
export interface BattleCombatantUI {
  id: string
  name: string
  side: 'player' | 'enemy'
  hp: number
  maxHp: number
  sp: number
  maxSp: number
  isDefeated: boolean
}

/** 技能UI数据 */
export interface BattleSkillUI {
  id: string
  name: string
  icon: string
  spCost: number
  cooldown: number // 剩余冷却（0=可用）
  description: string
}

/** 战斗结算数据 */
export interface BattleResultSettlement {
  victory: boolean
  expGained: number
  coinsGained: number
  itemsDropped: Array<{
    itemId: string
    name: string
    quantity: number
  }>
  battleTime: number // 战斗用时（秒）
  playerHpLeft: number
  playerMaxHp: number
}

/** 战斗UI Props */
export interface BattleUIProps {
  combatants: BattleCombatantUI[]
  skills: BattleSkillUI[]
  isPaused: boolean
  battleEnded: boolean
  settlement?: BattleResultSettlement
  onTogglePause: () => void
  onUseSkill: (skillId: string, targetId?: string) => void
  onUseItem: () => void
  onFlee: () => void
  onExit: () => void
  actionLog: string[]
}

// =============================================
// HP条组件
// =============================================

const HpBar: React.FC<{
  current: number
  max: number
  label: string
  side: 'player' | 'enemy'
  sp?: number
  maxSp?: number
  isDefeated: boolean
}> = ({ current, max, label, side, sp, maxSp, isDefeated }) => {
  const hpPercent = max > 0 ? Math.max(0, (current / max) * 100) : 0
  const spPercent = maxSp && maxSp > 0 && sp !== undefined ? Math.max(0, (sp / maxSp) * 100) : 0

  // 根据HP百分比变色
  const getHpColor = (pct: number): string => {
    if (pct > 60) return '#4caf50'
    if (pct > 30) return '#ff9800'
    return '#e53935'
  }

  return (
    <div className={`combatant-bar ${side} ${isDefeated ? 'defeated' : ''}`}>
      <div className="bar-label">
        <span className="bar-name">{label}</span>
        {isDefeated && <span className="defeated-tag">已击败</span>}
      </div>
      <div className="hp-bar-container">
        <div className="hp-bar-bg">
          <div
            className="hp-bar-fill"
            style={{ width: `${hpPercent}%`, backgroundColor: getHpColor(hpPercent) }}
          />
        </div>
        <span className="hp-text">{current}/{max}</span>
      </div>
      {maxSp !== undefined && maxSp > 0 && (
        <div className="sp-bar-container">
          <div className="sp-bar-bg">
            <div
              className="sp-bar-fill"
              style={{ width: `${spPercent}%` }}
            />
          </div>
          <span className="sp-text">SP {sp}/{maxSp}</span>
        </div>
      )}
    </div>
  )
}

// =============================================
// 技能栏组件
// =============================================

const SkillBar: React.FC<{
  skills: BattleSkillUI[]
  currentSp: number
  onUseSkill: (skillId: string) => void
  isPaused: boolean
}> = ({ skills, currentSp, onUseSkill, isPaused }) => {
  return (
    <div className="skill-bar">
      {skills.map((skill) => {
        const canUse = skill.cooldown === 0 && currentSp >= skill.spCost && !isPaused
        return (
          <button
            key={skill.id}
            className={`skill-slot ${canUse ? 'available' : 'unavailable'}`}
            onClick={() => canUse && onUseSkill(skill.id)}
            disabled={!canUse}
            title={`${skill.name}\nSP消耗: ${skill.spCost}\n${skill.description}`}
          >
            <span className="skill-icon">{skill.icon}</span>
            <span className="skill-name">{skill.name}</span>
            {skill.spCost > 0 && <span className="skill-cost">{skill.spCost}SP</span>}
            {skill.cooldown > 0 && <span className="skill-cd">{skill.cooldown}</span>}
          </button>
        )
      })}
    </div>
  )
}

// =============================================
// 暂停菜单
// =============================================

const PauseMenu: React.FC<{
  onResume: () => void
  onUseItem: () => void
  onFlee: () => void
}> = ({ onResume, onUseItem, onFlee }) => {
  return (
    <div className="pause-overlay">
      <div className="pause-menu">
        <h3 className="pause-title">|| 已暂停</h3>
        <button className="pause-btn resume" onClick={onResume}>
          继续战斗
        </button>
        <button className="pause-btn item" onClick={onUseItem}>
          使用物品
        </button>
        <button className="pause-btn flee" onClick={onFlee}>
          逃离战斗
        </button>
      </div>
    </div>
  )
}

// =============================================
// 战斗结算界面
// =============================================

const BattleSettlement: React.FC<{
  settlement: BattleResultSettlement
  onExit: () => void
}> = ({ settlement, onExit }) => {
  const isVictory = settlement.victory

  return (
    <div className="settlement-overlay">
      <div className={`settlement-panel ${isVictory ? 'victory' : 'defeat'}`}>
        <h2 className="settlement-title">
          {isVictory ? '战斗胜利!' : '战斗失败...'}
        </h2>

        {isVictory && (
          <div className="settlement-rewards">
            <div className="reward-row">
              <span className="reward-label">获得经验</span>
              <span className="reward-value exp">+{settlement.expGained}</span>
            </div>
            <div className="reward-row">
              <span className="reward-label">获得星币</span>
              <span className="reward-value coins">+{settlement.coinsGained}</span>
            </div>
            {settlement.itemsDropped.length > 0 && (
              <div className="reward-items">
                <span className="reward-label">获得物品</span>
                {settlement.itemsDropped.map((item, i) => (
                  <span key={i} className="reward-item">
                    {item.name} x{item.quantity}
                  </span>
                ))}
              </div>
            )}
            <div className="reward-row">
              <span className="reward-label">剩余HP</span>
              <span className="reward-value">{settlement.playerHpLeft}/{settlement.playerMaxHp}</span>
            </div>
            <div className="reward-row">
              <span className="reward-label">战斗用时</span>
              <span className="reward-value">{Math.floor(settlement.battleTime / 60)}分{settlement.battleTime % 60}秒</span>
            </div>
          </div>
        )}

        {!isVictory && (
          <div className="settlement-defeat-info">
            <p>你的HP已归零...</p>
            <p className="defeat-hint">不要灰心，调整装备和策略再来!</p>
          </div>
        )}

        <button className="settlement-exit-btn" onClick={onExit}>
          {isVictory ? '继续冒险' : '返回城镇'}
        </button>
      </div>
    </div>
  )
}

// =============================================
// 行动日志
// =============================================

const ActionLog: React.FC<{
  logs: string[]
}> = ({ logs }) => {
  return (
    <div className="action-log">
      {logs.slice(-4).map((log, i) => (
        <div key={i} className="log-entry" style={{ opacity: 1 - i * 0.2 }}>
          {log}
        </div>
      ))}
    </div>
  )
}

// =============================================
// 战斗UI主组件
// =============================================

export const BattleUI: React.FC<BattleUIProps> = ({
  combatants,
  skills,
  isPaused,
  battleEnded,
  settlement,
  onTogglePause,
  onUseSkill,
  onUseItem,
  onFlee,
  onExit,
  actionLog,
}) => {
  const player = combatants.find((c) => c.side === 'player')
  const enemies = combatants.filter((c) => c.side === 'enemy')

  // ESC键暂停/恢复
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !battleEnded) {
        onTogglePause()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [battleEnded, onTogglePause])

  // 战斗结束显示结算
  if (battleEnded && settlement) {
    return <BattleSettlement settlement={settlement} onExit={onExit} />
  }

  return (
    <div className="battle-ui">
      {/* 敌方血条区域 */}
      <div className="enemy-bars">
        {enemies.map((enemy) => (
          <HpBar
            key={enemy.id}
            current={enemy.hp}
            max={enemy.maxHp}
            label={enemy.name}
            side="enemy"
            isDefeated={enemy.isDefeated}
          />
        ))}
      </div>

      {/* 玩家血条+SP */}
      {player && (
        <div className="player-bars">
          <HpBar
            current={player.hp}
            max={player.maxHp}
            label="旅行者"
            side="player"
            sp={player.sp}
            maxSp={player.maxSp}
            isDefeated={player.isDefeated}
          />
        </div>
      )}

      {/* 技能栏 */}
      {player && (
        <SkillBar
          skills={skills}
          currentSp={player.sp}
          onUseSkill={onUseSkill}
          isPaused={isPaused}
        />
      )}

      {/* 功能按钮 */}
      <div className="battle-actions">
        <button className="action-btn pause-btn" onClick={onTogglePause}>
          {isPaused ? '▶' : '||'}
        </button>
        <button className="action-btn item-btn" onClick={onUseItem}>
          物品
        </button>
        <button className="action-btn flee-btn" onClick={onFlee}>
          逃跑
        </button>
      </div>

      {/* 行动日志 */}
      <ActionLog logs={actionLog} />

      {/* 暂停菜单 */}
      {isPaused && (
        <PauseMenu
          onResume={onTogglePause}
          onUseItem={onUseItem}
          onFlee={onFlee}
        />
      )}
    </div>
  )
}

export default BattleUI
