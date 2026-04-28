# Agent Harness 技术实现方案 V1 评审报告

**评审基准：** `agent-harness-product-design-v2.md`、`AGENTS.md`
**评审对象：** `technical-implementation-plan.md`
**版本：** v3（修正 + Sub-agent 实现方案）
**日期：** 2026-04-23

---

## 结论摘要

本评审基于 `AGENTS.md` 中的最高原则——**"宿主内自动介入（寄生）"、"Host 是默认交互主路径、Adapter 是执行能力和 headless 路径"**——对技术方案进行审视。

当前技术方案的**核心架构选择是正确的**，但在宿主路径下三个角色（Planner / Generator / Evaluator）的落地机制上存在更优方案：**利用宿主原生的 Sub-agent 机制**实现角色分工，而非依赖 Hook 拦截 + CLI 工具链。

三大宿主（Claude Code、Codex、Gemini CLI）均已原生支持 Sub-agent 能力，包括独立上下文隔离、自定义 Agent 定义文件、并行执行和模型分级。这为 Harnessly 提供了一条更自然、更低开发成本、且天然解决闭环反刍问题的接入路径。

---

## 一、Sub-agent 机制下的角色落地方案

### 1.1 宿主 Sub-agent 能力现状

| 能力维度 | Claude Code | Codex CLI | Gemini CLI |
|---|---|---|---|
| **核心机制** | `Task` tool，主 Agent 派生子 Agent | Manager-Subagent 层级编排 | 原生 sub-agent，支持自动/手动委派 |
| **上下文隔离** | ✅ 独立 context window | ✅ 独立沙箱环境 | ✅ 独立 context window |
| **自定义 Agent 定义** | `.claude/agents/*.md` | `.codex/agents/*.toml` | `.gemini/agents/*.md`（YAML frontmatter） |
| **模型分级** | ✅ 可指定模型层级（Opus / Sonnet / Haiku） | ✅ 可选模型（如 gpt-5.4-mini） | ✅ 可指定模型 |
| **工具/权限隔离** | ✅ 可限定 tool 集合 | ✅ 可限定沙箱权限、MCP | ✅ 可限定 tool 和 persona |
| **结果回流** | 子 Agent 返回摘要给主 Agent | Orchestrator 汇总子 Agent 结果 | 子 Agent 结果回流主会话 |
| **并行执行** | ✅ | ✅（最多 6 并发） | ✅ |

> [!IMPORTANT]
> 三个宿主均支持通过 **repo-local 配置文件** 定义自定义 sub-agent。这意味着 `harness host install` 的核心产出物可以直接是**一组 sub-agent 定义文件**，而非 Hook 配置。

### 1.2 角色到 Sub-agent 的映射

#### Planner Sub-agent

**职责：** 将用户的模糊目标转换为结构化的 Contract 和 Plan。

**实现方式：**

- 由 `harness host install` 在 repo-local 宿主目录中生成 Planner sub-agent 定义文件。
- 当用户在宿主中发起新任务时，主 Agent 自动（或被指令）委派给 Planner sub-agent。
- Planner sub-agent 的 system prompt 包含：contract schema、模板规则、gate 检查项、项目上下文。
- 产出：`.harness/tasks/<id>/contract.yaml` 和 `plan.md`。
- 权限：**只读**（不允许修改代码文件），仅允许读取项目结构和 `.harness/` 配置。

**模型分级：轻量模型优先。**

| 宿主 | 推荐模型 | 理由 |
|---|---|---|
| Claude Code | **Haiku**（默认）/ Sonnet（复杂任务） | Contract 生成是结构化填空，不需要最强推理 |
| Codex | **gpt-5.4-mini** | 同上 |
| Gemini CLI | **Gemini Flash** | 同上 |

**Claude Code 的 Planner sub-agent 定义示例：**

```markdown
<!-- .claude/agents/harness-planner.md -->
---
name: harness-planner
description: 将用户目标转换为结构化的任务 Contract 和 Plan
model: haiku
tools:
  - Read
  - Bash(harness contract generate *)
  - Bash(harness contract validate *)
---

# Harness Planner

你是一个任务规划专家。你的唯一职责是将用户的模糊目标转换为结构化的 Contract。

## 工作流程

1. 读取 `.harness/harness.config.yaml` 获取项目配置
2. 读取 `.harness/GLOBAL_RULES.md` 获取项目规则
3. 分析用户目标，匹配合适的模板（调用 `harness template match "<goal>"`）
4. 按以下 schema 生成 contract.yaml：
   - goal: 明确的任务目标
   - scope: 涉及的文件/模块路径（glob 格式）
   - out_of_scope: 明确不动的部分
   - acceptance_criteria: 每条标注验证方式（test/build/playwright/manual）
   - risk_level: low/medium/high
   - required_checks: 必须通过的检查项
   - estimated_complexity: simple/medium/complex
5. 调用 `harness contract validate <task-id>` 执行 Contract Gate 校验
6. 如果校验失败，根据失败原因修正后重新校验
7. 将最终 contract 展示给用户确认

## 约束

- 不要修改任何代码文件
- scope 必须使用路径 glob 格式
- acceptance_criteria 中不允许出现模糊词（大概、也许、尽量等）
- high risk 任务的 required_checks 必须包含 test
```

**Codex 的 Planner sub-agent 定义示例：**

```toml
# .codex/agents/harness-planner.toml
[agent]
name = "harness-planner"
description = "将用户目标转换为结构化的任务 Contract 和 Plan"
model = "gpt-5.4-mini"

[sandbox]
permissions = "read-only"

[tools]
allowed = ["read_file", "run_command"]
run_command_allowlist = [
  "harness contract generate *",
  "harness contract validate *",
  "harness template match *",
]

[instructions]
content = """
你是一个任务规划专家。你的唯一职责是将用户的模糊目标转换为结构化的 Contract。
...（同 Claude Code 版本的工作流程和约束）
"""
```

**Gemini CLI 的 Planner sub-agent 定义示例：**

```markdown
<!-- .gemini/agents/harness-planner.md -->
---
name: harness-planner
description: 将用户目标转换为结构化的任务 Contract 和 Plan
model: gemini-flash
tools:
  - read_file
  - run_shell_command
---

# Harness Planner

你是一个任务规划专家。你的唯一职责是将用户的模糊目标转换为结构化的 Contract。
...（同 Claude Code 版本的工作流程和约束）
```

---

#### Generator（主 Agent）

**职责：** 根据 Contract 和 Plan 编写代码。

**实现方式：**

- Generator **不需要单独的 sub-agent**——宿主的主 Agent 本身就是 Generator。
- Planner sub-agent 完成后，其产出（Contract 摘要 + Plan）自然回流到主 Agent 的上下文中。
- 主 Agent 据此开始写代码，整个过程 Harnessly 不介入。

**模型分级：使用宿主默认模型（用户自选的主力模型）。**

| 宿主 | 推荐模型 | 理由 |
|---|---|---|
| Claude Code | 用户会话默认模型（通常 Sonnet / Opus） | 代码生成需要最强推理能力 |
| Codex | 用户会话默认模型 | 同上 |
| Gemini CLI | 用户会话默认模型 | 同上 |

**Harnessly 在 Generator 阶段的唯一介入点：**

主 Agent 开始写代码前，Harnessly 需要确保 Contract 和 Plan 已经被加载到主 Agent 的上下文中。这可以通过以下方式实现：

1. Planner sub-agent 的返回摘要中包含完整的约束信息（scope、out_of_scope、acceptance_criteria）。
2. 或者，在 `.claude/CLAUDE.md`（repo-local）中注入一条规则："开始执行任务前，必须先读取 `.harness/tasks/<active-task>/contract.yaml`"。

---

#### Evaluator Sub-agent

**职责：** 独立于 Generator 验证产物质量，给出 Pass/Fail 裁决。

**实现方式：**

- 当主 Agent（Generator）宣称完成时，主 Agent 自动委派给 Evaluator sub-agent。
- Evaluator sub-agent 在**独立的上下文窗口**中运行，天然实现与 Generator 的隔离（避免"自己判卷"）。
- Evaluator 的核心工作是调用 Harnessly 的 CLI 工具执行检查，然后解读结果。
- 产出：`.harness/tasks/<id>/report.json`。

**模型分级：中等模型。**

| 宿主 | 推荐模型 | 理由 |
|---|---|---|
| Claude Code | **Sonnet**（默认）/ Haiku（仅 Level 1） | 需要理解检查结果并生成修复建议，但不需要代码生成级别的推理 |
| Codex | **gpt-5.4**（默认） | 同上 |
| Gemini CLI | **Gemini Pro** | 同上 |

**Claude Code 的 Evaluator sub-agent 定义示例：**

```markdown
<!-- .claude/agents/harness-evaluator.md -->
---
name: harness-evaluator
description: 独立验证任务产物，执行三级 evidence 采集和 commit gate 判定
model: sonnet
tools:
  - Read
  - Bash(harness evidence collect *)
  - Bash(harness gate commit *)
  - Bash(git diff --stat *)
  - Bash(git log --oneline -5)
---

# Harness Evaluator

你是一个独立的代码质量评估者。你的职责是验证 Generator 的产出是否满足 Contract 要求。
你不参与任何实现决策，只负责"判卷"。

## 工作流程

1. 读取 `.harness/tasks/<task-id>/contract.yaml` 获取验收标准
2. 执行 `harness evidence collect <task-id>` 运行三级验证：
   - Level 1（强制）：build / lint / typecheck / test / scope check
   - Level 2（推荐）：contract 驱动的 Playwright / API 测试
   - Level 3（按需）：AI 辅助代码审查（仅在 high risk 时启用）
3. 解读 evidence 采集结果
4. 执行 `harness gate commit <task-id>` 获取 gate 裁决
5. 生成结构化的评估报告

## 输出格式

你的输出必须包含：
1. **检查结果摘要**：每项检查的 pass/fail 状态
2. **问题清单**：如有失败项，列出具体问题和修复建议
3. **Gate 裁决**：PASSED 或 FAILED
4. **修复指令**（仅在 FAILED 时）：给 Generator 的具体修复指令

## 约束

- 不要修改任何代码文件
- 不要替代 Generator 做修复
- 判断必须基于 evidence，不能基于主观推测
- scope check 违规必须明确列出违规文件
```

---

### 1.3 完整的宿主路径交互流程

以 Claude Code 为例，一个中等 bug-fix 任务的完整流程：

```
用户: "修复用户登录时 JWT token 过期后没有正确跳转到登录页的问题"

主 Agent: [识别为新任务] → 委派给 @harness-planner

  Planner (Haiku):
    1. 读取 .harness/harness.config.yaml
    2. 执行 `harness template match "修复...JWT..."` → 匹配 bug-fix
    3. 生成 contract.yaml（goal、scope、criteria...）
    4. 执行 `harness contract validate <task-id>` → ✓ 通过
    5. 返回 Contract 摘要给主 Agent

主 Agent: [展示 Contract 给用户]
  "以下是任务 Contract，请确认：
   Goal: 修复 JWT token 过期后未跳转登录页
   Scope: src/auth/**, src/middleware/auth.ts
   ..."

用户: "确认"

主 Agent (Sonnet/Opus): [作为 Generator 开始写代码]
  1. 读取 contract.yaml 中的约束
  2. 分析代码，定位问题
  3. 修改 src/middleware/auth.ts
  4. 添加测试
  5. "我已经完成了修复。"

主 Agent: [识别完成信号] → 委派给 @harness-evaluator

  Evaluator (Sonnet):
    1. 读取 contract.yaml
    2. 执行 `harness evidence collect <task-id>`
       [Level 1] build .......... ✓
       [Level 1] lint ........... ✓
       [Level 1] scope check ... ✓ (2 files, all in scope)
       [Level 2] test .......... ✓
    3. 执行 `harness gate commit <task-id>` → PASSED
    4. 返回评估报告给主 Agent

主 Agent: [展示结果给用户]
  "✓ 任务已通过验证，代码 commit-ready。
   Report: .harness/tasks/20260423-xxx/report.json"
```

**Gate 失败时的反刍流程：**

```
  Evaluator (Sonnet):
    1. 执行 `harness evidence collect <task-id>`
       [Level 1] lint ........... ✗ 3 errors
       [Level 1] scope check ... ⚠ src/utils/format.ts 超出 scope
    2. 执行 `harness gate commit <task-id>` → FAILED
    3. 返回给主 Agent：
       "Gate FAILED。需要修复：
        1. lint 错误 3 处（详见输出）
        2. src/utils/format.ts 不在 scope 内，需要撤回修改或扩展 scope"

主 Agent (Generator): [收到 Evaluator 反馈，自动进入修复]
  1. 修复 lint 错误
  2. 撤回 src/utils/format.ts 的修改
  3. "修复完成，请重新验证。"

主 Agent: → 再次委派给 @harness-evaluator
  ...（直到通过或达到重试上限）
```

> [!TIP]
> 注意：在这个流程中，闭环反刍是**天然实现**的——Evaluator sub-agent 的输出直接回流到主 Agent 的上下文中，主 Agent（Generator）可以立即根据反馈修复，无需任何特殊的 Hook 回注机制。

### 1.4 Token 开销分析

| 环节 | 当前方案（Hook + CLI） | Sub-agent 方案 | 差异 |
|---|---|---|---|
| Planner（template 模式） | ~0（纯规则匹配） | ~2k-4k（Haiku/mini/Flash） | +2k-4k |
| Generator | 无差异（主 Agent 写代码） | 无差异 | 0 |
| Evaluator（Level 1/2） | ~0（纯脚本） | ~1k-3k（Sonnet/Pro 解读结果） | +1k-3k |
| 主 Agent 消费摘要 | ~200（Hook 短文本） | ~500-1k（sub-agent 结果） | +300-800 |
| **单任务总增量** | | | **约 3k-8k tokens** |

对比中等任务总消耗（50k-200k），增量约 **2%-15%**。通过模型分级（Planner 用最轻量模型），可进一步压缩。

### 1.5 `harness host install` 的产出物

`harness host install` 的核心职责从"生成 Hook 配置"变为"**生成 sub-agent 定义文件**"：

| 宿主 | 产出路径 | 产出文件 |
|---|---|---|
| Claude Code | `.claude/agents/` | `harness-planner.md`、`harness-evaluator.md` |
| Codex | `.codex/agents/` | `harness-planner.toml`、`harness-evaluator.toml` |
| Gemini CLI | `.gemini/agents/` | `harness-planner.md`、`harness-evaluator.md` |

这些文件仍然由 `.harness/hosts/*.yaml` 作为 source-of-truth 生成，保持 repo-local kernel 原则不变。

### 1.6 与 Headless 模式的关系

Sub-agent 方案**仅影响宿主主路径**。`harness run`（headless/CI）模式的架构不变：

| 路径 | Planner | Generator | Evaluator |
|---|---|---|---|
| **宿主主路径** | Planner sub-agent（轻量模型） | 主 Agent 自身 | Evaluator sub-agent（中等模型） |
| **Headless 路径** | Harnessly LLM Client 或模板填充 | Adapter 子进程 | Harnessly evidence/gate 脚本 |

两条路径共享 `.harness/` 中的所有工件（contract、plan、report、config），仅执行通道不同。

---

## 二、仍然存在的问题

> [!NOTE]
> 以下问题中，问题 1 和问题 2 在采用 Sub-agent 方案后已被解决或大幅缓解。保留在此处仅供参考，重新标注了严重度。

### ~~问题 1（原高，已解决）：闭环断链~~

**原问题：** Completion Gate 拦截后缺乏反刍机制。

**Sub-agent 方案下的解决：** Evaluator sub-agent 的输出天然回流给主 Agent。主 Agent 收到"Gate FAILED + 修复指令"后，可以直接进入下一轮修复。闭环反刍成为宿主 sub-agent 机制的默认行为，不需要额外开发。

---

### ~~问题 2（原中，已解决）：Hook 态下 Contract 确认交互~~

**原问题：** 在 Hook 态下 Harnessly 抢 TTY 确认 Contract 会导致终端错乱。

**Sub-agent 方案下的解决：** Contract 确认发生在 Planner sub-agent 与主 Agent 的正常交互中。Planner 返回 Contract 摘要 → 主 Agent 在对话中展示给用户 → 用户通过正常对话确认。完全走宿主自身的 UI 通道，不存在 TTY 抢占问题。

---

### 问题 3（高）：文档叙事重心需要调整

**现象：**
技术方案的代码示例和交互流程几乎全部围绕 `harness run` 展开。宿主路径（尤其是 sub-agent 模式）缺乏对应的代码示例、交互流程图和实现指引。

**建议：**
- 在技术方案中新增一节，描述 sub-agent 模式下的完整实现方案。
- `harness host install` 的产出物描述需要从"Hook 配置"更新为"sub-agent 定义文件"。
- 补充各宿主的 sub-agent 定义文件模板。

---

### 问题 4（中）：Scope Check 的 Git Diff 基准线缺失

**现象：**
§4.7.1 `ScopeCheck` 使用 `git.diffSummary()` 获取当前工作区的所有修改，与 Contract 的 scope globs 对比。

**风险：**
1. **脏工作区误杀**：用户在任务启动前已有未提交的修改，会被一并捞出导致误报。
2. **无回滚手段**：Scope Check 发现越界修改时，Agent 已经把代码写进磁盘。方案中没有自动还原机制。

**建议：**
- 在任务创建时记录当前 Git 状态（snapshot commit hash 或 stash），Scope Check 只对比 `当前状态 vs 任务开始时的快照`。
- 对于确认越界的文件，提供可选的自动 `git restore` 还原能力。

---

### 问题 5（低）：Contract Gate 模糊词检测的误杀率过高

**现象：**
§4.3 `checkNoVagueTerms` 将整个 Contract 对象序列化为 JSON 字符串，然后对预设词表做 `includes` 匹配。

**风险：**
全量字符串匹配会误杀合理的技术描述（如文件名、需求本身包含匹配词）。

**建议：**
- 将模糊词检查限定在 `goal` 和 `acceptance_criteria.criterion` 等描述型字段。
- 提供 `--force` 或 `override` 机制允许用户跳过此项检查。

---

### 问题 6（低）：Headless 模式 Retry 缺少上下文传递

**现象：**
§4.1 WorkflowEngine 的 retry 回跳时，§4.6 PromptAssembler 不包含上一轮的失败原因。

**风险（仅限 headless 模式）：**
Agent 收到与第一轮完全相同的 prompt，可能重复产出相同错误代码。

> [!NOTE]
> 此问题在宿主 sub-agent 路径下不存在，因为 Evaluator sub-agent 的反馈天然回流给主 Agent。

**建议：**
- `PromptAssembler` 在 retry 状态时，注入 `## 上一轮修复反馈` 章节。

---

## 三、总结

| 问题 | 严重度 | 性质 | 影响范围 | Sub-agent 方案下 |
|---|---|---|---|---|
| 闭环反刍机制缺失 | ~~高~~ | 设计缺失 | 宿主路径 | ✅ 已解决 |
| Hook 态 Contract 确认交互 | ~~中~~ | 设计缺失 | 宿主路径 | ✅ 已解决 |
| 文档叙事重心需调整 | 高 | 文档/架构 | 开发方向 | 仍需处理 |
| Scope Check Git Diff 基准线 | 中 | 实现缺陷 | 所有模式 | 仍需处理 |
| Contract Gate 模糊词误杀 | 低 | 实现缺陷 | 所有模式 | 仍需处理 |
| Headless Retry 上下文传递 | 低 | 实现缺陷 | 仅 headless | 仍需处理 |

**核心结论：** 采用 Sub-agent 方案后，宿主路径下的两个高/中严重度问题（闭环反刍、I/O 抢占）被天然解决。技术方案需要更新的主要内容是：将 `harness host install` 的产出物从 Hook 配置调整为 sub-agent 定义文件，并补充各宿主的定义文件模板和完整交互流程示例。剩余的实现级问题（Scope Check 基准线、模糊词误杀、Headless retry）不影响架构方向，可在开发过程中逐项修正。
