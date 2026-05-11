import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { runInit } from '../init';
import { runIntake } from '../intake';
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

  it('should treat unknown or mechanism questions as chat instead of defaulting to new task', async () => {
    const workDir = await createTempDir();
    tempDirs.push(workDir);
    process.chdir(workDir);

    await captureStdout(() => runInit({ host: 'codex' }));
    const output = await captureStdout(() =>
      runHostUserPromptSubmit({ prompt: '现在 intake classifier 依据什么来判断是否是新任务呢' }, []),
    );
    const payload = JSON.parse(output) as {
      action: string;
      taskCreated: boolean;
      reason: string;
      taskKind: string;
      confidence: number;
    };
    const tasks = await readdir(path.join(workDir, '.harness', 'tasks'));

    expect(payload.action).toBe('chat');
    expect(payload.taskCreated).toBe(false);
    expect(payload.reason).toBe('ambiguous_intent');
    expect(payload.taskKind).toBe('question');
    expect(payload.confidence).toBeLessThan(0.7);
    expect(tasks).toEqual([]);
  });

  it('should delegate new tasks to v3-core requirement role by default', async () => {
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
      recommendedAgent?: string | null;
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
    // v3-core: init 默认启用 requirement → 推荐路由到 requirement
    expect(payload.recommendedAgent).toBe('harness-requirement');
    expect(payload.nextStep).toBe('delegate_to_planner');
    expect(payload.fallbackCreateTaskWithoutPlanner).toBe(false);
    expect(payload.reason).toBe('matched_change_intent');
    expect(payload.taskKind).toBe('bug_fix');
    expect(payload.risk).toBe('low');
    expect(tasks).toEqual([]);
    expect(activeTask).toBe('');
  });

  it('returns null recommendedAgent when requirement role is disabled (no v2 alias fallback)', async () => {
    const workDir = await createTempDir();
    tempDirs.push(workDir);
    process.chdir(workDir);

    await captureStdout(() => runInit({ host: 'codex' }));

    // 关闭 requirement role
    const reqYaml = path.join(workDir, '.harness', 'agents', 'requirement.yaml');
    const text = await readFile(reqYaml, 'utf8');
    await writeFile(reqYaml, text.replace('enabled: true', 'enabled: false'), 'utf8');

    const output = await captureStdout(() =>
      runHostUserPromptSubmit({ prompt: '修复登录失败的问题' }, []),
    );
    const payload = JSON.parse(output) as {
      action: string;
      recommendedAgent?: string | null;
    };

    expect(payload.action).toBe('delegate_to_planner');
    // v3-core 不再回退到 'harness-planner' 复合别名
    expect(payload.recommendedAgent).toBeNull();
  });

  it('should route resume_task by current stage (design → harness-designer)', async () => {
    const workDir = await createTempDir();
    tempDirs.push(workDir);
    process.chdir(workDir);

    await captureStdout(() => runInit({ host: 'codex' }));

    // 构造一个 stage=design 的 active task
    const taskDir = path.join(workDir, '.harness', 'tasks', 'task-1');
    await mkdir(taskDir, { recursive: true });
    await writeFile(
      path.join(taskDir, 'task.json'),
      JSON.stringify({ taskId: 'task-1', goal: '设计阶段' }),
      'utf8',
    );
    await writeFile(
      path.join(taskDir, 'state.json'),
      JSON.stringify({
        taskId: 'task-1',
        status: 'ready',
        currentStage: 'design',
        createdAt: '2026-04-20T00:00:00.000Z',
        updatedAt: '2026-04-20T00:00:00.000Z',
        completedStages: ['spec'],
        retryCount: 0,
      }),
      'utf8',
    );
    await writeFile(path.join(workDir, '.harness', 'active-task.txt'), 'task-1', 'utf8');

    const output = await captureStdout(() =>
      runHostUserPromptSubmit({ prompt: '继续当前任务' }, []),
    );
    const payload = JSON.parse(output) as {
      action: string;
      activeStage: string;
      recommendedAgent: string | null;
    };

    expect(payload.action).toBe('resume_task');
    expect(payload.activeStage).toBe('design');
    expect(payload.recommendedAgent).toBe('harness-designer');
  });

  it('should return null recommendedAgent for resume_task at execute stage', async () => {
    const workDir = await createTempDir();
    tempDirs.push(workDir);
    process.chdir(workDir);

    await captureStdout(() => runInit({ host: 'codex' }));

    const taskDir = path.join(workDir, '.harness', 'tasks', 'task-1');
    await mkdir(taskDir, { recursive: true });
    await writeFile(
      path.join(taskDir, 'task.json'),
      JSON.stringify({ taskId: 'task-1', goal: '执行阶段' }),
      'utf8',
    );
    await writeFile(
      path.join(taskDir, 'state.json'),
      JSON.stringify({
        taskId: 'task-1',
        status: 'executing',
        currentStage: 'execute',
        createdAt: '2026-04-20T00:00:00.000Z',
        updatedAt: '2026-04-20T00:00:00.000Z',
        completedStages: ['spec', 'design'],
        retryCount: 0,
      }),
      'utf8',
    );
    await writeFile(path.join(workDir, '.harness', 'active-task.txt'), 'task-1', 'utf8');

    const output = await captureStdout(() =>
      runHostUserPromptSubmit({ prompt: '继续当前任务' }, []),
    );
    const payload = JSON.parse(output) as {
      action: string;
      activeStage: string;
      recommendedAgent: string | null;
    };

    expect(payload.action).toBe('resume_task');
    expect(payload.activeStage).toBe('execute');
    // execute 阶段由主 agent 担任 → 不推荐 sub-agent
    expect(payload.recommendedAgent).toBeNull();
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

  it('should auto-fallback to create_task after a failed planner delegation', async () => {
    const workDir = await createTempDir();
    tempDirs.push(workDir);
    process.chdir(workDir);

    await captureStdout(() => runInit({ host: 'codex' }));

    // 第一次：正常 delegate_to_planner
    const output1 = await captureStdout(() =>
      runHostUserPromptSubmit({ prompt: '修复登录页样式' }, []),
    );
    const payload1 = JSON.parse(output1) as {
      action: string;
      taskCreated: boolean;
      recommendedAgent?: string | null;
      nextStep: string;
      autoFallback: boolean;
    };

    expect(payload1.action).toBe('delegate_to_planner');
    expect(payload1.taskCreated).toBe(false);
    // v3-core: 默认 requirement 启用，推荐 harness-requirement
    expect(payload1.recommendedAgent).toBe('harness-requirement');
    expect(payload1.autoFallback).toBe(false);

    // 第二次：Planner 未生效 → 自动降级为 create_task
    const output2 = await captureStdout(() =>
      runHostUserPromptSubmit({ prompt: '修复登录页样式' }, []),
    );
    const payload2 = JSON.parse(output2) as {
      action: string;
      taskCreated: boolean;
      taskId: string;
      contractPath: string;
      planPath: string;
      autoFallback: boolean;
    };

    expect(payload2.action).toBe('create_task');
    expect(payload2.taskCreated).toBe(true);
    expect(payload2.autoFallback).toBe(true);

    // 验证降级后 pending file 已清理
    const tasks = await readdir(path.join(workDir, '.harness', 'tasks'));
    expect(tasks).toEqual([payload2.taskId]);
  });

  it('should learn exact manual feedback from the last intake decision', async () => {
    const workDir = await createTempDir();
    tempDirs.push(workDir);
    process.chdir(workDir);

    await captureStdout(() => runInit({ host: 'codex' }));

    const prompt = '优化 hook 配置的判断依据';
    const firstOutput = await captureStdout(() =>
      runHostUserPromptSubmit({ prompt }, []),
    );
    const first = JSON.parse(firstOutput) as {
      action: string;
      reason: string;
    };
    expect(first.action).toBe('delegate_to_planner');
    expect(first.reason).toBe('matched_change_intent');

    await captureStdout(() =>
      runIntake(
        { last: true, actual: 'chat', reason: 'question_about_harnessly_mechanism' },
        ['feedback', 'add'],
      ),
    );

    const secondOutput = await captureStdout(() =>
      runHostUserPromptSubmit({ prompt }, []),
    );
    const second = JSON.parse(secondOutput) as {
      action: string;
      taskCreated: boolean;
      reason: string;
      learnedFrom: string[];
    };
    const feedbackText = await readFile(path.join(workDir, '.harness', 'intake-feedback.jsonl'), 'utf8');
    const tasks = await readdir(path.join(workDir, '.harness', 'tasks'));

    expect(second.action).toBe('chat');
    expect(second.taskCreated).toBe(false);
    expect(second.reason).toBe('learned_exact_feedback');
    expect(second.learnedFrom.length).toBe(1);
    expect(feedbackText).toContain('question_about_harnessly_mechanism');
    expect(tasks).toEqual([]);
  });

  it('should not fallback for resume prompts even after a failed delegation', async () => {
    const workDir = await createTempDir();
    tempDirs.push(workDir);
    process.chdir(workDir);

    await captureStdout(() => runInit({ host: 'codex' }));

    // 第一次：delegate_to_planner
    await captureStdout(() =>
      runHostUserPromptSubmit({ prompt: '修复登录页样式' }, []),
    );

    // 设置 active task 模拟 Planner 在后台创建了 task
    await writeFile(path.join(workDir, '.harness', 'active-task.txt'), 'task-1', 'utf8');

    // 第二次：resume 提示词 → 不应降级
    const output = await captureStdout(() =>
      runHostUserPromptSubmit({ prompt: '继续修改' }, []),
    );
    const payload = JSON.parse(output) as {
      action: string;
      taskCreated: boolean;
      nextStep: string;
    };

    expect(payload.action).toBe('resume_task');
    expect(payload.taskCreated).toBe(false);
  });
});
