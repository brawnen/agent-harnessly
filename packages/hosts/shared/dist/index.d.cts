import { HostName, HostManifest, HostLifecycleCommands, AgentRole, AgentManifest } from '@brawnen/harnessly-shared';

declare function getRepoLocalShellPaths(host: HostName): string[];
/**
 * 由 v3-core 5 角色 manifest 派生出的 host-specific sub-agent 文件路径。
 *
 * 当 manifest.enabled=false 时跳过；
 * 文件名采用 `harness-<role>.{md|toml}` 命名，避免与老的 harness-planner/evaluator 复合别名冲突。
 */
declare function getRoleAgentFilePath(host: HostName, role: AgentRole): string | null;
/**
 * 把 AgentManifest 渲染为 Claude Code 子代理的 Markdown frontmatter + 正文。
 *
 * 输出格式契合 https://docs.claude.com/en/docs/claude-code/sub-agents：
 * ---
 * name: harness-<role>
 * description: ...
 * model: ...
 * tools: [Read, Bash, ...]
 * ---
 *
 * <prompt>
 */
declare function renderClaudeCodeSubagentFile(manifest: AgentManifest): string;
/**
 * 把 AgentManifest 渲染为 Codex 子代理 TOML。
 *
 * 输出格式契合 Codex `.codex/agents/<name>.toml`：top-level 键值（不使用 [section]），
 * developer_instructions 用 triple-double-quote 多行字符串。
 */
declare function renderCodexSubagentFile(manifest: AgentManifest): string;
declare function createLifecycleCommands(binaryName?: string): HostLifecycleCommands;
declare function createHostManifest(host: HostName, binaryName?: string): HostManifest;
declare function getHostManifestFilename(host: HostName): string;
declare function serializeHostManifest(manifest: HostManifest): string;
declare function parseHostManifest(text: string): HostManifest;

export { createHostManifest, createLifecycleCommands, getHostManifestFilename, getRepoLocalShellPaths, getRoleAgentFilePath, parseHostManifest, renderClaudeCodeSubagentFile, renderCodexSubagentFile, serializeHostManifest };
