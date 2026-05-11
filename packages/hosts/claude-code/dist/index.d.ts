import { AgentManifest, HostManifest } from '@brawnen/harnessly-shared';

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
declare function renderClaudeCodePreToolUseHook(): string;
declare function renderClaudeCodeSettings(_manifest: HostManifest): string;
declare function renderClaudeCodeManagedFiles(manifest: HostManifest, options?: ClaudeCodeManagedFilesOptions): Record<string, string>;

export { type ClaudeCodeManagedFilesOptions, getClaudeCodeHostManifest, renderClaudeCodeHookIo, renderClaudeCodeManagedFiles, renderClaudeCodePreToolUseHook, renderClaudeCodeSessionStartHook, renderClaudeCodeSettings, renderClaudeCodeStopHook, renderClaudeCodeUserPromptSubmitHook };
