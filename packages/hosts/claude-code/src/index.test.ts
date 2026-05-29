import { describe, expect, it } from 'vitest';

import type { AgentManifest } from '@brawnen/harnessly-shared';
import { createHostManifest } from '@brawnen/harnessly-host-shared';

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

const TEST_WORK_DIR = '/tmp/test-project';

describe('renderClaudeCodeManagedFiles', () => {
  it('should render hooks pointing to Node.js bridge scripts', () => {
    const settings = renderClaudeCodeSettings(createHostManifest('claude-code', 'harnessly-local'), TEST_WORK_DIR);

    expect(settings).toContain('"SessionStart"');
    expect(settings).toContain('"UserPromptSubmit"');
    expect(settings).toContain('"Stop"');
    expect(settings).toContain('.harness/hosts/claude-code/hooks/session_start.js');
    expect(settings).toContain('.harness/hosts/claude-code/hooks/user_prompt_submit.js');
    expect(settings).toContain('.harness/hosts/claude-code/hooks/stop.js');
  });

  it('v2.1: should render trusted-workspace permissions (allow Bash, ask 删除/不可逆)', () => {
    const settings = renderClaudeCodeSettings(createHostManifest('claude-code', 'harnessly-local'), TEST_WORK_DIR);
    const parsed = JSON.parse(settings) as {
      permissions?: { defaultMode?: string; allow?: string[]; ask?: string[] };
    };

    expect(parsed.permissions).toBeDefined();
    // 默认放行：Edit/Write 自动接受 + Bash 整体 allow
    expect(parsed.permissions?.defaultMode).toBe('acceptEdits');
    expect(parsed.permissions?.allow).toContain('Bash');
    // 删除/不可逆操作走 ask（人工确认），不进 allow
    expect(parsed.permissions?.ask).toContain('Bash(rm *)');
    expect(parsed.permissions?.ask).toContain('Bash(git clean *)');
    expect(parsed.permissions?.ask).toContain('Bash(git push --force*)');
    expect(parsed.permissions?.ask).toContain('Bash(dd *)');
    // ask 列表不应误放进 allow
    expect(parsed.permissions?.allow).not.toContain('Bash(rm *)');
  });

  it('should NOT render legacy harness-planner / harness-evaluator files (v3-core only)', () => {
    const files = renderClaudeCodeManagedFiles(
      createHostManifest('claude-code', 'harnessly-local'),
      TEST_WORK_DIR,
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
      TEST_WORK_DIR,
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
      TEST_WORK_DIR,
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
      TEST_WORK_DIR,
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
    const files = renderClaudeCodeManagedFiles(createHostManifest('claude-code', 'harnessly-local'), TEST_WORK_DIR);

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

  it('should embed blockCount-based escalation hint in buildCompletionDecision', () => {
    // P0 v3: 反复阻断时追加"建议人工介入"提示，避免主 agent 死循环触发 Stop hook
    const io = renderClaudeCodeHookIo(createHostManifest('claude-code', 'harnessly-local'));

    expect(io).toContain('blockEscalation');
    expect(io).toContain('blockCount >= 3');
    expect(io).toContain('harnessly retry');
    expect(io).toContain('${blockEscalation}');
  });

  it('v2.1 (SPEC §6.4.4): buildPromptSubmitContext returns empty for lite preset', () => {
    // lite preset 由主 agent 直接承担三阶段，hook 完全不注入 spawn 指令，避免上下文污染
    const io = renderClaudeCodeHookIo(createHostManifest('claude-code', 'harnessly-local'));

    // 早 return 的判断条件
    expect(io).toContain("const preset = result?.preset || 'lite'");
    expect(io).toContain("if (preset === 'lite')");
    // full preset 路径含明确 MUST 措辞 + [Harnessly full preset] 标识
    expect(io).toContain('[Harnessly full preset]');
    expect(io).toContain('必须使用 Task tool spawn');
    expect(io).toContain('必须 spawn');
  });

  it('v2.1 阶段 2c 修订（C 方案）: managed files 不应含 .claude/commands/ 文件', () => {
    // 阶段 2c dogfood 发现 Claude Code 2.x 不识别 .claude/commands/*.md
    // （slash commands = Skills，路径在 ~/.claude/skills/）。按 SPEC §6.4.8
    // SHOULD 改走 marker fallback。renderer 不应再生成 .claude/commands/
    const files = renderClaudeCodeManagedFiles(
      createHostManifest('claude-code', 'harnessly-local'),
      TEST_WORK_DIR,
    );

    const commandsKeys = Object.keys(files).filter((p) => p.startsWith('.claude/commands/'));
    expect(commandsKeys).toEqual([]);
  });
});
