import { ProjectType, HostName, HarnessConfig, TemplateName, Contract, ContractGateResult, EvidenceResult, AdapterKind, AdapterInput, AdapterOutput, CommitGateResult, RequiredCheck, TaskReport, TemplateDraft, TaskContext, EvidenceCheckResult, TaskSummary, RiskLevel } from '@harnessly/shared';
import { z } from 'zod';

declare function createDefaultHarnessConfig(projectType: ProjectType, defaultHost?: HostName): HarnessConfig;
declare function serializeHarnessConfig(config: HarnessConfig): string;
declare function parseHarnessConfig(text: string): HarnessConfig;

interface StructuredGenerationOptions<T> {
    prompt: string;
    schema: z.ZodType<T>;
    systemPrompt?: string;
    temperature?: number;
    maxTokens?: number;
    toolName?: string;
    toolDescription?: string;
}
interface TextGenerationOptions {
    prompt: string;
    systemPrompt?: string;
    temperature?: number;
    maxTokens?: number;
}
interface LLMClient {
    readonly providerName: string;
    generateStructured<T>(options: StructuredGenerationOptions<T>): Promise<T>;
    generateText(options: TextGenerationOptions): Promise<string>;
}
interface AnthropicClientOptions {
    apiKey?: string;
    model?: string;
}
declare class AnthropicClient implements LLMClient {
    readonly providerName = "anthropic";
    private readonly client;
    private readonly model;
    constructor(options?: AnthropicClientOptions);
    generateStructured<T>(options: StructuredGenerationOptions<T>): Promise<T>;
    generateText(options: TextGenerationOptions): Promise<string>;
}
declare function createLLMClientFromEnv(env?: NodeJS.ProcessEnv): LLMClient | null;

interface ContractGenerationOptions {
    goal: string;
    templateName: TemplateName;
    llmClient?: LLMClient | null;
}
declare function generateFallbackContract(goal: string, templateName: TemplateName): Contract;
declare function generateContract(options: ContractGenerationOptions): Promise<Contract>;
declare function checkContract(contract: Contract): ContractGateResult;

declare function collectChangedFiles(workDir: string): Promise<string[]>;
declare function collectEvidence(workDir: string, config: HarnessConfig, contract?: Contract): Promise<EvidenceResult>;

interface Adapter {
    readonly kind: AdapterKind;
    execute(input: AdapterInput): Promise<AdapterOutput>;
}
declare class CustomAdapter implements Adapter {
    readonly kind: "custom";
    execute(input: AdapterInput): Promise<AdapterOutput>;
}
declare class ClaudeCodeAdapter implements Adapter {
    readonly kind: "claude-code";
    execute(input: AdapterInput): Promise<AdapterOutput>;
}
declare class CodexAdapter implements Adapter {
    readonly kind: "codex";
    execute(input: AdapterInput): Promise<AdapterOutput>;
}
declare function createAdapter(kind: AdapterKind): Adapter;

declare function evaluateCommitGate(evidence: EvidenceResult, adapterExitCode: number): CommitGateResult;

declare function detectProjectType(workDir: string): Promise<ProjectType>;
declare function getDefaultRequiredChecks(projectType: ProjectType): RequiredCheck[];

declare function generatePlan(contract: Contract): string;

declare function createTemplateDraft(name: string, contract: Contract, report: TaskReport, config: HarnessConfig): TemplateDraft;
declare function deriveTemplateName(goal: string): string;
declare function saveTemplateDraft(workDir: string, template: TemplateDraft): Promise<string>;

declare function assemblePrompt(ctx: TaskContext): string;

declare function createTaskReport(ctx: TaskContext, adapter: AdapterOutput, evidence: EvidenceResult, commitGate: CommitGateResult): TaskReport;

declare const HARNESS_DIRNAME = ".harness";
interface HarnessPaths {
    harnessDir: string;
    domainsDir: string;
    hostsDir: string;
    tasksDir: string;
    templatesDir: string;
    configFile: string;
    globalRulesFile: string;
    activeTaskFile: string;
}
declare function getHarnessPaths(workDir: string): HarnessPaths;
declare function ensureHarnessDirectories(workDir: string): Promise<HarnessPaths>;
declare function renderGlobalRulesTemplate(): string;
declare function writeFileIfChanged(filePath: string, content: string, force?: boolean): Promise<'created' | 'updated' | 'skipped'>;
declare function loadHarnessConfig(workDir: string): Promise<HarnessConfig>;
declare function writeHarnessConfig(workDir: string, config: HarnessConfig, force?: boolean): Promise<'created' | 'updated' | 'skipped'>;

declare function runScopeCheck(contract: Contract | undefined, changedFiles: string[]): EvidenceCheckResult;

declare class TaskManager {
    private loadConfig;
    private getTasksDir;
    private getActiveTaskFile;
    private getTaskDir;
    private getStateFile;
    private getMetaFile;
    private getContractFile;
    private getPlanFile;
    private getPromptFile;
    private getReportFile;
    private getFeedbackFile;
    private generateTaskId;
    setActiveTask(workDir: string, taskId: string): Promise<void>;
    create(goal: string, workDir: string): Promise<TaskContext>;
    saveState(ctx: TaskContext): Promise<void>;
    saveContract(ctx: TaskContext, contract: Contract): Promise<void>;
    savePlan(ctx: TaskContext, plan: string): Promise<void>;
    savePrompt(ctx: TaskContext, prompt: string): Promise<string>;
    saveReport(ctx: TaskContext, report: TaskReport): Promise<void>;
    saveFeedback(ctx: TaskContext, feedback: string): Promise<void>;
    clearFeedback(ctx: TaskContext): Promise<void>;
    markFailure(ctx: TaskContext, stage: string, reason: string): Promise<void>;
    markRetrying(ctx: TaskContext): Promise<void>;
    loadReport(taskId: string, workDir: string): Promise<TaskReport | null>;
    load(taskId: string, workDir: string): Promise<TaskContext>;
    resume(taskId: string, workDir: string): Promise<TaskContext>;
    listTasks(workDir: string): Promise<TaskSummary[]>;
    getLatestTaskId(workDir: string): Promise<string | null>;
}

interface BuiltinTemplateDefinition {
    name: TemplateName;
    description: string;
    keywords: string[];
    defaultRiskLevel: RiskLevel;
    defaultScopeInclude: string[];
    defaultScopeExclude: string[];
    defaultAcceptanceCriteria: string[];
    defaultOutOfScope: string[];
}
declare class TemplateRegistry {
    private readonly templates;
    constructor(initialTemplates?: BuiltinTemplateDefinition[]);
    list(): BuiltinTemplateDefinition[];
    get(name: TemplateName): BuiltinTemplateDefinition;
    match(goal: string): BuiltinTemplateDefinition;
}
declare function createTemplateRegistry(): TemplateRegistry;
declare function getBuiltinTemplates(): BuiltinTemplateDefinition[];
declare function matchTemplate(goal: string): TemplateName;

declare function runLevel2Validation(workDir: string, contract?: Contract): Promise<EvidenceCheckResult[]>;

interface WorkflowRunOptions {
    adapterKind: AdapterKind;
    adapterCommand?: string;
    dryRun: boolean;
    resumeFrom?: 'contract' | 'plan' | 'execute';
}
declare class WorkflowEngine {
    private readonly manager;
    constructor(manager: TaskManager);
    run(ctx: TaskContext, options: WorkflowRunOptions): Promise<{
        report?: TaskReport;
        dryRun: boolean;
    }>;
}

declare const CORE_PACKAGE_NAME = "@harnessly/core";
interface CorePackageInfo {
    name: string;
    version: string;
    dependsOn: string[];
}
declare function getCorePackageInfo(): CorePackageInfo;

export { type Adapter, AnthropicClient, type AnthropicClientOptions, type BuiltinTemplateDefinition, CORE_PACKAGE_NAME, ClaudeCodeAdapter, CodexAdapter, type ContractGenerationOptions, type CorePackageInfo, CustomAdapter, HARNESS_DIRNAME, type HarnessPaths, type LLMClient, type StructuredGenerationOptions, TaskManager, TemplateRegistry, type TextGenerationOptions, WorkflowEngine, type WorkflowRunOptions, assemblePrompt, checkContract, collectChangedFiles, collectEvidence, createAdapter, createDefaultHarnessConfig, createLLMClientFromEnv, createTaskReport, createTemplateDraft, createTemplateRegistry, deriveTemplateName, detectProjectType, ensureHarnessDirectories, evaluateCommitGate, generateContract, generateFallbackContract, generatePlan, getBuiltinTemplates, getCorePackageInfo, getDefaultRequiredChecks, getHarnessPaths, loadHarnessConfig, matchTemplate, parseHarnessConfig, renderGlobalRulesTemplate, runLevel2Validation, runScopeCheck, saveTemplateDraft, serializeHarnessConfig, writeFileIfChanged, writeHarnessConfig };
