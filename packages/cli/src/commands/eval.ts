import { collectEvidence, createTaskReport, evaluateCommitGate, TaskManager } from '@harnessly/core';
import type { AdapterOutput } from '@harnessly/shared';

import { appendHarnessEvent } from '../utils/events';
import { printLines } from '../utils/output';

function createEvalOnlyAdapter(): AdapterOutput {
  return {
    kind: 'custom',
    command: 'eval-only',
    exitCode: 0,
    stdout: '',
    stderr: '',
  };
}

export async function runEval(
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
    throw new Error('没有可重验证的 task。请先执行 harnessly run。');
  }

  const ctx = await manager.resume(taskId, workDir);
  const previousReport = await manager.loadReport(taskId, workDir);

  ctx.state.status = 'verifying';
  ctx.state.currentStage = 'test';
  await manager.saveState(ctx);

  const evidence = await collectEvidence(workDir, ctx.config, ctx.contract);
  const adapter = previousReport?.adapter ?? createEvalOnlyAdapter();
  const commitGate = evaluateCommitGate(evidence, adapter.exitCode);
  const report = createTaskReport(ctx, adapter, evidence, commitGate);
  await manager.saveReport(ctx, report);
  await appendHarnessEvent(workDir, {
    type: 'eval.report_written',
    taskId: ctx.taskId,
    reportPath: `${ctx.taskDir}/report.json`,
    commitReady: report.commitReady,
  });

  printLines([
    report.commitReady ? '重验证完成，commit gate 通过' : '重验证完成，但 commit gate 未通过',
    `- task_id: ${ctx.taskId}`,
    `- report: ${ctx.taskDir}/report.json`,
    `- changed_files: ${
      report.evidence.changedFiles.length > 0 ? report.evidence.changedFiles.join(', ') : 'none'
    }`,
    `- commit_ready: ${report.commitReady}`,
  ]);
}
