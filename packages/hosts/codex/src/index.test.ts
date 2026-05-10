import { describe, expect, it } from 'vitest';

import type { AgentManifest } from '@harnessly/shared';
import { createHostManifest } from '@harnessly/host-shared';

import {
  renderCodexConfig,
  renderCodexEvaluatorAgent,
  renderCodexHooks,
  renderCodexManagedFiles,
  renderCodexPlannerAgent,
} from './index';

function makeManifest(role: AgentManifest['role'], overrides: Partial<AgentManifest> = {}): AgentManifest {
  return {
    role,
    displayName: `Harness ${role}`,
    description: `${role} agent`,
    stage: 'review',
    enabled: true,
    models: { codex: 'gpt-5.4' },
    toolWhitelist: ['Read', 'Bash'],
    prompt: `# ${role}\n你是 ${role}。`,
    ...overrides,
  };
}

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
    expect(files['.codex/agents/harness-planner.toml']).toContain('默认走结构化产出路径');
    expect(files['.codex/agents/harness-planner.toml']).toContain('不进入 plan mode');
    expect(files['.codex/agents/harness-evaluator.toml']).toContain('model = "gpt-5.5"');
  });

  it('should incrementally render 5-role sub-agents when agentManifests are provided', () => {
    const files = renderCodexManagedFiles(createHostManifest('codex', 'harnessly-local'), {
      agentManifests: [
        makeManifest('requirement', { stage: 'spec' }),
        makeManifest('designer', { stage: 'design' }),
        makeManifest('developer', { stage: 'execute', enabled: false }),
        makeManifest('reviewer', { stage: 'review' }),
        makeManifest('tester', { stage: 'test' }),
      ],
    });

    // 老复合别名保留
    expect(files['.codex/agents/harness-planner.toml']).toBeDefined();
    expect(files['.codex/agents/harness-evaluator.toml']).toBeDefined();

    // 4 个 enabled=true 角色被渲染
    expect(files['.codex/agents/harness-requirement.toml']).toContain('name = "harness-requirement"');
    expect(files['.codex/agents/harness-designer.toml']).toContain('name = "harness-designer"');
    expect(files['.codex/agents/harness-reviewer.toml']).toContain('name = "harness-reviewer"');
    expect(files['.codex/agents/harness-tester.toml']).toContain('name = "harness-tester"');

    // developer.enabled=false → 不渲染
    expect(files['.codex/agents/harness-developer.toml']).toBeUndefined();
  });

  it('should preserve old 2-role behavior when agentManifests are absent', () => {
    const files = renderCodexManagedFiles(createHostManifest('codex', 'harnessly-local'));

    expect(files['.codex/agents/harness-requirement.toml']).toBeUndefined();
    expect(files['.codex/agents/harness-reviewer.toml']).toBeUndefined();
    expect(files['.codex/agents/harness-planner.toml']).toBeDefined();
    expect(files['.codex/agents/harness-evaluator.toml']).toBeDefined();
  });
});
