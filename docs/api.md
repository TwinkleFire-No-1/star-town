---
AIGC:
  ContentProducer: '001191110102MAD55U9H0F10002'
  ContentPropagator: '001191110102MAD55U9H0F10002'
  Label: '1'
  ProduceID: 'a1161bd3-3caf-4183-be1e-94e62d8611db'
  PropagateID: 'a1161bd3-3caf-4183-be1e-94e62d8611db'
  ReservedCode1: 'a9de46d9-eda8-4cb3-a1b7-de5d7abf05c0'
  ReservedCode2: 'a9de46d9-eda8-4cb3-a1b7-de5d7abf05c0'
---

# 星火小镇 — API 文档

> REST API 端点详细说明 | 共 63 个端点

---

## 通用说明

### 基础 URL

- 开发环境：`http://localhost:4000`
- 生产环境：`http://<host>/`（Nginx 反向代理）

### 响应格式

所有 API 返回 JSON 格式。成功响应格式：

```json
{ "data": ..., "message": "ok" }
```

错误响应格式：

```json
{ "error": "错误描述", "code": "ERROR_CODE" }
```

### 通用状态码

| 状态码 | 含义 |
|--------|------|
| 200 | 成功 |
| 201 | 创建成功 |
| 400 | 请求参数错误 |
| 404 | 资源不存在 |
| 500 | 服务器内部错误 |

---

## 1. 健康检查

### GET /api/health

服务健康检查。

**响应示例：**

```json
{
  "status": "ok",
  "timestamp": "2026-07-30T12:00:00.000Z",
  "uptime": 3600
}
```

---

## 2. 玩家 API

### GET /api/players

获取所有玩家列表。

**响应：** 玩家数组

### GET /api/players/:id

获取单个玩家详情（含背包、记忆、任务、关系）。

**路径参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| id | string | 玩家 ID |

### POST /api/players

创建新玩家。

**请求体：**

```json
{
  "name": "冒险者",
  "position": { "x": 400, "y": 300 }
}
```

### PATCH /api/players/:id

更新玩家属性。

**可更新字段：** name, hp, sp, position, currency

### DELETE /api/players/:id

删除玩家。

### GET /api/players/:id/inventory

获取玩家背包物品列表。

### POST /api/players/:id/inventory

向玩家背包添加物品（已存在则叠加数量）。

**请求体：**

```json
{
  "itemId": "item-uuid",
  "quantity": 1
}
```

---

## 3. NPC API

### GET /api/npcs

获取所有 NPC 列表（12 个 NPC）。

### GET /api/npcs/:id

获取单个 NPC 详情（含记忆和关系）。

### PATCH /api/npcs/:id

更新 NPC 属性。

**可更新字段：** position, direction, isActive, personality

---

## 4. 任务 API (CRUD)

### GET /api/quests

获取所有任务定义列表。

### POST /api/quests

创建新任务定义。

### PATCH /api/quests/:id

更新任务定义。

---

## 5. 物品 API

### GET /api/items

获取所有物品列表。

### POST /api/items

创建新物品定义。

### GET /api/items/category/:category

按分类获取物品。

**路径参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| category | string | 物品分类 (weapon/armor/consumable/key_item/material) |

### GET /api/items/stats

获取物品服务统计信息。

---

## 6. 物品查询 API

> 注：交易系统与背包系统已于 Day 34 移除（不再有购买/出售/使用/装备接口）。

### GET /api/items

获取全部物品定义。

### GET /api/items/category/:category

按分类获取物品定义。

### GET /api/items/stats

获取物品服务统计信息。

---

## 7. 关系 API

### GET /api/relations/player/:playerId

获取玩家的所有 NPC 关系。

### GET /api/relations/npc

获取所有 NPC 关系（优先使用关系网络缓存）。

### GET /api/relations/npc/:npcId

获取指定 NPC 的关系详情和社会指标。

### GET /api/relations/stats

获取关系网络统计信息。

### PATCH /api/relations/player/:playerId/:npcId

更新玩家-NPC 关系。

**可更新字段：** affinity, trust, reputation

---

## 8. 记忆系统 API

### NPC 记忆

#### GET /api/memories/npc/:npcId

获取 NPC 记忆列表。

**查询参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| type | string | 记忆类型筛选 |
| limit | number | 返回数量限制 |
| archived | boolean | 是否包含已归档 |

#### POST /api/memories/npc/:npcId

创建 NPC 记忆（自动处理 500 条上限归档）。

**请求体：**

```json
{
  "content": "记忆内容",
  "type": "observation",
  "importance": 5
}
```

#### GET /api/memories/npc/:npcId/search

搜索 NPC 记忆（优先向量检索，降级文本搜索）。

**查询参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| q | string | 搜索关键词 |
| limit | number | 返回数量 |

#### PATCH /api/memories/npc/:npcId/:memoryId

更新 NPC 记忆（重要性/归档/访问时间）。

#### DELETE /api/memories/npc/:npcId/:memoryId

删除 NPC 记忆。

### NPC 反思

#### POST /api/memories/npc/:npcId/reflect

触发 NPC 记忆反思（合并低重要性记忆为反思条目）。

### 玩家记忆

#### GET /api/memories/player/:playerId

获取玩家记忆列表。

#### POST /api/memories/player/:playerId

创建玩家记忆。

### 嵌入管理

#### POST /api/memories/embed/batch

批量为未嵌入记忆生成向量。

#### GET /api/memories/embed/stats

获取嵌入统计信息。

---

## 9. LLM 服务 API

### POST /api/llm/chat

非流式 LLM 聊天请求。

**请求体：**

```json
{
  "messages": [
    { "role": "system", "content": "..." },
    { "role": "user", "content": "..." }
  ],
  "model": "gpt-4o-mini",
  "temperature": 0.7
}
```

### POST /api/llm/chat/stream

流式 LLM 聊天请求（SSE）。

**请求体：** 同上

**响应：** Server-Sent Events 流

### POST /api/llm/embed

文本嵌入请求。

**请求体：**

```json
{
  "text": "需要嵌入的文本",
  "model": "text-embedding-3-small"
}
```

### GET /api/llm/health

LLM 服务健康检查。

### GET /api/llm/usage

LLM 使用统计（Token 用量、请求次数）。

### GET /api/llm/routes

获取模型路由表。

### POST /api/llm/routes/health

模型健康检查。

### PUT /api/llm/routes/availability

设置模型可用性。

### GET /api/llm/fallback/stats

降级策略统计。

### GET /api/llm/rate-limit/stats

速率限制统计。

### GET /api/llm/cache/stats

LLM 缓存统计。

### PUT /api/llm/cache/config

更新缓存配置。

### POST /api/llm/cache/warmup

预热缓存。

### GET /api/llm/latency/stats

延迟优化统计。

### GET /api/llm/scheduler/stats

NPC 调度器统计。

---

## 10. 任务引擎 API

### GET /api/quest/definitions

获取所有任务定义。

### GET /api/quest/definitions/:id

获取单个任务定义。

### GET /api/quest/player/:playerId

获取玩家所有任务进度。

### GET /api/quest/player/:playerId/available

获取玩家可接受的任务。

### POST /api/quest/player/:playerId/accept/:questId

接受任务。

### POST /api/quest/player/:playerId/abandon/:questId

放弃任务。

### POST /api/quest/player/:playerId/progress/:questId/:objectiveId

更新任务目标进度。

**请求体：**

```json
{
  "increment": 1
}
```

### POST /api/quest/player/:playerId/complete/:questId

完成任务。

### POST /api/quest/discover/:playerId

手动触发任务发现。

### POST /api/quest/trigger/npc-talk

触发 NPC 对话事件（推进任务）。

**请求体：**

```json
{
  "playerId": "player-uuid",
  "npcId": "npc-uuid"
}
```

### POST /api/quest/trigger/area-enter

触发区域进入事件。

**请求体：**

```json
{
  "playerId": "player-uuid",
  "areaId": "tavern"
}
```

### GET /api/quest/stats

任务引擎统计。

---

## 11. 战斗系统 API

### POST /api/battle/create

创建战斗。

**请求体：**

```json
{
  "playerId": "player-uuid",
  "enemyIds": ["enemy-type-1", "enemy-type-2"],
  "npcAllyIds": ["npc-uuid-1"]
}
```

### GET /api/battle/:battleId

获取战斗状态。

### POST /api/battle/:battleId/action

执行玩家行动。

**请求体：**

```json
{
  "type": "attack",
  "targetId": "enemy-uuid",
  "skillId": "skill-uuid"
}
```

### POST /api/battle/:battleId/pause

暂停/恢复战斗。

**请求体：**

```json
{
  "paused": true
}
```

### GET /api/battle/:battleId/result

获取战斗结果。

### POST /api/battle/:battleId/end

结束战斗。

### GET /api/battle/stats

战斗引擎统计。

---

## 12. 集成测试 API

### POST /api/integration/integration-test/:playerId

运行全链路联调测试。

### POST /api/integration/trigger-scene

触发剧情场景。

**请求体：**

```json
{
  "chapterId": "chapter-1",
  "sceneId": "scene-1"
}
```

### GET /api/integration/story-progress/:playerId

获取玩家剧情进度。

### GET /api/integration/chapters

获取章节信息。

### GET /api/integration/story-walkthrough

运行主线走查。

### GET /api/integration/consistency-check

运行数据一致性检查。

### POST /api/integration/consistency-fix

修复数据不一致。

### GET /api/integration/edge-case-test

运行边界情况测试。

### POST /api/integration/reconnect/:socketId

模拟断线重连。

### POST /api/integration/safe-operation

并发安全操作（安全接受任务）。

### GET /api/integration/full-test

一键运行全部联调测试。

---

## WebSocket 事件 (Socket.IO)

连接地址：`ws://localhost:4000/socket.io/`

### 客户端 → 服务器

| 事件 | 数据 | 说明 |
|------|------|------|
| `player:move` | `{ x, y, direction }` | 玩家移动 |
| `interaction:trigger` | `{ npcId }` | 触发 NPC 交互 |
| `chat:message` | `{ npcId, message }` | 发送聊天消息 |
| `player:ready` | `{ playerId }` | 玩家就绪 |

### 服务器 → 客户端

| 事件 | 数据 | 说明 |
|------|------|------|
| `npc:position` | `{ npcId, x, y, direction }` | NPC 位置更新 |
| `chat:response` | `{ npcId, message, streamed }` | NPC 对话响应（支持流式） |
| `quest:update` | `{ questId, status, progress }` | 任务状态更新 |
| `game:time` | `{ day, hour, minute, period }` | 游戏时间更新 |
| `battle:update` | `{ battleId, state }` | 战斗状态更新 |
| `story:scene` | `{ chapterId, sceneId, dialogue }` | 剧情场景触发 |

---

> AI生成