import { runResidentReview } from '@harnessly/core';

import { printJson, printLines } from '../../utils/output';

function readStringFlag(flags: Record<string, string | boolean>, name: string): string {
  const value = flags[name];
  return typeof value === 'string' ? value : '';
}

/**
 * harness host resident-review --trigger <pre_push|pre_merge> [--task-id <id>]
 *
 * v3-core §14 常驻 review agent 入口。
 * 由 git hook 脚本或用户手动触发。
 */
export async function runHostResidentReview(
  flags: Record<string, string | boolean>,
): Promise<void> {
  const workDir = process.cwd();
  const trigger = readStringFlag(flags, 'trigger');
  if (!trigger || !['pre_push', 'pre_merge', 'on_demand'].includes(trigger)) {
    throw new Error('--trigger 必须为 pre_push、pre_merge 或 on_demand');
  }

  const taskId = readStringFlag(flags, 'task-id') || undefined;
  const result = await runResidentReview(workDir, trigger, taskId);

  if (flags.json) {
    printJson(result);
    return;
  }

  printLines([
    `常驻 review 完成 (trigger: ${trigger})`,
    `- spawned agents: ${result.agentsSpawned.join(', ') || '(none)'}`,
    `- findings: ${result.findings.length}`,
    `- blocking: ${result.hadBlockingFinding}`,
  ]);

  // SPEC §14: P0 命中 blocking_severity 时 exit 1 阻断 git hook
  if (result.hadBlockingFinding) {
    process.exit(1);
  }
}
