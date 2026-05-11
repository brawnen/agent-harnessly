import { resolve } from 'node:path';

import { checkWritePermission } from '@harnessly/core';

function readStringFlag(flags: Record<string, string | boolean>, name: string): string {
  const value = flags[name];
  return typeof value === 'string' ? value : '';
}

export async function runHostArtifactGuard(
  flags: Record<string, string | boolean>,
): Promise<void> {
  const cwd = process.cwd();
  let filePath = readStringFlag(flags, 'file');
  const taskId = readStringFlag(flags, 'task-id') || undefined;

  if (!filePath) {
    process.stdout.write(JSON.stringify({ allowed: false, reason: '缺少 --file 参数' }));
    return;
  }

  // 解析为绝对路径
  filePath = resolve(cwd, filePath);

  const result = await checkWritePermission(cwd, filePath, taskId);

  process.stdout.write(`${JSON.stringify(result)}\n`);
}
