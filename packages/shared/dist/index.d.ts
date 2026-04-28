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
    currentStage: string;
    createdAt: string;
    updatedAt: string;
    completedStages: string[];
    retryCount: number;
    lastFailureReason?: string;
    lastFailureStage?: string;
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
    feedback?: string;
}
interface TaskSummary {
    taskId: string;
    goal: string;
    status: TaskStatus;
    currentStage: string;
    retryCount: number;
    lastFailureStage?: string;
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
interface CommitGateResult {
    passed: boolean;
    failures: string[];
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
declare const packageInfo: PackageInfo;
declare const hostNameSchema: z.ZodEnum<["claude-code", "codex", "gemini-cli"]>;
declare const projectTypeSchema: z.ZodEnum<["node", "go", "python", "unknown"]>;
declare const requiredCheckSchema: z.ZodEnum<["build", "lint", "typecheck", "test"]>;
declare const templateNameSchema: z.ZodEnum<["bug-fix", "feature-simple", "general-task"]>;
declare const riskLevelSchema: z.ZodEnum<["low", "medium", "high"]>;
declare const adapterKindSchema: z.ZodEnum<["claude-code", "codex", "custom"]>;
declare const hostSubagentConfigSchema: z.ZodType<HostSubagentConfig>;
declare const taskStatusSchema: z.ZodEnum<["created", "contracting", "planning", "ready", "executing", "verifying", "passed", "failed"]>;
declare const checkStatusSchema: z.ZodEnum<["passed", "failed", "skipped"]>;
declare const harnessConfigSchema: z.ZodType<HarnessConfig>;
declare const contractSchema: z.ZodType<Contract>;
declare const adapterOutputSchema: z.ZodType<AdapterOutput>;
declare const evidenceCheckResultSchema: z.ZodType<EvidenceCheckResult>;
declare const evidenceResultSchema: z.ZodType<EvidenceResult>;
declare const commitGateResultSchema: z.ZodType<CommitGateResult>;
declare const taskReportSchema: z.ZodType<TaskReport>;
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
declare function validateTemplateDraft(template: TemplateDraft): TemplateDraft;
declare function serializeTemplateDraft(template: TemplateDraft): string;
declare function parseTemplateDraft(text: string): TemplateDraft;

export { type AdapterInput, type AdapterKind, type AdapterOutput, type CheckStatus, type CommitGateResult, type Contract, type ContractGateResult, type EvidenceCheckResult, type EvidenceResult, type FlatYamlValue, HARNESSLY_VERSION, type HarnessConfig, type HostLifecycleCommands, type HostManifest, type HostName, type HostSubagentConfig, type PackageInfo, type ProjectType, type RequiredCheck, type RiskLevel, SHARED_PACKAGE_NAME, type TaskContext, type TaskReport, type TaskState, type TaskStatus, type TaskSummary, type TemplateDraft, type TemplateName, adapterKindSchema, adapterOutputSchema, checkStatusSchema, commitGateResultSchema, contractSchema, evidenceCheckResultSchema, evidenceResultSchema, harnessConfigSchema, hostNameSchema, hostSubagentConfigSchema, packageInfo, parseBoolean, parseContract, parseFlatYaml, parseHarnessConfig, parseStringList, parseTaskReport, parseTemplateDraft, projectTypeSchema, requiredCheckSchema, riskLevelSchema, serializeContract, serializeFlatYaml, serializeHarnessConfig, serializeTaskReport, serializeTemplateDraft, taskReportSchema, taskStatusSchema, templateDraftSchema, templateNameSchema, validateContract, validateHarnessConfig, validateTaskReport, validateTemplateDraft };
