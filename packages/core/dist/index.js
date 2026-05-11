// src/index.ts
import { packageInfo as sharedPackageInfo } from "@harnessly/shared";

// src/agent.ts
import { readdir, readFile as readFile2, writeFile as writeFile2 } from "fs/promises";
import path3 from "path";
import {
  parseAgentManifestYaml,
  serializeAgentManifestYaml
} from "@harnessly/shared";

// src/scaffold.ts
import { mkdir, readFile, writeFile } from "fs/promises";
import path2 from "path";

// src/config.ts
import {
  HARNESSLY_VERSION,
  parseHarnessConfig as parseHarnessConfigFromShared,
  serializeHarnessConfig as serializeHarnessConfigFromShared
} from "@harnessly/shared";

// src/project.ts
import { access } from "fs/promises";
import path from "path";
async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}
async function detectProjectType(workDir) {
  if (await fileExists(path.join(workDir, "package.json"))) {
    return "node";
  }
  if (await fileExists(path.join(workDir, "go.mod"))) {
    return "go";
  }
  if (await fileExists(path.join(workDir, "pyproject.toml")) || await fileExists(path.join(workDir, "requirements.txt"))) {
    return "python";
  }
  return "unknown";
}
function getDefaultRequiredChecks(projectType) {
  switch (projectType) {
    case "go":
      return ["build", "test"];
    case "python":
      return ["test"];
    case "node":
    case "unknown":
    default:
      return ["build", "lint", "typecheck", "test"];
  }
}

// src/config.ts
function getDefaultAdapterKind(defaultHost) {
  switch (defaultHost) {
    case "codex":
      return "codex";
    default:
      return "claude-code";
  }
}
function getDefaultAdapterCommand(defaultHost) {
  switch (defaultHost) {
    case "codex":
      return 'codex exec --full-auto - < "$HARNESSLY_PROMPT_FILE"';
    default:
      return "";
  }
}
function createDefaultHarnessConfig(projectType, hosts = ["claude-code"]) {
  const defaultHost = hosts[0] ?? "claude-code";
  return {
    version: Number(HARNESSLY_VERSION.split(".")[0] ?? "0") + 1,
    projectType,
    requiredChecks: getDefaultRequiredChecks(projectType),
    defaultHost,
    enabledHosts: hosts,
    installRepoLocalShells: true,
    sourceOfTruthDir: ".harness/hosts",
    fallbackCreateTaskWithoutPlanner: false,
    codexUserPromptSubmitHookEnabled: true,
    adapterKind: getDefaultAdapterKind(defaultHost),
    adapterCommand: getDefaultAdapterCommand(defaultHost)
  };
}
function serializeHarnessConfig(config) {
  return serializeHarnessConfigFromShared(config);
}
function parseHarnessConfig(text) {
  return parseHarnessConfigFromShared(text);
}

// src/scaffold.ts
var HARNESS_DIRNAME = ".harness";
function getHarnessPaths(workDir) {
  const harnessDir = path2.join(workDir, HARNESS_DIRNAME);
  return {
    harnessDir,
    agentsDir: path2.join(harnessDir, "agents"),
    domainsDir: path2.join(harnessDir, "domains"),
    hostsDir: path2.join(harnessDir, "hosts"),
    tasksDir: path2.join(harnessDir, "tasks"),
    templatesDir: path2.join(harnessDir, "templates"),
    skillsDir: path2.join(harnessDir, "skills"),
    configFile: path2.join(harnessDir, "harness.config.yaml"),
    structureRulesFile: path2.join(harnessDir, "structure-rules.yaml"),
    reviewAgentsFile: path2.join(harnessDir, "review-agents.yaml"),
    globalRulesFile: path2.join(harnessDir, "GLOBAL_RULES.md"),
    activeTaskFile: path2.join(harnessDir, "active-task.txt")
  };
}
function renderStructureRulesTemplate() {
  return [
    "file_length:",
    "  max: 500",
    "  exclude:",
    "    - dist/",
    "    - node_modules/",
    "unique_implementations: []",
    "package_dependencies:",
    "  forbid: []",
    "  fix_hint: \u4FDD\u6301\u5305\u8FB9\u754C\u6E05\u6670\uFF0C\u907F\u514D\u53CD\u5411\u4F9D\u8D56",
    ""
  ].join("\n");
}
function renderReviewAgentsTemplate() {
  return [
    "review_agents:",
    "  - name: reliability",
    "    triggers: [pre_merge]",
    "    model: gpt-5.5",
    "    blocking_severity: P0",
    "    prompt: |",
    "      \u68C0\u67E5\u53EF\u9760\u6027\u3001\u56DE\u5F52\u98CE\u9669\u548C\u8BC1\u636E\u7F3A\u53E3\u3002",
    ""
  ].join("\n");
}
async function ensureHarnessDirectories(workDir) {
  const paths = getHarnessPaths(workDir);
  await mkdir(paths.harnessDir, { recursive: true });
  await mkdir(paths.agentsDir, { recursive: true });
  await mkdir(paths.domainsDir, { recursive: true });
  await mkdir(paths.hostsDir, { recursive: true });
  await mkdir(paths.tasksDir, { recursive: true });
  await mkdir(paths.templatesDir, { recursive: true });
  await mkdir(paths.skillsDir, { recursive: true });
  return paths;
}
function renderGlobalRulesTemplate() {
  return [
    "# GLOBAL_RULES",
    "",
    "\u5728\u8FD9\u91CC\u586B\u5199\u5F53\u524D\u4ED3\u5E93\u7684\u957F\u671F\u7A33\u5B9A\u89C4\u5219\u3002",
    "",
    "- \u53EA\u5199 repo \u7EA7\u4E8B\u5B9E\uFF0C\u4E0D\u5199\u4E2A\u4EBA\u7EA7\u4E60\u60EF",
    "- \u53EA\u5199\u957F\u671F\u7A33\u5B9A\u7EA6\u675F\uFF0C\u4E0D\u5199\u4E00\u6B21\u6027\u4EFB\u52A1\u8BF4\u660E",
    "- \u4EE3\u7801\u9A8C\u8BC1\u547D\u4EE4\u3001\u4EA4\u4ED8\u95E8\u7981\u3001\u76EE\u5F55\u7EA6\u5B9A\u4F18\u5148\u5199\u5728\u8FD9\u91CC",
    ""
  ].join("\n");
}
async function writeFileIfChanged(filePath, content, force = false) {
  try {
    const existing = await readFile(filePath, "utf8");
    if (existing === content) {
      return "skipped";
    }
    if (!force) {
      return "skipped";
    }
  } catch {
  }
  await writeFile(filePath, content, "utf8");
  try {
    await readFile(filePath, "utf8");
    return force ? "updated" : "created";
  } catch {
    return "created";
  }
}
async function loadHarnessConfig(workDir) {
  const configText = await readFile(getHarnessPaths(workDir).configFile, "utf8");
  return parseHarnessConfig(configText);
}
async function writeHarnessConfig(workDir, config, force = false) {
  return writeFileIfChanged(getHarnessPaths(workDir).configFile, serializeHarnessConfig(config), force);
}

// src/agent.ts
var AGENT_ROLES = [
  "requirement",
  "designer",
  "developer",
  "reviewer",
  "tester"
];
function getAgentDiskFiles(workDir, role) {
  const paths = getHarnessPaths(workDir);
  return {
    manifestPath: path3.join(paths.agentsDir, `${role}.yaml`),
    promptPath: path3.join(paths.agentsDir, `${role}.prompt.md`)
  };
}
var DEFAULT_AGENT_MANIFESTS = {
  requirement: {
    role: "requirement",
    displayName: "Harness Requirement",
    description: "\u5728 SPEC \u9636\u6BB5\u5E2E PM \u6F84\u6E05\u9700\u6C42\u3001\u5217\u4E3E\u53EF\u9A8C\u6536\u70B9",
    stage: "spec",
    enabled: true,
    planModeEnabled: false,
    models: {
      "claude-code": "haiku",
      codex: "gpt-5.5",
      "gemini-cli": "gemini-flash"
    },
    toolWhitelist: ["Read", "Bash"],
    prompt: [
      "# Harness Requirement Agent",
      "",
      "\u4F60\u662F Harnessly Requirement\u3002\u4F60\u7684\u804C\u8D23\u662F\u628A\u7528\u6237\u76EE\u6807\u8F6C\u6210\u7ED3\u6784\u5316\u7684\u9700\u6C42\u89C4\u683C\u3002",
      "",
      "## \u5DE5\u4F5C\u539F\u5219",
      "- \u4F60\u4E0D\u662F\u8BBE\u8BA1\u8005\uFF0C\u4E5F\u4E0D\u662F\u5B9E\u73B0\u8005\uFF0C\u4E0D\u8981\u5217\u5B9E\u65BD\u6B65\u9AA4\u3001\u4E0D\u8981\u5199\u4EE3\u7801\u3002",
      "- \u7B2C\u4E00\u6B65\uFF1A\u8C03\u7528 `harnessly host agent-event --agent requirement --event started`",
      "- \u8F93\u51FA\u5FC5\u987B\u843D\u5230 `.harness/tasks/<task-id>/contract.yaml`\uFF0C\u5305\u542B goal\u3001scope\u3001acceptance\u3001out_of_scope\u3002",
      "- \u4E0D\u6E05\u695A\u7684\u9700\u6C42\u5148\u56DE\u95EE\u4E3B Agent\uFF0C\u4E0D\u8981\u66FF\u7528\u6237\u7F16\u9020\u8303\u56F4\u3002",
      "",
      "## \u5B8C\u6210\u6807\u51C6",
      "- contract.yaml \u5DF2\u751F\u6210\u6216\u5B9A\u4F4D",
      "- \u5DF2\u628A\u5173\u952E\u7EA6\u675F\u6458\u8981\u56DE\u4F20\u7ED9\u4E3B Agent",
      ""
    ].join("\n")
  },
  designer: {
    role: "designer",
    displayName: "Harness Designer",
    description: "\u5728 DESIGN \u9636\u6BB5\u57FA\u4E8E contract \u5217\u5B9E\u65BD\u6B65\u9AA4\u3001\u4F9D\u8D56\u4E0E\u98CE\u9669",
    stage: "design",
    enabled: true,
    planModeEnabled: false,
    models: {
      "claude-code": "sonnet",
      codex: "gpt-5.5",
      "gemini-cli": "gemini-pro"
    },
    toolWhitelist: ["Read", "Bash", "Glob", "Grep"],
    prompt: [
      "# Harness Designer Agent",
      "",
      "\u4F60\u662F Harnessly Designer\u3002\u4F60\u7684\u804C\u8D23\u662F\u628A contract \u8F6C\u6210\u53EF\u6267\u884C\u7684\u5B9E\u65BD\u8BA1\u5212\u3002",
      "",
      "## \u5DE5\u4F5C\u539F\u5219",
      "- \u7B2C\u4E00\u6B65\uFF1A\u8C03\u7528 `harnessly host agent-event --agent designer --event started`",
      "- \u8F93\u5165\u662F `.harness/tasks/<task-id>/contract.yaml`\uFF0C\u8F93\u51FA\u662F `plan.md`\u3002",
      "- plan \u5FC5\u987B\u5217\uFF1A\u6B65\u9AA4\u3001\u6D89\u53CA\u6587\u4EF6\u3001\u4F9D\u8D56\u5173\u7CFB\u3001\u5173\u952E\u98CE\u9669\u3001\u9A8C\u8BC1\u624B\u6BB5\u3002",
      "- \u4E0D\u8981\u5728 design \u9636\u6BB5\u76F4\u63A5\u6539\u4EE3\u7801\u3002",
      "",
      "## \u5B8C\u6210\u6807\u51C6",
      "- plan.md \u5DF2\u751F\u6210\u6216\u5B9A\u4F4D",
      "- \u4E3B Agent \u62FF\u5230 plan \u5373\u53EF\u8FDB\u5165 EXECUTE \u9636\u6BB5",
      ""
    ].join("\n")
  },
  developer: {
    role: "developer",
    displayName: "Harness Developer",
    description: "\u5728 EXECUTE \u9636\u6BB5\u6309 plan \u6267\u884C\uFF08headless \u9002\u914D\uFF1B\u4E3B\u8DEF\u5F84\u4E0B\u7531\u4E3B agent \u62C5\u4EFB\uFF09",
    stage: "execute",
    enabled: false,
    planModeEnabled: false,
    models: {
      // EXECUTE 阶段是最重的活：用各 host 当前主力模型
      "claude-code": "opus",
      codex: "gpt-5.5",
      "gemini-cli": "gemini-pro"
    },
    toolWhitelist: ["Read", "Edit", "Write", "Bash", "Glob", "Grep"],
    prompt: [
      "# Harness Developer Agent",
      "",
      "\u4F60\u662F Harnessly Developer\u3002\u5728 headless \u6A21\u5F0F\u6216\u5B50\u4EFB\u52A1\u6C99\u7BB1\u4E2D\u6309 plan \u5B9E\u65BD\u6539\u52A8\u3002",
      "\u4E3B\u8DEF\u5F84\uFF08host \u6A21\u5F0F\uFF09\u4E0B\uFF0C\u8FD9\u4E2A\u89D2\u8272\u7531\u5BBF\u4E3B\u4E3B Agent \u81EA\u5DF1\u62C5\u4EFB\uFF0Csub-agent \u9ED8\u8BA4\u4E0D\u542F\u7528\u3002",
      "",
      "## \u5DE5\u4F5C\u539F\u5219",
      "- \u7B2C\u4E00\u6B65\uFF1A\u8C03\u7528 `harnessly host agent-event --agent developer --event started`",
      "- \u4E25\u683C\u6309 plan.md \u6267\u884C\uFF0C\u4E0D\u4FEE\u6539 contract.yaml / plan.md\u3002",
      "- plan \u5728\u6267\u884C\u4E2D\u88AB\u8BC1\u4F2A\u65F6\u505C\u4E0B\uFF0C\u4E0D\u7ED5\u8FC7\u3002",
      "- \u53EA\u5728 contract.scopeInclude \u8303\u56F4\u5185\u4FEE\u6539\u6587\u4EF6\u3002",
      "",
      "## \u5B8C\u6210\u6807\u51C6",
      "- plan \u4E2D\u7684\u6240\u6709\u6B65\u9AA4\u90FD\u6709\u4EA7\u51FA\u6216\u663E\u5F0F\u6807\u8BB0\u8DF3\u8FC7\u539F\u56E0",
      "- \u5DE5\u4F5C\u533A\u6709\u53EF\u9A8C\u8BC1\u7684\u4EE3\u7801\u6539\u52A8",
      ""
    ].join("\n")
  },
  reviewer: {
    role: "reviewer",
    displayName: "Harness Reviewer",
    description: "\u5728 REVIEW \u9636\u6BB5\u5BF9\u6539\u52A8\u505A\u8BED\u4E49\u5C42\u5BA1\u67E5\uFF08scope\u3001\u654F\u611F\u6587\u4EF6\u3001\u526F\u4F5C\u7528\uFF09",
    stage: "review",
    enabled: true,
    planModeEnabled: false,
    models: {
      "claude-code": "sonnet",
      codex: "gpt-5.5",
      "gemini-cli": "gemini-pro"
    },
    toolWhitelist: ["Read", "Bash", "Glob", "Grep"],
    prompt: [
      "# Harness Reviewer Agent",
      "",
      "\u4F60\u662F Harnessly Reviewer\u3002\u4F60\u7684\u804C\u8D23\u662F\u5BA1\u89C6\u6539\u52A8\u662F\u5426\u5408\u89C4\u3001\u662F\u5426\u5F15\u5165\u65B0\u98CE\u9669\u3002",
      "",
      "## \u5DE5\u4F5C\u539F\u5219",
      "- \u7B2C\u4E00\u6B65\uFF1A\u8C03\u7528 `harnessly host agent-event --agent reviewer --event started`",
      "- \u53EA\u8BFB\u3001\u4E0D\u52A8\u4EE3\u7801\u3002",
      "- \u5173\u6CE8\uFF1Ascope \u8D8A\u754C\u3001\u654F\u611F\u6587\u4EF6\u3001\u6539\u52A8\u89C4\u6A21\u3001\u6F5C\u5728\u526F\u4F5C\u7528\u3001\u4E0E plan \u7684\u504F\u79BB\u3002",
      "- findings \u5199\u5230 `.harness/tasks/<task-id>/review.json`\uFF08\u7ED3\u6784\u5316\u6570\u7EC4\uFF09\u3002",
      "",
      "## \u5B8C\u6210\u6807\u51C6",
      "- review.json \u5DF2\u751F\u6210\uFF08\u5373\u4FBF\u6CA1\u6709 findings \u4E5F\u8981\u5199\u7A7A\u6570\u7EC4\u5E76\u6807\u6CE8\uFF09",
      "- \u7ED9\u51FA PASS / FAIL \u88C1\u51B3",
      ""
    ].join("\n")
  },
  tester: {
    role: "tester",
    displayName: "Harness Tester",
    description: "\u5728 TEST \u9636\u6BB5\u8DD1 required checks \u4E0E acceptance \u6821\u9A8C",
    stage: "test",
    enabled: true,
    planModeEnabled: false,
    models: {
      "claude-code": "sonnet",
      codex: "gpt-5.5",
      "gemini-cli": "gemini-pro"
    },
    toolWhitelist: ["Read", "Bash"],
    prompt: [
      "# Harness Tester Agent",
      "",
      "\u4F60\u662F Harnessly Tester\u3002\u4F60\u7684\u804C\u8D23\u662F\u8DD1\u914D\u7F6E\u4E2D\u7684 required checks \u4E0E contract \u7684 acceptance \u6821\u9A8C\u3002",
      "",
      "## \u5DE5\u4F5C\u539F\u5219",
      "- \u7B2C\u4E00\u6B65\uFF1A\u8C03\u7528 `harnessly host agent-event --agent tester --event started`",
      "- \u4E0D\u6539\u4EE3\u7801\u3002",
      "- \u8DD1\u547D\u4EE4\u3001\u6536\u96C6 evidence\u3001\u6C47\u603B\u3002",
      "- evidence \u5199\u5230 `.harness/tasks/<task-id>/report.json` \u7684 evidence \u6BB5\u3002",
      "",
      "## \u5B8C\u6210\u6807\u51C6",
      "- \u6240\u6709 required checks \u90FD\u6709\u7ED3\u679C\uFF08passed / failed / skipped\uFF09",
      "- \u7ED9\u51FA PASS / FAIL \u88C1\u51B3",
      ""
    ].join("\n")
  }
};
function getDefaultAgentManifest(role) {
  const source = DEFAULT_AGENT_MANIFESTS[role];
  return {
    ...source,
    models: { ...source.models },
    toolWhitelist: [...source.toolWhitelist]
  };
}
function isMissingFileError(error) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
async function readFileIfExists(filePath) {
  try {
    return await readFile2(filePath, "utf8");
  } catch (error) {
    if (isMissingFileError(error)) {
      return null;
    }
    throw error;
  }
}
async function loadAgentManifest(workDir, role) {
  const { manifestPath, promptPath } = getAgentDiskFiles(workDir, role);
  const yamlText = await readFileIfExists(manifestPath);
  if (yamlText === null) {
    return null;
  }
  const manifest = parseAgentManifestYaml(yamlText);
  const promptText = await readFileIfExists(promptPath) ?? "";
  return {
    ...manifest,
    prompt: promptText
  };
}
async function loadAgentManifests(workDir) {
  const manifests = [];
  for (const role of AGENT_ROLES) {
    const manifest = await loadAgentManifest(workDir, role);
    if (manifest) {
      manifests.push(manifest);
    }
  }
  return manifests;
}
async function listAgentFiles(workDir) {
  const paths = getHarnessPaths(workDir);
  let entries;
  try {
    entries = await readdir(paths.agentsDir, { withFileTypes: true });
  } catch (error) {
    if (isMissingFileError(error)) {
      return [];
    }
    throw error;
  }
  return entries.filter((entry) => entry.isFile()).map((entry) => entry.name).sort();
}
async function writeIfMissingOrForced(filePath, content, force) {
  const existing = await readFileIfExists(filePath);
  if (existing === null) {
    await writeFile2(filePath, content, "utf8");
    return "created";
  }
  if (existing === content) {
    return "skipped";
  }
  if (!force) {
    return "skipped";
  }
  await writeFile2(filePath, content, "utf8");
  return "updated";
}
var STAGE_TO_ROLE = {
  spec: "requirement",
  design: "designer",
  review: "reviewer",
  test: "tester"
  // execute 阶段由主 agent 担任，不在此映射
  // commit_gate / created / failed / retry 没有专属角色，由 fallback 处理
};
function getRoleForStage(stage) {
  return STAGE_TO_ROLE[stage] ?? null;
}
var COMPLETION_FALLBACK_ROLES = ["reviewer", "tester", "designer", "requirement"];
function pickRecommendedAgent(intent, stage, enabledRoles) {
  if (intent === "new_task") {
    return enabledRoles.has("requirement") ? "harness-requirement" : null;
  }
  if (intent === "resume_task") {
    if (!stage) {
      return null;
    }
    if (stage === "execute") {
      return null;
    }
    const role = STAGE_TO_ROLE[stage];
    if (role && enabledRoles.has(role)) {
      return `harness-${role}`;
    }
    return null;
  }
  if (stage) {
    const role = STAGE_TO_ROLE[stage];
    if (role && enabledRoles.has(role)) {
      return `harness-${role}`;
    }
  }
  for (const candidate of COMPLETION_FALLBACK_ROLES) {
    if (enabledRoles.has(candidate)) {
      return `harness-${candidate}`;
    }
  }
  return null;
}
function collectEnabledRoles(manifests) {
  const result = /* @__PURE__ */ new Set();
  for (const m of manifests) {
    if (m.enabled) {
      result.add(m.role);
    }
  }
  return result;
}
async function writeDefaultAgentManifests(workDir, force = false) {
  const results = [];
  for (const role of AGENT_ROLES) {
    const manifest = getDefaultAgentManifest(role);
    const { manifestPath, promptPath } = getAgentDiskFiles(workDir, role);
    const manifestStatus = await writeIfMissingOrForced(
      manifestPath,
      serializeAgentManifestYaml(manifest),
      force
    );
    const promptStatus = await writeIfMissingOrForced(promptPath, manifest.prompt, force);
    results.push({ role, manifestStatus, promptStatus });
  }
  return results;
}

// src/archive.ts
import { copyFile, mkdir as mkdir4, readFile as readFile5, writeFile as writeFile4 } from "fs/promises";
import path6 from "path";
import { parseTaskReport as parseTaskReport2 } from "@harnessly/shared";

// src/task.ts
import crypto from "crypto";
import { mkdir as mkdir3, readdir as readdir2, readFile as readFile4, writeFile as writeFile3 } from "fs/promises";
import path5 from "path";
import {
  parseTaskReport,
  parseContract,
  serializeContract,
  serializeTaskReport
} from "@harnessly/shared";

// src/feedback-pool.ts
import { appendFile, mkdir as mkdir2, readFile as readFile3 } from "fs/promises";
import path4 from "path";
import {
  feedbackEntrySchema
} from "@harnessly/shared";
var FEEDBACK_POOL_FILENAME = "feedback-pool.jsonl";
function getFeedbackPoolPath(workDir) {
  return path4.join(getHarnessPaths(workDir).harnessDir, FEEDBACK_POOL_FILENAME);
}
function getFeedbackHistoryPath(workDir) {
  return path4.join(getHarnessPaths(workDir).harnessDir, "feedback-history.md");
}
function isMissingFileError2(error) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
function buildFeedbackEntry(ctx, report) {
  const entry = {
    taskId: ctx.taskId,
    goal: ctx.goal,
    decision: report.commitGate.decision,
    completedAt: report.generatedAt,
    completedStages: [...ctx.state.completedStages],
    retryCount: ctx.state.retryCount,
    changedFilesCount: report.evidence.changedFiles.length
  };
  if (ctx.contract?.templateName) {
    entry.template = ctx.contract.templateName;
  }
  if (ctx.contract?.riskLevel) {
    entry.riskLevel = ctx.contract.riskLevel;
  }
  if (report.commitGate.decision !== "pass") {
    if (ctx.state.lastFailureReason) {
      entry.failureReason = ctx.state.lastFailureReason;
    }
    if (ctx.state.lastFailureStage) {
      entry.failureStage = ctx.state.lastFailureStage;
    }
  }
  return feedbackEntrySchema.parse(entry);
}
async function appendFeedbackEntry(workDir, entry) {
  const validated = feedbackEntrySchema.parse(entry);
  const filePath = getFeedbackPoolPath(workDir);
  await mkdir2(path4.dirname(filePath), { recursive: true });
  await appendFile(filePath, `${JSON.stringify(validated)}
`, "utf8");
}
async function loadFeedbackPool(workDir) {
  const filePath = getFeedbackPoolPath(workDir);
  let text;
  try {
    text = await readFile3(filePath, "utf8");
  } catch (error) {
    if (isMissingFileError2(error)) {
      return [];
    }
    throw error;
  }
  const entries = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    try {
      const parsed = JSON.parse(line);
      const entry = feedbackEntrySchema.parse(parsed);
      entries.push(entry);
    } catch {
    }
  }
  return entries;
}
function pickRecentEntries(entries, options = {}) {
  const globalLimit = options.globalLimit ?? 5;
  const templateLimit = options.templateLimit ?? 3;
  if (entries.length === 0) return [];
  const tail = (count, predicate) => {
    if (count <= 0) return [];
    const filtered = predicate ? entries.filter(predicate) : entries;
    return filtered.slice(-count);
  };
  const recent = tail(globalLimit);
  const templateMatched = options.templateName ? tail(templateLimit, (e) => e.template === options.templateName) : [];
  const seenIds = /* @__PURE__ */ new Set();
  const merged = [];
  for (const entry of [...recent, ...templateMatched]) {
    if (seenIds.has(entry.taskId)) continue;
    seenIds.add(entry.taskId);
    merged.push(entry);
  }
  return merged.sort((a, b) => a.completedAt.localeCompare(b.completedAt));
}
function renderFeedbackEntriesAsLines(entries) {
  return entries.map((entry) => {
    const parts = [
      `[${entry.taskId}]`,
      `(${entry.template ?? "general"}, ${entry.decision}, retry=${entry.retryCount})`,
      entry.goal
    ];
    if (entry.failureStage) {
      parts.push(`@${entry.failureStage}`);
    }
    return parts.join(" ");
  });
}
async function promoteFeedbackEntry(workDir, taskId, reason = "manual promotion") {
  const entries = await loadFeedbackPool(workDir);
  const entry = [...entries].reverse().find((item) => item.taskId === taskId);
  if (!entry) {
    throw new Error(`feedback entry not found for task ${taskId}`);
  }
  const historyPath = getFeedbackHistoryPath(workDir);
  await mkdir2(path4.dirname(historyPath), { recursive: true });
  await appendFile(
    historyPath,
    [
      `## ${(/* @__PURE__ */ new Date()).toISOString()} ${entry.taskId}`,
      "",
      `- goal: ${entry.goal}`,
      `- decision: ${entry.decision}`,
      `- template: ${entry.template ?? "general"}`,
      `- risk_level: ${entry.riskLevel ?? "unknown"}`,
      `- reason: ${reason}`,
      ""
    ].join("\n"),
    "utf8"
  );
  return entry;
}

// src/task.ts
function createInitialTaskState(taskId) {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  return {
    taskId,
    status: "active",
    currentStage: "created",
    currentOwner: "pm",
    createdAt: now,
    updatedAt: now,
    completedStages: [],
    retryCount: 0
  };
}
async function writeJson(filePath, payload) {
  await writeFile3(filePath, `${JSON.stringify(payload, null, 2)}
`, "utf8");
}
async function readJson(filePath) {
  const text = await readFile4(filePath, "utf8");
  return JSON.parse(text);
}
function isMissingFileError3(error) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
function ownerForStage(stage) {
  switch (stage) {
    case "spec":
      return "requirement";
    case "design":
      return "designer";
    case "execute":
    case "retry":
      return "developer";
    case "review":
      return "reviewer";
    case "test":
      return "tester";
    case "commit_gate":
    case "created":
    case "failed":
      return "pm";
  }
}
function touchState(state, status, stage) {
  return {
    ...state,
    status,
    currentStage: stage,
    currentOwner: ownerForStage(stage),
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
var TaskManager = class {
  async loadConfig(workDir) {
    return loadHarnessConfig(workDir);
  }
  getTasksDir(workDir) {
    return path5.join(workDir, ".harness", "tasks");
  }
  getActiveTaskFile(workDir) {
    return path5.join(workDir, ".harness", "active-task.txt");
  }
  getTaskDir(workDir, taskId) {
    return path5.join(this.getTasksDir(workDir), taskId);
  }
  getStateFile(taskDir) {
    return path5.join(taskDir, "state.json");
  }
  getMetaFile(taskDir) {
    return path5.join(taskDir, "task.json");
  }
  getContractFile(taskDir) {
    return path5.join(taskDir, "contract.yaml");
  }
  getRequirementFile(taskDir) {
    return path5.join(taskDir, "requirement.md");
  }
  getDesignFile(taskDir) {
    return path5.join(taskDir, "design.md");
  }
  getTaskBreakdownFile(taskDir) {
    return path5.join(taskDir, "task-breakdown.md");
  }
  getImplementationNotesFile(taskDir) {
    return path5.join(taskDir, "implementation-notes.md");
  }
  getReviewFile(taskDir) {
    return path5.join(taskDir, "review.md");
  }
  getResidentReviewFile(taskDir) {
    return path5.join(taskDir, "resident-review.md");
  }
  getTestReportFile(taskDir) {
    return path5.join(taskDir, "test-report.md");
  }
  getPlanFile(taskDir) {
    return path5.join(taskDir, "plan.md");
  }
  getPromptFile(taskDir) {
    return path5.join(taskDir, "prompt.md");
  }
  getReportFile(taskDir) {
    return path5.join(taskDir, "report.json");
  }
  getFeedbackFile(taskDir) {
    return path5.join(taskDir, "feedback.md");
  }
  generateTaskId() {
    const now = /* @__PURE__ */ new Date();
    const date = now.toISOString().slice(0, 10).replace(/-/g, "");
    const time = now.toISOString().slice(11, 19).replace(/:/g, "");
    const rand = crypto.randomBytes(2).toString("hex");
    return `${date}-${time}-${rand}`;
  }
  async setActiveTask(workDir, taskId) {
    await writeFile3(this.getActiveTaskFile(workDir), `${taskId}
`, "utf8");
  }
  async create(goal, workDir) {
    const taskId = this.generateTaskId();
    const taskDir = this.getTaskDir(workDir, taskId);
    const config = await this.loadConfig(workDir);
    const state = createInitialTaskState(taskId);
    await mkdir3(taskDir, { recursive: true });
    await writeJson(this.getMetaFile(taskDir), { taskId, goal });
    await writeJson(this.getStateFile(taskDir), state);
    await this.setActiveTask(workDir, taskId);
    return {
      taskId,
      goal,
      workDir,
      taskDir,
      config,
      state
    };
  }
  async saveState(ctx) {
    await writeJson(this.getStateFile(ctx.taskDir), ctx.state);
  }
  async saveContract(ctx, contract) {
    ctx.contract = contract;
    ctx.state = touchState(ctx.state, "active", "spec");
    await writeFile3(this.getContractFile(ctx.taskDir), serializeContract(contract), "utf8");
    await this.saveState(ctx);
  }
  async saveRequirement(ctx, requirement) {
    await writeFile3(this.getRequirementFile(ctx.taskDir), requirement, "utf8");
  }
  async savePlan(ctx, plan) {
    ctx.plan = plan;
    ctx.state = touchState(ctx.state, "active", "design");
    await writeFile3(this.getPlanFile(ctx.taskDir), plan, "utf8");
    await this.saveState(ctx);
  }
  async saveDesign(ctx, design) {
    await writeFile3(this.getDesignFile(ctx.taskDir), design, "utf8");
  }
  async saveTaskBreakdown(ctx, taskBreakdown) {
    await writeFile3(this.getTaskBreakdownFile(ctx.taskDir), taskBreakdown, "utf8");
  }
  async saveImplementationNotes(ctx, notes) {
    await writeFile3(this.getImplementationNotesFile(ctx.taskDir), notes, "utf8");
  }
  async saveReviewMarkdown(ctx, review) {
    await writeFile3(this.getReviewFile(ctx.taskDir), review, "utf8");
  }
  async saveResidentReview(ctx, review) {
    await writeFile3(this.getResidentReviewFile(ctx.taskDir), review, "utf8");
  }
  async saveTestReport(ctx, report) {
    await writeFile3(this.getTestReportFile(ctx.taskDir), report, "utf8");
  }
  async savePrompt(ctx, prompt) {
    const filePath = this.getPromptFile(ctx.taskDir);
    await writeFile3(filePath, prompt, "utf8");
    return filePath;
  }
  async saveReport(ctx, report) {
    ctx.state = touchState(ctx.state, report.commitReady ? "completed" : "blocked", "commit_gate");
    await writeFile3(this.getReportFile(ctx.taskDir), serializeTaskReport(report), "utf8");
    await this.saveState(ctx);
    if (report.commitGate.decision === "pass") {
      try {
        const entry = buildFeedbackEntry(ctx, report);
        await appendFeedbackEntry(ctx.workDir, entry);
      } catch {
      }
    }
  }
  async saveFeedback(ctx, feedback) {
    ctx.feedback = feedback;
    await writeFile3(this.getFeedbackFile(ctx.taskDir), feedback, "utf8");
  }
  async clearFeedback(ctx) {
    ctx.feedback = void 0;
    try {
      await writeFile3(this.getFeedbackFile(ctx.taskDir), "", "utf8");
    } catch {
    }
  }
  async markFailure(ctx, stage, reason) {
    ctx.state = {
      ...touchState(ctx.state, "blocked", stage),
      lastFailureReason: reason,
      lastFailureStage: stage
    };
    await this.saveState(ctx);
    await this.saveFeedback(ctx, reason);
  }
  async markRetrying(ctx) {
    ctx.state = {
      ...touchState(ctx.state, "active", "retry"),
      retryCount: ctx.state.retryCount + 1
    };
    await this.saveState(ctx);
  }
  async loadReport(taskId, workDir) {
    const taskDir = this.getTaskDir(workDir, taskId);
    try {
      return parseTaskReport(await readFile4(this.getReportFile(taskDir), "utf8"));
    } catch (error) {
      if (isMissingFileError3(error)) {
        return null;
      }
      if (error instanceof Error) {
        throw new Error(`task ${taskId} \u7684 report.json \u975E\u6CD5\uFF1A${error.message}`);
      }
      throw error;
    }
  }
  async load(taskId, workDir) {
    const taskDir = this.getTaskDir(workDir, taskId);
    let meta;
    let state;
    try {
      meta = await readJson(this.getMetaFile(taskDir));
      state = await readJson(this.getStateFile(taskDir));
    } catch (error) {
      if (isMissingFileError3(error)) {
        throw new Error(`task ${taskId} \u4E0D\u5B58\u5728\u3002\u53EF\u5148\u6267\u884C harnessly list \u67E5\u770B\u5DF2\u6709\u4EFB\u52A1\u3002`);
      }
      throw error;
    }
    const config = await this.loadConfig(workDir);
    const ctx = {
      taskId: meta.taskId,
      goal: meta.goal,
      workDir,
      taskDir,
      config,
      state
    };
    try {
      ctx.contract = parseContract(await readFile4(this.getContractFile(taskDir), "utf8"));
    } catch (error) {
      if (!isMissingFileError3(error)) {
        throw error;
      }
    }
    try {
      ctx.plan = await readFile4(this.getPlanFile(taskDir), "utf8");
    } catch {
    }
    try {
      const feedback = await readFile4(this.getFeedbackFile(taskDir), "utf8");
      ctx.feedback = feedback.trim() || void 0;
    } catch {
    }
    return ctx;
  }
  async resume(taskId, workDir) {
    const ctx = await this.load(taskId, workDir);
    await this.setActiveTask(workDir, taskId);
    return ctx;
  }
  async listTasks(workDir) {
    const tasksDir = this.getTasksDir(workDir);
    let entries;
    try {
      entries = await readdir2(tasksDir, { withFileTypes: true });
    } catch (error) {
      if (isMissingFileError3(error)) {
        return [];
      }
      throw error;
    }
    const summaries = await Promise.all(
      entries.filter((entry) => entry.isDirectory()).map(async (entry) => {
        const taskDir = path5.join(tasksDir, entry.name);
        const meta = await readJson(this.getMetaFile(taskDir));
        const state = await readJson(this.getStateFile(taskDir));
        return {
          taskId: meta.taskId,
          goal: meta.goal,
          status: state.status,
          currentStage: state.currentStage,
          currentOwner: state.currentOwner ?? ownerForStage(state.currentStage),
          retryCount: state.retryCount,
          lastFailureStage: state.lastFailureStage,
          updatedAt: state.updatedAt
        };
      })
    );
    return summaries.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }
  async getLatestTaskId(workDir) {
    const tasks = await this.listTasks(workDir);
    return tasks[0]?.taskId ?? null;
  }
};

// src/archive.ts
var DEFAULT_TOPIC = "tasks";
function isMissingFileError4(error) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
async function fileExists2(filePath) {
  try {
    await readFile5(filePath);
    return true;
  } catch (error) {
    if (isMissingFileError4(error)) return false;
    throw error;
  }
}
async function copyIfMissingOrForced(source, target, force) {
  const exists2 = await fileExists2(target);
  if (!exists2) {
    await mkdir4(path6.dirname(target), { recursive: true });
    await copyFile(source, target);
    return "created";
  }
  if (!force) {
    return "skipped";
  }
  await copyFile(source, target);
  return "updated";
}
function pickFilesByKind(kind) {
  return {
    contract: kind === "requirement" || kind === "both",
    plan: kind === "design" || kind === "both"
  };
}
function readTaskReportSafe(filePath) {
  return readFile5(filePath, "utf8").then((text) => parseTaskReport2(text)).catch((error) => {
    if (isMissingFileError4(error)) return null;
    return null;
  });
}
function renderArchiveReadme(args) {
  const { taskId, goal, archivedAt, archivedKind, topic, report, completedStages, retryCount } = args;
  const lines = [
    `# Task Archive: ${goal}`,
    "",
    "## Metadata",
    `- task_id: ${taskId}`,
    `- topic: ${topic}`,
    `- archived_at: ${archivedAt}`,
    `- archived_kind: ${archivedKind}`,
    `- completed_stages: ${completedStages.join(", ") || "(none)"}`,
    `- retry_count: ${retryCount}`
  ];
  if (report) {
    lines.push(
      `- decision: ${report.commitGate.decision}`,
      `- commit_ready: ${report.commitReady}`,
      `- changed_files_count: ${report.evidence.changedFiles.length}`
    );
  } else {
    lines.push("- decision: (no report available)");
  }
  lines.push("", "## Files");
  if (archivedKind === "requirement" || archivedKind === "both") {
    lines.push("- `contract.yaml` \u2014 SPEC \u9636\u6BB5\u4EA7\u51FA\uFF08v3-core requirement \u5DE5\u4EF6\uFF09");
  }
  if (archivedKind === "design" || archivedKind === "both") {
    lines.push("- `plan.md` \u2014 DESIGN \u9636\u6BB5\u4EA7\u51FA\uFF08v3-core design \u5DE5\u4EF6\uFF09");
  }
  lines.push(
    "",
    "## Source",
    `Snapshot of \`.harness/tasks/${taskId}/\` at \`${archivedAt}\`.`,
    "",
    "> \u7531 `harnessly archive` \u547D\u4EE4\u751F\u6210\u3002\u5982\u9700\u66F4\u65B0\uFF0C\u91CD\u8DD1 `harnessly archive ... --force`\u3002",
    ""
  );
  return lines.join("\n");
}
function getArchiveTargetPaths(workDir, _taskId, topic = DEFAULT_TOPIC) {
  const archDir = path6.join(workDir, "docs", "architecture");
  const topicDir = path6.join(archDir, topic);
  return {
    archDir,
    topicDir
  };
}
async function archiveTaskArtifacts(workDir, taskId, kind, options = {}) {
  const topic = options.topic?.trim() || DEFAULT_TOPIC;
  const mode = options.mode ?? "new_topic";
  const force = options.force ?? false;
  const ctx = await new TaskManager().load(taskId, workDir);
  const targets = getArchiveTargetPaths(workDir, taskId, topic);
  const want = pickFilesByKind(kind);
  const files = [];
  if (want.contract) {
    const source = path6.join(ctx.taskDir, "contract.yaml");
    const requirementSource = path6.join(ctx.taskDir, "requirement.md");
    if (!await fileExists2(source)) {
      throw new Error(
        `task ${taskId} \u7F3A\u5C11 contract.yaml\uFF1B\u4E0D\u80FD\u5F52\u6863 requirement \u5DE5\u4EF6\uFF08kind=${kind}\uFF09`
      );
    }
    const primarySource = await fileExists2(requirementSource) ? requirementSource : source;
    const target = path6.join(targets.topicDir, `${taskId}.requirement.md`);
    const status = await copyIfMissingOrForced(primarySource, target, force || mode === "replace");
    files.push({ source: primarySource, target, status });
  }
  if (want.plan) {
    const source = path6.join(ctx.taskDir, "plan.md");
    const designSource = path6.join(ctx.taskDir, "design.md");
    if (!await fileExists2(source)) {
      throw new Error(`task ${taskId} \u7F3A\u5C11 plan.md\uFF1B\u4E0D\u80FD\u5F52\u6863 design \u5DE5\u4EF6\uFF08kind=${kind}\uFF09`);
    }
    const primarySource = await fileExists2(designSource) ? designSource : source;
    const target = path6.join(targets.topicDir, `${taskId}.design.md`);
    const status = await copyIfMissingOrForced(primarySource, target, force || mode === "replace");
    files.push({ source: primarySource, target, status });
  }
  const reportFile = path6.join(ctx.taskDir, "report.json");
  const report = await readTaskReportSafe(reportFile);
  const readmePath = path6.join(targets.topicDir, "README.md");
  await mkdir4(targets.topicDir, { recursive: true });
  const readmeContent = renderArchiveReadme({
    taskId,
    goal: ctx.goal,
    archivedAt: (/* @__PURE__ */ new Date()).toISOString(),
    archivedKind: kind,
    topic,
    report,
    completedStages: ctx.state.completedStages,
    retryCount: ctx.state.retryCount
  });
  const previousReadme = await readFile5(readmePath, "utf8").catch((error) => {
    if (isMissingFileError4(error)) return null;
    throw error;
  });
  await writeFile4(readmePath, readmeContent, "utf8");
  files.push({
    source: "(generated)",
    target: readmePath,
    status: previousReadme === null ? "created" : "updated"
  });
  const metadataPath = path6.join(targets.topicDir, `${taskId}.promotion.json`);
  const previousMetadata = await readFile5(metadataPath, "utf8").catch((error) => {
    if (isMissingFileError4(error)) return null;
    throw error;
  });
  await writeFile4(
    metadataPath,
    `${JSON.stringify(
      {
        taskId,
        topic,
        mode,
        kind,
        promotedAt: (/* @__PURE__ */ new Date()).toISOString(),
        sourceDir: `.harness/tasks/${taskId}`,
        files: files.map((file) => path6.relative(workDir, file.target))
      },
      null,
      2
    )}
`,
    "utf8"
  );
  files.push({
    source: "(generated)",
    target: metadataPath,
    status: previousMetadata === null ? "created" : "updated"
  });
  return {
    taskId,
    topic,
    targetDir: targets.topicDir,
    files
  };
}

// src/artifact-guard.ts
import { access as access2 } from "fs/promises";
import path7 from "path";
async function exists(filePath) {
  try {
    await access2(filePath);
    return true;
  } catch {
    return false;
  }
}
var REQUIRED_TASK_ARTIFACTS = [
  "requirement.md",
  "contract.yaml",
  "design.md",
  "task-breakdown.md",
  "implementation-notes.md",
  "review.md",
  "resident-review.md",
  "test-report.md",
  "evidence/current.json"
];
async function runArtifactGuard(taskDir) {
  const missing = [];
  for (const relative of REQUIRED_TASK_ARTIFACTS) {
    if (!await exists(path7.join(taskDir, relative))) {
      missing.push(relative);
    }
  }
  return {
    name: "artifact.guard",
    status: missing.length === 0 ? "passed" : "failed",
    command: "check .harness task artifacts",
    detail: missing.length === 0 ? "\u4EFB\u52A1\u7269\u7406\u5DE5\u4EF6\u5B8C\u6574" : `\u7F3A\u5C11\u4EFB\u52A1\u7269\u7406\u5DE5\u4EF6\uFF1A${missing.join(", ")}`,
    fixHint: missing.length === 0 ? void 0 : "\u56DE\u5230\u5BF9\u5E94\u9636\u6BB5\u751F\u6210\u7F3A\u5931\u5DE5\u4EF6\uFF0C\u4E0D\u8981\u53EA\u4F9D\u8D56\u5BF9\u8BDD\u6587\u672C"
  };
}

// src/contract.ts
import { contractSchema, validateContract } from "@harnessly/shared";

// src/template.ts
var builtinTemplates = [
  {
    name: "bug-fix",
    description: "\u9762\u5411\u7F3A\u9677\u4FEE\u590D\u3001\u5F02\u5E38\u6392\u67E5\u548C\u884C\u4E3A\u7EA0\u6B63",
    keywords: ["\u4FEE\u590D", "bug", "fix", "\u9519\u8BEF", "\u5F02\u5E38", "\u5931\u8D25", "\u95EE\u9898"],
    defaultRiskLevel: "medium",
    defaultScopeInclude: ["\u76F8\u5173\u7F3A\u9677\u4EE3\u7801\u8DEF\u5F84"],
    defaultScopeExclude: ["\u65E0\u5173\u6A21\u5757", "\u7528\u6237\u7EA7\u5168\u5C40\u914D\u7F6E"],
    defaultAcceptanceCriteria: ["\u76EE\u6807\u5DF2\u88AB\u4FEE\u590D", "\u53D8\u66F4\u8303\u56F4\u4E0E\u95EE\u9898\u76F4\u63A5\u76F8\u5173", "\u8F93\u51FA\u7ED3\u679C\u53EF\u4F9B\u540E\u7EED verify \u4F7F\u7528"],
    defaultOutOfScope: ["\u91CD\u6784\u6574\u4ED3", "\u65B0\u589E\u672A\u8BF7\u6C42\u4F9D\u8D56"]
  },
  {
    name: "feature-simple",
    description: "\u9762\u5411\u5355\u70B9\u529F\u80FD\u65B0\u589E\u3001\u8F7B\u91CF\u80FD\u529B\u6269\u5C55",
    keywords: ["\u65B0\u589E", "\u6DFB\u52A0", "feature", "\u652F\u6301", "\u5B9E\u73B0", "\u589E\u52A0"],
    defaultRiskLevel: "low",
    defaultScopeInclude: ["\u76F8\u5173\u529F\u80FD\u6A21\u5757\u8DEF\u5F84"],
    defaultScopeExclude: ["\u65E0\u5173\u6A21\u5757", "\u7528\u6237\u7EA7\u5168\u5C40\u914D\u7F6E"],
    defaultAcceptanceCriteria: ["\u76EE\u6807\u529F\u80FD\u5DF2\u53EF\u7528", "\u53D8\u66F4\u8303\u56F4\u4E0E\u76EE\u6807\u4E00\u81F4", "\u8F93\u51FA\u7ED3\u679C\u53EF\u4F9B\u540E\u7EED verify \u4F7F\u7528"],
    defaultOutOfScope: ["\u8DE8\u6A21\u5757\u5E73\u53F0\u5316\u91CD\u6784", "\u65B0\u589E\u672A\u8BF7\u6C42\u4F9D\u8D56"]
  },
  {
    name: "general-task",
    description: "\u9762\u5411\u65E0\u6CD5\u660E\u786E\u5F52\u7C7B\u7684\u901A\u7528\u4EFB\u52A1",
    keywords: [],
    defaultRiskLevel: "low",
    defaultScopeInclude: ["\u76F8\u5173\u5B9E\u73B0\u8DEF\u5F84"],
    defaultScopeExclude: ["\u65E0\u5173\u6A21\u5757", "\u7528\u6237\u7EA7\u5168\u5C40\u914D\u7F6E"],
    defaultAcceptanceCriteria: ["\u76EE\u6807\u5DF2\u88AB\u5B9E\u73B0\u6216\u5904\u7406", "\u53D8\u66F4\u8303\u56F4\u4E0E\u76EE\u6807\u4E00\u81F4", "\u8F93\u51FA\u7ED3\u679C\u53EF\u4F9B\u540E\u7EED verify \u4F7F\u7528"],
    defaultOutOfScope: ["\u91CD\u6784\u6574\u4ED3", "\u65B0\u589E\u672A\u8BF7\u6C42\u4F9D\u8D56"]
  }
];
var TemplateRegistry = class {
  templates = /* @__PURE__ */ new Map();
  constructor(initialTemplates = builtinTemplates) {
    for (const template of initialTemplates) {
      this.templates.set(template.name, template);
    }
  }
  list() {
    return Array.from(this.templates.values());
  }
  get(name) {
    const template = this.templates.get(name);
    if (!template) {
      throw new Error(`\u6A21\u677F ${name} \u4E0D\u5B58\u5728`);
    }
    return template;
  }
  match(goal) {
    const normalizedGoal = goal.trim().toLowerCase();
    for (const template of this.list()) {
      if (template.keywords.some((keyword) => normalizedGoal.includes(keyword.toLowerCase()))) {
        return template;
      }
    }
    return this.get("general-task");
  }
};
function createTemplateRegistry() {
  return new TemplateRegistry();
}
function getBuiltinTemplates() {
  return builtinTemplates.map((template) => ({
    ...template,
    keywords: [...template.keywords],
    defaultScopeInclude: [...template.defaultScopeInclude],
    defaultScopeExclude: [...template.defaultScopeExclude],
    defaultAcceptanceCriteria: [...template.defaultAcceptanceCriteria],
    defaultOutOfScope: [...template.defaultOutOfScope]
  }));
}
function matchTemplate(goal) {
  return createTemplateRegistry().match(goal).name;
}

// src/contract.ts
function generateFallbackContract(goal, templateName, taskId = "") {
  const template = createTemplateRegistry().get(templateName);
  return {
    version: "2.0",
    taskId,
    goal,
    templateName,
    riskLevel: template.defaultRiskLevel,
    estimatedComplexity: template.defaultRiskLevel === "low" ? "simple" : "medium",
    requiredChecks: [],
    scopeInclude: [...template.defaultScopeInclude],
    scopeExclude: [...template.defaultScopeExclude],
    acceptanceCriteria: [
      { criterion: `\u76EE\u6807\u201C${goal}\u201D\u5DF2\u88AB\u5B9E\u73B0\u6216\u4FEE\u590D`, verifiableBy: "manual" },
      ...template.defaultAcceptanceCriteria.slice(1)
    ].map(
      (item) => typeof item === "string" ? { criterion: item, verifiableBy: "manual" } : item
    ),
    outOfScope: [...template.defaultOutOfScope],
    linkedSpec: "requirement.md",
    linkedDesign: "design.md",
    createdAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
function createContractSystemPrompt() {
  return [
    "\u4F60\u662F Harnessly \u7684 contract planner\u3002",
    "\u4F60\u7684\u4EFB\u52A1\u662F\u57FA\u4E8E\u7528\u6237\u76EE\u6807\u8F93\u51FA\u4E00\u4E2A\u53EF\u9A8C\u8BC1\u3001\u53EF\u6267\u884C\u3001\u8303\u56F4\u6700\u5C0F\u7684 contract\u3002",
    "\u4E0D\u8981\u6269\u5C55\u7528\u6237\u672A\u8BF7\u6C42\u7684\u76EE\u6807\uFF0C\u4E0D\u8981\u505A\u5E73\u53F0\u5316\u91CD\u6784\uFF0C\u4E0D\u8981\u5F15\u5165\u65E0\u5173\u4F9D\u8D56\u3002",
    "scopeInclude \u8981\u5199\u5B9E\u9645\u4FEE\u6539\u8303\u56F4\uFF0CoutOfScope \u8981\u660E\u786E\u6392\u9664\u5927\u8303\u56F4\u91CD\u6784\u548C\u65E0\u5173\u6A21\u5757\u3002",
    "acceptanceCriteria \u5FC5\u987B\u53EF\u9A8C\u8BC1\uFF0C\u4E14\u9002\u5408\u4F5C\u4E3A\u540E\u7EED verify \u8F93\u5165\u3002"
  ].join("\n");
}
function createContractPrompt(goal, templateName, fallback) {
  return [
    `\u76EE\u6807\uFF1A${goal}`,
    `\u6A21\u677F\uFF1A${templateName}`,
    "",
    "\u8BF7\u8F93\u51FA\u6EE1\u8DB3 schema \u7684 contract\u3002",
    "\u8981\u6C42\uFF1A",
    "- goal \u4FDD\u6301\u4E0E\u7528\u6237\u76EE\u6807\u4E00\u81F4",
    "- templateName \u4FDD\u6301\u4E0E\u7ED9\u5B9A\u6A21\u677F\u4E00\u81F4",
    "- riskLevel \u57FA\u4E8E\u6539\u52A8\u98CE\u9669\u5224\u65AD",
    "- scopeInclude \u4F7F\u7528\u5177\u4F53\u4FEE\u6539\u8303\u56F4\uFF0C\u4E0D\u8981\u5199\u7A7A\u8BDD",
    "- acceptanceCriteria \u81F3\u5C11 3 \u6761\uFF0C\u4E14\u8981\u53EF\u9A8C\u8BC1",
    "- outOfScope \u660E\u786E\u5217\u51FA\u4E0D\u505A\u7684\u4E8B\u60C5",
    "",
    `\u53EF\u53C2\u8003\u7684\u4FDD\u5E95 contract\uFF1A${JSON.stringify(fallback, null, 2)}`
  ].join("\n");
}
async function generateContract(options) {
  const fallback = generateFallbackContract(options.goal, options.templateName, options.taskId);
  if (!options.llmClient) {
    return fallback;
  }
  try {
    const generated = await options.llmClient.generateStructured({
      prompt: createContractPrompt(options.goal, options.templateName, fallback),
      systemPrompt: createContractSystemPrompt(),
      schema: contractSchema,
      toolName: "emit_contract",
      toolDescription: "\u8F93\u51FA Harnessly contract"
    });
    return validateContract({
      ...fallback,
      ...generated,
      version: "2.0",
      taskId: options.taskId ?? "",
      goal: options.goal,
      templateName: options.templateName,
      linkedSpec: "requirement.md",
      linkedDesign: "design.md",
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    });
  } catch {
    return fallback;
  }
}
function checkContract(contract) {
  const failures = [];
  if (!contract.goal.trim()) {
    failures.push("goal \u4E0D\u80FD\u4E3A\u7A7A");
  }
  if (!contract.templateName) {
    failures.push("template_name \u7F3A\u5931");
  }
  if (contract.version !== "2.0") {
    failures.push("version \u5FC5\u987B\u4E3A 2.0");
  }
  if (contract.scopeInclude.length === 0) {
    failures.push("scope_include \u4E0D\u80FD\u4E3A\u7A7A");
  }
  if (contract.acceptanceCriteria.length === 0) {
    failures.push("acceptance_criteria \u4E0D\u80FD\u4E3A\u7A7A");
  }
  if (contract.outOfScope.length === 0) {
    failures.push("out_of_scope \u4E0D\u80FD\u4E3A\u7A7A");
  }
  return {
    passed: failures.length === 0,
    failures
  };
}

// src/evidence.ts
import { exec as exec3 } from "child_process";
import { promisify as promisify3 } from "util";

// src/scope.ts
function isStructuredScope(pattern) {
  return /[/*]/.test(pattern) || pattern.includes(".");
}
function matchesPattern(filePath, pattern) {
  if (pattern === "*") {
    return true;
  }
  if (pattern.includes("*")) {
    const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*");
    return new RegExp(escaped).test(filePath);
  }
  if (pattern.endsWith("/")) {
    return filePath.startsWith(pattern);
  }
  if (pattern.startsWith(".")) {
    return filePath.endsWith(pattern);
  }
  return filePath.startsWith(pattern) || filePath === pattern;
}
function runScopeCheck(contract, changedFiles) {
  if (!contract) {
    return {
      name: "scope",
      status: "skipped",
      command: "scope-check",
      detail: "contract \u7F3A\u5931"
    };
  }
  const patterns = contract.scopeExclude.filter(isStructuredScope);
  if (patterns.length === 0) {
    return {
      name: "scope",
      status: "passed",
      command: "scope-check",
      detail: "scope.exclude \u672A\u914D\u7F6E\u7ED3\u6784\u5316 pattern\uFF0C\u6309 deny-list \u8BED\u4E49\u5168\u90E8\u901A\u8FC7"
    };
  }
  const violations = [];
  for (const file of changedFiles) {
    for (const pattern of patterns) {
      if (matchesPattern(file, pattern)) {
        violations.push({ file, pattern });
        break;
      }
    }
  }
  if (violations.length > 0) {
    const detail = violations.map((v) => `${v.file}\uFF08\u547D\u4E2D exclude pattern: ${v.pattern}\uFF09`).join("; ");
    return {
      name: "scope",
      status: "failed",
      command: "scope-check",
      detail: `\u68C0\u6D4B\u5230 scope.exclude \u547D\u4E2D\uFF1A${detail}`
    };
  }
  return {
    name: "scope",
    status: "passed",
    command: "scope-check",
    detail: "\u53D8\u66F4\u6587\u4EF6\u672A\u547D\u4E2D\u4EFB\u4F55 scope.exclude pattern"
  };
}

// src/skill.ts
import { access as access3, mkdir as mkdir5, readFile as readFile6 } from "fs/promises";
import { exec } from "child_process";
import { promisify } from "util";
import path8 from "path";
import {
  parseFlatYaml,
  parseStringList,
  skillSchema
} from "@harnessly/shared";
var execAsync = promisify(exec);
function isMissingFileError5(error) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
async function fileExists3(filePath) {
  try {
    await access3(filePath);
    return true;
  } catch (error) {
    if (isMissingFileError5(error)) return false;
    throw error;
  }
}
function getSkillPath(workDir, checkName, language) {
  return path8.join(getHarnessPaths(workDir).harnessDir, "skills", checkName, `${language}.yaml`);
}
async function loadSkill(workDir, checkName, language) {
  const filePath = getSkillPath(workDir, checkName, language);
  if (!await fileExists3(filePath)) {
    return null;
  }
  const raw = parseFlatYaml(await readFile6(filePath, "utf8"));
  return skillSchema.parse({
    name: raw.name ?? checkName,
    language: raw.language ?? language,
    command: raw.command ?? "",
    successExitCode: Number(raw.success_exit_code ?? "0"),
    envRequired: parseStringList(raw.env_required),
    detailOnPass: raw.detail_on_pass ?? `${checkName} \u901A\u8FC7`,
    detailOnFailTemplate: raw.detail_on_fail_template ?? `${checkName} \u5931\u8D25`,
    fixHintTemplate: raw.fix_hint_template ?? `\u4FEE\u590D ${checkName} \u5931\u8D25\u540E\u91CD\u8DD1`
  });
}
function renderSkillTemplate(checkName, language, command) {
  return [
    `name: ${checkName}`,
    `language: ${language}`,
    `command: ${command}`,
    "success_exit_code: 0",
    "env_required:",
    `detail_on_pass: ${checkName} \u901A\u8FC7`,
    `detail_on_fail_template: ${checkName} \u5931\u8D25\uFF1A{stderr}`,
    `fix_hint_template: \u4FEE\u590D ${checkName} \u5931\u8D25\u540E\u91CD\u8DD1\u547D\u4EE4\uFF1A${command}`,
    ""
  ].join("\n");
}
var DEFAULT_NODE_SKILL_COMMANDS = {
  build: "npm run build",
  lint: "npm run lint",
  typecheck: "npm run typecheck",
  test: "npm test"
};
async function writeDefaultSkillManifests(workDir, language, requiredChecks, force = false) {
  const results = [];
  if (language !== "node") {
    return results;
  }
  for (const check of requiredChecks) {
    const command = DEFAULT_NODE_SKILL_COMMANDS[check];
    if (!command) continue;
    const skillPath = getSkillPath(workDir, check, language);
    await mkdir5(path8.dirname(skillPath), { recursive: true });
    const status = await writeFileIfChanged(skillPath, renderSkillTemplate(check, language, command), force);
    results.push({ check, language, status });
  }
  return results;
}
async function runSkillCheck(workDir, checkName, language) {
  const started = Date.now();
  const skill = await loadSkill(workDir, checkName, language);
  const skillPath = getSkillPath(workDir, checkName, language);
  if (!skill) {
    return {
      name: checkName,
      status: "skipped",
      command: `(missing skill) ${skillPath}`,
      detail: `.harness/skills/${checkName}/${language}.yaml \u672A\u914D\u7F6E`,
      fixHint: `\u8FD0\u884C harnessly init \u6216\u521B\u5EFA ${skillPath}`,
      durationMs: Date.now() - started
    };
  }
  const missingEnv = skill.envRequired.filter((name) => !process.env[name]);
  if (missingEnv.length > 0) {
    return {
      name: checkName,
      status: "skipped",
      command: skill.command,
      detail: `\u7F3A\u5C11\u73AF\u5883\u53D8\u91CF\uFF1A${missingEnv.join(", ")}`,
      fixHint: `\u914D\u7F6E\u73AF\u5883\u53D8\u91CF\u540E\u91CD\u8DD1\uFF1A${missingEnv.join(", ")}`,
      durationMs: Date.now() - started
    };
  }
  try {
    await execAsync(skill.command, {
      cwd: workDir,
      env: process.env,
      shell: "/bin/zsh"
    });
    return {
      name: checkName,
      status: "passed",
      command: skill.command,
      detail: skill.detailOnPass,
      durationMs: Date.now() - started
    };
  } catch (error) {
    const execError = error;
    const code = typeof execError.code === "number" ? execError.code : 1;
    if (code === skill.successExitCode) {
      return {
        name: checkName,
        status: "passed",
        command: skill.command,
        detail: skill.detailOnPass,
        durationMs: Date.now() - started
      };
    }
    const stderr = execError.stderr?.trim() || execError.stdout?.trim() || "\u547D\u4EE4\u6267\u884C\u5931\u8D25";
    return {
      name: checkName,
      status: "failed",
      command: skill.command,
      detail: skill.detailOnFailTemplate.replace("{stderr}", stderr),
      fixHint: skill.fixHintTemplate,
      durationMs: Date.now() - started
    };
  }
}

// src/validation.ts
import { access as access4, readFile as readFile7 } from "fs/promises";
import { exec as exec2 } from "child_process";
import { promisify as promisify2 } from "util";
import path9 from "path";
var execAsync2 = promisify2(exec2);
async function fileExists4(filePath) {
  try {
    await access4(filePath);
    return true;
  } catch {
    return false;
  }
}
function createSkippedCheck(index, criterion, detail) {
  return {
    name: `level2:${index}`,
    status: "skipped",
    command: criterion,
    detail
  };
}
async function runFileCheck(index, workDir, target) {
  const filePath = path9.join(workDir, target);
  const exists2 = await fileExists4(filePath);
  return {
    name: `level2:file:${index}`,
    status: exists2 ? "passed" : "failed",
    command: `file:${target}`,
    detail: exists2 ? `\u6587\u4EF6\u5B58\u5728: ${target}` : `\u6587\u4EF6\u4E0D\u5B58\u5728: ${target}`
  };
}
async function runContainsCheck(index, workDir, target, needle) {
  const filePath = path9.join(workDir, target);
  if (!await fileExists4(filePath)) {
    return {
      name: `level2:contains:${index}`,
      status: "failed",
      command: `contains:${target}::${needle}`,
      detail: `\u6587\u4EF6\u4E0D\u5B58\u5728: ${target}`
    };
  }
  const content = await readFile7(filePath, "utf8");
  const matched = content.includes(needle);
  return {
    name: `level2:contains:${index}`,
    status: matched ? "passed" : "failed",
    command: `contains:${target}::${needle}`,
    detail: matched ? `\u6587\u4EF6\u5305\u542B\u76EE\u6807\u6587\u672C: ${target}` : `\u6587\u4EF6\u672A\u5305\u542B\u76EE\u6807\u6587\u672C: ${target}`
  };
}
async function runCommandCheck(index, workDir, command) {
  try {
    await execAsync2(command, {
      cwd: workDir,
      env: process.env,
      shell: "/bin/zsh"
    });
    return {
      name: `level2:command:${index}`,
      status: "passed",
      command,
      detail: "\u547D\u4EE4\u6267\u884C\u901A\u8FC7"
    };
  } catch (error) {
    const execError = error;
    return {
      name: `level2:command:${index}`,
      status: "failed",
      command,
      detail: execError.stderr?.trim() || "\u547D\u4EE4\u6267\u884C\u5931\u8D25"
    };
  }
}
async function runLevel2Validation(workDir, contract) {
  if (!contract) {
    return [
      createSkippedCheck(0, "level2", "contract \u7F3A\u5931\uFF0C\u65E0\u6CD5\u8FD0\u884C Level 2 validation")
    ];
  }
  const checks = await Promise.all(
    contract.acceptanceCriteria.map(async (item, index) => {
      const criterion = item.criterion;
      if (criterion.startsWith("file:")) {
        return runFileCheck(index, workDir, criterion.slice("file:".length).trim());
      }
      if (criterion.startsWith("contains:")) {
        const payload = criterion.slice("contains:".length);
        const separatorIndex = payload.indexOf("::");
        if (separatorIndex === -1) {
          return createSkippedCheck(index, criterion, "contains \u6307\u4EE4\u683C\u5F0F\u9519\u8BEF\uFF0C\u5E94\u4E3A contains:path::text");
        }
        const target = payload.slice(0, separatorIndex).trim();
        const needle = payload.slice(separatorIndex + 2).trim();
        return runContainsCheck(index, workDir, target, needle);
      }
      if (criterion.startsWith("command:")) {
        return runCommandCheck(index, workDir, criterion.slice("command:".length).trim());
      }
      return createSkippedCheck(index, criterion, "\u975E\u7ED3\u6784\u5316 acceptance criterion\uFF0C\u8DF3\u8FC7 Level 2");
    })
  );
  return checks;
}

// src/evidence.ts
var execAsync3 = promisify3(exec3);
async function collectChangedFiles(workDir) {
  try {
    const { stdout } = await execAsync3("git status --short", {
      cwd: workDir,
      env: process.env,
      shell: "/bin/zsh"
    });
    return stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => line.replace(/^[A-Z? ]+/, "").trim());
  } catch {
    return [];
  }
}
async function countCommand(workDir, command) {
  try {
    const { stdout } = await execAsync3(command, {
      cwd: workDir,
      env: process.env,
      shell: "/bin/zsh"
    });
    return Number(stdout.trim()) || 0;
  } catch {
    return 0;
  }
}
async function collectEvidence(workDir, config, contract) {
  const skillChecks = await Promise.all(
    config.requiredChecks.map((checkName) => runSkillCheck(workDir, checkName, config.projectType))
  );
  const changedFiles = await collectChangedFiles(workDir);
  const scopeCheck = runScopeCheck(contract, changedFiles);
  const level2Checks = await runLevel2Validation(workDir, contract);
  const checks = [...skillChecks, scopeCheck, ...level2Checks];
  return {
    checks,
    changedFiles,
    lintWarningsTotal: 0,
    todoCount: await countCommand(workDir, "git grep -n -E 'TODO|FIXME' -- ':!node_modules' ':!dist' | wc -l"),
    gitDirtyFiles: changedFiles.length
  };
}

// src/evidence-baseline.ts
import { mkdir as mkdir6, readFile as readFile8, writeFile as writeFile5 } from "fs/promises";
import path10 from "path";
import {
  baselineDiffSchema,
  evidenceBaselineSchema,
  evidenceSnapshotSchema
} from "@harnessly/shared";
var EVIDENCE_BASELINE_FILENAME = "evidence-baseline.json";
function getEvidenceBaselinePath(workDir) {
  return path10.join(getHarnessPaths(workDir).harnessDir, EVIDENCE_BASELINE_FILENAME);
}
function getTaskEvidenceDir(taskDir) {
  return path10.join(taskDir, "evidence");
}
function getTaskEvidencePath(taskDir, kind) {
  return path10.join(getTaskEvidenceDir(taskDir), `${kind}.json`);
}
function isMissingFileError6(error) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
function buildEvidenceBaseline(evidence) {
  const failedCheckNames = evidence.checks.filter((check) => check.status === "failed").map((check) => check.name).sort((a, b) => a.localeCompare(b));
  return {
    capturedAt: (/* @__PURE__ */ new Date()).toISOString(),
    failedCheckNames
  };
}
function buildEvidenceSnapshot(evidence) {
  return {
    capturedAt: (/* @__PURE__ */ new Date()).toISOString(),
    checks: evidence.checks,
    lintWarningsTotal: evidence.lintWarningsTotal,
    todoCount: evidence.todoCount,
    gitDirtyFiles: evidence.gitDirtyFiles
  };
}
function checkMap(snapshot) {
  return new Map(snapshot.checks.map((check) => [check.name, check.status]));
}
function buildBaselineDiff(baseline, current) {
  const baselineChecks = checkMap(baseline);
  const currentChecks = checkMap(current);
  const names = /* @__PURE__ */ new Set([...baselineChecks.keys(), ...currentChecks.keys()]);
  const checks = {};
  for (const name of [...names].sort((a, b) => a.localeCompare(b))) {
    const from = baselineChecks.get(name) ?? "missing";
    const to = currentChecks.get(name) ?? "missing";
    checks[name] = {
      from,
      to,
      regression: from === "passed" && to === "failed"
    };
  }
  return {
    checks,
    lintWarningsDelta: current.lintWarningsTotal - baseline.lintWarningsTotal,
    todoDelta: current.todoCount - baseline.todoCount
  };
}
async function saveEvidenceSnapshot(taskDir, kind, snapshot) {
  const validated = evidenceSnapshotSchema.parse(snapshot);
  const filePath = getTaskEvidencePath(taskDir, kind);
  await mkdir6(path10.dirname(filePath), { recursive: true });
  await writeFile5(filePath, `${JSON.stringify(validated, null, 2)}
`, "utf8");
}
async function saveBaselineDiff(taskDir, diff) {
  const validated = baselineDiffSchema.parse(diff);
  const filePath = getTaskEvidencePath(taskDir, "baseline-diff");
  await mkdir6(path10.dirname(filePath), { recursive: true });
  await writeFile5(filePath, `${JSON.stringify(validated, null, 2)}
`, "utf8");
}
async function loadEvidenceBaseline(workDir) {
  const filePath = getEvidenceBaselinePath(workDir);
  let text;
  try {
    text = await readFile8(filePath, "utf8");
  } catch (error) {
    if (isMissingFileError6(error)) return null;
    throw error;
  }
  try {
    const raw = JSON.parse(text);
    return evidenceBaselineSchema.parse(raw);
  } catch {
    return null;
  }
}
async function saveEvidenceBaseline(workDir, baseline) {
  const validated = evidenceBaselineSchema.parse(baseline);
  const filePath = getEvidenceBaselinePath(workDir);
  await mkdir6(path10.dirname(filePath), { recursive: true });
  await writeFile5(filePath, `${JSON.stringify(validated, null, 2)}
`, "utf8");
}

// src/execute.ts
import { exec as exec4 } from "child_process";
import { promisify as promisify4 } from "util";
var execAsync4 = promisify4(exec4);
async function runShellCommand(command, input) {
  try {
    const { stdout, stderr } = await execAsync4(command, {
      cwd: input.workDir,
      env: {
        ...process.env,
        HARNESSLY_TASK_ID: input.taskId,
        HARNESSLY_WORKDIR: input.workDir,
        HARNESSLY_PROMPT_FILE: input.promptFile
      },
      shell: "/bin/zsh"
    });
    return {
      kind: "custom",
      command,
      exitCode: 0,
      stdout,
      stderr
    };
  } catch (error) {
    const execError = error;
    return {
      kind: "custom",
      command,
      exitCode: execError.code ?? 1,
      stdout: execError.stdout ?? "",
      stderr: execError.stderr ?? ""
    };
  }
}
var CustomAdapter = class {
  kind = "custom";
  async execute(input) {
    const command = input.command?.trim();
    if (!command) {
      throw new Error("custom adapter \u7F3A\u5C11 command");
    }
    const result = await runShellCommand(command, input);
    return {
      ...result,
      kind: this.kind
    };
  }
};
var ClaudeCodeAdapter = class {
  kind = "claude-code";
  async execute(input) {
    const command = input.command?.trim();
    if (!command) {
      throw new Error(
        "claude-code adapter \u5C1A\u672A\u914D\u7F6E\u5B9E\u9645\u6267\u884C\u547D\u4EE4\u3002\u8BF7\u901A\u8FC7 --adapter-command \u6216 harness.config.yaml \u63D0\u4F9B\u3002"
      );
    }
    const result = await runShellCommand(command, input);
    return {
      ...result,
      kind: this.kind
    };
  }
};
var CodexAdapter = class {
  kind = "codex";
  async execute(input) {
    const command = input.command?.trim() || 'codex exec --full-auto - < "$HARNESSLY_PROMPT_FILE"';
    const result = await runShellCommand(command, input);
    return {
      ...result,
      kind: this.kind
    };
  }
};
function createAdapter(kind) {
  switch (kind) {
    case "claude-code":
      return new ClaudeCodeAdapter();
    case "codex":
      return new CodexAdapter();
    case "custom":
    default:
      return new CustomAdapter();
  }
}

// src/gate.ts
function evaluateCommitGate(evidence, adapterExitCode, options = {}) {
  const failures = [];
  const warnings = [];
  const preExistingFailures = [];
  const baselineFailedNames = new Set(options.baseline?.failedCheckNames ?? []);
  if (adapterExitCode !== 0) {
    failures.push(`adapter exit code = ${adapterExitCode}`);
  }
  for (const check of evidence.checks) {
    if (check.status !== "failed") continue;
    if (baselineFailedNames.has(check.name)) {
      preExistingFailures.push(check.name);
    } else {
      failures.push(`${check.name} \u5931\u8D25`);
    }
  }
  if (evidence.changedFiles.length === 0) {
    warnings.push("\u672A\u68C0\u6D4B\u5230\u5DE5\u4F5C\u533A\u53D8\u66F4");
  }
  const decision = failures.length > 0 ? "fail" : warnings.length > 0 ? "needs_human_review" : "pass";
  return {
    passed: decision === "pass",
    decision,
    failures,
    warnings,
    preExistingFailures
  };
}

// src/llm.ts
import Anthropic from "@anthropic-ai/sdk";
import { zodToJsonSchema } from "zod-to-json-schema";
import { z } from "zod";
var DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-20250514";
function extractTextContent(content) {
  return content.filter((block) => block.type === "text").map((block) => block.text).join("\n").trim();
}
function toErrorMessage(error) {
  if (error instanceof z.ZodError) {
    return error.issues.map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`).join("; ");
  }
  return error instanceof Error ? error.message : String(error);
}
var AnthropicClient = class {
  providerName = "anthropic";
  client;
  model;
  constructor(options = {}) {
    this.client = new Anthropic({
      apiKey: options.apiKey ?? process.env.ANTHROPIC_API_KEY
    });
    this.model = options.model ?? process.env.HARNESSLY_ANTHROPIC_MODEL ?? DEFAULT_ANTHROPIC_MODEL;
  }
  async generateStructured(options) {
    const toolName = options.toolName ?? "emit_structured_output";
    const inputSchema = zodToJsonSchema(options.schema, toolName);
    const callOnce = async (extraHint) => {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: options.maxTokens ?? 4096,
        temperature: options.temperature,
        system: options.systemPrompt,
        tools: [
          {
            name: toolName,
            description: options.toolDescription ?? "\u6309\u7ED9\u5B9A JSON \u7ED3\u6784\u8FD4\u56DE\u6700\u7EC8\u7ED3\u679C",
            input_schema: inputSchema
          }
        ],
        tool_choice: { type: "tool", name: toolName },
        messages: [
          {
            role: "user",
            content: extraHint ? `${options.prompt}

\u4E0A\u6B21\u8FD4\u56DE\u65E0\u6548\uFF1A${extraHint}` : options.prompt
          }
        ]
      });
      const toolUse = response.content.find((block) => block.type === "tool_use");
      if (!toolUse || toolUse.type !== "tool_use") {
        throw new Error("\u6A21\u578B\u672A\u6309\u9884\u671F\u8FD4\u56DE\u7ED3\u6784\u5316\u8F93\u51FA");
      }
      return options.schema.parse(toolUse.input);
    };
    try {
      return await callOnce();
    } catch (error) {
      return callOnce(toErrorMessage(error));
    }
  }
  async generateText(options) {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: options.maxTokens ?? 1024,
      temperature: options.temperature,
      system: options.systemPrompt,
      messages: [
        {
          role: "user",
          content: options.prompt
        }
      ]
    });
    return extractTextContent(response.content);
  }
};
function createLLMClientFromEnv(env = process.env) {
  const provider = env.HARNESSLY_LLM_PROVIDER?.trim();
  if (provider && provider !== "anthropic") {
    return null;
  }
  if (!env.ANTHROPIC_API_KEY) {
    return null;
  }
  return new AnthropicClient({
    apiKey: env.ANTHROPIC_API_KEY,
    model: env.HARNESSLY_ANTHROPIC_MODEL
  });
}

// src/plan.ts
function generatePlan(contract) {
  const acceptance = contract.acceptanceCriteria.map((item) => item.criterion).join("\uFF1B");
  const lines = [
    "# Plan",
    "",
    `1. \u660E\u786E ${contract.goal} \u5BF9\u5E94\u7684\u4FEE\u6539\u8FB9\u754C\uFF1A${contract.scopeInclude.join("\u3001")}`,
    "2. \u5728\u6700\u5C0F\u6539\u52A8\u8303\u56F4\u5185\u5B8C\u6210\u5B9E\u73B0\u6216\u4FEE\u590D",
    `3. \u6309\u9A8C\u6536\u6807\u51C6\u81EA\u68C0\uFF1A${acceptance}`,
    ""
  ];
  return lines.join("\n");
}

// src/promote.ts
import { mkdir as mkdir7, writeFile as writeFile6 } from "fs/promises";
import path11 from "path";
import { serializeTemplateDraft } from "@harnessly/shared";
function slugify(input) {
  return input.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "template";
}
function extractAppliesTo(goal, templateName) {
  return [templateName, ...goal.split(/\s+/).filter(Boolean).slice(0, 3)];
}
function createTemplateDraft(name, contract, report, config) {
  return {
    name,
    description: contract.goal,
    sourceTaskId: report.taskId,
    appliesTo: extractAppliesTo(contract.goal, contract.templateName),
    templateName: contract.templateName,
    riskLevel: contract.riskLevel,
    requiredChecks: config.requiredChecks,
    scopeInclude: contract.scopeInclude,
    outOfScope: contract.outOfScope,
    acceptanceCriteria: contract.acceptanceCriteria.map((item) => item.criterion)
  };
}
function deriveTemplateName(goal) {
  return slugify(goal);
}
async function saveTemplateDraft(workDir, template) {
  const templatesDir = path11.join(workDir, ".harness", "templates");
  const filePath = path11.join(templatesDir, `${template.name}.yaml`);
  await mkdir7(templatesDir, { recursive: true });
  await writeFile6(filePath, serializeTemplateDraft(template), "utf8");
  return filePath;
}

// src/prompt.ts
var STAGE_INSTRUCTIONS = {
  created: [
    "\u4EFB\u52A1\u5C1A\u672A\u8FDB\u5165\u4E3B\u9636\u6BB5\u3002\u5148\u7B49\u5F85 spec \u9636\u6BB5\u4EA7\u51FA contract.yaml\u3002"
  ],
  spec: [
    "\u5F53\u524D\u5728 SPEC \u9636\u6BB5\uFF0C\u53EA\u6F84\u6E05\u9700\u6C42\u3001\u5217\u53EF\u9A8C\u6536\u70B9\u3002",
    "\u4E0D\u8981\u5199\u4EE3\u7801\u3001\u4E0D\u8981\u505A\u6280\u672F\u65B9\u6848\uFF0C\u90A3\u662F design \u9636\u6BB5\u7684\u4E8B\u3002"
  ],
  design: [
    "\u5F53\u524D\u5728 DESIGN \u9636\u6BB5\uFF0C\u57FA\u4E8E contract.yaml \u5217\u5B9E\u65BD\u6B65\u9AA4\u3001\u4F9D\u8D56\u3001\u98CE\u9669\u3002",
    "\u4E0D\u8981\u76F4\u63A5\u52A8\u624B\u6539\u4EE3\u7801\u3002"
  ],
  execute: [
    "\u5F53\u524D\u5728 EXECUTE \u9636\u6BB5\uFF0C\u4E25\u683C\u6309 plan.md \u6267\u884C\uFF0C\u4E0D\u8981\u4FEE\u6539 contract.yaml / plan.md\u3002",
    "\u5982\u679C plan \u5728\u6267\u884C\u4E2D\u88AB\u8BC1\u4F2A\uFF0C\u505C\u4E0B\u6765\u8BB0\u5F55\u539F\u56E0\u5E76\u6807\u8BB0 plan \u5F85\u4FEE\u6B63\uFF0C\u4E0D\u8981\u7ED5\u8FC7\u3002",
    "\u5B8C\u6210\u540E\u4F1A\u8FDB\u5165 review / test / commit_gate \u9636\u6BB5\u505A\u9A8C\u8BC1\u3002"
  ],
  review: [
    "\u5F53\u524D\u5728 REVIEW \u9636\u6BB5\uFF0C\u53EA\u8BFB\u6539\u52A8\u3001\u7ED9\u51FA findings\uFF0C\u4E0D\u8981\u518D\u52A8\u4EE3\u7801\u3002",
    "\u5173\u6CE8 scope \u8D8A\u754C\u3001\u654F\u611F\u6587\u4EF6\u3001\u6539\u52A8\u89C4\u6A21\u3001\u6F5C\u5728\u526F\u4F5C\u7528\u3002"
  ],
  test: [
    "\u5F53\u524D\u5728 TEST \u9636\u6BB5\uFF0C\u8DD1\u914D\u7F6E\u4E2D\u7684 required checks \u4E0E acceptance \u6821\u9A8C\u3002",
    "\u53EA\u8F93\u51FA evidence\uFF0C\u4E0D\u8981\u4FEE\u4EE3\u7801\u3002"
  ],
  commit_gate: [
    "\u5F53\u524D\u5728 COMMIT_GATE \u9636\u6BB5\uFF0C\u57FA\u4E8E review + test \u7684\u4EA7\u51FA\u505A\u4E09\u6001\u51B3\u7B56\u3002",
    "\u4E0D\u8981\u91CD\u65B0\u6267\u884C\u4EFB\u52A1\uFF1B\u5982\u679C block\uFF0C\u628A\u5931\u8D25\u539F\u56E0\u5199\u56DE feedback\u3002"
  ],
  failed: [
    "\u4EFB\u52A1\u5904\u4E8E\u5931\u8D25\u7EC8\u6001\u3002\u68C0\u67E5 lastFailureStage \u4E0E feedback\uFF0C\u51B3\u5B9A\u662F\u5426\u91CD\u8BD5\u6216\u8C03\u6574\u3002"
  ],
  retry: [
    "\u4EFB\u52A1\u5904\u4E8E\u91CD\u8BD5\u77AC\u6001\u3002Workflow \u4F1A\u6309 resumeFrom \u63A8\u8FDB\u3002"
  ]
};
function renderStageInstructions(stage) {
  const lines = STAGE_INSTRUCTIONS[stage];
  return ["## Stage Instructions (" + stage + ")", ...lines.map((line) => `- ${line}`)].join("\n");
}
function renderContract(ctx) {
  if (!ctx.contract) {
    return "## Contract (SPEC \u5DE5\u4EF6)\n- missing";
  }
  return [
    "## Contract (SPEC \u5DE5\u4EF6\uFF0C\u4E0D\u53EF\u4FEE\u6539)",
    `- goal: ${ctx.contract.goal}`,
    `- template: ${ctx.contract.templateName}`,
    `- risk: ${ctx.contract.riskLevel}`,
    `- scope_include: ${ctx.contract.scopeInclude.join("\u3001") || "(\u7A7A)"}`,
    `- acceptance: ${ctx.contract.acceptanceCriteria.map((item) => item.criterion).join("\uFF1B") || "(\u7A7A)"}`
  ].join("\n");
}
function renderPlan(ctx) {
  if (!ctx.plan) {
    return "## Plan (DESIGN \u5DE5\u4EF6)\n- missing";
  }
  return ["## Plan (DESIGN \u5DE5\u4EF6\uFF0C\u4E0D\u53EF\u4FEE\u6539)", ctx.plan.trim()].join("\n");
}
function renderRetryContext(ctx) {
  if (ctx.state.retryCount <= 0 && !ctx.feedback) {
    return null;
  }
  const lines = [
    "## Retry Context",
    `- retry_count: ${ctx.state.retryCount}`,
    `- last_failure_stage: ${ctx.state.lastFailureStage ?? "none"}`
  ];
  if (ctx.feedback) {
    lines.push("", "### Feedback", ctx.feedback.trim());
  }
  return lines.join("\n");
}
function formatFeedbackEntryLine(entry) {
  const decoration = entry.failureStage ? ` @${entry.failureStage}` : "";
  return `- [${entry.taskId}] (${entry.template ?? "general"}, ${entry.decision}, retry=${entry.retryCount})${decoration} ${entry.goal}`;
}
function renderFeedbackPoolSection(ctx) {
  const entries = ctx.feedbackPool;
  if (!entries || entries.length === 0) {
    return null;
  }
  return [
    "## Feedback Pool (\u5386\u53F2\u7ECF\u9A8C\u6458\u5F55)",
    "> \u540C\u4ED3\u5E93\u5DF2\u5B8C\u6210\u4EFB\u52A1\u7684\u7B80\u7ED3\u6784\u6C89\u6DC0\uFF1B\u7528\u4E8E\u501F\u9274\u6A21\u5F0F\u4E0E\u907F\u5751\uFF0C\u4F46\u6BCF\u6761\u90FD\u5DF2\u8131\u654F\uFF0C\u4EC5\u542B goal/decision/retry\u3002",
    ...entries.map(formatFeedbackEntryLine)
  ].join("\n");
}
function assemblePrompt(ctx) {
  const stage = ctx.state.currentStage;
  const sections = [
    "# Harnessly Execution Prompt",
    "",
    `task_id: ${ctx.taskId}`,
    `goal: ${ctx.goal}`,
    `current_stage: ${stage}`,
    `retry_count: ${ctx.state.retryCount}`,
    "",
    renderContract(ctx),
    "",
    renderPlan(ctx),
    "",
    renderStageInstructions(stage)
  ];
  const retryContext = renderRetryContext(ctx);
  if (retryContext) {
    sections.push("", retryContext);
  }
  const feedbackPoolSection = renderFeedbackPoolSection(ctx);
  if (feedbackPoolSection) {
    sections.push("", feedbackPoolSection);
  }
  sections.push(
    "",
    "## Rules",
    "- \u53EA\u5728 contract.scopeInclude \u8303\u56F4\u5185\u4FEE\u6539",
    "- \u4F18\u5148\u6700\u5C0F\u6539\u52A8",
    "- \u5B8C\u6210\u540E\u786E\u4FDD\u6709\u53EF\u9A8C\u8BC1\u4EA7\u7269",
    ""
  );
  return sections.join("\n");
}

// src/report.ts
import {
  validateTaskReport
} from "@harnessly/shared";
function buildSummary(commitGate) {
  const preExistingHint = commitGate.preExistingFailures.length > 0 ? `\uFF08\u5DF2\u5FFD\u7565 baseline \u65E7\u5931\u8D25\uFF1A${commitGate.preExistingFailures.join(", ")}\uFF09` : "";
  if (commitGate.decision === "pass") {
    return `\u6267\u884C\u4E0E\u6700\u5C0F\u9A8C\u8BC1\u901A\u8FC7${preExistingHint}`;
  }
  if (commitGate.decision === "needs_human_review") {
    const reasons2 = commitGate.warnings.length > 0 ? commitGate.warnings.join("\uFF1B") : "\u672A\u5217\u660E\u544A\u8B66";
    return `commit_gate \u8F6F\u6027\u544A\u8B66\uFF1A${reasons2}${preExistingHint}\uFF08\u9700 PM \u786E\u8BA4\uFF09`;
  }
  const reasons = commitGate.failures.length > 0 ? commitGate.failures.join("\uFF1B") : "\u672A\u5217\u660E\u5931\u8D25\u539F\u56E0";
  return `commit_gate \u786C\u6027\u5931\u8D25\uFF1A${reasons}${preExistingHint}`;
}
function createTaskReport(ctx, adapter, evidence, commitGate) {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  return validateTaskReport({
    taskId: ctx.taskId,
    goal: ctx.goal,
    finalStage: "commit_gate",
    commitDecision: commitGate.decision,
    artifacts: {
      requirement: `${ctx.taskDir}/requirement.md`,
      contract: `${ctx.taskDir}/contract.yaml`,
      design: `${ctx.taskDir}/design.md`,
      taskBreakdown: `${ctx.taskDir}/task-breakdown.md`,
      implementationNotes: `${ctx.taskDir}/implementation-notes.md`,
      review: `${ctx.taskDir}/review.md`,
      residentReview: `${ctx.taskDir}/resident-review.md`,
      testReport: `${ctx.taskDir}/test-report.md`,
      baselineEvidence: `${ctx.taskDir}/evidence/baseline.json`,
      currentEvidence: `${ctx.taskDir}/evidence/current.json`,
      baselineDiff: `${ctx.taskDir}/evidence/baseline-diff.json`,
      commitSummary: `${ctx.taskDir}/commit-summary.md`
    },
    metrics: {
      llmCalls: 0,
      durationSeconds: Math.max(0, Math.floor((Date.parse(now) - Date.parse(ctx.state.createdAt)) / 1e3)),
      retries: ctx.state.retryCount
    },
    createdAt: ctx.state.createdAt,
    finishedAt: now,
    adapter,
    evidence,
    commitGate,
    commitReady: commitGate.decision === "pass",
    summary: buildSummary(commitGate),
    generatedAt: now
  });
}

// src/resident-review.ts
import { readFile as readFile9 } from "fs/promises";
function isMissingFileError7(error) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
async function loadReviewAgentsConfig(workDir) {
  try {
    return await readFile9(getHarnessPaths(workDir).reviewAgentsFile, "utf8");
  } catch (error) {
    if (isMissingFileError7(error)) return null;
    throw error;
  }
}
async function renderResidentReview(workDir, findings) {
  const configText = await loadReviewAgentsConfig(workDir);
  const active = Boolean(configText?.includes("review_agents:"));
  const failed = findings.filter((finding) => finding.status === "failed");
  return [
    "# Resident Review",
    "",
    "## Config",
    active ? "- .harness/review-agents.yaml: loaded" : "- .harness/review-agents.yaml: missing",
    "",
    "## Decision",
    failed.length > 0 ? "fail" : "pass",
    "",
    "## Findings",
    failed.length === 0 ? "- none" : failed.map((finding) => `- ${finding.name}: ${finding.detail}`).join("\n"),
    ""
  ].join("\n");
}

// src/review.ts
var SENSITIVE_FILE_PATTERNS = [
  /(^|\/)\.env(\.|$)/,
  /(^|\/)\.env\.local$/,
  /credentials\.(json|yaml|yml|env)$/i,
  /secrets?\.(json|yaml|yml|env)$/i,
  /(^|\/)id_rsa(\.|$)/,
  /\.pem$/i,
  /\.p12$/i,
  /\.pfx$/i
];
var LARGE_CHANGE_SET_THRESHOLD = 50;
function detectSensitiveFiles(changedFiles) {
  return changedFiles.filter((file) => SENSITIVE_FILE_PATTERNS.some((pattern) => pattern.test(file)));
}
function runReviewStage(changedFiles) {
  const findings = [];
  if (changedFiles.length === 0) {
    findings.push({
      name: "review.empty_change_set",
      status: "skipped",
      command: "review-static",
      detail: "\u5DE5\u4F5C\u533A\u65E0\u53D8\u66F4\uFF0C\u8DF3\u8FC7 review \u9636\u6BB5\u9759\u6001\u68C0\u67E5"
    });
    return findings;
  }
  if (changedFiles.length > LARGE_CHANGE_SET_THRESHOLD) {
    findings.push({
      name: "review.large_change_set",
      status: "failed",
      command: "review-static",
      detail: `\u6539\u52A8\u6587\u4EF6\u6570 ${changedFiles.length} \u8D85\u8FC7\u9608\u503C ${LARGE_CHANGE_SET_THRESHOLD}\uFF0C\u5EFA\u8BAE\u62C6\u5206\u4EFB\u52A1`
    });
  } else {
    findings.push({
      name: "review.change_set_size",
      status: "passed",
      command: "review-static",
      detail: `\u6539\u52A8\u6587\u4EF6\u6570 ${changedFiles.length}\uFF0C\u5904\u4E8E\u5408\u7406\u533A\u95F4`
    });
  }
  const sensitive = detectSensitiveFiles(changedFiles);
  if (sensitive.length > 0) {
    findings.push({
      name: "review.sensitive_file",
      status: "failed",
      command: "review-static",
      detail: `\u68C0\u51FA\u654F\u611F\u6587\u4EF6\u6539\u52A8\uFF1A${sensitive.join(", ")}`
    });
  } else {
    findings.push({
      name: "review.sensitive_file",
      status: "passed",
      command: "review-static",
      detail: "\u672A\u68C0\u51FA\u654F\u611F\u6587\u4EF6\u6539\u52A8"
    });
  }
  return findings;
}

// src/structure-check.ts
import { readFile as readFile10 } from "fs/promises";
import path12 from "path";
function isMissingFileError8(error) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
function parseStructureRules(text) {
  const max = text.match(/^\s*max:\s*(\d+)\s*$/m)?.[1];
  const excludes = [];
  let inExclude = false;
  for (const line of text.split(/\r?\n/)) {
    if (/^\s*exclude:\s*$/.test(line)) {
      inExclude = true;
      continue;
    }
    if (inExclude && /^\S/.test(line)) {
      inExclude = false;
    }
    const item = inExclude ? line.match(/^\s*-\s+(.+)$/)?.[1]?.trim() : null;
    if (item) excludes.push(item);
  }
  return {
    fileLengthMax: max ? Number(max) : void 0,
    fileLengthExclude: excludes
  };
}
function matchesPrefix(filePath, pattern) {
  if (pattern.endsWith("/")) return filePath.startsWith(pattern);
  if (pattern.includes("*")) {
    const re = new RegExp(pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*"));
    return re.test(filePath);
  }
  return filePath === pattern || filePath.startsWith(pattern);
}
async function runStructureCheck(workDir, changedFiles) {
  const rulesPath = path12.join(getHarnessPaths(workDir).harnessDir, "structure-rules.yaml");
  let text;
  try {
    text = await readFile10(rulesPath, "utf8");
  } catch (error) {
    if (isMissingFileError8(error)) {
      return [
        {
          name: "structure.rules",
          status: "skipped",
          command: "structure-check",
          detail: ".harness/structure-rules.yaml \u672A\u914D\u7F6E",
          fixHint: "\u8FD0\u884C harnessly init \u6216\u521B\u5EFA structure-rules.yaml"
        }
      ];
    }
    throw error;
  }
  const rules = parseStructureRules(text);
  const results = [];
  if (rules.fileLengthMax === void 0) {
    results.push({
      name: "structure.file_length",
      status: "skipped",
      command: "structure-check:file_length",
      detail: "file_length.max \u672A\u914D\u7F6E"
    });
  } else {
    const violations = [];
    for (const file of changedFiles) {
      if (rules.fileLengthExclude.some((pattern) => matchesPrefix(file, pattern))) continue;
      try {
        const content = await readFile10(path12.join(workDir, file), "utf8");
        const lines = content.split(/\r?\n/).length;
        if (lines > rules.fileLengthMax) {
          violations.push(`${file}=${lines}`);
        }
      } catch {
      }
    }
    results.push({
      name: "structure.file_length",
      status: violations.length > 0 ? "failed" : "passed",
      command: "structure-check:file_length",
      detail: violations.length > 0 ? `\u6587\u4EF6\u957F\u5EA6\u8D85\u8FC7 max=${rules.fileLengthMax}: ${violations.join(", ")}` : `\u53D8\u66F4\u6587\u4EF6\u5747\u672A\u8D85\u8FC7 max=${rules.fileLengthMax}`,
      fixHint: violations.length > 0 ? "\u62C6\u5206\u6587\u4EF6\u6216\u66F4\u65B0 structure-rules.yaml \u7684 exclude" : void 0
    });
  }
  results.push({
    name: "structure.unique_implementations",
    status: "skipped",
    command: "structure-check:unique_implementations",
    detail: "unique_implementations \u5C1A\u672A\u914D\u7F6E\u5177\u4F53\u89C4\u5219"
  });
  results.push({
    name: "structure.package_dependencies",
    status: "skipped",
    command: "structure-check:package_dependencies",
    detail: "package_dependencies.forbid \u5C1A\u672A\u914D\u7F6E\u5177\u4F53\u89C4\u5219"
  });
  return results;
}

// src/workflow.ts
import { validateDesignMarkdown, validateRequirementMarkdown } from "@harnessly/shared";
function markCompleted(ctx, stage) {
  if (!ctx.state.completedStages.includes(stage)) {
    ctx.state.completedStages = [...ctx.state.completedStages, stage];
  }
}
function renderList(items, fallback) {
  return (items.length > 0 ? items : [fallback]).map((item) => `- ${item}`);
}
function renderRequirementMarkdown(contract) {
  return [
    "# Requirement",
    "",
    "## Goal",
    contract.goal,
    "",
    "## In Scope",
    ...renderList(contract.scopeInclude, contract.goal),
    "",
    "## Out of Scope",
    ...renderList(contract.outOfScope, "\u4E0E\u76EE\u6807\u65E0\u5173\u7684\u91CD\u6784"),
    "",
    "## Affected Modules",
    ...renderList(contract.scopeInclude, "\u5F85\u5B9E\u73B0\u9636\u6BB5\u786E\u8BA4"),
    "",
    "## Acceptance Criteria",
    ...renderList(
      contract.acceptanceCriteria.map((item) => item.criterion),
      "\u9A8C\u6536\u6807\u51C6\u5DF2\u5728 contract.yaml \u4E2D\u7ED3\u6784\u5316\u8BB0\u5F55"
    ),
    "",
    "## Risks",
    ...renderList([`risk_level=${contract.riskLevel}`], "\u65E0"),
    "",
    "## Open Questions",
    "- \u65E0",
    ""
  ].join("\n");
}
function renderDesignMarkdown(contract) {
  return [
    "# Design",
    "",
    "## Decision",
    "- \u65B9\u6848 A\uFF1A\u5728\u73B0\u6709\u5DE5\u4F5C\u6D41\u4E2D\u8865\u9F50\u7F3A\u5931\u5DE5\u4EF6\u548C\u6821\u9A8C\uFF0C\u4FDD\u6301\u5F53\u524D CLI \u4E0E host \u5165\u53E3\u3002",
    "- \u65B9\u6848 B\uFF1A\u91CD\u5199\u5DE5\u4F5C\u6D41\u5F15\u64CE\u5E76\u66FF\u6362\u73B0\u6709\u4EFB\u52A1\u72B6\u6001\u6A21\u578B\u3002",
    "- \u91C7\u7528\u65B9\u6848 A\uFF1A\u5F71\u54CD\u8303\u56F4\u8F83\u5C0F\uFF0C\u80FD\u4FDD\u6301\u73B0\u6709\u5165\u53E3\u517C\u5BB9\u3002",
    "",
    "## Interfaces",
    "- Contract \u4F7F\u7528 version/task_id/scope/acceptance_criteria \u7B49 v3-core \u5B57\u6BB5\u3002",
    "- TaskState \u4F7F\u7528 current_owner \u4E0E active/blocked/completed/aborted \u72B6\u6001\u3002",
    "- Workflow \u9636\u6BB5\u4EA7\u51FA requirement.md\u3001design.md\u3001task-breakdown.md\u3001implementation-notes.md\u3001review.md\u3001test-report.md\u3002",
    "",
    "## Impact",
    ...renderList(contract.scopeInclude, "packages/core/src/workflow.ts"),
    "",
    "## Feasibility Self-Check",
    "- scope \u662F\u5426\u6E05\u6670\uFF1A\u662F\uFF0C\u6765\u81EA contract.yaml \u7684 scope.include \u4E0E scope.exclude\u3002",
    "- design \u662F\u5426\u5B8C\u6574\uFF1A\u662F\uFF0C\u5305\u542B\u51B3\u7B56\u3001\u63A5\u53E3\u3001\u5F71\u54CD\u8303\u56F4\u3002",
    "- task-breakdown \u662F\u5426\u5408\u7406\uFF1A\u662F\uFF0C\u62C6\u6210\u53EF\u9A8C\u8BC1\u7684\u9636\u6BB5\u4EA7\u7269\u3002",
    "- \u98CE\u9669\u662F\u5426\u53EF\u63A7\uFF1A\u662F\uFF0C\u4FDD\u6301\u517C\u5BB9\u5B57\u6BB5\u5E76\u7528\u6D4B\u8BD5\u9A8C\u8BC1\u3002",
    "- \u662F\u5426\u4E0E\u73B0\u6709\u67B6\u6784\u51B2\u7A81\uFF1A\u5426\uFF0C\u7EE7\u7EED\u4F7F\u7528 repo-local .harness \u4E8B\u5B9E\u6E90\u3002",
    ""
  ].join("\n");
}
function renderTaskBreakdown(contract) {
  return [
    "# Task Breakdown",
    "",
    "1. [ ] SPEC \u5DE5\u4EF6",
    "   - deps: []",
    "   - acceptance: requirement.md \u4E0E contract.yaml \u5B58\u5728\u5E76\u901A\u8FC7\u6821\u9A8C",
    "2. [ ] DESIGN \u5DE5\u4EF6",
    "   - deps: [1]",
    "   - acceptance: design.md \u4E0E task-breakdown.md \u5B58\u5728\u5E76\u901A\u8FC7\u6821\u9A8C",
    "3. [ ] EXECUTE \u5DE5\u4EF6",
    "   - deps: [2]",
    "   - acceptance: implementation-notes.md \u8BB0\u5F55\u6267\u884C\u987A\u5E8F\u4E0E\u504F\u79BB",
    "4. [ ] REVIEW/TEST \u5DE5\u4EF6",
    "   - deps: [3]",
    "   - acceptance: review.md\u3001test-report.md\u3001report.json \u53EF\u4F9B gate \u4F7F\u7528",
    "",
    `> goal: ${contract.goal}`,
    ""
  ].join("\n");
}
function renderImplementationNotes(adapterResult) {
  return [
    "# Implementation Notes",
    "",
    "## Order",
    "- \u6267\u884C adapter \u6216\u5BBF\u4E3B\u4E3B agent \u4EA7\u51FA\u7684\u4EE3\u7801\u53D8\u66F4",
    "",
    "## Deviations from Design",
    "- \u65E0",
    "",
    "## Pitfalls",
    adapterResult.exitCode === 0 ? "- \u65E0" : `- adapter exit code = ${adapterResult.exitCode}`,
    "",
    "## TODOs Introduced",
    "- \u65E0",
    "",
    "## Sub-task Progress",
    "- [x] SPEC \u5DE5\u4EF6",
    "- [x] DESIGN \u5DE5\u4EF6",
    "- [x] EXECUTE \u5DE5\u4EF6",
    "- [ ] REVIEW/TEST \u5DE5\u4EF6",
    ""
  ].join("\n");
}
function renderReviewMarkdown(taskId, findings) {
  const failed = findings.filter((finding) => finding.status === "failed");
  const decision = failed.length > 0 ? "block_execute" : "pass";
  const lines = [
    "# Review",
    "",
    "## Decision",
    decision,
    "",
    "## Block Scope",
    decision === "pass" ? "minimal" : "minimal",
    "",
    "## Findings"
  ];
  if (failed.length === 0) {
    lines.push("- none");
  } else {
    failed.forEach((finding, index) => {
      lines.push(
        `- id: F-${taskId}-${index + 1}`,
        "  severity: P1",
        `  description: ${finding.detail}`,
        `  file: ${finding.name}`,
        "  line: N/A",
        `  fix_hint: ${finding.command}`,
        "  recurrent_pattern: false"
      );
    });
  }
  lines.push("");
  return lines.join("\n");
}
function renderTestReport(contract, evidence) {
  return [
    "# Test Report",
    "",
    "## Acceptance Coverage",
    ...contract.acceptanceCriteria.map(
      (item) => `- ${item.criterion}: ${item.verifiableBy} / ${item.testHint ?? "\u65E0 test_hint"}`
    ),
    "",
    "## Baseline-Diff",
    "- baseline-diff: evidence/baseline-diff.json",
    `- lint_warnings_total: ${evidence.lintWarningsTotal}`,
    `- todo_count: ${evidence.todoCount}`,
    "",
    "## Externally-Run Validations",
    "- \u65E0",
    ""
  ].join("\n");
}
var WorkflowEngine = class {
  constructor(manager) {
    this.manager = manager;
  }
  manager;
  baselineSnapshot = null;
  async run(ctx, options) {
    const startFrom = options.resumeFrom ?? "spec";
    if (startFrom === "spec") {
      await this.executeSpecStage(ctx);
      await this.executeDesignStage(ctx);
    } else if (startFrom === "design") {
      await this.executeDesignStage(ctx);
    } else if (startFrom === "execute") {
      await this.manager.markRetrying(ctx);
    }
    if (options.dryRun) {
      return { dryRun: true };
    }
    const adapterResult = await this.executeExecuteStage(ctx, options);
    const reviewFindings = await this.executeReviewStage(ctx);
    const evidence = await this.executeTestStage(ctx, reviewFindings);
    const report = await this.executeCommitGateStage(ctx, adapterResult, evidence);
    return {
      report,
      dryRun: false
    };
  }
  /**
   * Stage 1: spec
   * 产出 contract.yaml（v3-core 中等价于 SPEC 工件）。
   * spec_gate：contract 合规性校验，失败即在 spec 阶段标记失败。
   */
  async executeSpecStage(ctx) {
    ctx.state.status = "active";
    ctx.state.currentStage = "spec";
    ctx.state.currentOwner = "requirement";
    await this.manager.saveState(ctx);
    const templateName = matchTemplate(ctx.goal);
    const contract = await generateContract({
      taskId: ctx.taskId,
      goal: ctx.goal,
      templateName,
      llmClient: createLLMClientFromEnv()
    });
    const contractGate = checkContract(contract);
    if (!contractGate.passed) {
      await this.manager.markFailure(
        ctx,
        "spec",
        `spec_gate \u5931\u8D25: ${contractGate.failures.join("; ")}`
      );
      throw new Error(`spec gate \u5931\u8D25: ${contractGate.failures.join("; ")}`);
    }
    await this.manager.saveContract(ctx, contract);
    const requirement = renderRequirementMarkdown(contract);
    const requirementFailures = validateRequirementMarkdown(requirement);
    if (requirementFailures.length > 0) {
      await this.manager.markFailure(ctx, "spec", requirementFailures.join("; "));
      throw new Error(`requirement gate \u5931\u8D25: ${requirementFailures.join("; ")}`);
    }
    await this.manager.saveRequirement(ctx, requirement);
    markCompleted(ctx, "spec");
    await this.manager.saveState(ctx);
  }
  /**
   * Stage 2: design
   * 基于 contract 派生 plan.md（v3-core 中等价于 Design 工件）。
   * Phase 2 中将由 designer sub-agent 接管，产出语义更丰富的 design.md。
   */
  async executeDesignStage(ctx) {
    if (!ctx.contract) {
      await this.manager.markFailure(ctx, "design", "design \u9636\u6BB5\u7F3A\u5C11 contract\uFF08spec \u5DE5\u4EF6\uFF09");
      throw new Error("design \u9636\u6BB5\u7F3A\u5C11 contract");
    }
    ctx.state.currentStage = "design";
    ctx.state.currentOwner = "designer";
    await this.manager.saveState(ctx);
    const plan = generatePlan(ctx.contract);
    const design = renderDesignMarkdown(ctx.contract);
    const designFailures = validateDesignMarkdown(design);
    if (designFailures.length > 0) {
      await this.manager.markFailure(ctx, "design", designFailures.join("; "));
      throw new Error(`design gate \u5931\u8D25: ${designFailures.join("; ")}`);
    }
    await this.manager.saveDesign(ctx, design);
    await this.manager.saveTaskBreakdown(ctx, renderTaskBreakdown(ctx.contract));
    await this.manager.savePlan(ctx, plan);
    markCompleted(ctx, "design");
    await this.manager.saveState(ctx);
  }
  /**
   * Stage 3: execute
   * 调用 adapter（headless 模式下走子进程；宿主主路径下由主 agent 直接执行）。
   */
  async executeExecuteStage(ctx, options) {
    ctx.state.status = "active";
    ctx.state.currentStage = "execute";
    ctx.state.currentOwner = "developer";
    await this.manager.saveState(ctx);
    try {
      const allEntries = await loadFeedbackPool(ctx.workDir);
      ctx.feedbackPool = pickRecentEntries(allEntries, {
        templateName: ctx.contract?.templateName
      });
    } catch {
      ctx.feedbackPool = [];
    }
    const prompt = assemblePrompt(ctx);
    const promptFile = await this.manager.savePrompt(ctx, prompt);
    const adapter = createAdapter(options.adapterKind);
    try {
      const baselineEvidence = await collectEvidence(ctx.workDir, ctx.config, ctx.contract);
      this.baselineSnapshot = buildEvidenceSnapshot(baselineEvidence);
      await saveEvidenceSnapshot(ctx.taskDir, "baseline", this.baselineSnapshot);
      const adapterResult = await adapter.execute({
        taskId: ctx.taskId,
        workDir: ctx.workDir,
        prompt,
        promptFile,
        command: options.adapterCommand
      });
      const changedFiles = await collectChangedFiles(ctx.workDir);
      const structureChecks = await runStructureCheck(ctx.workDir, changedFiles);
      const structureFailures = structureChecks.filter((check) => check.status === "failed");
      if (structureFailures.length > 0) {
        const detail = structureFailures.map((check) => `${check.name}: ${check.detail}`).join("; ");
        await this.manager.markFailure(ctx, "execute", detail);
        throw new Error(`structure-check \u5931\u8D25: ${detail}`);
      }
      await this.manager.saveImplementationNotes(ctx, renderImplementationNotes(adapterResult));
      markCompleted(ctx, "execute");
      return adapterResult;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.manager.markFailure(ctx, "execute", `adapter \u6267\u884C\u5931\u8D25: ${message}`);
      throw error;
    }
  }
  /**
   * Stage 4: review
   * Phase 1 中为占位实现：基于 changedFiles 跑确定性静态检查（敏感文件、改动规模）。
   * Phase 2 中将由 reviewer sub-agent 接管，做语义层代码审查。
   */
  async executeReviewStage(ctx) {
    ctx.state.currentStage = "review";
    ctx.state.currentOwner = "reviewer";
    await this.manager.saveState(ctx);
    const changedFiles = await collectChangedFiles(ctx.workDir);
    const findings = runReviewStage(changedFiles);
    await this.manager.saveReviewMarkdown(ctx, renderReviewMarkdown(ctx.taskId, findings));
    await this.manager.saveResidentReview(ctx, await renderResidentReview(ctx.workDir, findings));
    markCompleted(ctx, "review");
    await this.manager.saveState(ctx);
    return findings;
  }
  /**
   * Stage 5: test
   * 跑 evidence checks（required checks + scope check + level2 检查），
   * 并把 review 阶段的发现合入 evidence.checks 一起进 commit_gate。
   */
  async executeTestStage(ctx, reviewFindings) {
    ctx.state.status = "active";
    ctx.state.currentStage = "test";
    ctx.state.currentOwner = "tester";
    await this.manager.saveState(ctx);
    const evidence = await collectEvidence(ctx.workDir, ctx.config, ctx.contract);
    evidence.checks = [...reviewFindings, ...evidence.checks];
    const currentSnapshot = buildEvidenceSnapshot(evidence);
    await saveEvidenceSnapshot(ctx.taskDir, "current", currentSnapshot);
    if (this.baselineSnapshot) {
      await saveBaselineDiff(ctx.taskDir, buildBaselineDiff(this.baselineSnapshot, currentSnapshot));
    }
    if (ctx.contract) {
      await this.manager.saveTestReport(ctx, renderTestReport(ctx.contract, evidence));
    }
    evidence.checks = [...evidence.checks, await runArtifactGuard(ctx.taskDir)];
    markCompleted(ctx, "test");
    await this.manager.saveState(ctx);
    return evidence;
  }
  /**
   * Stage 6: commit_gate
   * 三态聚合决策：
   * - 任何硬性失败 → block
   * - 无硬性失败但有软性告警 → warn
   * - 全部通过 → pass
   *
   * report.commitReady 仅在 decision==='pass' 时为 true，warn 不自动放行。
   */
  async executeCommitGateStage(ctx, adapterResult, evidence) {
    ctx.state.currentStage = "commit_gate";
    ctx.state.currentOwner = "pm";
    await this.manager.saveState(ctx);
    const baseline = await loadEvidenceBaseline(ctx.workDir);
    const commitGate = evaluateCommitGate(evidence, adapterResult.exitCode, { baseline });
    const report = createTaskReport(ctx, adapterResult, evidence, commitGate);
    await this.manager.saveReport(ctx, report);
    markCompleted(ctx, "commit_gate");
    await this.manager.saveState(ctx);
    if (commitGate.decision === "pass") {
      await this.manager.clearFeedback(ctx);
      try {
        await saveEvidenceBaseline(ctx.workDir, buildEvidenceBaseline(evidence));
      } catch {
      }
    } else {
      const failedChecks = report.evidence.checks.filter((check) => check.status === "failed").map((check) => `${check.name}: ${check.detail}`);
      const feedback = [
        `commit_gate \u51B3\u7B56\uFF1A${commitGate.decision}`,
        `adapter_exit_code: ${report.adapter.exitCode}`,
        failedChecks.length > 0 ? `failed_checks: ${failedChecks.join(" | ")}` : "failed_checks: none",
        commitGate.warnings.length > 0 ? `warnings: ${commitGate.warnings.join(" | ")}` : "warnings: none"
      ].join("\n");
      const failureStage = commitGate.decision === "fail" ? "test" : "commit_gate";
      await this.manager.markFailure(ctx, failureStage, feedback);
    }
    return report;
  }
};

// src/index.ts
var CORE_PACKAGE_NAME = "@harnessly/core";
function getCorePackageInfo() {
  return {
    name: CORE_PACKAGE_NAME,
    version: "0.0.0",
    dependsOn: [sharedPackageInfo.name]
  };
}
export {
  AGENT_ROLES,
  AnthropicClient,
  CORE_PACKAGE_NAME,
  ClaudeCodeAdapter,
  CodexAdapter,
  CustomAdapter,
  EVIDENCE_BASELINE_FILENAME,
  FEEDBACK_POOL_FILENAME,
  HARNESS_DIRNAME,
  TaskManager,
  TemplateRegistry,
  WorkflowEngine,
  appendFeedbackEntry,
  archiveTaskArtifacts,
  assemblePrompt,
  buildBaselineDiff,
  buildEvidenceBaseline,
  buildEvidenceSnapshot,
  buildFeedbackEntry,
  checkContract,
  collectChangedFiles,
  collectEnabledRoles,
  collectEvidence,
  createAdapter,
  createDefaultHarnessConfig,
  createLLMClientFromEnv,
  createTaskReport,
  createTemplateDraft,
  createTemplateRegistry,
  deriveTemplateName,
  detectProjectType,
  ensureHarnessDirectories,
  evaluateCommitGate,
  generateContract,
  generateFallbackContract,
  generatePlan,
  getAgentDiskFiles,
  getArchiveTargetPaths,
  getBuiltinTemplates,
  getCorePackageInfo,
  getDefaultAgentManifest,
  getDefaultRequiredChecks,
  getEvidenceBaselinePath,
  getFeedbackHistoryPath,
  getFeedbackPoolPath,
  getHarnessPaths,
  getRoleForStage,
  getSkillPath,
  getTaskEvidenceDir,
  getTaskEvidencePath,
  listAgentFiles,
  loadAgentManifest,
  loadAgentManifests,
  loadEvidenceBaseline,
  loadFeedbackPool,
  loadHarnessConfig,
  loadSkill,
  matchTemplate,
  parseHarnessConfig,
  pickRecentEntries,
  pickRecommendedAgent,
  promoteFeedbackEntry,
  renderFeedbackEntriesAsLines,
  renderGlobalRulesTemplate,
  renderResidentReview,
  renderReviewAgentsTemplate,
  renderSkillTemplate,
  renderStructureRulesTemplate,
  runArtifactGuard,
  runLevel2Validation,
  runReviewStage,
  runScopeCheck,
  runSkillCheck,
  runStructureCheck,
  saveBaselineDiff,
  saveEvidenceBaseline,
  saveEvidenceSnapshot,
  saveTemplateDraft,
  serializeHarnessConfig,
  writeDefaultAgentManifests,
  writeDefaultSkillManifests,
  writeFileIfChanged,
  writeHarnessConfig
};
