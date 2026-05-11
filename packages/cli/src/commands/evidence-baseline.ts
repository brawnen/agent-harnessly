import { unlink } from 'node:fs/promises';

import {
  buildEvidenceBaseline,
  collectEvidence,
  getEvidenceBaselinePath,
  loadEvidenceBaseline,
  loadHarnessConfig,
  saveEvidenceBaseline,
} from '@brawnen/harnessly-core';

import { appendHarnessEvent } from '../utils/events';
import { printJson, printLines } from '../utils/output';

/**
 * harness evidence baseline [--show] [--clear] [--json]
 *
 * 首次接入时建议跑一次：
 *   harnessly evidence baseline
 * 把项目当前已经失败的 check 名字快照下来，让 commit gate 知道"哪些是任务无关的旧问题"。
 *
 * 任务通过后 baseline 会自动刷新（workflow.ts 在 commit_gate pass 时写回），
 * 这个命令主要用于首次建立基线、查看当前基线、或清除基线让 gate 退回旧行为。
 */
export async function runEvidenceBaseline(
  flags: Record<string, string | boolean>,
): Promise<void> {
  const workDir = process.cwd();
  const asJson = flags.json === true;

  if (flags.show === true) {
    const baseline = await loadEvidenceBaseline(workDir);
    if (!baseline) {
      if (asJson) {
        printJson({ baseline: null });
        return;
      }
      printLines([
        '当前没有 evidence baseline',
        `- 路径: ${getEvidenceBaselinePath(workDir)}`,
        '- 运行 `harnessly evidence baseline` 建立基线（首次接入推荐）',
      ]);
      return;
    }

    if (asJson) {
      printJson({ baseline });
      return;
    }
    printLines([
      'Evidence baseline',
      `- captured_at: ${baseline.capturedAt}`,
      `- failed_check_names: ${baseline.failedCheckNames.length > 0 ? baseline.failedCheckNames.join(', ') : '(none)'}`,
    ]);
    return;
  }

  if (flags.clear === true) {
    try {
      await unlink(getEvidenceBaselinePath(workDir));
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code?: string }).code !== 'ENOENT'
      ) {
        throw error;
      }
    }

    await appendHarnessEvent(workDir, { type: 'evidence.baseline_cleared' });

    if (asJson) {
      printJson({ cleared: true });
      return;
    }
    printLines(['evidence baseline 已清除（gate 将退回到不带 baseline 的行为）']);
    return;
  }

  // 默认：跑一次 evidence 采集 → 派生 baseline → 落盘
  const config = await loadHarnessConfig(workDir);
  const evidence = await collectEvidence(workDir, config);
  const baseline = buildEvidenceBaseline(evidence);
  await saveEvidenceBaseline(workDir, baseline);

  await appendHarnessEvent(workDir, {
    type: 'evidence.baseline_captured',
    capturedAt: baseline.capturedAt,
    failedCount: baseline.failedCheckNames.length,
  });

  if (asJson) {
    printJson({ baseline });
    return;
  }
  printLines([
    'evidence baseline 已建立',
    `- captured_at: ${baseline.capturedAt}`,
    `- failed_check_names: ${baseline.failedCheckNames.length > 0 ? baseline.failedCheckNames.join(', ') : '(none)'}`,
    '- 后续任务的 commit gate 会忽略 baseline 中已经失败的 check',
  ]);
}
