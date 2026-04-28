import {
  TaskManager,
  WorkflowEngine,
} from '@harnessly/core';
import type { AdapterKind } from '@harnessly/shared';

import { confirmContract } from '../utils/interaction';
import { printLines } from '../utils/output';

function normalizeGoal(positionals: string[], flags: Record<string, string | boolean>): string {
  if (typeof flags.goal === 'string' && flags.goal.trim()) {
    return flags.goal.trim();
  }

  return positionals.join(' ').trim();
}

export async function runTask(
  flags: Record<string, string | boolean>,
  positionals: string[],
): Promise<void> {
  const workDir = process.cwd();
  const manager = new TaskManager();

  if (typeof flags.resume === 'string' && flags.resume.trim()) {
    const ctx = await manager.resume(flags.resume.trim(), workDir);
    printLines([
      '任务已恢复',
      `- task_id: ${ctx.taskId}`,
      `- goal: ${ctx.goal}`,
      `- status: ${ctx.state.status}`,
      `- current_stage: ${ctx.state.currentStage}`,
      `- retry_count: ${ctx.state.retryCount}`,
      `- last_failure: ${ctx.state.lastFailureReason ?? 'none'}`,
    ]);
    return;
  }

  const goal = normalizeGoal(positionals, flags);
  if (!goal) {
    throw new Error('缺少 goal。用法：harnessly run --dry-run "<goal>"');
  }

  const ctx = await manager.create(goal, workDir);
  const isDryRun = flags['dry-run'] === true;
  const adapterKind =
    (typeof flags.adapter === 'string' ? flags.adapter : ctx.config.adapterKind) as AdapterKind;
  const adapterCommand =
    (typeof flags['adapter-command'] === 'string'
      ? flags['adapter-command']
      : ctx.config.adapterCommand) || '';
  const engine = new WorkflowEngine(manager);
  await engine.run(ctx, {
    adapterKind,
    adapterCommand,
    dryRun: true,
  });
  const confirmed = await confirmContract(
    {
      taskId: ctx.taskId,
      goal: ctx.goal,
      templateName: ctx.contract?.templateName ?? 'unknown',
      contractPath: `${ctx.taskDir}/contract.yaml`,
      planPath: `${ctx.taskDir}/plan.md`,
    },
    flags,
  );

  if (!confirmed) {
    printLines([
      'contract 未确认，任务已保留',
      `- task_id: ${ctx.taskId}`,
      `- contract: ${ctx.taskDir}/contract.yaml`,
      `- plan: ${ctx.taskDir}/plan.md`,
      `- status: ${ctx.state.status}`,
    ]);
    return;
  }

  if (isDryRun) {
    printLines([
      'dry-run 已生成 contract 与 plan',
      `- task_id: ${ctx.taskId}`,
      `- template: ${ctx.contract?.templateName ?? 'unknown'}`,
      `- contract: ${ctx.taskDir}/contract.yaml`,
      `- plan: ${ctx.taskDir}/plan.md`,
      `- confirmed: true`,
      `- status: ${ctx.state.status}`,
    ]);
    return;
  }

  const result = await engine.run(ctx, {
    adapterKind,
    adapterCommand,
    dryRun: false,
    resumeFrom: 'plan',
  });

  if (!result.dryRun && result.report) {
    printLines([
      result.report.commitReady ? '任务执行完成，commit gate 通过' : '任务执行结束，但 commit gate 未通过',
      `- task_id: ${ctx.taskId}`,
      `- adapter: ${adapterKind}`,
      `- report: ${ctx.taskDir}/report.json`,
      `- changed_files: ${
        result.report.evidence.changedFiles.length > 0
          ? result.report.evidence.changedFiles.join(', ')
          : 'none'
      }`,
      `- commit_ready: ${result.report.commitReady}`,
    ]);
    return;
  }
}
