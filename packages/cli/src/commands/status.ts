import { TaskManager } from '@brawnen/harnessly-core';

import { collectHostStatus, readActiveTaskId } from '../utils/hosts';
import { printJson, printLines } from '../utils/output';

interface TaskStatusPayload {
  taskId: string;
  goal: string;
  status: string;
  currentStage: string;
  retryCount: number;
  contractReady: boolean;
  planReady: boolean;
  reportReady: boolean;
  commitReady: boolean | null;
  changedFiles: string[];
  lastFailureStage: string | null;
  lastFailureReason: string | null;
  updatedAt: string;
}

function resolveRequestedTaskId(
  flags: Record<string, string | boolean>,
  positionals: string[],
): string {
  if (typeof flags['task-id'] === 'string' && flags['task-id'].trim()) {
    return flags['task-id'].trim();
  }

  return (positionals[0] ?? '').trim();
}

export async function runStatus(
  flags: Record<string, string | boolean>,
  positionals: string[],
): Promise<void> {
  const workDir = process.cwd();
  const manager = new TaskManager();
  const requestedTaskId = resolveRequestedTaskId(flags, positionals);
  const [activeTaskId, latestTaskId, hosts] = await Promise.all([
    readActiveTaskId(workDir),
    manager.getLatestTaskId(workDir),
    collectHostStatus(workDir),
  ]);
  const selectedTaskId = requestedTaskId || activeTaskId || latestTaskId;

  if (!selectedTaskId) {
    if (flags.json === true) {
      printJson({
        activeTaskId,
        selectedTaskId: null,
        task: null,
        hosts,
      });
      return;
    }

    printLines([
      '任务状态',
      '- 当前没有 task。先执行 harnessly run "<goal>" 创建任务。',
      ...hosts.map(
        (host) =>
          `- host ${host.host}: manifest=${host.manifest}, shell=${host.shell}, files=${
            host.files.length > 0 ? host.files.join(', ') : 'none'
          }`,
      ),
    ]);
    return;
  }

  const [ctx, report] = await Promise.all([
    manager.load(selectedTaskId, workDir),
    manager.loadReport(selectedTaskId, workDir),
  ]);
  const task: TaskStatusPayload = {
    taskId: ctx.taskId,
    goal: ctx.goal,
    status: ctx.state.status,
    currentStage: ctx.state.currentStage,
    retryCount: ctx.state.retryCount,
    contractReady: Boolean(ctx.contract),
    planReady: Boolean(ctx.plan),
    reportReady: report !== null,
    commitReady: report?.commitReady ?? null,
    changedFiles: report?.evidence.changedFiles ?? [],
    lastFailureStage: ctx.state.lastFailureStage ?? null,
    lastFailureReason: ctx.state.lastFailureReason ?? null,
    updatedAt: ctx.state.updatedAt,
  };

  if (flags.json === true) {
    printJson({
      activeTaskId,
      selectedTaskId,
      task,
      hosts,
    });
    return;
  }

  printLines([
    '任务状态',
    `- selected_task: ${selectedTaskId}`,
    `- active_task: ${activeTaskId ?? 'none'}`,
    `- goal: ${task.goal}`,
    `- status: ${task.status}`,
    `- current_stage: ${task.currentStage}`,
    `- retry_count: ${task.retryCount}`,
    `- contract_ready: ${task.contractReady}`,
    `- plan_ready: ${task.planReady}`,
    `- report_ready: ${task.reportReady}`,
    `- commit_ready: ${task.commitReady ?? 'unknown'}`,
    `- changed_files: ${task.changedFiles.length > 0 ? task.changedFiles.join(', ') : 'none'}`,
    `- last_failure_stage: ${task.lastFailureStage ?? 'none'}`,
    `- last_failure: ${task.lastFailureReason ?? 'none'}`,
    `- updated_at: ${task.updatedAt}`,
    ...hosts.map(
      (host) =>
        `- host ${host.host}: manifest=${host.manifest}, shell=${host.shell}, files=${
          host.files.length > 0 ? host.files.join(', ') : 'none'
        }`,
    ),
  ]);
}
