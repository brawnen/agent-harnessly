import { TaskManager } from '@harnessly/core';
import type { StageMarker, TaskStatus } from '@harnessly/shared';

import { readActiveTaskId } from '../../utils/hosts';
import { printJson } from '../../utils/output';

interface ActiveTaskInfo {
  goal: string;
  status: TaskStatus;
  currentStage: StageMarker;
  lastFailureStage: StageMarker | null;
}

type SessionRecommendation = 'idle' | 'resume' | 'retry';

/**
 * 根据 task state 推荐 host 主 agent 的下一步动作。
 * - idle：没有 active task
 * - retry：上一次失败，需要 PM 决定如何重试
 * - resume：正常推进
 */
function pickRecommendation(
  hasActiveTask: boolean,
  status: TaskStatus | null,
): SessionRecommendation {
  if (!hasActiveTask) {
    return 'idle';
  }

  if (status === 'failed') {
    return 'retry';
  }

  return 'resume';
}

export async function runHostSessionStart(): Promise<void> {
  const activeTaskId = await readActiveTaskId(process.cwd());
  let task: ActiveTaskInfo | null = null;
  let retryCount = 0;
  let lastFailureReason: string | null = null;
  let status: TaskStatus | null = null;

  if (activeTaskId) {
    const ctx = await new TaskManager().load(activeTaskId, process.cwd());
    status = ctx.state.status;
    task = {
      goal: ctx.goal,
      status: ctx.state.status,
      currentStage: ctx.state.currentStage,
      lastFailureStage: ctx.state.lastFailureStage ?? null,
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
    recommendation: pickRecommendation(Boolean(activeTaskId), status),
  });
}
