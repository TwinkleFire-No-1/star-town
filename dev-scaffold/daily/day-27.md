---
AIGC:
  ContentProducer: '001191110102MAD55U9H0F10002'
  ContentPropagator: '001191110102MAD55U9H0F10002'
  Label: '1'
  ProduceID: '5c2eca94-813e-4a3e-8e9b-d7c6769c3f74'
  PropagateID: '5c2eca94-813e-4a3e-8e9b-d7c6769c3f74'
  ReservedCode1: '2d7b3614-eb88-41c8-b329-b48f64fe800b'
  ReservedCode2: '2d7b3614-eb88-41c8-b329-b48f64fe800b'
---

# Day 27 — 普通NPC（路人）系统：固定台词 + 城镇漫游，营造热闹氛围

> Sprint 5 延展 | 日期：2026-08-03 | Agent开发日志

---

## 今日目标

_用户需求：npc用你准备好的美术资源啊，增加一些更普通的NPC，只会回复固定的回答，营造整个镇子闹哄哄的感觉，可以走动。_

实现方案：**普通NPC（Ambient NPC）系统**
- 复用已有12张NPC美术精灵图（margaret/oldbuck/ella等），不再新增资源
- 新增10个路人NPC（阿福/翠花/狗蛋/大牛/桂花/二丫/石头/胖婶/老杨/铁牛），固定台词库
- 交互短路：amb_前缀NPC的 interaction:trigger/message 直接返回固定台词，不走Agent/LLM链路（零成本、秒响应）
- 城镇随机漫游：出生点 roamRadius 内随机选可走目标点，走走停停 + 4方向行走动画
- 头顶随机气泡台词：营造整个镇子"闹哄哄"的生活氛围

## 任务清单

| 优先级 | Task ID | 名称 | 依赖 | 预估 | 状态 |
|--------|---------|------|------|------|------|
| P0 | T6.7.1 | 普通NPC定义与台词库 | 无 | 1h | ✅ |
| P0 | T6.7.2 | 普通NPC列表API | T6.7.1 | 0.3h | ✅ |
| P0 | T6.7.3 | 交互固定回复短路 | T6.7.1 | 0.5h | ✅ |
| P1 | T6.7.4 | 普通NPC精灵复用美术资源 | T6.7.2 | 0.5h | ✅ |
| P1 | T6.7.5 | 普通NPC漫游系统 | T6.7.4 | 1.5h | ✅ |
| P1 | T6.7.6 | 头顶气泡台词 | T6.7.5 | 0.5h | ✅ |
| P2 | T6.7.7 | 场景切换重建 | T6.7.5 | 0.5h | ✅ |

---

## 执行记录

### T6.7.1 普通NPC定义与台词库
- **产出**：`server/src/services/ambientNpcService.ts` — `AmbientNpcDef` 接口 + 10个路人NPC
- **身份**：赶集农夫阿福/洗衣妇翠花/顽皮孩童狗蛋/搬运工大牛/卖菜婆桂花/面包学徒二丫/木匠石头/茶馆主妇胖婶/鱼贩老杨/猎户铁牛
- **台词**：greetings（靠近打招呼3-4条）、replies（关键词匹配规则，如"你好/天气/集市/传闻/名字"）、defaultReplies（兜底）、bubbles（头顶气泡3-5条）
- **站位**：广场/集市/井边/建筑门口等10个城镇点位（tile坐标，30×26地图）
- **耗时**：1h

### T6.7.2 普通NPC列表API
- **产出**：`crud.ts` 新增 `GET /api/npcs/ambient` → 返回全部普通NPC定义
- **验证**：curl 返回10条，含 id/name/title/站位/漫游半径/复用资产 ✅
- **耗时**：0.2h

### T6.7.3 交互固定回复短路
- **产出**：`socket/handler.ts` 的 `interaction:trigger` / `interaction:message` 开头增加 `ambientNpcService.isAmbientNpc(npcId)` 判断
- **逻辑**：amb_前缀 → pickGreeting/pickReply 取固定台词 → 逐字流式发送（打字机效果）→ 直接 return，不进入 perceive/think/act 链路
- **验证**：E键对话翠花返回"哎哟，吓我一跳！"；发"你好"返回"你好呀，年轻人。"；发"听说…"返回"听说广场那边天天有人打架…" ✅
- **耗时**：0.5h

### T6.7.4 普通NPC精灵复用美术资源
- **产出**：
  - `SpriteGenerator.generateNPCSprite` 增加 `externalAssetId` 参数（显式指定复用资源）
  - `NpcSpriteManager.NPCData` 增加可选 `assetId` 字段并透传
- **复用映射**：阿福→oldbuck / 翠花→ella / 狗蛋→pip / 大牛→marcus / 桂花→margaret / 二丫→lily / 石头→ironanvil / 胖婶→rossie / 老杨→sylvia / 铁牛→toby
- **验证**：控制台显示 `Loaded HD external sprite: npc_amb_villager_01 ← npc-oldbuck (256x192, frame=64px)` ✅
- **耗时**：0.4h

### T6.7.5 普通NPC漫游系统
- **产出**：`client/src/game/systems/AmbientNpcSystem.ts`
  - `init()` 拉取 /api/npcs/ambient；`rebuildForScene()` 仅城镇生成
  - 每NPC：出生点 + roamRadius（2-4 tile）→ 随机目标点 → `isWalkableAt` 避障 → 走走停停（idle 1.2-4s）
  - 移动速度 = def.speed × 64px/s；按移动方向播放 walk 动画；名字标签 + 脚下椭圆阴影
  - 独立管理精灵（不进入 NpcSpriteManager，避免被 loadNPCsFromServer 重建误销毁）
- **验证**：5秒采样7/10个NPC移动（13-213px），漫游正常 ✅
- **耗时**：1.4h

### T6.7.6 头顶气泡台词
- **产出**：AmbientNpcSystem.updateBubble — 每NPC随机间隔(2-6s)头顶冒固定台词气泡
- **样式**：米白背景羊皮纸气泡（rgba(255,250,235,0.92)）+ 上浮动画1.2s + 持续2.6s + 深棕文字26px
- **验证**：截图可见"今天的水可真凉……""今天烤了十二炉！"等气泡 ✅
- **耗时**：0.4h

### T6.7.7 场景切换重建
- **产出**：GameScene 集成
  - create()：创建 AmbientNpcSystem + 注册交互hooks + init后城镇生成
  - update()：每帧更新漫游与气泡
  - switchScene()：`rebuildForScene(sceneId)` 城镇生成/室内清理
  - shutdown()：destroyAll 清理
- **验证**：城镇10路人 → 进温馨小屋0个 → 出屋回城镇恢复10个 ✅
- **耗时**：0.4h

---

## 验收结果

- **TypeScript 编译**：server `npm run build` ✅ / client `tsc -b && vite build` ✅
- **后端API**：`GET /api/npcs/ambient` 返回10个普通NPC ✅
- **固定回复**（WebSocket实测）：
  - trigger：翠花→"哎哟，吓我一跳！" ✅
  - message"你好"→"你好呀，年轻人。" ✅
  - message"听说…"→"听说广场那边天天有人打架，我可不敢去。" ✅
- **漫游**：5秒内7/10个NPC发生移动（26-213px），走走停停+行走动画 ✅
- **头顶气泡**：随机冒台词（"今天的水可真凉……"/"今天烤了十二炉！"）✅
- **场景切换**：城镇10个 → 温馨小屋0个 → 回城镇恢复10个 ✅
- **渲染**（Phaser snapshot @1920×1080，见 `daily/assets/day27-ambient-npcs.png`）：
  - 12个角色（6核心+6解锁 + 10路人中可见者）散布广场/道路/建筑门口
  - 名字标签齐全（阿福/翠花/狗蛋/大牛/桂花/老杨/胖婶/二丫…）
  - 气泡台词可见，小镇热闹有生活气息

## 遗留问题

| 遗留 | 说明 | 影响 |
|------|------|------|
| 路人外观与核心NPC重复 | 普通NPC复用12张现有精灵图，个别与核心NPC"撞脸"（如桂花用玛格丽特图） | 低（可通过名字/称号/走动区分，用户明确要求复用美术资源） |
| 气泡偶尔与核心NPC重叠 | 广场区域路人密集时气泡可能遮挡 | 低 |

## 风险提示

- 无新增阻塞风险。普通NPC系统为纯增量：后端新增独立服务+路由+socket短路分支，前端新增独立系统类，未改动核心NPC/Agent/剧情链路。
- 普通NPC不参与剧情解锁（不受 isNpcUnlocked 过滤），序章即可见，符合"闹哄哄小镇"诉求。

## 明日计划（Day 28 建议）

| 优先级 | 建议任务 | 说明 |
|--------|----------|------|
| P1 | 路人NPC差异化配色 | 在复用精灵图上叠加色调偏移（tint），解决撞脸问题，让路人更具辨识度 |
| P1 | 路人NPC聚集热点 | 集市/广场按时段聚集路人（如上午集市人最多），进一步增强生活感 |
| P2 | 路人偶发对话 | 两个路人靠近时互弹气泡对话（"今天天气不错""是啊"），让小镇更鲜活 |
| P2 | 主线任务完整闭环 | 打通"序章主线任务→章节推进→解锁"真实游玩链路（承接Day 26遗留） |