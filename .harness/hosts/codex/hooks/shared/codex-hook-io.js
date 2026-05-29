const fs = require('node:fs');
const { spawnSync } = require('node:child_process');

function readHookPayload() {
  const raw = fs.readFileSync(0, 'utf8').trim();
  if (!raw) {
    return {};
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error('hook stdin 不是合法 JSON');
  }
}

function resolvePayloadCwd(payload) {
  return typeof payload?.cwd === 'string' && payload.cwd.trim() ? payload.cwd.trim() : process.cwd();
}

function resolvePayloadPrompt(payload) {
  if (typeof payload?.prompt === 'string') {
    return payload.prompt;
  }
  if (typeof payload?.input === 'string') {
    return payload.input;
  }
  if (typeof payload?.user_input === 'string') {
    return payload.user_input;
  }
  return '';
}

function buildCodexHookOutput(eventName, decision) {
  if (decision.status === 'block') {
    return {
      decision: 'block',
      reason: decision.reason,
    };
  }
  if (!decision.additionalContext) {
    return { continue: true, suppressOutput: true };
  }
  return {
    continue: true,
    suppressOutput: true,
    hookSpecificOutput: {
      additionalContext: decision.additionalContext,
      hookEventName: eventName,
    },
  };
}

function writeHookOutput(result) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

function writeContinue(eventName, message) {
  writeHookOutput(
    buildCodexHookOutput(eventName, {
      status: 'continue',
      additionalContext: message,
    }),
  );
}

function runHarnesslyJson(command, cwd, extraEnv = {}) {
  const result = spawnSync(command, {
    cwd,
    shell: true,
    encoding: 'utf8',
    env: {
      ...process.env,
      ...extraEnv,
    },
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status && result.status !== 0) {
    throw new Error(result.stderr?.trim() || result.stdout?.trim() || `命令执行失败: ${command}`);
  }
  const text = (result.stdout || '').trim();
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`命令输出不是合法 JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function buildSessionStartContext(result) {
  if (!result?.hasActiveTask || !result?.activeTaskId || !result?.task) {
    return '';
  }
  const lines = [
    '当前存在 active task：',
    `- task_id: ${result.activeTaskId}`,
    `- goal: ${result.task.goal}`,
    `- status: ${result.task.status}`,
    `- current_stage: ${result.task.currentStage ?? "unknown"}`,
    `- retry_count: ${result.retryCount ?? 0}`,
    `- last_failure: ${result.lastFailureReason ?? 'none'}`,
    `- recommendation: ${result.recommendation ?? "resume"}`,
  ];
  return lines.join('\n');
}

function buildPromptSubmitContext(result, prompt) {
  const safePrompt = typeof prompt === 'string' ? prompt.trim() : '';
  const quotedPrompt = JSON.stringify(safePrompt);
  const recommendedAgent = result?.recommendedAgent || null;
  const activeStage = result?.activeStage || null;
  // v2.1 (SPEC §6.4.4 + P1 spec §4.8.1): lite preset 完全不注入。
  // 三阶段由主 agent 直接承担，不需要 sub-agent；注入会污染上下文。
  const preset = result?.preset || 'lite';
  if (preset === 'lite') {
    return '';
  }
  if (result?.action === 'resume_task' && result?.activeTaskId) {
    const lines = [
      '[Harnessly full preset] 检测到这条输入更像续接当前 full 任务。',
      `- active_task_id: ${result.activeTaskId}`,
      activeStage ? `- active_stage: ${activeStage}` : null,
      '请优先沿用当前 active task 继续，而不是新建任务。',
      recommendedAgent
        ? `当 prompt 表达推进意图（继续 / 确认 / 具体改动请求）时，你必须使用 Task tool spawn ${recommendedAgent} sub-agent 接管当前阶段；execute 阶段仍由主 agent 自己执行。若 prompt 是澄清问题或闲聊，对话回应即可，不要 spawn sub-agent。`
        : null,
    ].filter(Boolean);
    return lines.join('\n');
  }
  if (result?.action === 'delegate_to_planner' && safePrompt) {
    if (!recommendedAgent) {
      return '[Harnessly full preset] 检测到新 full 任务，但 .harness/agents/ 中无可用 sub-agent（requirement 角色未启用）。请检查 manifest 配置。';
    }
    return [
      '[Harnessly full preset] 检测到这条输入更像新 full 任务。',
      `推进任务时你必须 spawn custom agent named ${recommendedAgent}，由它完成 SPEC 阶段需求澄清与可验收点列举。`,
      `${recommendedAgent} 必须生成或定位 .harness/tasks/<task-id>/contract.yaml 与 plan.md；不要只返回口头计划。`,
      '如当前宿主无法稳定调用 sub-agent，再按 repo 配置降级到 hook / command bridge / manual-headless。',
    ].join('\n');
  }
  if (result?.action === 'create_task' && safePrompt) {
    if (result?.taskCreated && result?.taskId) {
      return [
        '[Harnessly full preset] 已为这条输入自动创建 full 任务，并生成 contract / plan。',
        `- task_id: ${result.taskId}`,
        result.contractPath ? `- contract: ${result.contractPath}` : null,
        result.planPath ? `- plan: ${result.planPath}` : null,
        '推进任务时你必须 spawn `harness-requirement` sub-agent 接管 spec 阶段产物澄清，不要自己直接写 requirement.md / design.md。',
        '请先基于 contract / plan 控制范围，再继续执行。',
      ].filter(Boolean).join('\n');
    }
    return [
      '[Harnessly full preset] 检测到这条输入更像新 full 任务。',
      `在真正编码前，请先执行 Harnessly contract 流程：harnessly run --dry-run ${quotedPrompt}`,
      '确认 contract 与 plan 后，再继续执行；推进 SPEC 阶段必须 spawn `harness-requirement` sub-agent。',
    ].join('\n');
  }
  return '';
}

function buildCompletionDecision(result) {
  if (result?.pass === false) {
    const nextStep = result.nextStep ? `\n下一步：${result.nextStep}` : "";
    const agentHint = result.recommendedAgent ? `\n建议委派：${result.recommendedAgent}` : "";
    const evalCommand = result.evalCommand ? `\n可执行命令：${result.evalCommand}` : "";
    const stageHint = result.lastFailureStage
      ? `\n失败位置：${result.lastFailureStage}`
      : (result.activeStage ? `\n当前阶段：${result.activeStage}` : "");
    const blockCount = typeof result.blockCount === 'number' ? result.blockCount : 0;
    const blockEscalation = blockCount >= 3
      ? `\n[已被阻断 ${blockCount} 次] 建议人工介入：检查 contract.scope.exclude 是否合理、是否存在工具误判；必要时运行 \`harnessly retry\` 重置任务状态。`
      : '';
    return {
      status: 'block',
      reason: `Harnessly completion gate 未通过：${result.reason}${stageHint}${agentHint}${evalCommand}${nextStep}${blockEscalation}`,
    };
  }
  return {
    status: 'continue',
    additionalContext: "",
  };
}

const SESSION_START_COMMAND = "\"/opt/homebrew/bin/harnessly\" host session-start";
const USER_PROMPT_COMMAND = "\"/opt/homebrew/bin/harnessly\" host user-prompt-submit";
const COMPLETION_GATE_COMMAND = "\"/opt/homebrew/bin/harnessly\" host completion-gate";

module.exports = {
  buildCodexHookOutput,
  buildCompletionDecision,
  buildPromptSubmitContext,
  buildSessionStartContext,
  COMPLETION_GATE_COMMAND,
  readHookPayload,
  resolvePayloadCwd,
  resolvePayloadPrompt,
  runHarnesslyJson,
  SESSION_START_COMMAND,
  USER_PROMPT_COMMAND,
  writeContinue,
  writeHookOutput,
};
