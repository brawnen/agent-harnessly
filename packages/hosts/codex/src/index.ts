import type { AgentManifest, HostManifest } from '@harnessly/shared';
import { createHostManifest, renderCodexSubagentFile } from '@harnessly/host-shared';

export interface CodexHookRenderOptions {
  userPromptSubmitHookEnabled?: boolean;
}

export interface CodexManagedFilesOptions extends CodexHookRenderOptions {
  /**
   * v3-core 5 角色 sub-agent manifest。renderer 会生成
   * `.codex/agents/harness-<role>.toml`。仅 enabled=true 的角色被渲染。
   */
  agentManifests?: AgentManifest[];
}

export function getCodexHostManifest() {
  return createHostManifest('codex');
}

export function renderCodexConfig(): string {
  return ['# Managed by Harnessly', '[features]', 'codex_hooks = true', ''].join('\n');
}

function renderHookCommand(command: string) {
  return [
    {
      hooks: [
        {
          type: 'command',
          command,
        },
      ],
    },
  ];
}

export function renderCodexHooks(
  manifest: HostManifest,
  options: CodexHookRenderOptions = { userPromptSubmitHookEnabled: true },
): string {
  const hooks: Record<string, unknown> = {
    SessionStart: [
      {
        matcher: 'startup|resume',
        hooks: [
          {
            type: 'command',
            command:
              'node "$(git rev-parse --show-toplevel)/.harness/hosts/codex/hooks/session_start.js" || echo "{}"',
          },
        ],
      },
    ],
    Stop: renderHookCommand(
      'node "$(git rev-parse --show-toplevel)/.harness/hosts/codex/hooks/stop.js" || echo "{}"',
    ),
  };

  if (options.userPromptSubmitHookEnabled ?? true) {
    hooks.UserPromptSubmit = renderHookCommand(
      'node "$(git rev-parse --show-toplevel)/.harness/hosts/codex/hooks/user_prompt_submit.js" || echo "{}"',
    );
  }

  return `${JSON.stringify(
    {
      $comment: 'Repo-local Codex hooks generated from .harness/hosts/codex.',
      hooks,
    },
    null,
    2,
  )}\n`;
}

export function renderCodexHookIo(manifest: HostManifest): string {
  return [
    "const fs = require('node:fs');",
    "const { spawnSync } = require('node:child_process');",
    '',
    'function readHookPayload() {',
    "  const raw = fs.readFileSync(0, 'utf8').trim();",
    '  if (!raw) {',
    '    return {};',
    '  }',
    '  try {',
    '    return JSON.parse(raw);',
    '  } catch {',
    "    throw new Error('hook stdin 不是合法 JSON');",
    '  }',
    '}',
    '',
    'function resolvePayloadCwd(payload) {',
    "  return typeof payload?.cwd === 'string' && payload.cwd.trim() ? payload.cwd.trim() : process.cwd();",
    '}',
    '',
    'function resolvePayloadPrompt(payload) {',
    "  if (typeof payload?.prompt === 'string') {",
    '    return payload.prompt;',
    '  }',
    "  if (typeof payload?.input === 'string') {",
    '    return payload.input;',
    '  }',
    "  if (typeof payload?.user_input === 'string') {",
    '    return payload.user_input;',
    '  }',
    "  return '';",
    '}',
    '',
    'function buildCodexHookOutput(eventName, decision) {',
    "  if (decision.status === 'block') {",
    '    return {',
    "      decision: 'block',",
    '      reason: decision.reason,',
    '    };',
    '  }',
    '  if (!decision.additionalContext) {',
    '    return { continue: true, suppressOutput: true };',
    '  }',
    '  return {',
    '    continue: true,',
    '    suppressOutput: true,',
    '    hookSpecificOutput: {',
    '      additionalContext: decision.additionalContext,',
    '      hookEventName: eventName,',
    '    },',
    '  };',
    '}',
    '',
    'function writeHookOutput(result) {',
    "  process.stdout.write(`${JSON.stringify(result, null, 2)}\\n`);",
    '}',
    '',
    'function writeContinue(eventName, message) {',
    '  writeHookOutput(',
    '    buildCodexHookOutput(eventName, {',
    "      status: 'continue',",
    '      additionalContext: message,',
    '    }),',
    '  );',
    '}',
    '',
    'function runHarnesslyJson(command, cwd, extraEnv = {}) {',
    '  const result = spawnSync(command, {',
    '    cwd,',
    "    shell: true,",
    "    encoding: 'utf8',",
    '    env: {',
    '      ...process.env,',
    '      ...extraEnv,',
    '    },',
    '  });',
    '  if (result.error) {',
    '    throw result.error;',
    '  }',
    '  if (result.status && result.status !== 0) {',
    "    throw new Error(result.stderr?.trim() || result.stdout?.trim() || `命令执行失败: ${command}`);",
    '  }',
    "  const text = (result.stdout || '').trim();",
    '  if (!text) {',
    '    return {};',
    '  }',
    '  try {',
    '    return JSON.parse(text);',
    '  } catch (error) {',
    '    throw new Error(`命令输出不是合法 JSON: ${error instanceof Error ? error.message : String(error)}`);',
    '  }',
    '}',
    '',
    'function buildSessionStartContext(result) {',
    '  if (!result?.hasActiveTask || !result?.activeTaskId || !result?.task) {',
    "    return '';",
    '  }',
    '  const lines = [',
    "    '当前存在 active task：',",
    '    `- task_id: ${result.activeTaskId}`,',
    '    `- goal: ${result.task.goal}`,',
    '    `- status: ${result.task.status}`,',
    '    `- current_stage: ${result.task.currentStage ?? "unknown"}`,',
    '    `- retry_count: ${result.retryCount ?? 0}`,',
    "    `- last_failure: ${result.lastFailureReason ?? 'none'}`,",
    '    `- recommendation: ${result.recommendation ?? "resume"}`,',
    '  ];',
    "  return lines.join('\\n');",
    '}',
    '',
    'function buildPromptSubmitContext(result, prompt) {',
    "  const safePrompt = typeof prompt === 'string' ? prompt.trim() : '';",
    '  const quotedPrompt = JSON.stringify(safePrompt);',
    '  const recommendedAgent = result?.recommendedAgent || null;',
    '  const activeStage = result?.activeStage || null;',
    "  if (result?.action === 'resume_task' && result?.activeTaskId) {",
    '    const lines = [',
    "      '检测到这条输入更像续接当前任务。',",
    '      `- active_task_id: ${result.activeTaskId}`,',
    '      activeStage ? `- active_stage: ${activeStage}` : null,',
    "      '请优先沿用当前 active task 继续，而不是新建任务。',",
    '      recommendedAgent',
    '        ? `推荐由 ${recommendedAgent} 接手当前阶段；execute 阶段由主 agent 自己执行。`',
    '        : null,',
    '    ].filter(Boolean);',
    "    return lines.join('\\n');",
    '  }',
    "  if (result?.action === 'delegate_to_planner' && safePrompt) {",
    '    if (!recommendedAgent) {',
    "      return '检测到新任务，但 .harness/agents/ 中无可用 sub-agent（requirement 角色未启用）。请检查 manifest 配置。';",
    '    }',
    '    return [',
    "      '检测到这条输入更像新任务。',",
    '      `请 spawn custom agent named ${recommendedAgent}，由它完成 SPEC 阶段需求澄清与可验收点列举。`,',
    '      `${recommendedAgent} 必须生成或定位 .harness/tasks/<task-id>/contract.yaml 与 plan.md；不要只返回口头计划。`,',
    "      '如当前宿主无法稳定调用 sub-agent，再按 repo 配置降级到 hook / command bridge / manual-headless。',",
    "    ].join('\\n');",
    '  }',
    "  if (result?.action === 'create_task' && safePrompt) {",
    '    if (result?.taskCreated && result?.taskId) {',
    '      return [',
    "        'Harnessly 已为这条输入自动创建 task，并生成 contract / plan。',",
    '        `- task_id: ${result.taskId}`,',
    '        result.contractPath ? `- contract: ${result.contractPath}` : null,',
    '        result.planPath ? `- plan: ${result.planPath}` : null,',
    "        '请先基于 contract / plan 控制范围，再继续执行。',",
    '      ].filter(Boolean).join(\'\\n\');',
    '    }',
    '    return [',
    "      '检测到这条输入更像新任务。',",
    '      `在真正编码前，请先执行 Harnessly contract 流程：harnessly run --dry-run ${quotedPrompt}`,',
    "      '确认 contract 与 plan 后，再继续执行。',",
    "    ].join('\\n');",
    '  }',
    "  return '';",
    '}',
    '',
    'function buildCompletionDecision(result) {',
    '  if (result?.pass === false) {',
    '    const nextStep = result.nextStep ? `\\n下一步：${result.nextStep}` : "";',
    '    const agentHint = result.recommendedAgent ? `\\n建议委派：${result.recommendedAgent}` : "";',
    '    const evalCommand = result.evalCommand ? `\\n可执行命令：${result.evalCommand}` : "";',
    '    const stageHint = result.lastFailureStage',
    '      ? `\\n失败位置：${result.lastFailureStage}`',
    '      : (result.activeStage ? `\\n当前阶段：${result.activeStage}` : "");',
    '    return {',
    "      status: 'block',",
    '      reason: `Harnessly completion gate 未通过：${result.reason}${stageHint}${agentHint}${evalCommand}${nextStep}`,',
    '    };',
    '  }',
    '  return {',
    "    status: 'continue',",
    '    additionalContext: "",',
    '  };',
    '}',
    '',
    `const SESSION_START_COMMAND = ${JSON.stringify(manifest.sessionStartCommand)};`,
    `const USER_PROMPT_COMMAND = ${JSON.stringify(manifest.userPromptSubmitCommand)};`,
    `const COMPLETION_GATE_COMMAND = ${JSON.stringify(manifest.completionGateCommand)};`,
    '',
    'module.exports = {',
    '  buildCodexHookOutput,',
    '  buildCompletionDecision,',
    '  buildPromptSubmitContext,',
    '  buildSessionStartContext,',
    '  COMPLETION_GATE_COMMAND,',
    '  readHookPayload,',
    '  resolvePayloadCwd,',
    '  resolvePayloadPrompt,',
    '  runHarnesslyJson,',
    '  SESSION_START_COMMAND,',
    '  USER_PROMPT_COMMAND,',
    '  writeContinue,',
    '  writeHookOutput,',
    '};',
    '',
  ].join('\n');
}

export function renderCodexSessionStartHook(): string {
  return [
    "const { buildCodexHookOutput, buildSessionStartContext, readHookPayload, resolvePayloadCwd, runHarnesslyJson, SESSION_START_COMMAND, writeContinue, writeHookOutput } = require('./shared/codex-hook-io.js');",
    '',
    '(function main() {',
    '  try {',
    '    const payload = readHookPayload();',
    '    const cwd = resolvePayloadCwd(payload);',
    '    const result = runHarnesslyJson(SESSION_START_COMMAND, cwd);',
    '    writeHookOutput(',
    "      buildCodexHookOutput('SessionStart', {",
    "        status: 'continue',",
    '        additionalContext: buildSessionStartContext(result),',
    '      }),',
    '    );',
    '  } catch (error) {',
    "    writeContinue('SessionStart', `Codex SessionStart hook 执行失败：${error instanceof Error ? error.message : String(error)}`);",
    '  }',
    '})();',
    '',
  ].join('\n');
}

export function renderCodexUserPromptSubmitHook(): string {
  return [
    "const { buildCodexHookOutput, buildPromptSubmitContext, readHookPayload, resolvePayloadCwd, resolvePayloadPrompt, runHarnesslyJson, USER_PROMPT_COMMAND, writeContinue, writeHookOutput } = require('./shared/codex-hook-io.js');",
    '',
    '(function main() {',
    '  try {',
    '    const payload = readHookPayload();',
    '    const cwd = resolvePayloadCwd(payload);',
    '    const prompt = resolvePayloadPrompt(payload);',
    '    const result = runHarnesslyJson(`${USER_PROMPT_COMMAND} --prompt "$HARNESSLY_HOOK_PROMPT"`, cwd, {',
    '      HARNESSLY_HOOK_PROMPT: prompt,',
    '    });',
    '    writeHookOutput(',
    "      buildCodexHookOutput('UserPromptSubmit', {",
    "        status: 'continue',",
    '        additionalContext: buildPromptSubmitContext(result, prompt),',
    '      }),',
    '    );',
    '  } catch (error) {',
    "    writeContinue('UserPromptSubmit', `Codex UserPromptSubmit hook 执行失败：${error instanceof Error ? error.message : String(error)}`);",
    '  }',
    '})();',
    '',
  ].join('\n');
}

export function renderCodexStopHook(): string {
  return [
    "const { buildCompletionDecision, buildCodexHookOutput, COMPLETION_GATE_COMMAND, readHookPayload, resolvePayloadCwd, runHarnesslyJson, writeContinue, writeHookOutput } = require('./shared/codex-hook-io.js');",
    '',
    '(function main() {',
    '  try {',
    '    const payload = readHookPayload();',
    '    const cwd = resolvePayloadCwd(payload);',
    '    const message = typeof payload?.last_assistant_message === "string" ? payload.last_assistant_message : "";',
    '    const result = runHarnesslyJson(`${COMPLETION_GATE_COMMAND} --message "$HARNESSLY_HOOK_LAST_MESSAGE"`, cwd, {',
    '      HARNESSLY_HOOK_LAST_MESSAGE: message,',
    '    });',
    '    const decision = buildCompletionDecision(result);',
    "    writeHookOutput(buildCodexHookOutput('Stop', decision));",
    '  } catch (error) {',
    "    writeContinue('Stop', `Codex Stop hook 执行失败：${error instanceof Error ? error.message : String(error)}`);",
    '  }',
    '})();',
    '',
  ].join('\n');
}

export function renderCodexManagedFiles(
  manifest: HostManifest,
  options: CodexManagedFilesOptions = {},
): Record<string, string> {
  const userPromptSubmitHookEnabled = options.userPromptSubmitHookEnabled ?? true;
  const agentManifests = options.agentManifests ?? [];

  const files: Record<string, string> = {
    '.codex/config.toml': renderCodexConfig(),
    '.codex/hooks.json': renderCodexHooks(manifest, { userPromptSubmitHookEnabled }),
    '.harness/hosts/codex/hooks/session_start.js': renderCodexSessionStartHook(),
    '.harness/hosts/codex/hooks/user_prompt_submit.js': renderCodexUserPromptSubmitHook(),
    '.harness/hosts/codex/hooks/stop.js': renderCodexStopHook(),
    '.harness/hosts/codex/hooks/shared/codex-hook-io.js': renderCodexHookIo(manifest),
  };

  // 渲染 v3-core 5 角色 sub-agent 文件（仅 enabled=true）
  for (const agentManifest of agentManifests) {
    if (!agentManifest.enabled) {
      continue;
    }
    files[`.codex/agents/harness-${agentManifest.role}.toml`] =
      renderCodexSubagentFile(agentManifest);
  }

  return files;
}
