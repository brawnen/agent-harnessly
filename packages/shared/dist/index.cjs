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
  HARNESSLY_VERSION: () => HARNESSLY_VERSION,
  SHARED_PACKAGE_NAME: () => SHARED_PACKAGE_NAME,
  adapterKindSchema: () => adapterKindSchema,
  adapterOutputSchema: () => adapterOutputSchema,
  agentManifestSchema: () => agentManifestSchema,
  agentRoleSchema: () => agentRoleSchema,
  checkStatusSchema: () => checkStatusSchema,
  commitDecisionSchema: () => commitDecisionSchema,
  commitGateResultSchema: () => commitGateResultSchema,
  contractSchema: () => contractSchema,
  evidenceBaselineSchema: () => evidenceBaselineSchema,
  evidenceCheckResultSchema: () => evidenceCheckResultSchema,
  evidenceResultSchema: () => evidenceResultSchema,
  feedbackEntrySchema: () => feedbackEntrySchema,
  harnessConfigSchema: () => harnessConfigSchema,
  hostNameSchema: () => hostNameSchema,
  hostSubagentConfigSchema: () => hostSubagentConfigSchema,
  packageInfo: () => packageInfo,
  parseAgentManifestYaml: () => parseAgentManifestYaml,
  parseBoolean: () => parseBoolean,
  parseContract: () => parseContract,
  parseFlatYaml: () => parseFlatYaml,
  parseHarnessConfig: () => parseHarnessConfig,
  parseStringList: () => parseStringList,
  parseTaskReport: () => parseTaskReport,
  parseTemplateDraft: () => parseTemplateDraft,
  projectTypeSchema: () => projectTypeSchema,
  requiredCheckSchema: () => requiredCheckSchema,
  riskLevelSchema: () => riskLevelSchema,
  serializeAgentManifestYaml: () => serializeAgentManifestYaml,
  serializeContract: () => serializeContract,
  serializeFlatYaml: () => serializeFlatYaml,
  serializeHarnessConfig: () => serializeHarnessConfig,
  serializeTaskReport: () => serializeTaskReport,
  serializeTemplateDraft: () => serializeTemplateDraft,
  stageMarkerSchema: () => stageMarkerSchema,
  taskReportSchema: () => taskReportSchema,
  taskStatusSchema: () => taskStatusSchema,
  templateDraftSchema: () => templateDraftSchema,
  templateNameSchema: () => templateNameSchema,
  validateContract: () => validateContract,
  validateHarnessConfig: () => validateHarnessConfig,
  validateTaskReport: () => validateTaskReport,
  validateTemplateDraft: () => validateTemplateDraft,
  workflowStageSchema: () => workflowStageSchema
});
module.exports = __toCommonJS(index_exports);
var import_zod = require("zod");
var SHARED_PACKAGE_NAME = "@harnessly/shared";
var HARNESSLY_VERSION = "0.0.0";
var packageInfo = {
  name: SHARED_PACKAGE_NAME,
  version: HARNESSLY_VERSION
};
var hostNameSchema = import_zod.z.enum(["claude-code", "codex", "gemini-cli"]);
var projectTypeSchema = import_zod.z.enum(["node", "go", "python", "unknown"]);
var requiredCheckSchema = import_zod.z.enum(["build", "lint", "typecheck", "test"]);
var templateNameSchema = import_zod.z.enum(["bug-fix", "feature-simple", "general-task"]);
var riskLevelSchema = import_zod.z.enum(["low", "medium", "high"]);
var adapterKindSchema = import_zod.z.enum(["claude-code", "codex", "custom"]);
var hostSubagentConfigSchema = import_zod.z.object({
  planner: import_zod.z.object({
    useHostPlanMode: import_zod.z.boolean(),
    models: import_zod.z.object({
      "claude-code": import_zod.z.string().min(1).optional(),
      codex: import_zod.z.string().min(1).optional(),
      "gemini-cli": import_zod.z.string().min(1).optional()
    })
  }),
  evaluator: import_zod.z.object({
    models: import_zod.z.object({
      "claude-code": import_zod.z.string().min(1).optional(),
      codex: import_zod.z.string().min(1).optional(),
      "gemini-cli": import_zod.z.string().min(1).optional()
    })
  })
});
var taskStatusSchema = import_zod.z.enum([
  "created",
  "contracting",
  "planning",
  "ready",
  "executing",
  "verifying",
  "passed",
  "failed"
]);
var workflowStageSchema = import_zod.z.enum([
  "spec",
  "design",
  "execute",
  "review",
  "test",
  "commit_gate"
]);
var stageMarkerSchema = import_zod.z.union([
  workflowStageSchema,
  import_zod.z.literal("created"),
  import_zod.z.literal("failed"),
  import_zod.z.literal("retry")
]);
var checkStatusSchema = import_zod.z.enum(["passed", "failed", "skipped"]);
var harnessConfigSchema = import_zod.z.object({
  version: import_zod.z.number().int().nonnegative(),
  projectType: projectTypeSchema,
  requiredChecks: import_zod.z.array(requiredCheckSchema),
  defaultHost: hostNameSchema,
  enabledHosts: import_zod.z.array(hostNameSchema),
  installRepoLocalShells: import_zod.z.boolean(),
  sourceOfTruthDir: import_zod.z.string().min(1),
  fallbackCreateTaskWithoutPlanner: import_zod.z.boolean(),
  codexUserPromptSubmitHookEnabled: import_zod.z.boolean(),
  hostSubagents: hostSubagentConfigSchema,
  adapterKind: adapterKindSchema,
  adapterCommand: import_zod.z.string()
});
var contractSchema = import_zod.z.object({
  goal: import_zod.z.string().min(1),
  templateName: templateNameSchema,
  riskLevel: riskLevelSchema,
  scopeInclude: import_zod.z.array(import_zod.z.string()),
  scopeExclude: import_zod.z.array(import_zod.z.string()),
  acceptanceCriteria: import_zod.z.array(import_zod.z.string()),
  outOfScope: import_zod.z.array(import_zod.z.string())
});
var adapterOutputSchema = import_zod.z.object({
  kind: adapterKindSchema,
  command: import_zod.z.string().min(1),
  exitCode: import_zod.z.number().int(),
  stdout: import_zod.z.string(),
  stderr: import_zod.z.string()
});
var evidenceCheckResultSchema = import_zod.z.object({
  name: import_zod.z.string().min(1),
  status: checkStatusSchema,
  command: import_zod.z.string(),
  detail: import_zod.z.string()
});
var evidenceResultSchema = import_zod.z.object({
  checks: import_zod.z.array(evidenceCheckResultSchema),
  changedFiles: import_zod.z.array(import_zod.z.string())
});
var commitDecisionSchema = import_zod.z.enum(["pass", "block", "warn"]);
var commitGateResultSchema = import_zod.z.object({
  passed: import_zod.z.boolean(),
  decision: commitDecisionSchema,
  failures: import_zod.z.array(import_zod.z.string()),
  warnings: import_zod.z.array(import_zod.z.string()),
  preExistingFailures: import_zod.z.array(import_zod.z.string())
});
var evidenceBaselineSchema = import_zod.z.object({
  capturedAt: import_zod.z.string().min(1),
  failedCheckNames: import_zod.z.array(import_zod.z.string())
});
var taskReportSchema = import_zod.z.object({
  taskId: import_zod.z.string().min(1),
  goal: import_zod.z.string().min(1),
  adapter: adapterOutputSchema,
  evidence: evidenceResultSchema,
  commitGate: commitGateResultSchema,
  commitReady: import_zod.z.boolean(),
  summary: import_zod.z.string().min(1),
  generatedAt: import_zod.z.string().min(1)
});
var feedbackEntrySchema = import_zod.z.object({
  taskId: import_zod.z.string().min(1),
  goal: import_zod.z.string().min(1),
  decision: commitDecisionSchema,
  completedAt: import_zod.z.string().min(1),
  completedStages: import_zod.z.array(stageMarkerSchema),
  retryCount: import_zod.z.number().int().nonnegative(),
  template: templateNameSchema.optional(),
  riskLevel: riskLevelSchema.optional(),
  changedFilesCount: import_zod.z.number().int().nonnegative(),
  failureReason: import_zod.z.string().optional(),
  failureStage: stageMarkerSchema.optional()
});
var agentRoleSchema = import_zod.z.enum([
  "requirement",
  "designer",
  "developer",
  "reviewer",
  "tester"
]);
var agentManifestSchema = import_zod.z.object({
  role: agentRoleSchema,
  displayName: import_zod.z.string().min(1),
  description: import_zod.z.string().min(1),
  stage: workflowStageSchema,
  enabled: import_zod.z.boolean(),
  models: import_zod.z.object({
    "claude-code": import_zod.z.string().min(1).optional(),
    codex: import_zod.z.string().min(1).optional(),
    "gemini-cli": import_zod.z.string().min(1).optional()
  }),
  toolWhitelist: import_zod.z.array(import_zod.z.string()),
  prompt: import_zod.z.string()
});
var templateDraftSchema = import_zod.z.object({
  name: import_zod.z.string().min(1),
  description: import_zod.z.string().min(1),
  sourceTaskId: import_zod.z.string().min(1),
  appliesTo: import_zod.z.array(import_zod.z.string()),
  templateName: templateNameSchema,
  riskLevel: riskLevelSchema,
  requiredChecks: import_zod.z.array(requiredCheckSchema),
  scopeInclude: import_zod.z.array(import_zod.z.string()),
  outOfScope: import_zod.z.array(import_zod.z.string()),
  acceptanceCriteria: import_zod.z.array(import_zod.z.string())
});
function formatSchemaError(error) {
  return error.issues.map((issue) => `${issue.path.length > 0 ? issue.path.join(".") : "root"}: ${issue.message}`).join("; ");
}
function parseWithSchema(schema, payload, label) {
  try {
    return schema.parse(payload);
  } catch (error) {
    if (error instanceof import_zod.ZodError) {
      throw new Error(`${label} \u6821\u9A8C\u5931\u8D25: ${formatSchemaError(error)}`);
    }
    throw error;
  }
}
function serializeFlatYaml(data) {
  const lines = Object.entries(data).map(([key, value]) => {
    if (Array.isArray(value)) {
      return `${key}: ${value.join(",")}`;
    }
    return `${key}: ${String(value)}`;
  });
  return `${lines.join("\n")}
`;
}
function parseFlatYaml(text) {
  const result = {};
  let currentKey = null;
  const lines = text.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    if (line.startsWith("- ") && currentKey) {
      const item = line.slice(2).trim();
      const existing = result[currentKey];
      result[currentKey] = existing ? `${existing},${item}` : item;
      continue;
    }
    const separatorIndex = line.indexOf(":");
    if (separatorIndex === -1) {
      continue;
    }
    currentKey = line.slice(0, separatorIndex).trim();
    result[currentKey] = line.slice(separatorIndex + 1).trim();
  }
  return result;
}
function parseBoolean(value, defaultValue = false) {
  if (value === void 0) {
    return defaultValue;
  }
  return value === "true";
}
function parseStringList(value) {
  if (!value) {
    return [];
  }
  const trimmed = value.trim();
  if (!trimmed || trimmed === "[]") {
    return [];
  }
  return trimmed.split(",").map((item) => item.trim()).filter(Boolean);
}
function validateHarnessConfig(config) {
  return parseWithSchema(harnessConfigSchema, config, "harness config");
}
function serializeHarnessConfig(config) {
  const validated = validateHarnessConfig(config);
  return serializeFlatYaml({
    version: validated.version,
    project_type: validated.projectType,
    required_checks: validated.requiredChecks,
    default_host: validated.defaultHost,
    enabled_hosts: validated.enabledHosts,
    install_repo_local_shells: validated.installRepoLocalShells,
    source_of_truth_dir: validated.sourceOfTruthDir,
    fallback_create_task_without_planner: validated.fallbackCreateTaskWithoutPlanner,
    codex_user_prompt_submit_hook_enabled: validated.codexUserPromptSubmitHookEnabled,
    planner_use_host_plan_mode: validated.hostSubagents.planner.useHostPlanMode,
    planner_model_claude_code: validated.hostSubagents.planner.models["claude-code"] ?? "",
    planner_model_codex: validated.hostSubagents.planner.models.codex ?? "",
    planner_model_gemini_cli: validated.hostSubagents.planner.models["gemini-cli"] ?? "",
    evaluator_model_claude_code: validated.hostSubagents.evaluator.models["claude-code"] ?? "",
    evaluator_model_codex: validated.hostSubagents.evaluator.models.codex ?? "",
    evaluator_model_gemini_cli: validated.hostSubagents.evaluator.models["gemini-cli"] ?? "",
    adapter_kind: validated.adapterKind,
    adapter_command: validated.adapterCommand
  });
}
function parseHarnessConfig(text) {
  const raw = parseFlatYaml(text);
  return parseWithSchema(
    harnessConfigSchema,
    {
      version: Number(raw.version ?? "1"),
      projectType: raw.project_type ?? "unknown",
      requiredChecks: parseStringList(raw.required_checks),
      defaultHost: raw.default_host ?? "claude-code",
      enabledHosts: parseStringList(raw.enabled_hosts),
      installRepoLocalShells: parseBoolean(raw.install_repo_local_shells, true),
      sourceOfTruthDir: raw.source_of_truth_dir ?? ".harness/hosts",
      fallbackCreateTaskWithoutPlanner: parseBoolean(raw.fallback_create_task_without_planner, false),
      codexUserPromptSubmitHookEnabled: parseBoolean(
        raw.codex_user_prompt_submit_hook_enabled,
        true
      ),
      hostSubagents: {
        planner: {
          useHostPlanMode: parseBoolean(raw.planner_use_host_plan_mode, true),
          models: {
            "claude-code": raw.planner_model_claude_code || "haiku",
            codex: raw.planner_model_codex || "gpt-5.4-mini",
            "gemini-cli": raw.planner_model_gemini_cli || "gemini-flash"
          }
        },
        evaluator: {
          models: {
            "claude-code": raw.evaluator_model_claude_code || "sonnet",
            codex: raw.evaluator_model_codex || "gpt-5.4",
            "gemini-cli": raw.evaluator_model_gemini_cli || "gemini-pro"
          }
        }
      },
      adapterKind: raw.adapter_kind ?? "claude-code",
      adapterCommand: raw.adapter_command ?? ""
    },
    "harness config"
  );
}
function validateContract(contract) {
  return parseWithSchema(contractSchema, contract, "contract");
}
function serializeContract(contract) {
  const validated = validateContract(contract);
  return serializeFlatYaml({
    goal: validated.goal,
    template_name: validated.templateName,
    risk_level: validated.riskLevel,
    scope_include: validated.scopeInclude,
    scope_exclude: validated.scopeExclude,
    acceptance_criteria: validated.acceptanceCriteria,
    out_of_scope: validated.outOfScope
  });
}
function parseContract(text) {
  const raw = parseFlatYaml(text);
  return parseWithSchema(
    contractSchema,
    {
      goal: raw.goal ?? "",
      templateName: raw.template_name ?? "general-task",
      riskLevel: raw.risk_level ?? "medium",
      scopeInclude: parseStringList(raw.scope_include),
      scopeExclude: parseStringList(raw.scope_exclude),
      acceptanceCriteria: parseStringList(raw.acceptance_criteria),
      outOfScope: parseStringList(raw.out_of_scope)
    },
    "contract"
  );
}
function validateTaskReport(report) {
  return parseWithSchema(taskReportSchema, report, "task report");
}
function serializeTaskReport(report) {
  return `${JSON.stringify(validateTaskReport(report), null, 2)}
`;
}
function parseTaskReport(text) {
  return parseWithSchema(taskReportSchema, JSON.parse(text), "task report");
}
function serializeAgentManifestYaml(manifest) {
  const validated = parseWithSchema(agentManifestSchema, manifest, "agent manifest");
  return serializeFlatYaml({
    role: validated.role,
    display_name: validated.displayName,
    description: validated.description,
    stage: validated.stage,
    enabled: validated.enabled,
    model_claude_code: validated.models["claude-code"] ?? "",
    model_codex: validated.models.codex ?? "",
    model_gemini_cli: validated.models["gemini-cli"] ?? "",
    tool_whitelist: validated.toolWhitelist
  });
}
function parseAgentManifestYaml(text) {
  const raw = parseFlatYaml(text);
  const models = {};
  if (raw.model_claude_code) {
    models["claude-code"] = raw.model_claude_code;
  }
  if (raw.model_codex) {
    models.codex = raw.model_codex;
  }
  if (raw.model_gemini_cli) {
    models["gemini-cli"] = raw.model_gemini_cli;
  }
  return parseWithSchema(
    agentManifestSchema,
    {
      role: raw.role ?? "",
      displayName: raw.display_name ?? "",
      description: raw.description ?? "",
      stage: raw.stage ?? "",
      enabled: parseBoolean(raw.enabled, true),
      models,
      toolWhitelist: parseStringList(raw.tool_whitelist),
      prompt: ""
    },
    "agent manifest"
  );
}
function validateTemplateDraft(template) {
  return parseWithSchema(templateDraftSchema, template, "template draft");
}
function serializeTemplateDraft(template) {
  const validated = validateTemplateDraft(template);
  return serializeFlatYaml({
    name: validated.name,
    description: validated.description,
    source_task_id: validated.sourceTaskId,
    applies_to: validated.appliesTo,
    template_name: validated.templateName,
    risk_level: validated.riskLevel,
    required_checks: validated.requiredChecks,
    scope_include: validated.scopeInclude,
    out_of_scope: validated.outOfScope,
    acceptance_criteria: validated.acceptanceCriteria
  });
}
function parseTemplateDraft(text) {
  const raw = parseFlatYaml(text);
  return parseWithSchema(
    templateDraftSchema,
    {
      name: raw.name ?? "",
      description: raw.description ?? "",
      sourceTaskId: raw.source_task_id ?? "",
      appliesTo: parseStringList(raw.applies_to),
      templateName: raw.template_name ?? "general-task",
      riskLevel: raw.risk_level ?? "medium",
      requiredChecks: parseStringList(raw.required_checks),
      scopeInclude: parseStringList(raw.scope_include),
      outOfScope: parseStringList(raw.out_of_scope),
      acceptanceCriteria: parseStringList(raw.acceptance_criteria)
    },
    "template draft"
  );
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  HARNESSLY_VERSION,
  SHARED_PACKAGE_NAME,
  adapterKindSchema,
  adapterOutputSchema,
  agentManifestSchema,
  agentRoleSchema,
  checkStatusSchema,
  commitDecisionSchema,
  commitGateResultSchema,
  contractSchema,
  evidenceBaselineSchema,
  evidenceCheckResultSchema,
  evidenceResultSchema,
  feedbackEntrySchema,
  harnessConfigSchema,
  hostNameSchema,
  hostSubagentConfigSchema,
  packageInfo,
  parseAgentManifestYaml,
  parseBoolean,
  parseContract,
  parseFlatYaml,
  parseHarnessConfig,
  parseStringList,
  parseTaskReport,
  parseTemplateDraft,
  projectTypeSchema,
  requiredCheckSchema,
  riskLevelSchema,
  serializeAgentManifestYaml,
  serializeContract,
  serializeFlatYaml,
  serializeHarnessConfig,
  serializeTaskReport,
  serializeTemplateDraft,
  stageMarkerSchema,
  taskReportSchema,
  taskStatusSchema,
  templateDraftSchema,
  templateNameSchema,
  validateContract,
  validateHarnessConfig,
  validateTaskReport,
  validateTemplateDraft,
  workflowStageSchema
});
