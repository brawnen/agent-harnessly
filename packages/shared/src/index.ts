import { ZodError, z } from 'zod';

export const SHARED_PACKAGE_NAME = '@harnessly/shared';
export const HARNESSLY_VERSION = '0.0.0';

export type HostName = 'claude-code' | 'codex' | 'gemini-cli';
export type ProjectType = 'node' | 'go' | 'python' | 'unknown';
export type RequiredCheck = 'build' | 'lint' | 'typecheck' | 'test';
export type TemplateName = 'bug-fix' | 'feature-simple' | 'general-task';
export type RiskLevel = 'low' | 'medium' | 'high';
export type AdapterKind = 'claude-code' | 'codex' | 'custom';
export type FlatYamlValue = string | number | boolean | string[];
export type TaskStatus =
  | 'created'
  | 'contracting'
  | 'planning'
  | 'ready'
  | 'executing'
  | 'verifying'
  | 'passed'
  | 'failed';

/**
 * v3-core 主干工作流的 6 个固定阶段。
 * 与 SPEC §6.1 保持一致，禁止扩展为可编排 DAG。
 */
export type WorkflowStage =
  | 'spec'
  | 'design'
  | 'execute'
  | 'review'
  | 'test'
  | 'commit_gate';

/**
 * stage 标记联合类型。
 * 包含 v3-core 主阶段（WorkflowStage）+ 三个非主阶段标记：
 * - 'created'：任务初始态，未进入任何主阶段
 * - 'failed'：失败终态
 * - 'retry'：重试动作（瞬态）
 */
export type StageMarker = WorkflowStage | 'created' | 'failed' | 'retry';

export interface PackageInfo {
  name: string;
  version: string;
}

export interface HostLifecycleCommands {
  sessionStart: string;
  userPromptSubmit: string;
  completionGate: string;
}

export interface HostManifest {
  host: HostName;
  version: string;
  enabled: boolean;
  repoLocalPaths: string[];
  sessionStartCommand: string;
  userPromptSubmitCommand: string;
  completionGateCommand: string;
}

export interface HarnessConfig {
  version: number;
  projectType: ProjectType;
  requiredChecks: RequiredCheck[];
  defaultHost: HostName;
  enabledHosts: HostName[];
  installRepoLocalShells: boolean;
  sourceOfTruthDir: string;
  fallbackCreateTaskWithoutPlanner: boolean;
  codexUserPromptSubmitHookEnabled: boolean;
  hostSubagents: HostSubagentConfig;
  adapterKind: AdapterKind;
  adapterCommand: string;
}

export interface HostSubagentConfig {
  planner: {
    useHostPlanMode: boolean;
    models: Partial<Record<HostName, string>>;
  };
  evaluator: {
    models: Partial<Record<HostName, string>>;
  };
}

export interface Contract {
  goal: string;
  templateName: TemplateName;
  riskLevel: RiskLevel;
  scopeInclude: string[];
  scopeExclude: string[];
  acceptanceCriteria: string[];
  outOfScope: string[];
}

export interface ContractGateResult {
  passed: boolean;
  failures: string[];
}

export interface TaskState {
  taskId: string;
  status: TaskStatus;
  currentStage: StageMarker;
  createdAt: string;
  updatedAt: string;
  completedStages: StageMarker[];
  retryCount: number;
  lastFailureReason?: string;
  lastFailureStage?: StageMarker;
}

export interface TaskContext {
  taskId: string;
  goal: string;
  workDir: string;
  taskDir: string;
  config: HarnessConfig;
  state: TaskState;
  contract?: Contract;
  plan?: string;
  /** 上次重试 / 失败的反馈摘要（单次执行视角） */
  feedback?: string;
  /**
   * 跨任务沉淀的 feedback pool 摘录（多任务视角）。
   * 由 workflow / CLI 在执行前加载注入；assemblePrompt 是纯函数，自身不 I/O。
   */
  feedbackPool?: FeedbackEntry[];
}

export interface TaskSummary {
  taskId: string;
  goal: string;
  status: TaskStatus;
  currentStage: StageMarker;
  retryCount: number;
  lastFailureStage?: StageMarker;
  updatedAt: string;
}

export interface AdapterInput {
  taskId: string;
  workDir: string;
  prompt: string;
  promptFile: string;
  command?: string;
}

export interface AdapterOutput {
  kind: AdapterKind;
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
}

export type CheckStatus = 'passed' | 'failed' | 'skipped';

export interface EvidenceCheckResult {
  name: string;
  status: CheckStatus;
  command: string;
  detail: string;
}

export interface EvidenceResult {
  checks: EvidenceCheckResult[];
  changedFiles: string[];
}

/**
 * commit_gate 三态决策。
 * - 'pass': 所有硬性 gate 通过，可以 commit
 * - 'block': 存在硬性失败，禁止 commit（必须修复后重跑）
 * - 'warn': 硬性 gate 全过但有软性告警，PM 须确认后才能 commit
 */
export type CommitDecision = 'pass' | 'block' | 'warn';

export interface CommitGateResult {
  /**
   * 兼容字段：true 等价于 decision==='pass'，便于现有 commitReady 判定。
   */
  passed: boolean;
  /**
   * 三态决策结果。新字段，决策真实出口。
   */
  decision: CommitDecision;
  /**
   * 硬性失败原因，命中即 block。
   */
  failures: string[];
  /**
   * 软性告警原因，命中即降为 warn（如果没有 failures 的话）。
   */
  warnings: string[];
  /**
   * baseline 中已经失败的 check 名称（任务无关旧失败）。
   * 这些 check 不会进入 failures，避免误拦"任务引入回归"的判定。
   * Phase 3.3 引入。
   */
  preExistingFailures: string[];
}

/**
 * Evidence baseline：在任务开始前采集的"现状失败基线"，
 * 用于 commit gate 区分"任务引入的新回归"和"任务无关的旧问题"。
 *
 * v3-core §6.5 baseline-diff evidence 实施。
 *
 * 落盘位置：.harness/evidence-baseline.json（全局；多个 task 共享）
 */
export interface EvidenceBaseline {
  capturedAt: string;
  /** baseline 采集时已经失败的 check 名字。简化设计：不存 detail，避免漂移。 */
  failedCheckNames: string[];
}

export interface TaskReport {
  taskId: string;
  goal: string;
  adapter: AdapterOutput;
  evidence: EvidenceResult;
  commitGate: CommitGateResult;
  commitReady: boolean;
  summary: string;
  generatedAt: string;
}

export interface TemplateDraft {
  name: string;
  description: string;
  sourceTaskId: string;
  appliesTo: string[];
  templateName: TemplateName;
  riskLevel: RiskLevel;
  requiredChecks: RequiredCheck[];
  scopeInclude: string[];
  outOfScope: string[];
  acceptanceCriteria: string[];
}

/**
 * Feedback Pool 单条记录：任务完成后落盘的"经验沉淀"。
 *
 * v3-core §22 Knowledge Asset Promotion 的轻量补集：
 * - feedback-pool 是机器消费的简结构（每行一个 JSON），由 TaskManager 自动追加
 * - docs/architecture/ 是人消费的长文档，由 `harness archive` 显式晋升（Phase 3.2 落地）
 *
 * 落盘位置：.harness/feedback-pool.jsonl（append-only）
 */
export interface FeedbackEntry {
  taskId: string;
  goal: string;
  /** commit_gate 三态决策结果 */
  decision: CommitDecision;
  /** 任务完成时间（ISO 8601） */
  completedAt: string;
  /** 已完成的阶段列表，便于诊断"哪一步走完了" */
  completedStages: StageMarker[];
  /** 累计重试次数 */
  retryCount: number;
  /** 任务模板（若已分类） */
  template?: TemplateName;
  /** 风险等级（若已评估） */
  riskLevel?: RiskLevel;
  /** 改动文件数量（不存路径，避免敏感泄漏与体积膨胀） */
  changedFilesCount: number;
  /** 上次失败原因（仅 decision !== 'pass' 时有意义） */
  failureReason?: string;
  /** 上次失败的 stage（仅 decision !== 'pass' 时有意义） */
  failureStage?: StageMarker;
}

/**
 * v3-core SPEC §4 五角色 sub-agent，每个角色对应一个主阶段。
 * - requirement → spec
 * - designer    → design
 * - developer   → execute（headless 模式下专用，主路径下由主 agent 担任）
 * - reviewer    → review
 * - tester      → test
 */
export type AgentRole = 'requirement' | 'designer' | 'developer' | 'reviewer' | 'tester';

/**
 * 单个 sub-agent 的可序列化定义，落盘格式为 `.harness/agents/<role>.yaml`。
 *
 * prompt 字段在磁盘上落在并行的 `<role>.prompt.md` 文件里，便于用户用编辑器
 * 直接维护多行内容；运行时由 core/agent.ts 读两个文件并组装成完整 manifest。
 */
export interface AgentManifest {
  role: AgentRole;
  /** 在 host 渲染时用作 sub-agent 的 display name */
  displayName: string;
  /** 一行的角色简介，用于 host sub-agent description 字段 */
  description: string;
  /** 该 agent 主要服务的 v3-core 阶段 */
  stage: WorkflowStage;
  /** 是否启用；false 则 host install 时不渲染对应文件 */
  enabled: boolean;
  /** 各 host 上推荐的模型。缺省值由 host 渲染层兜底 */
  models: Partial<Record<HostName, string>>;
  /** 工具白名单，host 渲染时填入 sub-agent frontmatter */
  toolWhitelist: string[];
  /** sub-agent prompt 正文，加载时从 <role>.prompt.md 注入 */
  prompt: string;
}

export const packageInfo: PackageInfo = {
  name: SHARED_PACKAGE_NAME,
  version: HARNESSLY_VERSION,
};

export const hostNameSchema = z.enum(['claude-code', 'codex', 'gemini-cli']);
export const projectTypeSchema = z.enum(['node', 'go', 'python', 'unknown']);
export const requiredCheckSchema = z.enum(['build', 'lint', 'typecheck', 'test']);
export const templateNameSchema = z.enum(['bug-fix', 'feature-simple', 'general-task']);
export const riskLevelSchema = z.enum(['low', 'medium', 'high']);
export const adapterKindSchema = z.enum(['claude-code', 'codex', 'custom']);
export const hostSubagentConfigSchema: z.ZodType<HostSubagentConfig> = z.object({
  planner: z.object({
    useHostPlanMode: z.boolean(),
    models: z.object({
      'claude-code': z.string().min(1).optional(),
      codex: z.string().min(1).optional(),
      'gemini-cli': z.string().min(1).optional(),
    }),
  }),
  evaluator: z.object({
    models: z.object({
      'claude-code': z.string().min(1).optional(),
      codex: z.string().min(1).optional(),
      'gemini-cli': z.string().min(1).optional(),
    }),
  }),
});
export const taskStatusSchema = z.enum([
  'created',
  'contracting',
  'planning',
  'ready',
  'executing',
  'verifying',
  'passed',
  'failed',
]);
export const workflowStageSchema = z.enum([
  'spec',
  'design',
  'execute',
  'review',
  'test',
  'commit_gate',
]);
export const stageMarkerSchema = z.union([
  workflowStageSchema,
  z.literal('created'),
  z.literal('failed'),
  z.literal('retry'),
]);
export const checkStatusSchema = z.enum(['passed', 'failed', 'skipped']);

export const harnessConfigSchema: z.ZodType<HarnessConfig> = z.object({
  version: z.number().int().nonnegative(),
  projectType: projectTypeSchema,
  requiredChecks: z.array(requiredCheckSchema),
  defaultHost: hostNameSchema,
  enabledHosts: z.array(hostNameSchema),
  installRepoLocalShells: z.boolean(),
  sourceOfTruthDir: z.string().min(1),
  fallbackCreateTaskWithoutPlanner: z.boolean(),
  codexUserPromptSubmitHookEnabled: z.boolean(),
  hostSubagents: hostSubagentConfigSchema,
  adapterKind: adapterKindSchema,
  adapterCommand: z.string(),
});

export const contractSchema: z.ZodType<Contract> = z.object({
  goal: z.string().min(1),
  templateName: templateNameSchema,
  riskLevel: riskLevelSchema,
  scopeInclude: z.array(z.string()),
  scopeExclude: z.array(z.string()),
  acceptanceCriteria: z.array(z.string()),
  outOfScope: z.array(z.string()),
});

export const adapterOutputSchema: z.ZodType<AdapterOutput> = z.object({
  kind: adapterKindSchema,
  command: z.string().min(1),
  exitCode: z.number().int(),
  stdout: z.string(),
  stderr: z.string(),
});

export const evidenceCheckResultSchema: z.ZodType<EvidenceCheckResult> = z.object({
  name: z.string().min(1),
  status: checkStatusSchema,
  command: z.string(),
  detail: z.string(),
});

export const evidenceResultSchema: z.ZodType<EvidenceResult> = z.object({
  checks: z.array(evidenceCheckResultSchema),
  changedFiles: z.array(z.string()),
});

export const commitDecisionSchema = z.enum(['pass', 'block', 'warn']);

export const commitGateResultSchema: z.ZodType<CommitGateResult> = z.object({
  passed: z.boolean(),
  decision: commitDecisionSchema,
  failures: z.array(z.string()),
  warnings: z.array(z.string()),
  preExistingFailures: z.array(z.string()),
});

export const evidenceBaselineSchema: z.ZodType<EvidenceBaseline> = z.object({
  capturedAt: z.string().min(1),
  failedCheckNames: z.array(z.string()),
});

export const taskReportSchema: z.ZodType<TaskReport> = z.object({
  taskId: z.string().min(1),
  goal: z.string().min(1),
  adapter: adapterOutputSchema,
  evidence: evidenceResultSchema,
  commitGate: commitGateResultSchema,
  commitReady: z.boolean(),
  summary: z.string().min(1),
  generatedAt: z.string().min(1),
});

export const feedbackEntrySchema: z.ZodType<FeedbackEntry> = z.object({
  taskId: z.string().min(1),
  goal: z.string().min(1),
  decision: commitDecisionSchema,
  completedAt: z.string().min(1),
  completedStages: z.array(stageMarkerSchema),
  retryCount: z.number().int().nonnegative(),
  template: templateNameSchema.optional(),
  riskLevel: riskLevelSchema.optional(),
  changedFilesCount: z.number().int().nonnegative(),
  failureReason: z.string().optional(),
  failureStage: stageMarkerSchema.optional(),
});

export const agentRoleSchema = z.enum([
  'requirement',
  'designer',
  'developer',
  'reviewer',
  'tester',
]);

export const agentManifestSchema: z.ZodType<AgentManifest> = z.object({
  role: agentRoleSchema,
  displayName: z.string().min(1),
  description: z.string().min(1),
  stage: workflowStageSchema,
  enabled: z.boolean(),
  models: z.object({
    'claude-code': z.string().min(1).optional(),
    codex: z.string().min(1).optional(),
    'gemini-cli': z.string().min(1).optional(),
  }),
  toolWhitelist: z.array(z.string()),
  prompt: z.string(),
});

export const templateDraftSchema: z.ZodType<TemplateDraft> = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  sourceTaskId: z.string().min(1),
  appliesTo: z.array(z.string()),
  templateName: templateNameSchema,
  riskLevel: riskLevelSchema,
  requiredChecks: z.array(requiredCheckSchema),
  scopeInclude: z.array(z.string()),
  outOfScope: z.array(z.string()),
  acceptanceCriteria: z.array(z.string()),
});

function formatSchemaError(error: ZodError): string {
  return error.issues
    .map((issue: z.ZodIssue) => `${issue.path.length > 0 ? issue.path.join('.') : 'root'}: ${issue.message}`)
    .join('; ');
}

function parseWithSchema<T>(schema: z.ZodType<T>, payload: unknown, label: string): T {
  try {
    return schema.parse(payload);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new Error(`${label} 校验失败: ${formatSchemaError(error)}`);
    }

    throw error;
  }
}

export function serializeFlatYaml(data: Record<string, FlatYamlValue>): string {
  const lines = Object.entries(data).map(([key, value]) => {
    if (Array.isArray(value)) {
      return `${key}: ${value.join(',')}`;
    }

    return `${key}: ${String(value)}`;
  });

  return `${lines.join('\n')}\n`;
}

export function parseFlatYaml(text: string): Record<string, string> {
  const result: Record<string, string> = {};
  let currentKey: string | null = null;
  const lines = text.split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    // YAML 列表项："- item" 或 "  - item"
    if (line.startsWith('- ') && currentKey) {
      const item = line.slice(2).trim();
      const existing = result[currentKey];
      result[currentKey] = existing ? `${existing},${item}` : item;
      continue;
    }

    const separatorIndex = line.indexOf(':');
    if (separatorIndex === -1) {
      continue;
    }

    currentKey = line.slice(0, separatorIndex).trim();
    result[currentKey] = line.slice(separatorIndex + 1).trim();
  }

  return result;
}

export function parseBoolean(value: string | undefined, defaultValue = false): boolean {
  if (value === undefined) {
    return defaultValue;
  }

  return value === 'true';
}

export function parseStringList(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  const trimmed = value.trim();
  if (!trimmed || trimmed === '[]') {
    return [];
  }

  return trimmed
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function validateHarnessConfig(config: HarnessConfig): HarnessConfig {
  return parseWithSchema(harnessConfigSchema, config, 'harness config');
}

export function serializeHarnessConfig(config: HarnessConfig): string {
  const validated = validateHarnessConfig(config);

  return serializeFlatYaml({
    version: validated.version,
    project_type: validated.projectType,
    required_checks: validated.requiredChecks,
    default_host: validated.defaultHost,
    enabled_hosts: validated.enabledHosts,
    install_repo_local_shells: validated.installRepoLocalShells,
    source_of_truth_dir: validated.sourceOfTruthDir,
    fallback_create_task_without_planner: validated.fallbackCreateTaskWithoutPlanner,
    codex_user_prompt_submit_hook_enabled: validated.codexUserPromptSubmitHookEnabled,
    planner_use_host_plan_mode: validated.hostSubagents.planner.useHostPlanMode,
    planner_model_claude_code: validated.hostSubagents.planner.models['claude-code'] ?? '',
    planner_model_codex: validated.hostSubagents.planner.models.codex ?? '',
    planner_model_gemini_cli: validated.hostSubagents.planner.models['gemini-cli'] ?? '',
    evaluator_model_claude_code: validated.hostSubagents.evaluator.models['claude-code'] ?? '',
    evaluator_model_codex: validated.hostSubagents.evaluator.models.codex ?? '',
    evaluator_model_gemini_cli: validated.hostSubagents.evaluator.models['gemini-cli'] ?? '',
    adapter_kind: validated.adapterKind,
    adapter_command: validated.adapterCommand,
  });
}

export function parseHarnessConfig(text: string): HarnessConfig {
  const raw = parseFlatYaml(text);

  return parseWithSchema(
    harnessConfigSchema,
    {
      version: Number(raw.version ?? '1'),
      projectType: raw.project_type ?? 'unknown',
      requiredChecks: parseStringList(raw.required_checks),
      defaultHost: raw.default_host ?? 'claude-code',
      enabledHosts: parseStringList(raw.enabled_hosts),
      installRepoLocalShells: parseBoolean(raw.install_repo_local_shells, true),
      sourceOfTruthDir: raw.source_of_truth_dir ?? '.harness/hosts',
      fallbackCreateTaskWithoutPlanner: parseBoolean(raw.fallback_create_task_without_planner, false),
      codexUserPromptSubmitHookEnabled: parseBoolean(
        raw.codex_user_prompt_submit_hook_enabled,
        true,
      ),
      hostSubagents: {
        planner: {
          useHostPlanMode: parseBoolean(raw.planner_use_host_plan_mode, true),
          models: {
            'claude-code': raw.planner_model_claude_code || 'haiku',
            codex: raw.planner_model_codex || 'gpt-5.4-mini',
            'gemini-cli': raw.planner_model_gemini_cli || 'gemini-flash',
          },
        },
        evaluator: {
          models: {
            'claude-code': raw.evaluator_model_claude_code || 'sonnet',
            codex: raw.evaluator_model_codex || 'gpt-5.4',
            'gemini-cli': raw.evaluator_model_gemini_cli || 'gemini-pro',
          },
        },
      },
      adapterKind: raw.adapter_kind ?? 'claude-code',
      adapterCommand: raw.adapter_command ?? '',
    },
    'harness config',
  );
}

export function validateContract(contract: Contract): Contract {
  return parseWithSchema(contractSchema, contract, 'contract');
}

export function serializeContract(contract: Contract): string {
  const validated = validateContract(contract);

  return serializeFlatYaml({
    goal: validated.goal,
    template_name: validated.templateName,
    risk_level: validated.riskLevel,
    scope_include: validated.scopeInclude,
    scope_exclude: validated.scopeExclude,
    acceptance_criteria: validated.acceptanceCriteria,
    out_of_scope: validated.outOfScope,
  });
}

export function parseContract(text: string): Contract {
  const raw = parseFlatYaml(text);

  return parseWithSchema(
    contractSchema,
    {
      goal: raw.goal ?? '',
      templateName: raw.template_name ?? 'general-task',
      riskLevel: raw.risk_level ?? 'medium',
      scopeInclude: parseStringList(raw.scope_include),
      scopeExclude: parseStringList(raw.scope_exclude),
      acceptanceCriteria: parseStringList(raw.acceptance_criteria),
      outOfScope: parseStringList(raw.out_of_scope),
    },
    'contract',
  );
}

export function validateTaskReport(report: TaskReport): TaskReport {
  return parseWithSchema(taskReportSchema, report, 'task report');
}

export function serializeTaskReport(report: TaskReport): string {
  return `${JSON.stringify(validateTaskReport(report), null, 2)}\n`;
}

export function parseTaskReport(text: string): TaskReport {
  return parseWithSchema(taskReportSchema, JSON.parse(text) as unknown, 'task report');
}

/**
 * AgentManifest 的磁盘存放采用「YAML 元数据 + 并行 prompt.md」双文件方案：
 * - `<role>.yaml` 由 serializeAgentManifestYaml / parseAgentManifestYaml 处理
 * - `<role>.prompt.md` 由 core/agent.ts 直接读写，不经 schema
 *
 * codec 故意只覆盖元数据；prompt 字段在序列化时被丢弃，反序列化时填空串，
 * 由调用方负责加载 prompt.md 后回填。
 */
export function serializeAgentManifestYaml(manifest: AgentManifest): string {
  const validated = parseWithSchema(agentManifestSchema, manifest, 'agent manifest');

  return serializeFlatYaml({
    role: validated.role,
    display_name: validated.displayName,
    description: validated.description,
    stage: validated.stage,
    enabled: validated.enabled,
    model_claude_code: validated.models['claude-code'] ?? '',
    model_codex: validated.models.codex ?? '',
    model_gemini_cli: validated.models['gemini-cli'] ?? '',
    tool_whitelist: validated.toolWhitelist,
  });
}

export function parseAgentManifestYaml(text: string): AgentManifest {
  const raw = parseFlatYaml(text);

  const models: Partial<Record<HostName, string>> = {};
  if (raw.model_claude_code) {
    models['claude-code'] = raw.model_claude_code;
  }
  if (raw.model_codex) {
    models.codex = raw.model_codex;
  }
  if (raw.model_gemini_cli) {
    models['gemini-cli'] = raw.model_gemini_cli;
  }

  return parseWithSchema(
    agentManifestSchema,
    {
      role: raw.role ?? '',
      displayName: raw.display_name ?? '',
      description: raw.description ?? '',
      stage: raw.stage ?? '',
      enabled: parseBoolean(raw.enabled, true),
      models,
      toolWhitelist: parseStringList(raw.tool_whitelist),
      prompt: '',
    },
    'agent manifest',
  );
}

export function validateTemplateDraft(template: TemplateDraft): TemplateDraft {
  return parseWithSchema(templateDraftSchema, template, 'template draft');
}

export function serializeTemplateDraft(template: TemplateDraft): string {
  const validated = validateTemplateDraft(template);

  return serializeFlatYaml({
    name: validated.name,
    description: validated.description,
    source_task_id: validated.sourceTaskId,
    applies_to: validated.appliesTo,
    template_name: validated.templateName,
    risk_level: validated.riskLevel,
    required_checks: validated.requiredChecks,
    scope_include: validated.scopeInclude,
    out_of_scope: validated.outOfScope,
    acceptance_criteria: validated.acceptanceCriteria,
  });
}

export function parseTemplateDraft(text: string): TemplateDraft {
  const raw = parseFlatYaml(text);

  return parseWithSchema(
    templateDraftSchema,
    {
      name: raw.name ?? '',
      description: raw.description ?? '',
      sourceTaskId: raw.source_task_id ?? '',
      appliesTo: parseStringList(raw.applies_to),
      templateName: raw.template_name ?? 'general-task',
      riskLevel: raw.risk_level ?? 'medium',
      requiredChecks: parseStringList(raw.required_checks),
      scopeInclude: parseStringList(raw.scope_include),
      outOfScope: parseStringList(raw.out_of_scope),
      acceptanceCriteria: parseStringList(raw.acceptance_criteria),
    },
    'template draft',
  );
}
