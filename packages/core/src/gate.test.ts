import { describe, expect, it } from 'vitest';

import type { EvidenceBaseline, EvidenceResult } from '@harnessly/shared';

import { evaluateCommitGate } from './gate';

function makeEvidence(overrides: Partial<EvidenceResult> = {}): EvidenceResult {
  return {
    checks: [],
    changedFiles: ['src/foo.ts'],
    lintWarningsTotal: 0,
    todoCount: 0,
    gitDirtyFiles: 1,
    ...overrides,
  };
}

describe('evaluateCommitGate', () => {
  it('returns pass when all checks succeed and changes exist', () => {
    const result = evaluateCommitGate(
      makeEvidence({
        checks: [
          { name: 'test', status: 'passed', command: 'pnpm test', detail: 'ok' },
          { name: 'lint', status: 'passed', command: 'pnpm lint', detail: 'ok' },
        ],
      }),
      0,
    );

    expect(result.decision).toBe('pass');
    expect(result.passed).toBe(true);
    expect(result.failures).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it('returns fail when adapter exit code is non-zero', () => {
    const result = evaluateCommitGate(makeEvidence(), 1);

    expect(result.decision).toBe('fail');
    expect(result.passed).toBe(false);
    expect(result.failures).toContain('adapter exit code = 1');
  });

  it('returns fail when any check failed', () => {
    const result = evaluateCommitGate(
      makeEvidence({
        checks: [
          { name: 'test', status: 'failed', command: 'pnpm test', detail: '2 cases failed' },
        ],
      }),
      0,
    );

    expect(result.decision).toBe('fail');
    expect(result.passed).toBe(false);
    expect(result.failures).toContain('test 失败');
  });

  it('returns needs_human_review when changes are empty but no hard failures', () => {
    const result = evaluateCommitGate(makeEvidence({ changedFiles: [] }), 0);

    expect(result.decision).toBe('needs_human_review');
    expect(result.passed).toBe(false);
    expect(result.failures).toEqual([]);
    expect(result.warnings).toContain('未检测到工作区变更');
  });

  it('prioritizes fail over needs_human_review when both signals present', () => {
    const result = evaluateCommitGate(
      makeEvidence({
        checks: [
          { name: 'lint', status: 'failed', command: 'pnpm lint', detail: '3 errors' },
        ],
        changedFiles: [],
      }),
      0,
    );

    expect(result.decision).toBe('fail');
    expect(result.failures).toContain('lint 失败');
    // warnings 仍然记录，便于诊断
    expect(result.warnings).toContain('未检测到工作区变更');
  });

  it('returns empty preExistingFailures when no baseline is provided', () => {
    const result = evaluateCommitGate(
      makeEvidence({
        checks: [
          { name: 'lint', status: 'failed', command: 'pnpm lint', detail: 'broken' },
        ],
      }),
      0,
    );

    expect(result.preExistingFailures).toEqual([]);
  });
});

describe('evaluateCommitGate with baseline (Phase 3.3)', () => {
  const baseline: EvidenceBaseline = {
    capturedAt: '2026-04-19T00:00:00.000Z',
    failedCheckNames: ['lint', 'typecheck'],
  };

  it('demotes baseline-known failures from failures to preExistingFailures', () => {
    const result = evaluateCommitGate(
      makeEvidence({
        checks: [
          { name: 'lint', status: 'failed', command: 'pnpm lint', detail: 'still broken' },
          { name: 'test', status: 'passed', command: 'pnpm test', detail: 'ok' },
        ],
      }),
      0,
      { baseline },
    );

    expect(result.decision).toBe('pass');
    expect(result.failures).toEqual([]);
    expect(result.preExistingFailures).toEqual(['lint']);
  });

  it('still blocks on failures NOT in baseline (true regression)', () => {
    const result = evaluateCommitGate(
      makeEvidence({
        checks: [
          { name: 'lint', status: 'failed', command: 'pnpm lint', detail: 'old' },
          { name: 'test', status: 'failed', command: 'pnpm test', detail: 'NEW regression' },
        ],
      }),
      0,
      { baseline },
    );

    expect(result.decision).toBe('fail');
    expect(result.failures).toContain('test 失败');
    expect(result.failures).not.toContain('lint 失败');
    expect(result.preExistingFailures).toEqual(['lint']);
  });

  it('treats baseline=null exactly like no baseline', () => {
    const evidence = makeEvidence({
      checks: [{ name: 'lint', status: 'failed', command: 'pnpm lint', detail: 'broken' }],
    });

    const withNull = evaluateCommitGate(evidence, 0, { baseline: null });
    const without = evaluateCommitGate(evidence, 0);

    expect(withNull.decision).toBe(without.decision);
    expect(withNull.failures).toEqual(without.failures);
  });

  it('still surfaces adapter exit code as a hard failure regardless of baseline', () => {
    // baseline 不应该掩盖 adapter 异常
    const result = evaluateCommitGate(makeEvidence(), 1, { baseline });
    expect(result.decision).toBe('fail');
    expect(result.failures).toContain('adapter exit code = 1');
  });
});
