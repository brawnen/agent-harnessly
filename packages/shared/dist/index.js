// src/index.ts
import { ZodError, z } from "zod";
var SHARED_PACKAGE_NAME = "@harnessly/shared";
var HARNESSLY_VERSION = "0.0.0";
var packageInfo = {
  name: SHARED_PACKAGE_NAME,
  version: HARNESSLY_VERSION
};
var hostNameSchema = z.enum(["claude-code", "codex", "gemini-cli"]);
var projectTypeSchema = z.enum(["node", "go", "python", "unknown"]);
var requiredCheckSchema = z.enum(["build", "lint", "typecheck", "test"]);
var acceptanceVerifierSchema = z.enum([
  "build",
  "lint",
  "typecheck",
  "test",
  "playwright",
  "api",
  "manual"
]);
var templateNameSchema = z.enum(["bug-fix", "feature-simple", "general-task"]);
var riskLevelSchema = z.enum(["low", "medium", "high"]);
var estimatedComplexitySchema = z.enum(["simple", "medium", "complex"]);
var adapterKindSchema = z.enum(["claude-code", "codex", "custom"]);
var taskStatusSchema = z.enum(["active", "blocked", "completed", "aborted"]);
var workflowStageSchema = z.enum([
  "spec",
  "design",
  "execute",
  "review",
  "test",
  "commit_gate"
]);
var stageMarkerSchema = z.union([
  workflowStageSchema,
  z.literal("created"),
  z.literal("failed"),
  z.literal("retry")
]);
var checkStatusSchema = z.enum(["passed", "failed", "skipped"]);
var taskOwnerRoleSchema = z.enum([
  "pm",
  "requirement",
  "designer",
  "developer",
  "reviewer",
  "tester"
]);
var harnessConfigSchema = z.object({
  version: z.number().int().nonnegative(),
  projectType: projectTypeSchema,
  requiredChecks: z.array(requiredCheckSchema),
  defaultHost: hostNameSchema,
  enabledHosts: z.array(hostNameSchema),
  installRepoLocalShells: z.boolean(),
  sourceOfTruthDir: z.string().min(1),
  fallbackCreateTaskWithoutPlanner: z.boolean(),
  codexUserPromptSubmitHookEnabled: z.boolean(),
  adapterKind: adapterKindSchema,
  adapterCommand: z.string()
});
var acceptanceCriterionSchema = z.object({
  criterion: z.string().min(1),
  verifiableBy: acceptanceVerifierSchema,
  testHint: z.string().optional()
});
var assetPromotionSchema = z.object({
  promote: z.boolean(),
  topic: z.string().min(1).optional(),
  files: z.array(z.string().min(1)),
  mode: z.enum(["new_topic", "append", "replace"])
});
var sourceTaskEntrySchema = z.object({
  task_id: z.string().min(1),
  goal: z.string().min(1),
  promoted_files: z.array(z.string().min(1)),
  promoted_at: z.string().min(1),
  promotion_mode: z.enum(["new_topic", "append", "replace"])
});
var harnessMetaFileSchema = z.object({
  topic: z.string().min(1),
  created_at: z.string().min(1),
  harness_version: z.string().min(1),
  source_tasks: z.array(sourceTaskEntrySchema)
});
var contractSchema = z.object({
  version: z.literal("2.0"),
  taskId: z.string(),
  goal: z.string().min(1),
  templateName: templateNameSchema,
  riskLevel: riskLevelSchema,
  estimatedComplexity: estimatedComplexitySchema,
  requiredChecks: z.array(requiredCheckSchema),
  scopeInclude: z.array(z.string()),
  scopeExclude: z.array(z.string()),
  acceptanceCriteria: z.array(acceptanceCriterionSchema),
  outOfScope: z.array(z.string()),
  linkedSpec: z.string().min(1),
  linkedDesign: z.string().min(1),
  assetPromotion: assetPromotionSchema.optional(),
  createdAt: z.string().min(1)
});
var adapterOutputSchema = z.object({
  kind: adapterKindSchema,
  command: z.string().min(1),
  exitCode: z.number().int(),
  stdout: z.string(),
  stderr: z.string()
});
var evidenceCheckResultSchema = z.object({
  name: z.string().min(1),
  status: checkStatusSchema,
  command: z.string(),
  detail: z.string(),
  fixHint: z.string().optional(),
  durationMs: z.number().int().nonnegative().optional(),
  testCount: z.number().int().nonnegative().optional()
});
var evidenceResultSchema = z.object({
  checks: z.array(evidenceCheckResultSchema),
  changedFiles: z.array(z.string()),
  lintWarningsTotal: z.number().int().nonnegative(),
  todoCount: z.number().int().nonnegative(),
  gitDirtyFiles: z.number().int().nonnegative()
});
var skillSchema = z.object({
  name: z.string().min(1),
  language: z.string().min(1),
  command: z.string().min(1),
  successExitCode: z.number().int(),
  envRequired: z.array(z.string()),
  detailOnPass: z.string(),
  detailOnFailTemplate: z.string(),
  fixHintTemplate: z.string()
});
var commitDecisionSchema = z.enum(["pass", "needs_human_review", "fail"]);
var commitGateResultSchema = z.object({
  passed: z.boolean(),
  decision: commitDecisionSchema,
  failures: z.array(z.string()),
  warnings: z.array(z.string()),
  preExistingFailures: z.array(z.string())
});
var evidenceBaselineSchema = z.object({
  capturedAt: z.string().min(1),
  failedCheckNames: z.array(z.string())
});
var evidenceSnapshotSchema = z.object({
  capturedAt: z.string().min(1),
  checks: z.array(evidenceCheckResultSchema),
  lintWarningsTotal: z.number().int().nonnegative(),
  todoCount: z.number().int().nonnegative(),
  gitDirtyFiles: z.number().int().nonnegative()
});
var baselineDiffSchema = z.object({
  checks: z.record(
    z.string(),
    z.object({
      from: z.union([checkStatusSchema, z.literal("missing")]),
      to: z.union([checkStatusSchema, z.literal("missing")]),
      regression: z.boolean()
    })
  ),
  lintWarningsDelta: z.number().int(),
  todoDelta: z.number().int()
});
var taskReportArtifactsSchema = z.object({
  requirement: z.string(),
  contract: z.string(),
  design: z.string(),
  taskBreakdown: z.string(),
  implementationNotes: z.string(),
  review: z.string(),
  residentReview: z.string(),
  testReport: z.string(),
  baselineEvidence: z.string(),
  currentEvidence: z.string(),
  baselineDiff: z.string(),
  commitSummary: z.string()
});
var taskReportMetricsSchema = z.object({
  llmCalls: z.number().int().nonnegative(),
  durationSeconds: z.number().int().nonnegative(),
  retries: z.number().int().nonnegative()
});
var taskReportSchema = z.object({
  taskId: z.string().min(1),
  goal: z.string().min(1),
  finalStage: workflowStageSchema,
  commitDecision: commitDecisionSchema,
  artifacts: taskReportArtifactsSchema,
  metrics: taskReportMetricsSchema,
  createdAt: z.string().min(1),
  finishedAt: z.string().min(1),
  adapter: adapterOutputSchema,
  evidence: evidenceResultSchema,
  commitGate: commitGateResultSchema,
  commitReady: z.boolean(),
  summary: z.string().min(1),
  generatedAt: z.string().min(1)
});
var feedbackEntrySchema = z.object({
  taskId: z.string().min(1),
  goal: z.string().min(1),
  decision: commitDecisionSchema,
  completedAt: z.string().min(1),
  completedStages: z.array(stageMarkerSchema),
  retryCount: z.number().int().nonnegative(),
  template: templateNameSchema.optional(),
  riskLevel: riskLevelSchema.optional(),
  changedFilesCount: z.number().int().nonnegative(),
  failureReason: z.string().optional(),
  failureStage: stageMarkerSchema.optional()
});
var agentRoleSchema = z.enum([
  "requirement",
  "designer",
  "developer",
  "reviewer",
  "tester"
]);
var agentManifestSchema = z.object({
  role: agentRoleSchema,
  displayName: z.string().min(1),
  description: z.string().min(1),
  stage: workflowStageSchema,
  enabled: z.boolean(),
  planModeEnabled: z.boolean(),
  models: z.object({
    "claude-code": z.string().min(1).optional(),
    codex: z.string().min(1).optional(),
    "gemini-cli": z.string().min(1).optional()
  }),
  toolWhitelist: z.array(z.string()),
  prompt: z.string()
});
var templateDraftSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  sourceTaskId: z.string().min(1),
  appliesTo: z.array(z.string()),
  templateName: templateNameSchema,
  riskLevel: riskLevelSchema,
  requiredChecks: z.array(requiredCheckSchema),
  scopeInclude: z.array(z.string()),
  outOfScope: z.array(z.string()),
  acceptanceCriteria: z.array(z.string())
});
function formatSchemaError(error) {
  return error.issues.map((issue) => `${issue.path.length > 0 ? issue.path.join(".") : "root"}: ${issue.message}`).join("; ");
}
function parseWithSchema(schema, payload, label) {
  try {
    return schema.parse(payload);
  } catch (error) {
    if (error instanceof ZodError) {
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
export {
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
};
