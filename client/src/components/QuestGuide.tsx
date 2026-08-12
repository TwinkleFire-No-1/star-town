// 星火小镇 — 任务引导系统（参考原神 Quest Tracker 设计方案）
// 需求：
// 1. 界面右侧有一个悬浮小按钮（冒险任务引导）
// 2. 点击后展开面板，提示当前应完成的主线任务
// 3. 后续任务到来不再弹大窗，仅通过小按钮上的感叹号提示
// 数据源：gameStore.mission（pendingMission / activeMission / nextMission / guideHasNew）

import { useGameStore } from '../stores/gameStore'
import { wsService } from '../services/websocket'
import './QuestGuide.css'

/** 目标进度百分比 */
function objectivePercent(current: number, required: number): number {
  if (!required) return 0
  return Math.min(100, Math.round((current / required) * 100))
}

/** 目标类型 → 图标（T6.15 区分对话/探索/打怪） */
function objectiveIcon(type?: string): string {
  switch (type) {
    case 'talk_to_npc': return '💬'
    case 'visit_area': return '🧭'
    case 'collect_item': return '🎒'
    default: return '⚔'
  }
}

/**
 * QuestGuide — 任务引导（右侧悬浮按钮 + 展开面板）
 *
 * 按钮状态：
 * - 有 pendingMission（待确认）→ 金色感叹号，脉冲闪烁
 * - 有 activeMission（进行中）→ 显示任务卷轴图标 + 小进度点
 * - 无任务 → 常规卷轴图标
 *
 * 面板内容：
 * - 待确认任务：标题/描述/目标/奖励 + 确认接受 / 暂时不去
 * - 进行中任务：标题/描述/目标进度条（打怪实时刷新）
 * - 下一任务预告
 */
export function QuestGuide() {
  const mission = useGameStore((s) => s.mission)
  const { pendingMission, activeMission, nextMission, guideOpen, guideHasNew } = mission

  const hasAnyTask = Boolean(pendingMission || activeMission)

  const handleToggle = () => {
    const nextOpen = !guideOpen
    useGameStore.getState().setGuideOpen(nextOpen)
    // 打开面板时清除"新任务"感叹号
    if (nextOpen) {
      useGameStore.getState().setGuideHasNew(false)
    }
  }

  const handleConfirm = () => {
    wsService.confirmMainlineMission()
  }

  const handleReject = () => {
    wsService.rejectMainlineMission()
  }

  return (
    <div className="quest-guide">
      {/* ===== 右侧悬浮按钮 ===== */}
      <button
        className={`quest-guide-fab ${guideOpen ? 'active' : ''} ${guideHasNew ? 'has-new' : ''} ${hasAnyTask ? 'has-task' : ''}`}
        onClick={handleToggle}
        aria-label="任务引导"
        title="任务引导"
      >
        <span className="quest-guide-fab-icon">
          {pendingMission ? '⚔' : activeMission ? '📜' : '🧭'}
        </span>
        {/* 感叹号提示（新任务到来 / 有待确认任务） */}
        {(guideHasNew || pendingMission) && (
          <span className="quest-guide-badge">
            <span className="quest-guide-badge-exclaim">!</span>
          </span>
        )}
        {/* 进行中任务小进度点 */}
        {!guideHasNew && !pendingMission && activeMission && (
          <span className="quest-guide-dot" />
        )}
      </button>

      {/* ===== 展开的任务引导面板 ===== */}
      {guideOpen && (
        <div className="quest-guide-panel">
          {/* 面板头部 */}
          <div className="quest-guide-header">
            <span className="quest-guide-header-icon">✦</span>
            <span className="quest-guide-header-title">任务引导</span>
            <span className="quest-guide-header-icon">✦</span>
            <button className="quest-guide-close" onClick={handleToggle} aria-label="收起">✕</button>
          </div>

          {/* 待确认任务 */}
          {pendingMission && (
            <div className="quest-guide-section">
              <div className="quest-guide-section-kicker">主线任务 · 发布</div>
              <div className="quest-guide-quest-title">{pendingMission.title}</div>
              <div className="quest-guide-quest-desc">{pendingMission.description}</div>

              <div className="quest-guide-objectives">
                {(pendingMission.objectives ?? []).map((obj) => (
                  <div key={obj.id} className="quest-guide-objective">
                    <span className="quest-guide-objective-icon">{objectiveIcon(obj.type)}</span>
                    <span className="quest-guide-objective-text">
                      {obj.description}
                      {obj.requiredCount > 1 ? ` ×${obj.requiredCount}` : ''}
                    </span>
                  </div>
                ))}
              </div>

              {pendingMission.reward && (
                <div className="quest-guide-reward">
                  <span className="quest-guide-reward-chip exp">经验 +{pendingMission.reward.exp}</span>
                  <span className="quest-guide-reward-chip coins">星币 +{pendingMission.reward.coins}</span>
                  {pendingMission.suggestedLevel ? (
                    <span className="quest-guide-reward-chip lv">推荐 Lv.{pendingMission.suggestedLevel}</span>
                  ) : null}
                </div>
              )}

              <div className="quest-guide-actions">
                <button className="quest-guide-confirm" onClick={handleConfirm}>⚔ 确认接受</button>
                <button className="quest-guide-reject" onClick={handleReject}>暂时不去</button>
              </div>
            </div>
          )}

          {/* 进行中任务 */}
          {!pendingMission && activeMission && (
            <div className="quest-guide-section">
              <div className="quest-guide-section-kicker">主线任务 · 进行中</div>
              <div className="quest-guide-quest-title">{activeMission.title}</div>
              {activeMission.description && (
                <div className="quest-guide-quest-desc">{activeMission.description}</div>
              )}

              <div className="quest-guide-objectives">
                {(activeMission.objectives ?? []).map((obj) => {
                  const current = obj.currentCount ?? 0
                  const required = obj.requiredCount ?? 0
                  const pct = objectivePercent(current, required)
                  const done = required > 0 && current >= required
                  return (
                    <div key={obj.id} className="quest-guide-objective progress">
                      <div className="quest-guide-objective-row">
                        <span className="quest-guide-objective-icon">{done ? '✓' : objectiveIcon(obj.type)}</span>
                        <span className="quest-guide-objective-text">
                          {obj.description}
                          {required > 1 ? ` ×${required}` : ''}
                        </span>
                        <span className="quest-guide-objective-count">{current}/{required}</span>
                      </div>
                      <div className="quest-guide-progress-track">
                        <div
                          className={`quest-guide-progress-fill ${done ? 'done' : ''}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* 无任务提示 */}
          {!pendingMission && !activeMission && (
            <div className="quest-guide-empty">
              <div className="quest-guide-empty-icon">🧭</div>
              <div className="quest-guide-empty-text">
                {mission.allCompleted
                  ? '全部主线任务已完成，尽情探索星火小镇吧！'
                  : '当前没有进行中的主线任务，在星火小镇中自由冒险吧。'}
              </div>
            </div>
          )}

          {/* 下一任务预告 */}
          {nextMission && !pendingMission && (
            <div className="quest-guide-next">
              <span className="quest-guide-next-label">下一任务预告</span>
              <span className="quest-guide-next-title">{nextMission.title}</span>
              {nextMission.suggestedLevel ? (
                <span className="quest-guide-next-lv">Lv.{nextMission.suggestedLevel}</span>
              ) : null}
            </div>
          )}

          {/* 任务链进度 */}
          {mission.total > 0 && (
            <div className="quest-guide-footer">
              主线进度 {Math.min(mission.currentIndex, mission.total)} / {mission.total}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default QuestGuide
