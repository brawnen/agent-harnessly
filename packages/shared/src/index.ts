import { ZodError, z } from 'zod';

export const SHARED_PACKAGE_NAME = '@brawnen/harnessly-shared';
export const HARNESSLY_VERSION = '0.1.0-alpha.0';

export type HostName = 'claude-code' | 'codex' | 'gemini-cli';
export type ProjectType = 'node' | 'go' | 'python' | 'unknown';
export type RequiredCheck = 'build' | 'lint' | 'typecheck' | 'test';
export type AcceptanceVerifier =
  | 'build'
  | 'lint'
  | 'typecheck'
  | 'test'
  | 'playwright'
  | 'api'
  | 'manual';
export type TemplateName = 'bug-fix' | 'feature-simple' | 'general-task';
export type RiskLevel = 'low' | 'medium' | 'high';
export type EstimatedComplexity = 'simple' | 'medium' | 'complex';
export type AdapterKind = 'claude-code' | 'codex' | 'custom';
export type FlatYamlValue = string | number | boolean | string[];
export type TaskStatus = 'active' | 'blocked' | 'completed' | 'aborted';

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
export type TaskOwnerRole = 'pm' | 'requirement' | 'designer' | 'developer' | 'reviewer' | 'tester';

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
  adapterKind: AdapterKind;
  adapterCommand: string;
}

export interface Contract {
  version: '2.0';
  taskId: string;
  goal: string;
  /**
   * 旧模板分类仍作为内部实现细节保留，不写入 v3-core contract 的规范字段。
   */
  templateName: TemplateName;
  riskLevel: RiskLevel;
  estimatedComplexity: EstimatedComplexity;
  requiredChecks: RequiredCheck[];
  scopeInclude: string[];
  scopeExclude: string[];
  acceptanceCriteria: AcceptanceCriterion[];
  outOfScope: string[];
  linkedSpec: string;
  linkedDesign: string;
  assetPromotion?: AssetPromotion;
  createdAt: string;
}

export interface AcceptanceCriterion {
  criterion: string;
  verifiableBy: AcceptanceVerifier;
  testHint?: string;
}

export interface AssetPromotion {
  promote: boolean;
  topic?: string;
  files: string[];
  mode: 'new_topic' | 'append' | 'replace';
}

/**
 * v3-core §4.1.16 _harness-meta.json source_tasks 条目。
 * 每次晋升追加一条，不得删除已有条目。
 */
export interface SourceTaskEntry {
  task_id: string;
  goal: string;
  promoted_files: string[];
  promoted_at: string;
  promotion_mode: 'new_topic' | 'append' | 'replace';
}

/** v3-core §4.1.16 _harness-meta.json 文件结构 */
export interface HarnessMetaFile {
  topic: string;
  created_at: string;
  harness_version: string;
  source_tasks: SourceTaskEntry[];
}

/** archive list 输出 */
export interface ArchiveTopicSummary {
  topic: string;
  fileCount: number;
  sourceTaskCount: number;
  lastPromotedAt: string;
}

/** archive show 输出 */
export interface ArchiveTopicDetail {
  topic: string;
  readme: string;
  files: string[];
  sourceTasks: SourceTaskEntry[];
}

// ===== Feedback Promotion (§15) =====

export type FindingCategory = 'reliability' | 'scalability' | 'security' | 'style' | 'other';
export type PromotableAs = 'lint' | 'structure_rule' | 'failed_test' | 'review_prompt' | 'skill_fix_hint';

export interface FindingExample {
  task: string;
  file: string;
  line?: number;
}

export interface Finding {
  id: string;
  kind: 'recurrent_pattern';
  category: FindingCategory;
  summary: string;
  examples: FindingExample[];
  fix_hint: string;
  promotable_as: PromotableAs[];
}

export interface FindingGroup {
  category: FindingCategory;
  summary: string;
  count: number;
  findings: Finding[];
  suggestedTargets: PromotableAs[];
}

export interface PromoteAction {
  group: FindingGroup;
  target: PromotableAs | 'dismiss';
}

// ===== Resident Review Agent (§14) =====

export interface ReviewAgentConfig {
  name: string;
  triggers: ('pre_push' | 'pre_merge' | 'on_demand')[];
  model: string;
  prompt: string;
  blocking_severity: 'P0' | 'P1' | 'P2';
}

export interface ReviewAgentsConfig {
  review_agents: ReviewAgentConfig[];
}

export interface ResidentReviewFinding {
  id: string;
  severity: 'P0' | 'P1' | 'P2';
  description: string;
  file?: string;
  line?: number;
  fix_hint: string;
  recurrent_pattern: boolean;
  agent_name: string;
  trigger: string;
}

export interface ResidentReviewResult {
  trigger: string;
  findings: ResidentReviewFinding[];
  hadBlockingFinding: boolean;
  agentsSpawned: string[];
}

export interface ContractGateResult {
  passed: boolean;
  failures: string[];
}

export interface TaskState {
  taskId: string;
  status: TaskStatus;
  currentStage: StageMarker;
  currentOwner: TaskOwnerRole;
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
  currentOwner: TaskOwnerRole;
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
  fixHint?: string;
  durationMs?: number;
  testCount?: number;
}

export interface EvidenceResult {
  checks: EvidenceCheckResult[];
  changedFiles: string[];
  lintWarningsTotal: number;
  todoCount: number;
  gitDirtyFiles: number;
}

export interface Skill {
  name: string;
  language: string;
  command: string;
  successExitCode: number;
  envRequired: string[];
  detailOnPass: string;
  detailOnFailTemplate: string;
  fixHintTemplate: string;
}

/**
 * commit_gate 三态决策。
 * - 'pass': 所有硬性 gate 通过，可以 commit
 * - 'needs_human_review': 没有硬失败但需要 PM/用户确认
 * - 'fail': 存在硬性失败，禁止 commit
 */
export type CommitDecision = 'pass' | 'needs_human_review' | 'fail';

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

export interface EvidenceSnapshot {
  capturedAt: string;
  checks: EvidenceCheckResult[];
  lintWarningsTotal: number;
  todoCount: number;
  gitDirtyFiles: number;
}

export interface BaselineCheckDiff {
  from: CheckStatus | 'missing';
  to: CheckStatus | 'missing';
  regression: boolean;
}

export interface BaselineDiff {
  checks: Record<string, BaselineCheckDiff>;
  lintWarningsDelta: number;
  todoDelta: number;
}

export interface TaskReport {
  taskId: string;
  goal: string;
  finalStage: WorkflowStage;
  commitDecision: CommitDecision;
  artifacts: TaskReportArtifacts;
  metrics: TaskReportMetrics;
  createdAt: string;
  finishedAt: string;
  adapter: AdapterOutput;
  evidence: EvidenceResult;
  commitGate: CommitGateResult;
  commitReady: boolean;
  summary: string;
  generatedAt: string;
}

export interface TaskReportArtifacts {
  requirement: string;
  contract: string;
  design: string;
  taskBreakdown: string;
  implementationNotes: string;
  review: string;
  residentReview: string;
  testReport: string;
  baselineEvidence: string;
  currentEvidence: string;
  baselineDiff: string;
  commitSummary: string;
}

export interface TaskReportMetrics {
  llmCalls: number;
  durationSeconds: number;
  retries: number;
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
  /** 是否允许宿主原生 plan mode。默认 false，避免 sub-agent 在设计阶段绕过 repo-local 工件。 */
  planModeEnabled: boolean;
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
export const acceptanceVerifierSchema = z.enum([
  'build',
  'lint',
  'typecheck',
  'test',
  'playwright',
  'api',
  'manual',
]);
export const templateNameSchema = z.enum(['bug-fix', 'feature-simple', 'general-task']);
export const riskLevelSchema = z.enum(['low', 'medium', 'high']);
export const estimatedComplexitySchema = z.enum(['simple', 'medium', 'complex']);
export const adapterKindSchema = z.enum(['claude-code', 'codex', 'custom']);
export const taskStatusSchema = z.enum(['active', 'blocked', 'completed', 'aborted']);
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
export const taskOwnerRoleSchema = z.enum([
  'pm',
  'requirement',
  'designer',
  'developer',
  'reviewer',
  'tester',
]);

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
  adapterKind: adapterKindSchema,
  adapterCommand: z.string(),
});

export const acceptanceCriterionSchema: z.ZodType<AcceptanceCriterion> = z.object({
  criterion: z.string().min(1),
  verifiableBy: acceptanceVerifierSchema,
  testHint: z.string().optional(),
});

export const assetPromotionSchema: z.ZodType<AssetPromotion> = z.object({
  promote: z.boolean(),
  topic: z.string().min(1).optional(),
  files: z.array(z.string().min(1)),
  mode: z.enum(['new_topic', 'append', 'replace']),
});

export const sourceTaskEntrySchema: z.ZodType<SourceTaskEntry> = z.object({
  task_id: z.string().min(1),
  goal: z.string().min(1),
  promoted_files: z.array(z.string().min(1)),
  promoted_at: z.string().min(1),
  promotion_mode: z.enum(['new_topic', 'append', 'replace']),
});

export const harnessMetaFileSchema: z.ZodType<HarnessMetaFile> = z.object({
  topic: z.string().min(1),
  created_at: z.string().min(1),
  harness_version: z.string().min(1),
  source_tasks: z.array(sourceTaskEntrySchema),
});

export const contractSchema: z.ZodType<Contract> = z.object({
  version: z.literal('2.0'),
  taskId: z.string(),
  goal: z.string().min(1),
  templateName: templateNameSchema,
  riskLevel: riskLevelSchema,
  estimatedComplexity: estimatedComplexitySchema,
  requiredChecks: z.array(requiredCheckSchema),
  scopeInclude: z.array(z.string()),
  scopeExclude: z.array(z.string()),
  acceptanceCriteria: z.array(acceptanceCriterionSchema),
  outOfScope: z.array(z.string()),
  linkedSpec: z.string().min(1),
  linkedDesign: z.string().min(1),
  assetPromotion: assetPromotionSchema.optional(),
  createdAt: z.string().min(1),
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
  fixHint: z.string().optional(),
  durationMs: z.number().int().nonnegative().optional(),
  testCount: z.number().int().nonnegative().optional(),
});

export const evidenceResultSchema: z.ZodType<EvidenceResult> = z.object({
  checks: z.array(evidenceCheckResultSchema),
  changedFiles: z.array(z.string()),
  lintWarningsTotal: z.number().int().nonnegative(),
  todoCount: z.number().int().nonnegative(),
  gitDirtyFiles: z.number().int().nonnegative(),
});

export const skillSchema: z.ZodType<Skill> = z.object({
  name: z.string().min(1),
  language: z.string().min(1),
  command: z.string().min(1),
  successExitCode: z.number().int(),
  envRequired: z.array(z.string()),
  detailOnPass: z.string(),
  detailOnFailTemplate: z.string(),
  fixHintTemplate: z.string(),
});

export const commitDecisionSchema = z.enum(['pass', 'needs_human_review', 'fail']);

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

export const evidenceSnapshotSchema: z.ZodType<EvidenceSnapshot> = z.object({
  capturedAt: z.string().min(1),
  checks: z.array(evidenceCheckResultSchema),
  lintWarningsTotal: z.number().int().nonnegative(),
  todoCount: z.number().int().nonnegative(),
  gitDirtyFiles: z.number().int().nonnegative(),
});

export const baselineDiffSchema: z.ZodType<BaselineDiff> = z.object({
  checks: z.record(
    z.string(),
    z.object({
      from: z.union([checkStatusSchema, z.literal('missing')]),
      to: z.union([checkStatusSchema, z.literal('missing')]),
      regression: z.boolean(),
    }),
  ),
  lintWarningsDelta: z.number().int(),
  todoDelta: z.number().int(),
});

export const taskReportArtifactsSchema: z.ZodType<TaskReportArtifacts> = z.object({
  requirement: z.string(),
  contract: z.string(),
  design: z.string(),
  taskBreakdown: z.string(),
  implementationNotes: z.string(),
  review: z.string(),
  residentReview: z.string(),
  testReport: z.string(),
  baselineEvidence: z.string(),
  currentEvidence: z.string(),
  baselineDiff: z.string(),
  commitSummary: z.string(),
});

export const taskReportMetricsSchema: z.ZodType<TaskReportMetrics> = z.object({
  llmCalls: z.number().int().nonnegative(),
  durationSeconds: z.number().int().nonnegative(),
  retries: z.number().int().nonnegative(),
});

export const taskReportSchema: z.ZodType<TaskReport> = z.object({
  taskId: z.string().min(1),
  goal: z.string().min(1),
  finalStage: workflowStageSchema,
  commitDecision: commitDecisionSchema,
  artifacts: taskReportArtifactsSchema,
  metrics: taskReportMetricsSchema,
  createdAt: z.string().min(1),
  finishedAt: z.string().min(1),
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
  planModeEnabled: z.boolean(),
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
      adapterKind: raw.adapter_kind ?? 'claude-code',
      adapterCommand: raw.adapter_command ?? '',
    },
    'harness config',
  );
}

export function validateContract(contract: Contract): Contract {
  return parseWithSchema(contractSchema, contract, 'contract');
}

function yamlList(items: readonly string[], indent = 0): string[] {
  const pad = ' '.repeat(indent);
  return items.length > 0 ? items.map((item) => `${pad}- ${item}`) : [`${pad}[]`];
}

export function serializeContract(contract: Contract): string {
  const validated = validateContract(contract);
  const lines: string[] = [
    `version: "${validated.version}"`,
    `task_id: ${validated.taskId}`,
    `goal: ${validated.goal}`,
    'scope:',
    '  include:',
    ...yamlList(validated.scopeInclude, 4),
    '  exclude:',
    ...yamlList(validated.scopeExclude, 4),
    'acceptance_criteria:',
  ];

  for (const item of validated.acceptanceCriteria) {
    lines.push(`  - criterion: ${item.criterion}`);
    lines.push(`    verifiable_by: ${item.verifiableBy}`);
    if (item.testHint) {
      lines.push(`    test_hint: ${item.testHint}`);
    }
  }

  lines.push(
    `risk_level: ${validated.riskLevel}`,
    `estimated_complexity: ${validated.estimatedComplexity}`,
    'required_checks:',
    ...yamlList(validated.requiredChecks, 2),
    `linked_spec: ${validated.linkedSpec}`,
    `linked_design: ${validated.linkedDesign}`,
  );

  if (validated.assetPromotion) {
    lines.push(
      'asset_promotion:',
      `  promote: ${validated.assetPromotion.promote}`,
    );
    if (validated.assetPromotion.topic) {
      lines.push(`  topic: ${validated.assetPromotion.topic}`);
    }
    lines.push('  files:', ...yamlList(validated.assetPromotion.files, 4));
    lines.push(`  mode: ${validated.assetPromotion.mode}`);
  }

  lines.push(
    `created_at: ${validated.createdAt}`,
    `template_name: ${validated.templateName}`,
    'out_of_scope:',
    ...yamlList(validated.outOfScope, 2),
    '',
  );

  return lines.join('\n');
}

export function parseContract(text: string): Contract {
  const raw = parseFlatYaml(text);
  const readScalar = (key: string): string | undefined => {
    const match = text.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'));
    return match?.[1]?.trim().replace(/^"|"$/g, '');
  };
  const readIndentedList = (heading: string): string[] => {
    const lines = text.split(/\r?\n/);
    const start = lines.findIndex((line) => line.trim() === heading);
    if (start === -1) return [];
    const result: string[] = [];
    for (let i = start + 1; i < lines.length; i += 1) {
      const line = lines[i] ?? '';
      if (/^\S/.test(line) && line.trim().endsWith(':')) break;
      const item = line.match(/^\s*-\s+(.+)$/)?.[1]?.trim();
      if (item) result.push(item);
      if (/^\S/.test(line) && line.trim() && !line.trim().startsWith('-')) break;
    }
    return result;
  };
  const readScopeList = (key: 'include' | 'exclude'): string[] => {
    const lines = text.split(/\r?\n/);
    const scopeStart = lines.findIndex((line) => line.trim() === 'scope:');
    if (scopeStart === -1) return [];
    const keyStart = lines.findIndex((line, index) => index > scopeStart && line.trim() === `${key}:`);
    if (keyStart === -1) return [];
    const result: string[] = [];
    for (let i = keyStart + 1; i < lines.length; i += 1) {
      const line = lines[i] ?? '';
      if (/^\s{2}\S/.test(line) && line.trim().endsWith(':')) break;
      if (/^\S/.test(line)) break;
      const item = line.match(/^\s*-\s+(.+)$/)?.[1]?.trim();
      if (item) result.push(item);
    }
    return result;
  };
  const readAcceptanceCriteria = (): AcceptanceCriterion[] => {
    const legacyAcceptance = parseStringList(raw.acceptance_criteria);
    if (
      legacyAcceptance.length > 0 &&
      !legacyAcceptance.some((criterion) => criterion.startsWith('criterion:'))
    ) {
      return legacyAcceptance.map((criterion) => ({
        criterion,
        verifiableBy: 'manual' as const,
      }));
    }

    const result: AcceptanceCriterion[] = [];
    let current: Partial<AcceptanceCriterion> | null = null;
    for (const line of text.split(/\r?\n/)) {
      const criterion = line.match(/^\s*-\s+criterion:\s*(.+)$/)?.[1]?.trim();
      if (criterion) {
        if (current?.criterion) {
          result.push({
            criterion: current.criterion,
            verifiableBy: current.verifiableBy ?? 'manual',
            testHint: current.testHint,
          });
        }
        current = { criterion };
        continue;
      }
      const verifier = line.match(/^\s+verifiable_by:\s*(.+)$/)?.[1]?.trim() as AcceptanceVerifier | undefined;
      if (verifier && current) {
        current.verifiableBy = verifier;
      }
      const testHint = line.match(/^\s+test_hint:\s*(.+)$/)?.[1]?.trim();
      if (testHint && current) {
        current.testHint = testHint;
      }
    }
    if (current?.criterion) {
      result.push({
        criterion: current.criterion,
        verifiableBy: current.verifiableBy ?? 'manual',
        testHint: current.testHint,
      });
    }
    return result;
  };

  return parseWithSchema(
    contractSchema,
    {
      version: readScalar('version') ?? '2.0',
      taskId: readScalar('task_id') ?? raw.task_id ?? '',
      goal: readScalar('goal') ?? raw.goal ?? '',
      templateName: raw.template_name ?? 'general-task',
      riskLevel: readScalar('risk_level') ?? raw.risk_level ?? 'medium',
      estimatedComplexity: readScalar('estimated_complexity') ?? raw.estimated_complexity ?? 'medium',
      requiredChecks: parseStringList(raw.required_checks).length > 0
        ? parseStringList(raw.required_checks)
        : readIndentedList('required_checks:'),
      scopeInclude: parseStringList(raw.scope_include).length > 0
        ? parseStringList(raw.scope_include)
        : readScopeList('include'),
      scopeExclude: parseStringList(raw.scope_exclude).length > 0
        ? parseStringList(raw.scope_exclude)
        : readScopeList('exclude'),
      acceptanceCriteria: readAcceptanceCriteria(),
      outOfScope: parseStringList(raw.out_of_scope).length > 0
        ? parseStringList(raw.out_of_scope)
        : readIndentedList('out_of_scope:'),
      linkedSpec: readScalar('linked_spec') ?? raw.linked_spec ?? 'requirement.md',
      linkedDesign: readScalar('linked_design') ?? raw.linked_design ?? 'design.md',
      createdAt: readScalar('created_at') ?? raw.created_at ?? new Date(0).toISOString(),
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

const REQUIREMENT_REQUIRED_SECTIONS = [
  'Goal',
  'In Scope',
  'Out of Scope',
  'Affected Modules',
  'Acceptance Criteria',
  'Risks',
  'Open Questions',
];

const HEDGING_WORDS = ['建议', '可以', '推荐', '可选', 'suggest', 'recommend', 'optional'];
const FORWARD_REFERENCE_PATTERNS = [/同上/, /与\s*.+\s*平行/, /细节见别处/];

function hasMarkdownSection(markdown: string, title: string): boolean {
  return new RegExp(`^##\\s+${title}\\s*$`, 'im').test(markdown);
}

function listSectionItems(markdown: string, title: string): string[] {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim().toLowerCase() === `## ${title}`.toLowerCase());
  if (start === -1) return [];
  const result: string[] = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    if (/^##\s+/.test(line)) break;
    const item = line.match(/^\s*[-*]\s+(.+)$/)?.[1]?.trim();
    if (item) result.push(item);
  }
  return result;
}

export function validateRequirementMarkdown(markdown: string): string[] {
  const failures: string[] = [];
  for (const section of REQUIREMENT_REQUIRED_SECTIONS) {
    if (!hasMarkdownSection(markdown, section)) {
      failures.push(`缺少 ## ${section} 小节`);
    }
  }

  for (const section of ['In Scope', 'Out of Scope', 'Acceptance Criteria']) {
    if (hasMarkdownSection(markdown, section) && listSectionItems(markdown, section).length === 0) {
      failures.push(`## ${section} 必须包含至少一个列表项`);
    }
  }

  const lower = markdown.toLowerCase();
  for (const word of HEDGING_WORDS) {
    if (lower.includes(word.toLowerCase())) {
      failures.push(`requirement.md 含模糊词：${word}`);
    }
  }

  return failures;
}

export function validateDesignMarkdown(markdown: string): string[] {
  const failures: string[] = [];
  if (!hasMarkdownSection(markdown, 'Feasibility Self-Check')) {
    failures.push('缺少 ## Feasibility Self-Check 小节');
  }
  if (!/备选|方案\s*[AB]|Alternative/i.test(markdown)) {
    failures.push('design.md 必须至少对比两种备选方案');
  }
  if (!/接口|符号|契约|API|Interface/i.test(markdown)) {
    failures.push('design.md 必须包含接口/契约说明');
  }
  if (!/影响|Affected|文件/.test(markdown)) {
    failures.push('design.md 必须列出影响范围');
  }
  for (const pattern of FORWARD_REFERENCE_PATTERNS) {
    if (pattern.test(markdown)) {
      failures.push(`design.md 含前向引用：${pattern.source}`);
    }
  }
  return failures;
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
    plan_mode_enabled: validated.planModeEnabled,
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
      planModeEnabled: parseBoolean(raw.plan_mode_enabled, false),
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
