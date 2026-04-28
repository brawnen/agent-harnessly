import { TaskManager } from '@harnessly/core';

import { readActiveTaskId } from '../../utils/hosts';
import { printJson } from '../../utils/output';

export async function runHostSessionStart(): Promise<void> {
  const activeTaskId = await readActiveTaskId(process.cwd());
  let task: { goal: string; status: string } | null = null;
  let retryCount = 0;
  let lastFailureReason: string | null = null;

  if (activeTaskId) {
    const ctx = await new TaskManager().load(activeTaskId, process.cwd());
    task = {
      goal: ctx.goal,
      status: ctx.state.status,
    };
    retryCount = ctx.state.retryCount;
    lastFailureReason = ctx.state.lastFailureReason ?? null;
  }

  printJson({
    hasActiveTask: Boolean(activeTaskId),
    activeTaskId,
    task,
    retryCount,
    lastFailureReason,
    recommendation: activeTaskId ? 'resume' : 'idle',
  });
}
