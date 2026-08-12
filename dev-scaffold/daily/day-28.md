---
AIGC:
  ContentProducer: '001191110102MAD55U9H0F10002'
  ContentPropagator: '001191110102MAD55U9H0F10002'
  Label: '1'
  ProduceID: '56906566-162d-4c0f-9faa-10e5bfb1ddf1'
  PropagateID: '56906566-162d-4c0f-9faa-10e5bfb1ddf1'
  ReservedCode1: '671571cb-b22c-408a-9345-7f91c1aa2af1'
  ReservedCode2: '671571cb-b22c-408a-9345-7f91c1aa2af1'
---

# Day 28 — 升级打怪玩法 + 时间驱动主线任务

> Sprint 5 延展 | 日期：2026-08-03 | Agent开发日志

---

## 今日目标

_用户需求：增加一个升级打怪的玩法，主线剧情内加入。随着时间的推移弹出需要玩家完成的主线任务，待玩家确认后再进行下一个任务。_

实现方案：**升级打怪 + 时间驱动主线任务系统**
- **升级系统**：Player 表新增 level/exp；战斗胜利结算经验 → 经验满自动升级 → 属性成长（生命/精神/攻击/防御/速度）+ 满血满蓝 → 升级动画
- **时间驱动主线任务（"冒险者之路"6任务链）**：监听游戏时钟，到达触发时间（Day1 8h→12h / Day2 9h/14h / Day3 10h）自动弹出主线任务（星露谷木质弹窗）
- **确认机制**：任务弹出后待玩家点击"确认接受"才正式开启；完成当前任务后才计时下一个（严格串行）

## 任务清单

| 优先级 | Task ID | 名称 | 依赖 | 预估 | 状态 |
|--------|---------|------|------|------|------|
| P0 | T6.8.1 | Player等级/经验字段 | 无 | 0.3h | ✅ |
| P0 | T6.8.2 | 升级系统服务 | T6.8.1 | 1h | ✅ |
| P0 | T6.8.3 | 时间驱动主线任务服务 | T6.8.2 | 2h | ✅ |
| P0 | T6.8.4 | 打怪击杀触发器 | 无 | 0.3h | ✅ |
| P0 | T6.8.5 | 升级/主线API | T6.8.3 | 0.5h | ✅ |
| P1 | T6.8.6 | socket确认事件 | T6.8.3 | 0.3h | ✅ |
| P1 | T6.8.7 | 前端任务/等级状态 | 无 | 0.5h | ✅ |
| P1 | T6.8.8 | 主线任务弹窗组件 | T6.8.7 | 0.5h | ✅ |
| P1 | T6.8.9 | 等级HUD+升级提示 | T6.8.7 | 0.5h | ✅ |
| P1 | T6.8.10 | 战斗结算接入升级 | T6.8.5 | 0.5h | ✅ |
| P2 | T6.8.11 | 场景切换竞态修复 | 无 | 0.5h | ✅ |

---

## 执行记录

### T6.8.1 Player等级/经验字段
- **产出**：`server/prisma/schema.prisma` Player 新增 `level Int @default(1)` / `exp Int @default(0)`
- **迁移**：`prisma migrate dev --name add_level_exp` 成功应用（创建 shadow 数据库）
- **耗时**：0.2h

### T6.8.2 升级系统服务
- **产出**：`server/src/services/levelSystem.ts`
- **经验曲线**：`expToNext(level) = 80 + (level-1)*60`（Lv1→2需80，Lv2→3需140...），上限50级
- **升级成长**：每级 maxHp+12 / maxSp+5 / attack+2 / defense+1 / speed+1，升级回满 HP/SP（支持一次连升多级）
- **事件广播**：`level:update`（经验实时变化）+ `level:up`（升级动画，含旧/新等级+属性）
- **验证**：settle-battle 发 100 exp → LEVEL UP 1→2，属性 maxHp 100→112 / attack 10→12 ✅
- **耗时**：0.8h

### T6.8.3 时间驱动主线任务服务
- **产出**：`server/src/services/mainlineQuestService.ts`
- **任务链**（"冒险者之路"，升级打怪主题，chapter=99 独立不干扰剧情推进）：
  | 任务 | 触发时间 | 目标 |
  |------|----------|------|
  | 荒野之狼出没 | Day1 08:00 | 击杀狼×3 |
  | 哥布林骚扰 | Day1 10:00 | 击杀哥布林×4 |
  | 腐化树精 | Day1 12:00 | 击败树精×1 |
  | 矿洞蠕虫危机 | Day2 09:00 | 击杀蠕虫×5 |
  | 暗影先锋入侵 | Day2 14:00 | 击杀暗影爪牙×6 |
  | 森林守护者 | Day3 10:00 | 击败BOSS×1 |
- **串行机制**：`pendingQuestId || activeQuestId` 存在时不触发新任务 → "确认后才进行下一个"
- **触发检查**：监听 gameClock `hour_change`/`new_day` + 初始化时全量检查；触发点去重（playerId:index）
- **状态恢复**：重连时从 playerQuest 数据库恢复（active/已完成进度）
- **任务落库**：upsert 到 Quest 表（修复 playerQuest 外键约束 P2003）
- **耗时**：1.8h

### T6.8.4 打怪击杀触发器
- **产出**：`questEngine.triggerKillEnemy(playerId, enemyId)` — 匹配所有 active 任务的 kill_enemy 目标并推进
- **耗时**：0.2h

### T6.8.5 升级/主线API
- **产出**：`server/src/routes/level.ts`（注册到 /api/level）
  - `GET /:playerId` 等级信息
  - `POST /settle-battle` 战斗结算：胜利→grantExp（自动升级）+星币+triggerKillEnemy+清理战斗
  - `GET /mainline/status/:playerId`、`POST /mainline/check`、`GET /mainline/missions`、`GET /stats`
- **修复**：/stats 路由顺序（放在 /:playerId 前避免被捕获）
- **耗时**：0.4h

### T6.8.6 socket确认事件
- **产出**：`socket/handler.ts` 连接时 `registerPlayer`（立即检查任务触发）；`story:mainline_confirm` 确认待确认任务；`mainline:status` 查询
- **耗时**：0.2h

### T6.8.7 前端任务/等级状态
- **产出**：`gameStore` 新增 `mission` slice（pendingMission/activeMission/currentIndex/total/allCompleted）+ `level` slice（level/exp/expToNext/progressPercent）+ `lastLevelUp`；`websocket.ts` 监听 `story:mainline_popup` / `story:mainline_confirmed` / `mainline:status` / `level:update` / `level:up`，新增 `confirmMainlineMission`/`requestMainlineStatus`
- **耗时**：0.4h

### T6.8.8 主线任务弹窗组件
- **产出**：`client/src/components/MainlineMissionPopup.tsx` + CSS
- **样式**：星露谷木质面板（深棕渐变+金边+羊皮纸点缀），"主线任务 · 发布"标题、任务描述、目标列表（⚔）、奖励 chips（经验/星币/推荐等级）、"⚔ 确认接受"按钮（金色立体）、遮罩不可穿透
- **流程**：收到 popup 事件渲染 → 点击确认 → wsService.confirmMainlineMission → 后端 acceptQuest → confirmed 事件关闭弹窗
- **耗时**：0.4h

### T6.8.9 等级HUD+升级提示
- **产出**：`client/src/components/LevelBadge.tsx` + CSS
  - LevelBadge：左上角 Lv 徽章（蓝色渐变方块）+ 经验条（绿色渐变）+ EXP 数值
  - LevelUpNotice：屏幕中央 "✦ LEVEL UP! ✦" 金色横幅动画（3.2s 自动消失），显示成长数值
  - App.tsx 挂载 + 连接后 fetchLevelInfo 拉取初始等级
- **耗时**：0.4h

### T6.8.10 战斗结算接入升级
- **产出**：`BattleScene.ts` — exitBattle() 时若 victory 且未结算过，POST `/api/level/settle-battle`（battleId + playerId + enemyIds）
- **耗时**：0.3h

### T6.8.11 场景切换竞态修复
- **产出**：修复 Day 27 遗留的 2 个崩溃 bug（战斗/场景切换时 anims undefined 刷屏）：
  - `AmbientNpcSystem`：update 防御已销毁精灵（destroyOne 清理）+ anims 可选链
  - `NpcSpriteManager`：updateNPCPosition 防御 sprite 未激活/anims 缺失
- **耗时**：0.3h

---

## 验收结果

- **TypeScript 编译**：server `npm run build` ✅ / client `tsc -b && vite build` ✅
- **数据库**：migrate 成功，Player.level/exp 生效；Quest 表 6 条 mainline 任务 ✅
- **API 实测**：
  - `GET /api/level/stats`：expCurve {Lv1:80, Lv2:140, Lv5:320, Lv10:620} ✅
  - `GET /api/level/mainline/missions`：6任务标题齐全 ✅
- **时间驱动弹窗**（浏览器实测）：新玩家连接 → Day1 自动弹出「荒野之狼出没」（木质弹窗，目标/奖励/推荐Lv齐全）✅
- **确认机制**（浏览器实测）：点击"确认接受" → 弹窗关闭 → activeMission=荒野之狼出没 ✅
- **打怪升级闭环**（浏览器实测）：
  - B键触发战斗 → RTwP引擎自动战斗 → victory → ESC退出 → 结算
  - 结算经验 +36，等级徽章实时更新 0/80 → 36/80 EXP ✅
  - kill_enemy 目标推进 1/3 ✅
  - 再结算 +100 exp → `LEVEL UP: 1 → 2` 事件 → 徽章 Lv.2 56/140 ✅
- **任务完成推进**（socket实测）：3只狼击杀完成 → activeMission 清空、currentIndex 0→1，等待下一个触发时间 ✅
- **升级属性成长**（socket实测）：maxHp 100→112、maxSp 50→55、attack 10→12、defense 5→6、speed 10→11 ✅
- **场景切换竞态修复**：战斗进入/退出无崩溃、无 anims 报错 ✅

## 遗留问题

| 遗留 | 说明 | 影响 |
|------|------|------|
| 主线任务与现有序章任务并行 | "冒险者之路"任务链为独立主线（chapter 99），与对话驱动的序章剧情并行存在，未做剧情合并 | 低（互不干扰，玩家可自由选择） |
| 普通NPC精灵动画键重复警告 | AnimationManager key already exists（场景反复重建时） | 低（仅警告，不影响功能） |
| 结算经验为战斗内敌人数值 | 演示战斗敌人固定，真实野外遭遇战尚未接入随机刷怪 | 中（可玩性增强项，建议下一迭代做野外遇敌） |

## 风险提示

- 时间驱动任务服务为纯增量：新增独立服务+路由+socket事件+前端组件，未改动现有剧情/战斗核心链路（仅给 questEngine 增加一个触发器方法）。
- 任务写入 Quest 表使用幂等 upsert，服务重启安全。
- 无新增阻塞风险。

## 明日计划（Day 29 建议）

| 优先级 | 建议任务 | 说明 |
|--------|----------|------|
| P1 | 野外遇敌系统 | 城镇外区域（森林/矿洞）随机遇敌→自动进入战斗，让打怪升级玩法有真实场景依托 |
| P1 | 任务进度HUD | 进行中主线任务常驻显示（右上角小面板：击杀 x/y），玩家随时可见目标 |
| P2 | 升级加点玩法 | 升级时弹出属性加点面板，玩家自由分配属性点（增强RPG成长感） |
| P2 | 主线任务剧情合并 | 将"冒险者之路"与现有章节剧情打通，任务之间插入对话过场 |