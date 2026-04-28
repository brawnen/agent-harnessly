import { appendHarnessEvent } from '../../utils/events';
import { readActiveTaskId } from '../../utils/hosts';
import { printJson } from '../../utils/output';

type AgentName = 'harness-planner' | 'harness-evaluator';
type AgentEventName = 'started' | 'completed';

function readStringFlag(flags: Record<string, string | boolean>, name: string): string {
  return typeof flags[name] === 'string' ? flags[name].trim() : '';
}

function normalizeAgent(value: string): AgentName {
  if (value === 'harness-planner' || value === 'harness-evaluator') {
    return value;
  }

  throw new Error('缺少或非法 agent。允许值：harness-planner, harness-evaluator');
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
    agent,
    taskId,
    model,
  });

  printJson({
    recorded: true,
    type: `subagent.${event}`,
    agent,
    taskId,
    model,
  });
}
