# Agent Harness 产品设计方案 v2

## 1. 背景与问题定义

### 1.1 背景

我们已经验证过一类常见路径会迅速失效：在 coding agent 的 runtime 层持续缝补，通过更复杂的 prompt 包装、上下文拼接、会话恢复技巧和命令代理去提高单次执行质量。这个方向短期有效，但长期会被模型能力演进快速替代。

真正稳定的需求不在“如何把 agent 调得更聪明”，而在“如何让 agent 参与的软件开发过程更可控、更可验证、更适合长时间运行，并且能在个人和团队中复用”。

Anthropic 与 OpenAI 关于 harness engineering 的实践虽然表面形式不同，但核心结论高度一致：

- 长时间任务不能只依赖单轮对话，需要显式流程工件承载状态。
- agent 对自己的产出存在天然乐观偏差，自评不能替代独立验证。
- harness 的很多组件，本质上都是对当前模型能力缺口的补偿，而不是永恒架构。
- 真正长期承重的应该是高层控制结构，而不是底层 runtime 技巧。

### 1.2 问题

当前基于 coding agent 的开发流程普遍有四类问题：

1. 需求和边界没有被结构化表达，导致 agent 很快滑向“直接开干”。
2. 任务过程主要依赖对话上下文，一旦任务变长、中断或切换执行者，状态就容易丢失。
3. 完成判断常常来自 agent 自述，而不是来自独立证据和门禁。
4. 每次任务都从头组织 prompt 和流程，个人经验难以沉淀，团队经验更难复用。

### 1.3 产品机会

我们的产品机会不是再做一个 runtime wrapper，而是构建 **Agent Harness 的流程质量层**：

> Agent Harness 是 coding agent 之上的流程与质量控制层，通过 contract、workflow、gate 和 evidence，把需求到提交的开发过程从对话式试错，变成可约束、可验证、可持续运行的交付流程。

## 2. 产品定位

### 2.1 一句话定位

Agent Harness 是构建在 coding agent 之上的工程交付控制层，而不是新的 agent runtime。

### 2.2 它是什么

它提供四类稳定能力：

- 用 `contract` 约束任务输入、范围、验收标准和风险边界。
- 用 `workflow` 编排需求到提交的标准开发流程。
- 用 `gate` 在关键节点实施强约束，阻止“看似完成、实际上不可交付”的结果流出。
- 用 `evidence` 记录验证结果、问题列表和完成状态，为提交与复用提供依据。

### 2.3 它不是什么

第一版产品明确不做以下定位：

- 不是新的 coding agent。
- 不是 model runtime 优化器。
- 不是 prompt 管理器。
- 不是第一版就做团队中心化协作平台。
- 不是承诺端到端自治开发的自动化系统。

## 3. 设计原则

产品设计遵循以下六条原则：

1. **产品本体是流程层，不是 runtime 层。**  
   runtime 只是接入方式，不是核心产品价值。

2. **稳定定义阶段与工件，不稳定绑定角色实例。**  
   产品要定义什么阶段必须存在、什么工件必须产出，而不是预设永远需要固定数量的 agent。

3. **关键节点强约束，其余阶段保持弹性。**  
   强约束只放在 contract、plan、verify、commit gate 等关键节点，避免把整个过程流程化过度。

4. **证据优先于对话结论。**  
   “我已经完成了”不是完成依据；验证结果、报告和 gate 状态才是。

5. **默认服务个人，但天然支持团队共享模板。**  
   第一版先解决单仓库、本地优先的真实问题，同时保留团队共享规则与模板的能力。

6. **模型变强时，控制层应允许删减而不是继续堆积。**  
   每个 harness 机制都应被视为当前能力边界下的暂时承重件，而不是永久层级。

## 4. 角色模型：职责角色，不是固定三 Agent 架构

### 4.1 角色定义

产品内部固定定义三类职责角色：

#### Planner

负责把模糊目标转成可执行约束，核心输出包括：

- `Task Contract`
- `Plan`
- `Acceptance Criteria`
- 风险与边界说明

#### Generator

负责按 contract 和 plan 执行，核心输出包括：

- 代码变更
- 过程中的状态更新
- 自检结果
- 待验证项

#### Evaluator

负责独立验证，不参与实现决策，核心输出包括：

- 检查结果
- 缺陷列表
- 通过或失败的 gate 决策
- 是否允许进入完成态或提交态的结论

### 4.2 核心原则

这三者是 **职责角色**，不是必须常驻的三个 agent 实体。

它们可以随着任务复杂度、模型能力和组织偏好被：

- 合并
- 降级
- 替换
- 部分人工承担

产品层真正需要稳定的是角色接口，而不是角色实例数量。

为了让角色分工对用户可见、可调，配置层应显式声明“职责角色 -> 实例承担方”的映射，例如：

```yaml
roles:
  planner: template          # template | agent | human | skip
  generator: claude-code     # 具体 adapter 或 agent
  evaluator: auto-checks     # auto-checks | agent | human
```

这样做的目的不是把配置做重，而是避免角色设计停留在概念层，确保产品在不同模型能力下可以通过配置切换承担者，而不需要重写产品定义。

### 4.3 三种运行模式

#### 简单任务

- Planner 弱化，主要由模板或轻量 contract 生成承担。
- Generator 由单个 agent 执行。
- Evaluator 主要是自动 checks。

适用于小范围 bug 修复和低风险改动。

#### 中等任务

- 显式存在 Planner/Plan 阶段。
- Generator 负责执行与过程自检。
- Evaluator 独立判断是否通过验证。

适用于中等功能开发和跨模块改动。

#### 长时间任务

- 独立 Planner 负责范围展开与阶段设计。
- Generator 长时间运行，按阶段推进并沉淀工件。
- 独立 Evaluator 在阶段末或关键里程碑进行验证。
- 必须有恢复和交接机制。

适用于长时间、多阶段、容易中断的复杂任务。

### 4.4 与 Anthropic 方案的关系

本方案借鉴 Anthropic 在长任务中对 `planner / generator / evaluator` 的职责拆分思想，但不把“三 agent 编排”定义成产品本体。原因很直接：

- 角色分工有长期价值。
- 固定三 agent 架构没有长期稳定性。
- 当模型能力继续提升后，显式 planner 或 generator 切分方式可能发生变化。
- 如果产品把三 agent 架构写死，未来角色实例变化会直接冲击产品定义。

因此，产品应该稳定定义角色职责、流程阶段和工件接口，而把运行时实例化方式留给具体任务与模型能力决定。

## 5. 核心产品模型

产品真正承重的是四层模型。

### 5.1 Contract Layer

用于约束任务输入和完成标准，最少承载以下信息：

- 任务目标
- 范围与非范围
- 验收标准
- 风险等级
- 所需验证项

Contract 的作用不是给 agent 增加更多描述，而是把任务边界和“什么算完成”提前固定下来。

第一版不应允许 AI 自由发挥生成 contract，而应采用“结构化模板 + Contract Gate + 用户确认”的三层防线：

- `结构化模板`：contract 以固定 schema 生成，至少要求 `goal`、`scope`、`out_of_scope`、`acceptance_criteria`、`risk_level`、`required_checks` 完整存在。
- `Contract Gate`：在进入 plan 之前自动检查 schema 完整性、scope 非空、验收标准是否可验证、模糊词是否过多，以及高风险任务的验证项是否足够。
- `用户确认`：第一版默认开启轻量人工确认，避免整个流程建立在低质量 contract 之上。

这里的目标不是生成“完美 contract”，而是尽早暴露 contract 的质量问题，避免到 verify 阶段才发现源头定义错误。

### 5.2 Workflow Layer

第一版默认主流程固定为：

`Contract -> Plan -> Execute -> Verify -> Commit Gate`

其中“需求澄清”不作为单独显式阶段存在，而是合并到 Contract 生成与确认阶段。对用户来说，`harness run "<goal>"` 之后的第一个明确动作就是看到结构化 contract，而不是再经历一个独立的澄清步骤。

这条主流程是产品的主干，不允许任意改成复杂 DAG。第一版仅支持轻量可配：

- 阶段开关
- gate 配置
- 模板选择
- 失败重试策略

设计意图是先把交付闭环做实，而不是把系统做成一个无限可编排平台。

### 5.3 Execute Boundary

Execute 阶段需要明确产品与底层 coding agent 的边界，否则方案会重新滑回 runtime wrapper。第一版采用 **Adapter 模式**：

- Harness 负责组装结构化输入：contract、plan、global rules、domain docs、required checks。
- Adapter 负责调用底层 agent 或外部工具执行。
- Harness 只在执行前“喂入”，执行后“收回”，通过 working tree、diff、exit code 接管后续 verify。

这意味着第一版明确不做：

- SDK 深度集成
- 实时中途指挥
- 细粒度执行期控制

这不是能力不足，而是产品边界选择。v2 选择的是“事前约束 + 事后 gate 拦截”，而不是重新发明一个执行期 runtime。

### 5.4 Context Layer

Context 只保留高价值、可复用、与流程直接相关的部分：

- 全局规则
- 领域文档
- 任务工件
- 模板与历史成功案例

不把大量易变的 runtime 经验、一次性 prompt 技巧和模型专属补丁堆进核心设计。

### 5.5 Evidence Layer

任何“完成”结论都必须依赖证据，而不是依赖 agent 的叙述。Evidence Layer 至少包括：

- lint / type-check / test / build 结果
- evaluator 反馈
- completion report
- commit-ready 结论

它解决的问题不是“如何让 agent 更自信”，而是“如何让人和系统有依据地相信结果可交付”。

为了避免 Evidence Layer 退化成普通 CI，第一版应明确采用三级 evidence 体系：

#### Level 1：自动化硬指标

默认强制执行，包括：

- build / lint / type-check / test
- 基于 contract 的 scope 检查，确认 agent 没有修改明显超出任务范围的文件

其中 scope 检查是 harness 区别于传统 CI 的关键能力之一，因为 CI 不知道“这次任务的范围”，而 harness 知道。

#### Level 2：Contract 驱动的验证

按需执行，围绕 acceptance criteria 生成验证动作，例如：

- Playwright 验证核心用户流程
- API 响应检查
- 依赖方向或静态结构检查

这里的重点不是预置大量固定测试，而是让验证逻辑由 contract 驱动。

#### Level 3：AI 辅助评估

默认关闭，仅在高风险任务或用户显式要求时启用，包括：

- 独立 evaluator 审查代码变更
- 基于真实交互的 AI 辅助验证
- 缺陷列表和更深层质量反馈

这层有成本，也存在稳定性问题，因此不应成为第一版默认路径。

### 5.6 全局规则、Skills 与 Repo Harness 的分层模型

如果产品未来会初始化到每个项目仓库中，那么用户级全局规则、用户级 skills 和 repo 级 harness 一定会出现内容重叠。这里不应选择“全部重写”，而应选择 **重新分层**。

三层模型的职责划分如下：

#### 用户级全局规则

这一层承载“这个用户希望 agent 永远遵守什么”，适合放：

- 沟通风格与语言偏好
- 通用工程判断原则
- 跨项目稳定的安全边界
- 默认工作习惯与协作方式

这一层不应承载：

- 某个项目的目录结构或 domain 事实
- 某个团队的 gate 与提交流程
- 某个仓库专属的验证命令
- 某个模型当前临时需要的补丁式约束

一句话说，用户级全局规则回答的是“你是谁、你长期怎么工作”，而不是“这个项目怎么交付”。

#### 用户级 Skills

这一层承载“遇到某类任务时，agent 应采用什么可复用方法”，适合放：

- safe editing
- verification
- code review
- database change safety
- long-running task recovery

skills 的本质是 **procedure**，不是 **policy**，也不是 **project context**。

这一层不应承载：

- 某个项目的 contract schema
- 某个仓库必须跑的 checks
- 某个团队的 workflow 默认值
- 某个业务 domain 的事实知识

一句话说，skills 负责“怎么做一类事”，但不负责“这个项目具体要求什么”。

#### Repo Harness

这一层承载“这个项目如何被约束、如何交付、如何验证”，适合放：

- project rules
- workflow 默认值
- contract schema 的项目约束
- required checks
- templates
- domain docs
- reports
- template matching 规则

这一层是产品初始化到仓库后的主要承重层。它回答的是“这个项目的事实、流程、门禁和可复用工件是什么”。

### 5.7 三层之间的关系

这三层不是互相替代，而是互相补位：

- 用户级全局规则提供稳定的个人偏好与基础原则
- skills 提供跨项目可复用的方法论
- repo harness 提供项目级事实、流程和验证约束

它们的关系应该是：

`Global Rules -> Skills -> Repo Harness`

含义不是优先级覆盖链，而是作用域逐步收窄：

- Global Rules 最稳定、最抽象
- Skills 最可复用、最方法化
- Repo Harness 最具体、最项目化

### 5.8 重叠内容如何处理

真正需要处理的不是“有没有重复”，而是“重复内容是否处在正确层级”。

常见重叠及处理方式如下：

#### 规则类重复

例如全局规则里有“先验证再完成”，repo harness 里也有 verify gate。

处理方式：

- 全局规则保留原则表达
- repo harness 落地为可执行 gate

#### 流程类重复

例如 skill 中有“先分析、再修改、再验证”，repo harness 中也有标准 workflow。

处理方式：

- skills 保留通用方法论
- repo harness 定义当前项目的显式阶段与工件

#### 上下文类重复

例如全局文件里写了大量架构规范，repo 中也有 project rules。

处理方式：

- 跨项目稳定部分留在全局
- 项目特定部分下沉到 repo harness

### 5.9 迁移原则

未来从现有全局文件和 skills 迁移到 repo harness 时，不建议推倒重来，而建议按以下原则迁移：

1. 先做资产盘点，把现有内容标记为：
   - `Personal Preference`
   - `Reusable Method`
   - `Project Policy`
   - `Model-Specific Detail`
2. 跨项目成立的内容留在用户级全局规则。
3. 可复用的方法论留在 skills。
4. 只对当前仓库成立的内容迁移到 repo harness。
5. 某个模型当前需要的补丁式内容单独放到 adapter/model-specific 层，不混入产品主设计。

迁移的目标不是减少文档数量，而是减少职责冲突。

### 5.10 设计结论

因此，未来产品初始化到 repo 时，不应要求用户“重写一套新的全局规则和 skills”，而应要求产品提供清晰的分层模型：

- 用户级全局规则保留“用户恒定偏好”
- skills 保留“跨项目方法能力”
- repo harness 承载“项目级流程质量控制”

只有先把这三层分开，repo harness 才不会和现有用户级规则、skills 争夺控制权，产品也不会因为接入不同 agent 而变得越来越混乱。

## 6. 产品形态与用户界面

### 6.1 第一版形态

第一版产品明确采用：

`CLI + 仓库内工件 + 报告`

这意味着产品的主要交互发生在命令行中，状态和结果以仓库工件与报告形式沉淀，而不是以重型控制台为核心。

### 6.2 为什么不是 Web 平台

第一版不以 Web 控制台作为主入口，原因有三点：

1. 用户本来就在终端里使用 coding agent。
2. 先嵌入已有工作流，比创造新工作流更现实。
3. CLI 更适合单仓库、本地优先和低摩擦验证。

### 6.3 团队能力如何体现

虽然第一版主入口是 CLI，但它天然支持团队能力的早期落地，方式不是中心化平台，而是：

- 共享模板
- 共享规则
- 共享 report 结构
- 共享评估规范

这使得第一版既能先服务个人，也能自然延伸到团队协作。

## 7. MVP 设计

### 7.1 MVP 目标

第一版目标不是做“最智能的 agent 编排系统”，而是做“最可落地的交付闭环”。

### 7.2 MVP 核心能力

第一版仅包含以下核心命令与能力：

#### `harness init`

初始化规则、模板和目录结构，为仓库建立最小 harness 基础设施。

#### `harness run "<goal>"`

围绕单次任务串起以下流程：

`contract -> plan -> execute -> verify -> commit gate`

第一版的 `run` 应极度简化：

- Contract 使用 schema 模板生成，并经过 Contract Gate 与用户确认。
- Plan 只要求形成简洁步骤列表，不做复杂分阶段规划。
- Execute 通过 adapter 调用外部 coding agent，不做执行期深度控制。
- Verify 默认以 Level 1 为必选、Level 2 为推荐、Level 3 为按需开启。

#### `harness eval [task-id]`

独立重跑验证与评估，用于重新判断任务当前状态，而不重新生成代码。

#### `harness template promote [task-id]`

当任务通过关键 gate 后，将其流程提升为模板，供后续任务复用。

### 7.3 第一版非目标

第一版明确不做以下事情：

- 不做 `evolve` 作为 MVP 主功能。
- 不做复杂多 agent 调度系统。
- 不做自动学习用户习惯。
- 不做中心化报表平台。
- 不做通用默认的主观 UI/设计评分体系。

## 8. “根据用户习惯生成 workflow” 的第一版落地

### 8.1 设计选择

第一版采用：

`模板沉淀 + 推荐`

而不是自动学习或黑盒演化。

### 8.2 具体机制

当一个任务成功通过关键 gate 后，系统可以将其提升为模板。后续任务启动时，根据以下因素推荐模板：

- 目标类型
- 涉及领域
- 风险等级

用户可以选择直接采用、微调或忽略推荐模板。

为了解决冷启动问题，第一版必须内置一组官方模板，而不是把模板价值完全寄托在用户历史数据上。首批模板至少覆盖：

- `bug-fix`
- `feature-simple`
- `feature-cross`
- `refactor`
- `api-endpoint`
- `ui-component`
- `test-coverage`
- `migration`

模板推荐在第一版采用 **规则匹配** 而不是 AI 语义匹配。原因很简单：规则透明、可解释、无冷启动数据依赖，也更符合第一版“可控而不是聪明”的产品原则。

### 8.3 第一版明确不做

- 不做自动隐式学习
- 不做黑盒工作流演化
- 不做不可解释的动态编排

这保证第一版产品的行为是透明的、可审计的、可控的。

## 9. 输入输出与工件规范

### 9.1 最小任务工件

每个任务至少沉淀以下工件：

- `.harness/tasks/<task-id>/contract.yaml`
- `.harness/tasks/<task-id>/plan.md`
- `.harness/tasks/<task-id>/report.json`

### 9.2 最小 Contract 字段

`contract.yaml` 至少包含：

- `goal`
- `scope`
- `out_of_scope`
- `acceptance_criteria`
- `risk_level`
- `required_checks`

建议扩展两个与验证直接相关的字段：

- `verifiable_by`：标记某条验收标准的验证方式，例如 `test`、`build`、`playwright`、`manual`
- `estimated_complexity`：标记任务复杂度，用于选择模板和 workflow 默认值

### 9.3 最小 Report 字段

`report.json` 至少包含：

- `task_id`
- `workflow_template`
- `checks_result`
- `evaluator_findings`
- `completion_status`
- `commit_ready`

### 9.4 模板元数据最少字段

模板至少需要以下元数据：

- `name`
- `applies_to`
- `workflow_stages`
- `required_gates`
- `success_signals`

这些接口不是实现细节，而是产品层必须稳定下来的外部约束。

### 9.5 建议暴露的配置接口

为了让“职责角色、执行边界、验证层级、模板推荐”可见可调，第一版建议显式暴露以下配置块：

- `roles`
- `execute`
- `workflow`
- `evidence`
- `contract_gate`
- `template_matching`

这些配置不要求第一版全部做到深度可编排，但至少需要把关键策略变成显式产品接口，而不是隐式写死在实现里。

## 10. 目标用户与价值

### 10.1 个人用户

对个人开发者，产品提供的核心价值包括：

- 降低 prompt 组织成本
- 降低漏步骤和提前收工概率
- 让开发过程留下可复用工件
- 提升长任务的恢复能力

### 10.2 团队用户

对团队，产品提供的核心价值包括：

- 统一任务 contract 与验证门禁
- 共享 workflow 模板和评估规范
- 提高不同成员使用 agent 的一致性
- 减少“经验只存在于个人 prompt 里”的问题

### 10.3 共同价值

无论是个人还是团队，最终共同收益应当体现在：

- 降低返工
- 提升中等复杂任务的一次通过率
- 降低 token 浪费
- 提升长任务可恢复性
- 提升结果可交付性

## 11. 成功指标

文档必须定义可衡量指标，避免停留在方法论层。建议第一版关注以下指标：

- 任务一次通过率
- 验证失败后的返工轮次
- 长任务中断后的恢复成功率
- 模板复用率
- 平均无效 token 消耗占比
- “看似完成但未通过 gate”的拦截率

这些指标共同衡量三件事：

1. 任务流程是否更稳。
2. 结果质量是否更可控。
3. 使用 agent 的总体成本是否更低。

## 12. 与 Claude 旧方案的主要差异

为了避免后续评审回到 runtime 叙事，这里明确列出本方案与旧方案的关键差异。

### 12.1 从“多 agent runtime 架构”转为“流程质量产品”

旧方案更强调 agent 之间如何编排，本方案更强调产品长期承重的流程、门禁和证据。

### 12.2 从“固定三 Agent”转为“职责角色模型”

旧方案容易把 `planner / generator / evaluator` 固化为系统组件，本方案只固定职责，不固定实例数量。

### 12.3 从“编排优先”转为“交付闭环优先”

旧方案优先构建复杂 orchestrator，本方案先把 `contract -> plan -> verify -> commit gate` 的闭环做实。

### 12.4 从“自动智能编排愿景”转为“模板沉淀与推荐”

旧方案更容易走向黑盒智能编排，本方案第一版只做透明、可复用、可解释的模板机制。

### 12.5 从“重量级 evaluator 模块”转为“evidence + gate 体系”

旧方案里 evaluator 更像一个重量级独立模块，本方案将其纳入更稳定的验证与门禁体系中。

## 13. 路线图

### Phase 1

- 文档与工件模型
- CLI 基础命令
- 标准 workflow
- gate 与 report

### Phase 2

- 模板沉淀与推荐
- 更强评估器
- 长任务恢复机制
- 官方推荐配置与模型适配矩阵

### Phase 3

- 团队共享模板
- 运行观测
- 视图层增强（可选本地面板或 Web）

关于 `evolve`，第一版不作为用户命令交付；更合理的落地是由产品团队持续做消融与适配测试，产出共享的“模型 × 配置”推荐矩阵，作为后续配置演进能力的一部分。

## 14. 评审场景

以下场景用于评审产品设计是否真正成立。

### 场景一：单人修 bug

- 输入任务：修复一个中等复杂度缺陷
- 期望流程：生成 contract，输出 plan，执行修复，跑验证，进入 commit gate
- 必需工件：contract、plan、report
- gate 行为：验证失败则不能完成
- 成功判定：修复通过验证并生成可提交结论

### 场景二：单人做中等功能

- 输入任务：增加一个跨模块功能
- 期望流程：显式经过 plan 和 verify 阶段
- 必需工件：contract、plan、report、验证结果
- gate 行为：范围不清或验证不全时阻断
- 成功判定：功能可用且证据齐全

### 场景三：长任务中断恢复

- 输入任务：一个需要多阶段推进的复杂任务
- 期望流程：通过工件恢复，而不是依赖聊天上下文记忆
- 必需工件：阶段 plan、report、状态记录
- gate 行为：缺少关键工件时不能无状态恢复
- 成功判定：新执行者能基于已有工件继续推进

### 场景四：同类任务模板复用

- 输入任务：再次执行与历史成功任务相似的需求
- 期望流程：系统推荐模板，用户确认后运行
- 必需工件：模板元数据、任务 contract、report
- gate 行为：模板不匹配当前风险等级时提示用户调整
- 成功判定：减少重复 planning 和 prompt 组织成本

### 场景五：团队共享 workflow 模板

- 输入任务：不同成员在同仓库下执行类似任务
- 期望流程：共享同一类模板、规则和验证规范
- 必需工件：共享模板、共享规则、统一 report 结构
- gate 行为：不符合团队规则时阻断
- 成功判定：多成员执行结果保持一致结构

### 场景六：agent 声称完成但证据不足

- 输入任务：agent 输出“已完成”
- 期望流程：系统检查证据是否满足完成条件
- 必需工件：report、checks 结果、gate 状态
- gate 行为：证据不足则不能完成，也不能进入 commit-ready
- 成功判定：系统成功拦截“表面完成、实际不可交付”的结果

## 15. 总结

这份 v2 方案的核心不是重新定义一个更复杂的 agent runtime，而是定义一个更稳定的产品层：它把软件开发过程中最容易失控的部分收敛为工件、流程、门禁和证据。

因此，Agent Harness 的长期价值不在“代替 agent 思考”，而在“让 agent 参与的软件开发过程可控、可证、可复用、可恢复”。这也是它相对于单纯 runtime 包装最根本的区别。
