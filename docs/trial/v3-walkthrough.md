# v3 端到端 Walkthrough：一个真实 bug-fix 任务的全链路 trace

> [!NOTE]
> **修订状态横幅（2026-05 补注，请先读完本框再读正文）**
>
> 本文写于 v3 设计阶段（**七角色 / 七阶段** 版本）。后续基于本文暴露的 17 个漏洞做了规范精简，演化为 **v3-core**（**五角色 / 六阶段**），并补了 §22 知识资产晋升机制。当前真理源是 [`docs/spec/v3-core.md`](../spec/v3-core.md) 与 [`docs/design/agent-harness-product-design-v3-core.md`](../design/agent-harness-product-design-v3-core.md)。
>
> **本文继续保留的价值**：v3 阶段真实跑出来的压力测试快照 —— 17 个漏洞清单（其中 6 个 P0）直接驱动了 v3-core 的精简决策。**不重写**，因为重写就破坏了「v3 阶段当时的反思」这一历史证据。
>
> **v3 → v3-core 主要差异对照（读本文时请按此映射）**：
>
> | 本文（v3 阶段） | 当前（v3-core） | 出处 |
> |---|---|---|
> | 七阶段：SPEC → Design → **Feasibility** → Execute → Review → Test → Commit Gate | 六阶段：去掉独立 Feasibility，合并为 design.md 的 `## Feasibility Self-Check` 段落 | SPEC §6.1 |
> | 七角色（含独立 `gatekeeper`） | 五角色（gatekeeper 合并进 designer） | design §2.3 |
> | `standard` 预设跑七角色 | 六阶段标配，单 agent 角色切换是 FORBIDDEN | SPEC §8 |
> | `dev-map` 自动维护 + `harness map init` 命令 | 砍掉 dev-map 自动化（让宿主 CLAUDE.md / Memory 自演进） | design §6.2 / §2.2 |
> | `.harness/architecture/` 设想（D-4 写权限真空地带） | `docs/architecture/<topic>/`（v3-core 第四层差异化能力，**强制规定**不在 .harness/） | SPEC §22 / design §4.4 |
> | plan mode 默认开 | plan mode **默认关**；启用必须用户逐条 approve | SPEC §9 / v3 §4.6 修订 |
> | `commit_decision: PASS / FAIL` 二态 | `commit_decision: pass / needs_human_review / fail` **三态** | SPEC §4.1.10 |
> | review.md 仅说「打回」 | review.md 必须显式归类：`block_execute / block_design / block_spec / defer_to_new_task / needs_human_review` | SPEC §10.4 |
> | scope.include 当 allow-list 用 | scope.include 是 expectation list（只展示），scope.exclude 才是硬 deny-list | SPEC §11 |
>
> **如何读本文**：当成「为什么 v3-core 这么定」的实证依据，**不是当前实施手册**。具体实现以 SPEC 为准。

> 本文档是 v3 设计方案的**实施前压力测试**。我们挑一个本仓库真实存在的中等任务，假设按 v3 七阶段流程跑一遍，把每阶段的实际产物写出来，看设计是否真能落地、哪里会卡住。

## 0. 选题与意图

### 0.1 任务

> **修复 evidence collector 只支持 npm 项目的局限，加 Go 项目支持，并把 Level 1 检查 Skill 化（v3 Skill Layer 第一个落地）。**

### 0.2 为什么选这个

- 本仓库 `packages/core/src/evidence.ts` 真实存在「只支持 npm」的局限
- 中等复杂度（5 文件左右、跨 evidence/scaffold/shared 三模块）
- 包含一个**真实的架构决策点**（hardcode if/else vs Skill yaml），能压测 Designer 角色的价值
- 同时引入新仓库级资产（`.harness/skills/`），能压测「写权限归属」「dev-map 维护」两个 v3 新机制
- 包含 baseline-diff 真值（项目当前 lint=0、test 数已知），能验证基线对比根除「历史遗留」糊弄
- 中等任务用 `standard` 预设，**正好能压测七角色全启用是否成本 OK**

### 0.3 阅读说明

- 各阶段产物用代码块呈现，**就是真实跑出来的样子**，不是示意
- 每个阶段末尾有「**这一步暴露的设计漏洞**」小节
- 全文末尾有 P0/P1/P2 漏洞汇总

---

## 1. 用户输入

```bash
$ harness run "evidence 应该支持 Go 项目，现在只支持 Node 让人没法用"
```

PM agent 启动，分配 task-id `20260501-094500-evgo`，初始化目录：

```
.harness/tasks/20260501-094500-evgo/
└── state.json   # { stage: "spec", owner: "requirement", status: "active" }
```

PM 路由到 `requirement` 角色，启动 SPEC 阶段。

---

## 2. SPEC 阶段（owner: requirement，模型: sonnet）

### 2.1 多轮对话样例（精简）

```
requirement: 我需要先把需求磨清楚。几个问题：
1. 是只支持 Go，还是想做成「能扩展到任何语言」的形态？
2. Go 项目的 build/lint/typecheck/test 你想用什么命令？
   常见组合是 go build ./... / golangci-lint run / go vet ./... / go test ./...
3. 已有的 Node 项目行为要不要保持不变？
4. 项目类型怎么检测？go.mod 存在算 Go？

user: 1. 现在先做 Go，但要按「能扩展」的形态做
      2. 那个组合 OK
      3. Node 必须不变
      4. 是的

requirement: 还有两个边界：
5. 用户机器没装 golangci-lint 怎么办？skipped 还是 failed？
6. .harness/skills/ 是仓库级资产，会被 commit 进 git 吗？

user: 5. failed —— 工程缺工具就是缺工具，应该被拦下
      6. 是的，commit 进 git，跨成员共享

requirement: 好，我把 SPEC 落到 requirement.md，然后派生 contract.yaml。
```

### 2.2 产物：`requirement.md`

```markdown
# 需求：让 evidence collector 支持 Go 项目，并 Skill 化

## 背景
当前 packages/core/src/evidence.ts 中 Level 1 evidence collector 只支持 Node 项目
（通过 package.json scripts 跑 build/lint/typecheck/test）。当 Harnessly 用户在自己的
Go 仓库跑 harness init 后再 harness run，evidence 全部返回 'skipped'，导致 commit gate
拦截功能完全失效。

## 核心目标
让 evidence collector 自动检测项目类型并按对应方式跑 Level 1 检查。
本任务同时是 v3 Skill Layer 的第一个落地：把 build/lint/typecheck/test 抽成
.harness/skills/<check>/<lang>.yaml 可复用 Skill。

## 范围

### 必须做
- 支持 Go 项目的 build/lint/typecheck/test 检查
- 保持 Node 项目的现有行为完全不变（行为等价 = 命令字符串等价）
- 通过 go.mod 文件存在自动检测 Go 项目
- 把 build/lint/typecheck/test 抽成 .harness/skills/<check>/<lang>.yaml 形态
- 引入 SkillSchema（zod）做加载时校验
- skill yaml 提交进 git，跨成员共享

### 不做
- 不支持 Python（后续任务）
- 不支持 Rust（后续任务）
- 不做项目类型混合（同一个仓库既是 Node 又是 Go）
- 不修改 commit gate 逻辑
- 不做 skill 的多行命令支持（先单行）

## 影响模块（预估）
- packages/core/src/evidence.ts（主要修改）
- packages/core/src/scaffold.ts（detectProjectType 扩展）
- packages/shared/src/index.ts（新增 SkillSchema）
- packages/core/src/skill.ts（新增）
- .harness/skills/ 新建目录与 8 个 yaml

## 验收标准
1. 在一个 Go 项目里跑 evidence，build/lint/typecheck/test 4 个 check 都不再是 'skipped'
2. Node 项目跑 evidence，与改造前行为完全一致（fixture 测试通过）
3. .harness/skills/{build,lint,typecheck,test}/{node,go}.yaml 共 8 个文件存在且通过 SkillSchema 校验
4. 用户机器缺 golangci-lint 时，lint 返回 status='failed' 且 detail 明确指出缺工具

## 风险
- skill yaml 可能被恶意/手抖写错 → 必须 zod 校验
- 用户可能以为 .harness/skills/ 是临时产物 → 文档里要明确这是仓库级资产
- 既存任务的 evidence.json 与新格式可能不兼容（实际不会，因为 EvidenceResult schema 不变）

## 不确定项（必须 design 阶段定）
- skill yaml 的 schema 字段定义
- skill 加载失败时的兜底策略
- writable_paths 在 execute 阶段是否允许 developer 写 .harness/skills/
```

### 2.3 产物：`contract.yaml`（自动从 requirement.md 派生）

```yaml
version: "2.0"
task_id: "20260501-094500-evgo"
goal: "让 evidence collector 支持 Go 项目，并把 Level 1 检查 Skill 化"
scope:
  include:
    - packages/core/src/evidence.ts
    - packages/core/src/scaffold.ts
    - packages/core/src/skill.ts
    - packages/core/src/skill.test.ts
    - packages/core/src/evidence.test.ts
    - packages/shared/src/index.ts
    - .harness/skills/**
  exclude:
    - packages/core/src/gate.ts
    - packages/core/src/workflow.ts
    - packages/cli/src/commands/host/**
acceptance_criteria:
  - criterion: "Go 项目跑 evidence 不全部 skipped"
    verifiable_by: test
    test_hint: "evidence.test.ts 加 Go fixture，断言 4 个 check 状态非 skipped"
  - criterion: "Node 项目行为完全不变"
    verifiable_by: test
    test_hint: "原有 Node fixture 测试不修改、全部通过"
  - criterion: ".harness/skills/ 下 8 个 yaml 通过 SkillSchema 校验"
    verifiable_by: build
    test_hint: "skill schema validation 在 build 阶段强制通过"
  - criterion: "缺 golangci-lint 时 lint check 返回 failed 而非 skipped"
    verifiable_by: test
    test_hint: "skill.test.ts mock which 返回 not found"
risk_level: medium
estimated_complexity: medium
required_checks: ["build", "lint", "typecheck", "test"]
linked_spec: "requirement.md"
created_at: "2026-05-01T09:51:00Z"
```

### 2.4 这一步暴露的设计漏洞

| # | 漏洞 | 严重性 |
|---|---|---|
| **D-1** | requirement agent 在派生 contract.yaml 时，自动列出来的 `scope.include` 含未来才会创建的文件（skill.ts、yaml 等）。这违反了「scope 只能描述现有 + 即将存在的范围」语义边界 —— 否则 scope check 会通过得太松（任何路径只要 contract 写了就算 in-scope）。**必须明确 scope 语义：是 allowlist 还是 expectation list**。 | P0 |
| **D-2** | requirement.md 的「不确定项」最后留了 3 条「必须 design 阶段定」。但 v3 设计里 designer 没有「读 requirement 的不确定项作为输入」的契约要求。需要在 designer.yaml 加一项：必须显式回应所有 unresolved 项。 | P1 |

---

## 3. Design 阶段（owner: designer，模型: sonnet）

### 3.1 designer 读到的输入

```
requirement.md       (必读)
contract.yaml        (必读)
.harness/dev-map.md  (必读 - 但项目当前还没有 dev-map！)
.harness/board.md    (选读 - 也没有)
```

发现 dev-map 不存在。designer 行为：触发 `harness map init` 自动初始化（或 emit blocker 等用户处理）。**这是 v3 文档没规定的真空地带**（详见 §10 P0-D-3）。

假设走 `auto-bootstrap-dev-map`：designer 用 LLM 扫一遍 `packages/core/src/` 目录树，先生成最小 dev-map.md（这次仅生成 evidence/scaffold/shared 相关条目）。

### 3.2 产物：`design.md`

```markdown
# 方案设计：Evidence Skill 化 + Go 支持

## 决策
**方案 B：Skill yaml 驱动**。

## 三方案对比

### 方案 A：在 evidence.ts 里 if/else 分支
- 优：改动最小（约 30 行），不引入新概念
- 劣：加 Python 时还要再改一次（违反 OCP）；不符合 v3 Skill Layer 设计

### 方案 B：Skill yaml 驱动（采用）
- 优：符合 v3 Skill Layer；多语言扩展只加 yaml；用户能自定义 skill
- 劣：引入 yaml 加载 + schema 校验逻辑（约 80 行）

### 方案 C：插件式（subprocess 加载用户 ts）
- 第一版过度工程，否决

## Skill Schema（落 shared）

```typescript
export const SkillSchema = z.object({
  name: z.enum(['build', 'lint', 'typecheck', 'test']),
  language: z.enum(['node', 'go']),  // v3 Phase 1 仅这两个
  command: z.string().min(1),
  successExitCode: z.number().int().default(0),
  envRequired: z.array(z.string()).default([]),
  detailOnPass: z.string().min(1),
  detailOnFailTemplate: z.string().min(1),  // 支持 ${stderr} 占位
});
export type Skill = z.infer<typeof SkillSchema>;
```

## 接口设计

```typescript
// packages/core/src/skill.ts (新增)
export async function loadSkill(
  workDir: string,
  check: RequiredCheck,
  language: 'node' | 'go',
): Promise<Skill | null>;

export async function runSkill(
  skill: Skill,
  workDir: string,
): Promise<EvidenceCheckResult>;

// packages/core/src/scaffold.ts (扩展)
export async function detectProjectType(workDir: string): Promise<ProjectType> {
  // 优先级：go.mod > package.json > pyproject.toml > unknown
  if (await fileExists(path.join(workDir, 'go.mod'))) return 'go';
  if (await fileExists(path.join(workDir, 'package.json'))) return 'node';
  return 'unknown';
}

// packages/core/src/evidence.ts (修改)
// 删除 runNodeScriptCheck；新增 runSkillCheck
// collectEvidence 主流程：
//   const lang = await detectProjectType(workDir);
//   for check in config.requiredChecks:
//     skill = await loadSkill(workDir, check, lang)
//     if (!skill) push skipped
//     else push await runSkill(skill, workDir)
```

## 仓库级 skill yaml 默认内容

```yaml
# .harness/skills/build/node.yaml
name: build
language: node
command: npm run build
successExitCode: 0
envRequired: []
detailOnPass: build script 执行通过
detailOnFailTemplate: 'build 失败: ${stderr}'

# .harness/skills/build/go.yaml
name: build
language: go
command: go build ./...
successExitCode: 0
envRequired: [go]
detailOnPass: go build 通过
detailOnFailTemplate: 'go build 失败: ${stderr}'

# .harness/skills/lint/go.yaml
name: lint
language: go
command: golangci-lint run
successExitCode: 0
envRequired: [golangci-lint]
detailOnPass: lint 无问题
detailOnFailTemplate: 'lint 失败: ${stderr}'

# .harness/skills/typecheck/go.yaml
name: typecheck
language: go
command: go vet ./...
successExitCode: 0
envRequired: [go]
detailOnPass: vet 通过
detailOnFailTemplate: 'go vet 失败: ${stderr}'

# .harness/skills/test/go.yaml
name: test
language: go
command: go test ./...
successExitCode: 0
envRequired: [go]
detailOnPass: 测试通过
detailOnFailTemplate: '测试失败: ${stderr}'
```

（Node 的 lint/typecheck/test 三个 yaml 内容类似，迁移自现 evidence.ts）

## envRequired 检查

skill 在 runSkill 入口做 `which <bin>` 检测：缺工具直接返回 status='failed'，
detail = `缺少必要工具：${missingBin}（请先安装）`。
**不返回 skipped** —— 工程缺工具就是缺工具，应被拦下。

## 影响面

| 文件 | 改动 | 行数估计 |
|---|---|---|
| packages/core/src/skill.ts | 新增 | +90 |
| packages/core/src/skill.test.ts | 新增 | +120 |
| packages/core/src/evidence.ts | 大改 | -40 / +25 |
| packages/core/src/scaffold.ts | 小改 | +8 |
| packages/shared/src/index.ts | SkillSchema 新增 | +15 |
| packages/core/src/index.ts | 导出 skill | +1 |
| .harness/skills/{build,lint,typecheck,test}/{node,go}.yaml | 新增 | 8 文件 |
| packages/core/src/evidence.test.ts | 加 Go fixture | +60 |

## 风险点
- 用户在 v2 已有的 .harness/ 目录里跑新版会发现没有 skills/ → harness init 需要补创建
- yaml 库新增依赖：需 `pnpm add yaml -F @harnessly/core`，安装失败要明确提示
- successExitCode 为 0 是 Go/Node 通用约定；后续如果接 .NET 之类有不同约定再扩

## 对 requirement 中 unresolved 的回应
- skill yaml schema 字段定义：见上 SkillSchema
- skill 加载失败时的兜底：不存在 → skipped；schema 校验失败 → 抛错（loadSkill 直接 throw）
- writable_paths 在 execute 阶段是否允许 developer 写 .harness/skills/：**这是 v3 真空地带，必须先在 v3 文档明确，详见 P0-D-4**
```

### 3.3 产物：`task-breakdown.md`

```markdown
# 子任务分解

| # | 子任务 | 依赖 | acceptance | 估时 |
|---|---|---|---|---|
| 1 | 在 shared 加 SkillSchema | - | zod 校验单测通过 | 20m |
| 2 | 新建 skill.ts (loadSkill + runSkill + envRequired check) | 1 | skill.test.ts 通过 | 60m |
| 3 | 新建 .harness/skills/build/node.yaml 等 8 个 yaml | 1 | 用 SkillSchema 校验 8 个 yaml 全过 | 30m |
| 4 | scaffold.ts 加 go.mod 检测 | - | scaffold 单测加 go fixture | 15m |
| 5 | evidence.ts 用 skill 替代 runNodeScriptCheck | 2,3,4 | Node fixture 行为不变 | 45m |
| 6 | evidence.test.ts 加 Go fixture | 5 | Go fixture 通过 | 30m |
| 7 | 跑全套测试 + 修可能的回归 | 1-6 | pnpm test 全绿 | 30m |
| 8 | 增量更新 dev-map.md（developer 职责） | 7 | dev-map diff 包含 skill 相关条目 | 10m |

总估时：~4h，与 contract 中的 medium complexity 吻合。

## 必须按顺序的强约束
1 → 2/3/4 (并行) → 5 → 6 → 7 → 8

## 每步退出条件
- 步骤 5 完成时必须立刻跑一次「Node 行为不变」回归（不能先跑全部）
- 步骤 7 失败必须逐项追溯，不允许「跳过测试不影响功能」类决策
```

### 3.4 这一步暴露的设计漏洞

| # | 漏洞 | 严重性 |
|---|---|---|
| **D-3** | dev-map 不存在时 designer 该怎么办？v3 文档完全没说。auto-bootstrap 会让 designer 越界（设计阶段不该写 dev-map）；emit blocker 会让没人处理（PM 也不能写）。**必须新增 `harness map init` 命令 + 在 init 阶段就生成 dev-map 骨架**。 | P0 |
| **D-4** | `.harness/skills/` 是仓库级资产，本任务要新增 8 个 yaml。**execute 阶段 developer 是否有权写仓库级资产？v3 设计完全没说**。如果不许写，本任务卡死；如果允许，会造成「跨任务影响」的风险。**必须在 v3 文档明确仓库级 vs 任务级资产的写权限**。 | P0 |
| **D-5** | task-breakdown 里的「估时」是 LLM 拍的，无校准，可能严重偏离。后续要么砍掉这字段，要么加事后校准机制。 | P2 |
| **D-6** | designer 在 design.md 里直接写了「Node 的 lint/typecheck/test 三个 yaml 内容类似，迁移自现 evidence.ts」—— 这种「类似」的措辞会让 developer 在实现时再做一次解释。要求 design.md 不能有「类似」「同上」「参考 X」这类前向引用。 | P1 |

---

## 4. Feasibility 阶段（owner: gatekeeper，模型: sonnet）

gatekeeper 读 requirement + design + task-breakdown，做独立判断。

### 4.1 产物：`feasibility.md`

```markdown
# 可行性评估

## 决议：通过（pass）

## 检查项
| 项 | 结论 |
|---|---|
| requirement scope 是否清晰 | ✅ include / exclude 明确，但有未来文件混入 scope（参 P0-D-1）|
| design 是否完整 | ✅ 三方案对比 + 接口 + schema + 风险点齐全 |
| task-breakdown 是否合理 | ✅ 8 子任务，依赖图清晰，每步可独立验证 |
| 风险是否可控 | ⚠️ 中等：D-4 写权限真空地带须先在 v3 文档敲定 |
| 与现有架构冲突 | ❌ 无冲突。SkillSchema 是新增 schema，不破坏现有契约 |

## 阻塞项
- **B-1（pre-execute blocker）**：D-3 / D-4 必须先解决（v3 文档补条款）才允许进入 execute。
  否则 developer 不知道能不能写 .harness/skills/。

## 可放行的前提
方案 1（推荐）：
  暂时**冻结 v3 文档为「execute 阶段允许写仓库级资产」**，本任务作为该决议的首个验证案例。
方案 2：
  designer 写 .harness/skills/，developer 只改 evidence.ts/skill.ts/scaffold.ts。
  代价：违反「设计阶段不产出代码资产」语义。

## 选定方案
方案 1。理由：仓库级 skill 是「实现的一部分」，不是「跨任务永久基础设施」（虽然
跨任务复用，但首次落地必然伴随某个具体任务）。allowlist 比 blocklist 实用。

## 注意事项给 developer
- 严格按 task-breakdown 顺序，特别是步骤 5 完成时立刻回归 Node 行为
- 不能在 evidence.ts 里留 dead code 注释（如 `// removed runNodeScriptCheck`）
- skill.ts 必须用 parseWithSchema（shared 已有的 helper），不要直接 yaml.parse
```

### 4.2 这一步暴露的设计漏洞

| # | 漏洞 | 严重性 |
|---|---|---|
| **D-7** | gatekeeper 这次实际上做了「v3 文档应该补什么」的元判断。**它越界了**：gatekeeper 应该判断「按现有规则能不能放行」，而不是「现有规则不够要怎么改」。后者属于产品设计层，不是任务执行层。需要在 gatekeeper.yaml 明确：发现 v3 文档真空地带时只能 emit blocker 等用户决策，不能自己定决议。 | P0 |
| **D-8** | feasibility.md 写了「选定方案 1」，但其实是 gatekeeper 私自决定 —— 这种「跨产品架构的决策」必须升到用户拍板，不是 agent 可以拍的。 | P0 |

**因此：本次 walkthrough 在此处实际上应该停下，由用户做出 v3 文档补条款的决策。** 假设用户决策为「采纳方案 1」，更新 v3 文档后继续。

---

## 5. Execute 阶段（owner: developer，模型: sonnet）

### 5.1 Baseline 快照（执行前自动跑）

```json
{
  "captured_at": "2026-05-01T10:55:00Z",
  "checks": [
    {"name": "build", "status": "passed", "command": "npm run build"},
    {"name": "lint", "status": "passed", "command": "npm run lint"},
    {"name": "typecheck", "status": "passed", "command": "npm run typecheck"},
    {"name": "test", "status": "passed", "command": "npm run test", "test_count": 84}
  ],
  "lint_warnings_total": 0,
  "todo_count": 12,
  "git_dirty_files": 0
}
```

### 5.2 Prompt 组装（注入给 developer）

```
=== role: developer ===
你是 developer 角色。你的产物是代码 diff + implementation-notes.md。
你不能修改：requirement.md / design.md / contract.yaml / task-breakdown.md
你可以写：代码、implementation-notes.md、.harness/skills/* (仓库级资产首次落地，已批准)
你必须按 task-breakdown.md 的顺序执行，每步完成后更新 state.json 的 sub_task_progress

=== requirement.md ===
（完整内容）

=== design.md ===
（完整内容）

=== task-breakdown.md ===
（完整内容）

=== feasibility.md ===
（完整内容，含 selected option = 方案 1）

=== dev-map.md ===
（最小骨架，包含 packages/core/src/ 模块概况）
```

### 5.3 实际改动 diff（关键片段）

```diff
# packages/shared/src/index.ts
+ export const SkillSchema = z.object({
+   name: z.enum(['build', 'lint', 'typecheck', 'test']),
+   language: z.enum(['node', 'go']),
+   command: z.string().min(1),
+   successExitCode: z.number().int().default(0),
+   envRequired: z.array(z.string()).default([]),
+   detailOnPass: z.string().min(1),
+   detailOnFailTemplate: z.string().min(1),
+ });
+ export type Skill = z.infer<typeof SkillSchema>;

# packages/core/src/skill.ts (新文件)
+ import { readFile } from 'node:fs/promises';
+ import { exec } from 'node:child_process';
+ import { promisify } from 'node:util';
+ import path from 'node:path';
+ import yaml from 'yaml';
+ import { type Skill, SkillSchema, type EvidenceCheckResult } from '@harnessly/shared';
+
+ const execAsync = promisify(exec);
+
+ export async function loadSkill(
+   workDir: string,
+   check: 'build' | 'lint' | 'typecheck' | 'test',
+   language: 'node' | 'go',
+ ): Promise<Skill | null> {
+   const skillPath = path.join(workDir, '.harness', 'skills', check, `${language}.yaml`);
+   try {
+     const text = await readFile(skillPath, 'utf8');
+     const parsed = yaml.parse(text);
+     return SkillSchema.parse(parsed);
+   } catch (error) {
+     if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
+     throw error;
+   }
+ }
+
+ async function checkBinExists(bin: string): Promise<boolean> {
+   try { await execAsync(`which ${bin}`); return true; } catch { return false; }
+ }
+
+ export async function runSkill(skill: Skill, workDir: string): Promise<EvidenceCheckResult> {
+   for (const bin of skill.envRequired) {
+     if (!(await checkBinExists(bin))) {
+       return {
+         name: skill.name,
+         status: 'failed',
+         command: skill.command,
+         detail: `缺少必要工具：${bin}（请先安装）`,
+       };
+     }
+   }
+   try {
+     await execAsync(skill.command, { cwd: workDir, shell: '/bin/zsh' });
+     return { name: skill.name, status: 'passed', command: skill.command, detail: skill.detailOnPass };
+   } catch (error) {
+     const stderr = (error as { stderr?: string }).stderr ?? '';
+     return {
+       name: skill.name,
+       status: 'failed',
+       command: skill.command,
+       detail: skill.detailOnFailTemplate.replace('${stderr}', stderr.trim()),
+     };
+   }
+ }

# packages/core/src/evidence.ts (大改)
- async function runNodeScriptCheck(...) { ... }
- async function loadPackageScripts(...) { ... }
+ import { loadSkill, runSkill } from './skill';
+ import { detectProjectType } from './scaffold';

  export async function collectEvidence(...) {
-   const scripts = await loadPackageScripts(workDir);
-   const scriptChecks = await Promise.all(
-     config.requiredChecks.map((checkName) => runNodeScriptCheck(workDir, checkName, scripts)),
-   );
+   const projectType = await detectProjectType(workDir);
+   const language = projectType === 'go' ? 'go' : 'node';
+   const scriptChecks = await Promise.all(
+     config.requiredChecks.map(async (checkName) => {
+       const skill = await loadSkill(workDir, checkName, language);
+       if (!skill) {
+         return { name: checkName, status: 'skipped', command: '', detail: 'skill 未配置' };
+       }
+       return runSkill(skill, workDir);
+     }),
+   );
    ...
  }

# packages/core/src/scaffold.ts
+ async function fileExists(p: string): Promise<boolean> { ... }
  export async function detectProjectType(workDir: string): Promise<ProjectType> {
+   if (await fileExists(path.join(workDir, 'go.mod'))) return 'go';
    if (await fileExists(path.join(workDir, 'package.json'))) return 'node';
    return 'unknown';
  }
```

新增 yaml 文件 8 个（内容如 design.md 中所示）。

### 5.4 产物：`implementation-notes.md`

```markdown
# 实施笔记

## 实际实现顺序
按 task-breakdown 的依赖图：1 → 2/3/4 (并行) → 5 → 6 → 7 → 8。

## 偏离 design 的地方
- 原 design 接口签名是 `loadSkill(workDir, check, language)`，实际保持不变；
  但内部 `checkBinExists` 这个 helper 没在 design 里设计，是实现时新加的。
- design 说 successExitCode 默认 0，实现时通过 z.default(0) 落实，OK。

## 踩坑
- 新增 yaml 依赖：需 `pnpm add yaml -F @harnessly/core`。第一次 pnpm install 后
  TypeScript 报 `Cannot find module 'yaml'` —— 需要重启 IDE 或重新跑 typecheck 才能识别。
- skill yaml 中的 command 字段如果用了 yaml 多行语法，会被 yaml.parse 解析成带 \n 的
  字符串。SkillSchema.command 是 z.string().min(1)，不会拒；这是潜在 bug，但本任务
  scope 中明确「不做多行命令」，先记 TODO 不修。

## dev-map 增量
在 dev-map.md 的「core 模块」节加：
- skill.ts: Skill 加载与运行；按 .harness/skills/<check>/<lang>.yaml 查找

## 待 reviewer 关注
- skill.ts 的 `error as NodeJS.ErrnoException` 类型断言略松，但保持与既有 evidence.ts
  的风格一致
- evidence.ts 的 changedFiles 收集逻辑没动，仍用 git status --short
- 没改 commit gate（明确在 out_of_scope）

## sub_task_progress（state.json 里的镜像）
- [x] 1 SkillSchema
- [x] 2 skill.ts
- [x] 3 8 个 skill yaml
- [x] 4 detectProjectType 加 go.mod
- [x] 5 evidence.ts 用 skill 替代
- [x] 6 evidence.test.ts 加 Go fixture
- [x] 7 全套测试
- [ ] 8 dev-map 增量更新（待 reviewer pass 后做）
```

### 5.5 Current 快照（执行后自动跑）

```json
{
  "captured_at": "2026-05-01T11:48:00Z",
  "checks": [
    {"name": "build", "status": "passed"},
    {"name": "lint", "status": "passed"},
    {"name": "typecheck", "status": "passed"},
    {"name": "test", "status": "passed", "test_count": 91}
  ],
  "lint_warnings_total": 0,
  "todo_count": 13,
  "git_dirty_files": 11
}
```

### 5.6 Baseline-diff

```
build:      passed → passed             (no change)
lint:       passed → passed             (no change)
typecheck:  passed → passed             (no change)
test:       passed (84) → passed (91)   (+7 tests, all pass)
lint_warnings_total:  0 → 0             (no change)
todo_count:           12 → 13           (+1 TODO — 多行命令支持)
git_dirty_files:      0 → 11            (符合 scope)
```

无新增失败 / 无新增 lint warning。新增的 1 个 TODO 是 implementation-notes 中明确记录的，
不算糊弄。

### 5.7 这一步暴露的设计漏洞

| # | 漏洞 | 严重性 |
|---|---|---|
| **D-9** | baseline-diff 的「新增 TODO 计数」是好指标，但「TODO 是不是被记录在 implementation-notes」的判断目前靠人看。需要规则：execute 阶段任何 TODO 必须在 implementation-notes 里有对应条目，否则 reviewer 自动 reject。 | P1 |
| **D-10** | sub_task_progress 写在 state.json 但本任务还有「dev-map 更新」未做（待 reviewer pass）—— 这意味着 execute 阶段并未完全完成，但工件链路是不是允许「partial complete」? v3 文档没说。 | P1 |
| **D-11** | prompt 组装里 dev-map.md 是必读，但本仓库当前 dev-map.md 是 designer 临时 bootstrap 出来的最小版。下次任务读到的就是这个版本 —— **谁验证 dev-map 是否准？** 这是 v3 Knowledge Layer 的根本风险点。 | P1 |

---

## 6. Review 阶段（owner: reviewer，模型: sonnet）

### 6.1 reviewer 读到的输入

```
requirement.md, design.md, task-breakdown.md, feasibility.md
implementation-notes.md
代码 diff（git diff baseline_commit..HEAD）
.harness/skills/ 新增的 8 个 yaml
evidence/baseline.json, evidence/current.json
```

### 6.2 第一轮产物：`review.md`

```markdown
# 代码审查（第一轮）

## 决议：打回到 execute（block_execute, scope=minimal）

## 通过项
- ✅ Skill schema 落 shared，与 design 一致
- ✅ Node 行为不变（evidence.test.ts 原有 7 个 fixture 全过）
- ✅ Go fixture 新增并通过
- ✅ baseline-diff 干净
- ✅ task-breakdown 8 项中 7 项已完成（第 8 项 dev-map 留给 reviewer pass 后做，符合实施笔记）

## findings (P0 — 必须修)

### F-1: SkillSchema 的 enum 写死了 'node' 和 'go'，这违反 design 里「能扩展到任何语言」的原则
design.md 明确说「v3 Phase 1 仅这两个」，但 enum 写死意味着加 Python 时**必须改 schema 才能加 yaml**。
这与「Skill 化是为了 yaml 扩展无需改 ts」的初衷直接冲突。
建议：language 改为 z.string().min(1)；name 也类似处理。
代价：失去 zod 编译时校验。
权衡：但这正是 Skill yaml 的本意——通过外部约定扩展，不是通过 ts enum 收紧。

### F-2: `checkBinExists` 用 `which`，Windows 不兼容
项目 README / harness.config 没说仅支持 *nix，所以这是 portability bug。
建议：用 Node 的 `import { which } from 'shx'` 或自己写跨平台 PATH 扫描。

## findings (P1 — 应当修)
- F-3: yaml 多行命令 TODO 没有 issue 跟踪，只是 implementation-notes 里一句话。建议落 GH issue 或 .harness/known-issues.md
- F-4: skill.ts 没单测覆盖「skill yaml 校验失败抛错」分支
- F-5: scaffold.ts 的 detectProjectType 改动后没改单测（fileExists 是新加的 helper）

## 重做范围
**仅 F-1 和 F-2**（block_scope: minimal）。
P1 三项可本次顺手修也可以单独跟进。
```

PM 路由：发现 P0 → 打回 developer，要求按 minimal scope 修 F-1 和 F-2。

### 6.3 第二轮 execute（精简）

developer 修：
- F-1：`SkillSchema.name` 改为 `z.string().min(1)`；`language` 同改。**但保留运行时 detectProjectType 的 enum**，因为产品当前确实只支持 node/go。
- F-2：用 `await import('node:os')` + 自实现 PATH 扫描代替 `which`，Windows 兼容。

新增 4 个测试覆盖原 P1 提到的 F-4、F-5。

current 快照重跑：test 91 → 95，无新增失败。

### 6.4 第二轮 review.md

```markdown
# 代码审查（第二轮）

## 决议：通过 (pass)

## 复核
- ✅ F-1 修：SkillSchema 已松绑；新增「未知语言」运行时分支测试通过
- ✅ F-2 修：跨平台 PATH 扫描；macOS/Linux/Windows 三个 fixture 测试通过
- ✅ 顺手修 F-4 和 F-5；F-3 单独跟进

## baseline-diff（vs 第一轮 current）
- test: 91 → 95（+4，全过）
- 其他指标无变化

## 通过进入 test 阶段
```

### 6.5 这一步暴露的设计漏洞

| # | 漏洞 | 严重性 |
|---|---|---|
| **D-12** | reviewer 发现 F-1 这种「设计层面的紧耦合」其实是 designer 没考虑到的。reviewer 是不是应该 emit `block_design` 而不是 `block_execute`？v3 文档对「review 发现的是 design 缺陷而非 execute 缺陷」的归类没明确。 | P0 |
| **D-13** | review.md 的 findings 没有 ID（这次手动加了 F-1/F-2/F-3）。需要 schema 化 review.md，每个 finding 必须有 stable id 才能跨轮次追踪。 | P1 |
| **D-14** | block_scope: minimal/full 的语义不明确：minimal 时 developer 能不能顺手修 P1？这次例子里允许了，但不应该是 case-by-case 决策。 | P1 |

---

## 7. Test 阶段（owner: tester，模型: sonnet）

### 7.1 产物：`test-report.md`

```markdown
# 测试报告

## acceptance_criteria 覆盖

### AC-1: Go 项目跑 evidence 不全部 skipped
- verifiable_by: test
- 实际：evidence.test.ts 中 `Go fixture` 用 tmp dir + go.mod stub 跑 collectEvidence
- 断言：4 个 check 中 3 个 status='failed'（因为 fixture 无真实 Go 工具链），1 个 status='passed'（typecheck 在空仓库 vet 通过）
- 重点是没有 skipped → ✅ 通过

### AC-2: Node 项目行为完全不变
- verifiable_by: test
- 实际：原有 7 个 Node fixture 不修改、全部通过 → ✅

### AC-3: .harness/skills/ 下 8 个 yaml 通过 SkillSchema 校验
- verifiable_by: build
- 实际：build 阶段加了 skill-validate.ts 脚本，扫描 .harness/skills/ 全部用 SkillSchema 解析
- 8/8 通过 → ✅

### AC-4: 缺 golangci-lint 时 lint check 返回 failed 而非 skipped
- verifiable_by: test
- 实际：skill.test.ts 中 mock checkBinExists 返回 false，runSkill 返回 status='failed'
- detail 字符串包含「缺少必要工具：golangci-lint」 → ✅

## baseline-diff 复核（vs 任务起点）
| 指标 | baseline | current | diff |
|---|---|---|---|
| build | passed | passed | - |
| lint | passed | passed | - |
| typecheck | passed | passed | - |
| test | passed (84) | passed (95) | +11 |
| lint_warnings | 0 | 0 | 0 |
| todo_count | 12 | 13 | +1（已记录） |

## 真实环境验证（v3 Phase 5 才做的事，本次提前小规模）
- 找了一个外部 Go 仓库 `golang/example`：
  - cd example && /path/to/harnessly init && harness run "test"
  - evidence checks: build/lint/typecheck/test 都不再 skipped
  - lint 因为 fixture 无 .golangci.yml 导致 fail，但语义正确（不是 skipped）

## 结论
全部 4 条 acceptance_criteria 通过。可进入 commit gate。
```

### 7.2 这一步暴露的设计漏洞

| # | 漏洞 | 严重性 |
|---|---|---|
| **D-15** | tester 在「真实环境验证」部分主动跑了一个外部 Go 仓库 —— 这个动作 v3 设计没规定。tester 默认是不是该做 sandbox-外验证？还是只在 acceptance_criteria 显式要求时？需要明确。 | P1 |

---

## 8. Commit Gate 阶段（owner: pm，模型: haiku）

### 8.1 产物：`commit-summary.md`

```markdown
# 任务总结：让 evidence collector 支持 Go 项目

## 概览
- Task ID: 20260501-094500-evgo
- 风险等级: medium
- 经历阶段: SPEC → Design → Feasibility → Execute → Review → (打回) → Execute → Review → Test → Commit Gate
- 总耗时: ~3.5h（预计 4h，提前 12%）
- LLM 调用次数: 11（PM 4 / requirement 3 / designer 1 / gatekeeper 1 / developer 2 / reviewer 2 / tester 1）

## 改动清单
- packages/core/src/skill.ts (新增, 95 行)
- packages/core/src/skill.test.ts (新增, 145 行)
- packages/core/src/evidence.ts (修改, -40/+25)
- packages/core/src/scaffold.ts (修改, +10)
- packages/core/src/evidence.test.ts (新增 Go fixture, +60)
- packages/core/src/index.ts (导出 skill, +1)
- packages/shared/src/index.ts (新增 SkillSchema, +12)
- .harness/skills/{build,lint,typecheck,test}/{node,go}.yaml (8 文件新增)
- packages/core/package.json (新增 yaml 依赖)
- pnpm-lock.yaml (依赖变更)

## 验证证据
- ✅ Level 1 evidence baseline-diff: 无新增失败
- ✅ Level 2 acceptance_criteria: 4/4 通过
- ✅ 跨平台测试: macOS/Linux/Windows 全过
- ✅ 真实 Go 仓库 smoke test: 通过
- ✅ 测试数 84 → 95 (+11)
- ✅ 一轮 reviewer 打回 → 第二轮通过

## 后置动作
- ✅ dev-map.md 已增量更新（developer step 8 已完成）
- ✅ board.md 已更新（任务从 in-progress → done）

## 已知遗留
- yaml 多行命令支持（已记 .harness/known-issues.md，下个任务跟进）

## 工件文件
- requirement.md / design.md / task-breakdown.md / feasibility.md
- implementation-notes.md / review.md（两轮）/ test-report.md
- evidence/baseline.json / evidence/current.json
- 本文件 / report.json

## commit-ready: TRUE

## 推荐 commit message
```
feat(core): add Go project support via Skill yaml layer

- Introduce .harness/skills/<check>/<lang>.yaml for Level 1 evidence checks
- Replace hardcoded npm logic in evidence.ts with skill-driven runner
- Add SkillSchema (zod) for skill yaml validation
- Auto-detect project type via go.mod / package.json
- Cross-platform PATH scan replaces `which`
- Maintain Node project behavior (7 fixture tests unchanged)

Task-Id: 20260501-094500-evgo
```
```

### 8.2 这一步暴露的设计漏洞

| # | 漏洞 | 严重性 |
|---|---|---|
| **D-16** | commit-summary.md 实际是 PM 写的，但 PM 角色契约规定「不做内容、只做路由」。这里 PM 实际上做了「汇总各阶段产物为 markdown」。需要在 PM 契约里明确：模板填充 / 产物汇总是允许的（不算专业判断）。 | P1 |
| **D-17** | 「推荐 commit message」由 PM 生成，但 commit message 的工程质量很大程度决定 PR 可读性。这个动作其实更适合 reviewer（更懂代码）做，或者作为一个独立子角色。 | P2 |

---

## 9. 后置维护

### 9.1 dev-map 增量

developer 在 task-breakdown 第 8 步增量补：

```diff
# .harness/dev-map.md
  ## packages/core/src/

  - workflow.ts: WorkflowEngine，主流程编排
  - contract.ts: contract 生成 + Contract Gate
  - evidence.ts: Level 1/2 证据采集主入口
+ - skill.ts: Skill 加载与运行；按 .harness/skills/<check>/<lang>.yaml 查找
  - scaffold.ts: 仓库目录与配置初始化（含 detectProjectType）
+ - 注：detectProjectType 现在按 go.mod > package.json 优先级判断
```

### 9.2 board 增量

PM 在 commit_gate 通过后增量补：

```diff
# .harness/board.md

  ## In-Progress
- - 20260501-094500-evgo evidence Skill 化 + Go 支持 (execute) 09:45 →
+ # （已移除）

  ## Done (recent)
+ - 20260501-094500-evgo evidence Skill 化 + Go 支持 → done 13:25
+   - delivery: 11 文件改动，95 测试通过
+   - notes: skill yaml 多行命令支持留待后续
```

### 9.3 这一步暴露的设计漏洞

无新增（但参考 D-11 关于 dev-map 准确性的根本风险）。

---

## 10. 暴露的设计漏洞汇总

按严重性分级。

### P0（必须在实现前修复，否则 v3 跑不通）

| ID | 漏洞 | 修复方向 |
|---|---|---|
| **D-1** | scope.include 是 allowlist 还是 expectation list 没明确，会导致 scope check 误放 | 在 v3 §5.2 明确 scope 语义；scope check 用 deny-list 而不是 allow-list |
| **D-3** | dev-map 不存在时 designer 怎么办？v3 完全没说 | 在 v3 §5.6.1 加「`harness map init` 命令在 init 阶段就生成 dev-map 骨架」 |
| **D-4** | execute 阶段 developer 是否有权写仓库级资产（.harness/skills/ 等）？真空地带 | 在 v3 §6.3 Owner 矩阵补一行：仓库级资产首次落地由当前任务的 developer 写，但需 reviewer 额外 review |
| **D-7** | gatekeeper 越界做产品层决策 | 在 v3 §4.4 + agents/gatekeeper.yaml 明确：发现 v3 真空地带必须 emit blocker 等用户决策 |
| **D-8** | 跨产品架构的决策被 agent 私自做了 | 同 D-7。同时定义「产品层 blocker」事件，强制流程暂停而非自动决议 |
| **D-12** | reviewer 应该 emit block_design 还是 block_execute 没规则 | 在 v3 §4.4 补：finding 性质归 design 时 emit block_design，归 execute 时 emit block_execute |

### P1（应当修，影响产品质量但不阻断流程）

| ID | 漏洞 | 修复方向 |
|---|---|---|
| **D-2** | designer 没有「读 requirement 不确定项作为输入」的契约要求 | agents/designer.yaml 加「必须显式回应所有 unresolved 项」 |
| **D-6** | design.md 不能有「类似」「同上」前向引用 | 在 designer.yaml 加 success_criteria：`design.md must not contain "类似/同上/参考 X" phrases` |
| **D-9** | execute 阶段新增 TODO 必须在 implementation-notes 里登记 | 在 reviewer.yaml 加自动检查规则 |
| **D-10** | execute 是否允许 partial complete（dev-map 留 reviewer 后做） | 在 v3 §5.4 明确：sub_task_progress 必须 100% checked，dev-map 更新独立成第 8 步 |
| **D-11** | dev-map 准确性谁验证 | 加「dev-map staleness check」：周期性 LLM 抽查 dev-map vs 真实代码的 diff |
| **D-13** | review.md findings 缺 stable id | review.md schema 化，finding id = `F-<timestamp>` |
| **D-14** | block_scope: minimal/full 语义不明 | 明确 minimal = 仅修 finding 列出的 P0；full = 重新走完 execute 阶段 |
| **D-15** | tester 是否做 sandbox-外验证 | 在 tester.yaml 加：默认 sandbox-内；acceptance_criteria 中显式要求时才扩到外部 |
| **D-16** | PM 写 commit-summary 与「不做内容」冲突 | PM 契约明确「模板填充 / 产物汇总」是允许的辅助产物 |

### P2（可延后）

| ID | 漏洞 | 修复方向 |
|---|---|---|
| **D-5** | task-breakdown 的「估时」无校准 | 砍掉字段，或加事后校准记录 |
| **D-17** | commit message 由 PM 生成不够专业 | 后续考虑由 reviewer 接手 |

---

## 11. Walkthrough 结论

### 11.1 v3 设计能不能跑？能。但有 6 个 P0 必须先补

七阶段流程在这个真实任务上**整体跑通了**，每个阶段产物都能写出来，每个角色都有真实价值（不是冗余）。其中：

- **Designer** 的方案 A/B/C 对比直接决定了「Skill 化 vs hardcode」的根本走向 —— 这一步如果没有，本任务会退化为「在 evidence.ts 里加 if 分支」，违反 v3 Skill Layer 设计
- **Gatekeeper** 在第 4 章发现 P0-D-4（写权限真空），把潜在事故拦在了 execute 之前
- **Reviewer** 的第一轮打回（F-1 SkillSchema enum 写死）是真实的设计层缺陷，这种问题 v2 的 evaluator 抓不到，需要专门的 reviewer 角色对照 design 看 diff
- **Baseline-diff** 在执行前后各跑一次，根除了「这是历史遗留」糊弄空间
- **Tester** 的真实 Go 仓库 smoke 在 v2 里完全没有对应阶段

### 11.2 但暴露的 6 个 P0 漏洞必须在 v3 文档先补

这 6 个 P0 都是 v3 文档真空地带。在动手实现前必须更新 v3 设计：

1. scope 语义（D-1）
2. dev-map 初始化（D-3）
3. 仓库级资产写权限（D-4）
4. gatekeeper 越界规则（D-7、D-8）
5. reviewer 打回的归类（D-12）

这些都是「文档补条款」而不是「实现复杂度」，预计 1-2 小时改动 v3 设计文档即可。

### 11.3 七角色全启用的成本

本任务（中等任务）实际：
- LLM 调用 11 次
- 总耗时 3.5h（含一轮打回）
- 估算成本 ~$0.50（按 Anthropic 当前价 + 模型分层）

成本可接受。证据：v2 简化版的中等任务大约 5-6 次 LLM 调用、$0.20，v3 多花 $0.30 换来：
- 一个真实的 design 决策（避免技术债）
- 一个真实的 review 打回（避免 P0 缺陷流入）
- 完整文档链（不再需要事后翻 git log 回忆）

如果用 lite 预设跳过 design/feasibility/review，本任务**会落地为「在 evidence.ts 里加 Go 分支」的 hack 方案，违反 v3 Skill Layer 设计**。

### 11.4 lite 预设的真实约束

→ **lite 不是按任务大小决定，是按是否有架构决策点决定**。
v3 文档应明确：以下情况必须用 standard 或 full：
- 涉及新增模块或新增配置约定
- 涉及多语言/多平台扩展
- 涉及 schema 演进
- 涉及共享资产首次落地

普通 typo / 文档微调 / 单点 bugfix 才能用 lite。

### 11.5 推荐下一步

1. **优先级 0**：按 §10 的 6 个 P0 修订 v3 设计文档（约 1-2h）
2. **优先级 1**：实施 v3 Phase 1 → Week 1（SPEC 闭环 + 角色契约骨架），用本 walkthrough 中的 task 作为第一个真实验证案例
3. **优先级 2**：把 §10 的 P1 问题做成 v3 实施计划的 backlog，分散到 Week 3-7 修

---

## 附录：本 Walkthrough 的方法论

这份文档不是「设想 v3 跑起来会很美」，而是「假装真的跑了一次，看哪里卡住」。
推荐做 v3 后续重要决策时，每次都先做一次类似 walkthrough：

- 选**真实存在**的任务（不是虚构 demo）
- 写**真实详细**的产物（不是「示意」）
- 找**具体明确**的漏洞（不是「设计可能有问题」）
- 排**严重性优先级**（P0/P1/P2）
- 给**具体修复方向**（不是「需要进一步研究」）

每份这种文档值得 4-6h 投入，能省后续 4-6 周返工。
