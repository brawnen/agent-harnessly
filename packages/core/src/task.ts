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
  type StageMarker,
  type TaskContext,
  type TaskState,
  type TaskStatus,
  type TaskOwnerRole,
  type TaskSummary,
  serializeContract,
  serializeTaskReport,
} from '@harnessly/shared';

import { appendFeedbackEntry, buildFeedbackEntry } from './feedback-pool';
import { loadHarnessConfig } from './scaffold';

function createInitialTaskState(taskId: string): TaskState {
  const now = new Date().toISOString();

  return {
    taskId,
    status: 'active',
    currentStage: 'created',
    currentOwner: 'pm',
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

function ownerForStage(stage: StageMarker): TaskOwnerRole {
  switch (stage) {
    case 'spec':
      return 'requirement';
    case 'design':
      return 'designer';
    case 'execute':
    case 'retry':
      return 'developer';
    case 'review':
      return 'reviewer';
    case 'test':
      return 'tester';
    case 'commit_gate':
    case 'created':
    case 'failed':
      return 'pm';
  }
}

function touchState(state: TaskState, status: TaskStatus, stage: StageMarker): TaskState {
  return {
    ...state,
    status,
    currentStage: stage,
    currentOwner: ownerForStage(stage),
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

  private getRequirementFile(taskDir: string): string {
    return path.join(taskDir, 'requirement.md');
  }

  private getDesignFile(taskDir: string): string {
    return path.join(taskDir, 'design.md');
  }

  private getTaskBreakdownFile(taskDir: string): string {
    return path.join(taskDir, 'task-breakdown.md');
  }

  private getImplementationNotesFile(taskDir: string): string {
    return path.join(taskDir, 'implementation-notes.md');
  }

  private getReviewFile(taskDir: string): string {
    return path.join(taskDir, 'review.md');
  }

  private getResidentReviewFile(taskDir: string): string {
    return path.join(taskDir, 'resident-review.md');
  }

  private getTestReportFile(taskDir: string): string {
    return path.join(taskDir, 'test-report.md');
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
    ctx.state = touchState(ctx.state, 'active', 'spec');
    await writeFile(this.getContractFile(ctx.taskDir), serializeContract(contract), 'utf8');
    await this.saveState(ctx);
  }

  async saveRequirement(ctx: TaskContext, requirement: string): Promise<void> {
    await writeFile(this.getRequirementFile(ctx.taskDir), requirement, 'utf8');
  }

  async savePlan(ctx: TaskContext, plan: string): Promise<void> {
    ctx.plan = plan;
    ctx.state = touchState(ctx.state, 'active', 'design');
    await writeFile(this.getPlanFile(ctx.taskDir), plan, 'utf8');
    await this.saveState(ctx);
  }

  async saveDesign(ctx: TaskContext, design: string): Promise<void> {
    await writeFile(this.getDesignFile(ctx.taskDir), design, 'utf8');
  }

  async saveTaskBreakdown(ctx: TaskContext, taskBreakdown: string): Promise<void> {
    await writeFile(this.getTaskBreakdownFile(ctx.taskDir), taskBreakdown, 'utf8');
  }

  async saveImplementationNotes(ctx: TaskContext, notes: string): Promise<void> {
    await writeFile(this.getImplementationNotesFile(ctx.taskDir), notes, 'utf8');
  }

  async saveReviewMarkdown(ctx: TaskContext, review: string): Promise<void> {
    await writeFile(this.getReviewFile(ctx.taskDir), review, 'utf8');
  }

  async saveResidentReview(ctx: TaskContext, review: string): Promise<void> {
    await writeFile(this.getResidentReviewFile(ctx.taskDir), review, 'utf8');
  }

  async saveTestReport(ctx: TaskContext, report: string): Promise<void> {
    await writeFile(this.getTestReportFile(ctx.taskDir), report, 'utf8');
  }

  async savePrompt(ctx: TaskContext, prompt: string): Promise<string> {
    const filePath = this.getPromptFile(ctx.taskDir);
    await writeFile(filePath, prompt, 'utf8');
    return filePath;
  }

  async saveReport(ctx: TaskContext, report: TaskReport): Promise<void> {
    ctx.state = touchState(ctx.state, report.commitReady ? 'completed' : 'blocked', 'commit_gate');
    await writeFile(this.getReportFile(ctx.taskDir), serializeTaskReport(report), 'utf8');
    await this.saveState(ctx);

    // commit_gate 通过即把任务沉淀进 feedback-pool，给后续任务做 prompt 注入。
    // 失败/警告不进 pool（避免污染未来 prompt 的"可参考经验"语义）；
    // 写入异常不抛——pool 是 best-effort 的辅助资产，不影响 task 主流程。
    if (report.commitGate.decision === 'pass') {
      try {
        const entry = buildFeedbackEntry(ctx, report);
        await appendFeedbackEntry(ctx.workDir, entry);
      } catch {
        // 静默：feedback pool 写入失败不影响 task 主流程
      }
    }
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

  async markFailure(ctx: TaskContext, stage: StageMarker, reason: string): Promise<void> {
    ctx.state = {
      ...touchState(ctx.state, 'blocked', stage),
      lastFailureReason: reason,
      lastFailureStage: stage,
    };
    await this.saveState(ctx);
    await this.saveFeedback(ctx, reason);
  }

  async markRetrying(ctx: TaskContext): Promise<void> {
    ctx.state = {
      ...touchState(ctx.state, 'active', 'retry'),
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
            currentOwner: state.currentOwner ?? ownerForStage(state.currentStage),
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
