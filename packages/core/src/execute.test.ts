import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { CodexAdapter } from './execute';

describe('CodexAdapter', () => {
  const tempDirs: string[] = [];
  const originalPath = process.env.PATH;

  afterEach(async () => {
    process.env.PATH = originalPath;
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it('should use default codex exec command and pass prompt file via stdin', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'harnessly-codex-adapter-'));
    tempDirs.push(tempDir);

    const binDir = path.join(tempDir, 'bin');
    const workDir = path.join(tempDir, 'repo');
    const promptFile = path.join(tempDir, 'prompt.md');
    const outputFile = path.join(tempDir, 'codex-output.txt');
    const fakeCodexPath = path.join(binDir, 'codex');

    await import('node:fs/promises').then(({ mkdir }) => mkdir(binDir, { recursive: true }));
    await import('node:fs/promises').then(({ mkdir }) => mkdir(workDir, { recursive: true }));
    await writeFile(promptFile, 'prompt-from-harnessly\n', 'utf8');
    await writeFile(
      fakeCodexPath,
      [
        '#!/bin/zsh',
        `cat > "${outputFile}"`,
        'printf "fake-codex-done\\n"',
      ].join('\n'),
      'utf8',
    );
    await chmod(fakeCodexPath, 0o755);

    process.env.PATH = `${binDir}:${originalPath ?? ''}`;

    const adapter = new CodexAdapter();
    const result = await adapter.execute({
      taskId: 'task-1',
      workDir,
      prompt: 'ignored-inline-prompt',
      promptFile,
    });

    expect(result.kind).toBe('codex');
    expect(result.command).toContain('codex exec --full-auto');
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('fake-codex-done');
    expect(await import('node:fs/promises').then(({ readFile }) => readFile(outputFile, 'utf8'))).toBe(
      'prompt-from-harnessly\n',
    );
  });
});
