---
AIGC:
  ContentProducer: '001191110102MAD55U9H0F10002'
  ContentPropagator: '001191110102MAD55U9H0F10002'
  Label: '1'
  ProduceID: '6c09c022-6607-413f-8ddd-98af0cdcfbad'
  PropagateID: '6c09c022-6607-413f-8ddd-98af0cdcfbad'
  ReservedCode1: '29d2edad-4351-4cbb-9b65-8b5f3979270e'
  ReservedCode2: '29d2edad-4351-4cbb-9b65-8b5f3979270e'
---

# Day 34 — HUD简化 + 天气弹出提示 + 移除交易/背包系统

> 日期：2026-08-04
> Sprint：Sprint 5+（延展）
> 主题：界面精简——右上角只留用户名、天气变化时弹出、交易与背包系统下线

## 用户需求

1. 右上角的天气只有在改变的时候弹出一下，接着消失（不常驻）
2. 取消交易系统
3. 右上角不要那么复杂，只保留用户名即可

**澄清确认**：时间面板移到左上角；退出按钮改为点击用户名弹出的下拉菜单；交易+背包前后端全部移除（保留背包道具的剧情发放逻辑，仅移除UI与买卖接口）。

## 今日任务清单

| Task ID | 名称 | 状态 |
|---------|------|------|
| T6.16.1 | 天气改为变化时弹出提示（4秒后消失） | ✅ |
| T6.16.2 | 右上角只保留用户名 + 时间移到左上角 | ✅ |
| T6.16.3 | 移除交易系统（前端组件+快捷动作） | ✅ |
| T6.16.4 | 移除背包系统（前端组件） | ✅ |
| T6.16.5 | 移除交易/背包后端API | ✅ |

## 执行记录

### T6.16.1 天气改为变化时弹出提示
- **client/src/components/WeatherDisplay.tsx** 重写：
  - `prevTypeRef` 记录上一次天气 type，仅当 `weather.type` 变化时 `setVisible(true)` 弹出
  - 4 秒定时器自动 `setVisible(false)` 隐藏，卸载时清理定时器
  - 平时 `return null` 不渲染任何天气面板
- 天气粒子效果（GameScene WeatherSystem）不受影响，雨/雪/雾粒子与色调滤镜继续常驻

### T6.16.2 右上角只保留用户名 + 时间移到左上角
- **client/src/App.tsx**：
  - 右上角状态栏重构为 `username-btn`（绿点 + 用户名 + ▾ 展开箭头），点击切换 `userMenuOpen`
  - 下拉菜单 `user-menu`：显示用户名 + "退出登录"按钮（点击登出并断开 WS）
  - 移除 Room 标签、独立退出按钮
- **client/src/App.css**：status-bar 精简定位 right:8px；新增 username-btn/user-menu 木质样式；scene-indicator 从左上角移到右下角（避让时间面板）
- **client/src/components/TimeDisplay.css**：`.time-display` 由 `right:8px` 改为 `left:8px`（左上角）

### T6.16.3 移除交易系统（前端）
- 删除 `TradePanel.tsx`、`TradePanel.css`、`TradeDialoguePanel.tsx`
- **App.tsx** 移除 TradePanel/TradeDialoguePanel 的 import 与渲染
- **EnhancedDialogueInput.tsx**：删除交易分类 4 个快捷动作（qa_trade/qa_buy/qa_sell/qa_appraise），QuickActionDef.category 去掉 'trade'，CATEGORY_LABELS 去掉 trade
- **DialogueBox.tsx**：expandedActions 移除"交易"快捷动作

### T6.16.4 移除背包系统（前端）
- 删除 `InventoryPanel.tsx`、`InventoryPanel.css`
- **App.tsx** 移除 InventoryPanel 的 import 与渲染（I 键背包快捷键随之消失）

### T6.16.5 移除交易/背包后端API
- **server/src/routes/item.ts**：删除 `/items/buyable` 与 `/inventory/:playerId` 及 buy/sell/use/equip 4 个 POST 路由；保留 `/items`、`/items/category/:category`、`/items/stats`（物品定义查询，剧情/任务系统仍用 item 表）
- **server/src/routes/integration.ts**：`/safe-operation` 删除 buy_item 分支（仅保留 accept_quest），解构去掉 itemId/quantity
- **server/src/services/edgeCaseHandler.ts**：删除 `safeBuyItem` 方法、`safeGetInventory` 方法、runEdgeCaseTests 的"空背包处理"测试3
- itemService 保留（initialize 注册物品数据、任务奖励仍直接写 playerItem 表）

## 编译与验证

- 前端 `tsc --noEmit` ✅ 后端 `tsc --noEmit` ✅（noUnusedLocals 严格模式通过）
- 生产镜像重建：client/server 均 Build 成功（server 基础镜像 node:20-slim 拉取成功）
- 端口冲突处理：宿主机 4397 被 node 进程占用，`SERVER_PORT=4001` 环境变量覆盖启动（nginx 走容器内网 `server:4000`，不受影响）
- 容器状态：star-town-server / client / db / redis 全部 healthy

### 浏览器验收（Playwright @ http://localhost）
- 左上角显示时间面板（☀️ 第 1 天 10:52 上午）
- 右上角仅显示用户名按钮 `testachieve ▾`
- 点击用户名 → 弹出下拉菜单（testachieve + 退出登录）✅
- 点击退出登录 → 回到登录页 LandingPage ✅
- 天气 API 切换雷雨/飘雪/浓雾/小雨 → 天气面板在右上角弹出（🌫️ 起雾 浓雾弥漫…），4 秒后自动消失 ✅
- 买卖 API 验证：`/api/items/buyable`、`/api/inventory/:id`、`POST /buy` 全部返回 404 ✅
- `/api/items` 物品定义查询正常返回 ✅

## 验收检查项

1. [布局] 浏览器打开 http://localhost → 右上角只显示用户名按钮（绿点+用户名+▾），无 Room 标签、无独立退出按钮
2. [交互] 点击右上角用户名 → 弹出下拉菜单（用户名+退出登录）→ 点击退出登录回到登录页
3. [布局] 左上角显示时间面板（第X天 HH:MM + 时段），场景指示器移到右下角
4. [天气] `curl -X POST http://localhost/api/weather/set -H "Content-Type: application/json" -d '{"type":"storm"}'` → 右上角弹出雷雨面板，4秒后自动消失，平时无天气面板
5. [交易移除] `curl http://localhost/api/items/buyable` → 404；`curl http://localhost/api/inventory/test` → 404；`curl -X POST http://localhost/api/inventory/test/buy` → 404
6. [物品保留] `curl http://localhost/api/items` → 物品列表正常返回
7. [部署] docker compose --profile production（SERVER_PORT=4001）重建，server/client 容器 healthy

## 遗留问题

- 宿主机 4397 端口被 node 进程（TeleAgent 相关）长期占用，生产 server 需以 SERVER_PORT=4001 启动（或清理占用进程后回归 4000）
- 剧情/任务奖励物品仍写入 playerItem 表（数据保留），但玩家端无背包 UI 查看——如需查看需后续单独方案