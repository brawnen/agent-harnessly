import { describe, expect, it } from 'vitest';

import type { AgentManifest } from '@brawnen/harnessly-shared';
import { createHostManifest } from '@brawnen/harnessly-host-shared';

import {
  renderCodexConfig,
  renderCodexHooks,
  renderCodexHookIo,
  renderCodexManagedFiles,
} from './index';

function makeManifest(role: AgentManifest['role'], overrides: Partial<AgentManifest> = {}): AgentManifest {
  return {
    role,
    displayName: `Harness ${role}`,
    description: `${role} agent`,
    stage: 'review',
    enabled: true,
    planModeEnabled: false,
    models: { codex: 'gpt-5.5' },
    toolWhitelist: ['Read', 'Bash'],
    prompt: `# ${role}\n你是 ${role}。`,
    ...overrides,
  };
}

const TEST_WORK_DIR = '/tmp/test-project';

describe('codex host renderer', () => {
  it('should render config.toml with hooks path', () => {
    expect(renderCodexConfig()).toContain('codex_hooks = true');
  });

  it('should render UserPromptSubmit by default for host-first intake', () => {
    const hooks = renderCodexHooks(createHostManifest('codex', 'harnessly-local'), TEST_WORK_DIR);

    expect(hooks).toContain('"SessionStart"');
    expect(hooks).toContain('"Stop"');
    expect(hooks).toContain('"UserPromptSubmit"');
    expect(hooks).toContain('user_prompt_submit.js');
    expect(hooks).toContain('session_start.js');
    expect(hooks).toContain('stop.js');
  });

  it('renders hooks.json with only the Codex-supported top-level hooks key', () => {
    const parsed = JSON.parse(renderCodexHooks(createHostManifest('codex', 'harnessly-local'), TEST_WORK_DIR));

    expect(Object.keys(parsed)).toEqual(['hooks']);
    expect(parsed.hooks).toHaveProperty('SessionStart');
    expect(parsed.hooks).toHaveProperty('Stop');
    expect(parsed.hooks).toHaveProperty('UserPromptSubmit');
  });

  it('should omit UserPromptSubmit only when explicitly disabled', () => {
    const hooks = renderCodexHooks(createHostManifest('codex', 'harnessly-local'), TEST_WORK_DIR, {
      userPromptSubmitHookEnabled: false,
    });

    expect(hooks).not.toContain('"UserPromptSubmit"');
    expect(hooks).not.toContain('user_prompt_submit.js');
  });

  it('should render managed hook runtime files', () => {
    const files = renderCodexManagedFiles(createHostManifest('codex', 'harnessly-local'), TEST_WORK_DIR);

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

  it('should NOT render legacy harness-planner / harness-evaluator files (v3-core only)', () => {
    const files = renderCodexManagedFiles(createHostManifest('codex', 'harnessly-local'), TEST_WORK_DIR, {
      agentManifests: [makeManifest('requirement', { stage: 'spec' })],
    });

    expect(files['.codex/agents/harness-planner.toml']).toBeUndefined();
    expect(files['.codex/agents/harness-evaluator.toml']).toBeUndefined();
  });

  it('should render only enabled v3-core 5-role sub-agents', () => {
    const files = renderCodexManagedFiles(createHostManifest('codex', 'harnessly-local'), TEST_WORK_DIR, {
      agentManifests: [
        makeManifest('requirement', { stage: 'spec' }),
        makeManifest('designer', { stage: 'design' }),
        makeManifest('developer', { stage: 'execute', enabled: false }),
        makeManifest('reviewer', { stage: 'review' }),
        makeManifest('tester', { stage: 'test' }),
      ],
    });

    expect(files['.codex/agents/harness-requirement.toml']).toContain('name = "harness-requirement"');
    expect(files['.codex/agents/harness-designer.toml']).toContain('name = "harness-designer"');
    expect(files['.codex/agents/harness-reviewer.toml']).toContain('name = "harness-reviewer"');
    expect(files['.codex/agents/harness-tester.toml']).toContain('name = "harness-tester"');

    // developer.enabled=false → 不渲染
    expect(files['.codex/agents/harness-developer.toml']).toBeUndefined();
  });

  it('renders the configured codex model from manifest', () => {
    const files = renderCodexManagedFiles(createHostManifest('codex', 'harnessly-local'), TEST_WORK_DIR, {
      agentManifests: [
        makeManifest('reviewer', { models: { codex: 'gpt-5.5' } }),
      ],
    });

    expect(files['.codex/agents/harness-reviewer.toml']).toContain('model = "gpt-5.5"');
  });

  it('produces no agent files when agentManifests is omitted', () => {
    const files = renderCodexManagedFiles(createHostManifest('codex', 'harnessly-local'), TEST_WORK_DIR);

    const agentFiles = Object.keys(files).filter((p) => p.startsWith('.codex/agents/'));
    expect(agentFiles).toEqual([]);
  });

  it('should embed blockCount-based escalation hint in buildCompletionDecision', () => {
    // P0 v3: 反复阻断时追加"建议人工介入"提示，避免主 agent 死循环触发 Stop hook
    const io = renderCodexHookIo(createHostManifest('codex', 'harnessly-local'));

    expect(io).toContain('blockEscalation');
    expect(io).toContain('blockCount >= 3');
    expect(io).toContain('harnessly retry');
    expect(io).toContain('${blockEscalation}');
  });

  it('v2.1 (SPEC §6.4.4): buildPromptSubmitContext returns empty for lite preset', () => {
    // lite preset 由主 agent 直接承担三阶段，hook 完全不注入 spawn 指令
    const io = renderCodexHookIo(createHostManifest('codex', 'harnessly-local'));

    expect(io).toContain("const preset = result?.preset || 'lite'");
    expect(io).toContain("if (preset === 'lite')");
    expect(io).toContain('[Harnessly full preset]');
    expect(io).toContain('必须使用 Task tool spawn');
    expect(io).toContain('必须 spawn');
  });
});
