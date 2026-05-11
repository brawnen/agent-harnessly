import { access, copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type {
  ArchiveTopicDetail,
  ArchiveTopicSummary,
  AssetPromotion,
  HarnessMetaFile,
  SourceTaskEntry,
  TaskReport,
} from '@harnessly/shared';
import { harnessMetaFileSchema, parseTaskReport } from '@harnessly/shared';

import { TaskManager } from './task';

/**
 * v3-core §22 Knowledge Asset Promotion 实施。
 *
 * 关键约束：
 * - 只写 repo 内 docs/architecture/<topic>/，绝不写用户 home
 * - _harness-meta.json：每个 topic 一个，source_tasks 仅追加
 * - README.md 使用 <!-- harness:auto-start --> / <!-- harness:auto-end --> 标记
 */

export type ArchiveKind = 'requirement' | 'design' | 'both';

export interface ArchiveOptions {
  topic?: string;
  mode?: AssetPromotion['mode'];
  force?: boolean;
}

export interface ArchivedFile {
  source: string;
  target: string;
  status: 'created' | 'updated' | 'skipped';
  versionSuffix?: string;
}

export interface ArchiveResult {
  taskId: string;
  topic: string;
  targetDir: string;
  files: ArchivedFile[];
}

const DEFAULT_TOPIC = 'tasks';
const AUTO_START = '<!-- harness:auto-start -->';
const AUTO_END = '<!-- harness:auto-end -->';

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
    await access(filePath);
    return true;
  } catch (error) {
    if (isMissingFileError(error)) return false;
    throw error;
  }
}

function pickFilesByKind(kind: ArchiveKind): { contract: boolean; plan: boolean } {
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
      return null;
    });
}

// ========== _harness-meta.json 管理 ==========

export function getHarnessMetaPath(topicDir: string): string {
  return path.join(topicDir, '_harness-meta.json');
}

export async function loadHarnessMeta(topicDir: string): Promise<HarnessMetaFile | null> {
  try {
    const text = await readFile(getHarnessMetaPath(topicDir), 'utf8');
    return harnessMetaFileSchema.parse(JSON.parse(text) as unknown);
  } catch (error) {
    if (isMissingFileError(error)) return null;
    // 文件损坏视为不存在，下次写入时覆盖
    return null;
  }
}

export async function saveHarnessMeta(
  topicDir: string,
  meta: HarnessMetaFile,
): Promise<void> {
  await mkdir(topicDir, { recursive: true });
  await writeFile(
    getHarnessMetaPath(topicDir),
    `${JSON.stringify(meta, null, 2)}\n`,
    'utf8',
  );
}

export function appendToHarnessMeta(
  existing: HarnessMetaFile | null,
  topic: string,
  entry: SourceTaskEntry,
): HarnessMetaFile {
  if (existing) {
    return {
      ...existing,
      source_tasks: [...existing.source_tasks, entry],
    };
  }

  return {
    topic,
    created_at: new Date().toISOString(),
    harness_version: 'v3-core',
    source_tasks: [entry],
  };
}

// ========== 扁平路径解析 ==========

/**
 * 将源文件名映射到 SPEC 规定的扁平目标文件名。
 * contract.yaml / requirement.md → requirement.md
 * plan.md / design.md → design.md
 */
function resolveFlatTargetName(sourceFile: string): string {
  const base = path.basename(sourceFile);
  if (base === 'contract.yaml' || base === 'requirement.md') return 'requirement.md';
  if (base === 'plan.md' || base === 'design.md') return 'design.md';
  // 其他文件保持原名
  return base;
}

/**
 * 按 promote 模式和已有文件决定最终目标路径。
 * - new_topic: 目标文件已存在则抛错
 * - append: 同名冲突 → requirement-v2.md / design-v2.md 等
 * - replace: 旧文件备份到 _archive/<iso>/ 后覆盖
 */
async function resolveTargetPath(
  topicDir: string,
  sourceFile: string,
  mode: AssetPromotion['mode'],
  force: boolean,
): Promise<string> {
  const baseName = resolveFlatTargetName(sourceFile);
  const primaryTarget = path.join(topicDir, baseName);

  if (mode === 'new_topic' && !force) {
    if (await fileExists(primaryTarget)) {
      throw new Error(
        `new_topic 模式：目标文件 ${baseName} 已存在于 ${topicDir}，禁止覆盖。使用 mode=append 或 mode=replace。`,
      );
    }
  }

  if (mode === 'append') {
    if (await fileExists(primaryTarget)) {
      const parsed = path.parse(baseName);
      let v = 2;
      let altTarget: string;
      do {
        altTarget = path.join(topicDir, `${parsed.name}-v${v}${parsed.ext}`);
        v += 1;
      } while (await fileExists(altTarget));
      return altTarget;
    }
  }

  if (mode === 'replace' && (await fileExists(primaryTarget))) {
    const archiveDir = path.join(topicDir, '_archive', new Date().toISOString().replace(/[:.]/g, '-'));
    await mkdir(archiveDir, { recursive: true });
    await copyFile(primaryTarget, path.join(archiveDir, baseName));
  }

  return primaryTarget;
}

// ========== README.md 生成（支持 harness:auto-start/end） ==========

function renderAutoReadme(args: {
  topic: string;
  meta: HarnessMetaFile;
}): string {
  const { topic, meta } = args;
  const files = new Set<string>();
  for (const task of meta.source_tasks) {
    for (const file of task.promoted_files) {
      files.add(file);
    }
  }

  const lastPromoted = meta.source_tasks.length > 0
    ? meta.source_tasks[meta.source_tasks.length - 1]!.promoted_at
    : meta.created_at;

  return [
    `# ${topic}`,
    '',
    `- 创建日期：${meta.created_at}`,
    `- 最后晋升：${lastPromoted}`,
    `- 来源任务数：${meta.source_tasks.length}`,
    '',
    '## 文件',
    ...[...files].sort().map((file) => `- \`${file}\``),
    '',
    '## 来源任务',
    ...meta.source_tasks.map(
      (task) => `- \`${task.task_id}\` ${task.goal}（${task.promotion_mode}, ${task.promoted_at}）`,
    ),
    '',
  ].join('\n');
}

async function writeReadme(topicDir: string, topic: string, meta: HarnessMetaFile): Promise<void> {
  const readmePath = path.join(topicDir, 'README.md');
  const autoContent = renderAutoReadme({ topic, meta });

  let existingBefore = '';
  let existingAfter = '';

  try {
    const existing = await readFile(readmePath, 'utf8');
    const autoStartIndex = existing.indexOf(AUTO_START);
    const autoEndIndex = existing.indexOf(AUTO_END);

    if (autoStartIndex !== -1 && autoEndIndex !== -1) {
      existingBefore = existing.slice(0, autoStartIndex + AUTO_START.length);
      existingAfter = existing.slice(autoEndIndex);
    } else {
      existingBefore = AUTO_START;
      existingAfter = `${AUTO_END}\n\n${existing}`;
    }
  } catch (error) {
    if (!isMissingFileError(error)) throw error;
    existingBefore = `${AUTO_START}`;
    existingAfter = `\n${AUTO_END}`;
  }

  await mkdir(topicDir, { recursive: true });
  await writeFile(
    readmePath,
    `${existingBefore}\n${autoContent}\n${existingAfter}`,
    'utf8',
  );
}

// ========== 主要晋升入口 ==========

export interface PromoteTaskOptions {
  topic: string;
  files: string[];
  mode: AssetPromotion['mode'];
  skipMeta?: boolean;
}

/**
 * v3-core §22.2 知识资产晋升核心函数。
 *
 * 1. 读 task 工件
 * 2. 按 mode 决定目标路径（new_topic 冲突抛错 / append -vN / replace 备份）
 * 3. 复制文件
 * 4. 更新 _harness-meta.json（仅追加）
 * 5. 重新生成 README.md（保留标记外用户编辑）
 */
export async function promoteTaskArtifacts(
  workDir: string,
  taskId: string,
  options: PromoteTaskOptions,
): Promise<ArchiveResult> {
  const topic = options.topic.trim() || DEFAULT_TOPIC;
  const mode = options.mode ?? 'new_topic';

  const archDir = path.join(workDir, 'docs', 'architecture');
  const topicDir = path.join(archDir, topic);

  // 校验 task 存在
  const ctx = await new TaskManager().load(taskId, workDir);

  // new_topic: 目录已存在则抛错
  if (mode === 'new_topic' && (await fileExists(topicDir))) {
    // 但如果 _harness-meta.json 已存在且 source_tasks 非空 → 严格拒绝
    const existingMeta = await loadHarnessMeta(topicDir);
    if (existingMeta && existingMeta.source_tasks.length > 0) {
      throw new Error(
        `new_topic 模式：topic "${topic}" 已存在且有 ${existingMeta.source_tasks.length} 条来源任务。使用 --mode=append 或 --mode=replace。`,
      );
    }
  }

  const files: ArchivedFile[] = [];
  const promotedFiles: string[] = [];

  for (const sourceFile of options.files) {
    const source = path.join(ctx.taskDir, sourceFile);
    if (!(await fileExists(source))) {
      throw new Error(`task ${taskId} 缺少源文件：${sourceFile}`);
    }

    const target = await resolveTargetPath(topicDir, sourceFile, mode, false);
    const targetExisted = await fileExists(target);
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(source, target);

    const resolvedName = path.basename(target);
    files.push({
      source,
      target,
      status: targetExisted && mode === 'replace' ? 'updated' : 'created',
      versionSuffix: resolvedName !== resolveFlatTargetName(sourceFile) ? resolvedName : undefined,
    });
    promotedFiles.push(resolvedName);
  }

  // 更新 _harness-meta.json
  if (!options.skipMeta) {
    const existingMeta = await loadHarnessMeta(topicDir);
    const entry: SourceTaskEntry = {
      task_id: taskId,
      goal: ctx.goal,
      promoted_files: [...new Set(promotedFiles)],
      promoted_at: new Date().toISOString(),
      promotion_mode: mode,
    };
    const updatedMeta = appendToHarnessMeta(existingMeta, topic, entry);
    await saveHarnessMeta(topicDir, updatedMeta);

    // 重新生成 README.md
    await writeReadme(topicDir, topic, updatedMeta);
  }

  return {
    taskId,
    topic,
    targetDir: topicDir,
    files,
  };
}

// ========== 查询命令 ==========

async function listDirs(dirPath: string): Promise<string[]> {
  const { readdir } = await import('node:fs/promises');
  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch (error) {
    if (isMissingFileError(error)) return [];
    throw error;
  }
}

export async function listArchiveTopics(workDir: string): Promise<ArchiveTopicSummary[]> {
  const archDir = path.join(workDir, 'docs', 'architecture');
  const topicNames = await listDirs(archDir);
  const summaries: ArchiveTopicSummary[] = [];

  for (const topic of topicNames) {
    const topicDir = path.join(archDir, topic);
    const meta = await loadHarnessMeta(topicDir);
    if (!meta) continue;

    const allFiles = new Set<string>();
    for (const task of meta.source_tasks) {
      for (const file of task.promoted_files) {
        allFiles.add(file);
      }
    }

    const lastTask = meta.source_tasks[meta.source_tasks.length - 1];
    summaries.push({
      topic,
      fileCount: allFiles.size,
      sourceTaskCount: meta.source_tasks.length,
      lastPromotedAt: lastTask?.promoted_at ?? meta.created_at,
    });
  }

  summaries.sort((a, b) => a.topic.localeCompare(b.topic));
  return summaries;
}

export async function showArchiveTopic(
  workDir: string,
  topic: string,
): Promise<ArchiveTopicDetail | null> {
  const topicDir = path.join(workDir, 'docs', 'architecture', topic);
  const meta = await loadHarnessMeta(topicDir);
  if (!meta) return null;

  let readme = '';
  try {
    readme = await readFile(path.join(topicDir, 'README.md'), 'utf8');
  } catch (error) {
    if (!isMissingFileError(error)) throw error;
  }

  const allFiles = new Set<string>();
  for (const task of meta.source_tasks) {
    for (const file of task.promoted_files) {
      allFiles.add(file);
    }
  }

  return {
    topic,
    readme,
    files: [...allFiles].sort(),
    sourceTasks: meta.source_tasks,
  };
}

/**
 * 校验所有 topic 的 _harness-meta.json 来源完整性。
 * 报告孤儿 topic（有 meta 但 source_tasks 引用的 task 已不存在）。
 */
export async function verifyArchive(
  workDir: string,
): Promise<{ topic: string; orphanTasks: string[]; valid: boolean }[]> {
  const archDir = path.join(workDir, 'docs', 'architecture');
  const topicNames = await listDirs(archDir);
  const results: { topic: string; orphanTasks: string[]; valid: boolean }[] = [];
  const manager = new TaskManager();

  for (const topic of topicNames) {
    const topicDir = path.join(archDir, topic);
    const meta = await loadHarnessMeta(topicDir);
    if (!meta) continue;

    const orphanTasks: string[] = [];
    for (const task of meta.source_tasks) {
      try {
        await manager.load(task.task_id, workDir);
      } catch {
        orphanTasks.push(task.task_id);
      }
    }

    results.push({
      topic,
      orphanTasks,
      valid: orphanTasks.length === 0,
    });
  }

  return results;
}

// ========== 路径工具 ==========

export interface ArchiveTargetPaths {
  archDir: string;
  topicDir: string;
}

export function getArchiveTargetPaths(
  workDir: string,
  _taskId: string,
  topic: string = DEFAULT_TOPIC,
): ArchiveTargetPaths {
  const archDir = path.join(workDir, 'docs', 'architecture');
  const topicDir = path.join(archDir, topic);
  return { archDir, topicDir };
}

// ========== 旧版兼容（deprecated） ==========

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
  if (!force) return 'skipped';
  await copyFile(source, target);
  return 'updated';
}

/** @deprecated 使用 promoteTaskArtifacts */
export async function archiveTaskArtifacts(
  workDir: string,
  taskId: string,
  kind: ArchiveKind,
  options: ArchiveOptions = {},
): Promise<ArchiveResult> {
  const topic = options.topic?.trim() || DEFAULT_TOPIC;
  const mode = options.mode ?? 'new_topic';
  const force = options.force ?? false;

  const ctx = await new TaskManager().load(taskId, workDir);
  const targets = getArchiveTargetPaths(workDir, taskId, topic);

  const want = pickFilesByKind(kind);
  const files: ArchivedFile[] = [];

  if (want.contract) {
    const source = path.join(ctx.taskDir, 'contract.yaml');
    const requirementSource = path.join(ctx.taskDir, 'requirement.md');
    if (!(await fileExists(source))) {
      throw new Error(`task ${taskId} 缺少 contract.yaml`);
    }
    const primarySource = (await fileExists(requirementSource)) ? requirementSource : source;
    const target = path.join(targets.topicDir, `${taskId}.requirement.md`);
    const status = await copyIfMissingOrForced(primarySource, target, force || mode === 'replace');
    files.push({ source: primarySource, target, status });
  }

  if (want.plan) {
    const source = path.join(ctx.taskDir, 'plan.md');
    const designSource = path.join(ctx.taskDir, 'design.md');
    if (!(await fileExists(source))) {
      throw new Error(`task ${taskId} 缺少 plan.md`);
    }
    const primarySource = (await fileExists(designSource)) ? designSource : source;
    const target = path.join(targets.topicDir, `${taskId}.design.md`);
    const status = await copyIfMissingOrForced(primarySource, target, force || mode === 'replace');
    files.push({ source: primarySource, target, status });
  }

  const reportFile = path.join(ctx.taskDir, 'report.json');
  const report = await readTaskReportSafe(reportFile);
  const previousReadme = await readFile(path.join(targets.topicDir, 'README.md'), 'utf8').catch(
    (error: unknown) => (isMissingFileError(error) ? null : Promise.reject(error)),
  );
  await writeFile(path.join(targets.topicDir, 'README.md'), [
    `# Task Archive: ${ctx.goal}`,
    '',
    '## Metadata',
    `- task_id: ${taskId}`,
    `- topic: ${topic}`,
    `- archived_at: ${new Date().toISOString()}`,
    `- archived_kind: ${kind}`,
    `- completed_stages: ${ctx.state.completedStages.join(', ') || '(none)'}`,
    `- retry_count: ${ctx.state.retryCount}`,
    report ? `- decision: ${report.commitGate.decision}` : '- decision: (no report)',
    '',
    '## Files',
    want.contract ? '- `contract.yaml`' : null,
    want.plan ? '- `plan.md`' : null,
    '',
    '## Source',
    `Snapshot of \`.harness/tasks/${taskId}/\` at \`${new Date().toISOString()}\`.`,
    '',
  ].filter(Boolean).join('\n'), 'utf8');
  files.push({
    source: '(generated)',
    target: path.join(targets.topicDir, 'README.md'),
    status: previousReadme === null ? 'created' : 'updated',
  });

  const metadataPath = path.join(targets.topicDir, `${taskId}.promotion.json`);
  const previousMetadata = await readFile(metadataPath, 'utf8').catch(
    (error: unknown) => (isMissingFileError(error) ? null : Promise.reject(error)),
  );
  await writeFile(
    metadataPath,
    `${JSON.stringify({ taskId, topic, mode, kind, promotedAt: new Date().toISOString(), sourceDir: `.harness/tasks/${taskId}`, files: files.map((f) => path.relative(workDir, f.target)) }, null, 2)}\n`,
    'utf8',
  );
  files.push({
    source: '(generated)',
    target: metadataPath,
    status: previousMetadata === null ? 'created' : 'updated',
  });

  return { taskId, topic, targetDir: targets.topicDir, files };
}
