# Agent Harness 产品设计方案 v3-core

> v3-core 与 v3 关系：v3 是「Agent 工程作战系统」的完整形态，v3-core 是其**长期不被宿主替代**的子集。在保留 v3 编排能力（workflow + 角色契约 + PM 自动路由）的前提下，砍掉宿主短期内会做掉的部分，集中保留 24 个月以上仍稀缺的能力，并吸收 OpenAI Ryan Lopopolo 实战经验补三层（结构性约束、常驻 review agent、反馈晋升机制）。

## 1. 为什么需要 v3-core

### 1.1 v3 完整版的实用价值评估

我们对 v3 完整版做了 18 项能力的替代矩阵分析：

| 档位 | 占比 | 含义 |
|---|---|---|
| **A 档：宿主已原生支持** | 28% | 真实 sub-agent / 模型分层 / 工具白名单 / plan mode / hooks，做了即浪费 |
| **B 档：6–18 个月内被宿主追平** | 22% | dev-map 自动化 / 任务看板 / 多文档 schema / 简单产品层 blocker 等 |
| **C 档：宿主长期不会做** | **50%** | 基线对比 / scope-check / Skill 系统 / SPEC 派生 / 跨宿主统一 / **结构性约束** / **常驻 review** / **反馈晋升** |

**结论**：v3 完整版的价值窗口约 12–18 个月，到期被吃 ~50%。v3-core 砍掉 A 档 + 大半 B 档，集中做 C 档，把窗口拉长到 24+ 个月。

### 1.2 v3-core 设计原则

在 v3 九条原则之上，v3-core 多加三条收敛性原则：

10. **不做宿主已经原生有的能力**：A 档全部不做，包括「真实 sub-agent 实例化机制」「plan mode 包装」「工具白名单」等
11. **不做宿主短期会追平的能力**：B 档大部分不做，包括「dev-map / 任务看板自动化维护」「复杂产品层 blocker 状态机」
12. **优先做「写不进 LLM 的工程能力」**：C 档全部做，特别是涉及代码状态分析、跨工具抽象、跨任务沉淀的部分

### 1.3 v3-core 的一句话定位

> **v3-core 是构建在宿主原生 sub-agent 之上的工程纪律层**：用 SPEC 派生 / contract / scope-check / 基线对比 / Skill / 结构性约束 / 常驻 review / 反馈晋升 / 知识资产晋升 9 个核心能力，让 agent 在工程里**真正复利地**变好。

注意「真正复利地」是关键词：v3-core 的护城河不是任意单项能力，而是「反馈 → 沉淀 → guardrail → 下次更稳」这条复利链路。

---

## 2. v3-core 保留与砍掉

### 2.1 保留清单（12 项）

| # | 能力 | 来源 | 档位 |
|---|---|---|---|
| 1 | **基线对比 baseline-diff** | v2 缺，v3 加 | C |
| 2 | **scope-check（deny-list 语义）** | v3 §5.2.1 修订 | C |
| 3 | **Skill yaml 多语言抽象** | v3 §5.5 + Ryan 修正 5（强制 fixHintTemplate） | C |
| 4 | **结构化 contract + SPEC 派生** | v3 §5.1 / §5.2 | C |
| 5 | **跨宿主统一抽象** | v2 已有，v3 继承 | C |
| 6 | **Stop hook 完成态拦截** | v2 已有 | C/B |
| 7 | **多文档链最小集**（4 文档） | v3 §6 精简 | B |
| 8 | **workflow.yaml + 角色契约 + PM 自动路由** | v3 §5.3 / §4.5 | C |
| 9 | **结构性约束层** | Ryan 新增 | C |
| 10 | **常驻 review agent 横切层** | Ryan 新增 | C |
| 11 | **反馈晋升机制** | Ryan 新增 | C |
| 12 | **知识资产晋升机制（docs/architecture/）** | v3-core 自创，对应 SPEC §22 | C |

12 项中 10 项 C 档、2 项 C/B 临界。

### 2.2 砍掉清单（与 v3 差异）

| 砍掉 | 砍掉理由 |
|---|---|
| Knowledge Layer 自动化（dev-map / 任务看板） | 让宿主 CLAUDE.md / Memory 自己演进，v3-core 仅在 README 给手工维护建议 |
| Feasibility 独立阶段 + Gatekeeper 独立角色 | 合并为 designer 在 design.md 末尾的自检段落 |
| 产品层 blocker 复杂状态机 | 简化为「任意 sub-agent throw → PM 挂起任务等用户决策」 |
| Skill 自动注册 / 智能匹配引擎 | 仅手工 yaml，不做匹配 |
| Skill 笛卡尔积展开（4 check × N 语言） | 改为「按需创建」原则，鼓励团队收敛在 5–10 个核心 skill |
| 模型分层 / 工具白名单的产品级抽象 | 直接用宿主原生 sub-agent yaml 字段，v3-core 不再包一层 |

### 2.3 角色从 7 → 5

| v3 角色 | v3-core 处理 |
|---|---|
| pm | 保留，仍由宿主主 agent 兼任 |
| requirement | 保留 |
| designer | 保留，**吸收 gatekeeper 职责**（在 design.md 末尾必须含 Feasibility Self-Check 段落） |
| ~~gatekeeper~~ | **砍掉**，并入 designer |
| developer | 保留 |
| reviewer | 保留，**新增对常驻 review agent 的协调职责** |
| tester | 保留 |

5 个 sub-agent + 1 个主 agent 兼任 PM。

---

## 3. 核心产品模型（六层）

```
SPEC Layer
  ↓
Contract Layer        （SPEC 的结构化裁剪）
  ↓
Workflow Layer        （6 阶段 + 角色契约 + PM 路由）
  ↓
Execute Boundary
  ↓
Evidence Layer        （三级 evidence + 基线对比 + 结构性约束）
  ↓
Memory Boundary       （明确不在主干）
```

注意：相比 v3 七层，**砍掉了 Knowledge Layer**（dev-map / 任务看板）。这一层让宿主自己做。

### 3.1 SPEC / Contract Layer

继承 v3 §5.1 / §5.2 / §5.2.1，无修订。要点：

- SPEC 阶段产出 `requirement.md`，必须无模糊词
- contract.yaml 由 SPEC 自动派生，含 `acceptance_criteria.verifiable_by` 元数据
- scope.include 是 expectation list（不拦截），scope.exclude 是 denylist（强制拦截）
- scope-check 用 deny-list 判定

### 3.2 Workflow Layer（6 阶段精简版）

```yaml
# .harness/workflow.yaml （v3-core 默认）
stages:
  - id: spec
    owner: requirement
    produces: [requirement.md, contract.yaml]

  - id: design
    owner: designer
    requires: [requirement.md, contract.yaml]
    produces: [design.md, task-breakdown.md]
    must_include_in_design_md:
      - "## Feasibility Self-Check"      # 设计阶段内置可行性自检

  - id: execute
    owner: developer
    requires: [requirement.md, design.md, task-breakdown.md]
    produces: [code_changes, implementation-notes.md]
    pre_hook: capture_baseline_evidence  # 自动 baseline 快照
    post_hook: capture_current_evidence  # 自动 current 快照

  - id: review
    owner: reviewer
    requires: [requirement.md, design.md, code_changes, implementation-notes.md]
    produces: [review.md]
    parallel_with: [resident_review_agents]   # 同时触发常驻 review agents

  - id: test
    owner: tester
    requires: [contract.yaml, code_changes]
    produces: [test-report.md, evidence/baseline-diff.json]

  - id: commit_gate
    owner: pm
    requires: [test-report.md, review.md, evidence/baseline-diff.json]
    produces: [commit-summary.md, report.json]
```

PM 路由仍按 v3 §4.5 的纪律执行：自动按 stage 切换 + 不允许下游改上游 + 失败时打回。

### 3.3 Execute Boundary

继承 v3 §5.4，无修订。

### 3.4 Evidence Layer

三级 evidence 继承 v3 §5.5，但**新增结构性约束子层**（详见 §4）。

### 3.5 Memory Boundary

继承 v3 §5.7。Memory 不在主干，团队对齐内容必须落仓库。

---

## 4. 四层差异化能力（v3-core 的核心承重）

这四层是 v3-core 区别于 v3 完整版的**真正承重**部分。前三层（结构性约束 / 常驻 review / 反馈晋升）来自 OpenAI Ryan Lopopolo 实战经验；第四层（知识资产晋升）是 v3-core 自创，对应 SPEC §22。

### 4.1 结构性约束层（Structure Rules）

#### 4.1.1 解决什么问题

v3 的 scope-check 是**任务级**约束（这次任务能改哪），但 OpenAI Ryan 实战指出更重要的是**仓库级**约束（整个仓库永远应该长成什么样）。前者防止越界，后者保证「无论 agent 看仓库的哪里，都看到一致的模式」。

代码本身就是 prompt：仓库越一致，agent 行为越可预测。

#### 4.1.2 落地形态

新增仓库级资产：`.harness/structure-rules.yaml`

```yaml
# .harness/structure-rules.yaml
file_length:
  max: 350                              # 单文件不超过 350 行
  exclude: ["**/*.test.ts", "**/dist/**"]

unique_implementations:
  - pattern: "src/**/utils/**/*.ts"
    rule: "no duplicate function names exported across files"
    fix_hint: "用现有 utils 中的实现替代，或合并到同一文件"

unique_schemas:
  - pattern: "**/*.ts"
    detect: "z.object\\("
    rule: "same schema shape must not appear in multiple files"
    fix_hint: "提取到共享 schema 文件"

package_dependencies:
  forbid:
    - { from: "packages/cli/**",   to: "packages/hosts/**" }
    - { from: "packages/shared/**", to: "packages/core/**" }
  fix_hint: "依赖应该从底层流向上层（shared ← core ← cli ← hosts），不能反向"

naming_conventions:
  files: kebab-case
  classes: PascalCase
  constants: UPPER_SNAKE_CASE
```

#### 4.1.3 执行机制

- **何时触发**：每次 execute 完成后自动跑结构性扫描，作为 evidence Level 1 的一项 check
- **失败处理**：scan 发现违规 → block commit gate → developer 必须修
- **修复路径**：每条规则必须含 `fix_hint` 字段（继承 Ryan 的「错误信息要给修复路径」原则）
- **新增模块**：`packages/core/src/structure-check.ts`，读 yaml 扫代码，输出 `EvidenceCheckResult[]`

#### 4.1.4 与 scope-check 的区别

| 维度 | scope-check | structure-check |
|---|---|---|
| 作用域 | 单任务 | 整个仓库永久 |
| 配置位置 | contract.yaml 的 `scope.exclude` | `.harness/structure-rules.yaml` |
| 失败语义 | 越界改动 | 违反仓库长期约束 |
| 修复方向 | 把改动收回 scope | 重构使仓库符合约束 |

两者是互补的，不冲突。

### 4.2 常驻 Review Agent 横切层

#### 4.2.1 解决什么问题

v3 的 reviewer 是「7 阶段中的一阶」（任务内、单次）。Ryan 的实战是**两层并存**：

- **任务级 reviewer**（v3 已有）：在 execute 之后做对照 design 的实现一致性审查
- **常驻 review agent**（v3-core 新增）：每次 push / 每次 PR 自动跑，按角色拆，跨任务横切

为什么要两层？阶段化保证「按设计意图实现了」（任务内），常驻保证「持续符合团队工程标准」（跨任务）。

#### 4.2.2 落地形态

新增仓库级资产：`.harness/review-agents.yaml`

```yaml
# .harness/review-agents.yaml
review_agents:
  - name: reliability
    triggers: [pre_push, pre_merge]
    model: sonnet
    prompt: |
      你是可靠性审查 agent。检查这份 diff，关注：
      - fetch / exec / 网络调用是否带 timeout + retry
      - 是否有未处理的 promise rejection
      - 是否引入新的 race condition
      对每条问题输出 finding（含位置 + 描述 + fix_hint）。

  - name: scalability
    triggers: [pre_merge]
    model: sonnet
    prompt: |
      你是可扩展性审查 agent。检查：
      - N+1 query
      - 无界循环 / 不分页的批处理
      - 阻塞主线程的同步操作

  - name: security
    triggers: [pre_merge]
    model: sonnet
    prompt: |
      你是安全审查 agent。检查：
      - 是否引入未校验的用户输入
      - 是否有 SQL/command injection 风险
      - 是否泄漏 PII / 密钥
```

#### 4.2.3 执行机制

- **触发点**：通过 host hook 嵌入用户的 git 工作流
  - `pre_push`：本地 git push 前
  - `pre_merge`：PR merge 前（CI 集成）
- **运行模式**：每个 review agent 独立 sub-agent，并行执行
- **输出聚合**：所有 finding 汇总到 `.harness/tasks/<id>/resident-review.md`
- **阻断逻辑**：发现 P0 finding → 阻断 push / merge；P1 → 警告但不阻断

#### 4.2.4 与任务级 reviewer 的协调

任务级 reviewer 在 review 阶段触发时**不重复跑常驻 review agents**：

- 任务内：reviewer 看 design 一致性 + 实现质量
- 横切：常驻 agents 跑可靠性 / 可扩展性 / 安全（与 design 无关的横切关注）

任务级 reviewer 在 review.md 里可以**引用**常驻 agents 的 finding，但不重复审查。

#### 4.2.5 用户在哪里看到结果

- **本地开发**：`pre_push` hook 触发，stderr 输出 finding
- **PR 流程**：`pre_merge` hook 触发，作为 PR 评论或 status check
- **harness CLI**：`harness review-status` 查看当前 PR 的所有 finding

### 4.3 反馈晋升机制（Feedback Promotion）

#### 4.3.1 解决什么问题

reviewer 在 review.md 里记录 finding → 任务结束 → finding 沉睡。这意味着「同类问题下次还会再犯」。

Ryan 的实战是**每周一天专门把 PR 高频反馈系统化为 lint / failed test / review docs**（垃圾回收日）。这是 harness 复利的真正实现：人类经验 → 系统约束 → 下次更稳。

#### 4.3.2 落地形态

##### 数据流

```
每个任务结束:
  reviewer / 常驻 agents 在 review 时给每条 finding 打 tag:
    - one_off:           本次任务特有问题，不入 pool
    - recurrent_pattern: 推测会重复发生，写入 .harness/feedback-pool/
  ↓
.harness/feedback-pool/ 累积 finding（结构化 jsonl）
  ↓
周期性触发 (手动 harness feedback promote 或 cron):
  扫描 pool，统计每条 finding 出现次数
  ↓
出现 ≥ N 次 (默认 3) 的 finding 升格:
  - 静态可判定 (regex / AST 模式) → 加进 .harness/structure-rules.yaml
  - 可运行验证 (能写测试) → 生成 failed test → developer 必须先修 → 改测试为 passed
  - 横切关注 (无法静态化) → 增量到 .harness/review-agents.yaml 的 prompt
  ↓
升格后从 pool 移除，记录到 .harness/feedback-history.md
```

##### 数据结构

```jsonl
# .harness/feedback-pool/2026-05-15.jsonl
{"id":"F-001","kind":"recurrent_pattern","category":"reliability",
 "summary":"fetch 调用缺 timeout",
 "examples":[{"task":"20260501-094500-evgo","file":"src/x.ts","line":42}],
 "fix_hint":"用 fetchWithTimeout helper",
 "promotable_as":["lint","structure_rule"]}
```

##### 命令

```bash
harness feedback collect [task-id]    # 把 review.md 的 recurrent_pattern 打捞进 pool
harness feedback list                  # 查看 pool 里所有 finding 与出现次数
harness feedback promote [--threshold=3]  # 升格 ≥ N 次的 finding
harness feedback dismiss <finding-id>  # 标记为不再升格（误报或已不适用）
```

#### 4.3.3 升格的具体形态

| 升格目标 | 适用场景 | 落点 |
|---|---|---|
| **structure-rule** | 静态可判定（如 regex / 文件结构） | `.harness/structure-rules.yaml` 新增条目 |
| **failed test** | 可运行验证（行为类） | 自动生成测试文件，标记为 `expect(false).toBe(true)`，强制 developer 实现修复 |
| **review-agent prompt 增量** | 横切关注，无法静态化 | `.harness/review-agents.yaml` 中对应 agent 的 prompt 增加一行 |
| **Skill fix_hint 增强** | 是某 Skill 的修复路径不够清晰 | 修改对应 `.harness/skills/<check>/<lang>.yaml` 的 `fix_hint_template` |

#### 4.3.4 这是 v3-core 最大的复利来源之一

structure-rules / review-agents / Skill 的初始版本是手工 / Ryan 经验给的，但**长期成长来自反馈晋升**。这条复利链路是宿主厂商绝对不会做的（per-project、per-team），是 v3-core 真正的护城河之一。另一条护城河是下面的知识资产晋升 —— 两者构成 v3-core 的**双晋升机制**。

### 4.4 知识资产晋升（Asset Promotion）

#### 4.4.1 解决什么问题

不是所有任务的 design.md / requirement.md 都是「一次性产物」。某些任务的产物本身就是项目级知识：

- 「设计并实现 OAuth 2.0 集成」→ design.md 是后续 5 个 OAuth 相关任务的依据
- 「重构支付模块」→ 架构决策长期影响整个仓库
- 「调研并选型 vector DB」→ 决策本身就是资产

这类设计文档不应该躺在 `.harness/tasks/<id>/` 等被遗忘 —— 它们是项目级长期资产。

#### 4.4.2 与反馈晋升的对称性

知识资产晋升与 §4.3 反馈晋升构成 v3-core 的**双晋升机制**：

| 层 | 晋升对象 | 晋升目标 | 触发方 |
|---|---|---|---|
| **反馈晋升** | 重复 review finding | lint 规则 / 失败测试 / structure-rule / review prompt | reviewer 标 `recurrent_pattern` |
| **知识资产晋升** | 任务设计与需求文档 | `docs/architecture/<topic>/` | requirement 标 `asset_promotion` / 用户手工 |

两者都是「把当下决策固化为长期资产」，让 harness 的能力随项目演进**复利变厚**。

#### 4.4.3 关键决策：放在 docs/ 而非 .harness/

最初的设计草案是把架构资产放在 `.harness/architecture/`，但这违反了「文档要给人看」的本能：

- `.harness/` 是机器消费的工件目录（IDE 通常折叠、文档站点不识别）
- 架构决策应该被 PR reviewer / 新人每天看到
- 文档站点（Docusaurus / MkDocs / GitHub Pages）按惯例识别 `docs/`

因此 v3-core 强制：架构资产位于 `docs/architecture/<topic>/`，**不允许**放在 `.harness/`。这条约束在 SPEC §22 落到规范级。

#### 4.4.4 落地形态

声明式（推荐）—— 在 `contract.yaml` 标记：

```yaml
asset_promotion:
  promote: true
  topic: oauth-integration
  files: [requirement.md, design.md]
  mode: new_topic         # new_topic | append | replace
```

PM 在 `commit_gate` 通过且 `commit_decision: pass` 时自动调用 `harness archive promote`。

命令式（兜底）—— 任意时刻：

```bash
harness archive promote <task-id> --topic=oauth-integration --files=design.md
```

每个 topic 含元数据 `_harness-meta.json`，记录 `source_tasks`（**仅追加，永不删除**），让任意时刻都能反查血统。新任务的 prompt assembler 自动注入相关 topic 的 README，让既有架构决策对下一任务可见。

#### 4.4.5 为什么不自动晋升

v3-core 不在 `harness run` 末尾默认开启自动晋升提示，**坚持显式声明**。理由：

- 「值得长期保存」是人的判断，不是规则能定的
- 自动提议容易稀释 `docs/architecture/` 的价值
- 默认关闭、按需开启更对齐 v3-core「不做隐式自动化」原则

#### 4.4.6 与 SPEC §22 的关系

完整规范见 SPEC §22。本节仅讲设计动机与关键决策；schema、命令签名、跨任务发现机制、README 双区合并等细节以 SPEC 为准。

---

## 5. plan mode 立场（继承 v3 §4.6 修订）

v3-core 直接继承 v3 §4.6 修订后的立场：

- **plan mode 默认关闭**
- 启用必须满足三个硬约束：plan 独立落盘 + 用户逐条 approve + 拒绝整体批准
- 五个角色（developer / pm / reviewer / tester / 不存在的 gatekeeper）无论配置都不允许进 plan mode

理由：「不严格 review 的 plan = 误差放大器」。这条原则在 v3-core 里不变。

---

## 6. 工件与 Owner 矩阵（精简版）

### 6.1 任务级工件

```
.harness/tasks/<task-id>/
├── requirement.md
├── contract.yaml
├── design.md                # 含 Feasibility Self-Check 段落
├── task-breakdown.md
├── implementation-notes.md
├── review.md                # 任务级 reviewer 产出
├── resident-review.md       # 常驻 review agents 产出汇总
├── test-report.md
├── evidence/
│   ├── baseline.json
│   ├── current.json
│   └── baseline-diff.json
├── commit-summary.md
├── report.json
└── state.json
```

相比 v3：砍掉 `feasibility.md`（合并进 design.md），新增 `resident-review.md`。

### 6.2 仓库级资产

资产分两个域 —— `.harness/` 是机器消费、`docs/` 是人类消费：

#### 6.2.1 机器消费域（`.harness/`）

| 资产 | Owner | 首次落地 | 演进 |
|---|---|---|---|
| `.harness/harness.config.yaml` | 用户 + `harness init` | init 创建 | 用户手工 |
| `.harness/workflow.yaml` | 用户 | init 创建默认值 | 用户手工 |
| `.harness/agents/<role>.yaml` | 用户 | init 创建默认值 | 用户手工 |
| `.harness/skills/**` | developer 首次 + reviewer 额外审 | init 创建语言相关默认 | feedback-promote 增强 fix_hint |
| `.harness/structure-rules.yaml` | 用户 + feedback-promote 自动追加 | init 创建空骨架 | feedback-promote 自动 / 用户手工 |
| `.harness/review-agents.yaml` | 用户 + feedback-promote 自动追加 | init 创建 3 个默认（reliability/scalability/security） | feedback-promote 自动 / 用户手工 |
| `.harness/feedback-pool/*.jsonl` | reviewer / 常驻 agents | 自动写入 | feedback-promote 命令清空 |
| `.harness/feedback-history.md` | feedback-promote 命令 | 累积升格记录 | 仅追加 |
| `.harness/decisions/<date>-<topic>.md` | 用户 + 产品层 blocker 决议 | 按需创建 | 仅追加（账本式） |

#### 6.2.2 人类消费域（`docs/`）

| 资产 | Owner | 首次落地 | 演进 |
|---|---|---|---|
| `docs/architecture/<topic>/` | `harness archive promote` 系统命令 | 任务声明 `asset_promotion: true` 或用户手工触发 | 后续任务追加；`_harness-meta.json` 仅追加 |

跨域规则：sub-agent 工具白名单**禁止**写入 `docs/architecture/`，只有 `harness archive promote` 系统命令可写。详见 SPEC §22。

砍掉的（相比 v3）：`.harness/dev-map.md`、`.harness/board.md` —— 让宿主 CLAUDE.md / Memory 自演进。

---

## 7. MVP（v3-core 形态）

### 7.1 MVP 目标

> 给一个目标，agent 跑完 SPEC → Design → Execute → Review (含横切) → Test → Commit Gate 六阶段，每阶段都有独立工件落盘。reviewer / 常驻 agent 的 finding 自动归入 feedback-pool；周期性 promote 让 harness 自身变厚。

### 7.2 默认 Workflow（中等任务）

```
harness run "修复登录页面在断网时的卡死问题"
  ↓
[1/6 SPEC]   requirement → requirement.md + contract.yaml
[2/6 Design] designer → design.md (含 Feasibility Self-Check) + task-breakdown.md
[3/6 Execute] auto-baseline → developer → auto-current → baseline-diff
[4/6 Review] reviewer (任务级) + 常驻 review agents (并行)
   → review.md + resident-review.md
   → finding 自动入 feedback-pool
[5/6 Test] tester → test-report.md
[6/6 Commit Gate] PM → commit-summary.md + report.json
```

### 7.3 核心命令

| 命令 | 作用 |
|---|---|
| `harness init` | 初始化所有仓库级资产（含 structure-rules / review-agents 默认值） |
| `harness run "<goal>"` | 跑完整六阶段 |
| `harness eval [task-id]` | 重跑 review + test |
| `harness resume [task-id]` | 从某阶段继续 |
| `harness review-status` | 查看当前 PR 的常驻 agent finding |
| `harness feedback collect [task-id]` | 打捞 review finding 进 pool |
| `harness feedback list` | 查看 pool |
| `harness feedback promote [--threshold=N]` | 升格高频 finding |
| `harness feedback dismiss <finding-id>` | 标记不再升格 |
| `harness archive promote <task-id> [--topic --files --mode]` | 把任务工件晋升到 `docs/architecture/<topic>/` |
| `harness archive list` | 列出全部架构 topic |
| `harness archive show <topic>` | 查看 topic README + 文件 + 来源任务 |
| `harness archive verify` | 校验 `_harness-meta.json` 与实际任务的一致性 |

### 7.4 v3-core MVP 不做的事

- 不做 dev-map / 任务看板自动化
- 不做 milestone 拆分
- 不做 MCP 接入
- 不做 Skill 智能匹配
- 不做产品层 blocker 复杂状态机（简化为「sub-agent throw → PM 挂起」）
- 不做团队中心化平台
- 不做 Web UI

---

## 8. 与 v2 / v3 的差异速查

| 维度 | v2 | v3 | **v3-core** |
|---|---|---|---|
| 主干阶段 | 5 | 7 | **6** |
| 角色数量 | 3 职责 | 7 职责 | **5 职责（PM 兼任主 agent）** |
| Sub-agent 数量 | 1（planner） + 1（evaluator） | 6 + PM 主 agent | **5 + PM 主 agent** |
| 流程实现 | 硬编码 ts | yaml 驱动 | **yaml 驱动（精简）** |
| Knowledge Layer | 无 | dev-map + 任务看板 | **砍掉，让宿主自演进** |
| 基线对比 | 无 | 有 | **有** |
| 结构性约束层 | 无 | 无 | **有（核心新增）** |
| 常驻 review agents | 无 | 无 | **有（核心新增）** |
| 反馈晋升机制 | 无 | 无 | **有（核心新增）** |
| 知识资产晋升（docs/architecture/） | 无 | 无 | **有（核心新增）** |
| plan mode | 默认开 | 默认关（v3 修订后） | **默认关** |
| 任务级工件密度 | 3 | 12+ | **9** |
| 仓库级资产域 | 单域 | 单域（.harness/） | **双域（.harness/ 机器消费 + docs/architecture/ 人类消费）** |

---

## 9. 落地路线（5–6 周）

### Week 1：SPEC + 角色契约骨架

- 实施 v3 §5.1 SPEC Layer + §4.5 sub-agent 实例化
- 把 v2 的 `harness-planner` / `harness-evaluator` 重新拆成 5 个：requirement / designer / developer / reviewer / tester
- 用 evidence Skill 化任务（v3-walkthrough 描述的）作为第一个真实 dogfood 案例

### Week 2：Workflow 6 阶段编排 + Stop hook 校验

- workflow.yaml 驱动 PM 自动路由
- Stop hook 校验各阶段产物 schema
- design.md 必须含 Feasibility Self-Check 段落

### Week 3：基线对比 + Skill 系统（含 fixHintTemplate）

- evidence baseline / current 自动快照
- Skill yaml 加载 + 跑 + 失败时返回 fix_hint
- Skill 默认套件：node / go 各 4 个 check

### Week 4：结构性约束层

- structure-rules.yaml schema
- structure-check.ts 模块
- 集成到 evidence Level 1
- 默认规则：file_length_max、unique_implementations

### Week 5：常驻 review agents

- review-agents.yaml schema
- pre_push / pre_merge hook 集成
- 默认 3 个 agent：reliability / scalability / security
- 与任务级 reviewer 协调（不重复审查）

### Week 6：反馈晋升 + 知识资产晋升 + 收尾

- `.harness/feedback-pool/` 数据结构
- 4 个 feedback CLI 命令
- promote 升格逻辑（lint / failed test / review prompt 增量）
- `docs/architecture/<topic>/` 资产晋升机制（4 个 archive CLI 命令）
- contract.yaml 加 `asset_promotion` 字段；PM 在 commit_gate 自动调用 archive promote
- prompt assembler 跨任务发现：扫 `docs/architecture/` 注入相关 topic README
- README / 真实项目验证

---

## 10. 风险与不做的事

### 10.1 v3-core 已知风险

| 风险 | 描述 | 缓解 |
|---|---|---|
| **常驻 review agents token 成本** | 每次 push 都跑 3 个 sub-agent，cost 不低 | trigger 默认配 `pre_merge`，不配 `pre_push` |
| **feedback-promote 误升格** | 高频不一定值得规则化 | promote 命令必须人确认每条升格；提供 dismiss 机制 |
| **structure-rules 学习曲线** | 用户写 yaml 门槛高 | init 提供 8 大栈默认值；feedback-promote 自动追加 |
| **跨宿主常驻 review** | Codex / Gemini 是否支持 pre_merge hook 不一致 | 通过 hosts/<host>/lifecycle.ts 适配差异 |
| **6 阶段仍偏重** | 简单任务（typo）仍要走全链路 | 保留 lite 预设：requirement → developer → tester 三阶段 |

### 10.2 v3-core 仍然不做

- 不做 SaaS / 中心化
- 不做 Web UI
- 不做 agent 自由协商式协作
- 不做 Memory 主干化
- 不做 Knowledge Layer 自动化（让宿主自演进）
- 不做 dev-map / 任务看板
- 不做产品层 blocker 复杂状态机
- 不做 Skill 智能匹配

---

## 11. 与 v3 完整版的关系

**v3-core 不是 v3 的替代，是 v3 的稳定子集**。两个文档可以并存：

- 个人开发者 / 小团队 → 直接用 v3-core
- 想做更完整 Agent 工程作战系统 → 在 v3-core 基础上选择性加入 v3 完整版的功能（dev-map、任务看板、feasibility 独立阶段等）

升级路径：v3-core → v3-full 是**加项不是改项**。结构性约束 / 常驻 review / 反馈晋升 在 v3-full 里也保留（这三层是好东西，不是为了凑数）。

---

## 12. 总结

v3-core 的本质是「**砍掉宿主短期会做的，集中做宿主长期不会做的**」。

具体落点：

1. **保留所有 C 档能力**（基线对比 / scope-check / Skill / SPEC 派生 / 跨宿主 / 编排）
2. **新增四层差异化能力**：三层来自 OpenAI 实战经验（结构性约束 / 常驻 review / 反馈晋升）+ 一层 v3-core 自创（知识资产晋升 → `docs/architecture/`）
3. **砍掉 A 档全部 + B 档大部分**（dev-map 自动化 / 任务看板 / 复杂状态机）
4. **角色从 7 收到 5**，把 gatekeeper 合进 designer 的自检
5. **plan mode 默认关闭**（继承 v3 修订）
6. **6 阶段 / 9 任务级工件 / 5 sub-agent + 主 agent 兼任 PM / 双域资产（.harness/ 机器消费 + docs/ 人类消费）**

它的护城河是**双晋升机制**：
- 反馈晋升：「review finding → 沉淀 → guardrail → 下次更稳」
- 知识资产晋升：「任务设计 → 沉淀到 docs/architecture/ → 后续任务可见」

两条都是宿主厂商绝对不会做的事 —— per-project / per-team / 脏活，但也是 harness engineering 真正的长期价值所在。

如果说 v2 是「让 agent 不撒谎」、v3 是「让 agent 像真实工程团队那样工作」，**v3-core 就是「让 harness 自己越用越厚」**。

价值窗口：24+ 个月。预期工作量：5-6 周。预期被替代风险：< 30%。
