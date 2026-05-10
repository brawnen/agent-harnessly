import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { EvidenceBaseline, EvidenceResult } from '@harnessly/shared';
import { evidenceBaselineSchema } from '@harnessly/shared';

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
