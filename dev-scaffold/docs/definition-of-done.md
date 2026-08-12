---
AIGC:
  ContentProducer: '001191110102MAD55U9H0F10002'
  ContentPropagator: '001191110102MAD55U9H0F10002'
  Label: '1'
  ProduceID: '535dc360-32b4-4adc-b16d-ad5a68aeebc4'
  PropagateID: '535dc360-32b4-4adc-b16d-ad5a68aeebc4'
  ReservedCode1: '915431ee-d73c-4df8-a63f-527f268e17a6'
  ReservedCode2: '915431ee-d73c-4df8-a63f-527f268e17a6'
---

# 星火小镇 — Definition of Done (完成标准)

> 每个 Story/Task 必须满足以下全部条件才算完成

---

## 通用完成标准（所有Task）

1. **代码完成**：功能代码已编写，符合项目代码规范（ESLint/Prettier通过）
2. **类型安全**：TypeScript编译无错误（`tsc --noEmit` 通过）
3. **自测通过**：开发者自测功能符合预期
4. **无阻断Bug**：不存在P0/P1级别未修复Bug
5. **文档更新**：如涉及API变更或新增接口，相关文档已更新

## Story级完成标准（额外条件）

6. **集成验证**：与相关模块集成后无冲突
7. **UI/UX验收**：涉及界面的Story需在视觉和交互上符合设计规范
8. **性能达标**：不引入明显性能退化（FPS>30、对话<2s）

## Sprint级完成标准（额外条件）

9. **Sprint Review通过**：Sprint目标全部达成或经Product Owner确认降级
10. **无技术债务遗留**：或已有明确的偿还计划
11. **Retro记录**：有改进措施且纳入下Sprint计划

---

## 各模块特异标准

| 模块 | 额外完成标准 |
|------|-------------|
| 游戏引擎 | FPS稳定≥30帧，无画面闪烁/撕裂 |
| NPC对话 | 对话回复符合角色人设，响应<2s |
| 记忆系统 | 记忆可写入和检索，检索结果与情境相关 |
| 战斗系统 | 战斗可正常进入/退出，属性计算正确 |
| 任务系统 | 任务状态机流转正确，UI正确显示 |
| 部署 | 线上可访问，冒烟测试通过 |

> AI生成