import type {
  AdapterKind,
  AdapterOutput,
  Contract,
  EvidenceResult,
  EvidenceCheckResult,
  StageMarker,
  TaskContext,
  TaskReport,
} from '@brawnen/harnessly-shared';
import {
  PRESET_STAGE_MAP,
  validateDesignMarkdown,
  validateRequirementMarkdown,
} from '@brawnen/harnessly-shared';

import { checkContract, generateContract } from './contract';
import { runArtifactGuard } from './artifact-guard';
import { collectChangedFiles, collectEvidence } from './evidence';
import {
  buildBaselineDiff,
  buildEvidenceBaseline,
  buildEvidenceSnapshot,
  loadEvidenceBaseline,
  saveBaselineDiff,
  saveEvidenceBaseline,
  saveEvidenceSnapshot,
} from './evidence-baseline';
import { createAdapter } from './execute';
import { loadFeedbackPool, pickRecentEntries } from './feedback-pool';
import { evaluateCommitGate } from './gate';
import { createLLMClientFromEnv } from './llm';
import { generatePlan } from './plan';
import { assemblePrompt } from './prompt';
import { createTaskReport } from './report';
import { promoteTaskArtifacts } from './archive';
import { renderResidentReview } from './resident-review';
import { runReviewStage } from './review';
import { runStructureCheck } from './structure-check';
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

function renderList(items: readonly string[], fallback: string): string[] {
  return (items.length > 0 ? items : [fallback]).map((item) => `- ${item}`);
}

function renderRequirementMarkdown(contract: Contract): string {
  return [
    '# Requirement',
    '',
    '## Goal',
    contract.goal,
    '',
    '## In Scope',
    ...renderList(contract.scopeInclude, contract.goal),
    '',
    '## Out of Scope',
    ...renderList(contract.outOfScope, '与目标无关的重构'),
    '',
    '## Affected Modules',
    ...renderList(contract.scopeInclude, '待实现阶段确认'),
    '',
    '## Acceptance Criteria',
    ...renderList(
      contract.acceptanceCriteria.map((item) => item.criterion),
      '验收标准已在 contract.yaml 中结构化记录',
    ),
    '',
    '## Risks',
    ...renderList([`risk_level=${contract.riskLevel}`], '无'),
    '',
    '## Open Questions',
    '- 无',
    '',
  ].join('\n');
}

function renderDesignMarkdown(contract: Contract): string {
  return [
    '# Design',
    '',
    '## Decision',
    '- 方案 A：在现有工作流中补齐缺失工件和校验，保持当前 CLI 与 host 入口。',
    '- 方案 B：重写工作流引擎并替换现有任务状态模型。',
    '- 采用方案 A：影响范围较小，能保持现有入口兼容。',
    '',
    '## Interfaces',
    '- Contract 使用 version/task_id/scope/acceptance_criteria 等 v3-core 字段。',
    '- TaskState 使用 current_owner 与 active/blocked/completed/aborted 状态。',
    '- Workflow 阶段产出 requirement.md、design.md、task-breakdown.md、implementation-notes.md、review.md、test-report.md。',
    '',
    '## Impact',
    ...renderList(contract.scopeInclude, 'packages/core/src/workflow.ts'),
    '',
    '## Feasibility Self-Check',
    '- scope 是否清晰：是，来自 contract.yaml 的 scope.include 与 scope.exclude。',
    '- design 是否完整：是，包含决策、接口、影响范围。',
    '- task-breakdown 是否合理：是，拆成可验证的阶段产物。',
    '- 风险是否可控：是，保持兼容字段并用测试验证。',
    '- 是否与现有架构冲突：否，继续使用 repo-local .harness 事实源。',
    '',
  ].join('\n');
}

function renderTaskBreakdown(contract: Contract): string {
  return [
    '# Task Breakdown',
    '',
    '1. [ ] SPEC 工件',
    '   - deps: []',
    '   - acceptance: requirement.md 与 contract.yaml 存在并通过校验',
    '2. [ ] DESIGN 工件',
    '   - deps: [1]',
    '   - acceptance: design.md 与 task-breakdown.md 存在并通过校验',
    '3. [ ] EXECUTE 工件',
    '   - deps: [2]',
    '   - acceptance: implementation-notes.md 记录执行顺序与偏离',
    '4. [ ] REVIEW/TEST 工件',
    '   - deps: [3]',
    '   - acceptance: review.md、test-report.md、report.json 可供 gate 使用',
    '',
    `> goal: ${contract.goal}`,
    '',
  ].join('\n');
}

function renderImplementationNotes(adapterResult: AdapterOutput): string {
  return [
    '# Implementation Notes',
    '',
    '## Order',
    '- 执行 adapter 或宿主主 agent 产出的代码变更',
    '',
    '## Deviations from Design',
    '- 无',
    '',
    '## Pitfalls',
    adapterResult.exitCode === 0
      ? '- 无'
      : `- adapter exit code = ${adapterResult.exitCode}`,
    '',
    '## TODOs Introduced',
    '- 无',
    '',
    '## Sub-task Progress',
    '- [x] SPEC 工件',
    '- [x] DESIGN 工件',
    '- [x] EXECUTE 工件',
    '- [ ] REVIEW/TEST 工件',
    '',
  ].join('\n');
}

function renderReviewMarkdown(taskId: string, findings: readonly EvidenceCheckResult[]): string {
  const failed = findings.filter((finding) => finding.status === 'failed');
  const decision = failed.length > 0 ? 'block_execute' : 'pass';
  const lines = [
    '# Review',
    '',
    '## Decision',
    decision,
    '',
    '## Block Scope',
    decision === 'pass' ? 'minimal' : 'minimal',
    '',
    '## Findings',
  ];

  if (failed.length === 0) {
    lines.push('- none');
  } else {
    failed.forEach((finding, index) => {
      lines.push(
        `- id: F-${taskId}-${index + 1}`,
        '  severity: P1',
        `  description: ${finding.detail}`,
        `  file: ${finding.name}`,
        '  line: N/A',
        `  fix_hint: ${finding.command}`,
        '  recurrent_pattern: false',
      );
    });
  }

  lines.push('');
  return lines.join('\n');
}

function renderTestReport(contract: Contract, evidence: EvidenceResult): string {
  return [
    '# Test Report',
    '',
    '## Acceptance Coverage',
    ...contract.acceptanceCriteria.map(
      (item) => `- ${item.criterion}: ${item.verifiableBy} / ${item.testHint ?? '无 test_hint'}`,
    ),
    '',
    '## Baseline-Diff',
    '- baseline-diff: evidence/baseline-diff.json',
    `- lint_warnings_total: ${evidence.lintWarningsTotal}`,
    `- todo_count: ${evidence.todoCount}`,
    '',
    '## Externally-Run Validations',
    '- 无',
    '',
  ].join('\n');
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
  private baselineSnapshot: ReturnType<typeof buildEvidenceSnapshot> | null = null;

  async run(
    ctx: TaskContext,
    options: WorkflowRunOptions,
  ): Promise<{ report?: TaskReport; dryRun: boolean }> {
    const startFrom = options.resumeFrom ?? 'spec';

    // v2.1: 按 ctx.state.preset 决定本任务实际跑哪些阶段
    const enabledStages = new Set(PRESET_STAGE_MAP[ctx.state.preset]);
    const hasDesign = enabledStages.has('design');
    const hasReview = enabledStages.has('review');
    const hasCommitGate = enabledStages.has('commit_gate');

    // lite preset 不允许 resumeFrom='design'（无 design 阶段）
    if (startFrom === 'design' && !hasDesign) {
      throw new Error(
        `lite preset 任务不存在 design 阶段，无法从 'design' 恢复。可改用 'spec' 重出或 '/harness-upgrade' 升档为 full。`,
      );
    }

    // ===== Stage 1: spec =====
    if (startFrom === 'spec') {
      await this.executeSpecStage(ctx);
      // ===== Stage 2: design (full only) =====
      if (hasDesign) {
        await this.executeDesignStage(ctx);
      }
    } else if (startFrom === 'design') {
      // 从 design 阶段恢复：spec 工件已存在，直接重出 design（仅 full 可达）
      await this.executeDesignStage(ctx);
    } else if (startFrom === 'execute') {
      await this.manager.markRetrying(ctx);
    }

    if (options.dryRun) {
      return { dryRun: true };
    }

    // ===== Stage 3: execute (always) =====
    const adapterResult = await this.executeExecuteStage(ctx, options);

    // ===== Stage 4: review (full only) =====
    // lite preset 跳过任务级 reviewer，reviewFindings 视为空集；
    // 横切的常驻 review agents 与本阶段独立，不受 preset 影响。
    const reviewFindings = hasReview ? await this.executeReviewStage(ctx) : [];

    // ===== Stage 5: test (always) =====
    const evidence = await this.executeTestStage(ctx, reviewFindings);

    // ===== Stage 6: commit_gate (full only) =====
    if (hasCommitGate) {
      const report = await this.executeCommitGateStage(ctx, adapterResult, evidence);
      return { report, dryRun: false };
    }

    // lite preset 终止：test PASS 后直接 completed，不产出 report.json
    // (asset promotion 在 lite 下的触发点改造见阶段 2)
    await this.finalizeLitePreset(ctx);
    return { dryRun: false };
  }

  /**
   * lite preset 在 test 阶段 PASS 后的终止处理。
   *
   * 与 full preset 的差异：
   * - 不调 evaluateCommitGate（无 commit_gate 阶段）
   * - 不产出 report.json / commit-summary.md
   * - 直接把 state.status 标 completed、state.currentStage 标 test
   *
   * lite 模式下 asset promotion 的触发点改为本函数（SPEC §22.2.1 修订），
   * 但具体调用 promoteTaskArtifacts 推迟到阶段 2 实施。
   */
  private async finalizeLitePreset(ctx: TaskContext): Promise<void> {
    ctx.state.status = 'completed';
    ctx.state.currentStage = 'test';
    ctx.state.currentOwner = 'tester';
    markCompleted(ctx, 'test');
    await this.manager.saveState(ctx);
  }

  /**
   * Stage 1: spec
   * 产出 contract.yaml（v3-core 中等价于 SPEC 工件）。
   * spec_gate：contract 合规性校验，失败即在 spec 阶段标记失败。
   */
  private async executeSpecStage(ctx: TaskContext): Promise<void> {
    ctx.state.status = 'active';
    ctx.state.currentStage = 'spec';
    ctx.state.currentOwner = 'requirement';
    await this.manager.saveState(ctx);

    const templateName = matchTemplate(ctx.goal);
    const contract = await generateContract({
      taskId: ctx.taskId,
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
    const requirement = renderRequirementMarkdown(contract);
    const requirementFailures = validateRequirementMarkdown(requirement);
    if (requirementFailures.length > 0) {
      await this.manager.markFailure(ctx, 'spec', requirementFailures.join('; '));
      throw new Error(`requirement gate 失败: ${requirementFailures.join('; ')}`);
    }
    await this.manager.saveRequirement(ctx, requirement);
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
    ctx.state.currentOwner = 'designer';
    await this.manager.saveState(ctx);

    const plan = generatePlan(ctx.contract);
    const design = renderDesignMarkdown(ctx.contract);
    const designFailures = validateDesignMarkdown(design);
    if (designFailures.length > 0) {
      await this.manager.markFailure(ctx, 'design', designFailures.join('; '));
      throw new Error(`design gate 失败: ${designFailures.join('; ')}`);
    }
    await this.manager.saveDesign(ctx, design);
    await this.manager.saveTaskBreakdown(ctx, renderTaskBreakdown(ctx.contract));
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
    ctx.state.status = 'active';
    ctx.state.currentStage = 'execute';
    ctx.state.currentOwner = 'developer';
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
      const baselineEvidence = await collectEvidence(ctx.workDir, ctx.config, ctx.contract);
      this.baselineSnapshot = buildEvidenceSnapshot(baselineEvidence);
      await saveEvidenceSnapshot(ctx.taskDir, 'baseline', this.baselineSnapshot);

      const adapterResult = await adapter.execute({
        taskId: ctx.taskId,
        workDir: ctx.workDir,
        prompt,
        promptFile,
        command: options.adapterCommand,
      });
      const changedFiles = await collectChangedFiles(ctx.workDir);
      const structureChecks = await runStructureCheck(ctx.workDir, changedFiles);
      const structureFailures = structureChecks.filter((check) => check.status === 'failed');
      if (structureFailures.length > 0) {
        const detail = structureFailures.map((check) => `${check.name}: ${check.detail}`).join('; ');
        await this.manager.markFailure(ctx, 'execute', detail);
        throw new Error(`structure-check 失败: ${detail}`);
      }
      await this.manager.saveImplementationNotes(ctx, renderImplementationNotes(adapterResult));
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
    ctx.state.currentOwner = 'reviewer';
    await this.manager.saveState(ctx);

    // 复用 collectChangedFiles 的 git status 收集，避免重复调 collectEvidence
    const changedFiles = await collectChangedFiles(ctx.workDir);
    const findings = runReviewStage(changedFiles);
    await this.manager.saveReviewMarkdown(ctx, renderReviewMarkdown(ctx.taskId, findings));
    await this.manager.saveResidentReview(ctx, await renderResidentReview(ctx.workDir, findings));

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
    ctx.state.status = 'active';
    ctx.state.currentStage = 'test';
    ctx.state.currentOwner = 'tester';
    await this.manager.saveState(ctx);

    const evidence = await collectEvidence(ctx.workDir, ctx.config, ctx.contract);
    // review 阶段的 findings 合入 evidence.checks，让 commit_gate 一并裁决
    evidence.checks = [...reviewFindings, ...evidence.checks];
    const currentSnapshot = buildEvidenceSnapshot(evidence);
    await saveEvidenceSnapshot(ctx.taskDir, 'current', currentSnapshot);
    if (this.baselineSnapshot) {
      await saveBaselineDiff(ctx.taskDir, buildBaselineDiff(this.baselineSnapshot, currentSnapshot));
    }
    if (ctx.contract) {
      await this.manager.saveTestReport(ctx, renderTestReport(ctx.contract, evidence));
    }
    evidence.checks = [...evidence.checks, await runArtifactGuard(ctx.taskDir, ctx.state.preset)];

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
    ctx.state.currentOwner = 'pm';
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

      // v3-core §22.2.1 声明式晋升：commit_gate pass 时自动将指定工件晋升到 docs/architecture/
      if (ctx.contract?.assetPromotion?.promote && ctx.contract.assetPromotion.topic) {
        const ap = ctx.contract.assetPromotion;
        const topic = ap.topic!; // guarded by if check above
        try {
          await promoteTaskArtifacts(ctx.workDir, ctx.taskId, {
            topic,
            files: ap.files,
            mode: ap.mode,
          });
          // 在 commit-summary 中记录晋升
          await this.manager.appendCommitSummarySection(
            ctx,
            '## Promoted Assets',
            [
              `- topic: ${topic}`,
              `- files: ${ap.files.join(', ')}`,
              `- mode: ${ap.mode}`,
              `- promoted_at: ${new Date().toISOString()}`,
            ].join('\n'),
          );
        } catch (error) {
          // 晋升失败不阻断 commit_gate 主流程，但记录告警
          const message = error instanceof Error ? error.message : String(error);
          await this.manager.appendCommitSummarySection(ctx, '## Promoted Assets', `- 晋升失败：${message}`);
        }
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
      const failureStage: StageMarker = commitGate.decision === 'fail' ? 'test' : 'commit_gate';
      await this.manager.markFailure(ctx, failureStage, feedback);
    }

    return report;
  }
}
