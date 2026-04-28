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

declare function getClaudeCodeHostManifest(): HostManifest;
declare function renderClaudeCodeSettings(manifest: HostManifest): string;
declare function renderClaudeCodePlannerAgent(config?: HostSubagentConfig): string;
declare function renderClaudeCodeEvaluatorAgent(config?: HostSubagentConfig): string;
declare function renderClaudeCodeManagedFiles(manifest: HostManifest, config?: HostSubagentConfig): Record<string, string>;

export { getClaudeCodeHostManifest, renderClaudeCodeEvaluatorAgent, renderClaudeCodeManagedFiles, renderClaudeCodePlannerAgent, renderClaudeCodeSettings };
