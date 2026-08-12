---
AIGC:
  ContentProducer: '001191110102MAD55U9H0F10002'
  ContentPropagator: '001191110102MAD55U9H0F10002'
  Label: '1'
  ProduceID: '5188f0cd-0ce8-413c-9b42-7c54c694b7cf'
  PropagateID: '5188f0cd-0ce8-413c-9b42-7c54c694b7cf'
  ReservedCode1: '4faf133f-f98e-47bf-b4af-0dad0c44021f'
  ReservedCode2: '4faf133f-f98e-47bf-b4af-0dad0c44021f'
---

# Day 33 — 主线任务逻辑修复 + 循序渐进主线任务链（与地图解锁适配）

> Sprint 5 延展 | 日期：2026-08-04 | Agent开发日志

---

## 今日目标

_用户需求（逻辑修复 + 主线任务重设计）：_
1. **修复逻辑错误**：任务发布地点不能在未解锁的地图内
2. **设定细致的主线任务**：从开头熟悉主要NPC → 解锁地图 → 最后打BOSS，循序渐进，与地图解锁适配

### 问题分析

原 `MAINLINE_MISSIONS`（时间驱动主线任务）为**纯时间触发**，与地图解锁（章节）完全脱钩：
- `mainline_treant`（腐化树精）Day1 12:00 触发，但低语森林第一章才解锁 → 任务发布地点在未解锁地图内
- `mainline_cave_worms`（矿洞蠕虫）Day2 9:00 触发，但废弃矿洞第二章才解锁 → 同上
- `mainline_boss_guardian`（森林守护者）Day3 10:00 触发，同样可能落在未解锁森林

### 实现方案

- **任务定义重构**：`MainlineMissionDef` 支持多目标类型（talk_to_npc/visit_area/kill_enemy）+ `requiredChapter`（所需章节/地图解锁条件）+ `giverNpcId`（发布NPC）
- **任务链重设计**（"星火之旅"，11个任务循序渐进）：
  - 序章(0)：初来乍到(认识玛格丽特/老巴克/艾拉) → 小镇的问候(罗西/莉莉/小皮普) → 荒野之狼 → 哥布林骚扰
  - 第一章(1)：森林的低语(对话托比+进入森林) → 腐化树精 → 迷途之影
  - 第二章(2)：矿洞的呼唤(对话铁砧+进入矿洞) → 矿洞蠕虫危机 → 暗影先锋入侵
  - 第三章(3)：森林守护者（最终BOSS）
- **解锁校验**：`checkFixedMission` 中 requiredChapter>0 时通过注入的 chapterProvider 读取玩家当前章节，未解锁不发布（不标记触发点），章节推进后再检查弹出
- **推进链路**：NPC对话推进 talk_to_npc（handler 接入 triggerNpcTalk + questEngine 中文名/占位ID多路匹配）；场景切换上报 area:enter 推进 visit_area；章节推进（storyProgressionManager）后自动触发 mainline 检查
- **前端适配**：QuestGuide 目标图标按类型区分（💬对话/🧭探索/⚔打怪）；QuestGuideArrows ENEMY_SCENE_MAP 修正（狼/哥布林→小镇周边，幽灵→森林）

## 任务清单

| 优先级 | Task ID | 名称 | 依赖 | 预估 | 状态 |
|--------|---------|------|------|------|------|
| P0 | T6.15.1 | 主线任务链重构：多目标类型+requiredChapter+发布NPC | 无 | 2h | ✅ |
| P0 | T6.15.2 | 地图解锁校验：任务发布地点不能是未解锁地图 | T6.15.1 | 0.5h | ✅ |
| P1 | T6.15.3 | talk/visit 目标推进链路（对话+场景切换上报） | T6.15.1 | 1h | ✅ |
| P1 | T6.15.4 | 章节推进联动主线检查 + 前端图标适配 | T6.15.2 | 0.5h | ✅ |

---

## 执行记录

### T6.15.1 主线任务链重构（多目标类型 + 章节绑定）
- **mainlineQuestService.ts**：
  - `MainlineMissionObjective` 新类型（type: talk_to_npc/visit_area/kill_enemy + targetId + count）
  - `MainlineMissionDef` 新增 `requiredChapter`、`giverNpcId`
  - `MAINLINE_MISSIONS` 重写为 11 个任务的"星火之旅"任务链（章节递进 ch0→ch1→ch2→ch3）
  - `initialize()` 注册任务与 DB upsert 均按新结构写入（type/targetId）
  - `getStatus` pending/nextMission 附带 objectives（type/targetId）
- **前端 QuestGuide.tsx**：objectiveIcon() 按目标类型显示 💬/🧭/🎒/⚔；QuestGuideArrows ENEMY_SCENE_MAP 修正（enemy_wolf/enemy_goblin→town，enemy_ghost→forest）

### T6.15.2 地图解锁校验（核心逻辑修复）
- `checkFixedMission`：requiredChapter>0 时通过 `chapterProvider` 读取玩家当前章节，`currentChapter < requiredChapter` → 不发布（return false，不标记 triggeredKeys）→ 章节推进后重新检查弹出
- `setChapterProvider` 注入；index.ts 中注入 `storyProgressionManager.getPlayerProgress` 作为提供器
- `checkForPlayer` 修复：固定主线未完成时若当前任务因地图未解锁延迟，直接 return false 防止误入关系驱动剧情模式
- **校验测试**（server/.temp/test-unlock.ts）：
  - ✅ 任务链章节递进正确（0→1→2→3）
  - ✅ 全部发布NPC均已解锁（NPC章节 ≤ 任务章节）
  - ✅ 全部任务目标（敌人/区域/NPC）均在已解锁地图内
  - ✅ 章节0玩家只收到序章任务，森林/矿洞/BOSS任务不发布（WS实测）

### T6.15.3 talk/visit 目标推进链路
- **questEngine.triggerNpcTalk**：多路匹配（原ID + sc_ 占位前缀剥离 + profileLoader 反查中文名）
- **handler.ts**：`interaction:trigger` 对话完成后调用 `questEngine.triggerNpcTalk(socket.id, npcId)`；新增 `area:enter` socket 事件 → `questEngine.triggerAreaEnter` + `storyProgressionManager.triggerScene(area_enter)`
- **GameScene.ts**：`switchScene` 进入 forest/mine 时上报 `area:enter`（动态 import 避免 async 改造）
- **websocket.ts**：新增 `reportAreaEnter(sceneId)`

### T6.15.4 章节推进联动 + 前端适配
- **storyProgressionManager.checkChapterProgression**：章节推进后动态 import mainlineQuestService 并调用 checkForPlayer（延迟任务立即弹出）
- **websocket.ts**：mainline:status 的 pendingMission/nextMission 透传 objectives（type/targetId）
- **验证**：
  - E2E（WS）：连接→"初来乍到"弹出→确认→对话推进（玛格丽特1/1、老巴克1/1、艾拉1/1）→任务完成→推进到"小镇的问候" ✅
  - 章节推进单测：ch0→ch1 后 computeUnlockState 低语森林解锁 ✅
  - 生产容器（Playwright + API）：任务引导面板显示新任务（💬图标），确认后三个目标实时刷新 ✅✓ → 对话推进全链路生效 ✅

---

## 验收检查项

1. [后端] `curl http://localhost:4000/api/level/mainline/status/<player>` → total=11，nextMission 为"初来乍到"（ch0）
2. [逻辑] 章节0玩家（新连接）只收到序章任务；森林/矿洞/BOSS任务不发布（requiredChapter 未满足）
3. [交互] 浏览器打开 http://localhost → 任务引导按钮感叹号 → 展开显示"初来乍到"（💬对话目标）→ 确认接受
4. [推进] 与NPC对话后目标实时刷新 1/1 → 三个目标完成后自动推进下一任务"小镇的问候"
5. [章节] 完成序章主线后章节推进 → 森林任务（ch1）随后弹出（章节联动 mainline 检查）
6. [部署] docker compose --profile production 重建，server/client 容器 healthy

## 遗留问题

- 无（本次任务全部完成验收通过）