import type { CommitGateResult, EvidenceResult } from '@harnessly/shared';

export function evaluateCommitGate(evidence: EvidenceResult, adapterExitCode: number): CommitGateResult {
  const failures: string[] = [];

  if (adapterExitCode !== 0) {
    failures.push(`adapter exit code = ${adapterExitCode}`);
  }

  for (const check of evidence.checks) {
    if (check.status === 'failed') {
      failures.push(`${check.name} 失败`);
    }
  }

  if (evidence.changedFiles.length === 0) {
    failures.push('未检测到工作区变更');
  }

  return {
    passed: failures.length === 0,
    failures,
  };
}
