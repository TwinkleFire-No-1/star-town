---
AIGC:
  ContentProducer: '001191110102MAD55U9H0F10002'
  ContentPropagator: '001191110102MAD55U9H0F10002'
  Label: '1'
  ProduceID: '80c62293-c0d6-46ec-9eea-fdcf16654ce9'
  PropagateID: '80c62293-c0d6-46ec-9eea-fdcf16654ce9'
  ReservedCode1: '122eaa4c-121a-4159-8890-f0064144cf48'
  ReservedCode2: '122eaa4c-121a-4159-8890-f0064144cf48'
---

# 星火小镇 — 开发进度总览

> 本文件是Agent每日启动时读取的"仪表盘"，汇总全项目进度

---

## 全局进度

| 维度 | 状态 |
|------|------|
| 当前Sprint | Sprint 5+（延展） |
| 当前Day | Day 39 |
| 总Story | 34 |
| 已完成Story | 30 |
| 完成率 | 88% |
| 总Task | 192 |
| 已完成Task | 183 |
| Task完成率 | 95.3% |
| 活跃风险 | 3 |
| 阻塞项 | 0 |
---

## Sprint 进度

| Sprint | 主题 | Story数 | 已完成 | 完成率 | 状态 |
|--------|------|---------|--------|--------|------|
| Sprint 1 (D1-D5) | 基础框架与核心原型 | 8 | 8 | 100% | ✅完成 |
| Sprint 2 (D6-D10) | AI角色驱动系统 | 8 | 8 | 100% | ✅完成 |
| Sprint 3 (D11-D15) | 游戏系统与内容 | ? | 40 | ? | ✅完成 |
| Sprint 4 (D16-D20) | 集成调优与发布 | ? | 18 | ? | ✅完成 |
| Sprint 5 (D21-D23) | UI重设计—星露谷风格 | 3 | 2 | 67% | ⏳进行中 |

---

## Epic 进度

| Epic | 名称 | Story数 | 已完成 | 状态 |
|------|------|---------|--------|------|
| E1 | 基础框架与游戏引擎 | 40 | 18 | ✅S1完成 |
| E2 | AI角色驱动系统 | 43 | 35 | ✅S2完成 |
| E3 | 游戏核心系统 | 24 | 24 | ✅完成 |
| E4 | 内容制作与剧情 | 19 | 19 | ✅完成 |
| E5 | 集成、调优与发布 | 22 | 22 | ✅完成 |
| E6 | UI重设计—星露谷风格 | 3 | 1 | ⏳S5进行中 |
| E7 | 玩法扩展—升级打怪+主线任务 | 3 | 3 | ✅完成 |

---

## 当日焦点

**Day 40 氛围NPC气泡LLM + NPC不可推动 + 任务提醒弹出**（详见 daily/day-40.md）：
- ✅ T7.x.15 氛围NPC头顶气泡接入大模型：`ambientDialogueService` 新增气泡台词池（一次LLM生成8条/10分钟TTL/池内轮换不重复，DeepSeek兼容skipReasoning，解析剔除思考框架行）；新增 `GET /api/npcs/ambient/:id/bubble`；`AmbientNpcSystem` 气泡改异步拉取（失败回退预设pickBubble）；server+client tsc通过+解析自检4/4
- ✅ T7.x.16 全角色碰撞不可推动：根因 `addNpcCollider` 未设不可移动→静止NPC被玩家顶走；单点修复 `body.immovable=true`（玩家/NPC/猫/在线玩家全生效），漫游NPC由syncNpcBody每帧粘合无可见回归；tsc通过
- ✅ T7.x.17 任务提醒弹出：新增 `questNotifications.ts` 队列 + `QuestToast` 组件（右下角木质弹窗，完成✓金/新任务✦绿，bottom偏移错开成就弹窗）；websocket接线（quest_completed→任务完成提醒、story:mainline_popup→新任务提醒）；App挂载；client tsc通过+队列自检（完成→新任务先进先出+上限4）

**Day 38 战斗美术资源精细化（AI精细精灵 + 主角升级）**（详见 daily/day-38.md）：
- ✅ T7.x.12 AI生成精细主角战斗精灵（battle-player.png：少年冒险者蓝衣披风发光剑，服装/武器像素细化，2帧待机/攻击）+ 精细荒野之狼（皮毛层次/獠牙，攻击帧前扑撕咬）；其余7个敌人帧尺寸128→192（BOSS 224）高分辨率输出；BattleScene主角改用battle-player + 修复攻击帧切换判断（texture.frameTotal，玩家/敌人攻击帧动画实际生效）；修复CollisionSystem场景切换竞态（body.world undefined崩溃导致战斗卡开场）
- ✅ T7.x.13 新增游戏背景音乐（星露谷风BGM+战斗切换）：Web Audio API程序化合成6首BGM（小镇晨曦/酒馆夜谈/森林低语/矿洞回响/战火纷飞/宿命对决），OfflineAudioContext离线渲染64槽loop无缝循环，零音频文件零版权风险；MusicSystem单例（自动播放策略适配+800ms淡入淡出切换）；GameScene场景切换换曲+战斗自动切换（BOSS战高强度曲目）+退出战斗自动恢复；顺手修复TilesetManager场景重建纹理重复注册报错清零
- ✅ Playwright验收：主角攻击帧动画（frame1+前冲）、狼反击攻击帧、胜利弹框「战胜 荒野之狼！经验+14 星币+9」、确定→结算→回GameScene；BGM渲染6首全成功（2.1s）→Playing BGM town→按B战斗切换battle→胜利退出恢复town→场景切换forest/tavern/mine换曲全正确，控制台Errors 0

**Day 37 回合制战斗重构（赛尔号式对战）+ 建筑AI美术**（详见 daily/day-37.md）：
- ✅ T7.x.11 回合制战斗：AI生成战斗背景（赛尔号式左右分屏对战舞台：左草地玩家区/右碎石敌人区/中央石墙）；AI重新生成8个敌人精灵（2帧动作spritesheet：待机/攻击）；battleEngine新增turn模式（玩家先手→敌人反击，事件序列返回）；enemyDefs.ts敌人属性+等级缩放（数学保证玩家必赢，单敌/双敌/BOSS实测全胜）；BattleScene重构回合制UI（AI背景+左玩家右敌人+攻击/逃跑按钮+回合横幅+伤害数字+多敌独立血条+胜利弹框"战胜xxx"+确定按钮）；GameScene按场景遭遇敌人（town狼/forest树精幽灵/mine蠕虫爪牙，主线BOSS任务驱动BOSS战）
- ✅ T7.x.6-7 铁锭工坊/星光酒馆建筑AI重生成 + 乒乓球氛围NPC（郭彬&祝轲轲挥拍对打）
- ✅ T7.x.8 星光酒馆换配色（暖黄墙+酒红屋顶）
- ✅ T7.x.9 AI底图树木碰撞体积（64格碰撞+关键路径校验）
- ✅ T7.x.10 主线任务完成后立即发布下一个（右侧任务引导栏实时更新）
- ✅ Playwright 验收：B键→AI左右分屏战斗场景→攻击→玩家前冲动画→狼攻击帧反击→伤害数字→胜利弹框「战胜 荒野之狼！经验+14 星币+9」→确定→结算（questProgress: enemy_wolf）→回GameScene；多敌/BOSS布局无重叠

**Day 36 建筑室内场景 AI 美术升级**（详见 daily/day-36.md）：
- ✅ T7.x.3 6个建筑室内AI底景图生成：硅基流动Z-Image批量生成6张2048×1152室内空景底图（铁匠铺/药剂店/酒馆/集市/长老厅/温馨小屋，星露谷风/无家具/底部中央门），缩放1920×1088落地 assets/interiors/
- ✅ T7.x.4 MapRenderer底景渲染模式：新增 setInteriorBackdrop/renderInteriorBackdrop（底景depth-10垫底）/renderCollisionLayer底景分支（仅墙碰撞）；PreloadScene加载interior-bg-*；GameScene.switchScene接入；修复 ensureGroundBelow 孤儿tileSprite残留（全量登记表 allCreatedSprites + destroyMap统一销毁，残留226→0）
- ✅ T7.x.5 室内NPC站位适配：琴歌17,4→17,6避开AI底景壁炉
- ✅ Playwright 验收：6建筑室内全部无户外tile穿模、NPC无墙体重叠、风格贴合各建筑主题；温馨小屋/铁匠铺/药剂店/酒馆/集市/长老厅逐一截图确认

**Day 34 HUD简化 + 天气弹出提示 + 移除交易/背包系统**（详见 daily/day-34.md）：
- ✅ T6.16.1 天气改为变化时弹出：WeatherDisplay 默认不渲染，仅当 weather.type 变化（weather:update 广播驱动）时弹出木质天气面板（图标+名称+描述），4秒后自动淡出消失；粒子效果（WeatherSystem）不受影响
- ✅ T6.16.2 右上角只保留用户名：右上角状态栏精简为用户名按钮（绿点+用户名+▾），点击展开下拉菜单（用户名+退出登录），移除 Room 标签与独立退出按钮；时间面板移到左上角（right:8px→left:8px）；场景指示器移到右下角
- ✅ T6.16.3 移除交易系统前端：删除 TradePanel/TradePanel.css/TradeDialoguePanel；EnhancedDialogueInput 移除交易分类4个快捷动作（交易/购买/出售/鉴定）；DialogueBox 移除"交易"快捷动作
- ✅ T6.16.4 移除背包系统前端：删除 InventoryPanel/InventoryPanel.css（I键快捷键随之移除）
- ✅ T6.16.5 移除交易/背包后端API：item.ts 删除 /items/buyable 与 /inventory/:playerId 及 buy/sell/use/equip 路由（保留物品定义查询）；integration.ts 删除 buy_item 分支；edgeCaseHandler 删除 safeBuyItem/safeGetInventory 及空背包测试
- ✅ Playwright 验收：时间左上角、右上角仅用户名（点击弹退出菜单→登出回登录页）、天气切换弹面板4秒消失、买卖API 404、生产容器 healthy（SERVER_PORT=4001 避开4397端口占用）

**Day 33 主线任务逻辑修复 + 循序渐进主线任务链（与地图解锁适配）**（详见 daily/day-33.md）：
- ✅ T6.15.1 主线任务链重构：MainlineMissionDef 支持多目标类型（talk_to_npc/visit_area/kill_enemy）+ requiredChapter（地图解锁章节）+ giverNpcId（发布NPC）；MAINLINE_MISSIONS 重写为"星火之旅"11任务链（序章熟悉NPC：初来乍到/小镇的问候 → 打怪：荒野之狼/哥布林骚扰 → 第一章森林：森林的低语/腐化树精/迷途之影 → 第二章矿洞：矿洞的呼唤/矿洞蠕虫危机/暗影先锋入侵 → 第三章BOSS：森林守护者）；前端 QuestGuide 目标图标分类型（💬对话/🧭探索/⚔打怪）+ QuestGuideArrows ENEMY_SCENE_MAP 修正（狼/哥布林→小镇周边，幽灵→森林）
- ✅ T6.15.2 地图解锁校验（逻辑修复）：checkFixedMission 在 requiredChapter>0 时经 chapterProvider 读玩家当前章节，未解锁不发布（不标记触发点）→章节推进后重检弹出；checkForPlayer 修复防止误入关系驱动模式；单测验证任务链章节递进/发布NPC解锁/敌人场景解锁/章节0玩家只收序章任务（森林/矿洞/BOSS不提前发布）
- ✅ T6.15.3 talk/visit 目标推进链路：questEngine.triggerNpcTalk 多路匹配（ID+sc_占位前缀+中文名反查）；handler 对话后调用 triggerNpcTalk + 新增 area:enter socket 事件；GameScene 进入森林/矿洞上报场景切换；websocket 新增 reportAreaEnter
- ✅ T6.15.4 章节推进联动：storyProgressionManager 章节推进后自动调用 mainline checkForPlayer（延迟任务立即弹出）；E2E 验证（弹出→确认→对话推进3/3→完成→串行推进"小镇的问候"）；Playwright 浏览器面板实时刷新 + 生产容器 healthy

**Day 32 原神式任务指引箭头 + 冒险者速度调慢**（详见 daily/day-32.md）：
- ✅ T6.14.1 冒险者行走速度调慢：MovementSystem speed 340→250px/s（约每秒3.9 tiles，悠闲冒险步伐）；实测按住方向键1秒位移250px
- ✅ T6.14.2 原神式任务指引箭头：新建 QuestGuideArrows 系统——接受主线任务后在玩家前方路上绘制白色闪动三角箭头（光晕+尾带，alpha 呼吸闪动）指路；目标解析（kill_enemy按敌人归属场景/talk_to_npc与collect_item按NPC归属站位/visit_area按区域名匹配）；跨场景指引（同场景→目标点/城镇→目标场景入口门/室内野外→出口门）；接近目标<160px自动隐藏；后端getStatus与popup/confirmed广播objectives附带type/targetId；GameScene集成（update+setCurrentScene+idToName注入）
- ✅ T6.14.3 mainline事件定向广播修复：checkAllPlayers只遍历在线玩家 + io.emit改io.to(playerId)定向发送（5处）+ 前端popup/confirmed/rejected校验playerId，修复 demo-player 等测试玩家弹窗覆盖真实玩家已确认任务的问题
- ✅ Playwright @1920×1080 验收：确认任务→白色闪动箭头出现指向森林入口（连拍4张白色像素109→467波动验证闪动）→接近目标30px箭头隐藏→跨场景指向（town→森林门672,96/forest内→992,544/室内→出口门992,1056）→速度250px/1s位移250px

**Day 31 分辨率统一 + 关系驱动主线剧情 + 任务5分钟冷却 + 任务引导系统**（详见 daily/day-31.md）：
- ✅ T6.12.1 小镇/建筑分辨率统一：室内场景地图 12×10→30×17 tiles（768×640→1920×1088px，与小镇世界坐标一致）、森林 24×20→30×17、矿洞 18×14→30×17；7个室内家具布局按新尺寸重设计（铁砧工坊/药剂店/酒馆/集市/长老大厅/民居/森林/矿洞）；SCENE_ZOOM 全部统一为1（原室内2.5/森林1.25/矿洞1.6）；15个室内/野外氛围NPC坐标适配；浏览器实测铁砧工坊/酒馆/森林画面与小镇完全一致的原生高清、无放大模糊
- ✅ T6.12.2 关系驱动主线剧情（参考斯坦福小镇）：mainlineQuestService 新增 STORY_ARCS（5故事弧：信任的裂痕/猜疑蔓延/联盟与背叛/暗影现身/星火重燃）；固定6个打怪主线完成后自动进入关系驱动模式；从 relationNetwork 按冲突强度挑选关系对 → LLM 根据关系快照+NPC档案+弧主题生成"有意思的联系与冲突"任务（JSON：标题/描述/参与NPC/目标）→ 注册 QuestDefinition + upsert DB → 复用主线弹窗链路；generatedQuestKeys 去重 + 弧内任务数上限推进；LLM 实测生成"旧怨新疑"（格罗姆×艾拉关系冲突）；mock 全链路测试通过
- ✅ T6.12.3 任务弹窗现实5分钟冷却：PlayerMissionState 新增 lastPopupRealTime；POPUP_REAL_COOLDOWN_MS=5min；checkForPlayer/checkRelationshipStory 均检查现实冷却；confirm/reject 同步更新；mock 测试确认首次触发→pending挡住→5分钟内挡住→冷却过期触发
- ✅ T6.13.1 任务引导系统（参考原神 Quest Tracker）：右侧中部悬浮按钮（待确认⚔+金色感叹号脉冲徽章/进行中📜+绿色进度点/空闲🧭）+ 点击展开深色半透明"任务引导"面板（待确认任务确认/拒绝、进行中任务目标进度条百分比、下一任务预告、主线进度）；新任务到来仅感叹号提示不再弹大窗；websocket 新增 quest:event 监听实现打怪进度实时刷新；App 替换 MainlineMissionPopup 为 QuestGuide；顺手修复 doorGroup 场景切换竞态；Playwright 全链路验收（感叹号→展开→确认→进行中→击杀后 1/3 实时刷新）

**Day 30 任务拒绝 + 待机动作 + F键进建筑 + 室内氛围NPC**（详见 daily/day-30.md）：
- ✅ T6.11.1 主线任务拒绝/取消：弹窗新增"暂时不去"按钮；后端 rejectMission（清pending + rejectUntil 2游戏小时冷却 + 删除触发去重 + story:mainline_rejected 广播）；checkForPlayer 冷却判断；延迟重弹全链路验证（9:00拒→11:00重弹→拒→13:00重弹）
- ✅ T6.11.2 主角待机动作：站定6-10秒随机触发伸懒腰(y上浮+scale 1.08 tween+body.reset)/转头张望(切left/right idle)/打哈欠(y下压+angle摆动)，移动与输入锁定自动取消；Playwright轮询验证 anim→player_idle_left
- ✅ T6.11.3 建筑按F进入：踩门自动进改为门口近邻检测(110px)+F键触发；底部doorPrompt提示（"[F] 进入 xxx"/未解锁"🔒 xxx 尚未开放"/室内"[F] 离开"）；锁定建筑按F拦截验证通过
- ✅ T6.11.4 室内氛围NPC：新增14个固定台词NPC（铁匠铺2/药剂店2/酒馆3/集市2/民居2/森林2/矿洞2，长老大厅反派不放），AmbientNpcDef加scene字段+getByScene+API?scene=过滤；前端按场景缓存加载渲染；温馨小屋2/酒馆3/铁匠铺2验证通过

**Day 29 天气系统 + 战斗界面精细化**（详见 daily/day-29.md）：
- ✅ T6.9.1-T6.9.6 天气系统全部完成：WeatherService（6种天气：晴/多云/小雨/雷雨/飘雪/浓雾 + 时段权重随机调度 + 新一天重置 + weather:update socket广播 + REST API）、后端接入（连接推送+NPC感知真实天气）、前端 weather slice + websocket 监听、WeatherSystem（雨丝/雪花/雾团粒子 + 全屏MULTIPLY色调滤镜 + 雷雨双闪闪电）、GameScene 接入小镇渲染、HUD 天气显示（木质面板：图标+名称+描述）
- ✅ T6.10.1-T6.10.3 战斗界面精细化全部完成：瓦片地面（上半泥地/下半草地/中线石板路）+ 22个地面装饰、敌人脚下阴影 + BOSS尺寸适配(200px) + 入场动画 + 击败消散动画 + 玩家呼吸浮动、HP数字实时更新 + 行动日志木质面板 + 状态文字描边 + 胜利金色横幅
- ✅ 复用现有美术资源：tileset 瓦片（ground-dirt/grass/path + deco-bush/rock/flower/plant）铺战斗地面、敌人精灵图 + battle-result.png 暗黑荒林结算背景
- ✅ Playwright @1920×1080 全链路验收：雷雨（雨丝遍布+偏暗偏蓝滤镜）、飘雪（雪花粒子飘落）、HUD 天气图标、战斗瓦片地面+装饰+阴影+HP数字、结算背景插画、战斗退出后天气保持

**Day 28 升级打怪玩法 + 时间驱动主线任务**（详见 daily/day-28.md）：
- ✅ T6.8.1-T6.8.11 全部完成：Player等级/经验字段、升级系统（exp曲线+属性成长+升级事件）、时间驱动主线任务服务（"冒险者之路"6任务链：狼/哥布林/树精/蠕虫/暗影爪牙/BOSS）、打怪击杀触发器、升级/主线API、socket确认事件、前端任务/等级状态、主线任务弹窗（星露谷木质风格+确认按钮）、等级HUD+升级动画、战斗结算接入升级
- ✅ 核心机制验证：游戏时钟到达触发时间自动弹出主线任务 → 玩家点击"确认接受"才开启 → 战斗胜利结算经验 → 升级属性成长 → 完成当前任务后串行推进下一个
- ✅ Playwright 全链路验收：弹窗→确认→B键战斗→victory→ESC结算→经验36/80实时更新→再结算LEVEL UP 1→2→徽章Lv.2
- ✅ 顺手修复 Day 27 遗留：AmbientNpcSystem/NpcSpriteManager 场景切换 anims 崩溃竞态

**Day 27 普通NPC（路人）系统 — 小镇闹哄哄氛围**（详见 daily/day-27.md）：
- ✅ T6.7.1-T6.7.7 全部完成：10个路人NPC（阿福/翠花/狗蛋/大牛/桂花/二丫/石头/胖婶/老杨/铁牛）+ 固定台词库（打招呼/关键词回复/默认/气泡）
- ✅ 复用美术资源：新增 externalAssetId 复用机制，10路人直接复用12张现有NPC精灵图，零新增资源
- ✅ 交互固定回复短路：amb_前缀 interaction:trigger/message 直接返回固定台词（流式打字机），不走 Agent/LLM 链路
- ✅ 城镇随机漫游：出生点 roamRadius 随机目标点 + isWalkableAt 避障 + 走走停停 + 行走动画；5秒内7/10 NPC移动
- ✅ 头顶气泡台词：随机间隔冒生活气息台词（"今天的水可真凉……"/"今天烤了十二炉！"）
- ✅ 场景切换重建：城镇10路人 → 室内0个 → 回城镇恢复10个
- ✅ Playwright 验收通过：画面12角色散布广场/道路/建筑门口，名字标签齐全，气泡可见，小镇热闹有生活气息

**Day 26 主线剧情解锁系统 + 全窗口自适应**（详见 daily/day-26.md）：
- ✅ T6.6.1-T6.6.10 全部完成：剧情解锁规则表（9场景+12NPC×章节门槛）、解锁状态纯函数、章节推进广播联动、解锁状态API、前端story slice、解锁管理器、建筑迷雾锁定态（alpha0.35+迷雾粒子+？？？）、门口解锁拦截、NPC解锁过滤（序章仅6居民可见）、解锁通知横幅+章节指引面板
- ✅ T6.6.11 全窗口自适应铺满：修复 PixelPerfectRenderer 整数缩放钳制 Bug，任意窗口尺寸（1080p/2K/1280×720/1366×768/极小窗口）下画布等比 cover 铺满浏览器、无黑边零溢出，ResizeObserver 实时响应窗口变化
- ✅ 章节推进联动验证：0→1解锁低语森林/长老大厅/托比/马库斯/西尔维娅；1→2解锁矿洞/格罗姆/铁砧，广播 story:unlock_changed
- ✅ Playwright 多分辨率验收通过：迷雾锁定态、NPC过滤、指引面板、解锁横幅、全窗口铺满

**Day 25 小镇美术镇子化 + 建筑立体感 + 室内场景**（详见 daily/day-25.md）：
- ✅ T6.5.1-T6.5.8 全部完成：城镇地图镇子化重构（道路成网/中央广场/自然绿化/镇界）、建筑立体感增强（地面投影/屋顶厚度/墙体明暗/门洞窗台）、室内场景确定性布局（8场景手工功能区）、室内镜头自动缩放、13种家具瓦片精致绘制、场景切换链路4 Bug修复、NPC脚下阴影、道路纹理优化
- ✅ 场景切换全链路验证通过：城镇→进建筑→淡出→室内（NPC在建筑内）→出建筑回城镇
- ✅ Playwright @1920×1080 验收通过：广场成型、建筑有立体感、道路连通、室内铺满屏

**Day 24 原生1080p高清 + NPC移动**（详见 daily/day-24.md）：
- ✅ T6.4.1-T6.4.9 全部完成：**原生分辨率 1920×1080**（现代高清，弃用480×270；64px tile 地图1920×1664）
- ✅ NPC 移动系统打通：日程驱动（小时切换寻路移动）+ 剧情驱动（剧情触发走向玩家）
- ✅ Playwright @1920×1080 原生验收通过：1:1原生渲染无放大、12 NPC 播放行走动画跨镇移动、玩家移动340px/s正常

**Day 23 复盘修复日**（详见 daily/day-23.md）：
- ✅ T6.3.1-T6.3.9 UI 收尾任务（代码层面已实现）
- ✅ **复盘修复 8 个阻断可玩性 Bug**（详见 daily/day-23.md 复盘修复记录）：
  1. E键交互事件未桥接到React → 对话打不开
  2. 前后端NPC ID不匹配 → "NPC似乎不存在"
  3. talkingTo预置导致NPC从不打招呼
  4. LLM推理模型content为空
  5. 玩家未注册数据库 → 任务/背包/交易500
  6. 交易按钮被拦截点击
  7. 战斗只有画面无逻辑（打通RTwP引擎）
  8. 玩家血条被遮挡
- ✅ Playwright 全链路验收通过（移动/对话/任务/背包/交易/战斗）

---

## 更新日志

| 日期 | 操作 | 说明 |
|------|------|------|
| D1 | 初始化 | 创建开发脚手架，初始化进度文件 |
| D1 | 自动更新 | Task完成4/85(4.7%) |
| D2 | 引擎与数据日 | Phaser3集成、场景管理器、房间管理、Prisma Schema、种子数据 |
| D2 | 自动更新 | Task完成9/85(10.6%) |
| D3 | 地图与角色日 | 像素渲染管线、地图Tile设计、Tilemap渲染、碰撞系统、角色精灵、移动系统 |
| D3 | 自动更新 | Task完成15/85(17.6%) |
| D4 | 通信与AI日 | 区域切换与镜头、NPC交互触发、Redis会话管理、CRUD API、pgvector扩展、Zustand状态管理、WebSocket事件绑定、OpenAI API封装 |
| D4 | 自动更新 | Task完成17/85(20.0%) |
| D5 | 联调与收尾日 | 玩家位置同步、前后端热重载联调、模型路由器、降级策略、速率限制与Token计费、Sprint 1 Review |
| D5 | 自动更新 | Task完成22/85(25.9%)，Sprint 1 完成 |
| D6 | 角色档案与Agent启动日 | 角色档案JSON Schema、Prompt模板引擎、角色档案加载器、核心NPC档案(6个)、Perceive感知模块 |
| D6 | 自动更新 | Task完成27/85(31.8%) |
| D7 | Agent循环与对话日 | Think思考模块、对话Prompt构造器、对话历史管理、对话UI前端、次要NPC档案(4个) |
| D7 | 自动更新 | Task完成32/85(37.6%) |
| D8 | 行动与记忆日 | Act行动模块、记忆更新模块、流式对话响应、记忆流存储、向量嵌入与检索 |
| D8 | 自动更新 | Task完成37/85(43.5%) |
| D9 | 编排与调度日 | Agent主循环集成、检索排序算法、反思生成、NPC调度器、并发控制、分级更新策略 |
| D9 | 自动更新 | Task完成43/85(50.6%) |
| D10 | 自主交互与收尾日 | 记忆容量管理、交互触发引擎、NPC间对话流程、信息传播机制、日程表执行器、NPC移动与寻路、NPC精灵渲染、剧情NPC档案(2个)、NPC关系网络初始化、快捷动作菜单、Sprint 2 Review |
| D10 | 自动更新 | Task完成58/85(68.2%)，Sprint 2 完成 |
| D11 | 时间与任务日 | 游戏时钟、时间UI、时间事件触发、任务数据模型、任务引擎、JRPG对话框 |
| D11 | 自动更新 | Task完成58/85(68.2%)，Day 11完成 |
| D12 | 物品与战斗启动日 | 任务UI(Q)、物品数据模型+服务+API、背包系统(I)、交易UI、战斗场景(BattleScene)、RTwP战斗逻辑 |
| D12 | 自动更新 | Task完成64/85(75.3%)，Day 12完成 |
| D13 | 战斗核心日 | 属性与伤害计算系统、敌人AI(5种行为模式)+BOSS三阶段、战斗UI(血条/技能栏/暂停/结算)、序章脚本(4任务链+7对话)、第一章脚本(5任务链+8对话) |
| D13 | 自动更新 | Task完成69/85(81.2%)，Day 13完成 |
| D14 | 关系与剧情日 | NPC队友战斗(4NPC+5AI行为模式)、好感度系统(5级+9事件+赠礼+衰减)、声望系统(5级+9区域+10事件+折扣)、关系数据模型(CRUD+事件总线)、关系影响行为(对话态度+交易折扣+信息共享+任务提供+区域访问+雇佣检查)、第二章脚本(7对话+5任务链)、第三章脚本(7对话+5任务链)、建筑细节精灵(9区域+9类型绘制) |
| D14 | 自动更新 | Task完成77/85(90.6%)，Day 14完成，同时修复tasks.md历史遗漏16项 |
| D15 | 剧情收尾与打磨日 | 终章脚本(5任务+9对话+3结局)、涌现叙事规则(7场景+5传播规则)、涌现任务生成(7模板+变量替换+并发控制)、经济平衡(25定价+收入定义+健康度评估)、增强对话输入(18动作+4分类+历史)、交易对话界面(NPC感知+对话联动)、昼夜光影(5时段+点光源+平滑过渡)、环境粒子(7预设+区域配置)、音频管理器(8BGM+16SFX+淡入淡出)、占位音频素材(8BGM+16SFX元数据+运行时生成)、Sprint 3 Review |
| D15 | 自动更新 | Task完成87/85(100%)，Day 15完成，Sprint 3完成 |
| D16 | 全链路联调日 | 前后端全链路联调、主线剧情走查、数据一致性验证、边界情况处理、StoryProgressionManager、集成API/Socket |
| D16 | 自动更新 | Task完成87/85(100%)，Day 16完成 |
| D17 | AI调优日 | 对话人设一致性调(SystemPrompt+说话风格指导+身份知识边界+5级好感度)、记忆检索调优(3策略权重+类型权重+统一衰减+质量评估)、行为决策调优(动机注入+决策规则+性格社交+输出解析) |
| D17 | 自动更新 | Task完成90/85(100%)，Day 17完成 |
| D18 | 性能与Bug日 | NPC调度优化、LLM调用缓存、前端渲染优化、响应延迟优化、Bug清单整理(32个)、P0 Bug修复(BUG-001 Redis降级+BUG-002 Disconnect竞态) |
| D18 | 自动更新 | Task完成97/85(100%)，Day 18完成 |
| D19 | 打磨与部署日 | P1 Bug修复(10个)、UI打磨(动效+字体)、Docker化(Dockerfile+compose)、CI/CD(4 Job)、Nginx反向代理(容器+生产两套) |
| D19 | 自动更新 | Task完成97/85(100%)，Day 19完成 |
| D20 | 上线与交付日 | 生产环境验证(39项通过)、README正式版、API文档(63端点)、部署运维文档(11章)、玩法说明文档(11章)、Sprint 4 Review(9项+14项MVP全部达成) |
| D20 | 自动更新 | 项目交付完成，Sprint 4 完成 |
| D21 | Sprint 5启动 | 创建UI重设计Sprint计划，生成Day21-23每日任务，追加E6/S6/T6.x.x共27个Task |
| D21 | 基础设施日 | 完成T6.1.1-T6.1.9全部9项Task：像素字体接入、480×270分辨率提升、CSS暖棕色彩体系、木质面板样式库、AI生成16个美术资源文件、PreloadScene重写 |
| D22 | 界面重设计日 | 完成T6.2.1-T6.2.9全部9项Task：顶部HUD/对话框/增强输入栏/任务面板/背包面板/交易面板/战斗UI/加载标题画面/区域名弹幕动画全部改为星露谷木质风格 |
| D23 | 复盘修复日 | 全面复盘可玩性：修复8个阻断Bug（对话桥接/ID不匹配/问候语/LLM兜底/玩家注册/按钮遮挡/RTwP战斗打通/血条遮挡），Playwright全链路验收通过（移动/NPC对话/任务/背包/交易/战斗） |
| D24 | 原生1080p+NPC移动日 | 完成T6.4.1-T6.4.9：原生分辨率改为1920×1080（现代高清，弃用480×270；64px tile地图1920×1664）、渲染器1:1原生渲染、NPC移动系统打通（日程驱动+剧情驱动+前端动画渲染+坐标体系×4归一化），Playwright @1920×1080原生验收通过 |
| D25 | 小镇美术+室内场景日 | 完成T6.5.1-T6.5.8：城镇地图镇子化（道路成网/中央广场/绿化/镇界）、建筑立体感（投影/屋顶厚度/明暗/门窗纵深）、8室内场景确定性布局、室内镜头缩放、13家具瓦片绘制、场景切换4 Bug修复（家具下草地/NPC坐标覆盖/出生点与出口重叠/残留清理）、NPC阴影、道路纹理，全链路验收通过 |
| D26 | 主线剧情解锁系统日 | 完成T6.6.1-T6.6.10：剧情解锁规则表（9场景+12NPC按章节门槛）、解锁状态纯函数、章节推进广播 story:unlock_changed、解锁状态API、前端story slice+解锁管理器、建筑迷雾锁定态（alpha0.35+迷雾粒子+？？？）、门口解锁拦截、NPC解锁过滤、解锁通知横幅+章节指引面板；T6.6.11 全窗口自适应铺满（修复整数缩放钳制Bug+ResizeObserver），Playwright多分辨率验收通过 |
| D27 | 普通NPC（路人）系统日 | 完成T6.7.1-T6.7.7：10个路人NPC+固定台词库（greetings/replies关键词匹配/bubbles）、GET /api/npcs/ambient、交互固定回复短路（amb_前缀不走Agent/LLM）、复用美术资源（externalAssetId机制复用12张精灵图）、AmbientNpcSystem随机漫游（roamRadius+isWalkableAt避障+走走停停）、头顶气泡台词、场景切换重建（城镇10/室内0/回城10），Playwright验收通过（12角色散布全镇+气泡可见） |
| D28 | 升级打怪+时间驱动主线任务日 | 完成T6.8.1-T6.8.11：Player加level/exp字段、升级系统（exp曲线80+(lv-1)*60、属性成长、level:update/level:up广播）、时间驱动主线任务服务（"冒险者之路"6任务链按时触发+确认机制+串行推进+落库Quest表）、triggerKillEnemy、升级/主线API（settle-battle结算经验星币+打怪进度）、socket确认事件、前端mission/level store+弹窗组件（木质风格确认按钮）+等级HUD/升级动画、BattleScene结算接入、修复2个场景切换anims崩溃竞态，Playwright全链路验收（弹窗→确认→战斗→结算→升级Lv2） |
| D29 | 天气系统+战斗界面精细化日 | 完成T6.9.1-T6.9.6+T6.10.1-T6.10.3：WeatherService（6种天气随机调度+weather:update广播+REST API）、后端接入（连接推送+NPC感知真实天气）、前端weather slice+websocket监听、WeatherSystem（雨/雪/雾粒子+全屏色调滤镜+雷雨双闪闪电）、GameScene小镇天气渲染、HUD天气显示组件；BattleScene精细化（瓦片地面+22装饰+敌人阴影+BOSS尺寸适配+入场/击败动画+HP数字+日志木牌+胜利金横幅），Playwright验收（雷雨雨丝+滤镜、飘雪粒子、战斗瓦片地面+装饰+结算插画） |
| D30 | 任务拒绝+待机动作+F键进建筑+室内氛围NPC日 | 完成T6.11.1-T6.11.4：主线任务弹窗新增"暂时不去"取消按钮+后端rejectMission（rejectUntil 2游戏小时冷却延迟重弹+广播story:mainline_rejected），重弹链路全验证；主角待机动作（站定6-10秒随机伸懒腰/转头张望/打哈欠 tween动作，移动自动取消）；建筑改按F进入（门口近邻检测+F键触发+doorPrompt提示，未解锁🔒拦截，室内[F]离开）；14个室内/野外氛围NPC（scene字段+getByScene+API?scene过滤+前端按场景渲染），温馨小屋2/酒馆3/铁匠铺2验收通过 |
| D31 | 任务引导系统日 | 完成T6.13.1：右侧悬浮任务引导按钮（参考原神Quest Tracker）——待确认⚔+金色感叹号脉冲徽章/进行中📜+绿色进度点/空闲🧭；点击展开深色半透明"任务引导"面板（待确认确认/拒绝、进行中目标进度条百分比、下一任务预告、主线进度）；新任务仅感叹号提示不再弹大窗；websocket新增quest:event监听实时刷新打怪进度；App替换MainlineMissionPopup为QuestGuide；顺手修复doorGroup场景切换竞态；Playwright全链路验收（感叹号→展开→确认→进行中→击杀1/3实时刷新） |
| D32 | 原神式任务指引+速度调优日 | 完成T6.14.1-T6.14.3：冒险者速度340→250px/s（实测1s位移250px）；新建QuestGuideArrows原神式任务指引（接受任务后玩家前方白色闪动三角箭头指路：目标解析kill_enemy按敌人归属场景/talk_to_npc与collect_item按NPC站位/visit_area按区域名；跨场景同场景→目标点、城镇→入口门、室内野外→出口门；接近<160px隐藏；后端广播附带type/targetId）；修复mainline全服广播为定向发送+checkAllPlayers只遍历在线玩家+前端playerId校验（防测试玩家弹窗覆盖）；Playwright验收（确认→箭头出现指向森林入口→闪动亮度波动→接近隐藏→跨场景指向正确） |
| D33 | 主线任务逻辑修复日 | 完成T6.15.1-T6.15.4：主线任务链重构（MainlineMissionDef支持talk_to_npc/visit_area/kill_enemy多目标+requiredChapter章节绑定+giverNpcId发布NPC；"星火之旅"11任务链序章熟悉NPC→打怪→森林→矿洞→BOSS）；地图解锁校验（未解锁地图不发布任务，章节推进后重检弹出）；talk/visit目标推进链路（triggerNpcTalk中文名匹配+area:enter事件+GameScene场景上报）；章节推进联动（章节推进后立即重检主线），E2E验证全链路+生产容器healthy |
| D34 | HUD简化+天气弹出+移除交易背包日 | 完成T6.16.1-T6.16.5：天气改为变化时弹出提示（仅weather.type变化时弹出4秒后消失，不常驻）；右上角只保留用户名（点击展开退出登录下拉菜单，移除Room标签/独立退出按钮），时间面板移到左上角，场景指示器移到右下角；移除交易系统（TradePanel/TradeDialoguePanel+交易/购买/出售/鉴定快捷动作+buy/sell/use/equip后端API）；移除背包系统（InventoryPanel+I键快捷键+safeGetInventory）；edgeCaseHandler移除safeBuyItem/safeGetInventory；Playwright验收（右上角仅用户名+登出正常+天气弹出4秒消失+买卖API 404+生产容器healthy） |

> AI生成