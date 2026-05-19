# Agent Harness 产品设计方案 v3

> v3 与 v2 关系：v2 在「交付控制层」上是对的，但**对 agent 自动化全链路（规划 → 设计 → 分解 → 执行 → 测试 → 提交 → 沉淀文档）的覆盖不够**。v3 在保留 v2 repo-local kernel、宿主寄生、证据优先三条主干的基础上，吸收 JK Launcher 实战经验，把产品从「交付控制层」升级为「Agent 工程作战系统」。

## 1. 背景：为什么需要 v3

### 1.1 v2 做对的部分（继续保留）

- **repo-local kernel**：`.harness/` 作为唯一事实源，宿主配置只是生成物
- **Host 主路径，CLI fallback**：用户不离开宿主即可用，CLI 只服务 headless / debug / CI
- **Contract → Plan → Execute → Verify → Commit Gate** 主干，不滑向无限可编排 DAG
- **证据优先**：完成只能由 evidence + gate 支撑，不接受 agent 自述
- **职责角色而非固定实例**：保留可合并、可降级的弹性

这些原则不变，v3 是在它们之上做加法和精化。

### 1.2 v2 暴露出来的局限

| 局限 | 表现 | 根因 |
|---|---|---|
| **缺少独立设计阶段** | 把「设计」压缩到 plan.md（实际只有几行步骤） | v2 把 Plan 当成 contract 的薄附属品，没有独立的方案设计与评审 |
| **没有任务分解** | 大任务无法拆成可独立验证的小步骤 | 主干阶段是粗粒度的，缺 sub-task 抽象 |
| **没有独立审查角色** | Generator 写完直接进 verify，缺「对照 contract / design 看是不是按要求做出来」的环节 | v2 三角色里没有 reviewer |
| **没有基线对比** | agent 用「这是历史遗留问题」糊弄能成功 | Evidence 只看当前快照，不看 diff |
| **没有项目级知识** | 每次任务从零理解项目，重复造轮子 | 没有 dev-map / 任务看板 |
| **没有跨任务文档沉淀** | report.json 只是单任务结论，没有可读的多阶段文档链 | v2 工件粒度就一个 contract + plan + report |
| **流程硬编码** | workflow.ts 121 行直接写死阶段顺序 | 没有流程定义文件 + 角色契约抽象 |

### 1.3 JK Launcher 实战带来的 7 条关键洞察

这 7 条 v3 必须吸收，否则只是把 v2 改个版本号：

1. **以 SPEC 为先**：先和 AI 反复磨需求，比上来写 Rule 更重要
2. **Rule 只能管原则，不能管流程**：能脚本化的必须脚本化
3. **下游不能改上游文档**：违反这一条，多 agent 立刻退化为「一个大脑装作多人」
4. **PM 是路由器，不是大脑**：PM 一旦给专业意见就毁了
5. **必须做基线对比**：开发前跑一次 + 开发后跑一次，diff 才是真正的"新引入的问题"
6. **不同 Agent 配不同模型**：路由用 Haiku，专业判断用 Sonnet
7. **Memory 在团队场景必须靠边站**：该沉淀的进 repo（Rule / Scripts / 文档），不进会话记忆

### 1.4 v3 要回答的新问题

> 如何让一个 agent 在收到任务后，**自动完成「规划 → 设计 → 分解 → 执行 → 审查 → 测试 → 提交 → 沉淀文档」全链路**，且每一步都有独立工件、独立角色、独立证据，**任何一步失败都能定位到具体角色并打回，而不是整体重来**？

---

## 2. 产品定位升级

### 2.1 一句话定位

Agent Harness v3 是构建在 coding agent 之上的 **Agent 工程作战系统**：用结构化 SPEC、固定角色、可校验流程、独立证据和项目级知识库，把 agent 从「一次性写代码的工具」变成「在工程里可约束、可协作、可校验、可持续维护的执行体系」。

### 2.2 从「交付控制层」到「Agent 工程作战系统」

| 维度 | v2 定位 | v3 定位 |
|---|---|---|
| 产品比喻 | 「门禁 + 证据」 | 「作战系统：纪律 + 兵种 + 指挥链 + 验收」 |
| 主语义 | 拦截不合格交付 | 让 agent 自动跑完整工程链路 |
| 工件密度 | 1 contract + 1 plan + 1 report | 7 个阶段产物 + dev-map + 任务看板 |
| 角色密度 | 三职责（Planner / Generator / Evaluator） | 七职责（PM / 需求 / 设计 / 闸门 / 开发 / 审查 / 测试） |
| Workflow 实现 | 代码硬编码 | yaml 流程定义文件 + 角色契约 |

### 2.3 仍然不做的事（v3 边界继承 v2）

- 不是新的 coding agent runtime
- 不是 prompt 管理器
- 不是中心化协作平台
- 不承诺端到端无人值守自治开发（Memory 仍可被人工拉回）
- **不向 SaaS 演化**：永远是开源、本地优先、寄生宿主

---

## 3. 设计原则

### 3.1 继承自 v2 的六条原则

1. 产品本体是流程层，不是 runtime 层
2. 稳定定义阶段与工件，不稳定绑定角色实例
3. 关键节点强约束，其余阶段保持弹性
4. 证据优先于对话结论
5. 默认服务个人，但天然支持团队共享模板
6. 模型变强时，控制层应允许删减而不是继续堆积

### 3.2 v3 新增三条原则

7. **多 Agent 不是多大脑，是多角色**：每个角色只对自己的产物负责，不能越界改别人的产物
8. **能脚本化的不要 Rule 化，能 Rule 化的不要靠记忆**：约束的硬度逐级提升，永远朝硬的一端走
9. **知识沉淀进仓库，不沉淀进人**：Rule / Skill / 文档 / dev-map 都是 repo 资产，Memory 不当权威源

---

## 4. 角色模型：七个职责角色

### 4.1 角色清单与各自的必要性

每个角色都解决一个前一个角色解决不了的问题：

| # | 角色 | 解决什么问题 | 核心产物 | 默认模型档位 |
|---|---|---|---|---|
| 1 | **PM（项目经理）** | 整条链怎么有序串起来 | 阶段流转记录、打回记录 | 轻量（Haiku） |
| 2 | **需求分析（Requirement）** | 想做什么 | `requirement.md` + 结构化 SPEC | 中等（Sonnet） |
| 3 | **方案设计（Designer）** | 打算怎么做 | `design.md`（架构/接口/数据流/影响面） | 强（Sonnet/Opus） |
| 4 | **闸门总控（Gatekeeper）** | 现在能不能做 | `feasibility.md`（决议：通过 / 打回 / 暂停） | 中等（Sonnet） |
| 5 | **开发实现（Developer）** | 真正把它做出来 | 代码 diff + `implementation-notes.md` | 强（Sonnet/Opus） |
| 6 | **代码审查（Reviewer）** | 是不是按要求做出来 | `review.md`（findings + 是否打回） | 强（Sonnet） |
| 7 | **测试验证（Tester）** | 做出来的东西到底能不能用 | `test-report.md` + evidence baseline-diff | 中等（Sonnet） |

### 4.2 仍然是「职责」不是「实例」：合并 / 降级矩阵

v3 强化但不教条化七角色。允许根据任务复杂度合并：

| 任务规模 | 合并方案 | 实际启用角色 |
|---|---|---|
| **小（typo / 文档微调）** | 跳过设计 / 闸门 / 审查 | 需求 → 开发 → 测试 |
| **中（bug-fix / feature-simple）** | 设计与闸门合并；审查与测试合并 | PM + 需求 + 设计闸门 + 开发 + 审查测试 |
| **大（feature-cross / refactor）** | 全角色启用 | 全部 7 个 |
| **超大（migration / 跨多模块）** | 全启用，并支持 milestone 拆分 | 全部 7 个 + 多轮迭代 |

合并由配置驱动（见 §9），不是 agent 自由决定。

### 4.3 模型与工具集分层

每个角色独立配模型档位 + 独立工具集白名单。模型由宿主 sub-agent yaml 注入；工具集由宿主原生 sub-agent 的 `tools` / `permissions` 字段约束。详细实例化机制见 §4.5。

```yaml
# .harness/harness.config.yaml （节选）
roles:
  pm:           { model: haiku,  tools: [spawn_subagent, read, bash_readonly] }
  requirement:  { model: sonnet, tools: [read, grep, glob, bash_readonly, plan_mode] }
  designer:     { model: sonnet, tools: [read, grep, glob, bash_readonly, plan_mode] }
  gatekeeper:   { model: sonnet, tools: [read, grep, glob, bash_readonly] }
  developer:    { model: sonnet, tools: [read, edit, write, bash, grep, glob] }   # 主力，可选 opus
  reviewer:     { model: sonnet, tools: [read, grep, glob, bash_readonly] }
  tester:       { model: sonnet, tools: [read, bash, edit_test_only, write_test_only] }
```

工具集是**真硬约束**（host hook 物理拦截违规调用），不是 prompt 自律：

| 角色 | 不允许 | 物理拦截原因 |
|---|---|---|
| requirement / designer / gatekeeper / reviewer | Edit / Write 业务代码 | 这些角色任何时候都不应改代码（连「顺手改」都不行）|
| developer | 进入 plan mode | plan mode 语义就是「不许动手」，与 developer 本职冲突 |
| reviewer | Edit 任何文件除 review.md | 防止 reviewer 偷偷改代码再报「pass」|
| tester | Edit 业务代码 | tester 只能改测试文件 + test-report.md |
| 任意角色 | 改非自己 owner 的工件 | 纪律 1（下游不改上游）的物理实现 |

### 4.4 五条不可破的协作纪律

继承自 JK Launcher 实战 + v3-walkthrough 实测发现，写进产品本体：

#### 纪律 1：下游不能改上游文档

- Reviewer 觉得 design 有问题 → **emit blocker**，由 PM 打回 Designer，**不能自己改 design.md**
- 物理隔离：每个角色只对自己的产物有写权限，对上游产物只读
- 文件系统级强制：`.harness/tasks/<id>/{requirement,design,review,test-report}.md` 各自属于不同 owner

#### 纪律 2：PM 是路由器，不是大脑

PM 只允许做：

- 读取当前阶段产物
- 决定前进 / 打回 / 暂停
- 指定下一阶段 owner
- 记录交接日志
- **辅助产物的模板填充与汇总**（如 commit-summary.md、board.md 增量、阶段日志）—— 这些不算专业判断

PM **绝不允许**做：写需求、定方案、改代码、给专业判断、自行决定跳过某个角色。

#### 纪律 3：角色契约固定输入输出

每个角色的 yaml 契约严格规定它必须读哪些上游文件、必须写哪些产物、什么情况下能 emit blocker。Agent prompt 是承载，契约 yaml 是约束。

#### 纪律 4：Reviewer 打回必须归类（来自 walkthrough D-12）

reviewer 的 finding 必须显式归类，决定 PM 路由方向：

| Finding 性质 | 归类 | PM 动作 |
|---|---|---|
| 实现没按 design 走（开发漏步骤、违反 design 接口） | `block_execute` | 打回 developer 重做实现 |
| 实现按 design 走了，但 design 本身有缺陷（如 schema 写死、架构紧耦合） | `block_design` | 打回 designer 重做方案，已有的 implementation 作废 |
| design 没问题，但需求本身没说清（出现需求空白） | `block_spec` | 打回 requirement 重磨 SPEC，design + implementation 都作废 |
| 实现 + design 都对，但本次任务 scope 已经覆盖不到（需要拆任务） | `defer_to_new_task` | PM 创建后续任务，本任务关闭 |

review.md 必须显式标注每个 finding 的 `block_kind`。reviewer **不能**只说「打回」却不说打回到哪一棒。

每个 finding 必须有稳定 ID（`F-<task-id>-<seq>`），跨轮次可追踪。

`block_scope: minimal | full` 也必须显式：

- `minimal`：仅修 review.md 列出的 P0 finding，其它代码区域冻结
- `full`：从该阶段重新走（已有产物作废）

#### 纪律 5：产品层 blocker —— 真空地带必须升到用户（来自 walkthrough D-7 / D-8）

任何角色在执行时如果发现：

- v3 设计文档没规定的真空地带（如「这个新场景下谁有写权限？」）
- 跨产品架构的决策（如「要不要新增一类资产？」「要不要改协作纪律？」）
- 跨任务永久性影响（如「要不要废弃某个角色？」）

**必须 emit `product_layer_blocker`，强制流程暂停，由用户拍板**。

特别地，gatekeeper 不允许把这类问题就地决议为「采纳方案 X」。这是一类**比 stage blocker 更高一级的 blocker**，PM 不能自动路由消化，只能挂起任务并通知用户。

产品层 blocker 解决后必须留下决议记录：

- 进 v3 设计文档（如果是规则补全）
- 或进 `.harness/decisions/<date>-<topic>.md`（如果是项目级一次性决策）

绝不允许只在 task 内部消化掉 —— 因为下次同类情况会再次撞上同一真空。

### 4.5 Sub-agent 实例化机制

v3 的 7 角色**必须用宿主原生 sub-agent 实现，不允许用「单 agent 切换 prompt 角色」的方式模拟**。

#### 4.5.1 为什么必须真 sub-agent

单 agent 切角色会破坏 v3 三个核心设计：

| v3 核心设计 | 单 agent 切角色的破坏 | 真 sub-agent 的解法 |
|---|---|---|
| **物理隔离（纪律 1）** | 单 agent 看过所有阶段历史，reviewer 视角时仍记得 designer 的权衡，做不到独立审查 | sub-agent 是 cold reading，**只能从工件读上下文**，工件即唯一信道 |
| **模型分层（§4.3）** | 单 agent 模型固定，PM 用 haiku / designer 用 sonnet 的成本优化失效 | 每个 sub-agent 独立配模型 |
| **工具集隔离（§4.3）** | 单 agent 工具集固定，reviewer 也能 Edit | sub-agent 的工具白名单天然落地 |

更深层的：**单 agent 切角色违反 JK Launcher 的核心洞察「不要让一个 agent 既做需求又做方案又做代码又自审」**。这是 v3 多角色拆分的全部初衷。

#### 4.5.2 7 角色 = 6 sub-agent + 1 主 agent 兼任 PM

| 角色 | 实例形态 | 启动方式 |
|---|---|---|
| **pm** | 宿主主 agent 兼任（不创建独立 sub-agent） | 用户在宿主里的对话主线即是 PM |
| requirement / designer / gatekeeper / developer / reviewer / tester | 6 个独立 sub-agent | 由 PM 通过 spawn-subagent 工具发起 |

PM 不是 sub-agent 的理由：

- PM 的职责就是路由 + 用 spawn 工具发起其它 sub-agent，这正好是宿主主 agent 的天然位置
- 避免架构上「主 agent 之外又一个 PM」的诡异（谁路由谁？）
- 用户和宿主主 agent 的对话本来就是「项目级流程指挥」，PM 兼任最自然

#### 4.5.3 Sub-agent 文件清单

```
.claude/agents/                    .codex/agents/
├── harness-requirement.md         ├── harness-requirement.toml
├── harness-designer.md            ├── harness-designer.toml
├── harness-gatekeeper.md          ├── harness-gatekeeper.toml
├── harness-developer.md           ├── harness-developer.toml
├── harness-reviewer.md            ├── harness-reviewer.toml
├── harness-tester.md              ├── harness-tester.toml
└── （无 harness-pm，PM 由主 agent 兼任）
```

每个 sub-agent 文件由 `harness host install` 从 `.harness/agents/<role>.yaml`（v3 角色契约）+ `.harness/hosts/<host>/agent-template.{md,toml}` 渲染生成。仍然遵守 v2 已有的「`.harness/` 是 source-of-truth，宿主目录是生成物」原则。

#### 4.5.4 跨宿主能力矩阵

| 宿主 | 原生 sub-agent | 全 7 角色支持 | 降级方案 |
|---|---|---|---|
| **Claude Code** | 完整支持（`Agent` 工具 + `.claude/agents/` + `tools` 字段） | ✅ 全支持 | 不需要 |
| **Codex** | 支持（`.codex/agents/*.toml` + custom agent） | ✅ 全支持 | 不需要 |
| **Gemini CLI** | 无原生 sub-agent | ❌ 不支持 | **lite 预设**：合并为 3 角色（requirement / developer / tester），单 agent 模拟，文档警告用户 review/design/feasibility 缺失 |

Gemini 走 lite 是合理降级 —— 它本来在 v2 就是「实验性、不阻塞 V1」的位置。不强求对齐。

#### 4.5.5 Sub-agent 之间的通信纪律

- **绝不允许直接通信**：sub-agent A 不能调用 sub-agent B、不能读 B 的对话历史
- **唯一信道是工件**：所有跨角色信息流转通过 `.harness/tasks/<id>/*.md` 文件
- **PM 是唯一的路由源**：哪个 sub-agent 在何时启动，由 PM 根据 workflow.yaml 决定
- **Sub-agent 完成后产物落盘 + Stop hook 校验 + 返回结构化结果给 PM**：PM 据此决定下一步路由

### 4.6 宿主 plan mode 的角色级使用

#### 4.6.0 立场修订（来自 OpenAI Ryan Lopopolo 实战）

早期 v3 草案曾设想「requirement / designer 默认开 plan mode」。实战经验否决了这个默认：

> 「我几乎不用 plan mode。如果你用了计划却不认真看，你实际上是在编码一堆错误指令。如果要用计划，就把它作为独立 PR 提交，让人逐行 review，合并批准后才能启动。」 —— Ryan Lopopolo, OpenAI

核心矛盾：plan mode 输出 = 一份「待执行的指令清单」。如果用户不**逐行严格审查**就放行，等于把潜在的错误指令固化成下游所有阶段的依据。**默认开 plan mode 是误差放大器**。

v3 因此采取更保守的默认：

| 默认状态 | 立场 |
|---|---|
| **plan mode 默认关闭** | requirement / designer 默认走「直接产出结构化工件 + Stop hook schema 校验」，不进 plan mode |
| **plan mode 是可选增强** | 用户在 harness.config.yaml 显式开启 + 承诺逐行 review，才允许进 plan mode |
| **开启时必须满足三个前提** | (1) plan 作为独立工件落盘 (2) 用户必须 review-and-approve (3) 未 approve 时 sub-agent 不能进入下游阶段 |

这个修订把 plan mode 从「v3 主流程的载体」降为「特定场景下的可选工具」，与「证据优先」「不依赖人类同步驱动」两条核心原则更对齐。

#### 4.6.1 默认路径：直接产出结构化工件

requirement / designer 在默认配置下的行为：

```
PM spawn requirement-subagent (普通模式，不进 plan mode)
  ↓
sub-agent 读 system prompt + 角色契约
  ↓
与用户多轮对话磨需求 (在普通对话模式下)
  ↓
sub-agent 直接产出 requirement.md (按 schema 结构化输出)
  ↓
Stop hook 触发：harnessly host artifact-validate --role requirement
  → schema 校验：goal / 必须做 / 不做 / 影响模块 / 验收标准 / 风险 / 不确定项
  → 完整性校验：是否有"建议、可以、推荐、可选"等模糊词
  ↓
不通过 → reject，让 sub-agent 修产物
通过 → 派生 contract.yaml + 返回主 agent
```

designer 路径类似（产出 design.md + task-breakdown.md）。

**关键差异**：和 plan mode 不同，这里 sub-agent 直接对话用户、直接产出结构化工件，**不存在「先生成一份 plan、再让用户批准、再去执行」的中间环节**。Stop hook 校验是工件级校验，不是计划级校验。

#### 4.6.2 可选路径：plan mode 增强（必须严格 review）

仅在 harness.config.yaml 显式开启时启用：

```yaml
roles:
  requirement:
    plan_mode:
      enabled: true                # 默认 false
      require_review: true          # 必须为 true，否则启动时报错
      review_artifact: requirement-plan.md   # plan 单独落盘
      gate: human_approval          # 不允许 auto-approve
```

启用后流程：

```
PM spawn requirement-subagent
  ↓
sub-agent /plan 进入 plan mode
  ↓
与用户多轮对话
  ↓
ExitPlanMode 时 host hook 拦截
  ↓
hook 把 plan 文本落盘到 .harness/tasks/<id>/requirement-plan.md
  ↓
hook 暂停流程，等待用户 harness review-plan <task-id> 命令
  ↓
用户必须逐行 review，明确 approve / reject 每条计划项
  ↓ approve
sub-agent 重新启动 (这次不进 plan mode)，按已批准的 plan 产出 requirement.md
  ↓
Stop hook 校验工件 schema → 通过 → 派生 contract.yaml
```

三个硬约束：

1. **plan 必须独立落盘**：不允许「plan 文本仅在内存里直接转下游」
2. **用户 approve 是必须的人类介入点**：v3 七阶段流程中绝大部分动作可以无人值守，**plan mode 是唯一强制人类同步介入的场景**
3. **拒绝整体 approve**：用户必须逐条 approve，不允许一键全过

为什么这么严？因为「不严格 review 的 plan = 误差放大器」。如果你不愿意付 review 成本，**就不该用 plan mode**。

#### 4.6.3 哪些角色不允许用 plan mode（无论配置）

| 角色 | 不允许 plan mode 的原因 |
|---|---|
| developer | plan mode 语义是「不许动手」，与 developer 本职冲突 |
| gatekeeper | 纯判断（pass/block），plan mode 完全没意义 |
| reviewer | 判断 + 写 review.md，plan mode 是负优化 |
| tester | 执行 + 写报告，plan mode 阻止执行 |
| pm | 路由器，进 plan mode 会让整个流程死锁 |

这些角色即使用户在 config 里强制启用 plan mode，host hook 也会拦截 —— 是产品级 invariant，不是配置项。

#### 4.6.4 跨宿主降级

| 宿主 | 默认路径（结构化工件） | 可选路径（plan mode） |
|---|---|---|
| Claude Code | 普通 sub-agent + Stop hook | 原生 `/plan` + `ExitPlanMode` + 用户 approve |
| Codex | 普通 sub-agent + Stop hook | Codex plan-equivalent 命令 + 用户 approve |
| Gemini CLI | 普通 sub-agent + 多轮 prompt + Stop hook | 不支持 plan mode（无对应能力） |

#### 4.6.5 设计原则总结

- **默认不开 plan mode 不是退化，是更安全的工程默认值**
- **plan mode 的价值是「让 agent 先思考」，不是「自动转下游」** —— 想吃前者必须接受后者的代价：用户 review
- **如果团队没有 review plan 的纪律，宁可关掉**
- 这条原则呼应纪律 5（产品层 blocker）：**任何会绕过用户判断的自动化都是反 v3 的**

---

## 5. 核心产品模型（七层）

v2 是 5 层（Contract / Workflow / Execute / Context / Evidence），v3 升级为 7 层：

```
SPEC Layer
  ↓
Contract Layer        （SPEC 的结构化裁剪）
  ↓
Workflow Layer        （阶段编排 + 角色契约 + 流程文件）
  ↓
Execute Boundary
  ↓
Evidence Layer        （三级 evidence + 基线对比）
  ↓
Knowledge Layer       （dev-map + 任务看板）
  ↓
Memory Boundary       （明确不在主干）
```

### 5.1 SPEC Layer（v3 新增）

**问题**：v2 的 contract 是「裁剪过的 SPEC 片段」，跳过了「和 AI 反复磨需求」这一步，导致 contract 看起来填好了，但用户其实没真正想清楚要做什么。

**v3 的解法**：在 contract 之前先有一个 **SPEC 阶段**：

- 由「需求分析」角色和用户多轮对话，产出 `requirement.md`
- SPEC 必须满足：**没有"建议、可以、推荐、可选"等模糊词**
- SPEC 必须显式回答：
  - 这个版本到底要解决什么问题
  - 哪些是核心目标、哪些是顺手优化
  - 改动会影响哪些模块
  - 什么样才算做完
- SPEC 完成后，自动派生结构化 contract.yaml（contract 不再是用户输入，而是 SPEC 的结构化提取）

### 5.2 Contract Layer（v3 精简）

继承 v2 的 schema 思路，但**剥离 verifiable 检查到 acceptance_criteria 元数据**（v2 当前缺这个）：

```yaml
# .harness/tasks/<id>/contract.yaml
version: "2.0"
task_id: "..."
goal: "..."
scope:
  include: ["..."]    # 见 §5.2.1 scope 语义
  exclude: ["..."]    # 见 §5.2.1 scope 语义
acceptance_criteria:
  - criterion: "..."
    verifiable_by: "test|build|lint|playwright|api|manual"
    test_hint: "..."
risk_level: low | medium | high
estimated_complexity: simple | medium | complex
required_checks: ["build", "lint", "typecheck", "test"]
linked_spec: "requirement.md"
linked_design: "design.md"   # design 阶段后回填
created_at: "..."
```

Contract Gate 仍然存在，但不再是产品入口（SPEC 才是入口）。

#### 5.2.1 scope 语义（来自 walkthrough D-1）

scope.include / scope.exclude 必须按以下严格语义：

- **`scope.include`：expectation list（期望集），不是 allowlist（许可集）**
  - 含义：「我**预期**这次任务会修改这些路径」
  - 用途：scope-check 时**只用作展示对照**，不直接放行 / 拦截
  - 允许出现「即将创建的文件」（包括尚未存在的路径），requirement 阶段可以写预期产物
  - **不能**作为「允许写哪里」的依据

- **`scope.exclude`：denylist（拒绝集），强制约束**
  - 含义：「这些路径**绝不能**被本任务修改」
  - 用途：scope-check 时一旦发现 changed_files 命中 exclude，**直接 fail**
  - 任何角色试图写 exclude 路径 → 被 host hook 物理拦截

- **scope-check 的判定逻辑**（v3 修订）：
  ```
  for f in changed_files:
      if f matches any pattern in scope.exclude:
          return FAIL (out_of_scope)
  return PASS（不再要求 changed_files 必须落在 include 内）
  ```

- **「写权限」由 §6.3 Owner 矩阵决定，不由 scope.include 决定**。
  scope.include 是给人和 reviewer 看的「这次任务的范围预期」，不是给 host hook 拦截器用的 allowlist。

- requirement 阶段允许把「即将新增」的文件写进 scope.include 作为预期；execute 阶段如果命中 scope.exclude 必然失败；如果偏离 scope.include（修了没预期到的文件）由 reviewer 评估是否是合理偏离 —— 不自动 fail。

这条规则解决两个问题：

1. v2 的 scope-check 用 allowlist 语义，会因「include 没列全」误拦合理改动，导致用户必须把 include 写得过宽
2. v3-walkthrough 中 contract 直接列出尚未存在的文件路径不再违反语义

### 5.3 Workflow Layer（v3 升级为 yaml 驱动）

v2 的 workflow 是 121 行硬编码 ts。v3 升级为：

- `.harness/workflow.yaml`：定义阶段、迁移边、回退边
- `.harness/agents/<role>.yaml`：定义每个角色的输入输出契约
- `core/workflow/engine.ts`：从 yaml 读取并驱动，**不再硬编码顺序**

#### 默认流程

```yaml
# .harness/workflow.yaml （默认）
stages:
  - id: spec
    owner: requirement
    produces: [requirement.md, contract.yaml]
    next: design
    on_blocker: spec   # 自循环：和用户继续磨

  - id: design
    owner: designer
    requires: [requirement.md, contract.yaml]
    produces: [design.md, task-breakdown.md]
    next: feasibility
    on_blocker: spec

  - id: feasibility
    owner: gatekeeper
    requires: [requirement.md, design.md, task-breakdown.md]
    produces: [feasibility.md]
    decision: pass | block_design | block_spec
    next_on_pass: execute

  - id: execute
    owner: developer
    requires: [requirement.md, design.md, task-breakdown.md, contract.yaml]
    produces: [code_changes, implementation-notes.md]
    next: review

  - id: review
    owner: reviewer
    requires: [requirement.md, design.md, code_changes, implementation-notes.md]
    produces: [review.md]
    decision: pass | block_execute | block_design
    next_on_pass: test

  - id: test
    owner: tester
    requires: [contract.yaml, code_changes]
    produces: [test-report.md, evidence.json]
    next: commit_gate

  - id: commit_gate
    owner: pm
    requires: [test-report.md, review.md, evidence.json]
    produces: [commit-summary.md, report.json]
    decision: ready | block
```

### 5.4 Execute Boundary（保留 v2）

v2 已经做对了：harness 在 execute 前组装 prompt，execute 后通过 working tree / diff / exit code 接管 verify。v3 不动这个边界，**只**做两件事：

- prompt 组装时增加 `requirement.md` + `design.md` + `task-breakdown.md` 注入
- prompt 必须显式说明「你是 developer 角色，不能改 requirement / design 文件」

### 5.5 Evidence Layer（v3 升级：三级 + 基线对比 + Skill 化）

#### 三级 evidence 继承 v2，但每级都明显加强

##### Level 1：自动化硬指标 + 基线对比（v3 关键升级）

```
任务开始前 → 跑一次 baseline → 落盘 baseline.json
任务执行后 → 跑一次 current  → 落盘 current.json
diff(baseline, current) → 真正的"新引入问题"
```

只有 **diff 增量为非零** 才算这次任务的责任。这一条直接根除「这是历史遗留问题」的糊弄空间。

##### Level 2：Contract 驱动验证

acceptance_criteria 的 `verifiable_by` 元数据驱动：

- `test` → 跑指定测试
- `build` → 编译 + 检查产物
- `playwright` → 生成并跑 e2e
- `api` → 发请求并断言响应
- `manual` → 标记为待人工
- `lint` → 静态扫描

##### Level 3：AI 辅助评估（默认关闭）

只在高风险任务或用户显式要求时启用，由 reviewer / tester 角色发起。

#### Skill 化的 Level 1（v3 新增）

把 build / lint / typecheck / test / scope-check 拆成可复用 Skill：

```
.harness/skills/
├── build/
│   ├── node.yaml      # npm run build
│   ├── go.yaml        # go build ./...
│   └── python.yaml    # uv build
├── lint/
│   ├── eslint.yaml
│   ├── golangci.yaml
│   └── ruff.yaml
└── ...
```

Skill 是 yaml 描述「步骤 + 命令 + 期望输出 + 失败提示」，不是代码。它解决 v2 当前 evidence.ts 只支持 npm 的局限。

### 5.6 Knowledge Layer（v3 新增）

#### 5.6.1 dev-map（开发导航）

`.harness/dev-map.md`，由 **Developer 角色**在 execute 阶段顺手维护：

- 主要目录结构
- 各模块职责
- 标准写法 / 已有模式
- 改一个模块会牵动哪些链路

**纪律：谁改代码，谁改地图。** 不允许搞一份「漂亮但永远不更新」的总文档。

dev-map 在 prompt 组装时被喂给 developer，避免重复造轮子。

##### 5.6.1.1 dev-map 初始化（来自 walkthrough D-3）

dev-map **不是**等 designer 在第一次任务里临时拼一份。它必须在仓库初始化阶段就存在骨架。

**生命周期分为三步**：

1. **bootstrap（一次性，由 `harness init` 自动完成）**
   - 扫描仓库目录树（深度 2-3 层）
   - 用 LLM（haiku 档位）为每个 top-level 模块生成一行职责描述
   - 落 `.harness/dev-map.md` 骨架，标记 `<!-- bootstrap, awaiting human review -->`
   - 用户可选择：直接接受 / 手工编辑 / `harness map regenerate` 全量重建

2. **incremental（每次 execute 完成时由 developer 增量补）**
   - developer 在 execute 阶段必须读 dev-map
   - 在 task-breakdown 最后一步显式更新 dev-map 中受影响的模块条目
   - host hook 检查：execute 阶段如果命中了 dev-map 已索引的模块、但 dev-map 未在 diff 中 → 警告（非阻断）

3. **staleness check（周期性，由 `harness map verify` 触发）**
   - 抽查 dev-map 中提到的文件路径是否仍存在
   - 用 LLM 抽样验证 dev-map 描述与真实代码是否一致
   - 发现漂移 → 创建 dev-map 维护任务（独立 task，不混进当前 task）

**核心约束**：

- designer / requirement / gatekeeper / reviewer / tester 都**不能写** dev-map（否则会越界）
- 唯一例外是 `harness init` 命令本身（系统行为，不是某个 agent 角色）
- 从 dev-map 不存在到第一个 task 之间，必须有 init 步骤兜底；不允许 designer 在 task 中临时 bootstrap

**新增命令**：

| 命令 | 作用 |
|---|---|
| `harness init` | 已有命令，扩展为同时初始化 dev-map 骨架 |
| `harness map regenerate` | 全量重建 dev-map（用于大重构后） |
| `harness map verify` | staleness check，输出漂移报告 |

#### 5.6.2 任务看板

`.harness/board.md`，由 **PM 角色**维护：

- 当前在做哪些任务、各自处于哪个阶段
- 已完成任务的交付结论
- 文档目录索引

新任务进入需求分析时，先读看板，避免「新方案把旧方案冲掉」。

### 5.7 Memory Boundary（v3 明确边界）

v3 明确 **Memory 不在产品主干**：

| 类型 | 落点 |
|---|---|
| 个人偏好（语言、shell 等） | 用户级 Memory（不进 repo） |
| 团队对齐的事实 | repo 内文档（dev-map / SPEC） |
| 团队对齐的规矩 | Rule / Scripts |
| 错题集 | 升格为 Rule 或 Scripts，不长期当 Memory |

Memory 可以作为「润滑剂」存在，但永远不当权威源。

---

## 6. 工件与多文档链

### 6.1 任务级工件（每个 task 都有）

```
.harness/tasks/<task-id>/
├── requirement.md           # 需求分析产物（来自 SPEC 阶段）
├── contract.yaml            # 结构化契约（自动从 requirement 派生）
├── design.md                # 方案设计产物
├── task-breakdown.md        # 任务分解（设计的产物）
├── feasibility.md           # 闸门决议
├── implementation-notes.md  # 开发笔记
├── review.md                # 代码审查报告
├── test-report.md           # 测试报告
├── evidence/
│   ├── baseline.json        # 任务前快照
│   └── current.json         # 任务后快照
├── commit-summary.md        # 最终提交说明
├── report.json              # 机器可读总报告（保留 v2）
└── state.json               # 状态机持久化
```

### 6.2 仓库级工件（跨任务共享）

```
.harness/
├── harness.config.yaml      # 主配置
├── workflow.yaml            # 流程定义
├── agents/                  # 角色契约
│   ├── pm.yaml
│   ├── requirement.yaml
│   ├── designer.yaml
│   ├── gatekeeper.yaml
│   ├── developer.yaml
│   ├── reviewer.yaml
│   └── tester.yaml
├── skills/                  # 可复用动作
│   ├── build/
│   ├── lint/
│   ├── typecheck/
│   └── test/
├── rules/                   # 项目级 Rule
│   └── *.md
├── templates/               # 任务模板
├── domains/                 # 领域文档
├── dev-map.md               # 开发导航
├── board.md                 # 任务看板
└── tasks/                   # 各任务目录
```

### 6.3 Owner / Reader 矩阵

下表是 v3 强制约束的核心。**任务级**和**仓库级**两类资产分别治理：

#### 6.3.1 任务级工件（写权限按角色严格隔离）

| 工件 | Owner（可写） | Readers（只读） |
|---|---|---|
| `requirement.md` | requirement | 全部下游角色 |
| `contract.yaml` | requirement | 全部下游角色 |
| `design.md` | designer | gatekeeper, developer, reviewer, tester, pm |
| `task-breakdown.md` | designer | 同上 |
| `feasibility.md` | gatekeeper | developer, reviewer, tester, pm |
| `implementation-notes.md` | developer | reviewer, tester, pm |
| 代码 diff（src/ 等） | developer | reviewer, tester, pm |
| `review.md` | reviewer | tester, pm |
| `test-report.md` | tester | pm |
| `commit-summary.md` | pm | 用户 |
| `state.json` / `report.json` | 当前 active stage 的 owner（由系统写） | 全部 |

#### 6.3.2 仓库级资产（跨任务共享，特殊治理 — 来自 walkthrough D-4）

| 资产 | 默认 Owner | 首次落地 | 演进规则 |
|---|---|---|---|
| `.harness/dev-map.md` | `harness init`（系统行为）+ developer 增量 | `harness init` 自动 bootstrap | developer 在 execute 末尾增量；不允许其它角色写 |
| `.harness/board.md` | pm | `harness init` 创建空骨架 | pm 在每次 stage 切换时增量；不允许其它角色写 |
| `.harness/skills/**/*.yaml` | developer（首次落地）+ 用户手工 | 由当前任务的 developer 在 execute 阶段写入 | 后续任务可继续修改，但**必须 reviewer 额外 review**（见下） |
| `.harness/rules/**/*.md` | 用户 + developer（首次落地） | 由当前任务的 developer 在 execute 阶段写入 | 同上 |
| `.harness/templates/**` | 用户（手工） + `harness template promote`（系统） | promote 命令派生 | 不接受 agent 直接修改 |
| `.harness/agents/<role>.yaml` | **用户**（手工） | 不允许 agent 直接修改 | 任何修改必须经过产品层 blocker |
| `.harness/workflow.yaml` | **用户**（手工） | 不允许 agent 直接修改 | 同上 |
| `.harness/harness.config.yaml` | **用户**（手工） + `harness init`（系统） | `harness init` 创建 | 同上 |

**核心规则**：仓库级资产分三类处理。

1. **可由 agent 直接修改的**（`dev-map.md` / `board.md`）
   - 写入责任固定在某个角色（developer / pm）
   - 写入由当前 active stage 的 owner 完成，host hook 直接放行

2. **首次落地由 agent 写、但需额外 review 的**（`.harness/skills/` / `.harness/rules/`）
   - 当前任务的 developer 在 execute 阶段可以写
   - 触发条件：必须由 design.md 显式声明「本任务需要新增/修改仓库级资产 X」
   - reviewer 必须额外做一项 review：检查新资产是否会影响其它已有任务（跨任务影响审查）
   - host hook 检查：发现 developer 写仓库级资产时，验证 design.md 是否声明了这次落地，未声明则拦截

3. **必须由用户手工或专用命令处理的**（`agents/` / `workflow.yaml` / `harness.config.yaml` / `templates/`）
   - 这些是产品层骨架，agent 一律不能直接改
   - 任何修改需求必须 emit 产品层 blocker（见纪律 5）
   - 例外：`harness init` / `harness template promote` 这类系统命令可以写，因为它们不是 agent

由 host hook 在 PreToolUse 时检查文件路径与当前角色的写权限，**违反就阻断**。

### 6.4 物理 + 逻辑双重隔离

- **逻辑隔离**：角色契约 yaml 描述边界，prompt 注入「你只能写这些文件」
- **物理隔离**：host hook 在工具调用前拦截非法写操作
- **打回机制**：下游角色不能改上游 → 必须 emit blocker → PM 路由打回上游

---

## 7. 产品形态

### 7.1 主入口仍是 Host 寄生

继承 v2 决策，**不变**：

- Claude Code / Codex / Gemini CLI 是默认主路径
- 用户继续在宿主里工作，harness 通过 hooks 自动介入
- `.claude/`、`.codex/`、`.gemini/` 是从 `.harness/hosts/` 生成的薄壳

### 7.2 CLI 路径仍是 fallback

`harness run / eval / list / spec / design / review / promote` 都存在，但**只服务**：

- headless / CI 场景
- 单步调试（先跑 spec 看产物，再跑 design）
- 用户主动想脱离宿主时

### 7.3 文档输出

每个任务结束时，自动生成：

- `commit-summary.md`（人读）
- `report.json`（机器读）
- 可选：HTML 渲染版本（用于 PR review）

---

## 8. MVP（v3 形态）

### 8.1 MVP 目标

> 给一个目标，agent 跑完 SPEC → Design → Feasibility → Execute → Review → Test → Commit Gate 七阶段，每阶段都有独立工件落盘，任意一步不合格能精准打回到 owner。

### 8.2 默认 Workflow（中等任务）

```
harness run "修复登录页面在断网时的卡死问题"
  ↓
[1/7 SPEC]
  requirement agent 启动 → 与用户多轮澄清 → requirement.md + contract.yaml
  ↓ 用户确认 SPEC
[2/7 Design]
  designer agent → 读 requirement → 输出 design.md + task-breakdown.md
  ↓
[3/7 Feasibility]
  gatekeeper agent → 读 requirement + design → feasibility.md
  ↓ pass
[4/7 Execute]
  evidence baseline 快照
  developer agent → 读全部上游 + dev-map → 改代码 + implementation-notes.md
  evidence current 快照 → diff
  ↓
[5/7 Review]
  reviewer agent → 对照 requirement + design + diff → review.md
  ↓ pass
[6/7 Test]
  tester agent → 跑 acceptance_criteria 驱动的验证 → test-report.md
  ↓ pass
[7/7 Commit Gate]
  pm agent → 汇总全部产物 → commit-summary.md + report.json
  ↓ commit_ready
任务完成；developer 增量更新 dev-map；pm 更新 board
```

任意阶段失败 → PM 打回到 owner 重做，已完成的下游产物作废。

### 8.3 核心命令（CLI fallback 视角）

| 命令 | 作用 |
|---|---|
| `harness init` | 初始化 .harness/、生成默认 workflow.yaml + 角色契约 + skill |
| `harness run "<goal>"` | 跑完整七阶段（默认） |
| `harness spec` | 仅跑 SPEC 阶段（产出 requirement.md） |
| `harness design [task-id]` | 仅跑 design 阶段 |
| `harness review [task-id]` | 重跑 review |
| `harness eval [task-id]` | 重跑 test 验证（不重新生成代码） |
| `harness resume [task-id]` | 从某阶段继续 |
| `harness rollback [task-id] --to-stage spec` | 强制打回到某阶段 |
| `harness board` | 渲染当前任务看板 |
| `harness map regenerate` | 全量重建 dev-map（少用，正常用增量） |

### 8.4 v3 MVP 不做的事

- 不做 milestone 拆分（Phase 2）
- 不做 MCP 接入（Phase 3）
- 不做 Skill 库的语义匹配（仍用规则）
- 不做团队中心化平台
- 不做 Web UI

---

## 9. 配置接口

### 9.1 角色契约（`.harness/agents/designer.yaml` 示例）

```yaml
role: designer
model: sonnet
system_prompt: |
  你是方案设计角色。你的产物是 design.md 和 task-breakdown.md。
  你只能读 requirement.md 和 contract.yaml。
  你不能修改 requirement.md。
  当你认为 requirement 不清晰时，必须 emit blocker，让 PM 打回需求分析。

inputs:
  - requirement.md          # 必须读
  - contract.yaml           # 必须读
  - dev-map.md              # 必须读（项目上下文）
  - board.md                # 选读

outputs:
  - design.md               # 必须产出
  - task-breakdown.md       # 必须产出

writable_paths:
  - .harness/tasks/<task-id>/design.md
  - .harness/tasks/<task-id>/task-breakdown.md

readable_paths:
  - .harness/tasks/<task-id>/requirement.md
  - .harness/tasks/<task-id>/contract.yaml
  - .harness/dev-map.md
  - .harness/board.md
  - "src/**"
  - "docs/**"

blocker_conditions:
  - "requirement 中存在模糊词（建议、可能、可以等）"
  - "scope 不清晰，无法画出影响面"
  - "已有架构与 requirement 冲突，无法在不改架构前实现"

success_criteria:
  - "design.md 必须包含：架构图描述、关键接口、数据流、影响面、风险点"
  - "task-breakdown.md 必须把目标拆成 3-10 个可独立验证的子任务"
```

### 9.2 流程定义（`.harness/workflow.yaml`）

见 §5.3。

### 9.3 默认配置可裁剪

```yaml
# harness.config.yaml
workflow:
  preset: "standard"        # standard | lite | full
                            # lite: 跳过 design + feasibility + review
                            # full: 全启用 + Level 3 evidence
  custom_workflow: null     # 指向自定义 workflow.yaml
roles:
  enabled: ["pm", "requirement", "designer", "gatekeeper",
            "developer", "reviewer", "tester"]
  models:
    pm: haiku
    requirement: sonnet
    designer: sonnet
    gatekeeper: sonnet
    developer: sonnet
    reviewer: sonnet
    tester: sonnet
evidence:
  baseline_diff: true       # v3 默认开启基线对比
  level3_enabled: false
knowledge:
  dev_map: true
  board: true
  auto_update: true         # 任务结束自动更新
```

---

## 10. 与 v2 的差异速查

| 维度 | v2 | v3 |
|---|---|---|
| **角色数量** | 3 职责 | 7 职责（可降级到 3） |
| **主干阶段** | 5（Contract/Plan/Execute/Verify/CommitGate） | 7（SPEC/Design/Feasibility/Execute/Review/Test/CommitGate） |
| **流程实现** | 硬编码 ts | yaml 流程定义 + 角色契约 |
| **入口** | contract（用户填表） | SPEC（多轮对话磨需求） |
| **设计阶段** | 隐式（plan.md 几行步骤） | 显式独立角色 + design.md |
| **任务分解** | 无 | task-breakdown.md（3–10 子任务） |
| **审查阶段** | 无 | reviewer 独立角色，对照 design 看 diff |
| **基线对比** | 无 | evidence baseline.json + current.json + diff |
| **协作纪律** | 无 | 三条不可破：下游不改上游 / PM 是路由 / 角色契约 |
| **项目知识** | 无 | dev-map + 任务看板 |
| **Skill 系统** | 无 | `.harness/skills/` 可复用动作库 |
| **Memory 边界** | 未明确 | 显式不在主干 |
| **Schema 完整度** | 简化（缺 verifiable_by 等） | 补回元数据，Contract Gate 才能驱动 Level 2 |

---

## 11. 落地路线（6–8 周）

每周 1 个里程碑，每周都有可见产出，可以独立 demo。

### Week 1：SPEC 闭环 + 角色契约骨架

- 新增 `core/spec/` 模块，承担多轮对话磨需求
- 新增 `core/agents/` 抽象，加载 yaml 契约
- 把 contract 从「用户填表」改成「SPEC 派生」
- 默认 `requirement.yaml`（在原来的契约位置）写出 requirement / designer / gatekeeper 三个

### Week 2：Designer + Reviewer 角色实装

- `core/design/` 模块（Designer 角色）
- `core/review/` 模块（Reviewer 角色，独立于 evaluator）
- 引入模型分层 + 多角色 prompt 注入

### Week 3：PM 路由 + 文件级写权限隔离

- 显式 PM agent，只做路由
- Host hook（`PreToolUse`）拦截非法写：当前 active_role 与目标路径不匹配 → 阻断
- `state.json` 记录 active_role + active_stage

### Week 4：基线对比 + 闸门总控

- evidence baseline.json + current.json + diff
- gatekeeper 独立 agent 实装
- workflow.yaml 流程文件驱动 engine（替代硬编码）

### Week 5：Skill 化 + 多语言扩展

- `.harness/skills/` 目录约定
- Level 1 evidence 拆成 Skill
- 加 Go / Python / Rust 的默认 build/lint/typecheck/test skill

### Week 6：dev-map + 任务看板

- `dev-map.md` 自动初始化（扫描目录 + LLM 摘要）
- `board.md` 自动维护（任务状态机变化时更新）
- developer 角色 prompt 中加入「completion 时增量更新 dev-map」要求

### Week 7：HTML report + Phase 5 打磨

- 多文档链汇总成 `commit-summary.html`（PR-ready）
- 错误处理打磨
- README / 快速开始 / 真实项目验证

### Week 8：buffer / 收尾 / 发布

- 在 3-5 个真实仓库做端到端验证
- 文档完整化
- npm 发布配置

---

## 12. 评审场景（v3 增强）

### 场景一：单人完整自动化任务

- 输入：`harness run "在登录页加 SSO 入口，支持 GitHub 和 Google"`
- 期望：自动跑完七阶段，每阶段独立工件，最终 commit-summary.md 包含完整链路证据
- gate 行为：design 不够清晰 → gatekeeper 打回 → 重做 design
- 成功判定：commit_ready=true 且 baseline-diff 无新增失败

### 场景二：下游试图改上游被阻断

- 设置：reviewer 阶段，agent 想直接修改 design.md
- 期望：host hook 在 PreToolUse 拦截，返回 blocker 提示
- 成功判定：design.md 文件未变更，事件流记录拦截

### 场景三：基线对比根除"历史遗留"糊弄

- 设置：项目本身已有 lint warning 5 个；任务执行后 lint warning 变成 8 个
- 期望：commit_gate 拦截，明确报"本次新增 3 个 lint warning"
- 成功判定：agent 无法用「不是我引入的」绕过

### 场景四：dev-map 命中已有实现

- 设置：用户提需求「加一个 throttle 工具函数」，dev-map 中已有 `src/utils/rate-limit.ts`
- 期望：designer 在读 dev-map 后识别冲突，emit "建议复用已有实现" 的 blocker
- 成功判定：避免重复造轮子，由 PM 路由让 requirement 重新澄清

### 场景五：长任务多 milestone 中断恢复

- 设置：execute 阶段执行到一半中断
- 期望：`harness resume <task-id>` 从 execute 续跑，不重做 spec / design / feasibility
- 成功判定：已有产物完整继承，仅缺失阶段重跑

### 场景六：模型降级仍能跑通

- 设置：把 designer / reviewer 都降到 haiku
- 期望：流程不卡死，但 review.md / design.md 质量明显下降
- 成功判定：系统稳定，质量警报由 evidence baseline-diff 体现

### 场景七：lite 模式跑微小任务

- 设置：`harness run "修个 typo" --preset lite`
- 期望：跳过 design / feasibility / review，requirement → execute → test → commit
- 成功判定：约 30 秒内完成，无重复仪式

---

## 13. 已知风险与不做的事

### v3 已知风险

| 风险 | 描述 | 缓解 |
|---|---|---|
| **七角色 token 成本** | 每个角色都启动一次 LLM 调用，cost 是 v2 的 4–6 倍 | 模型分层 + lite 预设 + Skill 复用 |
| **角色契约维护成本** | yaml 多了，初学者上手门槛升高 | 内置 standard / lite / full 三套预设，开箱即用 |
| **dev-map 漂移** | 谁改代码谁改地图的纪律可能被 agent 偷懒跳过 | host hook 检查：execute 阶段产物必须包括 dev-map.md diff（如果命中相关模块） |
| **Skill 库碎片化** | 不同项目的 build / lint 命令差异大，skill 写不全 | 默认提供 8 大栈（node/go/python/rust/.net/java/ruby/php），其他靠用户自定义 |
| **被宿主吃掉** | 不变的结构性风险 | 保持 repo-local kernel + 跨宿主统一这两条护城河 |

### v3 仍然不做

- 不做 SaaS / 中心化平台
- 不做 agent 自由协商式协作（v2 已拒绝）
- 不做执行期细粒度 runtime 控制
- 不做 Memory 主干化
- 不做不可解释的智能编排
- 不做 Web UI（Phase 后续可选）

---

## 14. 总结

v3 的本质升级是：**从「让 agent 交付不出错」升级为「让 agent 自己跑完整工程链路」**。

具体落点：

1. **入口从 contract 升级为 SPEC**：先磨需求，再结构化
2. **角色从 3 扩到 7**：但仍是职责，可降级，可合并
3. **工件从 3 个扩到 12+**：每阶段独立产物，证据链完整
4. **流程从硬编码升级为 yaml 驱动**：可裁剪、可校验、可演进
5. **Evidence 增加基线对比**：根除"历史遗留"糊弄
6. **新增 Knowledge Layer**：dev-map + 任务看板，让 agent 有项目记性
7. **三条协作纪律写进产品本体**：下游不改上游 / PM 是路由 / 角色契约固定

它不变的部分：

- 仍然是 repo-local kernel
- 仍然是 host 寄生主路径
- 仍然不做 SaaS、不做中心化、不做 runtime 优化
- 仍然允许在模型变强时往回退

如果说 v2 是「让 agent 不撒谎」，v3 就是「让 agent 像一个真实工程团队那样工作」。

最终，Agent Harness v3 的长期价值仍在一个朴素结论上：

> 让 agent 参与的软件开发过程**可控、可证、可复用、可恢复，并且每一步都能定位到具体角色**。

这是它相对单纯 runtime 包装、相对宿主自带 skill / hook 的根本差异。
