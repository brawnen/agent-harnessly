import type { EvidenceCheckResult } from '@harnessly/shared';

/**
 * review 阶段的轻量静态检查（占位实现）。
 *
 * v3-core SPEC §6.4 review 阶段应由 reviewer sub-agent 负责，做语义层代码审查。
 * 在 sub-agent 全角色扩展（Phase 2）之前，先用一组确定性静态规则托底，
 * 避免完全跳过 review 阶段。
 *
 * 输出兼容 `EvidenceCheckResult`，便于后续合入 evidence.checks 一起进 commit_gate。
 *
 * 占位规则：
 * - review.large_change_set: 改动文件数 > 50 → failed
 * - review.sensitive_file: 改动包含敏感文件路径（.env / 密钥 / 凭证）→ failed
 * - review.empty_change_set: 改动为空 → skipped（让 commit_gate 的软性 warn 维度处理）
 */
const SENSITIVE_FILE_PATTERNS = [
  /(^|\/)\.env(\.|$)/,
  /(^|\/)\.env\.local$/,
  /credentials\.(json|yaml|yml|env)$/i,
  /secrets?\.(json|yaml|yml|env)$/i,
  /(^|\/)id_rsa(\.|$)/,
  /\.pem$/i,
  /\.p12$/i,
  /\.pfx$/i,
];

const LARGE_CHANGE_SET_THRESHOLD = 50;

function detectSensitiveFiles(changedFiles: string[]): string[] {
  return changedFiles.filter((file) => SENSITIVE_FILE_PATTERNS.some((pattern) => pattern.test(file)));
}

export function runReviewStage(changedFiles: string[]): EvidenceCheckResult[] {
  const findings: EvidenceCheckResult[] = [];

  if (changedFiles.length === 0) {
    findings.push({
      name: 'review.empty_change_set',
      status: 'skipped',
      command: 'review-static',
      detail: '工作区无变更，跳过 review 阶段静态检查',
    });
    return findings;
  }

  if (changedFiles.length > LARGE_CHANGE_SET_THRESHOLD) {
    findings.push({
      name: 'review.large_change_set',
      status: 'failed',
      command: 'review-static',
      detail: `改动文件数 ${changedFiles.length} 超过阈值 ${LARGE_CHANGE_SET_THRESHOLD}，建议拆分任务`,
    });
  } else {
    findings.push({
      name: 'review.change_set_size',
      status: 'passed',
      command: 'review-static',
      detail: `改动文件数 ${changedFiles.length}，处于合理区间`,
    });
  }

  const sensitive = detectSensitiveFiles(changedFiles);
  if (sensitive.length > 0) {
    findings.push({
      name: 'review.sensitive_file',
      status: 'failed',
      command: 'review-static',
      detail: `检出敏感文件改动：${sensitive.join(', ')}`,
    });
  } else {
    findings.push({
      name: 'review.sensitive_file',
      status: 'passed',
      command: 'review-static',
      detail: '未检出敏感文件改动',
    });
  }

  return findings;
}
