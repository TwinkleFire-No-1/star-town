// 星火小镇 — 主线任务弹窗（T6.8 升级打怪玩法）
// 需求：随着游戏时间推移，自动弹出需要玩家完成的主线任务；
// 玩家点击"确认接受"后任务才正式开启，再进行下一个任务。
// 数据源：gameStore.mission.pendingMission（由 websocket story:mainline_popup 驱动）

import { useGameStore } from '../stores/gameStore'
import { wsService } from '../services/websocket'
import './MainlineMissionPopup.css'

/**
 * MainlineMissionPopup — 时间驱动主线任务弹窗
 *
 * 流程：
 * 1. 后端到达任务触发时间 → websocket 广播 story:mainline_popup
 * 2. 本组件渲染"主线任务发布"木质弹窗（居中，遮罩不可穿透）
 * 3. 玩家点击"确认接受" → wsService.confirmMainlineMission() → 后端 acceptQuest
 * 4. 后端广播 story:mainline_confirmed → store 清空 pendingMission → 弹窗关闭
 */
export function MainlineMissionPopup() {
  const pendingMission = useGameStore((s) => s.mission.pendingMission)

  if (!pendingMission) return null

  const handleConfirm = () => {
    wsService.confirmMainlineMission()
  }

  const handleReject = () => {
    wsService.rejectMainlineMission()
  }

  return (
    <div className="mission-popup-overlay">
      <div className="mission-popup-panel">
        {/* 顶部装饰 */}
        <div className="mission-popup-ornament">✦ ✦ ✦</div>

        {/* 标题 */}
        <div className="mission-popup-kicker">主线任务 · 发布</div>
        <div className="mission-popup-title">{pendingMission.title}</div>
        <div className="mission-popup-divider" />

        {/* 描述 */}
        <div className="mission-popup-desc">{pendingMission.description}</div>

        {/* 目标列表 */}
        <div className="mission-popup-objectives">
          {(pendingMission.objectives ?? []).map((obj) => (
            <div key={obj.id} className="mission-objective">
              <span className="mission-objective-icon">⚔</span>
              <span className="mission-objective-text">
                {obj.description}
                {obj.requiredCount > 1 ? ` ×${obj.requiredCount}` : ''}
              </span>
            </div>
          ))}
        </div>

        {/* 奖励 */}
        {pendingMission.reward && (
          <div className="mission-popup-reward">
            <span className="reward-chip exp">经验 +{pendingMission.reward.exp}</span>
            <span className="reward-chip coins">星币 +{pendingMission.reward.coins}</span>
            {pendingMission.suggestedLevel ? (
              <span className="reward-chip level">推荐 Lv.{pendingMission.suggestedLevel}</span>
            ) : null}
          </div>
        )}

        {/* 确认 / 取消按钮 */}
        <div className="mission-popup-actions">
          <button className="mission-confirm-btn" onClick={handleConfirm}>
            ⚔ 确认接受
          </button>
          <button className="mission-reject-btn" onClick={handleReject}>
            暂时不去
          </button>
        </div>
        <div className="mission-popup-hint">确认后任务正式开启；拒绝后过一段时间它会再次出现</div>
      </div>
    </div>
  )
}

export default MainlineMissionPopup
