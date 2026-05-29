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
          currentStage: 'design',
          createdAt: now,
          updatedAt: now,
          completedStages: ['spec'],
          retryCount: 2,
          lastFailureStage: 'test',
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
        currentStage: 'design',
        currentOwner: 'designer',
        retryCount: 2,
        lastFailureStage: 'test',
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

  it('v2.1: should auto-migrate v2.0 state.json on load (fill default lite preset)', async () => {
    // 准备 v2.0 风格的 state.json（缺 preset / presetSource / presetSetAt 三字段）
    const workDir = await createTempDir();
    tempDirs.push(workDir);
    const taskDir = path.join(workDir, '.harness', 'tasks', 'task-legacy');
    const now = '2026-04-20T00:00:00.000Z';

    await mkdir(taskDir, { recursive: true });
    await writeFile(
      path.join(taskDir, 'task.json'),
      `${JSON.stringify({ taskId: 'task-legacy', goal: '老任务' }, null, 2)}\n`,
      'utf8',
    );
    await writeFile(
      path.join(taskDir, 'state.json'),
      `${JSON.stringify(
        {
          taskId: 'task-legacy',
          status: 'active',
          currentStage: 'execute',
          currentOwner: 'developer',
          createdAt: now,
          updatedAt: now,
          completedStages: ['spec'],
          retryCount: 0,
        },
        null,
        2,
      )}\n`,
      'utf8',
    );
    // 没有 harness.config.yaml；scaffold.loadHarnessConfig 应能兜底返回默认
    // 但 load 需要 config，所以先建一个最小 config
    await mkdir(path.join(workDir, '.harness'), { recursive: true });
    await writeFile(
      path.join(workDir, '.harness', 'harness.config.yaml'),
      [
        'version: 1',
        'project_type: unknown',
        'required_checks: build',
        'default_host: claude-code',
        'enabled_hosts: claude-code',
        'install_repo_local_shells: false',
        'source_of_truth_dir: .harness/hosts',
        'fallback_create_task_without_planner: false',
        'codex_user_prompt_submit_hook_enabled: true',
        'adapter_kind: claude-code',
        'adapter_command: ',
      ].join('\n'),
      'utf8',
    );

    const manager = new TaskManager();
    const ctx = await manager.load('task-legacy', workDir);

    // 验证三个新字段被自动填充
    expect(ctx.state.preset).toBe('lite');
    expect(ctx.state.presetSource).toBe('slash_command');
    expect(ctx.state.presetSetAt).toBe(now); // 迁移时取 createdAt
  });

  it('v2.1: create should accept preset option and persist it', async () => {
    const workDir = await createTempDir();
    tempDirs.push(workDir);
    await mkdir(path.join(workDir, '.harness'), { recursive: true });
    await writeFile(
      path.join(workDir, '.harness', 'harness.config.yaml'),
      [
        'version: 1',
        'project_type: unknown',
        'required_checks: build',
        'default_host: claude-code',
        'enabled_hosts: claude-code',
        'install_repo_local_shells: false',
        'source_of_truth_dir: .harness/hosts',
        'fallback_create_task_without_planner: false',
        'codex_user_prompt_submit_hook_enabled: true',
        'adapter_kind: claude-code',
        'adapter_command: ',
      ].join('\n'),
      'utf8',
    );

    const manager = new TaskManager();
    // 默认应为 lite
    const liteCtx = await manager.create('lite 任务', workDir);
    expect(liteCtx.state.preset).toBe('lite');
    expect(liteCtx.state.presetSource).toBe('slash_command');

    // 显式 full + prompt_marker
    const fullCtx = await manager.create('full 任务', workDir, {
      preset: 'full',
      presetSource: 'prompt_marker',
    });
    expect(fullCtx.state.preset).toBe('full');
    expect(fullCtx.state.presetSource).toBe('prompt_marker');
  });
});
