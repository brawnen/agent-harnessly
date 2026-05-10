import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { TaskReport } from '@harnessly/shared';
import { parseTaskReport } from '@harnessly/shared';

import { TaskManager } from './task';

/**
 * v3-core §22 Knowledge Asset Promotion 实施。
 *
 * 把任务工件（contract.yaml / plan.md / report.json）从 .harness/tasks/<id>/
 * 晋升到 docs/architecture/<topic>/<task-id>/，作为长期保留的项目资产。
 *
 * 关键约束：
 * - 只写 repo 内 docs/，绝不写用户 home
 * - 默认 force=false 时跳过已存在的目标文件，避免覆盖人工编辑
 * - 不对 .harness/ 做任何修改（archive 是只读 copy + 写新位置）
 */

export type ArchiveKind = 'requirement' | 'design' | 'both';

export interface ArchiveOptions {
  /** 归档分类（决定 docs/architecture 下的子目录名）。默认 'tasks' */
  topic?: string;
  /** force=true 时覆盖目标位置已有文件 */
  force?: boolean;
}

export interface ArchivedFile {
  source: string;
  target: string;
  status: 'created' | 'updated' | 'skipped';
}

export interface ArchiveResult {
  taskId: string;
  topic: string;
  targetDir: string;
  files: ArchivedFile[];
}

const DEFAULT_TOPIC = 'tasks';

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'ENOENT'
  );
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await readFile(filePath);
    return true;
  } catch (error) {
    if (isMissingFileError(error)) return false;
    throw error;
  }
}

async function copyIfMissingOrForced(
  source: string,
  target: string,
  force: boolean,
): Promise<ArchivedFile['status']> {
  const exists = await fileExists(target);
  if (!exists) {
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(source, target);
    return 'created';
  }

  if (!force) {
    return 'skipped';
  }

  await copyFile(source, target);
  return 'updated';
}

function pickFilesByKind(kind: ArchiveKind): {
  contract: boolean;
  plan: boolean;
} {
  return {
    contract: kind === 'requirement' || kind === 'both',
    plan: kind === 'design' || kind === 'both',
  };
}

function readTaskReportSafe(filePath: string): Promise<TaskReport | null> {
  return readFile(filePath, 'utf8')
    .then((text) => parseTaskReport(text))
    .catch((error: unknown) => {
      if (isMissingFileError(error)) return null;
      // report 损坏不影响 archive；README 用 fallback
      return null;
    });
}

function renderArchiveReadme(args: {
  taskId: string;
  goal: string;
  archivedAt: string;
  archivedKind: ArchiveKind;
  topic: string;
  report: TaskReport | null;
  completedStages: readonly string[];
  retryCount: number;
}): string {
  const { taskId, goal, archivedAt, archivedKind, topic, report, completedStages, retryCount } = args;

  const lines: string[] = [
    `# Task Archive: ${goal}`,
    '',
    '## Metadata',
    `- task_id: ${taskId}`,
    `- topic: ${topic}`,
    `- archived_at: ${archivedAt}`,
    `- archived_kind: ${archivedKind}`,
    `- completed_stages: ${completedStages.join(', ') || '(none)'}`,
    `- retry_count: ${retryCount}`,
  ];

  if (report) {
    lines.push(
      `- decision: ${report.commitGate.decision}`,
      `- commit_ready: ${report.commitReady}`,
      `- changed_files_count: ${report.evidence.changedFiles.length}`,
    );
  } else {
    lines.push('- decision: (no report available)');
  }

  lines.push('', '## Files');
  if (archivedKind === 'requirement' || archivedKind === 'both') {
    lines.push('- `contract.yaml` — SPEC 阶段产出（v3-core requirement 工件）');
  }
  if (archivedKind === 'design' || archivedKind === 'both') {
    lines.push('- `plan.md` — DESIGN 阶段产出（v3-core design 工件）');
  }

  lines.push(
    '',
    '## Source',
    `Snapshot of \`.harness/tasks/${taskId}/\` at \`${archivedAt}\`.`,
    '',
    '> 由 `harnessly archive` 命令生成。如需更新，重跑 `harnessly archive ... --force`。',
    '',
  );

  return lines.join('\n');
}

export interface ArchiveTargetPaths {
  archDir: string;
  topicDir: string;
  taskDir: string;
}

export function getArchiveTargetPaths(
  workDir: string,
  taskId: string,
  topic: string = DEFAULT_TOPIC,
): ArchiveTargetPaths {
  const archDir = path.join(workDir, 'docs', 'architecture');
  const topicDir = path.join(archDir, topic);
  return {
    archDir,
    topicDir,
    taskDir: path.join(topicDir, taskId),
  };
}

/**
 * 把指定 task 的工件晋升到 docs/architecture/<topic>/<taskId>/。
 *
 * 流程：
 * 1. 通过 TaskManager.load 校验 task 存在并加载 contract / plan
 * 2. 按 kind 选择要归档的文件（contract.yaml / plan.md / both）
 * 3. 复制到目标位置（force=false 时已存在则跳过）
 * 4. 渲染并写入 README.md（每次归档强制覆盖 README，因为它是元信息）
 *
 * 不修改 .harness/，只读源 + 写新目标。
 */
export async function archiveTaskArtifacts(
  workDir: string,
  taskId: string,
  kind: ArchiveKind,
  options: ArchiveOptions = {},
): Promise<ArchiveResult> {
  const topic = options.topic?.trim() || DEFAULT_TOPIC;
  const force = options.force ?? false;

  // 校验 task 存在 + 拉 ctx 用于元信息
  const ctx = await new TaskManager().load(taskId, workDir);
  const targets = getArchiveTargetPaths(workDir, taskId, topic);

  const want = pickFilesByKind(kind);
  const files: ArchivedFile[] = [];

  if (want.contract) {
    const source = path.join(ctx.taskDir, 'contract.yaml');
    if (!(await fileExists(source))) {
      throw new Error(
        `task ${taskId} 缺少 contract.yaml；不能归档 requirement 工件（kind=${kind}）`,
      );
    }
    const target = path.join(targets.taskDir, 'contract.yaml');
    const status = await copyIfMissingOrForced(source, target, force);
    files.push({ source, target, status });
  }

  if (want.plan) {
    const source = path.join(ctx.taskDir, 'plan.md');
    if (!(await fileExists(source))) {
      throw new Error(`task ${taskId} 缺少 plan.md；不能归档 design 工件（kind=${kind}）`);
    }
    const target = path.join(targets.taskDir, 'plan.md');
    const status = await copyIfMissingOrForced(source, target, force);
    files.push({ source, target, status });
  }

  // README.md 是元数据，每次归档都强制刷新
  const reportFile = path.join(ctx.taskDir, 'report.json');
  const report = await readTaskReportSafe(reportFile);
  const readmePath = path.join(targets.taskDir, 'README.md');
  await mkdir(targets.taskDir, { recursive: true });
  const readmeContent = renderArchiveReadme({
    taskId,
    goal: ctx.goal,
    archivedAt: new Date().toISOString(),
    archivedKind: kind,
    topic,
    report,
    completedStages: ctx.state.completedStages,
    retryCount: ctx.state.retryCount,
  });
  const previousReadme = await readFile(readmePath, 'utf8').catch((error) => {
    if (isMissingFileError(error)) return null;
    throw error;
  });
  await writeFile(readmePath, readmeContent, 'utf8');
  files.push({
    source: '(generated)',
    target: readmePath,
    status: previousReadme === null ? 'created' : 'updated',
  });

  return {
    taskId,
    topic,
    targetDir: targets.taskDir,
    files,
  };
}
