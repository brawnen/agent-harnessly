import path from 'node:path';

import { archiveTaskArtifacts, TaskManager, type ArchiveKind } from '@harnessly/core';

import { appendHarnessEvent } from '../utils/events';
import { printJson, printLines } from '../utils/output';

const VALID_KINDS: readonly ArchiveKind[] = ['requirement', 'design', 'both'];

function isArchiveKind(value: string): value is ArchiveKind {
  return (VALID_KINDS as readonly string[]).includes(value);
}

function readStringFlag(flags: Record<string, string | boolean>, name: string): string {
  return typeof flags[name] === 'string' ? (flags[name] as string).trim() : '';
}

/**
 * harness archive <kind> [task-id] [--topic <name>] [--force] [--latest] [--json]
 *
 * 把任务工件晋升到 docs/architecture/<topic>/<task-id>/。
 * 不修改 .harness/tasks/。
 */
export async function runArchive(
  flags: Record<string, string | boolean>,
  positionals: string[],
): Promise<void> {
  const workDir = process.cwd();
  const [rawKind, rawTaskId] = positionals;
  const kindInput = (rawKind ?? '').trim();

  if (!kindInput) {
    throw new Error(
      `缺少 archive kind。允许值：${VALID_KINDS.join(', ')}\n用法：harnessly archive <kind> <task-id> [--topic <name>] [--force]`,
    );
  }

  if (!isArchiveKind(kindInput)) {
    throw new Error(`非法的 archive kind: "${kindInput}"。允许值：${VALID_KINDS.join(', ')}`);
  }

  const manager = new TaskManager();
  const requestedTaskId = readStringFlag(flags, 'task-id') || (rawTaskId ?? '').trim();
  const useLatest = flags.latest === true;

  let taskId = requestedTaskId;
  if (!taskId) {
    if (!useLatest) {
      throw new Error('缺少 task-id。可显式传入或加 --latest 自动取最近一个 task。');
    }
    const latest = await manager.getLatestTaskId(workDir);
    if (!latest) {
      throw new Error('没有任何 task。先执行 harnessly run 或 harnessly host user-prompt-submit。');
    }
    taskId = latest;
  }

  const topic = readStringFlag(flags, 'topic') || undefined;
  const force = flags.force === true;

  const result = await archiveTaskArtifacts(workDir, taskId, kindInput, { topic, force });

  await appendHarnessEvent(workDir, {
    type: 'archive.task_promoted',
    taskId: result.taskId,
    topic: result.topic,
    kind: kindInput,
    force,
    files: result.files.map((f) => ({
      target: path.relative(workDir, f.target),
      status: f.status,
    })),
  });

  if (flags.json === true) {
    printJson({
      taskId: result.taskId,
      topic: result.topic,
      kind: kindInput,
      targetDir: path.relative(workDir, result.targetDir),
      files: result.files.map((f) => ({
        source: f.source.startsWith(workDir) ? path.relative(workDir, f.source) : f.source,
        target: path.relative(workDir, f.target),
        status: f.status,
      })),
    });
    return;
  }

  printLines([
    `归档完成：${result.taskId} → ${path.relative(workDir, result.targetDir)}`,
    `- topic: ${result.topic}`,
    `- kind: ${kindInput}`,
    ...result.files.map(
      (f) => `- ${path.relative(workDir, f.target)} [${f.status}]`,
    ),
  ]);
}
