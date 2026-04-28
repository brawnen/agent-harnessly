# CLAUDE.md — agent-harnessly

## 项目定位

Harnessly 是**构建在 coding agent 之上的工程交付控制层**，不是新的 coding agent，也不是新的 agent runtime。

产品本体只有四类能力：`contract`（约束）、`workflow`（编排）、`gate`（门禁）、`evidence`（证据）。

你在这个项目中工作时，必须始终遵守 `AGENTS.md` 中的所有产品护栏约束。如有冲突，以 `AGENTS.md` 为准并回退实现。

---

## 技术栈

- **语言**：TypeScript 5.x，严格模式
- **运行时**：Node.js 22 LTS，ESM 优先
- **包管理**：pnpm monorepo（`pnpm-workspace.yaml`）
- **CLI 框架**：oclif v4
- **Schema 校验**：Zod（所有 contract / report / config 全部用 Zod schema 定义）
- **YAML 处理**：`yaml`（npm）
- **Git 操作**：`simple-git`
- **测试**：Vitest
- **构建**：tsup

---

## 项目结构

```
agent-harnessly/
├── AGENTS.md                 # 产品护栏（最高优先级约束）
├── packages/
│   ├── cli/                  # CLI 入口（oclif），只做参数解析和用户交互
│   ├── core/                 # 核心引擎，无 CLI 依赖，可独立测试
│   │   └── src/
│   │       ├── workflow/     # Workflow Engine
│   │       ├── contract/     # Contract 生成 + Gate
│   │       ├── plan/         # Plan 生成
│   │       ├── execute/      # Adapter 接口 + Prompt Assembler
│   │       ├── evidence/     # 三级 Evidence 采集（Level 1/2/3）
│   │       ├── gate/         # Gate 系统（Contract Gate + Commit Gate）
│   │       ├── report/       # Report 生成
│   │       ├── template/     # 模板系统（注册 + 匹配 + 内置模板）
│   │       ├── task/         # 任务生命周期（状态机 + 持久化）
│   │       ├── context/      # 上下文加载（全局规则 + 领域文档）
│   │       ├── config/       # 配置加载与校验
│   │       └── llm/          # LLM 调用抽象
│   ├── hosts/                # 宿主接入层（薄壳，不承载业务状态）
│   │   ├── shared/           # 宿主共享能力（manifest + shell writer）
│   │   ├── claude-code/      # Claude Code 接入
│   │   ├── codex/            # Codex 接入
│   │   └── gemini-cli/       # Gemini CLI 接入
│   └── shared/               # 共享 Zod schema + 工具函数
├── .harness/                 # repo-local 唯一事实源
│   ├── harness.config.yaml
│   ├── GLOBAL_RULES.md
│   ├── hosts/                # 宿主清单（source-of-truth）
│   ├── templates/            # 用户自定义模板
│   ├── domains/              # 领域文档
│   └── tasks/                # 任务工件
├── .claude/                  # Claude Code 薄壳（由 .harness/hosts/ 生成）
├── .codex/                   # Codex 薄壳（由 .harness/hosts/ 生成）
└── .gemini/                  # Gemini CLI 薄壳（由 .harness/hosts/ 生成）
```

---

## 关键设计文档

- **产品设计**：`docs/design/agent-harness-product-design-v2.md`
- **技术实现方案**：`docs/design/technical-implementation-plan.md`
- **评审报告**：`docs/review/technical-implementation-plan-review.md`

修改核心架构前，必须先阅读以上文档。

---

## 核心架构约束

### 产品主路径

- **Host 是默认交互主路径**：用户继续在 Claude Code 中工作，Harnessly 寄生在宿主中自动介入。
- **CLI 不是主路径**：`harness run / eval / list` 只服务于 fallback / debug / CI / headless 场景。
- **Adapter 不是主路径**：`execute/adapter.ts` 只在 headless 模式下用来调子进程执行代码。

### repo-local kernel

- **`.harness/` 是唯一事实源**：contract、plan、report、config、template 全部落在仓库内。
- **宿主配置是生成物**：`.claude/`、`.codex/`、`.gemini/` 只是从 `.harness/hosts/` 生成的薄壳，不承载真实状态。
- **严禁写入用户 home 目录**：`harness init` 和 `harness host install` 只允许写 repo 内文件。

### 三个职责角色

Planner / Generator / Evaluator 是**职责角色**，不是固定的 agent 实体。

在宿主主路径下，通过 Claude Code 的 **Sub-agent 机制** 落地：

| 角色 | 承担者 | 模型层级 |
|---|---|---|
| **Planner** | 宿主派生的 sub-agent | 轻量模型（Haiku），负责结构化填空 |
| **Generator** | 宿主主 Agent 自身 | 主力模型（Sonnet/Opus），负责代码生成 |
| **Evaluator** | 宿主派生的独立 sub-agent | 中等模型（Sonnet），负责理解检查结果 |

### 主干流程

固定为 `Contract → Plan → Execute → Verify → Commit Gate`，不允许改成复杂 DAG。

### 证据优先

"模型说完成了"永远不算完成。完成只能由验证结果、gate 结果、`report.json` 和真实工件状态支撑。

---

## 开发规范

### 代码风格

- 使用中文注释
- ESM 模块（`import/export`），不用 CommonJS
- 类型严格，不允许 `any`（除非有充分理由并注释说明）
- 所有 schema 定义集中在 `packages/shared/src/schemas/`

### 构建与测试

```bash
pnpm build        # 全量构建
pnpm test         # 全量测试
pnpm typecheck    # 类型检查
```

### 文件命名

- 文件名 `kebab-case`
- 类名 `PascalCase`
- 函数/变量 `camelCase`
- 常量 `UPPER_SNAKE_CASE`

---

## 禁止事项

1. **不要把 CLI 路径当成产品主路径**：如果你的实现只能通过用户手工运行 `harness run` 才能成立，那它只是 fallback。
2. **不要把宿主配置当 source-of-truth**：`.claude/` 只是从 `.harness/hosts/` 生成的。
3. **不要写入用户 home 目录**：`~/.claude` 全部禁止。
4. **不要做执行期细粒度 runtime 控制**：不要干扰宿主内部的工具调用过程。
5. **不要把简单问题升级成系统性重构**：第一版做可落地的交付闭环，不做无限可编排平台。
6. **不要堆 runtime 技巧**：保持机制可删减、可降级。
7. **不要声称完成但未验证**：必须通过编译和测试。
