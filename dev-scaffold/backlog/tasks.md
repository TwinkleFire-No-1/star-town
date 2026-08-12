---
AIGC:
  ContentProducer: '001191110102MAD55U9H0F10002'
  ContentPropagator: '001191110102MAD55U9H0F10002'
  Label: '1'
  ProduceID: '3c5162f6-617d-4f9e-b088-c5d7616d2811'
  PropagateID: '3c5162f6-617d-4f9e-b088-c5d7616d2811'
  ReservedCode1: '33c88105-4e74-4e70-89c3-e33670a69bde'
  ReservedCode2: '33c88105-4e74-4e70-89c3-e33670a69bde'
---

# 星火小镇 — Task 分解表

> Task 是可直接执行的最小工作单元，每个Task有明确的产出与验证方式
> 每个Task预估0.5-2天工作量

---

## S1.1 项目脚手架搭建 (E1)

| Task ID | 名称 | 产出 | 预估 | 依赖 | 状态 |
|---------|------|------|------|------|------|
| T1.1.1 | 初始化前端项目 | Vite+React+TS项目、ESLint/Prettier配置 | 0.5d | 无 | ✅ |
| T1.1.2 | 初始化后端项目 | Express+TS项目、目录结构、基础中间件 | 0.5d | 无 | ✅ |
| T1.1.3 | 配置开发工具 | Git初始化、.gitignore、env模板、Docker Compose(PG+Redis) | 0.5d | T1.1.1 | ✅ |
| T1.1.4 | 前后端热重载联调 | 前端proxy到后端、WebSocket连接测试 | 0.5d | T1.1.1, T1.1.2 | ✅ |

## S1.2 Phaser游戏引擎集成 (E1)

| Task ID | 名称 | 产出 | 预估 | 依赖 | 状态 |
|---------|------|------|------|------|------|
| T1.2.1 | Phaser3集成到React | Phaser游戏容器组件、游戏配置 | 0.5d | T1.1.1 | ✅ |
| T1.2.2 | 游戏场景管理器 | BootScene/PreloadScene/GameScene框架 | 0.5d | T1.2.1 | ✅ |
| T1.2.3 | 像素渲染管线 | 像素完美缩放配置(320x180→全屏) | 0.5d | T1.2.1 | ✅ |

## S1.3 小镇地图渲染 (E1)

| Task ID | 名称 | 产出 | 预估 | 依赖 | 状态 |
|---------|------|------|------|------|------|
| T1.3.1 | 地图Tile设计(简化版) | 占位Tileset(32x32)、9大区域基础布局 | 1d | T1.2.2 | ✅ |
| T1.3.2 | Tilemap加载与渲染 | Tiled JSON地图加载、多层渲染(地面/建筑/装饰) | 1d | T1.3.1 | ✅ |
| T1.3.3 | 碰撞系统 | 碰撞层配置、不可通行区域、建筑门口触发区 | 0.5d | T1.3.2 | ✅ |
| T1.3.4 | 区域切换与镜头 | 区域边界、Camera跟随、区域切换效果 | 0.5d | T1.3.2 | ✅ |

## S1.4 玩家角色控制 (E1)

| Task ID | 名称 | 产出 | 预估 | 依赖 | 状态 |
|---------|------|------|------|------|------|
| T1.4.1 | 玩家角色精灵 | 占位像素角色(4方向行走动画) | 0.5d | T1.2.1 | ✅ |
| T1.4.2 | 角色移动系统 | 键盘输入、8方向移动、碰撞检测 | 0.5d | T1.4.1, T1.3.3 | ✅ |
| T1.4.3 | NPC交互触发 | 接近NPC显示交互提示、按键触发交互 | 0.5d | T1.4.2 | ✅ |

## S1.5 后端服务框架 (E1)

| Task ID | 名称 | 产出 | 预估 | 依赖 | 状态 |
|---------|------|------|------|------|------|
| T1.5.1 | Express+Socket.io服务端 | 基础HTTP+WS服务、连接管理、房间机制 | 0.5d | T1.1.2 | ✅ |
| T1.5.2 | 游戏房间管理 | 创建/加入/离开房间、房间状态 | 0.5d | T1.5.1 | ✅ |
| T1.5.3 | Redis会话管理 | Socket会话存储、断线重连 | 0.5d | T1.5.1, T1.1.3 | ✅ |

## S1.6 数据库与数据模型 (E1)

| Task ID | 名称 | 产出 | 预估 | 依赖 | 状态 |
|---------|------|------|------|------|------|
| T1.6.1 | Prisma Schema设计 | 全部核心表(6张)的Prisma模型定义 | 0.5d | T1.1.2 | ✅ |
| T1.6.2 | 数据库迁移与种子 | Migration执行、种子数据(12个NPC初始数据) | 0.5d | T1.6.1 | ✅ |
| T1.6.3 | CRUD API | 玩家/NPC/任务的基础REST API | 1d | T1.6.1 | ✅ |
| T1.6.4 | pgvector扩展与记忆表 | pgvector启用、记忆表向量字段、相似度查询 | 0.5d | T1.6.1 | ✅ |

## S1.7 前后端通信联调 (E1)

| Task ID | 名称 | 产出 | 预估 | 依赖 | 状态 |
|---------|------|------|------|------|------|
| T1.7.1 | Zustand状态管理 | 游戏状态Store(玩家/NPC/时间) | 0.5d | T1.1.1 | ✅ |
| T1.7.2 | WebSocket事件绑定 | 前端Socket连接、事件监听、状态同步 | 0.5d | T1.5.1, T1.7.1 | ✅ |
| T1.7.3 | 玩家位置同步 | 玩家移动广播、其他玩家位置接收 | 0.5d | T1.4.2, T1.7.2 | ✅ |

## S2.1 LLM服务接入层 (E2)

| Task ID | 名称 | 产出 | 预估 | 依赖 | 状态 |
|---------|------|------|------|------|------|
| T2.1.1 | OpenAI兼容API封装 | LLM调用统一接口、流式响应处理 | 0.5d | T1.1.2 | ✅ |
| T2.1.2 | 模型路由器 | 主模型/轻量模型/嵌入模型切换逻辑 | 0.5d | T2.1.1 | ✅ |
| T2.1.3 | 降级策略实现 | 模型不可用时降级到预设模板 | 0.5d | T2.1.2 | ✅ |
| T2.1.4 | 速率限制与Token计费 | 令牌桶算法、API调用计数、超限告警 | 0.5d | T2.1.1 | ✅ |

## S2.2 NPC角色档案系统 (E2)

| Task ID | 名称 | 产出 | 预估 | 依赖 | 状态 |
|---------|------|------|------|------|------|
| T2.2.1 | 角色档案JSON Schema | 统一角色数据结构定义(TypeScript类型) | 0.5d | 无 | ✅ |
| T2.2.2 | Prompt模板引擎 | 对话Prompt模板、行为决策Prompt模板、变量注入 | 0.5d | T2.2.1 | ✅ |
| T2.2.3 | 角色档案加载器 | 从数据库/JSON文件加载NPC档案到内存 | 0.5d | T2.2.1, T1.6.2 | ✅ |

## S2.3 NPC Agent核心循环 (E2)

| Task ID | 名称 | 产出 | 预估 | 依赖 | 状态 |
|---------|------|------|------|------|------|
| T2.3.1 | Perceive感知模块 | 环境状态获取、事件感知、记忆检索 | 1d | T2.2.3 | ✅ |
| T2.3.2 | Think思考模块 | 目标更新、行为决策LLM调用、选项生成 | 1d | T2.3.1, T2.1.2 | ✅ |
| T2.3.3 | Act行动模块 | 移动执行、对话发起、行为动画触发 | 1d | T2.3.2 | ✅ |
| T2.3.4 | 记忆更新模块 | 交互记录、关系更新、关键信息提取 | 0.5d | T2.3.3 | ✅ |
| T2.3.5 | Agent主循环集成 | 感知-思考-行动-记忆 全链路跑通 | 0.5d | T2.3.1-T2.3.4 | ✅ |

## S2.4 NPC对话系统 (E2)

| Task ID | 名称 | 产出 | 预估 | 依赖 | 状态 |
|---------|------|------|------|------|------|
| T2.4.1 | 对话Prompt构造器 | 角色人格+记忆+情境+历史→完整Prompt | 0.5d | T2.2.2, T2.1.1 | ✅ |
| T2.4.2 | 对话历史管理 | 最近5轮对话存储、上下文截断策略 | 0.5d | T2.4.1 | ✅ |
| T2.4.3 | 流式对话响应 | SSE/WebSocket流式输出、打字机效果 | 0.5d | T2.4.1, T1.5.1 | ✅ |
| T2.4.4 | 对话UI前端 | JRPG风格对话框、像素头像、输入框 | 1d | T1.2.1 | ✅ |
| T2.4.5 | 快捷动作菜单 | 预设动作(打招呼/赞美/威胁/赠礼)UI | 0.5d | T2.4.4 | ✅ |

## S2.5 NPC记忆系统 (E2)

| Task ID | 名称 | 产出 | 预估 | 依赖 | 状态 |
|---------|------|------|------|------|------|
| T2.5.1 | 记忆流存储 | 观察/对话/反思/关系4类记忆写入 | 0.5d | T1.6.4 | ✅ |
| T2.5.2 | 向量嵌入与检索 | text-embedding嵌入、pgvector相似度查询 | 1d | T2.5.1, T2.1.2 | ✅ |
| T2.5.3 | 检索排序算法 | Recency+Importance+Relevance加权排序 | 0.5d | T2.5.2 | ✅ |
| T2.5.4 | 反思生成 | 低优先级记忆→反思摘要、定时批量触发 | 1d | T2.5.1, T2.1.2 | ✅ |
| T2.5.5 | 记忆容量管理 | 500条上限、重要记忆保护、低重要性归档 | 0.5d | T2.5.4 | ✅ |

## S2.6 Agent编排器 (E2)

| Task ID | 名称 | 产出 | 预估 | 依赖 | 状态 |
|---------|------|------|------|------|------|
| T2.6.1 | NPC调度器 | 5秒Tick调度、优先级队列 | 0.5d | T2.3.5 | ✅ |
| T2.6.2 | 并发控制 | 信号量限制(最多8-12同时活跃)、排队机制 | 0.5d | T2.6.1 | ✅ |
| T2.6.3 | 分级更新策略 | 附近NPC高频、远处NPC低频/暂停 | 0.5d | T2.6.1 | ✅ |

## S2.7 NPC间自主交互 (E2)

| Task ID | 名称 | 产出 | 预估 | 依赖 | 状态 |
|---------|------|------|------|------|------|
| T2.7.1 | 交互触发引擎 | 日程交集/主动寻人/随机社交/事件驱动 | 0.5d | T2.3.5 | ✅ |
| T2.7.2 | NPC间对话流程 | 开场白→回复→轮次限制(5轮)→记忆更新 | 1d | T2.4.1 | ✅ |
| T2.7.3 | 信息传播机制 | 八卦传播、传播概率、信息失真 | 0.5d | T2.7.2 | ✅ |

## S2.8 NPC日程与行为系统 (E2)

| Task ID | 名称 | 产出 | 预估 | 依赖 | 状态 |
|---------|------|------|------|------|------|
| T2.8.1 | 日程表执行器 | 读取日程JSON→触发位置移动+行为动画 | 0.5d | T2.2.3 | ✅ |
| T2.8.2 | NPC移动与寻路 | A*寻路、路径点移动、碰撞避让 | 1d | T1.3.3 | ✅ |
| T2.8.3 | NPC精灵渲染 | 占位NPC像素角色、4方向动画、待机呼吸 | 0.5d | T1.2.1 | ✅ |

## S3.1 时间系统 (E3)

| Task ID | 名称 | 产出 | 预估 | 依赖 | 状态 |
|---------|------|------|------|------|------|
| T3.1.1 | 游戏时钟 | 30min现实=1游戏日、昼夜阶段、时间广播 | 0.5d | T1.5.1 | ✅ |
| T3.1.2 | 时间UI | 游戏时钟显示、昼夜视觉变化 | 0.5d | T3.1.1 | ✅ |
| T3.1.3 | 时间事件触发 | 定时任务检查、NPC日程同步、随机事件触发 | 0.5d | T3.1.1 | ✅ |

## S3.2 任务系统 (E3)

| Task ID | 名称 | 产出 | 预估 | 依赖 | 状态 |
|---------|------|------|------|------|------|
| T3.2.1 | 任务数据模型 | 5种任务类型、状态机、前置条件 | 0.5d | T1.6.1 | ✅ |
| T3.2.2 | 任务引擎 | 任务发现→激活→进度追踪→完成/失败 | 1d | T3.2.1 | ✅ |
| T3.2.3 | 任务UI | 任务日志、进度显示、NPC头顶任务标记 | 0.5d | T3.2.2 | ✅ |
| T3.2.4 | 涌现任务生成 | NPC间互动产生的新任务触发逻辑 | 0.5d | T3.2.2, T2.7.2 | ✅ |

## S3.3 物品与经济系统 (E3)

| Task ID | 名称 | 产出 | 预估 | 依赖 | 状态 |
|---------|------|------|------|------|------|
| T3.3.1 | 物品数据模型 | 物品分类(6类)、属性定义、数据库表 | 0.5d | T1.6.1 | ✅ |
| T3.3.2 | 背包系统 | 玩家背包CRUD、物品堆叠、装备管理 | 1d | T3.3.1 | ✅ |
| T3.3.3 | 交易UI | 买卖界面、价格显示、星币支付 | 0.5d | T3.3.2 | ✅ |
| T3.3.4 | 经济平衡 | 初始价格表、收入/支出平衡调参 | 0.5d | T3.3.3 | ✅ |

## S3.4 战斗系统 (E3)

| Task ID | 名称 | 产出 | 预估 | 依赖 | 状态 |
|---------|------|------|------|------|------|
| T3.4.1 | 战斗场景 | 战斗场景切换、敌人出现动画 | 0.5d | T1.2.2 | ✅ |
| T3.4.2 | RTwP战斗逻辑 | 实时战斗+空格暂停、攻击/技能/物品 | 1d | T3.4.1 | ✅ |
| T3.4.3 | 属性与伤害计算 | HP/SP/攻击/防御/速度、伤害公式 | 0.5d | T3.4.2 | ✅ |
| T3.4.4 | 敌人AI与技能 | 5种敌人行为模式、BOSS多阶段 | 1d | T3.4.3 | ✅ |
| T3.4.5 | 战斗UI | 血条/技能栏/暂停菜单、战斗结算 | 0.5d | T3.4.2 | ✅ |
| T3.4.6 | NPC队友战斗 | 可雇佣NPC参战、简单AI队友行为 | 0.5d | T3.4.4 | ✅ |

## S3.5 好感度与声望 (E3)

| Task ID | 名称 | 产出 | 预估 | 依赖 | 状态 |
|---------|------|------|------|------|------|
| T3.5.1 | 好感度系统 | 好感度计算、变化事件、5级态度 | 0.5d | T2.2.3 | ✅ |
| T3.5.2 | 声望系统 | 全局声望计算、NPC态度影响、区域权限 | 0.5d | T3.5.1 | ✅ |

## S3.6 关系图谱系统 (E3)

| Task ID | 名称 | 产出 | 预估 | 依赖 | 状态 |
|---------|------|------|------|------|------|
| T3.6.1 | NPC关系数据模型 | 关系表CRUD、关系变化事件 | 0.5d | T1.6.1 | ✅ |
| T3.6.2 | 关系影响行为 | 关系影响对话态度、折扣、信息共享 | 0.5d | T3.6.1, T2.4.1 | ✅ |

## S4.1 12个NPC完整档案 (E4)

| Task ID | 名称 | 产出 | 预估 | 依赖 | 状态 |
|---------|------|------|------|------|------|
| T4.1.1 | 核心NPC档案(6个) | 玛格丽特/老巴克/艾拉/铁砧/托比/莉莉 完整JSON | 1d | T2.2.1 | ✅ |
| T4.1.2 | 次要NPC档案(4个) | 西尔维娅/马库斯/罗西/小皮普 完整JSON | 0.5d | T2.2.1 | ✅ |
| T4.1.3 | 剧情NPC档案(2个) | 格罗姆/暗祭司塞拉斯 完整JSON | 0.5d | T2.2.1 | ✅ |
| T4.1.4 | NPC关系网络初始化 | 所有NPC间初始关系值与描述 | 0.5d | T4.1.1-T4.1.3 | ✅ |

## S4.2 主线剧情脚本 (E4)

| Task ID | 名称 | 产出 | 预估 | 依赖 | 状态 |
|---------|------|------|------|------|------|
| T4.2.1 | 序章脚本 | 触发条件、关键对话、任务链 | 0.5d | T3.2.1 | ✅ |
| T4.2.2 | 第一章脚本 | 森林低语完整事件链 | 0.5d | T4.2.1 | ✅ |
| T4.2.3 | 第二章脚本 | 深处的秘密完整事件链 | 0.5d | T4.2.2 | ✅ |
| T4.2.4 | 第三章脚本 | 精灵的遗言完整事件链 | 0.5d | T4.2.3 | ✅ |
| T4.2.5 | 终章脚本 | 星火重燃、多结局分支 | 0.5d | T4.2.4 | ✅ |
| T4.2.6 | 涌现叙事规则 | 涌现场景触发规则、信息传播配置 | 0.5d | T4.2.5 | ✅ |

## S4.3 对话UI系统 (E4)

| Task ID | 名称 | 产出 | 预估 | 依赖 | 状态 |
|---------|------|------|------|------|------|
| T4.3.1 | JRPG对话框 | 底部对话框+像素头像+角色名 | 0.5d | T2.4.4 | ✅ |
| T4.3.2 | 自由输入+快捷动作 | 文本输入框+动作按钮组 | 0.5d | T4.3.1 | ✅ |
| T4.3.3 | 交易对话界面 | 买卖对话框集成 | 0.5d | T4.3.1, T3.3.3 | ✅ |

## S4.4 地图装饰与氛围 (E4)

| Task ID | 名称 | 产出 | 预估 | 依赖 | 状态 |
|---------|------|------|------|------|------|
| T4.4.1 | 建筑细节精灵 | 9大区域建筑外观细化 | 1d | T1.3.1 | ✅ |
| T4.4.2 | 昼夜光影效果 | 全局光照滤镜、昼夜色调变化 | 0.5d | T3.1.1 | ✅ |
| T4.4.3 | 环境粒子效果 | 火把火花、喷泉水雾、落叶 | 0.5d | T1.2.1 | ✅ |

## S4.5 音频系统 (E4)

| Task ID | 名称 | 产出 | 预估 | 依赖 | 状态 |
|---------|------|------|------|------|------|
| T4.5.1 | 音频管理器 | BGM加载/切换/淡入淡出、音效播放 | 0.5d | T1.2.1 | ✅ |
| T4.5.2 | 占位音频素材 | 区域BGM(占位MIDI)、基础音效集 | 0.5d | T4.5.1 | ✅ |

## S5.1 全系统联调 (E5)

| Task ID | 名称 | 产出 | 预估 | 依赖 | 状态 |
|---------|------|------|------|------|------|
| T5.1.1 | 前后端全链路联调 | 玩家进入→NPC对话→任务接受→战斗→完成 | 1d | 全S1-S3 | ✅ |
| T5.1.2 | 主线剧情走查 | 从序章到终章完整跑通 | 1d | T4.2.1-T4.2.5 | ✅ |
| T5.1.3 | 数据一致性验证 | NPC记忆/关系/物品状态前后端一致 | 0.5d | T5.1.1 | ✅ |
| T5.1.4 | 边界情况处理 | 断线重连、并发冲突、空数据 | 0.5d | T5.1.1 | ✅ |

## S5.2 AI Prompt调优 (E5)

| Task ID | 名称 | 产出 | 预估 | 依赖 | 状态 |
|---------|------|------|------|------|------|
| T5.2.1 | 对话人设一致性调优 | 角色说话风格测试、Prompt修正 | 1d | T2.4.1 | ✅ |
| T5.2.2 | 记忆检索准确性调优 | 检索权重α/β/γ调参、记忆质量评估 | 0.5d | T2.5.3 | ✅ |
| T5.2.3 | 行为决策合理性调优 | NPC自主行为测试、决策Prompt优化 | 0.5d | T2.3.2 | ✅ |

## S5.3 性能优化 (E5)

| Task ID | 名称 | 产出 | 预估 | 依赖 | 状态 |
|---------|------|------|------|------|------|
| T5.3.1 | NPC调度优化 | 分级策略生效、远处NPC暂停验证 | 0.5d | T2.6.3 | ✅ |
| T5.3.2 | LLM调用缓存 | 相似问题缓存回复、减少重复调用 | 0.5d | T2.1.4 | ✅ |
| T5.3.3 | 前端渲染优化 | 对象池、Sprite批渲染、内存管理 | 0.5d | T1.2.1 | ✅ |
| T5.3.4 | 响应延迟优化 | 对话<2s目标验证、异步流程优化 | 0.5d | T5.3.1, T5.3.2 | ✅ |

## S5.4 Bug修复与打磨 (E5)

| Task ID | 名称 | 产出 | 预估 | 依赖 | 状态 |
|---------|------|------|------|------|------|
| T5.4.1 | Bug清单整理与分优先级 | 内测Bug List | 0.5d | T5.1.1 | ✅ |
| T5.4.2 | P0 Bug修复 | 阻塞性Bug清零 | 1d | T5.4.1 | ✅ |
| T5.4.3 | P1 Bug修复 | 重要Bug修复 | 1d | T5.4.2 | ✅ |
| T5.4.4 | UI打磨 | 动效、布局、字体优化 | 0.5d | T5.4.3 | ✅ |

## S5.5 部署与上线 (E5)

| Task ID | 名称 | 产出 | 预估 | 依赖 | 状态 |
|---------|------|------|------|------|------|
| T5.5.1 | Docker化 | 前后端Dockerfile、Docker Compose | 0.5d | T5.1.1 | ✅ |
| T5.5.2 | CI/CD流水线 | GitHub Actions 自动构建+部署 | 0.5d | T5.5.1 | ✅ |
| T5.5.3 | Nginx反向代理配置 | HTTPS、WebSocket代理、静态资源CDN | 0.5d | T5.5.1 | ✅ |
| T5.5.4 | 生产环境验证 | 部署后全链路冒烟测试 | 0.5d | T5.5.2, T5.5.3 | ⬜ |

## S5.6 文档与交付 (E5)

| Task ID | 名称 | 产出 | 预估 | 依赖 | 状态 |
|---------|------|------|------|------|------|
| T5.6.1 | README与快速启动 | 项目README、本地开发指南 | 0.5d | T5.5.1 | ⬜ |
| T5.6.2 | API文档 | 后端API文档(Swagger/Markdown) | 0.5d | T5.1.1 | ⬜ |
| T5.6.3 | 部署运维文档 | 生产环境配置、监控、故障排查 | 0.5d | T5.5.4 | ⬜ |

---

## S6.1 UI 基础设施升级 (E6)

| Task ID | 名称 | 产出 | 预估 | 依赖 | 状态 |
|---------|------|------|------|------|------|
| T6.1.1 | 像素字体接入 | Google Fonts(Press Start 2P+VT323+ZCOOL KuaiLe)加载，CSS字体变量 | 0.5h | 无 | ✅ |
| T6.1.2 | 分辨率320→270提升 | 480×270内部分辨率，PixelPerfectRenderer缩放基准更新，物理边界重算 | 2h | T6.1.1 | ✅ |
| T6.1.3 | CSS变量色彩体系 | 暖棕木质色板CSS变量定义，背景改暖色 | 0.5h | T6.1.1 | ✅ |
| T6.1.4 | 木质面板通用样式 | panel-wood/panel-parchment/btn-wood可复用CSS类 | 1h | T6.1.3 | ✅ |
| T6.1.5 | AI生成瓦片集资源 | assets/tileset/town-ground.png(草地/泥土/石板/木地板) | 1h | 无 | ✅ |
| T6.1.6 | AI生成NPC立绘 | assets/portraits/npc/*.png(12个NPC 48×48像素头像) | 1.5h | 无 | ✅ |
| T6.1.7 | AI生成物品图标atlas | assets/ui/icons.png(武器/防具/消耗/材料 16×16图标网格) | 1h | 无 | ✅ |
| T6.1.8 | AI生成玩家/NPC精灵图 | assets/sprites/player.png + npc/*.png(4方向×3帧行走动画) | 1.5h | 无 | ✅ |
| T6.1.9 | 资源加载管线 | PreloadScene加载全部PNG资源，木质进度条 | 1h | T6.1.5-T6.1.8 | ✅ |

## S6.2 界面视觉重设计 (E6)

| Task ID | 名称 | 产出 | 预估 | 依赖 | 状态 |
|---------|------|------|------|------|------|
| T6.2.1 | 顶部HUD重设计 | TimeDisplay木质面板+时段图标，连接状态精简 | 1h | T6.1.4 | ✅ |
| T6.2.2 | 对话框重设计 | DialogueBox木质边框+立绘区+羊皮纸正文+清晰字体 | 2h | T6.1.4 | ✅ |
| T6.2.3 | 增强输入栏重设计 | EnhancedDialogueInput快捷动作木质按钮+分类标签 | 1h | T6.2.2 | ✅ |
| T6.2.4 | 任务面板重设计 | QuestPanel木质面板+标签页+进度条+任务卡片 | 1.5h | T6.1.4 | ✅ |
| T6.2.5 | 背包面板重设计 | InventoryPanel物品格木质化+图标+详情区 | 1.5h | T6.1.4 | ✅ |
| T6.2.6 | 交易面板重设计 | TradePanel+TradeDialoguePanel木质购售列表 | 1h | T6.1.4 | ✅ |
| T6.2.7 | 战斗UI重设计 | BattleScene+BattleUI像素精灵+分段血条+木质技能栏 | 2h | T6.1.4 | ✅ |
| T6.2.8 | 加载/标题画面 | PreloadScene星空背景+标题+木质进度条+标语 | 1h | T6.1.9 | ✅ |
| T6.2.9 | 区域名弹幕动画 | GameScene regionLabel滑入+停留+淡出 | 1h | T6.1.2 | ✅ |

## S6.3 场景跳转与美术接入 (E6)

| Task ID | 名称 | 产出 | 预估 | 依赖 | 状态 |
|---------|------|------|------|------|------|
| T6.3.1 | 场景过渡预设 | SceneManager 6种过渡配置(enterBuilding/exitBuilding/enterBattle/exitBattle/boot) | 1h | 无 | ⬜ |
| T6.3.2 | 游戏场景过渡接入 | GameScene进入/离开建筑fade过渡+输入锁定 | 1h | T6.3.1 | ⬜ |
| T6.3.3 | 战斗场景过渡 | 白闪+红色wipe进入战斗，fade退出 | 1h | T6.3.1 | ⬜ |
| T6.3.4 | 瓦片集资源接入 | TilesetManager+MapRenderer加载PNG瓦片替换程序化色块 | 1.5h | T6.1.5 | ⬜ |
| T6.3.5 | 精灵图资源接入 | SpriteGenerator+NpcSpriteManager加载PNG精灵替换色块 | 1.5h | T6.1.8 | ⬜ |
| T6.3.6 | NPC立绘接入对话 | DialogueBox加载assets/portraits/npc/{id}.png替换hash色块 | 0.5h | T6.1.6 | ⬜ |
| T6.3.7 | 物品图标接入背包 | InventoryPanel从icons.png atlas切取图标显示 | 0.5h | T6.1.7 | ⬜ |
| T6.3.8 | 战斗精灵图接入 | BattleScene敌我精灵替换色块 | 1h | T6.1.8 | ⬜ |
| T6.3.9 | 全局视觉打磨 | 像素完美检查+阴影/字号/间距/颜色一致性统一 | 1.5h | 全T6 | ⬜ |

---

## S6.4 原生1080p高清 + NPC移动系统 (E6)

> 用户需求（迭代）：原生分辨率改为 1920×1080 现代高清（弃用480×270低分辨率）、界面适配1920×1080全屏可玩不糊、NPC根据剧情/日程移动不再原地不动

| Task ID | 名称 | 产出 | 预估 | 依赖 | 状态 |
|---------|------|------|------|------|------|
| T6.4.1 | 原生分辨率改为1920×1080 | config GAME_WIDTH/HEIGHT 1920×1080 / TILE_SIZE 64 / SCALE 1，地图1920×1664px | 1h | 无 | ✅ |
| T6.4.2 | 高清渲染器 | PixelPerfectRenderer 1080p 1:1原生渲染+2K/4K整数放大+非16:9铺满，App.css去pixelated | 1h | T6.4.1 | ✅ |
| T6.4.3 | 各系统坐标字号适配 | 交互提示/名字标签/区域标签/粒子系统/远程玩家适配1920×1080（×4） | 1h | T6.4.1 | ✅ |
| T6.4.4 | 移动速度与战斗布局重算 | MovementSystem速度85→340、碰撞体×4、BattleScene布局/字号适配原生1080p | 1h | T6.4.1 | ✅ |
| T6.4.5 | NPC移动驱动服务 | server新增npcMovementDriver：200ms tick推进updateMoves+广播npc:move | 1h | 无 | ✅ |
| T6.4.6 | NPC移动系统坐标校准 | npcMovementSystem网格30×26/64px与前端一致，walkable按前端地图布局初始化，defaultSpeed 240 | 1.5h | T6.4.5 | ✅ |
| T6.4.7 | 日程驱动NPC移动 | scheduleExecutor注入时钟+AREA_POSITIONS校准1920世界坐标+profileLoader坐标归一化×4，小时切换创建移动任务 | 1.5h | T6.4.5 | ✅ |
| T6.4.8 | 剧情驱动NPC移动 | story:trigger成功后相关NPC走向玩家(npcMovementDriver.moveNpcToPlayer) | 1h | T6.4.5 | ✅ |
| T6.4.9 | 前端NPC移动渲染 | GameScene订阅npc:move/npc:update驱动精灵平滑移动+行走动画+监听清理 | 1h | T6.4.5 | ✅ |

---

**总计**：约121个Task（原112 + S6.4新增9） | 均有明确产出和依赖链 | 可直接指导Agent每日执行

> AI生成
### Sprint 6（Day 25 需求延展）— 小镇美术镇子化 + 建筑立体感 + 室内场景

| Task ID | 名称 | 描述/产出 | 预估 | 依赖 | 状态 |
|---------|------|-----------|------|------|------|
| T6.5.1 | 城镇地图镇子化重构 | generateTownMap重写：道路成网（纵双主街+横三干道）、中央广场（喷泉/长椅/路灯/花坛）、自然绿化错落、四周树林带镇界、底部栅栏入口门柱 | 2h | 无 | ✅ |
| T6.5.2 | 建筑立体感增强 | TownBuildingRenderer重写：地面投影椭圆渐变、屋顶厚度+屋脊高光+屋檐投影、墙体受光/暗面渐变+墙脚阴影、门洞纵深+门楣+台阶、窗台凸起+玻璃渐变、烟囱炊烟 | 2h | T6.5.1 | ✅ |
| T6.5.3 | 室内场景确定性布局 | generateInteriorMap重写：铁匠铺/药剂店/酒馆/集市/长老厅/民居/森林/矿洞手工功能区布局（吧台/熔炉/床/书架/长桌等），NPC站位合理避开家具 | 2h | T6.5.1 | ✅ |
| T6.5.4 | 室内镜头自动缩放 | CameraController增加setZoomLevel，GameScene按场景缩放（室内2.5/酒馆2.2/森林1.25/矿洞1.6/城镇1），室内铺满屏幕 | 1h | T6.5.3 | ✅ |
| T6.5.5 | 家具瓦片精致绘制 | TilesetManager新增13种瓦片细节：桌/箱/桶/铁砧/熔炉/书架/柜台/炉灶/长椅/灌木/岩石/花园/路牌 | 1.5h | 无 | ✅ |
| T6.5.6 | 场景切换链路修复 | 修复4 Bug：室内家具下补草地→按相邻地板推断；NPC位置被npc:move城镇坐标覆盖→非town忽略同步；室内出生点与出口门重叠自动回城→spawnPoint前移；场景残留Text对象清理 | 1.5h | T6.5.3 | ✅ |
| T6.5.7 | NPC脚下阴影 | NpcSpriteManager为NPC添加椭圆落地阴影，移动跟随/销毁清理 | 0.5h | 无 | ✅ |
| T6.5.8 | 道路纹理优化 | Ground_Path改为踩实土路（碎石+脚印凹陷），不再像耕地垄沟 | 0.5h | T6.5.1 | ✅ |

---

## S6.6 主线剧情解锁系统 (E6/E4) — Day 26

> 用户需求（迭代）：增加游戏可玩性，设置主线剧情，场景/NPC随剧情推进逐步可见。
> 实现"剧情解锁系统"：完成序章后解锁低语森林/长老大厅/游商托比等，第一章后解锁废弃矿洞/格罗姆/铁砧，第三章解锁暗祭司塞拉斯。

| Task ID | 名称 | 描述/产出 | 预估 | 依赖 | 状态 |
|---------|------|-----------|------|------|------|
| T6.6.1 | 解锁规则表设计 | storyUnlockService：SCENE_UNLOCK_RULES（9场景×章节门槛）+ NPC_UNLOCK_RULES（12NPC×章节门槛），解锁文案/锁定提示 | 1h | 无 | ✅ |
| T6.6.2 | 解锁状态纯函数 | computeUnlockState(progress)→场景/NPC解锁状态+newlyUnlocked，支持flag条件 | 0.5h | T6.6.1 | ✅ |
| T6.6.3 | 章节推进广播联动 | storyProgressionManager章节推进后调用broadcastUnlock→io.emit('story:unlock_changed') | 0.5h | T6.6.2 | ✅ |
| T6.6.4 | 解锁状态API | GET /api/integration/unlock-state/:playerId 返回场景/NPC解锁状态 | 0.5h | T6.6.2 | ✅ |
| T6.6.5 | 前端解锁状态存储 | gameStore新增story slice（currentChapter/scenes/npcs/lastUnlockNotice）+ actions | 0.5h | 无 | ✅ |
| T6.6.6 | 前端解锁管理器 | client storyUnlock服务：fetchUnlockState/isSceneUnlocked/isNpcUnlocked/watchStoryUnlockEvents | 0.5h | T6.6.5 | ✅ |
| T6.6.7 | 建筑迷雾锁定态 | TownBuildingRenderer未解锁建筑：半透明(alpha0.35)+迷雾粒子(3团飘动)+名称"？？？" | 1h | T6.6.6 | ✅ |
| T6.6.8 | 门口解锁拦截 | GameScene.handleDoorTransition检查isSceneUnlocked，未解锁显示"尚未开放"提示并阻止进入 | 0.5h | T6.6.6 | ✅ |
| T6.6.9 | NPC解锁过滤 | GameScene.loadNPCsFromServer/rebuildSceneNPCs按isNpcUnlocked过滤，未解锁NPC不渲染 | 0.5h | T6.6.6 | ✅ |
| T6.6.10 | 解锁通知反馈 | GameScene.showUnlockBanner(Phaser横幅) + StoryUnlockNotice组件(React横幅+右下章节指引面板) | 1h | T6.6.8 | ✅ |
| T6.6.11 | 全窗口自适应铺满 | 修复PixelPerfectRenderer整数缩放钳制Bug：任意窗口尺寸下画布等比铺满浏览器（cover策略），ResizeObserver实时响应窗口变化 | 1h | 无 | ✅ |

---

## S6.7 普通NPC（路人）系统 (E6/E2) — Day 27

> 用户需求（迭代）：NPC用准备好的美术资源，增加一些更普通的NPC，只会回复固定的回答，营造整个镇子闹哄哄的感觉，可以走动。
> 实现"普通NPC（Ambient NPC）"系统：10个路人NPC复用现有美术精灵图，固定台词库不走LLM，城镇随机漫游+头顶气泡。

| Task ID | 名称 | 描述/产出 | 预估 | 依赖 | 状态 |
|---------|------|-----------|------|------|------|
| T6.7.1 | 普通NPC定义与台词库 | server ambientNpcService：10个路人（阿福/翠花/狗蛋/大牛/桂花/二丫/石头/胖婶/老杨/铁牛），greetings/replies(关键词匹配)/bubbles三类固定台词 | 1h | 无 | ✅ |
| T6.7.2 | 普通NPC列表API | GET /api/npcs/ambient 返回普通NPC定义（站位/漫游半径/台词/复用资产） | 0.3h | T6.7.1 | ✅ |
| T6.7.3 | 交互固定回复短路 | socket handler interaction:trigger/message 对amb_前缀NPC直接返回固定台词（流式），不走Agent/LLM链路 | 0.5h | T6.7.1 | ✅ |
| T6.7.4 | 普通NPC精灵复用美术资源 | SpriteGenerator.generateNPCSprite支持externalAssetId参数，NpcSpriteManager NPCData.assetId，10路人复用12张NPC精灵图 | 0.5h | T6.7.2 | ✅ |
| T6.7.5 | 普通NPC漫游系统 | client AmbientNpcSystem：出生点roamRadius随机目标点+isWalkableAt避障+走走停停+行走动画+名字标签/阴影 | 1.5h | T6.7.4 | ✅ |
| T6.7.6 | 头顶气泡台词 | AmbientNpcSystem随机间隔(2-6s)头顶冒固定台词气泡（上浮动画2.6s），营造闹哄哄氛围 | 0.5h | T6.7.5 | ✅ |
| T6.7.7 | 场景切换重建 | GameScene集成：城镇生成10路人+注册交互，进室内清理，回城镇重建；shutdown清理 | 0.5h | T6.7.5 | ✅ |

---

## S6.8 升级打怪玩法 + 时间驱动主线任务 (E3/E4) — Day 28

> 用户需求（迭代）：增加一个升级打怪的玩法，主线剧情内加入。随着时间的推移弹出需要玩家完成的主线任务，待玩家确认后再进行下一个任务。
> 实现"升级打怪 + 时间驱动主线任务"系统：战斗胜利获得经验→升级属性成长；游戏时钟到达触发时间自动弹出主线任务（弹窗），玩家确认后才接受，完成任务才继续下一个。

| Task ID | 名称 | 描述/产出 | 预估 | 依赖 | 状态 |
|---------|------|-----------|------|------|------|
| T6.8.1 | Player等级/经验字段 | schema.prisma Player新增 level(默认1)/exp(默认0)，prisma migrate add_level_exp | 0.3h | 无 | ✅ |
| T6.8.2 | 升级系统服务 | server levelSystem：expToNext曲线(80+(lv-1)*60)、grantExp自动升级（属性成长maxHp+12/maxSp+5/attack+2/defense+1/speed+1+满血蓝）、level:update/level:up事件广播、setLevel调试 | 1h | T6.8.1 | ✅ |
| T6.8.3 | 时间驱动主线任务服务 | server mainlineQuestService：6个打怪主线任务（狼/哥布林/树精/蠕虫/暗影爪牙/BOSS），触发时间表(Day1 8h-12h/D2 9h/14h/D3 10h)，监听gameClock hour_change/new_day+questEngine quest_completed，串行推进（待确认/进行中阻塞新任务），任务定义写入Quest表 | 2h | T6.8.2 | ✅ |
| T6.8.4 | 打怪击杀触发器 | questEngine新增triggerKillEnemy：按敌人ID推进所有kill_enemy任务目标 | 0.3h | 无 | ✅ |
| T6.8.5 | 升级/主线API | routes/level：GET /level/:playerId、POST /level/settle-battle（胜利→发经验/星币+triggerKillEnemy）、GET /level/mainline/status、POST /level/mainline/check、GET /level/mainline/missions、GET /level/stats | 0.5h | T6.8.3 | ✅ |
| T6.8.6 | socket确认事件 | handler：连接注册registerPlayer、story:mainline_confirm确认、mainline:status查询 | 0.3h | T6.8.3 | ✅ |
| T6.8.7 | 前端任务/等级状态 | gameStore新增mission slice（pendingMission/activeMission）+level slice（level/exp/expToNext）+lastLevelUp，websocket监听story:mainline_popup/confirmed/mainline:status/level:update/level:up | 0.5h | 无 | ✅ |
| T6.8.8 | 主线任务弹窗组件 | client MainlineMissionPopup：星露谷木质风格弹窗（任务标题/描述/目标/奖励/推荐等级），"确认接受"按钮→wsService.confirmMainlineMission | 0.5h | T6.8.7 | ✅ |
| T6.8.9 | 等级HUD+升级提示 | client LevelBadge（左上角Lv徽章+经验条）+LevelUpNotice（升级LEVEL UP横幅动画3.2s），App.tsx挂载+连接后拉取等级 | 0.5h | T6.8.7 | ✅ |
| T6.8.10 | 战斗结算接入升级 | BattleScene.exitBattle胜利时POST /api/level/settle-battle（经验+星币+打怪任务推进），仅结算一次 | 0.5h | T6.8.5 | ✅ |
| T6.8.11 | 场景切换竞态修复 | 修复AmbientNpcSystem/NpcSpriteManager的anims undefined崩溃（精灵销毁后update竞态）：防御式可选链+destroyOne清理 | 0.5h | 无 | ✅ |

## S6.9 天气系统 (E3) — Day 29

> 用户需求（迭代）：增加一个设定——天气，显示到镇子上。
> 实现天气系统：服务端 WeatherService（6种天气随机调度 + socket广播 + API），前端 WeatherSystem 渲染雨丝/雪花/雾团/闪电 + 全屏色调滤镜，HUD 天气显示，NPC 感知环境快照用真实天气。

| Task ID | 名称 | 描述/产出 | 预估 | 依赖 | 状态 |
|---------|------|-----------|------|------|------|
| T6.9.1 | WeatherService | server weatherService：6种天气（sunny/cloudy/light_rain/storm/snow/fog）+时段权重随机调度（小时12%概率+新一天重置）+weather:update广播+getWeatherSnapshot；routes/weather（GET /、GET /types、POST /set） | 1.5h | 无 | ✅ |
| T6.9.2 | 后端接入 | index.ts初始化（setIo+initialize）；server.ts挂载/api/weather；handler连接时sendWeatherToClient+两处NPC环境快照weather改用真实值 | 0.3h | T6.9.1 | ✅ |
| T6.9.3 | 前端weather slice | gameStore新增WeatherState（type/name/icon/description）+setWeather；websocket监听weather:update写入store | 0.3h | 无 | ✅ |
| T6.9.4 | WeatherSystem | client WeatherSystem：雨丝/雪花（柔光+亮点）/雾团粒子+全屏MULTIPLY色调滤镜（smoothstep渐变）+雷雨双闪闪电，深度950-1100 | 1.5h | T6.9.3 | ✅ |
| T6.9.5 | GameScene接入天气 | GameScene创建WeatherSystem+初始化store天气+监听weather:update实时切换+每帧update+shutdown清理（卸载监听+destroy） | 0.5h | T6.9.4 | ✅ |
| T6.9.6 | HUD天气显示 | client WeatherDisplay组件（木质面板：图标+名称+描述+切换弹跳动画），App.tsx挂载于时间显示左侧 | 0.3h | T6.9.3 | ✅ |

## S6.10 战斗界面精细化 (E6) — Day 29

> 用户需求（迭代）：战斗界面也精细一点，不是有定义好的美术资源吗？
> 复用现有美术资源精细化战斗界面：瓦片地面/装饰物/敌人精灵/结算背景插画/敌人脚下阴影/HP数字/入场与击败动画/胜利横幅。

| Task ID | 名称 | 描述/产出 | 预估 | 依赖 | 状态 |
|---------|------|-----------|------|------|------|
| T6.10.1 | 战斗瓦片地面+装饰 | BattleScene createBattleArena重写：上半tile-img-ground-dirt(暗调)/下半tile-img-ground-grass(暖调)/中线石板路+22个随机装饰(deco-bush/rock/flower/plant避开中央)+木框加厚金线 | 0.8h | 无 | ✅ |
| T6.10.2 | 战斗精灵精细 | 敌人/玩家脚下椭圆阴影(depth=y-1)；尺寸适配(普通144/BOSS 200px)；入场动画(透明+缩放Back.easeOut)；击败消散(放大淡出+阴影淡化)；玩家呼吸浮动 | 0.5h | T6.10.1 | ✅ |
| T6.10.3 | HP数字+日志面板+胜利横幅 | HP条宽度随精灵自适应+HP数字文本(40px金色实时更新)；行动日志木质圆角面板(560×160)；状态文字描边；胜利金色横幅"✦ 胜利 ✦"(Back.easeOut 2.6s) | 0.5h | T6.10.1 | ✅ |

---

**总计**：约169个Task（原158 + S6.9新增6 + S6.10新增3） | Day 29 验收通过
## S6.11 任务拒绝 + 待机动作 + F键进建筑 + 室内氛围NPC (E6) — Day 30

> 用户需求（迭代）：1) 任务用户也可以拒绝，包括打怪升级，加取消按钮，等一段时间后再弹出；2) 主角探险者不动时设计待机动作；3) 每个建筑都可以按F进入（除去剧情解锁的）；4) 进入建筑（除去反派的）后也有不接大模型的NPC营造热闹氛围。

| Task ID | 名称 | 描述/产出 | 预估 | 依赖 | 状态 |
|---------|------|-----------|------|------|------|
| T6.11.1 | 主线任务拒绝/取消+延迟重弹 | server mainlineQuestService.rejectMission：清pending+设置rejectUntil(当前游戏时间+2小时跨天进位)+删除triggeredKeys去重+广播story:mainline_rejected；checkForPlayer增加拒绝冷却判断；handler新增story:mainline_reject；client websocket监听story:mainline_rejected+rejectMainlineMission；MainlineMissionPopup新增"暂时不去"取消按钮（木质暗色样式） | 1h | T6.8.x | ✅ |
| T6.11.2 | 主角待机动作 | MovementSystem：站定6-10秒后随机触发待机小动作——伸懒腰(y上浮10px+scale1.08 tween+body.reset同步)、转头张望(切left/right idle 950ms后恢复)、打哈欠(y下压+angle摆动yoyo)；移动/锁定输入时cancelIdleAction恢复 | 1h | 无 | ✅ |
| T6.11.3 | 建筑按F进入 | CollisionSystem移除踩门自动overlap，新增updateDoorProximity(110px近邻检测)/tryEnterDoor/getNearestDoorTile；GameScene F键触发+update每帧检测+doorPrompt底部提示（城镇"[F] 进入 xxx"/未解锁"🔒 xxx 尚未开放"/室内"[F] 离开"） | 1h | 无 | ✅ |
| T6.11.4 | 室内氛围NPC | server ambientNpcService新增14个室内/野外氛围NPC（铁匠铺2/药剂店2/酒馆3/集市2/民居2/森林2/矿洞2，长老大厅反派相关不放），定义带scene字段+getByScene；crud.ts支持?scene=过滤；client AmbientNpcSystem按场景缓存加载渲染（rebuildForScene异步） | 1.5h | T6.7.x | ✅ |

**总计**：Day 30 新增4个Task，全部完成验收通过

## S6.12 分辨率统一 + 关系驱动主线剧情 + 任务5分钟冷却 (E6/E3/E4) — Day 31

> 用户需求（迭代）：1) 小镇还是各个建筑内的分辨率统一；2) 设定主线剧情故事，大模型根据人物关系生成有意思的联系和冲突（参考斯坦福小镇）作为主线任务；3) 弹任务最多现实时间5分钟一次。

| Task ID | 名称 | 描述/产出 | 预估 | 依赖 | 状态 |
|---------|------|-----------|------|------|------|
| T6.12.1 | 小镇/建筑分辨率统一 | SceneSystem室内场景地图12×10→30×17 tiles(1920×1088px，与小镇世界坐标一致)、森林24×20→30×17、矿洞18×14→30×17；spawnPoint统一(15,15)；室内出口门统一(15,16)；7个室内家具布局按新尺寸重设计；GameScene SCENE_ZOOM全部统一为1；ambientNpcService 15个室内/野外氛围NPC坐标适配 | 2h | 无 | ✅ |
| T6.12.2 | 关系驱动主线剧情故事 | mainlineQuestService新增STORY_ARCS（5个故事弧：信任的裂痕/猜疑蔓延/联盟与背叛/暗影现身/星火重燃）；固定打怪主线完成后进入关系驱动模式；collectConflictPairs按冲突强度从relationNetwork挑选关系对；LLM根据关系快照+NPC档案+弧主题生成JSON任务（标题/描述/参与NPC/目标）；注册QuestDefinition+upsert DB；复用story:mainline_popup弹窗链路；generatedQuestKeys去重+弧内任务数上限推进 | 3h | T6.12.1 | ✅ |
| T6.12.3 | 任务弹窗现实5分钟冷却 | mainlineQuestService：PlayerMissionState新增lastPopupRealTime；POPUP_REAL_COOLDOWN_MS=5min；checkForPlayer与checkRelationshipStory均检查现实时间冷却；confirm/reject同步更新时间戳 | 0.5h | T6.12.2 | ✅ |

**总计**：Day 31 新增3个Task，全部完成验收通过

## S6.13 任务引导系统（原神式右侧悬浮按钮+感叹号） (E6/E3) — Day 31 迭代

> 用户需求（迭代）：做一个任务引导，类似冒险类任务，界面右边有一个悬浮小按钮，点击后提示当前应完成的主线任务；后续任务提示不需要通过大弹窗，通过小按钮上的感叹号提示即可（参考原神 Quest Tracker 设计方案，开放世界冒险风格）。

| Task ID | 名称 | 描述/产出 | 预估 | 依赖 | 状态 |
|---------|------|-----------|------|------|------|
| T6.13.1 | 任务引导系统 | client：QuestGuide.tsx（右侧中部悬浮按钮，待确认⚔+金色感叹号脉冲徽章/进行中📜+绿色进度点/空闲🧭；点击展开原神风格深色半透明面板——待确认任务确认/拒绝按钮、进行中任务目标进度条百分比、下一任务预告、主线进度、空状态）；QuestGuide.css（深蓝渐变+金色描边+脉冲动画+右滑入场+移动端适配）；gameStore MissionState新增nextMission/guideOpen/guideHasNew+setGuideOpen/setGuideHasNew；websocket story:mainline_popup改为guideHasNew感叹号提醒（不再弹大窗）+mainline:status映射nextMission与目标current/required+新增quest:event监听刷新进行中任务进度；App.tsx移除MainlineMissionPopup替换为QuestGuide；顺手修复CollisionSystem.updateDoorProximity场景切换doorGroup竞态崩溃 | 2h | T6.12.3 | ✅ |

**总计**：Day 31 迭代新增1个Task（T6.13.1），完成验收通过（Playwright：感叹号→展开→确认→进行中→击杀后1/3实时刷新）
## S6.14 原神式任务指引箭头 + 冒险者速度调慢 (E6/E3) — Day 32

> 用户需求（迭代）：1) 做一个地图指引类似原神，用户接受任务后在路上有闪动的白色箭头告诉用户应该去哪里；2) 调慢冒险者的行走速度。

| Task ID | 名称 | 描述/产出 | 预估 | 依赖 | 状态 |
|---------|------|-----------|------|------|------|
| T6.14.1 | 冒险者行走速度调慢 | MovementSystem speed 340→250px/s（1920×1080 原生分辨率约每秒3.9 tiles，悠闲冒险步伐）；注释同步更新 | 0.1h | 无 | ✅ |
| T6.14.2 | 原神式任务指引箭头系统 | client 新建 QuestGuideArrows.ts：读取store.activeMission第一个未完成目标→解析指引目标（talk_to_npc/collect_item按NPC归属场景与站位NPC_SCENE_MAP/NPC_TOWN_STANDS/SCENES.npcSpawns+UUID经GameScene注入idToName反查；kill_enemy按ENEMY_SCENE_MAP敌人归属场景；visit_area按区域名匹配场景）；getGuideWorldPoint目标点→当前场景坐标（同场景→目标点/城镇→SCENE_PORTALS入口门/室内野外→INTERIOR_EXIT_PORTALS出口门）；渲染玩家前方150px白色三角箭头+光晕+尾带，alpha呼吸闪动0.35~1，接近<160px隐藏；目标缓存lastResolveKey；gameStore MissionObjective加type字段；websocket confirmed/status透传type+targetId；后端getStatus activeProgress与popup/confirmed广播objectives附带type；GameScene实例化+update+setCurrentScene+注入idToName+shutdown | 2h | T6.14.1 | ✅ |
| T6.14.3 | mainline事件定向广播修复 | 修复：checkAllPlayers遍历playerStates缓存（含curl测试玩家demo-player）且io.emit全服广播→测试玩家弹任务打扰在线玩家导致已确认任务被覆盖回待确认；改io.to(playerId)定向发送（5处）+checkAllPlayers只遍历在线玩家（io.sockets.sockets，无io回退缓存）+前端popup/confirmed/rejected增加playerId本机校验 | 0.5h | T6.14.2 | ✅ |

**总计**：Day 32 新增3个Task，全部完成验收通过（Playwright：确认任务→白色闪动箭头出现指向森林入口→接近隐藏；速度250px/s位移实测250px/1s）## S6.15 主线任务逻辑修复 + 循序渐进主线任务链（与地图解锁适配） (E7/E3) — Day 33

> 用户需求（逻辑修复 + 主线任务重设计）：1) 任务发布地点不能在未解锁的地图内；2) 设定细致的主线任务——开头熟悉主要NPC→解锁地图→最后打BOSS，循序渐进，与地图解锁适配。

| Task ID | 名称 | 描述/产出 | 预估 | 依赖 | 状态 |
|---------|------|-----------|------|------|------|
| T6.15.1 | 主线任务链重构（多目标类型+章节绑定） | MainlineMissionDef重构：MainlineMissionObjective支持talk_to_npc/visit_area/kill_enemy+targetId+count；新增requiredChapter(0序章/1森林/2矿洞/3全部)+giverNpcId；MAINLINE_MISSIONS重写为11任务"星火之旅"（初来乍到/小镇的问候/荒野之狼/哥布林骚扰→森林的低语/腐化树精/迷途之影→矿洞的呼唤/矿洞蠕虫危机/暗影先锋入侵→森林守护者BOSS）；initialize注册与DB upsert按新结构；getStatus pending/nextMission附objectives；前端QuestGuide目标图标分类型（💬对话/🧭探索/⚔打怪）；QuestGuideArrows ENEMY_SCENE_MAP修正（狼/哥布林→town，幽灵→forest） | 2h | 无 | ✅ |
| T6.15.2 | 地图解锁校验（任务发布地点不能是未解锁地图） | checkFixedMission：requiredChapter>0时经chapterProvider读玩家当前章节，未解锁不发布（不标记triggeredKeys）→章节推进后重检弹出；setChapterProvider注入（index.ts绑定storyProgressionManager.getPlayerProgress）；checkForPlayer修复：固定主线未完成且任务因未解锁延迟时return false防止误入关系驱动模式；单测验证任务链章节递进/发布NPC解锁/敌人场景解锁/章节0玩家只收序章任务 | 0.5h | T6.15.1 | ✅ |
| T6.15.3 | talk/visit目标推进链路 | questEngine.triggerNpcTalk多路匹配（原ID+sc_占位前缀剥离+profileLoader反查中文名）；handler interaction:trigger对话后调用triggerNpcTalk；新增area:enter socket事件→triggerAreaEnter+storyProgressionManager.triggerScene；GameScene.switchScene进入forest/mine上报area:enter（动态import）；websocket新增reportAreaEnter | 1h | T6.15.1 | ✅ |
| T6.15.4 | 章节推进联动主线检查+前端适配 | storyProgressionManager.checkChapterProgression章节推进后动态import mainlineQuestService.checkForPlayer（延迟任务立即弹出）；websocket mainline:status pending/nextMission透传objectives；E2E验证：弹出→确认→对话推进(3/3)→完成→推进下一任务；Playwright浏览器面板实时刷新；生产容器重建验证 | 0.5h | T6.15.2 | ✅ |

**总计**：Day 33 新增4个Task，全部完成验收通过（E2E：任务弹出→确认→对话推进→完成→串行推进；章节0不发布未解锁地图任务；生产容器healthy）
## S6.16 HUD简化 + 天气弹出提示 + 移除交易/背包系统 (E6/E3) — Day 34

> 用户需求（迭代）：1) 右上角天气只在改变时弹出一下，接着消失；2) 取消交易系统；3) 右上角不要那么复杂，只保留用户名。

| Task ID | 名称 | 描述/产出 | 预估 | 依赖 | 状态 |
|---------|------|-----------|------|------|------|
| T6.16.1 | 天气改为变化时弹出提示 | WeatherDisplay重构：默认不渲染，仅当store.weather.type变化（weather:update广播驱动）时弹出木质天气面板（图标+名称+描述），4秒后自动淡出消失；卸载清理定时器；天气粒子效果（WeatherSystem）不受影响 | 0.5h | 无 | ✅ |
| T6.16.2 | 右上角只保留用户名 + 时间移到左上角 | App.tsx右上角状态栏精简为用户名按钮（绿点+用户名+▾，无Room标签/无独立退出按钮），点击展开下拉菜单（用户名+退出登录）；TimeDisplay.css right:8px→left:8px移到左上角；App.css status-bar精简+新增username-btn/user-menu样式；scene-indicator移到右下角 | 0.5h | 无 | ✅ |
| T6.16.3 | 移除交易系统（前端） | 删除TradePanel.tsx/TradePanel.css/TradeDialoguePanel.tsx；App.tsx移除渲染与import；EnhancedDialogueInput移除交易分类4个快捷动作（交易/购买/出售/鉴定）+CATEGORY_LABELS trade；DialogueBox移除"交易"快捷动作 | 0.5h | 无 | ✅ |
| T6.16.4 | 移除背包系统（前端） | 删除InventoryPanel.tsx/InventoryPanel.css；App.tsx移除渲染与import（含I键快捷键监听随之消失） | 0.3h | 无 | ✅ |
| T6.16.5 | 移除交易/背包后端API | item.ts删除/items/buyable与/inventory/:playerId及buy/sell/use/equip路由（保留/items与/items/category与/items/stats物品定义查询）；integration.ts删除buy_item分支（保留accept_quest）；edgeCaseHandler删除safeBuyItem方法与safeGetInventory方法及runEdgeCaseTests"空背包处理"测试 | 0.5h | 无 | ✅ |

**总计**：Day 34 新增5个Task，全部完成验收通过（生产容器重建：天气变化弹出4秒消失、右上角仅用户名+下拉退出、时间左上角、买卖API 404、前端编译通过）
## S6.17 出生点统一为温馨小屋门口 (E6) — Day 35

> 用户需求：所有用户进入游戏后都出生在温馨小屋门口（每次进入均重置，不恢复上次位置）。

| Task ID | 名称 | 描述/产出 | 预估 | 依赖 | 状态 |
|---------|------|-----------|------|------|------|
| T6.17.1 | 出生点统一为温馨小屋门口 | authService.ts新增SPAWN_X/SPAWN_Y常量（温馨小屋门tile(14,21)外一格(14,22)→像素928,1440）；register/login自动注册初始位置改928,1440；socket/handler.ts连接时强制所有玩家位置重置为小屋门口（Redis会话+player:state下发+数据库同步重置），player:list默认坐标同步；.env固定SERVER_PORT=4100（避免环境变量4397污染端口映射） | 0.5h | 无 | ✅ |

**总计**：Day 35 新增1个Task，验收通过（API注册返回x=928,y=1440；老用户模拟旧位置500,800连接后player:state下发928,1440且DB同步重置；生产server容器healthy，端口4100:4000）
---

### S7（Day 36 延展）— 建筑室内场景 AI 美术升级

> 用户需求：每个建筑按 F 进入后的室内场景更细致，用大模型生成美术资源，做出适合每个建筑的场景。

| Task ID | 名称 | 描述/产出 | 预估 | 依赖 | 状态 |
|---------|------|-----------|------|------|------|
| T7.x.3 | 6个建筑室内AI底景图生成 | 硅基流动Z-Image批量生成6张2048×1152室内空景底图（星露谷风/无家具/底部中央门），缩放1920×1088落地client/public/assets/interiors/ | 1h | 无 | ✅ |
| T7.x.4 | MapRenderer底景渲染模式+孤儿精灵修复 | PreloadScene加载interior-bg-*；MapRenderer新增setInteriorBackdrop/renderInteriorBackdrop/renderCollisionLayer底景分支（仅墙碰撞）；GameScene.switchScene接入；修复ensureGroundBelow孤儿tileSprite残留（新增allCreatedSprites全量登记+destroyMap统一销毁，残留226→0） | 1.5h | T7.x.3 | ✅ |
| T7.x.5 | 室内NPC站位适配 | ambientNpcService.ts琴歌站位17,4→17,6（避开AI底景壁炉区域x15-17,y3-5） | 0.5h | T7.x.4 | ✅ |
| T7.x.10 | 主线任务完成后立即发布下一个（右侧任务引导栏实时更新） | mainlineQuestService.ts新增releaseNextFixedMission（跳过游戏时间triggerAt等待+跳过现实5分钟冷却，保留章节解锁校验）与releaseNextStoryMission（关系驱动任务完成后立即生成下一个）；handleQuestCompleted改造：固定主线完成→立即发布下一个，固定主线全完成→立即进入关系驱动；checkRelationshipStory重构复用releaseNextStoryMission | 1h | 无 | ✅ |

**总计**：Day 36 新增3个Task，全部验收通过（6建筑室内无户外tile穿模、NPC无墙体重叠、风格贴合建筑主题）；Day 38 新增1个Task验收通过（完成"初来乍到"→引导栏立即显示"小镇的问候"；完成"小镇的问候"→立即显示"荒野之狼出没"，后端日志`next quest popped immediately`）| T7.x.11 | 回合制战斗重构（赛尔号式对战） | AI生成战斗背景battle-arena.png（2560×1440→1920×1080，赛尔号式左右分屏对战舞台：左草地玩家区/右碎石敌人区/中央石墙分隔）；AI重新生成8个敌人精灵（2帧动作spritesheet：待机/攻击，普通128×128 BOSS160×160，AI图切格+程序化攻击帧变形）；battleEngine新增turn模式（玩家先手→敌人反击，roundEvents事件序列返回，tick跳过）；enemyDefs.ts敌人属性定义+等级缩放（数学上保证玩家必赢：单敌/双敌/BOSS全部验证通过）；battle路由create支持mode=turn（按玩家等级生成敌人属性）；BattleScene重构赛尔号式回合制UI（AI背景+左玩家右敌人+攻击/逃跑木牌按钮+回合横幅+伤害浮动数字+多敌独立血条+胜利弹框"战胜xxx"含经验星币+确定按钮+战败弹框）；GameScene.startBattle按场景遭遇敌人（town荒野之狼/forest树精+幽灵/mine蠕虫+爪牙，主线BOSS任务驱动森林BOSS战） | 3h | 无 | ✅ |
| T7.x.12 | 战斗美术资源精细化（AI精细精灵+主角升级） | AI生成精细主角战斗精灵（battle-player.png 384×192 两帧待机/攻击：少年冒险者蓝衣披风长剑带发光特效，服装褶皱/头发层次/金属质感像素细化）；AI生成精细荒野之狼（wolf.png 384×192 两帧：皮毛层次光影+獠牙清晰）；其余7个敌人帧尺寸128→192（BOSS 160→224），AI网格图切格高分辨率输出，战斗显示190/230时接近1:1无放大模糊；PreloadScene敌人spritesheet帧尺寸更新+battle-player加载；BattleScene主角改用battle-player精灵（回退player）；修复攻击帧切换判断（frame.total→texture.frameTotal，帧动画实际生效）；修复CollisionSystem.unregisterNpc场景切换竞态（body已被Physics清理时崩溃，加防护+try-catch）；修复AmbientNpcSystem.destroyOne精灵非active时跳过注销 | 2h | T7.x.11 | ✅ |
| T7.x.13 | 新增游戏背景音乐（星露谷风BGM+战斗音乐切换） | 新建MusicSystem.ts（Web Audio API程序化合成，零音频文件零版权风险）：6首BGM离线渲染（OfflineAudioContext）——小镇晨曦(G大调96bpm田园轻快)、酒馆夜谈(A小调84bpm室内温暖)、森林低语(D小调76bpm宁静空灵)、矿洞回响(C小调88bpm神秘幽深)、战火纷飞(D小调144bpm锯齿波低音紧张)、宿命对决(E小调160bpm BOSS战)；每首8小节×8槽=64槽loop无缝循环，音色：lead方波+三角波(长笛/口琴感)/arp三角波分解和弦/bass正弦+三角(drive锯齿)/噪声打击乐(kick/snare/hihat)；MusicSystem单例：AudioContext惰性初始化+浏览器自动播放策略适配(挂起时监听首次手势resume)+800ms淡入淡出无缝切换+场景BGM映射(SCENE_BGM_MAP)+音量控制；GameScene.create播放场景BGM+switchScene场景切换换曲(城镇/6室内统一酒馆/森林/矿洞)；BattleScene.create按敌人切换战斗BGM(BOSS战用宿命对决)；战斗退出回GameScene自动恢复场景音乐；顺手修复TilesetManager.generateTileset场景重建纹理重复注册（textures.exists复用，消除"Texture key already in use"报错） | 2h | 无 | ✅ || T7.x.14 | 低语森林/废弃矿洞 AI 底图模式（画风统一） | 新建client/src/game/data/WildBackdropData.ts（FOREST/MINE_BACKDROP_COLLISION 30×17 mask）；MapRenderer.setInteriorBackdrop森林/矿洞自动启用interior-bg-forest/mine底图模式+renderWildBackdropCollision（mask驱动）+isWalkable改用mask；PreloadScene加载interior-bg-forest/mine；氛围NPC"风尘"(22,8)在碰撞树格→挪(20,8)；AI底图生成（Seedream 2560×1440→1920×1088）：forest.png低语森林（中央土路+树带围边+蘑菇岩石）/mine.png废弃矿洞（中央石砖通道+岩壁+矿脉矿车火把）；碰撞mask基于AI底图实际视觉重新生成（像素分类器+视觉模型标注+强制规则，两轮复核修正：森林234格/矿洞364格阻挡，含矿洞顶部封口(14-15,0)、NPC站位、出口门强制规则） | 2.5h | 无 | ✅ |