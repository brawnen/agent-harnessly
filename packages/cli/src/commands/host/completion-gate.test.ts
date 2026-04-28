import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

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
    process.chdir(originalCwd);
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it('should block completion without report and ask for evaluator', async () => {
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
      evaluatorAgent: string;
      evalCommand: string;
      nextStep: string;
    };
    const events = await readFile(path.join(workDir, '.harness', 'events.jsonl'), 'utf8');

    expect(payload.pass).toBe(false);
    expect(payload.reason).toBe('report_not_ready');
    expect(payload.activeTaskId).toBe('task-1');
    expect(payload.evaluatorAgent).toBe('harness-evaluator');
    expect(payload.evalCommand).toBe('harnessly eval task-1');
    expect(payload.nextStep).toBe('delegate_to_evaluator_or_run_eval');
    expect(events).toContain('"type":"host.completion_gate_blocked"');
    expect(events).toContain('"evaluatorAgent":"harness-evaluator"');
  });
});
