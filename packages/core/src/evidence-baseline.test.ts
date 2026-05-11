import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { EvidenceResult } from '@harnessly/shared';

import {
  buildEvidenceBaseline,
  EVIDENCE_BASELINE_FILENAME,
  getEvidenceBaselinePath,
  loadEvidenceBaseline,
  saveEvidenceBaseline,
} from './evidence-baseline';
import { ensureHarnessDirectories } from './scaffold';

async function createTempDir(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), 'harnessly-baseline-test-'));
}

function makeEvidence(): EvidenceResult {
  return {
    checks: [
      { name: 'lint', status: 'failed', command: 'pnpm lint', detail: '3 errors' },
      { name: 'test', status: 'passed', command: 'pnpm test', detail: 'ok' },
      { name: 'typecheck', status: 'failed', command: 'pnpm typecheck', detail: '2 errors' },
      { name: 'build', status: 'skipped', command: 'pnpm build', detail: 'no script' },
    ],
    changedFiles: ['src/foo.ts'],
    lintWarningsTotal: 0,
    todoCount: 0,
    gitDirtyFiles: 1,
  };
}

describe('getEvidenceBaselinePath', () => {
  it('places baseline under .harness with the expected filename', async () => {
    const workDir = await createTempDir();
    try {
      const filePath = getEvidenceBaselinePath(workDir);
      expect(filePath.endsWith(`/.harness/${EVIDENCE_BASELINE_FILENAME}`)).toBe(true);
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  });
});

describe('buildEvidenceBaseline', () => {
  it('extracts only failed check names, sorted', () => {
    const baseline = buildEvidenceBaseline(makeEvidence());

    // 字母序排列保证落盘稳定
    expect(baseline.failedCheckNames).toEqual(['lint', 'typecheck']);
    expect(typeof baseline.capturedAt).toBe('string');
    expect(baseline.capturedAt.length).toBeGreaterThan(0);
  });

  it('returns empty list when no checks failed', () => {
    const baseline = buildEvidenceBaseline({
      checks: [{ name: 'test', status: 'passed', command: 'pnpm test', detail: 'ok' }],
      changedFiles: [],
      lintWarningsTotal: 0,
      todoCount: 0,
      gitDirtyFiles: 0,
    });
    expect(baseline.failedCheckNames).toEqual([]);
  });
});

describe('saveEvidenceBaseline + loadEvidenceBaseline', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
  });

  it('round-trips a baseline through disk', async () => {
    const workDir = await createTempDir();
    tempDirs.push(workDir);
    await ensureHarnessDirectories(workDir);

    const baseline = buildEvidenceBaseline(makeEvidence());
    await saveEvidenceBaseline(workDir, baseline);

    const loaded = await loadEvidenceBaseline(workDir);
    expect(loaded).toEqual(baseline);
  });

  it('returns null when baseline file does not exist', async () => {
    const workDir = await createTempDir();
    tempDirs.push(workDir);
    await ensureHarnessDirectories(workDir);

    expect(await loadEvidenceBaseline(workDir)).toBeNull();
  });

  it('returns null on corrupt baseline (no throw)', async () => {
    const workDir = await createTempDir();
    tempDirs.push(workDir);
    await ensureHarnessDirectories(workDir);

    await writeFile(getEvidenceBaselinePath(workDir), 'not json', 'utf8');
    expect(await loadEvidenceBaseline(workDir)).toBeNull();
  });

  it('writes pretty-printed JSON for human readability', async () => {
    const workDir = await createTempDir();
    tempDirs.push(workDir);
    await ensureHarnessDirectories(workDir);

    const baseline = buildEvidenceBaseline(makeEvidence());
    await saveEvidenceBaseline(workDir, baseline);

    const text = await readFile(getEvidenceBaselinePath(workDir), 'utf8');
    expect(text).toContain('"failedCheckNames"');
    expect(text.includes('\n')).toBe(true);
  });
});
