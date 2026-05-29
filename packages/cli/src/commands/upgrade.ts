import { loadHarnessConfig, TaskManager } from '@brawnen/harnessly-core';

import { appendHarnessEvent } from '../utils/events';
import { readActiveTaskId } from '../utils/hosts';
import { printJson } from '../utils/output';

/**
 * `harness upgrade` — 把 active task 从 lite preset 升档为 full preset。
 *
 * 按 SPEC §6.4.5 升档语义：
 * 1. 校验 state.preset === 'lite'（已是 full 拒绝；SPEC §6.4.5 不允许重复升档）
 * 2. 校验 state.status === 'active'（已关闭任务拒绝）
 * 3. 写 state: preset='full', presetSource='upgrade', presetSetAt=now,
 *    currentStage='design', currentOwner='designer'
 * 4. 既有 requirement.md / contract.yaml / 代码 diff / implementation-notes.md 保留不变
 * 5. 追加 events.jsonl: task.preset_upgraded
 *
 * 没有 active task 且未传 --task-id 时报错退出。
 */
export async function runUpgrade(flags: Record<string, string | boolean>): Promise<void> {
  const workDir = process.cwd();
  const explicitTaskId = typeof flags['task-id'] === 'string' ? flags['task-id'] : undefined;

  const targetTaskId = explicitTaskId ?? (await readActiveTaskId(workDir));
  if (!targetTaskId) {
    process.stderr.write(
      '没有 active task，且未指定 --task-id。先创建任务或用 --task-id <id> 指定要升档的任务。\n',
    );
    process.exitCode = 1;
    return;
  }

  const manager = new TaskManager();
  const ctx = await manager.load(targetTaskId, workDir);

  if (ctx.state.preset !== 'lite') {
    process.stderr.write(
      `任务 ${targetTaskId} 当前 preset 为 ${ctx.state.preset}，不允许重复升档。SPEC §6.4.5 升档仅可发生一次。\n`,
    );
    process.exitCode = 1;
    return;
  }

  if (ctx.state.status !== 'active') {
    process.stderr.write(
      `任务 ${targetTaskId} 当前状态为 ${ctx.state.status}，只有 active 任务可升档。\n`,
    );
    process.exitCode = 1;
    return;
  }

  const now = new Date().toISOString();
  ctx.state = {
    ...ctx.state,
    preset: 'full',
    presetSource: 'upgrade',
    presetSetAt: now,
    currentStage: 'design',
    currentOwner: 'designer',
    updatedAt: now,
  };
  await manager.saveState(ctx);

  // SPEC §6.4.7 升档事件
  const config = await loadHarnessConfig(workDir);
  await appendHarnessEvent(workDir, {
    type: 'task.preset_upgraded',
    task_id: targetTaskId,
    from: 'lite',
    to: 'full',
    host: config.defaultHost,
  });

  printJson({
    action: 'upgraded',
    taskId: targetTaskId,
    from: 'lite',
    to: 'full',
    currentStage: 'design',
    currentOwner: 'designer',
    upgradedAt: now,
    nextStep: 'spawn_harness_designer_or_run_eval',
    note: '既有 requirement.md / contract.yaml / 代码 diff / implementation-notes.md 保留不变。Designer sub-agent 需基于既有产物补出 design.md 与 task-breakdown.md。',
  });
}
