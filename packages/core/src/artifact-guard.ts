import { access } from 'node:fs/promises';
import path from 'node:path';

import type { EvidenceCheckResult } from '@harnessly/shared';

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

const REQUIRED_TASK_ARTIFACTS = [
  'requirement.md',
  'contract.yaml',
  'design.md',
  'task-breakdown.md',
  'implementation-notes.md',
  'review.md',
  'resident-review.md',
  'test-report.md',
  'evidence/current.json',
] as const;

export async function runArtifactGuard(taskDir: string): Promise<EvidenceCheckResult> {
  const missing: string[] = [];
  for (const relative of REQUIRED_TASK_ARTIFACTS) {
    if (!(await exists(path.join(taskDir, relative)))) {
      missing.push(relative);
    }
  }

  return {
    name: 'artifact.guard',
    status: missing.length === 0 ? 'passed' : 'failed',
    command: 'check .harness task artifacts',
    detail: missing.length === 0 ? '任务物理工件完整' : `缺少任务物理工件：${missing.join(', ')}`,
    fixHint: missing.length === 0 ? undefined : '回到对应阶段生成缺失工件，不要只依赖对话文本',
  };
}
