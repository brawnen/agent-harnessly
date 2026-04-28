import {
  type AdapterOutput,
  type CommitGateResult,
  type EvidenceResult,
  type TaskContext,
  type TaskReport,
  validateTaskReport,
} from '@harnessly/shared';

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
    commitReady: commitGate.passed,
    summary: commitGate.passed ? '执行与最小验证通过' : `执行闭环未通过：${commitGate.failures.join('；')}`,
    generatedAt: new Date().toISOString(),
  });
}
