import { appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

import { getHarnessPaths } from '@brawnen/harnessly-core';

export async function appendHarnessEvent(
  workDir: string,
  event: Record<string, unknown>,
): Promise<void> {
  const harnessDir = getHarnessPaths(workDir).harnessDir;
  await mkdir(harnessDir, { recursive: true });
  await appendFile(
    path.join(harnessDir, 'events.jsonl'),
    `${JSON.stringify({
      timestamp: new Date().toISOString(),
      ...event,
    })}\n`,
    'utf8',
  );
}
