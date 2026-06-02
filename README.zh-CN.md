# Harnessly

> **构建在 coding agent 之上的工程交付控制层。**
> Harnessly 不是新的 coding agent，也不是新的 runtime。它把“模型说完成了”变成“系统能验证完成”。

[![Status](https://img.shields.io/badge/status-alpha-orange)]()
[![npm package](https://img.shields.io/npm/v/@brawnen/harnessly?label=npm&color=CB3837)](https://www.npmjs.com/package/@brawnen/harnessly)
[![Node](https://img.shields.io/badge/node-%3E%3D22-339933)]()
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

语言：[English](README.md) | 简体中文

---

## Harnessly 是什么？

Claude Code、Codex、Gemini CLI 等主流 AI coding 工具正在越来越擅长写代码。
Harnessly 解决的是另一件事：

> **如何确认一次 AI coding 任务真的完成了，而不是只是在对话里声称完成？**

Harnessly 在现有 coding agent 之外补上四类工程控制能力：

| 能力 | 作用 |
| --- | --- |
| `Contract` | 开工前定义范围、验收标准和敏感边界。 |
| `Workflow` | 固定交付路径：`Contract -> Plan -> Execute -> Verify -> Commit`。 |
| `Gate` | 在关键节点检查证据和状态，不满足条件就阻断。 |
| `Evidence` | 为每一次“完成”保留可验证的工件。 |

Harnessly 不会让模型变聪明。它的目标是把交付下限从“相信模型回答”提高到“检查真实证据”。

---

## 解决的问题

| 现状痛点 | Harnessly 的应对 |
| --- | --- |
| Agent 说“完成了”，但项目没有通过构建或检查。 | Commit Gate + `report.json`；没有证据就不能判定完成。 |
| 需求是口语化的，容易跑偏。 | SPEC/contract 先沉淀范围和验收标准。 |
| 不同人、不同 agent、不同会话的交付质量不稳定。 | repo-local kernel + 可重复工作流。 |
| 缺少可审计的交付历史。 | 每个任务保留 contract、plan、review、report 和事件工件。 |
| 团队在 Claude Code 和 Codex 之间切换。 | 同一份 `.harness/` 事实源可以生成多个宿主薄壳。 |

---

## 设计原则

- **Host-first**：用户继续在 Claude Code 或 Codex 里工作。Harnessly 通过 hook 或 command bridge 在宿主内介入。CLI 主要用于 fallback、debug、CI 和 headless 场景。
- **Repo-local kernel**：所有权威状态都落在仓库内的 `.harness/`。`.claude/`、`.codex/` 等宿主目录只是生成出来的薄壳，不是事实源。
- **Evidence-first**：完成判定依赖 gate 状态、验证输出和 `report.json`，不依赖 agent 自述。
- **低频干预**：Harnessly 只介入 `SessionStart`、`UserPromptSubmit`、`Stop` 等关键生命周期点，不细粒度接管每次工具调用。
- **可删减的控制层**：随着宿主模型变强，每个 harness 机制都应该保持可降级、可删除。

---

## 架构

```text
                    +------------------------------+
                    |  Host (Claude Code / Codex)  |  <- 用户主交互入口
                    +--------------+---------------+
                                   | hook / command bridge
                    +--------------v---------------+
                    |   .harness/  (唯一事实源)     |
                    |   - contract / plan          |
                    |   - review / report          |
                    |   - agents/                  |
                    |   - hosts/                   |
                    +--------------+---------------+
                                   | 生成
                  +--------+-------+--------+----------+
                  v        v                v          v
              .claude/   .codex/        .gemini/   其它宿主薄壳
```

仓库结构：

```text
agent-harnessly/
├── AGENTS.md                 # 产品护栏
├── packages/
│   ├── cli/                  # @brawnen/harnessly CLI 包
│   ├── core/                 # workflow / contract / gate / evidence 引擎
│   ├── hosts/
│   │   ├── shared/           # 宿主适配共享逻辑
│   │   ├── claude-code/      # Claude Code 接入
│   │   └── codex/            # Codex 接入
│   └── shared/               # 共享 schema 和工具
└── .harness/                 # repo-local kernel
    ├── harness.config.yaml
    ├── agents/
    ├── hosts/
    └── tasks/
```

---

## 工作流

第一版稳定产品路径保持固定：

```text
SPEC -> DESIGN -> EXECUTE -> REVIEW -> TEST -> COMMIT GATE
```

| 阶段 | 负责角色 | 主要产物 | 裁决 |
| --- | --- | --- | --- |
| SPEC | `requirement` | `requirement.md` + `contract.yaml`（范围、验收标准） | PASS / FAIL |
| DESIGN | `designer` | `design.md` + `task-breakdown.md`（步骤、依赖、风险） | PASS / FAIL |
| EXECUTE | 宿主主 agent | 代码改动 + `implementation-notes.md` | - |
| REVIEW | `reviewer` | `review.md`（findings 和裁决） | PASS / FAIL |
| TEST | `tester` | `test-report.md` + `evidence/baseline-diff.json` | PASS / FAIL |
| COMMIT | gate | `report.json` —— 综合 contract、review、evidence 的最终判定 | allow / block |

默认由宿主主 agent 执行实现。角色 agent 是职责划分和宿主原生能力的使用策略，不是额外构建一个固定多 agent runtime。

---

## 安装

Harnessly 处于 alpha 阶段（API 和宿主接入仍可能变化），但直接全局安装即可拿到最新版 —— `latest` 与 `alpha` 指向同一版本：

```bash
npm install -g @brawnen/harnessly
# 或
pnpm add -g @brawnen/harnessly
```

如需锁定指定版本：

```bash
npm install -g @brawnen/harnessly@0.1.0-alpha.13
```

验证：

```bash
harnessly --version
```

要求：

- Node.js >= 22
- Git 仓库（用于任务和 diff 工作流）

---

## 快速开始

一条命令完成全部初始化 —— repo-local kernel、宿主薄壳、git hooks：

```bash
cd your-existing-project
harnessly init --host codex
# 或：harnessly init --host claude-code,codex
```

验证宿主接入：

```bash
harnessly host status
```

之后继续使用原来的 Claude Code 或 Codex 工作流即可。Harnessly 会通过宿主 hook 创建 contract、持久化任务状态、采集 evidence，并执行 completion gate。

> `harnessly host install` / `harnessly host sync` 只在手动改动后重装/刷新宿主薄壳时才需要 —— `init` 已经装好了。

纯 CLI 执行只是 fallback/debug/CI 路径：

```bash
harnessly run --dry-run "<goal>"
harnessly run "<goal>"
harnessly status
harnessly list
```

---

## 命令

| 类别 | 命令 |
| --- | --- |
| 项目初始化 | `harnessly init` |
| 宿主接入 | `harnessly host install / status / sync` |
| 宿主 hook 入口 | `harnessly host session-start / user-prompt-submit / completion-gate / agent-event` |
| 任务执行 | `harnessly run [--dry-run]` |
| 任务管理 | `harnessly status / list / retry / archive` |
| Preset 升档 | `harnessly upgrade [--task-id <id>]` |
| 反馈与评估 | `harnessly feedback / eval` |
| 模板沉淀 | `harnessly template promote` |

### Workflow Presets

Harnessly 支持两档任务 preset：

- **lite preset**：`spec -> execute -> test`；默认用于小修复、文档改动和窄范围任务，不派发 sub-agent。
- **full preset**：完整六阶段工作流，带角色 agent。适合 feature、跨模块改动和架构敏感任务。

在宿主 prompt 里请求 full preset：

```text
[harness:feat] Add OAuth 2.0 login
```

将 active lite task 升档：

```bash
harnessly upgrade
harnessly upgrade --task-id <id>
```

---

## 宿主支持

| Host | 产品路径 | 接入方式 | 状态 |
| --- | --- | --- | --- |
| Claude Code | 主目标 | hook-first | alpha |
| Codex | 主目标 | command bridge | alpha |
| Gemini CLI | 暂非主线 | planned | experimental |

---

## 当前状态

最新发布版本见上方 npm badge（精确版本号用 `npm view @brawnen/harnessly version`）。

已实现的 alpha 能力：

- `Contract -> Plan -> Execute -> Verify -> Commit Gate` 交付闭环
- Level 1 evidence 采集、required checks 和 `report.json`
- Claude Code / Codex 宿主接入
- lite/full workflow presets
- `.harness/` 下的 repo-local task state 和 host manifests

已知限制：

- Alpha API 和命令细节仍可能变化。
- Gemini CLI 暂未进入主线。
- 文档和示例仍在补齐。
- 对极小的一次性改动来说流程偏重。

适合场景：

- 中大型工程改动
- 需要审计性的团队协作
- “完成”必须由证据支撑的项目

---

## 开发

```bash
pnpm install
pnpm build
pnpm test
pnpm typecheck
```

技术栈：

- TypeScript 5
- Node.js 22
- pnpm monorepo
- Zod
- Vitest
- tsup

修改核心架构前请先阅读：

- `AGENTS.md` - 产品护栏
- `CLAUDE.md` - 本地开发约束
- `docs/design/agent-harness-product-design-v3-core.md` - 产品设计
- `docs/spec/v3-core.md` - 产品规范
- `docs/archive/README.md` - 历史设计和试用文档
- `CHANGELOG.md` - 公开版本变更记录

---

## License

MIT. See [LICENSE](LICENSE).
