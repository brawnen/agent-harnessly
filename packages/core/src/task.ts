import crypto from 'node:crypto';
import type { Dirent } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  type TaskReport,
  parseTaskReport,
  parseContract,
  type Contract,
  type HarnessConfig,
  type TaskContext,
  type TaskState,
  type TaskStatus,
  type TaskSummary,
  serializeContract,
  serializeTaskReport,
} from '@harnessly/shared';

import { loadHarnessConfig } from './scaffold';

function createInitialTaskState(taskId: string): TaskState {
  const now = new Date().toISOString();

  return {
    taskId,
    status: 'created',
    currentStage: 'created',
    createdAt: now,
    updatedAt: now,
    completedStages: [],
    retryCount: 0,
  };
}

async function writeJson(filePath: string, payload: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

async function readJson<T>(filePath: string): Promise<T> {
  const text = await readFile(filePath, 'utf8');
  return JSON.parse(text) as T;
}

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'ENOENT'
  );
}

function touchState(state: TaskState, status: TaskStatus, stage: string): TaskState {
  return {
    ...state,
    status,
    currentStage: stage,
    updatedAt: new Date().toISOString(),
  };
}

export class TaskManager {
  private async loadConfig(workDir: string): Promise<HarnessConfig> {
    return loadHarnessConfig(workDir);
  }

  private getTasksDir(workDir: string): string {
    return path.join(workDir, '.harness', 'tasks');
  }

  private getActiveTaskFile(workDir: string): string {
    return path.join(workDir, '.harness', 'active-task.txt');
  }

  private getTaskDir(workDir: string, taskId: string): string {
    return path.join(this.getTasksDir(workDir), taskId);
  }

  private getStateFile(taskDir: string): string {
    return path.join(taskDir, 'state.json');
  }

  private getMetaFile(taskDir: string): string {
    return path.join(taskDir, 'task.json');
  }

  private getContractFile(taskDir: string): string {
    return path.join(taskDir, 'contract.yaml');
  }

  private getPlanFile(taskDir: string): string {
    return path.join(taskDir, 'plan.md');
  }

  private getPromptFile(taskDir: string): string {
    return path.join(taskDir, 'prompt.md');
  }

  private getReportFile(taskDir: string): string {
    return path.join(taskDir, 'report.json');
  }

  private getFeedbackFile(taskDir: string): string {
    return path.join(taskDir, 'feedback.md');
  }

  private generateTaskId(): string {
    const now = new Date();
    const date = now.toISOString().slice(0, 10).replace(/-/g, '');
    const time = now.toISOString().slice(11, 19).replace(/:/g, '');
    const rand = crypto.randomBytes(2).toString('hex');
    return `${date}-${time}-${rand}`;
  }

  async setActiveTask(workDir: string, taskId: string): Promise<void> {
    await writeFile(this.getActiveTaskFile(workDir), `${taskId}\n`, 'utf8');
  }

  async create(goal: string, workDir: string): Promise<TaskContext> {
    const taskId = this.generateTaskId();
    const taskDir = this.getTaskDir(workDir, taskId);
    const config = await this.loadConfig(workDir);
    const state = createInitialTaskState(taskId);

    await mkdir(taskDir, { recursive: true });
    await writeJson(this.getMetaFile(taskDir), { taskId, goal });
    await writeJson(this.getStateFile(taskDir), state);
    await this.setActiveTask(workDir, taskId);

    return {
      taskId,
      goal,
      workDir,
      taskDir,
      config,
      state,
    };
  }

  async saveState(ctx: TaskContext): Promise<void> {
    await writeJson(this.getStateFile(ctx.taskDir), ctx.state);
  }

  async saveContract(ctx: TaskContext, contract: Contract): Promise<void> {
    ctx.contract = contract;
    ctx.state = touchState(ctx.state, 'planning', 'contract');
    await writeFile(this.getContractFile(ctx.taskDir), serializeContract(contract), 'utf8');
    await this.saveState(ctx);
  }

  async savePlan(ctx: TaskContext, plan: string): Promise<void> {
    ctx.plan = plan;
    ctx.state = touchState(ctx.state, 'ready', 'plan');
    await writeFile(this.getPlanFile(ctx.taskDir), plan, 'utf8');
    await this.saveState(ctx);
  }

  async savePrompt(ctx: TaskContext, prompt: string): Promise<string> {
    const filePath = this.getPromptFile(ctx.taskDir);
    await writeFile(filePath, prompt, 'utf8');
    return filePath;
  }

  async saveReport(ctx: TaskContext, report: TaskReport): Promise<void> {
    ctx.state = touchState(ctx.state, report.commitReady ? 'passed' : 'failed', 'report');
    await writeFile(this.getReportFile(ctx.taskDir), serializeTaskReport(report), 'utf8');
    await this.saveState(ctx);
  }

  async saveFeedback(ctx: TaskContext, feedback: string): Promise<void> {
    ctx.feedback = feedback;
    await writeFile(this.getFeedbackFile(ctx.taskDir), feedback, 'utf8');
  }

  async clearFeedback(ctx: TaskContext): Promise<void> {
    ctx.feedback = undefined;
    try {
      await writeFile(this.getFeedbackFile(ctx.taskDir), '', 'utf8');
    } catch {
      // ignore
    }
  }

  async markFailure(ctx: TaskContext, stage: string, reason: string): Promise<void> {
    ctx.state = {
      ...touchState(ctx.state, 'failed', stage),
      lastFailureReason: reason,
      lastFailureStage: stage,
    };
    await this.saveState(ctx);
    await this.saveFeedback(ctx, reason);
  }

  async markRetrying(ctx: TaskContext): Promise<void> {
    ctx.state = {
      ...touchState(ctx.state, 'executing', 'retry'),
      retryCount: ctx.state.retryCount + 1,
    };
    await this.saveState(ctx);
  }

  async loadReport(taskId: string, workDir: string): Promise<TaskReport | null> {
    const taskDir = this.getTaskDir(workDir, taskId);

    try {
      return parseTaskReport(await readFile(this.getReportFile(taskDir), 'utf8'));
    } catch (error) {
      if (isMissingFileError(error)) {
        return null;
      }

      if (error instanceof Error) {
        throw new Error(`task ${taskId} 的 report.json 非法：${error.message}`);
      }

      throw error;
    }
  }

  async load(taskId: string, workDir: string): Promise<TaskContext> {
    const taskDir = this.getTaskDir(workDir, taskId);
    let meta: { taskId: string; goal: string };
    let state: TaskState;

    try {
      meta = await readJson<{ taskId: string; goal: string }>(this.getMetaFile(taskDir));
      state = await readJson<TaskState>(this.getStateFile(taskDir));
    } catch (error) {
      if (isMissingFileError(error)) {
        throw new Error(`task ${taskId} 不存在。可先执行 harnessly list 查看已有任务。`);
      }

      throw error;
    }

    const config = await this.loadConfig(workDir);

    const ctx: TaskContext = {
      taskId: meta.taskId,
      goal: meta.goal,
      workDir,
      taskDir,
      config,
      state,
    };

    try {
      ctx.contract = parseContract(await readFile(this.getContractFile(taskDir), 'utf8'));
    } catch (error) {
      if (!isMissingFileError(error)) {
        throw error;
      }
    }

    try {
      ctx.plan = await readFile(this.getPlanFile(taskDir), 'utf8');
    } catch {
      // 忽略未生成 plan 的场景
    }

    try {
      const feedback = await readFile(this.getFeedbackFile(taskDir), 'utf8');
      ctx.feedback = feedback.trim() || undefined;
    } catch {
      // 忽略未生成 feedback 的场景
    }

    return ctx;
  }

  async resume(taskId: string, workDir: string): Promise<TaskContext> {
    const ctx = await this.load(taskId, workDir);
    await this.setActiveTask(workDir, taskId);
    return ctx;
  }

  async listTasks(workDir: string): Promise<TaskSummary[]> {
    const tasksDir = this.getTasksDir(workDir);
    let entries: Dirent[];

    try {
      entries = await readdir(tasksDir, { withFileTypes: true });
    } catch (error) {
      if (isMissingFileError(error)) {
        return [];
      }

      throw error;
    }

    const summaries = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map(async (entry) => {
          const taskDir = path.join(tasksDir, entry.name);
          const meta = await readJson<{ taskId: string; goal: string }>(this.getMetaFile(taskDir));
          const state = await readJson<TaskState>(this.getStateFile(taskDir));

          return {
            taskId: meta.taskId,
            goal: meta.goal,
            status: state.status,
            currentStage: state.currentStage,
            retryCount: state.retryCount,
            lastFailureStage: state.lastFailureStage,
            updatedAt: state.updatedAt,
          } satisfies TaskSummary;
        }),
    );

    return summaries.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async getLatestTaskId(workDir: string): Promise<string | null> {
    const tasks = await this.listTasks(workDir);
    return tasks[0]?.taskId ?? null;
  }
}
