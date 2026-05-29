# Harnessly 服务规范（v3-core）

状态：草案 v1（语言无关）

目的：定义一个 in-task harness 层，约束 coding agent 完成每一项工作的方式 —— 通过 SPEC、contract、多角色工作流、scope 检查、基线对比、结构规则、常驻 review agent，以及反馈晋升机制。

源流：本规范从 v2（交付控制层）和 v3（Agent 工程作战系统）演化而来。v3-core 是 v3 中**长期不会被替代**的子集，并融合了 OpenAI Ryan Lopopolo 的 harness 实战经验三层（结构规则、常驻 review agent、反馈晋升）。设计上可与 [openai/symphony](https://github.com/openai/symphony) 干净叠加 —— Symphony 在跨任务层做调度，Harnessly 在每个任务内做治理。

## 规范性术语

本文档中关键词 `MUST`、`MUST NOT`、`REQUIRED`、`SHOULD`、`SHOULD NOT`、`RECOMMENDED`、`MAY`、`OPTIONAL` 按 RFC 2119 解释。中文对照：

| 英文 | 中文 |
|---|---|
| MUST / REQUIRED / SHALL | 必须 / 必需 |
| MUST NOT / SHALL NOT / FORBIDDEN | 不得 / 禁止 |
| SHOULD / RECOMMENDED | 应 / 推荐 |
| SHOULD NOT | 不应 |
| MAY / OPTIONAL | 可 / 可选 |

`Implementation-defined`（实现自定义）表示该行为属于实现契约的一部分，但本规范不规定唯一的全局策略，实现必须明确文档化所选行为。

## 1. 问题陈述

给一个 coding agent 单一目标（例如「修复登录 bug」），它常常会：

- 把需求、设计、实现混成一遍
- 在没有独立验证的情况下自我汇报成功
- 偏离预期范围（修 bug 时顺手重构无关文件）
- 忘记仓库级约定，重新发明已有 helper
- 下次同类任务再犯同样错误，因为反馈从未被规则化

Harnessly v3-core 通过以下手段解决：

- 让每个任务走过一个固定的多阶段工作流，并强制角色分离
- 产出可跨会话与跨审阅者存活的结构化工件链
- 把 scope（任务级）和结构（仓库级）作为物理护栏强制执行
- 在任务工作流之外并行运行常驻 review agent
- 把重复出现的 finding 晋升为 lint 规则、测试或 review prompt，让 harness 随时间越来越严

## 2. 目标与非目标

### 2.1 目标

- 提供六阶段的 in-task 工作流（SPEC → Design → Execute → Review → Test → Commit Gate），由仓库内的工作流定义驱动
- 通过宿主原生 sub-agent 强制角色分离，并对每个角色配工具白名单
- 每个任务捕获两次 evidence 快照（执行前 baseline、执行后 current），以差量做 gate
- 通过 `structure-rules.yaml` 提供独立于单任务 scope 的仓库级不变量
- 在宿主定义的触发点（push、merge）运行常驻 review agent，与任务工作流正交
- 把 review finding 汇集进 pool，并提供工具把高频 finding 晋升为永久护栏
- 工件 schema 必须足够精确，以便任何符合规范的实现都能产出可互操作的工作流
- 跨宿主：任何支持原生 sub-agent 与生命周期 hook 的宿主都可作为目标

### 2.2 非目标

- 跨任务调度、daemon 化、issue tracker 轮询。（这部分与 Symphony 组合）
- Web UI 或多租户控制平面
- 通用工作流引擎。默认工作流固定为六阶段
- Memory 或知识库自治。仓库是真理之源；按会话的 memory 不得作为权威
- 自动跨任意协议编排非宿主 agent

## 3. 系统总览

### 3.1 主要组件

1. **SPEC Loader**
   - 读取仓库内的工作流契约（`.harness/WORKFLOW.md` 或拆分多文件形式）
   - 解析 YAML front matter + 角色契约 + skill 定义
   - 返回带类型的 `WorkflowConfig`

2. **Task Manager**
   - 分配 `task_id` 并在 `.harness/tasks/<task_id>/` 下创建任务级工作区
   - 持久化工件与状态
   - 重启后从文件系统恢复任务状态（不依赖数据库）

3. **PM Router**
   - 由宿主主 agent 兼任 —— **不是**独立 sub-agent
   - 基于阶段产物与 gate 决议决定下一阶段
   - 通过宿主原生 sub-agent 机制 spawn 角色 sub-agent
   - 把路由决策记录到 `state.json`

4. **角色 Sub-agent（5 个）**
   - `requirement`、`designer`、`developer`、`reviewer`、`tester`
   - 通过宿主原生 sub-agent 机制实例化，每个角色配独立工具白名单
   - 仅通过磁盘工件通信；禁止直接互相调用

5. **Evidence Collector**
   - Execute 阶段前捕获 baseline 快照
   - Execute 阶段后捕获 current 快照
   - 计算 baseline-diff：只有新引入的失败或告警才计入
   - 跑 Level-1（通过 Skill 跑 build/lint/typecheck/test）、Level-2（contract 驱动）、Level-3（LLM 辅助，可选）

6. **Skill Runner**
   - 加载 `.harness/skills/<check>/<lang>.yaml`
   - 检测 `env_required` 二进制是否存在
   - 跑配置的 command，套用 success / fix-hint 模板

7. **Scope Checker**
   - 读 `contract.yaml` 的 `scope.exclude`（拒绝列表）
   - 与变更文件（git diff vs baseline）做匹配
   - 命中即硬性阻断

8. **Structure Checker**
   - 读 `.harness/structure-rules.yaml`
   - 扫描工作树，检测仓库级不变量违规
   - 命中即硬性阻断，并附带 `fix_hint`

9. **Resident Review Agents（常驻审查 agent）**
   - 与任务工作流相互独立
   - 由宿主生命周期事件触发（`pre_push`、`pre_merge`）
   - 把 finding 汇总到当前任务的 `resident-review.md`，同时写入 `feedback-pool/` 等待晋升

10. **Feedback Promoter**
    - 扫描 `.harness/feedback-pool/*.jsonl`
    - 统计每条 finding 的复发次数
    - 把超过阈值的 finding 晋升为 `structure-rules.yaml` 条目、失败测试、review-agent prompt 增量，或 skill `fix_hint` 增强

11. **Host Adapter**
    - 把抽象操作（spawn sub-agent、注册 hook、捕获退出）翻译为宿主原生原语
    - 必需：至少一个支持原生 sub-agent 的宿主目标（例如 Claude Code 或 Codex）

### 3.2 抽象层级

仿 Symphony 的六层映射，从团队策略向下到集成：

1. **策略层**（仓库定义）
   - `WORKFLOW.md` body（给 sub-agent 的主 prompt）
   - `structure-rules.yaml`、`review-agents.yaml`、`skills/`
2. **配置层**（带类型的 getter）
   - YAML front matter 解析、默认值、环境变量解析
3. **协调层**（PM router）
   - 阶段迁移规则、回退路径、sub-agent 派发
4. **执行层**（每阶段 sub-agent + 工作区）
   - sub-agent 生命周期、工件写入、hook 校验
5. **集成层**（宿主适配器 + Skill 执行器）
   - 宿主特定的 sub-agent spawn、生命周期 hook、命令执行
6. **可观测性层**（事件日志 + 状态）
   - 结构化 `events.jsonl`、可选 CLI 状态界面

### 3.3 外部依赖

- 一个支持原生 sub-agent 与生命周期 hook 的宿主（如 Claude Code、Codex）
- 本地文件系统用于 `.harness/` 持久化
- Git 用于 diff 计算与（可选的）任务级 worktree 隔离
- `which`（或等价工具）用于 `env_required` 二进制检测
- 可被调用的 LLM provider（reviewer / 常驻 review agent 在做非静态检查时使用）

## 4. 核心领域模型

### 4.1 实体

#### 4.1.1 Task（任务）

一个 in-task 工作单元，被隔离在一个工作区下。

| 字段 | 类型 | 必需 | 描述 |
|---|---|---|---|
| `task_id` | string | 是 | 稳定、单调递增。格式 `YYYYMMDD-HHMMSS-<rand4>` |
| `goal` | string | 是 | 用户面向的意图 |
| `created_at` | ISO 时间戳 | 是 | |
| `current_stage` | enum | 是 | 六阶段之一 |
| `current_owner` | role | 是 | 当前持有任务的角色 |
| `state` | enum | 是 | `active`、`blocked`、`completed`、`aborted` |
| `last_failure_reason` | string \| null | 否 | 最近一次阶段失败时设置 |

#### 4.1.2 SPEC（`requirement.md`）

普通 markdown，但必须包含以下全部小节：

- `## Goal` —— 单句意图
- `## In Scope` —— 项目列表，必须非空
- `## Out of Scope` —— 项目列表，必须非空
- `## Affected Modules` —— 项目列表，可空（绿地项目）
- `## Acceptance Criteria` —— 项目列表，必须非空
- `## Risks` —— 项目列表，可空
- `## Open Questions` —— 项目列表，可空；非空时 Designer 必须在 `design.md` 中回应

`requirement.md` 不得包含模糊词：`建议`、`可以`、`推荐`、`可选`、`suggest`、`recommend`、`optional`（大小写不敏感）。校验器检测到必须拒绝。

#### 4.1.3 Contract（`contract.yaml`）

SPEC 的结构化投影，机器可校验。

```yaml
version: "2.0"
task_id: <task_id>
goal: <string>
scope:
  include: [<path-glob>, ...]   # 期望列表（仅展示）
  exclude: [<path-glob>, ...]   # 拒绝列表（强制）
acceptance_criteria:
  - criterion: <string>
    verifiable_by: build | lint | typecheck | test | playwright | api | manual
    test_hint: <string?>
risk_level: low | medium | high
estimated_complexity: simple | medium | complex
required_checks: [build, lint, typecheck, test]   # 子集
linked_spec: requirement.md
linked_design: design.md   # Design 阶段后回填
asset_promotion:               # 可选；详见 §22
  promote: <bool>              # 默认 false
  topic: <slug>                # promote=true 时必需；如 oauth-integration
  files: [<artifact-name>, ...]  # 要晋升的任务工件（如 requirement.md、design.md）
  mode: new_topic | append | replace   # 默认：topic 不存在时 new_topic，否则 append
created_at: <iso-timestamp>
```

`scope.include` 是期望列表：不得作为写入强制的允许列表使用。`scope.exclude` 是硬性拒绝列表：任何变更文件命中即必须导致 Scope Checker 失败。

`asset_promotion` 是可选字段。当 `promote: true` 时，系统必须在任务达到 `commit_decision: pass` 后把列出的工件晋升到 `docs/architecture/<topic>/`。完整机制详见 §22。

#### 4.1.4 Design（`design.md`）

Markdown 正文，必须包含：

- 决策小节：至少对比两种备选方案
- 接口小节：描述新引入的符号 / 契约
- 影响小节：列出受影响文件（估计）
- `## Feasibility Self-Check` 小节（必需）：覆盖 scope 是否清晰、design 是否完整、task-breakdown 是否合理、风险是否可控、是否与现有架构冲突

`design.md` 不得包含前向引用，例如「同上」、「与 X 平行」、「细节见别处」。校验器检测到必须拒绝。

#### 4.1.5 Task Breakdown（`task-breakdown.md`）

含显式依赖的有序子任务列表。每个子任务必须含：

- 简短名称
- 依赖子任务 ID 列表（可无）
- 验收信号（怎么知道这一步完成了）
- 复选框 `[ ]`，由 Developer 在工作过程中切换

#### 4.1.6 Implementation Notes（`implementation-notes.md`）

由 Developer 在 Execute 阶段末产出的 markdown。必须包含：

- `## Order` —— 实际子任务执行顺序（可与 breakdown 不同）
- `## Deviations from Design` —— 每个偏离 `design.md` 的点必须记录
- `## Pitfalls` —— 实施过程中遇到的问题
- `## TODOs Introduced` —— diff 中每个新增 `TODO` / `FIXME` 必须列出，否则 Reviewer 自动拒绝
- `## Sub-task Progress` —— 子任务复选框状态副本

#### 4.1.7 Review（`review.md`）

由 Reviewer 产出的 markdown，必须包含：

- `## Decision` —— 取值之一：`pass`、`block_execute`、`block_design`、`block_spec`、`defer_to_new_task`
- `## Block Scope` —— `minimal` 或 `full`（仅在 Decision 为 block_* 时）
- `## Findings` —— finding 列表，每条必须含稳定 ID `F-<task_id>-<seq>`、严重级（`P0` / `P1` / `P2`）、描述、文件/行引用、修复 hint，以及 `recurrent_pattern` 布尔值

#### 4.1.8 Resident Review（`resident-review.md`）

来自常驻 review agent 的 finding 汇总。Finding schema 与 `review.md` 相同，但来源在任务工作流之外。

#### 4.1.9 Test Report（`test-report.md`）

必须包含：

- `## Acceptance Coverage` —— 对 `contract.yaml` 中每条验收标准，给出验证机制和通过/失败
- `## Baseline-Diff` —— build/lint/typecheck/test 计数前后对比与差量
- `## Externally-Run Validations` —— 仅在某条验收标准显式要求时出现（例如对真实下游仓库跑验证）

#### 4.1.10 Report（`report.json`）

机器可读的总结。Schema：

```yaml
task_id: <string>
goal: <string>
final_stage: spec | design | execute | review | test | commit_gate
commit_decision: pass | needs_human_review | fail
artifacts:
  requirement: <path>
  contract: <path>
  design: <path>
  task_breakdown: <path>
  implementation_notes: <path>
  review: <path>
  resident_review: <path>
  test_report: <path>
  baseline_evidence: <path>
  current_evidence: <path>
  baseline_diff: <path>
  commit_summary: <path>
metrics:
  llm_calls: <int>
  duration_seconds: <int>
  retries: <int>
created_at: <iso>
finished_at: <iso>
```

`commit_decision: needs_human_review` 是必需的第三态（与 `pass` / `fail` 并列）。实现必须允许 Reviewer 或 PM 设置该状态：当变更不失败但有架构层影响时（如 schema 迁移、新依赖、license 相关变更），应进入此态。

#### 4.1.11 State（`state.json`）

必须可由文件系统工件推导得出；实现应将其视为缓存。Schema：

```yaml
task_id: <string>
current_stage: <stage-enum>
current_owner: <role-enum>
status: active | blocked | completed | aborted
created_at: <iso>
updated_at: <iso>
completed_stages: [<stage>, ...]
retry_count: <int>
last_failure_stage: <stage> | null
last_failure_reason: <string> | null
preset: lite | full                                       # v2.1 新增
preset_source: slash_command | prompt_marker | upgrade    # v2.1 新增
preset_set_at: <iso>                                      # v2.1 新增
```

`preset` 三字段的语义见 §6.4 Workflow Preset。

#### 4.1.12 Skill

YAML 文件位于 `.harness/skills/<check>/<lang>.yaml`：

```yaml
name: build | lint | typecheck | test | <custom>
language: <string>          # 例如 node、go、python；不限定枚举
command: <single-line shell>
success_exit_code: 0
env_required: [<binary>, ...]
detail_on_pass: <string>
detail_on_fail_template: <string>   # 必须支持 ${stderr} 替换
fix_hint_template: <string>          # 失败时打印；应给出修复指引
```

实现必须按此 schema 校验每个加载的 skill。

#### 4.1.13 Structure Rule Set（结构规则集）

YAML 文件位于 `.harness/structure-rules.yaml`：

```yaml
file_length:
  max: <int>
  exclude: [<glob>, ...]

unique_implementations:
  - pattern: <glob>
    rule: <natural-language>
    fix_hint: <string>

unique_schemas:
  - pattern: <glob>
    detect: <regex>
    rule: <natural-language>
    fix_hint: <string>

package_dependencies:
  forbid:
    - { from: <glob>, to: <glob> }
  fix_hint: <string>

naming_conventions:
  files: kebab-case | snake_case | camelCase
  classes: PascalCase | snake_case
  constants: UPPER_SNAKE_CASE | ...
```

每条规则在失败时必须给出 `fix_hint`。

#### 4.1.14 Resident Review Agent 定义

YAML 文件位于 `.harness/review-agents.yaml`：

```yaml
review_agents:
  - name: <slug>
    triggers: [pre_push, pre_merge, on_demand]
    model: <model-id>
    prompt: |
      <multi-line prompt>
    blocking_severity: P0   # 此严重级以上的 finding 阻断该触发事件
```

#### 4.1.15 Finding（Pool 条目）

JSONL 行，写入 `.harness/feedback-pool/<date>.jsonl`：

```json
{
  "id": "F-<task_id>-<seq>",
  "kind": "recurrent_pattern",
  "category": "reliability | scalability | security | style | other",
  "summary": "<short>",
  "examples": [{"task": "<task_id>", "file": "<path>", "line": 42}],
  "fix_hint": "<string>",
  "promotable_as": ["lint", "structure_rule", "failed_test", "review_prompt", "skill_fix_hint"]
}
```

#### 4.1.16 Architecture Asset（架构资产）

按 topic 组织、由一个或多个任务晋升而来的设计工件集合。位于 `docs/architecture/<topic>/`（**不在** `.harness/` 下 —— 缘由详见 §22）。

每个 topic 的文件布局：

```
docs/architecture/<topic>/
├── README.md             # topic 总览索引，推荐
├── requirement.md        # 从任务晋升而来
├── design.md             # 从任务晋升而来
├── decisions.md          # ADR 风格的累积决策，可选
└── _harness-meta.json    # 来源元数据（必需）
```

`_harness-meta.json` schema：

```json
{
  "topic": "<slug>",
  "created_at": "<iso>",
  "harness_version": "<spec-version>",
  "source_tasks": [
    {
      "task_id": "<task_id>",
      "goal": "<string>",
      "promoted_files": ["requirement.md", "design.md"],
      "promoted_at": "<iso>",
      "promotion_mode": "new_topic | append | replace"
    }
  ]
}
```

`source_tasks` 必须仅追加 —— 每次晋升追加一条记录。实现不得删除已有条目（来源追溯必须永久保留）。

### 4.2 稳定标识符与归一化规则

- **Task ID**：`YYYYMMDD-HHMMSS-<rand4>`。必须文件名安全且大小写不敏感无冲突
- **Finding ID**：`F-<task_id>-<seq>`。`seq` 是任务内单调递增整数
- **Stage 枚举**：`spec`、`design`、`execute`、`review`、`test`、`commit_gate`
- **Role 枚举**：`pm`、`requirement`、`designer`、`developer`、`reviewer`、`tester`
- **Decision 枚举**：`pass`、`block_execute`、`block_design`、`block_spec`、`defer_to_new_task`、`needs_human_review`
- **Severity 枚举**：`P0`、`P1`、`P2`

## 5. 仓库布局

符合规范的 Harnessly 仓库必须包含：

```
.harness/                                # 机器消费的工作流工件
├── WORKFLOW.md                          # 应：单文件配置（备选：下方拆分形式）
├── （拆分形式，也可接受）
├── harness.config.yaml                  # 全局设置
├── workflow.yaml                        # 阶段定义
├── agents/<role>.yaml × 5               # 每个角色契约
├── skills/<check>/<lang>.yaml           # skill 定义（如 skills/build/go.yaml）
├── structure-rules.yaml                 # 仓库级不变量
├── review-agents.yaml                   # 常驻 review agent
├── feedback-pool/<date>.jsonl           # 累积 finding
├── feedback-history.md                  # 已晋升 finding 账本
├── decisions/<date>-<topic>.md          # 产品层 blocker 决议（§10.5）
├── tasks/<task_id>/
│   ├── requirement.md
│   ├── contract.yaml
│   ├── design.md
│   ├── task-breakdown.md
│   ├── implementation-notes.md
│   ├── review.md
│   ├── resident-review.md
│   ├── test-report.md
│   ├── commit-summary.md
│   ├── report.json
│   ├── state.json
│   └── evidence/
│       ├── baseline.json
│       ├── current.json
│       └── baseline-diff.json
└── events.jsonl                         # 仅追加的结构化事件日志

docs/                                    # 人类消费的文档
└── architecture/<topic>/                # 跨任务架构资产（详见 §22）
    ├── README.md                        # topic 总览
    ├── requirement.md                   # 从任务晋升而来
    ├── design.md                        # 从任务晋升而来
    ├── decisions.md                     # ADR 风格累积，可选
    └── _harness-meta.json               # 来源元数据（来源任务、晋升历史）
```

两个截然不同的域：

- `.harness/` 是**机器消费**：工作流状态、schema 校验过的工件、事件日志。IDE 通常折叠这个目录。Sub-agent 在工具白名单约束下读写
- `docs/architecture/` 是**人类消费**：跨任务长期存活的设计与需求文档，由文档站点工具渲染，每天被 reviewer 与新人浏览。Sub-agent 不得直接写入；只有 `harness archive promote` 系统命令才可写入

实现可在两个域内添加文件，但不得搬迁上述路径，也不得跨域混放（例如不得把架构资产塞进 `.harness/`）。

## 6. 工作流规范

### 6.1 六个默认阶段

| 阶段 | Owner | 读 | 写 | 决议规则 |
|---|---|---|---|---|
| `spec` | requirement | （用户输入） | `requirement.md`、`contract.yaml` | Stop hook 校验 SPEC schema；通过则进 `design` |
| `design` | designer | `requirement.md`、`contract.yaml` | `design.md`（含 Feasibility Self-Check）、`task-breakdown.md` | Stop hook 校验 schema 和自检小节；通过则进 `execute` |
| `execute` | developer | spec + design + task-breakdown | 代码 diff、`implementation-notes.md` | 阶段前 hook 捕获 baseline；阶段后 hook 捕获 current。进 `review` |
| `review` | reviewer + 常驻 agent（并行） | spec + design + diff + notes | `review.md`、`resident-review.md` | Reviewer Decision 路由：`pass` → `test`；`block_*` → PM 按 Decision 回退；`defer_to_new_task` → PM 创建新任务 |
| `test` | tester | `contract.yaml`、diff | `test-report.md`、`evidence/baseline-diff.json` | 所有验收标准 PASS 且 baseline-diff 无新增失败 → `commit_gate` |
| `commit_gate` | pm | 全部前置工件 | `commit-summary.md`、`report.json` | 最终决议：`pass` / `needs_human_review` / `fail` |

### 6.2 阶段迁移与回退

PM 必须严格按各阶段 owner 的 `Decision` 路由：

- `pass` → 进入线性顺序的下一阶段
- `block_execute`（来自 reviewer）→ 回到 `execute`；既有 diff 保留（Developer 原地修改）
- `block_design` → 回到 `design`；既有 diff 不直接丢弃，但 `design.md` 重写；下一次 `execute` 时 Developer 必须重做与新 design 一致的工作
- `block_spec` → 回到 `spec`；`design.md` 与所有 diff 全部作废，必须重写
- `defer_to_new_task` → PM 创建新任务并加链接引用；当前任务收尾，`final_stage: review`、`commit_decision: deferred`
- `needs_human_review`（来自 reviewer 或 commit_gate）→ PM 暂停工作流，写 `commit-summary.md`，把控制权交回用户

回退范围：

- `minimal`（默认）：只需修复列出的 P0 finding；列表外的 diff 范围被冻结
- `full`：阶段从头重做；既有工件归档到 `tasks/<task_id>/archive/<stage>-attempt-<n>/`

### 6.3 PM 路由规则

PM 是宿主**主 agent**，不是独立 sub-agent。PM 必须：

- 决策下一阶段前读取所有阶段产物与 `state.json`
- 通过宿主原生机制 spawn 下一角色的 sub-agent
- 不得为非自己角色产出内容（模板化工件如 `commit-summary.md` 例外，因为它是纯粹聚合而非专业判断）
- 不得跳过阶段或更改角色分配
- 任何角色发出 `product_layer_blocker`（参 §10.5）时必须暂停工作流并向用户报告

### 6.4 Workflow Preset

#### 6.4.1 动机与默认

§6.1 定义的六阶段工作流是任务**最完整**形态。但并非每个任务都需要全套工件：1 行 bug fix 不需要独立 `design.md`，文档微调不需要独立 `review.md`。强制走六阶段会带来 token 浪费与体验阻力，削弱本规范在日常使用中的可持续性。

为此，符合规范的实现必须支持 **Workflow Preset** 机制：每个任务在创建时被绑定到一个 preset，preset 决定该任务实际跑过哪些阶段。**默认 preset 必须是 `lite`**。

#### 6.4.2 Preset 与阶段映射

实现必须支持以下两个内建 preset：

| Preset | 阶段子集 | 适用场景 |
|---|---|---|
| `lite`（默认） | `spec` → `execute` → `test` | 单点 bug fix、文档微调、配置调整、单文件小改 |
| `full` | `spec` → `design` → `execute` → `review` → `test` → `commit_gate` | 用户显式声明的 feature 任务、跨模块改动、架构相关变更 |

`lite` preset 中：

- `spec` 阶段仍然产出 `requirement.md` 与 `contract.yaml`，但 `requirement.md` 的 `## Acceptance Criteria` 必需，其他小节（`## Risks` / `## Open Questions`）可省略
- `execute` 阶段产出代码 diff 与 `implementation-notes.md`（后者必需）
- `test` 阶段产出 `test-report.md`，可省略 `## Externally-Run Validations` 小节
- **不**产出 `design.md`、`task-breakdown.md`、`review.md`、`commit-summary.md`、`report.json`
- 任务关闭由 `test` 阶段 PASS 直接终止，不进入 `commit_gate`

`full` preset 行为与 §6.1 完全一致，**本规范前 §1–§5、§7–§22 中所有"必须"约束在 `full` preset 下不变**。

#### 6.4.3 触发机制

Preset 必须由用户**显式声明**。实现必须支持以下声明方式（按优先级）：

1. **Prompt marker**（默认路径，跨宿主兼容）：
   - prompt 文本包含子串 `[harness:feat]`（大小写不敏感）→ preset = `full`
   - 否则 → preset = `lite`
2. **宿主原生 slash command**（可选；视宿主能力而定）：
   - 若宿主支持 file-based slash command 模板（命令展开为 prompt 注入到下一轮 hook），可注册 `/harness-feat <goal>` 命令，展开为 `[harness:feat] {{args}}`
   - 实现必须将命令模板放在 `.harness/hosts/<host>/commands/`，由 `harness host install` 同步到宿主原生路径

> **v2.1 实施备注（C 方案修订）**：Claude Code 2.x 当前**不**支持 file-based slash command 模板（`.claude/commands/*.md` 不被识别；其 slash command 等同于 Skills 系统，路径在 `~/.claude/skills/<name>/SKILL.md` —— 与 v3-core "禁止写入用户 home 目录" 硬约束冲突）。故 v2.1 参考实现仅落地 marker 路径，不渲染 `.claude/commands/*.md`。若未来 Claude Code 引入 file-based slash command，可补 commands renderer 即可，本节其他规范不变。

实现**不得**通过分析 prompt 关键词、文件命中、风险词清单等启发式手段自动升档。Preset 是用户的显式决策，实现不得代为推断。

命名遵循"用户层语义化 / 实现层结构化"两层映射：用户层使用 `feat`（贴合 conventional commits 与"这是个 feature 任务"的直觉），实现层使用 `lite` / `full`（贴合阶段子集语义）。两层不得相互替换。

#### 6.4.4 lite 模式必须保留的物理护栏

无论 preset 取值，以下四项物理护栏**必须**在每个任务上启用，不受阶段裁剪影响：

| 护栏 | 触发点 | 来源章节 |
|---|---|---|
| **baseline-diff** | `execute` 阶段前后各采集一次 evidence，gate 按 §16.3 应用 | §16 |
| **scope-check** | 每次 `execute` 阶段末 + `completion-gate` hook | §11 |
| **structure-check** | 每次 `execute` 阶段末 | §12 |
| **跨任务发现（prompt assembler 注入 `docs/architecture/`）** | `spec` 阶段开始时 | §22.5 |

`lite` 模式可省 sub-agent 数量与 markdown 工件数量，**不得**省以上四项。

**角色实现方式**：`lite` preset 下，spec / execute / test 三阶段对应的逻辑角色（requirement / developer / tester）由主 agent 直接承担，**不**要求 spawn 独立 sub-agent。§7 中各角色的工具白名单与产物归属约束仍适用，但由 artifact-guard 与 Stop hook 对主 agent 直接强制，而非通过 sub-agent 隔离实现。§8 关于 sub-agent 物理实例化的全部要求**仅适用于 `full` preset**。

§14 常驻 review agents 与任务工作流相互独立（由宿主生命周期事件触发），**不**受 preset 影响。

#### 6.4.5 升档（upgrade）

实现必须提供 `harness upgrade` CLI 命令（宿主 slash command `/harness-upgrade` 可选；视宿主能力而定，见 §6.4.3 v2.1 实施备注），用于把 active task 的 preset 从 `lite` 切换为 `full`。升档语义：

1. 任务的 `state.json` 中 `preset` 字段更新为 `full`
2. 既有 `requirement.md`、`contract.yaml`、代码 diff、`implementation-notes.md`（如已产出）**必须保留**，不得作废
3. 工作流回到 `design` 阶段：Designer sub-agent 必须基于既有产物补出 `design.md` 与 `task-breakdown.md`
4. 之后依次进入 `review` → `test` → `commit_gate`，§6.1 完整链路

升档**仅可发生一次**。已升档为 `full` 的任务不得再次升档，也不得降档。

#### 6.4.6 不允许降档

实现**不得**提供把 `full` 任务降档为 `lite` 的机制。理由：`full` preset 一旦启动，意味着已经产出或即将产出 `design.md` / `review.md` 等架构性工件，降档会让既有审查证据失效。如确实选错，用户应**关闭当前任务**并以 `lite` 重建。

#### 6.4.7 状态与事件记录

`state.json` 必须新增字段（schema 版本由 `v2.0` 升至 `v2.1`，见附录 B）：

```yaml
preset: lite | full
preset_source: slash_command | prompt_marker | upgrade
preset_set_at: <iso-timestamp>
```

`events.jsonl` 必须在以下时机追加事件：

```json
{ "type": "task.preset_set",      "task_id": "...", "preset": "lite|full", "source": "slash_command|prompt_marker" }
{ "type": "task.preset_upgraded", "task_id": "...", "from": "lite", "to": "full" }
```

事件用于事后复盘"哪些 lite 任务最终升档"的统计，作为 preset 默认策略调整的依据。

#### 6.4.8 跨宿主一致性

**Marker 路径必须对所有宿主统一**（`[harness:feat]` 字面常量是规范，跨宿主一致）。

slash command 路径**仅对支持 file-based slash command 模板的宿主可选**（见 §6.4.3 v2.1 实施备注：Claude Code 2.x 当前不支持，因此参考实现仅落 marker；其他宿主若支持，命令模板放 `.harness/hosts/<host>/commands/`，由 `harness host install` 同步）。

不支持自定义 slash command 的宿主**应**支持 §6.4.3 中的 prompt marker fallback。实现可在 `harness host install` 时检测并向用户告知 fallback 状态。

#### 6.4.9 与既有章节的关系

| 既有章节 | 在 `lite` 模式下的状态 |
|---|---|
| §4.1.4 `design.md` 必需 | **解除**（`lite` 不产出） |
| §4.1.5 `task-breakdown.md` 必需 | **解除** |
| §4.1.7 `review.md` 必需 | **解除** |
| §4.1.10 `report.json` 必需 | **解除**（但 `test-report.md` 仍必需） |
| §6.1 六阶段固定顺序 | **解除**（`lite` 跑 `spec` → `execute` → `test`） |
| §10.1 下游不得修改上游工件 | **保留** |
| §10.3 角色契约物理强制 | **保留**（对参与的 3 个角色仍适用） |
| §11 scope-check | **保留** |
| §12 structure-check | **保留** |
| §16 baseline-diff | **保留** |
| §22.5 跨任务发现 | **保留** |

未在上表列出的所有约束默认**保留**。

#### 6.4.10 一致性

符合规范的实现必须：

- 支持 `lite` 与 `full` 两个内建 preset
- 默认 preset 必须是 `lite`
- 通过 slash command 或 prompt marker 实现 §6.4.3 的显式声明机制
- 不得通过启发式手段自动升档
- 在 `lite` 模式下保留 §6.4.4 列出的四项物理护栏
- 提供 `harness upgrade` / `/harness-upgrade` 升档机制
- 不得提供降档机制
- 在 `state.json` 与 `events.jsonl` 中按 §6.4.7 记录 preset 状态

符合规范的实现**应**：

- 在创建 `lite` 任务时向用户提示"如需 design / review 阶段，使用 `/harness-upgrade`"
- 提供按 preset 统计 `events.jsonl` 的工具（如 `harness stats preset`），便于团队复盘默认策略合理性

符合规范的实现**可**：

- 定义额外的 preset（如 `standard`），但必须文档化其阶段子集与默认触发条件
- 提供按文件路径 / 改动半径在 execute 阶段**警告**（不强制）用户"该任务可能更适合 `full`"，作为辅助提示

## 7. 角色规范

每个角色必须实现为带工具白名单的宿主原生 sub-agent，工具白名单由宿主权限系统强制（PreToolUse hook 或等价机制）。

### 7.1 PM（宿主主 agent）

| 属性 | 取值 |
|---|---|
| 模型 | 推荐：便宜的路由级模型（如 Haiku） |
| 允许工具 | spawn_subagent、read、bash_readonly、写入 `commit-summary.md` 与 `state.json` |
| 禁止工具 | 编辑/写入任何其它工件、plan_mode |

### 7.2 requirement

| 属性 | 取值 |
|---|---|
| 模型 | 中档（如 Sonnet） |
| 允许工具 | read、grep、glob、bash_readonly、plan_mode（仅当 `plan_mode.enabled: true` 时） |
| 禁止工具 | 编辑/写入源码 |
| 输出 | `requirement.md` + 派生 `contract.yaml` |
| Stop-hook 检查 | SPEC schema 合规 + 无模糊词 |

### 7.3 designer

| 属性 | 取值 |
|---|---|
| 模型 | 中档（如 Sonnet） |
| 允许工具 | read、grep、glob、bash_readonly、plan_mode（与 requirement 相同 gating） |
| 禁止工具 | 编辑/写入源码；写入除 `design.md` 与 `task-breakdown.md` 之外的内容 |
| 输出 | `design.md`、`task-breakdown.md` |
| Stop-hook 检查 | Feasibility Self-Check 小节存在 + 至少对比两种备选方案 + 无前向引用 |

### 7.4 developer

| 属性 | 取值 |
|---|---|
| 模型 | 高档（Sonnet 或 Opus） |
| 允许工具 | read、edit、write、bash、grep、glob |
| 禁止工具 | plan_mode（必需禁止；进入 plan_mode 与该角色目的冲突）；写入 spec/design/contract/task-breakdown；写入 `design.md` 未声明的仓库级资产 |
| 输出 | 代码 diff、`implementation-notes.md`、由 design 声明的可选仓库级资产 |
| Stop-hook 检查 | scope-check（按 `contract.yaml`）、structure-check（按 `structure-rules.yaml`）、`implementation-notes.md` schema 合规、baseline-diff 捕获 |

Developer 必须在工作过程中更新 `task-breakdown.md` 复选框。Stop 时未把所有子任务标完成 → reviewer 自动拒绝。

### 7.5 reviewer

| 属性 | 取值 |
|---|---|
| 模型 | 中档（Sonnet） |
| 允许工具 | read、grep、glob、bash_readonly |
| 禁止工具 | 编辑/写入除 `review.md` 之外的任何内容 |
| 输出 | `review.md`，含明确 Decision 和 Block Scope |
| 必需行为 | 每条 finding 必须含稳定 ID、严重级、修复 hint、`recurrent_pattern` 标志。被标 `recurrent_pattern` 的 finding 必须追加到当日的 `feedback-pool/<date>.jsonl` |

### 7.6 tester

| 属性 | 取值 |
|---|---|
| 模型 | 中档（Sonnet） |
| 允许工具 | read、bash、仅对测试文件与 `test-report.md` 编辑/写入 |
| 禁止工具 | 编辑/写入非测试源码 |
| 输出 | `test-report.md`、`evidence/baseline-diff.json` |
| 必需行为 | 必须验证 `contract.yaml` 中每条验收标准。除非某条验收标准显式要求，不得跑外部/沙箱外验证 |

## 8. Sub-agent 实例化

**本节适用范围**：以下要求仅适用于 `full` preset（§6.4）。在 `lite` preset 下，spec / execute / test 三阶段对应的逻辑角色（requirement / developer / tester）由主 agent 直接承担，不要求实例化 sub-agent；详见 §6.4.4「角色实现方式」。

在 `full` preset 下，5 个角色 sub-agent（PM 是宿主主 agent，不是 sub-agent）必须通过宿主原生 sub-agent 机制实例化。**禁止**单 agent 切换角色：符合规范的实现必须保证角色间冷上下文隔离，否则：

- Reviewer 无法做独立审计（看过 designer 的推理过程）
- 无法做角色级模型分层
- 无法做角色级工具白名单

Claude Code：`.claude/agents/harness-<role>.md`，含 `model:` 与 `tools:` frontmatter。
Codex：`.codex/agents/harness-<role>.toml`，等价字段。
对于无原生 sub-agent 的宿主：实现可降级到 `host-compat` 3 角色配置（requirement / developer / tester 合并到主 agent），但必须向用户给出警告，说明角色分离仅是建议性的而非强制的。**`host-compat` 与 §6.4 的 `lite` preset 概念不同**：`lite` preset 是用户的任务级显式声明（与宿主能力无关），`host-compat` 是宿主能力不足时的兜底降级。在支持 sub-agent 的宿主上跑 `full` preset 任务时不得退化为 `host-compat`。

Sub-agent 必须仅通过磁盘工件通信。禁止 sub-agent → sub-agent 直接调用。

## 9. Plan Mode

Plan mode（Claude Code 的 `/plan` 及等价物）对所有角色均为可选且默认关闭。

如果某角色启用了 plan mode（仅 `requirement` 与 `designer` 可启用），实现必须满足全部以下条件：

1. plan body 必须作为单独工件持久化（如 `requirement-plan.md`）
2. 用户必须**逐条**review 并 approve plan。不得接受批量 approve
3. 在 plan 被 approve 前，sub-agent 不得推进到产出结构化工件

`developer`、`reviewer`、`tester`、`pm` 以及任何不存在的角色，无论配置都不得进入 plan mode。

理由：未经审查的 plan 等于编码错误指令。如果团队没有审查 plan 的纪律，plan mode 应保持关闭。

## 10. 五条协作纪律

下列纪律具备规范性，必须由宿主适配器或工作流引擎强制执行。

### 10.1 纪律 1：下游不得修改上游工件

- 每个工件有且仅有一个 Owner 角色
- 宿主必须物理阻止（PreToolUse hook）任何角色写入它不拥有的工件
- 下游角色若不同意上游工件，必须 emit blocker；PM 必须把流程回退到上游 owner

### 10.2 纪律 2：PM 是路由器，不是大脑

PM 不得产出专业内容（不写需求、不做设计选择、不写代码）。PM 可做纯粹聚合：填充 `commit-summary.md` 模板、追加 `board.md`（若实现选择维护）、记录路由决策。

### 10.3 纪律 3：角色契约是物理的，不是建议的

角色工具白名单、工件归属、stop-hook 校验必须由宿主适配器强制执行。仅 prompt 级别的告诫不够。

**实现路径（参考性，非规范性）**：物理强制通常分两层落地——

- **CLI 业务层**（如 `harness host completion-gate`、`harness host artifact-guard`）只输出**业务字段**（`pass: false`、违规详情、推荐 sub-agent、blockCount 等）；不知道也不应该知道宿主协议的具体字段名
- **宿主 hook script 协议层**（如 `.harness/hosts/<host>/hooks/stop.js`、`pre_tool_use.js`，由 `packages/hosts/<host>/src/index.ts` codegen 生成）作为**协议翻译层**，把 CLI 业务字段翻译为 Claude Code `{ decision: 'block', reason }` / Codex 等价字段

两层分离的好处：CLI 不必跟着宿主版本走、hook script 不必关心检测逻辑、新宿主接入只需新增 hook script renderer 与 host manifest。**反模式**：在 CLI 输出宿主协议字段（耦合宿主版本），或在 hook script 重复检测逻辑（与 CLI 分裂）。

参考实现见 `packages/hosts/claude-code/src/index.ts` 的 `buildCompletionDecision` / `renderClaudeCodePreToolUseHook`。

### 10.4 纪律 4：Reviewer 打回必须分类

Reviewer 的 Decision 必须是以下之一：`pass`、`block_execute`、`block_design`、`block_spec`、`defer_to_new_task`、`needs_human_review`。单纯「拒绝」是禁止的 —— PM 没法据此路由。

### 10.5 纪律 5：产品层 blocker 必须升给用户

任何角色检测到 v3-core 规范或工作流定义存在真空，需要跨产品判断（如「这个资产是仓库级的；谁负责写？」），必须 emit `product_layer_blocker` 并暂停。PM 不得自动消化。决议必须记录到本规范（如属于规范遗漏）或 `.harness/decisions/<date>-<topic>.md`（如属项目特定决策）。

## 11. Scope 检查

输入：
- `contract.yaml` 的 `scope.exclude`（拒绝列表 glob）
- 变更文件（通过 `git diff <baseline-ref> HEAD` 计算）

算法（必需）：

```
for f in changed_files:
    for pattern in scope.exclude:
        if f matches pattern:
            return FAIL(out_of_scope, file=f, pattern=pattern)
return PASS
```

实现不得把 `scope.include` 用作允许列表。`scope.include` 仅是展示用的期望列表。

## 12. 结构检查

实现必须在每次 Execute 阶段末跑结构检查。失败必须阻断到 `review` 的迁移。

必需的规则种类：

- `file_length.max` —— 任何文件超过行数（除列出的 glob 外）
- `unique_implementations` —— 当 `pattern` 中两个文件导出同名函数时失败
- `package_dependencies.forbid` —— 当 `from` glob 中的 import 命中 `to` glob 时失败

可选规则种类：`unique_schemas`、`naming_conventions`。

每条规则失败时必须包含规则定义中的 `fix_hint`。

## 13. Skill 规范

### 13.1 加载

实现必须按 `(check, language)` 对解析 skill，查找 `.harness/skills/<check>/<language>.yaml`。

文件不存在：skill 标记为 `skipped`（不是 failed）。check 返回状态 `skipped`，detail 为 `skill 未配置`。

### 13.2 校验

加载的 YAML 必须按 §4.1.12 schema 解析校验。校验失败必须抛错并暂停工作流。

### 13.3 执行

算法：

```
for bin in skill.env_required:
    if not which(bin):
        return EvidenceCheckResult(status=failed, detail=f"缺少必要二进制：{bin}", fix_hint=skill.fix_hint_template)

result = exec(skill.command, cwd=workdir)
if result.exit_code == skill.success_exit_code:
    return EvidenceCheckResult(status=passed, detail=skill.detail_on_pass)
else:
    return EvidenceCheckResult(
        status=failed,
        detail=skill.detail_on_fail_template.replace("${stderr}", result.stderr.strip()),
        fix_hint=skill.fix_hint_template,
    )
```

Skill 必须在任务工作区中执行（实现支持 worktree 时使用 worktree，否则在仓库根）。

## 14. 常驻 Review Agent

常驻 review agent 与任务工作流相互独立。实现必须把它们注册到宿主生命周期事件。

必需触发器：至少 `pre_merge`。推荐触发器：`pre_push`。

每次触发事件：

1. 对每个 `triggers` 含该事件的 agent，spawn 该 agent 并传入 prompt + diff 上下文
2. 每个 agent emit finding（与 reviewer finding schema 相同）
3. Finding 汇总到 `tasks/<active-task-id>/resident-review.md`
4. 被标 `recurrent_pattern` 的 finding 追加到 `feedback-pool/<date>.jsonl`
5. 任何 P0 finding 命中 `blocking_severity` 时，触发事件必须被阻断（如 `pre_merge` 返回非零）

常驻 review agent 必须并行运行，且应不阻塞任务工作流主路径。

## 15. 反馈晋升

晋升 CLI 命令必须：

1. 扫描 `feedback-pool/` 下所有文件
2. 按相似度启发式将 finding 分组（推荐：`category` + summary 三元组匹配）
3. 展示每组的计数，并询问用户晋升目标：
   - `lint` / `structure_rule` → 追加到 `structure-rules.yaml`
   - `failed_test` → 生成单条失败断言的测试文件并引用 finding；developer 必须实现修复使其通过
   - `review_prompt` → 追加到匹配 `review-agents.yaml` agent 的 prompt
   - `skill_fix_hint` → 增强匹配 skill 的 `fix_hint_template`
   - `dismiss` → 从 pool 移除，记入 `feedback-history.md` 并附原因
4. 晋升后必须把已处理 finding 从 `feedback-pool/` 移到 `feedback-history.md`
5. 不得在没有人工确认每组的情况下自动晋升

阈值默认：3 次。实现可允许 `--threshold` 覆盖。

## 16. Evidence 与基线对比

### 16.1 捕获点

实现必须为每个任务捕获两次快照：

- `evidence/baseline.json` —— 在 Developer 做任何改动之前捕获（`design` 阶段后、`execute` 之前）
- `evidence/current.json` —— 在 Developer 完成之后捕获（`execute` 阶段后、`review` 之前）

每次快照应至少记录：

```yaml
captured_at: <iso>
checks:
  - name: build|lint|typecheck|test|<custom>
    status: passed|failed|skipped
    command: <string>
    duration_ms: <int>
    test_count: <int?>            # 仅 test check
    detail: <string>
lint_warnings_total: <int>
todo_count: <int>
git_dirty_files: <int>
```

### 16.2 差量计算

`evidence/baseline-diff.json` 计算如下：

```
for check in baseline.checks ∪ current.checks:
    diff[check] = {
      from: baseline[check].status,
      to: current[check].status,
      regression: (baseline.status == passed AND current.status == failed)
    }
diff.lint_warnings_delta = current.lint_warnings_total - baseline.lint_warnings_total
diff.todo_delta = current.todo_count - baseline.todo_count
```

### 16.3 Gate 规则

Commit Gate 必须失败的条件：

- 任何 check 的 `regression == true`
- `lint_warnings_delta > 0` 且 `implementation-notes.md` 中未给出说明
- `todo_delta > 0` 且新增 TODO 未在 `implementation-notes.md` 的 `## TODOs Introduced` 小节中列出

预先存在的失败（baseline 与 current 同时 failed）不阻断 —— 它们不是本任务引入的。这是对「这是历史遗留问题」糊弄的明确防御。

## 17. 宿主适配器规范

宿主适配器是 v3-core 抽象模型与具体宿主（Claude Code、Codex、Gemini CLI 等）的翻译层。

符合规范的宿主适配器必须：

1. 提供注册 5 个角色 sub-agent 的方式
2. 提供强制角色级工具白名单的方式（PreToolUse hook 或等价机制）
3. 提供 Stop-hook 等价物用于工件校验
4. 提供生命周期 hook 注册以支持常驻 review agent 触发
5. 提供主 agent（兼任 PM）spawn sub-agent 的方式

无原生 sub-agent 支持的宿主可提供「lite」适配器：单 agent 通过 prompt 切换模拟所有角色，并向用户清楚警告角色分离仅为建议性而非强制。

## 18. Memory 边界

按会话的 memory 或宿主管理的长期 memory 不得作为任何工件、规则或决策的权威源。仓库（`.harness/` 加源码）是唯一真理源。

按用户的偏好（语言、shell、输出格式）可使用 memory 提升人体工效，但团队对齐内容必须落仓库：

- 重复出错 → 晋升到 `structure-rules.yaml` 或失败测试
- 架构决策 → `.harness/decisions/<date>-<topic>.md`
- 编码约定 → `structure-rules.yaml` 或 `review-agents.yaml`

## 19. 一致性

符合规范的 Harnessly v3-core 实现必须：

- 产出 §4 中所有必需工件，schema 与 §4 一致
- 通过宿主强制（而非 prompt 级）机制满足全部五条协作纪律（§10）
- 实现六阶段工作流（§6）且不跳过、不重排
- 把 `commit_decision` 视为三态：`pass` / `needs_human_review` / `fail`
- 拒绝 `requirement` 与 `designer` 之外角色进入 plan mode，不论配置
- 拒绝 spec/design 中含模糊词或前向引用
- 计算 baseline-diff 并按 §16.3 应用 gate 规则

符合规范的实现应：

- 提供结构检查、常驻 review agent、反馈晋升（v3-core 差异化）
- 支持跨宿主运行（至少 2 个宿主）
- 仅在 `.harness/` 中持久化全部状态 —— 无数据库、无用户 home 目录写入
- 重启后从文件系统恢复任务状态

符合规范的实现可：

- 提供 CLI fallback 用于无宿主操作（headless 模式）
- 提供 Symphony 适配器，使其在跨任务层可被 [openai/symphony](https://github.com/openai/symphony) 调度
- 添加自定义 check 种类、自定义常驻 review agent、自定义 skill 语言
- 维护 `.harness/dev-map.md` 与 `.harness/board.md` 提供项目级导航（仅推荐用于长期演进的项目）

## 20. 参考实现

本规范语言无关。参考实现位于 [agent-harnessly](https://github.com/lijianfeng/agent-harnessly)，TypeScript 编写，含 Claude Code 与 Codex 宿主适配器。

推荐通过以下方式构建其它实现：

- 把本 SPEC 喂给你喜欢的 coding agent：「按 docs/spec/v3-core.md 实现 Harnessly v3-core。」
- 选择不同的语言（Python / Go / Rust）和宿主（如内部 IDE agent）
- 显式记录任何 `Implementation-defined` 决策

两个实现足以验证 SPEC 的可移植性。我们欢迎贡献额外的适配器和参考实现。

## 21. 与 Symphony 的组合

与 [openai/symphony](https://github.com/openai/symphony) 一起部署时：

- Symphony 调度并把 issue 派发到任务级隔离工作区
- 在每个工作区内，Harnessly 治理 in-task 工作流（即本规范）
- Symphony 的 `WORKFLOW.md`（issue 级工作流）与 Harnessly 的 `WORKFLOW.md`（任务内契约）是两份**不同**文件；实现可共置但不得混淆
- Symphony 的 `Human Review` handoff 状态对应 Harnessly 的 `commit_decision: needs_human_review`

双层组合推荐用于「issue 量大的团队」；单层 Harnessly-only 推荐用于个人开发者与小团队。

## 22. 知识资产晋升

部分任务会产出未来任务必须引用的设计或需求文档（例如 OAuth 集成设计会被后续每个 OAuth 相关任务参考）。v3-core 把这类文档视为**头等的人类消费资产**，存放于 `docs/architecture/<topic>/`，而不是埋在 `.harness/tasks/<id>/` 里。

本机制与 §15 反馈晋升平行：§15 把重复出现的 review finding 晋升为永久护栏（lint / test / 结构规则）；§22 把任务产出的设计工件晋升为永久参考文档。

### 22.1 域分离

| 域 | 受众 | 写权限 | 生命周期 |
|---|---|---|---|
| `.harness/tasks/<task_id>/` | Sub-agent（机器消费） | 阶段 owner（按角色契约） | 任务级；任务关闭时归档 |
| `docs/architecture/<topic>/` | 人（PR reviewer、新人、文档站点） | 仅 `harness archive promote` 系统命令 | 永久项目资产；跨任务存活 |

跨域规则：

- Sub-agent 不得写入 `docs/architecture/`。角色工具白名单必须排除该路径
- `harness archive promote` 系统命令是唯一写入路径。它是与 `harness init` / `harness feedback promote` 同级的系统行为，不是 agent 行为
- `docs/architecture/` 位置是必需的。实现不得把资产晋升到 `.harness/architecture/` 或任何其它路径；这样做会违反本节定义的人类消费/机器消费分离

### 22.2 两条晋升路径

#### 22.2.1 声明式（推荐）

在 SPEC 阶段，`requirement` 角色（结合用户输入）在 `contract.yaml` 中设置 `asset_promotion`：

```yaml
asset_promotion:
  promote: true
  topic: oauth-integration
  files: [requirement.md, design.md]
  mode: new_topic           # 或：append、replace
```

当 `commit_gate` 达到 `commit_decision: pass` 时，PM 必须自动调用 `harness archive promote <task_id>`。该命令：

1. 读取 `contract.yaml.asset_promotion`
2. 解析目标目录：`docs/architecture/<topic>/`
3. 对 `files` 中的每个文件，从 `.harness/tasks/<task_id>/<file>` 复制到目标目录
4. 更新 `_harness-meta.json`（不存在则创建），追加新的 `source_tasks` 条目
5. 在 `tasks/<task_id>/commit-summary.md` 的 `## Promoted Assets` 小节记录晋升

`commit_decision` 为 `needs_human_review`、`fail` 或 `deferred` 时不得晋升。

在 `lite` preset（§6.4）下，因不存在 `commit_gate` 阶段，声明式晋升的触发点改为 `test` 阶段 PASS 后立即触发；其他语义不变。命令式晋升（§22.2.2）不受 preset 影响。

#### 22.2.2 命令式（兜底）

用户可在任意时刻手动触发晋升：

```bash
harness archive promote <task_id> --topic=<slug> --files=design.md,requirement.md [--mode=append]
```

该路径绕过 `contract.yaml.asset_promotion`，用于事先未声明、事后判定有价值的情况。

### 22.3 晋升模式

| 模式 | 目标 topic 已存在时的行为 |
|---|---|
| `new_topic` | topic 目录已存在时必须失败。用于首次创建 |
| `append` | 同名文件已在目标位置时，新文件写为 `<base>-vN.md`（N 从 2 起取下一可用值）。`_harness-meta.json` 记录两份 |
| `replace` | 覆盖目标文件。旧版本移到 `_archive/<iso>/`。仅推荐用于 typo 修复；不应用于设计变更 |

### 22.4 README.md 自动生成

每次 topic 被创建或更新时，系统命令必须按模板重新生成 `docs/architecture/<topic>/README.md`，包含：

- topic 名称与创建日期
- 组成文件列表与一行描述
- 来源任务摘要（从 `_harness-meta.json` 取 task ID 和目标）
- 最后一次晋升时间戳

用户可手动编辑 `README.md`；后续重新生成必须保留 `<!-- harness:auto-start -->` 与 `<!-- harness:auto-end -->` 标记之间的内容。标记之外的内容由人持有，永远不被覆盖。

### 22.5 跨任务发现

对任何新任务，`requirement` 与 `designer` 角色使用的 prompt assembler 应扫描 `docs/architecture/`，并把名称与本任务 `goal` 关键字重叠的 topic 的 README.md（topic 数量较少时可注入完整内容）注入。

这让既有架构决策对下一任务自动可见，无需手动搜索。实现可使用简单关键字匹配；语义检索为可选。

### 22.6 CLI 命令

符合规范的实现必须提供：

- `harness archive promote <task_id> [--topic=<slug>] [--files=<list>] [--mode=<mode>]`
- `harness archive list` —— 列出每个 topic 及其文件数、来源任务数、最后晋升日期
- `harness archive show <topic>` —— 打印 README.md 并列出该 topic 的所有文件与来源任务

符合规范的实现应提供：

- `harness archive verify` —— 检查每个 topic 的 `_harness-meta.json` 中 `source_tasks` 引用的 `task_id` 是否真实存在或已归档；报告孤儿 topic

### 22.7 为什么放在 `docs/` 而非 `.harness/`

域分离基于三个理由：

1. **可发现性**：开发者、PR reviewer、新人每天读 `docs/`；`.harness/` 通常被 IDE 折叠并被忽略。把架构决策埋在 `.harness/architecture/` 等于让它们失效
2. **工具兼容性**：文档站点（Docusaurus、MkDocs、GitHub Pages）按惯例识别 `docs/`。架构资产可自然渲染；`.harness/` 下的资产需要自定义配置
3. **生命周期对齐**：`.harness/` 工件是经 schema 校验的 sub-agent 机器输出。`docs/architecture/` 是人维护的长期设计叙述。混放会模糊归属并使 Stop-hook 校验复杂化

### 22.8 与 §10.5（`.harness/decisions/`）的关系

`.harness/decisions/<date>-<topic>.md`（在 §10.5 引入）与 `docs/architecture/<topic>/` 服务不同目的：

| | 颗粒度 | 生命周期 | 来源 | 受众 |
|---|---|---|---|---|
| `.harness/decisions/` | 一条离散决策（一段话） | 仅追加账本 | 产品层 blocker 决议 | 项目维护者，调试工作流本身 |
| `docs/architecture/` | 一个 topic 的完整设计叙述 | 追加 + 编辑 | 晋升的任务工件 | 所有使用该代码库的开发者 |

两者可共存；实现不得将其合并。

## 附录 A. 术语表

- **Stage（阶段）**：六个固定流水线阶段之一
- **Role（角色）**：六个逻辑参与方之一（PM + 5 个 sub-agent 角色）
- **Sub-agent**：执行一个角色、上下文冷启动的宿主原生实例
- **Artifact（工件）**：阶段产出的 `tasks/<task_id>/` 下文件
- **Skill**：YAML 定义的 check（build、lint、typecheck、test、自定义）
- **Finding**：含稳定 ID、严重级、修复 hint 的结构化 review 问题
- **Promotion（晋升）**：把重复 finding 转为永久护栏（lint、test、结构规则等）
- **Baseline-diff（基线对比）**：执行前与执行后 evidence 快照之间的差量
- **Architecture Asset（架构资产）**：按 topic 组织、位于 `docs/architecture/<topic>/` 的长期存活设计工件集合，由一个或多个任务晋升而来。详见 §22
- **Asset Promotion（资产晋升）**：由 `harness archive promote` 系统命令把选定任务工件（`requirement.md`、`design.md` 等）复制到 `docs/architecture/<topic>/` 的机制。与 §15 反馈晋升（针对护栏）性质不同。详见 §22
- **Workflow Preset**：任务级流程档位声明。`lite`（默认）跑 spec → execute → test 三阶段，由主 agent 直接承担角色；`full`（用户通过 `/harness-feat` 显式触发）跑完整六阶段并实例化 5 个角色 sub-agent。详见 §6.4
- **host-compat（宿主兼容降级）**：对不支持原生 sub-agent 的宿主，把 `full` preset 任务的 5 角色合并到主 agent 执行的兜底模式。**与 `lite` preset 概念不同**：`lite` 是用户的任务级声明，`host-compat` 是宿主能力不足时的实现层降级。详见 §8

## 附录 B. 版本管理

本规范为 `v3-core 草案 1`。向后不兼容的变更必须主版本号升级。在既有 schema 上新增必需字段必须次版本号升级。

### B.1 修订记录

| 版本 | 变更 | 章节 |
|---|---|---|
| v2.0 | v3-core 草案 1 初版 | 全文 |
| v2.1 | 引入 Workflow Preset 机制：默认 `lite`，显式 `/harness-feat` 触发 `full`，`state.json` 新增 `preset` / `preset_source` / `preset_set_at` 必需字段；`lite` preset 下三阶段角色由主 agent 直接承担，sub-agent 物理实例化要求仅适用于 `full` preset；为消除命名冲突，§8 中原"lite 3 角色降级配置"更名为 `host-compat`；asset promotion 在 `lite` 模式下触发点改为 `test` 阶段 PASS 后；附录 A 新增 `Workflow Preset` 与 `host-compat` 术语 | §6.4、§6.4.4、§4.1.11、§8、§22.2.1、附录 A |

历史版本及其理由记录在 `docs/design/agent-harness-product-design-v3.md`（含 Knowledge Layer 的 v3 完整设计）与 `docs/design/agent-harness-product-design-v2.md`（v3 的前身，更轻的交付控制层）。
