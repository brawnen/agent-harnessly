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
  acceptanceCriterionSchema: () => acceptanceCriterionSchema,
  acceptanceVerifierSchema: () => acceptanceVerifierSchema,
  adapterKindSchema: () => adapterKindSchema,
  adapterOutputSchema: () => adapterOutputSchema,
  agentManifestSchema: () => agentManifestSchema,
  agentRoleSchema: () => agentRoleSchema,
  assetPromotionSchema: () => assetPromotionSchema,
  baselineDiffSchema: () => baselineDiffSchema,
  checkStatusSchema: () => checkStatusSchema,
  commitDecisionSchema: () => commitDecisionSchema,
  commitGateResultSchema: () => commitGateResultSchema,
  contractSchema: () => contractSchema,
  estimatedComplexitySchema: () => estimatedComplexitySchema,
  evidenceBaselineSchema: () => evidenceBaselineSchema,
  evidenceCheckResultSchema: () => evidenceCheckResultSchema,
  evidenceResultSchema: () => evidenceResultSchema,
  evidenceSnapshotSchema: () => evidenceSnapshotSchema,
  feedbackEntrySchema: () => feedbackEntrySchema,
  harnessConfigSchema: () => harnessConfigSchema,
  harnessMetaFileSchema: () => harnessMetaFileSchema,
  hostNameSchema: () => hostNameSchema,
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
  skillSchema: () => skillSchema,
  sourceTaskEntrySchema: () => sourceTaskEntrySchema,
  stageMarkerSchema: () => stageMarkerSchema,
  taskOwnerRoleSchema: () => taskOwnerRoleSchema,
  taskReportArtifactsSchema: () => taskReportArtifactsSchema,
  taskReportMetricsSchema: () => taskReportMetricsSchema,
  taskReportSchema: () => taskReportSchema,
  taskStatusSchema: () => taskStatusSchema,
  templateDraftSchema: () => templateDraftSchema,
  templateNameSchema: () => templateNameSchema,
  validateContract: () => validateContract,
  validateDesignMarkdown: () => validateDesignMarkdown,
  validateHarnessConfig: () => validateHarnessConfig,
  validateRequirementMarkdown: () => validateRequirementMarkdown,
  validateTaskReport: () => validateTaskReport,
  validateTemplateDraft: () => validateTemplateDraft,
  workflowStageSchema: () => workflowStageSchema
});
module.exports = __toCommonJS(index_exports);
var import_zod = require("zod");
var SHARED_PACKAGE_NAME = "@brawnen/harnessly-shared";
var HARNESSLY_VERSION = "0.1.0-alpha.0";
var packageInfo = {
  name: SHARED_PACKAGE_NAME,
  version: HARNESSLY_VERSION
};
var hostNameSchema = import_zod.z.enum(["claude-code", "codex", "gemini-cli"]);
var projectTypeSchema = import_zod.z.enum(["node", "go", "python", "unknown"]);
var requiredCheckSchema = import_zod.z.enum(["build", "lint", "typecheck", "test"]);
var acceptanceVerifierSchema = import_zod.z.enum([
  "build",
  "lint",
  "typecheck",
  "test",
  "playwright",
  "api",
  "manual"
]);
var templateNameSchema = import_zod.z.enum(["bug-fix", "feature-simple", "general-task"]);
var riskLevelSchema = import_zod.z.enum(["low", "medium", "high"]);
var estimatedComplexitySchema = import_zod.z.enum(["simple", "medium", "complex"]);
var adapterKindSchema = import_zod.z.enum(["claude-code", "codex", "custom"]);
var taskStatusSchema = import_zod.z.enum(["active", "blocked", "completed", "aborted"]);
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
var taskOwnerRoleSchema = import_zod.z.enum([
  "pm",
  "requirement",
  "designer",
  "developer",
  "reviewer",
  "tester"
]);
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
  adapterKind: adapterKindSchema,
  adapterCommand: import_zod.z.string()
});
var acceptanceCriterionSchema = import_zod.z.object({
  criterion: import_zod.z.string().min(1),
  verifiableBy: acceptanceVerifierSchema,
  testHint: import_zod.z.string().optional()
});
var assetPromotionSchema = import_zod.z.object({
  promote: import_zod.z.boolean(),
  topic: import_zod.z.string().min(1).optional(),
  files: import_zod.z.array(import_zod.z.string().min(1)),
  mode: import_zod.z.enum(["new_topic", "append", "replace"])
});
var sourceTaskEntrySchema = import_zod.z.object({
  task_id: import_zod.z.string().min(1),
  goal: import_zod.z.string().min(1),
  promoted_files: import_zod.z.array(import_zod.z.string().min(1)),
  promoted_at: import_zod.z.string().min(1),
  promotion_mode: import_zod.z.enum(["new_topic", "append", "replace"])
});
var harnessMetaFileSchema = import_zod.z.object({
  topic: import_zod.z.string().min(1),
  created_at: import_zod.z.string().min(1),
  harness_version: import_zod.z.string().min(1),
  source_tasks: import_zod.z.array(sourceTaskEntrySchema)
});
var contractSchema = import_zod.z.object({
  version: import_zod.z.literal("2.0"),
  taskId: import_zod.z.string(),
  goal: import_zod.z.string().min(1),
  templateName: templateNameSchema,
  riskLevel: riskLevelSchema,
  estimatedComplexity: estimatedComplexitySchema,
  requiredChecks: import_zod.z.array(requiredCheckSchema),
  scopeInclude: import_zod.z.array(import_zod.z.string()),
  scopeExclude: import_zod.z.array(import_zod.z.string()),
  acceptanceCriteria: import_zod.z.array(acceptanceCriterionSchema),
  outOfScope: import_zod.z.array(import_zod.z.string()),
  linkedSpec: import_zod.z.string().min(1),
  linkedDesign: import_zod.z.string().min(1),
  assetPromotion: assetPromotionSchema.optional(),
  createdAt: import_zod.z.string().min(1)
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
  detail: import_zod.z.string(),
  fixHint: import_zod.z.string().optional(),
  durationMs: import_zod.z.number().int().nonnegative().optional(),
  testCount: import_zod.z.number().int().nonnegative().optional()
});
var evidenceResultSchema = import_zod.z.object({
  checks: import_zod.z.array(evidenceCheckResultSchema),
  changedFiles: import_zod.z.array(import_zod.z.string()),
  lintWarningsTotal: import_zod.z.number().int().nonnegative(),
  todoCount: import_zod.z.number().int().nonnegative(),
  gitDirtyFiles: import_zod.z.number().int().nonnegative()
});
var skillSchema = import_zod.z.object({
  name: import_zod.z.string().min(1),
  language: import_zod.z.string().min(1),
  command: import_zod.z.string().min(1),
  successExitCode: import_zod.z.number().int(),
  envRequired: import_zod.z.array(import_zod.z.string()),
  detailOnPass: import_zod.z.string(),
  detailOnFailTemplate: import_zod.z.string(),
  fixHintTemplate: import_zod.z.string()
});
var commitDecisionSchema = import_zod.z.enum(["pass", "needs_human_review", "fail"]);
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
var evidenceSnapshotSchema = import_zod.z.object({
  capturedAt: import_zod.z.string().min(1),
  checks: import_zod.z.array(evidenceCheckResultSchema),
  lintWarningsTotal: import_zod.z.number().int().nonnegative(),
  todoCount: import_zod.z.number().int().nonnegative(),
  gitDirtyFiles: import_zod.z.number().int().nonnegative()
});
var baselineDiffSchema = import_zod.z.object({
  checks: import_zod.z.record(
    import_zod.z.string(),
    import_zod.z.object({
      from: import_zod.z.union([checkStatusSchema, import_zod.z.literal("missing")]),
      to: import_zod.z.union([checkStatusSchema, import_zod.z.literal("missing")]),
      regression: import_zod.z.boolean()
    })
  ),
  lintWarningsDelta: import_zod.z.number().int(),
  todoDelta: import_zod.z.number().int()
});
var taskReportArtifactsSchema = import_zod.z.object({
  requirement: import_zod.z.string(),
  contract: import_zod.z.string(),
  design: import_zod.z.string(),
  taskBreakdown: import_zod.z.string(),
  implementationNotes: import_zod.z.string(),
  review: import_zod.z.string(),
  residentReview: import_zod.z.string(),
  testReport: import_zod.z.string(),
  baselineEvidence: import_zod.z.string(),
  currentEvidence: import_zod.z.string(),
  baselineDiff: import_zod.z.string(),
  commitSummary: import_zod.z.string()
});
var taskReportMetricsSchema = import_zod.z.object({
  llmCalls: import_zod.z.number().int().nonnegative(),
  durationSeconds: import_zod.z.number().int().nonnegative(),
  retries: import_zod.z.number().int().nonnegative()
});
var taskReportSchema = import_zod.z.object({
  taskId: import_zod.z.string().min(1),
  goal: import_zod.z.string().min(1),
  finalStage: workflowStageSchema,
  commitDecision: commitDecisionSchema,
  artifacts: taskReportArtifactsSchema,
  metrics: taskReportMetricsSchema,
  createdAt: import_zod.z.string().min(1),
  finishedAt: import_zod.z.string().min(1),
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
  planModeEnabled: import_zod.z.boolean(),
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
      adapterKind: raw.adapter_kind ?? "claude-code",
      adapterCommand: raw.adapter_command ?? ""
    },
    "harness config"
  );
}
function validateContract(contract) {
  return parseWithSchema(contractSchema, contract, "contract");
}
function yamlList(items, indent = 0) {
  const pad = " ".repeat(indent);
  return items.length > 0 ? items.map((item) => `${pad}- ${item}`) : [`${pad}[]`];
}
function serializeContract(contract) {
  const validated = validateContract(contract);
  const lines = [
    `version: "${validated.version}"`,
    `task_id: ${validated.taskId}`,
    `goal: ${validated.goal}`,
    "scope:",
    "  include:",
    ...yamlList(validated.scopeInclude, 4),
    "  exclude:",
    ...yamlList(validated.scopeExclude, 4),
    "acceptance_criteria:"
  ];
  for (const item of validated.acceptanceCriteria) {
    lines.push(`  - criterion: ${item.criterion}`);
    lines.push(`    verifiable_by: ${item.verifiableBy}`);
    if (item.testHint) {
      lines.push(`    test_hint: ${item.testHint}`);
    }
  }
  lines.push(
    `risk_level: ${validated.riskLevel}`,
    `estimated_complexity: ${validated.estimatedComplexity}`,
    "required_checks:",
    ...yamlList(validated.requiredChecks, 2),
    `linked_spec: ${validated.linkedSpec}`,
    `linked_design: ${validated.linkedDesign}`
  );
  if (validated.assetPromotion) {
    lines.push(
      "asset_promotion:",
      `  promote: ${validated.assetPromotion.promote}`
    );
    if (validated.assetPromotion.topic) {
      lines.push(`  topic: ${validated.assetPromotion.topic}`);
    }
    lines.push("  files:", ...yamlList(validated.assetPromotion.files, 4));
    lines.push(`  mode: ${validated.assetPromotion.mode}`);
  }
  lines.push(
    `created_at: ${validated.createdAt}`,
    `template_name: ${validated.templateName}`,
    "out_of_scope:",
    ...yamlList(validated.outOfScope, 2),
    ""
  );
  return lines.join("\n");
}
function parseContract(text) {
  const raw = parseFlatYaml(text);
  const readScalar = (key) => {
    const match = text.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
    return match?.[1]?.trim().replace(/^"|"$/g, "");
  };
  const readIndentedList = (heading) => {
    const lines = text.split(/\r?\n/);
    const start = lines.findIndex((line) => line.trim() === heading);
    if (start === -1) return [];
    const result = [];
    for (let i = start + 1; i < lines.length; i += 1) {
      const line = lines[i] ?? "";
      if (/^\S/.test(line) && line.trim().endsWith(":")) break;
      const item = line.match(/^\s*-\s+(.+)$/)?.[1]?.trim();
      if (item) result.push(item);
      if (/^\S/.test(line) && line.trim() && !line.trim().startsWith("-")) break;
    }
    return result;
  };
  const readScopeList = (key) => {
    const lines = text.split(/\r?\n/);
    const scopeStart = lines.findIndex((line) => line.trim() === "scope:");
    if (scopeStart === -1) return [];
    const keyStart = lines.findIndex((line, index) => index > scopeStart && line.trim() === `${key}:`);
    if (keyStart === -1) return [];
    const result = [];
    for (let i = keyStart + 1; i < lines.length; i += 1) {
      const line = lines[i] ?? "";
      if (/^\s{2}\S/.test(line) && line.trim().endsWith(":")) break;
      if (/^\S/.test(line)) break;
      const item = line.match(/^\s*-\s+(.+)$/)?.[1]?.trim();
      if (item) result.push(item);
    }
    return result;
  };
  const readAcceptanceCriteria = () => {
    const legacyAcceptance = parseStringList(raw.acceptance_criteria);
    if (legacyAcceptance.length > 0 && !legacyAcceptance.some((criterion) => criterion.startsWith("criterion:"))) {
      return legacyAcceptance.map((criterion) => ({
        criterion,
        verifiableBy: "manual"
      }));
    }
    const result = [];
    let current = null;
    for (const line of text.split(/\r?\n/)) {
      const criterion = line.match(/^\s*-\s+criterion:\s*(.+)$/)?.[1]?.trim();
      if (criterion) {
        if (current?.criterion) {
          result.push({
            criterion: current.criterion,
            verifiableBy: current.verifiableBy ?? "manual",
            testHint: current.testHint
          });
        }
        current = { criterion };
        continue;
      }
      const verifier = line.match(/^\s+verifiable_by:\s*(.+)$/)?.[1]?.trim();
      if (verifier && current) {
        current.verifiableBy = verifier;
      }
      const testHint = line.match(/^\s+test_hint:\s*(.+)$/)?.[1]?.trim();
      if (testHint && current) {
        current.testHint = testHint;
      }
    }
    if (current?.criterion) {
      result.push({
        criterion: current.criterion,
        verifiableBy: current.verifiableBy ?? "manual",
        testHint: current.testHint
      });
    }
    return result;
  };
  return parseWithSchema(
    contractSchema,
    {
      version: readScalar("version") ?? "2.0",
      taskId: readScalar("task_id") ?? raw.task_id ?? "",
      goal: readScalar("goal") ?? raw.goal ?? "",
      templateName: raw.template_name ?? "general-task",
      riskLevel: readScalar("risk_level") ?? raw.risk_level ?? "medium",
      estimatedComplexity: readScalar("estimated_complexity") ?? raw.estimated_complexity ?? "medium",
      requiredChecks: parseStringList(raw.required_checks).length > 0 ? parseStringList(raw.required_checks) : readIndentedList("required_checks:"),
      scopeInclude: parseStringList(raw.scope_include).length > 0 ? parseStringList(raw.scope_include) : readScopeList("include"),
      scopeExclude: parseStringList(raw.scope_exclude).length > 0 ? parseStringList(raw.scope_exclude) : readScopeList("exclude"),
      acceptanceCriteria: readAcceptanceCriteria(),
      outOfScope: parseStringList(raw.out_of_scope).length > 0 ? parseStringList(raw.out_of_scope) : readIndentedList("out_of_scope:"),
      linkedSpec: readScalar("linked_spec") ?? raw.linked_spec ?? "requirement.md",
      linkedDesign: readScalar("linked_design") ?? raw.linked_design ?? "design.md",
      createdAt: readScalar("created_at") ?? raw.created_at ?? (/* @__PURE__ */ new Date(0)).toISOString()
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
var REQUIREMENT_REQUIRED_SECTIONS = [
  "Goal",
  "In Scope",
  "Out of Scope",
  "Affected Modules",
  "Acceptance Criteria",
  "Risks",
  "Open Questions"
];
var HEDGING_WORDS = ["\u5EFA\u8BAE", "\u53EF\u4EE5", "\u63A8\u8350", "\u53EF\u9009", "suggest", "recommend", "optional"];
var FORWARD_REFERENCE_PATTERNS = [/同上/, /与\s*.+\s*平行/, /细节见别处/];
function hasMarkdownSection(markdown, title) {
  return new RegExp(`^##\\s+${title}\\s*$`, "im").test(markdown);
}
function listSectionItems(markdown, title) {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim().toLowerCase() === `## ${title}`.toLowerCase());
  if (start === -1) return [];
  const result = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    if (/^##\s+/.test(line)) break;
    const item = line.match(/^\s*[-*]\s+(.+)$/)?.[1]?.trim();
    if (item) result.push(item);
  }
  return result;
}
function validateRequirementMarkdown(markdown) {
  const failures = [];
  for (const section of REQUIREMENT_REQUIRED_SECTIONS) {
    if (!hasMarkdownSection(markdown, section)) {
      failures.push(`\u7F3A\u5C11 ## ${section} \u5C0F\u8282`);
    }
  }
  for (const section of ["In Scope", "Out of Scope", "Acceptance Criteria"]) {
    if (hasMarkdownSection(markdown, section) && listSectionItems(markdown, section).length === 0) {
      failures.push(`## ${section} \u5FC5\u987B\u5305\u542B\u81F3\u5C11\u4E00\u4E2A\u5217\u8868\u9879`);
    }
  }
  const lower = markdown.toLowerCase();
  for (const word of HEDGING_WORDS) {
    if (lower.includes(word.toLowerCase())) {
      failures.push(`requirement.md \u542B\u6A21\u7CCA\u8BCD\uFF1A${word}`);
    }
  }
  return failures;
}
function validateDesignMarkdown(markdown) {
  const failures = [];
  if (!hasMarkdownSection(markdown, "Feasibility Self-Check")) {
    failures.push("\u7F3A\u5C11 ## Feasibility Self-Check \u5C0F\u8282");
  }
  if (!/备选|方案\s*[AB]|Alternative/i.test(markdown)) {
    failures.push("design.md \u5FC5\u987B\u81F3\u5C11\u5BF9\u6BD4\u4E24\u79CD\u5907\u9009\u65B9\u6848");
  }
  if (!/接口|符号|契约|API|Interface/i.test(markdown)) {
    failures.push("design.md \u5FC5\u987B\u5305\u542B\u63A5\u53E3/\u5951\u7EA6\u8BF4\u660E");
  }
  if (!/影响|Affected|文件/.test(markdown)) {
    failures.push("design.md \u5FC5\u987B\u5217\u51FA\u5F71\u54CD\u8303\u56F4");
  }
  for (const pattern of FORWARD_REFERENCE_PATTERNS) {
    if (pattern.test(markdown)) {
      failures.push(`design.md \u542B\u524D\u5411\u5F15\u7528\uFF1A${pattern.source}`);
    }
  }
  return failures;
}
function serializeAgentManifestYaml(manifest) {
  const validated = parseWithSchema(agentManifestSchema, manifest, "agent manifest");
  return serializeFlatYaml({
    role: validated.role,
    display_name: validated.displayName,
    description: validated.description,
    stage: validated.stage,
    enabled: validated.enabled,
    plan_mode_enabled: validated.planModeEnabled,
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
      planModeEnabled: parseBoolean(raw.plan_mode_enabled, false),
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
  acceptanceCriterionSchema,
  acceptanceVerifierSchema,
  adapterKindSchema,
  adapterOutputSchema,
  agentManifestSchema,
  agentRoleSchema,
  assetPromotionSchema,
  baselineDiffSchema,
  checkStatusSchema,
  commitDecisionSchema,
  commitGateResultSchema,
  contractSchema,
  estimatedComplexitySchema,
  evidenceBaselineSchema,
  evidenceCheckResultSchema,
  evidenceResultSchema,
  evidenceSnapshotSchema,
  feedbackEntrySchema,
  harnessConfigSchema,
  harnessMetaFileSchema,
  hostNameSchema,
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
  skillSchema,
  sourceTaskEntrySchema,
  stageMarkerSchema,
  taskOwnerRoleSchema,
  taskReportArtifactsSchema,
  taskReportMetricsSchema,
  taskReportSchema,
  taskStatusSchema,
  templateDraftSchema,
  templateNameSchema,
  validateContract,
  validateDesignMarkdown,
  validateHarnessConfig,
  validateRequirementMarkdown,
  validateTaskReport,
  validateTemplateDraft,
  workflowStageSchema
});
