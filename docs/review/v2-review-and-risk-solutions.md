# Agent Harness v2 设计方案评审与风险解决方案

> 本文档基于 `agent-harness-product-design-v2.md` 的评审，包含两部分：
> 1. 对 v2 方案的整体评价与改进建议
> 2. 四个关键工程风险的具体解决方案

---

## 第一部分：v2 方案评审

### 1. 总体评价

v2 方案最重要的判断是**把产品本体从 "agent 编排系统" 重新定义为 "流程质量层"**。这个定位转移带来三个长期优势：

1. **不随 agent 技术演进失效**。contract / workflow / gate / evidence 是工程过程的基本需要，无论底层 agent 换成什么都成立。
2. **避免了 runtime wrapper 的死胡同**。v1 方案（两份 docx）本质上在设计一个更精巧的 agent 编排器，这条路会被模型能力进步快速淘汰。
3. **产品价值可被独立感知**。用户不需要理解三 agent 架构就能理解"任务有 contract、完成有 gate、结果有 evidence"。

### 2. 五个设计决策的评价

#### 2.1 "职责角色，不是固定三 Agent 架构" — 正确

v1 方案把产品阶段和 Agent 数量绑定（两 Agent → 三 Agent），导致产品定义随 Agent 数量变化而变化。v2 只固定职责接口（Planner / Generator / Evaluator），不固定实例数量，把"模型能力演进"变成配置问题而非产品重构问题。

**补充建议**：在 `harness.config.yaml` 中显式声明当前使用的角色-实例映射，让用户可见可调：

```yaml
roles:
  planner: template          # template | agent | human | skip
  generator: claude-code     # 具体 adapter
  evaluator: auto-checks     # auto-checks | agent | human
```

#### 2.2 "主流程固定，不做 DAG" — 正确

`需求澄清 → Contract → Plan → Execute → Verify → Commit Gate` 这条链路足够覆盖 v1 的全部场景，且用户心智成本最低。

**补充建议**：第一版可以进一步简化，把"需求澄清"合并到 Contract 生成阶段，减少一个显式步骤。用户输入 `harness run "修复登录超时"` 后，直接进入 Contract 生成 + 用户确认，不需要单独的"澄清"阶段。

#### 2.3 "模板沉淀与推荐，不做自动学习" — 正确

这个决策回避了黑盒智能编排的诱惑。第一版产品的行为必须是透明的、可审计的、可控的。

**补充建议**：需要补充冷启动方案（见第二部分风险四）。

#### 2.4 MVP 包含 `harness run` — 正确但需控制范围

如果 MVP 只做 `eval` 不做 `run`，产品就退化为一个 CI check 工具，和 pre-commit hook / GitHub Action 没有本质区别，缺乏独立产品价值。用户为什么要装一个新 CLI 只为跑一次 eval？他已经有 `npm run lint && npm run test` 了。

产品的最小完整体验必须让用户感受到"从需求到可交付结果"的闭环。

**但需要控制 `run` 的第一版复杂度**（见第二部分的具体方案）。

#### 2.5 第一版不做 `evolve` — 正确

evolve 的运行成本过高（4 组件 × 3-5 基准任务 × 每次 $200 ≈ $2400-$4000），单个用户跑不起。

**补充建议**：evolve 不做用户命令，做**共享数据**。产品团队定期跑消融测试，发布"模型 × 配置"推荐矩阵，用户 `harness config apply claude-opus-4.6` 一键应用即可。

### 3. 四个未展开的工程风险

v2 在产品思考上成熟，但回避了以下关键工程可行性问题：

| # | 风险 | 影响 |
|---|---|---|
| 1 | execute 阶段怎么调度 coding agent | 产品对底层 agent 的控制力边界不明 |
| 2 | contract 生成的质量谁来保证 | 流程源头不可靠则后续全部建在沙子上 |
| 3 | evidence 如果只有硬指标就跟 CI 没区别 | 产品独立价值被压缩 |
| 4 | 模板推荐的冷启动问题 | 新用户/新项目无法体验模板复用价值 |

以下第二部分给出每个风险的具体解决方案。

---

## 第二部分：风险解决方案

### 风险一：execute 阶段的 Agent 调度

#### 问题定义

`harness run` 跑到 execute 阶段时，必须把 contract + plan 交给一个实际的 coding agent 去写代码。但产品定位是"不做 runtime wrapper"，控制边界到底画在哪？

#### 方案：Adapter 模式——产品只管"喂入"和"收回"

```
harness (contract + plan + context)
        ↓ 组装结构化 prompt
        ↓ 调用 adapter
        ↓
   ┌────────────────────────┐
   │  adapter: claude-code  │  ← 或 codex / cursor / aider / 自定义
   │  实际就是 subprocess    │
   │  stdin: 组装好的 prompt │
   │  stdout: 执行日志       │
   │  退出后: 读 git diff    │
   └────────────────────────┘
        ↓
harness 收回控制权
        ↓ 读取代码变更 (git diff)
        ↓ 进入 verify 阶段
```

#### 设计决策

**1. Adapter 是薄接口，不是 SDK 深度集成**

接口定义极简：

- 输入：一个 prompt 字符串（或文件路径）
- 输出：agent 执行完毕后的 exit code
- 副作用：代码变更体现在 git working tree 中

**2. 产品不控制 agent 的执行过程**

不拦截中间输出、不注入中间指令、不做实时监控。agent 跑完就跑完，产品只关心"跑完之后的代码变更是否通过 gate"。

**3. 内置常用 adapter，开放自定义**

```yaml
# harness.config.yaml
execute:
  adapter: claude-code          # 内置: claude-code | codex | custom
  # custom_command: "aider --yes-always --message-file {prompt_file}"
  timeout: 3600                 # 最长执行时间（秒）
  max_retries: 2                # verify 失败后重试次数
```

**4. Prompt 组装是产品核心能力**

adapter 本身是薄的，但喂给 adapter 的 prompt 是产品组装的结构化输入，而不是裸的用户需求：

```markdown
你的任务是：{contract.goal}

## 范围
{contract.scope}

## 不在范围内
{contract.out_of_scope}

## 执行计划
{plan.md 内容}

## 全局规则
{GLOBAL_RULES.md 内容}

## 相关领域文档
{动态加载的 DOMAIN.md}

## 完成标准
{contract.acceptance_criteria}

## 必须通过的检查
{contract.required_checks}

## 约定
每完成一个功能请 commit，commit message 以 [harness:{task-id}] 开头。
```

#### 取舍说明

放弃了对 agent 执行过程的控制力。如果 agent 跑偏（比如改了 out_of_scope 的文件），产品只能在 verify 阶段事后发现，不能实时纠正。

这是**正确的取舍**——实时纠正需要深度侵入 runtime，那就变成了 v2 明确不做的 runtime wrapper。事后检测 + gate 拦截已经足够解决大部分问题。

---

### 风险二：Contract 生成质量保障

#### 问题定义

Contract 是整个流程的源头。如果 contract 本身质量差（目标模糊、scope 不清、acceptance criteria 不可测），后面所有阶段都建在沙子上。但 contract 又是 AI 生成的，存在循环依赖风险。

#### 方案：三层防线

**第一层：结构化模板约束生成质量**

不让 AI 自由发挥写 contract，给严格 schema，AI 只负责填充：

```yaml
# contract.yaml schema —— AI 必须填完所有字段才算生成成功
goal: ""                          # 必填，一句话
scope:
  - ""                            # 必填，至少 1 项
out_of_scope:
  - ""                            # 必填，至少 1 项（强制思考边界）
acceptance_criteria:
  - criterion: ""
    verifiable_by: ""             # 必须声明验证方式: test | lint | build | playwright | manual
risk_level: low | medium | high
required_checks:
  - ""                            # 必填，至少包含 build
estimated_complexity: simple | medium | complex
```

`verifiable_by` 是关键字段——它强制每条验收标准都必须声明验证方式。如果 AI 写了"用户体验流畅"但 `verifiable_by` 填不出来，这条就不合格。

**第二层：Contract Gate（自动校验）**

contract 生成后、进入 plan 阶段之前，跑一个轻量校验：

```yaml
contract_gate:
  checks:
    - schema_valid:        contract.yaml 符合 schema
    - scope_non_empty:     scope 和 out_of_scope 都非空
    - criteria_verifiable: 每条 acceptance_criteria 都有合法的 verifiable_by
    - no_vague_terms:      不包含 "尽量"、"合理"、"适当" 等模糊词（正则匹配）
    - risk_check_match:    risk_level=high 时 required_checks 必须包含 test
  on_fail: regenerate | ask_user
```

**第三层：用户确认（默认开启）**

```yaml
workflow:
  contract_review: interactive    # interactive | auto | skip
```

- `interactive`（默认）：contract 生成后展示给用户，用户确认/修改后继续
- `auto`：通过 contract gate 就自动继续
- `skip`：完全信任 AI，跳过确认

#### 设计意图

不追求"AI 生成完美 contract"，而是追求"contract 的质量问题能在最早期被发现，而不是到 verify 阶段才暴露"。三层防线的成本从低到高：schema 约束零成本，gate 校验毫秒级，用户确认几十秒——远低于 verify 阶段发现源头问题后全部返工的成本。

---

### 风险三：Evidence 采集边界

#### 问题定义

如果 evidence 只有硬指标（lint / build / test），那 Evidence Layer 跟 CI pipeline 没有本质区别，产品的独立价值被压缩。但软指标（设计质量、功能完整性）的采集又很难自动化且成本高。

#### 方案：三级 Evidence 体系

```
Level 1: 自动化硬指标（零成本，强制执行）
  ├── build 通过
  ├── lint 通过
  ├── type-check 通过
  ├── 现有 test 通过
  └── scope 检查（git diff 文件是否在 contract.scope 范围内）

Level 2: Contract 驱动的验证（低成本，推荐执行）
  ├── Playwright 脚本验证核心用户流程
  ├── 截图对比（before/after，UI 变更时）
  ├── API 响应验证（后端变更时）
  └── 依赖方向检查（import 静态分析）

Level 3: AI 辅助评估（有成本，按需开启）
  ├── 独立 Evaluator Agent 审查代码变更
  ├── Evaluator 通过 Playwright 实际操作应用并评分
  └── 评分报告 + 缺陷列表
```

#### 各级别设计要点

**Level 1：强制执行，但包含产品独有能力**

Level 1 中的 **scope 检查** 是产品区别于 CI 的关键。CI 不知道"这次任务的 scope 是什么"，但 harness 有 contract，所以能做 CI 做不了的事——检查 agent 是否改了不该改的文件：

```python
# 伪代码
changed_files = git_diff_files()
scope_files = resolve_scope(contract.scope)
out_of_scope_changes = changed_files - scope_files
if out_of_scope_changes:
    evidence.warn(f"以下文件不在 scope 内但被修改: {out_of_scope_changes}")
```

这个检查很轻量，但直接回应了"agent 跑偏改了不该改的东西"这个高频问题。

**Level 2：由 Contract 驱动，不是预置脚本**

Level 2 的 Playwright 脚本不是产品预置的，而是根据 contract 中的 acceptance_criteria 动态生成的：

```yaml
# contract.yaml 中
acceptance_criteria:
  - criterion: "用户可以创建新项目"
    verifiable_by: playwright
    test_hint: "点击 New Project 按钮，填写名称，提交，验证列表中出现新项目"
```

verify 阶段读到 `verifiable_by: playwright` 时，让 AI 根据 `test_hint` 生成一次性 Playwright 脚本，跑一遍，录制结果。这个脚本不需要维护，只服务于本次 verify。

这是产品真正区别于 CI 的核心能力：**验证逻辑由需求驱动，而不是由预写的 test suite 驱动**。

**Level 3：默认关闭，按需触发**

仅在以下条件触发：

- `risk_level: high`
- 用户显式 `--deep-eval`
- 配置中 `evaluator: agent`

因为成本高（需要额外 agent 调用 + Playwright 交互），且评分稳定性依赖校准（同一产出跑两次可能差 2 分），不适合作为默认行为。

#### 默认配置建议

```yaml
# harness.config.yaml
evidence:
  level_1: required           # 不可关闭
  level_2: recommended        # 默认开启，可关闭
  level_3: off                # 默认关闭，需显式开启
  scope_check: strict         # strict: 报错 | warn: 警告 | off: 关闭
```

---

### 风险四：模板推荐冷启动

#### 问题定义

`template promote` 依赖用户积累成功案例，新用户/新项目没有历史数据，推荐系统空转。

#### 方案：官方预置 + 规则匹配 + 项目自然积累

**第一层：官方预置模板（解决 Day 1 问题）**

产品内置覆盖最常见场景的模板：

| 模板 | 适用场景 | 默认 risk_level | 默认 required_checks | plan 阶段 |
|---|---|---|---|---|
| `bug-fix` | 单文件/少文件缺陷修复 | low | build, lint | 跳过 |
| `feature-simple` | 单模块功能添加 | medium | build, lint, test | 简化 |
| `feature-cross` | 跨模块功能 | medium | build, lint, test | 显式 |
| `refactor` | 重构（不改行为） | medium | build, lint, test | 显式 |
| `api-endpoint` | 新增 API 端点 | medium | build, lint, test | 显式 |
| `ui-component` | 新增 UI 组件 | low | build, lint | 简化 |
| `test-coverage` | 补充测试 | low | build, test | 跳过 |
| `migration` | 数据库迁移 | high | build, test, backup | 显式 |

每个模板定义默认 contract 字段值、默认 workflow 阶段配置、默认 gate 配置。用户可以在此基础上微调。

**第二层：模板匹配用规则，不用 AI**

第一版不做语义匹配，用简单规则：

```yaml
template_matching:
  strategy: rule_based          # rule_based | semantic（第一版只做 rule_based）
  rules:
    - if_goal_contains: ["fix", "bug", "修复", "缺陷"]
      suggest: bug-fix
    - if_goal_contains: ["refactor", "重构", "cleanup", "清理"]
      suggest: refactor
    - if_goal_contains: ["migration", "迁移", "migrate"]
      suggest: migration
    - if_goal_contains: ["test", "测试", "coverage", "覆盖"]
      suggest: test-coverage
    - if_goal_contains: ["add", "新增", "feature", "功能"]
      and_estimated_files_gt: 3
      suggest: feature-cross
    - default: feature-simple
```

规则匹配的好处：透明、可解释、不需要训练数据、用户能理解为什么推荐这个模板。

**第三层：项目内自然积累**

`template promote` 的真实使用场景不是"智能推荐系统"，而是**个人/团队的 SOP 沉淀**。典型路径：

1. 修了 3 次支付模块的 bug，每次都要手动加 `required_checks: [build, test, integration-test]`
2. 第 3 次时 `harness template promote` → 生成 `payment-bug-fix` 模板
3. 第 4 次修支付 bug 时，系统推荐这个模板，不用再手动配置

这不需要大量数据，3-5 次同类任务就够积累。价值不是"智能推荐"，而是**减少重复配置**。

---

## 第三部分：对 MVP 实施的综合建议

### MVP 的 `harness run` 应极度简化

结合以上四个风险方案，第一版 `harness run` 的每个子阶段应取最简实现：

| 阶段 | 第一版实现 | 不做 |
|---|---|---|
| Contract | schema 模板 + contract gate + 用户确认 | AI 自由生成 |
| Plan | 固定模板或 AI 生成简单步骤列表 | 复杂分阶段规划 |
| Execute | Adapter subprocess 调用 | SDK 深度集成、实时控制 |
| Verify | Level 1 强制 + Level 2 推荐 | Level 3 AI 评估 |
| Commit Gate | 简单 pass/fail（所有 required_checks 通过即 pass） | 加权评分 |

### 技术栈建议

```
CLI 框架:     Node.js (oclif) 或 Go (cobra)
配置格式:     YAML
工件格式:     YAML (contract) + Markdown (plan) + JSON (report)
adapter 调用: child_process / os.exec
git 操作:     simple-git 或 go-git
报告输出:     JSON + 可选 HTML
```

### 关键里程碑

```
Week 1-2:  harness init + 目录结构 + config schema + 官方模板
Week 3-4:  harness run 最小闭环（contract → execute → verify → gate）
Week 5-6:  harness eval 独立验证 + HTML report
Week 7-8:  harness template promote + 规则匹配
Week 9-10: 稳定性打磨 + 文档 + 首批用户测试
```

### 成功判定

MVP 成功的标准不是功能完整度，而是以下三个信号：

1. 用户在中等复杂度任务上，使用 `harness run` 的一次通过率高于直接使用 coding agent
2. `harness eval` 至少拦截过一次"agent 声称完成但实际不可交付"的情况
3. 至少有一个用户通过 `template promote` 沉淀了自己的模板并实际复用

---

## 附录：harness.config.yaml 完整示例

```yaml
version: "1.0"

# 角色-实例映射
roles:
  planner: template                   # template | agent | human | skip
  generator: claude-code              # adapter 名称
  evaluator: auto-checks              # auto-checks | agent | human

# 执行配置
execute:
  adapter: claude-code                # claude-code | codex | custom
  # custom_command: "aider --yes-always --message-file {prompt_file}"
  timeout: 3600
  max_retries: 2

# 上下文配置
context:
  global_rules: .harness/GLOBAL_RULES.md
  domain_dir: .harness/domains/
  max_global_rules_lines: 50

# 工作流配置
workflow:
  contract_review: interactive        # interactive | auto | skip
  plan_stage: auto                    # auto | explicit | skip
  stages:
    - contract
    - plan
    - execute
    - verify
    - commit_gate

# 验证配置
evidence:
  level_1: required
  level_2: recommended
  level_3: "off"
  scope_check: strict                 # strict | warn | off

# Contract Gate 配置
contract_gate:
  checks:
    - schema_valid
    - scope_non_empty
    - criteria_verifiable
    - no_vague_terms
    - risk_check_match
  on_fail: ask_user                   # ask_user | regenerate

# 模板匹配配置
template_matching:
  strategy: rule_based                # rule_based | semantic
  builtin_templates:
    - bug-fix
    - feature-simple
    - feature-cross
    - refactor
    - api-endpoint
    - ui-component
    - test-coverage
    - migration

# 报告配置
report:
  format: json                        # json | html | both
  output_dir: .harness/tasks/
```
