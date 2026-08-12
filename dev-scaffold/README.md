---
AIGC:
  ContentProducer: '001191110102MAD55U9H0F10002'
  ContentPropagator: '001191110102MAD55U9H0F10002'
  Label: '1'
  ProduceID: 'b9918dd9-286a-4749-885c-308940e24411'
  PropagateID: 'b9918dd9-286a-4749-885c-308940e24411'
  ReservedCode1: '9a9433f1-aa70-46e8-af24-f85b61341bbb'
  ReservedCode2: '9a9433f1-aa70-46e8-af24-f85b61341bbb'
---

# 星火小镇 — 敏捷开发总览

> 项目代号：SparkTown | 开发周期：20天 | Sprint数：4 | 团队模式：Agent驱动日开发

---

## 一、开发节奏

| 维度 | 说明 |
|------|------|
| 总工期 | 20个工作日 |
| Sprint周期 | 5天/Sprint，共4个Sprint |
| 每日模式 | Agent读取当日计划 → 执行开发 → 更新进度 → 写入明日计划 |
| 交付节奏 | 每Sprint末做Review & Retro，确认下Sprint Backlog |

## 二、Sprint规划

| Sprint | 日期(Day) | 主题 | 核心交付 |
|--------|-----------|------|----------|
| Sprint 1 | D1-D5 | 基础框架与核心原型 | 项目脚手架、Phaser地图渲染、LLM对话原型、基础数据模型 |
| Sprint 2 | D6-D10 | AI角色驱动系统 | NPC Agent循环、记忆系统、Agent编排器、角色档案 |
| Sprint 3 | D11-D15 | 游戏系统与内容 | 战斗系统、任务系统、物品经济、主线剧情脚本 |
| Sprint 4 | D16-D20 | 集成调优与发布 | 全系统集成、AI调优、性能优化、部署上线 |

## 三、文档体系

```
dev-scaffold/
├── README.md              ← 本文件：总览与使用说明
├── backlog/
│   ├── epics.md           ← Epic清单（5大Epic）
│   ├── stories.md         ← Story清单（含优先级与Story Point）
│   └── tasks.md           ← Task分解表（可直接执行的最小单元）
├── sprints/
│   ├── sprint-1.md        ← Sprint 1 计划 & 进度
│   ├── sprint-2.md        ← Sprint 2 计划 & 进度
│   ├── sprint-3.md        ← Sprint 3 计划 & 进度
│   └── sprint-4.md        ← Sprint 4 计划 & 进度
├── daily/
│   ├── day-01.md          ← 每日计划/日志（Agent每日读写此目录）
│   ├── day-02.md
│   └── ...（共20个文件）
└── docs/
    ├── architecture.md    ← 技术架构决策记录（ADR）
    ├── definition-of-done.md ← 完成标准
    └── risks.md           ← 风险追踪表
```

## 四、Agent每日工作流

```
┌─────────────────────────────────────────────────────────┐
│                  Agent 每日开发循环                      │
│                                                         │
│  1. 读取 daily/day-XX.md（今日计划）                     │
│  2. 读取进度状态（sprint & backlog 中的 ✅/⏳/❌）       │
│  3. 按优先级逐一执行今日Task                              │
│  4. 每完成一个Task → 更新 backlog/tasks.md 状态          │
│  5. 遇到阻塞 → 记录到 risks.md                          │
│  6. 日终 → 写入 daily/day-(XX+1).md（明日计划）          │
│     - 总结今日完成/未完成                                │
│     - 明日Task清单（含优先级与依赖说明）                  │
│     - 遗留问题与注意事项                                  │
└─────────────────────────────────────────────────────────┘
```

### 关键原则

1. **进度诚实**：未完成的不标 ✅，只标 ⏳（进行中）或 ❌（阻塞）
2. **计划可追溯**：每日计划必须引用对应的 Story ID 和 Task ID
3. **明日计划今日写**：确保次日Agent有明确的启动点
4. **阻塞即上报**：阻塞项写入 risks.md 并在明日计划中标注

## 五、状态标记说明

| 标记 | 含义 |
|------|------|
| ⬜ | 待开始（To Do） |
| ⏳ | 进行中（In Progress） |
| ✅ | 已完成（Done） |
| ❌ | 阻塞（Blocked） |
| 🔀 | 降级/变更（Modified） |

## 六、Sprint Review 检查点

每个Sprint最后一天（D5/D10/D15/D20）需额外完成：
- [ ] 更新 sprint-X.md 的Review记录
- [ ] 确认Definition of Done达标率
- [ ] 更新 risks.md
- [ ] 调整下Sprint的Backlog优先级

---

© 2026 SparkTown Project — 敏捷开发脚手架 v1.0

> AI生成