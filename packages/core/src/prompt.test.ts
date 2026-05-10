import { describe, expect, it } from 'vitest';

import type {
  Contract,
  FeedbackEntry,
  HarnessConfig,
  StageMarker,
  TaskContext,
  TaskState,
} from '@harnessly/shared';

import { assemblePrompt } from './prompt';

function makeConfig(): HarnessConfig {
  return {
    version: 1,
    projectType: 'node',
    requiredChecks: ['test'],
    defaultHost: 'claude-code',
    enabledHosts: ['claude-code'],
    installRepoLocalShells: true,
    sourceOfTruthDir: '.harness/hosts',
    fallbackCreateTaskWithoutPlanner: false,
    codexUserPromptSubmitHookEnabled: true,
    hostSubagents: {
      planner: { useHostPlanMode: false, models: { 'claude-code': 'haiku' } },
      evaluator: { models: { 'claude-code': 'sonnet' } },
    },
    adapterKind: 'claude-code',
    adapterCommand: '',
  };
}

function makeContract(): Contract {
  return {
    goal: '修复 status 命令展示',
    templateName: 'bug-fix',
    riskLevel: 'low',
    scopeInclude: ['packages/cli/src'],
    scopeExclude: ['dist/**'],
    acceptanceCriteria: ['list 输出包含 stage', 'status 输出包含 retry'],
    outOfScope: ['workflow 重构'],
  };
}

function makeCtx(stage: StageMarker, overrides: Partial<TaskContext> = {}): TaskContext {
  const now = '2026-04-20T00:00:00.000Z';
  const baseState: TaskState = {
    taskId: 'task-1',
    status: 'executing',
    currentStage: stage,
    createdAt: now,
    updatedAt: now,
    completedStages: ['spec', 'design'],
    retryCount: 0,
  };

  return {
    taskId: 'task-1',
    goal: '修复 status 命令展示',
    workDir: '/tmp/repo',
    taskDir: '/tmp/repo/.harness/tasks/task-1',
    config: makeConfig(),
    state: baseState,
    contract: makeContract(),
    plan: '1. 改 list 输出\n2. 改 status 输出\n',
    ...overrides,
  };
}

describe('assemblePrompt', () => {
  it('emits current_stage and retry_count headers', () => {
    const prompt = assemblePrompt(makeCtx('execute'));

    expect(prompt).toContain('current_stage: execute');
    expect(prompt).toContain('retry_count: 0');
  });

  it('renders execute-specific stage instructions', () => {
    const prompt = assemblePrompt(makeCtx('execute'));

    expect(prompt).toContain('## Stage Instructions (execute)');
    expect(prompt).toContain('严格按 plan.md 执行');
    expect(prompt).toContain('不要修改 contract.yaml / plan.md');
  });

  it('renders different instructions per stage', () => {
    const specPrompt = assemblePrompt(makeCtx('spec'));
    const designPrompt = assemblePrompt(makeCtx('design'));
    const reviewPrompt = assemblePrompt(makeCtx('review'));

    expect(specPrompt).toContain('## Stage Instructions (spec)');
    expect(specPrompt).toContain('只澄清需求');
    expect(specPrompt).not.toContain('严格按 plan.md 执行');

    expect(designPrompt).toContain('## Stage Instructions (design)');
    expect(designPrompt).toContain('列实施步骤、依赖、风险');

    expect(reviewPrompt).toContain('## Stage Instructions (review)');
    expect(reviewPrompt).toContain('给出 findings');
  });

  it('marks contract and plan as immutable artifacts', () => {
    const prompt = assemblePrompt(makeCtx('execute'));

    expect(prompt).toContain('## Contract (SPEC 工件，不可修改)');
    expect(prompt).toContain('## Plan (DESIGN 工件，不可修改)');
  });

  it('shows missing markers when contract or plan is absent', () => {
    const ctx = makeCtx('execute', { contract: undefined, plan: undefined });
    const prompt = assemblePrompt(ctx);

    expect(prompt).toContain('## Contract (SPEC 工件)\n- missing');
    expect(prompt).toContain('## Plan (DESIGN 工件)\n- missing');
  });

  it('includes retry context only when retryCount > 0 or feedback present', () => {
    const fresh = assemblePrompt(makeCtx('execute'));
    expect(fresh).not.toContain('## Retry Context');

    const retried = assemblePrompt(
      makeCtx('execute', {
        state: {
          taskId: 'task-1',
          status: 'executing',
          currentStage: 'execute',
          createdAt: '2026-04-20T00:00:00.000Z',
          updatedAt: '2026-04-20T00:00:00.000Z',
          completedStages: ['spec', 'design'],
          retryCount: 2,
          lastFailureStage: 'test',
          lastFailureReason: 'lint failed',
        },
        feedback: 'lint failed: 3 errors in src/foo.ts',
      }),
    );

    expect(retried).toContain('## Retry Context');
    expect(retried).toContain('retry_count: 2');
    expect(retried).toContain('last_failure_stage: test');
    expect(retried).toContain('### Feedback');
    expect(retried).toContain('lint failed: 3 errors in src/foo.ts');
  });

  it('includes acceptance criteria from contract', () => {
    const prompt = assemblePrompt(makeCtx('execute'));

    expect(prompt).toContain('list 输出包含 stage');
    expect(prompt).toContain('status 输出包含 retry');
  });

  it('omits feedback pool section when ctx.feedbackPool is empty or undefined', () => {
    const without = assemblePrompt(makeCtx('execute'));
    const empty = assemblePrompt(makeCtx('execute', { feedbackPool: [] }));

    expect(without).not.toContain('Feedback Pool');
    expect(empty).not.toContain('Feedback Pool');
  });

  it('renders feedback pool section when ctx.feedbackPool has entries', () => {
    const entries: FeedbackEntry[] = [
      {
        taskId: 'task-prev-1',
        goal: '上次修了 list 输出',
        decision: 'pass',
        completedAt: '2026-04-19T00:00:00.000Z',
        completedStages: ['spec', 'design', 'execute', 'review', 'test', 'commit_gate'],
        retryCount: 0,
        template: 'bug-fix',
        riskLevel: 'low',
        changedFilesCount: 3,
      },
      {
        taskId: 'task-prev-2',
        goal: '前一个任务卡在 test',
        decision: 'block',
        completedAt: '2026-04-19T05:00:00.000Z',
        completedStages: ['spec', 'design', 'execute', 'review', 'test'],
        retryCount: 2,
        template: 'feature-simple',
        riskLevel: 'medium',
        changedFilesCount: 5,
        failureStage: 'test',
        failureReason: 'lint failed',
      },
    ];

    const prompt = assemblePrompt(makeCtx('execute', { feedbackPool: entries }));

    expect(prompt).toContain('## Feedback Pool (历史经验摘录)');
    expect(prompt).toContain('[task-prev-1]');
    expect(prompt).toContain('上次修了 list 输出');
    expect(prompt).toContain('pass');
    expect(prompt).toContain('[task-prev-2]');
    // 失败条带 stage 装饰
    expect(prompt).toContain('@test');
  });
});
