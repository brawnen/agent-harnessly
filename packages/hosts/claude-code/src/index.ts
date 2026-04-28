import type { HostManifest, HostSubagentConfig } from '@harnessly/shared';
import { createHostManifest } from '@harnessly/host-shared';

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

export function getClaudeCodeHostManifest() {
  return createHostManifest('claude-code');
}

export function renderClaudeCodeSettings(manifest: HostManifest): string {
  return `${JSON.stringify(
    {
      hooks: {
        SessionStart: [
          {
            type: 'command',
            command: manifest.sessionStartCommand,
          },
        ],
        UserPromptSubmit: [
          {
            type: 'command',
            command: manifest.userPromptSubmitCommand,
          },
        ],
        Stop: [
          {
            type: 'command',
            command: manifest.completionGateCommand,
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
    ? '- 优先使用宿主 plan mode 完成目标澄清、scope、acceptance criteria 和执行步骤建模。'
    : '- 不要求使用宿主 plan mode；但仍必须在执行前完成目标澄清、scope 和验收标准建模。';

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
  config: HostSubagentConfig = DEFAULT_SUBAGENTS,
): Record<string, string> {
  return {
    '.claude/settings.json': renderClaudeCodeSettings(manifest),
    '.claude/agents/harness-planner.md': renderClaudeCodePlannerAgent(config),
    '.claude/agents/harness-evaluator.md': renderClaudeCodeEvaluatorAgent(config),
  };
}
