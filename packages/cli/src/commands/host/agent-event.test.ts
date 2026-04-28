import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { runInit } from '../init';
import { runHostAgentEvent } from './agent-event';

async function createTempDir(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), 'harnessly-host-agent-event-'));
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

describe('host agent-event command', () => {
  const tempDirs: string[] = [];
  const originalCwd = process.cwd();

  afterEach(async () => {
    process.chdir(originalCwd);
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it('should record sub-agent startup events with active task context', async () => {
    const workDir = await createTempDir();
    tempDirs.push(workDir);
    process.chdir(workDir);

    await captureStdout(() => runInit({ host: 'codex' }));
    await writeFile(path.join(workDir, '.harness', 'active-task.txt'), 'task-1', 'utf8');

    const output = await captureStdout(() =>
      runHostAgentEvent(
        {
          agent: 'harness-planner',
          event: 'started',
          model: 'gpt-5.4-mini',
        },
        [],
      ),
    );
    const payload = JSON.parse(output) as {
      recorded: boolean;
      type: string;
      agent: string;
      taskId: string;
      model: string;
    };
    const events = await readFile(path.join(workDir, '.harness', 'events.jsonl'), 'utf8');

    expect(payload.recorded).toBe(true);
    expect(payload.type).toBe('subagent.started');
    expect(payload.agent).toBe('harness-planner');
    expect(payload.taskId).toBe('task-1');
    expect(payload.model).toBe('gpt-5.4-mini');
    expect(events).toContain('"type":"subagent.started"');
    expect(events).toContain('"agent":"harness-planner"');
  });
});
