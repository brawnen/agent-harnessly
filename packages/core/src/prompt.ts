import type { TaskContext } from '@harnessly/shared';

export function assemblePrompt(ctx: TaskContext): string {
  const contractPart = ctx.contract
    ? [
        '## Contract',
        `- goal: ${ctx.contract.goal}`,
        `- template: ${ctx.contract.templateName}`,
        `- risk: ${ctx.contract.riskLevel}`,
        `- scope_include: ${ctx.contract.scopeInclude.join('、')}`,
        `- acceptance: ${ctx.contract.acceptanceCriteria.join('；')}`,
      ].join('\n')
    : '## Contract\n- missing';

  const planPart = ctx.plan ? `## Plan\n${ctx.plan}` : '## Plan\n- missing';
  const feedbackPart = ctx.feedback ? `## Retry Feedback\n${ctx.feedback}` : '';

  return [
    '# Harnessly Execution Prompt',
    '',
    `task_id: ${ctx.taskId}`,
    `goal: ${ctx.goal}`,
    '',
    contractPart,
    '',
    planPart,
    feedbackPart ? `\n${feedbackPart}\n` : '',
    '',
    '## Rules',
    '- 只在目标范围内修改',
    '- 优先最小改动',
    '- 完成后确保有可验证产物',
    '',
  ].join('\n');
}
