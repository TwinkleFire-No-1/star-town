# Day 40 — 氛围NPC气泡LLM + NPC不可推动 + 任务提醒弹出（T7.x.15-17 完成）

> 日期：2026-08-12

## 今日任务

| Task ID | 名称 | 状态 |
|---------|------|------|
| T7.x.15 | 氛围NPC头顶气泡台词接入大模型（台词池轮换不重复，失败回退预设） | ✅ |
| T7.x.16 | 全角色碰撞不可推动（所有NPC有碰撞体积，玩家无法推动） | ✅ |
| T7.x.17 | 任务提醒弹出（任务完成 + 新任务发布，完成一个任务后立即提示下一个） | ✅ |

## 执行记录

### T7.x.15 氛围NPC气泡接入大模型（LLM驱动头顶气泡）

**背景**：氛围NPC（amb_ 前缀）对话已接入 LLM（T7.x.2），但头顶闲时气泡仍为固定预设台词，是最后的固定文案面。

- `ambientDialogueService.ts` 新增气泡台词池：一次 LLM 调用生成 8 条自言自语（`BUBBLE_POOL_SIZE=8`），10 分钟 TTL（`BUBBLE_POOL_TTL`）后重新生成，池内轮换不重复
- 复用 `buildSystemPrompt` 人设 + `ModelPurpose.Fast` + `skipReasoning: true`（DeepSeek 兼容），解析时剔除编号/引号/思考框架行（括号旁白、冒号结尾引导句、思考词开头）
- 新增 `GET /api/npcs/ambient/:id/bubble` 路由（crud.ts）
- 前端 `AmbientNpcSystem` 气泡改异步拉取（fetchBubbleLine），LLM 失败/未配置回退预设（pickBubble），已销毁精灵守卫
- 验证：server+client tsc 通过；解析自检 4/4 通过

### T7.x.16 全角色碰撞不可推动

**背景**：所有 NPC 均有碰撞体积（统一走 `addNpcCollider`），但静止 NPC 会被玩家物理碰撞顶走。

- 根因：`addNpcCollider` 未设不可移动 → 玩家撞到空闲 NPC（无 syncNpcBody 每帧粘合）时 NPC 被顶飞
- 单点修复：`CollisionSystem.addNpcCollider` 添加 `body.immovable = true`（玩家/NPC/猫/在线玩家全部生效，被阻挡但不被推动）
- 注：NPC-NPC 相互分离不再自动解算（双方 immovable），但漫游 NPC 位置每帧由 syncNpcBody 粘合，无可见回归
- 验证：server+client tsc 通过

### T7.x.17 任务提醒弹出（完成一个 → 立即提示下一个）

**背景**：主线任务"完成即发布下一个"链路已存在（T7.x.10：`handleQuestCompleted` → `releaseNextFixedMission`/`releaseNextStoryMission` → 广播 `story:mainline_popup` → 右侧任务引导感叹号）。缺口是提醒不够醒目——只有角落小感叹号。

- 新增 `client/src/services/questNotifications.ts`：任务提醒队列（push/peek/pop/subscribe，上限 4）
- 新增 `client/src/components/QuestToast.tsx` + `QuestToast.css`：右下角木质弹窗（复用成就弹窗视觉语言，定位在成就弹窗上方 bottom:88px 避免重叠；任务完成金色✓ / 新任务绿色✦）
- `websocket.ts` 接线：`quest:event` 的 `quest_completed` → 任务完成提醒（sub 从 message 剥离标题前缀只留奖励）；`story:mainline_popup` → 新任务提醒（sub 取描述前 36 字）
- `App.tsx` 挂载 QuestToast
- 验证：client tsc 通过；队列自检通过（完成→新任务先进先出 + 上限 4）
- 测试修复：端到端测试发现 QuestToast 超时只 `setCurrent(null)` 会导致队列后续项被丢弃（pop 触发的 notify 在 cur 仍为旧值时是空操作）→ 改为 `setCurrent(peekQuestNotification())`，自检证明 完成→新任务 依次展示；真实服务器 e2e（注册→发布→确认→完成→下一任务立即发布）通过
- 全项目自测：`AchievementToast` 同根因一并修复（`setCurrent(peekAchievement())`）；client tsc / server tsc / vite 生产构建全部通过（构建产物 2MB chunk 性能告警）；oxlint 仅 1 条既有样式告警（未用变量）；运行中服务器 11 项 API 冒烟通过；无自动化单测（项目靠 Playwright 手工验收）

## 风险提示

- 任务提醒与成就弹窗共用右下角区域，已用 bottom 偏移错开；若未来同时弹出多个系统提示，建议统一到共享提示队列
- 气泡 LLM 每次调用 8 条/10 分钟/NPC，人多时仍有成本，已用池化限制

## 明日计划（Day 41 建议）

1. 全场景画风一致性终检（AI 底图模式无遗漏）
2. 在线玩家系统多用户回归
3. 若用户有新需求按 backlog 继续
