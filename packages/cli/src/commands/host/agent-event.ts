import { AGENT_ROLES } from '@harnessly/core';
import type { AgentRole } from '@harnessly/shared';

import { appendHarnessEvent } from '../../utils/events';
import { readActiveTaskId } from '../../utils/hosts';
import { printJson } from '../../utils/output';

type AgentEventName = 'started' | 'completed';

function readStringFlag(flags: Record<string, string | boolean>, name: string): string {
  return typeof flags[name] === 'string' ? flags[name].trim() : '';
}

/**
 * 把 sub-agent 输入字符串归一化为 v3-core 5 角色之一。
 * 接受两种写法：`requirement` 或 `harness-requirement`（host 文件名前缀形式），
 * 兼容主 agent 报告 sub-agent 名时可能带前缀的情况。
 */
function normalizeAgent(value: string): AgentRole {
  const stripped = value.startsWith('harness-') ? value.slice('harness-'.length) : value;
  if ((AGENT_ROLES as readonly string[]).includes(stripped)) {
    return stripped as AgentRole;
  }

  throw new Error(
    `缺少或非法 agent。允许值：${AGENT_ROLES.join(', ')}（亦接受 harness-<role> 前缀）`,
  );
}

function normalizeEvent(value: string): AgentEventName {
  if (value === 'started' || value === 'completed') {
    return value;
  }

  throw new Error('缺少或非法 event。允许值：started, completed');
}

export async function runHostAgentEvent(
  flags: Record<string, string | boolean>,
  positionals: string[],
): Promise<void> {
  const workDir = process.cwd();
  const agent = normalizeAgent(readStringFlag(flags, 'agent') || positionals[0] || '');
  const event = normalizeEvent(readStringFlag(flags, 'event') || positionals[1] || 'started');
  const activeTaskId = await readActiveTaskId(workDir);
  const taskId = readStringFlag(flags, 'task-id') || activeTaskId || null;
  const model = readStringFlag(flags, 'model') || null;

  await appendHarnessEvent(workDir, {
    type: `subagent.${event}`,
    role: agent,
    agent: `harness-${agent}`,
    taskId,
    model,
  });

  printJson({
    recorded: true,
    type: `subagent.${event}`,
    role: agent,
    agent: `harness-${agent}`,
    taskId,
    model,
  });
}
