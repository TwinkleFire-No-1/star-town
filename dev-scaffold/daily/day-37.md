---
AIGC:
  ContentProducer: '001191110102MAD55U9H0F10002'
  ContentPropagator: '001191110102MAD55U9H0F10002'
  Label: '1'
  ProduceID: '3359aff2-1999-4a1f-854c-4a9bb42d2d25'
  PropagateID: '3359aff2-1999-4a1f-854c-4a9bb42d2d25'
  ReservedCode1: 'e0866dba-6c38-46d0-abe6-4c0e9ebb9777'
  ReservedCode2: 'e0866dba-6c38-46d0-abe6-4c0e9ebb9777'
---

# Day 37 — 建筑AI美术重生成 + 乒乓球氛围NPC + 酒馆换色与树木碰撞 + 主线任务立即更新

> 日期：2026-08-06

## 今日任务

| Task ID | 名称 | 状态 |
|---------|------|------|
| T7.x.6 | 铁锭工坊(铁砧工坊)与星光酒馆建筑图AI重生成 | ✅ |
| T7.x.7 | 新增乒乓球氛围NPC（郭彬&祝轲轲）AI形象 + 对打行为 | ✅ |
| T7.x.8 | 星光酒馆换配色（暖黄墙+酒红屋顶） | ✅ |
| T7.x.9 | AI底图树木碰撞体积（64格碰撞+关键路径校验） | ✅ |
| T7.x.10 | 主线任务完成后立即发布下一个任务（右侧任务引导栏实时更新） | ✅ |

## 执行记录

### T7.x.6 铁锭工坊与星光酒馆建筑图AI重生成（1h）✅

**需求**：重新生成铁锭工坊（代码内名：铁砧工坊 blacksmith）与星光酒馆（tavern）两栋建筑的AI美术图。

**方案**：沿用既定管线——Seedream 生成星露谷像素风等距建筑（深绿底 #0a3d0a）→ `build_building_assets.py` 抠图（背景BFS转透明 + 连通域裁剪 + 等比缩放底部对齐）→ 覆盖 `client/public/assets/buildings/{id}.png`。

**改动**：
1. `image-20260806004956`（铁匠铺：石墙红瓦 + 大烟囱 + 门口铁锭堆 + 熔炉火光）→ `blacksmith.png` 384×472
2. `image-20260806005227`（酒馆：都铎木梁 + 米白墙 + 深绿瓦 + 星形灯笼 + 暖黄窗；首版顶部被裁切，重生成二次后验收通过）→ `tavern.png` 384×450
3. 生图原始文件归档 `.temp/ai-raw-assets/20260806/`

**验证**：浏览器实测——铁砧工坊石墙/红瓦/烟囱/门口铁锭与老巴克正常；星光酒馆木梁/深绿屋顶/星形装饰/暖窗完整无裁切。

### T7.x.7 乒乓球氛围NPC（郭彬&祝轲轲）+ 对打行为（2h）✅

**需求**：在地图上新增两个"在一起打乒乓球"的氛围NPC（郭彬、祝轲轲），均使用AI生成美术。

**方案**：
- AI形象：生成3帧挥拍序列正面图（准备/后摆/前挥）→ `make_sheet.py` 构建 256×192 精灵表（4方向×3帧，左右镜像）
- 乒乓球桌：AI生成俯视球桌（绿面白线白网+球拍+球）→ 抠图 120×76
- 行为：`AmbientNpcSystem` 新增 `pingpong` 行为——双方循环挥拍动画（祝轲轲 setProgress 0.5 错开半拍）、轻微身体起伏、白色小球过网弧线往返弹跳、头顶气泡台词

**改动**：
1. `server/src/services/ambientNpcService.ts`：注册 `amb_pingpong_guobin`（x15,y23 面右）、`amb_pingpong_zhukeke`（x17,y23 面左），behavior: 'pingpong'，配套问候/回应/气泡台词
2. `client/src/game/scenes/PreloadScene.ts`：加载 `guobin`/`zhukeke` 精灵表 + `pingpong_table` 建筑图
3. `client/src/game/systems/AmbientNpcSystem.ts`：pingpong 行为分支（updatePingpong）+ `ensurePingpongScene`（球桌精灵置于两搭档中点）+ `startPingpongBall`（过网弧线弹跳）+ destroyAll 清理
4. 资源：`sprites/npc/guobin.png`、`sprites/npc/zhukeke.png`（256×192）、`buildings/pingpong_table.png`（120×76）

**关键调整**：初版球桌放 tile(12-16,23)，被底图烘焙树木遮挡（AI底图树位置与tile布局有偏差）。用像素扫描定位无树区后，改置球桌 tile(16,23)、两人 tile(15,23)/(17,23)，球桌缩至120px 适配1格间距，验收通过。

**验证**：浏览器实测——球桌完整无遮挡，郭彬（红衣）左侧、祝轲轲（蓝衣）右侧持拍挥拍，白球过网弹跳，头顶气泡正常，20个城镇氛围NPC全部生成，无控制台错误。

### T7.x.8 星光酒馆换配色（0.5h）✅

**需求**：酒馆换个颜色（旧版米白墙+深绿屋顶）。

**方案**：Seedream 重新生成酒馆图——奶油黄墙 + 酒红瓦屋顶 + 深棕木梁 + 暖黄窗 + 星形灯笼，保持星露谷等距像素风与深绿底规范。

**改动**：
1. `image-20260806070905` → `client/public/assets/buildings/tavern.png` 384×414
2. 生图原始文件归档 `.temp/ai-raw-assets/20260806/`

**验证**：浏览器实测——墙为奶油米黄、屋顶酒红、木梁深棕，与旧版深绿屋顶区分明显，建筑完整无裁切。

### T7.x.9 AI底图树木碰撞体积（2h）✅

**需求**：AI底图（town-bg.png）上烘焙的树木目前无碰撞，玩家可穿过，需要为树加碰撞体积。

**方案**：
- 像素扫描：树冠深绿判定（g主导且偏暗）逐 tile 统计占比，聚合出 54 个疑似区域
- 视觉确认：54 区域拼图 + 矛盾区复查，排除灌木/桥误报（桥棕木结构 600+ 采样被树干检测误判，已用视觉排除）
- 碰撞生成：视觉确认有树区域中树冠占比≥12% 的 tile → 64 格树碰撞，合并进 TOWN_BACKDROP_COLLISION
- 关键豁免：矿洞门口 (27,1) 正下方 (27,2) 被大树堵死 → 豁免该格保通路，树主体 (26,2) 保留碰撞

**改动**：
1. `client/src/game/data/TownBackdropData.ts`：30×26 碰撞矩阵合并 64 格树碰撞（总碰撞 253→317）
2. `server/src/services/ambientNpcService.ts`：胖婶 (27,20)→(28,21)（原位置落在树上）

**验证**：
- BFS 连通性：从出生点可达 462/780 格，8 个建筑门口全部可达，两座桥可达
- 运行时：8 个树格 `isWalkableAt` 全 false，普通草地格 true；按键实测玩家被树阻挡；矿洞门 (27,1) 与豁免格 (27,2) 可通行
- 猫出生点 0 冲突、20 个城镇NPC 仅胖婶 1 处冲突（已移位）
- 无控制台错误

## 遗留问题

- 无。底图烘焙树木散落于南部草地，未来新增场景装饰需先做像素扫描避让（可复用本次扫描脚本思路）。

## 风险提示

- 底图烘焙装饰（树/灌木）位置与 tile 网格不一致，新增非建筑摆件时需避开已烘焙内容。
- AI底图树冠较大，碰撞按格级生效，玩家站在树冠边缘格时视觉上可能部分被树冠盖住（可接受）。

## 追加记录 — T7.x.10 主线任务完成后立即发布下一个任务（2h）✅

**需求**：游戏的主线任务，完成一个后立即更新下一个主线任务，显示在右侧任务引导栏内。

**背景问题**：完成主线任务后 `handleQuestCompleted` 调 `checkForPlayer`，但受"现实 5 分钟弹窗冷却"与"游戏时间到达 triggerAt 触发等待"双重限制，下一个任务不会立即出现在引导栏（玩家要干等游戏时间+现实时间）。

**方案**：
1. 新增 `releaseNextFixedMission(playerId, state)`：任务完成后立即发布下一个固定主线任务——跳过游戏时间 triggerAt 触发等待、跳过现实 5 分钟冷却，仅保留 T6.15 章节解锁校验（未解锁不发布，交给章节推进联动重检弹出）
2. 新增 `releaseNextStoryMission(playerId, state)`：固定主线全部完成 / 关系驱动故事任务完成后立即生成并发布下一个（跳过冷却，含弧推进逻辑）
3. 重构 `handleQuestCompleted`：固定任务完成 → `releaseNextFixedMission` 立即发布；固定主线全部完成 → 立即进入关系驱动；story 任务完成 → `releaseNextStoryMission` 立即衔接
4. 重构 `checkRelationshipStory` 复用 `releaseNextStoryMission`（时间驱动入口保留冷却保护）

**改动文件**：
- `server/src/services/mainlineQuestService.ts`（新增2方法 + 重构2处）
- 顺手修复 `client/src/game/systems/AmbientNpcSystem.ts` TS6133 未使用变量 `id`（阻塞前端构建）

**验证（Playwright 全链路）**：
- 注册新玩家 demo_accept → 登录 → 第一个任务"初来乍到"自动弹出 → 确认接受
- 与玛格丽特/老巴克/艾拉对话完成"初来乍到" → 后端日志 `completed mission mainline_greetings, next index=1` + `next quest popped immediately: 小镇的问候` → 引导栏立即显示"小镇的问候"（⚔+感叹号，主线进度 1/11）
- 确认并完成"小镇的问候"（罗西/莉莉/小皮普）→ 引导栏立即显示"荒野之狼出没"（主线进度 2/11），后端日志 `next quest popped immediately: 荒野之狼出没 (index 2)`
- 前后端 `npm run build` 编译通过，验收截图 `.temp/verify-next-mission.png`
## 追加记录 — T7.x.11 回合制战斗重构（赛尔号式对战）（3h）✅

**需求**：战斗场景用AI生成背景；小怪用AI重新生成美术资源（要有动作）；设计类似赛尔号的对战模式（回合制），确保玩家能过关；对战时左右分屏（左玩家/右小怪或BOSS按剧情）；玩家先手攻击再小怪攻击；结束后弹出提示框"战胜xxx"并提供确定按钮，当前战斗任务结束。

**美术资源（AI生成）**：
1. 战斗背景 `backgrounds/battle-arena.png`：Seedream 生成 2560×1440 赛尔号式左右分屏对战舞台（左青草玩家区/右碎石敌人区/中央石墙分隔/黄昏远景）→ 缩放 1920×1080 落地
2. 8 个敌人精灵重生成：AI 网格图切格（wolf/goblin/treant/ghost/mushroom/shadow_minion/cave_worm/boss_forest_guardian）→ 待机帧 AI 原图 + 攻击帧程序化变形（水平拉伸+前扑倾斜+挥砍特效，狼前扑幅度 1.38）→ 拼 2 帧横排 spritesheet（普通 128×128/帧，BOSS 160×160/帧）
3. 生图原始文件归档 `.temp/ai-raw-assets/20260806/`

**后端改动**：
1. `server/src/data/enemyDefs.ts`（新增）：8 个敌人属性定义 + `scaleEnemyForLevel` 等级缩放（普通怪 HP×1.4^(lv-1)/ATK×1.25^(lv-1)/DEF×1.15^(lv-1)，BOSS 固定强度）+ `SCENE_ENCOUNTERS` 场景遭遇
2. `server/src/services/battleEngine.ts`：BattleInstance 增加 `mode: 'rtwp'|'turn'`；turn 模式下 tick 跳过自动行动；`executeTurnRound` 一次调用完成"玩家先手→全部存活敌人反击→胜负判定"，事件收集到 `roundEvents` 返回前端按序播放；`buildTurnResult` 返回最新 HP 快照/经验星币
3. `server/src/routes/battle.ts`：`/create` 支持 `mode:'turn'`（按玩家等级生成敌人属性，进入战斗满状态）；`/action` 返回完整回合 data（events/state/hp/enemies）

**数值平衡（数学保证玩家必赢）**：玩家先手，伤害公式 `atk×(1-def/(def+200))`；要求 `(T-1)×De < 玩家HP`（T=玩家击杀回合数）。实测验证：单敌狼（玩家4回合胜）、双敌树精+幽灵（最坏顺序先打树精仍 22HP 胜）、BOSS 森林守护者（10回合胜剩23HP）。

**前端改动**：
1. `PreloadScene.ts`：敌人改 spritesheet 加载（2帧）；新增 bg-battle-arena 加载
2. `BattleScene.ts` 重构：AI 背景全屏；左玩家（x430）右敌人（x1470 多敌间距250）；独立血条+HP数字+名字（敌人名字移精灵下方避免重叠）；攻击/逃跑木牌按钮；回合横幅；玩家攻击动画（前冲+敌人受击抖动+伤害浮动数字）；敌人攻击动画（切第2帧攻击姿态+前冲）；击败淡出；胜利弹框「战胜 xxx！获得经验+x 星币+x」+确定按钮→结算退出；战败弹框；ESC 兜底退出
3. `GameScene.ts`：`startBattle` 重构——按场景遭遇敌人（town 荒野之狼/forest 树精+幽灵/mine 蠕虫+爪牙），主线 BOSS 任务（kill_enemy targetId=boss_forest_guardian）驱动森林 BOSS 战；`checkBossQuest` 查询 mainline status

**验证（Playwright @1920×1080 + API）**：
- B 键 → 战斗场景：AI 左右分屏背景、左玩家 100/100 绿血条、右荒野之狼 30/30 红血条、"轮到你了！第1回合"、攻击/逃跑按钮全部就位
- 点击攻击 → 玩家前冲攻击动画→狼受击→狼攻击帧反击→伤害数字/HP 实时更新（81/100 vs 12/30）
- 持续攻击至胜利 → 弹框「战胜 荒野之狼！」「获得经验 +14 星币 +9」→ 点确定 → settle-battle 200（questProgress: enemy_wolf 任务推进）→ 回 GameScene
- 多敌人布局：树精+幽灵并排、名字血条各自独立无重叠（初版重叠已修复：名字移下方+血条收窄250+间距250）
- BOSS 布局：森林守护者体量远大于玩家，血条名字正常
- 后端 API 验证：双敌战玩家先手→树精反击→幽灵反击事件序列正确；最坏攻击顺序下双敌战/BOSS 战玩家均胜利
- 前后端 `tsc --noEmit` 编译通过
