---
AIGC:
  ContentProducer: '001191110102MAD55U9H0F10002'
  ContentPropagator: '001191110102MAD55U9H0F10002'
  Label: '1'
  ProduceID: '47d94726-a8df-46bb-b40d-265c33b6efad'
  PropagateID: '47d94726-a8df-46bb-b40d-265c33b6efad'
  ReservedCode1: '77bf74e7-0c50-42e9-92d7-adb0cb935962'
  ReservedCode2: '77bf74e7-0c50-42e9-92d7-adb0cb935962'
---

# Sprint 5：UI 重设计 — 星露谷物语风格 (D21-D23)

> 主题：从"能用"到"好看"——全面注入美术资源，统一木质暖色 UI，场景丝滑过渡

---

## Sprint 目标

1. 内部分辨率从 320×180 提升至 480×270，文字清晰可读
2. 全部界面统一星露谷风格（木质面板 + 羊皮纸 + 蜂蜜金 + 草地绿）
3. AI 生成并接入像素美术资源（瓦片/精灵/立绘/图标）
4. 场景间 fade/wipe 过渡，进入区域有名称弹幕动画
5. 所有用户可读文字 ≥ 11px，正文 ≥ 13px，零子像素模糊

---

## 设计文档

> 详细设计规范见 `docs/ui-redesign-spec.md`

核心设计决策：
- 分辨率：480×270（星露谷原生分辨率）
- 字体：Press Start 2P（标题）+ VT323（正文）+ ZCOOL KuaiLe（中文）
- 配色：暖棕木色 `#6B4423` / 羊皮纸 `#F5E6C8` / 蜂蜜金 `#E8A93C` / 草地绿 `#5B8C3E`
- 渲染：React DOM（UI）+ Phaser Canvas（世界），像素完美整数倍缩放

---

## Sprint Backlog

| Story | SP | Day分配 | 状态 |
|-------|-----|---------|------|
| S6.1 UI 基础设施升级 | 8 | D21 | ⬜ |
| S6.2 界面视觉重设计 | 8 | D22 | ✅ |
| S6.3 场景跳转与美术接入 | 5 | D23 | ⬜ |
| **合计** | **21** | | |

## 每日任务分配

### D21 — 基础设施 + 色彩/字体 + 资源生成
- T6.1.1 像素字体接入（Google Fonts CDN）⬜
- T6.1.2 分辨率 320→270 提升（config + PixelPerfectRenderer + 场景边界）⬜
- T6.1.3 CSS 变量色彩体系（暖棕木质色板）⬜
- T6.1.4 木质面板通用样式（panel-wood / btn-wood）⬜
- T6.1.5 AI 生成瓦片集资源（草地/泥土/石板/木地板）⬜
- T6.1.6 AI 生成 NPC 立绘（12 个）⬜
- T6.1.7 AI 生成物品图标 atlas（武器/防具/消耗/材料）⬜
- T6.1.8 AI 生成玩家/NPC 精灵图（4 方向行走动画）⬜
- T6.1.9 资源加载管线（PreloadScene 加载全部 PNG + 进度条）⬜

### D22 — 各界面 UI 重设计
- T6.2.1 顶部 HUD 重设计（TimeDisplay + 连接状态）✅
- T6.2.2 对话框重设计（DialogueBox 木质框 + 立绘区 + 羊皮纸正文）✅
- T6.2.3 增强输入栏重设计（EnhancedDialogueInput 木质快捷按钮）✅
- T6.2.4 任务面板重设计（QuestPanel 木质面板 + 进度条）✅
- T6.2.5 背包面板重设计（InventoryPanel 物品格 + 图标）✅
- T6.2.6 交易面板重设计（TradePanel + TradeDialoguePanel）✅
- T6.2.7 战斗 UI 重设计（BattleScene + BattleUI 像素精灵 + 分段血条）✅
- T6.2.8 加载/标题画面（PreloadScene 星空背景 + 进度条）✅
- T6.2.9 区域名弹幕动画（GameScene regionLabel 滑入淡出）✅

### D23 — 场景跳转 + 美术接入 + 打磨
- T6.3.1 场景过渡预设（SceneManager 6 种过渡配置）⬜
- T6.3.2 游戏场景过渡接入（进/出建筑 fade）⬜
- T6.3.3 战斗场景过渡（白闪 + 红色 wipe，结束 fade）⬜
- T6.3.4 瓦片集资源接入（TilesetManager + MapRenderer）⬜
- T6.3.5 精灵图资源接入（SpriteGenerator + NpcSpriteManager）⬜
- T6.3.6 NPC 立绘接入对话（DialogueBox 替换 hash 色块）⬜
- T6.3.7 物品图标接入背包（InventoryPanel 显示像素图标）⬜
- T6.3.8 战斗精灵图接入（BattleScene 替配色块）⬜
- T6.3.9 全局视觉打磨（像素完美检查 + 阴影/字号统一）⬜

---

## Sprint Review 检查项

- [ ] 浏览器打开后画面为 480×270 整数倍缩放，铺满短边
- [ ] 所有文字使用 Press Start 2P / VT323 字体，无 Courier New
- [ ] 色彩基调为暖棕木色，非深蓝紫
- [ ] 对话框有木质边框 + NPC 立绘 + 清晰正文（≥16px）
- [ ] 任务/背包/交易面板统一木质风格
- [ ] 所有文字最小 11px，正文 ≥ 13px
- [ ] 场景切换有 fade/wipe 过渡，无生硬跳转
- [ ] 地图瓦片为像素美术，非纯色块
- [ ] 玩家和 NPC 为像素精灵，有行走动画
- [ ] 对话框显示 NPC 像素立绘
- [ ] 背包物品格显示像素图标
- [ ] 战斗场景为像素精灵 + 木质 UI
- [ ] 全局无子像素模糊，文字锐利清晰
- [ ] 进入新区域时区域名滑入动画

## Sprint Retrospective

_（Day 23 完成后填写）_

### 做得好的
_（待填写）_

### 需改进的
_（待填写）_

### 下一步建议
_（待填写）_

> AI生成