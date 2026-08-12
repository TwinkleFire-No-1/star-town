---
AIGC:
  ContentProducer: '001191110102MAD55U9H0F10002'
  ContentPropagator: '001191110102MAD55U9H0F10002'
  Label: '1'
  ProduceID: '77d169e2-d0ff-4c26-88da-4fc3d471fff9'
  PropagateID: '77d169e2-d0ff-4c26-88da-4fc3d471fff9'
  ReservedCode1: '123ff5f0-1464-4625-8e4a-dfbc32916535'
  ReservedCode2: '123ff5f0-1464-4625-8e4a-dfbc32916535'
---

# 星火小镇 UI 重设计 Spec — 星露谷物语风格

> **文档状态**：设计稿（待评审）
> **创建日期**：2026-07-31
> **目标周期**：3 天（Day 1 ~ Day 3）
> **参考风格**：Stardew Valley（星露谷物语）

---

## 1. 目标与范围

### 1.1 核心目标

| 目标 | 现状问题 | 期望结果 |
|------|---------|---------|
| 视觉风格统一 | 深蓝紫+金色，偏暗黑风 | 温暖小镇风，木质 UI，柔和自然光 |
| 文字清晰可读 | 6-10px Courier New，缩放后模糊 | 像素字体，最小 12px 等效，锐利无糊 |
| 美术资源引入 | 100% 程序化色块 | 瓦片/精灵/物品图标/UI 框全面美术化 |
| 场景跳转流畅 | 直接 swap，无过渡 | 区域切换有 fade + 区域名弹幕 |
| 界面一致性 | 各面板风格混杂 | 统一木质面板 + 圆角 + 阴影设计语言 |

### 1.2 不在本次范围

- 服务端逻辑变更
- 游戏玩法机制修改
- 新增剧情/NPC/任务
- 性能重构（除非渲染分辨率调整带来的必要适配）

---

## 2. 星露谷风格设计原则

### 2.1 风格关键词

```
温暖 · 手绘像素 · 木质质感 · 柔和光影 · 圆润边角 · 清晰层次
```

### 2.2 核心设计决策

| 决策项 | 选择 | 理由 |
|--------|------|------|
| 内部分辨率 | `480 × 270`（从 320×180 提升 50%） | 星露谷原生 480×270，文字更清晰，瓦片仍 16px |
| UI 渲染层 | React DOM（保持不动） | 文字渲染清晰，CSS 可实现木质质感 |
| 瓦片精灵层 | Phaser Canvas（保持不动） | 程序化 → 替换为 sprite atlas 美术资源 |
| 缩放策略 | 整数倍 + 居中 + 撑满短边 | 像素完美 + 视觉饱满 |
| 像素字体 | `Press Start 2P` + `VT323`（Google Fonts） | 开源免费，星露谷同质感 |
| 配色基调 | 暖棕木色 + 草绿色 + 蜂蜜金 | 星露谷标志性温暖色板 |

### 2.3 分辨率提升的影响清单

从 `320×180` → `480×270` 需要同步修改：

```
client/src/game/config/index.ts        → GAME_WIDTH/HEIGHT
client/src/game/rendering/PixelPerfectRenderer.ts → 缩放基准
client/src/game/scenes/GameScene.ts     → 物理世界边界 30×26 → 45×40 tiles
client/src/game/scenes/BattleScene.ts   → 战场布局常量重算
client/src/game/scenes/BootScene.ts     → 物理世界边界
TilesetManager                          → 程序化瓦片尺寸逻辑
SpriteGenerator                         → 精灵生成逻辑
所有 Phaser Text 字号                   → 按新分辨率重设
```

> 详见 Day 1 任务 M1.2。

---

## 3. 色彩体系

### 3.1 主色板

```
┌──────────────────────────────────────────────────────┐
│  星火小镇色彩体系 — Stardew Valley 风格              │
├──────────┬───────────┬───────────────────────────────┤
│  色名     │  Hex      │  用途                         │
├──────────┼───────────┼───────────────────────────────┤
│ 木板底色  │ #6B4423   │  面板主背景、边框深色          │
│ 木板亮色  │ #8B6914   │  面板高光、边框浅色            │
│ 木板描边  │ #3D2817   │  面板外描边、深阴影            │
│ 羊皮纸    │ #F5E6C8   │  面板内文字区背景              │
│ 蜂蜜金    │ #E8A93C   │  标题、强调、按钮高亮          │
│ 草地绿    │ #5B8C3E   │  HP、正面状态、进行中          │
│ 天空蓝    │ #4A90B8   │  SP、魔法、信息提示            │
│ 警示红    │ #C04545   │  伤害、危险、危险操作          │
│ 经验紫    │ #9B6BB0   │  经验值、稀有度                │
│ 夜幕蓝    │ #2C3E5C   │  夜晚遮罩基色                  │
│ 暖白      │ #FFF8E7   │  正文文字                      │
│ 灰褐文字  │ #3D2817   │  羊皮纸上的文字                │
└──────────┴───────────┴───────────────────────────────┘
```

### 3.2 CSS 变量定义（index.css）

```css
:root {
  /* 木质面板 */
  --wood-dark: #3D2817;
  --wood-base: #6B4423;
  --wood-light: #8B6914;
  --parchment: #F5E6C8;
  
  /* 强调色 */
  --honey-gold: #E8A93C;
  --grass-green: #5B8C3E;
  --sky-blue: #4A90B8;
  --warn-red: #C04545;
  --exp-purple: #9B6BB0;
  --night-blue: #2C3E5C;
  
  /* 文字 */
  --text-light: #FFF8E7;      /* 深色背景上的文字 */
  --text-dark: #3D2817;        /* 羊皮纸上的文字 */
  --text-muted: #8B7355;       /* 次要文字 */
}
```

### 3.3 昼夜色调

| 时段 | 遮罩色 | 透明度 | 说明 |
|------|--------|--------|------|
| 黎明 dawn | `#FFB347` → 透明 | 0.12 | 橙色暖光渐入 |
| 上午 morning | 无遮罩 | 0 | 明亮通透 |
| 下午 afternoon | `#FFE5B4` | 0.05 | 淡黄暖意 |
| 傍晚 dusk | `#FF8C42` | 0.20 | 落日橙红 |
| 夜晚 night | `#2C3E5C` | 0.45 | 深蓝月夜 |

---

## 4. 字体系统

### 4.1 字体选择

| 字体 | 用途 | 加载方式 |
|------|------|---------|
| `Press Start 2P` | 标题、数值、按钮 | Google Fonts CDN |
| `VT323` | 正文对话、面板内容 | Google Fonts CDN |
| `ZCOOL KuaiLe` | 中文（备选） | Google Fonts CDN |

> 星露谷英文用自研像素字体，中文环境需补充中文像素字体。
> `VT323` 作为英文回退，中文使用 `ZCOOL KuaiLe` 保证可读性。

### 4.2 字号规范（基于 480×270 内部分辨率，CSS 层）

| 层级 | 字号 | 场景 |
|------|------|------|
| 大标题 | 28px | 标题画面、章节名 |
| 中标题 | 20px | 面板标题、区域名 |
| 正文 | 16px | 对话、任务描述、物品说明 |
| 辅助 | 13px | 数值标签、快捷提示 |
| 极小 | 11px | 仅用于非关键调试信息 |

> 原则：**不使用 < 11px 的文字**，所有用户需要阅读的内容 ≥ 13px。

### 4.3 字体加载

```html
<!-- index.html 中添加 -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Press+Start+2P&family=VT323&family=ZCOOL+KuaiLe&display=swap" rel="stylesheet">
```

CSS 字体栈：
```css
--font-pixel: 'Press Start 2P', 'ZCOOL KuaiLe', monospace;
--font-body: 'VT323', 'ZCOOL KuaiLe', 'Courier New', monospace;
```

---

## 5. 渲染系统升级

### 5.1 分辨率提升

```
现有：320 × 180  →  目标：480 × 270
Tile：16px（不变）
可视区域：20×16 tiles → 30×16.875 tiles（横向多看 50%）
```

### 5.2 像素完美缩放策略更新

```typescript
// PixelPerfectRenderer.ts 新逻辑
const scale = Math.max(
  1,
  Math.min(
    Math.floor(winW / 480),
    Math.floor(winH / 270)
  )
)
// canvas CSS 尺寸
canvas.style.width = 480 * scale + 'px'
canvas.style.height = 270 * scale + 'px'
// 居中（flex 已处理）
```

### 5.3 屏幕布局

```
┌─────────────────────────────────────────────┐
│  [区域名弹幕]           [时间HUD] [连接状态] │  ← 顶部固定 HUD
│                                              │
│                                              │
│              游戏世界画面                      │
│           (Phaser Canvas 480×270)            │
│                                              │
│                                              │
│  [Q任务]                              [I背包] │  ← 左右悬浮按钮
│                                              │
│  ┌──────────────────────────────────────┐   │
│  │  对话框 / 操作面板（按需弹出）          │   │  ← 底部信息区
│  └──────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
```

---

## 6. 美术资源系统

### 6.1 资源目录结构

```
client/public/assets/
├── tileset/
│   ├── town-ground.png        # 草地/泥土/石板/木地板 地面瓦片
│   ├── town-buildings.png     # 建筑外观（9 大区域）
│   └── town-props.png         # 树木/围栏/火把/花丛/路标 装饰物
├── sprites/
│   ├── player.png             # 玩家四方向行走动画（16×16 per frame）
│   └── npc/                   # 12 个 NPC 各一套
│       ├── margaret.png
│       ├── oldbuck.png
│       └── ...
├── ui/
│   ├── dialogue-frame.png     # 对话框木质边框（9-slice）
│   ├── panel-frame.png        # 通用面板边框（9-slice）
│   ├── button-normal.png      # 按钮常态/按下/悬停
│   ├── button-pressed.png
│   ├── button-hover.png
│   ├── hp-bar.png             # 血条背景+前景
│   └── icons.png              # 物品图标 atlas（16×16 per icon）
├── portraits/
│   └── npc/                   # NPC 对话立绘（48×48）
│       ├── margaret.png
│       └── ...
└── fonts/
    └── （Google Fonts 加载，本地无需文件）
```

### 6.2 资源获取方式

| 资源类型 | 方式 | 说明 |
|---------|------|------|
| 像素字体 | Google Fonts CDN | 零成本，联网加载 |
| 瓦片/精灵图 | AI 生成（ImageGen）| 星露谷风格 prompt，16px 网格对齐 |
| NPC 立绘 | AI 生成（ImageGen）| 48×48 像素风头像 |
| 物品图标 | AI 生成（ImageGen）| 16×16 像素图标 atlas |
| UI 框架 | 程序化 9-slice CSS | 木质质感由 CSS gradient + border 实现，无需图片 |

### 6.3 AI 生成美术资源 Prompt 规范

**通用风格前缀**：
```
pixel art, 16x16 grid, Stardew Valley style, warm color palette, 
clean pixel edges, no anti-aliasing, top-down RPG perspective
```

**瓦片集 prompt**：
```
[通用前缀], tileset sheet, seamless tiles, grass field, dirt path, 
stone floor, wooden planks, arranged in a grid, white background
```

**NPC 立绘 prompt**：
```
[通用前缀], character portrait, [角色描述], friendly expression, 
warm lighting, 48x48, face only, transparent background
```

---

## 7. 界面设计规范

### 7.1 标题/加载界面（PreloadScene 重设计）

```
┌──────────────────────────────────────────┐
│                                          │
│         ✦  星 火 小 镇  ✦                │
│      Spark Town Adventures               │
│                                          │
│         [加载进度条 木质]                  │
│           ████████░░ 80%                 │
│                                          │
│      "每一个像素都藏着故事"               │
│                                          │
└──────────────────────────────────────────┘
```

- 背景：星空/夜晚小镇剪影（程序化或 AI 生成）
- 标题：`Press Start 2P` 28px，蜂蜜金色，轻微浮动动画
- 进度条：木质边框 + 羊皮纸内填充 + 草绿色进度
- 副标题：`VT323` 16px，暖白色

### 7.2 顶部 HUD

**时间显示**（右上角）：
```
┌─────────────────────┐
│  ☀️ 第 3 天          │
│     上午 09:30      │
└─────────────────────┘
```
- 木质圆角面板，`--parchment` 内底
- 图标：按时段切换（🌅☀️🌤🌇🌙），16×16 像素风
- 字体：`Press Start 2P` 13px，`--text-dark`

**连接状态**（时间下方）：
```
  ● 已连接 · Room: town-square
```
- 仅显示一个绿点 + 简短文字，降低视觉噪音

### 7.3 对话框（DialogueBox 重设计）

```
┌─[立绘]──────────────────────────────────┐
│  ╭──────╮                               │
│  │ NPC  │  玛格丽特 — 面包房老板          │
│  │ 立绘  │  ─────────────────────        │
│  ╰──────╯  今天烤了新鲜的面包，          │
│            要来一份吗？                  │
│                                         │
│  [打招呼] [赞美] [询问] [告别]  [展开▼]  │
│  ┌─────────────────────────────┐ [发送] │
│  │  输入消息...                 │       │
│  └─────────────────────────────┘       │
└─────────────────────────────────────────┘
```

设计要点：
| 元素 | 规格 |
|------|------|
| 面板 | 木质 9-slice 边框 6px，内底 `--parchment` |
| 标题栏 | `--wood-base` 底，`--honey-gold` 文字 |
| 立绘 | 48×48 像素风，圆角描边 |
| 称号 | `--text-muted` 13px，名字下方 |
| 对话正文 | `VT323` 16px `--text-dark` |
| 快捷动作按钮 | 木质小按钮，悬停亮 `--honey-gold` |
| 输入框 | 羊皮纸底 `--text-dark` 文字 |
| 流式光标 | 闪烁方块 `--grass-green` |

### 7.4 任务面板（QuestPanel 重设计）

```
┌─ 任务 ─────────────────────────┐
│ [进行中] [可接受] [已完成]      │
│────────────────────────────────│
│ 📖 寻找丢失的项链               │
│    进度：2/3                    │
│    ████████████░░░░  66%       │
│    奖励：50星币 · 好感+10      │
│────────────────────────────────│
│ ⚔️ 清理矿洞怪物                 │
│    进度：0/5                    │
│    ░░░░░░░░░░░░░░░░  0%        │
└────────────────────────────────┘
```

- 280px 宽，木质面板
- 标签页：选中态 `--honey-gold` 底，未选中 `--wood-base`
- 任务卡片：羊皮纸内底，左侧图标 16×16
- 进度条：木框 + 草绿前景

### 7.5 背包面板（InventoryPanel 重设计）

```
┌─ 背包 ─────────────────────────┐
│  星币：🪙 250                   │
│ [全部][武器][防具][消耗][材料][任务]│
│────────────────────────────────│
│ ┌──┐┌──┐┌──┐┌──┐┌──┐┌──┐    │
│ │⚔️││🛡️││🍞││⛏️││  ││  │    │
│ └──┘└──┘└──┘└──┘└──┘└──┘    │
│ ┌──┐┌──┐                       │
│ │  ││  │  选中：铁剑            │
│ └──┘└──┘  攻击+12 耐久 85%     │
│           [装备] [丢弃]         │
└────────────────────────────────┘
```

- 物品格：40×40，木质边框，空格半透明
- 选中态：`--honey-gold` 描边发光
- 物品图标：16×16 像素风，放大到格内居中
- 详情区：底部滑出，羊皮纸底

### 7.6 交易面板（TradePanel 重设计）

```
┌─ 交易 — 铁砧铁匠铺 ────────────┐
│ [购买] [出售]                   │
│────────────────────────────────│
│ ⚔️ 铁剑      80🪙   [-][1][+]  │
│ 🛡️ 皮甲     120🪙   [-][0][+]  │
│ ⛏️ 铁镐      50🪙   [-][2][+]  │
│────────────────────────────────│
│  合计：180🪙    余额：250🪙     │
│         [确认交易]              │
└────────────────────────────────┘
```

### 7.7 战斗界面（BattleScene 重设计）

战斗场景整体美术化：

```
┌──────────────────────────────────┐
│        ⚔️ 遭遇战斗 ⚔️              │
│                                   │
│    [敌1]   [敌2]   [BOSS]         │  ← 敌方像素精灵
│                                   │
│  ═════════ 战场中线 ═════════     │
│                                   │
│    [玩家]   [队友1]               │  ← 我方像素精灵
│                                   │
│  HP[████████░░] SP[████░░░░]     │  ← 血条/能量条
│  [技能1][技能2][技能3][技能4]      │  ← 技能栏
│  [暂停]            [行动日志]     │
└──────────────────────────────────┘
```

| 元素 | 设计 |
|------|------|
| 战场背景 | 替换色块为像素风草地/矿洞地面纹理 |
| 角色精灵 | 像素风精灵图替代红/绿方块 |
| HP 条 | 木质框 + 分段格子（星露谷风格） |
| 技能栏 | 36×36 木质按钮 + 冷却遮罩 |
| 行动日志 | 半透明羊皮纸底，淡入淡出 |

### 7.8 通用组件设计语言

所有面板共享的木质质感 CSS：

```css
/* 木质面板 — 9-slice 视觉模拟 */
.panel-wood {
  background: linear-gradient(135deg, var(--wood-light), var(--wood-base));
  border: 3px solid var(--wood-dark);
  border-radius: 8px;
  box-shadow: 
    inset 0 2px 0 rgba(255,255,255,0.15),    /* 顶部高光 */
    inset 0 -2px 0 rgba(0,0,0,0.3),          /* 底部阴影 */
    0 4px 12px rgba(0,0,0,0.5);              /* 外阴影 */
}

/* 面板内羊皮纸区 */
.panel-parchment {
  background: var(--parchment);
  border: 2px solid var(--wood-dark);
  border-radius: 4px;
  color: var(--text-dark);
}

/* 木质按钮 */
.btn-wood {
  background: linear-gradient(180deg, var(--wood-light), var(--wood-base));
  border: 2px solid var(--wood-dark);
  border-radius: 4px;
  color: var(--text-light);
  font-family: var(--font-pixel);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.2);
  transition: all 0.15s;
}
.btn-wood:hover {
  background: linear-gradient(180deg, var(--honey-gold), var(--wood-light));
  box-shadow: 0 0 8px rgba(232,169,60,0.5);
}
.btn-wood:active {
  transform: translateY(1px);
  box-shadow: inset 0 2px 4px rgba(0,0,0,0.4);
}
```

---

## 8. 场景跳转设计

### 8.1 场景过渡效果

| 触发 | 效果 | 时长 |
|------|------|------|
| 启动游戏 | 黑屏 → 标题画面 fadeIn | 800ms |
| 加载完成 | 标题 →fade→ 游戏场景 | 600ms |
| 进入建筑 | 当前画面 fadeOut(深棕) → 切场景 → fadeIn | 500ms each |
| 离开建筑 | 同上，反向 | 500ms each |
| 遭遇战斗 | 画面闪烁白光 → 红色 wipe → 战斗场景 | 400ms |
| 战斗结束 | 战斗画面 fadeOut(白) → 游戏场景 fadeIn | 400ms |

### 8.2 区域名弹幕动画

进入新区域时显示区域名，星露谷风格：

```
                    ┌──────────────┐
                    │   集市广场    │     ← 从上滑入，停留2s，淡出
                    └──────────────┘
```

- 位置：屏幕顶部居中，HUD 下方
- 动画：`translateY(-20px) opacity:0` → `translateY(0) opacity:1` → 停留 2s → `opacity:0`
- 样式：木质小标签，`Press Start 2P` 16px，`--honey-gold`

### 8.3 场景配置变更

```typescript
// SceneManager.ts 新增预设过渡
export const SceneTransitions = {
  enterBuilding: { duration: 500, effect: 'fade' },
  exitBuilding:  { duration: 500, effect: 'fade' },
  enterBattle:   { duration: 400, effect: 'wipe' },
  exitBattle:    { duration: 400, effect: 'fade' },
  boot:          { duration: 800, effect: 'fade' },
} as const
```

---

## 9. 三天工作计划

### Day 1 — 基础设施 + 色彩/字体 + 资源生成

> **目标**：搭建新视觉地基，生成全部美术资源，让游戏"穿上新衣"的第一层。

| 编号 | 任务 | 文件 | 验收标准 |
|------|------|------|---------|
| M1.1 | 像素字体接入 | `index.html`, `index.css` | Google Fonts 加载成功，3 种字体可用 |
| M1.2 | 分辨率 320→270 提升 | `config/index.ts`, `PixelPerfectRenderer.ts`, `BootScene.ts`, `GameScene.ts`, `BattleScene.ts` | 480×270 内部分辨率，缩放正常，物理边界更新 |
| M1.3 | CSS 变量色彩体系 | `index.css`, `App.css` | 木质配色变量定义，应用背景改为暖色调 |
| M1.4 | 木质面板通用样式 | 新建 `components/styles/wood-panel.css` | `.panel-wood` `.panel-parchment` `.btn-wood` 可复用 |
| M1.5 | AI 生成瓦片集资源 | `public/assets/tileset/*.png` | 草地/泥土/石板/木地板 4 类瓦片生成 |
| M1.6 | AI 生成 NPC 立绘 | `public/assets/portraits/npc/*.png` | 12 个 NPC 立绘生成 |
| M1.7 | AI 生成物品图标 | `public/assets/ui/icons.png` | 武器/防具/消耗/材料 图标 atlas |
| M1.8 | AI 生成玩家/NPC 精灵图 | `public/assets/sprites/*.png` | 玩家 + 12 NPC 行走动画 |
| M1.9 | 资源加载管线 | `PreloadScene.ts` | 加载所有 PNG 资源，进度条显示 |

**Day 1 交付物**：新分辨率运行 + 暖色基调 + 美术资源就位 + 加载流程可见

---

### Day 2 — 各界面 UI 重设计

> **目标**：逐个改造界面组件，统一木质风格，文字清晰可读。

| 编号 | 任务 | 文件 | 验收标准 |
|------|------|------|---------|
| M2.1 | 顶部 HUD 重设计 | `TimeDisplay.tsx/css`, `App.css` | 木质时间面板，时段图标，连接状态精简 |
| M2.2 | 对话框重设计 | `DialogueBox.tsx/css` | 木质边框 + 立绘区 + 羊皮纸正文 + 清晰字体 |
| M2.3 | 增强输入栏重设计 | `EnhancedDialogueInput.tsx` | 快捷动作按钮木质化，分类标签统一 |
| M2.4 | 任务面板重设计 | `QuestPanel.tsx/css` | 木质面板 + 标签页 + 进度条 + 任务卡片 |
| M2.5 | 背包面板重设计 | `InventoryPanel.tsx/css` | 物品格木质化 + 图标显示 + 详情区 |
| M2.6 | 交易面板重设计 | `TradePanel.tsx/css`, `TradeDialoguePanel.tsx` | 购卖出价列表 + 数量选择 + 余额显示 |
| M2.7 | 战斗 UI 重设计 | `BattleScene.ts`, `BattleUI.tsx/css` | 像素精灵 + 分段 HP 条 + 木质技能栏 + 结算面板 |
| M2.8 | 加载/标题画面 | `PreloadScene.ts` | 星空背景 + 标题 + 进度条 + 副标题 |
| M2.9 | 区域名弹幕动画 | `GameScene.ts` (regionLabel) | 进入区域时滑入 + 停留 + 淡出 |

**Day 2 交付物**：所有可见界面完成星露谷风格改造，文字清晰可读

---

### Day 3 — 场景跳转 + 美术资源接入 + 打磨

> **目标**：场景间丝滑过渡，美术资源替换色块，全局视觉打磨。

| 编号 | 任务 | 文件 | 验收标准 |
|------|------|------|---------|
| M3.1 | 场景过渡预设 | `SceneManager.ts` | 6 种过渡预设，fade/wipe 可用 |
| M3.2 | 游戏场景过渡接入 | `GameScene.ts`, `CameraController.ts` | 进入/离开建筑触发 fade 过渡 |
| M3.3 | 战斗场景过渡 | `BattleScene.ts`, `GameScene.ts` | 遭遇战斗白闪 + 红色 wipe，结束 fade 回归 |
| M3.4 | 瓦片集资源接入 | `TilesetManager.ts`, `MapRenderer.ts` | 程序化瓦片 → PNG 瓦片集，地图纹理升级 |
| M3.5 | 精灵图资源接入 | `SpriteGenerator.ts`, `NpcSpriteManager.ts` | 色块精灵 → 像素精灵图，行走动画正确 |
| M3.6 | NPC 立绘接入对话 | `DialogueBox.tsx` | 立绘图显示在对话左侧，替代 hash 色块 |
| M3.7 | 物品图标接入背包 | `InventoryPanel.tsx` | 物品格显示对应像素图标 |
| M3.8 | 战斗精灵图接入 | `BattleScene.ts` | 敌人/玩家显示像素精灵，替代色块 |
| M3.9 | 全局视觉打磨 | `index.css`, `App.css`, 各 CSS | 像素完美渲染检查、阴影一致性、字号统一 |

**Day 3 交付物**：场景跳转流畅 + 美术资源全部替换色块 + 整体视觉协调统一

---

## 10. 验收标准

### 10.1 Day 1 验收

- [ ] 浏览器打开后看到 480×270 画面，整数倍缩放铺满短边
- [ ] 文字使用 Press Start 2P / VT323 字体，无 Courier New
- [ ] 色彩基调为暖棕木色，非深蓝紫
- [ ] `public/assets/` 下有完整的美术资源文件
- [ ] 加载画面显示进度条

### 10.2 Day 2 验收

- [ ] 顶部时间 HUD 为木质面板
- [ ] 对话框有木质边框 + NPC 立绘 + 清晰正文（≥16px）
- [ ] 任务/背包/交易面板统一木质风格
- [ ] 所有文字最小 11px，正文 ≥ 13px
- [ ] 进入新区域时区域名滑入动画

### 10.3 Day 3 验收

- [ ] 场景切换有 fade/wipe 过渡动画，无生硬跳转
- [ ] 地图瓦片为像素美术，非纯色块
- [ ] 玩家和 NPC 为像素精灵，有行走动画
- [ ] 对话框显示 NPC 像素立绘
- [ ] 背包物品格显示像素图标
- [ ] 战斗场景为像素精灵 + 木质 UI
- [ ] 全局无子像素模糊，文字锐利清晰

---

## 附录 A：文件影响矩阵

| 文件 | Day 1 | Day 2 | Day 3 |
|------|-------|-------|-------|
| `index.html` | M1.1 | | |
| `index.css` | M1.3 | | M3.9 |
| `App.css` | M1.3 | M2.1 | M3.9 |
| `config/index.ts` | M1.2 | | |
| `PixelPerfectRenderer.ts` | M1.2 | | |
| `PreloadScene.ts` | M1.9 | M2.8 | |
| `GameScene.ts` | M1.2 | M2.9 | M3.2, M3.4 |
| `BootScene.ts` | M1.2 | | |
| `BattleScene.ts` | M1.2 | M2.7 | M3.3, M3.8 |
| `SceneManager.ts` | | | M3.1 |
| `TimeDisplay.tsx/css` | | M2.1 | |
| `DialogueBox.tsx/css` | | M2.2 | M3.6 |
| `EnhancedDialogueInput.tsx` | | M2.3 | |
| `QuestPanel.tsx/css` | | M2.4 | |
| `InventoryPanel.tsx/css` | | M2.5 | M3.7 |
| `TradePanel.tsx/css` | | M2.6 | |
| `TradeDialoguePanel.tsx` | | M2.6 | |
| `BattleUI.tsx/css` | | M2.7 | |
| `TilesetManager.ts` | | | M3.4 |
| `MapRenderer.ts` | | | M3.4 |
| `SpriteGenerator.ts` | | | M3.5 |
| `NpcSpriteManager.ts` | | | M3.5 |
| `CameraController.ts` | | | M3.2 |
| `public/assets/**` | M1.5-M1.8 | | |

---

## 附录 B：AI 生成资源 Prompt 模板

### B.1 瓦片集

```
pixel art tileset, Stardew Valley style, 16x16 tiles arranged in a grid,
[grass / dirt path / stone floor / wooden planks], warm earthy color palette,
clean pixel edges no anti-aliasing, top-down RPG perspective, seamless tiling,
white background, sprite sheet format
```

### B.2 NPC 立绘

```
pixel art character portrait, Stardew Valley style, 48x48,
[character description: e.g. kind female baker with flour on apron],
warm friendly expression, soft warm lighting, clean pixel edges,
face and shoulders only, transparent background
```

### B.3 行走精灵图

```
pixel art character sprite sheet, Stardew Valley style, 16x16 per frame,
4-directional walk animation (down/left/right/up), 3 frames per direction,
[character description: simple traveler with brown cloak],
clean pixel edges, top-down RPG, transparent background, arranged in 4x3 grid
```

### B.4 物品图标

```
pixel art item icons, Stardew Valley style, 16x16 each, arranged in a grid,
[sword / shield / bread / pickaxe / herb / ore], warm color palette,
clean pixel edges, white background, inventory icon style
```

---

*Spec 结束 — 评审通过后按 Day 1 → Day 2 → Day 3 顺序执行*

> AI生成