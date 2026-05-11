import { z } from 'zod';

declare const SHARED_PACKAGE_NAME = "@harnessly/shared";
declare const HARNESSLY_VERSION = "0.0.0";
type HostName = 'claude-code' | 'codex' | 'gemini-cli';
type ProjectType = 'node' | 'go' | 'python' | 'unknown';
type RequiredCheck = 'build' | 'lint' | 'typecheck' | 'test';
type AcceptanceVerifier = 'build' | 'lint' | 'typecheck' | 'test' | 'playwright' | 'api' | 'manual';
type TemplateName = 'bug-fix' | 'feature-simple' | 'general-task';
type RiskLevel = 'low' | 'medium' | 'high';
type EstimatedComplexity = 'simple' | 'medium' | 'complex';
type AdapterKind = 'claude-code' | 'codex' | 'custom';
type FlatYamlValue = string | number | boolean | string[];
type TaskStatus = 'active' | 'blocked' | 'completed' | 'aborted';
/**
 * v3-core 主干工作流的 6 个固定阶段。
 * 与 SPEC §6.1 保持一致，禁止扩展为可编排 DAG。
 */
type WorkflowStage = 'spec' | 'design' | 'execute' | 'review' | 'test' | 'commit_gate';
/**
 * stage 标记联合类型。
 * 包含 v3-core 主阶段（WorkflowStage）+ 三个非主阶段标记：
 * - 'created'：任务初始态，未进入任何主阶段
 * - 'failed'：失败终态
 * - 'retry'：重试动作（瞬态）
 */
type StageMarker = WorkflowStage | 'created' | 'failed' | 'retry';
type TaskOwnerRole = 'pm' | 'requirement' | 'designer' | 'developer' | 'reviewer' | 'tester';
interface PackageInfo {
    name: string;
    version: string;
}
interface HostLifecycleCommands {
    sessionStart: string;
    userPromptSubmit: string;
    completionGate: string;
}
interface HostManifest {
    host: HostName;
    version: string;
    enabled: boolean;
    repoLocalPaths: string[];
    sessionStartCommand: string;
    userPromptSubmitCommand: string;
    completionGateCommand: string;
}
interface HarnessConfig {
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
interface Contract {
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
interface AcceptanceCriterion {
    criterion: string;
    verifiableBy: AcceptanceVerifier;
    testHint?: string;
}
interface AssetPromotion {
    promote: boolean;
    topic?: string;
    files: string[];
    mode: 'new_topic' | 'append' | 'replace';
}
/**
 * v3-core §4.1.16 _harness-meta.json source_tasks 条目。
 * 每次晋升追加一条，不得删除已有条目。
 */
interface SourceTaskEntry {
    task_id: string;
    goal: string;
    promoted_files: string[];
    promoted_at: string;
    promotion_mode: 'new_topic' | 'append' | 'replace';
}
/** v3-core §4.1.16 _harness-meta.json 文件结构 */
interface HarnessMetaFile {
    topic: string;
    created_at: string;
    harness_version: string;
    source_tasks: SourceTaskEntry[];
}
/** archive list 输出 */
interface ArchiveTopicSummary {
    topic: string;
    fileCount: number;
    sourceTaskCount: number;
    lastPromotedAt: string;
}
/** archive show 输出 */
interface ArchiveTopicDetail {
    topic: string;
    readme: string;
    files: string[];
    sourceTasks: SourceTaskEntry[];
}
type FindingCategory = 'reliability' | 'scalability' | 'security' | 'style' | 'other';
type PromotableAs = 'lint' | 'structure_rule' | 'failed_test' | 'review_prompt' | 'skill_fix_hint';
interface FindingExample {
    task: string;
    file: string;
    line?: number;
}
interface Finding {
    id: string;
    kind: 'recurrent_pattern';
    category: FindingCategory;
    summary: string;
    examples: FindingExample[];
    fix_hint: string;
    promotable_as: PromotableAs[];
}
interface FindingGroup {
    category: FindingCategory;
    summary: string;
    count: number;
    findings: Finding[];
    suggestedTargets: PromotableAs[];
}
interface PromoteAction {
    group: FindingGroup;
    target: PromotableAs | 'dismiss';
}
interface ReviewAgentConfig {
    name: string;
    triggers: ('pre_push' | 'pre_merge' | 'on_demand')[];
    model: string;
    prompt: string;
    blocking_severity: 'P0' | 'P1' | 'P2';
}
interface ReviewAgentsConfig {
    review_agents: ReviewAgentConfig[];
}
interface ResidentReviewFinding {
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
interface ResidentReviewResult {
    trigger: string;
    findings: ResidentReviewFinding[];
    hadBlockingFinding: boolean;
    agentsSpawned: string[];
}
interface ContractGateResult {
    passed: boolean;
    failures: string[];
}
interface TaskState {
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
interface TaskContext {
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
interface TaskSummary {
    taskId: string;
    goal: string;
    status: TaskStatus;
    currentStage: StageMarker;
    currentOwner: TaskOwnerRole;
    retryCount: number;
    lastFailureStage?: StageMarker;
    updatedAt: string;
}
interface AdapterInput {
    taskId: string;
    workDir: string;
    prompt: string;
    promptFile: string;
    command?: string;
}
interface AdapterOutput {
    kind: AdapterKind;
    command: string;
    exitCode: number;
    stdout: string;
    stderr: string;
}
type CheckStatus = 'passed' | 'failed' | 'skipped';
interface EvidenceCheckResult {
    name: string;
    status: CheckStatus;
    command: string;
    detail: string;
    fixHint?: string;
    durationMs?: number;
    testCount?: number;
}
interface EvidenceResult {
    checks: EvidenceCheckResult[];
    changedFiles: string[];
    lintWarningsTotal: number;
    todoCount: number;
    gitDirtyFiles: number;
}
interface Skill {
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
type CommitDecision = 'pass' | 'needs_human_review' | 'fail';
interface CommitGateResult {
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
interface EvidenceBaseline {
    capturedAt: string;
    /** baseline 采集时已经失败的 check 名字。简化设计：不存 detail，避免漂移。 */
    failedCheckNames: string[];
}
interface EvidenceSnapshot {
    capturedAt: string;
    checks: EvidenceCheckResult[];
    lintWarningsTotal: number;
    todoCount: number;
    gitDirtyFiles: number;
}
interface BaselineCheckDiff {
    from: CheckStatus | 'missing';
    to: CheckStatus | 'missing';
    regression: boolean;
}
interface BaselineDiff {
    checks: Record<string, BaselineCheckDiff>;
    lintWarningsDelta: number;
    todoDelta: number;
}
interface TaskReport {
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
interface TaskReportArtifacts {
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
interface TaskReportMetrics {
    llmCalls: number;
    durationSeconds: number;
    retries: number;
}
interface TemplateDraft {
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
interface FeedbackEntry {
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
type AgentRole = 'requirement' | 'designer' | 'developer' | 'reviewer' | 'tester';
/**
 * 单个 sub-agent 的可序列化定义，落盘格式为 `.harness/agents/<role>.yaml`。
 *
 * prompt 字段在磁盘上落在并行的 `<role>.prompt.md` 文件里，便于用户用编辑器
 * 直接维护多行内容；运行时由 core/agent.ts 读两个文件并组装成完整 manifest。
 */
interface AgentManifest {
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
declare const packageInfo: PackageInfo;
declare const hostNameSchema: z.ZodEnum<["claude-code", "codex", "gemini-cli"]>;
declare const projectTypeSchema: z.ZodEnum<["node", "go", "python", "unknown"]>;
declare const requiredCheckSchema: z.ZodEnum<["build", "lint", "typecheck", "test"]>;
declare const acceptanceVerifierSchema: z.ZodEnum<["build", "lint", "typecheck", "test", "playwright", "api", "manual"]>;
declare const templateNameSchema: z.ZodEnum<["bug-fix", "feature-simple", "general-task"]>;
declare const riskLevelSchema: z.ZodEnum<["low", "medium", "high"]>;
declare const estimatedComplexitySchema: z.ZodEnum<["simple", "medium", "complex"]>;
declare const adapterKindSchema: z.ZodEnum<["claude-code", "codex", "custom"]>;
declare const taskStatusSchema: z.ZodEnum<["active", "blocked", "completed", "aborted"]>;
declare const workflowStageSchema: z.ZodEnum<["spec", "design", "execute", "review", "test", "commit_gate"]>;
declare const stageMarkerSchema: z.ZodUnion<[z.ZodEnum<["spec", "design", "execute", "review", "test", "commit_gate"]>, z.ZodLiteral<"created">, z.ZodLiteral<"failed">, z.ZodLiteral<"retry">]>;
declare const checkStatusSchema: z.ZodEnum<["passed", "failed", "skipped"]>;
declare const taskOwnerRoleSchema: z.ZodEnum<["pm", "requirement", "designer", "developer", "reviewer", "tester"]>;
declare const harnessConfigSchema: z.ZodType<HarnessConfig>;
declare const acceptanceCriterionSchema: z.ZodType<AcceptanceCriterion>;
declare const assetPromotionSchema: z.ZodType<AssetPromotion>;
declare const sourceTaskEntrySchema: z.ZodType<SourceTaskEntry>;
declare const harnessMetaFileSchema: z.ZodType<HarnessMetaFile>;
declare const contractSchema: z.ZodType<Contract>;
declare const adapterOutputSchema: z.ZodType<AdapterOutput>;
declare const evidenceCheckResultSchema: z.ZodType<EvidenceCheckResult>;
declare const evidenceResultSchema: z.ZodType<EvidenceResult>;
declare const skillSchema: z.ZodType<Skill>;
declare const commitDecisionSchema: z.ZodEnum<["pass", "needs_human_review", "fail"]>;
declare const commitGateResultSchema: z.ZodType<CommitGateResult>;
declare const evidenceBaselineSchema: z.ZodType<EvidenceBaseline>;
declare const evidenceSnapshotSchema: z.ZodType<EvidenceSnapshot>;
declare const baselineDiffSchema: z.ZodType<BaselineDiff>;
declare const taskReportArtifactsSchema: z.ZodType<TaskReportArtifacts>;
declare const taskReportMetricsSchema: z.ZodType<TaskReportMetrics>;
declare const taskReportSchema: z.ZodType<TaskReport>;
declare const feedbackEntrySchema: z.ZodType<FeedbackEntry>;
declare const agentRoleSchema: z.ZodEnum<["requirement", "designer", "developer", "reviewer", "tester"]>;
declare const agentManifestSchema: z.ZodType<AgentManifest>;
declare const templateDraftSchema: z.ZodType<TemplateDraft>;
declare function serializeFlatYaml(data: Record<string, FlatYamlValue>): string;
declare function parseFlatYaml(text: string): Record<string, string>;
declare function parseBoolean(value: string | undefined, defaultValue?: boolean): boolean;
declare function parseStringList(value: string | undefined): string[];
declare function validateHarnessConfig(config: HarnessConfig): HarnessConfig;
declare function serializeHarnessConfig(config: HarnessConfig): string;
declare function parseHarnessConfig(text: string): HarnessConfig;
declare function validateContract(contract: Contract): Contract;
declare function serializeContract(contract: Contract): string;
declare function parseContract(text: string): Contract;
declare function validateTaskReport(report: TaskReport): TaskReport;
declare function serializeTaskReport(report: TaskReport): string;
declare function parseTaskReport(text: string): TaskReport;
declare function validateRequirementMarkdown(markdown: string): string[];
declare function validateDesignMarkdown(markdown: string): string[];
/**
 * AgentManifest 的磁盘存放采用「YAML 元数据 + 并行 prompt.md」双文件方案：
 * - `<role>.yaml` 由 serializeAgentManifestYaml / parseAgentManifestYaml 处理
 * - `<role>.prompt.md` 由 core/agent.ts 直接读写，不经 schema
 *
 * codec 故意只覆盖元数据；prompt 字段在序列化时被丢弃，反序列化时填空串，
 * 由调用方负责加载 prompt.md 后回填。
 */
declare function serializeAgentManifestYaml(manifest: AgentManifest): string;
declare function parseAgentManifestYaml(text: string): AgentManifest;
declare function validateTemplateDraft(template: TemplateDraft): TemplateDraft;
declare function serializeTemplateDraft(template: TemplateDraft): string;
declare function parseTemplateDraft(text: string): TemplateDraft;

export { type AcceptanceCriterion, type AcceptanceVerifier, type AdapterInput, type AdapterKind, type AdapterOutput, type AgentManifest, type AgentRole, type ArchiveTopicDetail, type ArchiveTopicSummary, type AssetPromotion, type BaselineCheckDiff, type BaselineDiff, type CheckStatus, type CommitDecision, type CommitGateResult, type Contract, type ContractGateResult, type EstimatedComplexity, type EvidenceBaseline, type EvidenceCheckResult, type EvidenceResult, type EvidenceSnapshot, type FeedbackEntry, type Finding, type FindingCategory, type FindingExample, type FindingGroup, type FlatYamlValue, HARNESSLY_VERSION, type HarnessConfig, type HarnessMetaFile, type HostLifecycleCommands, type HostManifest, type HostName, type PackageInfo, type ProjectType, type PromotableAs, type PromoteAction, type RequiredCheck, type ResidentReviewFinding, type ResidentReviewResult, type ReviewAgentConfig, type ReviewAgentsConfig, type RiskLevel, SHARED_PACKAGE_NAME, type Skill, type SourceTaskEntry, type StageMarker, type TaskContext, type TaskOwnerRole, type TaskReport, type TaskReportArtifacts, type TaskReportMetrics, type TaskState, type TaskStatus, type TaskSummary, type TemplateDraft, type TemplateName, type WorkflowStage, acceptanceCriterionSchema, acceptanceVerifierSchema, adapterKindSchema, adapterOutputSchema, agentManifestSchema, agentRoleSchema, assetPromotionSchema, baselineDiffSchema, checkStatusSchema, commitDecisionSchema, commitGateResultSchema, contractSchema, estimatedComplexitySchema, evidenceBaselineSchema, evidenceCheckResultSchema, evidenceResultSchema, evidenceSnapshotSchema, feedbackEntrySchema, harnessConfigSchema, harnessMetaFileSchema, hostNameSchema, packageInfo, parseAgentManifestYaml, parseBoolean, parseContract, parseFlatYaml, parseHarnessConfig, parseStringList, parseTaskReport, parseTemplateDraft, projectTypeSchema, requiredCheckSchema, riskLevelSchema, serializeAgentManifestYaml, serializeContract, serializeFlatYaml, serializeHarnessConfig, serializeTaskReport, serializeTemplateDraft, skillSchema, sourceTaskEntrySchema, stageMarkerSchema, taskOwnerRoleSchema, taskReportArtifactsSchema, taskReportMetricsSchema, taskReportSchema, taskStatusSchema, templateDraftSchema, templateNameSchema, validateContract, validateDesignMarkdown, validateHarnessConfig, validateRequirementMarkdown, validateTaskReport, validateTemplateDraft, workflowStageSchema };
