import { describe, expect, it } from 'vitest';

import type { AgentManifest } from '@harnessly/shared';

import {
  createHostManifest,
  getRoleAgentFilePath,
  parseHostManifest,
  renderClaudeCodeSubagentFile,
  renderCodexSubagentFile,
  serializeHostManifest,
} from './index';

const SAMPLE_REVIEWER: AgentManifest = {
  role: 'reviewer',
  displayName: 'Harness Reviewer',
  description: '审查改动',
  stage: 'review',
  enabled: true,
  planModeEnabled: false,
  models: {
    'claude-code': 'sonnet',
    codex: 'gpt-5.5',
  },
  toolWhitelist: ['Read', 'Bash', 'Glob'],
  prompt: '# Reviewer\n你是 reviewer agent。',
};

describe('host shared helpers', () => {
  it('should round-trip a codex host manifest', () => {
    const manifest = createHostManifest('codex', 'harnessly-local');

    expect(parseHostManifest(serializeHostManifest(manifest))).toEqual(manifest);
  });
});

describe('getRoleAgentFilePath', () => {
  it('returns claude-code md path for known host', () => {
    expect(getRoleAgentFilePath('claude-code', 'reviewer')).toBe(
      '.claude/agents/harness-reviewer.md',
    );
  });

  it('returns codex toml path for known host', () => {
    expect(getRoleAgentFilePath('codex', 'tester')).toBe('.codex/agents/harness-tester.toml');
  });

  it('returns null for gemini-cli (no sub-agent file structure yet)', () => {
    expect(getRoleAgentFilePath('gemini-cli', 'reviewer')).toBeNull();
  });
});

describe('renderClaudeCodeSubagentFile', () => {
  it('emits frontmatter with name / model / tools', () => {
    const text = renderClaudeCodeSubagentFile(SAMPLE_REVIEWER);

    expect(text.startsWith('---\n')).toBe(true);
    expect(text).toContain('name: harness-reviewer');
    expect(text).toContain('description: 审查改动');
    expect(text).toContain('model: sonnet');
    expect(text).toContain('  - Read');
    expect(text).toContain('  - Bash');
    expect(text).toContain('  - Glob');
  });

  it('embeds prompt body after frontmatter', () => {
    const text = renderClaudeCodeSubagentFile(SAMPLE_REVIEWER);

    expect(text).toContain('# Reviewer');
    expect(text).toContain('你是 reviewer agent。');
  });

  it('falls back to default tools when toolWhitelist is empty', () => {
    const text = renderClaudeCodeSubagentFile({ ...SAMPLE_REVIEWER, toolWhitelist: [] });

    expect(text).toContain('  - Read');
    expect(text).toContain('  - Bash');
  });

  it('falls back to placeholder body when prompt is empty', () => {
    const text = renderClaudeCodeSubagentFile({ ...SAMPLE_REVIEWER, prompt: '' });

    expect(text).toContain('# Harness reviewer');
  });
});

describe('renderCodexSubagentFile', () => {
  it('emits TOML with quoted name / model and triple-quoted instructions', () => {
    const text = renderCodexSubagentFile(SAMPLE_REVIEWER);

    expect(text).toContain('# Managed by Harnessly');
    expect(text).toContain('name = "harness-reviewer"');
    expect(text).toContain('description = "审查改动"');
    expect(text).toContain('model = "gpt-5.5"');
    expect(text).toContain('developer_instructions = """');
    expect(text).toContain('你是 reviewer agent。');
  });

  it('falls back to default codex model when codex entry missing', () => {
    const text = renderCodexSubagentFile({
      ...SAMPLE_REVIEWER,
      models: { 'claude-code': 'sonnet' },
    });

    expect(text).toContain('model = "gpt-5.5"');
  });

  it('does NOT contain [section] headers (Codex agents use top-level keys)', () => {
    const text = renderCodexSubagentFile(SAMPLE_REVIEWER);

    expect(text).not.toContain('[agent]');
    expect(text).not.toContain('[instructions]');
  });
});
