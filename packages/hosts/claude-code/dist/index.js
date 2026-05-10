// src/index.ts
import { createHostManifest, renderClaudeCodeSubagentFile } from "@harnessly/host-shared";
var DEFAULT_SUBAGENTS = {
  planner: {
    useHostPlanMode: true,
    models: {
      "claude-code": "haiku"
    }
  },
  evaluator: {
    models: {
      "claude-code": "sonnet"
    }
  }
};
function isHostSubagentConfig(value) {
  return Boolean(
    value && typeof value === "object" && "planner" in value && "evaluator" in value && !("subagents" in value) && !("agentManifests" in value)
  );
}
function resolveClaudeCodeManagedFilesOptions(options = {}) {
  if (isHostSubagentConfig(options)) {
    return { subagents: options, agentManifests: [] };
  }
  return {
    subagents: options.subagents ?? DEFAULT_SUBAGENTS,
    agentManifests: options.agentManifests ?? []
  };
}
function getClaudeCodeHostManifest() {
  return createHostManifest("claude-code");
}
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
    "    const agent = recommendedAgent || 'harness-planner';",
    "    return [",
    "      '\u68C0\u6D4B\u5230\u8FD9\u6761\u8F93\u5165\u66F4\u50CF\u65B0\u4EFB\u52A1\u3002',",
    "      `\u8BF7 spawn custom agent named ${agent}\uFF0C\u7531\u5B83\u5B8C\u6210 SPEC \u9636\u6BB5\u9700\u6C42\u6F84\u6E05\u4E0E\u53EF\u9A8C\u6536\u70B9\u5217\u4E3E\u3002`,",
    "      `${agent} \u5FC5\u987B\u751F\u6210\u6216\u5B9A\u4F4D .harness/tasks/<task-id>/contract.yaml \u4E0E plan.md\uFF1B\u4E0D\u8981\u53EA\u8FD4\u56DE\u53E3\u5934\u8BA1\u5212\u3002`,",
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
    "    const agent = result.recommendedAgent || result.evaluatorAgent;",
    '    const agentHint = agent ? `\\n\u5EFA\u8BAE\u59D4\u6D3E\uFF1A${agent}` : "";',
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
function renderClaudeCodeSettings(_manifest) {
  const repoRoot = "$(git rev-parse --show-toplevel)";
  return `${JSON.stringify(
    {
      hooks: {
        SessionStart: [
          {
            type: "command",
            command: `node "${repoRoot}/.harness/hosts/claude-code/hooks/session_start.js"`
          }
        ],
        UserPromptSubmit: [
          {
            type: "command",
            command: `node "${repoRoot}/.harness/hosts/claude-code/hooks/user_prompt_submit.js"`
          }
        ],
        Stop: [
          {
            type: "command",
            command: `node "${repoRoot}/.harness/hosts/claude-code/hooks/stop.js"`
          }
        ]
      }
    },
    null,
    2
  )}
`;
}
function renderClaudeCodePlannerAgent(config = DEFAULT_SUBAGENTS) {
  const model = config.planner.models["claude-code"] ?? "haiku";
  const planModeLine = config.planner.useHostPlanMode ? [
    "- plan mode \u5DF2\u5F00\u542F\uFF08\u7528\u6237\u5728 .harness/harness.config.yaml \u4E2D\u663E\u5F0F\u542F\u7528\uFF09\u3002\u8FDB\u5165 plan mode \u5B8C\u6210\u9700\u6C42\u6F84\u6E05\u540E\uFF0C\u8BA1\u5212\u5FC5\u987B\u843D\u76D8\u5230 `.harness/tasks/<task-id>/planner-plan.md` \u4F5C\u4E3A\u72EC\u7ACB\u5DE5\u4EF6\u3002",
    "- \u672A\u7ECF\u7528\u6237\u9010\u6761 review-and-approve \u7684 plan \u4E0D\u80FD\u8F6C\u4E0B\u6E38\u6267\u884C\u3002\u4E0D\u4E25\u683C review \u7684 plan \u7B49\u4E8E\u7F16\u7801\u9519\u8BEF\u6307\u4EE4\u3002",
    "- \u8BE6\u7EC6\u7ACB\u573A\u53C2\u89C1 `docs/design/agent-harness-product-design-v3.md` \xA74.6\u3002"
  ].join("\n") : "- \u9ED8\u8BA4\u8D70\u7ED3\u6784\u5316\u4EA7\u51FA\u8DEF\u5F84\uFF1A\u76F4\u63A5\u901A\u8FC7\u5BF9\u8BDD\u4E0E\u4E3B Agent / \u7528\u6237\u6F84\u6E05\u9700\u6C42\uFF0C\u4E0D\u8FDB\u5165 plan mode\uFF0C\u76F4\u63A5\u4EA7\u51FA `.harness/tasks/<task-id>/contract.yaml` \u548C `plan.md`\u3002";
  return [
    "---",
    "name: harness-planner",
    "description: \u5C06\u7528\u6237\u76EE\u6807\u8F6C\u6362\u4E3A Harnessly contract \u548C plan",
    `model: ${model}`,
    "tools:",
    "  - Read",
    "  - Bash",
    "---",
    "",
    "# Harness Planner",
    "",
    "\u4F60\u662F Harnessly Planner\u3002\u4F60\u7684\u804C\u8D23\u662F\u628A\u7528\u6237\u76EE\u6807\u8F6C\u6210\u7ED3\u6784\u5316 contract \u548C plan\u3002",
    "",
    "## \u5DE5\u4F5C\u539F\u5219",
    "",
    `- \u542F\u52A8\u540E\u7684\u7B2C\u4E00\u6B65\u5FC5\u987B\u8C03\u7528\uFF1Aharnessly host agent-event --agent harness-planner --event started --model ${model}`,
    "- \u4F60\u4E0D\u662F\u4EE3\u7801\u5B9E\u73B0\u8005\uFF0C\u4E0D\u8981\u4FEE\u6539\u4E1A\u52A1\u4EE3\u7801\u3002",
    planModeLine,
    "- plan mode \u6216\u81EA\u7136\u8BED\u8A00\u8BA1\u5212\u4E0D\u80FD\u66FF\u4EE3 Harnessly \u5DE5\u4EF6\u3002",
    "- \u4F60\u5FC5\u987B\u786E\u4FDD\u4EFB\u52A1\u5148\u8FDB\u5165 Contract -> Plan\uFF0C\u518D\u8FDB\u5165 Execute\u3002",
    "- \u4F60\u7684\u81EA\u7136\u8BED\u8A00\u7ED3\u8BBA\u4E0D\u80FD\u66FF\u4EE3 `.harness/tasks/<task-id>/contract.yaml` \u548C `plan.md`\u3002",
    "- \u82E5\u9700\u8981\u521B\u5EFA\u65B0\u4EFB\u52A1\uFF0C\u4F18\u5148\u901A\u8FC7 repo-local Harnessly command bridge \u89E6\u53D1\uFF0C\u800C\u4E0D\u662F\u53E3\u5934\u63CF\u8FF0\u3002",
    "- contract \u5FC5\u987B\u5305\u542B goal\u3001scope\u3001out_of_scope\u3001acceptance criteria\u3001risk\u3001required checks\u3002",
    "- \u5982\u679C\u4EFB\u52A1\u76EE\u6807\u4E0D\u6E05\u6670\uFF0C\u5148\u8981\u6C42\u4E3B Agent \u6F84\u6E05\uFF0C\u4E0D\u8981\u76F4\u63A5\u7F16\u9020\u8303\u56F4\u3002",
    "",
    "## \u5B8C\u6210\u6807\u51C6",
    "",
    "- \u5DF2\u751F\u6210\u6216\u5B9A\u4F4D `.harness/tasks/<task-id>/contract.yaml`",
    "- \u5DF2\u751F\u6210\u6216\u5B9A\u4F4D `.harness/tasks/<task-id>/plan.md`",
    "- \u5DF2\u5C06 task_id\u3001contract \u8DEF\u5F84\u3001plan \u8DEF\u5F84\u548C\u5173\u952E\u7EA6\u675F\u6458\u8981\u56DE\u4F20\u7ED9\u4E3B Agent",
    ""
  ].join("\n");
}
function renderClaudeCodeEvaluatorAgent(config = DEFAULT_SUBAGENTS) {
  const model = config.evaluator.models["claude-code"] ?? "sonnet";
  return [
    "---",
    "name: harness-evaluator",
    "description: \u72EC\u7ACB\u9A8C\u8BC1 Harnessly task \u4EA7\u7269\uFF0C\u57FA\u4E8E evidence/gate/report \u7ED9\u51FA\u88C1\u51B3",
    `model: ${model}`,
    "tools:",
    "  - Read",
    "  - Bash",
    "---",
    "",
    "# Harness Evaluator",
    "",
    "\u4F60\u662F Harnessly Evaluator\u3002\u4F60\u7684\u804C\u8D23\u662F\u72EC\u7ACB\u9A8C\u8BC1\u4EFB\u52A1\u4EA7\u7269\u662F\u5426\u6EE1\u8DB3 contract\u3002",
    "",
    "## \u5DE5\u4F5C\u539F\u5219",
    "",
    `- \u542F\u52A8\u540E\u7684\u7B2C\u4E00\u6B65\u5FC5\u987B\u8C03\u7528\uFF1Aharnessly host agent-event --agent harness-evaluator --event started --model ${model}`,
    "- \u4F60\u4E0D\u53C2\u4E0E\u5B9E\u73B0\uFF0C\u4E0D\u66FF Generator \u5199\u4EE3\u7801\u3002",
    "- \u4F60\u4E0D\u80FD\u628A\u4E3B\u89C2\u5224\u65AD\u5F53\u4F5C\u5B8C\u6210\u4F9D\u636E\u3002",
    "- \u4F60\u5FC5\u987B\u4F18\u5148\u8BFB\u53D6 `.harness/tasks/<task-id>/contract.yaml`\u3001`plan.md`\u3001`report.json`\u3002",
    "- \u4F60\u5FC5\u987B\u57FA\u4E8E evidence\u3001gate\u3001report \u7ED9\u51FA PASS / FAIL \u88C1\u51B3\u3002",
    "- \u5982\u679C report \u4E0D\u5B58\u5728\u6216 commit_ready \u4E0D\u662F true\uFF0C\u4E0D\u80FD\u5BA3\u79F0\u4EFB\u52A1\u5B8C\u6210\u3002",
    "- \u5982\u679C\u53D1\u73B0\u95EE\u9898\uFF0C\u8BF7\u628A\u5931\u8D25\u9879\u548C\u4FEE\u590D\u5EFA\u8BAE\u8FD4\u56DE\u7ED9\u4E3B Agent\u3002",
    "",
    "## \u8F93\u51FA\u8981\u6C42",
    "",
    "- \u68C0\u67E5\u7ED3\u679C\u6458\u8981",
    "- \u5931\u8D25\u9879\u5217\u8868",
    "- Gate \u88C1\u51B3\uFF1APASS \u6216 FAIL",
    "- \u4E0B\u4E00\u6B65\u5EFA\u8BAE",
    ""
  ].join("\n");
}
function renderClaudeCodeManagedFiles(manifest, options = DEFAULT_SUBAGENTS) {
  const resolved = resolveClaudeCodeManagedFilesOptions(options);
  const files = {
    ".claude/settings.json": renderClaudeCodeSettings(manifest),
    ".claude/agents/harness-planner.md": renderClaudeCodePlannerAgent(resolved.subagents),
    ".claude/agents/harness-evaluator.md": renderClaudeCodeEvaluatorAgent(resolved.subagents),
    ".harness/hosts/claude-code/hooks/session_start.js": renderClaudeCodeSessionStartHook(),
    ".harness/hosts/claude-code/hooks/user_prompt_submit.js": renderClaudeCodeUserPromptSubmitHook(),
    ".harness/hosts/claude-code/hooks/stop.js": renderClaudeCodeStopHook(),
    ".harness/hosts/claude-code/hooks/shared/claude-code-hook-io.js": renderClaudeCodeHookIo(manifest)
  };
  for (const agentManifest of resolved.agentManifests) {
    if (!agentManifest.enabled) {
      continue;
    }
    files[`.claude/agents/harness-${agentManifest.role}.md`] = renderClaudeCodeSubagentFile(agentManifest);
  }
  return files;
}
export {
  getClaudeCodeHostManifest,
  renderClaudeCodeEvaluatorAgent,
  renderClaudeCodeHookIo,
  renderClaudeCodeManagedFiles,
  renderClaudeCodePlannerAgent,
  renderClaudeCodeSessionStartHook,
  renderClaudeCodeSettings,
  renderClaudeCodeStopHook,
  renderClaudeCodeUserPromptSubmitHook
};
