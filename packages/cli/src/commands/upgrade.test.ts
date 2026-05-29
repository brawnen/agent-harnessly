import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { runInit } from './init';
import { runUpgrade } from './upgrade';

async function createTempDir(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), 'harnessly-upgrade-test-'));
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

async function captureStderr(run: () => Promise<void>): Promise<string> {
  const chunks: string[] = [];
  const spy = vi
    .spyOn(process.stderr, 'write')
    .mockImplementation(((chunk: string | Uint8Array) => {
      chunks.push(normalizeChunk(chunk));
      return true;
    }) as typeof process.stderr.write);
  try {
    await run();
  } finally {
    spy.mockRestore();
  }
  return chunks.join('');
  // 注意：不在此 finally 里还原 process.exitCode，由 afterEach 统一 reset，
  // 保证调用方能在 await 之后立即读到 runUpgrade 设置的 exitCode
}

async function writeLiteActiveTask(workDir: string, taskId: string): Promise<void> {
  const taskDir = path.join(workDir, '.harness', 'tasks', taskId);
  const now = '2026-05-27T00:00:00.000Z';
  await mkdir(taskDir, { recursive: true });
  await writeFile(
    path.join(taskDir, 'task.json'),
    JSON.stringify({ taskId, goal: '修一个 bug' }),
    'utf8',
  );
  await writeFile(
    path.join(taskDir, 'state.json'),
    JSON.stringify({
      taskId,
      status: 'active',
      currentStage: 'execute',
      currentOwner: 'developer',
      createdAt: now,
      updatedAt: now,
      completedStages: ['spec'],
      retryCount: 0,
      preset: 'lite',
      presetSource: 'slash_command',
      presetSetAt: now,
    }),
    'utf8',
  );
  await writeFile(path.join(workDir, '.harness', 'active-task.txt'), taskId, 'utf8');
}

describe('runUpgrade', () => {
  const tempDirs: string[] = [];
  const originalCwd = process.cwd();

  afterEach(async () => {
    process.chdir(originalCwd);
    process.exitCode = undefined;
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it('should upgrade lite active task to full + currentStage=design + write event', async () => {
    const workDir = await createTempDir();
    tempDirs.push(workDir);
    process.chdir(workDir);

    await captureStdout(() => runInit({ host: 'codex' }));
    await writeLiteActiveTask(workDir, 'task-up-1');

    const output = await captureStdout(() => runUpgrade({}));
    const payload = JSON.parse(output) as {
      action: string;
      taskId: string;
      from: string;
      to: string;
      currentStage: string;
      currentOwner: string;
      nextStep: string;
    };

    expect(payload.action).toBe('upgraded');
    expect(payload.taskId).toBe('task-up-1');
    expect(payload.from).toBe('lite');
    expect(payload.to).toBe('full');
    expect(payload.currentStage).toBe('design');
    expect(payload.currentOwner).toBe('designer');
    expect(payload.nextStep).toBe('spawn_harness_designer_or_run_eval');

    // 验证 state.json 真被写入
    const state = JSON.parse(
      await readFile(path.join(workDir, '.harness', 'tasks', 'task-up-1', 'state.json'), 'utf8'),
    ) as Record<string, unknown>;
    expect(state.preset).toBe('full');
    expect(state.presetSource).toBe('upgrade');
    expect(state.currentStage).toBe('design');
    expect(state.currentOwner).toBe('designer');

    // 验证 events.jsonl 含升档事件
    const events = await readFile(path.join(workDir, '.harness', 'events.jsonl'), 'utf8');
    expect(events).toContain('"type":"task.preset_upgraded"');
    expect(events).toContain('"from":"lite"');
    expect(events).toContain('"to":"full"');
  });

  it('should refuse upgrading full task (SPEC §6.4.5 仅可一次)', async () => {
    const workDir = await createTempDir();
    tempDirs.push(workDir);
    process.chdir(workDir);

    await captureStdout(() => runInit({ host: 'codex' }));
    const taskId = 'task-full-1';
    const taskDir = path.join(workDir, '.harness', 'tasks', taskId);
    const now = '2026-05-27T00:00:00.000Z';
    await mkdir(taskDir, { recursive: true });
    await writeFile(
      path.join(taskDir, 'task.json'),
      JSON.stringify({ taskId, goal: '已是 full' }),
      'utf8',
    );
    await writeFile(
      path.join(taskDir, 'state.json'),
      JSON.stringify({
        taskId,
        status: 'active',
        currentStage: 'design',
        currentOwner: 'designer',
        createdAt: now,
        updatedAt: now,
        completedStages: ['spec'],
        retryCount: 0,
        preset: 'full',
        presetSource: 'prompt_marker',
        presetSetAt: now,
      }),
      'utf8',
    );
    await writeFile(path.join(workDir, '.harness', 'active-task.txt'), taskId, 'utf8');

    const stderr = await captureStderr(() => runUpgrade({}));
    expect(stderr).toContain('不允许重复升档');
    expect(stderr).toContain(taskId);
    expect(process.exitCode).toBe(1);
  });

  it('should refuse upgrading non-active task', async () => {
    const workDir = await createTempDir();
    tempDirs.push(workDir);
    process.chdir(workDir);

    await captureStdout(() => runInit({ host: 'codex' }));
    const taskId = 'task-done-1';
    const taskDir = path.join(workDir, '.harness', 'tasks', taskId);
    const now = '2026-05-27T00:00:00.000Z';
    await mkdir(taskDir, { recursive: true });
    await writeFile(
      path.join(taskDir, 'task.json'),
      JSON.stringify({ taskId, goal: '已关闭' }),
      'utf8',
    );
    await writeFile(
      path.join(taskDir, 'state.json'),
      JSON.stringify({
        taskId,
        status: 'completed',
        currentStage: 'test',
        currentOwner: 'tester',
        createdAt: now,
        updatedAt: now,
        completedStages: ['spec', 'execute', 'test'],
        retryCount: 0,
        preset: 'lite',
        presetSource: 'slash_command',
        presetSetAt: now,
      }),
      'utf8',
    );
    await writeFile(path.join(workDir, '.harness', 'active-task.txt'), taskId, 'utf8');

    const stderr = await captureStderr(() => runUpgrade({}));
    expect(stderr).toContain('completed');
    expect(stderr).toContain('只有 active 任务可升档');
    expect(process.exitCode).toBe(1);
  });

  it('should refuse when no active task and no --task-id given', async () => {
    const workDir = await createTempDir();
    tempDirs.push(workDir);
    process.chdir(workDir);

    await captureStdout(() => runInit({ host: 'codex' }));

    const stderr = await captureStderr(() => runUpgrade({}));
    expect(stderr).toContain('没有 active task');
    expect(process.exitCode).toBe(1);
  });
});
