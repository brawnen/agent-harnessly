import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  feedbackEntrySchema,
  type FeedbackEntry,
  type Finding,
  type FindingCategory,
  type FindingGroup,
  type PromotableAs,
  type PromoteAction,
  type TaskReport,
  type TemplateName,
  type TaskContext,
} from '@brawnen/harnessly-shared';

import { getHarnessPaths } from './scaffold';

/**
 * Feedback Pool 落盘文件名（JSONL，append-only）。
 * 故意不放在 .harness/feedback-pool/ 子目录下，让用户可以一眼看见。
 */
export const FEEDBACK_POOL_FILENAME = 'feedback-pool.jsonl';

export function getFeedbackPoolPath(workDir: string): string {
  return path.join(getHarnessPaths(workDir).harnessDir, FEEDBACK_POOL_FILENAME);
}

export function getFeedbackHistoryPath(workDir: string): string {
  return path.join(getHarnessPaths(workDir).harnessDir, 'feedback-history.md');
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

export async function promoteFeedbackEntry(
  workDir: string,
  taskId: string,
  reason = 'manual promotion',
): Promise<FeedbackEntry> {
  const entries = await loadFeedbackPool(workDir);
  const entry = [...entries].reverse().find((item) => item.taskId === taskId);
  if (!entry) {
    throw new Error(`feedback entry not found for task ${taskId}`);
  }

  const historyPath = getFeedbackHistoryPath(workDir);
  await mkdir(path.dirname(historyPath), { recursive: true });
  await appendFile(
    historyPath,
    [
      `## ${new Date().toISOString()} ${entry.taskId}`,
      '',
      `- goal: ${entry.goal}`,
      `- decision: ${entry.decision}`,
      `- template: ${entry.template ?? 'general'}`,
      `- risk_level: ${entry.riskLevel ?? 'unknown'}`,
      `- reason: ${reason}`,
      '',
    ].join('\n'),
    'utf8',
  );

  return entry;
}

// ===== 反馈晋升 (§15) =====

function trigramSimilarity(a: string, b: string): number {
  const trigrams = (s: string): Set<string> => {
    const result = new Set<string>();
    const lower = s.toLowerCase();
    for (let i = 0; i < lower.length - 2; i += 1) {
      result.add(lower.slice(i, i + 3));
    }
    return result;
  };

  const ta = trigrams(a);
  const tb = trigrams(b);
  if (ta.size === 0 || tb.size === 0) return 0;

  const intersection = new Set([...ta].filter((t) => tb.has(t)));
  const union = new Set([...ta, ...tb]);
  return intersection.size / union.size;
}

/**
 * 按 category + summary trigram 相似度（阈值 0.6）聚类。
 * 对每组合并成员，计算建议晋升目标（所有成员 promotable_as 的交集）。
 */
export function groupFindingsBySimilarity(
  findings: readonly Finding[],
  similarityThreshold = 0.6,
): FindingGroup[] {
  const groups: FindingGroup[] = [];
  const assigned = new Set<string>();

  for (const finding of findings) {
    if (assigned.has(finding.id)) continue;

    const group: Finding[] = [finding];
    assigned.add(finding.id);

    for (const other of findings) {
      if (assigned.has(other.id)) continue;
      if (other.category !== finding.category) continue;
      if (trigramSimilarity(finding.summary, other.summary) >= similarityThreshold) {
        group.push(other);
        assigned.add(other.id);
      }
    }

    // 计算建议目标：取所有成员的 promotable_as 交集
    let suggestedTargets: PromotableAs[] = group[0]!.promotable_as;
    for (let i = 1; i < group.length; i += 1) {
      suggestedTargets = suggestedTargets.filter(
        (target) => group[i]!.promotable_as.includes(target),
      );
    }

    groups.push({
      category: finding.category,
      summary: finding.summary,
      count: group.length,
      findings: group,
      suggestedTargets,
    });
  }

  return groups.sort((a, b) => b.count - a.count);
}

/**
 * 把晋升结果应用到仓库中：
 * - lint/structure_rule → 追加到 structure-rules.yaml
 * - review_prompt → 追加到 review-agents.yaml 对应 agent 的 prompt
 * - skill_fix_hint → 更新 skill 的 fix_hint_template
 * - failed_test → 生成测试文件
 */
export async function applyPromotion(
  workDir: string,
  action: PromoteAction,
): Promise<string> {
  const paths = getHarnessPaths(workDir);
  const detail = action.group.findings.map((f) => f.summary).join('; ');

  switch (action.target) {
    case 'lint':
    case 'structure_rule': {
      const rulesPath = paths.structureRulesFile;
      let existing = '';
      try { existing = await readFile(rulesPath, 'utf8'); } catch { /* 不存在则创建 */ }
      const entry = [
        '',
        `# 从 feedback-pool 晋升（${action.group.category}, 出现 ${action.group.count} 次）`,
        `unique_implementations:`,
        `  - pattern: "**/*.ts"`,
        `    rule: "${action.group.summary}"`,
        `    fix_hint: "${action.group.findings[0]?.fix_hint ?? '检查并修复'}"`,
        '',
      ].join('\n');
      await writeFile(rulesPath, `${existing}${entry}`, 'utf8');
      return `已追加 structure-rule（${action.group.category}, ${action.group.count} 次）`;
    }

    case 'review_prompt': {
      const agentsPath = paths.reviewAgentsFile;
      let existing = '';
      try { existing = await readFile(agentsPath, 'utf8'); } catch { /* 不存在 */ }
      const entry = [
        '',
        `  - name: auto-promoted-${action.group.category}`,
        `    triggers: [pre_merge]`,
        `    model: gpt-5.5`,
        `    blocking_severity: P1`,
        `    prompt: |`,
        `      检查：${action.group.summary}（从 feedback-pool 自动晋升，出现 ${action.group.count} 次）。`,
        '',
      ].join('\n');
      await writeFile(agentsPath, `${existing}${entry}`, 'utf8');
      return `已追加 review-agent（${action.group.category}, ${action.group.count} 次）`;
    }

    case 'skill_fix_hint': {
      const skillDir = paths.skillsDir;
      const hintContent = [
        `# 从 feedback-pool 晋升的 fix_hint（${action.group.category}）`,
        `# 出现 ${action.group.count} 次: ${detail}`,
        `fix_hint: "${action.group.findings[0]?.fix_hint ?? '检查并修复'}"`,
        '',
      ].join('\n');
      const hintPath = path.join(skillDir, 'promoted-fix-hints.yaml');
      let existing = '';
      try { existing = await readFile(hintPath, 'utf8'); } catch { /* 不存在 */ }
      await writeFile(hintPath, `${existing}${hintContent}`, 'utf8');
      return `已追加 skill fix_hint（${action.group.category}, ${action.group.count} 次）`;
    }

    case 'failed_test': {
      const testDir = path.join(workDir, 'packages', 'core', 'src');
      const testName = `auto-promoted-${action.group.category}-${action.group.count}`;
      const testContent = [
        `// 从 feedback-pool 自动晋升（${action.group.category}, 出现 ${action.group.count} 次）`,
        `import { describe, it, expect } from 'vitest';`,
        '',
        `describe('auto-promoted: ${action.group.summary}', () => {`,
        `  it.fails('TODO: 实现修复使此测试通过', () => {`,
        `    // ${action.group.findings.map((f) => f.fix_hint).join('; ')}`,
        `    expect(true).toBe(false);`,
        `  });`,
        `});`,
        '',
      ].join('\n');
      await writeFile(path.join(testDir, `${testName}.test.ts`), testContent, 'utf8');
      return `已生成失败测试（${action.group.category}, ${action.group.count} 次）：${testName}.test.ts`;
    }

    case 'dismiss':
      return `已 dismiss（${action.group.category}, ${action.group.count} 次）`;

    default:
      return `未知晋升目标：${action.target}`;
  }
}

/**
 * 将已处理的 finding 从 pool 移到 feedback-history.md。
 */
export async function moveFindingsToHistory(
  workDir: string,
  action: PromoteAction,
): Promise<void> {
  const historyPath = getFeedbackHistoryPath(workDir);
  const entry = [
    `## ${new Date().toISOString()} auto-promotion`,
    '',
    `- target: ${action.target}`,
    `- category: ${action.group.category}`,
    `- summary: ${action.group.summary}`,
    `- count: ${action.group.count}`,
    `- finding_ids: ${action.group.findings.map((f) => f.id).join(', ')}`,
    '',
  ].join('\n');

  await mkdir(path.dirname(historyPath), { recursive: true });
  await appendFile(historyPath, `${entry}\n`, 'utf8');
}
