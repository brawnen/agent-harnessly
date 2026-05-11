import type { Contract } from '@harnessly/shared';

export function generatePlan(contract: Contract): string {
  const acceptance = contract.acceptanceCriteria.map((item) => item.criterion).join('；');
  const lines = [
    '# Plan',
    '',
    `1. 明确 ${contract.goal} 对应的修改边界：${contract.scopeInclude.join('、')}`,
    '2. 在最小改动范围内完成实现或修复',
    `3. 按验收标准自检：${acceptance}`,
    '',
  ];

  return lines.join('\n');
}
