import { chmod, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import type { HostName } from '@harnessly/shared';

/**
 * 安装 git hooks 到 .git/hooks/。
 * 从 host adapter 生成的脚本复制（如需要）或直接生成。
 */
export async function installGitHooks(
  workDir: string,
  hosts: readonly HostName[],
): Promise<string[]> {
  const installed: string[] = [];
  const hooksDir = path.join(workDir, '.git', 'hooks');
  await mkdir(hooksDir, { recursive: true });

  const harnessBin = 'node "$(git rev-parse --show-toplevel)/packages/cli/dist/index.js"';

  // pre-push: 触发常驻 review agent
  const prePushPath = path.join(hooksDir, 'pre-push');
  const prePushScript = [
    '#!/bin/bash',
    '# Managed by Harnessly — v3-core §14 常驻 review agent pre_push 触发',
    'set -e',
    '',
    `echo "[harnessly] pre-push: running resident review..."`,
    `${harnessBin} host resident-review --trigger pre_push`,
    'REVIEW_EXIT=$?',
    '',
    'if [ $REVIEW_EXIT -ne 0 ]; then',
    '  echo "[harnessly] resident review 发现阻断级 finding，push 已拦截"',
    '  exit 1',
    'fi',
    '',
    'echo "[harnessly] resident review 通过"',
    'exit 0',
    '',
  ].join('\n');
  await copyFileOrWrite(prePushPath, prePushScript);
  await chmod(prePushPath, 0o755);
  installed.push('.git/hooks/pre-push');

  // pre-merge-commit: merge 前触发 review
  const preMergePath = path.join(hooksDir, 'pre-merge-commit');
  const preMergeScript = [
    '#!/bin/bash',
    '# Managed by Harnessly — v3-core §14 常驻 review agent pre_merge 触发',
    'set -e',
    '',
    `echo "[harnessly] pre-merge: running resident review..."`,
    `${harnessBin} host resident-review --trigger pre_merge`,
    'REVIEW_EXIT=$?',
    '',
    'if [ $REVIEW_EXIT -ne 0 ]; then',
    '  echo "[harnessly] resident review 发现阻断级 finding，merge 已拦截"',
    '  exit 1',
    'fi',
    '',
    'echo "[harnessly] resident review 通过"',
    'exit 0',
    '',
  ].join('\n');
  await copyFileOrWrite(preMergePath, preMergeScript);
  await chmod(preMergePath, 0o755);
  installed.push('.git/hooks/pre-merge-commit');

  return installed;
}

async function copyFileOrWrite(filePath: string, content: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const existing = await readFile(filePath, 'utf8').catch(() => null);
  if (existing && !existing.includes('Managed by Harnessly')) {
    throw new Error(`${filePath} 已存在且不是 Harnessly 管理的 hook，拒绝覆盖`);
  }
  const { writeFile } = await import('node:fs/promises');
  await writeFile(filePath, content, 'utf8');
}
