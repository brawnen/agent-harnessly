import { describe, expect, it } from 'vitest';

import { runReviewStage } from './review';

describe('runReviewStage (placeholder static check)', () => {
  it('returns a single skipped finding when there are no changes', () => {
    const findings = runReviewStage([]);

    expect(findings).toHaveLength(1);
    expect(findings[0].name).toBe('review.empty_change_set');
    expect(findings[0].status).toBe('skipped');
  });

  it('flags large change sets above the threshold', () => {
    const changedFiles = Array.from({ length: 60 }, (_, i) => `src/file-${i}.ts`);
    const findings = runReviewStage(changedFiles);

    const largeFinding = findings.find((f) => f.name === 'review.large_change_set');
    expect(largeFinding?.status).toBe('failed');
    expect(largeFinding?.detail).toContain('60');
  });

  it('passes change set size when within the threshold', () => {
    const findings = runReviewStage(['src/a.ts', 'src/b.ts']);

    const sizeFinding = findings.find((f) => f.name === 'review.change_set_size');
    expect(sizeFinding?.status).toBe('passed');
  });

  it('flags sensitive files (.env, credentials, keys)', () => {
    const findings = runReviewStage([
      'src/index.ts',
      '.env',
      'config/credentials.json',
      'keys/id_rsa',
      'cert.pem',
    ]);

    const sensitiveFinding = findings.find((f) => f.name === 'review.sensitive_file');
    expect(sensitiveFinding?.status).toBe('failed');
    expect(sensitiveFinding?.detail).toContain('.env');
    expect(sensitiveFinding?.detail).toContain('credentials.json');
    expect(sensitiveFinding?.detail).toContain('id_rsa');
    expect(sensitiveFinding?.detail).toContain('cert.pem');
  });

  it('marks sensitive_file as passed when no sensitive paths detected', () => {
    const findings = runReviewStage(['src/foo.ts', 'docs/readme.md']);

    const sensitiveFinding = findings.find((f) => f.name === 'review.sensitive_file');
    expect(sensitiveFinding?.status).toBe('passed');
  });

  it('does not match .envrc or env-like prefixes that are not actually .env files', () => {
    const findings = runReviewStage(['src/envvars.ts', 'src/secret-handler.ts']);

    const sensitiveFinding = findings.find((f) => f.name === 'review.sensitive_file');
    expect(sensitiveFinding?.status).toBe('passed');
  });
});
