import { z } from 'zod';

declare const SHARED_PACKAGE_NAME = "@harnessly/shared";
declare const HARNESSLY_VERSION = "0.0.0";
type HostName = 'claude-code' | 'codex' | 'gemini-cli';
type ProjectType = 'node' | 'go' | 'python' | 'unknown';
type RequiredCheck = 'build' | 'lint' | 'typecheck' | 'test';
type TemplateName = 'bug-fix' | 'feature-simple' | 'general-task';
type RiskLevel = 'low' | 'medium' | 'high';
type AdapterKind = 'claude-code' | 'codex' | 'custom';
type FlatYamlValue = string | number | boolean | string[];
type TaskStatus = 'created' | 'contracting' | 'planning' | 'ready' | 'executing' | 'verifying' | 'passed' | 'failed';
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
    hostSubagents: HostSubagentConfig;
    adapterKind: AdapterKind;
    adapterCommand: string;
}
interface HostSubagentConfig {
    planner: {
        useHostPlanMode: boolean;
        models: Partial<Record<HostName, string>>;
    };
    evaluator: {
        models: Partial<Record<HostName, string>>;
    };
}
interface Contract {
    goal: string;
    templateName: TemplateName;
    riskLevel: RiskLevel;
    scopeInclude: string[];
    scopeExclude: string[];
    acceptanceCriteria: string[];
    outOfScope: string[];
}
interface ContractGateResult {
    passed: boolean;
    failures: string[];
}
interface TaskState {
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
}
interface EvidenceResult {
    checks: EvidenceCheckResult[];
    changedFiles: string[];
}
/**
 * commit_gate 三态决策。
 * - 'pass': 所有硬性 gate 通过，可以 commit
 * - 'block': 存在硬性失败，禁止 commit（必须修复后重跑）
 * - 'warn': 硬性 gate 全过但有软性告警，PM 须确认后才能 commit
 */
type CommitDecision = 'pass' | 'block' | 'warn';
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
interface TaskReport {
    taskId: string;
    goal: string;
    adapter: AdapterOutput;
    evidence: EvidenceResult;
    commitGate: CommitGateResult;
    commitReady: boolean;
    summary: string;
    generatedAt: string;
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
declare const templateNameSchema: z.ZodEnum<["bug-fix", "feature-simple", "general-task"]>;
declare const riskLevelSchema: z.ZodEnum<["low", "medium", "high"]>;
declare const adapterKindSchema: z.ZodEnum<["claude-code", "codex", "custom"]>;
declare const hostSubagentConfigSchema: z.ZodType<HostSubagentConfig>;
declare const taskStatusSchema: z.ZodEnum<["created", "contracting", "planning", "ready", "executing", "verifying", "passed", "failed"]>;
declare const workflowStageSchema: z.ZodEnum<["spec", "design", "execute", "review", "test", "commit_gate"]>;
declare const stageMarkerSchema: z.ZodUnion<[z.ZodEnum<["spec", "design", "execute", "review", "test", "commit_gate"]>, z.ZodLiteral<"created">, z.ZodLiteral<"failed">, z.ZodLiteral<"retry">]>;
declare const checkStatusSchema: z.ZodEnum<["passed", "failed", "skipped"]>;
declare const harnessConfigSchema: z.ZodType<HarnessConfig>;
declare const contractSchema: z.ZodType<Contract>;
declare const adapterOutputSchema: z.ZodType<AdapterOutput>;
declare const evidenceCheckResultSchema: z.ZodType<EvidenceCheckResult>;
declare const evidenceResultSchema: z.ZodType<EvidenceResult>;
declare const commitDecisionSchema: z.ZodEnum<["pass", "block", "warn"]>;
declare const commitGateResultSchema: z.ZodType<CommitGateResult>;
declare const evidenceBaselineSchema: z.ZodType<EvidenceBaseline>;
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

export { type AdapterInput, type AdapterKind, type AdapterOutput, type AgentManifest, type AgentRole, type CheckStatus, type CommitDecision, type CommitGateResult, type Contract, type ContractGateResult, type EvidenceBaseline, type EvidenceCheckResult, type EvidenceResult, type FeedbackEntry, type FlatYamlValue, HARNESSLY_VERSION, type HarnessConfig, type HostLifecycleCommands, type HostManifest, type HostName, type HostSubagentConfig, type PackageInfo, type ProjectType, type RequiredCheck, type RiskLevel, SHARED_PACKAGE_NAME, type StageMarker, type TaskContext, type TaskReport, type TaskState, type TaskStatus, type TaskSummary, type TemplateDraft, type TemplateName, type WorkflowStage, adapterKindSchema, adapterOutputSchema, agentManifestSchema, agentRoleSchema, checkStatusSchema, commitDecisionSchema, commitGateResultSchema, contractSchema, evidenceBaselineSchema, evidenceCheckResultSchema, evidenceResultSchema, feedbackEntrySchema, harnessConfigSchema, hostNameSchema, hostSubagentConfigSchema, packageInfo, parseAgentManifestYaml, parseBoolean, parseContract, parseFlatYaml, parseHarnessConfig, parseStringList, parseTaskReport, parseTemplateDraft, projectTypeSchema, requiredCheckSchema, riskLevelSchema, serializeAgentManifestYaml, serializeContract, serializeFlatYaml, serializeHarnessConfig, serializeTaskReport, serializeTemplateDraft, stageMarkerSchema, taskReportSchema, taskStatusSchema, templateDraftSchema, templateNameSchema, validateContract, validateHarnessConfig, validateTaskReport, validateTemplateDraft, workflowStageSchema };
