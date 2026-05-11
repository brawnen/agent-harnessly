import { TaskManager } from '@brawnen/harnessly-core';

import { readActiveTaskId } from '../utils/hosts';
import { printJson, printLines } from '../utils/output';

export async function runList(flags: Record<string, string | boolean>): Promise<void> {
  const manager = new TaskManager();
  const workDir = process.cwd();
  const [tasks, activeTaskId] = await Promise.all([
    manager.listTasks(workDir),
    readActiveTaskId(workDir),
  ]);

  if (flags.json === true) {
    printJson({
      activeTaskId,
      tasks,
    });
    return;
  }

  if (tasks.length === 0) {
    printLines(['Tasks', '- 当前没有 task。先执行 harnessly run "<goal>" 创建任务。']);
    return;
  }

  printLines([
    'Tasks',
    ...tasks.map(
      (task) =>
        `- ${task.taskId}${task.taskId === activeTaskId ? ' [active]' : ''}: status=${
          task.status
        }, stage=${task.currentStage}, retry=${task.retryCount}, updated_at=${
          task.updatedAt
        }, goal=${task.goal}`,
    ),
  ]);
}
