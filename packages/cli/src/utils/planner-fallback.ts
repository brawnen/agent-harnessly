import { readFile, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';

import { getHarnessPaths } from '@harnessly/core';

interface PendingDelegation {
  prompt: string;
  timestamp: string;
}

function getPendingFile(workDir: string): string {
  return path.join(getHarnessPaths(workDir).harnessDir, 'pending-planner-delegation.json');
}

export async function readPendingDelegation(workDir: string): Promise<PendingDelegation | null> {
  try {
    return JSON.parse(await readFile(getPendingFile(workDir), 'utf8')) as PendingDelegation;
  } catch {
    return null;
  }
}

export async function writePendingDelegation(workDir: string, prompt: string): Promise<void> {
  await writeFile(
    getPendingFile(workDir),
    JSON.stringify({ prompt, timestamp: new Date().toISOString() }),
    'utf8',
  );
}

export async function clearPendingDelegation(workDir: string): Promise<void> {
  try {
    await unlink(getPendingFile(workDir));
  } catch {
    // 文件不存在，忽略
  }
}
