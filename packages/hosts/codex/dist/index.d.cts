import { AgentManifest, HostManifest } from '@brawnen/harnessly-shared';

interface CodexHookRenderOptions {
    userPromptSubmitHookEnabled?: boolean;
}
interface CodexManagedFilesOptions extends CodexHookRenderOptions {
    /**
     * v3-core 5 角色 sub-agent manifest。renderer 会生成
     * `.codex/agents/harness-<role>.toml`。仅 enabled=true 的角色被渲染。
     */
    agentManifests?: AgentManifest[];
}
declare function getCodexHostManifest(): HostManifest;
declare function renderCodexConfig(): string;
declare function renderCodexHooks(manifest: HostManifest, workDir: string, options?: CodexHookRenderOptions): string;
declare function renderCodexHookIo(manifest: HostManifest): string;
declare function renderCodexSessionStartHook(): string;
declare function renderCodexUserPromptSubmitHook(): string;
declare function renderCodexStopHook(): string;
declare function renderCodexManagedFiles(manifest: HostManifest, workDir: string, options?: CodexManagedFilesOptions): Record<string, string>;

export { type CodexHookRenderOptions, type CodexManagedFilesOptions, getCodexHostManifest, renderCodexConfig, renderCodexHookIo, renderCodexHooks, renderCodexManagedFiles, renderCodexSessionStartHook, renderCodexStopHook, renderCodexUserPromptSubmitHook };
