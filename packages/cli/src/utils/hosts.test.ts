import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { ensureHostManifest, getCurrentHarnesslyCommand } from './hosts';

async function createTempProject(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'harnessly-hosts-'));
  await mkdir(path.join(dir, '.harness', 'hosts'), { recursive: true });
  // ensureHostManifest 只依赖 .harness/hosts；不需要完整 init
  return dir;
}

describe('getCurrentHarnesslyCommand', () => {
  const original = process.env.HARNESSLY_BIN;
  afterEach(() => {
    if (original === undefined) delete process.env.HARNESSLY_BIN;
    else process.env.HARNESSLY_BIN = original;
  });

  it('默认返回可移植的 bare harnessly（不写机器特定绝对路径）', () => {
    delete process.env.HARNESSLY_BIN;
    expect(getCurrentHarnesslyCommand()).toBe('harnessly');
  });

  it('HARNESSLY_BIN 显式覆盖时使用覆盖值', () => {
    process.env.HARNESSLY_BIN = 'node /custom/dist/index.js';
    expect(getCurrentHarnesslyCommand()).toBe('node /custom/dist/index.js');
  });

  it('HARNESSLY_BIN 为空白时回退到 bare harnessly', () => {
    process.env.HARNESSLY_BIN = '   ';
    expect(getCurrentHarnesslyCommand()).toBe('harnessly');
  });
});

describe('ensureHostManifest — 命令前缀可移植 + 自愈', () => {
  const tempDirs: string[] = [];
  const original = process.env.HARNESSLY_BIN;

  afterEach(async () => {
    if (original === undefined) delete process.env.HARNESSLY_BIN;
    else process.env.HARNESSLY_BIN = original;
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it('新建 manifest 使用 bare harnessly 命令', async () => {
    delete process.env.HARNESSLY_BIN;
    const dir = await createTempProject();
    tempDirs.push(dir);

    await ensureHostManifest(dir, 'codex');
    const yaml = await readFile(path.join(dir, '.harness', 'hosts', 'codex.yaml'), 'utf8');

    expect(yaml).toContain('session_start_command: harnessly host session-start');
    expect(yaml).toContain('user_prompt_submit_command: harnessly host user-prompt-submit');
    expect(yaml).toContain('completion_gate_command: harnessly host completion-gate');
    // 不应含机器特定绝对路径
    expect(yaml).not.toContain('/opt/homebrew');
    expect(yaml).not.toContain('/usr/local/bin');
  });

  it('自愈：已有的机器特定绝对路径 manifest 被纠正为 bare harnessly', async () => {
    delete process.env.HARNESSLY_BIN;
    const dir = await createTempProject();
    tempDirs.push(dir);

    // 模拟旧 bug 留下的脏数据（绝对路径）
    await writeFile(
      path.join(dir, '.harness', 'hosts', 'codex.yaml'),
      [
        'host: codex',
        'version: 0.1.0-alpha.0',
        'enabled: true',
        'repo_local_paths: .codex/config.toml',
        'session_start_command: "/opt/homebrew/bin/harnessly" host session-start',
        'user_prompt_submit_command: "/opt/homebrew/bin/harnessly" host user-prompt-submit',
        'completion_gate_command: "/opt/homebrew/bin/harnessly" host completion-gate',
      ].join('\n'),
      'utf8',
    );

    await ensureHostManifest(dir, 'codex');
    const yaml = await readFile(path.join(dir, '.harness', 'hosts', 'codex.yaml'), 'utf8');

    expect(yaml).not.toContain('/opt/homebrew');
    expect(yaml).toContain('session_start_command: harnessly host session-start');
  });

  it('HARNESSLY_BIN 设置时 manifest 写入覆盖命令', async () => {
    process.env.HARNESSLY_BIN = 'node /opt/app/harnessly/dist/index.js';
    const dir = await createTempProject();
    tempDirs.push(dir);

    await ensureHostManifest(dir, 'claude-code');
    const yaml = await readFile(path.join(dir, '.harness', 'hosts', 'claude-code.yaml'), 'utf8');

    expect(yaml).toContain(
      'session_start_command: node /opt/app/harnessly/dist/index.js host session-start',
    );
  });
});
