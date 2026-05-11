import type { Contract, EvidenceCheckResult } from '@brawnen/harnessly-shared';

/**
 * v3-core SPEC §11 Scope Check
 *
 * 输入：
 * - `contract.scope.exclude`：deny-list（glob 列表）
 * - 变更文件列表（由调用方通过 `git diff <baseline> HEAD` 计算）
 *
 * 算法（REQUIRED）：
 *   for f in changed_files:
 *     for pattern in scope.exclude:
 *       if f matches pattern:
 *         return FAIL(out_of_scope, file=f, pattern=pattern)
 *   return PASS
 *
 * 关键约束（SPEC MUST NOT）：
 * - `scope.include` 是 **display-only expectation list**，仅用于展示意图，
 *   **不得**作为 allow-list 参与硬性校验。
 */

function isStructuredScope(pattern: string): boolean {
  return /[/*]/.test(pattern) || pattern.includes('.');
}

function matchesPattern(filePath: string, pattern: string): boolean {
  if (pattern === '*') {
    return true;
  }

  if (pattern.includes('*')) {
    const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*');
    return new RegExp(escaped).test(filePath);
  }

  if (pattern.endsWith('/')) {
    return filePath.startsWith(pattern);
  }

  if (pattern.startsWith('.')) {
    return filePath.endsWith(pattern);
  }

  return filePath.startsWith(pattern) || filePath === pattern;
}

export interface ScopeViolation {
  file: string;
  pattern: string;
}

export function runScopeCheck(
  contract: Contract | undefined,
  changedFiles: string[],
): EvidenceCheckResult {
  if (!contract) {
    return {
      name: 'scope',
      status: 'skipped',
      command: 'scope-check',
      detail: 'contract 缺失',
    };
  }

  // 只取结构化 pattern（含路径分隔或扩展名）。空字符串 / 文字描述被忽略。
  const patterns = contract.scopeExclude.filter(isStructuredScope);

  // SPEC §11 deny-list 语义：exclude 为空 → 全部允许 → PASS
  if (patterns.length === 0) {
    return {
      name: 'scope',
      status: 'passed',
      command: 'scope-check',
      detail: 'scope.exclude 未配置结构化 pattern，按 deny-list 语义全部通过',
    };
  }

  const violations: ScopeViolation[] = [];
  for (const file of changedFiles) {
    for (const pattern of patterns) {
      if (matchesPattern(file, pattern)) {
        violations.push({ file, pattern });
        break;
      }
    }
  }

  if (violations.length > 0) {
    const detail = violations
      .map((v) => `${v.file}（命中 exclude pattern: ${v.pattern}）`)
      .join('; ');
    return {
      name: 'scope',
      status: 'failed',
      command: 'scope-check',
      detail: `检测到 scope.exclude 命中：${detail}`,
    };
  }

  return {
    name: 'scope',
    status: 'passed',
    command: 'scope-check',
    detail: '变更文件未命中任何 scope.exclude pattern',
  };
}
