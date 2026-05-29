import { AgentRole, AgentManifest, StageMarker, AssetPromotion, HarnessMetaFile, SourceTaskEntry, ArchiveTopicSummary, ArchiveTopicDetail, WorkflowPreset, EvidenceCheckResult, ProjectType, HostName, HarnessConfig, TemplateName, Contract, ContractGateResult, EvidenceResult, EvidenceSnapshot, BaselineDiff, EvidenceBaseline, AdapterKind, AdapterInput, AdapterOutput, FeedbackEntry, PromoteAction, TaskContext, TaskReport, Finding, FindingGroup, CommitGateResult, RequiredCheck, TemplateDraft, ResidentReviewResult, Skill, PresetSource, TaskSummary, RiskLevel } from '@brawnen/harnessly-shared';
import { z } from 'zod';

/**
 * v3-core 5 角色固定枚举。顺序对应 SPEC §6 阶段顺序，
 * 用于 init 时的默认写入次序与 status 命令的展示顺序。
 */
declare const AGENT_ROLES: readonly AgentRole[];
interface AgentDiskFiles {
    manifestPath: string;
    promptPath: string;
}
declare function getAgentDiskFiles(workDir: string, role: AgentRole): AgentDiskFiles;
declare function getDefaultAgentManifest(role: AgentRole): AgentManifest;
/**
 * 读取单个 agent 的磁盘定义。
 * 缺 yaml 视为未启用（返回 null）；缺 prompt.md 用空串兜底，避免 host 渲染崩溃。
 */
declare function loadAgentManifest(workDir: string, role: AgentRole): Promise<AgentManifest | null>;
/**
 * 加载 .harness/agents/ 下所有已知角色的 manifest。
 * 未在磁盘上的角色不会出现在结果里；调用方需自行处理缺失情况。
 *
 * 返回顺序与 AGENT_ROLES 一致，便于稳定渲染。
 */
declare function loadAgentManifests(workDir: string): Promise<AgentManifest[]>;
/**
 * 列出磁盘上 agents 目录里的所有 yaml 文件名（含未在 AGENT_ROLES 里的自定义文件），
 * 用于 status / debug 场景。
 */
declare function listAgentFiles(workDir: string): Promise<string[]>;
interface AgentWriteResult {
    role: AgentRole;
    manifestStatus: 'created' | 'updated' | 'skipped';
    promptStatus: 'created' | 'updated' | 'skipped';
}
/**
 * 把 5 个默认 manifest 写入 .harness/agents/。
 * - 已存在且与默认值一致：skipped
 * - 已存在但不同：force=false 时 skipped（保护用户改动），force=true 时 updated
 * - 不存在：created
 */
/**
 * v3-core 的角色路由意图，用于 hook / CLI 决定推荐哪一个 sub-agent。
 *
 * - 'new_task'         : 新任务入口，倾向 spec 阶段 → harness-requirement
 * - 'resume_task'      : 续接 active task，按当前 stage 路由
 * - 'completion_review': 任务完成时复查，按 lastFailureStage / currentStage 路由
 */
type AgentRoutingIntent = 'new_task' | 'resume_task' | 'completion_review';
/**
 * 从 stage 推断对应的 v3-core 角色（不考虑是否启用）。
 * 用于诊断与文档；调用方需自行判断 enabledRoles。
 */
declare function getRoleForStage(stage: StageMarker): AgentRole | null;
declare function pickRecommendedAgent(intent: AgentRoutingIntent, stage: StageMarker | null, enabledRoles: ReadonlySet<AgentRole>): string | null;
/**
 * 从 manifests 列表收集 enabled=true 的角色集合，便于 pickRecommendedAgent 消费。
 */
declare function collectEnabledRoles(manifests: readonly AgentManifest[]): Set<AgentRole>;
declare function writeDefaultAgentManifests(workDir: string, force?: boolean): Promise<AgentWriteResult[]>;

/**
 * v3-core §22 Knowledge Asset Promotion 实施。
 *
 * 关键约束：
 * - 只写 repo 内 docs/architecture/<topic>/，绝不写用户 home
 * - _harness-meta.json：每个 topic 一个，source_tasks 仅追加
 * - README.md 使用 <!-- harness:auto-start --> / <!-- harness:auto-end --> 标记
 */
type ArchiveKind = 'requirement' | 'design' | 'both';
interface ArchiveOptions {
    topic?: string;
    mode?: AssetPromotion['mode'];
    force?: boolean;
}
interface ArchivedFile {
    source: string;
    target: string;
    status: 'created' | 'updated' | 'skipped';
    versionSuffix?: string;
}
interface ArchiveResult {
    taskId: string;
    topic: string;
    targetDir: string;
    files: ArchivedFile[];
}
declare function getHarnessMetaPath(topicDir: string): string;
declare function loadHarnessMeta(topicDir: string): Promise<HarnessMetaFile | null>;
declare function saveHarnessMeta(topicDir: string, meta: HarnessMetaFile): Promise<void>;
declare function appendToHarnessMeta(existing: HarnessMetaFile | null, topic: string, entry: SourceTaskEntry): HarnessMetaFile;
interface PromoteTaskOptions {
    topic: string;
    files: string[];
    mode: AssetPromotion['mode'];
    skipMeta?: boolean;
}
/**
 * v3-core §22.2 知识资产晋升核心函数。
 *
 * 1. 读 task 工件
 * 2. 按 mode 决定目标路径（new_topic 冲突抛错 / append -vN / replace 备份）
 * 3. 复制文件
 * 4. 更新 _harness-meta.json（仅追加）
 * 5. 重新生成 README.md（保留标记外用户编辑）
 */
declare function promoteTaskArtifacts(workDir: string, taskId: string, options: PromoteTaskOptions): Promise<ArchiveResult>;
declare function listArchiveTopics(workDir: string): Promise<ArchiveTopicSummary[]>;
declare function showArchiveTopic(workDir: string, topic: string): Promise<ArchiveTopicDetail | null>;
/**
 * 校验所有 topic 的 _harness-meta.json 来源完整性。
 * 报告孤儿 topic（有 meta 但 source_tasks 引用的 task 已不存在）。
 */
declare function verifyArchive(workDir: string): Promise<{
    topic: string;
    orphanTasks: string[];
    valid: boolean;
}[]>;
interface ArchiveTargetPaths {
    archDir: string;
    topicDir: string;
}
declare function getArchiveTargetPaths(workDir: string, _taskId: string, topic?: string): ArchiveTargetPaths;
/** @deprecated 使用 promoteTaskArtifacts */
declare function archiveTaskArtifacts(workDir: string, taskId: string, kind: ArchiveKind, options?: ArchiveOptions): Promise<ArchiveResult>;

declare function runArtifactGuard(taskDir: string, preset?: WorkflowPreset): Promise<EvidenceCheckResult>;
interface WriteCheckResult {
    allowed: boolean;
    reason: string;
    file: string;
    currentStage?: string;
    requiredStage?: string;
}
/**
 * 检查当前是否有权写入指定文件路径。
 *
 * 规则（SPEC §10）：
 * - `docs/architecture/` 路径仅系统命令可写 → 拒绝
 * - `.harness/tasks/<id>/<artifact>` 匹配 → 读 state.json 对比 currentStage
 * - 非任务工件路径 → 放行
 */
declare function checkWritePermission(workDir: string, filePath: string, activeTaskId?: string): Promise<WriteCheckResult>;

declare function createDefaultHarnessConfig(projectType: ProjectType, hosts?: HostName[]): HarnessConfig;
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
    taskId?: string;
    goal: string;
    templateName: TemplateName;
    llmClient?: LLMClient | null;
}
declare function generateFallbackContract(goal: string, templateName: TemplateName, taskId?: string): Contract;
declare function generateContract(options: ContractGenerationOptions): Promise<Contract>;
declare function checkContract(contract: Contract): ContractGateResult;

declare function collectChangedFiles(workDir: string): Promise<string[]>;
declare function collectEvidence(workDir: string, config: HarnessConfig, contract?: Contract): Promise<EvidenceResult>;

/**
 * v3-core §6.5 Baseline-diff Evidence 实施。
 *
 * 把"任务开始前已经失败的 check 名字"快照下来，让 commit gate 区分：
 * - 任务引入的新回归（block）
 * - 任务无关的旧失败（preExistingFailures，不 block）
 *
 * 落盘位置：.harness/evidence-baseline.json
 * 全局共享，多个 task 复用同一个 baseline。
 */
declare const EVIDENCE_BASELINE_FILENAME = "evidence-baseline.json";
declare function getEvidenceBaselinePath(workDir: string): string;
declare function getTaskEvidenceDir(taskDir: string): string;
declare function getTaskEvidencePath(taskDir: string, kind: 'baseline' | 'current' | 'baseline-diff'): string;
/**
 * 从一次 evidence 采集结果派生 baseline。
 * 只取 check.status === 'failed' 的 name，按字母排序保证落盘稳定。
 */
declare function buildEvidenceBaseline(evidence: EvidenceResult): EvidenceBaseline;
declare function buildEvidenceSnapshot(evidence: EvidenceResult): EvidenceSnapshot;
declare function buildBaselineDiff(baseline: EvidenceSnapshot, current: EvidenceSnapshot): BaselineDiff;
declare function saveEvidenceSnapshot(taskDir: string, kind: 'baseline' | 'current', snapshot: EvidenceSnapshot): Promise<void>;
declare function saveBaselineDiff(taskDir: string, diff: BaselineDiff): Promise<void>;
/**
 * 加载磁盘上的 baseline。文件不存在或损坏时返回 null（让 gate 退化为不带 baseline 的旧行为）。
 */
declare function loadEvidenceBaseline(workDir: string): Promise<EvidenceBaseline | null>;
/**
 * 把 baseline 写到磁盘。文件采用 pretty-printed JSON，便于人查看。
 */
declare function saveEvidenceBaseline(workDir: string, baseline: EvidenceBaseline): Promise<void>;

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
/**
 * Codex adapter 默认执行命令：通过 stdin 把 prompt 文件喂给 `codex exec`。
 * 提取为导出常量，便于单测直接断言命令拼接（不必真实跑 codex 二进制）。
 */
declare const DEFAULT_CODEX_COMMAND = "codex exec --full-auto - < \"$HARNESSLY_PROMPT_FILE\"";
declare class CodexAdapter implements Adapter {
    readonly kind: "codex";
    execute(input: AdapterInput): Promise<AdapterOutput>;
}
declare function createAdapter(kind: AdapterKind): Adapter;

/**
 * Feedback Pool 落盘文件名（JSONL，append-only）。
 * 故意不放在 .harness/feedback-pool/ 子目录下，让用户可以一眼看见。
 */
declare const FEEDBACK_POOL_FILENAME = "feedback-pool.jsonl";
declare function getFeedbackPoolPath(workDir: string): string;
declare function getFeedbackHistoryPath(workDir: string): string;
/**
 * 把 task ctx + report 转成一条 FeedbackEntry。
 * 输入是只读的；输出可直接交给 appendFeedbackEntry。
 */
declare function buildFeedbackEntry(ctx: TaskContext, report: TaskReport): FeedbackEntry;
/**
 * 追加一条 feedback entry 到 .harness/feedback-pool.jsonl。
 *
 * 设计要点：
 * - JSONL append-only：并发追加场景下行边界由文件系统保证（POSIX append 原子性）
 * - 不做去重：同一 taskId 多次完成（重试后再 pass）会产生多条记录，便于诊断
 * - 校验 entry 合规：非法 entry 不进 pool（防止脏数据污染未来 prompt 注入）
 */
declare function appendFeedbackEntry(workDir: string, entry: FeedbackEntry): Promise<void>;
/**
 * 按文件顺序加载所有 feedback entries。损坏行（非 JSON 或 schema 不合规）静默跳过，
 * 不让"一行坏掉拖垮整个 pool"，但调用方会拿到部分结果。
 */
declare function loadFeedbackPool(workDir: string): Promise<FeedbackEntry[]>;
interface PickRecentEntriesOptions {
    /** 全局取最近 N 条；0 表示不取 */
    globalLimit?: number;
    /** 同模板任务取最近 N 条；0 表示不取（即便 templateName 命中） */
    templateLimit?: number;
    /** 优先取同模板任务的 templateName */
    templateName?: TemplateName;
}
/**
 * 从 feedback pool 里挑最近条目，用于注入 PM prompt。
 *
 * 默认策略：
 * - 全局最近 5 条（优先观察"最近的整体趋势"）
 * - 若指定 templateName，则额外取同模板最近 3 条（"同类经验"）
 * - 两组合并去重，保持原顺序（旧→新），调用方自行决定渲染方向
 */
declare function pickRecentEntries(entries: readonly FeedbackEntry[], options?: PickRecentEntriesOptions): FeedbackEntry[];
/**
 * 把 feedback entries 渲染成单行字符串列表，用于嵌入 prompt。
 * 每条形如：`[<taskId>] (<template>, <decision>, retry=<n>) <goal>`
 */
declare function renderFeedbackEntriesAsLines(entries: readonly FeedbackEntry[]): string[];
declare function promoteFeedbackEntry(workDir: string, taskId: string, reason?: string): Promise<FeedbackEntry>;
/**
 * 按 category + summary trigram 相似度（阈值 0.6）聚类。
 * 对每组合并成员，计算建议晋升目标（所有成员 promotable_as 的交集）。
 */
declare function groupFindingsBySimilarity(findings: readonly Finding[], similarityThreshold?: number): FindingGroup[];
/**
 * 把晋升结果应用到仓库中：
 * - lint/structure_rule → 追加到 structure-rules.yaml
 * - review_prompt → 追加到 review-agents.yaml 对应 agent 的 prompt
 * - skill_fix_hint → 更新 skill 的 fix_hint_template
 * - failed_test → 生成测试文件
 */
declare function applyPromotion(workDir: string, action: PromoteAction): Promise<string>;
/**
 * 将已处理的 finding 从 pool 移到 feedback-history.md。
 */
declare function moveFindingsToHistory(workDir: string, action: PromoteAction): Promise<void>;

interface EvaluateCommitGateOptions {
    /**
     * 任务开始前采集的 evidence baseline。
     * 当传入时，baseline 中已经失败的 check 不会再次进入 failures，
     * 而是被记录到 preExistingFailures（任务无关旧问题）。
     */
    baseline?: EvidenceBaseline | null;
}
/**
 * 评估 commit_gate 决策。
 *
 * 三态规则（v3-core SPEC §6.6）：
 * - 任何硬性失败 → 'fail'（禁止 commit）
 * - 无硬性失败但存在软性告警 → 'needs_human_review'
 * - 全部通过 → 'pass'
 *
 * 当前硬性维度：
 * - adapter 退出码非 0
 * - evidence.checks 中任意 check 失败 **且** 该 check 不在 baseline.failedCheckNames 内
 *
 * 当前软性维度：
 * - changedFiles 为空（任务结束但工作区无变更，可能是空跑或问答类任务）
 *
 * baseline-diff（Phase 3.3）：
 * - check 在 baseline 中已经失败 → 不计入 failures，进 preExistingFailures（任务无关）
 * - check 在 baseline 中通过/缺失，本次失败 → 计入 failures（任务引入的回归）
 */
declare function evaluateCommitGate(evidence: EvidenceResult, adapterExitCode: number, options?: EvaluateCommitGateOptions): CommitGateResult;

declare function detectProjectType(workDir: string): Promise<ProjectType>;
declare function getDefaultRequiredChecks(projectType: ProjectType): RequiredCheck[];

declare function generatePlan(contract: Contract): string;

declare function createTemplateDraft(name: string, contract: Contract, report: TaskReport, config: HarnessConfig): TemplateDraft;
declare function deriveTemplateName(goal: string): string;
declare function saveTemplateDraft(workDir: string, template: TemplateDraft): Promise<string>;

/**
 * 组装传给 adapter（headless 模式）或外部 coding agent 的执行 prompt。
 *
 * 输入：TaskContext（含 contract / plan / state / feedback）
 * 输出：分块文本 prompt，按 v3-core 6 阶段语义分别提示
 *
 * 注意：宿主主路径下，主 agent 自己组装 prompt，不会调用本函数；
 * 本函数主要服务于 execute 阶段的 adapter 子进程或 CLI fallback。
 */
declare function assemblePrompt(ctx: TaskContext): string;

declare function createTaskReport(ctx: TaskContext, adapter: AdapterOutput, evidence: EvidenceResult, commitGate: CommitGateResult): TaskReport;

/**
 * v3-core §14 常驻 review agent 核心入口。
 *
 * 根据 trigger 筛选 review-agents.yaml 中匹配的 agent，
 * 并行 spawn，收集 findings，写入 resident-review.md。
 *
 * 当前版本为 CLI 触发式（通过 git hook 或手动调用）。
 */
declare function runResidentReview(workDir: string, trigger: string, activeTaskId?: string): Promise<ResidentReviewResult>;
/**
 * 渲染 resident-review.md 内容（兼容旧接口，供 workflow 中 review 阶段调用）。
 */
declare function renderResidentReview(workDir: string, findings: readonly EvidenceCheckResult[]): Promise<string>;

declare function runReviewStage(changedFiles: string[]): EvidenceCheckResult[];

declare const HARNESS_DIRNAME = ".harness";
interface HarnessPaths {
    harnessDir: string;
    agentsDir: string;
    domainsDir: string;
    hostsDir: string;
    tasksDir: string;
    templatesDir: string;
    skillsDir: string;
    configFile: string;
    structureRulesFile: string;
    reviewAgentsFile: string;
    activeTaskFile: string;
}
declare function getHarnessPaths(workDir: string): HarnessPaths;
declare function renderStructureRulesTemplate(): string;
declare function renderReviewAgentsTemplate(): string;
declare function ensureHarnessDirectories(workDir: string): Promise<HarnessPaths>;
declare function writeFileIfChanged(filePath: string, content: string, force?: boolean): Promise<'created' | 'updated' | 'skipped'>;
declare function loadHarnessConfig(workDir: string): Promise<HarnessConfig>;
declare function writeHarnessConfig(workDir: string, config: HarnessConfig, force?: boolean): Promise<'created' | 'updated' | 'skipped'>;

declare function getSkillPath(workDir: string, checkName: RequiredCheck, language: ProjectType): string;
declare function loadSkill(workDir: string, checkName: RequiredCheck, language: ProjectType): Promise<Skill | null>;
declare function renderSkillTemplate(checkName: RequiredCheck, language: ProjectType, command: string): string;
interface SkillWriteResult {
    check: RequiredCheck;
    language: ProjectType;
    status: 'created' | 'updated' | 'skipped';
}
declare function writeDefaultSkillManifests(workDir: string, language: ProjectType, requiredChecks: readonly RequiredCheck[], force?: boolean): Promise<SkillWriteResult[]>;
declare function runSkillCheck(workDir: string, checkName: RequiredCheck, language: ProjectType): Promise<EvidenceCheckResult>;

interface ScopeViolation {
    file: string;
    pattern: string;
}
declare function runScopeCheck(contract: Contract | undefined, changedFiles: string[]): EvidenceCheckResult;

declare function runStructureCheck(workDir: string, changedFiles: string[]): Promise<EvidenceCheckResult[]>;

/**
 * 创建任务时可传入的可选参数 (v2.1 新增)。
 * - preset: 任务级 Workflow Preset；缺省 lite (SPEC §6.4.1)
 * - presetSource: preset 设置来源；缺省 slash_command
 */
interface CreateTaskOptions {
    preset?: WorkflowPreset;
    presetSource?: PresetSource;
}
declare class TaskManager {
    private loadConfig;
    private getTasksDir;
    private getActiveTaskFile;
    private getTaskDir;
    private getStateFile;
    private getMetaFile;
    private getContractFile;
    private getRequirementFile;
    private getDesignFile;
    private getTaskBreakdownFile;
    private getImplementationNotesFile;
    private getReviewFile;
    private getResidentReviewFile;
    private getTestReportFile;
    private getPlanFile;
    private getPromptFile;
    private getReportFile;
    private getFeedbackFile;
    private generateTaskId;
    setActiveTask(workDir: string, taskId: string): Promise<void>;
    create(goal: string, workDir: string, options?: CreateTaskOptions): Promise<TaskContext>;
    saveState(ctx: TaskContext): Promise<void>;
    saveContract(ctx: TaskContext, contract: Contract): Promise<void>;
    saveRequirement(ctx: TaskContext, requirement: string): Promise<void>;
    savePlan(ctx: TaskContext, plan: string): Promise<void>;
    saveDesign(ctx: TaskContext, design: string): Promise<void>;
    saveTaskBreakdown(ctx: TaskContext, taskBreakdown: string): Promise<void>;
    saveImplementationNotes(ctx: TaskContext, notes: string): Promise<void>;
    saveReviewMarkdown(ctx: TaskContext, review: string): Promise<void>;
    saveResidentReview(ctx: TaskContext, review: string): Promise<void>;
    saveTestReport(ctx: TaskContext, report: string): Promise<void>;
    savePrompt(ctx: TaskContext, prompt: string): Promise<string>;
    saveReport(ctx: TaskContext, report: TaskReport): Promise<void>;
    saveFeedback(ctx: TaskContext, feedback: string): Promise<void>;
    /**
     * 向 commit-summary.md 追加一个小节。用于声明式晋升等场景记录。
     * best-effort：写入失败不抛。
     */
    appendCommitSummarySection(ctx: TaskContext, heading: string, content: string): Promise<void>;
    clearFeedback(ctx: TaskContext): Promise<void>;
    markFailure(ctx: TaskContext, stage: StageMarker, reason: string): Promise<void>;
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

/**
 * resumeFrom 取值对应 v3-core 主阶段：
 * - 'spec': Planner 重出 contract.yaml（SPEC 工件）
 * - 'design': Planner 重出 plan.md（Design 工件）
 * - 'execute': 主 agent 重做实施
 */
interface WorkflowRunOptions {
    adapterKind: AdapterKind;
    adapterCommand?: string;
    dryRun: boolean;
    resumeFrom?: 'spec' | 'design' | 'execute';
}
/**
 * v3-core SPEC §6 工作流引擎。
 *
 * 主干 6 阶段（固定顺序、不允许扩展为 DAG）：
 *   spec → design → execute → review → test → commit_gate
 *
 * Phase 1 落地范围（结构层）：
 * - spec / design：仍由 LLM Planner + 确定性派生承担（sub-agent 接管见 Phase 2）
 * - execute：调 adapter 子进程
 * - review：占位静态检查（reviewer sub-agent 接管见 Phase 2）
 * - test：跑 evidence checks
 * - commit_gate：聚合三态决策（pass / block / warn）
 */
declare class WorkflowEngine {
    private readonly manager;
    constructor(manager: TaskManager);
    private baselineSnapshot;
    run(ctx: TaskContext, options: WorkflowRunOptions): Promise<{
        report?: TaskReport;
        dryRun: boolean;
    }>;
    /**
     * lite preset 在 test 阶段 PASS 后的终止处理。
     *
     * 与 full preset 的差异：
     * - 不调 evaluateCommitGate（无 commit_gate 阶段）
     * - 不产出 report.json / commit-summary.md
     * - 直接把 state.status 标 completed、state.currentStage 标 test
     *
     * lite 模式下 asset promotion 的触发点改为本函数（SPEC §22.2.1 修订），
     * 但具体调用 promoteTaskArtifacts 推迟到阶段 2 实施。
     */
    private finalizeLitePreset;
    /**
     * Stage 1: spec
     * 产出 contract.yaml（v3-core 中等价于 SPEC 工件）。
     * spec_gate：contract 合规性校验，失败即在 spec 阶段标记失败。
     */
    private executeSpecStage;
    /**
     * Stage 2: design
     * 基于 contract 派生 plan.md（v3-core 中等价于 Design 工件）。
     * Phase 2 中将由 designer sub-agent 接管，产出语义更丰富的 design.md。
     */
    private executeDesignStage;
    /**
     * Stage 3: execute
     * 调用 adapter（headless 模式下走子进程；宿主主路径下由主 agent 直接执行）。
     */
    private executeExecuteStage;
    /**
     * Stage 4: review
     * Phase 1 中为占位实现：基于 changedFiles 跑确定性静态检查（敏感文件、改动规模）。
     * Phase 2 中将由 reviewer sub-agent 接管，做语义层代码审查。
     */
    private executeReviewStage;
    /**
     * Stage 5: test
     * 跑 evidence checks（required checks + scope check + level2 检查），
     * 并把 review 阶段的发现合入 evidence.checks 一起进 commit_gate。
     */
    private executeTestStage;
    /**
     * Stage 6: commit_gate
     * 三态聚合决策：
     * - 任何硬性失败 → block
     * - 无硬性失败但有软性告警 → warn
     * - 全部通过 → pass
     *
     * report.commitReady 仅在 decision==='pass' 时为 true，warn 不自动放行。
     */
    private executeCommitGateStage;
}

declare const CORE_PACKAGE_NAME = "@brawnen/harnessly-core";
interface CorePackageInfo {
    name: string;
    version: string;
    dependsOn: string[];
}
declare function getCorePackageInfo(): CorePackageInfo;

export { AGENT_ROLES, type Adapter, type AgentDiskFiles, type AgentRoutingIntent, type AgentWriteResult, AnthropicClient, type AnthropicClientOptions, type ArchiveKind, type ArchiveOptions, type ArchiveResult, type ArchiveTargetPaths, type ArchivedFile, type BuiltinTemplateDefinition, CORE_PACKAGE_NAME, ClaudeCodeAdapter, CodexAdapter, type ContractGenerationOptions, type CorePackageInfo, type CreateTaskOptions, CustomAdapter, DEFAULT_CODEX_COMMAND, EVIDENCE_BASELINE_FILENAME, type EvaluateCommitGateOptions, FEEDBACK_POOL_FILENAME, HARNESS_DIRNAME, type HarnessPaths, type LLMClient, type PickRecentEntriesOptions, type PromoteTaskOptions, type ScopeViolation, type SkillWriteResult, type StructuredGenerationOptions, TaskManager, TemplateRegistry, type TextGenerationOptions, WorkflowEngine, type WorkflowRunOptions, type WriteCheckResult, appendFeedbackEntry, appendToHarnessMeta, applyPromotion, archiveTaskArtifacts, assemblePrompt, buildBaselineDiff, buildEvidenceBaseline, buildEvidenceSnapshot, buildFeedbackEntry, checkContract, checkWritePermission, collectChangedFiles, collectEnabledRoles, collectEvidence, createAdapter, createDefaultHarnessConfig, createLLMClientFromEnv, createTaskReport, createTemplateDraft, createTemplateRegistry, deriveTemplateName, detectProjectType, ensureHarnessDirectories, evaluateCommitGate, generateContract, generateFallbackContract, generatePlan, getAgentDiskFiles, getArchiveTargetPaths, getBuiltinTemplates, getCorePackageInfo, getDefaultAgentManifest, getDefaultRequiredChecks, getEvidenceBaselinePath, getFeedbackHistoryPath, getFeedbackPoolPath, getHarnessMetaPath, getHarnessPaths, getRoleForStage, getSkillPath, getTaskEvidenceDir, getTaskEvidencePath, groupFindingsBySimilarity, listAgentFiles, listArchiveTopics, loadAgentManifest, loadAgentManifests, loadEvidenceBaseline, loadFeedbackPool, loadHarnessConfig, loadHarnessMeta, loadSkill, matchTemplate, moveFindingsToHistory, parseHarnessConfig, pickRecentEntries, pickRecommendedAgent, promoteFeedbackEntry, promoteTaskArtifacts, renderFeedbackEntriesAsLines, renderResidentReview, renderReviewAgentsTemplate, renderSkillTemplate, renderStructureRulesTemplate, runArtifactGuard, runLevel2Validation, runResidentReview, runReviewStage, runScopeCheck, runSkillCheck, runStructureCheck, saveBaselineDiff, saveEvidenceBaseline, saveEvidenceSnapshot, saveHarnessMeta, saveTemplateDraft, serializeHarnessConfig, showArchiveTopic, verifyArchive, writeDefaultAgentManifests, writeDefaultSkillManifests, writeFileIfChanged, writeHarnessConfig };
