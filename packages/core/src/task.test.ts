import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { TaskManager } from './task';

async function createTempDir(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), 'harnessly-core-test-'));
}

describe('TaskManager', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(
      tempDirs.splice(0).map(async (dir) => {
        await import('node:fs/promises').then(({ rm }) => rm(dir, { recursive: true, force: true }));
      }),
    );
  });

  it('should return empty summaries when tasks dir is missing', async () => {
    const workDir = await createTempDir();
    tempDirs.push(workDir);
    const manager = new TaskManager();

    await expect(manager.listTasks(workDir)).resolves.toEqual([]);
  });

  it('should include stage and retry count in task summaries', async () => {
    const workDir = await createTempDir();
    tempDirs.push(workDir);
    const taskDir = path.join(workDir, '.harness', 'tasks', 'task-1');
    const now = '2026-04-20T00:00:00.000Z';

    await mkdir(taskDir, { recursive: true });
    await writeFile(
      path.join(taskDir, 'task.json'),
      `${JSON.stringify({ taskId: 'task-1', goal: '补状态命令' }, null, 2)}\n`,
      'utf8',
    );
    await writeFile(
      path.join(taskDir, 'state.json'),
      `${JSON.stringify(
        {
          taskId: 'task-1',
          status: 'ready',
          currentStage: 'plan',
          createdAt: now,
          updatedAt: now,
          completedStages: ['contract'],
          retryCount: 2,
          lastFailureStage: 'verify',
        },
        null,
        2,
      )}\n`,
      'utf8',
    );

    const manager = new TaskManager();
    await expect(manager.listTasks(workDir)).resolves.toEqual([
      {
        taskId: 'task-1',
        goal: '补状态命令',
        status: 'ready',
        currentStage: 'plan',
        retryCount: 2,
        lastFailureStage: 'verify',
        updatedAt: now,
      },
    ]);
  });

  it('should throw a friendly message when task does not exist', async () => {
    const workDir = await createTempDir();
    tempDirs.push(workDir);
    const manager = new TaskManager();

    await expect(manager.load('missing-task', workDir)).rejects.toThrow(
      'task missing-task 不存在。可先执行 harnessly list 查看已有任务。',
    );
  });
});
