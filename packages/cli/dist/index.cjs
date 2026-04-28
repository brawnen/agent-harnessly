#!/usr/bin/env node
"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
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
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  getCliRuntimeSummary: () => getCliRuntimeSummary
});
module.exports = __toCommonJS(index_exports);
var import_node_url = require("url");
var import_core4 = require("@harnessly/core");

// src/commands/init.ts
var import_promises2 = require("fs/promises");
var import_core2 = require("@harnessly/core");

// src/utils/hosts.ts
var import_promises = require("fs/promises");
var import_node_path = __toESM(require("path"), 1);
var import_core = require("@harnessly/core");
var import_host_claude_code = require("@harnessly/host-claude-code");
var import_host_shared = require("@harnessly/host-shared");
async function readFileIfExists(filePath) {
  try {
    return await (0, import_promises.readFile)(filePath, "utf8");
  } catch {
    return null;
  }
}
async function ensureHostManifest(workDir, host) {
  const manifestPath = import_node_path.default.join((0, import_core.getHarnessPaths)(workDir).hostsDir, (0, import_host_shared.getHostManifestFilename)(host));
  const existing = await readFileIfExists(manifestPath);
  if (existing) {
    return (0, import_host_shared.parseHostManifest)(existing);
  }
  const manifest = (0, import_host_shared.createHostManifest)(host);
  await (0, import_promises.writeFile)(manifestPath, (0, import_host_shared.serializeHostManifest)(manifest), "utf8");
  return manifest;
}
async function loadEnabledHosts(workDir, requestedHost) {
  if (requestedHost && requestedHost !== "auto" && requestedHost !== "all") {
    return [requestedHost];
  }
  const config = await (0, import_core.loadHarnessConfig)(workDir);
  if (requestedHost === "all") {
    return config.enabledHosts;
  }
  if (config.enabledHosts.length > 0) {
    return config.enabledHosts;
  }
  return [config.defaultHost];
}
function renderRepoLocalShell(manifest) {
  switch (manifest.host) {
    case "claude-code":
      return {
        ".claude/settings.json": (0, import_host_claude_code.renderClaudeCodeSettings)(manifest)
      };
    default:
      return {};
  }
}
async function installHostShells(workDir, requestedHost) {
  const installedPaths = [];
  const hosts = await loadEnabledHosts(workDir, requestedHost);
  for (const host of hosts) {
    const manifest = await ensureHostManifest(workDir, host);
    const files = renderRepoLocalShell(manifest);
    for (const [relativePath, content] of Object.entries(files)) {
      const absolutePath = import_node_path.default.join(workDir, relativePath);
      await (0, import_promises.mkdir)(import_node_path.default.dirname(absolutePath), { recursive: true });
      await (0, import_promises.writeFile)(absolutePath, content, "utf8");
      installedPaths.push(relativePath);
    }
  }
  return installedPaths;
}
async function collectHostStatus(workDir) {
  const config = await (0, import_core.loadHarnessConfig)(workDir);
  const rows = [];
  for (const host of config.enabledHosts) {
    const manifestPath = import_node_path.default.join((0, import_core.getHarnessPaths)(workDir).hostsDir, (0, import_host_shared.getHostManifestFilename)(host));
    const manifestText = await readFileIfExists(manifestPath);
    if (!manifestText) {
      rows.push({
        host,
        manifest: "missing",
        shell: "missing",
        files: []
      });
      continue;
    }
    const manifest = (0, import_host_shared.parseHostManifest)(manifestText);
    const expectedFiles = renderRepoLocalShell(manifest);
    let shellStatus = "installed";
    for (const [relativePath, expectedContent] of Object.entries(expectedFiles)) {
      const actual = await readFileIfExists(import_node_path.default.join(workDir, relativePath));
      if (actual === null) {
        shellStatus = "missing";
        break;
      }
      if (actual !== expectedContent) {
        shellStatus = "drift";
        break;
      }
    }
    rows.push({
      host,
      manifest: "present",
      shell: shellStatus,
      files: Object.keys(expectedFiles)
    });
  }
  return rows;
}
async function readActiveTaskId(workDir) {
  const filePath = (0, import_core.getHarnessPaths)(workDir).activeTaskFile;
  const content = await readFileIfExists(filePath);
  return content?.trim() || null;
}

// src/utils/output.ts
function printJson(payload) {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}
`);
}
function printLines(lines) {
  process.stdout.write(`${lines.join("\n")}
`);
}

// src/commands/init.ts
async function runInit(flags) {
  const workDir = process.cwd();
  const requestedHost = typeof flags.host === "string" ? flags.host : "claude-code";
  const force = flags.force === true;
  const projectType = await (0, import_core2.detectProjectType)(workDir);
  const paths = await (0, import_core2.ensureHarnessDirectories)(workDir);
  const config = (0, import_core2.createDefaultHarnessConfig)(projectType, requestedHost);
  const configStatus = await (0, import_core2.writeHarnessConfig)(workDir, config, force);
  const globalRulesStatus = await (0, import_core2.writeFileIfChanged)(
    paths.globalRulesFile,
    (0, import_core2.renderGlobalRulesTemplate)(),
    force
  );
  await ensureHostManifest(workDir, config.defaultHost);
  const installedPaths = config.installRepoLocalShells ? await installHostShells(workDir, config.defaultHost) : [];
  await (0, import_promises2.writeFile)(paths.activeTaskFile, "", "utf8");
  printLines([
    "Harnessly \u521D\u59CB\u5316\u5B8C\u6210",
    `- project_type: ${projectType}`,
    `- config: ${configStatus}`,
    `- global_rules: ${globalRulesStatus}`,
    `- host: ${config.defaultHost}`,
    `- installed_shells: ${installedPaths.length > 0 ? installedPaths.join(", ") : "none"}`
  ]);
}

// src/commands/host/completion-gate.ts
var import_promises3 = require("fs/promises");
var import_node_path2 = __toESM(require("path"), 1);
var import_core3 = require("@harnessly/core");
async function fileExists(filePath) {
  try {
    await (0, import_promises3.access)(filePath);
    return true;
  } catch {
    return false;
  }
}
function isCompletionClaim(message) {
  return /(完成|done|fixed|已修复|搞定|完成了)/i.test(message);
}
async function runHostCompletionGate(flags, positionals) {
  const workDir = process.cwd();
  const message = (typeof flags.message === "string" ? flags.message : "") || positionals.join(" ").trim();
  const activeTaskId = await readActiveTaskId(workDir);
  if (!activeTaskId) {
    printJson({
      pass: true,
      reason: "no_active_task"
    });
    return;
  }
  const reportFile = import_node_path2.default.join((0, import_core3.getHarnessPaths)(workDir).tasksDir, activeTaskId, "report.json");
  const hasReport = await fileExists(reportFile);
  if (isCompletionClaim(message) && !hasReport) {
    printJson({
      pass: false,
      reason: "report_not_ready",
      activeTaskId
    });
    return;
  }
  printJson({
    pass: true,
    reason: hasReport ? "report_ready" : "no_completion_claim",
    activeTaskId
  });
}

// src/commands/host/install.ts
async function runHostInstall(flags) {
  const requestedHost = typeof flags.host === "string" ? flags.host : "auto";
  const installedPaths = await installHostShells(process.cwd(), requestedHost);
  printLines([
    "Host shell \u5B89\u88C5\u5B8C\u6210",
    `- host: ${requestedHost}`,
    `- files: ${installedPaths.length > 0 ? installedPaths.join(", ") : "none"}`
  ]);
}

// src/commands/host/session-start.ts
async function runHostSessionStart() {
  const activeTaskId = await readActiveTaskId(process.cwd());
  printJson({
    hasActiveTask: Boolean(activeTaskId),
    activeTaskId,
    recommendation: activeTaskId ? "resume" : "idle"
  });
}

// src/commands/host/status.ts
async function runHostStatus(flags) {
  const rows = await collectHostStatus(process.cwd());
  if (flags.json === true) {
    printJson(rows);
    return;
  }
  printLines([
    "Host \u72B6\u6001",
    ...rows.map(
      (row) => `- ${row.host}: manifest=${row.manifest}, shell=${row.shell}, files=${row.files.length > 0 ? row.files.join(", ") : "none"}`
    )
  ]);
}

// src/commands/host/sync.ts
async function runHostSync(flags) {
  const requestedHost = typeof flags.host === "string" ? flags.host : "auto";
  const installedPaths = await installHostShells(process.cwd(), requestedHost);
  printLines([
    "Host shell \u5DF2\u6309 source-of-truth \u91CD\u5199",
    `- host: ${requestedHost}`,
    `- files: ${installedPaths.length > 0 ? installedPaths.join(", ") : "none"}`
  ]);
}

// src/commands/host/user-prompt-submit.ts
function classifyPrompt(prompt, hasActiveTask) {
  if (!prompt.trim()) {
    return "chat";
  }
  if (hasActiveTask && /(继续|resume|接着|延续)/i.test(prompt)) {
    return "resume_task";
  }
  return "create_task";
}
async function runHostUserPromptSubmit(flags, positionals) {
  const prompt = (typeof flags.prompt === "string" ? flags.prompt : "") || positionals.join(" ").trim();
  const activeTaskId = await readActiveTaskId(process.cwd());
  const action = classifyPrompt(prompt, Boolean(activeTaskId));
  printJson({
    prompt,
    activeTaskId,
    action,
    nextStep: action === "create_task" ? "suggest_contract_generate" : action === "resume_task" ? "resume_existing_task" : "no_action"
  });
}

// src/utils/args.ts
function parseArgs(argv) {
  const positionals = [];
  const flags = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      positionals.push(token);
      continue;
    }
    const name = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      flags[name] = true;
      continue;
    }
    flags[name] = next;
    index += 1;
  }
  return { positionals, flags };
}

// src/run-cli.ts
function printUsage() {
  process.stdout.write(
    [
      "Usage:",
      "  harnessly init [--host claude-code] [--force]",
      "  harnessly host install [--host auto|all|claude-code]",
      "  harnessly host status [--json]",
      "  harnessly host sync [--host auto|all|claude-code]",
      "  harnessly host session-start",
      '  harnessly host user-prompt-submit [--prompt "..."]',
      '  harnessly host completion-gate [--message "..."]'
    ].join("\n") + "\n"
  );
}
async function runCli(argv) {
  const parsed = parseArgs(argv);
  const [command, subcommand, ...rest] = parsed.positionals;
  if (!command || command === "--help" || command === "help") {
    printUsage();
    return;
  }
  if (command === "init") {
    await runInit(parsed.flags);
    return;
  }
  if (command === "host") {
    switch (subcommand) {
      case "install":
        await runHostInstall(parsed.flags);
        return;
      case "status":
        await runHostStatus(parsed.flags);
        return;
      case "sync":
        await runHostSync(parsed.flags);
        return;
      case "session-start":
        await runHostSessionStart();
        return;
      case "user-prompt-submit":
        await runHostUserPromptSubmit(parsed.flags, rest);
        return;
      case "completion-gate":
        await runHostCompletionGate(parsed.flags, rest);
        return;
      default:
        printUsage();
        return;
    }
  }
  printUsage();
}

// src/index.ts
var import_meta = {};
function getCliRuntimeSummary() {
  return {
    packageName: "@harnessly/cli",
    version: "0.0.0",
    core: (0, import_core4.getCorePackageInfo)()
  };
}
function isDirectExecution() {
  const entryPath = process.argv[1];
  if (!entryPath) {
    return false;
  }
  return (0, import_node_url.fileURLToPath)(import_meta.url) === entryPath;
}
if (isDirectExecution()) {
  runCli(process.argv.slice(2)).catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}
`);
    process.exitCode = 1;
  });
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  getCliRuntimeSummary
});
