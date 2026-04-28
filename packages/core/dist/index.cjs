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
  AnthropicClient: () => AnthropicClient,
  CORE_PACKAGE_NAME: () => CORE_PACKAGE_NAME,
  ClaudeCodeAdapter: () => ClaudeCodeAdapter,
  CodexAdapter: () => CodexAdapter,
  CustomAdapter: () => CustomAdapter,
  HARNESS_DIRNAME: () => HARNESS_DIRNAME,
  TaskManager: () => TaskManager,
  TemplateRegistry: () => TemplateRegistry,
  WorkflowEngine: () => WorkflowEngine,
  assemblePrompt: () => assemblePrompt,
  checkContract: () => checkContract,
  collectChangedFiles: () => collectChangedFiles,
  collectEvidence: () => collectEvidence,
  createAdapter: () => createAdapter,
  createDefaultHarnessConfig: () => createDefaultHarnessConfig,
  createLLMClientFromEnv: () => createLLMClientFromEnv,
  createTaskReport: () => createTaskReport,
  createTemplateDraft: () => createTemplateDraft,
  createTemplateRegistry: () => createTemplateRegistry,
  deriveTemplateName: () => deriveTemplateName,
  detectProjectType: () => detectProjectType,
  ensureHarnessDirectories: () => ensureHarnessDirectories,
  evaluateCommitGate: () => evaluateCommitGate,
  generateContract: () => generateContract,
  generateFallbackContract: () => generateFallbackContract,
  generatePlan: () => generatePlan,
  getBuiltinTemplates: () => getBuiltinTemplates,
  getCorePackageInfo: () => getCorePackageInfo,
  getDefaultRequiredChecks: () => getDefaultRequiredChecks,
  getHarnessPaths: () => getHarnessPaths,
  loadHarnessConfig: () => loadHarnessConfig,
  matchTemplate: () => matchTemplate,
  parseHarnessConfig: () => parseHarnessConfig,
  renderGlobalRulesTemplate: () => renderGlobalRulesTemplate,
  runLevel2Validation: () => runLevel2Validation,
  runScopeCheck: () => runScopeCheck,
  saveTemplateDraft: () => saveTemplateDraft,
  serializeHarnessConfig: () => serializeHarnessConfig,
  writeFileIfChanged: () => writeFileIfChanged,
  writeHarnessConfig: () => writeHarnessConfig
});
module.exports = __toCommonJS(index_exports);
var import_shared6 = require("@harnessly/shared");

// src/config.ts
var import_shared = require("@harnessly/shared");

// src/project.ts
var import_promises = require("fs/promises");
var import_node_path = __toESM(require("path"), 1);
async function fileExists(filePath) {
  try {
    await (0, import_promises.access)(filePath);
    return true;
  } catch {
    return false;
  }
}
async function detectProjectType(workDir) {
  if (await fileExists(import_node_path.default.join(workDir, "package.json"))) {
    return "node";
  }
  if (await fileExists(import_node_path.default.join(workDir, "go.mod"))) {
    return "go";
  }
  if (await fileExists(import_node_path.default.join(workDir, "pyproject.toml")) || await fileExists(import_node_path.default.join(workDir, "requirements.txt"))) {
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
function createDefaultHarnessConfig(projectType, defaultHost = "claude-code") {
  return {
    version: Number(import_shared.HARNESSLY_VERSION.split(".")[0] ?? "0") + 1,
    projectType,
    requiredChecks: getDefaultRequiredChecks(projectType),
    defaultHost,
    enabledHosts: [defaultHost],
    installRepoLocalShells: true,
    sourceOfTruthDir: ".harness/hosts",
    fallbackCreateTaskWithoutPlanner: false,
    codexUserPromptSubmitHookEnabled: true,
    hostSubagents: {
      planner: {
        useHostPlanMode: true,
        models: {
          "claude-code": "haiku",
          codex: "gpt-5.4-mini",
          "gemini-cli": "gemini-flash"
        }
      },
      evaluator: {
        models: {
          "claude-code": "sonnet",
          codex: "gpt-5.4",
          "gemini-cli": "gemini-pro"
        }
      }
    },
    adapterKind: getDefaultAdapterKind(defaultHost),
    adapterCommand: getDefaultAdapterCommand(defaultHost)
  };
}
function serializeHarnessConfig(config) {
  return (0, import_shared.serializeHarnessConfig)(config);
}
function parseHarnessConfig(text) {
  return (0, import_shared.parseHarnessConfig)(text);
}

// src/contract.ts
var import_shared2 = require("@harnessly/shared");

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
function generateFallbackContract(goal, templateName) {
  const template = createTemplateRegistry().get(templateName);
  return {
    goal,
    templateName,
    riskLevel: template.defaultRiskLevel,
    scopeInclude: [...template.defaultScopeInclude],
    scopeExclude: [...template.defaultScopeExclude],
    acceptanceCriteria: [
      `\u76EE\u6807\u201C${goal}\u201D\u5DF2\u88AB\u5B9E\u73B0\u6216\u4FEE\u590D`,
      ...template.defaultAcceptanceCriteria.slice(1)
    ],
    outOfScope: [...template.defaultOutOfScope]
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
  const fallback = generateFallbackContract(options.goal, options.templateName);
  if (!options.llmClient) {
    return fallback;
  }
  try {
    const generated = await options.llmClient.generateStructured({
      prompt: createContractPrompt(options.goal, options.templateName, fallback),
      systemPrompt: createContractSystemPrompt(),
      schema: import_shared2.contractSchema,
      toolName: "emit_contract",
      toolDescription: "\u8F93\u51FA Harnessly contract"
    });
    return (0, import_shared2.validateContract)({
      ...generated,
      goal: options.goal,
      templateName: options.templateName
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
var import_promises3 = require("fs/promises");
var import_node_child_process2 = require("child_process");
var import_node_util2 = require("util");
var import_node_path3 = __toESM(require("path"), 1);

// src/scope.ts
function isStructuredScope(pattern) {
  return /[/*]/.test(pattern) || pattern.includes(".");
}
function matchesPattern(filePath, pattern) {
  if (pattern === "*") {
    return true;
  }
  if (pattern.endsWith("/")) {
    return filePath.startsWith(pattern);
  }
  if (pattern.includes("*")) {
    const normalized = pattern.replace(/\*/g, "");
    return filePath.includes(normalized);
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
  const patterns = contract.scopeInclude.filter(isStructuredScope);
  if (patterns.length === 0) {
    return {
      name: "scope",
      status: "skipped",
      command: "scope-check",
      detail: "scope_include \u8FD8\u4E0D\u662F\u7ED3\u6784\u5316\u8DEF\u5F84\uFF0C\u6682\u4E0D\u505A\u786C\u6821\u9A8C"
    };
  }
  const outOfScopeFiles = changedFiles.filter(
    (filePath) => !patterns.some((pattern) => matchesPattern(filePath, pattern))
  );
  if (outOfScopeFiles.length > 0) {
    return {
      name: "scope",
      status: "failed",
      command: "scope-check",
      detail: `\u53D1\u73B0\u8D85\u51FA scope \u7684\u6587\u4EF6: ${outOfScopeFiles.join(", ")}`
    };
  }
  return {
    name: "scope",
    status: "passed",
    command: "scope-check",
    detail: "\u53D8\u66F4\u6587\u4EF6\u4E0E scope \u4E00\u81F4"
  };
}

// src/validation.ts
var import_promises2 = require("fs/promises");
var import_node_child_process = require("child_process");
var import_node_util = require("util");
var import_node_path2 = __toESM(require("path"), 1);
var execAsync = (0, import_node_util.promisify)(import_node_child_process.exec);
async function fileExists2(filePath) {
  try {
    await (0, import_promises2.access)(filePath);
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
  const filePath = import_node_path2.default.join(workDir, target);
  const exists = await fileExists2(filePath);
  return {
    name: `level2:file:${index}`,
    status: exists ? "passed" : "failed",
    command: `file:${target}`,
    detail: exists ? `\u6587\u4EF6\u5B58\u5728: ${target}` : `\u6587\u4EF6\u4E0D\u5B58\u5728: ${target}`
  };
}
async function runContainsCheck(index, workDir, target, needle) {
  const filePath = import_node_path2.default.join(workDir, target);
  if (!await fileExists2(filePath)) {
    return {
      name: `level2:contains:${index}`,
      status: "failed",
      command: `contains:${target}::${needle}`,
      detail: `\u6587\u4EF6\u4E0D\u5B58\u5728: ${target}`
    };
  }
  const content = await (0, import_promises2.readFile)(filePath, "utf8");
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
    await execAsync(command, {
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
    contract.acceptanceCriteria.map(async (criterion, index) => {
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
var execAsync2 = (0, import_node_util2.promisify)(import_node_child_process2.exec);
async function fileExists3(filePath) {
  try {
    await (0, import_promises3.access)(filePath);
    return true;
  } catch {
    return false;
  }
}
async function loadPackageScripts(workDir) {
  const packageFile = import_node_path3.default.join(workDir, "package.json");
  if (!await fileExists3(packageFile)) {
    return {};
  }
  const pkg = JSON.parse(await (0, import_promises3.readFile)(packageFile, "utf8"));
  return pkg.scripts ?? {};
}
async function runNodeScriptCheck(workDir, checkName, scripts) {
  if (!scripts[checkName]) {
    return {
      name: checkName,
      status: "skipped",
      command: `npm run ${checkName}`,
      detail: "script \u672A\u5B9A\u4E49"
    };
  }
  try {
    await execAsync2(`npm run ${checkName}`, {
      cwd: workDir,
      env: process.env,
      shell: "/bin/zsh"
    });
    return {
      name: checkName,
      status: "passed",
      command: `npm run ${checkName}`,
      detail: "script \u6267\u884C\u901A\u8FC7"
    };
  } catch (error) {
    const execError = error;
    return {
      name: checkName,
      status: "failed",
      command: `npm run ${checkName}`,
      detail: execError.stderr?.trim() || "script \u6267\u884C\u5931\u8D25"
    };
  }
}
async function collectChangedFiles(workDir) {
  try {
    const { stdout } = await execAsync2("git status --short", {
      cwd: workDir,
      env: process.env,
      shell: "/bin/zsh"
    });
    return stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => line.replace(/^[A-Z? ]+/, "").trim());
  } catch {
    return [];
  }
}
async function collectEvidence(workDir, config, contract) {
  const scripts = await loadPackageScripts(workDir);
  const scriptChecks = await Promise.all(
    config.requiredChecks.map((checkName) => runNodeScriptCheck(workDir, checkName, scripts))
  );
  const changedFiles = await collectChangedFiles(workDir);
  const scopeCheck = runScopeCheck(contract, changedFiles);
  const level2Checks = await runLevel2Validation(workDir, contract);
  const checks = [...scriptChecks, scopeCheck, ...level2Checks];
  return {
    checks,
    changedFiles
  };
}

// src/execute.ts
var import_node_child_process3 = require("child_process");
var import_node_util3 = require("util");
var execAsync3 = (0, import_node_util3.promisify)(import_node_child_process3.exec);
async function runShellCommand(command, input) {
  try {
    const { stdout, stderr } = await execAsync3(command, {
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
function evaluateCommitGate(evidence, adapterExitCode) {
  const failures = [];
  if (adapterExitCode !== 0) {
    failures.push(`adapter exit code = ${adapterExitCode}`);
  }
  for (const check of evidence.checks) {
    if (check.status === "failed") {
      failures.push(`${check.name} \u5931\u8D25`);
    }
  }
  if (evidence.changedFiles.length === 0) {
    failures.push("\u672A\u68C0\u6D4B\u5230\u5DE5\u4F5C\u533A\u53D8\u66F4");
  }
  return {
    passed: failures.length === 0,
    failures
  };
}

// src/llm.ts
var import_sdk = __toESM(require("@anthropic-ai/sdk"), 1);
var import_zod_to_json_schema = require("zod-to-json-schema");
var import_zod = require("zod");
var DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-20250514";
function extractTextContent(content) {
  return content.filter((block) => block.type === "text").map((block) => block.text).join("\n").trim();
}
function toErrorMessage(error) {
  if (error instanceof import_zod.z.ZodError) {
    return error.issues.map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`).join("; ");
  }
  return error instanceof Error ? error.message : String(error);
}
var AnthropicClient = class {
  providerName = "anthropic";
  client;
  model;
  constructor(options = {}) {
    this.client = new import_sdk.default({
      apiKey: options.apiKey ?? process.env.ANTHROPIC_API_KEY
    });
    this.model = options.model ?? process.env.HARNESSLY_ANTHROPIC_MODEL ?? DEFAULT_ANTHROPIC_MODEL;
  }
  async generateStructured(options) {
    const toolName = options.toolName ?? "emit_structured_output";
    const inputSchema = (0, import_zod_to_json_schema.zodToJsonSchema)(options.schema, toolName);
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
  const lines = [
    "# Plan",
    "",
    `1. \u660E\u786E ${contract.goal} \u5BF9\u5E94\u7684\u4FEE\u6539\u8FB9\u754C\uFF1A${contract.scopeInclude.join("\u3001")}`,
    "2. \u5728\u6700\u5C0F\u6539\u52A8\u8303\u56F4\u5185\u5B8C\u6210\u5B9E\u73B0\u6216\u4FEE\u590D",
    `3. \u6309\u9A8C\u6536\u6807\u51C6\u81EA\u68C0\uFF1A${contract.acceptanceCriteria.join("\uFF1B")}`,
    ""
  ];
  return lines.join("\n");
}

// src/promote.ts
var import_promises4 = require("fs/promises");
var import_node_path4 = __toESM(require("path"), 1);
var import_shared3 = require("@harnessly/shared");
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
    acceptanceCriteria: contract.acceptanceCriteria
  };
}
function deriveTemplateName(goal) {
  return slugify(goal);
}
async function saveTemplateDraft(workDir, template) {
  const templatesDir = import_node_path4.default.join(workDir, ".harness", "templates");
  const filePath = import_node_path4.default.join(templatesDir, `${template.name}.yaml`);
  await (0, import_promises4.mkdir)(templatesDir, { recursive: true });
  await (0, import_promises4.writeFile)(filePath, (0, import_shared3.serializeTemplateDraft)(template), "utf8");
  return filePath;
}

// src/prompt.ts
function assemblePrompt(ctx) {
  const contractPart = ctx.contract ? [
    "## Contract",
    `- goal: ${ctx.contract.goal}`,
    `- template: ${ctx.contract.templateName}`,
    `- risk: ${ctx.contract.riskLevel}`,
    `- scope_include: ${ctx.contract.scopeInclude.join("\u3001")}`,
    `- acceptance: ${ctx.contract.acceptanceCriteria.join("\uFF1B")}`
  ].join("\n") : "## Contract\n- missing";
  const planPart = ctx.plan ? `## Plan
${ctx.plan}` : "## Plan\n- missing";
  const feedbackPart = ctx.feedback ? `## Retry Feedback
${ctx.feedback}` : "";
  return [
    "# Harnessly Execution Prompt",
    "",
    `task_id: ${ctx.taskId}`,
    `goal: ${ctx.goal}`,
    "",
    contractPart,
    "",
    planPart,
    feedbackPart ? `
${feedbackPart}
` : "",
    "",
    "## Rules",
    "- \u53EA\u5728\u76EE\u6807\u8303\u56F4\u5185\u4FEE\u6539",
    "- \u4F18\u5148\u6700\u5C0F\u6539\u52A8",
    "- \u5B8C\u6210\u540E\u786E\u4FDD\u6709\u53EF\u9A8C\u8BC1\u4EA7\u7269",
    ""
  ].join("\n");
}

// src/report.ts
var import_shared4 = require("@harnessly/shared");
function createTaskReport(ctx, adapter, evidence, commitGate) {
  return (0, import_shared4.validateTaskReport)({
    taskId: ctx.taskId,
    goal: ctx.goal,
    adapter,
    evidence,
    commitGate,
    commitReady: commitGate.passed,
    summary: commitGate.passed ? "\u6267\u884C\u4E0E\u6700\u5C0F\u9A8C\u8BC1\u901A\u8FC7" : `\u6267\u884C\u95ED\u73AF\u672A\u901A\u8FC7\uFF1A${commitGate.failures.join("\uFF1B")}`,
    generatedAt: (/* @__PURE__ */ new Date()).toISOString()
  });
}

// src/scaffold.ts
var import_promises5 = require("fs/promises");
var import_node_path5 = __toESM(require("path"), 1);
var HARNESS_DIRNAME = ".harness";
function getHarnessPaths(workDir) {
  const harnessDir = import_node_path5.default.join(workDir, HARNESS_DIRNAME);
  return {
    harnessDir,
    domainsDir: import_node_path5.default.join(harnessDir, "domains"),
    hostsDir: import_node_path5.default.join(harnessDir, "hosts"),
    tasksDir: import_node_path5.default.join(harnessDir, "tasks"),
    templatesDir: import_node_path5.default.join(harnessDir, "templates"),
    configFile: import_node_path5.default.join(harnessDir, "harness.config.yaml"),
    globalRulesFile: import_node_path5.default.join(harnessDir, "GLOBAL_RULES.md"),
    activeTaskFile: import_node_path5.default.join(harnessDir, "active-task.txt")
  };
}
async function ensureHarnessDirectories(workDir) {
  const paths = getHarnessPaths(workDir);
  await (0, import_promises5.mkdir)(paths.harnessDir, { recursive: true });
  await (0, import_promises5.mkdir)(paths.domainsDir, { recursive: true });
  await (0, import_promises5.mkdir)(paths.hostsDir, { recursive: true });
  await (0, import_promises5.mkdir)(paths.tasksDir, { recursive: true });
  await (0, import_promises5.mkdir)(paths.templatesDir, { recursive: true });
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
    const existing = await (0, import_promises5.readFile)(filePath, "utf8");
    if (existing === content) {
      return "skipped";
    }
    if (!force) {
      return "skipped";
    }
  } catch {
  }
  await (0, import_promises5.writeFile)(filePath, content, "utf8");
  try {
    await (0, import_promises5.readFile)(filePath, "utf8");
    return force ? "updated" : "created";
  } catch {
    return "created";
  }
}
async function loadHarnessConfig(workDir) {
  const configText = await (0, import_promises5.readFile)(getHarnessPaths(workDir).configFile, "utf8");
  return parseHarnessConfig(configText);
}
async function writeHarnessConfig(workDir, config, force = false) {
  return writeFileIfChanged(getHarnessPaths(workDir).configFile, serializeHarnessConfig(config), force);
}

// src/task.ts
var import_node_crypto = __toESM(require("crypto"), 1);
var import_promises6 = require("fs/promises");
var import_node_path6 = __toESM(require("path"), 1);
var import_shared5 = require("@harnessly/shared");
function createInitialTaskState(taskId) {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  return {
    taskId,
    status: "created",
    currentStage: "created",
    createdAt: now,
    updatedAt: now,
    completedStages: [],
    retryCount: 0
  };
}
async function writeJson(filePath, payload) {
  await (0, import_promises6.writeFile)(filePath, `${JSON.stringify(payload, null, 2)}
`, "utf8");
}
async function readJson(filePath) {
  const text = await (0, import_promises6.readFile)(filePath, "utf8");
  return JSON.parse(text);
}
function isMissingFileError(error) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
function touchState(state, status, stage) {
  return {
    ...state,
    status,
    currentStage: stage,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
var TaskManager = class {
  async loadConfig(workDir) {
    return loadHarnessConfig(workDir);
  }
  getTasksDir(workDir) {
    return import_node_path6.default.join(workDir, ".harness", "tasks");
  }
  getActiveTaskFile(workDir) {
    return import_node_path6.default.join(workDir, ".harness", "active-task.txt");
  }
  getTaskDir(workDir, taskId) {
    return import_node_path6.default.join(this.getTasksDir(workDir), taskId);
  }
  getStateFile(taskDir) {
    return import_node_path6.default.join(taskDir, "state.json");
  }
  getMetaFile(taskDir) {
    return import_node_path6.default.join(taskDir, "task.json");
  }
  getContractFile(taskDir) {
    return import_node_path6.default.join(taskDir, "contract.yaml");
  }
  getPlanFile(taskDir) {
    return import_node_path6.default.join(taskDir, "plan.md");
  }
  getPromptFile(taskDir) {
    return import_node_path6.default.join(taskDir, "prompt.md");
  }
  getReportFile(taskDir) {
    return import_node_path6.default.join(taskDir, "report.json");
  }
  getFeedbackFile(taskDir) {
    return import_node_path6.default.join(taskDir, "feedback.md");
  }
  generateTaskId() {
    const now = /* @__PURE__ */ new Date();
    const date = now.toISOString().slice(0, 10).replace(/-/g, "");
    const time = now.toISOString().slice(11, 19).replace(/:/g, "");
    const rand = import_node_crypto.default.randomBytes(2).toString("hex");
    return `${date}-${time}-${rand}`;
  }
  async setActiveTask(workDir, taskId) {
    await (0, import_promises6.writeFile)(this.getActiveTaskFile(workDir), `${taskId}
`, "utf8");
  }
  async create(goal, workDir) {
    const taskId = this.generateTaskId();
    const taskDir = this.getTaskDir(workDir, taskId);
    const config = await this.loadConfig(workDir);
    const state = createInitialTaskState(taskId);
    await (0, import_promises6.mkdir)(taskDir, { recursive: true });
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
    ctx.state = touchState(ctx.state, "planning", "contract");
    await (0, import_promises6.writeFile)(this.getContractFile(ctx.taskDir), (0, import_shared5.serializeContract)(contract), "utf8");
    await this.saveState(ctx);
  }
  async savePlan(ctx, plan) {
    ctx.plan = plan;
    ctx.state = touchState(ctx.state, "ready", "plan");
    await (0, import_promises6.writeFile)(this.getPlanFile(ctx.taskDir), plan, "utf8");
    await this.saveState(ctx);
  }
  async savePrompt(ctx, prompt) {
    const filePath = this.getPromptFile(ctx.taskDir);
    await (0, import_promises6.writeFile)(filePath, prompt, "utf8");
    return filePath;
  }
  async saveReport(ctx, report) {
    ctx.state = touchState(ctx.state, report.commitReady ? "passed" : "failed", "report");
    await (0, import_promises6.writeFile)(this.getReportFile(ctx.taskDir), (0, import_shared5.serializeTaskReport)(report), "utf8");
    await this.saveState(ctx);
  }
  async saveFeedback(ctx, feedback) {
    ctx.feedback = feedback;
    await (0, import_promises6.writeFile)(this.getFeedbackFile(ctx.taskDir), feedback, "utf8");
  }
  async clearFeedback(ctx) {
    ctx.feedback = void 0;
    try {
      await (0, import_promises6.writeFile)(this.getFeedbackFile(ctx.taskDir), "", "utf8");
    } catch {
    }
  }
  async markFailure(ctx, stage, reason) {
    ctx.state = {
      ...touchState(ctx.state, "failed", stage),
      lastFailureReason: reason,
      lastFailureStage: stage
    };
    await this.saveState(ctx);
    await this.saveFeedback(ctx, reason);
  }
  async markRetrying(ctx) {
    ctx.state = {
      ...touchState(ctx.state, "executing", "retry"),
      retryCount: ctx.state.retryCount + 1
    };
    await this.saveState(ctx);
  }
  async loadReport(taskId, workDir) {
    const taskDir = this.getTaskDir(workDir, taskId);
    try {
      return (0, import_shared5.parseTaskReport)(await (0, import_promises6.readFile)(this.getReportFile(taskDir), "utf8"));
    } catch (error) {
      if (isMissingFileError(error)) {
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
      if (isMissingFileError(error)) {
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
      ctx.contract = (0, import_shared5.parseContract)(await (0, import_promises6.readFile)(this.getContractFile(taskDir), "utf8"));
    } catch (error) {
      if (!isMissingFileError(error)) {
        throw error;
      }
    }
    try {
      ctx.plan = await (0, import_promises6.readFile)(this.getPlanFile(taskDir), "utf8");
    } catch {
    }
    try {
      const feedback = await (0, import_promises6.readFile)(this.getFeedbackFile(taskDir), "utf8");
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
      entries = await (0, import_promises6.readdir)(tasksDir, { withFileTypes: true });
    } catch (error) {
      if (isMissingFileError(error)) {
        return [];
      }
      throw error;
    }
    const summaries = await Promise.all(
      entries.filter((entry) => entry.isDirectory()).map(async (entry) => {
        const taskDir = import_node_path6.default.join(tasksDir, entry.name);
        const meta = await readJson(this.getMetaFile(taskDir));
        const state = await readJson(this.getStateFile(taskDir));
        return {
          taskId: meta.taskId,
          goal: meta.goal,
          status: state.status,
          currentStage: state.currentStage,
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

// src/workflow.ts
function markCompleted(ctx, stage) {
  if (!ctx.state.completedStages.includes(stage)) {
    ctx.state.completedStages = [...ctx.state.completedStages, stage];
  }
}
var WorkflowEngine = class {
  constructor(manager) {
    this.manager = manager;
  }
  manager;
  async run(ctx, options) {
    const startFrom = options.resumeFrom ?? "contract";
    if (startFrom === "contract") {
      ctx.state.status = "contracting";
      ctx.state.currentStage = "contract";
      await this.manager.saveState(ctx);
      const templateName = matchTemplate(ctx.goal);
      const contract = await generateContract({
        goal: ctx.goal,
        templateName,
        llmClient: createLLMClientFromEnv()
      });
      const contractGate = checkContract(contract);
      if (!contractGate.passed) {
        await this.manager.markFailure(ctx, "contract_gate", contractGate.failures.join("; "));
        throw new Error(`contract gate \u5931\u8D25: ${contractGate.failures.join("; ")}`);
      }
      await this.manager.saveContract(ctx, contract);
      markCompleted(ctx, "contract");
      await this.manager.saveState(ctx);
      const plan = generatePlan(contract);
      await this.manager.savePlan(ctx, plan);
      markCompleted(ctx, "plan");
      await this.manager.saveState(ctx);
    } else if (startFrom === "execute") {
      await this.manager.markRetrying(ctx);
    }
    if (options.dryRun) {
      return { dryRun: true };
    }
    ctx.state.status = "executing";
    ctx.state.currentStage = "execute";
    await this.manager.saveState(ctx);
    const prompt = assemblePrompt(ctx);
    const promptFile = await this.manager.savePrompt(ctx, prompt);
    const adapter = createAdapter(options.adapterKind);
    let adapterResult;
    try {
      adapterResult = await adapter.execute({
        taskId: ctx.taskId,
        workDir: ctx.workDir,
        prompt,
        promptFile,
        command: options.adapterCommand
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.manager.markFailure(ctx, "execute", `adapter \u6267\u884C\u5931\u8D25: ${message}`);
      throw error;
    }
    markCompleted(ctx, "execute");
    ctx.state.status = "verifying";
    ctx.state.currentStage = "verify";
    await this.manager.saveState(ctx);
    const evidence = await collectEvidence(ctx.workDir, ctx.config, ctx.contract);
    const commitGate = evaluateCommitGate(evidence, adapterResult.exitCode);
    const report = createTaskReport(ctx, adapterResult, evidence, commitGate);
    await this.manager.saveReport(ctx, report);
    markCompleted(ctx, "verify");
    markCompleted(ctx, "report");
    await this.manager.saveState(ctx);
    if (report.commitReady) {
      await this.manager.clearFeedback(ctx);
    } else {
      const failedChecks = report.evidence.checks.filter((check) => check.status === "failed").map((check) => `${check.name}: ${check.detail}`);
      const feedback = [
        `\u4E0A\u6B21\u6267\u884C\u672A\u901A\u8FC7 commit gate\u3002`,
        `adapter_exit_code: ${report.adapter.exitCode}`,
        failedChecks.length > 0 ? `failed_checks: ${failedChecks.join(" | ")}` : "failed_checks: none"
      ].join("\n");
      await this.manager.markFailure(ctx, "verify", feedback);
    }
    return {
      report,
      dryRun: false
    };
  }
};

// src/index.ts
var CORE_PACKAGE_NAME = "@harnessly/core";
function getCorePackageInfo() {
  return {
    name: CORE_PACKAGE_NAME,
    version: "0.0.0",
    dependsOn: [import_shared6.packageInfo.name]
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  AnthropicClient,
  CORE_PACKAGE_NAME,
  ClaudeCodeAdapter,
  CodexAdapter,
  CustomAdapter,
  HARNESS_DIRNAME,
  TaskManager,
  TemplateRegistry,
  WorkflowEngine,
  assemblePrompt,
  checkContract,
  collectChangedFiles,
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
  getBuiltinTemplates,
  getCorePackageInfo,
  getDefaultRequiredChecks,
  getHarnessPaths,
  loadHarnessConfig,
  matchTemplate,
  parseHarnessConfig,
  renderGlobalRulesTemplate,
  runLevel2Validation,
  runScopeCheck,
  saveTemplateDraft,
  serializeHarnessConfig,
  writeFileIfChanged,
  writeHarnessConfig
});
