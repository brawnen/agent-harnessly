import { readdir, readFile, rm, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { runInit } from '../init';
import { runHostUserPromptSubmit } from './user-prompt-submit';

async function createTempDir(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), 'harnessly-host-user-prompt-'));
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

const CODEX_TITLE_PROMPT = [
  'You are a helpful assistant. You will be presented with a user prompt, and your job is to provide a short title for a task that will be created from that prompt.',
  'Generate a concise UI title (up to 36 characters) for this task.',
  'User prompt:',
  '修复自动生成任务',
].join('\n');

describe('host user-prompt-submit command', () => {
  const tempDirs: string[] = [];
  const originalCwd = process.cwd();

  afterEach(async () => {
    process.chdir(originalCwd);
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it('should ignore Codex internal title prompts instead of creating a task', async () => {
    const workDir = await createTempDir();
    tempDirs.push(workDir);
    process.chdir(workDir);

    await captureStdout(() => runInit({ host: 'codex' }));
    const output = await captureStdout(() =>
      runHostUserPromptSubmit({ prompt: CODEX_TITLE_PROMPT }, []),
    );
    const payload = JSON.parse(output) as {
      action: string;
      taskCreated: boolean;
      reason: string;
      taskKind: string;
    };
    const tasks = await readdir(path.join(workDir, '.harness', 'tasks'));
    const activeTask = await readFile(path.join(workDir, '.harness', 'active-task.txt'), 'utf8');

    expect(payload.action).toBe('chat');
    expect(payload.taskCreated).toBe(false);
    expect(payload.reason).toBe('host_internal_prompt');
    expect(payload.taskKind).toBe('host_internal');
    expect(tasks).toEqual([]);
    expect(activeTask).toBe('');
  });

  it('should bypass Harnessly for question-only prompts', async () => {
    const workDir = await createTempDir();
    tempDirs.push(workDir);
    process.chdir(workDir);

    await captureStdout(() => runInit({ host: 'codex' }));
    const output = await captureStdout(() =>
      runHostUserPromptSubmit({ prompt: '如何验证 sub agent 有没有启动？' }, []),
    );
    const payload = JSON.parse(output) as {
      action: string;
      taskCreated: boolean;
      reason: string;
      taskKind: string;
      nextStep: string;
    };
    const tasks = await readdir(path.join(workDir, '.harness', 'tasks'));
    const events = await readFile(path.join(workDir, '.harness', 'events.jsonl'), 'utf8');

    expect(payload.action).toBe('chat');
    expect(payload.taskCreated).toBe(false);
    expect(payload.reason).toBe('matched_question_intent');
    expect(payload.taskKind).toBe('question');
    expect(payload.nextStep).toBe('no_action');
    expect(tasks).toEqual([]);
    expect(events).toContain('"type":"host.intake_decision"');
    expect(events).toContain('"taskKind":"question"');
  });

  it('should delegate new tasks to planner by default instead of creating a task', async () => {
    const workDir = await createTempDir();
    tempDirs.push(workDir);
    process.chdir(workDir);

    await captureStdout(() => runInit({ host: 'codex' }));
    const output = await captureStdout(() =>
      runHostUserPromptSubmit({ prompt: '修复登录失败的问题' }, []),
    );
    const payload = JSON.parse(output) as {
      action: string;
      taskCreated: boolean;
      plannerAgent?: string;
      nextStep: string;
      fallbackCreateTaskWithoutPlanner: boolean;
      reason: string;
      taskKind: string;
      risk: string;
    };
    const tasks = await readdir(path.join(workDir, '.harness', 'tasks'));
    const activeTask = await readFile(path.join(workDir, '.harness', 'active-task.txt'), 'utf8');

    expect(payload.action).toBe('delegate_to_planner');
    expect(payload.taskCreated).toBe(false);
    expect(payload.plannerAgent).toBe('harness-planner');
    expect(payload.nextStep).toBe('delegate_to_planner');
    expect(payload.fallbackCreateTaskWithoutPlanner).toBe(false);
    expect(payload.reason).toBe('matched_change_intent');
    expect(payload.taskKind).toBe('bug_fix');
    expect(payload.risk).toBe('low');
    expect(tasks).toEqual([]);
    expect(activeTask).toBe('');
  });

  it('should resume the active task for continuation prompts', async () => {
    const workDir = await createTempDir();
    tempDirs.push(workDir);
    process.chdir(workDir);

    await captureStdout(() => runInit({ host: 'codex' }));
    await writeFile(path.join(workDir, '.harness', 'active-task.txt'), 'task-1', 'utf8');
    const output = await captureStdout(() =>
      runHostUserPromptSubmit({ prompt: '继续当前任务' }, []),
    );
    const payload = JSON.parse(output) as {
      action: string;
      activeTaskId: string;
      reason: string;
      taskKind: string;
      nextStep: string;
    };

    expect(payload.action).toBe('resume_task');
    expect(payload.activeTaskId).toBe('task-1');
    expect(payload.reason).toBe('resume_active_task');
    expect(payload.taskKind).toBe('resume');
    expect(payload.nextStep).toBe('resume_existing_task');
  });

  it('should create a task when planner fallback is explicitly enabled', async () => {
    const workDir = await createTempDir();
    tempDirs.push(workDir);
    process.chdir(workDir);

    await captureStdout(() => runInit({ host: 'codex' }));
    const configPath = path.join(workDir, '.harness', 'harness.config.yaml');
    const config = await readFile(configPath, 'utf8');
    await writeFile(
      configPath,
      config.replace(
        'fallback_create_task_without_planner: false',
        'fallback_create_task_without_planner: true',
      ),
      'utf8',
    );

    const output = await captureStdout(() =>
      runHostUserPromptSubmit({ prompt: '修复登录失败的问题' }, []),
    );
    const payload = JSON.parse(output) as {
      action: string;
      taskCreated: boolean;
      taskId: string;
      contractPath: string;
      planPath: string;
      taskKind: string;
    };
    const tasks = await readdir(path.join(workDir, '.harness', 'tasks'));
    const activeTask = await readFile(path.join(workDir, '.harness', 'active-task.txt'), 'utf8');

    expect(payload.action).toBe('create_task');
    expect(payload.taskCreated).toBe(true);
    expect(payload.taskKind).toBe('bug_fix');
    expect(payload.contractPath).toContain(payload.taskId);
    expect(payload.planPath).toContain(payload.taskId);
    expect(tasks).toEqual([payload.taskId]);
    expect(activeTask.trim()).toBe(payload.taskId);
  });
});
