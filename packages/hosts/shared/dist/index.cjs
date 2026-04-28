"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  createHostManifest: () => createHostManifest,
  createLifecycleCommands: () => createLifecycleCommands,
  getHostManifestFilename: () => getHostManifestFilename,
  getRepoLocalShellPaths: () => getRepoLocalShellPaths,
  parseHostManifest: () => parseHostManifest,
  serializeHostManifest: () => serializeHostManifest
});
module.exports = __toCommonJS(index_exports);
var import_shared = require("@harnessly/shared");
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
    version: import_shared.HARNESSLY_VERSION,
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
  return (0, import_shared.serializeFlatYaml)({
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
  const raw = (0, import_shared.parseFlatYaml)(text);
  const host = raw.host ?? "claude-code";
  return {
    host,
    version: raw.version ?? import_shared.HARNESSLY_VERSION,
    enabled: (0, import_shared.parseBoolean)(raw.enabled, true),
    repoLocalPaths: (0, import_shared.parseStringList)(raw.repo_local_paths),
    sessionStartCommand: raw.session_start_command ?? "harnessly host session-start",
    userPromptSubmitCommand: raw.user_prompt_submit_command ?? "harnessly host user-prompt-submit",
    completionGateCommand: raw.completion_gate_command ?? "harnessly host completion-gate"
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  createHostManifest,
  createLifecycleCommands,
  getHostManifestFilename,
  getRepoLocalShellPaths,
  parseHostManifest,
  serializeHostManifest
});
