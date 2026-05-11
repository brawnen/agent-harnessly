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
  getClaudeCodeHostManifest: () => getClaudeCodeHostManifest,
  renderClaudeCodeHookIo: () => renderClaudeCodeHookIo,
  renderClaudeCodeManagedFiles: () => renderClaudeCodeManagedFiles,
  renderClaudeCodeSessionStartHook: () => renderClaudeCodeSessionStartHook,
  renderClaudeCodeSettings: () => renderClaudeCodeSettings,
  renderClaudeCodeStopHook: () => renderClaudeCodeStopHook,
  renderClaudeCodeUserPromptSubmitHook: () => renderClaudeCodeUserPromptSubmitHook
});
module.exports = __toCommonJS(index_exports);
var import_host_shared = require("@harnessly/host-shared");
function getClaudeCodeHostManifest() {
  return (0, import_host_shared.createHostManifest)("claude-code");
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
    ".harness/hosts/claude-code/hooks/shared/claude-code-hook-io.js": renderClaudeCodeHookIo(manifest)
  };
  for (const agentManifest of agentManifests) {
    if (!agentManifest.enabled) {
      continue;
    }
    files[`.claude/agents/harness-${agentManifest.role}.md`] = (0, import_host_shared.renderClaudeCodeSubagentFile)(agentManifest);
  }
  return files;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  getClaudeCodeHostManifest,
  renderClaudeCodeHookIo,
  renderClaudeCodeManagedFiles,
  renderClaudeCodeSessionStartHook,
  renderClaudeCodeSettings,
  renderClaudeCodeStopHook,
  renderClaudeCodeUserPromptSubmitHook
});
