import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  parseAgentManifestYaml,
  serializeAgentManifestYaml,
  type AgentManifest,
} from '@harnessly/shared';

import {
  AGENT_ROLES,
  collectEnabledRoles,
  getAgentDiskFiles,
  getDefaultAgentManifest,
  getRoleForStage,
  listAgentFiles,
  loadAgentManifest,
  loadAgentManifests,
  pickRecommendedAgent,
  writeDefaultAgentManifests,
} from './agent';
import { ensureHarnessDirectories } from './scaffold';

async function createTempDir(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), 'harnessly-agent-test-'));
}

describe('AgentManifest YAML codec (shared)', () => {
  it('round-trips a manifest through serialize / parse (prompt is dropped intentionally)', () => {
    const original: AgentManifest = {
      role: 'reviewer',
      displayName: 'Harness Reviewer',
      description: '审查改动',
      stage: 'review',
      enabled: true,
      models: {
        'claude-code': 'sonnet',
        codex: 'gpt-5.4',
      },
      toolWhitelist: ['Read', 'Bash', 'Glob'],
      prompt: '## Reviewer\n你是 reviewer\n',
    };

    const text = serializeAgentManifestYaml(original);
    const parsed = parseAgentManifestYaml(text);

    expect(parsed.role).toBe(original.role);
    expect(parsed.displayName).toBe(original.displayName);
    expect(parsed.description).toBe(original.description);
    expect(parsed.stage).toBe(original.stage);
    expect(parsed.enabled).toBe(original.enabled);
    expect(parsed.models).toEqual(original.models);
    expect(parsed.toolWhitelist).toEqual(original.toolWhitelist);
    // prompt 故意不进 YAML，反序列化后为空
    expect(parsed.prompt).toBe('');
  });

  it('omits empty model entries on parse', () => {
    const manifest: AgentManifest = {
      role: 'requirement',
      displayName: 'R',
      description: 'd',
      stage: 'spec',
      enabled: true,
      models: { 'claude-code': 'haiku' },
      toolWhitelist: ['Read'],
      prompt: '',
    };

    const parsed = parseAgentManifestYaml(serializeAgentManifestYaml(manifest));
    expect(parsed.models).toEqual({ 'claude-code': 'haiku' });
    expect(parsed.models.codex).toBeUndefined();
  });
});

describe('default agent manifests', () => {
  it('returns one manifest per AGENT_ROLES entry', () => {
    for (const role of AGENT_ROLES) {
      const manifest = getDefaultAgentManifest(role);
      expect(manifest.role).toBe(role);
      expect(manifest.prompt.length).toBeGreaterThan(0);
    }
  });

  it('returns a fresh deep copy each call', () => {
    const a = getDefaultAgentManifest('requirement');
    const b = getDefaultAgentManifest('requirement');

    a.toolWhitelist.push('mutated');
    expect(b.toolWhitelist).not.toContain('mutated');
  });

  it('marks developer disabled by default (host main path covers execute)', () => {
    expect(getDefaultAgentManifest('developer').enabled).toBe(false);
    expect(getDefaultAgentManifest('requirement').enabled).toBe(true);
    expect(getDefaultAgentManifest('reviewer').enabled).toBe(true);
  });

  it('aligns each role.stage with its expected workflow stage', () => {
    expect(getDefaultAgentManifest('requirement').stage).toBe('spec');
    expect(getDefaultAgentManifest('designer').stage).toBe('design');
    expect(getDefaultAgentManifest('developer').stage).toBe('execute');
    expect(getDefaultAgentManifest('reviewer').stage).toBe('review');
    expect(getDefaultAgentManifest('tester').stage).toBe('test');
  });
});

describe('writeDefaultAgentManifests + loadAgentManifests', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(
      tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
    );
  });

  it('creates 5 yaml + 5 prompt.md files when none exist', async () => {
    const workDir = await createTempDir();
    tempDirs.push(workDir);
    await ensureHarnessDirectories(workDir);

    const results = await writeDefaultAgentManifests(workDir);

    expect(results).toHaveLength(5);
    for (const result of results) {
      expect(result.manifestStatus).toBe('created');
      expect(result.promptStatus).toBe('created');
    }

    const files = await listAgentFiles(workDir);
    expect(files).toHaveLength(10);
    for (const role of AGENT_ROLES) {
      expect(files).toContain(`${role}.yaml`);
      expect(files).toContain(`${role}.prompt.md`);
    }
  });

  it('skips existing files when force is false (protects user edits)', async () => {
    const workDir = await createTempDir();
    tempDirs.push(workDir);
    await ensureHarnessDirectories(workDir);

    // 第一次写入
    await writeDefaultAgentManifests(workDir);

    // 用户改了 reviewer prompt
    const { promptPath } = getAgentDiskFiles(workDir, 'reviewer');
    await writeFile(promptPath, '# 用户自定义 reviewer\n', 'utf8');

    const results = await writeDefaultAgentManifests(workDir);

    const reviewer = results.find((r) => r.role === 'reviewer');
    expect(reviewer?.promptStatus).toBe('skipped');

    const text = await readFile(promptPath, 'utf8');
    expect(text).toBe('# 用户自定义 reviewer\n');
  });

  it('overwrites with force=true', async () => {
    const workDir = await createTempDir();
    tempDirs.push(workDir);
    await ensureHarnessDirectories(workDir);

    await writeDefaultAgentManifests(workDir);
    const { promptPath } = getAgentDiskFiles(workDir, 'reviewer');
    await writeFile(promptPath, '# stale\n', 'utf8');

    const results = await writeDefaultAgentManifests(workDir, true);
    const reviewer = results.find((r) => r.role === 'reviewer');
    expect(reviewer?.promptStatus).toBe('updated');

    const text = await readFile(promptPath, 'utf8');
    expect(text).toContain('Harness Reviewer Agent');
  });

  it('loadAgentManifest returns null for a missing role', async () => {
    const workDir = await createTempDir();
    tempDirs.push(workDir);
    await ensureHarnessDirectories(workDir);

    const result = await loadAgentManifest(workDir, 'requirement');
    expect(result).toBeNull();
  });

  it('loadAgentManifests returns the 5 default manifests after init', async () => {
    const workDir = await createTempDir();
    tempDirs.push(workDir);
    await ensureHarnessDirectories(workDir);
    await writeDefaultAgentManifests(workDir);

    const manifests = await loadAgentManifests(workDir);

    expect(manifests).toHaveLength(5);
    expect(manifests.map((m) => m.role)).toEqual([
      'requirement',
      'designer',
      'developer',
      'reviewer',
      'tester',
    ]);

    const reviewer = manifests.find((m) => m.role === 'reviewer');
    expect(reviewer?.prompt).toContain('Harness Reviewer Agent');
  });

  it('loadAgentManifests skips orphan yaml without prompt.md (uses empty prompt)', async () => {
    const workDir = await createTempDir();
    tempDirs.push(workDir);
    await ensureHarnessDirectories(workDir);

    const { manifestPath } = getAgentDiskFiles(workDir, 'reviewer');
    await mkdir(path.dirname(manifestPath), { recursive: true });
    await writeFile(manifestPath, serializeAgentManifestYaml(getDefaultAgentManifest('reviewer')), 'utf8');

    const manifests = await loadAgentManifests(workDir);
    const reviewer = manifests.find((m) => m.role === 'reviewer');

    expect(reviewer).toBeDefined();
    // prompt.md 不存在 → 空串兜底
    expect(reviewer?.prompt).toBe('');
  });
});

describe('getRoleForStage', () => {
  it('maps the four stages with dedicated roles', () => {
    expect(getRoleForStage('spec')).toBe('requirement');
    expect(getRoleForStage('design')).toBe('designer');
    expect(getRoleForStage('review')).toBe('reviewer');
    expect(getRoleForStage('test')).toBe('tester');
  });

  it('returns null for stages without a dedicated sub-agent (execute/commit_gate/markers)', () => {
    expect(getRoleForStage('execute')).toBeNull();
    expect(getRoleForStage('commit_gate')).toBeNull();
    expect(getRoleForStage('created')).toBeNull();
    expect(getRoleForStage('failed')).toBeNull();
    expect(getRoleForStage('retry')).toBeNull();
  });
});

describe('collectEnabledRoles', () => {
  it('collects only enabled=true roles from a manifests array', () => {
    const enabled = collectEnabledRoles(AGENT_ROLES.map((role) => getDefaultAgentManifest(role)));

    // developer defaults to enabled=false
    expect(enabled.has('requirement')).toBe(true);
    expect(enabled.has('designer')).toBe(true);
    expect(enabled.has('reviewer')).toBe(true);
    expect(enabled.has('tester')).toBe(true);
    expect(enabled.has('developer')).toBe(false);
    expect(enabled.size).toBe(4);
  });

  it('returns an empty set when all manifests are disabled', () => {
    const manifests = AGENT_ROLES.map((role) => ({
      ...getDefaultAgentManifest(role),
      enabled: false,
    }));

    expect(collectEnabledRoles(manifests).size).toBe(0);
  });
});

describe('pickRecommendedAgent', () => {
  const allEnabled = new Set<import('@harnessly/shared').AgentRole>([
    'requirement',
    'designer',
    'developer',
    'reviewer',
    'tester',
  ]);

  describe('intent=new_task', () => {
    it('returns harness-requirement when requirement is enabled', () => {
      expect(pickRecommendedAgent('new_task', null, allEnabled)).toBe('harness-requirement');
    });

    it('falls back to harness-planner composite alias when requirement is disabled', () => {
      const enabled = new Set<import('@harnessly/shared').AgentRole>(['designer', 'reviewer']);
      expect(pickRecommendedAgent('new_task', null, enabled)).toBe('harness-planner');
    });
  });

  describe('intent=resume_task', () => {
    it('routes spec → harness-requirement', () => {
      expect(pickRecommendedAgent('resume_task', 'spec', allEnabled)).toBe('harness-requirement');
    });

    it('routes design → harness-designer', () => {
      expect(pickRecommendedAgent('resume_task', 'design', allEnabled)).toBe('harness-designer');
    });

    it('routes review → harness-reviewer', () => {
      expect(pickRecommendedAgent('resume_task', 'review', allEnabled)).toBe('harness-reviewer');
    });

    it('routes test → harness-tester', () => {
      expect(pickRecommendedAgent('resume_task', 'test', allEnabled)).toBe('harness-tester');
    });

    it('returns null for execute (main agent owns this stage)', () => {
      expect(pickRecommendedAgent('resume_task', 'execute', allEnabled)).toBeNull();
    });

    it('returns null for commit_gate / created / failed / retry', () => {
      expect(pickRecommendedAgent('resume_task', 'commit_gate', allEnabled)).toBeNull();
      expect(pickRecommendedAgent('resume_task', 'created', allEnabled)).toBeNull();
      expect(pickRecommendedAgent('resume_task', 'failed', allEnabled)).toBeNull();
    });

    it('returns null when stage is null', () => {
      expect(pickRecommendedAgent('resume_task', null, allEnabled)).toBeNull();
    });

    it('returns null when stage role is not enabled', () => {
      const onlyTester = new Set<import('@harnessly/shared').AgentRole>(['tester']);
      expect(pickRecommendedAgent('resume_task', 'spec', onlyTester)).toBeNull();
    });
  });

  describe('intent=completion_review', () => {
    it('routes review failure → harness-reviewer', () => {
      expect(pickRecommendedAgent('completion_review', 'review', allEnabled)).toBe(
        'harness-reviewer',
      );
    });

    it('routes test failure → harness-tester', () => {
      expect(pickRecommendedAgent('completion_review', 'test', allEnabled)).toBe('harness-tester');
    });

    it('falls back to harness-evaluator when stage has no dedicated role', () => {
      expect(pickRecommendedAgent('completion_review', 'commit_gate', allEnabled)).toBe(
        'harness-evaluator',
      );
      expect(pickRecommendedAgent('completion_review', 'execute', allEnabled)).toBe(
        'harness-evaluator',
      );
    });

    it('falls back to harness-evaluator when stage is null', () => {
      expect(pickRecommendedAgent('completion_review', null, allEnabled)).toBe(
        'harness-evaluator',
      );
    });

    it('falls back to harness-evaluator when role exists but is not enabled', () => {
      const empty = new Set<import('@harnessly/shared').AgentRole>();
      expect(pickRecommendedAgent('completion_review', 'review', empty)).toBe(
        'harness-evaluator',
      );
    });
  });
});
