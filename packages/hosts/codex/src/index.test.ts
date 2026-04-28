import { describe, expect, it } from 'vitest';

import { createHostManifest } from '@harnessly/host-shared';

import {
  renderCodexConfig,
  renderCodexEvaluatorAgent,
  renderCodexHooks,
  renderCodexManagedFiles,
  renderCodexPlannerAgent,
} from './index';

describe('codex host renderer', () => {
  it('should render config.toml with hooks path', () => {
    expect(renderCodexConfig()).toContain('codex_hooks = true');
  });

  it('should render UserPromptSubmit by default for host-first intake', () => {
    const hooks = renderCodexHooks(createHostManifest('codex', 'harnessly-local'));

    expect(hooks).toContain('"SessionStart"');
    expect(hooks).toContain('"Stop"');
    expect(hooks).toContain('"UserPromptSubmit"');
    expect(hooks).toContain('user_prompt_submit.js');
    expect(hooks).toContain('session_start.js');
    expect(hooks).toContain('stop.js');
  });

  it('should omit UserPromptSubmit only when explicitly disabled', () => {
    const hooks = renderCodexHooks(createHostManifest('codex', 'harnessly-local'), {
      userPromptSubmitHookEnabled: false,
    });

    expect(hooks).not.toContain('"UserPromptSubmit"');
    expect(hooks).not.toContain('user_prompt_submit.js');
  });

  it('should render managed hook runtime files', () => {
    const files = renderCodexManagedFiles(createHostManifest('codex', 'harnessly-local'));

    expect(files['.harness/hosts/codex/hooks/user_prompt_submit.js']).toContain(
      'HARNESSLY_HOOK_PROMPT',
    );
    expect(files['.harness/hosts/codex/hooks/session_start.js']).toContain(
      "buildCodexHookOutput('SessionStart'",
    );
    expect(files['.harness/hosts/codex/hooks/shared/codex-hook-io.js']).toContain(
      'function buildCodexHookOutput',
    );
    expect(files['.harness/hosts/codex/hooks/shared/codex-hook-io.js']).toContain(
      "result?.action === 'delegate_to_planner'",
    );
  });

  it('should render planner and evaluator sub-agent definitions', () => {
    const files = renderCodexManagedFiles(createHostManifest('codex', 'harnessly-local'));

    expect(renderCodexPlannerAgent()).toContain('name = "harness-planner"');
    expect(renderCodexEvaluatorAgent()).toContain('name = "harness-evaluator"');
    expect(files['.codex/agents/harness-planner.toml']).toContain('Harnessly Planner');
    expect(files['.codex/agents/harness-evaluator.toml']).toContain('Harnessly Evaluator');
    expect(files['.codex/agents/harness-planner.toml']).toContain(
      'developer_instructions = """',
    );
    expect(files['.codex/agents/harness-evaluator.toml']).toContain(
      'developer_instructions = """',
    );
    expect(files['.codex/agents/harness-planner.toml']).not.toContain('[agent]');
    expect(files['.codex/agents/harness-planner.toml']).not.toContain('[instructions]');
    expect(files['.codex/agents/harness-evaluator.toml']).not.toContain('[agent]');
    expect(files['.codex/agents/harness-evaluator.toml']).not.toContain('[instructions]');
    expect(files['.codex/agents/harness-planner.toml']).toContain(
      'harnessly host agent-event --agent harness-planner --event started',
    );
    expect(files['.codex/agents/harness-evaluator.toml']).toContain(
      'harnessly host agent-event --agent harness-evaluator --event started',
    );
  });

  it('should render configured models and plan mode instructions', () => {
    const files = renderCodexManagedFiles(createHostManifest('codex', 'harnessly-local'), {
      subagents: {
        planner: {
          useHostPlanMode: false,
          models: {
            codex: 'gpt-5.5-mini',
          },
        },
        evaluator: {
          models: {
            codex: 'gpt-5.5',
          },
        },
      },
    });

    expect(files['.codex/agents/harness-planner.toml']).toContain('model = "gpt-5.5-mini"');
    expect(files['.codex/agents/harness-planner.toml']).toContain('不要求使用宿主 plan mode');
    expect(files['.codex/agents/harness-evaluator.toml']).toContain('model = "gpt-5.5"');
  });
});
