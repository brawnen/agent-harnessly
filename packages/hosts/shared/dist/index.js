// src/index.ts
import {
  HARNESSLY_VERSION,
  parseBoolean,
  parseFlatYaml,
  parseStringList,
  serializeFlatYaml
} from "@harnessly/shared";
function getRepoLocalShellPaths(host) {
  switch (host) {
    case "claude-code":
      return [
        ".claude/settings.json",
        ".claude/agents/harness-planner.md",
        ".claude/agents/harness-evaluator.md"
      ];
    case "codex":
      return [
        ".codex/config.toml",
        ".codex/hooks.json",
        ".harness/hosts/codex/hooks/session_start.js",
        ".harness/hosts/codex/hooks/user_prompt_submit.js",
        ".harness/hosts/codex/hooks/stop.js",
        ".harness/hosts/codex/hooks/shared/codex-hook-io.js",
        ".codex/agents/harness-planner.toml",
        ".codex/agents/harness-evaluator.toml"
      ];
    case "gemini-cli":
      return [".gemini/settings.json"];
    default:
      return [];
  }
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
  parseHostManifest,
  serializeHostManifest
};
