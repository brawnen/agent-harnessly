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

  if (commitGate.decision === 'needs_human_review') {
    const reasons =
      commitGate.warnings.length > 0 ? commitGate.warnings.join('；') : '未列明告警';
    return `commit_gate 软性告警：${reasons}${preExistingHint}（需 PM 确认）`;
  }

  // decision === 'fail'
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
  const now = new Date().toISOString();
  return validateTaskReport({
    taskId: ctx.taskId,
    goal: ctx.goal,
    finalStage: 'commit_gate',
    commitDecision: commitGate.decision,
    artifacts: {
      requirement: `${ctx.taskDir}/requirement.md`,
      contract: `${ctx.taskDir}/contract.yaml`,
      design: `${ctx.taskDir}/design.md`,
      taskBreakdown: `${ctx.taskDir}/task-breakdown.md`,
      implementationNotes: `${ctx.taskDir}/implementation-notes.md`,
      review: `${ctx.taskDir}/review.md`,
      residentReview: `${ctx.taskDir}/resident-review.md`,
      testReport: `${ctx.taskDir}/test-report.md`,
      baselineEvidence: `${ctx.taskDir}/evidence/baseline.json`,
      currentEvidence: `${ctx.taskDir}/evidence/current.json`,
      baselineDiff: `${ctx.taskDir}/evidence/baseline-diff.json`,
      commitSummary: `${ctx.taskDir}/commit-summary.md`,
    },
    metrics: {
      llmCalls: 0,
      durationSeconds: Math.max(0, Math.floor((Date.parse(now) - Date.parse(ctx.state.createdAt)) / 1000)),
      retries: ctx.state.retryCount,
    },
    createdAt: ctx.state.createdAt,
    finishedAt: now,
    adapter,
    evidence,
    commitGate,
    commitReady: commitGate.decision === 'pass',
    summary: buildSummary(commitGate),
    generatedAt: now,
  });
}
