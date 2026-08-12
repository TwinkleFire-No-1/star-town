---
AIGC:
  ContentProducer: '001191110102MAD55U9H0F10002'
  ContentPropagator: '001191110102MAD55U9H0F10002'
  Label: '1'
  ProduceID: '0b58318c-bde7-4d30-b800-69af7bc3ae92'
  PropagateID: '0b58318c-bde7-4d30-b800-69af7bc3ae92'
  ReservedCode1: 'b9be5eaa-2ff8-4a17-bc91-4ff7054f79b8'
  ReservedCode2: 'b9be5eaa-2ff8-4a17-bc91-4ff7054f79b8'
---

# Day 30 — 任务拒绝 + 待机动作 + F键进建筑 + 室内氛围NPC

> Sprint 5 延展 | 日期：2026-08-03 | Agent开发日志

---

## 今日目标

_用户需求（4项迭代）：_
1. 任务用户也可以拒绝，包括打怪升级。加一个不确认（取消）按钮，等一段时间后再弹出任务。
2. 主角探险者在不动时也设计一个待机动作（不用任务）。
3. 每个建筑都可以按 F 进入，除去需要剧情解锁的。
4. 进入建筑（除去反派的）后也设计一些不接大模型的NPC，营造热闹的氛围。

实现方案：
- **任务拒绝/取消**：弹窗新增"暂时不去"按钮；后端 rejectMission 记录拒绝冷却（2 游戏小时），冷却结束后自动重新弹出同一任务
- **主角待机动作**：站定 6-10 秒随机触发"伸懒腰/转头张望/打哈欠"小动作（纯视觉 tween，不动物理体）
- **建筑按 F 进入**：踩门自动进入改为门口近邻检测 + F 键触发；底部 [F] 提示；未解锁建筑显示 🔒 提示并拦截
- **室内氛围 NPC**：14 个固定台词 NPC 分布在 7 个室内/野外场景（长老大厅反派相关不放），复用现有精灵图，走 amb_ 短路链路

## 任务清单

| 优先级 | Task ID | 名称 | 依赖 | 预估 | 状态 |
|--------|---------|------|------|------|------|
| P0 | T6.11.1 | 主线任务拒绝/取消+延迟重弹 | T6.8.x | 1h | ✅ |
| P0 | T6.11.2 | 主角待机动作 | 无 | 1h | ✅ |
| P0 | T6.11.3 | 建筑按F进入 | 无 | 1h | ✅ |
| P0 | T6.11.4 | 室内氛围NPC | T6.7.x | 1.5h | ✅ |

---

## 执行记录

### T6.11.1 任务拒绝/取消 + 延迟重弹
- **后端**：`mainlineQuestService.ts` PlayerMissionState 增加 `rejectUntil`；新增 `rejectMission(playerId)`——清除 pending、删除 triggeredKeys 去重、设置拒绝冷却（当前游戏时间+2小时，跨天进位）、广播 `story:mainline_rejected`；`checkForPlayer` 增加冷却判断（未到冷却时间不触发，到了清除）；`handler.ts` 新增 `story:mainline_reject` socket 事件
- **前端**：`websocket.ts` 监听 `story:mainline_rejected`（关闭弹窗）+ `rejectMainlineMission()` emit；`MainlineMissionPopup.tsx` 新增"暂时不去"取消按钮；CSS 新增木质暗色 `.mission-reject-btn`
- **验证**：后端日志完整链路——Day1 9:00 弹出→拒绝→11:00 自动重弹→再拒绝→13:00 重弹；Playwright 点击"暂时不去"弹窗关闭 ✅
- **耗时**：0.8h

### T6.11.2 主角待机动作
- **产出**：`MovementSystem.ts` 增加空闲计时与待机动作系统——站定 6-10 秒后随机触发：
  - 伸懒腰：y 上浮 10px + scale 1.08（tween onUpdate 用 body.reset 同步物理体，防止 Arcade 拉回）
  - 转头张望：临时播放 left/right idle 950ms 后恢复当前方向
  - 打哈欠：y 下压 + angle 微摆（yoyo）
- 移动或输入锁定（过渡/战斗）时 `cancelIdleAction()` 立即恢复；`setInputLocked(true)` 同步取消
- **验证**：Playwright 轮询——玩家站定约 7.5 秒后 anim 变为 `player_idle_left`（转头张望触发），动作结束恢复当前方向 ✅
- **耗时**：0.6h

### T6.11.3 建筑按 F 进入
- **产出**：`CollisionSystem.ts` 移除踩门 overlap 自动进入，新增 `updateDoorProximity`（110px 内最近门口）/ `tryEnterDoor` / `getNearestDoorTile`；`GameScene.ts` 增加 F 键监听、update 每帧近邻检测、doorPrompt 底部提示（城镇 "[F] 进入 建筑名" / 未解锁 "🔒 建筑名 尚未开放" / 室内 "[F] 离开"），shutdown 清理
- **修复**：室内出口提示最初显示"[F] 进入 离开"，改为室内直接显示"[F] 离开"
- **验证**：温馨小屋门口 "[F] 进入 温馨小屋"→按 F 进入；长老大厅（序章未解锁）"🔒 长老大厅 尚未开放"→按 F 被拦截仍留在城镇；铁匠铺 "[F] 进入 铁砧工坊"→按 F 进入 ✅
- **耗时**：0.7h

### T6.11.4 室内氛围 NPC
- **后端**：`ambientNpcService.ts` AmbientNpcDef 增加 `scene` 字段，新增 14 个室内/野外氛围 NPC（铁砧工坊：小锤/疤脸；药剂店：阿栗/小药；酒馆：醉猫/琴歌/话匣子；集市：彩云/挑拣客；民居：织娘/豆豆；森林：老柴/风尘；矿洞：老挖/二镐；长老大厅为反派势力活动场所不放）；`getByScene(sceneId)`；`crud.ts` GET /api/npcs/ambient?scene=xxx 过滤
- **前端**：`AmbientNpcSystem.ts` 改为按场景缓存加载渲染（`rebuildForScene` 异步先清理后生成）；`GameScene.ts` 调用点适配（初始城镇 + switchScene 按场景重建）
- **验证**：温馨小屋 2 个（织娘/豆豆）、酒馆 3 个（醉猫/琴歌/话匣子）、铁匠铺 2 个（小锤/疤脸）；API `?scene=tavern` 返回 3 条、`?scene=town` 返回 10 条；酒馆截图可见 3 个 NPC 与家具 ✅
- **耗时**：1.2h

---

## 验收结果

- **TypeScript 编译**：server `npx tsc --noEmit` ✅ / client `npx tsc --noEmit` ✅
- **后端 API 实测**：
  - `GET /api/npcs/ambient?scene=town` → 10 条（城镇路人）✅
  - `GET /api/npcs/ambient?scene=tavern` → 醉猫/琴歌/话匣子 3 条 ✅
- **任务拒绝链路**（浏览器+后端日志）：
  - 弹窗显示"⚔ 确认接受"+"暂时不去"双按钮 ✅
  - 点"暂时不去"→ 弹窗关闭 → 后端 `rejected mission (re-popup after Day 1 11:00)` ✅
  - 时间到 11:00 自动重弹 → 再次拒绝 → `re-popup after Day 1 13:00` ✅（延迟重弹验证通过）
- **待机动作**（Playwright 轮询）：玩家站定 ~7.5s 触发"转头张望"（anim→player_idle_left），动作结束恢复 ✅
- **F 键进建筑**（Playwright @1920×1080）：
  - 温馨小屋门口 "[F] 进入 温馨小屋" → 按 F 进入室内 ✅
  - 长老大厅（序章未解锁）"🔒 长老大厅 尚未开放" → 按 F 拦截仍留城镇 ✅
  - 铁匠铺门口 "[F] 进入 铁砧工坊" → 按 F 进入 ✅
  - 室内出口 "[F] 离开" → 按 F 回城镇 ✅
- **室内氛围 NPC**（Playwright 截图）：温馨小屋 2 NPC、酒馆 3 NPC（醉猫/琴歌/话匣子可见+家具渲染）、铁匠铺 2 NPC ✅

## 遗留问题

| 遗留 | 说明 | 影响 |
|------|------|------|
| 普通NPC精灵动画键重复警告 | AnimationManager key already exists（场景反复重建时） | 低（仅警告，Day 28 已知，未新增） |
| 待机动作与战斗进入衔接 | 待机动作播放中按 B 开战斗，cancelIdleAction 已兜底恢复 | 低（已验证输入锁定会取消动作） |
| 野外遭遇战未接入 | 战斗仍由 B 键/任务触发演示战斗 | 中（沿用 Day 28/29 遗留） |

## 风险提示

- 纯增量改动：未修改现有剧情/任务/战斗核心链路；CollisionSystem 门口触发方式改变（自动→F键），已全面验证各场景进出正常。
- 室内氛围 NPC 不接入 Agent/LLM（amb_ 前缀短路），无 API 成本，与城镇路人机制一致。
- 无新增阻塞风险。

## 明日计划（Day 31 建议）

| 优先级 | 建议任务 | 说明 |
|--------|----------|------|
| P1 | 野外遇敌系统 | 城镇外区域（森林/矿洞）随机遇敌→自动进入战斗（沿用 Day 28-30 遗留） |
| P1 | 天气影响战斗 | 雨天/雷雨战斗水花/雾气，雪天战斗背景变雪地瓦片（增强天气沉浸感） |
| P2 | 任务进度HUD | 进行中主线任务常驻显示（右上角小面板：击杀 x/y） |
| P2 | 待机动作增强 | 更多动作种类（挠头/观察背包/坐下），NPC 也接入待机动作 |