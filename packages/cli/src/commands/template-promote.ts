import { createTemplateDraft, deriveTemplateName, saveTemplateDraft, TaskManager } from '@brawnen/harnessly-core';

import { printLines } from '../utils/output';

export async function runTemplatePromote(
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
    throw new Error('没有可提升为模板的 task。请先执行 harnessly run。');
  }

  const ctx = await manager.load(taskId, workDir);
  const report = await manager.loadReport(taskId, workDir);

  if (!ctx.contract) {
    throw new Error(`task ${taskId} 缺少 contract.yaml，不能提升模板`);
  }

  if (!report) {
    throw new Error(`task ${taskId} 缺少 report.json，不能提升模板`);
  }

  if (!report.commitReady) {
    throw new Error(`task ${taskId} 未通过 commit gate，不能提升模板`);
  }

  const name =
    (typeof flags.name === 'string' ? flags.name.trim() : '') || deriveTemplateName(ctx.goal);
  const template = createTemplateDraft(name, ctx.contract, report, ctx.config);
  const filePath = await saveTemplateDraft(workDir, template);

  printLines([
    '模板提升完成',
    `- task_id: ${taskId}`,
    `- name: ${template.name}`,
    `- template: ${filePath}`,
  ]);
}
