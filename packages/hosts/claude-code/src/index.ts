import type { AgentManifest, HostManifest } from '@brawnen/harnessly-shared';
import { createHostManifest, renderClaudeCodeSubagentFile } from '@brawnen/harnessly-host-shared';

/**
 * v3-core host renderer 选项：传入 5 角色 sub-agent manifest，
 * 由 renderer 生成 `.claude/agents/harness-<role>.md` 文件。
 * 仅渲染 manifest.enabled=true 的角色。
 */
export interface ClaudeCodeManagedFilesOptions {
  agentManifests?: AgentManifest[];
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
    '    const agentHint = result.recommendedAgent ? `\\n建议委派：${result.recommendedAgent}` : "";',
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

// --- PreToolUse write-path guard (v3-core §10 纪律 1) ---

export function renderClaudeCodePreToolUseHook(): string {
  return [
    "const { COMPLETION_GATE_COMMAND, readHookPayload, resolvePayloadCwd, runHarnesslyJson, writeHookOutput } = require('./shared/claude-code-hook-io.js');",
    '',
    "const ARTIFACT_GUARD_COMMAND = `${COMPLETION_GATE_COMMAND.replace('host completion-gate', 'host artifact-guard')}`;",
    '',
    '(function main() {',
    '  try {',
    '    const payload = readHookPayload();',
    "    const toolName = payload?.tool_name || '';",
    "    if (toolName !== 'Edit' && toolName !== 'Write') {",
    '      writeHookOutput({ continue: true });',
    '      return;',
    '    }',
    "    const filePath = payload?.tool_input?.file_path || '';",
    '    if (!filePath) {',
    '      writeHookOutput({ continue: true });',
    '      return;',
    '    }',
    "    const cwd = resolvePayloadCwd(payload);",
    '    try {',
    '      const result = runHarnesslyJson(`${ARTIFACT_GUARD_COMMAND} --file "$HARNESSLY_ARTIFACT_FILE"`, cwd, {',
    '        HARNESSLY_ARTIFACT_FILE: filePath,',
    '      });',
    '      if (result && !result.allowed) {',
    '        writeHookOutput({',
    "          decision: 'block',",
    '          reason: `Harnessly 写保护：${result.reason}`',
    '        });',
    '        return;',
    '      }',
    '    } catch {',
    '      // artifact-guard 不可用时放行，避免阻断正常流程',
    '    }',
    '    writeHookOutput({ continue: true });',
    '  } catch (error) {',
    '    writeHookOutput({',
    '      continue: true,',
    '      additionalContext: `Claude Code PreToolUse hook 执行失败：${error instanceof Error ? error.message : String(error)}`,',
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
            matcher: '',
            hooks: [
              {
                type: 'command',
                command: `node "${repoRoot}/.harness/hosts/claude-code/hooks/session_start.js"`,
              },
            ],
          },
        ],
        UserPromptSubmit: [
          {
            matcher: '',
            hooks: [
              {
                type: 'command',
                command: `node "${repoRoot}/.harness/hosts/claude-code/hooks/user_prompt_submit.js"`,
              },
            ],
          },
        ],
        PreToolUse: [
          {
            matcher: 'Edit|Write',
            hooks: [
              {
                type: 'command',
                command: `node "${repoRoot}/.harness/hosts/claude-code/hooks/pre_tool_use.js"`,
              },
            ],
          },
        ],
        Stop: [
          {
            matcher: '',
            hooks: [
              {
                type: 'command',
                command: `node "${repoRoot}/.harness/hosts/claude-code/hooks/stop.js"`,
              },
            ],
          },
        ],
      },
    },
    null,
    2,
  )}\n`;
}

export function renderClaudeCodeManagedFiles(
  manifest: HostManifest,
  options: ClaudeCodeManagedFilesOptions = {},
): Record<string, string> {
  const agentManifests = options.agentManifests ?? [];

  const files: Record<string, string> = {
    '.claude/settings.json': renderClaudeCodeSettings(manifest),
    '.harness/hosts/claude-code/hooks/session_start.js': renderClaudeCodeSessionStartHook(),
    '.harness/hosts/claude-code/hooks/user_prompt_submit.js': renderClaudeCodeUserPromptSubmitHook(),
    '.harness/hosts/claude-code/hooks/stop.js': renderClaudeCodeStopHook(),
    '.harness/hosts/claude-code/hooks/pre_tool_use.js': renderClaudeCodePreToolUseHook(),
    '.harness/hosts/claude-code/hooks/shared/claude-code-hook-io.js': renderClaudeCodeHookIo(manifest),
  };

  // 渲染 v3-core 5 角色 sub-agent 文件（仅 enabled=true）
  for (const agentManifest of agentManifests) {
    if (!agentManifest.enabled) {
      continue;
    }
    files[`.claude/agents/harness-${agentManifest.role}.md`] =
      renderClaudeCodeSubagentFile(agentManifest);
  }

  return files;
}
