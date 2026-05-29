import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type {
  AdapterOutput,
  Contract,
  FeedbackEntry,
  TaskContext,
  TaskReport,
} from '@brawnen/harnessly-shared';

import {
  appendFeedbackEntry,
  buildFeedbackEntry,
  FEEDBACK_POOL_FILENAME,
  getFeedbackPoolPath,
  loadFeedbackPool,
  pickRecentEntries,
  renderFeedbackEntriesAsLines,
} from './feedback-pool';
import { ensureHarnessDirectories } from './scaffold';

async function createTempDir(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), 'harnessly-feedback-pool-test-'));
}

function makeEntry(overrides: Partial<FeedbackEntry> = {}): FeedbackEntry {
  return {
    taskId: 'task-1',
    goal: '修复 list 输出',
    decision: 'pass',
    completedAt: '2026-04-20T00:00:00.000Z',
    completedStages: ['spec', 'design', 'execute', 'review', 'test', 'commit_gate'],
    retryCount: 0,
    template: 'bug-fix',
    riskLevel: 'low',
    changedFilesCount: 2,
    ...overrides,
  };
}

describe('feedback-pool path + filename', () => {
  it('places jsonl directly under .harness for visibility', async () => {
    const workDir = await createTempDir();
    try {
      const filePath = getFeedbackPoolPath(workDir);
      expect(filePath.endsWith(`/.harness/${FEEDBACK_POOL_FILENAME}`)).toBe(true);
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  });
});

describe('appendFeedbackEntry + loadFeedbackPool', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
  });

  it('writes one JSONL line per entry and reads them back in order', async () => {
    const workDir = await createTempDir();
    tempDirs.push(workDir);
    await ensureHarnessDirectories(workDir);

    await appendFeedbackEntry(workDir, makeEntry({ taskId: 'a' }));
    await appendFeedbackEntry(workDir, makeEntry({ taskId: 'b', decision: 'needs_human_review' }));

    const text = await readFile(getFeedbackPoolPath(workDir), 'utf8');
    expect(text.split('\n').filter(Boolean)).toHaveLength(2);

    const entries = await loadFeedbackPool(workDir);
    expect(entries.map((e) => e.taskId)).toEqual(['a', 'b']);
    expect(entries[1].decision).toBe('needs_human_review');
  });

  it('returns empty array when pool file does not exist', async () => {
    const workDir = await createTempDir();
    tempDirs.push(workDir);
    await ensureHarnessDirectories(workDir);

    const entries = await loadFeedbackPool(workDir);
    expect(entries).toEqual([]);
  });

  it('skips corrupt lines without throwing', async () => {
    const workDir = await createTempDir();
    tempDirs.push(workDir);
    await ensureHarnessDirectories(workDir);

    await appendFeedbackEntry(workDir, makeEntry({ taskId: 'a' }));
    // 直接写入一行损坏数据 + 一行合法
    await writeFile(
      getFeedbackPoolPath(workDir),
      `${JSON.stringify(makeEntry({ taskId: 'a' }))}\nthis is not json\n${JSON.stringify(makeEntry({ taskId: 'b' }))}\n`,
      'utf8',
    );

    const entries = await loadFeedbackPool(workDir);
    expect(entries.map((e) => e.taskId)).toEqual(['a', 'b']);
  });

  it('rejects schema-illegal entries on append', async () => {
    const workDir = await createTempDir();
    tempDirs.push(workDir);
    await ensureHarnessDirectories(workDir);

    const bad = { ...makeEntry(), decision: 'green' as unknown as FeedbackEntry['decision'] };
    await expect(appendFeedbackEntry(workDir, bad)).rejects.toThrow();

    // 文件不应该被创建（schema 校验早于 fs append）
    await expect(loadFeedbackPool(workDir)).resolves.toEqual([]);
  });
});

describe('buildFeedbackEntry', () => {
  function makeCtx(overrides: Partial<TaskContext> = {}): TaskContext {
    const contract: Contract = {
      version: '2.0',
      taskId: 'task-1',
      goal: '修复 list 输出',
      templateName: 'bug-fix',
      riskLevel: 'low',
      estimatedComplexity: 'simple',
      requiredChecks: [],
      scopeInclude: ['packages/cli/src'],
      scopeExclude: [],
      acceptanceCriteria: [{ criterion: 'list 显示 stage', verifiableBy: 'manual' }],
      outOfScope: [],
      linkedSpec: 'requirement.md',
      linkedDesign: 'design.md',
      createdAt: '2026-04-20T00:00:00.000Z',
    };
    return {
      taskId: 'task-1',
      goal: '修复 list 输出',
      workDir: '/tmp',
      taskDir: '/tmp/.harness/tasks/task-1',
      config: {
        version: 1,
        projectType: 'node',
        requiredChecks: [],
        defaultHost: 'claude-code',
        enabledHosts: ['claude-code'],
        installRepoLocalShells: true,
        sourceOfTruthDir: '.harness/hosts',
        fallbackCreateTaskWithoutPlanner: false,
        codexUserPromptSubmitHookEnabled: true,
        adapterKind: 'claude-code',
        adapterCommand: '',
      },
      state: {
        taskId: 'task-1',
        status: 'completed',
        currentStage: 'commit_gate',
        currentOwner: 'pm',
        createdAt: '2026-04-20T00:00:00.000Z',
        updatedAt: '2026-04-20T00:00:00.000Z',
        completedStages: ['spec', 'design', 'execute', 'review', 'test', 'commit_gate'],
        retryCount: 0,
        preset: 'lite',
        presetSource: 'slash_command',
        presetSetAt: '2026-04-20T00:00:00.000Z',
      },
      contract,
      ...overrides,
    };
  }

  function makeReport(overrides: Partial<TaskReport> = {}): TaskReport {
    const adapter: AdapterOutput = {
      kind: 'claude-code',
      command: 'claude',
      exitCode: 0,
      stdout: '',
      stderr: '',
    };
    return {
      taskId: 'task-1',
      goal: '修复 list 输出',
      finalStage: 'commit_gate',
      commitDecision: 'pass',
      artifacts: {
        requirement: 'requirement.md',
        contract: 'contract.yaml',
        design: 'design.md',
        taskBreakdown: 'task-breakdown.md',
        implementationNotes: 'implementation-notes.md',
        review: 'review.md',
        residentReview: 'resident-review.md',
        testReport: 'test-report.md',
        baselineEvidence: 'evidence/baseline.json',
        currentEvidence: 'evidence/current.json',
        baselineDiff: 'evidence/baseline-diff.json',
        commitSummary: 'commit-summary.md',
      },
      metrics: { llmCalls: 0, durationSeconds: 0, retries: 0 },
      createdAt: '2026-04-20T00:00:00.000Z',
      finishedAt: '2026-04-20T01:00:00.000Z',
      adapter,
      evidence: {
        checks: [],
        changedFiles: ['a.ts', 'b.ts'],
        lintWarningsTotal: 0,
        todoCount: 0,
        gitDirtyFiles: 2,
      },
      commitGate: {
        passed: true,
        decision: 'pass',
        failures: [],
        warnings: [],
        preExistingFailures: [],
      },
      commitReady: true,
      summary: 'ok',
      generatedAt: '2026-04-20T01:00:00.000Z',
      ...overrides,
    };
  }

  it('derives all key fields from ctx + report', () => {
    const entry = buildFeedbackEntry(makeCtx(), makeReport());

    expect(entry.taskId).toBe('task-1');
    expect(entry.goal).toBe('修复 list 输出');
    expect(entry.decision).toBe('pass');
    expect(entry.template).toBe('bug-fix');
    expect(entry.riskLevel).toBe('low');
    expect(entry.changedFilesCount).toBe(2);
    expect(entry.retryCount).toBe(0);
    expect(entry.completedStages).toContain('execute');
  });

  it('records failureReason + failureStage only when decision !== pass', () => {
    const ctx = makeCtx({
      state: {
        taskId: 'task-1',
        status: 'blocked',
        currentStage: 'test',
        currentOwner: 'tester',
        createdAt: '2026-04-20T00:00:00.000Z',
        updatedAt: '2026-04-20T00:00:00.000Z',
        completedStages: ['spec', 'design', 'execute', 'review'],
        retryCount: 2,
        lastFailureReason: 'lint failed',
        lastFailureStage: 'test',
        preset: 'lite',
        presetSource: 'slash_command',
        presetSetAt: '2026-04-20T00:00:00.000Z',
      },
    });
    const report = makeReport({
      commitGate: {
        passed: false,
        decision: 'fail',
        failures: ['lint'],
        warnings: [],
        preExistingFailures: [],
      },
      commitReady: false,
    });

    const entry = buildFeedbackEntry(ctx, report);
    expect(entry.decision).toBe('fail');
    expect(entry.failureReason).toBe('lint failed');
    expect(entry.failureStage).toBe('test');
    expect(entry.retryCount).toBe(2);
  });

  it('omits failure fields on pass even if state has stale lastFailureReason', () => {
    const ctx = makeCtx({
      state: {
        taskId: 'task-1',
        status: 'completed',
        currentStage: 'commit_gate',
        currentOwner: 'pm',
        createdAt: '2026-04-20T00:00:00.000Z',
        updatedAt: '2026-04-20T00:00:00.000Z',
        completedStages: ['spec', 'design', 'execute', 'review', 'test', 'commit_gate'],
        retryCount: 1,
        lastFailureReason: 'old failure',
        lastFailureStage: 'test',
        preset: 'lite',
        presetSource: 'slash_command',
        presetSetAt: '2026-04-20T00:00:00.000Z',
      },
    });

    const entry = buildFeedbackEntry(ctx, makeReport());
    expect(entry.decision).toBe('pass');
    expect(entry.failureReason).toBeUndefined();
    expect(entry.failureStage).toBeUndefined();
  });
});

describe('pickRecentEntries', () => {
  const corpus: FeedbackEntry[] = Array.from({ length: 8 }, (_, i) =>
    makeEntry({
      taskId: `task-${i + 1}`,
      template: i % 2 === 0 ? 'bug-fix' : 'feature-simple',
      completedAt: `2026-04-${String(20 + i).padStart(2, '0')}T00:00:00.000Z`,
    }),
  );

  it('returns empty when entries are empty', () => {
    expect(pickRecentEntries([])).toEqual([]);
  });

  it('takes the latest globalLimit entries by default (5)', () => {
    const picked = pickRecentEntries(corpus);
    expect(picked).toHaveLength(5);
    expect(picked.map((e) => e.taskId)).toEqual([
      'task-4',
      'task-5',
      'task-6',
      'task-7',
      'task-8',
    ]);
  });

  it('augments with same-template recent entries (default 3)', () => {
    const picked = pickRecentEntries(corpus, { templateName: 'bug-fix' });
    // 5 最近 + 3 同模板（去重后视情况而定）
    const ids = new Set(picked.map((e) => e.taskId));
    expect(ids.size).toBe(picked.length);
    expect(picked.some((e) => e.template === 'bug-fix')).toBe(true);
  });

  it('respects custom limits', () => {
    const picked = pickRecentEntries(corpus, { globalLimit: 2, templateLimit: 0 });
    expect(picked.map((e) => e.taskId)).toEqual(['task-7', 'task-8']);
  });

  it('returns empty when both limits are zero', () => {
    expect(pickRecentEntries(corpus, { globalLimit: 0, templateLimit: 0 })).toEqual([]);
  });
});

describe('renderFeedbackEntriesAsLines', () => {
  it('formats each entry as a single line with key fields', () => {
    const lines = renderFeedbackEntriesAsLines([makeEntry({ taskId: 't1', goal: 'fix x' })]);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('[t1]');
    expect(lines[0]).toContain('bug-fix');
    expect(lines[0]).toContain('pass');
    expect(lines[0]).toContain('retry=0');
    expect(lines[0]).toContain('fix x');
  });

  it('decorates failed entries with @<stage>', () => {
    const lines = renderFeedbackEntriesAsLines([
      makeEntry({ taskId: 't1', decision: 'fail', failureStage: 'test' }),
    ]);
    expect(lines[0]).toContain('@test');
  });
});
