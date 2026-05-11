import { loadFeedbackPool, promoteFeedbackEntry } from '@brawnen/harnessly-core';

import { printLines } from '../utils/output';

export async function runFeedback(args: string[]): Promise<void> {
  const workDir = process.cwd();
  const subcommand = args[0] ?? 'list';

  if (subcommand === 'list') {
    const entries = await loadFeedbackPool(workDir);
    printLines(
      entries.map((entry) =>
        `${entry.taskId}\t${entry.decision}\tretry=${entry.retryCount}\t${entry.goal}`,
      ),
    );
    return;
  }

  if (subcommand === 'promote') {
    const taskId = args[1];
    if (!taskId) {
      throw new Error('缺少 task-id。用法：harnessly feedback promote <task-id> [reason]');
    }
    const reason = args.slice(2).join(' ').trim() || 'manual promotion';
    const entry = await promoteFeedbackEntry(workDir, taskId, reason);
    printLines([`feedback promoted: ${entry.taskId}`]);
    return;
  }

  throw new Error(`未知 feedback 子命令：${subcommand}`);
}
