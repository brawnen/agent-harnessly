import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

const { collectChangedFilesMock } = vi.hoisted(() => ({
  collectChangedFilesMock: vi.fn().mockResolvedValue([]),
}));

vi.mock('@harnessly/core', async () => {
  const actual = await vi.importActual<typeof import('@harnessly/core')>('@harnessly/core');
  return {
    ...actual,
    collectChangedFiles: collectChangedFilesMock,
  };
});

import { runInit } from '../init';
import { runHostCompletionGate } from './completion-gate';

async function createTempDir(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), 'harnessly-host-completion-gate-'));
}

function normalizeChunk(chunk: string | Uint8Array): string {
  return typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8');
}

async function captureStdout(run: () => Promise<void>): Promise<string> {
  const chunks: string[] = [];
  const spy = vi
    .spyOn(process.stdout, 'write')
    .mockImplementation(((chunk: string | Uint8Array) => {
      chunks.push(normalizeChunk(chunk));
      return true;
    }) as typeof process.stdout.write);

  try {
    await run();
  } finally {
    spy.mockRestore();
  }

  return chunks.join('');
}

describe('host completion-gate command', () => {
  const tempDirs: string[] = [];
  const originalCwd = process.cwd();

  afterEach(async () => {
    collectChangedFilesMock.mockReset().mockResolvedValue([]);
    process.chdir(originalCwd);
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it('should block completion without report and recommend a v3-core role', async () => {
    const workDir = await createTempDir();
    tempDirs.push(workDir);
    process.chdir(workDir);

    await captureStdout(() => runInit({ host: 'codex' }));
    await mkdir(path.join(workDir, '.harness', 'tasks', 'task-1'), { recursive: true });
    await writeFile(path.join(workDir, '.harness', 'active-task.txt'), 'task-1', 'utf8');

    const output = await captureStdout(() =>
      runHostCompletionGate({ message: '已完成' }, []),
    );
    const payload = JSON.parse(output) as {
      pass: boolean;
      reason: string;
      activeTaskId: string;
      blockCount: number;
      requiresEvaluator: boolean;
      recommendedAgent: string | null;
      evalCommand: string;
      nextStep: string;
    };
    const events = await readFile(path.join(workDir, '.harness', 'events.jsonl'), 'utf8');

    expect(payload.pass).toBe(false);
    expect(payload.reason).toBe('report_not_ready');
    expect(payload.activeTaskId).toBe('task-1');
    expect(payload.blockCount).toBe(1);
    expect(payload.requiresEvaluator).toBe(true);
    // init 默认启用 reviewer/tester；fallback 优先取 reviewer
    expect(payload.recommendedAgent).toBe('harness-reviewer');
    expect(payload.evalCommand).toBe('harnessly eval task-1');
    expect(payload.nextStep).toBe('delegate_to_evaluator_or_run_eval');
    expect(events).toContain('"type":"host.completion_gate_blocked"');
    // v2 字段已移除
    expect(events).not.toContain('"evaluatorAgent"');
  });

  it('should escalate nextStep on repeated gate blocks for the same task', async () => {
    const workDir = await createTempDir();
    tempDirs.push(workDir);
    process.chdir(workDir);

    await captureStdout(() => runInit({ host: 'codex' }));
    await mkdir(path.join(workDir, '.harness', 'tasks', 'task-1'), { recursive: true });
    await writeFile(path.join(workDir, '.harness', 'active-task.txt'), 'task-1', 'utf8');

    // 第一次 block (写入 gate_blocked 事件)
    await captureStdout(() => runHostCompletionGate({ message: '已完成' }, []));

    // 第二次 block (检测到历史 block，应升级)
    const output = await captureStdout(() =>
      runHostCompletionGate({ message: '完成了' }, []),
    );
    const payload = JSON.parse(output) as {
      pass: boolean;
      reason: string;
      blockCount: number;
      requiresEvaluator: boolean;
      nextStep: string;
    };

    expect(payload.pass).toBe(false);
    expect(payload.reason).toBe('report_not_ready');
    expect(payload.blockCount).toBe(2);
    expect(payload.requiresEvaluator).toBe(true);
    expect(payload.nextStep).toBe('must_run_eval');
  });

  it('should route recommendedAgent by lastFailureStage (test → harness-tester)', async () => {
    const workDir = await createTempDir();
    tempDirs.push(workDir);
    process.chdir(workDir);

    await captureStdout(() => runInit({ host: 'codex' }));

    // active task 上次在 test 阶段失败
    const taskDir = path.join(workDir, '.harness', 'tasks', 'task-1');
    await mkdir(taskDir, { recursive: true });
    await writeFile(
      path.join(taskDir, 'task.json'),
      JSON.stringify({ taskId: 'task-1', goal: '验证回归' }),
      'utf8',
    );
    await writeFile(
      path.join(taskDir, 'state.json'),
      JSON.stringify({
        taskId: 'task-1',
        status: 'failed',
        currentStage: 'test',
        createdAt: '2026-04-20T00:00:00.000Z',
        updatedAt: '2026-04-20T00:00:00.000Z',
        completedStages: ['spec', 'design', 'execute', 'review'],
        retryCount: 1,
        lastFailureStage: 'test',
        lastFailureReason: 'lint failed',
      }),
      'utf8',
    );
    await writeFile(path.join(workDir, '.harness', 'active-task.txt'), 'task-1', 'utf8');

    const output = await captureStdout(() =>
      runHostCompletionGate({ message: '已完成' }, []),
    );
    const payload = JSON.parse(output) as {
      pass: boolean;
      recommendedAgent: string | null;
      activeStage: string;
      lastFailureStage: string;
    };

    expect(payload.pass).toBe(false);
    // v3-core：按 lastFailureStage=test 路由
    expect(payload.recommendedAgent).toBe('harness-tester');
    expect(payload.activeStage).toBe('test');
    expect(payload.lastFailureStage).toBe('test');
  });

  it('should fall back to a v3-core fallback role when no stage info is available', async () => {
    const workDir = await createTempDir();
    tempDirs.push(workDir);
    process.chdir(workDir);

    await captureStdout(() => runInit({ host: 'codex' }));
    // 不写 task.json / state.json：TaskManager.load 会报错，stage 取不到
    await mkdir(path.join(workDir, '.harness', 'tasks', 'task-1'), { recursive: true });
    await writeFile(path.join(workDir, '.harness', 'active-task.txt'), 'task-1', 'utf8');

    const output = await captureStdout(() =>
      runHostCompletionGate({ message: '已完成' }, []),
    );
    const payload = JSON.parse(output) as {
      pass: boolean;
      recommendedAgent: string | null;
      activeStage: string | null;
      lastFailureStage: string | null;
    };

    expect(payload.pass).toBe(false);
    // 默认 reviewer/tester 都启用，fallback 优先 reviewer
    expect(payload.recommendedAgent).toBe('harness-reviewer');
    expect(payload.activeStage).toBeNull();
    expect(payload.lastFailureStage).toBeNull();
  });

  it('should block on scope violation regardless of completion claim', async () => {
    const workDir = await createTempDir();
    tempDirs.push(workDir);
    process.chdir(workDir);

    await captureStdout(() => runInit({ host: 'codex' }));

    // SPEC §11: scope.exclude 是 deny-list；改了命中 exclude 的文件 → 拦截
    await mkdir(path.join(workDir, '.harness', 'tasks', 'task-1'), { recursive: true });
    await writeFile(
      path.join(workDir, '.harness', 'tasks', 'task-1', 'contract.yaml'),
      [
        'goal: test scope gate',
        'template_name: bug-fix',
        'risk_level: low',
        'scope_include: src/',
        'scope_exclude: dist/',
        'acceptance_criteria: test passes',
        'out_of_scope: refactor',
      ].join('\n'),
      'utf8',
    );
    await writeFile(path.join(workDir, '.harness', 'active-task.txt'), 'task-1', 'utf8');

    // 模拟 git diff 返回命中 scope.exclude 的文件（违反 deny-list）
    collectChangedFilesMock.mockImplementation(() => Promise.resolve(['dist/output.js']));

    const output = await captureStdout(() =>
      runHostCompletionGate({ message: '已完成' }, []),
    );
    const payload = JSON.parse(output) as {
      pass: boolean;
      reason: string;
      activeTaskId: string;
      scopeCheck: { name: string; status: string; detail: string };
      recommendedAgent: string | null;
      nextStep: string;
    };

    // 验证 mock 被调用
    expect(collectChangedFilesMock).toHaveBeenCalled();
    expect(payload.scopeCheck.status).toBe('failed');
    expect(payload.pass).toBe(false);
    expect(payload.reason).toBe('scope_violation');
    expect(payload.activeTaskId).toBe('task-1');
    expect(payload.scopeCheck.detail).toContain('dist/output.js');
    expect(payload.scopeCheck.detail).toContain('dist/');
    // v3-core: scope 违规阶段 fallback 推荐 reviewer
    expect(payload.recommendedAgent).toBe('harness-reviewer');
    expect(payload.nextStep).toBe('fix_scope_violation_then_rerun');

    const events = await readFile(path.join(workDir, '.harness', 'events.jsonl'), 'utf8');
    expect(events).toContain('"reason":"scope_violation"');
  });
});
