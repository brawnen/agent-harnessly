import { describe, expect, it } from 'vitest';

import { runScopeCheck } from './scope';
import type { Contract } from '@harnessly/shared';

function makeContract(scopeInclude: string[]): Contract {
  return {
    goal: 'test',
    templateName: 'bug-fix',
    riskLevel: 'low',
    scopeInclude,
    scopeExclude: [],
    acceptanceCriteria: [],
    outOfScope: [],
  };
}

describe('runScopeCheck', () => {
  it('should skip when contract is missing', () => {
    const result = runScopeCheck(undefined, ['src/foo/file.ts']);
    expect(result.status).toBe('skipped');
    expect(result.detail).toContain('contract 缺失');
  });

  it('should skip when scope_include has no structured patterns', () => {
    const contract = makeContract(['相关实现路径']);
    const result = runScopeCheck(contract, ['src/foo/file.ts']);
    expect(result.status).toBe('skipped');
    expect(result.detail).toContain('还不是结构化路径');
  });

  it('should pass when all changed files are within scope', () => {
    const contract = makeContract(['src/foo/']);
    const result = runScopeCheck(contract, ['src/foo/file.ts', 'src/foo/bar/index.ts']);
    expect(result.status).toBe('passed');
  });

  it('should fail when files are outside scope', () => {
    const contract = makeContract(['src/foo/']);
    const result = runScopeCheck(contract, ['src/foo/file.ts', 'src/bar/file.ts']);
    expect(result.status).toBe('failed');
    expect(result.detail).toContain('超出 scope');
    expect(result.detail).toContain('src/bar/file.ts');
  });

  it('should pass with wildcard * pattern', () => {
    const contract = makeContract(['*']);
    const result = runScopeCheck(contract, ['any/file.ts', 'other/path.ts']);
    expect(result.status).toBe('passed');
  });

  it('should match directory prefix (trailing /)', () => {
    const contract = makeContract(['packages/core/src/']);
    const result = runScopeCheck(contract, [
      'packages/core/src/scope.ts',
      'packages/core/src/scope.test.ts',
    ]);
    expect(result.status).toBe('passed');
  });

  it('should reject files that do not start with directory prefix', () => {
    const contract = makeContract(['packages/core/src/']);
    const result = runScopeCheck(contract, ['packages/cli/src/commands/status.ts']);
    expect(result.status).toBe('failed');
    expect(result.detail).toContain('packages/cli/src/commands/status.ts');
  });

  it('should match wildcard in path pattern', () => {
    const contract = makeContract(['packages/*/src/']);
    const result = runScopeCheck(contract, ['packages/core/src/scope.ts']);
    expect(result.status).toBe('passed');
  });

  it('should match file extension pattern', () => {
    const contract = makeContract(['.ts']);
    const result = runScopeCheck(contract, ['src/foo.ts', 'src/bar.ts']);
    expect(result.status).toBe('passed');
  });

  it('should reject non-matching extension', () => {
    const contract = makeContract(['.ts']);
    const result = runScopeCheck(contract, ['src/foo.ts', 'src/bar.md']);
    expect(result.status).toBe('failed');
    expect(result.detail).toContain('src/bar.md');
  });

  it('should pass with empty changed files', () => {
    const contract = makeContract(['src/foo/']);
    const result = runScopeCheck(contract, []);
    expect(result.status).toBe('passed');
  });

  it('should handle multiple scope patterns', () => {
    const contract = makeContract(['src/foo/', 'docs/', '*.config.ts']);
    const result = runScopeCheck(contract, [
      'src/foo/bar.ts',
      'docs/readme.md',
      'vitest.config.ts',
    ]);
    expect(result.status).toBe('passed');
  });

  it('should fail when any file does not match any pattern', () => {
    const contract = makeContract(['src/foo/', 'docs/']);
    const result = runScopeCheck(contract, [
      'src/foo/bar.ts',
      'src/bar/unexpected.ts',
    ]);
    expect(result.status).toBe('failed');
    expect(result.detail).toContain('src/bar/unexpected.ts');
  });
});
