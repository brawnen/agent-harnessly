import { TaskManager, WorkflowEngine } from '@harnessly/core';
import type { AdapterKind } from '@harnessly/shared';

import { printLines } from '../utils/output';

export async function runRetry(
  flags: Record<string, string | boolean>,
  positionals: string[],
): Promise<void> {
  const workDir = process.cwd();
  const manager = new TaskManager();
  const requestedTaskId =
    (typeof flags['task-id'] === 'string' ? flags['task-id'] : '') ||
    (positionals[0] ?? '').trim();
  const taskId = requestedTaskId || (await manager.getLatestTaskId(workDir));

  if (!taskId) {
    throw new Error('没有可重试的 task。请先执行 harnessly run。');
  }

  const ctx = await manager.resume(taskId, workDir);
  if (!ctx.contract || !ctx.plan) {
    throw new Error(`task ${taskId} 缺少 contract 或 plan，不能从 execute 阶段重试`);
  }

  const adapterKind =
    (typeof flags.adapter === 'string' ? flags.adapter : ctx.config.adapterKind) as AdapterKind;
  const adapterCommand =
    (typeof flags['adapter-command'] === 'string'
      ? flags['adapter-command']
      : ctx.config.adapterCommand) || '';

  const engine = new WorkflowEngine(manager);
  const result = await engine.run(ctx, {
    adapterKind,
    adapterCommand,
    dryRun: false,
    resumeFrom: 'execute',
  });

  if (!result.report) {
    throw new Error('retry 未生成 report');
  }

  printLines([
    result.report.commitReady ? '任务重试完成，commit gate 通过' : '任务重试结束，但 commit gate 未通过',
    `- task_id: ${ctx.taskId}`,
    `- retry_count: ${ctx.state.retryCount}`,
    `- report: ${ctx.taskDir}/report.json`,
    `- commit_ready: ${result.report.commitReady}`,
  ]);
}
