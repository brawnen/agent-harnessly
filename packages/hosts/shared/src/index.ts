import {
  HARNESSLY_VERSION,
  type AgentManifest,
  type AgentRole,
  type HostLifecycleCommands,
  type HostManifest,
  type HostName,
  parseBoolean,
  parseFlatYaml,
  parseStringList,
  serializeFlatYaml,
} from '@harnessly/shared';

export function getRepoLocalShellPaths(host: HostName): string[] {
  switch (host) {
    case 'claude-code':
      return [
        '.claude/settings.json',
        '.harness/hosts/claude-code/hooks/session_start.js',
        '.harness/hosts/claude-code/hooks/user_prompt_submit.js',
        '.harness/hosts/claude-code/hooks/stop.js',
        '.harness/hosts/claude-code/hooks/shared/claude-code-hook-io.js',
      ];
    case 'codex':
      return [
        '.codex/config.toml',
        '.codex/hooks.json',
        '.harness/hosts/codex/hooks/session_start.js',
        '.harness/hosts/codex/hooks/user_prompt_submit.js',
        '.harness/hosts/codex/hooks/stop.js',
        '.harness/hosts/codex/hooks/shared/codex-hook-io.js',
      ];
    case 'gemini-cli':
      return ['.gemini/settings.json'];
    default:
      return [];
  }
}

/**
 * 由 v3-core 5 角色 manifest 派生出的 host-specific sub-agent 文件路径。
 *
 * 当 manifest.enabled=false 时跳过；
 * 文件名采用 `harness-<role>.{md|toml}` 命名，避免与老的 harness-planner/evaluator 复合别名冲突。
 */
export function getRoleAgentFilePath(host: HostName, role: AgentRole): string | null {
  switch (host) {
    case 'claude-code':
      return `.claude/agents/harness-${role}.md`;
    case 'codex':
      return `.codex/agents/harness-${role}.toml`;
    case 'gemini-cli':
      // Gemini CLI 当前没有 sub-agent 文件结构，留空
      return null;
    default:
      return null;
  }
}

const CLAUDE_CODE_DEFAULT_TOOLS: readonly string[] = ['Read', 'Bash'];
const CODEX_DEFAULT_REASONING_EFFORT = 'medium';
const CODEX_DEFAULT_SANDBOX_MODE = 'read-only';

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
export function renderClaudeCodeSubagentFile(manifest: AgentManifest): string {
  const model = manifest.models['claude-code'] ?? 'sonnet';
  const tools =
    manifest.toolWhitelist.length > 0 ? manifest.toolWhitelist : [...CLAUDE_CODE_DEFAULT_TOOLS];

  const frontmatter = [
    '---',
    `name: harness-${manifest.role}`,
    `description: ${manifest.description}`,
    `model: ${model}`,
    'tools:',
    ...tools.map((tool) => `  - ${tool}`),
    '---',
    '',
  ];

  const body = manifest.prompt.trim().length > 0 ? manifest.prompt : `# Harness ${manifest.role}\n`;
  const ensureTrailingNewline = body.endsWith('\n') ? body : `${body}\n`;

  return `${frontmatter.join('\n')}${ensureTrailingNewline}`;
}

/**
 * 把 AgentManifest 渲染为 Codex 子代理 TOML。
 *
 * 输出格式契合 Codex `.codex/agents/<name>.toml`：top-level 键值（不使用 [section]），
 * developer_instructions 用 triple-double-quote 多行字符串。
 */
export function renderCodexSubagentFile(manifest: AgentManifest): string {
  const model = manifest.models.codex ?? 'gpt-5.5';
  const promptBody =
    manifest.prompt.trim().length > 0 ? manifest.prompt : `Harness ${manifest.role} agent.`;

  const lines = [
    '# Managed by Harnessly',
    `name = "harness-${manifest.role}"`,
    `description = ${JSON.stringify(manifest.description)}`,
    `model = ${JSON.stringify(model)}`,
    `model_reasoning_effort = ${JSON.stringify(CODEX_DEFAULT_REASONING_EFFORT)}`,
    `sandbox_mode = ${JSON.stringify(CODEX_DEFAULT_SANDBOX_MODE)}`,
    'developer_instructions = """',
    promptBody,
    '"""',
    '',
  ];

  return lines.join('\n');
}

export function createLifecycleCommands(binaryName = 'harnessly'): HostLifecycleCommands {
  return {
    sessionStart: `${binaryName} host session-start`,
    userPromptSubmit: `${binaryName} host user-prompt-submit`,
    completionGate: `${binaryName} host completion-gate`,
  };
}

export function createHostManifest(host: HostName, binaryName = 'harnessly'): HostManifest {
  const lifecycle = createLifecycleCommands(binaryName);

  return {
    host,
    version: HARNESSLY_VERSION,
    enabled: true,
    repoLocalPaths: getRepoLocalShellPaths(host),
    sessionStartCommand: lifecycle.sessionStart,
    userPromptSubmitCommand: lifecycle.userPromptSubmit,
    completionGateCommand: lifecycle.completionGate,
  };
}

export function getHostManifestFilename(host: HostName): string {
  return `${host}.yaml`;
}

export function serializeHostManifest(manifest: HostManifest): string {
  return serializeFlatYaml({
    host: manifest.host,
    version: manifest.version,
    enabled: manifest.enabled,
    repo_local_paths: manifest.repoLocalPaths,
    session_start_command: manifest.sessionStartCommand,
    user_prompt_submit_command: manifest.userPromptSubmitCommand,
    completion_gate_command: manifest.completionGateCommand,
  });
}

export function parseHostManifest(text: string): HostManifest {
  const raw = parseFlatYaml(text);
  const host = (raw.host ?? 'claude-code') as HostName;

  return {
    host,
    version: raw.version ?? HARNESSLY_VERSION,
    enabled: parseBoolean(raw.enabled, true),
    repoLocalPaths: parseStringList(raw.repo_local_paths),
    sessionStartCommand: raw.session_start_command ?? 'harnessly host session-start',
    userPromptSubmitCommand: raw.user_prompt_submit_command ?? 'harnessly host user-prompt-submit',
    completionGateCommand: raw.completion_gate_command ?? 'harnessly host completion-gate',
  };
}
