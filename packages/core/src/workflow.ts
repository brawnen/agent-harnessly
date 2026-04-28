import type { AdapterKind, TaskContext, TaskReport } from '@harnessly/shared';

import { checkContract, generateContract } from './contract';
import { collectEvidence } from './evidence';
import { createAdapter } from './execute';
import { evaluateCommitGate } from './gate';
import { createLLMClientFromEnv } from './llm';
import { generatePlan } from './plan';
import { assemblePrompt } from './prompt';
import { createTaskReport } from './report';
import { TaskManager } from './task';
import { matchTemplate } from './template';

export interface WorkflowRunOptions {
  adapterKind: AdapterKind;
  adapterCommand?: string;
  dryRun: boolean;
  resumeFrom?: 'contract' | 'plan' | 'execute';
}

function markCompleted(ctx: TaskContext, stage: string): void {
  if (!ctx.state.completedStages.includes(stage)) {
    ctx.state.completedStages = [...ctx.state.completedStages, stage];
  }
}

export class WorkflowEngine {
  constructor(private readonly manager: TaskManager) {}

  async run(ctx: TaskContext, options: WorkflowRunOptions): Promise<{ report?: TaskReport; dryRun: boolean }> {
    const startFrom = options.resumeFrom ?? 'contract';

    if (startFrom === 'contract') {
      ctx.state.status = 'contracting';
      ctx.state.currentStage = 'contract';
      await this.manager.saveState(ctx);

      const templateName = matchTemplate(ctx.goal);
      const contract = await generateContract({
        goal: ctx.goal,
        templateName,
        llmClient: createLLMClientFromEnv(),
      });
      const contractGate = checkContract(contract);

      if (!contractGate.passed) {
        await this.manager.markFailure(ctx, 'contract_gate', contractGate.failures.join('; '));
        throw new Error(`contract gate 失败: ${contractGate.failures.join('; ')}`);
      }

      await this.manager.saveContract(ctx, contract);
      markCompleted(ctx, 'contract');
      await this.manager.saveState(ctx);

      const plan = generatePlan(contract);
      await this.manager.savePlan(ctx, plan);
      markCompleted(ctx, 'plan');
      await this.manager.saveState(ctx);
    } else if (startFrom === 'execute') {
      await this.manager.markRetrying(ctx);
    }

    if (options.dryRun) {
      return { dryRun: true };
    }

    ctx.state.status = 'executing';
    ctx.state.currentStage = 'execute';
    await this.manager.saveState(ctx);

    const prompt = assemblePrompt(ctx);
    const promptFile = await this.manager.savePrompt(ctx, prompt);
    const adapter = createAdapter(options.adapterKind);
    let adapterResult;
    try {
      adapterResult = await adapter.execute({
        taskId: ctx.taskId,
        workDir: ctx.workDir,
        prompt,
        promptFile,
        command: options.adapterCommand,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.manager.markFailure(ctx, 'execute', `adapter 执行失败: ${message}`);
      throw error;
    }
    markCompleted(ctx, 'execute');

    ctx.state.status = 'verifying';
    ctx.state.currentStage = 'verify';
    await this.manager.saveState(ctx);

    const evidence = await collectEvidence(ctx.workDir, ctx.config, ctx.contract);
    const commitGate = evaluateCommitGate(evidence, adapterResult.exitCode);
    const report = createTaskReport(ctx, adapterResult, evidence, commitGate);
    await this.manager.saveReport(ctx, report);
    markCompleted(ctx, 'verify');
    markCompleted(ctx, 'report');
    await this.manager.saveState(ctx);

    if (report.commitReady) {
      await this.manager.clearFeedback(ctx);
    } else {
      const failedChecks = report.evidence.checks
        .filter((check) => check.status === 'failed')
        .map((check) => `${check.name}: ${check.detail}`);
      const feedback = [
        `上次执行未通过 commit gate。`,
        `adapter_exit_code: ${report.adapter.exitCode}`,
        failedChecks.length > 0 ? `failed_checks: ${failedChecks.join(' | ')}` : 'failed_checks: none',
      ].join('\n');
      await this.manager.markFailure(ctx, 'verify', feedback);
    }

    return {
      report,
      dryRun: false,
    };
  }
}
