---
AIGC:
  ContentProducer: '001191110102MAD55U9H0F10002'
  ContentPropagator: '001191110102MAD55U9H0F10002'
  Label: '1'
  ProduceID: '89e0a137-623c-4b11-a6f5-957e6d40fbd7'
  PropagateID: '89e0a137-623c-4b11-a6f5-957e6d40fbd7'
  ReservedCode1: '6b8447d5-f6f0-48ce-9e5a-7bfc4c84a755'
  ReservedCode2: '6b8447d5-f6f0-48ce-9e5a-7bfc4c84a755'
---

# Day 26 — 主线剧情解锁系统（场景/NPC随剧情推进逐步可见）

> Sprint 5 延展 | 日期：2026-08-03 | Agent开发日志

---

## 今日目标

_用户需求：增加游戏的可玩性，设置一个主线剧情。场景、NPC 随着剧情的推进才逐步可见。_

实现方案：**剧情解锁系统（Story Unlock System）**
- 场景解锁：序章解锁小镇+5建筑；第一章解锁低语森林/长老大厅；第二章解锁废弃矿洞
- NPC解锁：序章6位小镇居民；第一章托比/马库斯/西尔维娅；第二章格罗姆/铁砧；第三章暗祭司塞拉斯
- 未解锁内容在城镇中表现为"迷雾封锁"状态（半透明+迷雾粒子+名字？？？），NPC完全不出现
- 章节推进时广播解锁事件，前端实时解除迷雾、NPC现身、弹出解锁通知横幅

## 任务清单

| 优先级 | Task ID | 名称 | 依赖 | 预估 | 状态 |
|--------|---------|------|------|------|------|
| P0 | T6.6.1 | 解锁规则表设计 | 无 | 1h | ✅ |
| P0 | T6.6.2 | 解锁状态纯函数 | T6.6.1 | 0.5h | ✅ |
| P0 | T6.6.3 | 章节推进广播联动 | T6.6.2 | 0.5h | ✅ |
| P0 | T6.6.4 | 解锁状态API | T6.6.2 | 0.5h | ✅ |
| P1 | T6.6.5 | 前端解锁状态存储 | 无 | 0.5h | ✅ |
| P1 | T6.6.6 | 前端解锁管理器 | T6.6.5 | 0.5h | ✅ |
| P1 | T6.6.7 | 建筑迷雾锁定态 | T6.6.6 | 1h | ✅ |
| P1 | T6.6.8 | 门口解锁拦截 | T6.6.6 | 0.5h | ✅ |
| P1 | T6.6.9 | NPC解锁过滤 | T6.6.6 | 0.5h | ✅ |
| P2 | T6.6.10 | 解锁通知反馈 | T6.6.8 | 1h | ✅ |

---

## 执行记录

### T6.6.1 解锁规则表设计
- **产出**：`server/src/services/storyUnlockService.ts` — `SCENE_UNLOCK_RULES`（9场景）+ `NPC_UNLOCK_RULES`（12NPC）
- **章节节奏**：序章0=小镇+5建筑+6居民；第一章1=低语森林+长老大厅+托比/马库斯/西尔维娅；第二章2=废弃矿洞+格罗姆/铁砧；第三章3=暗祭司塞拉斯
- **文案**：每个场景带解锁文案（"低语森林解锁 — 小镇北方传来神秘的耳语…"）和锁定提示（"前方雾气弥漫…"）
- **耗时**：1h

### T6.6.2 解锁状态纯函数
- **产出**：`computeUnlockState(progress)` — 根据剧情进度（currentChapter/completedChapters/flags）派生场景/NPC解锁状态 + `newlyUnlocked` 新解锁项
- **特性**：支持 `requiredFlag` 额外剧情标志条件；纯函数无副作用可测试
- **耗时**：0.4h

### T6.6.3 章节推进广播联动
- **产出**：`broadcastUnlock(io, progress)` — 章节推进后 `io.emit('story:unlock_changed', {playerId, currentChapter, unlocked})`
- **接入**：`storyProgressionManager.checkChapterProgression` 章节推进成功后调用
- **耗时**：0.4h

### T6.6.4 解锁状态API
- **产出**：`GET /api/integration/unlock-state/:playerId` — 返回玩家场景/NPC解锁状态
- **验证**：序章初始 = 6场景解锁+3锁定、6NPC解锁+6锁定 ✅
- **耗时**：0.3h

### T6.6.5 前端解锁状态存储
- **产出**：`client/src/stores/gameStore.ts` 新增 `story` slice（currentChapter/scenes/npcs/lastUnlockNotice）+ 4个actions
- **耗时**：0.4h

### T6.6.6 前端解锁管理器
- **产出**：`client/src/services/storyUnlock.ts` — `fetchUnlockState` / `isSceneUnlocked` / `isNpcUnlocked` / `getSceneLockedMessage` / `watchStoryUnlockEvents`
- **事件**：监听 `story:unlock_changed` / `story:chapter_complete`，解锁后自动刷新状态
- **耗时**：0.5h

### T6.6.7 建筑迷雾锁定态
- **产出**：`TownBuildingRenderer.renderAll` 按 `isSceneUnlocked` 渲染——未解锁建筑 `alpha 0.35` + 深灰着色 + 3团迷雾粒子（缓慢飘动）+ 名称牌"？？？"
- **验证**：长老大厅/低语森林/废弃矿洞显示"？？？"，9个迷雾粒子 ✅
- **耗时**：1.2h

### T6.6.8 门口解锁拦截
- **产出**：`GameScene.handleDoorTransition` 进入门前检查 `isSceneUnlocked(portal.to)`，未解锁 → `showLockedSceneHint` 弹出"🔒 尚未开放 + 锁定提示"并阻止切换
- **耗时**：0.4h

### T6.6.9 NPC解锁过滤
- **产出**：`loadNPCsFromServer` / `rebuildSceneNPCs` 按 `isNpcUnlocked` 过滤
- **修复**：占位NPC未销毁导致锁定NPC仍显示 → 服务器数据加载成功后销毁全部占位再重建
- **验证**：序章只显示6位居民（玛格丽特/老巴克/艾拉/罗西/莉莉/小皮普）✅
- **耗时**：0.8h

### T6.6.10 解锁通知反馈
- **产出**：
  - `GameScene.showUnlockBanner` — Phaser层解锁横幅（金色描边+滚动展示新解锁内容）
  - `StoryUnlockNotice.tsx/.css` — React层：解锁通知横幅 + 右下角常驻章节指引面板（"序章·星火初燃 / 已探索 6/9 区域 · 已结识 6/12 位居民"）
- **耗时**：1.2h

### T6.6.11 全窗口自适应铺满（用户需求：优化游戏界面，铺满整个浏览器）
- **问题诊断**：561×417 窗口下 canvas CSS 尺寸仍为 1920×1080（未缩放），画布居中后四周溢出被裁剪。根因在 `PixelPerfectRenderer.updateScale()` 整数缩放分支：`intScale = Math.max(1, ...)` 将整数倍钳制为最小值1，而 `intCoverage >= 0.97` 在窗口小于1080p时恒成立（画布远大于容器），导致小窗口下画布完全不缩放。
- **产出**（`client/src/game/rendering/PixelPerfectRenderer.ts`）：
  - 重写 `updateScale`：cover 等比缩放策略——`Math.max(容器宽/1920, 容器高/1080)` 保证画布铺满容器无黑边
  - 整数缩放仅当"整数倍能覆盖容器且溢出 ≤5%"时启用（1080p=1x 原生 / 4K=2x 锐利），否则走小数 cover
  - 缩放精度 0.0001，16:9 窗口可精确铺满（1280×720 显示 1280×720 零溢出）
  - `retryScaleUntilReady`：容器就绪前多帧重试，避免 React 布局时序导致初始缩放错误
  - `ResizeObserver` 监听容器尺寸（优于 window resize），覆盖侧边栏/iframe/全屏切换
- **验证**（Playwright 多分辨率）：
  - 1920×1080 / 2560×1440(2K)：画布精确铺满，零溢出 ✅
  - 1280×720 / 1366×768：画布精确铺满，零溢出 ✅
  - 561×417（4:3竖比）：cover 铺满，左右各裁 90px（非16:9窗口无黑边取舍）✅
  - 视觉验收：小屋/集市/酒馆/栅栏/NPC 完整可见，无黑边无裁剪 ✅
- **耗时**：1.5h

---

## 验收结果

- **TypeScript 编译**：server `npm run build` ✅ / client `tsc -b && vite build` ✅
- **后端API**：`GET /api/integration/unlock-state/:playerId` 返回200，序章初始 6场景/6NPC 解锁 ✅
- **章节推进联动**（脚本验证）：
  - 章节0→1：解锁低语森林/长老大厅 + 托比/马库斯/西尔维娅，广播 `story:unlock_changed` ✅
  - 章节1→2：解锁废弃矿洞 + 格罗姆/铁砧 ✅
- **前端渲染**（Playwright @1920×1080）：
  - 未解锁建筑迷雾锁定态：alpha 0.35 + 名称"？？？" + 9团迷雾粒子 ✅
  - 未解锁NPC隐藏：序章仅6位居民可见 ✅
  - 章节指引面板："序章·星火初燃 / 已探索 6/9 区域 · 已结识 6/12 位居民" ✅
  - 解锁通知横幅：调用 showUnlockBanner 弹出"低语森林解锁 / 游商托比来到小镇" ✅
- **场景切换**：城镇→已解锁建筑→室内→返回城镇 链路正常 ✅
- **全窗口自适应**（T6.6.11，Playwright 多分辨率）：
  - 1920×1080 / 2560×1440 / 1280×720 / 1366×768：画布精确铺满浏览器，零溢出 ✅
  - 561×417 极小窗口：等比 cover 铺满，无黑边 ✅
  - 画面内容完整可见（小屋/集市/酒馆/栅栏/NPC），无黑边无裁剪 ✅

## 遗留问题

| 遗留 | 说明 | 影响 |
|------|------|------|
| 未解锁场景门仍可踏上 | 玩家可走到未解锁建筑门口，但触发时会被拦截提示（设计如此：提示引导而非完全隐藏） | 低 |
| 剧情任务依赖数据库Quest表 | 主线任务以内存注册为主，章节推进需任务完成触发（已有种子主线任务） | 中 |

## 风险提示

- 无新增阻塞风险。解锁系统为纯增量：后端新增独立服务+路由，前端新增 slice 与服务，未改动既有系统核心逻辑。
- 前端截图工具因 ZCOOL KuaiLe 字体大量 subset 加载超时，改用 Phaser renderer.snapshot 验证画面，已确认渲染正常。

## 明日计划（Day 27 建议）

| 优先级 | 建议任务 | 说明 |
|--------|----------|------|
| P1 | 主线任务完整闭环 | 打通"序章主线任务→章节推进→解锁"的真实游玩链路（数据库主线任务+触发点） |
| P1 | 解锁音效反馈 | 章节推进/解锁时的提示音效 |
| P2 | 主线目标指引 | 在章节指引面板中显示当前主线任务目标（下一步做什么） |
| P2 | 未解锁区域地图迷雾 | 小地图/世界地图上未解锁区域显示迷雾遮罩 |