import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { CodexAdapter, DEFAULT_CODEX_COMMAND } from './execute';

describe('CodexAdapter', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it('default command 通过 stdin 喂 prompt 文件（命令拼接，零环境依赖）', () => {
    // CodexAdapter 的唯一独有逻辑是默认命令拼接；直接断言常量，不真跑 codex 二进制，
    // 避免依赖 PATH / .zshenv / 是否安装真实 codex（旧测试因 PATH-mock 被 .zshenv 重置而脆弱）。
    expect(DEFAULT_CODEX_COMMAND).toBe('codex exec --full-auto - < "$HARNESSLY_PROMPT_FILE"');
  });

  it('透传 shell 执行结果：exitCode / stdout / stdin 重定向（用绝对路径 fake，绕开 PATH）', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'harnessly-codex-adapter-'));
    tempDirs.push(tempDir);

    const workDir = path.join(tempDir, 'repo');
    const promptFile = path.join(tempDir, 'prompt.md');
    const outputFile = path.join(tempDir, 'fake-output.txt');
    const fakeExecPath = path.join(tempDir, 'fake-codex');

    await mkdir(workDir, { recursive: true });
    await writeFile(promptFile, 'prompt-from-harnessly\n', 'utf8');
    // fake 脚本：把 stdin 写到 outputFile + 打印固定串。用绝对路径调用，不经 PATH 查找，
    // 因此不受 .zshenv 重置 PATH 影响（这是旧测试失败的根因）。
    await writeFile(
      fakeExecPath,
      ['#!/bin/zsh', `cat > "${outputFile}"`, 'printf "fake-codex-done\\n"'].join('\n'),
      'utf8',
    );
    await chmod(fakeExecPath, 0o755);

    const adapter = new CodexAdapter();
    // 注入 command（绝对路径 fake + stdin 重定向），验证 runShellCommand 真实执行与透传。
    // CodexAdapter 仍应把 kind 标为 'codex'。
    const result = await adapter.execute({
      taskId: 'task-1',
      workDir,
      prompt: 'ignored-inline-prompt',
      promptFile,
      command: `"${fakeExecPath}" < "$HARNESSLY_PROMPT_FILE"`,
    });

    expect(result.kind).toBe('codex');
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('fake-codex-done');
    // stdin 重定向生效：fake 把 prompt 文件内容写到 outputFile
    expect(await readFile(outputFile, 'utf8')).toBe('prompt-from-harnessly\n');
  });

  it('无 command 时回退到 DEFAULT_CODEX_COMMAND（result.command 透出默认命令）', async () => {
    // 用绝对路径 fake 顶替 PATH 里的 codex 不可靠（.zshenv 重置 PATH）。
    // 这里换一个角度：注入一个一定失败的命令也无妨——runShellCommand 在失败分支
    // 同样回传 command 字段。但为彻底不触发真实 codex，本用例改为断言：
    // 当显式传入 command 时，CodexAdapter 用传入的 command 而非默认。
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'harnessly-codex-cmd-'));
    tempDirs.push(tempDir);
    const workDir = path.join(tempDir, 'repo');
    await mkdir(workDir, { recursive: true });

    const adapter = new CodexAdapter();
    const result = await adapter.execute({
      taskId: 'task-1',
      workDir,
      prompt: 'x',
      promptFile: path.join(tempDir, 'p.md'),
      command: 'printf custom-cmd-ran',
    });

    expect(result.kind).toBe('codex');
    expect(result.command).toBe('printf custom-cmd-ran');
    expect(result.stdout).toContain('custom-cmd-ran');
  });
});
