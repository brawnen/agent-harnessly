# Harnessly

> **构建在 coding agent 之上的工程交付控制层。**
> 不是新的 coding agent，也不是新的 runtime——而是把"模型说完成"翻译成"系统能验证完成"。

[![Status](https://img.shields.io/badge/status-alpha-orange)]()
[![Node](https://img.shields.io/badge/node-%3E%3D22-339933)]()
[![License](https://img.shields.io/badge/license-TBD-lightgrey)]()

---

## 1. Harnessly 是什么

主流 AI Coding 工具（Claude Code、Codex、Gemini CLI 等）解决的是**"会写代码"**的问题。
Harnessly 解决的是它们仍然解决不了的另一件事：

> **怎么知道这次 AI 真的把活干完了，而不只是说"我搞定了"？**

Harnessly 通过四类基础能力，把 AI 的产出约束在可验证、可审计、可回滚的交付闭环里：

| 能力          | 作用                                                  |
| ----------- | --------------------------------------------------- |
| `Contract`  | 任务前先签合同：范围、可验收点、敏感边界                                |
| `Workflow`  | 固定主干流程：`Contract → Plan → Execute → Verify → Commit` |
| `Gate`      | 关键节点强制门禁：未通过不得提交                                    |
| `Evidence`  | 三级证据采集：所有"完成"必须有可查工件                                |

---

## 2. 它要解决的具体问题

| 现状痛点                  | Harnessly 的应对                                    |
| --------------------- | ------------------------------------------------ |
| 模型自述"已完成"但实际跑不通       | Commit Gate + `report.json`，无证据不许提交              |
| 需求口语化、跑偏              | SPEC 阶段先输出 contract，列可验收点                        |
| 跨人 / 跨会话交付质量参差        | repo-local kernel + 固定主干流程                       |
| 缺审计追溯，复盘困难            | 每个任务沉淀 `contract / plan / review / report` 全套工件 |
| 多宿主切换（Claude/Codex）成本 | 同一份 `.harness/` 在所有宿主中生效，宿主配置只是薄壳               |

> Harnessly **不会让模型变聪明**，但它能把 AI Coding 的下限从"看运气"抬到"有契约"。

---

## 3. 设计原则

- **宿主优先（Host-First）**：用户继续在 Claude Code / Codex 中工作，Harnessly 在宿主内寄生式自动介入。CLI 仅作 fallback / CI / headless 使用。
- **Repo-Local Kernel**：所有事实源都在 `.harness/` 仓库目录内。`.claude/`、`.codex/` 只是从 `.harness/hosts/` 生成的薄壳。
- **证据优先**：完成判定的唯一依据是 Gate 状态与 `report.json`，不接受 agent 自述。
- **低频干预**：只在 `SessionStart` / `UserPromptSubmit` / `Stop` 三个节点介入，绝不干扰宿主的工具调用过程。
- **可降级、可删减**：模型越强，控制层越要瘦——每个机制都要随时可关掉。

---

## 4. 架构总览

```
                    ┌──────────────────────────────┐
                    │  Host (Claude Code / Codex)  │  ← 用户的主交互入口
                    └──────────────┬───────────────┘
                                   │ hook / command bridge
                    ┌──────────────▼───────────────┐
                    │   .harness/  (唯一事实源)      │
                    │   ├── contract / plan        │
                    │   ├── review / report        │
                    │   ├── agents/  (sub-agent)   │
                    │   └── hosts/   (宿主清单)     │
                    └──────────────┬───────────────┘
                                   │ 生成
                  ┌────────┬───────┴────────┬──────────┐
                  ▼        ▼                ▼          ▼
              .claude/   .codex/        .gemini/   (其它宿主)
                                                    薄壳
```

仓库结构：

```
agent-harnessly/
├── AGENTS.md                 # 产品护栏（最高约束）
├── packages/
│   ├── cli/                  # @brawnen/harnessly，oclif CLI
│   ├── core/                 # 核心引擎（workflow / contract / gate / evidence / ...）
│   ├── hosts/
│   │   ├── shared/           # 宿主共享层
│   │   ├── claude-code/      # Claude Code 接入
│   │   └── codex/            # Codex 接入
│   └── shared/               # Zod schema + 工具
└── .harness/                 # repo-local kernel
    ├── harness.config.yaml
    ├── agents/               # 五类角色 sub-agent
    ├── hosts/                # 宿主清单（source-of-truth）
    └── tasks/                # 任务工件
```

---

## 5. 主干流程

第一版固定为五段，不允许改成自由 DAG：

```
SPEC ─────► DESIGN ─────► EXECUTE ─────► REVIEW ─────► TEST ─────► COMMIT GATE
  │            │              │              │            │              │
requirement  designer    主 agent          reviewer     tester       report.json
(haiku)     (sonnet)   (用户原生)         (sonnet)    (sonnet)        + gate
```

每个阶段都有明确的入参、产物和裁决：

| 阶段       | 角色            | 主要产物                        | 裁决            |
| -------- | ------------- | --------------------------- | ------------- |
| SPEC     | `requirement` | `contract.yaml`（范围、可验收点）    | PASS / FAIL   |
| DESIGN   | `designer`    | `plan.json`（步骤、依赖、风险）       | PASS / FAIL   |
| EXECUTE  | 主 Agent       | 代码改动 + git diff             | —             |
| REVIEW   | `reviewer`    | `review.json`（findings + 裁决） | PASS / FAIL   |
| TEST     | `tester`      | `report.json` 中的 evidence 段 | PASS / FAIL   |
| COMMIT   | gate          | 综合判定，未通过禁止提交                | allow / block |

---

## 6. 五类 Sub-Agent

Planner / Generator / Evaluator 是**职责角色**，落地到五个 sub-agent：

| Agent           | 阶段      | 默认模型(Claude Code) | 工具白名单                       |
| --------------- | ------- | ----------------- | --------------------------- |
| `requirement`   | SPEC    | haiku             | Read, Bash                  |
| `designer`      | DESIGN  | sonnet            | Read, Bash, Glob, Grep      |
| `developer`     | EXECUTE | opus (默认禁用)       | Read, Edit, Write, Bash, ...|
| `reviewer`      | REVIEW  | sonnet            | Read, Bash, Glob, Grep      |
| `tester`        | TEST    | sonnet            | Read, Bash                  |

> EXECUTE 阶段默认由用户正在使用的宿主主 Agent 承担，`developer` sub-agent 仅在 headless 模式下启用。

---

## 7. 快速开始

> Harnessly 当前处于 alpha 阶段，API 可能变动。

### 7.1 安装

```bash
npm install -g @brawnen/harnessly
# or pnpm add -g @brawnen/harnessly
```

要求：Node.js >= 22。

### 7.2 在已有项目里初始化

```bash
cd your-existing-project
harnessly init
```

会在仓库内生成：

```
.harness/
  harness.config.yaml
  agents/        # 五类 sub-agent 定义
  hosts/         # 宿主清单
```

### 7.3 接入宿主（Host-First 主路径）

```bash
# 安装宿主薄壳（生成 .claude / .codex）
harnessly host install

# 查看接入状态
harnessly host status
```

完成后，**继续用你原来的 Claude Code / Codex 工作流即可**。Harnessly 通过宿主的 hook / command bridge 自动介入。

### 7.4 Fallback：纯 CLI 模式

仅在 CI / headless / 调试场景使用：

```bash
harnessly run --dry-run        # 预览主干流程
harnessly run                  # 正式跑一次
harnessly status               # 查看当前任务状态
harnessly list                 # 列出全部任务
```

---

## 8. 主要 CLI 命令一览

| 类别              | 命令                                                  |
| --------------- | --------------------------------------------------- |
| 项目初始化           | `harnessly init`                                    |
| 宿主接入            | `harnessly host install / status / sync`            |
| Hook 入口（宿主调用）   | `harnessly host session-start / user-prompt-submit / completion-gate / agent-event` |
| 任务执行            | `harnessly run [--dry-run]`                         |
| 任务管理            | `harnessly status / list / retry / archive`         |
| 反馈与评估           | `harnessly feedback / eval`                         |
| 模板沉淀            | `harnessly template-promote`                        |

---

## 9. 宿主支持

| Host         | 主路径         | 介入方式          | 状态     |
| ------------ | ----------- | ------------- | ------ |
| Claude Code  | ✅ 主目标       | hook-first    | alpha  |
| Codex        | ✅ 主目标       | command bridge | alpha  |
| Gemini CLI   | 非主线         | （计划中）         | 实验性    |

---

## 10. 当前阶段与限制

这是 v0.1 alpha：

- ✅ `Contract → Plan → Execute → Verify → Commit Gate` 主干闭环
- ✅ Level 1 Evidence 采集（required checks + report.json）
- ✅ Claude Code / Codex 宿主接入
- ⚠️ 模板沉淀、领域文档机制刚开始引入，仍在迭代
- ⚠️ Gemini CLI 暂未进入主线
- ⚠️ 文档与示例仍在补全

不适合：

- 单文件小修小补（Harnessly 流程开销 > 收益）
- 探索式 / 研究式编码
- 对实时延迟极敏感的场景

适合：

- 多人协作、需要审计的工程交付
- 中大型 feature 开发
- 对"完成度可验证"敏感的团队 / 项目

---

## 11. 开发与贡献

```bash
pnpm install
pnpm build        # 全量构建
pnpm test         # 全量测试
pnpm typecheck    # 类型检查
```

技术栈：TypeScript 5 / Node 22 / pnpm monorepo / oclif v4 / Zod / Vitest / tsup。

修改核心架构前请先阅读：

- `AGENTS.md` — 产品护栏（最高优先级）
- `CLAUDE.md` — 开发约束
- `docs/design/agent-harness-product-design-v3-core.md` — 产品设计（v3-core）
- `docs/spec/v3-core.md` — 产品规范
- `docs/archive/README.md` — 历史文档归档索引

---

## 12. License

待定（TBD）。
