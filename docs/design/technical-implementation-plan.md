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
| 包管理 | pnpm + monorepo (pnpm workspace) | 核心 CLI 与 adapter / template 包解耦 |
| Schema 校验 | Zod | 运行时校验 + 类型推导一体，contract/report/config 全部用 Zod 定义 |
| YAML 处理 | yaml (npm: yaml) | 读写 contract.yaml / harness.config.yaml |
| Git 操作 | simple-git | diff、status、commit 操作 |
| 模板引擎 | Handlebars | prompt 组装、plan 模板渲染 |
| 报告生成 | 自研 JSON → HTML（轻量模板） | report.json 原始数据 + 可选 HTML 可视化 |
| Playwright | @playwright/test | Level 2 evidence 的 contract 驱动验证 |
| 测试 | Vitest | 快、ESM 原生、兼容 Jest API |
| 构建 | tsup | 零配置打包，支持 ESM + CJS |
| 分发 | npm publish + 可选 pkg 打包单二进制 | `npm i -g @harnessly/cli` 或下载二进制 |

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
│   │   │   │   └── template/
│   │   │   │       └── promote.ts    # harness template promote [task-id]
│   │   │   ├── index.ts
│   │   │   └── hooks/                # oclif 生命周期钩子
│   │   ├── bin/
│   │   │   └── run.ts
│   │   ├── package.json
│   │   └── tsconfig.json
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
│   │   │   │   ├── schema.ts         # Zod schema 定义
│   │   │   │   └── types.ts
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
│   │   │   │   └── schema.ts
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
│   │   │   │   ├── loader.ts
│   │   │   │   ├── schema.ts         # harness.config.yaml 的 Zod schema
│   │   │   │   └── defaults.ts
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

const ScopeViolation = z.object({
  file: z.string(),
  reason: z.string(),
});

export const ReportSchema = z.object({
  version: z.literal('1.0'),
  task_id: z.string(),
  workflow_template: z.string(),
  stages_completed: z.array(z.string()),

  // Evidence Level 1
  checks_result: z.array(CheckResult),
  scope_violations: z.array(ScopeViolation),

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
  status: 'completed' | 'failed' | 'skipped';
  artifacts: Record<string, string>;    // 产出文件路径
  error?: string;
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
    const startIndex = resumeFrom
      ? stageNames.indexOf(resumeFrom)
      : 0;

    for (let i = startIndex; i < stageNames.length; i++) {
      const name = stageNames[i];
      const stageFn = this.stages.get(name);

      if (!stageFn) throw new Error(`未注册的 stage: ${name}`);

      // 执行 stage
      const result = await stageFn(ctx);
      ctx.stageResults.push(result);

      // 持久化状态（支持中断恢复）
      await this.persistState(ctx);

      // stage 失败则中断
      if (result.status === 'failed') {
        return this.generateReport(ctx, 'failed');
      }
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

### 4.4 Adapter 接口与实现

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
  timeout: number;        // 超时（毫秒）
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
        timeout: input.timeout,
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
      timeout: input.timeout,
      reject: false,
    });

    return { ... };
  }
}
```

### 4.5 Prompt Assembler

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

### 4.6 Evidence Collector

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
      scopeViolations: [],
    };

    // Level 1: 强制执行
    for (const check of this.level1Checks) {
      result.level1.push(await check.run(ctx));
    }

    // Scope 检查（Level 1 的一部分，但单独记录）
    result.scopeViolations = await this.checkScope(ctx);

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

  private async checkScope(ctx: TaskContext): Promise<ScopeViolation[]> {
    const git = simpleGit(ctx.workDir);
    const diff = await git.diffSummary();
    const changedFiles = diff.files.map(f => f.file);
    const scopePatterns = ctx.contract!.scope;

    const violations: ScopeViolation[] = [];
    for (const file of changedFiles) {
      if (!this.matchesScope(file, scopePatterns)) {
        violations.push({
          file,
          reason: `文件不在 contract.scope 范围内`,
        });
      }
    }
    return violations;
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

    // Level 1 必须全部通过
    for (const check of evidence.level1) {
      if (!check.passed) {
        failures.push(`[Level 1] ${check.name}: ${check.output}`);
      }
    }

    // Scope 检查
    if (config.evidence.scope_check === 'strict'
        && evidence.scopeViolations.length > 0) {
      failures.push(
        `[Scope] ${evidence.scopeViolations.length} 个文件超出 scope`,
      );
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

    return {
      passed: failures.length === 0,
      commitReady: failures.length === 0,
      failures,
      warnings: evidence.scopeViolations.length > 0
          && config.evidence.scope_check === 'warn'
        ? [`${evidence.scopeViolations.length} 个文件超出 scope（仅警告）`]
        : [],
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
 *   ├── templates/              # 空目录（用户自定义模板放这里）
 *   ├── tasks/                  # 空目录
 *   └── harness.config.yaml     # 默认配置
 *
 * 行为：
 * - 如果 .harness/ 已存在，提示用户是否覆盖配置文件
 * - 自动检测项目类型（package.json → Node，go.mod → Go 等）
 *   根据检测结果预填 required_checks 默认值
 * - 不修改 .gitignore（所有 harness 工件都应纳入版本控制）
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

    this.log('✓ .harness/ 目录已创建');
    this.log('  编辑 .harness/GLOBAL_RULES.md 添加项目全局规则');
    this.log('  编辑 .harness/harness.config.yaml 调整配置');
  }
}
```

### 5.2 harness run

```typescript
// packages/cli/src/commands/run.ts

/**
 * harness run "<goal>"
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

  async run(): Promise<void> {
    const { args, flags } = await this.parse(Run);

    // 恢复模式
    if (flags.resume) {
      return this.resumeTask(flags.resume);
    }

    // 创建任务
    const ctx = await this.taskManager.create(args.goal, process.cwd());

    // Contract 阶段
    this.log('\n📋 生成 Contract...');
    const contract = await this.contractGenerator.generate(args.goal, ctx.config);

    // 用户确认
    if (!flags['skip-confirm']
        && ctx.config.workflow.contract_review === 'interactive') {
      this.displayContract(contract);
      const confirmed = await this.confirm('确认 Contract？(y/n/e[dit])');
      if (confirmed === 'e') {
        // 打开编辑器让用户修改 contract.yaml
        await this.editContract(ctx.taskDir);
      } else if (confirmed !== 'y') {
        this.log('任务已取消');
        return;
      }
    }
    ctx.contract = contract;
    await this.saveContract(ctx);

    if (flags['dry-run']) {
      this.log('\n✓ Dry run 完成，contract 和 plan 已生成');
      return;
    }

    // 运行 workflow
    const engine = this.buildWorkflowEngine(ctx.config, flags);
    const report = await engine.run(ctx);

    // 输出结果
    await this.saveReport(ctx, report);
    this.displayResult(report);
  }
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

export class AnthropicClient implements LLMClient {
  private client: Anthropic;

  constructor() {
    this.client = new Anthropic();  // 从环境变量读 key
  }

  async generateStructured<T>(options: {
    prompt: string;
    schema: z.ZodSchema<T>;
    systemPrompt?: string;
  }): Promise<T> {
    const response = await this.client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: options.systemPrompt || '',
      messages: [{ role: 'user', content: options.prompt }],
    });

    const text = response.content[0].type === 'text'
      ? response.content[0].text
      : '';

    // 从 markdown code block 中提取 JSON/YAML
    const parsed = this.extractStructured(text);
    return options.schema.parse(parsed);
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
# 全局规则

> 此文件定义项目级全局约束，始终注入给 agent。
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
    "zod": "^3.24.0"
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

### Phase 1: 基础骨架（Week 1-2）

**目标**：能跑通 `harness init`，项目结构和配置系统成立。

| 任务 | 产出 |
|---|---|
| monorepo 搭建 (pnpm workspace + tsup + vitest) | 构建和测试基础 |
| shared 包：全部 Zod schema | contract / report / config / template schema |
| core/config：配置加载与校验 | `loadConfig()` + 默认值合并 |
| core/template：模板注册表 + 内置 8 个模板 | `TemplateRegistry` + YAML 文件 |
| cli/init 命令 | `.harness/` 目录创建 + 项目类型检测 |

**验证**：`harness init` 在一个真实项目中跑通，生成正确的目录结构和配置文件。

### Phase 2: Contract 闭环（Week 3-4）

**目标**：能跑通 `harness run --dry-run`，contract 生成 + gate + 确认链路打通。

| 任务 | 产出 |
|---|---|
| core/llm：LLM 调用抽象 + Anthropic provider | `LLMClient` 接口 + 实现 |
| core/contract：contract 生成器 | 模板 + LLM 填充 + Zod 校验 |
| core/contract：contract gate | 5 项检查实现 |
| core/plan：plan 生成器 | 简洁步骤列表生成 |
| core/template：模板匹配器 | 规则匹配实现 |
| cli/run 命令（dry-run 模式） | contract 展示 + 用户确认交互 |

**验证**：`harness run "修复登录 bug" --dry-run` 生成合理的 contract.yaml 和 plan.md。

### Phase 3: Execute + Verify 闭环（Week 5-7）

**目标**：`harness run` 完整流程跑通，从 goal 到 report。

| 任务 | 产出 |
|---|---|
| core/execute：Adapter 接口 + claude-code adapter | subprocess 调用 |
| core/execute：prompt assembler | 结构化 prompt 组装 |
| core/execute：custom adapter | 用户自定义命令支持 |
| core/evidence/level1：build / lint / typecheck / test check | 4 个硬指标采集 |
| core/evidence/level1：scope check | git diff + scope 匹配 |
| core/gate：commit gate | pass/fail 判定 |
| core/report：report 生成 + HTML 渲染 | JSON + HTML 双格式 |
| core/task：任务管理 + 状态机 + 持久化 | 创建 / 恢复 / 状态转换 |
| core/workflow：workflow engine | 主流程编排 + 阶段注册 |
| cli/run 命令（完整模式） | 全流程串联 |

**验证**：在真实项目上 `harness run` 跑通一个 bug-fix 和一个 feature-simple 任务。

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
| npm 发布配置 | `@harnessly/cli` |
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

### 12.3 端到端测试

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

### Phase 2 演进方向

- **长任务恢复增强**：milestone 拆分 + 分段 verify
- **评估器校准工具**：`harness calibrate` 命令
- **CI/CD 集成**：GitHub Action 包装
- **官方模型配置推荐**：`harness config apply <model-name>`

### Phase 3 演进方向

- **团队共享**：模板 / 规则 / 评估规范的 registry
- **运行观测**：任务历史统计 + 趋势
- **Web 面板**：可选本地面板用于 report 查看和任务管理
