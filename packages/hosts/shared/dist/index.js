// src/index.ts
import {
  HARNESSLY_VERSION,
  parseBoolean,
  parseFlatYaml,
  parseStringList,
  serializeFlatYaml
} from "@brawnen/harnessly-shared";
function getRepoLocalShellPaths(host) {
  switch (host) {
    case "claude-code":
      return [
        ".claude/settings.json",
        ".harness/hosts/claude-code/hooks/session_start.js",
        ".harness/hosts/claude-code/hooks/user_prompt_submit.js",
        ".harness/hosts/claude-code/hooks/stop.js",
        ".harness/hosts/claude-code/hooks/shared/claude-code-hook-io.js"
      ];
    case "codex":
      return [
        ".codex/config.toml",
        ".codex/hooks.json",
        ".harness/hosts/codex/hooks/session_start.js",
        ".harness/hosts/codex/hooks/user_prompt_submit.js",
        ".harness/hosts/codex/hooks/stop.js",
        ".harness/hosts/codex/hooks/shared/codex-hook-io.js"
      ];
    case "gemini-cli":
      return [".gemini/settings.json"];
    default:
      return [];
  }
}
function getRoleAgentFilePath(host, role) {
  switch (host) {
    case "claude-code":
      return `.claude/agents/harness-${role}.md`;
    case "codex":
      return `.codex/agents/harness-${role}.toml`;
    case "gemini-cli":
      return null;
    default:
      return null;
  }
}
var CLAUDE_CODE_DEFAULT_TOOLS = ["Read", "Bash"];
var CODEX_DEFAULT_REASONING_EFFORT = "medium";
var CODEX_DEFAULT_SANDBOX_MODE = "read-only";
function renderClaudeCodeSubagentFile(manifest) {
  const model = manifest.models["claude-code"] ?? "sonnet";
  const tools = manifest.toolWhitelist.length > 0 ? manifest.toolWhitelist : [...CLAUDE_CODE_DEFAULT_TOOLS];
  const frontmatter = [
    "---",
    `name: harness-${manifest.role}`,
    `description: ${manifest.description}`,
    `model: ${model}`,
    "tools:",
    ...tools.map((tool) => `  - ${tool}`),
    "---",
    ""
  ];
  const body = manifest.prompt.trim().length > 0 ? manifest.prompt : `# Harness ${manifest.role}
`;
  const ensureTrailingNewline = body.endsWith("\n") ? body : `${body}
`;
  return `${frontmatter.join("\n")}${ensureTrailingNewline}`;
}
function renderCodexSubagentFile(manifest) {
  const model = manifest.models.codex ?? "gpt-5.5";
  const promptBody = manifest.prompt.trim().length > 0 ? manifest.prompt : `Harness ${manifest.role} agent.`;
  const lines = [
    "# Managed by Harnessly",
    `name = "harness-${manifest.role}"`,
    `description = ${JSON.stringify(manifest.description)}`,
    `model = ${JSON.stringify(model)}`,
    `model_reasoning_effort = ${JSON.stringify(CODEX_DEFAULT_REASONING_EFFORT)}`,
    `sandbox_mode = ${JSON.stringify(CODEX_DEFAULT_SANDBOX_MODE)}`,
    'developer_instructions = """',
    promptBody,
    '"""',
    ""
  ];
  return lines.join("\n");
}
function createLifecycleCommands(binaryName = "harnessly") {
  return {
    sessionStart: `${binaryName} host session-start`,
    userPromptSubmit: `${binaryName} host user-prompt-submit`,
    completionGate: `${binaryName} host completion-gate`
  };
}
function createHostManifest(host, binaryName = "harnessly") {
  const lifecycle = createLifecycleCommands(binaryName);
  return {
    host,
    version: HARNESSLY_VERSION,
    enabled: true,
    repoLocalPaths: getRepoLocalShellPaths(host),
    sessionStartCommand: lifecycle.sessionStart,
    userPromptSubmitCommand: lifecycle.userPromptSubmit,
    completionGateCommand: lifecycle.completionGate
  };
}
function getHostManifestFilename(host) {
  return `${host}.yaml`;
}
function serializeHostManifest(manifest) {
  return serializeFlatYaml({
    host: manifest.host,
    version: manifest.version,
    enabled: manifest.enabled,
    repo_local_paths: manifest.repoLocalPaths,
    session_start_command: manifest.sessionStartCommand,
    user_prompt_submit_command: manifest.userPromptSubmitCommand,
    completion_gate_command: manifest.completionGateCommand
  });
}
function parseHostManifest(text) {
  const raw = parseFlatYaml(text);
  const host = raw.host ?? "claude-code";
  return {
    host,
    version: raw.version ?? HARNESSLY_VERSION,
    enabled: parseBoolean(raw.enabled, true),
    repoLocalPaths: parseStringList(raw.repo_local_paths),
    sessionStartCommand: raw.session_start_command ?? "harnessly host session-start",
    userPromptSubmitCommand: raw.user_prompt_submit_command ?? "harnessly host user-prompt-submit",
    completionGateCommand: raw.completion_gate_command ?? "harnessly host completion-gate"
  };
}
export {
  createHostManifest,
  createLifecycleCommands,
  getHostManifestFilename,
  getRepoLocalShellPaths,
  getRoleAgentFilePath,
  parseHostManifest,
  renderClaudeCodeSubagentFile,
  renderCodexSubagentFile,
  serializeHostManifest
};
