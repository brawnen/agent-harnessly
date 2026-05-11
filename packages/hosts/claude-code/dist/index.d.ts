type HostName = 'claude-code' | 'codex' | 'gemini-cli';
/**
 * v3-core 主干工作流的 6 个固定阶段。
 * 与 SPEC §6.1 保持一致，禁止扩展为可编排 DAG。
 */
type WorkflowStage = 'spec' | 'design' | 'execute' | 'review' | 'test' | 'commit_gate';
interface HostManifest {
    host: HostName;
    version: string;
    enabled: boolean;
    repoLocalPaths: string[];
    sessionStartCommand: string;
    userPromptSubmitCommand: string;
    completionGateCommand: string;
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

/**
 * v3-core host renderer 选项：传入 5 角色 sub-agent manifest，
 * 由 renderer 生成 `.claude/agents/harness-<role>.md` 文件。
 * 仅渲染 manifest.enabled=true 的角色。
 */
interface ClaudeCodeManagedFilesOptions {
    agentManifests?: AgentManifest[];
}
declare function getClaudeCodeHostManifest(): HostManifest;
declare function renderClaudeCodeHookIo(manifest: HostManifest): string;
declare function renderClaudeCodeSessionStartHook(): string;
declare function renderClaudeCodeUserPromptSubmitHook(): string;
declare function renderClaudeCodeStopHook(): string;
declare function renderClaudeCodeSettings(_manifest: HostManifest): string;
declare function renderClaudeCodeManagedFiles(manifest: HostManifest, options?: ClaudeCodeManagedFilesOptions): Record<string, string>;

export { type ClaudeCodeManagedFilesOptions, getClaudeCodeHostManifest, renderClaudeCodeHookIo, renderClaudeCodeManagedFiles, renderClaudeCodeSessionStartHook, renderClaudeCodeSettings, renderClaudeCodeStopHook, renderClaudeCodeUserPromptSubmitHook };
