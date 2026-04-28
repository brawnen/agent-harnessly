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
  currentStage: string;
  createdAt: string;
  updatedAt: string;
  completedStages: string[];
  retryCount: number;
  lastFailureReason?: string;
  lastFailureStage?: string;
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
  feedback?: string;
}

export interface TaskSummary {
  taskId: string;
  goal: string;
  status: TaskStatus;
  currentStage: string;
  retryCount: number;
  lastFailureStage?: string;
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

export interface CommitGateResult {
  passed: boolean;
  failures: string[];
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

export const commitGateResultSchema: z.ZodType<CommitGateResult> = z.object({
  passed: z.boolean(),
  failures: z.array(z.string()),
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
  const lines = text.split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const separatorIndex = line.indexOf(':');
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    result[key] = value;
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

  return value
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
