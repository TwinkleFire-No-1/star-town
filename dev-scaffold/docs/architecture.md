---
AIGC:
  ContentProducer: '001191110102MAD55U9H0F10002'
  ContentPropagator: '001191110102MAD55U9H0F10002'
  Label: '1'
  ProduceID: 'dba9d1ce-3388-4781-8812-b0a1d855baf8'
  PropagateID: 'dba9d1ce-3388-4781-8812-b0a1d855baf8'
  ReservedCode1: '3313dee2-1942-4a18-816c-20c73bbeda66'
  ReservedCode2: '3313dee2-1942-4a18-816c-20c73bbeda66'
---

# 星火小镇 — 技术架构决策记录 (ADR)

> Architecture Decision Records — 记录关键技术选型与架构决策

---

## ADR-001: 前端游戏引擎选型

**状态**：已决定 | **日期**：Sprint 1

### 决策
选择 Phaser.js 3 作为2D游戏引擎

### 理由
- 成熟的2D像素游戏框架，社区生态完善
- 内置Tilemap、Sprite、动画、碰撞系统
- 支持React集成（phaser-react-ui 或 DOM overlay）
- TypeScript类型定义完善

### 替代方案
- PixiJS：更底层，需自建更多游戏逻辑
- Construct 3：可视化编辑器，不适合代码驱动开发

---

## ADR-002: AI对话架构选型

**状态**：已决定 | **日期**：Sprint 1

### 决策
采用服务端Agent架构，NPC对话逻辑全部在后端处理

### 理由
- 保护LLM API密钥安全（不暴露前端）
- 服务端可做缓存、降级、速率限制
- 便于NPC间对话的后端调度
- 记忆与关系数据在后端，无需跨端同步

### 替代方案
- 前端直连LLM API：安全性差、无法集中控制
- 混合模式：增加复杂度，收益不大

---

## ADR-003: 记忆存储方案

**状态**：已决定 | **日期**：Sprint 1

### 决策
使用 PostgreSQL + pgvector 扩展存储NPC记忆

### 理由
- 单一数据库减少运维复杂度
- pgvector 提供向量相似度搜索，满足记忆检索需求
- 与Prisma ORM兼容
- 避免引入独立的向量数据库（如Pinecone/Weaviate）

### 替代方案
- Pinecone/Weaviate：需要额外服务，MVP阶段过于重量级
- 纯文本搜索：无法做语义相似度

---

## ADR-004: 实时通信方案

**状态**：已决定 | **日期**：Sprint 1

### 决策
使用 Socket.io 作为实时通信方案

### 理由
- 自动降级（WebSocket → HTTP长轮询）
- 房间机制天然适合游戏房间
- 前后端API一致
- 成熟稳定，社区大

### 替代方案
- 原生WebSocket：需自行处理重连、房间、降级
- Falsh/Comet：已过时

---

## ADR-005: 状态管理方案

**状态**：已决定 | **日期**：Sprint 1

### 决策
前端使用 Zustand 管理游戏状态

### 理由
- 极轻量（<1KB），适合游戏高频状态更新
- 无Provider包裹，使用简单
- 支持中间件（日志、持久化）
- 与React解耦，Phaser场景也可读取

### 替代方案
- Redux Toolkit：对游戏来说过于重量级
- MobX：API不够简洁
- React Context：不适合高频更新

> AI生成