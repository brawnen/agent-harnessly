import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { TaskManager } from '@harnessly/core';
import type { Contract } from '@harnessly/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { runInit } from './init';
import { runList } from './list';
import { runStatus } from './status';

const TEST_CONTRACT: Contract = {
  goal: '修复状态展示',
  templateName: 'bug-fix',
  riskLevel: 'medium',
  scopeInclude: ['packages/cli/src'],
  scopeExclude: ['dist/**'],
  acceptanceCriteria: ['输出 task 状态'],
  outOfScope: ['重构执行引擎'],
};

async function createTempDir(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), 'harnessly-cli-test-'));
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

describe('status and list commands', () => {
  const tempDirs: string[] = [];
  const originalCwd = process.cwd();

  afterEach(async () => {
    process.chdir(originalCwd);
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it('should print a friendly message when repo is initialized but has no task', async () => {
    const workDir = await createTempDir();
    tempDirs.push(workDir);
    process.chdir(workDir);

    await captureStdout(() => runInit({ host: 'claude-code' }));
    const output = await captureStdout(() => runStatus({}, []));

    expect(output).toContain('当前没有 task。先执行 harnessly run "<goal>" 创建任务。');
    expect(output).toContain('host claude-code: manifest=present, shell=installed');
  });

  it('should show active task details in status and list output', async () => {
    const workDir = await createTempDir();
    tempDirs.push(workDir);
    process.chdir(workDir);

    await captureStdout(() => runInit({ host: 'claude-code' }));

    const manager = new TaskManager();
    const ctx = await manager.create('修复状态展示', workDir);
    await manager.saveContract(ctx, TEST_CONTRACT);
    await manager.savePlan(ctx, '1. 输出 status\n2. 输出 list\n');

    const statusOutput = await captureStdout(() => runStatus({}, []));
    const listOutput = await captureStdout(() => runList({}));

    expect(statusOutput).toContain(`selected_task: ${ctx.taskId}`);
    expect(statusOutput).toContain('contract_ready: true');
    expect(statusOutput).toContain('plan_ready: true');
    expect(statusOutput).toContain('report_ready: false');

    expect(listOutput).toContain(`${ctx.taskId} [active]`);
    expect(listOutput).toContain('stage=design');
    expect(listOutput).toContain('retry=0');
  });
});
