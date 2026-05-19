# 全局规则、Skills、Repo Harness 资产盘点表

## 1. 盘点目的

这份盘点表用于把现有资产按三层模型重新归位，避免未来 `repo harness` 初始化到项目后，与用户级全局规则和用户级 skills 争夺控制权。

盘点目标不是“删掉重复内容”，而是明确以下问题：

- 哪些内容应继续保留在用户级全局规则
- 哪些内容应继续保留在用户级 skills
- 哪些内容应迁移或下沉到 repo harness
- 哪些内容只是模型或项目的临时特化，不应放进产品主设计

## 2. 盘点范围

本次盘点基于当前可见的真实资产：

### 用户级全局规则

- `/Users/lijianfeng/.claude/CLAUDE.md`
- `/Users/lijianfeng/.codex/AGENTS.md`
- `/Users/lijianfeng/.gemini/GEMINI.md`

### 当前高相关 skills

- `safe-editing`
- `validation-required`
- `task-report`
- `db-change-safety`
- `legacy-safe-mode`
- `agent-harness-commit`
- `systematic-debugging`
- `verification-before-completion`

说明：

- 三份用户级全局规则内容高度同构，主体几乎一致。
- `agent-harness-commit` 是明显的项目特化 skill，本次盘点将其视为边界校准样本。
- 未对全部 skill 仓库做穷举式盘点，本表先覆盖当前与产品设计最相关的一组核心资产。

## 3. 用户级全局规则盘点

### 3.1 总体判断

当前 `CLAUDE.md`、`AGENTS.md`、`GEMINI.md` 的主体内容高度一致，承载的是：

- 中文回复
- 第一性原理
- 结论优先
- 工作模式
- 交付 SOP
- 风险意识
- 强制验证
- 专业反驳权

这说明当前全局规则已经天然接近“用户级稳定偏好”，方向是对的。真正需要处理的不是重写，而是把其中仍可能项目化的部分抽掉，避免未来与 repo harness 重复。

### 3.2 规则资产表

| 资产 | 当前内容摘要 | 当前归类 | 与 Repo Harness 的重叠 | 建议归属 | 处理动作 |
|---|---|---|---|---|---|
| `~/.claude/CLAUDE.md` | 中文、工作模式、交付 SOP、强制验证、风险意识；带“项目个性化配置”占位 | 用户级全局规则 | 中 | 保留在用户级；删除或弱化项目占位 | 抽成共享核心，项目个性化内容迁到 repo harness |
| `~/.codex/AGENTS.md` | 中文、工作模式、交付 SOP、强制验证、风险意识 | 用户级全局规则 | 中 | 保留在用户级 | 与 Claude/Gemini 共用同一核心规则，只保留少量 agent 适配差异 |
| `~/.gemini/GEMINI.md` | 中文、工作模式、交付 SOP、强制验证、风险意识 | 用户级全局规则 | 中 | 保留在用户级 | 与 Claude/Codex 共用同一核心规则，只保留少量 agent 适配差异 |

### 3.3 需要抽离的内容

以下内容如果未来继续出现在用户级全局规则中，会和 repo harness 发生职责冲突，应逐步下沉：

| 内容类型 | 例子 | 正确归属 |
|---|---|---|
| 项目事实 | 技术栈、目录结构、禁止修改的目录 | Repo Harness |
| 项目验证 | 仓库专属验证命令、项目 gate | Repo Harness |
| 项目流程 | 该仓库的 workflow 默认值、提交流程 | Repo Harness |
| 模型补丁 | 某模型当前需要的临时提示、执行偏好 | Adapter / Model-specific |

### 3.4 对全局规则的落地建议

建议将三份全局规则重构为：

1. `User Core Rules`
   - 只保留跨项目稳定成立的内容
   - 例如语言、沟通、工程原则、验证纪律、风险意识

2. `Agent Adapter Delta`
   - 只保留 Claude / Codex / Gemini 各自少量差异
   - 不重复整份核心规则

3. `Repo Harness Rules`
   - 每个项目初始化时注入项目事实、流程、gate、domain docs

一句话说：**三份全局规则不需要重写，但需要去项目化，并收敛成“共享核心 + 薄适配层”。**

## 4. Skills 资产盘点

### 4.1 总体判断

当前盘点到的 8 个 skills 中，绝大部分本质上都是“方法论技能”，适合作为用户级 skills 长期保留。只有 `agent-harness-commit` 明显属于项目特化 skill，不适合作为通用用户级能力长期保留在通用层。

### 4.2 Skills 盘点表

| Skill | 当前作用 | 当前归类 | 与 Repo Harness 的重叠 | 建议归属 | 处理动作 |
|---|---|---|---|---|---|
| `safe-editing` | 控制改动范围，避免顺手重构 | 用户级方法 skill | 低 | 保留在用户级 skills | 不迁移；repo harness 只编码 scope gate，不替代这个方法论 skill |
| `validation-required` | 任何改动都必须验证 | 用户级方法 skill | 中 | 保留在用户级 skills | 保留 skill；repo harness 用 verify gate 落地执行约束 |
| `task-report` | 用固定结构汇报改动、验证和风险 | 用户级方法 skill | 中 | 保留在用户级 skills | 保留 skill；repo harness 定义 report schema，不要求 skill 承载项目格式 |
| `db-change-safety` | 数据库变更先看风险再动手 | 用户级领域 workflow skill | 低 | 保留在用户级 skills | 不迁移；repo harness 只在相关任务中调用 |
| `legacy-safe-mode` | 老系统优先稳住行为 | 用户级情境 workflow skill | 低 | 保留在用户级 skills | 不迁移；repo harness 可通过 template/risk_level 决定何时触发 |
| `systematic-debugging` | 根因优先，禁止盲修 | 用户级方法 skill | 低 | 保留在用户级 skills | 不迁移；与 Planner/Contract 阶段形成互补 |
| `verification-before-completion` | 未验证不得宣称完成 | 用户级方法 skill | 中 | 保留在用户级 skills | 保留 skill；repo harness 用 commit gate 把原则变成制度 |
| `agent-harness-commit` | 仅在 agent-harness 项目中按项目规则做 commit | 项目特化 skill | 高 | 下沉到项目层 | 改造成 repo-local skill、repo harness 命令或项目插件，不保留为通用用户级 skill |

### 4.3 Skills 的边界结论

当前这批 skills 的合理边界应定义为：

- Skill 负责“怎么做一类事”
- Repo Harness 负责“这个项目具体要求什么”

因此，以下两种情况都不应该发生：

1. 把项目事实塞进 skill  
   例如把某仓库的 contract schema、required checks、workflow 默认值写进 skill。

2. 让 repo harness 试图替代所有 skill  
   例如把 safe-editing、debugging、legacy-safe-mode 全都硬编码成产品固定流程。

正确关系是：

- `validation-required` 对应 repo 的 `verify gate`
- `verification-before-completion` 对应 repo 的 `commit gate`
- `task-report` 对应 repo 的 `report schema`

也就是说，**skill 提供方法论，repo harness 提供制度化落点。**

## 5. 冲突与重复盘点

### 5.1 当前最明显的重叠

| 重叠内容 | 出现位置 | 问题 | 建议 |
|---|---|---|---|
| 强制验证 | 全局规则、`validation-required`、未来 verify gate | 同一原则在三层重复表达 | 全局规则保留原则，skill 保留方法，repo harness 落地为 gate |
| 完成前必须独立验证 | 全局规则、`verification-before-completion`、未来 commit gate | 若边界不清，三层会相互打架 | skill 保留纪律，repo harness 输出唯一完成判定 |
| 任务汇报结构 | 全局沟通规范、`task-report`、未来 report.json | 容易重复维护不同格式 | 用户级 skill 保留人类汇报方式，repo harness 定义机器工件格式 |
| 交付 SOP | 全局规则中的 SOP、未来 workflow | 如果 repo harness 也写一套完整 SOP，会互相覆盖 | 全局规则保留工作习惯，repo harness 只定义项目可执行流程 |

### 5.2 当前最值得优先处理的冲突

最优先处理的是 `agent-harness-commit`。

原因：

- 它已经明显不是通用用户级 skill。
- 它强依赖 `agent-harness` 项目的交付命令和报告结构。
- 如果未来这个产品走向通用化，这类 skill 必须下沉到 repo 层，否则会污染通用 skill 体系。

第二优先级是三份用户级全局规则中的“项目个性化占位”。

原因：

- 它已经明示了项目化内容会进入全局规则。
- 如果不尽早下沉，后续 repo harness 初始化时会和用户级规则重复定义相同内容。

## 6. 迁移建议

### 6.1 迁移顺序

建议按以下顺序推进，而不是一次性大重构：

1. **统一用户级全局规则核心**
   - 抽一份共享核心规则
   - Claude / Codex / Gemini 只保留薄适配差异

2. **标记并下沉项目化内容**
   - 从全局规则中清出技术栈、验证命令、禁止修改目录、项目记忆
   - 放到未来 repo harness 的 `project rules / workflow / checks / domain docs`

3. **把项目特化 skill 下沉**
   - 优先处理 `agent-harness-commit`
   - 改为 repo-local skill 或 repo harness 内建命令

4. **为通用 skills 建立映射关系**
   - `validation-required` -> `verify gate`
   - `verification-before-completion` -> `commit gate`
   - `task-report` -> `report schema`

### 6.2 推荐产物

建议后续逐步形成以下结构：

```text
User Layer
  - core-rules.md
  - claude-delta.md
  - codex-delta.md
  - gemini-delta.md
  - reusable skills/

Repo Layer
  - .harness/
    - project-rules/
    - domains/
    - templates/
    - tasks/
    - reports/
    - harness.config.yaml

Adapter Layer
  - model-specific prompts / runtime quirks
```

## 7. 最终结论

### 7.1 不需要重做的部分

- 三份用户级全局规则的主体内容方向是对的
- 大部分 skills 的职责边界也是对的
- 现有“中文、第一性原理、验证优先、风险优先”的核心原则应继续保留在用户级

### 7.2 需要重构边界的部分

- 三份全局规则应去项目化，并抽共享核心
- `agent-harness-commit` 应从通用 skill 下沉到项目层
- 强制验证、完成判定、任务汇报要明确区分“原则 / 方法 / gate / 工件”

### 7.3 一句话结论

不是从头梳理一遍所有全局规则和 skills，而是基于现有资产做一次 **分层归位**：

- 用户级全局规则保留“你长期怎么工作”
- skills 保留“怎么做一类事”
- repo harness 承载“这个项目怎么交付”

这样未来产品初始化到 repo 后，三层才会协同，而不是互相打架。
