import {
  type AdapterOutput,
  type CommitGateResult,
  type EvidenceResult,
  type TaskContext,
  type TaskReport,
  validateTaskReport,
} from '@harnessly/shared';

function buildSummary(commitGate: CommitGateResult): string {
  const preExistingHint =
    commitGate.preExistingFailures.length > 0
      ? `（已忽略 baseline 旧失败：${commitGate.preExistingFailures.join(', ')}）`
      : '';

  if (commitGate.decision === 'pass') {
    return `执行与最小验证通过${preExistingHint}`;
  }

  if (commitGate.decision === 'warn') {
    const reasons =
      commitGate.warnings.length > 0 ? commitGate.warnings.join('；') : '未列明告警';
    return `commit_gate 软性告警：${reasons}${preExistingHint}（需 PM 确认）`;
  }

  // decision === 'block'
  const reasons =
    commitGate.failures.length > 0 ? commitGate.failures.join('；') : '未列明失败原因';
  return `commit_gate 硬性失败：${reasons}${preExistingHint}`;
}

export function createTaskReport(
  ctx: TaskContext,
  adapter: AdapterOutput,
  evidence: EvidenceResult,
  commitGate: CommitGateResult,
): TaskReport {
  return validateTaskReport({
    taskId: ctx.taskId,
    goal: ctx.goal,
    adapter,
    evidence,
    commitGate,
    commitReady: commitGate.decision === 'pass',
    summary: buildSummary(commitGate),
    generatedAt: new Date().toISOString(),
  });
}
