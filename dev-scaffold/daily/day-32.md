---
AIGC:
  ContentProducer: '001191110102MAD55U9H0F10002'
  ContentPropagator: '001191110102MAD55U9H0F10002'
  Label: '1'
  ProduceID: 'c67e0ec9-f87b-4214-acd4-160f434f4932'
  PropagateID: 'c67e0ec9-f87b-4214-acd4-160f434f4932'
  ReservedCode1: '6c32582f-c877-4dfd-9249-feff57cc1de3'
  ReservedCode2: '6c32582f-c877-4dfd-9249-feff57cc1de3'
---

# Day 32 — 原神式任务指引箭头 + 冒险者行走速度调慢

> Sprint 5 延展 | 日期：2026-08-03 | Agent开发日志

---

## 今日目标

_用户需求（2项迭代）：_
1. 做一个地图指引，类似原神：当用户接受任务之后，有闪动的白色箭头在路上，告诉用户应该去哪里
2. 调慢冒险者的行走速度

实现方案：
- **原神式任务指引**：新建 QuestGuideArrows 系统——玩家接受主线任务（activeMission）后，在玩家与目标之间的"路上"绘制一枚白色闪动箭头（三角箭头+光晕+尾带，alpha 呼吸闪动）；目标在当前场景直接指向目标点，目标在其他场景指向通往该场景的入口（城镇门），身处室内/野外时指向当前场景出口；接近目标（<160px）自动隐藏
- **目标定位**：后端 mainline 状态与广播的 objectives 附带 type/targetId（kill_enemy/talk_to_npc/collect_item/visit_area + 目标ID），前端据此前端映射表（ENEMY_SCENE_MAP/NPC_SCENE_MAP/SCENE_PORTALS）解析目标位置
- **行走速度**：MovementSystem 340 → 250 px/s（约每秒 3.9 tiles，悠闲冒险步伐）

## 任务清单

| 优先级 | Task ID | 名称 | 依赖 | 预估 | 状态 |
|--------|---------|------|------|------|------|
| P0 | T6.14.1 | 冒险者行走速度调慢（340→250px/s） | 无 | 0.1h | ✅ |
| P0 | T6.14.2 | 原神式任务指引箭头系统（白色闪动箭头指路） | T6.14.1 | 2h | ✅ |
| P1 | T6.14.3 | mainline 事件定向广播修复（防测试玩家干扰） | T6.14.2 | 0.5h | ✅ |

---

## 执行记录

### T6.14.1 冒险者行走速度调慢
- **MovementSystem.ts**：speed 340 → 250 px/s（1920×1080 原生分辨率下约每秒 3.9 tiles），注释同步更新
- **验证**：按住 D 键 1 秒玩家位移 250px（与 speed 完全一致）；按住 W 1 秒位移 112px（被森林门地形碰撞阻挡，非速度问题）

### T6.14.2 原神式任务指引箭头系统
- **QuestGuideArrows.ts（新）**：Phaser Graphics 单对象每帧重绘——
  - 读取 store.activeMission 第一个未完成目标 → 解析指引目标（场景+场景内tile坐标）：talk_to_npc/collect_item 按 NPC 归属场景与站位（NPC_SCENE_MAP/NPC_TOWN_STANDS/SCENES.npcSpawns，UUID 档案ID 经 GameScene 注入的 idToName 反查）；kill_enemy 按 ENEMY_SCENE_MAP 敌人归属场景（wolf/goblin/treant/shadow→forest，cave_worm→mine）；visit_area 按区域名匹配场景
  - 目标点→当前场景世界坐标（getGuideWorldPoint）：目标在当前场景→目标点；在城镇且目标在其他场景→指向 SCENE_PORTALS 该场景入口门；在室内/野外→指向 INTERIOR_EXIT_PORTALS 当前场景出口门
  - 渲染：玩家前方 150px 道路上的白色三角箭头（size42+光晕+尾带），alpha = 0.35 + 0.65·(0.5+0.5·sin(now/260)) 呼吸闪动；距目标 <160px 自动隐藏
  - 目标解析结果缓存（lastResolveKey），场景切换 setCurrentScene 失效缓存
- **gameStore.ts**：MissionObjective 新增 type 字段
- **websocket.ts**：story:mainline_confirmed / mainline:status 的目标映射透传 type+targetId
- **后端 mainlineQuestService.ts**：getStatus 的 activeProgress 附带 type+targetId；checkFixedMission/checkRelationshipStory/confirmMission（固定+剧情两分支）广播的 objectives 全部附带 type
- **GameScene.ts**：实例化/每帧 update/场景切换 setCurrentScene/后端NPC加载后注入 idToName/shutdown 销毁
- **验证**：
  - 目标解析：mainline_wolves(kill_enemy enemy_wolf) → {scene:forest, tileX:15, tileY:8} ✅
  - 箭头出现：任务确认后玩家前方出现白色三角箭头，方向朝上指向森林入口 ✅
  - 闪动：连拍4张（间隔0.35s）箭头ROI白色高亮像素 109→467 明显波动 ✅
  - 跨场景指向：town→forest 返回森林门(672,96)；forest内→forest 返回内部(992,544)；blacksmith室内→forest 返回出口门(992,1056)；tavern室内→mine 返回出口门 ✅
  - 接近隐藏：玩家距森林门 30px（<160px）时箭头消失 ✅

### T6.14.3 mainline 事件定向广播修复
- **问题**：checkAllPlayers 遍历 playerStates 缓存（含 curl 测试玩家 demo-player），且 io.emit 全服广播 → demo-player 到点弹任务时所有在线玩家都收到 popup，导致已确认的任务被"再次弹窗"覆盖回待确认态
- **修复**：mainlineQuestService 5 处 io.emit → io.to(playerId).emit 定向发送；checkAllPlayers 改为只遍历在线玩家（io.sockets.sockets，无 io 时回退缓存）；前端 websocket story:mainline_popup/confirmed/rejected 增加 playerId===本机校验
- **验证**：任务确认后不再被 demo-player 弹窗打断，面板稳定进入"进行中"状态 ✅

---

## 验收结果

- **TypeScript 编译**：server `npx tsc --noEmit` ✅ / client `npx tsc --noEmit` ✅
- **原神式任务指引箭头（Playwright @1920×1080）**：
  - 任务引导面板确认"荒野之狼出没"后，玩家前方路上出现白色三角箭头 ✅
  - 箭头方向朝上指向目标场景（低语森林入口，城镇北部门）✅
  - 箭头呼吸闪动（连拍4张白色高亮像素 109→467 波动）✅
  - 目标解析正确：kill_enemy(enemy_wolf) → forest(15,8) ✅
  - 跨场景指引：城镇→目标场景指向入口门 / 场景内指向目标点 / 室内指向出口门 ✅
  - 接近目标（<160px）箭头自动隐藏 ✅
- **行走速度**：按住方向键 1 秒位移 250px（speed=250 确认），较原 340px/s 明显放缓 ✅
- **修复回归**：确认任务后稳定进入"进行中"，不再被其他玩家/测试玩家的任务弹窗覆盖 ✅
- 浏览器 0 报错 0 警告

## 遗留问题

| 遗留 | 说明 | 影响 |
|------|------|------|
| 低语森林剧情锁 | 序章玩家无法进入森林实测"森林内箭头指向内部目标"，已通过 getGuideWorldPoint 单测逻辑验证（forest→forest 返回内部目标点） | 低（逻辑已验证） |
| 普通NPC精灵动画键重复警告 | AnimationManager key already exists（场景反复重建时） | 低（Day 28 已知，未新增） |
| 野外遭遇战未接入 | 战斗仍由 B 键/任务触发演示战斗 | 中（沿用 Day 28-31 遗留） |

## 风险提示

- 箭头系统为纯前端增量：不修改原有任务/战斗链路；目标无法定位（未知UUID/未知区域名）时安全隐藏箭头，不影响游戏运行。
- mainline 广播改定向发送：对单玩家游戏无影响；多玩家时各玩家只收到自己的任务事件（行为更正确）。
- 行走速度调慢仅影响玩家角色，NPC 日程移动速度不变。
- 无新增阻塞风险。

## 明日计划（Day 33 建议）

| 优先级 | 建议任务 | 说明 |
|--------|----------|------|
| P1 | 关系驱动任务目标推进链路 | 打通 talk_to_npc（对话即推进）/collect_item（背包变化）/visit_area（进入区域）与关系剧情目标的联动 |
| P1 | 野外遇敌系统 | 城镇外区域（森林/矿洞）随机遇敌→自动进入战斗（沿用 Day 28-31 遗留） |
| P2 | 剧情弧HUD展示 | 主线引导面板显示当前故事弧名称/进度（弧 x/5），任务面板展示关系剧情任务 |
| P2 | 箭头指引增强 | 多目标支持、指向路径虚线（原神式寻路线）、任务目标在地图上的持久标记 |