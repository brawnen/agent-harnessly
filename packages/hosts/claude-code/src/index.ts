import type { AgentManifest, HostManifest } from '@brawnen/harnessly-shared';
import { createHostManifest, renderClaudeCodeSubagentFile, resolveRepoRoot } from '@brawnen/harnessly-host-shared';

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
    '  // v2.1 (SPEC §6.4.4 + P1 spec §4.8.1): lite preset 完全不注入。',
    '  // 三阶段由主 agent 直接承担，不需要 sub-agent；注入会污染上下文。',
    "  const preset = result?.preset || 'lite';",
    "  if (preset === 'lite') {",
    "    return '';",
    '  }',
    "  if (result?.action === 'resume_task' && result?.activeTaskId) {",
    '    const lines = [',
    "      '[Harnessly full preset] 检测到这条输入更像续接当前 full 任务。',",
    '      `- active_task_id: ${result.activeTaskId}`,',
    '      activeStage ? `- active_stage: ${activeStage}` : null,',
    "      '请优先沿用当前 active task 继续，而不是新建任务。',",
    '      recommendedAgent',
    '        ? `当 prompt 表达推进意图（继续 / 确认 / 具体改动请求）时，你必须使用 Task tool spawn ${recommendedAgent} sub-agent 接管当前阶段；execute 阶段仍由主 agent 自己执行。若 prompt 是澄清问题或闲聊，对话回应即可，不要 spawn sub-agent。`',
    '        : null,',
    '    ].filter(Boolean);',
    "    return lines.join('\\n');",
    '  }',
    "  if (result?.action === 'delegate_to_planner' && safePrompt) {",
    '    if (!recommendedAgent) {',
    "      return '[Harnessly full preset] 检测到新 full 任务，但 .harness/agents/ 中无可用 sub-agent（requirement 角色未启用）。请检查 manifest 配置。';",
    '    }',
    '    return [',
    "      '[Harnessly full preset] 检测到这条输入更像新 full 任务。',",
    '      `推进任务时你必须 spawn custom agent named ${recommendedAgent}，由它完成 SPEC 阶段需求澄清与可验收点列举。`,',
    '      `${recommendedAgent} 必须生成或定位 .harness/tasks/<task-id>/contract.yaml 与 plan.md；不要只返回口头计划。`,',
    "      '如当前宿主无法稳定调用 sub-agent，再按 repo 配置降级到 hook / command bridge / manual-headless。',",
    "    ].join('\\n');",
    '  }',
    "  if (result?.action === 'create_task' && safePrompt) {",
    '    if (result?.taskCreated && result?.taskId) {',
    '      return [',
    "        '[Harnessly full preset] 已为这条输入自动创建 full 任务，并生成 contract / plan。',",
    '        `- task_id: ${result.taskId}`,',
    '        result.contractPath ? `- contract: ${result.contractPath}` : null,',
    '        result.planPath ? `- plan: ${result.planPath}` : null,',
    "        '推进任务时你必须 spawn `harness-requirement` sub-agent 接管 spec 阶段产物澄清，不要自己直接写 requirement.md / design.md。',",
    "        '请先基于 contract / plan 控制范围，再继续执行。',",
    "      ].filter(Boolean).join('\\n');",
    '    }',
    '    return [',
    "      '[Harnessly full preset] 检测到这条输入更像新 full 任务。',",
    '      `在真正编码前，请先执行 Harnessly contract 流程：harnessly run --dry-run ${quotedPrompt}`,',
    "      '确认 contract 与 plan 后，再继续执行；推进 SPEC 阶段必须 spawn `harness-requirement` sub-agent。',",
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
    "    const blockCount = typeof result.blockCount === 'number' ? result.blockCount : 0;",
    '    const blockEscalation = blockCount >= 3',
    '      ? `\\n[已被阻断 ${blockCount} 次] 建议人工介入：检查 contract.scope.exclude 是否合理、是否存在工具误判；必要时运行 \\`harnessly retry\\` 重置任务状态。`',
    "      : '';",
    '    return {',
    "      decision: 'block',",
    '      reason: `Harnessly completion gate 未通过：${result.reason}${stageHint}${agentHint}${evalCommand}${nextStep}${blockEscalation}`,',
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

// --- Slash commands ---
// v2.1 阶段 2c dogfood 发现：Claude Code 2.x 没有 file-based slash command 机制
// （`.claude/commands/*.md` 不被识别；slash commands 等同于 Skills，路径
// 是 `~/.claude/skills/<name>/SKILL.md`）。按 SPEC §6.4.8 SHOULD 措辞，
// 改走 marker fallback：用户直接打 `[harness:feat] <goal>` 触发 full preset，
// `harness upgrade` / `harness status` 用 CLI 直调。

// --- Settings & managed files ---

export function renderClaudeCodeSettings(_manifest: HostManifest, workDir: string): string {
  const repoRoot = resolveRepoRoot(workDir);
  return `${JSON.stringify(
    {
      // v2.1: 信任 workspace 默认放行，删除/不可逆操作 ask 人工确认。
      // Harnessly 的真护栏在 hook 层（artifact-guard / completion-gate / scope-check），
      // permission 层放行 bash 不削弱安全性，只去掉逐条确认噪音。
      // 注意：Bash 规则是前缀匹配，复合命令（如 `echo x && rm -rf y`）绕不过 ask ——
      // 删除的最终兜底应靠 sandbox 本身（git / 容器 / 文件系统快照），ask 仅降低误删概率。
      permissions: {
        defaultMode: 'acceptEdits',
        allow: ['Bash'],
        ask: [
          'Bash(rm *)',
          'Bash(rmdir *)',
          'Bash(find * -delete*)',
          'Bash(git clean *)',
          'Bash(git reset --hard*)',
          'Bash(git push --force*)',
          'Bash(git push -f *)',
          'Bash(truncate *)',
          'Bash(dd *)',
        ],
      },
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
  workDir: string,
  options: ClaudeCodeManagedFilesOptions = {},
): Record<string, string> {
  const agentManifests = options.agentManifests ?? [];

  const files: Record<string, string> = {
    '.claude/settings.json': renderClaudeCodeSettings(manifest, workDir),
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
