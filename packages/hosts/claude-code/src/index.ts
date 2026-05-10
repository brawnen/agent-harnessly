import type { AgentManifest, HostManifest, HostSubagentConfig } from '@harnessly/shared';
import { createHostManifest, renderClaudeCodeSubagentFile } from '@harnessly/host-shared';

const DEFAULT_SUBAGENTS: HostSubagentConfig = {
  planner: {
    useHostPlanMode: true,
    models: {
      'claude-code': 'haiku',
    },
  },
  evaluator: {
    models: {
      'claude-code': 'sonnet',
    },
  },
};

/**
 * v3-core 引入的可选项：传入 5 角色 sub-agent manifest，由 renderer 增量生成
 * `.claude/agents/harness-<role>.md` 文件。仅渲染 manifest.enabled=true 的角色。
 *
 * 老的 `harness-planner` / `harness-evaluator` 文件继续生成（作为复合别名），
 * 兼容现有 hook 与 user-prompt-submit 文案。
 */
export interface ClaudeCodeManagedFilesOptions {
  subagents?: HostSubagentConfig;
  agentManifests?: AgentManifest[];
}

function isHostSubagentConfig(value: unknown): value is HostSubagentConfig {
  return Boolean(
    value &&
      typeof value === 'object' &&
      'planner' in (value as Record<string, unknown>) &&
      'evaluator' in (value as Record<string, unknown>) &&
      !('subagents' in (value as Record<string, unknown>)) &&
      !('agentManifests' in (value as Record<string, unknown>)),
  );
}

function resolveClaudeCodeManagedFilesOptions(
  options: HostSubagentConfig | ClaudeCodeManagedFilesOptions = {},
): { subagents: HostSubagentConfig; agentManifests: AgentManifest[] } {
  if (isHostSubagentConfig(options)) {
    return { subagents: options, agentManifests: [] };
  }

  return {
    subagents: options.subagents ?? DEFAULT_SUBAGENTS,
    agentManifests: options.agentManifests ?? [],
  };
}

export function getClaudeCodeHostManifest() {
  return createHostManifest('claude-code');
}

// --- Hook bridge scripts (Node.js) ---

export function renderClaudeCodeHookIo(manifest: HostManifest): string {
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
    'function writeHookOutput(result) {',
    "  process.stdout.write(`${JSON.stringify(result)}\\n`);",
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
    "    const agent = recommendedAgent || 'harness-planner';",
    '    return [',
    "      '检测到这条输入更像新任务。',",
    '      `请 spawn custom agent named ${agent}，由它完成 SPEC 阶段需求澄清与可验收点列举。`,',
    '      `${agent} 必须生成或定位 .harness/tasks/<task-id>/contract.yaml 与 plan.md；不要只返回口头计划。`,',
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
    "      ].filter(Boolean).join('\\n');",
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
    '    const agent = result.recommendedAgent || result.evaluatorAgent;',
    '    const agentHint = agent ? `\\n建议委派：${agent}` : "";',
    '    const evalCommand = result.evalCommand ? `\\n可执行命令：${result.evalCommand}` : "";',
    '    const stageHint = result.lastFailureStage',
    '      ? `\\n失败位置：${result.lastFailureStage}`',
    '      : (result.activeStage ? `\\n当前阶段：${result.activeStage}` : "");',
    '    return {',
    "      decision: 'block',",
    '      reason: `Harnessly completion gate 未通过：${result.reason}${stageHint}${agentHint}${evalCommand}${nextStep}`,',
    '    };',
    '  }',
    '  return {',
    "    continue: true,",
    '  };',
    '}',
    '',
    `const SESSION_START_COMMAND = ${JSON.stringify(manifest.sessionStartCommand)};`,
    `const USER_PROMPT_COMMAND = ${JSON.stringify(manifest.userPromptSubmitCommand)};`,
    `const COMPLETION_GATE_COMMAND = ${JSON.stringify(manifest.completionGateCommand)};`,
    '',
    'module.exports = {',
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
    '  writeHookOutput,',
    '};',
    '',
  ].join('\n');
}

export function renderClaudeCodeSessionStartHook(): string {
  return [
    "const { buildSessionStartContext, readHookPayload, resolvePayloadCwd, runHarnesslyJson, SESSION_START_COMMAND, writeHookOutput } = require('./shared/claude-code-hook-io.js');",
    '',
    '(function main() {',
    '  try {',
    '    const payload = readHookPayload();',
    '    const cwd = resolvePayloadCwd(payload);',
    '    const result = runHarnesslyJson(SESSION_START_COMMAND, cwd);',
    '    writeHookOutput({',
    '      continue: true,',
    '      additionalContext: buildSessionStartContext(result),',
    '    });',
    '  } catch (error) {',
    '    writeHookOutput({',
    '      continue: true,',
    '      additionalContext: `Claude Code SessionStart hook 执行失败：${error instanceof Error ? error.message : String(error)}`,',
    '    });',
    '  }',
    '})();',
    '',
  ].join('\n');
}

export function renderClaudeCodeUserPromptSubmitHook(): string {
  return [
    "const { buildPromptSubmitContext, readHookPayload, resolvePayloadCwd, resolvePayloadPrompt, runHarnesslyJson, USER_PROMPT_COMMAND, writeHookOutput } = require('./shared/claude-code-hook-io.js');",
    '',
    '(function main() {',
    '  try {',
    '    const payload = readHookPayload();',
    '    const cwd = resolvePayloadCwd(payload);',
    '    const prompt = resolvePayloadPrompt(payload);',
    '    const result = runHarnesslyJson(`${USER_PROMPT_COMMAND} --prompt "$HARNESSLY_HOOK_PROMPT"`, cwd, {',
    '      HARNESSLY_HOOK_PROMPT: prompt,',
    '    });',
    '    writeHookOutput({',
    '      continue: true,',
    '      additionalContext: buildPromptSubmitContext(result, prompt),',
    '    });',
    '  } catch (error) {',
    '    writeHookOutput({',
    '      continue: true,',
    '      additionalContext: `Claude Code UserPromptSubmit hook 执行失败：${error instanceof Error ? error.message : String(error)}`,',
    '    });',
    '  }',
    '})();',
    '',
  ].join('\n');
}

export function renderClaudeCodeStopHook(): string {
  return [
    "const { buildCompletionDecision, COMPLETION_GATE_COMMAND, readHookPayload, resolvePayloadCwd, runHarnesslyJson, writeHookOutput } = require('./shared/claude-code-hook-io.js');",
    '',
    '(function main() {',
    '  try {',
    '    const payload = readHookPayload();',
    '    const cwd = resolvePayloadCwd(payload);',
    '    const message = typeof payload?.stopReason === "string" ? payload.stopReason : "";',
    '    const result = runHarnesslyJson(`${COMPLETION_GATE_COMMAND} --message "$HARNESSLY_HOOK_LAST_MESSAGE"`, cwd, {',
    '      HARNESSLY_HOOK_LAST_MESSAGE: message,',
    '    });',
    '    writeHookOutput(buildCompletionDecision(result));',
    '  } catch (error) {',
    '    writeHookOutput({',
    '      continue: true,',
    '      additionalContext: `Claude Code Stop hook 执行失败：${error instanceof Error ? error.message : String(error)}`,',
    '    });',
    '  }',
    '})();',
    '',
  ].join('\n');
}

// --- Settings & managed files ---

export function renderClaudeCodeSettings(_manifest: HostManifest): string {
  const repoRoot = '$(git rev-parse --show-toplevel)';
  return `${JSON.stringify(
    {
      hooks: {
        SessionStart: [
          {
            type: 'command',
            command: `node "${repoRoot}/.harness/hosts/claude-code/hooks/session_start.js"`,
          },
        ],
        UserPromptSubmit: [
          {
            type: 'command',
            command: `node "${repoRoot}/.harness/hosts/claude-code/hooks/user_prompt_submit.js"`,
          },
        ],
        Stop: [
          {
            type: 'command',
            command: `node "${repoRoot}/.harness/hosts/claude-code/hooks/stop.js"`,
          },
        ],
      },
    },
    null,
    2,
  )}\n`;
}

export function renderClaudeCodePlannerAgent(config: HostSubagentConfig = DEFAULT_SUBAGENTS): string {
  const model = config.planner.models['claude-code'] ?? 'haiku';
  const planModeLine = config.planner.useHostPlanMode
    ? [
        '- plan mode 已开启（用户在 .harness/harness.config.yaml 中显式启用）。进入 plan mode 完成需求澄清后，计划必须落盘到 `.harness/tasks/<task-id>/planner-plan.md` 作为独立工件。',
        '- 未经用户逐条 review-and-approve 的 plan 不能转下游执行。不严格 review 的 plan 等于编码错误指令。',
        '- 详细立场参见 `docs/design/agent-harness-product-design-v3.md` §4.6。',
      ].join('\n')
    : '- 默认走结构化产出路径：直接通过对话与主 Agent / 用户澄清需求，不进入 plan mode，直接产出 `.harness/tasks/<task-id>/contract.yaml` 和 `plan.md`。';

  return [
    '---',
    'name: harness-planner',
    'description: 将用户目标转换为 Harnessly contract 和 plan',
    `model: ${model}`,
    'tools:',
    '  - Read',
    '  - Bash',
    '---',
    '',
    '# Harness Planner',
    '',
    '你是 Harnessly Planner。你的职责是把用户目标转成结构化 contract 和 plan。',
    '',
    '## 工作原则',
    '',
    `- 启动后的第一步必须调用：harnessly host agent-event --agent harness-planner --event started --model ${model}`,
    '- 你不是代码实现者，不要修改业务代码。',
    planModeLine,
    '- plan mode 或自然语言计划不能替代 Harnessly 工件。',
    '- 你必须确保任务先进入 Contract -> Plan，再进入 Execute。',
    '- 你的自然语言结论不能替代 `.harness/tasks/<task-id>/contract.yaml` 和 `plan.md`。',
    '- 若需要创建新任务，优先通过 repo-local Harnessly command bridge 触发，而不是口头描述。',
    '- contract 必须包含 goal、scope、out_of_scope、acceptance criteria、risk、required checks。',
    '- 如果任务目标不清晰，先要求主 Agent 澄清，不要直接编造范围。',
    '',
    '## 完成标准',
    '',
    '- 已生成或定位 `.harness/tasks/<task-id>/contract.yaml`',
    '- 已生成或定位 `.harness/tasks/<task-id>/plan.md`',
    '- 已将 task_id、contract 路径、plan 路径和关键约束摘要回传给主 Agent',
    '',
  ].join('\n');
}

export function renderClaudeCodeEvaluatorAgent(config: HostSubagentConfig = DEFAULT_SUBAGENTS): string {
  const model = config.evaluator.models['claude-code'] ?? 'sonnet';

  return [
    '---',
    'name: harness-evaluator',
    'description: 独立验证 Harnessly task 产物，基于 evidence/gate/report 给出裁决',
    `model: ${model}`,
    'tools:',
    '  - Read',
    '  - Bash',
    '---',
    '',
    '# Harness Evaluator',
    '',
    '你是 Harnessly Evaluator。你的职责是独立验证任务产物是否满足 contract。',
    '',
    '## 工作原则',
    '',
    `- 启动后的第一步必须调用：harnessly host agent-event --agent harness-evaluator --event started --model ${model}`,
    '- 你不参与实现，不替 Generator 写代码。',
    '- 你不能把主观判断当作完成依据。',
    '- 你必须优先读取 `.harness/tasks/<task-id>/contract.yaml`、`plan.md`、`report.json`。',
    '- 你必须基于 evidence、gate、report 给出 PASS / FAIL 裁决。',
    '- 如果 report 不存在或 commit_ready 不是 true，不能宣称任务完成。',
    '- 如果发现问题，请把失败项和修复建议返回给主 Agent。',
    '',
    '## 输出要求',
    '',
    '- 检查结果摘要',
    '- 失败项列表',
    '- Gate 裁决：PASS 或 FAIL',
    '- 下一步建议',
    '',
  ].join('\n');
}

export function renderClaudeCodeManagedFiles(
  manifest: HostManifest,
  options: HostSubagentConfig | ClaudeCodeManagedFilesOptions = DEFAULT_SUBAGENTS,
): Record<string, string> {
  const resolved = resolveClaudeCodeManagedFilesOptions(options);

  const files: Record<string, string> = {
    '.claude/settings.json': renderClaudeCodeSettings(manifest),
    '.claude/agents/harness-planner.md': renderClaudeCodePlannerAgent(resolved.subagents),
    '.claude/agents/harness-evaluator.md': renderClaudeCodeEvaluatorAgent(resolved.subagents),
    '.harness/hosts/claude-code/hooks/session_start.js': renderClaudeCodeSessionStartHook(),
    '.harness/hosts/claude-code/hooks/user_prompt_submit.js': renderClaudeCodeUserPromptSubmitHook(),
    '.harness/hosts/claude-code/hooks/stop.js': renderClaudeCodeStopHook(),
    '.harness/hosts/claude-code/hooks/shared/claude-code-hook-io.js': renderClaudeCodeHookIo(manifest),
  };

  // 增量渲染 5 角色 sub-agent 文件（仅 enabled=true）
  for (const agentManifest of resolved.agentManifests) {
    if (!agentManifest.enabled) {
      continue;
    }
    files[`.claude/agents/harness-${agentManifest.role}.md`] =
      renderClaudeCodeSubagentFile(agentManifest);
  }

  return files;
}
