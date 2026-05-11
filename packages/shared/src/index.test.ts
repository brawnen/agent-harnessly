import { describe, expect, it } from 'vitest';

import {
  parseContract,
  parseFlatYaml,
  parseHarnessConfig,
  parseStringList,
  parseTaskReport,
  parseTemplateDraft,
  serializeContract,
  serializeHarnessConfig,
  serializeTaskReport,
  serializeTemplateDraft,
  type Contract,
  type HarnessConfig,
  type TaskReport,
  type TemplateDraft,
} from './index';

describe('shared contract helpers', () => {
  it('should round-trip contract fields', () => {
    const contract: Contract = {
      version: '2.0',
      taskId: 'task-1',
      goal: '修复状态展示',
      templateName: 'bug-fix',
      riskLevel: 'medium',
      estimatedComplexity: 'medium',
      requiredChecks: ['test'],
      scopeInclude: ['packages/cli/src'],
      scopeExclude: ['dist/**'],
      acceptanceCriteria: [
        { criterion: 'file:result.txt', verifiableBy: 'test' },
        { criterion: 'contains:result.txt::ok', verifiableBy: 'test' },
      ],
      outOfScope: ['重构 workflow'],
      linkedSpec: 'requirement.md',
      linkedDesign: 'design.md',
      createdAt: '2026-04-20T00:00:00.000Z',
    };

    expect(parseContract(serializeContract(contract))).toEqual(contract);
  });

  it('should round-trip harness config fields', () => {
    const config: HarnessConfig = {
      version: 1,
      projectType: 'node',
      requiredChecks: ['build', 'test'],
      defaultHost: 'claude-code',
      enabledHosts: ['claude-code', 'codex'],
      installRepoLocalShells: true,
      sourceOfTruthDir: '.harness/hosts',
      fallbackCreateTaskWithoutPlanner: true,
      codexUserPromptSubmitHookEnabled: true,
      adapterKind: 'codex',
      adapterCommand: 'codex exec --full-auto - < "$HARNESSLY_PROMPT_FILE"',
    };

    expect(parseHarnessConfig(serializeHarnessConfig(config))).toEqual(config);
  });

  it('should round-trip task report fields', () => {
    const report: TaskReport = {
      taskId: 'task-1',
      goal: '修复状态展示',
      finalStage: 'commit_gate',
      commitDecision: 'pass',
      artifacts: {
        requirement: 'requirement.md',
        contract: 'contract.yaml',
        design: 'design.md',
        taskBreakdown: 'task-breakdown.md',
        implementationNotes: 'implementation-notes.md',
        review: 'review.md',
        residentReview: 'resident-review.md',
        testReport: 'test-report.md',
        baselineEvidence: 'evidence/baseline.json',
        currentEvidence: 'evidence/current.json',
        baselineDiff: 'evidence/baseline-diff.json',
        commitSummary: 'commit-summary.md',
      },
      metrics: { llmCalls: 0, durationSeconds: 0, retries: 0 },
      createdAt: '2026-04-20T00:00:00.000Z',
      finishedAt: '2026-04-20T00:00:00.000Z',
      adapter: {
        kind: 'custom',
        command: 'echo ok',
        exitCode: 0,
        stdout: 'ok',
        stderr: '',
      },
      evidence: {
        checks: [
          {
            name: 'test',
            status: 'passed',
            command: 'pnpm test',
            detail: 'passed',
          },
        ],
        changedFiles: ['packages/cli/src/commands/status.ts'],
        lintWarningsTotal: 0,
        todoCount: 0,
        gitDirtyFiles: 1,
      },
      commitGate: {
        passed: true,
        decision: 'pass',
        failures: [],
        warnings: [],
        preExistingFailures: [],
      },
      commitReady: true,
      summary: '执行与最小验证通过',
      generatedAt: '2026-04-20T00:00:00.000Z',
    };

    expect(parseTaskReport(serializeTaskReport(report))).toEqual(report);
  });

  it('should round-trip template draft fields', () => {
    const template: TemplateDraft = {
      name: 'status-template',
      description: '修复状态展示',
      sourceTaskId: 'task-1',
      appliesTo: ['bug-fix', '状态展示'],
      templateName: 'bug-fix',
      riskLevel: 'low',
      requiredChecks: ['typecheck'],
      scopeInclude: ['packages/cli/src'],
      outOfScope: ['workflow'],
      acceptanceCriteria: ['status 可读'],
    };

    expect(parseTemplateDraft(serializeTemplateDraft(template))).toEqual(template);
  });

  it('should parse YAML list format for arrays', () => {
    const yaml = [
      'goal: test goal',
      'template_name: bug-fix',
      'risk_level: low',
      'scope_include:',
      '  - src/foo/',
      '  - src/bar/',
      'scope_exclude:',
      '  - docs/',
      'acceptance_criteria:',
      '  - test passes',
      'out_of_scope:',
      '  - refactor',
    ].join('\n');

    const contract = parseContract(yaml);

    expect(contract.scopeInclude).toEqual(['src/foo/', 'src/bar/']);
    expect(contract.scopeExclude).toEqual(['docs/']);
    expect(contract.acceptanceCriteria).toEqual([
      { criterion: 'test passes', verifiableBy: 'manual' },
    ]);
    expect(contract.outOfScope).toEqual(['refactor']);
  });

  it('should parse comma-separated format (backward compatible)', () => {
    const yaml = [
      'goal: test goal',
      'template_name: bug-fix',
      'risk_level: low',
      'scope_include: src/foo/, src/bar/',
      'scope_exclude: docs/',
      'acceptance_criteria: test passes',
      'out_of_scope: refactor',
    ].join('\n');

    const contract = parseContract(yaml);

    expect(contract.scopeInclude).toEqual(['src/foo/', 'src/bar/']);
    expect(contract.scopeExclude).toEqual(['docs/']);
  });

  it('should handle empty array notation []', () => {
    expect(parseStringList('[]')).toEqual([]);
    expect(parseStringList('')).toEqual([]);
    expect(parseStringList(undefined)).toEqual([]);

    const yaml = [
      'goal: test',
      'template_name: bug-fix',
      'risk_level: low',
      'scope_include: []',
      'scope_exclude:',
      'acceptance_criteria:',
      'out_of_scope:',
    ].join('\n');

    const contract = parseContract(yaml);
    expect(contract.scopeInclude).toEqual([]);
  });

  it('should parseFlatYaml with mixed kv and list items', () => {
    const yaml = [
      'key1: value1',
      'key2:',
      '  - item1',
      '  - item2',
      'key3: value3, value4',
    ].join('\n');

    const result = parseFlatYaml(yaml);
    expect(result['key1']).toBe('value1');
    expect(result['key2']).toBe('item1,item2');
    expect(result['key3']).toBe('value3, value4');
  });

  it('should reject malformed task report payload', () => {
    expect(() =>
      parseTaskReport(
        JSON.stringify({
          taskId: 'task-1',
          goal: '修复状态展示',
          finalStage: 'commit_gate',
          commitDecision: 'pass',
          artifacts: {},
          metrics: { llmCalls: 0, durationSeconds: 0, retries: 0 },
          createdAt: '2026-04-20T00:00:00.000Z',
          finishedAt: '2026-04-20T00:00:00.000Z',
          adapter: {
            kind: 'custom',
            command: 'echo ok',
            exitCode: 0,
            stdout: 'ok',
            stderr: '',
          },
          evidence: { checks: [], changedFiles: [], lintWarningsTotal: 0, todoCount: 0, gitDirtyFiles: 0 },
          commitGate: {
            passed: true,
            decision: 'pass',
            failures: [],
            warnings: [],
            preExistingFailures: [],
          },
          commitReady: 'true',
          summary: '执行与最小验证通过',
          generatedAt: '2026-04-20T00:00:00.000Z',
        }),
      ),
    ).toThrow('task report 校验失败');
  });
});
