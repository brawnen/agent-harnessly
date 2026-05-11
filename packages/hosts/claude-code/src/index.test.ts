import { describe, expect, it } from 'vitest';

import type { AgentManifest } from '@harnessly/shared';
import { createHostManifest } from '@harnessly/host-shared';

import {
  renderClaudeCodeHookIo,
  renderClaudeCodeManagedFiles,
  renderClaudeCodeSessionStartHook,
  renderClaudeCodeSettings,
  renderClaudeCodeStopHook,
  renderClaudeCodeUserPromptSubmitHook,
} from './index';

function makeManifest(role: AgentManifest['role'], overrides: Partial<AgentManifest> = {}): AgentManifest {
  return {
    role,
    displayName: `Harness ${role}`,
    description: `${role} agent`,
    stage: 'review',
    enabled: true,
    planModeEnabled: false,
    models: { 'claude-code': 'sonnet' },
    toolWhitelist: ['Read', 'Bash'],
    prompt: `# ${role}\n你是 ${role}。`,
    ...overrides,
  };
}

describe('renderClaudeCodeManagedFiles', () => {
  it('should render hooks pointing to Node.js bridge scripts', () => {
    const settings = renderClaudeCodeSettings(createHostManifest('claude-code', 'harnessly-local'));

    expect(settings).toContain('"SessionStart"');
    expect(settings).toContain('"UserPromptSubmit"');
    expect(settings).toContain('"Stop"');
    expect(settings).toContain('.harness/hosts/claude-code/hooks/session_start.js');
    expect(settings).toContain('.harness/hosts/claude-code/hooks/user_prompt_submit.js');
    expect(settings).toContain('.harness/hosts/claude-code/hooks/stop.js');
  });

  it('should NOT render legacy harness-planner / harness-evaluator files (v3-core only)', () => {
    const files = renderClaudeCodeManagedFiles(
      createHostManifest('claude-code', 'harnessly-local'),
      {
        agentManifests: [makeManifest('requirement', { stage: 'spec' })],
      },
    );

    expect(files['.claude/agents/harness-planner.md']).toBeUndefined();
    expect(files['.claude/agents/harness-evaluator.md']).toBeUndefined();
  });

  it('should render only enabled v3-core 5-role sub-agents', () => {
    const files = renderClaudeCodeManagedFiles(
      createHostManifest('claude-code', 'harnessly-local'),
      {
        agentManifests: [
          makeManifest('requirement', { stage: 'spec' }),
          makeManifest('designer', { stage: 'design' }),
          makeManifest('developer', { stage: 'execute', enabled: false }),
          makeManifest('reviewer', { stage: 'review' }),
          makeManifest('tester', { stage: 'test' }),
        ],
      },
    );

    expect(files['.claude/agents/harness-requirement.md']).toContain('name: harness-requirement');
    expect(files['.claude/agents/harness-designer.md']).toContain('name: harness-designer');
    expect(files['.claude/agents/harness-reviewer.md']).toContain('name: harness-reviewer');
    expect(files['.claude/agents/harness-tester.md']).toContain('name: harness-tester');

    // developer.enabled=false → 不渲染
    expect(files['.claude/agents/harness-developer.md']).toBeUndefined();
  });

  it('renders the configured model from manifest into frontmatter', () => {
    const files = renderClaudeCodeManagedFiles(
      createHostManifest('claude-code', 'harnessly-local'),
      {
        agentManifests: [
          makeManifest('reviewer', { models: { 'claude-code': 'opus' } }),
        ],
      },
    );

    expect(files['.claude/agents/harness-reviewer.md']).toContain('model: opus');
  });

  it('produces no agent files when agentManifests is omitted', () => {
    const files = renderClaudeCodeManagedFiles(
      createHostManifest('claude-code', 'harnessly-local'),
    );

    // 没传 manifest 也没有任何复合别名兜底（v3-core 不再生成）
    const agentFiles = Object.keys(files).filter((p) => p.startsWith('.claude/agents/'));
    expect(agentFiles).toEqual([]);
  });
});

describe('Claude Code hook bridge scripts', () => {
  it('should embed manifest commands in shared hook I/O module', () => {
    const io = renderClaudeCodeHookIo(createHostManifest('claude-code', 'harnessly-local'));

    expect(io).toContain('function readHookPayload');
    expect(io).toContain('function buildSessionStartContext');
    expect(io).toContain('function buildPromptSubmitContext');
    expect(io).toContain('function buildCompletionDecision');
    expect(io).toContain('harnessly-local host session-start');
    expect(io).toContain('harnessly-local host user-prompt-submit');
    expect(io).toContain('harnessly-local host completion-gate');
    expect(io).toContain('module.exports');
  });

  it('hook hint scripts no longer fall back to harness-planner / harness-evaluator literals', () => {
    const io = renderClaudeCodeHookIo(createHostManifest('claude-code', 'harnessly-local'));

    expect(io).not.toContain("'harness-planner'");
    expect(io).not.toContain("'harness-evaluator'");
    // result.evaluatorAgent 是 v2 字段，已不再读取
    expect(io).not.toContain('result.evaluatorAgent');
  });

  it('should render SessionStart hook bridge that reads stdin and calls CLI', () => {
    const hook = renderClaudeCodeSessionStartHook();

    expect(hook).toContain("require('./shared/claude-code-hook-io.js')");
    expect(hook).toContain('readHookPayload()');
    expect(hook).toContain('buildSessionStartContext(result)');
    expect(hook).toContain('continue: true');
    expect(hook).toContain('additionalContext');
  });

  it('should render UserPromptSubmit hook bridge that forwards prompt via env', () => {
    const hook = renderClaudeCodeUserPromptSubmitHook();

    expect(hook).toContain('resolvePayloadPrompt(payload)');
    expect(hook).toContain('HARNESSLY_HOOK_PROMPT');
    expect(hook).toContain('buildPromptSubmitContext(result, prompt)');
    expect(hook).toContain('continue: true');
  });

  it('should render Stop hook bridge that extracts stopReason and calls completion-gate', () => {
    const hook = renderClaudeCodeStopHook();

    expect(hook).toContain('buildCompletionDecision');
    expect(hook).toContain('HARNESSLY_HOOK_LAST_MESSAGE');
    expect(hook).toContain('payload?.stopReason');
    expect(hook).toContain('COMPLETION_GATE_COMMAND');
  });

  it('should include all 4 hook scripts in managed files', () => {
    const files = renderClaudeCodeManagedFiles(createHostManifest('claude-code', 'harnessly-local'));

    expect(files['.harness/hosts/claude-code/hooks/session_start.js']).toBeTruthy();
    expect(files['.harness/hosts/claude-code/hooks/user_prompt_submit.js']).toBeTruthy();
    expect(files['.harness/hosts/claude-code/hooks/stop.js']).toBeTruthy();
    expect(files['.harness/hosts/claude-code/hooks/shared/claude-code-hook-io.js']).toBeTruthy();
    expect(files['.harness/hosts/claude-code/hooks/user_prompt_submit.js']).toContain('HARNESSLY_HOOK_PROMPT');
  });

  it('should handle failure gracefully in all three hook bridges', () => {
    const sessionHook = renderClaudeCodeSessionStartHook();
    const promptHook = renderClaudeCodeUserPromptSubmitHook();
    const stopHook = renderClaudeCodeStopHook();

    expect(sessionHook).toContain('catch (error)');
    expect(promptHook).toContain('catch (error)');
    expect(stopHook).toContain('catch (error)');
  });
});
