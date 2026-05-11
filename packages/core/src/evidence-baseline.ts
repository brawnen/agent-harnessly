import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type {
  BaselineDiff,
  CheckStatus,
  EvidenceBaseline,
  EvidenceResult,
  EvidenceSnapshot,
} from '@brawnen/harnessly-shared';
import {
  baselineDiffSchema,
  evidenceBaselineSchema,
  evidenceSnapshotSchema,
} from '@brawnen/harnessly-shared';

import { getHarnessPaths } from './scaffold';

/**
 * v3-core §6.5 Baseline-diff Evidence 实施。
 *
 * 把"任务开始前已经失败的 check 名字"快照下来，让 commit gate 区分：
 * - 任务引入的新回归（block）
 * - 任务无关的旧失败（preExistingFailures，不 block）
 *
 * 落盘位置：.harness/evidence-baseline.json
 * 全局共享，多个 task 复用同一个 baseline。
 */
export const EVIDENCE_BASELINE_FILENAME = 'evidence-baseline.json';

export function getEvidenceBaselinePath(workDir: string): string {
  return path.join(getHarnessPaths(workDir).harnessDir, EVIDENCE_BASELINE_FILENAME);
}

export function getTaskEvidenceDir(taskDir: string): string {
  return path.join(taskDir, 'evidence');
}

export function getTaskEvidencePath(
  taskDir: string,
  kind: 'baseline' | 'current' | 'baseline-diff',
): string {
  return path.join(getTaskEvidenceDir(taskDir), `${kind}.json`);
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
 * 从一次 evidence 采集结果派生 baseline。
 * 只取 check.status === 'failed' 的 name，按字母排序保证落盘稳定。
 */
export function buildEvidenceBaseline(evidence: EvidenceResult): EvidenceBaseline {
  const failedCheckNames = evidence.checks
    .filter((check) => check.status === 'failed')
    .map((check) => check.name)
    .sort((a, b) => a.localeCompare(b));

  return {
    capturedAt: new Date().toISOString(),
    failedCheckNames,
  };
}

export function buildEvidenceSnapshot(evidence: EvidenceResult): EvidenceSnapshot {
  return {
    capturedAt: new Date().toISOString(),
    checks: evidence.checks,
    lintWarningsTotal: evidence.lintWarningsTotal,
    todoCount: evidence.todoCount,
    gitDirtyFiles: evidence.gitDirtyFiles,
  };
}

function checkMap(snapshot: EvidenceSnapshot): Map<string, CheckStatus> {
  return new Map(snapshot.checks.map((check) => [check.name, check.status]));
}

export function buildBaselineDiff(
  baseline: EvidenceSnapshot,
  current: EvidenceSnapshot,
): BaselineDiff {
  const baselineChecks = checkMap(baseline);
  const currentChecks = checkMap(current);
  const names = new Set([...baselineChecks.keys(), ...currentChecks.keys()]);
  const checks: BaselineDiff['checks'] = {};

  for (const name of [...names].sort((a, b) => a.localeCompare(b))) {
    const from = baselineChecks.get(name) ?? 'missing';
    const to = currentChecks.get(name) ?? 'missing';
    checks[name] = {
      from,
      to,
      regression: from === 'passed' && to === 'failed',
    };
  }

  return {
    checks,
    lintWarningsDelta: current.lintWarningsTotal - baseline.lintWarningsTotal,
    todoDelta: current.todoCount - baseline.todoCount,
  };
}

export async function saveEvidenceSnapshot(
  taskDir: string,
  kind: 'baseline' | 'current',
  snapshot: EvidenceSnapshot,
): Promise<void> {
  const validated = evidenceSnapshotSchema.parse(snapshot);
  const filePath = getTaskEvidencePath(taskDir, kind);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(validated, null, 2)}\n`, 'utf8');
}

export async function saveBaselineDiff(
  taskDir: string,
  diff: BaselineDiff,
): Promise<void> {
  const validated = baselineDiffSchema.parse(diff);
  const filePath = getTaskEvidencePath(taskDir, 'baseline-diff');
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(validated, null, 2)}\n`, 'utf8');
}

/**
 * 加载磁盘上的 baseline。文件不存在或损坏时返回 null（让 gate 退化为不带 baseline 的旧行为）。
 */
export async function loadEvidenceBaseline(workDir: string): Promise<EvidenceBaseline | null> {
  const filePath = getEvidenceBaselinePath(workDir);
  let text: string;
  try {
    text = await readFile(filePath, 'utf8');
  } catch (error) {
    if (isMissingFileError(error)) return null;
    throw error;
  }

  try {
    const raw = JSON.parse(text) as unknown;
    return evidenceBaselineSchema.parse(raw);
  } catch {
    // 损坏不抛：让 gate 退回到无 baseline 模式
    return null;
  }
}

/**
 * 把 baseline 写到磁盘。文件采用 pretty-printed JSON，便于人查看。
 */
export async function saveEvidenceBaseline(
  workDir: string,
  baseline: EvidenceBaseline,
): Promise<void> {
  const validated = evidenceBaselineSchema.parse(baseline);
  const filePath = getEvidenceBaselinePath(workDir);

  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(validated, null, 2)}\n`, 'utf8');
}
