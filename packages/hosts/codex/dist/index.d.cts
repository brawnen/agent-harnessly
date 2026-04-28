type HostName = 'claude-code' | 'codex' | 'gemini-cli';
interface HostManifest {
    host: HostName;
    version: string;
    enabled: boolean;
    repoLocalPaths: string[];
    sessionStartCommand: string;
    userPromptSubmitCommand: string;
    completionGateCommand: string;
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

interface CodexHookRenderOptions {
    userPromptSubmitHookEnabled?: boolean;
}
interface CodexManagedFilesOptions extends CodexHookRenderOptions {
    subagents?: HostSubagentConfig;
}
declare function getCodexHostManifest(): HostManifest;
declare function renderCodexConfig(): string;
declare function renderCodexHooks(manifest: HostManifest, options?: CodexHookRenderOptions): string;
declare function renderCodexHookIo(manifest: HostManifest): string;
declare function renderCodexSessionStartHook(): string;
declare function renderCodexUserPromptSubmitHook(): string;
declare function renderCodexStopHook(): string;
declare function renderCodexPlannerAgent(config?: HostSubagentConfig): string;
declare function renderCodexEvaluatorAgent(config?: HostSubagentConfig): string;
declare function renderCodexManagedFiles(manifest: HostManifest, config?: HostSubagentConfig | CodexManagedFilesOptions): Record<string, string>;

export { type CodexHookRenderOptions, type CodexManagedFilesOptions, getCodexHostManifest, renderCodexConfig, renderCodexEvaluatorAgent, renderCodexHookIo, renderCodexHooks, renderCodexManagedFiles, renderCodexPlannerAgent, renderCodexSessionStartHook, renderCodexStopHook, renderCodexUserPromptSubmitHook };
