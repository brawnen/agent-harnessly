import type {
  CommitDecision,
  CommitGateResult,
  EvidenceBaseline,
  EvidenceResult,
} from '@brawnen/harnessly-shared';

export interface EvaluateCommitGateOptions {
  /**
   * 任务开始前采集的 evidence baseline。
   * 当传入时，baseline 中已经失败的 check 不会再次进入 failures，
   * 而是被记录到 preExistingFailures（任务无关旧问题）。
   */
  baseline?: EvidenceBaseline | null;
}

/**
 * 评估 commit_gate 决策。
 *
 * 三态规则（v3-core SPEC §6.6）：
 * - 任何硬性失败 → 'fail'（禁止 commit）
 * - 无硬性失败但存在软性告警 → 'needs_human_review'
 * - 全部通过 → 'pass'
 *
 * 当前硬性维度：
 * - adapter 退出码非 0
 * - evidence.checks 中任意 check 失败 **且** 该 check 不在 baseline.failedCheckNames 内
 *
 * 当前软性维度：
 * - changedFiles 为空（任务结束但工作区无变更，可能是空跑或问答类任务）
 *
 * baseline-diff（Phase 3.3）：
 * - check 在 baseline 中已经失败 → 不计入 failures，进 preExistingFailures（任务无关）
 * - check 在 baseline 中通过/缺失，本次失败 → 计入 failures（任务引入的回归）
 */
export function evaluateCommitGate(
  evidence: EvidenceResult,
  adapterExitCode: number,
  options: EvaluateCommitGateOptions = {},
): CommitGateResult {
  const failures: string[] = [];
  const warnings: string[] = [];
  const preExistingFailures: string[] = [];

  const baselineFailedNames = new Set<string>(options.baseline?.failedCheckNames ?? []);

  if (adapterExitCode !== 0) {
    failures.push(`adapter exit code = ${adapterExitCode}`);
  }

  for (const check of evidence.checks) {
    if (check.status !== 'failed') continue;

    if (baselineFailedNames.has(check.name)) {
      // 旧失败：从 failures 抽出，标记为任务无关
      preExistingFailures.push(check.name);
    } else {
      failures.push(`${check.name} 失败`);
    }
  }

  if (evidence.changedFiles.length === 0) {
    warnings.push('未检测到工作区变更');
  }

  const decision: CommitDecision =
    failures.length > 0 ? 'fail' : warnings.length > 0 ? 'needs_human_review' : 'pass';

  return {
    passed: decision === 'pass',
    decision,
    failures,
    warnings,
    preExistingFailures,
  };
}
