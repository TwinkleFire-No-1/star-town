---
AIGC:
  ContentProducer: '001191110102MAD55U9H0F10002'
  ContentPropagator: '001191110102MAD55U9H0F10002'
  Label: '1'
  ProduceID: '07cbcee7-2fc3-40cd-8c0c-839410a80631'
  PropagateID: '07cbcee7-2fc3-40cd-8c0c-839410a80631'
  ReservedCode1: 'f4d02f2a-2bf3-4e77-9c89-c36dfb841922'
  ReservedCode2: 'f4d02f2a-2bf3-4e77-9c89-c36dfb841922'
---

# 星火小镇 (Star Town)

> AI 驱动的像素风 RPG 游戏 — 西方奇幻世界，每个 NPC 可接入大模型实现智能交互

---

## 游戏简介

你是一名在星火小镇边缘苏醒的旅行者，失去了大部分记忆。铁匠老巴克发现了你，将你带回了小镇。在这座看似宁静的小镇之下，封印着一个古老的存在——堕落精灵法师阿拉密斯。暗影组织正试图打破封印，而你必须在五天的旅途中揭开真相、结交盟友、面对抉择，最终决定这个世界的命运。

**每一个 NPC 都有自己的故事、秘密和日程表。你与他们的每一次对话，都可能改变剧情走向。**

除了 5 章固定主线外，游戏采用斯坦福小镇式**关系驱动剧情**：大模型根据 NPC 之间的人物关系网自动生成联系与冲突，作为持续涌现的主线任务，让每次游玩都有不同的故事。

---

## 游戏特色

| 特性 | 说明 |
|------|------|
| **AI NPC 对话** | 12 个真实 NPC + 10 个氛围 NPC，独立人设，支持自然语言对话，具备感知-思考-行动循环 |
| **记忆系统** | NPC 拥有记忆流与向量检索，能记住交互历史并影响后续行为 |
| **5 章主线剧情** | 从序章到终章的完整剧情链，含 3 种结局分支 |
| **关系驱动主线** | 斯坦福小镇式人物关系网，大模型自动生成 NPC 间联系与冲突，动态产出主线任务 |
| **时间驱动任务弹窗** | 主线任务按游戏时间弹出（现实 5 分钟冷却），可接受/拒绝，体验流畅不打断 |
| **RTwP 战斗** | 实时暂停战术战斗，BOSS 三阶段 AI，4 个 NPC 队友可加入，5 种敌人 AI 模式 |
| **升级打怪** | 击杀敌人获得经验、自动升级，属性成长实时生效，等级门槛解锁后续主线 |
| **物品经济** | 物品定义与经济平衡数据，剧情奖励发放关键物品，战斗结算发放星币（交易/背包系统已下线） |
| **好感度系统** | 5 级好感度 + 9 种好感事件，影响对话态度与剧情走向 |
| **声望系统** | 区域声望解锁访问权限，影响 NPC 行为 |
| **任务系统** | 主线 + 支线 + 涌现任务，6 种状态完整生命周期 |
| **昼夜循环** | 30 分钟现实 = 1 游戏日，NPC 有日常日程表并按时移动 |
| **天气系统** | 6 种天气（晴天/多云/小雨/雷雨/飘雪/浓雾），粒子效果 + 场景滤镜，NPC 感知天气 |
| **NPC 社交网络** | NPC 之间自主对话、信息传播、关系自动调整 |
| **涌现叙事** | 7 场景涌现规则 + 5 传播机制 + 7 任务生成模板，动态生成支线剧情 |
| **原生高清画面** | 原生 1920×1080 分辨率、64px 瓦片，内外场景分辨率统一无模糊 |
| **AI 美术资源** | 256×192 高清 NPC 立绘 + 64px 像素精灵 + 高清场景原画，无程序化占位回退 |

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React 19 + Phaser 3 + Zustand + Vite 6 |
| 后端 | Express 5 + Socket.IO + Prisma ORM |
| 数据库 | PostgreSQL 16 (pgvector) + Redis 7 |
| AI | OpenAI 兼容 API（对话 + Embedding），支持 DeepSeek / SiliconFlow 等 |
| 语言 | TypeScript 5.7（严格模式） |
| 部署 | Docker + Nginx + GitHub Actions CI/CD |

---

## 项目结构

```
star-town/
├── client/                 # 前端 (React + Phaser)
│   ├── src/
│   │   ├── game/           #   游戏引擎 (场景/地图/精灵/系统)
│   │   ├── components/     #   React 组件 (对话/背包/任务/战斗UI)
│   │   ├── stores/         #   Zustand 状态管理
│   │   ├── services/       #   WebSocket / 剧情解锁 / 位置同步
│   │   └── assets/         #   瓦片集 / 精灵 / 地图数据
│   ├── public/assets/      #   AI 生成美术资源 (立绘/精灵/UI)
│   ├── Dockerfile           #   前端容器化 (多阶段 + Nginx)
│   ├── nginx.conf           #   容器内 Nginx 配置 (API/WebSocket 反代)
│   └── vite.config.ts       #   Vite 配置 (开发代理)
├── server/                 # 后端 (Express + Socket.IO)
│   ├── prisma/             #   数据库 Schema + 3 次迁移 + 种子数据
│   ├── data/               #   NPC 角色 JSON 档案 (核心/次要/剧情)
│   ├── src/
│   │   ├── routes/         #   REST API 路由 (90+ 端点，10 个路由模块)
│   │   ├── services/       #   核心服务 (Agent/记忆/LLM/战斗/任务/剧情/天气...)
│   │   ├── socket/         #   WebSocket 事件处理
│   │   └── config/         #   环境变量配置 (含 CORS)
│   ├── Dockerfile           #   后端容器化 (多阶段 + Prisma 迁移)
│   └── docker-entrypoint.sh #   容器启动脚本 (迁移→种子→启动)
├── deploy/nginx/           # 生产 Nginx 配置 (HTTPS/安全头/限流)
├── scripts/                #   数据库初始化 + 生产验证脚本
├── dev-scaffold/           #   敏捷开发脚手架 (31 天日志/进度/任务)
├── .github/workflows/      #   CI/CD 流水线
├── docker-compose.yml      #   开发(基础设施) + 生产(全容器)
└── docs/                   #   API文档 + 部署运维 + 玩法说明 + UI规范
```

---

## 前置要求

- **Node.js** >= 20
- **Docker** & **Docker Compose**（用于 PostgreSQL + Redis，生产模式还需构建镜像）
- 一个 **OpenAI 兼容 API** 密钥（如 DeepSeek、SiliconFlow、OpenAI 等）

---

## 快速启动（开发模式）

### 方式一：一键脚本（推荐新手）

```bash
git clone <repo-url> && cd star-town
chmod +x scripts/db-setup.sh && ./scripts/db-setup.sh
# 脚本自动完成：启动 Docker → 创建数据库 → 迁移 → 种子数据

# 然后分别启动后端和前端：
cd server && npm run dev     # 终端1
cd client && npm run dev     # 终端2
```

### 方式二：手动步骤

#### 第 1 步：启动基础设施

```bash
docker compose up -d
```

这会启动：
- **PostgreSQL** (pgvector) — `localhost:5432`，用户 `sparktown`，密码 `sparktown_dev`
- **Redis** — `localhost:6379`

确认容器正常运行：

```bash
docker ps
```

应看到 `star-town-db` 和 `star-town-redis` 两个容器状态为 `Up`。

#### 第 2 步：创建影子数据库并启用 pgvector 扩展

Prisma 的 `migrate dev` 命令需要一个影子数据库（shadow database）来验证迁移。这个影子数据库也必须安装 pgvector 扩展，否则迁移会失败。

依次执行：

```bash
# 创建影子数据库
docker exec star-town-db psql -U sparktown -c "CREATE DATABASE sparktown_shadow;"

# 在主数据库中启用 pgvector 扩展
docker exec star-town-db psql -U sparktown -d sparktown -c "CREATE EXTENSION IF NOT EXISTS vector;"

# 在影子数据库中也启用 pgvector 扩展
docker exec star-town-db psql -U sparktown -d sparktown_shadow -c "CREATE EXTENSION IF NOT EXISTS vector;"
```

三条命令都应输出 `CREATE DATABASE` 或 `CREATE EXTENSION` 表示成功。

#### 第 3 步：配置环境变量

```bash
cp .env.example .env
```

编辑 `.env`，**必须修改** LLM API 相关配置：

```env
# LLM API — 必须填入你自己的密钥
LLM_API_BASE="https://api.siliconflow.cn/v1"        # 替换为你的 API 端点
LLM_API_KEY="sk-your-api-key-here"                  # 替换为你的 API 密钥
LLM_MODEL="deepseek-ai/DeepSeek-V4-Flash"           # 对话模型
LLM_EMBED_MODEL="Qwen/Qwen3-Embedding-0.6B"          # 嵌入模型
```

以下配置默认值即可，无需修改：

```env
DATABASE_URL="postgresql://sparktown:sparktown_dev@localhost:5432/sparktown?schema=public"
SHADOW_DATABASE_URL="postgresql://sparktown:sparktown_dev@localhost:5432/sparktown_shadow?schema=public"
REDIS_URL="redis://localhost:6379"
PORT=4000
GAME_TIME_SCALE=48
MAX_ONLINE_PLAYERS=100
```

#### 第 4 步：初始化数据库

```bash
cd server
npm install
npm run db:generate    # 生成 Prisma Client
npm run db:migrate     # 运行数据库迁移（建表）
npm run db:seed        # 写入种子数据（12 个 NPC + 物品 + 任务 + 关系）
```

> 也可使用一键脚本：`chmod +x scripts/db-setup.sh && ./scripts/db-setup.sh`

#### 第 5 步：启动后端

新开一个终端：

```bash
cd server
npm install
npm run dev
```

看到以下输出表示成功：

```
[Star Town Server] running on http://localhost:4000
[Star Town Server] WebSocket ready on ws://localhost:4000
[Star Town Server] NPC profiles loaded
[Star Town Server] GameClock started: Day 1, 08:00, period=morning
[Star Town Server] QuestEngine initialized
[Star Town Server] StoryProgressionManager initialized
[Star Town Server] MainlineQuestService initialized
[Star Town Server] WeatherService initialized: 晴天
[Star Town Server] NPC Scheduler started
```

#### 第 6 步：启动前端

再开一个终端：

```bash
cd client
npm install
npm run dev
```

浏览器访问 **http://localhost:3000** 即可进入游戏。

> 前端所有 API 请求均使用同源相对路径（`/api`、`/socket.io`）：开发环境由 Vite 代理到 4000 端口，生产环境由 Nginx 反向代理，无需修改任何前端配置。

#### 第 7 步：验证

```bash
# 后端健康检查
curl http://localhost:4000/api/health
# 期望: {"status":"ok","service":"star-town-server","timestamp":"...","uptime":...}

# NPC 数据检查（应返回 12 个）
curl http://localhost:4000/api/npcs

# 任务面板数据
curl http://localhost:4000/api/quest/player/default-player

# 天气接口
curl http://localhost:4000/api/weather
# 期望: {"data":{"type":"sunny","name":"晴天","icon":"☀️","description":"..."}}

# 主线任务状态
curl http://localhost:4000/api/quest/player/default-player
```

---

## 系统架构

```
┌─────────────────────────────────────────────────────────┐
│                    浏览器 (Player)                        │
│          React 19 + Phaser 3 + Zustand                   │
└──────────────────────┬──────────────────────────────────┘
                       │ HTTP / WebSocket（同源 /api、/socket.io）
┌──────────────────────▼──────────────────────────────────┐
│               Nginx (反向代理)                            │
│         静态资源 / API代理 / WebSocket / SPA路由          │
└────────┬─────────────────────────────┬──────────────────┘
         │                             │
┌────────▼────────┐          ┌─────────▼──────────────────┐
│   client 容器    │          │     server 容器             │
│  (React 静态资源) │          │  Express 5 + Socket.IO     │
└─────────────────┘          │                            │
                             │  ┌─ Agent Loop ──────────┐ │
                             │  │ 感知 → 思考 → 行动      │ │
                             │  │ 记忆更新 → 反思生成     │ │
                             │  └───────────────────────┘ │
                             │  ┌─ 游戏系统 ────────────┐ │
                             │  │ 战斗/任务/物品/升级     │ │
                             │  │ 好感/声望/天气/剧情    │ │
                             │  │ 关系网络/涌现叙事      │ │
                             │  └───────────────────────┘ │
                             └──────┬──────────┬──────────┘
                                    │          │
                     ┌──────────────▼──┐  ┌───▼──────────┐
                     │  PostgreSQL 16   │  │   Redis 7    │
                     │  (pgvector)      │  │  (会话/缓存) │
                     └─────────────────┘  └──────────────┘
```

---

## 核心系统一览

| 系统 | 关键文件 | 说明 |
|------|----------|------|
| Agent 循环 | `server/src/services/agentLoop.ts` | 感知→思考→行动→记忆更新完整循环 |
| LLM 服务 | `server/src/services/llmService.ts` | 模型路由、降级策略、速率限制、缓存 |
| 模型路由 | `server/src/services/modelRouter.ts` | 对话/嵌入模型多路路由 |
| 记忆系统 | `server/src/services/memoryStream.ts` | 记忆流 + 向量嵌入 + 反思生成 + 容量管理 |
| 检索重排 | `server/src/services/retrievalRankService.ts` | 记忆检索相关度重排 |
| NPC 调度 | `server/src/services/npcScheduler.ts` | 分级更新策略、并发控制、性能采样 |
| 感知/思考/行动 | `perceiveModule.ts` / `thinkModule.ts` / `actModule.ts` | Agent 三模块解耦 |
| 对话引擎 | `server/src/services/npcDialogueFlow.ts` | 流式对话 + 打字机 + 上下文管理 |
| 战斗引擎 | `server/src/services/battleEngine.ts` | RTwP 战斗 + 5 种敌人 AI + BOSS 三阶段 |
| 升级系统 | `server/src/services/levelSystem.ts` | 经验结算、自动升级、属性成长 |
| 任务引擎 | `server/src/services/questEngine.ts` | 5 种任务类型 + 6 种状态 + 完整生命周期 |
| 主线服务 | `server/src/services/mainlineQuestService.ts` | 时间驱动主线 + 关系驱动冲突生成（斯坦福小镇式） |
| 剧情管理 | `server/src/services/storyProgressionManager.ts` | 5 章脚本（序章+1~3章+终章）+ 结局分支 |
| 剧情解锁 | `server/src/services/storyUnlockService.ts` | 章节推进 → 场景/NPC 渐进解锁 |
| 涌现叙事 | `emergentNarrativeRules.ts` / `emergentQuestGenerator.ts` | 7 场景规则 + 5 传播机制 + 7 任务模板 |
| 物品经济 | `server/src/services/itemService.ts` | 物品定义管理 + 经济平衡（交易/背包已下线） |
| 关系网络 | `server/src/services/relationNetwork.ts` | 好感度 + 声望 + NPC 社交网络 |
| 游戏时钟 | `server/src/services/gameClock.ts` | 昼夜循环 + 时间事件触发 |
| NPC 移动 | `server/src/services/npcMovementDriver.ts` | 日程/剧情驱动的 NPC 移动广播 |
| 天气系统 | `server/src/services/weatherService.ts` | 6 种天气 + 场景滤镜 + NPC 感知 |
| 氛围 NPC | `server/src/services/ambientNpcService.ts` | 城镇路人/室内氛围 NPC 定义与漫游 |
| 档案加载 | `server/src/services/profileLoader.ts` | JSON + 数据库档案合并加载 |
| 边界处理 | `server/src/services/edgeCaseHandler.ts` | 异常输入/边界情况兜底 |
| 会话管理 | `server/src/services/redisSession.ts` | Redis 会话（降级为内存） |

---

## 生产部署（Docker 全容器）

### 方式零：统一部署脚本（推荐）

一个脚本覆盖日常更新与全新部署两种场景：

```bash
# 重启/更新部署（默认）：保留数据库与 Redis 数据，重新构建镜像并重启服务
./deploy/deploy.sh restart

# 从头部署：清空全部容器与数据卷（数据库/Redis 数据会丢失）后全新部署
./deploy/deploy.sh fresh

# 可选环境变量
# NPM_REGISTRY=https://registry.npmjs.org ./deploy/deploy.sh restart   # 指定 npm 镜像
# SKIP_BUILD=1 ./deploy/deploy.sh restart                              # 跳过构建（已有镜像）
# SKIP_VERIFY=1 ./deploy/deploy.sh restart                             # 跳过 HTTP 验证
```

> `deploy.sh` 是对 `deploy/deploy-first-time.sh` 的轻量封装：
> restart 对应 `RESET=0`（保留数据），fresh 对应 `RESET=1`（清空重建）。
> 首次部署前请先配置 `.env`（`cp .env.example .env` 并填写 `LLM_API_KEY`）。

### 方式一：一键部署脚本（全新环境）

```bash
# 新环境首次部署：自动检查环境、准备 .env、构建镜像、启动全部服务并验证
./deploy/deploy-first-time.sh

# 从零启动（清空数据库/Redis 数据卷后全新部署）：也可用精简封装
./scripts/start-from-scratch.sh
# 或 RESET=1 ./deploy/deploy-first-time.sh

# 可选参数
# NPM_REGISTRY=https://registry.npmjs.org ./deploy/deploy-first-time.sh   # 指定 npm 镜像
# SKIP_BUILD=1 ./deploy/deploy-first-time.sh                              # 跳过构建（已有镜像）
# SKIP_VERIFY=1 ./deploy/deploy-first-time.sh                             # 跳过 HTTP 验证
# RESET=1 ./deploy/deploy-first-time.sh                                   # 先 down -v 清空数据卷再部署
```

> 脚本特性：自动探测 Docker CLI（兼容 Docker Desktop / OrbStack / 服务器版）、
> 自动从 `.env.example` 生成 `.env`、校验 `LLM_API_KEY`、清理旧版手动部署遗留容器、
> 消除 shell 环境变量对 compose 的干扰（避免端口冲突）、等待全部容器健康并做 HTTP 验证。

### 方式二：Docker Compose 手动部署

```bash
# 1. 配置环境变量
cp .env.example .env
# 编辑 .env 填入 LLM_API_KEY 等敏感配置

# 2. 构建并启动所有服务（PostgreSQL + Redis + 后端 + 前端）
docker compose --profile production up -d --build

# 国内网络可指定 npm 镜像加速构建：
# docker compose --profile production build --build-arg NPM_REGISTRY=https://registry.npmmirror.com
# docker compose --profile production up -d

# 3. 验证服务
curl http://localhost/api/health        # 后端健康检查（经 Nginx 反代）
curl http://localhost/api/npcs          # NPC 数据
# 浏览器访问 http://localhost 即可进入游戏

# 4. 查看日志
docker compose --profile production logs -f

# 5. 停止（保留数据）
docker compose --profile production down

# 完全重置（删除数据库数据卷）
docker compose --profile production down -v
```

### 端口与数据说明

| 服务 | 容器端口 | 宿主机映射 | 说明 |
|------|---------|-----------|------|
| Nginx (前端) | 80 | `${CLIENT_PORT:-80}` | 静态资源 + API/WebSocket 反代 |
| 后端 | 4000 | `${SERVER_PORT:-4000}` | REST + Socket.IO（可选暴露） |
| PostgreSQL | 5432 | 5432 | 数据卷 `pgdata` 持久化 |
| Redis | 6379 | 6379 | 数据卷 `redisdata` 持久化 |

> 生产模式下浏览器直接访问 `http://localhost`（80 端口），前端通过 Nginx 同源代理请求 `/api` 与 `/socket.io`，**不存在跨域问题**，也无需修改前端代码中的服务地址。

### 后端容器启动流程

`docker-entrypoint.sh` 自动完成：
1. 等待数据库就绪
2. `prisma migrate deploy` 应用所有迁移
3. `prisma/seed.ts` 幂等写入种子数据（已存在则跳过）
4. 启动 `node dist/index.js`

### 自定义构建

```bash
# 指定 npm 镜像（海外服务器用官方源，国内用淘宝镜像）
docker compose build --build-arg NPM_REGISTRY=https://registry.npmjs.org

# 修改宿主机端口
SERVER_PORT=4001 CLIENT_PORT=8080 docker compose --profile production up -d
```

### CI/CD 自动部署

项目已配置 GitHub Actions 流水线（`.github/workflows/ci-cd.yml`）：

- **push 到 main/develop** → 自动构建前端+后端 + TypeScript 类型检查
- **打 tag `v*`** → 自动构建 Docker 镜像 → 推送 GHCR → SSH 部署到生产

需要在 GitHub 仓库中配置以下 Secrets：

| Secret | 说明 |
|--------|------|
| `DEPLOY_HOST` | 生产服务器 IP/域名 |
| `DEPLOY_USER` | SSH 用户名 |
| `DEPLOY_SSH_KEY` | SSH 私钥 |
| `DEPLOY_PATH` | 部署目录路径 |

### 生产环境验证

```bash
chmod +x scripts/verify-production.sh
./scripts/verify-production.sh
```

---

## 环境变量参考

| 变量 | 必填 | 默认值 | 说明 |
|------|------|--------|------|
| `DATABASE_URL` | 是 | — | PostgreSQL 连接字符串 |
| `SHADOW_DATABASE_URL` | 是 | — | Prisma 影子数据库（迁移用） |
| `REDIS_URL` | 否 | `redis://localhost:6379` | Redis 连接字符串（降级为内存） |
| `PORT` | 否 | `4000` | 后端服务端口 |
| `LLM_API_BASE` | 是 | — | OpenAI 兼容 API 端点 |
| `LLM_API_KEY` | 是 | — | API 密钥 |
| `LLM_MODEL` | 否 | `deepseek-ai/DeepSeek-V4-Flash` | 对话模型 |
| `LLM_EMBED_MODEL` | 否 | `Qwen/Qwen3-Embedding-0.6B` | 嵌入模型 |
| `GAME_TIME_SCALE` | 否 | `48` | 游戏时间倍速 |
| `MAX_ONLINE_PLAYERS` | 否 | `100` | 最大在线玩家数 |
| `CORS_ORIGINS` | 否 | localhost 系列 | 允许的跨域来源（逗号分隔） |
| `SERVER_PORT` | 否 | `4000` | Docker 宿主机映射的后端端口 |
| `CLIENT_PORT` | 否 | `80` | Docker 宿主机映射的前端端口 |
| `NPM_REGISTRY` | 否 | 按 Dockerfile | 构建镜像时的 npm 镜像源 |

---

## 其他命令

```bash
# 后端生产构建
cd server && npm run build && npm run start

# 前端生产构建
cd client && npm run build && npm run preview

# 代码检查
cd server && npm run lint
cd client && npm run lint

# 重置数据库（清空所有数据，重新迁移 + 种子）
cd server && npx prisma migrate reset --force && npm run db:seed
```

---

## 常见问题

**Q: `prisma migrate dev` 报错 "extension pgvector is not available"？**

影子数据库没有安装 pgvector 扩展。请确保执行了第 2 步中的三条 `docker exec` 命令，并且 `.env` 中配置了 `SHADOW_DATABASE_URL`。

**Q: Docker 启动后 PostgreSQL 还没就绪就报错？**

`docker compose up -d` 后等几秒再执行后续命令，或使用 `./scripts/db-setup.sh`（脚本会自动等待 PG 就绪）。生产模式下 server 容器通过 `depends_on: condition: service_healthy` 等待数据库健康后再启动。

**Q: Redis 连接失败？**

后端会自动降级为内存会话管理，不影响基本功能运行。如需 Redis 功能，确认 `docker compose up -d` 后 Redis 容器正常运行。

**Q: 生产部署后游戏页面打不开/API 404？**

确认访问的是 `http://localhost`（80 端口，Nginx），而不是 `http://localhost:4000`（后端无前端页面）。前端 API 已统一为同源相对路径，由 Nginx 反代到后端。

**Q: LLM API 不可用？**

NPC 对话功能需要有效的 LLM API 密钥。如果密钥无效，游戏仍可运行，但与 NPC 对话会返回错误。可使用任何 OpenAI 兼容端点（如 DeepSeek、SiliconFlow、通义千问等），只需修改 `LLM_API_BASE` 和 `LLM_API_KEY`。

**Q: 如何完全重置环境？**

```bash
# 开发模式
docker compose down -v
docker compose up -d
docker exec star-town-db psql -U sparktown -c "CREATE DATABASE sparktown_shadow;"
docker exec star-town-db psql -U sparktown -d sparktown -c "CREATE EXTENSION IF NOT EXISTS vector;"
docker exec star-town-db psql -U sparktown -d sparktown_shadow -c "CREATE EXTENSION IF NOT EXISTS vector;"
cd server && npm run db:migrate && npm run db:seed

# 生产模式（全部重建）
docker compose --profile production down -v
docker compose --profile production up -d --build
```

---

## 文档索引

| 文档 | 路径 | 说明 |
|------|------|------|
| 玩法说明 | `docs/gameplay.md` | 完整游戏手册：操控、NPC、剧情、系统 |
| API 文档 | `docs/api.md` | REST API 端点详细说明 |
| 部署运维文档 | `docs/deployment.md` | 生产环境部署、监控、备份、故障排查 |
| UI 重设计规范 | `docs/ui-redesign-spec.md` | 星露谷风格 UI 设计规范 |
| 开发日志 | `dev-scaffold/daily/` | 31 天敏捷开发日志与进度 |

> AI生成