import { describe, expect, it } from 'vitest';

import { runScopeCheck } from './scope';
import type { Contract } from '@harnessly/shared';

function makeContract(scopeExclude: string[], scopeInclude: string[] = []): Contract {
  return {
    version: '2.0',
    taskId: 'task-1',
    goal: 'test',
    templateName: 'bug-fix',
    riskLevel: 'low',
    estimatedComplexity: 'simple',
    requiredChecks: [],
    scopeInclude,
    scopeExclude,
    acceptanceCriteria: [],
    outOfScope: [],
    linkedSpec: 'requirement.md',
    linkedDesign: 'design.md',
    createdAt: '2026-04-20T00:00:00.000Z',
  };
}

describe('runScopeCheck — SPEC §11 deny-list semantics', () => {
  it('should skip when contract is missing', () => {
    const result = runScopeCheck(undefined, ['src/foo/file.ts']);
    expect(result.status).toBe('skipped');
    expect(result.detail).toContain('contract 缺失');
  });

  it('should pass when scope.exclude is empty (deny-list 语义)', () => {
    const contract = makeContract([]);
    const result = runScopeCheck(contract, ['src/foo/file.ts', 'src/bar/file.ts']);
    expect(result.status).toBe('passed');
    expect(result.detail).toContain('未配置');
  });

  it('should pass when scope.exclude has only non-structured strings', () => {
    const contract = makeContract(['文字说明', '随便写的']);
    const result = runScopeCheck(contract, ['src/foo/file.ts']);
    // 非结构化字符串被过滤掉 → exclude 为空 → 全 pass
    expect(result.status).toBe('passed');
  });

  it('should fail when a changed file matches an exclude pattern', () => {
    const contract = makeContract(['dist/']);
    const result = runScopeCheck(contract, ['src/foo.ts', 'dist/index.js']);
    expect(result.status).toBe('failed');
    expect(result.detail).toContain('dist/index.js');
    expect(result.detail).toContain('dist/');
  });

  it('should pass when no changed file matches any exclude pattern', () => {
    const contract = makeContract(['dist/', 'node_modules/']);
    const result = runScopeCheck(contract, ['src/foo.ts', 'docs/README.md']);
    expect(result.status).toBe('passed');
  });

  it('should match directory prefix pattern (trailing /)', () => {
    const contract = makeContract(['build/']);
    const result = runScopeCheck(contract, ['build/output.js', 'src/foo.ts']);
    expect(result.status).toBe('failed');
    expect(result.detail).toContain('build/output.js');
  });

  it('should match wildcard pattern in path', () => {
    const contract = makeContract(['packages/*/dist/']);
    const result = runScopeCheck(contract, [
      'packages/core/dist/index.js',
      'packages/core/src/foo.ts',
    ]);
    expect(result.status).toBe('failed');
    expect(result.detail).toContain('packages/core/dist/index.js');
    expect(result.detail).not.toContain('packages/core/src/foo.ts');
  });

  it('should match file extension pattern', () => {
    const contract = makeContract(['.log']);
    const result = runScopeCheck(contract, ['app.log', 'src/foo.ts']);
    expect(result.status).toBe('failed');
    expect(result.detail).toContain('app.log');
  });

  it('should pass with empty changed files regardless of exclude rules', () => {
    const contract = makeContract(['dist/', '.log']);
    const result = runScopeCheck(contract, []);
    expect(result.status).toBe('passed');
  });

  it('should aggregate multiple violations into a single failure detail', () => {
    const contract = makeContract(['dist/', 'node_modules/']);
    const result = runScopeCheck(contract, [
      'src/foo.ts',
      'dist/a.js',
      'node_modules/x/y.js',
    ]);
    expect(result.status).toBe('failed');
    expect(result.detail).toContain('dist/a.js');
    expect(result.detail).toContain('node_modules/x/y.js');
    expect(result.detail).not.toContain('src/foo.ts');
  });

  it('should treat `*` exclude pattern as deny-all (every file fails)', () => {
    const contract = makeContract(['*']);
    const result = runScopeCheck(contract, ['anything.ts']);
    expect(result.status).toBe('failed');
  });

  it('MUST NOT use scope.include as an allow-list (SPEC §11 hard constraint)', () => {
    // scope.include 写得很严格，但 scope.exclude 没配置 → SPEC 要求全部 pass
    const contract = makeContract([], ['only/this/is/allowed/']);
    const result = runScopeCheck(contract, [
      'completely/outside/file.ts',
      'src/foo.ts',
    ]);
    expect(result.status).toBe('passed');
  });

  it('scope.include is purely informational and never blocks (mixed with exclude)', () => {
    // include 列了 A 路径，exclude 列了 B 路径，改了 A — 应该 pass
    const contract = makeContract(['build/'], ['src/foo/']);
    const result = runScopeCheck(contract, ['src/foo/file.ts']);
    expect(result.status).toBe('passed');
  });
});
