# Agent Harness 技术实现方案

> 基于 `agent-harness-product-design-v2.md` 的技术落地方案
> 技术栈：TypeScript + Node.js
> 版本：v1.0
> 日期：2026-04-16

---

## 1. 技术选型

| 层面 | 选型 | 理由 |
|---|---|---|
| 语言 | TypeScript 5.x | 类型安全 + Playwright 原生集成 + 目标用户大概率已有 Node 环境 |
| 运行时 | Node.js 22 LTS | 稳定，原生 ESM |
| CLI 框架 | oclif v4 | Salesforce/Heroku 系，插件体系成熟，命令结构清晰 |
| 宿主接入 | hook 优先 + command bridge 兜底 | 用户继续在 Claude Code / Codex / Gemini CLI 中工作；Claude Code 可走 hook-first，Codex 以 command bridge 为主路径，Gemini 走 custom commands + agent hooks 语义映射 |
| 包管理 | pnpm + monorepo (pnpm workspace) | 核心 CLI 与 adapter / template 包解耦 |
| Schema 校验 | Zod | 运行时校验 + 类型推导一体，contract/report/config 全部用 Zod 定义 |
| YAML 处理 | yaml (npm: yaml) | 读写 contract.yaml / harness.config.yaml |
| Git 操作 | simple-git | diff、status、commit 操作 |
| 模板引擎 | Handlebars | prompt 组装、plan 模板渲染 |
| 报告生成 | 自研 JSON → HTML（轻量模板） | report.json 原始数据 + 可选 HTML 可视化 |
| Playwright | @playwright/test | Level 2 evidence 的 contract 驱动验证 |
| 测试 | Vitest | 快、ESM 原生、兼容 Jest API |
| 构建 | tsup | 零配置打包，支持 ESM + CJS |
| 分发 | npm publish + 可选 pkg 打包单二进制 | `npm i -g @brawnen/harnessly` 或下载二进制 |

---

## 2. 项目结构

```
agent-harnessly/
├── packages/
│   ├── cli/                          # CLI 入口（oclif）
│   │   ├── src/
│   │   │   ├── commands/
│   │   │   │   ├── init.ts           # harness init
│   │   │   │   ├── run.ts            # harness run "<goal>"
│   │   │   │   ├── eval.ts           # harness eval [task-id]
│   │   │   │   ├── list.ts           # harness list（任务列表）
│   │   │   │   ├── host/
│   │   │   │   │   ├── install.ts    # 生成 repo-local 宿主薄壳
│   │   │   │   │   ├── session-start.ts
│   │   │   │   │   ├── user-prompt-submit.ts
│   │   │   │   │   └── completion-gate.ts
│   │   │   │   └── template/
│   │   │   │       └── promote.ts    # harness template promote [task-id]
│   │   │   ├── index.ts
│   │   │   └── hooks/                # oclif 生命周期钩子
│   │   ├── bin/
│   │   │   └── run.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── hosts/                        # 宿主接入层（薄壳，不承载业务状态）
│   │   ├── shared/
│   │   │   ├── src/
│   │   │   │   ├── manifest.ts       # 宿主能力声明
│   │   │   │   ├── lifecycle.ts      # 事件映射（hook / command bridge）
│   │   │   │   └── shell-writer.ts   # repo-local 薄壳生成器
│   │   ├── claude-code/
│   │   │   ├── src/install.ts
│   │   │   └── templates/            # repo-local .claude/* 薄壳模板
│   │   ├── codex/
│   │   │   ├── src/install.ts
│   │   │   └── templates/            # repo-local .codex/* 薄壳模板
│   │   └── gemini-cli/
│   │       ├── src/install.ts
│   │       └── templates/            # hook 缺失时降级为 command bridge
│   │
│   ├── core/                         # 核心引擎（无 CLI 依赖，可独立测试）
│   │   ├── src/
│   │   │   ├── workflow/             # Workflow 引擎
│   │   │   │   ├── engine.ts         # 主流程编排
│   │   │   │   ├── stages.ts         # 阶段定义与注册
│   │   │   │   └── types.ts
│   │   │   ├── contract/             # Contract Layer
│   │   │   │   ├── generator.ts      # contract 生成（模板填充）
│   │   │   │   ├── gate.ts           # contract gate 校验
│   │   │   │   └── types.ts          # 内部类型（Zod schema 统一在 shared）
│   │   │   ├── plan/                 # Plan 生成
│   │   │   │   ├── generator.ts
│   │   │   │   └── types.ts
│   │   │   ├── execute/              # Execute Boundary
│   │   │   │   ├── adapter.ts        # Adapter 接口定义
│   │   │   │   ├── prompt-assembler.ts  # 结构化 prompt 组装
│   │   │   │   ├── adapters/
│   │   │   │   │   ├── claude-code.ts
│   │   │   │   │   ├── codex.ts
│   │   │   │   │   └── custom.ts
│   │   │   │   └── types.ts
│   │   │   ├── evidence/             # Evidence Layer
│   │   │   │   ├── collector.ts      # 三级 evidence 采集
│   │   │   │   ├── level1/           # 硬指标
│   │   │   │   │   ├── build.ts
│   │   │   │   │   ├── lint.ts
│   │   │   │   │   ├── typecheck.ts
│   │   │   │   │   ├── test.ts
│   │   │   │   │   └── scope-check.ts
│   │   │   │   ├── level2/           # Contract 驱动验证
│   │   │   │   │   ├── playwright-gen.ts
│   │   │   │   │   └── api-check.ts
│   │   │   │   ├── level3/           # AI 辅助评估
│   │   │   │   │   └── evaluator-agent.ts
│   │   │   │   └── types.ts
│   │   │   ├── gate/                 # Gate 系统
│   │   │   │   ├── gate.ts           # gate 判定逻辑
│   │   │   │   ├── commit-gate.ts    # commit gate 特化
│   │   │   │   └── types.ts
│   │   │   ├── report/               # Report 生成
│   │   │   │   ├── generator.ts
│   │   │   │   ├── html-renderer.ts
│   │   │   │   └── types.ts          # 内部类型（Zod schema 统一在 shared）
│   │   │   ├── template/             # 模板系统
│   │   │   │   ├── registry.ts       # 模板注册与查找
│   │   │   │   ├── matcher.ts        # 规则匹配
│   │   │   │   ├── promoter.ts       # template promote 逻辑
│   │   │   │   └── builtin/          # 内置模板
│   │   │   │       ├── bug-fix.yaml
│   │   │   │       ├── feature-simple.yaml
│   │   │   │       ├── feature-cross.yaml
│   │   │   │       ├── refactor.yaml
│   │   │   │       ├── api-endpoint.yaml
│   │   │   │       ├── ui-component.yaml
│   │   │   │       ├── test-coverage.yaml
│   │   │   │       └── migration.yaml
│   │   │   ├── context/              # Context Layer
│   │   │   │   ├── loader.ts         # 全局规则 / 领域文档加载
│   │   │   │   └── types.ts
│   │   │   ├── config/               # 配置管理
│   │   │   │   ├── loader.ts         # 加载 + 校验（使用 shared/schemas/config）
│   │   │   │   └── defaults.ts       # 默认值 + 项目类型推导
│   │   │   ├── task/                 # 任务生命周期管理
│   │   │   │   ├── manager.ts        # 创建、查找、恢复任务
│   │   │   │   ├── state.ts          # 任务状态机
│   │   │   │   └── types.ts
│   │   │   └── llm/                  # LLM 调用抽象
│   │   │       ├── client.ts         # 统一调用接口
│   │   │       ├── providers/
│   │   │       │   ├── anthropic.ts
│   │   │       │   └── openai.ts
│   │   │       └── types.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── shared/                       # 共享类型与工具
│       ├── src/
│       │   ├── schemas/              # 所有 Zod schema 集中定义
│       │   │   ├── contract.ts
│       │   │   ├── report.ts
│       │   │   ├── config.ts
│       │   │   └── template.ts
│       │   ├── utils/
│       │   │   ├── git.ts
│       │   │   ├── fs.ts
│       │   │   ├── logger.ts
│       │   │   └── id.ts             # task-id 生成
│       │   └── constants.ts
│       ├── package.json
│       └── tsconfig.json
│
├── templates/                        # 内置模板源文件（构建时拷贝到 core）
│   └── ... (同 core/src/template/builtin/)
│
├── docs/
│   └── design/
│
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── vitest.config.ts
├── package.json
└── README.md
```

**为什么用 monorepo**：

- `cli` 只负责命令解析和用户交互，不包含业务逻辑
- `core` 包含全部引擎逻辑，无 CLI 依赖，可独立测试，未来可被其他入口（API server、IDE 扩展）复用
- `shared` 放 Zod schema 和工具函数，被 cli 和 core 共同依赖

---

## 3. 核心数据模型（Zod Schema）

### 3.1 Contract Schema

```typescript
// packages/shared/src/schemas/contract.ts
import { z } from 'zod';

const VerificationMethod = z.enum([
  'build', 'lint', 'typecheck', 'test',
  'playwright', 'api', 'manual',
]);

const AcceptanceCriterion = z.object({
  criterion: z.string().min(1),
  verifiable_by: VerificationMethod,
  test_hint: z.string().optional(), // playwright / api 时的提示
});

const RiskLevel = z.enum(['low', 'medium', 'high']);
const Complexity = z.enum(['simple', 'medium', 'complex']);

export const ContractSchema = z.object({
  version: z.literal('1.0'),
  task_id: z.string(),
  goal: z.string().min(5, 'goal 至少 5 个字符'),
  scope: z.array(z.string()).min(1, 'scope 至少包含 1 项'),
  out_of_scope: z.array(z.string()).min(1, 'out_of_scope 至少包含 1 项'),
  acceptance_criteria: z.array(AcceptanceCriterion).min(1),
  risk_level: RiskLevel,
  required_checks: z.array(z.string()).min(1, '至少包含 build'),
  estimated_complexity: Complexity,
  created_at: z.string().datetime(),
  template_used: z.string().optional(),
});

export type Contract = z.infer<typeof ContractSchema>;
```

### 3.2 Report Schema

```typescript
// packages/shared/src/schemas/report.ts
import { z } from 'zod';

const CheckResult = z.object({
  name: z.string(),
  passed: z.boolean(),
  output: z.string().optional(),
  duration_ms: z.number().optional(),
});

const EvaluatorFinding = z.object({
  severity: z.enum(['error', 'warning', 'info']),
  message: z.string(),
  file: z.string().optional(),
  line: z.number().optional(),
});

export const ReportSchema = z.object({
  version: z.literal('1.0'),
  task_id: z.string(),
  workflow_template: z.string(),
  stages_completed: z.array(z.string()),

  // Evidence Level 1（scope 违规从 checks_result 中 name='scope_check' 的
  // CheckResult.details 里提取；不再用独立字段，避免与 Level1Check 产出重复）
  checks_result: z.array(CheckResult),

  // Evidence Level 2
  contract_driven_results: z.array(CheckResult).optional(),

  // Evidence Level 3
  evaluator_findings: z.array(EvaluatorFinding).optional(),

  // 结论
  completion_status: z.enum([
    'passed',           // 全部通过
    'failed',           // 有必选项未通过
    'partial',          // 部分通过（有 warning）
    'not_verified',     // 尚未验证
  ]),
  commit_ready: z.boolean(),
  failure_reasons: z.array(z.string()).optional(),
  created_at: z.string().datetime(),
  duration_ms: z.number(),
});

export type Report = z.infer<typeof ReportSchema>;
```

### 3.3 Config Schema

```typescript
// packages/shared/src/schemas/config.ts
import { z } from 'zod';

export const ConfigSchema = z.object({
  version: z.literal('1.0'),

  roles: z.object({
    planner: z.enum(['template', 'agent', 'human', 'skip']).default('template'),
    generator: z.string().default('claude-code'),        // adapter 名称
    evaluator: z.enum(['auto-checks', 'agent', 'human']).default('auto-checks'),
  }).default({}),

  execute: z.object({
    adapter: z.string().default('claude-code'),
    custom_command: z.string().optional(),
    timeout: z.number().default(3600),                   // 秒
    max_retries: z.number().default(2),
  }).default({}),

  context: z.object({
    global_rules: z.string().default('.harness/GLOBAL_RULES.md'),
    domain_dir: z.string().default('.harness/domains/'),
    max_global_rules_lines: z.number().default(50),
  }).default({}),

  host_integration: z.object({
    install_mode: z.enum(['auto', 'manual', 'off']).default('auto'),
    preferred_hosts: z.array(
      z.enum(['claude-code', 'codex', 'gemini-cli']),
    ).default(['claude-code']),
    strategy: z.enum(['hook-first', 'command-bridge']).default('hook-first'),
    events: z.object({
      session_start: z.boolean().default(true),
      user_prompt_submit: z.boolean().default(true),
      stop: z.boolean().default(true),
      pre_tool_use: z.boolean().default(false),
      post_tool_use: z.boolean().default(false),
    }).default({}),
  }).default({}),

  workflow: z.object({
    contract_review: z.enum(['interactive', 'auto', 'skip']).default('interactive'),
    plan_stage: z.enum(['auto', 'explicit', 'skip']).default('auto'),
    stages: z.array(z.string()).default([
      'contract', 'plan', 'execute', 'verify', 'commit_gate',
    ]),
  }).default({}),

  evidence: z.object({
    level_1: z.enum(['required']).default('required'),   // 不可关闭
    level_2: z.enum(['recommended', 'required', 'off']).default('recommended'),
    level_3: z.enum(['off', 'on', 'risk-only']).default('off'),
    scope_check: z.enum(['strict', 'warn', 'off']).default('strict'),
  }).default({}),

  contract_gate: z.object({
    checks: z.array(z.string()).default([
      'schema_valid',
      'scope_non_empty',
      'criteria_verifiable',
      'no_vague_terms',
      'risk_check_match',
    ]),
    on_fail: z.enum(['ask_user', 'regenerate']).default('ask_user'),
  }).default({}),

  template_matching: z.object({
    strategy: z.enum(['rule_based', 'semantic']).default('rule_based'),
  }).default({}),

  report: z.object({
    format: z.enum(['json', 'html', 'both']).default('json'),
  }).default({}),
});

export type HarnessConfig = z.infer<typeof ConfigSchema>;
```

### 3.4 Template Schema

```typescript
// packages/shared/src/schemas/template.ts
import { z } from 'zod';

export const TemplateSchema = z.object({
  name: z.string(),
  description: z.string(),
  applies_to: z.array(z.string()),          // 适用场景关键词
  default_risk_level: z.enum(['low', 'medium', 'high']),
  default_required_checks: z.array(z.string()),
  workflow_stages: z.array(z.string()),
  required_gates: z.array(z.string()),
  success_signals: z.array(z.string()),
  // 可选：contract 部分字段的默认值
  contract_defaults: z.record(z.unknown()).optional(),
});

export type Template = z.infer<typeof TemplateSchema>;
```

---

## 4. 核心模块设计

### 4.1 Workflow Engine

Workflow Engine 是主流程编排器，负责按序驱动各阶段执行。

```typescript
// packages/core/src/workflow/engine.ts

/**
 * Workflow Engine 设计要点：
 *
 * 1. 固定主流程，不做 DAG
 *    stages 是有序数组，按序执行，没有分支、并行或条件跳转
 *
 * 2. 每个 stage 是独立函数，输入输出明确
 *    输入：TaskContext（包含 contract, plan, config, 前序 stage 产出）
 *    输出：StageResult（成功/失败/跳过 + 产出工件）
 *
 * 3. Gate 嵌入 stage 之间，不是独立 stage
 *    contract gate 在 contract stage 末尾执行
 *    commit gate 在 verify stage 末尾执行
 *
 * 4. 状态持久化
 *    每个 stage 完成后写入 task state 文件
 *    支持中断恢复——从上次完成的 stage 之后继续
 */

export interface StageResult {
  stage: string;
  status: 'completed' | 'failed' | 'skipped' | 'retry';
  artifacts: Record<string, string>;    // 产出文件路径
  error?: string;
  retryFrom?: string;                   // status=retry 时指定回跳到哪个 stage
  retryReason?: string;                 // 回跳原因（例如 "contract gate 失败，用户选择修改目标"）
}

export interface TaskContext {
  taskId: string;
  goal: string;
  config: HarnessConfig;
  workDir: string;                      // 仓库根目录
  taskDir: string;                      // .harness/tasks/<task-id>/
  contract?: Contract;
  plan?: string;
  template?: Template;
  stageResults: StageResult[];
}

export type StageFn = (ctx: TaskContext) => Promise<StageResult>;

export class WorkflowEngine {
  private stages: Map<string, StageFn> = new Map();

  registerStage(name: string, fn: StageFn): void { ... }

  /**
   * 执行完整 workflow
   * 支持从指定 stage 恢复（中断恢复场景）
   */
  async run(ctx: TaskContext, resumeFrom?: string): Promise<Report> {
    const stageNames = ctx.config.workflow.stages;
    let i = resumeFrom ? stageNames.indexOf(resumeFrom) : 0;

    // 防止无限回跳：每个 stage 最多重试 N 次
    const retryBudget = new Map<string, number>();
    const MAX_RETRIES_PER_STAGE = ctx.config.workflow.maxRetriesPerStage ?? 3;

    while (i < stageNames.length) {
      const name = stageNames[i];
      const stageFn = this.stages.get(name);
      if (!stageFn) throw new Error(`未注册的 stage: ${name}`);

      const result = await stageFn(ctx);
      ctx.stageResults.push(result);
      await this.persistState(ctx);

      if (result.status === 'failed') {
        return this.generateReport(ctx, 'failed');
      }

      // 回跳：gate 失败后用户选择修改目标 / plan，从指定 stage 重新执行
      if (result.status === 'retry' && result.retryFrom) {
        const target = stageNames.indexOf(result.retryFrom);
        if (target < 0) throw new Error(`retryFrom 指向不存在的 stage: ${result.retryFrom}`);

        const count = (retryBudget.get(result.retryFrom) ?? 0) + 1;
        if (count > MAX_RETRIES_PER_STAGE) {
          return this.generateReport(ctx, 'failed');
        }
        retryBudget.set(result.retryFrom, count);

        i = target;   // 下轮循环从 target 重新开始（不 +1，因为需要重新执行 target）
        continue;
      }

      i++;
    }

    return this.generateReport(ctx, 'passed');
  }
}
```

### 4.2 Contract Generator

```typescript
// packages/core/src/contract/generator.ts

/**
 * Contract 生成流程：
 *
 * 1. 匹配模板（rule_based）
 * 2. 用模板默认值 + 用户 goal 组装 prompt
 * 3. 调用 LLM 填充 contract schema
 * 4. Zod 校验
 * 5. Contract Gate 校验
 * 6. 用户确认（interactive 模式）
 */

export class ContractGenerator {
  constructor(
    private llm: LLMClient,
    private templateRegistry: TemplateRegistry,
    private gate: ContractGate,
  ) {}

  async generate(goal: string, config: HarnessConfig): Promise<Contract> {
    // 1. 匹配模板
    const template = this.templateRegistry.match(goal);

    // 2. 组装 prompt
    const prompt = this.buildPrompt(goal, template);

    // 3. LLM 生成
    const raw = await this.llm.generateStructured({
      prompt,
      schema: ContractSchema,
      systemPrompt: CONTRACT_SYSTEM_PROMPT,
    });

    // 4. Zod 校验
    const contract = ContractSchema.parse(raw);

    // 5. Contract Gate
    const gateResult = await this.gate.check(contract, config);
    if (!gateResult.passed) {
      // 根据 config.contract_gate.on_fail 决定：重新生成或请求用户干预
      if (config.contract_gate.on_fail === 'regenerate') {
        return this.regenerate(goal, config, gateResult.failures);
      }
      throw new ContractGateError(gateResult.failures);
    }

    return contract;
  }
}
```

### 4.3 Contract Gate

```typescript
// packages/core/src/contract/gate.ts

/**
 * Contract Gate 内置 5 项检查，全部通过才放行。
 * 每项检查独立，可在 config 中开关。
 */

interface GateCheckResult {
  check: string;
  passed: boolean;
  message?: string;
}

const VAGUE_TERMS = ['尽量', '合理', '适当', '差不多', '大概',
                     'reasonable', 'appropriate', 'try to', 'maybe'];

export class ContractGate {
  async check(contract: Contract, config: HarnessConfig): Promise<{
    passed: boolean;
    results: GateCheckResult[];
    failures: string[];
  }> {
    const checks = config.contract_gate.checks;
    const results: GateCheckResult[] = [];

    if (checks.includes('schema_valid')) {
      results.push(this.checkSchemaValid(contract));
    }
    if (checks.includes('scope_non_empty')) {
      results.push(this.checkScopeNonEmpty(contract));
    }
    if (checks.includes('criteria_verifiable')) {
      results.push(this.checkCriteriaVerifiable(contract));
    }
    if (checks.includes('no_vague_terms')) {
      results.push(this.checkNoVagueTerms(contract));
    }
    if (checks.includes('risk_check_match')) {
      results.push(this.checkRiskCheckMatch(contract));
    }

    const failures = results
      .filter(r => !r.passed)
      .map(r => r.message!);

    return { passed: failures.length === 0, results, failures };
  }

  private checkNoVagueTerms(contract: Contract): GateCheckResult {
    const text = JSON.stringify(contract);
    const found = VAGUE_TERMS.filter(t => text.includes(t));
    return {
      check: 'no_vague_terms',
      passed: found.length === 0,
      message: found.length > 0
        ? `contract 中存在模糊词: ${found.join(', ')}`
        : undefined,
    };
  }

  private checkRiskCheckMatch(contract: Contract): GateCheckResult {
    if (contract.risk_level === 'high'
        && !contract.required_checks.includes('test')) {
      return {
        check: 'risk_check_match',
        passed: false,
        message: 'risk_level=high 时 required_checks 必须包含 test',
      };
    }
    return { check: 'risk_check_match', passed: true };
  }

  // ... 其余检查类似
}
```

### 4.4 宿主接入边界

宿主接入的目标不是把 harnessly 变成新的 runtime wrapper，而是把它嵌进用户已经在使用的
coding agent 工作流中，同时继续把 **流程状态、工件和 gate 判定** 保持在 repo-local kernel。

#### 4.4.1 设计结论

- **产品本体独立，入口寄生宿主**：用户继续在 Claude Code / Codex / Gemini CLI 中工作；
  harnessly 的核心状态、contract、report、template 仍落在 `<repo>/.harness/`。
- **Host 是默认交互主路径，Adapter 是执行能力和 headless 路径**：日常开发优先通过宿主
  触发 harnessly；`harness run` 保留给显式/manual/headless/CI 场景，adapter 只负责
  execute 阶段，不再作为产品主叙事。
- **sub-agent 主路径，hook 退为安全网**：Planner / Evaluator 优先由宿主 sub-agent 承担；
  hook 只负责低频上下文注入、Planner 不可用时的补位提示，以及 completion gate 防漏。
- **只接低频节点，不接执行期细粒度控制**：默认只接 `SessionStart`、`UserPromptSubmit`、
  `Stop` 三类低频节点；`PreToolUse`、`PostToolUse` 默认关闭，避免噪音和宿主强耦合。
- **repo-local 薄壳不是事实源**：`.claude/`、`.codex/`、`.gemini/` 这类宿主配置若存在，
  只是从 `.harness/hosts/*` 生成出来的接入壳；真正 source-of-truth 仍是 `.harness/`。

#### 4.4.2 接入分层

```
用户 ↔ 宿主（Claude Code / Codex / Gemini CLI）
         ↓ hook / command bridge
    repo-local host shell（薄壳）
         ↓ 调 CLI host 子命令
      harnessly core / .harness
         ↓ execute 阶段才调用 adapter
   外部 coding agent subprocess
```

这里有两个容易混淆的边界：

1. **Host Integration** 负责“何时让 harnessly 介入当前会话”
2. **Execute Adapter** 负责“在 execute 阶段用哪个 coding agent 真正改代码”

前者是入口层，后者是执行层，不能混成一个 runtime 系统。

#### 4.4.3 最小宿主事件面

| 宿主事件 | harnessly 动作 | 目的 |
|---|---|---|
| `SessionStart` | `harness host session-start` | 只读 active task / contract / report 摘要，给宿主最小上下文；不创建 task |
| `UserPromptSubmit` | `harness host user-prompt-submit` | 只做意图分类和 Planner 委派提示；默认不创建 task |
| `Stop` | `harness host completion-gate` | 当宿主明显宣称完成时，检查 verify / report / commit-ready 是否闭环；未闭环时阻断或提醒委派 Evaluator |

#### 4.4.4 命令桥接兜底

对于不能稳定提供 hook 的宿主，不强行等宿主能力成熟。第一版允许两种降级路径：

- repo-local wrapper：宿主仍用自己的命令运行，但入口脚本先调用 `harness host ...`
- 显式命令触发：用户手动运行 `harness run / eval / status`，宿主只消费 `.harness` 中的结果

这保证了“宿主接入优先”不会演化成“没有 hook 就无法使用产品”。

#### 4.4.5 写入边界约束

Host Integration 最容易踩穿三层模型边界的地方不是“怎么接 hook”，而是“把配置写到哪里”。
这个约束必须写成安装器和 manifest 的硬规则，而不是仅靠文档约定。

```yaml
# .harness/hosts/claude-code.yaml
name: claude-code
write_boundary: repo
config_paths:
  - .claude/settings.json
  - .claude/settings.local.json
events:
  session_start: supported
  user_prompt_submit: supported
  stop: supported
```

规则如下：

- `write_boundary` 当前只允许 `repo`
- 任何指向 `~/.claude`、`~/.codex`、`~/.gemini` 的路径都视为非法配置
- host installer 在写 repo-local 薄壳前，必须先校验 manifest 与目标路径
- 如果某个宿主只能通过用户 home 目录接入，则该宿主在当前版本记为 `unsupported`

#### 4.4.6 Contract 介入机制

verify/gate 可以靠响应式 hook 介入，但 contract 不行。第一版必须显式定义：
**“用户如何在宿主里开始一个 harness task，并在改代码前完成 contract 确认。”**

优先级顺序：

1. repo-local command / slash command
2. Planner sub-agent / 宿主 plan mode
3. `UserPromptSubmit` 触发的 Planner 委派提示
4. 显式手工命令 `harness run --dry-run`

按宿主拆分如下：

| 宿主 | Contract 介入机制 | 第一版结论 |
|---|---|---|
| Claude Code | 优先 Planner sub-agent + plan mode；`UserPromptSubmit` 只做委派提示和 fallback | **Phase 1 主支持** |
| Codex | **主路径按 command bridge + Planner 委派设计**；`SessionStart / UserPromptSubmit` hook 作为可选增强，不作为闭环唯一依赖 | 第一版必须完成完整流程 |
| Gemini CLI | 优先 repo-local custom commands；hooks 作为 completion / tool 观测补充，不强行预设 Claude/Codex 同名事件 | **Experimental，可进入 Phase 2 原型验证** |

设计约束：

- contract 阶段不是“监听后补救”，而是进入执行前的主动建模
- 宿主薄壳只能触发 `contract generate/review`，不能自己持有 contract 状态
- `UserPromptSubmit` 默认不能直接创建 task；只有 `fallback_create_task_without_planner=true` 时才允许降级创建
- 如果宿主没有合适的显式入口，必须退回 `harness run --dry-run`，不能跳过 contract

#### 4.4.7 Host Capability Matrix

第一版不要求三个宿主**完全同构**，但要求主支持宿主都能完成闭环。  
当前主支持宿主为 `Claude Code` 与 `Codex`；`Gemini CLI` 暂不纳入当前试用主线。

| 能力 | Claude Code | Codex | Gemini CLI | 第一版用途 |
|---|---|---|---|---|
| Repo-local 配置写入 | ✅ 已知可做 | ✅ 已知可做 | ✅ 已知可做 | 安装宿主薄壳 |
| `SessionStart` 等价点 | ✅ 已知可做 | ✅ 已知可做 | ✅ `SessionStart` | 注入 active task 摘要 |
| `UserPromptSubmit` 等价点 | ✅ 已知可做 | ✅ 已知可做 | 🟡 无 1:1 同名点；优先 custom commands，必要时映射 `BeforeAgent` / `BeforeModel` | 创建/续接 task |
| `Stop` / 完成态拦截 | ✅ 已知可做 | ✅ 已知可做 | ✅ `AfterAgent` 可承担 completion gate | completion gate |
| `PreToolUse` / `PostToolUse` | ⚠ 可用但非 MVP 主路径 | ⚠ 可选增强，不作为 MVP 主路径 | ✅ `BeforeTool` / `AfterTool` 可接 | 附加观测，不承载核心 gate |
| 显式 contract 入口 | ✅ repo-local command / slash command 优先 | 🟡 先用 command bridge；自定义 slash command 能力证据不足 | ✅ repo-local custom commands 优先 | contract 介入 |
| 平台约束 | ✅ 常规支持 | 🟡 hooks 为 experimental，且 Windows 暂不支持 | 🟡 事件模型更强但不与 Claude/Codex 同构；按语义映射接入 | 控制支持边界 |
| 默认支持级别 | **GA (Phase 1)** | **GA（command bridge 主路径）** | **Experimental / 后置** | 控制承诺范围 |

这张表不是装饰，而是后续 host 扩展的准入门槛：没有补完 capability 证据，不进入正式支持列表。
其中 Codex 第一版按“**command bridge 主路径 + hook 可选增强**”落地，原因是：

- repo-local `.codex/config.toml` 与 `.codex/hooks.json` 已有官方文档支持
- `SessionStart`、`UserPromptSubmit`、`Stop` 事件在能力矩阵中可对齐，但真实运行时是否稳定执行 hook 仍受 feature flag / trust / 平台条件影响
- 因此 contract intake、task 续接、completion gate 不能把 hook 当唯一依赖，必须保证 command bridge 单独可闭环
- hooks 命中时可用于自动追加上下文或低频触发，但闭环验收以 command bridge 路径为准

Gemini CLI 当前也可进入“实验性接入”阶段，但接入方式不能生搬 Claude/Codex 的事件命名，原因是：

- repo-local `.gemini/settings.json` 已可作为项目级配置入口
- repo-local `.gemini/commands/` 可提供项目级 custom commands，适合作为显式 contract 入口
- hooks 能力覆盖 `SessionStart`、`BeforeTool`、`AfterTool`、`BeforeAgent`、`AfterAgent`、`BeforeModel`、`AfterModel` 等点位
- `UserPromptSubmit` 没有 1:1 同名事件，因此第一版应以 custom commands 为主路径，hooks 只做语义补位

#### 4.4.8 Host Sub-agent 策略

Sub-agent 是增强 Host-First 体验的实现策略，不是 Harnessly 的产品本体。

产品层稳定定义的是 `Planner / Generator / Evaluator` 三类职责角色，而不是固定三个 agent 实例。  
当宿主原生支持 sub-agent 且 repo-local 配置稳定时，可以优先用宿主 sub-agent 承担部分职责：

| 职责 | 宿主主路径建议 | 是否必须是 sub-agent | 说明 |
|---|---|---|---|
| Planner | 可由宿主 Planner sub-agent 承担 | 否 | 负责把用户目标转成 contract + plan，并写入 `.harness/tasks/<task-id>/` |
| Generator | 默认由宿主主 Agent 承担 | 否 | 负责真实代码实现；Harnessly 不进入执行期细粒度控制 |
| Evaluator | 可由宿主 Evaluator sub-agent 承担 | 否 | 负责读取 contract、执行 evidence/gate、生成或解释 report |

当前代码生成状态：

| 宿主 | 已生成的 sub-agent 定义 | 当前接入判断 |
|---|---|---|
| Claude Code | `.claude/agents/harness-planner.md`、`.claude/agents/harness-evaluator.md` | 定义文件已由 `harness init / host sync` 生成；宿主主路径应优先尝试委派 Planner / Evaluator，但真实闭环还需补 Claude Code smoke 证据 |
| Codex | `.codex/agents/harness-planner.toml`、`.codex/agents/harness-evaluator.toml` | 定义文件已由 `harness init / host sync` 生成；当前稳定闭环仍以 command bridge 为准，sub-agent 作为主路径增强进入试用观察 |

主路径决策：

- **优先尝试**：在宿主能稳定识别 repo-local sub-agent 时，主 Agent 应优先委派 `harness-planner` 完成 contract / plan，优先委派 `harness-evaluator` 完成 verify / gate 解读。
- **优先利用宿主 plan mode**：如果宿主提供原生 plan 模式，Planner 应优先在该模式中完成目标澄清、scope、acceptance criteria 和执行步骤建模；plan mode 的输出只是交互承载层，最终仍必须写入 `.harness/tasks/<task-id>/contract.yaml` 和 `plan.md`。
- **Planner 模型可配置**：Planner 默认使用轻量模型，Evaluator 默认使用中等模型；实际模型应允许通过 repo-local 配置覆盖，并在生成 `.claude/agents/*`、`.codex/agents/*` 时落到宿主原生模型字段。
- **不得单点依赖**：sub-agent 调用失败、不可见或宿主能力不稳定时，必须降级到 hook / command bridge / manual-headless。
- **验收不变**：无论职责由 sub-agent 还是 hook/bridge 承担，完成判定都只看 `.harness/tasks/<task-id>/contract.yaml`、`plan.md`、`report.json` 和 gate 结果。
- **不新增 Generator sub-agent**：代码实现仍由用户正在使用的宿主主 Agent 承担，避免把 V1 做成固定多 agent runtime。

当前实现采用扁平 YAML 键名，便于复用现有配置解析器：

```yaml
fallback_create_task_without_planner: false
planner_use_host_plan_mode: true
planner_model_claude_code: haiku
planner_model_codex: gpt-5.4-mini
evaluator_model_claude_code: sonnet
evaluator_model_codex: gpt-5.4
```

这组配置只决定宿主内 Planner / Evaluator 的承载方式和模型选择，不改变 `.harness/` 的事实源地位，也不影响 manual/headless 路径。

使用 sub-agent 时必须满足以下约束：

- `.harness/` 仍是唯一事实源，sub-agent 的自然语言结论不能替代 `contract.yaml / plan.md / report.json`
- Planner sub-agent 不能只返回口头 contract，必须通过 Harnessly 命令或 repo-local API 生成 `.harness/tasks/<task-id>/contract.yaml`
- Evaluator sub-agent 不能只做主观评审，必须基于 evidence、gate 和 `report.json` 给出结论
- Generator 默认仍是宿主主 Agent，不额外派生 Generator sub-agent，避免把第一版变成多 agent runtime
- `harness host install` 可以生成 sub-agent 定义文件，但不能只生成 sub-agent 文件；hook / command bridge / wrapper 仍然作为触发与 fallback 机制保留
- 如果某个宿主的 sub-agent 能力不稳定，必须能降级到 hook / command bridge / manual-headless 路径

因此，宿主主路径的推荐结构是：

```text
用户在宿主内发任务
  ↓
宿主入口判断新任务
  ↓
Planner sub-agent 或 hook/bridge 生成 contract + plan
  ↓
写入 .harness/tasks/<task-id>/
  ↓
宿主主 Agent 作为 Generator 执行
  ↓
Evaluator sub-agent 或 evidence/gate 命令验证
  ↓
report.json + gate 结论回流给主 Agent
```

该策略解决的是“宿主内如何自然承载 Planner/Evaluator”，而不是重新定义 Harnessly 为 sub-agent 编排平台。

### 4.5 Adapter 接口与实现

```typescript
// packages/core/src/execute/adapter.ts

/**
 * Adapter 是产品与底层 coding agent 的唯一接口。
 *
 * 设计原则：
 * - 输入：结构化 prompt（字符串）
 * - 输出：exit code
 * - 副作用：代码变更体现在 git working tree
 * - 产品不控制 agent 执行过程
 */

export interface AdapterInput {
  promptFile: string;     // 组装好的 prompt 文件路径
  workDir: string;        // 仓库根目录
  timeoutMs: number;      // 超时（毫秒）。注意：config 中 execute.timeout 单位为秒，
                          // 调用方需显式做 `timeoutMs: config.execute.timeout * 1000` 转换
  taskId: string;
}

export interface AdapterOutput {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
}

export interface Adapter {
  name: string;
  execute(input: AdapterInput): Promise<AdapterOutput>;
}
```

```typescript
// packages/core/src/execute/adapters/claude-code.ts

import { execa } from 'execa';

export class ClaudeCodeAdapter implements Adapter {
  name = 'claude-code';

  async execute(input: AdapterInput): Promise<AdapterOutput> {
    const start = Date.now();
    try {
      const result = await execa('claude', [
        '--print',                              // 非交互模式
        '--max-turns', '50',
        '--input-file', input.promptFile,
      ], {
        cwd: input.workDir,
        timeout: input.timeoutMs,
        reject: false,                          // 不因非 0 退出码抛异常
      });

      return {
        exitCode: result.exitCode ?? 1,
        stdout: result.stdout,
        stderr: result.stderr,
        durationMs: Date.now() - start,
      };
    } catch (err) {
      return {
        exitCode: 1,
        stdout: '',
        stderr: String(err),
        durationMs: Date.now() - start,
      };
    }
  }
}
```

```typescript
// packages/core/src/execute/adapters/custom.ts

/**
 * 用户自定义 adapter，通过 config 中的 custom_command 配置。
 * 支持 {prompt_file}、{work_dir}、{task_id} 占位符。
 */
export class CustomAdapter implements Adapter {
  name = 'custom';

  constructor(private commandTemplate: string) {}

  async execute(input: AdapterInput): Promise<AdapterOutput> {
    const command = this.commandTemplate
      .replace('{prompt_file}', input.promptFile)
      .replace('{work_dir}', input.workDir)
      .replace('{task_id}', input.taskId);

    // 用 shell 执行
    const result = await execa(command, {
      shell: true,
      cwd: input.workDir,
      timeout: input.timeoutMs,
      reject: false,
    });

    return { ... };
  }
}
```

### 4.6 Prompt Assembler

```typescript
// packages/core/src/execute/prompt-assembler.ts

/**
 * 组装喂给 adapter 的结构化 prompt。
 * 这是产品在 execute 阶段的核心价值：
 * 用户只写了一句 goal，产品把 contract、plan、规则、领域文档全部组装好。
 */

export class PromptAssembler {
  constructor(private contextLoader: ContextLoader) {}

  async assemble(ctx: TaskContext): Promise<string> {
    const parts: string[] = [];

    // 任务目标
    parts.push(`# 任务\n\n${ctx.contract!.goal}`);

    // 范围
    parts.push(`## 范围\n\n${ctx.contract!.scope.map(s => `- ${s}`).join('\n')}`);
    parts.push(`## 不在范围内\n\n${ctx.contract!.out_of_scope.map(s => `- ${s}`).join('\n')}`);

    // Plan
    if (ctx.plan) {
      parts.push(`## 执行计划\n\n${ctx.plan}`);
    }

    // 全局规则
    const globalRules = await this.contextLoader.loadGlobalRules(ctx.config);
    if (globalRules) {
      parts.push(`## 全局规则\n\n${globalRules}`);
    }

    // 领域文档（根据 scope 涉及的路径动态加载）
    const domainDocs = await this.contextLoader.loadRelevantDomains(
      ctx.config, ctx.contract!.scope,
    );
    if (domainDocs.length > 0) {
      parts.push(`## 相关领域文档\n\n${domainDocs.join('\n\n---\n\n')}`);
    }

    // 完成标准
    parts.push(`## 验收标准\n\n${ctx.contract!.acceptance_criteria
      .map(c => `- ${c.criterion} (验证方式: ${c.verifiable_by})`)
      .join('\n')}`);

    // 必须通过的检查
    parts.push(`## 必须通过的检查\n\n${ctx.contract!.required_checks
      .map(c => `- ${c}`)
      .join('\n')}`);

    // 约定
    parts.push(`## 约定\n
- 每完成一个功能请 commit，commit message 以 [harness:${ctx.taskId}] 开头。
- 不要修改 scope 之外的文件，除非是必要的依赖更新。
- 完成后不要自行声明"已完成"，harness 会自动验证。`);

    return parts.join('\n\n');
  }
}
```

### 4.7 Evidence Collector

```typescript
// packages/core/src/evidence/collector.ts

/**
 * 三级 Evidence 采集。
 * Level 1 强制，Level 2 推荐，Level 3 按需。
 */

export class EvidenceCollector {
  constructor(
    private level1Checks: Level1Check[],
    private level2Checks: Level2Check[],
    private level3Evaluator: Level3Evaluator | null,
  ) {}

  async collect(ctx: TaskContext): Promise<EvidenceResult> {
    const result: EvidenceResult = {
      level1: [],
      level2: [],
      level3: [],
    };

    // Level 1: 强制执行（ScopeCheck 是 Level1Check 的一种，统一在这里跑，
    // 不再在 collector 内部重复实现 diff/glob 匹配逻辑——避免双份实现漂移）
    for (const check of this.level1Checks) {
      result.level1.push(await check.run(ctx));
    }

    // Level 2: 推荐执行
    if (ctx.config.evidence.level_2 !== 'off') {
      const criteria = ctx.contract!.acceptance_criteria
        .filter(c => c.verifiable_by === 'playwright' || c.verifiable_by === 'api');

      for (const criterion of criteria) {
        const check = this.resolveLevel2Check(criterion);
        if (check) {
          result.level2.push(await check.run(ctx, criterion));
        }
      }
    }

    // Level 3: 按需执行
    if (this.shouldRunLevel3(ctx)) {
      result.level3 = await this.level3Evaluator!.evaluate(ctx);
    }

    return result;
  }

  private shouldRunLevel3(ctx: TaskContext): boolean {
    const level3Config = ctx.config.evidence.level_3;
    if (level3Config === 'off') return false;
    if (level3Config === 'on') return true;
    // risk-only: 仅高风险任务
    return ctx.contract!.risk_level === 'high';
  }
}
```

### 4.7 Scope Check 实现

```typescript
// packages/core/src/evidence/level1/scope-check.ts

import minimatch from 'minimatch';

/**
 * Scope 检查：harness 区别于 CI 的独有能力。
 *
 * contract.scope 支持两种格式：
 * 1. 路径 glob: "src/auth/**", "src/api/users.ts"
 * 2. 语义描述: "认证模块" — 需要映射到路径（通过 domain 配置或约定）
 *
 * 第一版只支持路径 glob，语义描述留给后续版本。
 */

export class ScopeCheck implements Level1Check {
  name = 'scope_check';

  async run(ctx: TaskContext): Promise<CheckResult> {
    const git = simpleGit(ctx.workDir);
    const diff = await git.diffSummary();
    const changedFiles = diff.files.map(f => f.file);

    const scopeGlobs = ctx.contract!.scope;
    const violations: string[] = [];

    for (const file of changedFiles) {
      const inScope = scopeGlobs.some(glob => minimatch(file, glob));
      // 允许始终修改的文件（package.json, lock 文件等）
      const isAlwaysAllowed = this.isAlwaysAllowed(file);
      if (!inScope && !isAlwaysAllowed) {
        violations.push(file);
      }
    }

    const mode = ctx.config.evidence.scope_check;
    return {
      name: this.name,
      passed: mode === 'warn' ? true : violations.length === 0,
      output: violations.length > 0
        ? `以下文件不在 scope 内但被修改:\n${violations.map(f => `  - ${f}`).join('\n')}`
        : 'scope 检查通过',
    };
  }

  private isAlwaysAllowed(file: string): boolean {
    const allowList = [
      'package.json', 'pnpm-lock.yaml', 'package-lock.json',
      'yarn.lock', 'tsconfig.json',
    ];
    return allowList.some(a => file.endsWith(a));
  }
}
```

### 4.8 Gate 系统

```typescript
// packages/core/src/gate/gate.ts

/**
 * Gate 系统：在关键节点做 pass/fail 判断。
 *
 * 第一版只有两个 gate：
 * 1. Contract Gate — contract 生成后、plan 之前
 * 2. Commit Gate — verify 之后、任务结束前
 */

export class CommitGate {
  /**
   * 判断逻辑：
   * 1. 所有 Level 1 checks 必须通过
   * 2. scope_check 根据配置（strict → 必须通过，warn → 仅警告）
   * 3. Level 2 checks 如果执行了，全部通过
   * 4. Level 3 如果执行了，无 error 级别发现
   */
  judge(evidence: EvidenceResult, config: HarnessConfig): GateDecision {
    const failures: string[] = [];

    // Level 1 必须全部通过（ScopeCheck 已在 Level1Check 内部按 strict/warn 模式
    // 决定 passed 字段——warn 模式下即便有违规也会 passed=true，只走 warnings）
    for (const check of evidence.level1) {
      if (!check.passed) {
        failures.push(`[Level 1] ${check.name}: ${check.output}`);
      }
    }

    // Level 2
    for (const check of evidence.level2) {
      if (!check.passed) {
        failures.push(`[Level 2] ${check.name}: ${check.output}`);
      }
    }

    // Level 3
    const level3Errors = evidence.level3
      .filter(f => f.severity === 'error');
    if (level3Errors.length > 0) {
      failures.push(
        `[Level 3] ${level3Errors.length} 个严重问题`,
      );
    }

    // warn 模式下的 scope 违规以 Level1 check 的 output 形式附到 warnings
    const scopeWarn = evidence.level1.find(
      c => c.name === 'scope_check' && c.passed && c.output.includes('超出 scope'),
    );

    return {
      passed: failures.length === 0,
      commitReady: failures.length === 0,
      failures,
      warnings: scopeWarn ? [scopeWarn.output] : [],
    };
  }
}
```

### 4.9 Template Registry

```typescript
// packages/core/src/template/registry.ts

/**
 * 模板注册表：管理内置模板 + 用户自定义模板。
 *
 * 查找顺序：
 * 1. 项目级模板: .harness/templates/*.yaml
 * 2. 用户级模板: ~/.harnessly/templates/*.yaml
 * 3. 内置模板: 打包在 npm 包中
 */

export class TemplateRegistry {
  private templates: Map<string, Template> = new Map();

  async loadAll(workDir: string): Promise<void> {
    // 1. 内置模板
    await this.loadBuiltin();
    // 2. 用户级（后加载的覆盖先加载的同名模板）
    await this.loadFromDir(path.join(os.homedir(), '.harnessly/templates'));
    // 3. 项目级
    await this.loadFromDir(path.join(workDir, '.harness/templates'));
  }

  get(name: string): Template | undefined {
    return this.templates.get(name);
  }

  list(): Template[] {
    return Array.from(this.templates.values());
  }
}
```

```typescript
// packages/core/src/template/matcher.ts

/**
 * 规则匹配器：根据 goal 文本匹配模板。
 * 第一版只做关键词匹配，不做语义理解。
 */

interface MatchRule {
  keywords: string[];
  templateName: string;
  extraCondition?: (goal: string) => boolean;
}

const BUILTIN_RULES: MatchRule[] = [
  {
    keywords: ['fix', 'bug', '修复', '缺陷', '问题', 'issue'],
    templateName: 'bug-fix',
  },
  {
    keywords: ['refactor', '重构', 'cleanup', '清理'],
    templateName: 'refactor',
  },
  {
    keywords: ['migration', '迁移', 'migrate', 'schema'],
    templateName: 'migration',
  },
  {
    keywords: ['test', '测试', 'coverage', '覆盖率'],
    templateName: 'test-coverage',
  },
  {
    keywords: ['api', 'endpoint', '接口', 'route'],
    templateName: 'api-endpoint',
  },
  {
    keywords: ['component', '组件', 'ui', 'page', '页面'],
    templateName: 'ui-component',
  },
  // default 在 match() 方法中处理
];

export class TemplateMatcher {
  match(goal: string, registry: TemplateRegistry): Template {
    const lowerGoal = goal.toLowerCase();

    for (const rule of BUILTIN_RULES) {
      if (rule.keywords.some(kw => lowerGoal.includes(kw))) {
        const template = registry.get(rule.templateName);
        if (template) return template;
      }
    }

    // 默认 fallback
    return registry.get('feature-simple')!;
  }
}
```

### 4.10 Task Manager

```typescript
// packages/core/src/task/manager.ts

/**
 * 任务生命周期管理：创建、查找、恢复。
 *
 * 任务目录结构：
 * .harness/tasks/<task-id>/
 *   ├── contract.yaml
 *   ├── plan.md
 *   ├── prompt.md          # 组装后的完整 prompt（可审计）
 *   ├── state.json          # 当前执行状态（支持恢复）
 *   ├── report.json
 *   └── report.html         # 可选
 */

export class TaskManager {
  async create(goal: string, workDir: string): Promise<TaskContext> {
    const taskId = this.generateTaskId();        // 例如 "20260416-143022-a1b2"
    const taskDir = path.join(workDir, '.harness/tasks', taskId);
    await fs.mkdir(taskDir, { recursive: true });

    return {
      taskId,
      goal,
      config: await this.loadConfig(workDir),
      workDir,
      taskDir,
      stageResults: [],
    };
  }

  /**
   * 恢复中断的任务：
   * 读取 state.json，找到最后完成的 stage，从下一个 stage 继续。
   */
  async resume(taskId: string, workDir: string): Promise<TaskContext> {
    const taskDir = path.join(workDir, '.harness/tasks', taskId);
    const state = await this.loadState(taskDir);
    const contract = await this.loadContract(taskDir);
    const plan = await this.loadPlan(taskDir);

    return {
      taskId,
      goal: contract.goal,
      config: await this.loadConfig(workDir),
      workDir,
      taskDir,
      contract,
      plan,
      stageResults: state.completedStages,
    };
  }

  async listTasks(workDir: string): Promise<TaskSummary[]> {
    const tasksDir = path.join(workDir, '.harness/tasks');
    // 读取所有任务目录，返回摘要列表
    ...
  }

  private generateTaskId(): string {
    const now = new Date();
    const date = now.toISOString().slice(0, 10).replace(/-/g, '');
    const time = now.toISOString().slice(11, 19).replace(/:/g, '');
    const rand = crypto.randomBytes(2).toString('hex');
    return `${date}-${time}-${rand}`;
  }
}
```

### 4.11 Task State Machine

```typescript
// packages/core/src/task/state.ts

/**
 * 任务状态机：
 *
 *   created → contracting → planning → executing → verifying → gate_check
 *                                                                  ↓
 *                                              passed ←── commit_gate ──→ failed
 *                                                                           ↓
 *                                                                   retry (回到 executing)
 */

export type TaskStatus =
  | 'created'
  | 'contracting'
  | 'planning'
  | 'executing'
  | 'verifying'
  | 'gate_check'
  | 'passed'
  | 'failed'
  | 'retrying';

export interface TaskState {
  taskId: string;
  status: TaskStatus;
  currentStage: string;
  completedStages: StageResult[];
  retryCount: number;
  createdAt: string;
  updatedAt: string;
}

export class TaskStateMachine {
  transition(state: TaskState, event: string): TaskState {
    // 状态转换逻辑
    ...
  }

  async persist(state: TaskState, taskDir: string): Promise<void> {
    await fs.writeFile(
      path.join(taskDir, 'state.json'),
      JSON.stringify(state, null, 2),
    );
  }

  async load(taskDir: string): Promise<TaskState> {
    const raw = await fs.readFile(
      path.join(taskDir, 'state.json'), 'utf-8',
    );
    return JSON.parse(raw);
  }
}
```

---

## 5. CLI 命令设计

### 5.1 harness init

```typescript
// packages/cli/src/commands/init.ts

/**
 * harness init
 *
 * 初始化 .harness/ 目录结构：
 *   .harness/
 *   ├── GLOBAL_RULES.md         # 空模板 + 注释引导
 *   ├── domains/                # 空目录
 *   ├── hosts/                  # 宿主清单（source-of-truth）
 *   ├── templates/              # 空目录（用户自定义模板放这里）
 *   ├── tasks/                  # 空目录
 *   └── harness.config.yaml     # 默认配置
 *
 * 行为：
 * - 如果 .harness/ 已存在，提示用户是否覆盖配置文件
 * - 自动检测项目类型（package.json → Node，go.mod → Go 等）
 *   根据检测结果预填 required_checks 默认值
 * - 检测可用宿主（claude-code / codex / gemini-cli），生成
 *   `.harness/hosts/*.yaml` manifest，并按配置决定是否同步 repo-local 宿主薄壳
 * - 不修改 .gitignore（所有 harness 工件都应纳入版本控制）
 * - 严禁写入用户 home 下的宿主配置；只允许生成当前 repo 内的宿主薄壳
 */

export default class Init extends Command {
  static description = '初始化 harness 基础设施';

  async run(): Promise<void> {
    const workDir = process.cwd();

    // 检测项目类型
    const projectType = await detectProjectType(workDir);

    // 创建目录结构
    await this.scaffold(workDir);

    // 生成默认配置
    const config = this.generateDefaultConfig(projectType);
    await writeYaml(
      path.join(workDir, '.harness/harness.config.yaml'),
      config,
    );

    // 生成 GLOBAL_RULES.md 模板
    await this.writeGlobalRulesTemplate(workDir);

    // 生成宿主清单 + repo-local 宿主薄壳（如启用）
    await this.installHostShells(workDir, config.host_integration);

    this.log('✓ .harness/ 目录已创建');
    this.log('  编辑 .harness/GLOBAL_RULES.md 添加项目全局规则');
    this.log('  编辑 .harness/harness.config.yaml 调整配置');
  }
}
```

#### `harness host install [--host <name|auto|all>]`

```typescript
// packages/cli/src/commands/host/install.ts

/**
 * 生成或刷新 repo-local 宿主薄壳。
 *
 * 作用：
 * 1. 读取 `.harness/harness.config.yaml`
 * 2. 读取/生成 `.harness/hosts/*.yaml`
 * 3. 针对每个宿主输出 repo-local 薄壳文件
 * 4. 如果宿主不支持稳定 hook，则降级写入 command bridge 配置
 *
 * 注意：
 * - `.harness/hosts/*.yaml` 是 source-of-truth
 * - repo 根目录的 `.claude/*`、`.codex/*`、`.gemini/*` 只是生成产物
 * - 不读写用户 home 目录
 */
```

#### `harness host status / sync`

```typescript
// packages/cli/src/commands/host/status.ts
// packages/cli/src/commands/host/sync.ts

/**
 * `harness host status`
 * - 显示当前 repo 下已安装的 host、manifest 状态、write boundary、配置漂移
 *
 * `harness host sync`
 * - 以 `.harness/hosts/*.yaml` 为 source-of-truth，重写 repo-local 宿主薄壳
 * - 典型场景：用户手改 `.claude/settings.json` 后恢复到 harnessly 管理态
 */
```

#### `harness host session-start / user-prompt-submit / completion-gate`

```typescript
// packages/cli/src/commands/host/session-start.ts
// packages/cli/src/commands/host/user-prompt-submit.ts
// packages/cli/src/commands/host/completion-gate.ts

/**
 * 宿主 lifecycle 子命令只做三件事：
 *
 * 1. SessionStart:
 *    - 读取 active task
 *    - 输出 contract / scope / 最近 report 的简短摘要
 *
 * 2. UserPromptSubmit:
 *    - 判断当前输入是普通聊天、创建新 task，还是续接已有 task
 *    - 默认返回委派 `harness-planner` 的信号，不直接创建 task
 *    - 只有显式开启 fallback_create_task_without_planner 时，才降级创建 task
 *
 * 3. CompletionGate:
 *    - 识别宿主是否在宣称完成
 *    - 如 verify / report / commit-ready 未闭环，则返回阻断或警告
 *
 * 这些命令默认服务 hook；没有 hook 时也可被 wrapper / slash command 直接调用。
 */
```

### 5.2 harness run

```typescript
// packages/cli/src/commands/run.ts

/**
 * harness run "<goal>"
 *
 * 定位：
 * - 有 host integration 时，`harness run` 不是日常首选入口
 * - 它主要服务显式/manual/headless/CI 场景
 * - 若检测到当前 repo 已装 host shell，可提示用户优先走宿主入口
 *
 * 完整流程：
 * 1. 创建任务
 * 2. 匹配模板
 * 3. 生成 contract → contract gate → 用户确认
 * 4. 生成 plan（或跳过）
 * 5. 组装 prompt → adapter 执行
 * 6. 采集 evidence → commit gate
 * 7. 生成 report
 *
 * 选项：
 *   --template <name>    强制使用指定模板
 *   --skip-confirm       跳过 contract 确认（等同 contract_review: auto）
 *   --deep-eval          启用 Level 3 评估
 *   --resume <task-id>   恢复中断任务
 *   --dry-run            只生成 contract 和 plan，不执行
 */

export default class Run extends Command {
  static args = {
    goal: Args.string({ description: '任务目标', required: true }),
  };

  static flags = {
    template: Flags.string({ description: '强制使用指定模板' }),
    'skip-confirm': Flags.boolean({ default: false }),
    'deep-eval': Flags.boolean({ default: false }),
    resume: Flags.string({ description: '恢复指定任务' }),
    'dry-run': Flags.boolean({ default: false }),
  };

  /**
   * CLI 层只做：参数解析 + 依赖装配 + 调用 engine。
   * 所有业务逻辑（contract 生成/确认、plan 生成、execute、verify、commit gate）
   * 都写在对应 stage 函数里，避免 CLI 和 Engine 两处重复执行 contract。
   *
   * 用户交互通过 UserInteraction 接口注入，stage 内部通过它与用户对话——
   * 方便在测试和自动模式（--skip-confirm / CI）下替换为 stub。
   */
  async run(): Promise<void> {
    const { args, flags } = await this.parse(Run);

    // 恢复模式
    if (flags.resume) {
      return this.resumeTask(flags.resume);
    }

    // 装配 engine（注入所有依赖：adapter / llm / userInteraction / ...）
    const userInteraction = flags['skip-confirm']
      ? new AutoConfirmInteraction()
      : new TerminalInteraction(this);

    const ctx = await this.taskManager.create(args.goal, process.cwd(), {
      templateOverride: flags.template,
      dryRun: flags['dry-run'],
      deepEval: flags['deep-eval'],
    });

    const engine = this.buildWorkflowEngine({
      config: ctx.config,
      userInteraction,
      flags,
    });

    const report = await engine.run(ctx);

    await this.saveReport(ctx, report);
    this.displayResult(report);
  }
}

/**
 * UserInteraction 接口：stage 通过它与用户对话。
 * 默认实现走终端 prompts；--skip-confirm / CI 用 AutoConfirmInteraction。
 * 这样 contract stage 内部直接 `await ui.confirmContract(contract)`，
 * CLI 不再需要关心 contract 的显示和编辑。
 */
export interface UserInteraction {
  confirmContract(contract: Contract): Promise<'accept' | 'edit' | 'reject'>;
  editContract(path: string): Promise<Contract>;
  confirmPlan(plan: string): Promise<boolean>;
  notify(level: 'info' | 'warn' | 'error', msg: string): void;
}
```

### 5.3 harness eval

```typescript
// packages/cli/src/commands/eval.ts

/**
 * harness eval [task-id]
 *
 * 独立重跑验证，不重新生成代码。
 * 用于：
 * - 手动修复后重新验证
 * - 升级检查规则后重新评估
 * - 切换 evidence level 后重新评估
 *
 * 如果不传 task-id，使用最近一个任务。
 *
 * 选项：
 *   --level <1|2|3>    只跑指定 level
 *   --deep-eval        启用 Level 3
 */

export default class Eval extends Command {
  static args = {
    'task-id': Args.string({ description: '任务 ID', required: false }),
  };

  async run(): Promise<void> {
    const { args } = await this.parse(Eval);
    const taskId = args['task-id'] || await this.getLatestTaskId();

    // 加载已有 contract
    const ctx = await this.taskManager.resume(taskId, process.cwd());

    // 重新采集 evidence
    this.log('\n🔍 重新运行验证...');
    const evidence = await this.evidenceCollector.collect(ctx);

    // 重新判断 gate
    const gateDecision = this.commitGate.judge(evidence, ctx.config);

    // 更新 report
    const report = this.generateReport(ctx, evidence, gateDecision);
    await this.saveReport(ctx, report);
    this.displayResult(report);
  }
}
```

### 5.4 harness template promote

```typescript
// packages/cli/src/commands/template/promote.ts

/**
 * harness template promote [task-id]
 *
 * 将已通过 gate 的任务提升为可复用模板。
 *
 * 流程：
 * 1. 读取任务的 contract + report
 * 2. 验证任务已通过 commit gate
 * 3. 从 contract 提取模板字段
 * 4. 让用户命名和确认
 * 5. 写入 .harness/templates/<name>.yaml
 */

export default class Promote extends Command {
  static args = {
    'task-id': Args.string({ description: '任务 ID', required: false }),
  };

  async run(): Promise<void> {
    const { args } = await this.parse(Promote);
    const taskId = args['task-id'] || await this.getLatestTaskId();

    // 加载任务
    const taskDir = path.join(process.cwd(), '.harness/tasks', taskId);
    const contract = await loadYaml<Contract>(path.join(taskDir, 'contract.yaml'));
    const report = await loadJson<Report>(path.join(taskDir, 'report.json'));

    // 验证已通过
    if (!report.commit_ready) {
      this.error('该任务未通过 commit gate，不能提升为模板');
    }

    // 提取模板
    const templateDraft: Template = {
      name: '',  // 用户填写
      description: contract.goal,
      applies_to: this.extractKeywords(contract.goal),
      default_risk_level: contract.risk_level,
      default_required_checks: contract.required_checks,
      workflow_stages: report.stages_completed,
      required_gates: ['contract_gate', 'commit_gate'],
      success_signals: contract.acceptance_criteria.map(c => c.criterion),
      contract_defaults: {
        scope: contract.scope,
        out_of_scope: contract.out_of_scope,
      },
    };

    // 用户命名
    const name = await this.prompt('模板名称:');
    templateDraft.name = name;

    // 展示并确认
    this.displayTemplate(templateDraft);
    const confirmed = await this.confirm('保存模板？(y/n)');
    if (confirmed !== 'y') return;

    // 写入
    const templatePath = path.join(
      process.cwd(), '.harness/templates', `${name}.yaml`,
    );
    await writeYaml(templatePath, templateDraft);
    this.log(`✓ 模板已保存: ${templatePath}`);
  }
}
```

### 5.5 harness list

```typescript
// packages/cli/src/commands/list.ts

/**
 * harness list [--status <status>] [--json]
 *
 * 列出 .harness/tasks/ 下所有任务，按创建时间倒序。
 * 用途：
 * - 排查最近任务的状态（passed / failed / in_progress / aborted）
 * - 配合 `harness eval <task-id>` 手动重跑
 * - --json 输出方便外部工具（CI 面板、脚本）消费
 *
 * 默认输出列：task-id, created_at, template, status, commit_ready, goal(截断)
 */

export default class List extends Command {
  static flags = {
    status: Flags.string({ description: '按状态过滤：passed/failed/in_progress' }),
    json: Flags.boolean({ default: false }),
    limit: Flags.integer({ default: 20 }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(List);
    const tasks = await this.taskManager.listAll(process.cwd(), {
      status: flags.status,
      limit: flags.limit,
    });

    if (flags.json) {
      this.log(JSON.stringify(tasks, null, 2));
      return;
    }

    // 终端表格输出（用 cli-table3 或简易对齐即可）
    this.renderTable(tasks);
  }
}
```

---

## 6. LLM 调用抽象

```typescript
// packages/core/src/llm/client.ts

/**
 * LLM 调用抽象层。
 *
 * 用于：
 * 1. Contract 生成（Planner 角色 = agent 时）
 * 2. Plan 生成
 * 3. Level 2 Playwright 脚本生成
 * 4. Level 3 AI 评估
 *
 * 注意：Execute 阶段不走这个接口，而是走 Adapter。
 * LLM Client 用于 harness 自身的智能化，不用于代码生成。
 */

export interface LLMClient {
  /**
   * 结构化输出：给定 prompt + Zod schema，返回符合 schema 的对象
   */
  generateStructured<T>(options: {
    prompt: string;
    schema: z.ZodSchema<T>;
    systemPrompt?: string;
    temperature?: number;
  }): Promise<T>;

  /**
   * 自由文本输出：用于 plan 生成等场景
   */
  generateText(options: {
    prompt: string;
    systemPrompt?: string;
    temperature?: number;
    maxTokens?: number;
  }): Promise<string>;
}
```

```typescript
// packages/core/src/llm/providers/anthropic.ts

import Anthropic from '@anthropic-ai/sdk';
import { zodToJsonSchema } from 'zod-to-json-schema';

export class AnthropicClient implements LLMClient {
  private client: Anthropic;

  constructor() {
    this.client = new Anthropic();  // 从环境变量读 key
  }

  /**
   * 用 Anthropic 的 tool use 机制强制结构化输出：
   * - 把 Zod schema 通过 `zod-to-json-schema` 转成 JSON Schema，作为 tool 的 input_schema
   * - 通过 tool_choice 强制模型调用该 tool，SDK 返回的 tool_use.input 即结构化对象
   * - 避免从 markdown 代码块里正则提取 JSON/YAML 这种脆弱方案
   * - 失败时（schema 解析异常）重试一次，第二次 prompt 中注入上次错误信息
   */
  async generateStructured<T>(options: {
    prompt: string;
    schema: z.ZodSchema<T>;
    systemPrompt?: string;
    toolName?: string;
    toolDescription?: string;
  }): Promise<T> {
    const toolName = options.toolName ?? 'emit_structured_output';
    const jsonSchema = zodToJsonSchema(options.schema, { target: 'openAi' });

    const callOnce = async (extraHint?: string): Promise<T> => {
      const response = await this.client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: options.systemPrompt || '',
        tools: [{
          name: toolName,
          description: options.toolDescription ?? '以 JSON 结构返回最终结果',
          input_schema: jsonSchema as Anthropic.Tool.InputSchema,
        }],
        tool_choice: { type: 'tool', name: toolName },
        messages: [{
          role: 'user',
          content: extraHint ? `${options.prompt}\n\n上次返回不合法：${extraHint}` : options.prompt,
        }],
      });

      const toolUse = response.content.find(b => b.type === 'tool_use');
      if (!toolUse || toolUse.type !== 'tool_use') {
        throw new Error('模型未按预期调用 tool');
      }
      return options.schema.parse(toolUse.input);
    };

    try {
      return await callOnce();
    } catch (err) {
      return await callOnce(String(err));
    }
  }

  async generateText(options: {
    prompt: string;
    systemPrompt?: string;
    maxTokens?: number;
  }): Promise<string> {
    const response = await this.client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: options.maxTokens || 4096,
      system: options.systemPrompt || '',
      messages: [{ role: 'user', content: options.prompt }],
    });

    return response.content[0].type === 'text'
      ? response.content[0].text
      : '';
  }
}
```

---

## 7. 内置模板示例

```yaml
# packages/core/src/template/builtin/bug-fix.yaml

name: bug-fix
description: 单文件或少文件 bug 修复
applies_to:
  - fix
  - bug
  - 修复
  - 缺陷
  - issue
  - 问题
default_risk_level: low
default_required_checks:
  - build
  - lint
workflow_stages:
  - contract
  - execute
  - verify
  - commit_gate
required_gates:
  - contract_gate
  - commit_gate
success_signals:
  - 缺陷不再复现
  - 现有测试仍然通过
contract_defaults:
  estimated_complexity: simple
```

```yaml
# packages/core/src/template/builtin/feature-cross.yaml

name: feature-cross
description: 跨模块功能开发
applies_to:
  - feature
  - 功能
  - 新增
  - add
default_risk_level: medium
default_required_checks:
  - build
  - lint
  - typecheck
  - test
workflow_stages:
  - contract
  - plan
  - execute
  - verify
  - commit_gate
required_gates:
  - contract_gate
  - commit_gate
success_signals:
  - 功能可用
  - 跨模块集成正常
  - 现有测试通过
contract_defaults:
  estimated_complexity: medium
```

```yaml
# packages/core/src/template/builtin/migration.yaml

name: migration
description: 数据库迁移
applies_to:
  - migration
  - 迁移
  - migrate
  - schema
  - ddl
default_risk_level: high
default_required_checks:
  - build
  - lint
  - test
  - migration_reversible
workflow_stages:
  - contract
  - plan
  - execute
  - verify
  - commit_gate
required_gates:
  - contract_gate
  - commit_gate
success_signals:
  - 迁移可正向执行
  - 迁移可回滚
  - 现有数据不受影响
contract_defaults:
  estimated_complexity: complex
```

---

## 8. 用户交互流程

### 8.1 `harness run` 完整交互示例

```
$ harness run "修复用户登录时 JWT token 过期后没有正确跳转到登录页的问题"

📋 匹配模板: bug-fix
📋 生成 Contract...

┌─────────────────────────────────────────────────┐
│ Contract                                        │
├─────────────────────────────────────────────────┤
│ Goal:    修复 JWT token 过期后未跳转登录页       │
│ Scope:   src/auth/**, src/middleware/auth.ts     │
│ Out:     其他模块、UI 样式                       │
│ Risk:    low                                    │
│ Checks:  build, lint                            │
│                                                 │
│ Acceptance Criteria:                            │
│  ✓ token 过期时自动跳转 /login [playwright]     │
│  ✓ 有效 token 不受影响 [test]                   │
│  ✓ refresh token 逻辑正常 [test]                │
└─────────────────────────────────────────────────┘

确认 Contract？(y/n/e[dit]) y

⏩ Plan 阶段已跳过（bug-fix 模板默认跳过）

🔧 执行中... (adapter: claude-code, timeout: 60min)
   [claude-code] 正在分析代码...
   [claude-code] 修改 src/middleware/auth.ts
   [claude-code] 修改 src/auth/token-check.ts
   [claude-code] 添加测试 src/auth/__tests__/token-expiry.test.ts
   ✓ 执行完成 (耗时 3m22s)

🔍 验证中...
   [Level 1] build .............. ✓
   [Level 1] lint ............... ✓
   [Level 1] scope check ....... ✓ (3 files changed, all in scope)
   [Level 2] playwright ........ ✓ token 过期跳转验证通过
   [Level 2] test .............. ✓ 2 acceptance criteria 通过

🚪 Commit Gate: PASSED ✓

📊 Report 已保存:
   .harness/tasks/20260416-143022-a1b2/report.json
   .harness/tasks/20260416-143022-a1b2/report.html

✓ 任务完成，代码已 commit-ready
```

### 8.2 Gate 失败时的交互

```
🔍 验证中...
   [Level 1] build .............. ✓
   [Level 1] lint ............... ✗ 3 errors
   [Level 1] scope check ....... ⚠ src/utils/format.ts 不在 scope 内

🚪 Commit Gate: FAILED ✗
   - [Level 1] lint: 3 errors found
   - [Scope] 1 个文件超出 scope

选择操作:
  1. 重试 (重新执行，将失败信息反馈给 agent)
  2. 仅重新验证 (手动修复后)
  3. 查看详细报告
  4. 放弃任务

> 1

🔧 重试执行中... (第 1/2 次重试)
   反馈给 agent: lint 错误 + scope 超出提示
   ...
```

---

## 9. 初始化生成的文件

### 9.1 GLOBAL_RULES.md 模板

```markdown
# 全局规则（仓库级 / Repo-Level）

> 本文件属于 Repo Harness（当前仓库的项目级约束），不是用户个人偏好。
> 个人偏好（语气、工具习惯等）请放在 `~/.claude/CLAUDE.md` 等用户级配置；
>   `harness init` 不会读取也不会写入任何用户级文件。
> 跨项目的通用方法论请走 skills 层，本仓库不管理。
>
> 控制在 50 行以内。超出的内容应下沉到 .harness/domains/ 领域文档。

## 依赖方向

<!-- 示例：Types → Config → Service → UI，严禁反向依赖 -->

## 命名规范

<!-- 示例：文件名 kebab-case，组件 PascalCase -->

## 安全红线

<!-- 示例：禁止在前端硬编码 API key -->

## 代码边界

<!-- 示例：业务逻辑不允许出现在 controller 层 -->
```

### 9.2 默认 harness.config.yaml

```yaml
version: "1.0"

roles:
  planner: template
  generator: claude-code
  evaluator: auto-checks

execute:
  adapter: claude-code
  timeout: 3600
  max_retries: 2

context:
  global_rules: .harness/GLOBAL_RULES.md
  domain_dir: .harness/domains/
  max_global_rules_lines: 50

host_integration:
  install_mode: auto
  preferred_hosts:
    - claude-code
  strategy: hook-first
  events:
    session_start: true
    user_prompt_submit: true
    stop: true
    pre_tool_use: false
    post_tool_use: false
  fallback_create_task_without_planner: false
  planner_use_host_plan_mode: true
  planner_model_claude_code: haiku
  planner_model_codex: gpt-5.4-mini
  evaluator_model_claude_code: sonnet
  evaluator_model_codex: gpt-5.4

workflow:
  contract_review: interactive
  plan_stage: auto
  stages:
    - contract
    - plan
    - execute
    - verify
    - commit_gate

evidence:
  level_1: required
  level_2: recommended
  level_3: "off"
  scope_check: strict

contract_gate:
  checks:
    - schema_valid
    - scope_non_empty
    - criteria_verifiable
    - no_vague_terms
    - risk_check_match
  on_fail: ask_user

template_matching:
  strategy: rule_based

report:
  format: both
```

---

## 9.3 角色到模块映射（Planner / Generator / Evaluator）

v2 产品设计中的三个角色是「职责」而非「实例」：同一个 agent 可以同时承担多个角色，
一个角色也可以由多个组件协作完成。技术方案里的映射如下：

| 角色 | 职责 | 对应技术模块 | 由谁驱动 |
|---|---|---|---|
| **Planner** | 把目标拆解为 contract + plan，决定 scope / 验收标准 / 风险等级 | `core/template/matcher.ts`（规则匹配）<br>`core/contract/generator.ts`（填模板或调 LLM）<br>`core/plan/generator.ts`（plan 文本） | `config.roles.planner`：<br>`template`=纯规则填充<br>`agent`=调 LLM 生成<br>`user`=用户手写 `.harness/tasks/<id>/contract.yaml` |
| **Generator** | 写实际代码；harness 不干涉其内部过程，只通过结构化 prompt 下达任务、回收 diff | `core/execute/prompt-assembler.ts`<br>`core/execute/adapter.ts` + `adapters/*`（subprocess 调 claude-code / codex / 自定义命令） | `config.roles.generator` + `config.execute.adapter` 决定具体实例 |
| **Evaluator** | 独立验证产物：跑硬指标 + contract 驱动测试 + 可选 AI 评估 | `core/evidence/collector.ts`<br>`core/evidence/level1/*`（必选硬指标）<br>`core/evidence/level2/*`（contract 驱动）<br>`core/evidence/level3/*`（AI 评估）<br>`core/gate/commit-gate.ts`（最终裁决） | `config.roles.evaluator`：<br>`auto-checks`=只跑 Level 1+2<br>`agent`=叠加 Level 3<br>`user`=人工确认 |

**关键设计约束**：

1. **角色解耦靠 Workflow Engine**：Planner / Generator / Evaluator 不直接互调，
   全部通过 stage 函数 + `TaskContext`（contract、plan、artifacts）交换信息。
2. **Generator 与 Evaluator 隔离**：Evaluator 必须独立于 Generator 的产物跑——
   哪怕同一底层模型，走不同 adapter 实例、不同 prompt，避免"自己判卷"。
3. **Planner 的三种模式互斥**：单个 task 只选一种；`harness run` 启动时由
   `config.roles.planner` 决定进入哪条 stage 实现（rule-based / LLM / 读用户 contract）。

## 9.4 三层上下文模型的技术边界

v2 §5.6–5.10 明确了 **User-Level Global Rules → Skills → Repo Harness** 三层。
harnessly 在技术上严格只管理第三层，对前两层保持透明：

| 层级 | 存放位置 | harnessly 行为 |
|---|---|---|
| User-Level Global Rules | `~/.claude/CLAUDE.md`、`~/.codex/*` 等用户目录 | **完全不读、不写、不感知**。Adapter 走 subprocess，底层 agent 自己按官方约定加载——harness 不做任何中转或注入 |
| Skills | 用户级或团队级 skill 目录 | 同上；harnessly 不搜索、不拷贝 skills 到 `.harness/` |
| Repo Harness | `<repo>/.harness/` | 唯一 source-of-truth：`GLOBAL_RULES.md` / `domains/` / `hosts/` / `config` / `templates` / `tasks/` |
| Repo-Local Host Shell | `<repo>/.claude/*`、`<repo>/.codex/*`、`<repo>/.gemini/*` | 由 `.harness/hosts/*` 生成出来的薄壳；允许覆盖重写，但不承载真实状态 |

**技术上的落地点**：

- **`harness init` 严禁碰用户目录**：可以写 `<repo>/.harness/` 与 repo-local 宿主薄壳，
  但绝不写 `~/.claude`、`~/.codex` 等用户目录；如果检测到用户级配置，只提示
  "检测到用户级配置，harnessly 不会修改它"。
- **repo-local 宿主薄壳只做桥接**：宿主薄壳只负责把 hook / wrapper 调到
  `harness host ...` 子命令，不得在薄壳内保存 task 状态或业务规则。
- **写入边界必须可校验**：`.harness/hosts/*.yaml` 中每个 host 都必须声明
  `write_boundary: repo`；installer 发现 user/both/home 路径直接失败，不做“尽量兼容”。
- **`PromptAssembler` 只拼装仓库级内容**（见 §4.6）：contract + plan +
  `.harness/GLOBAL_RULES.md` + 相关 domain 文档。用户级规则由底层 agent 自己加载，
  不做重复拼装——否则会出现用户偏好被仓库规则污染或互相覆盖。
- **`harness.config.yaml` 不允许引用用户 home 路径**：config loader 校验
  `context.global_rules` / `context.domain_dir` 必须落在 repo 内，避免把仓库行为
  隐式绑定到某台机器。
- **宿主事件默认只开低频三件套**：`SessionStart`、`UserPromptSubmit`、`Stop`
  默认开启；`PreToolUse` / `PostToolUse` 默认关闭，除非后续明确证明收益高于噪音。
- **Skill 层如需协同**：留给后续版本（Phase 3+），接入方式可能是 skill manifest
  声明自己依赖的 harness template，但**skill 内容本身仍然住在用户/团队层，
  harness 只读不写**。

---

## 10. 依赖清单

```json
{
  "dependencies": {
    "@anthropic-ai/sdk": "^0.52.0",
    "@oclif/core": "^4.0.0",
    "@playwright/test": "^1.50.0",
    "execa": "^9.0.0",
    "handlebars": "^4.7.0",
    "minimatch": "^9.0.0",
    "simple-git": "^3.27.0",
    "yaml": "^2.6.0",
    "zod": "^3.24.0",
    "zod-to-json-schema": "^3.23.0"
  },
  "devDependencies": {
    "tsup": "^8.0.0",
    "typescript": "^5.7.0",
    "vitest": "^3.0.0",
    "@types/node": "^22.0.0"
  }
}
```

---

## 11. 实施计划

执行拆解见：[implementation-todolist.md](/Users/lijianfeng/code/pp/agent-harnessly/docs/design/implementation-todolist.md)

### Phase 1: 基础骨架（Week 1-2）

**目标**：能跑通 `harness init`，项目结构和配置系统成立。

| 任务 | 产出 |
|---|---|
| monorepo 搭建 (pnpm workspace + tsup + vitest) | 构建和测试基础 |
| shared 包：全部 Zod schema | contract / report / config / template schema |
| core/config：配置加载与校验 | `loadConfig()` + 默认值合并 |
| core/template：模板注册表 + 内置 8 个模板 | `TemplateRegistry` + YAML 文件 |
| packages/hosts/shared：host manifest + shell writer | `.harness/hosts/*` 与 repo-local 宿主薄壳生成 |
| packages/hosts/claude-code | Claude Code repo-local host shell |
| cli/init 命令 | `.harness/` 目录创建 + 项目类型检测 + Claude Code 宿主清单初始化 |
| cli/list 命令 | 读取 `.harness/tasks/` 输出任务列表（在 Phase 1 低成本交付，便于后续手动排查） |

**验证**：`harness init --host claude-code` 在一个真实项目中跑通，生成正确的目录结构、host manifest 和 Claude Code repo-local 宿主薄壳。

### Phase 2: Contract 闭环（Week 3-4）

**目标**：能跑通 `harness run --dry-run`，contract 生成 + gate + 确认链路打通。

| 任务 | 产出 |
|---|---|
| core/llm：LLM 调用抽象 + Anthropic provider | `LLMClient` 接口 + 实现 |
| core/contract：contract 生成器 | 模板 + LLM 填充 + Zod 校验 |
| core/contract：contract gate | 5 项检查实现 |
| core/plan：plan 生成器 | 简洁步骤列表生成 |
| core/template：模板匹配器 | 规则匹配实现 |
| core/task：最小任务持久化 | `task create/load/save` + active task 索引 + `.harness/tasks/<id>/` 初始化 |
| packages/hosts/claude-code | Claude Code 的 contract command / bridge 介入点 |
| cli/host：session-start / user-prompt-submit（最小集） | 仅支撑 Claude Code 的 task 创建/续接与 contract 介入 |
| cli/run 命令（dry-run 模式） | contract 展示 + 用户确认交互 |

**验证**：Claude Code 宿主入口能先完成 contract generate/review；`harness run "修复登录 bug" --dry-run` 作为手工兜底路径生成合理的 contract.yaml 和 plan.md。

### Phase 3: Execute + Verify 闭环（Week 5-7）

**目标**：让 `Claude Code + Codex + manual/headless` 路径都能跑通完整 `harness run`，从 goal 到 report；Codex 以 command bridge 为主路径，hooks 作为增强能力补充。

| 任务 | 产出 |
|---|---|
| cli/host：install / status / sync | repo-local 宿主薄壳刷新、漂移检查、source-of-truth 校验 |
| core/execute：Adapter 接口 + claude-code adapter | subprocess 调用 |
| core/execute：prompt assembler | 结构化 prompt 组装 |
| core/execute：custom adapter | 用户自定义命令支持 |
| cli/host：completion-gate + lifecycle 补完 | Claude Code 主路径闭环；Codex 提供 command bridge + 可选 hook 增强；为 Gemini 预留语义映射接口 |
| core/evidence/level1：build / lint / typecheck / test check | 4 个硬指标采集 |
| core/evidence/level1：scope check | git diff + scope 匹配 |
| core/gate：commit gate | pass/fail 判定 |
| core/report：report 生成 + HTML 渲染 | JSON + HTML 双格式 |
| core/task：恢复 / 重试 / 状态推进补完 | resume、retryReason、阶段回跳语义 |
| core/workflow：workflow engine | 主流程编排 + 阶段注册 |
| cli/run 命令（完整模式） | 全流程串联 |
| packages/hosts/codex + gemini-cli | Codex 正式 host shell（command bridge 主路径 + 可选 hook wrapper）+ Gemini host shell（`custom commands` + `AfterAgent` 主路径） |

**验证**：在真实项目上通过 Claude Code 宿主路径、Codex command bridge 主路径各跑通一个 bug-fix 和一个 feature-simple 任务；`harness run` 同时作为 manual/headless 路径验证通过；Codex hooks 若可用则补充验证自动上下文注入，但不作为主闭环唯一判据。

### Phase 4: Eval + Template Promote（Week 8-9）

**目标**：`harness eval` 和 `harness template promote` 可用。

| 任务 | 产出 |
|---|---|
| core/evidence/level2：Playwright 脚本生成 + 执行 | contract 驱动验证 |
| cli/eval 命令 | 独立重验证 |
| core/template：promoter | contract → template 提取 |
| cli/template/promote 命令 | 用户交互 + 模板保存 |
| 重试机制 | verify 失败 → 反馈 → 重新 execute |

**验证**：手动修复后 `harness eval` 重新验证通过；`harness template promote` 生成可复用模板。

### Phase 5: 打磨与发布（Week 10）

| 任务 | 产出 |
|---|---|
| 错误处理 + 边界情况 | 超时、agent 崩溃、网络断开 |
| CLI 体验打磨 | 进度条、颜色、错误提示 |
| npm 发布配置 | `@brawnen/harnessly` |
| 基础文档 | README + 快速开始 |
| 在 3-5 个真实项目上做端到端测试 | 验证报告 |

---

## 12. 测试策略

### 12.1 单元测试（Vitest）

| 模块 | 测试重点 |
|---|---|
| contract/schema | Zod schema 校验各种边界输入 |
| contract/gate | 5 项检查的各种通过/失败组合 |
| template/matcher | 关键词匹配准确性 |
| evidence/scope-check | glob 匹配 + allowList 边界 |
| gate/commit-gate | evidence 组合 → pass/fail 判断 |
| task/state | 状态机转换正确性 |
| config/loader | 默认值合并 + 非法配置报错 |

### 12.2 集成测试

| 场景 | 验证内容 |
|---|---|
| init → run → eval 全流程 | 文件生成正确、状态持久化正确 |
| adapter 调用 | mock agent，验证 prompt 组装 + 退出码处理 |
| contract gate 拦截 | 不合格 contract 被正确阻断 |
| commit gate 拦截 | lint 失败时 gate 拒绝 |
| 中断恢复 | 杀掉进程后 resume 从正确位置继续 |

### 12.3 宿主接入验证矩阵

| 宿主路径 | 验证内容 | 第一版地位 |
|---|---|---|
| Claude Code | synthetic hook payload + 真实 repo smoke，覆盖 `SessionStart` / `UserPromptSubmit` / `Stop` | 主支持，必须通过 |
| Codex | command bridge 主路径完整验证：`init -> dry-run -> run -> report`；如运行时允许，再补 `SessionStart / UserPromptSubmit` hook 增强验证 | 主支持，必须通过 |
| Gemini CLI | repo-local custom commands + `AfterAgent` 路径验证；不强求 `UserPromptSubmit` 1:1 映射 | 实验性，不阻塞 V1 |
| manual/headless | `harness run / eval / status` 可独立完成同一条任务链路 | 保底路径，必须通过 |

### 12.4 端到端测试

在真实项目（准备 3 个不同技术栈的测试仓库）上跑完整 `harness run`，验证：

- contract 生成质量
- adapter 调用成功率
- evidence 采集完整性
- gate 判断准确性
- report 内容可读性

---

## 13. 已知限制与后续演进

### 第一版已知限制

| 限制 | 原因 | 后续方向 |
|---|---|---|
| scope 只支持路径 glob | 语义 scope 需要代码理解能力 | Phase 2 引入 AI 辅助 scope 解析 |
| 模板匹配只做关键词 | 语义匹配需要 embedding | Phase 2 可选 semantic 策略 |
| Level 3 evaluator 未精细校准 | 校准是每个项目的事 | Phase 2 提供校准工具 |
| 不支持多阶段长任务的分段 commit | 状态机复杂度 | Phase 2 支持 milestone 拆分 |
| 只有 Anthropic LLM provider | 需要更多用户验证 | Phase 2 加 OpenAI provider |
| Codex hooks 仍属 experimental，且 Windows 暂不支持 | 当前可做实验性接入，但还不满足正式支持门槛 | 先限制在三件套和非 Windows 环境，等待官方能力成熟 |
| Gemini CLI 与 Claude/Codex 的 lifecycle 命名不对齐 | 当前可实验性接入，但 `UserPromptSubmit` 无 1:1 等价点，不能照搬三件套 | 第一版先以 repo-local custom commands + `AfterAgent` 为主路径，后续再收敛统一 lifecycle 抽象 |

### Post-V1 演进方向

- **长任务恢复增强**：milestone 拆分 + 分段 verify
- **评估器校准工具**：`harness calibrate` 命令
- **CI/CD 集成**：GitHub Action 包装
- **官方模型配置推荐**：`harness config apply <model-name>`
- **宿主覆盖增强**：补齐 Codex / Gemini CLI 的宿主模板，并做真实宿主联调验证

### 更后续演进方向

- **团队共享**：模板 / 规则 / 评估规范的 registry
- **运行观测**：任务历史统计 + 趋势
- **Web 面板**：可选本地面板用于 report 查看和任务管理
