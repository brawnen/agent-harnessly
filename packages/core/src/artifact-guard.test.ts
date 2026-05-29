import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { checkWritePermission, runArtifactGuard } from './artifact-guard';

async function createTempDir(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), 'harnessly-artifact-guard-'));
}

/** 在 taskDir 下写出一批工件文件 */
async function seedArtifacts(taskDir: string, files: string[]): Promise<void> {
  for (const rel of files) {
    const full = path.join(taskDir, rel);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, 'x', 'utf8');
  }
}

const LITE_ARTIFACTS = [
  'requirement.md',
  'contract.yaml',
  'implementation-notes.md',
  'test-report.md',
  'evidence/current.json',
];

const FULL_ONLY_ARTIFACTS = ['design.md', 'task-breakdown.md', 'review.md', 'resident-review.md'];

describe('runArtifactGuard — preset-aware 必需工件清单 (SPEC §6.4.9)', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it('lite preset: 只产 5 个工件即视为完整（不要求 design/review/resident-review）', async () => {
    const taskDir = await createTempDir();
    tempDirs.push(taskDir);
    await seedArtifacts(taskDir, LITE_ARTIFACTS);

    const result = await runArtifactGuard(taskDir, 'lite');

    expect(result.status).toBe('passed');
    expect(result.command).toContain('preset=lite');
    expect(result.detail).toContain('preset=lite');
  });

  it('full preset: 缺 design/review 等工件时判定 failed', async () => {
    const taskDir = await createTempDir();
    tempDirs.push(taskDir);
    // 只放 lite 的 5 个工件，缺 full 专属工件
    await seedArtifacts(taskDir, LITE_ARTIFACTS);

    const result = await runArtifactGuard(taskDir, 'full');

    expect(result.status).toBe('failed');
    expect(result.command).toContain('preset=full');
    // 缺失列表应包含 full 专属工件
    for (const missing of FULL_ONLY_ARTIFACTS) {
      expect(result.detail).toContain(missing);
    }
    expect(result.fixHint).toBeDefined();
  });

  it('同一组 lite 工件：lite 判 passed，full 判 failed（清单差异生效）', async () => {
    const taskDir = await createTempDir();
    tempDirs.push(taskDir);
    await seedArtifacts(taskDir, LITE_ARTIFACTS);

    const liteResult = await runArtifactGuard(taskDir, 'lite');
    const fullResult = await runArtifactGuard(taskDir, 'full');

    expect(liteResult.status).toBe('passed');
    expect(fullResult.status).toBe('failed');
  });

  it('未传 preset 时默认按 full（向后兼容）', async () => {
    const taskDir = await createTempDir();
    tempDirs.push(taskDir);
    await seedArtifacts(taskDir, LITE_ARTIFACTS);

    const result = await runArtifactGuard(taskDir);

    expect(result.status).toBe('failed'); // 默认 full → 缺 full 工件
    expect(result.command).toContain('preset=full');
  });

  it('full preset: 全部 9 个工件齐全时 passed', async () => {
    const taskDir = await createTempDir();
    tempDirs.push(taskDir);
    await seedArtifacts(taskDir, [...LITE_ARTIFACTS, ...FULL_ONLY_ARTIFACTS]);

    const result = await runArtifactGuard(taskDir, 'full');

    expect(result.status).toBe('passed');
  });
});

describe('checkWritePermission — 阶段所有权物理强制 (SPEC §10 纪律 1)', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  async function seedTaskState(workDir: string, taskId: string, currentStage: string): Promise<void> {
    const taskDir = path.join(workDir, '.harness', 'tasks', taskId);
    await mkdir(taskDir, { recursive: true });
    await writeFile(
      path.join(taskDir, 'state.json'),
      JSON.stringify({ taskId, currentStage }),
      'utf8',
    );
    await writeFile(path.join(workDir, '.harness', 'active-task.txt'), taskId, 'utf8');
  }

  it('execute 阶段写 requirement.md（属 spec）→ 拒绝', async () => {
    const workDir = await createTempDir();
    tempDirs.push(workDir);
    await seedTaskState(workDir, 'task-1', 'execute');

    const result = await checkWritePermission(
      workDir,
      '.harness/tasks/task-1/requirement.md',
      'task-1',
    );

    expect(result.allowed).toBe(false);
    expect(result.currentStage).toBe('execute');
    expect(result.requiredStage).toBe('spec');
  });

  it('execute 阶段写 implementation-notes.md（属 execute）→ 放行', async () => {
    const workDir = await createTempDir();
    tempDirs.push(workDir);
    await seedTaskState(workDir, 'task-1', 'execute');

    const result = await checkWritePermission(
      workDir,
      '.harness/tasks/task-1/implementation-notes.md',
      'task-1',
    );

    expect(result.allowed).toBe(true);
  });

  it('docs/architecture/ 路径 → 拒绝（仅系统命令可写）', async () => {
    const workDir = await createTempDir();
    tempDirs.push(workDir);

    const result = await checkWritePermission(workDir, 'docs/architecture/oauth/design.md');

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('harness archive promote');
  });

  it('非任务工件路径 → 放行', async () => {
    const workDir = await createTempDir();
    tempDirs.push(workDir);

    const result = await checkWritePermission(workDir, 'src/foo.ts');

    expect(result.allowed).toBe(true);
  });
});
