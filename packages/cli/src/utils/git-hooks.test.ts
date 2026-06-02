import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { installGitHooks } from './git-hooks';

async function createTempRepo(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'harnessly-githooks-'));
  await mkdir(path.join(dir, '.git'), { recursive: true });
  return dir;
}

describe('installGitHooks', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it('生成 pre-push 与 pre-merge-commit，且可执行', async () => {
    const repo = await createTempRepo();
    tempDirs.push(repo);

    const installed = await installGitHooks(repo, ['claude-code']);

    expect(installed).toEqual(['.git/hooks/pre-push', '.git/hooks/pre-merge-commit']);
    // 文件存在且可执行
    await expect(
      access(path.join(repo, '.git', 'hooks', 'pre-push'), constants.X_OK),
    ).resolves.toBeUndefined();
    await expect(
      access(path.join(repo, '.git', 'hooks', 'pre-merge-commit'), constants.X_OK),
    ).resolves.toBeUndefined();
  });

  it('bug 修复：hook 不再写死 monorepo 开发路径', async () => {
    const repo = await createTempRepo();
    tempDirs.push(repo);
    await installGitHooks(repo, ['codex']);

    const prePush = await readFile(path.join(repo, '.git', 'hooks', 'pre-push'), 'utf8');

    // 旧 bug：指向 <repo>/packages/cli/dist/index.js，用户项目里不存在 → push 崩
    expect(prePush).not.toContain('packages/cli/dist');
    expect(prePush).not.toContain('show-toplevel');
  });

  it('hook 通过 PATH / node_modules 解析 harnessly，命令缺失时不阻断', async () => {
    const repo = await createTempRepo();
    tempDirs.push(repo);
    await installGitHooks(repo, ['claude-code']);

    const prePush = await readFile(path.join(repo, '.git', 'hooks', 'pre-push'), 'utf8');

    // 优先 PATH，其次本地 node_modules/.bin
    expect(prePush).toContain('command -v harnessly');
    expect(prePush).toContain('node_modules/.bin/harnessly');
    // 命令缺失分支：跳过且 exit 0（不阻断 push）
    expect(prePush).toContain('未找到 harnessly 命令');
    expect(prePush).toMatch(/未找到 harnessly[\s\S]*?exit 0/);
    // 正确触发器
    expect(prePush).toContain('host resident-review --trigger pre_push');
    // 不用 set -e（否则 review 非 0 会跳过 exit-code 判断与提示）
    expect(prePush).not.toContain('set -e');
  });

  it('pre-merge-commit 使用 pre_merge 触发器', async () => {
    const repo = await createTempRepo();
    tempDirs.push(repo);
    await installGitHooks(repo, ['claude-code']);

    const preMerge = await readFile(path.join(repo, '.git', 'hooks', 'pre-merge-commit'), 'utf8');

    expect(preMerge).toContain('host resident-review --trigger pre_merge');
    expect(preMerge).toContain('merge 已拦截');
  });

  it('拒绝覆盖非 Harnessly 管理的已有 hook', async () => {
    const repo = await createTempRepo();
    tempDirs.push(repo);
    const hooksDir = path.join(repo, '.git', 'hooks');
    await mkdir(hooksDir, { recursive: true });
    await writeFile(path.join(hooksDir, 'pre-push'), '#!/bin/bash\n# user custom hook\n', 'utf8');

    await expect(installGitHooks(repo, ['claude-code'])).rejects.toThrow('拒绝覆盖');
  });

  it('可重复安装（已有 Harnessly hook 时覆盖更新）', async () => {
    const repo = await createTempRepo();
    tempDirs.push(repo);

    await installGitHooks(repo, ['claude-code']);
    // 第二次安装不应抛错（已有的是 Harnessly 管理的）
    await expect(installGitHooks(repo, ['claude-code'])).resolves.toEqual([
      '.git/hooks/pre-push',
      '.git/hooks/pre-merge-commit',
    ]);
  });
});
