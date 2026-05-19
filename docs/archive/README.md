# 历史文档归档

## 归档原则

以下文档均来自 v1 / v2 / v3 设计阶段，已被 **v3-core** 替代。归档目的：

- **保留历史决策过程**，供追溯"为什么 v3-core 长这样"
- **防止新接触者按旧文档理解产品**，避免误解

当前事实源只在：

- `docs/spec/v3-core.md`（英文规范）
- `docs/spec/v3-core.zh-CN.md`（中文规范）
- `docs/design/agent-harness-product-design-v3-core.md`（产品设计）
- `AGENTS.md`（产品护栏）
- `CLAUDE.md`（开发约束）

---

## archive/design/ — 迭代过程

| 文档 | 时期 | 说明 |
|---|---|---|
| `agent-harness-design.docx` / `_1.docx` | v1 | 最初两份产品设想，后被 v2 推翻 |
| `agent-harness-product-design-v2.md` | v2 | "交付控制层"定位首次落地；主干流程、repo-local kernel、证据优先三大原则确立 |
| `agent-harness-product-design-v3.md` | v3 | "Agent 工程作战系统"完整版，含七角色/七阶段，后被 v3-core 精简替代 |
| `technical-implementation-plan.md` | v2 | 基于 v2 的技术方案，TypeScript 选型依据 |
| `implementation-todolist.md` | V1 | V1 施工清单，P0/P1 边界划分记录 |
| `intake-trigger-design.md` | v2 | 讨论稿，从"意图分析"到"显式状态"的触发机制重设计，未落地 |
| `product-goal-alignment.md` | v2 | 产品目标与实现状态对照表，阶段性自检快照 |

## archive/review/ — 阶段性评审

| 文档 | 时期 | 说明 |
|---|---|---|
| `v2-review-and-risk-solutions.md` | v2 | v2 方案评审 + 四个工程风险解决方案 |
| `technical-implementation-plan-review.md` | v2 | 技术实现方案评审，首次提出 Sub-agent 机制作为角色落地方案 |
| `host-integration-architecture-review.md` | v2 | Host Integration 架构评审，确认"寄生"方向 |
| `global-rules-skills-repo-harness-asset-inventory.md` | v2 | 全局规则/Skills/repo harness 资产盘点，v3-core 已覆盖 |

## archive/trial/ — 试用期

| 文档 | 时期 | 说明 |
|---|---|---|
| `trial-guide.md` | v2 | 试用说明书，路径区分文档 |
| `real-project-trial-checklist.md` | v2 | 真实项目试用 checklist |
| `v3-walkthrough.md` | v3 | v3 七角色版本的端到端 walkthrough，暴露了 17 个漏洞，直接驱动 v3-core 精简到五角色/六阶段 |
