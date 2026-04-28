import { describe, expect, it } from 'vitest';

import { createHostManifest } from '@harnessly/host-shared';

import {
  renderClaudeCodeEvaluatorAgent,
  renderClaudeCodeManagedFiles,
  renderClaudeCodePlannerAgent,
  renderClaudeCodeSettings,
} from './index';

describe('renderClaudeCodeSettings', () => {
  it('should render claude hooks from host manifest commands', () => {
    const settings = renderClaudeCodeSettings(createHostManifest('claude-code', 'harnessly-local'));

    expect(settings).toContain('"SessionStart"');
    expect(settings).toContain('"UserPromptSubmit"');
    expect(settings).toContain('"Stop"');
    expect(settings).toContain('harnessly-local host session-start');
    expect(settings).toContain('harnessly-local host completion-gate');
  });

  it('should render planner and evaluator sub-agent definitions', () => {
    const files = renderClaudeCodeManagedFiles(createHostManifest('claude-code', 'harnessly-local'));

    expect(renderClaudeCodePlannerAgent()).toContain('name: harness-planner');
    expect(renderClaudeCodeEvaluatorAgent()).toContain('name: harness-evaluator');
    expect(files['.claude/agents/harness-planner.md']).toContain('Harness Planner');
    expect(files['.claude/agents/harness-evaluator.md']).toContain('Harness Evaluator');
    expect(files['.claude/agents/harness-planner.md']).toContain(
      'harnessly host agent-event --agent harness-planner --event started',
    );
    expect(files['.claude/agents/harness-evaluator.md']).toContain(
      'harnessly host agent-event --agent harness-evaluator --event started',
    );
  });

  it('should render configured models and plan mode instructions', () => {
    const files = renderClaudeCodeManagedFiles(createHostManifest('claude-code', 'harnessly-local'), {
      planner: {
        useHostPlanMode: false,
        models: {
          'claude-code': 'sonnet',
        },
      },
      evaluator: {
        models: {
          'claude-code': 'opus',
        },
      },
    });

    expect(files['.claude/agents/harness-planner.md']).toContain('model: sonnet');
    expect(files['.claude/agents/harness-planner.md']).toContain('不要求使用宿主 plan mode');
    expect(files['.claude/agents/harness-evaluator.md']).toContain('model: opus');
  });
});
