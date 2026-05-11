import { readFile } from 'node:fs/promises';

import type { EvidenceCheckResult } from '@harnessly/shared';

import { getHarnessPaths } from './scaffold';

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'ENOENT'
  );
}

async function loadReviewAgentsConfig(workDir: string): Promise<string | null> {
  try {
    return await readFile(getHarnessPaths(workDir).reviewAgentsFile, 'utf8');
  } catch (error) {
    if (isMissingFileError(error)) return null;
    throw error;
  }
}

export async function renderResidentReview(
  workDir: string,
  findings: readonly EvidenceCheckResult[],
): Promise<string> {
  const configText = await loadReviewAgentsConfig(workDir);
  const active = Boolean(configText?.includes('review_agents:'));
  const failed = findings.filter((finding) => finding.status === 'failed');

  return [
    '# Resident Review',
    '',
    '## Config',
    active ? '- .harness/review-agents.yaml: loaded' : '- .harness/review-agents.yaml: missing',
    '',
    '## Decision',
    failed.length > 0 ? 'fail' : 'pass',
    '',
    '## Findings',
    failed.length === 0
      ? '- none'
      : failed.map((finding) => `- ${finding.name}: ${finding.detail}`).join('\n'),
    '',
  ].join('\n');
}
