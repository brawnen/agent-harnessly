import type {
  AdapterKind,
  AdapterOutput,
  EvidenceResult,
  StageMarker,
  TaskContext,
  TaskReport,
} from '@harnessly/shared';

import { checkContract, generateContract } from './contract';
import { collectChangedFiles, collectEvidence } from './evidence';
import {
  buildEvidenceBaseline,
  loadEvidenceBaseline,
  saveEvidenceBaseline,
} from './evidence-baseline';
import { createAdapter } from './execute';
import { loadFeedbackPool, pickRecentEntries } from './feedback-pool';
import { evaluateCommitGate } from './gate';
import { createLLMClientFromEnv } from './llm';
import { generatePlan } from './plan';
import { assemblePrompt } from './prompt';
import { createTaskReport } from './report';
import { runReviewStage } from './review';
import { TaskManager } from './task';
import { matchTemplate } from './template';

/**
 * resumeFrom 取值对应 v3-core 主阶段：
 * - 'spec': Planner 重出 contract.yaml（SPEC 工件）
 * - 'design': Planner 重出 plan.md（Design 工件）
 * - 'execute': 主 agent 重做实施
 */
export interface WorkflowRunOptions {
  adapterKind: AdapterKind;
  adapterCommand?: string;
  dryRun: boolean;
  resumeFrom?: 'spec' | 'design' | 'execute';
}

function markCompleted(ctx: TaskContext, stage: StageMarker): void {
  if (!ctx.state.completedStages.includes(stage)) {
    ctx.state.completedStages = [...ctx.state.completedStages, stage];
  }
}

/**
 * v3-core SPEC §6 工作流引擎。
 *
 * 主干 6 阶段（固定顺序、不允许扩展为 DAG）：
 *   spec → design → execute → review → test → commit_gate
 *
 * Phase 1 落地范围（结构层）：
 * - spec / design：仍由 LLM Planner + 确定性派生承担（sub-agent 接管见 Phase 2）
 * - execute：调 adapter 子进程
 * - review：占位静态检查（reviewer sub-agent 接管见 Phase 2）
 * - test：跑 evidence checks
 * - commit_gate：聚合三态决策（pass / block / warn）
 */
export class WorkflowEngine {
  constructor(private readonly manager: TaskManager) {}

  async run(
    ctx: TaskContext,
    options: WorkflowRunOptions,
  ): Promise<{ report?: TaskReport; dryRun: boolean }> {
    const startFrom = options.resumeFrom ?? 'spec';

    // ===== Stage 1: spec =====
    if (startFrom === 'spec') {
      await this.executeSpecStage(ctx);
      // ===== Stage 2: design =====
      await this.executeDesignStage(ctx);
    } else if (startFrom === 'design') {
      // 从 design 阶段恢复：spec 工件已存在，直接重出 design
      await this.executeDesignStage(ctx);
    } else if (startFrom === 'execute') {
      await this.manager.markRetrying(ctx);
    }

    if (options.dryRun) {
      return { dryRun: true };
    }

    // ===== Stage 3: execute =====
    const adapterResult = await this.executeExecuteStage(ctx, options);

    // ===== Stage 4: review =====
    const reviewFindings = await this.executeReviewStage(ctx);

    // ===== Stage 5: test =====
    const evidence = await this.executeTestStage(ctx, reviewFindings);

    // ===== Stage 6: commit_gate =====
    const report = await this.executeCommitGateStage(ctx, adapterResult, evidence);

    return {
      report,
      dryRun: false,
    };
  }

  /**
   * Stage 1: spec
   * 产出 contract.yaml（v3-core 中等价于 SPEC 工件）。
   * spec_gate：contract 合规性校验，失败即在 spec 阶段标记失败。
   */
  private async executeSpecStage(ctx: TaskContext): Promise<void> {
    ctx.state.status = 'contracting';
    ctx.state.currentStage = 'spec';
    await this.manager.saveState(ctx);

    const templateName = matchTemplate(ctx.goal);
    const contract = await generateContract({
      goal: ctx.goal,
      templateName,
      llmClient: createLLMClientFromEnv(),
    });
    const contractGate = checkContract(contract);

    if (!contractGate.passed) {
      await this.manager.markFailure(
        ctx,
        'spec',
        `spec_gate 失败: ${contractGate.failures.join('; ')}`,
      );
      throw new Error(`spec gate 失败: ${contractGate.failures.join('; ')}`);
    }

    await this.manager.saveContract(ctx, contract);
    markCompleted(ctx, 'spec');
    await this.manager.saveState(ctx);
  }

  /**
   * Stage 2: design
   * 基于 contract 派生 plan.md（v3-core 中等价于 Design 工件）。
   * Phase 2 中将由 designer sub-agent 接管，产出语义更丰富的 design.md。
   */
  private async executeDesignStage(ctx: TaskContext): Promise<void> {
    if (!ctx.contract) {
      await this.manager.markFailure(ctx, 'design', 'design 阶段缺少 contract（spec 工件）');
      throw new Error('design 阶段缺少 contract');
    }

    ctx.state.currentStage = 'design';
    await this.manager.saveState(ctx);

    const plan = generatePlan(ctx.contract);
    await this.manager.savePlan(ctx, plan);
    markCompleted(ctx, 'design');
    await this.manager.saveState(ctx);
  }

  /**
   * Stage 3: execute
   * 调用 adapter（headless 模式下走子进程；宿主主路径下由主 agent 直接执行）。
   */
  private async executeExecuteStage(
    ctx: TaskContext,
    options: WorkflowRunOptions,
  ): Promise<AdapterOutput> {
    ctx.state.status = 'executing';
    ctx.state.currentStage = 'execute';
    await this.manager.saveState(ctx);

    // 注入跨任务 feedback pool 摘录（Phase 3.1）：让 PM 借鉴历史经验
    try {
      const allEntries = await loadFeedbackPool(ctx.workDir);
      ctx.feedbackPool = pickRecentEntries(allEntries, {
        templateName: ctx.contract?.templateName,
      });
    } catch {
      // pool 加载失败不阻断主流程，prompt 退化为不含历史经验
      ctx.feedbackPool = [];
    }

    const prompt = assemblePrompt(ctx);
    const promptFile = await this.manager.savePrompt(ctx, prompt);
    const adapter = createAdapter(options.adapterKind);

    try {
      const adapterResult = await adapter.execute({
        taskId: ctx.taskId,
        workDir: ctx.workDir,
        prompt,
        promptFile,
        command: options.adapterCommand,
      });
      markCompleted(ctx, 'execute');
      return adapterResult;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.manager.markFailure(ctx, 'execute', `adapter 执行失败: ${message}`);
      throw error;
    }
  }

  /**
   * Stage 4: review
   * Phase 1 中为占位实现：基于 changedFiles 跑确定性静态检查（敏感文件、改动规模）。
   * Phase 2 中将由 reviewer sub-agent 接管，做语义层代码审查。
   */
  private async executeReviewStage(ctx: TaskContext): Promise<ReturnType<typeof runReviewStage>> {
    ctx.state.currentStage = 'review';
    await this.manager.saveState(ctx);

    // 复用 collectChangedFiles 的 git status 收集，避免重复调 collectEvidence
    const changedFiles = await collectChangedFiles(ctx.workDir);
    const findings = runReviewStage(changedFiles);

    markCompleted(ctx, 'review');
    await this.manager.saveState(ctx);
    return findings;
  }

  /**
   * Stage 5: test
   * 跑 evidence checks（required checks + scope check + level2 检查），
   * 并把 review 阶段的发现合入 evidence.checks 一起进 commit_gate。
   */
  private async executeTestStage(
    ctx: TaskContext,
    reviewFindings: ReturnType<typeof runReviewStage>,
  ): Promise<EvidenceResult> {
    ctx.state.status = 'verifying';
    ctx.state.currentStage = 'test';
    await this.manager.saveState(ctx);

    const evidence = await collectEvidence(ctx.workDir, ctx.config, ctx.contract);
    // review 阶段的 findings 合入 evidence.checks，让 commit_gate 一并裁决
    evidence.checks = [...reviewFindings, ...evidence.checks];

    markCompleted(ctx, 'test');
    await this.manager.saveState(ctx);
    return evidence;
  }

  /**
   * Stage 6: commit_gate
   * 三态聚合决策：
   * - 任何硬性失败 → block
   * - 无硬性失败但有软性告警 → warn
   * - 全部通过 → pass
   *
   * report.commitReady 仅在 decision==='pass' 时为 true，warn 不自动放行。
   */
  private async executeCommitGateStage(
    ctx: TaskContext,
    adapterResult: AdapterOutput,
    evidence: EvidenceResult,
  ): Promise<TaskReport> {
    ctx.state.currentStage = 'commit_gate';
    await this.manager.saveState(ctx);

    // Phase 3.3：加载 baseline，让 gate 区分新增回归与任务无关旧失败
    const baseline = await loadEvidenceBaseline(ctx.workDir);
    const commitGate = evaluateCommitGate(evidence, adapterResult.exitCode, { baseline });
    const report = createTaskReport(ctx, adapterResult, evidence, commitGate);
    await this.manager.saveReport(ctx, report);
    markCompleted(ctx, 'commit_gate');
    await this.manager.saveState(ctx);

    if (commitGate.decision === 'pass') {
      await this.manager.clearFeedback(ctx);
      // 任务通过即把当前 evidence 作为新 baseline 写回，让下一次任务从此快照对比
      try {
        await saveEvidenceBaseline(ctx.workDir, buildEvidenceBaseline(evidence));
      } catch {
        // baseline 写入失败不影响主流程：下一次任务退化为不带 baseline 的旧行为
      }
    } else {
      const failedChecks = report.evidence.checks
        .filter((check) => check.status === 'failed')
        .map((check) => `${check.name}: ${check.detail}`);
      const feedback = [
        `commit_gate 决策：${commitGate.decision}`,
        `adapter_exit_code: ${report.adapter.exitCode}`,
        failedChecks.length > 0 ? `failed_checks: ${failedChecks.join(' | ')}` : 'failed_checks: none',
        commitGate.warnings.length > 0 ? `warnings: ${commitGate.warnings.join(' | ')}` : 'warnings: none',
      ].join('\n');
      // block 标记在 test 阶段（test gate 是真实失败位点）；warn 标记在 commit_gate
      const failureStage: StageMarker = commitGate.decision === 'block' ? 'test' : 'commit_gate';
      await this.manager.markFailure(ctx, failureStage, feedback);
    }

    return report;
  }
}
