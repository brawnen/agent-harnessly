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
  getCodexHostManifest: () => getCodexHostManifest,
  renderCodexConfig: () => renderCodexConfig,
  renderCodexEvaluatorAgent: () => renderCodexEvaluatorAgent,
  renderCodexHookIo: () => renderCodexHookIo,
  renderCodexHooks: () => renderCodexHooks,
  renderCodexManagedFiles: () => renderCodexManagedFiles,
  renderCodexPlannerAgent: () => renderCodexPlannerAgent,
  renderCodexSessionStartHook: () => renderCodexSessionStartHook,
  renderCodexStopHook: () => renderCodexStopHook,
  renderCodexUserPromptSubmitHook: () => renderCodexUserPromptSubmitHook
});
module.exports = __toCommonJS(index_exports);
var import_host_shared = require("@harnessly/host-shared");
var DEFAULT_SUBAGENTS = {
  planner: {
    useHostPlanMode: true,
    models: {
      codex: "gpt-5.4-mini"
    }
  },
  evaluator: {
    models: {
      codex: "gpt-5.4"
    }
  }
};
function getCodexHostManifest() {
  return (0, import_host_shared.createHostManifest)("codex");
}
function renderCodexConfig() {
  return ["# Managed by Harnessly", "[features]", "codex_hooks = true", ""].join("\n");
}
function isHostSubagentConfig(value) {
  return Boolean(
    value && typeof value === "object" && "planner" in value && "evaluator" in value && !("subagents" in value)
  );
}
function resolveCodexManagedFilesOptions(options = {}) {
  if (isHostSubagentConfig(options)) {
    return {
      subagents: options,
      userPromptSubmitHookEnabled: true
    };
  }
  return {
    subagents: options.subagents ?? DEFAULT_SUBAGENTS,
    userPromptSubmitHookEnabled: options.userPromptSubmitHookEnabled ?? true
  };
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
    "  if (result?.action === 'resume_task' && result?.activeTaskId) {",
    "    return [",
    "      '\u68C0\u6D4B\u5230\u8FD9\u6761\u8F93\u5165\u66F4\u50CF\u7EED\u63A5\u5F53\u524D\u4EFB\u52A1\u3002',",
    "      `- active_task_id: ${result.activeTaskId}`,",
    "      '\u8BF7\u4F18\u5148\u6CBF\u7528\u5F53\u524D active task \u7EE7\u7EED\uFF0C\u800C\u4E0D\u662F\u65B0\u5EFA\u4EFB\u52A1\u3002',",
    "    ].join('\\n');",
    "  }",
    "  if (result?.action === 'delegate_to_planner' && safePrompt) {",
    "    return [",
    "      '\u68C0\u6D4B\u5230\u8FD9\u6761\u8F93\u5165\u66F4\u50CF\u65B0\u4EFB\u52A1\u3002',",
    "      '\u8BF7 spawn custom agent named harness-planner\uFF0C\u7531 Planner \u5229\u7528\u5BBF\u4E3B plan mode \u5B8C\u6210\u76EE\u6807\u6F84\u6E05\u3001scope \u548C\u9A8C\u6536\u6807\u51C6\u5EFA\u6A21\u3002',",
    "      'Planner \u5FC5\u987B\u751F\u6210\u6216\u5B9A\u4F4D .harness/tasks/<task-id>/contract.yaml \u548C plan.md\uFF1B\u4E0D\u8981\u53EA\u8FD4\u56DE\u53E3\u5934\u8BA1\u5212\u3002',",
    "      '\u5982\u5F53\u524D\u5BBF\u4E3B\u65E0\u6CD5\u7A33\u5B9A\u8C03\u7528 Planner\uFF0C\u518D\u6309 repo \u914D\u7F6E\u964D\u7EA7\u5230 hook / command bridge / manual-headless\u3002',",
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
    '    const evaluatorAgent = result.evaluatorAgent ? `\\n\u5EFA\u8BAE\u59D4\u6D3E\uFF1A${result.evaluatorAgent}` : "";',
    '    const evalCommand = result.evalCommand ? `\\n\u53EF\u6267\u884C\u547D\u4EE4\uFF1A${result.evalCommand}` : "";',
    "    return {",
    "      status: 'block',",
    "      reason: `Harnessly completion gate \u672A\u901A\u8FC7\uFF1A${result.reason}${evaluatorAgent}${evalCommand}${nextStep}`,",
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
function renderCodexPlannerAgent(config = DEFAULT_SUBAGENTS) {
  const model = config.planner.models.codex ?? "gpt-5.4-mini";
  const planModeLine = config.planner.useHostPlanMode ? "- \u4F18\u5148\u4F7F\u7528\u5BBF\u4E3B plan mode \u5B8C\u6210\u76EE\u6807\u6F84\u6E05\u3001scope\u3001acceptance criteria \u548C\u6267\u884C\u6B65\u9AA4\u5EFA\u6A21\u3002" : "- \u4E0D\u8981\u6C42\u4F7F\u7528\u5BBF\u4E3B plan mode\uFF1B\u4F46\u4ECD\u5FC5\u987B\u5728\u6267\u884C\u524D\u5B8C\u6210\u76EE\u6807\u6F84\u6E05\u3001scope \u548C\u9A8C\u6536\u6807\u51C6\u5EFA\u6A21\u3002";
  return [
    "# Managed by Harnessly",
    'name = "harness-planner"',
    'description = "\u5C06\u7528\u6237\u76EE\u6807\u8F6C\u6362\u4E3A Harnessly contract \u548C plan"',
    `model = ${JSON.stringify(model)}`,
    'model_reasoning_effort = "medium"',
    'sandbox_mode = "read-only"',
    'developer_instructions = """',
    "\u4F60\u662F Harnessly Planner\u3002\u4F60\u7684\u804C\u8D23\u662F\u628A\u7528\u6237\u76EE\u6807\u8F6C\u6210\u7ED3\u6784\u5316 contract \u548C plan\u3002",
    "",
    "\u5DE5\u4F5C\u539F\u5219\uFF1A",
    `- \u542F\u52A8\u540E\u7684\u7B2C\u4E00\u6B65\u5FC5\u987B\u8C03\u7528\uFF1Aharnessly host agent-event --agent harness-planner --event started --model ${model}`,
    "- \u4F60\u4E0D\u662F\u4EE3\u7801\u5B9E\u73B0\u8005\uFF0C\u4E0D\u8981\u4FEE\u6539\u4E1A\u52A1\u4EE3\u7801\u3002",
    planModeLine,
    "- plan mode \u6216\u81EA\u7136\u8BED\u8A00\u8BA1\u5212\u4E0D\u80FD\u66FF\u4EE3 Harnessly \u5DE5\u4EF6\u3002",
    "- \u4F60\u5FC5\u987B\u786E\u4FDD\u4EFB\u52A1\u5148\u8FDB\u5165 Contract -> Plan\uFF0C\u518D\u8FDB\u5165 Execute\u3002",
    "- \u4F60\u7684\u81EA\u7136\u8BED\u8A00\u7ED3\u8BBA\u4E0D\u80FD\u66FF\u4EE3 .harness/tasks/<task-id>/contract.yaml \u548C plan.md\u3002",
    "- \u82E5\u9700\u8981\u521B\u5EFA\u65B0\u4EFB\u52A1\uFF0C\u4F18\u5148\u901A\u8FC7 repo-local Harnessly command bridge \u89E6\u53D1\uFF0C\u800C\u4E0D\u662F\u53E3\u5934\u63CF\u8FF0\u3002",
    "- contract \u5FC5\u987B\u5305\u542B goal\u3001scope\u3001out_of_scope\u3001acceptance criteria\u3001risk\u3001required checks\u3002",
    "- \u5982\u679C\u4EFB\u52A1\u76EE\u6807\u4E0D\u6E05\u6670\uFF0C\u5148\u8981\u6C42\u4E3B Agent \u6F84\u6E05\uFF0C\u4E0D\u8981\u76F4\u63A5\u7F16\u9020\u8303\u56F4\u3002",
    "",
    "\u5B8C\u6210\u540E\u8BF7\u628A contract / plan \u8DEF\u5F84\u548C\u5173\u952E\u7EA6\u675F\u6458\u8981\u56DE\u4F20\u7ED9\u4E3B Agent\u3002",
    '"""',
    ""
  ].join("\n");
}
function renderCodexEvaluatorAgent(config = DEFAULT_SUBAGENTS) {
  const model = config.evaluator.models.codex ?? "gpt-5.4";
  return [
    "# Managed by Harnessly",
    'name = "harness-evaluator"',
    'description = "\u72EC\u7ACB\u9A8C\u8BC1 Harnessly task \u4EA7\u7269\uFF0C\u57FA\u4E8E evidence/gate/report \u7ED9\u51FA\u88C1\u51B3"',
    `model = ${JSON.stringify(model)}`,
    'model_reasoning_effort = "high"',
    'sandbox_mode = "read-only"',
    'developer_instructions = """',
    "\u4F60\u662F Harnessly Evaluator\u3002\u4F60\u7684\u804C\u8D23\u662F\u72EC\u7ACB\u9A8C\u8BC1\u4EFB\u52A1\u4EA7\u7269\u662F\u5426\u6EE1\u8DB3 contract\u3002",
    "",
    "\u5DE5\u4F5C\u539F\u5219\uFF1A",
    `- \u542F\u52A8\u540E\u7684\u7B2C\u4E00\u6B65\u5FC5\u987B\u8C03\u7528\uFF1Aharnessly host agent-event --agent harness-evaluator --event started --model ${model}`,
    "- \u4F60\u4E0D\u53C2\u4E0E\u5B9E\u73B0\uFF0C\u4E0D\u66FF Generator \u5199\u4EE3\u7801\u3002",
    "- \u4F60\u4E0D\u80FD\u628A\u4E3B\u89C2\u5224\u65AD\u5F53\u4F5C\u5B8C\u6210\u4F9D\u636E\u3002",
    "- \u4F60\u5FC5\u987B\u4F18\u5148\u8BFB\u53D6 .harness/tasks/<task-id>/contract.yaml\u3001plan.md\u3001report.json\u3002",
    "- \u4F60\u5FC5\u987B\u57FA\u4E8E evidence\u3001gate\u3001report \u7ED9\u51FA PASS / FAIL \u88C1\u51B3\u3002",
    "- \u5982\u679C report \u4E0D\u5B58\u5728\u6216 commit_ready \u4E0D\u662F true\uFF0C\u4E0D\u80FD\u5BA3\u79F0\u4EFB\u52A1\u5B8C\u6210\u3002",
    "- \u5982\u679C\u53D1\u73B0\u95EE\u9898\uFF0C\u8BF7\u628A\u5931\u8D25\u9879\u548C\u4FEE\u590D\u5EFA\u8BAE\u8FD4\u56DE\u7ED9\u4E3B Agent\u3002",
    "",
    "\u8F93\u51FA\u5FC5\u987B\u5305\u542B\uFF1A\u68C0\u67E5\u6458\u8981\u3001\u5931\u8D25\u9879\u3001gate \u88C1\u51B3\u3001\u4E0B\u4E00\u6B65\u5EFA\u8BAE\u3002",
    '"""',
    ""
  ].join("\n");
}
function renderCodexManagedFiles(manifest, config = {}) {
  const options = resolveCodexManagedFilesOptions(config);
  return {
    ".codex/config.toml": renderCodexConfig(),
    ".codex/hooks.json": renderCodexHooks(manifest, {
      userPromptSubmitHookEnabled: options.userPromptSubmitHookEnabled
    }),
    ".harness/hosts/codex/hooks/session_start.js": renderCodexSessionStartHook(),
    ".harness/hosts/codex/hooks/user_prompt_submit.js": renderCodexUserPromptSubmitHook(),
    ".harness/hosts/codex/hooks/stop.js": renderCodexStopHook(),
    ".harness/hosts/codex/hooks/shared/codex-hook-io.js": renderCodexHookIo(manifest),
    ".codex/agents/harness-planner.toml": renderCodexPlannerAgent(options.subagents),
    ".codex/agents/harness-evaluator.toml": renderCodexEvaluatorAgent(options.subagents)
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  getCodexHostManifest,
  renderCodexConfig,
  renderCodexEvaluatorAgent,
  renderCodexHookIo,
  renderCodexHooks,
  renderCodexManagedFiles,
  renderCodexPlannerAgent,
  renderCodexSessionStartHook,
  renderCodexStopHook,
  renderCodexUserPromptSubmitHook
});
