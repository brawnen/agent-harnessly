import path from 'node:path';

import {
  archiveTaskArtifacts,
  listArchiveTopics,
  promoteTaskArtifacts,
  showArchiveTopic,
  TaskManager,
  verifyArchive,
  type ArchiveKind,
} from '@brawnen/harnessly-core';

import { appendHarnessEvent } from '../utils/events';
import { printJson, printLines } from '../utils/output';

const VALID_KINDS: readonly ArchiveKind[] = ['requirement', 'design', 'both'];
const VALID_MODES = ['new_topic', 'append', 'replace'] as const;

function isArchiveKind(value: string): value is ArchiveKind {
  return (VALID_KINDS as readonly string[]).includes(value);
}

function readStringFlag(flags: Record<string, string | boolean>, name: string): string {
  return typeof flags[name] === 'string' ? (flags[name] as string).trim() : '';
}

function parseFiles(value: string): string[] {
  return value
    .split(',')
    .map((f) => f.trim())
    .filter(Boolean);
}

/**
 * harness archive promote <task-id> [--topic=<slug>] [--files=<list>] [--mode=<mode>] [--json]
 * harness archive list [--json]
 * harness archive show <topic> [--json]
 * harness archive verify [--json]
 * (兼容旧语法) harness archive requirement|design|both <task-id> [--topic <name>] [--force]
 */
export async function runArchive(
  flags: Record<string, string | boolean>,
  positionals: string[],
): Promise<void> {
  const workDir = process.cwd();
  const [subcommand, ...rest] = positionals;

  // ===== promote =====
  if (subcommand === 'promote') {
    await handlePromote(workDir, flags, rest);
    return;
  }

  // ===== list =====
  if (subcommand === 'list') {
    const topics = await listArchiveTopics(workDir);
    if (flags.json) {
      printJson(topics);
    } else if (topics.length === 0) {
      printLines(['没有已晋升的架构资产。使用 harness archive promote 创建。']);
    } else {
      printLines([
        `共 ${topics.length} 个 topic：`,
        ...topics.map((t) =>
          `- ${t.topic} (${t.fileCount} 文件, ${t.sourceTaskCount} 来源任务, 最后晋升: ${t.lastPromotedAt})`,
        ),
      ]);
    }
    return;
  }

  // ===== show =====
  if (subcommand === 'show') {
    const topic = rest[0]?.trim();
    if (!topic) throw new Error('缺少 topic 参数。用法：harness archive show <topic>');
    const detail = await showArchiveTopic(workDir, topic);
    if (!detail) throw new Error(`topic "${topic}" 不存在`);
    if (flags.json) {
      printJson(detail);
    } else {
      printLines([
        `topic: ${detail.topic}`,
        `文件: ${detail.files.join(', ') || '(无)'}`,
        `来源任务数: ${detail.sourceTasks.length}`,
        ...detail.sourceTasks.map((t) => `  - ${t.task_id} ${t.goal} (${t.promotion_mode})`),
      ]);
    }
    return;
  }

  // ===== verify =====
  if (subcommand === 'verify') {
    const results = await verifyArchive(workDir);
    const orphans = results.filter((r) => !r.valid);
    if (flags.json) {
      printJson(results);
    } else if (orphans.length === 0) {
      printLines(['所有 topic 来源完整，无孤儿引用。']);
    } else {
      printLines([
        `发现 ${orphans.length} 个 topic 有孤儿引用：`,
        ...orphans.map((o) => `  - ${o.topic}: ${o.orphanTasks.join(', ')}`),
      ]);
    }
    return;
  }

  // ===== 旧语法兼容：harness archive requirement|design|both <task-id> =====
  const rawKind = subcommand ?? '';
  if (!rawKind) {
    throw new Error(
      '用法：harness archive promote|list|show|verify\n' +
      '兼容旧语法：harness archive requirement|design|both <task-id> [--topic] [--force]',
    );
  }

  // 新子命令已在上方处理；可能是拼写错误
  if (rawKind === 'promote' || rawKind === 'list' || rawKind === 'show' || rawKind === 'verify') {
    printLines(['内部错误：未预期的子命令路由']);
    return;
  }

  if (!isArchiveKind(rawKind)) {
    throw new Error(
      `非法的子命令: "${rawKind}"。用法：harness archive promote|list|show|verify\n` +
      '兼容旧语法：harness archive requirement|design|both <task-id> [--topic] [--force]',
    );
  }

  const rawTaskId = rest[0]?.trim();
  const manager = new TaskManager();
  const requestedTaskId = readStringFlag(flags, 'task-id') || rawTaskId || '';
  const useLatest = flags.latest === true;
  let taskId = requestedTaskId;
  if (!taskId) {
    if (!useLatest) throw new Error('缺少 task-id');
    const latest = await manager.getLatestTaskId(workDir);
    if (!latest) throw new Error('没有任何 task');
    taskId = latest;
  }

  const topic = readStringFlag(flags, 'topic') || undefined;
  const force = flags.force === true;
  const result = await archiveTaskArtifacts(workDir, taskId, rawKind, { topic, force });

  await appendHarnessEvent(workDir, {
    type: 'archive.task_promoted',
    taskId: result.taskId,
    topic: result.topic,
    kind: rawKind,
    force,
    files: result.files.map((f) => ({
      target: path.relative(workDir, f.target),
      status: f.status,
    })),
  });

  if (flags.json) {
    printJson({
      taskId: result.taskId,
      topic: result.topic,
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
    ...result.files.map((f) => `- ${path.relative(workDir, f.target)} [${f.status}]`),
  ]);
}

async function handlePromote(
  workDir: string,
  flags: Record<string, string | boolean>,
  positionals: string[],
): Promise<void> {
  const rawTaskId = positionals[0]?.trim();
  const taskId = readStringFlag(flags, 'task-id') || rawTaskId;
  if (!taskId) throw new Error('缺少 task-id。用法：harness archive promote <task-id> --topic=<slug> --files=requirement.md,design.md');

  const topic = readStringFlag(flags, 'topic');
  if (!topic) throw new Error('缺少 --topic。用法：harness archive promote <task-id> --topic=<slug>');

  const filesStr = readStringFlag(flags, 'files');
  if (!filesStr) throw new Error('缺少 --files。用法：harness archive promote <task-id> --files=requirement.md,design.md');
  const files = parseFiles(filesStr);
  if (files.length === 0) throw new Error('--files 不能为空');

  const modeStr = readStringFlag(flags, 'mode') || 'new_topic';
  if (!(VALID_MODES as readonly string[]).includes(modeStr)) {
    throw new Error(`非法的 mode: "${modeStr}"。允许值：${VALID_MODES.join(', ')}`);
  }
  const mode = modeStr as 'new_topic' | 'append' | 'replace';

  const result = await promoteTaskArtifacts(workDir, taskId, { topic, files, mode });

  await appendHarnessEvent(workDir, {
    type: 'archive.promoted',
    taskId: result.taskId,
    topic: result.topic,
    mode,
    files: result.files.map((f) => ({
      source: path.relative(workDir, f.source),
      target: path.relative(workDir, f.target),
      status: f.status,
    })),
  });

  if (flags.json) {
    printJson({
      taskId: result.taskId,
      topic: result.topic,
      mode,
      targetDir: path.relative(workDir, result.targetDir),
      files: result.files.map((f) => ({
        source: path.relative(workDir, f.source),
        target: path.relative(workDir, f.target),
        status: f.status,
      })),
    });
    return;
  }

  printLines([
    `晋升完成：${result.taskId} → ${path.relative(workDir, result.targetDir)}`,
    `- topic: ${result.topic}`,
    `- mode: ${mode}`,
    ...result.files.map((f) => `- ${path.relative(workDir, f.target)} [${f.status}]`),
  ]);
}
