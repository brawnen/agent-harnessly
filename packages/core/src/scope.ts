import type { Contract, EvidenceCheckResult } from '@harnessly/shared';

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

export function runScopeCheck(contract: Contract | undefined, changedFiles: string[]): EvidenceCheckResult {
  if (!contract) {
    return {
      name: 'scope',
      status: 'skipped',
      command: 'scope-check',
      detail: 'contract 缺失',
    };
  }

  const patterns = contract.scopeInclude.filter(isStructuredScope);
  if (patterns.length === 0) {
    return {
      name: 'scope',
      status: 'skipped',
      command: 'scope-check',
      detail: 'scope_include 还不是结构化路径，暂不做硬校验',
    };
  }

  const outOfScopeFiles = changedFiles.filter(
    (filePath) => !patterns.some((pattern) => matchesPattern(filePath, pattern)),
  );

  if (outOfScopeFiles.length > 0) {
    return {
      name: 'scope',
      status: 'failed',
      command: 'scope-check',
      detail: `发现超出 scope 的文件: ${outOfScopeFiles.join(', ')}`,
    };
  }

  return {
    name: 'scope',
    status: 'passed',
    command: 'scope-check',
    detail: '变更文件与 scope 一致',
  };
}
