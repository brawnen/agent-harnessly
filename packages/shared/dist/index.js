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
var templateNameSchema = z.enum(["bug-fix", "feature-simple", "general-task"]);
var riskLevelSchema = z.enum(["low", "medium", "high"]);
var adapterKindSchema = z.enum(["claude-code", "codex", "custom"]);
var hostSubagentConfigSchema = z.object({
  planner: z.object({
    useHostPlanMode: z.boolean(),
    models: z.object({
      "claude-code": z.string().min(1).optional(),
      codex: z.string().min(1).optional(),
      "gemini-cli": z.string().min(1).optional()
    })
  }),
  evaluator: z.object({
    models: z.object({
      "claude-code": z.string().min(1).optional(),
      codex: z.string().min(1).optional(),
      "gemini-cli": z.string().min(1).optional()
    })
  })
});
var taskStatusSchema = z.enum([
  "created",
  "contracting",
  "planning",
  "ready",
  "executing",
  "verifying",
  "passed",
  "failed"
]);
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
  hostSubagents: hostSubagentConfigSchema,
  adapterKind: adapterKindSchema,
  adapterCommand: z.string()
});
var contractSchema = z.object({
  goal: z.string().min(1),
  templateName: templateNameSchema,
  riskLevel: riskLevelSchema,
  scopeInclude: z.array(z.string()),
  scopeExclude: z.array(z.string()),
  acceptanceCriteria: z.array(z.string()),
  outOfScope: z.array(z.string())
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
  detail: z.string()
});
var evidenceResultSchema = z.object({
  checks: z.array(evidenceCheckResultSchema),
  changedFiles: z.array(z.string())
});
var commitDecisionSchema = z.enum(["pass", "block", "warn"]);
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
var taskReportSchema = z.object({
  taskId: z.string().min(1),
  goal: z.string().min(1),
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
export {
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
};
