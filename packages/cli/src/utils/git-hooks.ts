import { chmod, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import type { HostName } from '@brawnen/harnessly-shared';

/**
 * 渲染一个常驻 review git hook 脚本。
 *
 * 关键设计（修复跨项目路径 bug）：
 * - 不写死任何开发路径（旧实现错误地指向 `<repo>/packages/cli/dist/index.js`，
 *   只在 Harnessly monorepo 自身成立，用户项目里该文件不存在 → hook 必崩）
 * - 解析 `harnessly` 命令：优先 PATH（全局 `npm i -g`），其次本地 `node_modules/.bin`
 * - 命令缺失 → 优雅跳过（exit 0），绝不因找不到 CLI 而阻断用户的 git 操作
 * - 不用 `set -e`：否则 review 命令一旦非 0 会立即退出，跳过下面的 exit-code 判断，
 *   提示也打印不出来
 *
 * @param trigger 传给 CLI 的触发器枚举（pre_push / pre_merge）
 * @param actionLabel 拦截提示里的动作名（push / merge）
 */
function renderResidentReviewHook(trigger: 'pre_push' | 'pre_merge', actionLabel: string): string {
  return [
    '#!/bin/bash',
    `# Managed by Harnessly — v3-core §14 常驻 review agent ${trigger} 触发`,
    '',
    '# 解析 harnessly 命令：优先 PATH（全局安装），其次本地 node_modules/.bin',
    'if command -v harnessly >/dev/null 2>&1; then',
    '  HARNESS=harnessly',
    'elif [ -x "node_modules/.bin/harnessly" ]; then',
    '  HARNESS="node_modules/.bin/harnessly"',
    'else',
    `  echo "[harnessly] 未找到 harnessly 命令，跳过 resident review（不阻断 ${actionLabel}）"`,
    '  exit 0',
    'fi',
    '',
    `echo "[harnessly] ${trigger}: running resident review..."`,
    `"$HARNESS" host resident-review --trigger ${trigger}`,
    'REVIEW_EXIT=$?',
    '',
    'if [ $REVIEW_EXIT -ne 0 ]; then',
    `  echo "[harnessly] resident review 发现阻断级 finding，${actionLabel} 已拦截"`,
    '  exit 1',
    'fi',
    '',
    'echo "[harnessly] resident review 通过"',
    'exit 0',
    '',
  ].join('\n');
}

/**
 * 安装 git hooks 到 .git/hooks/。
 * 生成 pre-push / pre-merge-commit，触发常驻 review agent。
 */
export async function installGitHooks(
  workDir: string,
  _hosts: readonly HostName[],
): Promise<string[]> {
  const installed: string[] = [];
  const hooksDir = path.join(workDir, '.git', 'hooks');
  await mkdir(hooksDir, { recursive: true });

  // pre-push: 触发常驻 review agent
  const prePushPath = path.join(hooksDir, 'pre-push');
  await copyFileOrWrite(prePushPath, renderResidentReviewHook('pre_push', 'push'));
  await chmod(prePushPath, 0o755);
  installed.push('.git/hooks/pre-push');

  // pre-merge-commit: merge 前触发 review
  const preMergePath = path.join(hooksDir, 'pre-merge-commit');
  await copyFileOrWrite(preMergePath, renderResidentReviewHook('pre_merge', 'merge'));
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
