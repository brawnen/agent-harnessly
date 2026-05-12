#!/usr/bin/env node

// ../shared/dist/index.js
import { ZodError, z } from "zod";
var SHARED_PACKAGE_NAME = "@brawnen/harnessly-shared";
var HARNESSLY_VERSION = "0.1.0-alpha.0";
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

// ../core/dist/index.js
import { readdir, readFile as readFile2, writeFile as writeFile2 } from "fs/promises";
import path3 from "path";
import { mkdir, readFile, writeFile } from "fs/promises";
import path2 from "path";
import { access } from "fs/promises";
import path from "path";
import { access as access2, copyFile, mkdir as mkdir4, readFile as readFile5, writeFile as writeFile5 } from "fs/promises";
import path6 from "path";
import crypto from "crypto";
import { mkdir as mkdir3, readdir as readdir2, readFile as readFile4, writeFile as writeFile4 } from "fs/promises";
import path5 from "path";
import { appendFile, mkdir as mkdir2, readFile as readFile3, writeFile as writeFile3 } from "fs/promises";
import path4 from "path";
import { access as access3, readFile as readFile6 } from "fs/promises";
import path7 from "path";
import { exec as exec3 } from "child_process";
import { promisify as promisify3 } from "util";
import { access as access4, mkdir as mkdir5, readFile as readFile7 } from "fs/promises";
import { exec } from "child_process";
import { promisify } from "util";
import path8 from "path";
import { access as access5, readFile as readFile8 } from "fs/promises";
import { exec as exec2 } from "child_process";
import { promisify as promisify2 } from "util";
import path9 from "path";
import { mkdir as mkdir6, readFile as readFile9, writeFile as writeFile6 } from "fs/promises";
import path10 from "path";
import { exec as exec4 } from "child_process";
import { promisify as promisify4 } from "util";
import Anthropic from "@anthropic-ai/sdk";
import { zodToJsonSchema } from "zod-to-json-schema";
import { z as z2 } from "zod";
import { mkdir as mkdir7, writeFile as writeFile7 } from "fs/promises";
import path11 from "path";
import { exec as exec5 } from "child_process";
import { mkdir as mkdir8, readFile as readFile10, writeFile as writeFile8 } from "fs/promises";
import path12 from "path";
import { promisify as promisify5 } from "util";
import { readFile as readFile11 } from "fs/promises";
import path13 from "path";
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
function serializeHarnessConfig2(config) {
  return serializeHarnessConfig(config);
}
function parseHarnessConfig2(text) {
  return parseHarnessConfig(text);
}
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
  return parseHarnessConfig2(configText);
}
function isMissingFileError(error) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
async function writeHarnessConfig(workDir, config, force = false) {
  const configPath = getHarnessPaths(workDir).configFile;
  let mergedConfig = config;
  let didMerge = false;
  try {
    const existing = await loadHarnessConfig(workDir);
    const mergedHosts = [.../* @__PURE__ */ new Set([...existing.enabledHosts, ...config.enabledHosts])];
    if (mergedHosts.length > existing.enabledHosts.length) {
      mergedConfig = { ...existing, ...config, enabledHosts: mergedHosts };
      didMerge = true;
    } else if (!force) {
      return "skipped";
    }
  } catch (error) {
    if (!isMissingFileError(error)) throw error;
  }
  return writeFileIfChanged(configPath, serializeHarnessConfig2(mergedConfig), force || didMerge);
}
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
function isMissingFileError2(error) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
async function readFileIfExists(filePath) {
  try {
    return await readFile2(filePath, "utf8");
  } catch (error) {
    if (isMissingFileError2(error)) {
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
var FEEDBACK_POOL_FILENAME = "feedback-pool.jsonl";
function getFeedbackPoolPath(workDir) {
  return path4.join(getHarnessPaths(workDir).harnessDir, FEEDBACK_POOL_FILENAME);
}
function getFeedbackHistoryPath(workDir) {
  return path4.join(getHarnessPaths(workDir).harnessDir, "feedback-history.md");
}
function isMissingFileError3(error) {
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
    if (isMissingFileError3(error)) {
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
  await writeFile4(filePath, `${JSON.stringify(payload, null, 2)}
`, "utf8");
}
async function readJson(filePath) {
  const text = await readFile4(filePath, "utf8");
  return JSON.parse(text);
}
function isMissingFileError4(error) {
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
    await writeFile4(this.getActiveTaskFile(workDir), `${taskId}
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
    await writeFile4(this.getContractFile(ctx.taskDir), serializeContract(contract), "utf8");
    await this.saveState(ctx);
  }
  async saveRequirement(ctx, requirement) {
    await writeFile4(this.getRequirementFile(ctx.taskDir), requirement, "utf8");
  }
  async savePlan(ctx, plan) {
    ctx.plan = plan;
    ctx.state = touchState(ctx.state, "active", "design");
    await writeFile4(this.getPlanFile(ctx.taskDir), plan, "utf8");
    await this.saveState(ctx);
  }
  async saveDesign(ctx, design) {
    await writeFile4(this.getDesignFile(ctx.taskDir), design, "utf8");
  }
  async saveTaskBreakdown(ctx, taskBreakdown) {
    await writeFile4(this.getTaskBreakdownFile(ctx.taskDir), taskBreakdown, "utf8");
  }
  async saveImplementationNotes(ctx, notes) {
    await writeFile4(this.getImplementationNotesFile(ctx.taskDir), notes, "utf8");
  }
  async saveReviewMarkdown(ctx, review) {
    await writeFile4(this.getReviewFile(ctx.taskDir), review, "utf8");
  }
  async saveResidentReview(ctx, review) {
    await writeFile4(this.getResidentReviewFile(ctx.taskDir), review, "utf8");
  }
  async saveTestReport(ctx, report) {
    await writeFile4(this.getTestReportFile(ctx.taskDir), report, "utf8");
  }
  async savePrompt(ctx, prompt) {
    const filePath = this.getPromptFile(ctx.taskDir);
    await writeFile4(filePath, prompt, "utf8");
    return filePath;
  }
  async saveReport(ctx, report) {
    ctx.state = touchState(ctx.state, report.commitReady ? "completed" : "blocked", "commit_gate");
    await writeFile4(this.getReportFile(ctx.taskDir), serializeTaskReport(report), "utf8");
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
    await writeFile4(this.getFeedbackFile(ctx.taskDir), feedback, "utf8");
  }
  /**
   * 向 commit-summary.md 追加一个小节。用于声明式晋升等场景记录。
   * best-effort：写入失败不抛。
   */
  async appendCommitSummarySection(ctx, heading, content) {
    const filePath = path5.join(ctx.taskDir, "commit-summary.md");
    try {
      const existing = await readFile4(filePath, "utf8").catch(
        (error) => isMissingFileError4(error) ? "" : Promise.reject(error)
      );
      const section = `${heading}
${content}
`;
      await writeFile4(filePath, `${existing}${existing ? "\n" : ""}${section}
`, "utf8");
    } catch {
    }
  }
  async clearFeedback(ctx) {
    ctx.feedback = void 0;
    try {
      await writeFile4(this.getFeedbackFile(ctx.taskDir), "", "utf8");
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
      if (isMissingFileError4(error)) {
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
      if (isMissingFileError4(error)) {
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
      if (!isMissingFileError4(error)) {
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
      if (isMissingFileError4(error)) {
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
var DEFAULT_TOPIC = "tasks";
var AUTO_START = "<!-- harness:auto-start -->";
var AUTO_END = "<!-- harness:auto-end -->";
function isMissingFileError5(error) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
async function fileExists2(filePath) {
  try {
    await access2(filePath);
    return true;
  } catch (error) {
    if (isMissingFileError5(error)) return false;
    throw error;
  }
}
function pickFilesByKind(kind) {
  return {
    contract: kind === "requirement" || kind === "both",
    plan: kind === "design" || kind === "both"
  };
}
function readTaskReportSafe(filePath) {
  return readFile5(filePath, "utf8").then((text) => parseTaskReport(text)).catch((error) => {
    if (isMissingFileError5(error)) return null;
    return null;
  });
}
function getHarnessMetaPath(topicDir) {
  return path6.join(topicDir, "_harness-meta.json");
}
async function loadHarnessMeta(topicDir) {
  try {
    const text = await readFile5(getHarnessMetaPath(topicDir), "utf8");
    return harnessMetaFileSchema.parse(JSON.parse(text));
  } catch (error) {
    if (isMissingFileError5(error)) return null;
    return null;
  }
}
async function saveHarnessMeta(topicDir, meta) {
  await mkdir4(topicDir, { recursive: true });
  await writeFile5(
    getHarnessMetaPath(topicDir),
    `${JSON.stringify(meta, null, 2)}
`,
    "utf8"
  );
}
function appendToHarnessMeta(existing, topic, entry) {
  if (existing) {
    return {
      ...existing,
      source_tasks: [...existing.source_tasks, entry]
    };
  }
  return {
    topic,
    created_at: (/* @__PURE__ */ new Date()).toISOString(),
    harness_version: "v3-core",
    source_tasks: [entry]
  };
}
function resolveFlatTargetName(sourceFile) {
  const base = path6.basename(sourceFile);
  if (base === "contract.yaml" || base === "requirement.md") return "requirement.md";
  if (base === "plan.md" || base === "design.md") return "design.md";
  return base;
}
async function resolveTargetPath(topicDir, sourceFile, mode, force) {
  const baseName = resolveFlatTargetName(sourceFile);
  const primaryTarget = path6.join(topicDir, baseName);
  if (mode === "new_topic" && !force) {
    if (await fileExists2(primaryTarget)) {
      throw new Error(
        `new_topic \u6A21\u5F0F\uFF1A\u76EE\u6807\u6587\u4EF6 ${baseName} \u5DF2\u5B58\u5728\u4E8E ${topicDir}\uFF0C\u7981\u6B62\u8986\u76D6\u3002\u4F7F\u7528 mode=append \u6216 mode=replace\u3002`
      );
    }
  }
  if (mode === "append") {
    if (await fileExists2(primaryTarget)) {
      const parsed = path6.parse(baseName);
      let v = 2;
      let altTarget;
      do {
        altTarget = path6.join(topicDir, `${parsed.name}-v${v}${parsed.ext}`);
        v += 1;
      } while (await fileExists2(altTarget));
      return altTarget;
    }
  }
  if (mode === "replace" && await fileExists2(primaryTarget)) {
    const archiveDir = path6.join(topicDir, "_archive", (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-"));
    await mkdir4(archiveDir, { recursive: true });
    await copyFile(primaryTarget, path6.join(archiveDir, baseName));
  }
  return primaryTarget;
}
function renderAutoReadme(args) {
  const { topic, meta } = args;
  const files = /* @__PURE__ */ new Set();
  for (const task of meta.source_tasks) {
    for (const file of task.promoted_files) {
      files.add(file);
    }
  }
  const lastPromoted = meta.source_tasks.length > 0 ? meta.source_tasks[meta.source_tasks.length - 1].promoted_at : meta.created_at;
  return [
    `# ${topic}`,
    "",
    `- \u521B\u5EFA\u65E5\u671F\uFF1A${meta.created_at}`,
    `- \u6700\u540E\u664B\u5347\uFF1A${lastPromoted}`,
    `- \u6765\u6E90\u4EFB\u52A1\u6570\uFF1A${meta.source_tasks.length}`,
    "",
    "## \u6587\u4EF6",
    ...[...files].sort().map((file) => `- \`${file}\``),
    "",
    "## \u6765\u6E90\u4EFB\u52A1",
    ...meta.source_tasks.map(
      (task) => `- \`${task.task_id}\` ${task.goal}\uFF08${task.promotion_mode}, ${task.promoted_at}\uFF09`
    ),
    ""
  ].join("\n");
}
async function writeReadme(topicDir, topic, meta) {
  const readmePath = path6.join(topicDir, "README.md");
  const autoContent = renderAutoReadme({ topic, meta });
  let existingBefore = "";
  let existingAfter = "";
  try {
    const existing = await readFile5(readmePath, "utf8");
    const autoStartIndex = existing.indexOf(AUTO_START);
    const autoEndIndex = existing.indexOf(AUTO_END);
    if (autoStartIndex !== -1 && autoEndIndex !== -1) {
      existingBefore = existing.slice(0, autoStartIndex + AUTO_START.length);
      existingAfter = existing.slice(autoEndIndex);
    } else {
      existingBefore = AUTO_START;
      existingAfter = `${AUTO_END}

${existing}`;
    }
  } catch (error) {
    if (!isMissingFileError5(error)) throw error;
    existingBefore = `${AUTO_START}`;
    existingAfter = `
${AUTO_END}`;
  }
  await mkdir4(topicDir, { recursive: true });
  await writeFile5(
    readmePath,
    `${existingBefore}
${autoContent}
${existingAfter}`,
    "utf8"
  );
}
async function promoteTaskArtifacts(workDir, taskId, options) {
  const topic = options.topic.trim() || DEFAULT_TOPIC;
  const mode = options.mode ?? "new_topic";
  const archDir = path6.join(workDir, "docs", "architecture");
  const topicDir = path6.join(archDir, topic);
  const ctx = await new TaskManager().load(taskId, workDir);
  if (mode === "new_topic" && await fileExists2(topicDir)) {
    const existingMeta = await loadHarnessMeta(topicDir);
    if (existingMeta && existingMeta.source_tasks.length > 0) {
      throw new Error(
        `new_topic \u6A21\u5F0F\uFF1Atopic "${topic}" \u5DF2\u5B58\u5728\u4E14\u6709 ${existingMeta.source_tasks.length} \u6761\u6765\u6E90\u4EFB\u52A1\u3002\u4F7F\u7528 --mode=append \u6216 --mode=replace\u3002`
      );
    }
  }
  const files = [];
  const promotedFiles = [];
  for (const sourceFile of options.files) {
    const source = path6.join(ctx.taskDir, sourceFile);
    if (!await fileExists2(source)) {
      throw new Error(`task ${taskId} \u7F3A\u5C11\u6E90\u6587\u4EF6\uFF1A${sourceFile}`);
    }
    const target = await resolveTargetPath(topicDir, sourceFile, mode, false);
    const targetExisted = await fileExists2(target);
    await mkdir4(path6.dirname(target), { recursive: true });
    await copyFile(source, target);
    const resolvedName = path6.basename(target);
    files.push({
      source,
      target,
      status: targetExisted && mode === "replace" ? "updated" : "created",
      versionSuffix: resolvedName !== resolveFlatTargetName(sourceFile) ? resolvedName : void 0
    });
    promotedFiles.push(resolvedName);
  }
  if (!options.skipMeta) {
    const existingMeta = await loadHarnessMeta(topicDir);
    const entry = {
      task_id: taskId,
      goal: ctx.goal,
      promoted_files: [...new Set(promotedFiles)],
      promoted_at: (/* @__PURE__ */ new Date()).toISOString(),
      promotion_mode: mode
    };
    const updatedMeta = appendToHarnessMeta(existingMeta, topic, entry);
    await saveHarnessMeta(topicDir, updatedMeta);
    await writeReadme(topicDir, topic, updatedMeta);
  }
  return {
    taskId,
    topic,
    targetDir: topicDir,
    files
  };
}
async function listDirs(dirPath) {
  const { readdir: readdir3 } = await import("fs/promises");
  try {
    const entries = await readdir3(dirPath, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch (error) {
    if (isMissingFileError5(error)) return [];
    throw error;
  }
}
async function listArchiveTopics(workDir) {
  const archDir = path6.join(workDir, "docs", "architecture");
  const topicNames = await listDirs(archDir);
  const summaries = [];
  for (const topic of topicNames) {
    const topicDir = path6.join(archDir, topic);
    const meta = await loadHarnessMeta(topicDir);
    if (!meta) continue;
    const allFiles = /* @__PURE__ */ new Set();
    for (const task of meta.source_tasks) {
      for (const file of task.promoted_files) {
        allFiles.add(file);
      }
    }
    const lastTask = meta.source_tasks[meta.source_tasks.length - 1];
    summaries.push({
      topic,
      fileCount: allFiles.size,
      sourceTaskCount: meta.source_tasks.length,
      lastPromotedAt: lastTask?.promoted_at ?? meta.created_at
    });
  }
  summaries.sort((a, b) => a.topic.localeCompare(b.topic));
  return summaries;
}
async function showArchiveTopic(workDir, topic) {
  const topicDir = path6.join(workDir, "docs", "architecture", topic);
  const meta = await loadHarnessMeta(topicDir);
  if (!meta) return null;
  let readme = "";
  try {
    readme = await readFile5(path6.join(topicDir, "README.md"), "utf8");
  } catch (error) {
    if (!isMissingFileError5(error)) throw error;
  }
  const allFiles = /* @__PURE__ */ new Set();
  for (const task of meta.source_tasks) {
    for (const file of task.promoted_files) {
      allFiles.add(file);
    }
  }
  return {
    topic,
    readme,
    files: [...allFiles].sort(),
    sourceTasks: meta.source_tasks
  };
}
async function verifyArchive(workDir) {
  const archDir = path6.join(workDir, "docs", "architecture");
  const topicNames = await listDirs(archDir);
  const results = [];
  const manager = new TaskManager();
  for (const topic of topicNames) {
    const topicDir = path6.join(archDir, topic);
    const meta = await loadHarnessMeta(topicDir);
    if (!meta) continue;
    const orphanTasks = [];
    for (const task of meta.source_tasks) {
      try {
        await manager.load(task.task_id, workDir);
      } catch {
        orphanTasks.push(task.task_id);
      }
    }
    results.push({
      topic,
      orphanTasks,
      valid: orphanTasks.length === 0
    });
  }
  return results;
}
function getArchiveTargetPaths(workDir, _taskId, topic = DEFAULT_TOPIC) {
  const archDir = path6.join(workDir, "docs", "architecture");
  const topicDir = path6.join(archDir, topic);
  return { archDir, topicDir };
}
async function copyIfMissingOrForced(source, target, force) {
  const exists2 = await fileExists2(target);
  if (!exists2) {
    await mkdir4(path6.dirname(target), { recursive: true });
    await copyFile(source, target);
    return "created";
  }
  if (!force) return "skipped";
  await copyFile(source, target);
  return "updated";
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
      throw new Error(`task ${taskId} \u7F3A\u5C11 contract.yaml`);
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
      throw new Error(`task ${taskId} \u7F3A\u5C11 plan.md`);
    }
    const primarySource = await fileExists2(designSource) ? designSource : source;
    const target = path6.join(targets.topicDir, `${taskId}.design.md`);
    const status = await copyIfMissingOrForced(primarySource, target, force || mode === "replace");
    files.push({ source: primarySource, target, status });
  }
  const reportFile = path6.join(ctx.taskDir, "report.json");
  const report = await readTaskReportSafe(reportFile);
  const previousReadme = await readFile5(path6.join(targets.topicDir, "README.md"), "utf8").catch(
    (error) => isMissingFileError5(error) ? null : Promise.reject(error)
  );
  await writeFile5(path6.join(targets.topicDir, "README.md"), [
    `# Task Archive: ${ctx.goal}`,
    "",
    "## Metadata",
    `- task_id: ${taskId}`,
    `- topic: ${topic}`,
    `- archived_at: ${(/* @__PURE__ */ new Date()).toISOString()}`,
    `- archived_kind: ${kind}`,
    `- completed_stages: ${ctx.state.completedStages.join(", ") || "(none)"}`,
    `- retry_count: ${ctx.state.retryCount}`,
    report ? `- decision: ${report.commitGate.decision}` : "- decision: (no report)",
    "",
    "## Files",
    want.contract ? "- `contract.yaml`" : null,
    want.plan ? "- `plan.md`" : null,
    "",
    "## Source",
    `Snapshot of \`.harness/tasks/${taskId}/\` at \`${(/* @__PURE__ */ new Date()).toISOString()}\`.`,
    ""
  ].filter(Boolean).join("\n"), "utf8");
  files.push({
    source: "(generated)",
    target: path6.join(targets.topicDir, "README.md"),
    status: previousReadme === null ? "created" : "updated"
  });
  const metadataPath = path6.join(targets.topicDir, `${taskId}.promotion.json`);
  const previousMetadata = await readFile5(metadataPath, "utf8").catch(
    (error) => isMissingFileError5(error) ? null : Promise.reject(error)
  );
  await writeFile5(
    metadataPath,
    `${JSON.stringify({ taskId, topic, mode, kind, promotedAt: (/* @__PURE__ */ new Date()).toISOString(), sourceDir: `.harness/tasks/${taskId}`, files: files.map((f) => path6.relative(workDir, f.target)) }, null, 2)}
`,
    "utf8"
  );
  files.push({
    source: "(generated)",
    target: metadataPath,
    status: previousMetadata === null ? "created" : "updated"
  });
  return { taskId, topic, targetDir: targets.topicDir, files };
}
async function exists(filePath) {
  try {
    await access3(filePath);
    return true;
  } catch {
    return false;
  }
}
function isMissingFileError6(error) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
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
var ARTIFACT_OWNERSHIP = {
  "requirement.md": "spec",
  "contract.yaml": "spec",
  "design.md": "design",
  "task-breakdown.md": "design",
  "plan.md": "design",
  "implementation-notes.md": "execute",
  "review.md": "review",
  "resident-review.md": "review",
  "test-report.md": "test",
  "evidence/baseline.json": "test",
  "evidence/current.json": "test",
  "evidence/baseline-diff.json": "test",
  "commit-summary.md": "commit_gate",
  "report.json": "commit_gate"
};
var SYSTEM_PATHS = ["docs/architecture/"];
async function checkWritePermission(workDir, filePath, activeTaskId) {
  const relative = filePath.startsWith(workDir) ? filePath.slice(workDir.length).replace(/^\//, "") : filePath;
  for (const sysPath of SYSTEM_PATHS) {
    if (relative.startsWith(sysPath)) {
      return {
        allowed: false,
        reason: `\u8DEF\u5F84 ${sysPath} \u4EC5 harnessly \u7CFB\u7EDF\u547D\u4EE4\u53EF\u5199\uFF08harness archive promote\uFF09\uFF0Csub-agent \u7981\u6B62\u76F4\u63A5\u5199\u5165`,
        file: relative
      };
    }
  }
  const taskMatch = relative.match(/^\.harness\/tasks\/([^/]+)\/(.+)$/);
  if (!taskMatch) {
    return { allowed: true, reason: "\u975E\u4EFB\u52A1\u5DE5\u4EF6\u8DEF\u5F84\uFF0C\u653E\u884C", file: relative };
  }
  const [, taskId, artifactName] = taskMatch;
  const resolvedActiveTaskId = activeTaskId ?? await readActiveTaskId(workDir);
  const requiredStage = ARTIFACT_OWNERSHIP[artifactName];
  if (!requiredStage) {
    return { allowed: true, reason: `\u5DE5\u4EF6 ${artifactName} \u4E0D\u5728\u6240\u6709\u6743\u6620\u5C04\u4E2D\uFF0C\u653E\u884C`, file: relative };
  }
  const stateFile = path7.join(workDir, ".harness", "tasks", taskId, "state.json");
  let currentStage;
  try {
    const stateText = await readFile6(stateFile, "utf8");
    const state = JSON.parse(stateText);
    currentStage = state.currentStage;
  } catch (error) {
    if (!isMissingFileError6(error)) throw error;
    return { allowed: true, reason: "state.json \u4E0D\u5B58\u5728\uFF0C\u653E\u884C", file: relative };
  }
  if (!currentStage || resolvedActiveTaskId !== taskId) {
    return { allowed: true, reason: "\u4EFB\u52A1\u672A\u6307\u5B9A currentStage \u6216\u4E0D\u662F\u5F53\u524D active task", file: relative };
  }
  if (currentStage === requiredStage) {
    return { allowed: true, reason: `\u5F53\u524D\u9636\u6BB5 ${currentStage} \u5339\u914D\u5DE5\u4EF6 ${artifactName}`, file: relative, currentStage, requiredStage };
  }
  return {
    allowed: false,
    reason: `\u5F53\u524D\u9636\u6BB5 ${currentStage} \u65E0\u6743\u5199\u5165 ${artifactName}\uFF08\u6240\u5C5E\u9636\u6BB5\uFF1A${requiredStage}\uFF09\u3002SPEC \xA710 \u7EAA\u5F8B 1\uFF1A\u4E0B\u6E38\u4E0D\u5F97\u4FEE\u6539\u4E0A\u6E38\u5DE5\u4EF6`,
    file: relative,
    currentStage,
    requiredStage
  };
}
async function readActiveTaskId(workDir) {
  try {
    const text = await readFile6(path7.join(workDir, ".harness", "active-task.txt"), "utf8");
    return text.trim() || void 0;
  } catch (error) {
    if (isMissingFileError6(error)) return void 0;
    throw error;
  }
}
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
function matchTemplate(goal) {
  return createTemplateRegistry().match(goal).name;
}
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
var execAsync = promisify(exec);
function isMissingFileError7(error) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
async function fileExists3(filePath) {
  try {
    await access4(filePath);
    return true;
  } catch (error) {
    if (isMissingFileError7(error)) return false;
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
  const raw = parseFlatYaml(await readFile7(filePath, "utf8"));
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
var execAsync2 = promisify2(exec2);
async function fileExists4(filePath) {
  try {
    await access5(filePath);
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
  const content = await readFile8(filePath, "utf8");
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
function isMissingFileError8(error) {
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
  await writeFile6(filePath, `${JSON.stringify(validated, null, 2)}
`, "utf8");
}
async function saveBaselineDiff(taskDir, diff) {
  const validated = baselineDiffSchema.parse(diff);
  const filePath = getTaskEvidencePath(taskDir, "baseline-diff");
  await mkdir6(path10.dirname(filePath), { recursive: true });
  await writeFile6(filePath, `${JSON.stringify(validated, null, 2)}
`, "utf8");
}
async function loadEvidenceBaseline(workDir) {
  const filePath = getEvidenceBaselinePath(workDir);
  let text;
  try {
    text = await readFile9(filePath, "utf8");
  } catch (error) {
    if (isMissingFileError8(error)) return null;
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
  await writeFile6(filePath, `${JSON.stringify(validated, null, 2)}
`, "utf8");
}
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
var DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-20250514";
function extractTextContent(content) {
  return content.filter((block) => block.type === "text").map((block) => block.text).join("\n").trim();
}
function toErrorMessage(error) {
  if (error instanceof z2.ZodError) {
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
  await writeFile7(filePath, serializeTemplateDraft(template), "utf8");
  return filePath;
}
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
var execAsync5 = promisify5(exec5);
function isMissingFileError9(error) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
async function loadReviewAgentsConfig(workDir) {
  try {
    const text = await readFile10(getHarnessPaths(workDir).reviewAgentsFile, "utf8");
    const agents = [];
    let current = null;
    for (const line of text.split(/\r?\n/)) {
      const nameMatch = line.match(/^\s*- name:\s*(.+)$/);
      if (nameMatch) {
        if (current?.name) agents.push(current);
        current = { name: nameMatch[1].trim(), triggers: ["pre_merge"], model: "gpt-5.5", prompt: "", blocking_severity: "P1" };
        continue;
      }
      if (!current) continue;
      const triggersMatch = line.match(/^\s*triggers:\s*\[(.+)\]$/);
      if (triggersMatch) {
        current.triggers = triggersMatch[1].split(",").map((t) => t.trim().replace(/[\[\]'"]/g, ""));
      }
      const modelMatch = line.match(/^\s*model:\s*(.+)$/);
      if (modelMatch) current.model = modelMatch[1].trim();
      const sevMatch = line.match(/^\s*blocking_severity:\s*(P[012])$/);
      if (sevMatch) current.blocking_severity = sevMatch[1];
      const promptMatch = line.match(/^\s*prompt:\s*\|?\s*(.+)$/);
      if (promptMatch) {
        current.prompt = (current.prompt || "") + promptMatch[1].trim();
      }
    }
    if (current?.name) agents.push(current);
    return { review_agents: agents };
  } catch (error) {
    if (isMissingFileError9(error)) return null;
    throw error;
  }
}
async function getChangedFiles(workDir) {
  try {
    const { stdout } = await execAsync5("git diff --name-only HEAD", { cwd: workDir, env: process.env, shell: "/bin/zsh" });
    return stdout.trim().split(/\r?\n/).filter(Boolean);
  } catch {
    return [];
  }
}
async function runResidentReview(workDir, trigger, activeTaskId) {
  const config = await loadReviewAgentsConfig(workDir);
  const findings = [];
  const agentsSpawned = [];
  if (!config || config.review_agents.length === 0) {
    return { trigger, findings, hadBlockingFinding: false, agentsSpawned };
  }
  const matchingAgents = config.review_agents.filter(
    (agent) => agent.triggers.includes(trigger)
  );
  if (matchingAgents.length === 0) {
    return { trigger, findings, hadBlockingFinding: false, agentsSpawned };
  }
  const changedFiles = await getChangedFiles(workDir);
  const diffContext = changedFiles.length > 0 ? `\u53D8\u66F4\u6587\u4EF6\uFF1A${changedFiles.join(", ")}` : "\u65E0\u53D8\u66F4\u6587\u4EF6\uFF08\u5168\u91CF\u5BA1\u67E5\uFF09";
  for (const agent of matchingAgents) {
    agentsSpawned.push(agent.name);
    try {
      const fullPrompt = `${agent.prompt}

\u4E0A\u4E0B\u6587\uFF1A${diffContext}
\u5DE5\u4F5C\u76EE\u5F55\uFF1A${workDir}`;
      const { exec: execCmd } = await import("child_process");
      const { promisify: p } = await import("util");
      const e = p(execCmd);
      const harnessBin = `node "${path12.join(workDir, "packages", "cli", "dist", "index.js")}"`;
      try {
        await e(`${harnessBin} eval --review`, {
          cwd: workDir,
          env: { ...process.env, HARNESS_REVIEW_PROMPT: fullPrompt, HARNESS_REVIEW_TRIGGER: trigger },
          shell: "/bin/zsh",
          timeout: 12e4
        });
      } catch {
      }
    } catch {
    }
  }
  const taskDir = await resolveResidentReviewDir(workDir, activeTaskId);
  await mkdir8(taskDir, { recursive: true });
  const reviewMarkdown = renderResidentReviewFromFindings(findings, trigger, agentsSpawned);
  await writeFile8(path12.join(taskDir, "resident-review.md"), reviewMarkdown, "utf8");
  const hadBlockingFinding = findings.some((finding) => {
    const agent = config.review_agents.find((a) => a.name === finding.agent_name);
    const blockingSev = agent?.blocking_severity ?? "P1";
    return severityRank(finding.severity) <= severityRank(blockingSev);
  });
  return { trigger, findings, hadBlockingFinding, agentsSpawned };
}
async function resolveResidentReviewDir(workDir, activeTaskId) {
  const manager = new TaskManager();
  const taskId = activeTaskId ?? await readActiveTaskId2(workDir) ?? await manager.getLatestTaskId(workDir);
  if (taskId) {
    return path12.join(workDir, ".harness", "tasks", taskId);
  }
  return getHarnessPaths(workDir).harnessDir;
}
async function readActiveTaskId2(workDir) {
  try {
    const text = await readFile10(getHarnessPaths(workDir).activeTaskFile, "utf8");
    return text.trim() || void 0;
  } catch (error) {
    if (isMissingFileError9(error)) return void 0;
    throw error;
  }
}
function severityRank(severity) {
  return severity === "P0" ? 0 : severity === "P1" ? 1 : 2;
}
function renderResidentReviewFromFindings(findings, trigger, agentsSpawned) {
  const failed = findings.filter((f) => f.severity === "P0" || f.severity === "P1");
  return [
    "# Resident Review",
    "",
    "## Config",
    `- trigger: ${trigger}`,
    `- agents: ${agentsSpawned.join(", ") || "(none)"}`,
    "",
    "## Decision",
    failed.length > 0 ? "fail" : "pass",
    "",
    "## Findings",
    failed.length === 0 ? "- none" : failed.map((f) => `- [${f.severity}] ${f.agent_name}: ${f.description}`).join("\n"),
    ""
  ].join("\n");
}
async function renderResidentReview(workDir, findings) {
  const configText = await readFile10(getHarnessPaths(workDir).reviewAgentsFile, "utf8").catch(
    (error) => isMissingFileError9(error) ? null : Promise.reject(error)
  );
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
function isMissingFileError10(error) {
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
  const rulesPath = path13.join(getHarnessPaths(workDir).harnessDir, "structure-rules.yaml");
  let text;
  try {
    text = await readFile11(rulesPath, "utf8");
  } catch (error) {
    if (isMissingFileError10(error)) {
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
        const content = await readFile11(path13.join(workDir, file), "utf8");
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
      if (ctx.contract?.assetPromotion?.promote && ctx.contract.assetPromotion.topic) {
        const ap = ctx.contract.assetPromotion;
        const topic = ap.topic;
        try {
          await promoteTaskArtifacts(ctx.workDir, ctx.taskId, {
            topic,
            files: ap.files,
            mode: ap.mode
          });
          await this.manager.appendCommitSummarySection(
            ctx,
            "## Promoted Assets",
            [
              `- topic: ${topic}`,
              `- files: ${ap.files.join(", ")}`,
              `- mode: ${ap.mode}`,
              `- promoted_at: ${(/* @__PURE__ */ new Date()).toISOString()}`
            ].join("\n")
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          await this.manager.appendCommitSummarySection(ctx, "## Promoted Assets", `- \u664B\u5347\u5931\u8D25\uFF1A${message}`);
        }
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
var CORE_PACKAGE_NAME = "@brawnen/harnessly-core";
function getCorePackageInfo() {
  return {
    name: CORE_PACKAGE_NAME,
    version: "0.1.0-alpha.0",
    dependsOn: [packageInfo.name]
  };
}

// src/commands/archive.ts
import path15 from "path";

// src/utils/events.ts
import { appendFile as appendFile2, mkdir as mkdir9 } from "fs/promises";
import path14 from "path";
async function appendHarnessEvent(workDir, event) {
  const harnessDir = getHarnessPaths(workDir).harnessDir;
  await mkdir9(harnessDir, { recursive: true });
  await appendFile2(
    path14.join(harnessDir, "events.jsonl"),
    `${JSON.stringify({
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      ...event
    })}
`,
    "utf8"
  );
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

// src/commands/archive.ts
var VALID_KINDS = ["requirement", "design", "both"];
var VALID_MODES = ["new_topic", "append", "replace"];
function isArchiveKind(value) {
  return VALID_KINDS.includes(value);
}
function readStringFlag(flags, name) {
  return typeof flags[name] === "string" ? flags[name].trim() : "";
}
function parseFiles(value) {
  return value.split(",").map((f) => f.trim()).filter(Boolean);
}
async function runArchive(flags, positionals) {
  const workDir = process.cwd();
  const [subcommand, ...rest] = positionals;
  if (subcommand === "promote") {
    await handlePromote(workDir, flags, rest);
    return;
  }
  if (subcommand === "list") {
    const topics = await listArchiveTopics(workDir);
    if (flags.json) {
      printJson(topics);
    } else if (topics.length === 0) {
      printLines(["\u6CA1\u6709\u5DF2\u664B\u5347\u7684\u67B6\u6784\u8D44\u4EA7\u3002\u4F7F\u7528 harness archive promote \u521B\u5EFA\u3002"]);
    } else {
      printLines([
        `\u5171 ${topics.length} \u4E2A topic\uFF1A`,
        ...topics.map(
          (t) => `- ${t.topic} (${t.fileCount} \u6587\u4EF6, ${t.sourceTaskCount} \u6765\u6E90\u4EFB\u52A1, \u6700\u540E\u664B\u5347: ${t.lastPromotedAt})`
        )
      ]);
    }
    return;
  }
  if (subcommand === "show") {
    const topic2 = rest[0]?.trim();
    if (!topic2) throw new Error("\u7F3A\u5C11 topic \u53C2\u6570\u3002\u7528\u6CD5\uFF1Aharness archive show <topic>");
    const detail = await showArchiveTopic(workDir, topic2);
    if (!detail) throw new Error(`topic "${topic2}" \u4E0D\u5B58\u5728`);
    if (flags.json) {
      printJson(detail);
    } else {
      printLines([
        `topic: ${detail.topic}`,
        `\u6587\u4EF6: ${detail.files.join(", ") || "(\u65E0)"}`,
        `\u6765\u6E90\u4EFB\u52A1\u6570: ${detail.sourceTasks.length}`,
        ...detail.sourceTasks.map((t) => `  - ${t.task_id} ${t.goal} (${t.promotion_mode})`)
      ]);
    }
    return;
  }
  if (subcommand === "verify") {
    const results = await verifyArchive(workDir);
    const orphans = results.filter((r) => !r.valid);
    if (flags.json) {
      printJson(results);
    } else if (orphans.length === 0) {
      printLines(["\u6240\u6709 topic \u6765\u6E90\u5B8C\u6574\uFF0C\u65E0\u5B64\u513F\u5F15\u7528\u3002"]);
    } else {
      printLines([
        `\u53D1\u73B0 ${orphans.length} \u4E2A topic \u6709\u5B64\u513F\u5F15\u7528\uFF1A`,
        ...orphans.map((o) => `  - ${o.topic}: ${o.orphanTasks.join(", ")}`)
      ]);
    }
    return;
  }
  const rawKind = subcommand ?? "";
  if (!rawKind) {
    throw new Error(
      "\u7528\u6CD5\uFF1Aharness archive promote|list|show|verify\n\u517C\u5BB9\u65E7\u8BED\u6CD5\uFF1Aharness archive requirement|design|both <task-id> [--topic] [--force]"
    );
  }
  if (rawKind === "promote" || rawKind === "list" || rawKind === "show" || rawKind === "verify") {
    printLines(["\u5185\u90E8\u9519\u8BEF\uFF1A\u672A\u9884\u671F\u7684\u5B50\u547D\u4EE4\u8DEF\u7531"]);
    return;
  }
  if (!isArchiveKind(rawKind)) {
    throw new Error(
      `\u975E\u6CD5\u7684\u5B50\u547D\u4EE4: "${rawKind}"\u3002\u7528\u6CD5\uFF1Aharness archive promote|list|show|verify
\u517C\u5BB9\u65E7\u8BED\u6CD5\uFF1Aharness archive requirement|design|both <task-id> [--topic] [--force]`
    );
  }
  const rawTaskId = rest[0]?.trim();
  const manager = new TaskManager();
  const requestedTaskId = readStringFlag(flags, "task-id") || rawTaskId || "";
  const useLatest = flags.latest === true;
  let taskId = requestedTaskId;
  if (!taskId) {
    if (!useLatest) throw new Error("\u7F3A\u5C11 task-id");
    const latest = await manager.getLatestTaskId(workDir);
    if (!latest) throw new Error("\u6CA1\u6709\u4EFB\u4F55 task");
    taskId = latest;
  }
  const topic = readStringFlag(flags, "topic") || void 0;
  const force = flags.force === true;
  const result = await archiveTaskArtifacts(workDir, taskId, rawKind, { topic, force });
  await appendHarnessEvent(workDir, {
    type: "archive.task_promoted",
    taskId: result.taskId,
    topic: result.topic,
    kind: rawKind,
    force,
    files: result.files.map((f) => ({
      target: path15.relative(workDir, f.target),
      status: f.status
    }))
  });
  if (flags.json) {
    printJson({
      taskId: result.taskId,
      topic: result.topic,
      targetDir: path15.relative(workDir, result.targetDir),
      files: result.files.map((f) => ({
        source: f.source.startsWith(workDir) ? path15.relative(workDir, f.source) : f.source,
        target: path15.relative(workDir, f.target),
        status: f.status
      }))
    });
    return;
  }
  printLines([
    `\u5F52\u6863\u5B8C\u6210\uFF1A${result.taskId} \u2192 ${path15.relative(workDir, result.targetDir)}`,
    `- topic: ${result.topic}`,
    ...result.files.map((f) => `- ${path15.relative(workDir, f.target)} [${f.status}]`)
  ]);
}
async function handlePromote(workDir, flags, positionals) {
  const rawTaskId = positionals[0]?.trim();
  const taskId = readStringFlag(flags, "task-id") || rawTaskId;
  if (!taskId) throw new Error("\u7F3A\u5C11 task-id\u3002\u7528\u6CD5\uFF1Aharness archive promote <task-id> --topic=<slug> --files=requirement.md,design.md");
  const topic = readStringFlag(flags, "topic");
  if (!topic) throw new Error("\u7F3A\u5C11 --topic\u3002\u7528\u6CD5\uFF1Aharness archive promote <task-id> --topic=<slug>");
  const filesStr = readStringFlag(flags, "files");
  if (!filesStr) throw new Error("\u7F3A\u5C11 --files\u3002\u7528\u6CD5\uFF1Aharness archive promote <task-id> --files=requirement.md,design.md");
  const files = parseFiles(filesStr);
  if (files.length === 0) throw new Error("--files \u4E0D\u80FD\u4E3A\u7A7A");
  const modeStr = readStringFlag(flags, "mode") || "new_topic";
  if (!VALID_MODES.includes(modeStr)) {
    throw new Error(`\u975E\u6CD5\u7684 mode: "${modeStr}"\u3002\u5141\u8BB8\u503C\uFF1A${VALID_MODES.join(", ")}`);
  }
  const mode = modeStr;
  const result = await promoteTaskArtifacts(workDir, taskId, { topic, files, mode });
  await appendHarnessEvent(workDir, {
    type: "archive.promoted",
    taskId: result.taskId,
    topic: result.topic,
    mode,
    files: result.files.map((f) => ({
      source: path15.relative(workDir, f.source),
      target: path15.relative(workDir, f.target),
      status: f.status
    }))
  });
  if (flags.json) {
    printJson({
      taskId: result.taskId,
      topic: result.topic,
      mode,
      targetDir: path15.relative(workDir, result.targetDir),
      files: result.files.map((f) => ({
        source: path15.relative(workDir, f.source),
        target: path15.relative(workDir, f.target),
        status: f.status
      }))
    });
    return;
  }
  printLines([
    `\u664B\u5347\u5B8C\u6210\uFF1A${result.taskId} \u2192 ${path15.relative(workDir, result.targetDir)}`,
    `- topic: ${result.topic}`,
    `- mode: ${mode}`,
    ...result.files.map((f) => `- ${path15.relative(workDir, f.target)} [${f.status}]`)
  ]);
}

// src/commands/evidence-baseline.ts
import { unlink } from "fs/promises";
async function runEvidenceBaseline(flags) {
  const workDir = process.cwd();
  const asJson = flags.json === true;
  if (flags.show === true) {
    const baseline2 = await loadEvidenceBaseline(workDir);
    if (!baseline2) {
      if (asJson) {
        printJson({ baseline: null });
        return;
      }
      printLines([
        "\u5F53\u524D\u6CA1\u6709 evidence baseline",
        `- \u8DEF\u5F84: ${getEvidenceBaselinePath(workDir)}`,
        "- \u8FD0\u884C `harnessly evidence baseline` \u5EFA\u7ACB\u57FA\u7EBF\uFF08\u9996\u6B21\u63A5\u5165\u63A8\u8350\uFF09"
      ]);
      return;
    }
    if (asJson) {
      printJson({ baseline: baseline2 });
      return;
    }
    printLines([
      "Evidence baseline",
      `- captured_at: ${baseline2.capturedAt}`,
      `- failed_check_names: ${baseline2.failedCheckNames.length > 0 ? baseline2.failedCheckNames.join(", ") : "(none)"}`
    ]);
    return;
  }
  if (flags.clear === true) {
    try {
      await unlink(getEvidenceBaselinePath(workDir));
    } catch (error) {
      if (typeof error === "object" && error !== null && "code" in error && error.code !== "ENOENT") {
        throw error;
      }
    }
    await appendHarnessEvent(workDir, { type: "evidence.baseline_cleared" });
    if (asJson) {
      printJson({ cleared: true });
      return;
    }
    printLines(["evidence baseline \u5DF2\u6E05\u9664\uFF08gate \u5C06\u9000\u56DE\u5230\u4E0D\u5E26 baseline \u7684\u884C\u4E3A\uFF09"]);
    return;
  }
  const config = await loadHarnessConfig(workDir);
  const evidence = await collectEvidence(workDir, config);
  const baseline = buildEvidenceBaseline(evidence);
  await saveEvidenceBaseline(workDir, baseline);
  await appendHarnessEvent(workDir, {
    type: "evidence.baseline_captured",
    capturedAt: baseline.capturedAt,
    failedCount: baseline.failedCheckNames.length
  });
  if (asJson) {
    printJson({ baseline });
    return;
  }
  printLines([
    "evidence baseline \u5DF2\u5EFA\u7ACB",
    `- captured_at: ${baseline.capturedAt}`,
    `- failed_check_names: ${baseline.failedCheckNames.length > 0 ? baseline.failedCheckNames.join(", ") : "(none)"}`,
    "- \u540E\u7EED\u4EFB\u52A1\u7684 commit gate \u4F1A\u5FFD\u7565 baseline \u4E2D\u5DF2\u7ECF\u5931\u8D25\u7684 check"
  ]);
}

// src/commands/feedback.ts
async function runFeedback(args) {
  const workDir = process.cwd();
  const subcommand = args[0] ?? "list";
  if (subcommand === "list") {
    const entries = await loadFeedbackPool(workDir);
    printLines(
      entries.map(
        (entry) => `${entry.taskId}	${entry.decision}	retry=${entry.retryCount}	${entry.goal}`
      )
    );
    return;
  }
  if (subcommand === "promote") {
    const taskId = args[1];
    if (!taskId) {
      throw new Error("\u7F3A\u5C11 task-id\u3002\u7528\u6CD5\uFF1Aharnessly feedback promote <task-id> [reason]");
    }
    const reason = args.slice(2).join(" ").trim() || "manual promotion";
    const entry = await promoteFeedbackEntry(workDir, taskId, reason);
    printLines([`feedback promoted: ${entry.taskId}`]);
    return;
  }
  throw new Error(`\u672A\u77E5 feedback \u5B50\u547D\u4EE4\uFF1A${subcommand}`);
}

// src/commands/init.ts
import { writeFile as writeFile10 } from "fs/promises";

// src/utils/git-hooks.ts
import { chmod, mkdir as mkdir10, readFile as readFile12 } from "fs/promises";
import path16 from "path";
async function installGitHooks(workDir, hosts) {
  const installed = [];
  const hooksDir = path16.join(workDir, ".git", "hooks");
  await mkdir10(hooksDir, { recursive: true });
  const harnessBin = 'node "$(git rev-parse --show-toplevel)/packages/cli/dist/index.js"';
  const prePushPath = path16.join(hooksDir, "pre-push");
  const prePushScript = [
    "#!/bin/bash",
    "# Managed by Harnessly \u2014 v3-core \xA714 \u5E38\u9A7B review agent pre_push \u89E6\u53D1",
    "set -e",
    "",
    `echo "[harnessly] pre-push: running resident review..."`,
    `${harnessBin} host resident-review --trigger pre_push`,
    "REVIEW_EXIT=$?",
    "",
    "if [ $REVIEW_EXIT -ne 0 ]; then",
    '  echo "[harnessly] resident review \u53D1\u73B0\u963B\u65AD\u7EA7 finding\uFF0Cpush \u5DF2\u62E6\u622A"',
    "  exit 1",
    "fi",
    "",
    'echo "[harnessly] resident review \u901A\u8FC7"',
    "exit 0",
    ""
  ].join("\n");
  await copyFileOrWrite(prePushPath, prePushScript);
  await chmod(prePushPath, 493);
  installed.push(".git/hooks/pre-push");
  const preMergePath = path16.join(hooksDir, "pre-merge-commit");
  const preMergeScript = [
    "#!/bin/bash",
    "# Managed by Harnessly \u2014 v3-core \xA714 \u5E38\u9A7B review agent pre_merge \u89E6\u53D1",
    "set -e",
    "",
    `echo "[harnessly] pre-merge: running resident review..."`,
    `${harnessBin} host resident-review --trigger pre_merge`,
    "REVIEW_EXIT=$?",
    "",
    "if [ $REVIEW_EXIT -ne 0 ]; then",
    '  echo "[harnessly] resident review \u53D1\u73B0\u963B\u65AD\u7EA7 finding\uFF0Cmerge \u5DF2\u62E6\u622A"',
    "  exit 1",
    "fi",
    "",
    'echo "[harnessly] resident review \u901A\u8FC7"',
    "exit 0",
    ""
  ].join("\n");
  await copyFileOrWrite(preMergePath, preMergeScript);
  await chmod(preMergePath, 493);
  installed.push(".git/hooks/pre-merge-commit");
  return installed;
}
async function copyFileOrWrite(filePath, content) {
  await mkdir10(path16.dirname(filePath), { recursive: true });
  const existing = await readFile12(filePath, "utf8").catch(() => null);
  if (existing && !existing.includes("Managed by Harnessly")) {
    throw new Error(`${filePath} \u5DF2\u5B58\u5728\u4E14\u4E0D\u662F Harnessly \u7BA1\u7406\u7684 hook\uFF0C\u62D2\u7EDD\u8986\u76D6`);
  }
  const { writeFile: writeFile13 } = await import("fs/promises");
  await writeFile13(filePath, content, "utf8");
}

// src/utils/hosts.ts
import { mkdir as mkdir11, readFile as readFile13, writeFile as writeFile9 } from "fs/promises";
import path17 from "path";

// ../hosts/shared/dist/index.js
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

// ../hosts/claude-code/dist/index.js
function renderClaudeCodeHookIo(manifest) {
  return [
    "const fs = require('node:fs');",
    "const { spawnSync } = require('node:child_process');",
    "",
    "function readHookPayload() {",
    "  const raw = fs.readFileSync(0, 'utf8').trim();",
    "  if (!raw) {",
    "    return {};",
    "  }",
    "  try {",
    "    return JSON.parse(raw);",
    "  } catch {",
    "    throw new Error('hook stdin \u4E0D\u662F\u5408\u6CD5 JSON');",
    "  }",
    "}",
    "",
    "function resolvePayloadCwd(payload) {",
    "  return typeof payload?.cwd === 'string' && payload.cwd.trim() ? payload.cwd.trim() : process.cwd();",
    "}",
    "",
    "function resolvePayloadPrompt(payload) {",
    "  if (typeof payload?.prompt === 'string') {",
    "    return payload.prompt;",
    "  }",
    "  if (typeof payload?.input === 'string') {",
    "    return payload.input;",
    "  }",
    "  if (typeof payload?.user_input === 'string') {",
    "    return payload.user_input;",
    "  }",
    "  return '';",
    "}",
    "",
    "function writeHookOutput(result) {",
    "  process.stdout.write(`${JSON.stringify(result)}\\n`);",
    "}",
    "",
    "function runHarnesslyJson(command, cwd, extraEnv = {}) {",
    "  const result = spawnSync(command, {",
    "    cwd,",
    "    shell: true,",
    "    encoding: 'utf8',",
    "    env: {",
    "      ...process.env,",
    "      ...extraEnv,",
    "    },",
    "  });",
    "  if (result.error) {",
    "    throw result.error;",
    "  }",
    "  if (result.status && result.status !== 0) {",
    "    throw new Error(result.stderr?.trim() || result.stdout?.trim() || `\u547D\u4EE4\u6267\u884C\u5931\u8D25: ${command}`);",
    "  }",
    "  const text = (result.stdout || '').trim();",
    "  if (!text) {",
    "    return {};",
    "  }",
    "  try {",
    "    return JSON.parse(text);",
    "  } catch (error) {",
    "    throw new Error(`\u547D\u4EE4\u8F93\u51FA\u4E0D\u662F\u5408\u6CD5 JSON: ${error instanceof Error ? error.message : String(error)}`);",
    "  }",
    "}",
    "",
    "function buildSessionStartContext(result) {",
    "  if (!result?.hasActiveTask || !result?.activeTaskId || !result?.task) {",
    "    return '';",
    "  }",
    "  const lines = [",
    "    '\u5F53\u524D\u5B58\u5728 active task\uFF1A',",
    "    `- task_id: ${result.activeTaskId}`,",
    "    `- goal: ${result.task.goal}`,",
    "    `- status: ${result.task.status}`,",
    '    `- current_stage: ${result.task.currentStage ?? "unknown"}`,',
    "    `- retry_count: ${result.retryCount ?? 0}`,",
    "    `- last_failure: ${result.lastFailureReason ?? 'none'}`,",
    '    `- recommendation: ${result.recommendation ?? "resume"}`,',
    "  ];",
    "  return lines.join('\\n');",
    "}",
    "",
    "function buildPromptSubmitContext(result, prompt) {",
    "  const safePrompt = typeof prompt === 'string' ? prompt.trim() : '';",
    "  const quotedPrompt = JSON.stringify(safePrompt);",
    "  const recommendedAgent = result?.recommendedAgent || null;",
    "  const activeStage = result?.activeStage || null;",
    "  if (result?.action === 'resume_task' && result?.activeTaskId) {",
    "    const lines = [",
    "      '\u68C0\u6D4B\u5230\u8FD9\u6761\u8F93\u5165\u66F4\u50CF\u7EED\u63A5\u5F53\u524D\u4EFB\u52A1\u3002',",
    "      `- active_task_id: ${result.activeTaskId}`,",
    "      activeStage ? `- active_stage: ${activeStage}` : null,",
    "      '\u8BF7\u4F18\u5148\u6CBF\u7528\u5F53\u524D active task \u7EE7\u7EED\uFF0C\u800C\u4E0D\u662F\u65B0\u5EFA\u4EFB\u52A1\u3002',",
    "      recommendedAgent",
    "        ? `\u63A8\u8350\u7531 ${recommendedAgent} \u63A5\u624B\u5F53\u524D\u9636\u6BB5\uFF1Bexecute \u9636\u6BB5\u7531\u4E3B agent \u81EA\u5DF1\u6267\u884C\u3002`",
    "        : null,",
    "    ].filter(Boolean);",
    "    return lines.join('\\n');",
    "  }",
    "  if (result?.action === 'delegate_to_planner' && safePrompt) {",
    "    if (!recommendedAgent) {",
    "      return '\u68C0\u6D4B\u5230\u65B0\u4EFB\u52A1\uFF0C\u4F46 .harness/agents/ \u4E2D\u65E0\u53EF\u7528 sub-agent\uFF08requirement \u89D2\u8272\u672A\u542F\u7528\uFF09\u3002\u8BF7\u68C0\u67E5 manifest \u914D\u7F6E\u3002';",
    "    }",
    "    return [",
    "      '\u68C0\u6D4B\u5230\u8FD9\u6761\u8F93\u5165\u66F4\u50CF\u65B0\u4EFB\u52A1\u3002',",
    "      `\u8BF7 spawn custom agent named ${recommendedAgent}\uFF0C\u7531\u5B83\u5B8C\u6210 SPEC \u9636\u6BB5\u9700\u6C42\u6F84\u6E05\u4E0E\u53EF\u9A8C\u6536\u70B9\u5217\u4E3E\u3002`,",
    "      `${recommendedAgent} \u5FC5\u987B\u751F\u6210\u6216\u5B9A\u4F4D .harness/tasks/<task-id>/contract.yaml \u4E0E plan.md\uFF1B\u4E0D\u8981\u53EA\u8FD4\u56DE\u53E3\u5934\u8BA1\u5212\u3002`,",
    "      '\u5982\u5F53\u524D\u5BBF\u4E3B\u65E0\u6CD5\u7A33\u5B9A\u8C03\u7528 sub-agent\uFF0C\u518D\u6309 repo \u914D\u7F6E\u964D\u7EA7\u5230 hook / command bridge / manual-headless\u3002',",
    "    ].join('\\n');",
    "  }",
    "  if (result?.action === 'create_task' && safePrompt) {",
    "    if (result?.taskCreated && result?.taskId) {",
    "      return [",
    "        'Harnessly \u5DF2\u4E3A\u8FD9\u6761\u8F93\u5165\u81EA\u52A8\u521B\u5EFA task\uFF0C\u5E76\u751F\u6210 contract / plan\u3002',",
    "        `- task_id: ${result.taskId}`,",
    "        result.contractPath ? `- contract: ${result.contractPath}` : null,",
    "        result.planPath ? `- plan: ${result.planPath}` : null,",
    "        '\u8BF7\u5148\u57FA\u4E8E contract / plan \u63A7\u5236\u8303\u56F4\uFF0C\u518D\u7EE7\u7EED\u6267\u884C\u3002',",
    "      ].filter(Boolean).join('\\n');",
    "    }",
    "    return [",
    "      '\u68C0\u6D4B\u5230\u8FD9\u6761\u8F93\u5165\u66F4\u50CF\u65B0\u4EFB\u52A1\u3002',",
    "      `\u5728\u771F\u6B63\u7F16\u7801\u524D\uFF0C\u8BF7\u5148\u6267\u884C Harnessly contract \u6D41\u7A0B\uFF1Aharnessly run --dry-run ${quotedPrompt}`,",
    "      '\u786E\u8BA4 contract \u4E0E plan \u540E\uFF0C\u518D\u7EE7\u7EED\u6267\u884C\u3002',",
    "    ].join('\\n');",
    "  }",
    "  return '';",
    "}",
    "",
    "function buildCompletionDecision(result) {",
    "  if (result?.pass === false) {",
    '    const nextStep = result.nextStep ? `\\n\u4E0B\u4E00\u6B65\uFF1A${result.nextStep}` : "";',
    '    const agentHint = result.recommendedAgent ? `\\n\u5EFA\u8BAE\u59D4\u6D3E\uFF1A${result.recommendedAgent}` : "";',
    '    const evalCommand = result.evalCommand ? `\\n\u53EF\u6267\u884C\u547D\u4EE4\uFF1A${result.evalCommand}` : "";',
    "    const stageHint = result.lastFailureStage",
    "      ? `\\n\u5931\u8D25\u4F4D\u7F6E\uFF1A${result.lastFailureStage}`",
    '      : (result.activeStage ? `\\n\u5F53\u524D\u9636\u6BB5\uFF1A${result.activeStage}` : "");',
    "    return {",
    "      decision: 'block',",
    "      reason: `Harnessly completion gate \u672A\u901A\u8FC7\uFF1A${result.reason}${stageHint}${agentHint}${evalCommand}${nextStep}`,",
    "    };",
    "  }",
    "  return {",
    "    continue: true,",
    "  };",
    "}",
    "",
    `const SESSION_START_COMMAND = ${JSON.stringify(manifest.sessionStartCommand)};`,
    `const USER_PROMPT_COMMAND = ${JSON.stringify(manifest.userPromptSubmitCommand)};`,
    `const COMPLETION_GATE_COMMAND = ${JSON.stringify(manifest.completionGateCommand)};`,
    "",
    "module.exports = {",
    "  buildCompletionDecision,",
    "  buildPromptSubmitContext,",
    "  buildSessionStartContext,",
    "  COMPLETION_GATE_COMMAND,",
    "  readHookPayload,",
    "  resolvePayloadCwd,",
    "  resolvePayloadPrompt,",
    "  runHarnesslyJson,",
    "  SESSION_START_COMMAND,",
    "  USER_PROMPT_COMMAND,",
    "  writeHookOutput,",
    "};",
    ""
  ].join("\n");
}
function renderClaudeCodeSessionStartHook() {
  return [
    "const { buildSessionStartContext, readHookPayload, resolvePayloadCwd, runHarnesslyJson, SESSION_START_COMMAND, writeHookOutput } = require('./shared/claude-code-hook-io.js');",
    "",
    "(function main() {",
    "  try {",
    "    const payload = readHookPayload();",
    "    const cwd = resolvePayloadCwd(payload);",
    "    const result = runHarnesslyJson(SESSION_START_COMMAND, cwd);",
    "    writeHookOutput({",
    "      continue: true,",
    "      additionalContext: buildSessionStartContext(result),",
    "    });",
    "  } catch (error) {",
    "    writeHookOutput({",
    "      continue: true,",
    "      additionalContext: `Claude Code SessionStart hook \u6267\u884C\u5931\u8D25\uFF1A${error instanceof Error ? error.message : String(error)}`,",
    "    });",
    "  }",
    "})();",
    ""
  ].join("\n");
}
function renderClaudeCodeUserPromptSubmitHook() {
  return [
    "const { buildPromptSubmitContext, readHookPayload, resolvePayloadCwd, resolvePayloadPrompt, runHarnesslyJson, USER_PROMPT_COMMAND, writeHookOutput } = require('./shared/claude-code-hook-io.js');",
    "",
    "(function main() {",
    "  try {",
    "    const payload = readHookPayload();",
    "    const cwd = resolvePayloadCwd(payload);",
    "    const prompt = resolvePayloadPrompt(payload);",
    '    const result = runHarnesslyJson(`${USER_PROMPT_COMMAND} --prompt "$HARNESSLY_HOOK_PROMPT"`, cwd, {',
    "      HARNESSLY_HOOK_PROMPT: prompt,",
    "    });",
    "    writeHookOutput({",
    "      continue: true,",
    "      additionalContext: buildPromptSubmitContext(result, prompt),",
    "    });",
    "  } catch (error) {",
    "    writeHookOutput({",
    "      continue: true,",
    "      additionalContext: `Claude Code UserPromptSubmit hook \u6267\u884C\u5931\u8D25\uFF1A${error instanceof Error ? error.message : String(error)}`,",
    "    });",
    "  }",
    "})();",
    ""
  ].join("\n");
}
function renderClaudeCodeStopHook() {
  return [
    "const { buildCompletionDecision, COMPLETION_GATE_COMMAND, readHookPayload, resolvePayloadCwd, runHarnesslyJson, writeHookOutput } = require('./shared/claude-code-hook-io.js');",
    "",
    "(function main() {",
    "  try {",
    "    const payload = readHookPayload();",
    "    const cwd = resolvePayloadCwd(payload);",
    '    const message = typeof payload?.stopReason === "string" ? payload.stopReason : "";',
    '    const result = runHarnesslyJson(`${COMPLETION_GATE_COMMAND} --message "$HARNESSLY_HOOK_LAST_MESSAGE"`, cwd, {',
    "      HARNESSLY_HOOK_LAST_MESSAGE: message,",
    "    });",
    "    writeHookOutput(buildCompletionDecision(result));",
    "  } catch (error) {",
    "    writeHookOutput({",
    "      continue: true,",
    "      additionalContext: `Claude Code Stop hook \u6267\u884C\u5931\u8D25\uFF1A${error instanceof Error ? error.message : String(error)}`,",
    "    });",
    "  }",
    "})();",
    ""
  ].join("\n");
}
function renderClaudeCodePreToolUseHook() {
  return [
    "const { COMPLETION_GATE_COMMAND, readHookPayload, resolvePayloadCwd, runHarnesslyJson, writeHookOutput } = require('./shared/claude-code-hook-io.js');",
    "",
    "const ARTIFACT_GUARD_COMMAND = `${COMPLETION_GATE_COMMAND.replace('host completion-gate', 'host artifact-guard')}`;",
    "",
    "(function main() {",
    "  try {",
    "    const payload = readHookPayload();",
    "    const toolName = payload?.tool_name || '';",
    "    if (toolName !== 'Edit' && toolName !== 'Write') {",
    "      writeHookOutput({ continue: true });",
    "      return;",
    "    }",
    "    const filePath = payload?.tool_input?.file_path || '';",
    "    if (!filePath) {",
    "      writeHookOutput({ continue: true });",
    "      return;",
    "    }",
    "    const cwd = resolvePayloadCwd(payload);",
    "    try {",
    '      const result = runHarnesslyJson(`${ARTIFACT_GUARD_COMMAND} --file "$HARNESSLY_ARTIFACT_FILE"`, cwd, {',
    "        HARNESSLY_ARTIFACT_FILE: filePath,",
    "      });",
    "      if (result && !result.allowed) {",
    "        writeHookOutput({",
    "          decision: 'block',",
    "          reason: `Harnessly \u5199\u4FDD\u62A4\uFF1A${result.reason}`",
    "        });",
    "        return;",
    "      }",
    "    } catch {",
    "      // artifact-guard \u4E0D\u53EF\u7528\u65F6\u653E\u884C\uFF0C\u907F\u514D\u963B\u65AD\u6B63\u5E38\u6D41\u7A0B",
    "    }",
    "    writeHookOutput({ continue: true });",
    "  } catch (error) {",
    "    writeHookOutput({",
    "      continue: true,",
    "      additionalContext: `Claude Code PreToolUse hook \u6267\u884C\u5931\u8D25\uFF1A${error instanceof Error ? error.message : String(error)}`,",
    "    });",
    "  }",
    "})();",
    ""
  ].join("\n");
}
function renderClaudeCodeSettings(_manifest) {
  const repoRoot = "$(git rev-parse --show-toplevel)";
  return `${JSON.stringify(
    {
      hooks: {
        SessionStart: [
          {
            matcher: "",
            hooks: [
              {
                type: "command",
                command: `node "${repoRoot}/.harness/hosts/claude-code/hooks/session_start.js"`
              }
            ]
          }
        ],
        UserPromptSubmit: [
          {
            matcher: "",
            hooks: [
              {
                type: "command",
                command: `node "${repoRoot}/.harness/hosts/claude-code/hooks/user_prompt_submit.js"`
              }
            ]
          }
        ],
        PreToolUse: [
          {
            matcher: "Edit|Write",
            hooks: [
              {
                type: "command",
                command: `node "${repoRoot}/.harness/hosts/claude-code/hooks/pre_tool_use.js"`
              }
            ]
          }
        ],
        Stop: [
          {
            matcher: "",
            hooks: [
              {
                type: "command",
                command: `node "${repoRoot}/.harness/hosts/claude-code/hooks/stop.js"`
              }
            ]
          }
        ]
      }
    },
    null,
    2
  )}
`;
}
function renderClaudeCodeManagedFiles(manifest, options = {}) {
  const agentManifests = options.agentManifests ?? [];
  const files = {
    ".claude/settings.json": renderClaudeCodeSettings(manifest),
    ".harness/hosts/claude-code/hooks/session_start.js": renderClaudeCodeSessionStartHook(),
    ".harness/hosts/claude-code/hooks/user_prompt_submit.js": renderClaudeCodeUserPromptSubmitHook(),
    ".harness/hosts/claude-code/hooks/stop.js": renderClaudeCodeStopHook(),
    ".harness/hosts/claude-code/hooks/pre_tool_use.js": renderClaudeCodePreToolUseHook(),
    ".harness/hosts/claude-code/hooks/shared/claude-code-hook-io.js": renderClaudeCodeHookIo(manifest)
  };
  for (const agentManifest of agentManifests) {
    if (!agentManifest.enabled) {
      continue;
    }
    files[`.claude/agents/harness-${agentManifest.role}.md`] = renderClaudeCodeSubagentFile(agentManifest);
  }
  return files;
}

// ../hosts/codex/dist/index.js
function renderCodexConfig() {
  return ["# Managed by Harnessly", "[features]", "codex_hooks = true", ""].join("\n");
}
function renderHookCommand(command) {
  return [
    {
      hooks: [
        {
          type: "command",
          command
        }
      ]
    }
  ];
}
function renderCodexHooks(manifest, options = { userPromptSubmitHookEnabled: true }) {
  const hooks = {
    SessionStart: [
      {
        matcher: "startup|resume",
        hooks: [
          {
            type: "command",
            command: 'node "$(git rev-parse --show-toplevel)/.harness/hosts/codex/hooks/session_start.js" || echo "{}"'
          }
        ]
      }
    ],
    Stop: renderHookCommand(
      'node "$(git rev-parse --show-toplevel)/.harness/hosts/codex/hooks/stop.js" || echo "{}"'
    )
  };
  if (options.userPromptSubmitHookEnabled ?? true) {
    hooks.UserPromptSubmit = renderHookCommand(
      'node "$(git rev-parse --show-toplevel)/.harness/hosts/codex/hooks/user_prompt_submit.js" || echo "{}"'
    );
  }
  return `${JSON.stringify(
    {
      $comment: "Repo-local Codex hooks generated from .harness/hosts/codex.",
      hooks
    },
    null,
    2
  )}
`;
}
function renderCodexHookIo(manifest) {
  return [
    "const fs = require('node:fs');",
    "const { spawnSync } = require('node:child_process');",
    "",
    "function readHookPayload() {",
    "  const raw = fs.readFileSync(0, 'utf8').trim();",
    "  if (!raw) {",
    "    return {};",
    "  }",
    "  try {",
    "    return JSON.parse(raw);",
    "  } catch {",
    "    throw new Error('hook stdin \u4E0D\u662F\u5408\u6CD5 JSON');",
    "  }",
    "}",
    "",
    "function resolvePayloadCwd(payload) {",
    "  return typeof payload?.cwd === 'string' && payload.cwd.trim() ? payload.cwd.trim() : process.cwd();",
    "}",
    "",
    "function resolvePayloadPrompt(payload) {",
    "  if (typeof payload?.prompt === 'string') {",
    "    return payload.prompt;",
    "  }",
    "  if (typeof payload?.input === 'string') {",
    "    return payload.input;",
    "  }",
    "  if (typeof payload?.user_input === 'string') {",
    "    return payload.user_input;",
    "  }",
    "  return '';",
    "}",
    "",
    "function buildCodexHookOutput(eventName, decision) {",
    "  if (decision.status === 'block') {",
    "    return {",
    "      decision: 'block',",
    "      reason: decision.reason,",
    "    };",
    "  }",
    "  if (!decision.additionalContext) {",
    "    return { continue: true, suppressOutput: true };",
    "  }",
    "  return {",
    "    continue: true,",
    "    suppressOutput: true,",
    "    hookSpecificOutput: {",
    "      additionalContext: decision.additionalContext,",
    "      hookEventName: eventName,",
    "    },",
    "  };",
    "}",
    "",
    "function writeHookOutput(result) {",
    "  process.stdout.write(`${JSON.stringify(result, null, 2)}\\n`);",
    "}",
    "",
    "function writeContinue(eventName, message) {",
    "  writeHookOutput(",
    "    buildCodexHookOutput(eventName, {",
    "      status: 'continue',",
    "      additionalContext: message,",
    "    }),",
    "  );",
    "}",
    "",
    "function runHarnesslyJson(command, cwd, extraEnv = {}) {",
    "  const result = spawnSync(command, {",
    "    cwd,",
    "    shell: true,",
    "    encoding: 'utf8',",
    "    env: {",
    "      ...process.env,",
    "      ...extraEnv,",
    "    },",
    "  });",
    "  if (result.error) {",
    "    throw result.error;",
    "  }",
    "  if (result.status && result.status !== 0) {",
    "    throw new Error(result.stderr?.trim() || result.stdout?.trim() || `\u547D\u4EE4\u6267\u884C\u5931\u8D25: ${command}`);",
    "  }",
    "  const text = (result.stdout || '').trim();",
    "  if (!text) {",
    "    return {};",
    "  }",
    "  try {",
    "    return JSON.parse(text);",
    "  } catch (error) {",
    "    throw new Error(`\u547D\u4EE4\u8F93\u51FA\u4E0D\u662F\u5408\u6CD5 JSON: ${error instanceof Error ? error.message : String(error)}`);",
    "  }",
    "}",
    "",
    "function buildSessionStartContext(result) {",
    "  if (!result?.hasActiveTask || !result?.activeTaskId || !result?.task) {",
    "    return '';",
    "  }",
    "  const lines = [",
    "    '\u5F53\u524D\u5B58\u5728 active task\uFF1A',",
    "    `- task_id: ${result.activeTaskId}`,",
    "    `- goal: ${result.task.goal}`,",
    "    `- status: ${result.task.status}`,",
    '    `- current_stage: ${result.task.currentStage ?? "unknown"}`,',
    "    `- retry_count: ${result.retryCount ?? 0}`,",
    "    `- last_failure: ${result.lastFailureReason ?? 'none'}`,",
    '    `- recommendation: ${result.recommendation ?? "resume"}`,',
    "  ];",
    "  return lines.join('\\n');",
    "}",
    "",
    "function buildPromptSubmitContext(result, prompt) {",
    "  const safePrompt = typeof prompt === 'string' ? prompt.trim() : '';",
    "  const quotedPrompt = JSON.stringify(safePrompt);",
    "  const recommendedAgent = result?.recommendedAgent || null;",
    "  const activeStage = result?.activeStage || null;",
    "  if (result?.action === 'resume_task' && result?.activeTaskId) {",
    "    const lines = [",
    "      '\u68C0\u6D4B\u5230\u8FD9\u6761\u8F93\u5165\u66F4\u50CF\u7EED\u63A5\u5F53\u524D\u4EFB\u52A1\u3002',",
    "      `- active_task_id: ${result.activeTaskId}`,",
    "      activeStage ? `- active_stage: ${activeStage}` : null,",
    "      '\u8BF7\u4F18\u5148\u6CBF\u7528\u5F53\u524D active task \u7EE7\u7EED\uFF0C\u800C\u4E0D\u662F\u65B0\u5EFA\u4EFB\u52A1\u3002',",
    "      recommendedAgent",
    "        ? `\u63A8\u8350\u7531 ${recommendedAgent} \u63A5\u624B\u5F53\u524D\u9636\u6BB5\uFF1Bexecute \u9636\u6BB5\u7531\u4E3B agent \u81EA\u5DF1\u6267\u884C\u3002`",
    "        : null,",
    "    ].filter(Boolean);",
    "    return lines.join('\\n');",
    "  }",
    "  if (result?.action === 'delegate_to_planner' && safePrompt) {",
    "    if (!recommendedAgent) {",
    "      return '\u68C0\u6D4B\u5230\u65B0\u4EFB\u52A1\uFF0C\u4F46 .harness/agents/ \u4E2D\u65E0\u53EF\u7528 sub-agent\uFF08requirement \u89D2\u8272\u672A\u542F\u7528\uFF09\u3002\u8BF7\u68C0\u67E5 manifest \u914D\u7F6E\u3002';",
    "    }",
    "    return [",
    "      '\u68C0\u6D4B\u5230\u8FD9\u6761\u8F93\u5165\u66F4\u50CF\u65B0\u4EFB\u52A1\u3002',",
    "      `\u8BF7 spawn custom agent named ${recommendedAgent}\uFF0C\u7531\u5B83\u5B8C\u6210 SPEC \u9636\u6BB5\u9700\u6C42\u6F84\u6E05\u4E0E\u53EF\u9A8C\u6536\u70B9\u5217\u4E3E\u3002`,",
    "      `${recommendedAgent} \u5FC5\u987B\u751F\u6210\u6216\u5B9A\u4F4D .harness/tasks/<task-id>/contract.yaml \u4E0E plan.md\uFF1B\u4E0D\u8981\u53EA\u8FD4\u56DE\u53E3\u5934\u8BA1\u5212\u3002`,",
    "      '\u5982\u5F53\u524D\u5BBF\u4E3B\u65E0\u6CD5\u7A33\u5B9A\u8C03\u7528 sub-agent\uFF0C\u518D\u6309 repo \u914D\u7F6E\u964D\u7EA7\u5230 hook / command bridge / manual-headless\u3002',",
    "    ].join('\\n');",
    "  }",
    "  if (result?.action === 'create_task' && safePrompt) {",
    "    if (result?.taskCreated && result?.taskId) {",
    "      return [",
    "        'Harnessly \u5DF2\u4E3A\u8FD9\u6761\u8F93\u5165\u81EA\u52A8\u521B\u5EFA task\uFF0C\u5E76\u751F\u6210 contract / plan\u3002',",
    "        `- task_id: ${result.taskId}`,",
    "        result.contractPath ? `- contract: ${result.contractPath}` : null,",
    "        result.planPath ? `- plan: ${result.planPath}` : null,",
    "        '\u8BF7\u5148\u57FA\u4E8E contract / plan \u63A7\u5236\u8303\u56F4\uFF0C\u518D\u7EE7\u7EED\u6267\u884C\u3002',",
    "      ].filter(Boolean).join('\\n');",
    "    }",
    "    return [",
    "      '\u68C0\u6D4B\u5230\u8FD9\u6761\u8F93\u5165\u66F4\u50CF\u65B0\u4EFB\u52A1\u3002',",
    "      `\u5728\u771F\u6B63\u7F16\u7801\u524D\uFF0C\u8BF7\u5148\u6267\u884C Harnessly contract \u6D41\u7A0B\uFF1Aharnessly run --dry-run ${quotedPrompt}`,",
    "      '\u786E\u8BA4 contract \u4E0E plan \u540E\uFF0C\u518D\u7EE7\u7EED\u6267\u884C\u3002',",
    "    ].join('\\n');",
    "  }",
    "  return '';",
    "}",
    "",
    "function buildCompletionDecision(result) {",
    "  if (result?.pass === false) {",
    '    const nextStep = result.nextStep ? `\\n\u4E0B\u4E00\u6B65\uFF1A${result.nextStep}` : "";',
    '    const agentHint = result.recommendedAgent ? `\\n\u5EFA\u8BAE\u59D4\u6D3E\uFF1A${result.recommendedAgent}` : "";',
    '    const evalCommand = result.evalCommand ? `\\n\u53EF\u6267\u884C\u547D\u4EE4\uFF1A${result.evalCommand}` : "";',
    "    const stageHint = result.lastFailureStage",
    "      ? `\\n\u5931\u8D25\u4F4D\u7F6E\uFF1A${result.lastFailureStage}`",
    '      : (result.activeStage ? `\\n\u5F53\u524D\u9636\u6BB5\uFF1A${result.activeStage}` : "");',
    "    return {",
    "      status: 'block',",
    "      reason: `Harnessly completion gate \u672A\u901A\u8FC7\uFF1A${result.reason}${stageHint}${agentHint}${evalCommand}${nextStep}`,",
    "    };",
    "  }",
    "  return {",
    "    status: 'continue',",
    '    additionalContext: "",',
    "  };",
    "}",
    "",
    `const SESSION_START_COMMAND = ${JSON.stringify(manifest.sessionStartCommand)};`,
    `const USER_PROMPT_COMMAND = ${JSON.stringify(manifest.userPromptSubmitCommand)};`,
    `const COMPLETION_GATE_COMMAND = ${JSON.stringify(manifest.completionGateCommand)};`,
    "",
    "module.exports = {",
    "  buildCodexHookOutput,",
    "  buildCompletionDecision,",
    "  buildPromptSubmitContext,",
    "  buildSessionStartContext,",
    "  COMPLETION_GATE_COMMAND,",
    "  readHookPayload,",
    "  resolvePayloadCwd,",
    "  resolvePayloadPrompt,",
    "  runHarnesslyJson,",
    "  SESSION_START_COMMAND,",
    "  USER_PROMPT_COMMAND,",
    "  writeContinue,",
    "  writeHookOutput,",
    "};",
    ""
  ].join("\n");
}
function renderCodexSessionStartHook() {
  return [
    "const { buildCodexHookOutput, buildSessionStartContext, readHookPayload, resolvePayloadCwd, runHarnesslyJson, SESSION_START_COMMAND, writeContinue, writeHookOutput } = require('./shared/codex-hook-io.js');",
    "",
    "(function main() {",
    "  try {",
    "    const payload = readHookPayload();",
    "    const cwd = resolvePayloadCwd(payload);",
    "    const result = runHarnesslyJson(SESSION_START_COMMAND, cwd);",
    "    writeHookOutput(",
    "      buildCodexHookOutput('SessionStart', {",
    "        status: 'continue',",
    "        additionalContext: buildSessionStartContext(result),",
    "      }),",
    "    );",
    "  } catch (error) {",
    "    writeContinue('SessionStart', `Codex SessionStart hook \u6267\u884C\u5931\u8D25\uFF1A${error instanceof Error ? error.message : String(error)}`);",
    "  }",
    "})();",
    ""
  ].join("\n");
}
function renderCodexUserPromptSubmitHook() {
  return [
    "const { buildCodexHookOutput, buildPromptSubmitContext, readHookPayload, resolvePayloadCwd, resolvePayloadPrompt, runHarnesslyJson, USER_PROMPT_COMMAND, writeContinue, writeHookOutput } = require('./shared/codex-hook-io.js');",
    "",
    "(function main() {",
    "  try {",
    "    const payload = readHookPayload();",
    "    const cwd = resolvePayloadCwd(payload);",
    "    const prompt = resolvePayloadPrompt(payload);",
    '    const result = runHarnesslyJson(`${USER_PROMPT_COMMAND} --prompt "$HARNESSLY_HOOK_PROMPT"`, cwd, {',
    "      HARNESSLY_HOOK_PROMPT: prompt,",
    "    });",
    "    writeHookOutput(",
    "      buildCodexHookOutput('UserPromptSubmit', {",
    "        status: 'continue',",
    "        additionalContext: buildPromptSubmitContext(result, prompt),",
    "      }),",
    "    );",
    "  } catch (error) {",
    "    writeContinue('UserPromptSubmit', `Codex UserPromptSubmit hook \u6267\u884C\u5931\u8D25\uFF1A${error instanceof Error ? error.message : String(error)}`);",
    "  }",
    "})();",
    ""
  ].join("\n");
}
function renderCodexStopHook() {
  return [
    "const { buildCompletionDecision, buildCodexHookOutput, COMPLETION_GATE_COMMAND, readHookPayload, resolvePayloadCwd, runHarnesslyJson, writeContinue, writeHookOutput } = require('./shared/codex-hook-io.js');",
    "",
    "(function main() {",
    "  try {",
    "    const payload = readHookPayload();",
    "    const cwd = resolvePayloadCwd(payload);",
    '    const message = typeof payload?.last_assistant_message === "string" ? payload.last_assistant_message : "";',
    '    const result = runHarnesslyJson(`${COMPLETION_GATE_COMMAND} --message "$HARNESSLY_HOOK_LAST_MESSAGE"`, cwd, {',
    "      HARNESSLY_HOOK_LAST_MESSAGE: message,",
    "    });",
    "    const decision = buildCompletionDecision(result);",
    "    writeHookOutput(buildCodexHookOutput('Stop', decision));",
    "  } catch (error) {",
    "    writeContinue('Stop', `Codex Stop hook \u6267\u884C\u5931\u8D25\uFF1A${error instanceof Error ? error.message : String(error)}`);",
    "  }",
    "})();",
    ""
  ].join("\n");
}
function renderCodexManagedFiles(manifest, options = {}) {
  const userPromptSubmitHookEnabled = options.userPromptSubmitHookEnabled ?? true;
  const agentManifests = options.agentManifests ?? [];
  const files = {
    ".codex/config.toml": renderCodexConfig(),
    ".codex/hooks.json": renderCodexHooks(manifest, { userPromptSubmitHookEnabled }),
    ".harness/hosts/codex/hooks/session_start.js": renderCodexSessionStartHook(),
    ".harness/hosts/codex/hooks/user_prompt_submit.js": renderCodexUserPromptSubmitHook(),
    ".harness/hosts/codex/hooks/stop.js": renderCodexStopHook(),
    ".harness/hosts/codex/hooks/shared/codex-hook-io.js": renderCodexHookIo(manifest)
  };
  for (const agentManifest of agentManifests) {
    if (!agentManifest.enabled) {
      continue;
    }
    files[`.codex/agents/harness-${agentManifest.role}.toml`] = renderCodexSubagentFile(agentManifest);
  }
  return files;
}

// src/utils/hosts.ts
async function readFileIfExists2(filePath) {
  try {
    return await readFile13(filePath, "utf8");
  } catch {
    return null;
  }
}
function quoteShellArg(value) {
  return `"${value.replace(/(["\\$`])/g, "\\$1")}"`;
}
function getCurrentHarnesslyCommand() {
  if (process.env.HARNESSLY_BIN?.trim()) {
    return process.env.HARNESSLY_BIN.trim();
  }
  const entry = process.argv[1];
  if (!entry) {
    return "harnessly";
  }
  if (entry.endsWith(".js")) {
    return `${quoteShellArg(process.execPath)} ${quoteShellArg(entry)}`;
  }
  return quoteShellArg(entry);
}
function isBareHarnesslyCommand(command) {
  return command.trim().startsWith("harnessly ");
}
function refreshManifestCommand(manifest, commandPrefix) {
  const shouldRefresh = isBareHarnesslyCommand(manifest.sessionStartCommand) || isBareHarnesslyCommand(manifest.userPromptSubmitCommand) || isBareHarnesslyCommand(manifest.completionGateCommand);
  if (!shouldRefresh) {
    return manifest;
  }
  return {
    ...manifest,
    sessionStartCommand: `${commandPrefix} host session-start`,
    userPromptSubmitCommand: `${commandPrefix} host user-prompt-submit`,
    completionGateCommand: `${commandPrefix} host completion-gate`
  };
}
async function ensureHostManifest(workDir, host) {
  const manifestPath = path17.join(getHarnessPaths(workDir).hostsDir, getHostManifestFilename(host));
  const existing = await readFileIfExists2(manifestPath);
  const commandPrefix = getCurrentHarnesslyCommand();
  if (existing) {
    const manifest2 = refreshManifestCommand(parseHostManifest(existing), commandPrefix);
    await writeFile9(manifestPath, serializeHostManifest(manifest2), "utf8");
    return manifest2;
  }
  const manifest = createHostManifest(host, commandPrefix);
  await writeFile9(manifestPath, serializeHostManifest(manifest), "utf8");
  return manifest;
}
async function loadEnabledHosts(workDir, requestedHost) {
  if (requestedHost && requestedHost !== "auto" && requestedHost !== "all") {
    return [requestedHost];
  }
  const config = await loadHarnessConfig(workDir);
  if (requestedHost === "all") {
    return config.enabledHosts;
  }
  if (config.enabledHosts.length > 0) {
    return config.enabledHosts;
  }
  return [config.defaultHost];
}
function renderRepoLocalShell(manifest, config, agentManifests = []) {
  switch (manifest.host) {
    case "claude-code":
      return renderClaudeCodeManagedFiles(manifest, { agentManifests });
    case "codex":
      return renderCodexManagedFiles(manifest, {
        userPromptSubmitHookEnabled: config.codexUserPromptSubmitHookEnabled,
        agentManifests
      });
    default:
      return {};
  }
}
async function installHostShells(workDir, requestedHost) {
  const installedPaths = [];
  const hosts = await loadEnabledHosts(workDir, requestedHost);
  const config = await loadHarnessConfig(workDir);
  const newHosts = hosts.filter((h) => !config.enabledHosts.includes(h));
  if (newHosts.length > 0) {
    await writeHarnessConfig(workDir, {
      ...config,
      enabledHosts: newHosts
    });
  }
  const agentManifests = await loadAgentManifests(workDir);
  for (const host of hosts) {
    const manifest = await ensureHostManifest(workDir, host);
    const files = renderRepoLocalShell(manifest, config, agentManifests);
    for (const [relativePath, content] of Object.entries(files)) {
      const absolutePath = path17.join(workDir, relativePath);
      await mkdir11(path17.dirname(absolutePath), { recursive: true });
      await writeFile9(absolutePath, content, "utf8");
      installedPaths.push(relativePath);
    }
  }
  return installedPaths;
}
async function collectHostStatus(workDir) {
  const config = await loadHarnessConfig(workDir);
  const agentManifests = await loadAgentManifests(workDir);
  const rows = [];
  for (const host of config.enabledHosts) {
    const manifestPath = path17.join(getHarnessPaths(workDir).hostsDir, getHostManifestFilename(host));
    const manifestText = await readFileIfExists2(manifestPath);
    if (!manifestText) {
      rows.push({
        host,
        manifest: "missing",
        shell: "missing",
        files: []
      });
      continue;
    }
    const manifest = parseHostManifest(manifestText);
    const expectedFiles = renderRepoLocalShell(manifest, config, agentManifests);
    let shellStatus = "installed";
    for (const [relativePath, expectedContent] of Object.entries(expectedFiles)) {
      const actual = await readFileIfExists2(path17.join(workDir, relativePath));
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
async function readActiveTaskId3(workDir) {
  const filePath = getHarnessPaths(workDir).activeTaskFile;
  const content = await readFileIfExists2(filePath);
  return content?.trim() || null;
}

// src/commands/init.ts
async function runInit(flags) {
  const workDir = process.cwd();
  const rawHost = typeof flags.host === "string" ? flags.host : "claude-code";
  const hosts = rawHost.split(",").map((h) => h.trim()).filter(Boolean);
  const force = flags.force === true;
  const projectType = await detectProjectType(workDir);
  const paths = await ensureHarnessDirectories(workDir);
  const config = createDefaultHarnessConfig(projectType, hosts);
  const configStatus = await writeHarnessConfig(workDir, config, force);
  const structureRulesStatus = await writeFileIfChanged(
    paths.structureRulesFile,
    renderStructureRulesTemplate(),
    force
  );
  const reviewAgentsStatus = await writeFileIfChanged(
    paths.reviewAgentsFile,
    renderReviewAgentsTemplate(),
    force
  );
  const skillResults = await writeDefaultSkillManifests(
    workDir,
    projectType,
    config.requiredChecks,
    force
  );
  const skillSummary = skillResults.length > 0 ? skillResults.map((r) => `${r.check}/${r.language}=${r.status}`).join(", ") : "none";
  const agentResults = await writeDefaultAgentManifests(workDir, force);
  const agentSummary = agentResults.map((r) => `${r.role}=${r.manifestStatus}/${r.promptStatus}`).join(", ");
  for (const host of hosts) {
    await ensureHostManifest(workDir, host);
  }
  let gitHookPaths = [];
  try {
    gitHookPaths = await installGitHooks(workDir, hosts);
  } catch {
  }
  const installedPaths = config.installRepoLocalShells ? await installHostShells(workDir) : [];
  await writeFile10(paths.activeTaskFile, "", "utf8");
  printLines([
    "Harnessly \u521D\u59CB\u5316\u5B8C\u6210",
    `- project_type: ${projectType}`,
    `- config: ${configStatus}`,
    `- structure_rules: ${structureRulesStatus}`,
    `- review_agents: ${reviewAgentsStatus}`,
    `- skills: ${skillSummary}`,
    `- agents: ${agentSummary}`,
    `- hosts: ${hosts.join(", ")}`,
    `- default_host: ${config.defaultHost}`,
    `- installed_shells: ${installedPaths.length > 0 ? installedPaths.join(", ") : "none"}`,
    `- git_hooks: ${gitHookPaths.length > 0 ? gitHookPaths.join(", ") : "none (git hooks \u5B89\u88C5\u5931\u8D25\u6216\u8DF3\u8FC7)"}`
  ]);
}

// src/utils/intake-feedback.ts
import { appendFile as appendFile3, mkdir as mkdir12, readFile as readFile14, writeFile as writeFile11 } from "fs/promises";
import path18 from "path";
var FEEDBACK_FILENAME = "intake-feedback.jsonl";
var LAST_DECISION_FILENAME = "intake-last.json";
function isMissingFileError11(error) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
function normalizePromptForFeedback(prompt) {
  return prompt.trim().toLowerCase().replace(/\s+/g, " ").replace(/[？?。.!！,，；;：:]/g, "");
}
function getIntakeFeedbackPath(workDir) {
  return path18.join(getHarnessPaths(workDir).harnessDir, FEEDBACK_FILENAME);
}
function getLastIntakeDecisionPath(workDir) {
  return path18.join(getHarnessPaths(workDir).harnessDir, LAST_DECISION_FILENAME);
}
async function writeLastIntakeDecision(workDir, decision) {
  const filePath = getLastIntakeDecisionPath(workDir);
  await mkdir12(path18.dirname(filePath), { recursive: true });
  await writeFile11(
    filePath,
    `${JSON.stringify({ ...decision, createdAt: (/* @__PURE__ */ new Date()).toISOString() }, null, 2)}
`,
    "utf8"
  );
}
async function readLastIntakeDecision(workDir) {
  try {
    return JSON.parse(await readFile14(getLastIntakeDecisionPath(workDir), "utf8"));
  } catch (error) {
    if (isMissingFileError11(error)) return null;
    return null;
  }
}
async function appendIntakeFeedback(workDir, feedback) {
  const entry = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    prompt: feedback.prompt,
    normalizedPrompt: normalizePromptForFeedback(feedback.prompt),
    predictedAction: feedback.predictedAction,
    actualAction: feedback.actualAction,
    reason: feedback.reason,
    createdAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  const filePath = getIntakeFeedbackPath(workDir);
  await mkdir12(path18.dirname(filePath), { recursive: true });
  await appendFile3(filePath, `${JSON.stringify(entry)}
`, "utf8");
  return entry;
}
async function loadIntakeFeedback(workDir) {
  try {
    const text = await readFile14(getIntakeFeedbackPath(workDir), "utf8");
    const entries = [];
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line) continue;
      try {
        const parsed = JSON.parse(line);
        if (parsed.prompt && parsed.actualAction && parsed.normalizedPrompt) {
          entries.push(parsed);
        }
      } catch {
      }
    }
    return entries;
  } catch (error) {
    if (isMissingFileError11(error)) return [];
    throw error;
  }
}
async function rewriteIntakeFeedback(workDir, entries) {
  const filePath = getIntakeFeedbackPath(workDir);
  await mkdir12(path18.dirname(filePath), { recursive: true });
  await writeFile11(filePath, entries.map((entry) => JSON.stringify(entry)).join("\n") + (entries.length ? "\n" : ""), "utf8");
}
function trigrams(value) {
  const normalized = normalizePromptForFeedback(value);
  const padded = `  ${normalized}  `;
  const result = /* @__PURE__ */ new Set();
  for (let i = 0; i < padded.length - 2; i += 1) {
    result.add(padded.slice(i, i + 3));
  }
  return result;
}
function similarity(left, right) {
  const a = trigrams(left);
  const b = trigrams(right);
  if (a.size === 0 || b.size === 0) return 0;
  const intersection = [...a].filter((item) => b.has(item)).length;
  return intersection / (/* @__PURE__ */ new Set([...a, ...b])).size;
}
function classifyByIntakeFeedback(prompt, entries) {
  const normalized = normalizePromptForFeedback(prompt);
  const exact = [...entries].reverse().find((entry) => entry.normalizedPrompt === normalized);
  if (exact) {
    return {
      action: exact.actualAction,
      reason: "learned_exact_feedback",
      confidence: 1,
      matchedEntryIds: [exact.id]
    };
  }
  const similarChatEntries = entries.map((entry) => ({ entry, score: similarity(normalized, entry.normalizedPrompt) })).filter(({ entry, score }) => entry.actualAction === "chat" && score >= 0.85).sort((a, b) => b.score - a.score);
  if (similarChatEntries.length > 0) {
    return {
      action: "chat",
      reason: "learned_similar_feedback",
      confidence: similarChatEntries[0].score,
      matchedEntryIds: similarChatEntries.slice(0, 3).map(({ entry }) => entry.id)
    };
  }
  const weakerChatEntries = entries.map((entry) => ({ entry, score: similarity(normalized, entry.normalizedPrompt) })).filter(({ entry, score }) => entry.actualAction === "chat" && score >= 0.72).sort((a, b) => b.score - a.score);
  if (weakerChatEntries.length >= 2) {
    return {
      action: "chat",
      reason: "learned_similar_feedback",
      confidence: weakerChatEntries[0].score,
      matchedEntryIds: weakerChatEntries.slice(0, 3).map(({ entry }) => entry.id)
    };
  }
  return null;
}

// src/commands/intake.ts
var VALID_ACTIONS = [
  "chat",
  "delegate_to_planner",
  "create_task",
  "resume_task"
];
function readStringFlag2(flags, name) {
  const value = flags[name];
  return typeof value === "string" ? value.trim() : "";
}
function parseAction(value) {
  if (VALID_ACTIONS.includes(value)) {
    return value;
  }
  throw new Error(`\u975E\u6CD5 action: ${value || "(empty)"}\u3002\u5141\u8BB8\u503C\uFF1A${VALID_ACTIONS.join(", ")}`);
}
async function runIntake(flags, positionals) {
  const workDir = process.cwd();
  const [subcommand, ...rest] = positionals;
  if (!subcommand || subcommand === "feedback") {
    await runIntakeFeedback(workDir, flags, subcommand === "feedback" ? rest : positionals);
    return;
  }
  throw new Error(`\u672A\u77E5 intake \u5B50\u547D\u4EE4\uFF1A${subcommand}`);
}
async function runIntakeFeedback(workDir, flags, positionals) {
  const [subcommand, ...rest] = positionals;
  if (!subcommand || subcommand === "list") {
    const entries = await loadIntakeFeedback(workDir);
    if (flags.json) {
      printJson(entries);
      return;
    }
    printLines(
      entries.length === 0 ? ["\u6CA1\u6709 intake feedback\u3002"] : entries.map((entry) => `${entry.id}	${entry.actualAction}	${entry.reason}	${entry.prompt}`)
    );
    return;
  }
  if (subcommand === "add") {
    const useLast = flags.last === true;
    const actual = parseAction(readStringFlag2(flags, "actual"));
    const reason = readStringFlag2(flags, "reason") || "manual correction";
    const prompt = readStringFlag2(flags, "prompt") || rest.join(" ").trim();
    let finalPrompt = prompt;
    let predictedAction = parseAction(readStringFlag2(flags, "predicted") || "chat");
    if (useLast) {
      const last = await readLastIntakeDecision(workDir);
      if (!last) {
        throw new Error("\u6CA1\u6709\u53EF\u7528\u4E8E --last \u7684 intake-last.json\u3002\u8BF7\u6539\u7528 --prompt\u3002");
      }
      finalPrompt = last.prompt;
      predictedAction = last.action;
    }
    if (!finalPrompt) {
      throw new Error('\u7F3A\u5C11 prompt\u3002\u7528\u6CD5\uFF1Aharnessly intake feedback add --actual chat --prompt "..."');
    }
    const entry = await appendIntakeFeedback(workDir, {
      prompt: finalPrompt,
      predictedAction,
      actualAction: actual,
      reason
    });
    if (flags.json) {
      printJson(entry);
      return;
    }
    printLines([`intake feedback added: ${entry.id}`]);
    return;
  }
  if (subcommand === "remove") {
    const id = readStringFlag2(flags, "id") || rest[0]?.trim();
    if (!id) {
      throw new Error("\u7F3A\u5C11 id\u3002\u7528\u6CD5\uFF1Aharnessly intake feedback remove <id>");
    }
    const entries = await loadIntakeFeedback(workDir);
    const kept = entries.filter((entry) => entry.id !== id);
    await rewriteIntakeFeedback(workDir, kept);
    printLines([`intake feedback removed: ${entries.length - kept.length}`]);
    return;
  }
  if (subcommand === "clear") {
    await rewriteIntakeFeedback(workDir, []);
    printLines(["intake feedback cleared"]);
    return;
  }
  throw new Error(`\u672A\u77E5 intake feedback \u5B50\u547D\u4EE4\uFF1A${subcommand}`);
}

// src/commands/host/agent-event.ts
function readStringFlag3(flags, name) {
  return typeof flags[name] === "string" ? flags[name].trim() : "";
}
function normalizeAgent(value) {
  const stripped = value.startsWith("harness-") ? value.slice("harness-".length) : value;
  if (AGENT_ROLES.includes(stripped)) {
    return stripped;
  }
  throw new Error(
    `\u7F3A\u5C11\u6216\u975E\u6CD5 agent\u3002\u5141\u8BB8\u503C\uFF1A${AGENT_ROLES.join(", ")}\uFF08\u4EA6\u63A5\u53D7 harness-<role> \u524D\u7F00\uFF09`
  );
}
function normalizeEvent(value) {
  if (value === "started" || value === "completed") {
    return value;
  }
  throw new Error("\u7F3A\u5C11\u6216\u975E\u6CD5 event\u3002\u5141\u8BB8\u503C\uFF1Astarted, completed");
}
async function runHostAgentEvent(flags, positionals) {
  const workDir = process.cwd();
  const agent = normalizeAgent(readStringFlag3(flags, "agent") || positionals[0] || "");
  const event = normalizeEvent(readStringFlag3(flags, "event") || positionals[1] || "started");
  const activeTaskId = await readActiveTaskId3(workDir);
  const taskId = readStringFlag3(flags, "task-id") || activeTaskId || null;
  const model = readStringFlag3(flags, "model") || null;
  await appendHarnessEvent(workDir, {
    type: `subagent.${event}`,
    role: agent,
    agent: `harness-${agent}`,
    taskId,
    model
  });
  printJson({
    recorded: true,
    type: `subagent.${event}`,
    role: agent,
    agent: `harness-${agent}`,
    taskId,
    model
  });
}

// src/commands/host/artifact-guard.ts
import { resolve } from "path";
function readStringFlag4(flags, name) {
  const value = flags[name];
  return typeof value === "string" ? value : "";
}
async function runHostArtifactGuard(flags) {
  const cwd = process.cwd();
  let filePath = readStringFlag4(flags, "file");
  const taskId = readStringFlag4(flags, "task-id") || void 0;
  if (!filePath) {
    process.stdout.write(JSON.stringify({ allowed: false, reason: "\u7F3A\u5C11 --file \u53C2\u6570" }));
    return;
  }
  filePath = resolve(cwd, filePath);
  const result = await checkWritePermission(cwd, filePath, taskId);
  process.stdout.write(`${JSON.stringify(result)}
`);
}

// src/commands/host/completion-gate.ts
import { access as access6, readFile as readFile15 } from "fs/promises";
import path19 from "path";
async function fileExists5(filePath) {
  try {
    await access6(filePath);
    return true;
  } catch {
    return false;
  }
}
async function loadReportCommitReady(filePath) {
  try {
    const report = JSON.parse(await readFile15(filePath, "utf8"));
    return report.commitReady ?? null;
  } catch {
    return null;
  }
}
async function loadContractIfExists(filePath) {
  try {
    return parseContract(await readFile15(filePath, "utf8"));
  } catch {
    return null;
  }
}
function isCompletionClaim(message) {
  return /(完成|done|fixed|已修复|搞定|完成了)/i.test(message);
}
async function countPreviousBlocks(workDir, taskId) {
  const eventsFile = path19.join(getHarnessPaths(workDir).harnessDir, "events.jsonl");
  try {
    const text = await readFile15(eventsFile, "utf8");
    let count = 0;
    for (const line of text.split(/\r?\n/)) {
      if (line.includes('"type":"host.completion_gate_blocked"') && line.includes(`"activeTaskId":"${taskId}"`)) {
        count++;
      }
    }
    return count;
  } catch {
    return 0;
  }
}
async function resolveCompletionRecommendedAgent(workDir, activeTaskId) {
  const manifests = await loadAgentManifests(workDir);
  const enabledRoles = collectEnabledRoles(manifests);
  let stage = null;
  let failureStage = null;
  try {
    const ctx = await new TaskManager().load(activeTaskId, workDir);
    stage = ctx.state.currentStage;
    failureStage = ctx.state.lastFailureStage ?? null;
  } catch {
  }
  const targetStage = failureStage ?? stage;
  const agent = pickRecommendedAgent("completion_review", targetStage, enabledRoles);
  return { agent, stage, failureStage };
}
async function runHostCompletionGate(flags, positionals) {
  const workDir = process.cwd();
  const message = (typeof flags.message === "string" ? flags.message : "") || positionals.join(" ").trim();
  const activeTaskId = await readActiveTaskId3(workDir);
  if (!activeTaskId) {
    printJson({
      pass: true,
      reason: "no_active_task"
    });
    return;
  }
  const paths = getHarnessPaths(workDir);
  const reportFile = path19.join(paths.tasksDir, activeTaskId, "report.json");
  const contractFile = path19.join(paths.tasksDir, activeTaskId, "contract.yaml");
  const evalCommand = `harnessly eval ${activeTaskId}`;
  const changedFiles = await collectChangedFiles(workDir);
  const contract = await loadContractIfExists(contractFile);
  const scopeCheck = runScopeCheck(contract ?? void 0, changedFiles);
  const recommendation = await resolveCompletionRecommendedAgent(workDir, activeTaskId);
  const recommendedAgent = recommendation.agent;
  const activeStage = recommendation.stage;
  const lastFailureStage = recommendation.failureStage;
  if (scopeCheck.status === "failed") {
    const blockCount = await countPreviousBlocks(workDir, activeTaskId);
    const requiresEvaluator = true;
    await appendHarnessEvent(workDir, {
      type: "host.completion_gate_blocked",
      reason: "scope_violation",
      activeTaskId,
      activeStage,
      lastFailureStage,
      detail: scopeCheck.detail,
      scopeCheck,
      blockCount: blockCount + 1,
      requiresEvaluator,
      recommendedAgent,
      evalCommand,
      nextStep: blockCount > 0 ? "must_fix_scope_then_eval" : "fix_scope_violation_then_rerun"
    });
    printJson({
      pass: false,
      reason: "scope_violation",
      activeTaskId,
      activeStage,
      lastFailureStage,
      scopeCheck,
      blockCount: blockCount + 1,
      requiresEvaluator,
      recommendedAgent,
      evalCommand,
      nextStep: blockCount > 0 ? "must_fix_scope_then_eval" : "fix_scope_violation_then_rerun"
    });
    return;
  }
  const hasReport = await fileExists5(reportFile);
  const commitReady = hasReport ? await loadReportCommitReady(reportFile) : null;
  if (isCompletionClaim(message) && !hasReport) {
    const blockCount = await countPreviousBlocks(workDir, activeTaskId);
    const requiresEvaluator = true;
    await appendHarnessEvent(workDir, {
      type: "host.completion_gate_blocked",
      reason: "report_not_ready",
      activeTaskId,
      activeStage,
      lastFailureStage,
      scopeCheck,
      blockCount: blockCount + 1,
      requiresEvaluator,
      recommendedAgent,
      evalCommand,
      nextStep: blockCount > 0 ? "must_run_eval" : "delegate_to_evaluator_or_run_eval"
    });
    printJson({
      pass: false,
      reason: "report_not_ready",
      activeTaskId,
      activeStage,
      lastFailureStage,
      scopeCheck,
      blockCount: blockCount + 1,
      requiresEvaluator,
      recommendedAgent,
      evalCommand,
      nextStep: blockCount > 0 ? "must_run_eval" : "delegate_to_evaluator_or_run_eval"
    });
    return;
  }
  if (isCompletionClaim(message) && commitReady === false) {
    const blockCount = await countPreviousBlocks(workDir, activeTaskId);
    const requiresEvaluator = true;
    await appendHarnessEvent(workDir, {
      type: "host.completion_gate_blocked",
      reason: "commit_gate_not_passed",
      activeTaskId,
      activeStage,
      lastFailureStage,
      scopeCheck,
      blockCount: blockCount + 1,
      requiresEvaluator,
      recommendedAgent,
      evalCommand,
      nextStep: blockCount > 0 ? "must_fix_and_rerun_eval" : "fix_findings_then_rerun_eval"
    });
    printJson({
      pass: false,
      reason: "commit_gate_not_passed",
      activeTaskId,
      activeStage,
      lastFailureStage,
      scopeCheck,
      blockCount: blockCount + 1,
      requiresEvaluator,
      recommendedAgent,
      evalCommand,
      nextStep: blockCount > 0 ? "must_fix_and_rerun_eval" : "fix_findings_then_rerun_eval"
    });
    return;
  }
  printJson({
    pass: true,
    reason: hasReport ? commitReady ? "commit_ready" : "report_ready" : "no_completion_claim",
    activeTaskId,
    activeStage,
    scopeCheck
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

// src/commands/host/resident-review.ts
function readStringFlag5(flags, name) {
  const value = flags[name];
  return typeof value === "string" ? value : "";
}
async function runHostResidentReview(flags) {
  const workDir = process.cwd();
  const trigger = readStringFlag5(flags, "trigger");
  if (!trigger || !["pre_push", "pre_merge", "on_demand"].includes(trigger)) {
    throw new Error("--trigger \u5FC5\u987B\u4E3A pre_push\u3001pre_merge \u6216 on_demand");
  }
  const taskId = readStringFlag5(flags, "task-id") || void 0;
  const result = await runResidentReview(workDir, trigger, taskId);
  if (flags.json) {
    printJson(result);
    return;
  }
  printLines([
    `\u5E38\u9A7B review \u5B8C\u6210 (trigger: ${trigger})`,
    `- spawned agents: ${result.agentsSpawned.join(", ") || "(none)"}`,
    `- findings: ${result.findings.length}`,
    `- blocking: ${result.hadBlockingFinding}`
  ]);
  if (result.hadBlockingFinding) {
    process.exit(1);
  }
}

// src/commands/host/session-start.ts
function pickRecommendation(hasActiveTask, status) {
  if (!hasActiveTask) {
    return "idle";
  }
  if (status === "blocked" || status === "aborted") {
    return "retry";
  }
  return "resume";
}
async function runHostSessionStart() {
  const activeTaskId = await readActiveTaskId3(process.cwd());
  let task = null;
  let retryCount = 0;
  let lastFailureReason = null;
  let status = null;
  if (activeTaskId) {
    const ctx = await new TaskManager().load(activeTaskId, process.cwd());
    status = ctx.state.status;
    task = {
      goal: ctx.goal,
      status: ctx.state.status,
      currentStage: ctx.state.currentStage,
      lastFailureStage: ctx.state.lastFailureStage ?? null
    };
    retryCount = ctx.state.retryCount;
    lastFailureReason = ctx.state.lastFailureReason ?? null;
  }
  printJson({
    hasActiveTask: Boolean(activeTaskId),
    activeTaskId,
    task,
    retryCount,
    lastFailureReason,
    recommendation: pickRecommendation(Boolean(activeTaskId), status)
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

// src/utils/planner-fallback.ts
import { readFile as readFile16, writeFile as writeFile12, unlink as unlink2 } from "fs/promises";
import path20 from "path";
function getPendingFile(workDir) {
  return path20.join(getHarnessPaths(workDir).harnessDir, "pending-planner-delegation.json");
}
async function readPendingDelegation(workDir) {
  try {
    return JSON.parse(await readFile16(getPendingFile(workDir), "utf8"));
  } catch {
    return null;
  }
}
async function writePendingDelegation(workDir, prompt) {
  await writeFile12(
    getPendingFile(workDir),
    JSON.stringify({ prompt, timestamp: (/* @__PURE__ */ new Date()).toISOString() }),
    "utf8"
  );
}
async function clearPendingDelegation(workDir) {
  try {
    await unlink2(getPendingFile(workDir));
  } catch {
  }
}

// src/commands/host/user-prompt-submit.ts
function isHostInternalPrompt(prompt) {
  const normalized = prompt.trim();
  return normalized.includes("You will be presented with a user prompt") && normalized.includes("short title for a task") && normalized.includes("Generate a concise UI title");
}
function containsAny(prompt, patterns) {
  return patterns.some((pattern) => pattern.test(prompt));
}
function detectChangeKind(prompt) {
  const normalized = prompt.trim();
  if (containsAny(normalized, [/(修复|修一下|bug|报错|失败|异常|不对|不能|无法|fix)/i])) {
    return "bug_fix";
  }
  if (containsAny(normalized, [/(文档|README|说明|设计文档|试用文档|更新.*文档|补.*文档)/i])) {
    return "doc_change";
  }
  if (containsAny(normalized, [/(配置|config|yaml|toml|json|hook|模型配置|设置)/i])) {
    return "config_change";
  }
  if (containsAny(normalized, [/(测试|用例|test|spec|覆盖)/i])) {
    return "test_change";
  }
  if (containsAny(normalized, [/(重构|refactor|整理代码|抽象)/i])) {
    return "refactor";
  }
  if (containsAny(normalized, [/(实现|新增|添加|修改|删除|接入|落地|改造|优化|调整|升级|补上|补充|更新|implement|add|update|remove)/i])) {
    return "code_change";
  }
  return null;
}
function isQuestionOnly(prompt) {
  const normalized = prompt.trim();
  const hasQuestionIntent = containsAny(normalized, [
    /^(为什么|为何|怎么|如何|哪里|在哪|能不能解释|请解释|分析一下|看看|查一下)/i,
    /(是什么|有什么区别|原因|怎么看|如何验证|怎么验证|是否|有没有|\?)$/i
  ]);
  return hasQuestionIntent && detectChangeKind(normalized) === null;
}
function detectRisk(prompt, taskKind) {
  const normalized = prompt.trim();
  if (containsAny(normalized, [/(数据库|迁移|权限|认证|支付|安全|删除数据|生产|破坏性|高风险|回滚|schema|migration)/i])) {
    return "high";
  }
  if (taskKind === "refactor" || containsAny(normalized, [/(跨模块|架构|大范围|重构|多个项目|主路径|runtime)/i])) {
    return "medium";
  }
  return "low";
}
function classifyPrompt(prompt, hasActiveTask, allowFallbackCreate) {
  if (!prompt.trim()) {
    return {
      action: "chat",
      reason: "empty_prompt",
      taskKind: "empty",
      risk: "low",
      confidence: 1
    };
  }
  if (isHostInternalPrompt(prompt)) {
    return {
      action: "chat",
      reason: "host_internal_prompt",
      taskKind: "host_internal",
      risk: "low",
      confidence: 1
    };
  }
  if (hasActiveTask && /(继续|resume|接着|延续)/i.test(prompt)) {
    return {
      action: "resume_task",
      reason: "resume_active_task",
      taskKind: "resume",
      risk: "low",
      confidence: 1
    };
  }
  if (hasActiveTask && /(当前任务|这个任务|继续修复|继续做)/i.test(prompt)) {
    return {
      action: "resume_task",
      reason: "resume_active_task",
      taskKind: "resume",
      risk: "low",
      confidence: 1
    };
  }
  if (isQuestionOnly(prompt)) {
    return {
      action: "chat",
      reason: "matched_question_intent",
      taskKind: "question",
      risk: "low",
      confidence: 0.95
    };
  }
  const taskKind = detectChangeKind(prompt);
  if (taskKind) {
    return {
      action: allowFallbackCreate ? "create_task" : "delegate_to_planner",
      reason: "matched_change_intent",
      taskKind,
      risk: detectRisk(prompt, taskKind),
      confidence: 0.9
    };
  }
  return {
    action: "chat",
    reason: "ambiguous_intent",
    taskKind: "question",
    risk: "low",
    confidence: 0.4
  };
}
function applyLearnedDecision(base, prompt, feedbackEntries) {
  if (base.reason === "empty_prompt" || base.reason === "host_internal_prompt" || base.reason === "resume_active_task") {
    return base;
  }
  const learned = classifyByIntakeFeedback(prompt, feedbackEntries);
  if (!learned) {
    return base;
  }
  return {
    action: learned.action,
    reason: learned.reason,
    taskKind: learned.action === "chat" ? "question" : base.taskKind,
    risk: base.risk,
    confidence: learned.confidence,
    learnedFrom: learned.matchedEntryIds
  };
}
async function resolveRecommendedAgent(workDir, action, activeStage) {
  if (action !== "delegate_to_planner" && action !== "resume_task") {
    return null;
  }
  const manifests = await loadAgentManifests(workDir);
  const enabledRoles = collectEnabledRoles(manifests);
  if (action === "delegate_to_planner") {
    return pickRecommendedAgent("new_task", null, enabledRoles);
  }
  return pickRecommendedAgent("resume_task", activeStage, enabledRoles);
}
async function runHostUserPromptSubmit(flags, positionals) {
  const workDir = process.cwd();
  const prompt = (typeof flags.prompt === "string" ? flags.prompt : "") || positionals.join(" ").trim();
  const manager = new TaskManager();
  const config = await loadHarnessConfig(workDir);
  const activeTaskId = await readActiveTaskId3(workDir);
  let activeStage = null;
  if (activeTaskId) {
    try {
      const ctx = await manager.load(activeTaskId, workDir);
      activeStage = ctx.state.currentStage;
    } catch {
    }
  }
  const pending = await readPendingDelegation(workDir);
  const feedbackEntries = await loadIntakeFeedback(workDir);
  const builtinDecision = classifyPrompt(
    prompt,
    Boolean(activeTaskId),
    config.fallbackCreateTaskWithoutPlanner || pending !== null
  );
  const decision = applyLearnedDecision(builtinDecision, prompt, feedbackEntries);
  const { action } = decision;
  const recommendedAgent = await resolveRecommendedAgent(workDir, action, activeStage);
  await appendHarnessEvent(workDir, {
    type: "host.intake_decision",
    host: config.defaultHost,
    action,
    reason: decision.reason,
    taskKind: decision.taskKind,
    risk: decision.risk,
    confidence: decision.confidence,
    learnedFrom: decision.learnedFrom,
    activeTaskId,
    activeStage,
    recommendedAgent,
    taskCreated: false
  });
  await writeLastIntakeDecision(workDir, {
    prompt,
    action,
    reason: decision.reason,
    taskKind: decision.taskKind,
    risk: decision.risk
  });
  if (action === "create_task") {
    await clearPendingDelegation(workDir);
    const ctx = await manager.create(prompt, workDir);
    const engine = new WorkflowEngine(manager);
    await engine.run(ctx, {
      adapterKind: ctx.config.adapterKind,
      adapterCommand: ctx.config.adapterCommand,
      dryRun: true
    });
    await appendHarnessEvent(workDir, {
      type: "host.task_created",
      host: config.defaultHost,
      action,
      activeTaskId: ctx.taskId,
      taskCreated: true,
      contractPath: `${ctx.taskDir}/contract.yaml`,
      planPath: `${ctx.taskDir}/plan.md`
    });
    printJson({
      prompt,
      activeTaskId: ctx.taskId,
      activeStage: ctx.state.currentStage,
      action,
      reason: decision.reason,
      taskKind: decision.taskKind,
      risk: decision.risk,
      confidence: decision.confidence,
      learnedFrom: decision.learnedFrom,
      taskCreated: true,
      taskId: ctx.taskId,
      contractPath: `${ctx.taskDir}/contract.yaml`,
      planPath: `${ctx.taskDir}/plan.md`,
      recommendedAgent: null,
      autoFallback: pending !== null,
      nextStep: "review_contract_and_plan"
    });
    return;
  }
  if (action === "delegate_to_planner") {
    await writePendingDelegation(workDir, prompt);
  }
  printJson({
    prompt,
    activeTaskId,
    activeStage,
    action,
    reason: decision.reason,
    taskKind: decision.taskKind,
    risk: decision.risk,
    confidence: decision.confidence,
    learnedFrom: decision.learnedFrom,
    taskCreated: false,
    recommendedAgent,
    fallbackCreateTaskWithoutPlanner: config.fallbackCreateTaskWithoutPlanner,
    autoFallback: false,
    nextStep: action === "resume_task" ? "resume_existing_task" : action === "delegate_to_planner" ? "delegate_to_planner" : "no_action"
  });
}

// src/commands/eval.ts
function createEvalOnlyAdapter() {
  return {
    kind: "custom",
    command: "eval-only",
    exitCode: 0,
    stdout: "",
    stderr: ""
  };
}
async function runEval(flags, positionals) {
  const workDir = process.cwd();
  const manager = new TaskManager();
  const requestedTaskId = (typeof flags["task-id"] === "string" ? flags["task-id"] : "") || (positionals[0] ?? "").trim();
  const taskId = requestedTaskId || await manager.getLatestTaskId(workDir);
  if (!taskId) {
    throw new Error("\u6CA1\u6709\u53EF\u91CD\u9A8C\u8BC1\u7684 task\u3002\u8BF7\u5148\u6267\u884C harnessly run\u3002");
  }
  const ctx = await manager.resume(taskId, workDir);
  const previousReport = await manager.loadReport(taskId, workDir);
  ctx.state.status = "active";
  ctx.state.currentStage = "test";
  ctx.state.currentOwner = "tester";
  await manager.saveState(ctx);
  const evidence = await collectEvidence(workDir, ctx.config, ctx.contract);
  const adapter = previousReport?.adapter ?? createEvalOnlyAdapter();
  const commitGate = evaluateCommitGate(evidence, adapter.exitCode);
  const report = createTaskReport(ctx, adapter, evidence, commitGate);
  await manager.saveReport(ctx, report);
  await appendHarnessEvent(workDir, {
    type: "eval.report_written",
    taskId: ctx.taskId,
    reportPath: `${ctx.taskDir}/report.json`,
    commitReady: report.commitReady
  });
  printLines([
    report.commitReady ? "\u91CD\u9A8C\u8BC1\u5B8C\u6210\uFF0Ccommit gate \u901A\u8FC7" : "\u91CD\u9A8C\u8BC1\u5B8C\u6210\uFF0C\u4F46 commit gate \u672A\u901A\u8FC7",
    `- task_id: ${ctx.taskId}`,
    `- report: ${ctx.taskDir}/report.json`,
    `- changed_files: ${report.evidence.changedFiles.length > 0 ? report.evidence.changedFiles.join(", ") : "none"}`,
    `- commit_ready: ${report.commitReady}`
  ]);
}

// src/commands/list.ts
async function runList(flags) {
  const manager = new TaskManager();
  const workDir = process.cwd();
  const [tasks, activeTaskId] = await Promise.all([
    manager.listTasks(workDir),
    readActiveTaskId3(workDir)
  ]);
  if (flags.json === true) {
    printJson({
      activeTaskId,
      tasks
    });
    return;
  }
  if (tasks.length === 0) {
    printLines(["Tasks", '- \u5F53\u524D\u6CA1\u6709 task\u3002\u5148\u6267\u884C harnessly run "<goal>" \u521B\u5EFA\u4EFB\u52A1\u3002']);
    return;
  }
  printLines([
    "Tasks",
    ...tasks.map(
      (task) => `- ${task.taskId}${task.taskId === activeTaskId ? " [active]" : ""}: status=${task.status}, stage=${task.currentStage}, retry=${task.retryCount}, updated_at=${task.updatedAt}, goal=${task.goal}`
    )
  ]);
}

// src/commands/retry.ts
async function runRetry(flags, positionals) {
  const workDir = process.cwd();
  const manager = new TaskManager();
  const requestedTaskId = (typeof flags["task-id"] === "string" ? flags["task-id"] : "") || (positionals[0] ?? "").trim();
  const taskId = requestedTaskId || await manager.getLatestTaskId(workDir);
  if (!taskId) {
    throw new Error("\u6CA1\u6709\u53EF\u91CD\u8BD5\u7684 task\u3002\u8BF7\u5148\u6267\u884C harnessly run\u3002");
  }
  const ctx = await manager.resume(taskId, workDir);
  if (!ctx.contract || !ctx.plan) {
    throw new Error(`task ${taskId} \u7F3A\u5C11 contract \u6216 plan\uFF0C\u4E0D\u80FD\u4ECE execute \u9636\u6BB5\u91CD\u8BD5`);
  }
  const adapterKind = typeof flags.adapter === "string" ? flags.adapter : ctx.config.adapterKind;
  const adapterCommand = (typeof flags["adapter-command"] === "string" ? flags["adapter-command"] : ctx.config.adapterCommand) || "";
  const engine = new WorkflowEngine(manager);
  const result = await engine.run(ctx, {
    adapterKind,
    adapterCommand,
    dryRun: false,
    resumeFrom: "execute"
  });
  if (!result.report) {
    throw new Error("retry \u672A\u751F\u6210 report");
  }
  printLines([
    result.report.commitReady ? "\u4EFB\u52A1\u91CD\u8BD5\u5B8C\u6210\uFF0Ccommit gate \u901A\u8FC7" : "\u4EFB\u52A1\u91CD\u8BD5\u7ED3\u675F\uFF0C\u4F46 commit gate \u672A\u901A\u8FC7",
    `- task_id: ${ctx.taskId}`,
    `- retry_count: ${ctx.state.retryCount}`,
    `- report: ${ctx.taskDir}/report.json`,
    `- commit_ready: ${result.report.commitReady}`
  ]);
}

// src/utils/interaction.ts
import { createInterface } from "readline/promises";
function shouldAutoConfirm(flags, streams = {
  input: process.stdin,
  output: process.stdout,
  env: process.env
}) {
  if (flags["skip-confirm"] === true) {
    return true;
  }
  if (streams.env.CI === "true") {
    return true;
  }
  return streams.input.isTTY !== true || streams.output.isTTY !== true;
}
function normalizeConfirmationAnswer(answer) {
  const normalized = answer.trim().toLowerCase();
  if (normalized === "y" || normalized === "yes") {
    return true;
  }
  if (normalized === "n" || normalized === "no") {
    return false;
  }
  return null;
}
async function confirmContract(summary, flags, streams = {
  input: process.stdin,
  output: process.stdout,
  env: process.env
}) {
  if (shouldAutoConfirm(flags, streams)) {
    return true;
  }
  printLines([
    "Contract \u5F85\u786E\u8BA4",
    `- task_id: ${summary.taskId}`,
    `- goal: ${summary.goal}`,
    `- template: ${summary.templateName}`,
    `- contract: ${summary.contractPath}`,
    `- plan: ${summary.planPath}`
  ]);
  const readline = createInterface({
    input: streams.input,
    output: streams.output
  });
  try {
    while (true) {
      const answer = normalizeConfirmationAnswer(
        await readline.question("\u786E\u8BA4 contract \u4E0E plan\uFF1F(y/n) ")
      );
      if (answer !== null) {
        return answer;
      }
      streams.output.write("\u8BF7\u8F93\u5165 y \u6216 n\u3002\n");
    }
  } finally {
    readline.close();
  }
}

// src/commands/run.ts
function normalizeGoal(positionals, flags) {
  if (typeof flags.goal === "string" && flags.goal.trim()) {
    return flags.goal.trim();
  }
  return positionals.join(" ").trim();
}
async function runTask(flags, positionals) {
  const workDir = process.cwd();
  const manager = new TaskManager();
  if (typeof flags.resume === "string" && flags.resume.trim()) {
    const ctx2 = await manager.resume(flags.resume.trim(), workDir);
    printLines([
      "\u4EFB\u52A1\u5DF2\u6062\u590D",
      `- task_id: ${ctx2.taskId}`,
      `- goal: ${ctx2.goal}`,
      `- status: ${ctx2.state.status}`,
      `- current_stage: ${ctx2.state.currentStage}`,
      `- retry_count: ${ctx2.state.retryCount}`,
      `- last_failure: ${ctx2.state.lastFailureReason ?? "none"}`
    ]);
    return;
  }
  const goal = normalizeGoal(positionals, flags);
  if (!goal) {
    throw new Error('\u7F3A\u5C11 goal\u3002\u7528\u6CD5\uFF1Aharnessly run --dry-run "<goal>"');
  }
  const ctx = await manager.create(goal, workDir);
  const isDryRun = flags["dry-run"] === true;
  const adapterKind = typeof flags.adapter === "string" ? flags.adapter : ctx.config.adapterKind;
  const adapterCommand = (typeof flags["adapter-command"] === "string" ? flags["adapter-command"] : ctx.config.adapterCommand) || "";
  const engine = new WorkflowEngine(manager);
  await engine.run(ctx, {
    adapterKind,
    adapterCommand,
    dryRun: true
  });
  const confirmed = await confirmContract(
    {
      taskId: ctx.taskId,
      goal: ctx.goal,
      templateName: ctx.contract?.templateName ?? "unknown",
      contractPath: `${ctx.taskDir}/contract.yaml`,
      planPath: `${ctx.taskDir}/plan.md`
    },
    flags
  );
  if (!confirmed) {
    printLines([
      "contract \u672A\u786E\u8BA4\uFF0C\u4EFB\u52A1\u5DF2\u4FDD\u7559",
      `- task_id: ${ctx.taskId}`,
      `- contract: ${ctx.taskDir}/contract.yaml`,
      `- plan: ${ctx.taskDir}/plan.md`,
      `- status: ${ctx.state.status}`
    ]);
    return;
  }
  if (isDryRun) {
    printLines([
      "dry-run \u5DF2\u751F\u6210 contract \u4E0E plan",
      `- task_id: ${ctx.taskId}`,
      `- template: ${ctx.contract?.templateName ?? "unknown"}`,
      `- contract: ${ctx.taskDir}/contract.yaml`,
      `- plan: ${ctx.taskDir}/plan.md`,
      `- confirmed: true`,
      `- status: ${ctx.state.status}`
    ]);
    return;
  }
  const result = await engine.run(ctx, {
    adapterKind,
    adapterCommand,
    dryRun: false,
    resumeFrom: "design"
  });
  if (!result.dryRun && result.report) {
    printLines([
      result.report.commitReady ? "\u4EFB\u52A1\u6267\u884C\u5B8C\u6210\uFF0Ccommit gate \u901A\u8FC7" : "\u4EFB\u52A1\u6267\u884C\u7ED3\u675F\uFF0C\u4F46 commit gate \u672A\u901A\u8FC7",
      `- task_id: ${ctx.taskId}`,
      `- adapter: ${adapterKind}`,
      `- report: ${ctx.taskDir}/report.json`,
      `- changed_files: ${result.report.evidence.changedFiles.length > 0 ? result.report.evidence.changedFiles.join(", ") : "none"}`,
      `- commit_ready: ${result.report.commitReady}`
    ]);
    return;
  }
}

// src/commands/status.ts
function resolveRequestedTaskId(flags, positionals) {
  if (typeof flags["task-id"] === "string" && flags["task-id"].trim()) {
    return flags["task-id"].trim();
  }
  return (positionals[0] ?? "").trim();
}
async function runStatus(flags, positionals) {
  const workDir = process.cwd();
  const manager = new TaskManager();
  const requestedTaskId = resolveRequestedTaskId(flags, positionals);
  const [activeTaskId, latestTaskId, hosts] = await Promise.all([
    readActiveTaskId3(workDir),
    manager.getLatestTaskId(workDir),
    collectHostStatus(workDir)
  ]);
  const selectedTaskId = requestedTaskId || activeTaskId || latestTaskId;
  if (!selectedTaskId) {
    if (flags.json === true) {
      printJson({
        activeTaskId,
        selectedTaskId: null,
        task: null,
        hosts
      });
      return;
    }
    printLines([
      "\u4EFB\u52A1\u72B6\u6001",
      '- \u5F53\u524D\u6CA1\u6709 task\u3002\u5148\u6267\u884C harnessly run "<goal>" \u521B\u5EFA\u4EFB\u52A1\u3002',
      ...hosts.map(
        (host) => `- host ${host.host}: manifest=${host.manifest}, shell=${host.shell}, files=${host.files.length > 0 ? host.files.join(", ") : "none"}`
      )
    ]);
    return;
  }
  const [ctx, report] = await Promise.all([
    manager.load(selectedTaskId, workDir),
    manager.loadReport(selectedTaskId, workDir)
  ]);
  const task = {
    taskId: ctx.taskId,
    goal: ctx.goal,
    status: ctx.state.status,
    currentStage: ctx.state.currentStage,
    retryCount: ctx.state.retryCount,
    contractReady: Boolean(ctx.contract),
    planReady: Boolean(ctx.plan),
    reportReady: report !== null,
    commitReady: report?.commitReady ?? null,
    changedFiles: report?.evidence.changedFiles ?? [],
    lastFailureStage: ctx.state.lastFailureStage ?? null,
    lastFailureReason: ctx.state.lastFailureReason ?? null,
    updatedAt: ctx.state.updatedAt
  };
  if (flags.json === true) {
    printJson({
      activeTaskId,
      selectedTaskId,
      task,
      hosts
    });
    return;
  }
  printLines([
    "\u4EFB\u52A1\u72B6\u6001",
    `- selected_task: ${selectedTaskId}`,
    `- active_task: ${activeTaskId ?? "none"}`,
    `- goal: ${task.goal}`,
    `- status: ${task.status}`,
    `- current_stage: ${task.currentStage}`,
    `- retry_count: ${task.retryCount}`,
    `- contract_ready: ${task.contractReady}`,
    `- plan_ready: ${task.planReady}`,
    `- report_ready: ${task.reportReady}`,
    `- commit_ready: ${task.commitReady ?? "unknown"}`,
    `- changed_files: ${task.changedFiles.length > 0 ? task.changedFiles.join(", ") : "none"}`,
    `- last_failure_stage: ${task.lastFailureStage ?? "none"}`,
    `- last_failure: ${task.lastFailureReason ?? "none"}`,
    `- updated_at: ${task.updatedAt}`,
    ...hosts.map(
      (host) => `- host ${host.host}: manifest=${host.manifest}, shell=${host.shell}, files=${host.files.length > 0 ? host.files.join(", ") : "none"}`
    )
  ]);
}

// src/commands/template-promote.ts
async function runTemplatePromote(flags, positionals) {
  const workDir = process.cwd();
  const manager = new TaskManager();
  const requestedTaskId = (typeof flags["task-id"] === "string" ? flags["task-id"] : "") || (positionals[0] ?? "").trim();
  const taskId = requestedTaskId || await manager.getLatestTaskId(workDir);
  if (!taskId) {
    throw new Error("\u6CA1\u6709\u53EF\u63D0\u5347\u4E3A\u6A21\u677F\u7684 task\u3002\u8BF7\u5148\u6267\u884C harnessly run\u3002");
  }
  const ctx = await manager.load(taskId, workDir);
  const report = await manager.loadReport(taskId, workDir);
  if (!ctx.contract) {
    throw new Error(`task ${taskId} \u7F3A\u5C11 contract.yaml\uFF0C\u4E0D\u80FD\u63D0\u5347\u6A21\u677F`);
  }
  if (!report) {
    throw new Error(`task ${taskId} \u7F3A\u5C11 report.json\uFF0C\u4E0D\u80FD\u63D0\u5347\u6A21\u677F`);
  }
  if (!report.commitReady) {
    throw new Error(`task ${taskId} \u672A\u901A\u8FC7 commit gate\uFF0C\u4E0D\u80FD\u63D0\u5347\u6A21\u677F`);
  }
  const name = (typeof flags.name === "string" ? flags.name.trim() : "") || deriveTemplateName(ctx.goal);
  const template = createTemplateDraft(name, ctx.contract, report, ctx.config);
  const filePath = await saveTemplateDraft(workDir, template);
  printLines([
    "\u6A21\u677F\u63D0\u5347\u5B8C\u6210",
    `- task_id: ${taskId}`,
    `- name: ${template.name}`,
    `- template: ${filePath}`
  ]);
}

// src/utils/args.ts
var BOOLEAN_FLAGS = /* @__PURE__ */ new Set([
  "dry-run",
  "skip-confirm",
  "deep-eval",
  "json",
  "force",
  "last"
]);
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
    if (BOOLEAN_FLAGS.has(name) || !next || next.startsWith("--")) {
      flags[name] = true;
      continue;
    }
    flags[name] = next;
    index += 1;
  }
  return { positionals, flags };
}

// src/version.ts
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve as resolve2 } from "path";
var __dirname = dirname(fileURLToPath(import.meta.url));
var pkg = JSON.parse(readFileSync(resolve2(__dirname, "../package.json"), "utf8"));
var CLI_PACKAGE_NAME = pkg.name;
var CLI_VERSION = pkg.version;

// src/run-cli.ts
function printUsage() {
  process.stdout.write(
    [
      "Usage:",
      "  harnessly --version",
      "  harnessly init [--host claude-code|codex|gemini-cli] [--force]",
      "  harnessly eval [task-id]",
      "  harnessly list [--json]",
      "  harnessly status [task-id] [--json]",
      '  harnessly retry [task-id] [--adapter custom|codex --adapter-command "<cmd>"]',
      '  harnessly run --dry-run [--skip-confirm] "<goal>"',
      "  harnessly run --resume <task-id>",
      '  harnessly run [--skip-confirm] --adapter custom|codex --adapter-command "<cmd>" "<goal>"',
      "  harnessly template promote [task-id] [--name <template-name>]",
      "  harnessly archive promote <task-id> --topic=<slug> --files=<list> [--mode=<mode>] [--json]",
      "  harnessly archive list [--json]",
      "  harnessly archive show <topic> [--json]",
      "  harnessly archive verify [--json]",
      "  harnessly evidence baseline [--show] [--clear] [--json]",
      "  harnessly feedback list",
      "  harnessly feedback promote <task-id> [reason]",
      "  harnessly intake feedback list|add|remove|clear",
      "  harnessly host install [--host auto|all|claude-code|codex|gemini-cli]",
      "  harnessly host status [--json]",
      "  harnessly host sync [--host auto|all|claude-code|codex|gemini-cli]",
      "  harnessly host session-start",
      '  harnessly host user-prompt-submit [--prompt "..."]',
      '  harnessly host completion-gate [--message "..."]',
      "  harnessly host agent-event --agent harness-planner|harness-evaluator [--event started|completed] [--task-id <task-id>] [--model <model>]",
      "  harnessly host artifact-guard --file <path> [--task-id <id>]",
      "  harnessly host resident-review --trigger <pre_push|pre_merge> [--task-id <id>]"
    ].join("\n") + "\n"
  );
}
async function runCli(argv) {
  const parsed = parseArgs(argv);
  const [command, subcommand, ...rest] = parsed.positionals;
  if (parsed.flags.version === true || command === "version") {
    process.stdout.write(`${CLI_PACKAGE_NAME} ${CLI_VERSION}
`);
    return;
  }
  if (!command || command === "--help" || command === "help") {
    printUsage();
    return;
  }
  if (command === "init") {
    await runInit(parsed.flags);
    return;
  }
  if (command === "list") {
    await runList(parsed.flags);
    return;
  }
  if (command === "status") {
    await runStatus(parsed.flags, [subcommand, ...rest].filter(Boolean));
    return;
  }
  if (command === "eval") {
    await runEval(parsed.flags, [subcommand, ...rest].filter(Boolean));
    return;
  }
  if (command === "run") {
    await runTask(parsed.flags, [subcommand, ...rest].filter(Boolean));
    return;
  }
  if (command === "retry") {
    await runRetry(parsed.flags, [subcommand, ...rest].filter(Boolean));
    return;
  }
  if (command === "template" && subcommand === "promote") {
    await runTemplatePromote(parsed.flags, rest);
    return;
  }
  if (command === "archive") {
    await runArchive(parsed.flags, [subcommand, ...rest].filter(Boolean));
    return;
  }
  if (command === "evidence" && subcommand === "baseline") {
    await runEvidenceBaseline(parsed.flags);
    return;
  }
  if (command === "feedback") {
    await runFeedback([subcommand, ...rest].filter(Boolean));
    return;
  }
  if (command === "intake") {
    await runIntake(parsed.flags, [subcommand, ...rest].filter(Boolean));
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
      case "agent-event":
        await runHostAgentEvent(parsed.flags, rest);
        return;
      case "artifact-guard":
        await runHostArtifactGuard(parsed.flags);
        return;
      case "resident-review":
        await runHostResidentReview(parsed.flags);
        return;
      default:
        printUsage();
        return;
    }
  }
  printUsage();
}

// src/index.ts
function getCliRuntimeSummary() {
  return {
    packageName: CLI_PACKAGE_NAME,
    version: CLI_VERSION,
    core: getCorePackageInfo()
  };
}
function formatCliError(error) {
  if (error instanceof Error) {
    const errorWithDetails = error;
    const pathValue = typeof errorWithDetails.path === "string" ? errorWithDetails.path : void 0;
    const isHarnessConfigMissing = errorWithDetails.code === "ENOENT" && (pathValue?.includes(".harness/harness.config.yaml") || error.message.includes(".harness/harness.config.yaml"));
    if (isHarnessConfigMissing) {
      return "\u5F53\u524D\u4ED3\u5E93\u5C1A\u672A\u521D\u59CB\u5316 Harnessly\u3002\u5148\u6267\u884C harnessly init\u3002";
    }
    return error.message;
  }
  return String(error);
}
runCli(process.argv.slice(2)).catch((error) => {
  const message = formatCliError(error);
  process.stderr.write(`${message}
`);
  process.exitCode = 1;
});
export {
  getCliRuntimeSummary
};
