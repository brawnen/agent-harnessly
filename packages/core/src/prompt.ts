import type { FeedbackEntry, StageMarker, TaskContext } from '@harnessly/shared';

/**
 * 各 stage 下给 PM / coding agent 的执行指令片段。
 *
 * Phase 1：headless adapter 模式下 assemblePrompt 主要被 execute 阶段调用，
 * 但模板留出全 stage 槽位，便于 Phase 2 sub-agent 接管时复用。
 */
const STAGE_INSTRUCTIONS: Record<StageMarker, string[]> = {
  created: [
    '任务尚未进入主阶段。先等待 spec 阶段产出 contract.yaml。',
  ],
  spec: [
    '当前在 SPEC 阶段，只澄清需求、列可验收点。',
    '不要写代码、不要做技术方案，那是 design 阶段的事。',
  ],
  design: [
    '当前在 DESIGN 阶段，基于 contract.yaml 列实施步骤、依赖、风险。',
    '不要直接动手改代码。',
  ],
  execute: [
    '当前在 EXECUTE 阶段，严格按 plan.md 执行，不要修改 contract.yaml / plan.md。',
    '如果 plan 在执行中被证伪，停下来记录原因并标记 plan 待修正，不要绕过。',
    '完成后会进入 review / test / commit_gate 阶段做验证。',
  ],
  review: [
    '当前在 REVIEW 阶段，只读改动、给出 findings，不要再动代码。',
    '关注 scope 越界、敏感文件、改动规模、潜在副作用。',
  ],
  test: [
    '当前在 TEST 阶段，跑配置中的 required checks 与 acceptance 校验。',
    '只输出 evidence，不要修代码。',
  ],
  commit_gate: [
    '当前在 COMMIT_GATE 阶段，基于 review + test 的产出做三态决策。',
    '不要重新执行任务；如果 block，把失败原因写回 feedback。',
  ],
  failed: [
    '任务处于失败终态。检查 lastFailureStage 与 feedback，决定是否重试或调整。',
  ],
  retry: [
    '任务处于重试瞬态。Workflow 会按 resumeFrom 推进。',
  ],
};

function renderStageInstructions(stage: StageMarker): string {
  const lines = STAGE_INSTRUCTIONS[stage];
  return ['## Stage Instructions (' + stage + ')', ...lines.map((line) => `- ${line}`)].join('\n');
}

function renderContract(ctx: TaskContext): string {
  if (!ctx.contract) {
    return '## Contract (SPEC 工件)\n- missing';
  }

  return [
    '## Contract (SPEC 工件，不可修改)',
    `- goal: ${ctx.contract.goal}`,
    `- template: ${ctx.contract.templateName}`,
    `- risk: ${ctx.contract.riskLevel}`,
    `- scope_include: ${ctx.contract.scopeInclude.join('、') || '(空)'}`,
    `- acceptance: ${ctx.contract.acceptanceCriteria.map((item) => item.criterion).join('；') || '(空)'}`,
  ].join('\n');
}

function renderPlan(ctx: TaskContext): string {
  if (!ctx.plan) {
    return '## Plan (DESIGN 工件)\n- missing';
  }

  return ['## Plan (DESIGN 工件，不可修改)', ctx.plan.trim()].join('\n');
}

function renderRetryContext(ctx: TaskContext): string | null {
  if (ctx.state.retryCount <= 0 && !ctx.feedback) {
    return null;
  }

  const lines = [
    '## Retry Context',
    `- retry_count: ${ctx.state.retryCount}`,
    `- last_failure_stage: ${ctx.state.lastFailureStage ?? 'none'}`,
  ];

  if (ctx.feedback) {
    lines.push('', '### Feedback', ctx.feedback.trim());
  }

  return lines.join('\n');
}

function formatFeedbackEntryLine(entry: FeedbackEntry): string {
  const decoration = entry.failureStage ? ` @${entry.failureStage}` : '';
  return `- [${entry.taskId}] (${entry.template ?? 'general'}, ${entry.decision}, retry=${entry.retryCount})${decoration} ${entry.goal}`;
}

/**
 * 渲染跨任务 feedback pool 摘录，引导 PM 借鉴历史经验。
 * 输入由 workflow 层提前加载好，prompt 模块自身不做 I/O。
 */
function renderFeedbackPoolSection(ctx: TaskContext): string | null {
  const entries = ctx.feedbackPool;
  if (!entries || entries.length === 0) {
    return null;
  }

  return [
    '## Feedback Pool (历史经验摘录)',
    '> 同仓库已完成任务的简结构沉淀；用于借鉴模式与避坑，但每条都已脱敏，仅含 goal/decision/retry。',
    ...entries.map(formatFeedbackEntryLine),
  ].join('\n');
}

/**
 * 组装传给 adapter（headless 模式）或外部 coding agent 的执行 prompt。
 *
 * 输入：TaskContext（含 contract / plan / state / feedback）
 * 输出：分块文本 prompt，按 v3-core 6 阶段语义分别提示
 *
 * 注意：宿主主路径下，主 agent 自己组装 prompt，不会调用本函数；
 * 本函数主要服务于 execute 阶段的 adapter 子进程或 CLI fallback。
 */
export function assemblePrompt(ctx: TaskContext): string {
  const stage = ctx.state.currentStage;
  const sections: string[] = [
    '# Harnessly Execution Prompt',
    '',
    `task_id: ${ctx.taskId}`,
    `goal: ${ctx.goal}`,
    `current_stage: ${stage}`,
    `retry_count: ${ctx.state.retryCount}`,
    '',
    renderContract(ctx),
    '',
    renderPlan(ctx),
    '',
    renderStageInstructions(stage),
  ];

  const retryContext = renderRetryContext(ctx);
  if (retryContext) {
    sections.push('', retryContext);
  }

  const feedbackPoolSection = renderFeedbackPoolSection(ctx);
  if (feedbackPoolSection) {
    sections.push('', feedbackPoolSection);
  }

  sections.push(
    '',
    '## Rules',
    '- 只在 contract.scopeInclude 范围内修改',
    '- 优先最小改动',
    '- 完成后确保有可验证产物',
    '',
  );

  return sections.join('\n');
}
