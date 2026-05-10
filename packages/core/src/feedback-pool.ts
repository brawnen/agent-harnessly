import { appendFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import {
  feedbackEntrySchema,
  type FeedbackEntry,
  type TaskReport,
  type TemplateName,
  type TaskContext,
} from '@harnessly/shared';

import { getHarnessPaths } from './scaffold';

/**
 * Feedback Pool 落盘文件名（JSONL，append-only）。
 * 故意不放在 .harness/feedback-pool/ 子目录下，让用户可以一眼看见。
 */
export const FEEDBACK_POOL_FILENAME = 'feedback-pool.jsonl';

export function getFeedbackPoolPath(workDir: string): string {
  return path.join(getHarnessPaths(workDir).harnessDir, FEEDBACK_POOL_FILENAME);
}

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'ENOENT'
  );
}

/**
 * 把 task ctx + report 转成一条 FeedbackEntry。
 * 输入是只读的；输出可直接交给 appendFeedbackEntry。
 */
export function buildFeedbackEntry(
  ctx: TaskContext,
  report: TaskReport,
): FeedbackEntry {
  const entry: FeedbackEntry = {
    taskId: ctx.taskId,
    goal: ctx.goal,
    decision: report.commitGate.decision,
    completedAt: report.generatedAt,
    completedStages: [...ctx.state.completedStages],
    retryCount: ctx.state.retryCount,
    changedFilesCount: report.evidence.changedFiles.length,
  };

  if (ctx.contract?.templateName) {
    entry.template = ctx.contract.templateName as TemplateName;
  }

  if (ctx.contract?.riskLevel) {
    entry.riskLevel = ctx.contract.riskLevel;
  }

  if (report.commitGate.decision !== 'pass') {
    if (ctx.state.lastFailureReason) {
      entry.failureReason = ctx.state.lastFailureReason;
    }
    if (ctx.state.lastFailureStage) {
      entry.failureStage = ctx.state.lastFailureStage;
    }
  }

  // 通过 schema 校验保证落盘 entry 合规
  return feedbackEntrySchema.parse(entry);
}

/**
 * 追加一条 feedback entry 到 .harness/feedback-pool.jsonl。
 *
 * 设计要点：
 * - JSONL append-only：并发追加场景下行边界由文件系统保证（POSIX append 原子性）
 * - 不做去重：同一 taskId 多次完成（重试后再 pass）会产生多条记录，便于诊断
 * - 校验 entry 合规：非法 entry 不进 pool（防止脏数据污染未来 prompt 注入）
 */
export async function appendFeedbackEntry(
  workDir: string,
  entry: FeedbackEntry,
): Promise<void> {
  const validated = feedbackEntrySchema.parse(entry);
  const filePath = getFeedbackPoolPath(workDir);

  await mkdir(path.dirname(filePath), { recursive: true });
  await appendFile(filePath, `${JSON.stringify(validated)}\n`, 'utf8');
}

/**
 * 按文件顺序加载所有 feedback entries。损坏行（非 JSON 或 schema 不合规）静默跳过，
 * 不让"一行坏掉拖垮整个 pool"，但调用方会拿到部分结果。
 */
export async function loadFeedbackPool(workDir: string): Promise<FeedbackEntry[]> {
  const filePath = getFeedbackPoolPath(workDir);
  let text: string;
  try {
    text = await readFile(filePath, 'utf8');
  } catch (error) {
    if (isMissingFileError(error)) {
      return [];
    }
    throw error;
  }

  const entries: FeedbackEntry[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    try {
      const parsed = JSON.parse(line) as unknown;
      const entry = feedbackEntrySchema.parse(parsed);
      entries.push(entry);
    } catch {
      // 损坏行：跳过，不抛
    }
  }

  return entries;
}

export interface PickRecentEntriesOptions {
  /** 全局取最近 N 条；0 表示不取 */
  globalLimit?: number;
  /** 同模板任务取最近 N 条；0 表示不取（即便 templateName 命中） */
  templateLimit?: number;
  /** 优先取同模板任务的 templateName */
  templateName?: TemplateName;
}

/**
 * 从 feedback pool 里挑最近条目，用于注入 PM prompt。
 *
 * 默认策略：
 * - 全局最近 5 条（优先观察"最近的整体趋势"）
 * - 若指定 templateName，则额外取同模板最近 3 条（"同类经验"）
 * - 两组合并去重，保持原顺序（旧→新），调用方自行决定渲染方向
 */
export function pickRecentEntries(
  entries: readonly FeedbackEntry[],
  options: PickRecentEntriesOptions = {},
): FeedbackEntry[] {
  const globalLimit = options.globalLimit ?? 5;
  const templateLimit = options.templateLimit ?? 3;

  if (entries.length === 0) return [];

  const tail = (count: number, predicate?: (e: FeedbackEntry) => boolean): FeedbackEntry[] => {
    if (count <= 0) return [];
    const filtered = predicate ? entries.filter(predicate) : entries;
    return filtered.slice(-count);
  };

  const recent = tail(globalLimit);
  const templateMatched = options.templateName
    ? tail(templateLimit, (e) => e.template === options.templateName)
    : [];

  // 用 taskId 去重，保留 entries 数组中的相对顺序
  const seenIds = new Set<string>();
  const merged: FeedbackEntry[] = [];
  for (const entry of [...recent, ...templateMatched]) {
    if (seenIds.has(entry.taskId)) continue;
    seenIds.add(entry.taskId);
    merged.push(entry);
  }

  // 按 completedAt 升序（旧→新），方便 prompt 阅读顺序
  return merged.sort((a, b) => a.completedAt.localeCompare(b.completedAt));
}

/**
 * 把 feedback entries 渲染成单行字符串列表，用于嵌入 prompt。
 * 每条形如：`[<taskId>] (<template>, <decision>, retry=<n>) <goal>`
 */
export function renderFeedbackEntriesAsLines(entries: readonly FeedbackEntry[]): string[] {
  return entries.map((entry) => {
    const parts = [
      `[${entry.taskId}]`,
      `(${entry.template ?? 'general'}, ${entry.decision}, retry=${entry.retryCount})`,
      entry.goal,
    ];
    if (entry.failureStage) {
      parts.push(`@${entry.failureStage}`);
    }
    return parts.join(' ');
  });
}
