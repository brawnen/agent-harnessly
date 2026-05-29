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
    };
    const tasks = await readdir(path.join(workDir, '.harness', 'tasks'));
    const activeTask = await readFile(path.join(workDir, '.harness', 'active-task.txt'), 'utf8');

    expect(payload.action).toBe('chat');
    expect(payload.taskCreated).toBe(false);
    expect(payload.reason).toBe('host_internal_prompt');
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
      nextStep: string;
      preset: string;
    };
    const tasks = await readdir(path.join(workDir, '.harness', 'tasks'));
    const events = await readFile(path.join(workDir, '.harness', 'events.jsonl'), 'utf8');

    expect(payload.action).toBe('chat');
    expect(payload.taskCreated).toBe(false);
    expect(payload.reason).toBe('question_intent');
    expect(payload.nextStep).toBe('no_action');
    expect(payload.preset).toBe('lite');
    expect(tasks).toEqual([]);
    expect(events).toContain('"type":"host.intake_decision"');
    expect(events).toContain('"reason":"question_intent"');
  });

  it('should treat unknown or mechanism questions as chat (matched by 依据什么 hint)', async () => {
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
    };
    const tasks = await readdir(path.join(workDir, '.harness', 'tasks'));

    expect(payload.action).toBe('chat');
    expect(payload.taskCreated).toBe(false);
    // v2.1: 不再做模糊度判定，含元问句词（依据什么/为什么/?...）即识别为 question_intent
    expect(payload.reason).toBe('question_intent');
    expect(tasks).toEqual([]);
  });

  it('should delegate new tasks under default lite preset (no sub-agent recommended)', async () => {
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
      preset: string;
      presetSource: string;
    };
    const tasks = await readdir(path.join(workDir, '.harness', 'tasks'));
    const activeTask = await readFile(path.join(workDir, '.harness', 'active-task.txt'), 'utf8');

    expect(payload.action).toBe('delegate_to_planner');
    expect(payload.taskCreated).toBe(false);
    // v2.1: lite preset (默认) 由主 agent 直接承担三阶段，不推荐 sub-agent
    expect(payload.recommendedAgent).toBeNull();
    expect(payload.nextStep).toBe('delegate_to_planner');
    expect(payload.fallbackCreateTaskWithoutPlanner).toBe(false);
    expect(payload.reason).toBe('change_intent');
    expect(payload.preset).toBe('lite');
    expect(payload.presetSource).toBe('slash_command');
    expect(tasks).toEqual([]);
    expect(activeTask).toBe('');
  });

  it('v2.1 bug A fix: create_task strips [harness:feat] marker from goal', async () => {
    // marker 是 preset 控制信号，不应污染 contract.goal / task.json goal
    const workDir = await createTempDir();
    tempDirs.push(workDir);
    process.chdir(workDir);

    await captureStdout(() => runInit({ host: 'codex' }));
    // 开启 fallback 让首次带 marker 的变更类 prompt 直接 create_task
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
      runHostUserPromptSubmit({ prompt: '[harness:feat] 接入支付模块' }, []),
    );
    const payload = JSON.parse(output) as {
      action: string;
      taskCreated: boolean;
      taskId: string;
      preset: string;
    };

    expect(payload.action).toBe('create_task');
    expect(payload.preset).toBe('full');

    // 关键断言：task.json 的 goal 不含 marker
    const meta = JSON.parse(
      await readFile(path.join(workDir, '.harness', 'tasks', payload.taskId, 'task.json'), 'utf8'),
    ) as { goal: string };
    expect(meta.goal).toBe('接入支付模块');
    expect(meta.goal).not.toContain('[harness:feat]');
  });

  it('v2.1 fix: [harness:feat] marker overrides active task — creates new full task, not resume_task', async () => {
    // SPEC §6.4.3: marker 是用户显式声明，优先级高于 active task 续接
    const workDir = await createTempDir();
    tempDirs.push(workDir);
    process.chdir(workDir);

    await captureStdout(() => runInit({ host: 'codex' }));
    // 设置 active task 模拟续接场景
    await mkdir(path.join(workDir, '.harness', 'tasks', 'task-active'), { recursive: true });
    await writeFile(
      path.join(workDir, '.harness', 'tasks', 'task-active', 'task.json'),
      JSON.stringify({ taskId: 'task-active', goal: '在做的旧任务' }),
      'utf8',
    );
    await writeFile(
      path.join(workDir, '.harness', 'tasks', 'task-active', 'state.json'),
      JSON.stringify({
        taskId: 'task-active',
        status: 'active',
        currentStage: 'execute',
        currentOwner: 'developer',
        createdAt: '2026-04-20T00:00:00.000Z',
        updatedAt: '2026-04-20T00:00:00.000Z',
        completedStages: ['spec'],
        retryCount: 0,
        preset: 'lite',
        presetSource: 'slash_command',
        presetSetAt: '2026-04-20T00:00:00.000Z',
      }),
      'utf8',
    );
    await writeFile(path.join(workDir, '.harness', 'active-task.txt'), 'task-active', 'utf8');

    const output = await captureStdout(() =>
      runHostUserPromptSubmit({ prompt: '[harness:feat] 接入支付' }, []),
    );
    const payload = JSON.parse(output) as {
      action: string;
      reason: string;
      preset: string;
      presetSource: string;
    };

    // 关键：不应走 resume_task，而是 delegate_to_planner / create_task
    expect(payload.action).toBe('delegate_to_planner');
    expect(payload.reason).toBe('explicit_new_task');
    expect(payload.preset).toBe('full');
    expect(payload.presetSource).toBe('prompt_marker');
  });

  it('v2.1: should recommend harness-requirement under full preset triggered by [harness:feat] marker', async () => {
    const workDir = await createTempDir();
    tempDirs.push(workDir);
    process.chdir(workDir);

    await captureStdout(() => runInit({ host: 'codex' }));
    const output = await captureStdout(() =>
      runHostUserPromptSubmit({ prompt: '[harness:feat] 接入 OAuth 2.0 登录' }, []),
    );
    const payload = JSON.parse(output) as {
      action: string;
      taskCreated: boolean;
      recommendedAgent?: string | null;
      reason: string;
      preset: string;
      presetSource: string;
    };

    expect(payload.action).toBe('delegate_to_planner');
    expect(payload.taskCreated).toBe(false);
    expect(payload.preset).toBe('full');
    expect(payload.presetSource).toBe('prompt_marker');
    // full preset：推荐 harness-requirement sub-agent 接管 spec 阶段
    expect(payload.recommendedAgent).toBe('harness-requirement');
    expect(payload.reason).toBe('change_intent');
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
    // designer 默认禁用，design 阶段由主 agent 自行处理
    expect(payload.recommendedAgent).toBeNull();
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
      nextStep: string;
    };

    expect(payload.action).toBe('resume_task');
    expect(payload.activeTaskId).toBe('task-1');
    expect(payload.reason).toBe('resume_active_task');
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
      preset: string;
    };
    const tasks = await readdir(path.join(workDir, '.harness', 'tasks'));
    const activeTask = await readFile(path.join(workDir, '.harness', 'active-task.txt'), 'utf8');

    expect(payload.action).toBe('create_task');
    expect(payload.taskCreated).toBe(true);
    expect(payload.preset).toBe('lite'); // 默认 preset
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
    // v2.1: lite preset (默认) 不推荐 sub-agent
    expect(payload1.recommendedAgent).toBeNull();
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

  // v2.1: 删除"intake feedback 学习"测试。该功能与 SPEC §6.4.3 "不得通过启发式手段
  // 自动升档/分流" 原则冲突，user-prompt-submit 不再调用 classifyByIntakeFeedback。
  // intake CLI 命令（harness intake feedback list|add|remove|clear）仍保留供用户独立查阅。

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
