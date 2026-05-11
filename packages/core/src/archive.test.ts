import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { archiveTaskArtifacts, getArchiveTargetPaths } from './archive';
import { ensureHarnessDirectories } from './scaffold';
import { TaskManager } from './task';

async function createTempDir(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), 'harnessly-archive-test-'));
}

async function seedTask(
  workDir: string,
  taskId: string,
  options: { contract?: string; plan?: string; report?: string } = {},
): Promise<void> {
  const taskDir = path.join(workDir, '.harness', 'tasks', taskId);
  await mkdir(taskDir, { recursive: true });
  await writeFile(
    path.join(taskDir, 'task.json'),
    JSON.stringify({ taskId, goal: '修复 list 输出' }),
    'utf8',
  );
  await writeFile(
    path.join(taskDir, 'state.json'),
    JSON.stringify({
      taskId,
      status: 'passed',
      currentStage: 'commit_gate',
      createdAt: '2026-04-20T00:00:00.000Z',
      updatedAt: '2026-04-20T01:00:00.000Z',
      completedStages: ['spec', 'design', 'execute', 'review', 'test', 'commit_gate'],
      retryCount: 0,
    }),
    'utf8',
  );

  if (options.contract !== undefined) {
    await writeFile(path.join(taskDir, 'contract.yaml'), options.contract, 'utf8');
  }
  if (options.plan !== undefined) {
    await writeFile(path.join(taskDir, 'plan.md'), options.plan, 'utf8');
  }
  if (options.report !== undefined) {
    await writeFile(path.join(taskDir, 'report.json'), options.report, 'utf8');
  }
}

const SAMPLE_CONTRACT = [
  'goal: 修复 list 输出',
  'template_name: bug-fix',
  'risk_level: low',
  'scope_include: packages/cli/src',
  'scope_exclude:',
  'acceptance_criteria: list 显示 stage',
  'out_of_scope:',
  '',
].join('\n');

const SAMPLE_PLAN = '1. 改 list 输出\n2. 改 status 输出\n';

describe('getArchiveTargetPaths', () => {
  it('builds docs/architecture/<topic>/ paths', () => {
    const paths = getArchiveTargetPaths('/repo', 'task-1', 'auth');
    expect(paths.archDir).toBe('/repo/docs/architecture');
    expect(paths.topicDir).toBe('/repo/docs/architecture/auth');
  });

  it('falls back to topic="tasks" when omitted', () => {
    const paths = getArchiveTargetPaths('/repo', 'task-1');
    expect(paths.topicDir).toBe('/repo/docs/architecture/tasks');
  });
});

describe('archiveTaskArtifacts', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
  });

  it('archives both contract and plan plus README under default topic', async () => {
    const workDir = await createTempDir();
    tempDirs.push(workDir);
    await ensureHarnessDirectories(workDir);
    // 写默认 config，让 TaskManager.load 不报错
    await new TaskManager(); // 触发模块化加载
    await writeFile(
      path.join(workDir, '.harness', 'harness.config.yaml'),
      [
        'version: 1',
        'project_type: node',
        'required_checks:',
        'default_host: claude-code',
        'enabled_hosts: claude-code',
        'install_repo_local_shells: true',
        'source_of_truth_dir: .harness/hosts',
        'fallback_create_task_without_planner: false',
        'codex_user_prompt_submit_hook_enabled: true',
        'planner_use_host_plan_mode: false',
        'planner_model_claude_code: haiku',
        'planner_model_codex: gpt-5.4-mini',
        'planner_model_gemini_cli: gemini-flash',
        'evaluator_model_claude_code: sonnet',
        'evaluator_model_codex: gpt-5.4',
        'evaluator_model_gemini_cli: gemini-pro',
        'adapter_kind: claude-code',
        'adapter_command:',
        '',
      ].join('\n'),
      'utf8',
    );
    await seedTask(workDir, 'task-1', { contract: SAMPLE_CONTRACT, plan: SAMPLE_PLAN });

    const result = await archiveTaskArtifacts(workDir, 'task-1', 'both');

    expect(result.taskId).toBe('task-1');
    expect(result.topic).toBe('tasks');
    expect(result.targetDir).toBe(path.join(workDir, 'docs', 'architecture', 'tasks'));
    expect(result.files.map((f) => path.basename(f.target)).sort()).toEqual([
      'README.md',
      'task-1.design.md',
      'task-1.promotion.json',
      'task-1.requirement.md',
    ]);
    expect(result.files.find((f) => f.target.endsWith('task-1.requirement.md'))?.status).toBe('created');
    expect(result.files.find((f) => f.target.endsWith('task-1.design.md'))?.status).toBe('created');

    // 实际文件已写入
    expect(await readFile(path.join(result.targetDir, 'task-1.requirement.md'), 'utf8')).toBe(SAMPLE_CONTRACT);
    expect(await readFile(path.join(result.targetDir, 'task-1.design.md'), 'utf8')).toBe(SAMPLE_PLAN);

    const readme = await readFile(path.join(result.targetDir, 'README.md'), 'utf8');
    expect(readme).toContain('# Task Archive: 修复 list 输出');
    expect(readme).toContain('archived_kind: both');
    expect(readme).toContain('contract.yaml');
    expect(readme).toContain('plan.md');
  });

  it('respects --topic and creates topic subdirectory', async () => {
    const workDir = await createTempDir();
    tempDirs.push(workDir);
    await ensureHarnessDirectories(workDir);
    await writeFile(
      path.join(workDir, '.harness', 'harness.config.yaml'),
      [
        'version: 1',
        'project_type: node',
        'required_checks:',
        'default_host: claude-code',
        'enabled_hosts: claude-code',
        'install_repo_local_shells: true',
        'source_of_truth_dir: .harness/hosts',
        'fallback_create_task_without_planner: false',
        'codex_user_prompt_submit_hook_enabled: true',
        'planner_use_host_plan_mode: false',
        'planner_model_claude_code: haiku',
        'planner_model_codex: gpt-5.4-mini',
        'planner_model_gemini_cli: gemini-flash',
        'evaluator_model_claude_code: sonnet',
        'evaluator_model_codex: gpt-5.4',
        'evaluator_model_gemini_cli: gemini-pro',
        'adapter_kind: claude-code',
        'adapter_command:',
        '',
      ].join('\n'),
      'utf8',
    );
    await seedTask(workDir, 'task-1', { contract: SAMPLE_CONTRACT, plan: SAMPLE_PLAN });

    const result = await archiveTaskArtifacts(workDir, 'task-1', 'design', { topic: 'auth' });

    expect(result.topic).toBe('auth');
    expect(result.targetDir).toContain('docs/architecture/auth');
    // kind=design 时不归档 contract
    expect(result.files.some((f) => f.target.endsWith('task-1.requirement.md'))).toBe(false);
    expect(result.files.some((f) => f.target.endsWith('task-1.design.md'))).toBe(true);
  });

  it('archives requirement-only when kind=requirement', async () => {
    const workDir = await createTempDir();
    tempDirs.push(workDir);
    await ensureHarnessDirectories(workDir);
    await writeFile(
      path.join(workDir, '.harness', 'harness.config.yaml'),
      'version: 1\nproject_type: node\nrequired_checks:\ndefault_host: claude-code\nenabled_hosts: claude-code\ninstall_repo_local_shells: true\nsource_of_truth_dir: .harness/hosts\nfallback_create_task_without_planner: false\ncodex_user_prompt_submit_hook_enabled: true\nplanner_use_host_plan_mode: false\nplanner_model_claude_code: haiku\nplanner_model_codex: gpt-5.4-mini\nplanner_model_gemini_cli: gemini-flash\nevaluator_model_claude_code: sonnet\nevaluator_model_codex: gpt-5.4\nevaluator_model_gemini_cli: gemini-pro\nadapter_kind: claude-code\nadapter_command:\n',
      'utf8',
    );
    await seedTask(workDir, 'task-1', { contract: SAMPLE_CONTRACT, plan: SAMPLE_PLAN });

    const result = await archiveTaskArtifacts(workDir, 'task-1', 'requirement');

    expect(result.files.some((f) => f.target.endsWith('task-1.requirement.md'))).toBe(true);
    expect(result.files.some((f) => f.target.endsWith('task-1.design.md'))).toBe(false);
  });

  it('skips already-archived files when force=false', async () => {
    const workDir = await createTempDir();
    tempDirs.push(workDir);
    await ensureHarnessDirectories(workDir);
    await writeFile(
      path.join(workDir, '.harness', 'harness.config.yaml'),
      'version: 1\nproject_type: node\nrequired_checks:\ndefault_host: claude-code\nenabled_hosts: claude-code\ninstall_repo_local_shells: true\nsource_of_truth_dir: .harness/hosts\nfallback_create_task_without_planner: false\ncodex_user_prompt_submit_hook_enabled: true\nplanner_use_host_plan_mode: false\nplanner_model_claude_code: haiku\nplanner_model_codex: gpt-5.4-mini\nplanner_model_gemini_cli: gemini-flash\nevaluator_model_claude_code: sonnet\nevaluator_model_codex: gpt-5.4\nevaluator_model_gemini_cli: gemini-pro\nadapter_kind: claude-code\nadapter_command:\n',
      'utf8',
    );
    await seedTask(workDir, 'task-1', { contract: SAMPLE_CONTRACT, plan: SAMPLE_PLAN });

    await archiveTaskArtifacts(workDir, 'task-1', 'both');

    // 用户改了归档后的 plan
    const archivedPlan = path.join(
      workDir,
      'docs/architecture/tasks/task-1.design.md',
    );
    await writeFile(archivedPlan, '# 用户编辑过的 plan\n', 'utf8');

    const result = await archiveTaskArtifacts(workDir, 'task-1', 'both');

    const planFile = result.files.find((f) => f.target.endsWith('task-1.design.md'));
    expect(planFile?.status).toBe('skipped');

    // 文件没被覆盖
    expect(await readFile(archivedPlan, 'utf8')).toBe('# 用户编辑过的 plan\n');
  });

  it('overwrites with force=true', async () => {
    const workDir = await createTempDir();
    tempDirs.push(workDir);
    await ensureHarnessDirectories(workDir);
    await writeFile(
      path.join(workDir, '.harness', 'harness.config.yaml'),
      'version: 1\nproject_type: node\nrequired_checks:\ndefault_host: claude-code\nenabled_hosts: claude-code\ninstall_repo_local_shells: true\nsource_of_truth_dir: .harness/hosts\nfallback_create_task_without_planner: false\ncodex_user_prompt_submit_hook_enabled: true\nplanner_use_host_plan_mode: false\nplanner_model_claude_code: haiku\nplanner_model_codex: gpt-5.4-mini\nplanner_model_gemini_cli: gemini-flash\nevaluator_model_claude_code: sonnet\nevaluator_model_codex: gpt-5.4\nevaluator_model_gemini_cli: gemini-pro\nadapter_kind: claude-code\nadapter_command:\n',
      'utf8',
    );
    await seedTask(workDir, 'task-1', { contract: SAMPLE_CONTRACT, plan: SAMPLE_PLAN });

    await archiveTaskArtifacts(workDir, 'task-1', 'both');
    const archivedPlan = path.join(workDir, 'docs/architecture/tasks/task-1.design.md');
    await writeFile(archivedPlan, '# stale\n', 'utf8');

    const result = await archiveTaskArtifacts(workDir, 'task-1', 'both', { force: true });
    const planFile = result.files.find((f) => f.target.endsWith('task-1.design.md'));
    expect(planFile?.status).toBe('updated');
    expect(await readFile(archivedPlan, 'utf8')).toBe(SAMPLE_PLAN);
  });

  it('throws when contract missing for kind=requirement', async () => {
    const workDir = await createTempDir();
    tempDirs.push(workDir);
    await ensureHarnessDirectories(workDir);
    await writeFile(
      path.join(workDir, '.harness', 'harness.config.yaml'),
      'version: 1\nproject_type: node\nrequired_checks:\ndefault_host: claude-code\nenabled_hosts: claude-code\ninstall_repo_local_shells: true\nsource_of_truth_dir: .harness/hosts\nfallback_create_task_without_planner: false\ncodex_user_prompt_submit_hook_enabled: true\nplanner_use_host_plan_mode: false\nplanner_model_claude_code: haiku\nplanner_model_codex: gpt-5.4-mini\nplanner_model_gemini_cli: gemini-flash\nevaluator_model_claude_code: sonnet\nevaluator_model_codex: gpt-5.4\nevaluator_model_gemini_cli: gemini-pro\nadapter_kind: claude-code\nadapter_command:\n',
      'utf8',
    );
    await seedTask(workDir, 'task-1', { plan: SAMPLE_PLAN }); // 缺 contract

    await expect(archiveTaskArtifacts(workDir, 'task-1', 'requirement')).rejects.toThrow(
      /缺少 contract\.yaml/,
    );
  });

  it('does not modify .harness/tasks (only reads)', async () => {
    const workDir = await createTempDir();
    tempDirs.push(workDir);
    await ensureHarnessDirectories(workDir);
    await writeFile(
      path.join(workDir, '.harness', 'harness.config.yaml'),
      'version: 1\nproject_type: node\nrequired_checks:\ndefault_host: claude-code\nenabled_hosts: claude-code\ninstall_repo_local_shells: true\nsource_of_truth_dir: .harness/hosts\nfallback_create_task_without_planner: false\ncodex_user_prompt_submit_hook_enabled: true\nplanner_use_host_plan_mode: false\nplanner_model_claude_code: haiku\nplanner_model_codex: gpt-5.4-mini\nplanner_model_gemini_cli: gemini-flash\nevaluator_model_claude_code: sonnet\nevaluator_model_codex: gpt-5.4\nevaluator_model_gemini_cli: gemini-pro\nadapter_kind: claude-code\nadapter_command:\n',
      'utf8',
    );
    await seedTask(workDir, 'task-1', { contract: SAMPLE_CONTRACT, plan: SAMPLE_PLAN });

    await archiveTaskArtifacts(workDir, 'task-1', 'both');

    // 源文件未变
    const originalContract = path.join(workDir, '.harness/tasks/task-1/contract.yaml');
    expect(await readFile(originalContract, 'utf8')).toBe(SAMPLE_CONTRACT);
  });
});
