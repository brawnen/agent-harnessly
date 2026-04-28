import type { HostManifest, HostSubagentConfig } from '@harnessly/shared';
import { createHostManifest } from '@harnessly/host-shared';

export interface CodexHookRenderOptions {
  userPromptSubmitHookEnabled?: boolean;
}

export interface CodexManagedFilesOptions extends CodexHookRenderOptions {
  subagents?: HostSubagentConfig;
}

const DEFAULT_SUBAGENTS: HostSubagentConfig = {
  planner: {
    useHostPlanMode: true,
    models: {
      codex: 'gpt-5.4-mini',
    },
  },
  evaluator: {
    models: {
      codex: 'gpt-5.4',
    },
  },
};

export function getCodexHostManifest() {
  return createHostManifest('codex');
}

export function renderCodexConfig(): string {
  return ['# Managed by Harnessly', '[features]', 'codex_hooks = true', ''].join('\n');
}

function isHostSubagentConfig(value: unknown): value is HostSubagentConfig {
  return Boolean(
    value &&
      typeof value === 'object' &&
      'planner' in value &&
      'evaluator' in value &&
      !('subagents' in value),
  );
}

function resolveCodexManagedFilesOptions(
  options: HostSubagentConfig | CodexManagedFilesOptions = {},
): Required<CodexManagedFilesOptions> {
  if (isHostSubagentConfig(options)) {
    return {
      subagents: options,
      userPromptSubmitHookEnabled: true,
    };
  }

  return {
    subagents: options.subagents ?? DEFAULT_SUBAGENTS,
    userPromptSubmitHookEnabled: options.userPromptSubmitHookEnabled ?? true,
  };
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
    "  if (result?.action === 'resume_task' && result?.activeTaskId) {",
    '    return [',
    "      '检测到这条输入更像续接当前任务。',",
    '      `- active_task_id: ${result.activeTaskId}`,',
    "      '请优先沿用当前 active task 继续，而不是新建任务。',",
    "    ].join('\\n');",
    '  }',
    "  if (result?.action === 'delegate_to_planner' && safePrompt) {",
    '    return [',
    "      '检测到这条输入更像新任务。',",
    "      '请 spawn custom agent named harness-planner，由 Planner 利用宿主 plan mode 完成目标澄清、scope 和验收标准建模。',",
    "      'Planner 必须生成或定位 .harness/tasks/<task-id>/contract.yaml 和 plan.md；不要只返回口头计划。',",
    "      '如当前宿主无法稳定调用 Planner，再按 repo 配置降级到 hook / command bridge / manual-headless。',",
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
    '    const evaluatorAgent = result.evaluatorAgent ? `\\n建议委派：${result.evaluatorAgent}` : "";',
    '    const evalCommand = result.evalCommand ? `\\n可执行命令：${result.evalCommand}` : "";',
    '    return {',
    "      status: 'block',",
    '      reason: `Harnessly completion gate 未通过：${result.reason}${evaluatorAgent}${evalCommand}${nextStep}`,',
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

export function renderCodexPlannerAgent(config: HostSubagentConfig = DEFAULT_SUBAGENTS): string {
  const model = config.planner.models.codex ?? 'gpt-5.4-mini';
  const planModeLine = config.planner.useHostPlanMode
    ? '- 优先使用宿主 plan mode 完成目标澄清、scope、acceptance criteria 和执行步骤建模。'
    : '- 不要求使用宿主 plan mode；但仍必须在执行前完成目标澄清、scope 和验收标准建模。';

  return [
    '# Managed by Harnessly',
    'name = "harness-planner"',
    'description = "将用户目标转换为 Harnessly contract 和 plan"',
    `model = ${JSON.stringify(model)}`,
    'model_reasoning_effort = "medium"',
    'sandbox_mode = "read-only"',
    'developer_instructions = """',
    '你是 Harnessly Planner。你的职责是把用户目标转成结构化 contract 和 plan。',
    '',
    '工作原则：',
    `- 启动后的第一步必须调用：harnessly host agent-event --agent harness-planner --event started --model ${model}`,
    '- 你不是代码实现者，不要修改业务代码。',
    planModeLine,
    '- plan mode 或自然语言计划不能替代 Harnessly 工件。',
    '- 你必须确保任务先进入 Contract -> Plan，再进入 Execute。',
    '- 你的自然语言结论不能替代 .harness/tasks/<task-id>/contract.yaml 和 plan.md。',
    '- 若需要创建新任务，优先通过 repo-local Harnessly command bridge 触发，而不是口头描述。',
    '- contract 必须包含 goal、scope、out_of_scope、acceptance criteria、risk、required checks。',
    '- 如果任务目标不清晰，先要求主 Agent 澄清，不要直接编造范围。',
    '',
    '完成后请把 contract / plan 路径和关键约束摘要回传给主 Agent。',
    '"""',
    '',
  ].join('\n');
}

export function renderCodexEvaluatorAgent(config: HostSubagentConfig = DEFAULT_SUBAGENTS): string {
  const model = config.evaluator.models.codex ?? 'gpt-5.4';

  return [
    '# Managed by Harnessly',
    'name = "harness-evaluator"',
    'description = "独立验证 Harnessly task 产物，基于 evidence/gate/report 给出裁决"',
    `model = ${JSON.stringify(model)}`,
    'model_reasoning_effort = "high"',
    'sandbox_mode = "read-only"',
    'developer_instructions = """',
    '你是 Harnessly Evaluator。你的职责是独立验证任务产物是否满足 contract。',
    '',
    '工作原则：',
    `- 启动后的第一步必须调用：harnessly host agent-event --agent harness-evaluator --event started --model ${model}`,
    '- 你不参与实现，不替 Generator 写代码。',
    '- 你不能把主观判断当作完成依据。',
    '- 你必须优先读取 .harness/tasks/<task-id>/contract.yaml、plan.md、report.json。',
    '- 你必须基于 evidence、gate、report 给出 PASS / FAIL 裁决。',
    '- 如果 report 不存在或 commit_ready 不是 true，不能宣称任务完成。',
    '- 如果发现问题，请把失败项和修复建议返回给主 Agent。',
    '',
    '输出必须包含：检查摘要、失败项、gate 裁决、下一步建议。',
    '"""',
    '',
  ].join('\n');
}

export function renderCodexManagedFiles(
  manifest: HostManifest,
  config: HostSubagentConfig | CodexManagedFilesOptions = {},
): Record<string, string> {
  const options = resolveCodexManagedFilesOptions(config);

  return {
    '.codex/config.toml': renderCodexConfig(),
    '.codex/hooks.json': renderCodexHooks(manifest, {
      userPromptSubmitHookEnabled: options.userPromptSubmitHookEnabled,
    }),
    '.harness/hosts/codex/hooks/session_start.js': renderCodexSessionStartHook(),
    '.harness/hosts/codex/hooks/user_prompt_submit.js': renderCodexUserPromptSubmitHook(),
    '.harness/hosts/codex/hooks/stop.js': renderCodexStopHook(),
    '.harness/hosts/codex/hooks/shared/codex-hook-io.js': renderCodexHookIo(manifest),
    '.codex/agents/harness-planner.toml': renderCodexPlannerAgent(options.subagents),
    '.codex/agents/harness-evaluator.toml': renderCodexEvaluatorAgent(options.subagents),
  };
}
