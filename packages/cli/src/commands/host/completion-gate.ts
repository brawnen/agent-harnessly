import { access, readFile } from 'node:fs/promises';
import path from 'node:path';

import {
  collectChangedFiles,
  collectEnabledRoles,
  getHarnessPaths,
  loadAgentManifests,
  pickRecommendedAgent,
  runScopeCheck,
  TaskManager,
} from '@harnessly/core';
import { type Contract, parseContract, type StageMarker } from '@harnessly/shared';

import { appendHarnessEvent } from '../../utils/events';
import { readActiveTaskId } from '../../utils/hosts';
import { printJson } from '../../utils/output';

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function loadReportCommitReady(filePath: string): Promise<boolean | null> {
  try {
    const report = JSON.parse(await readFile(filePath, 'utf8')) as { commitReady?: boolean };
    return report.commitReady ?? null;
  } catch {
    return null;
  }
}

async function loadContractIfExists(filePath: string): Promise<Contract | null> {
  try {
    return parseContract(await readFile(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function isCompletionClaim(message: string): boolean {
  return /(完成|done|fixed|已修复|搞定|完成了)/i.test(message);
}

async function countPreviousBlocks(workDir: string, taskId: string): Promise<number> {
  const eventsFile = path.join(getHarnessPaths(workDir).harnessDir, 'events.jsonl');
  try {
    const text = await readFile(eventsFile, 'utf8');
    let count = 0;
    for (const line of text.split(/\r?\n/)) {
      if (
        line.includes('"type":"host.completion_gate_blocked"') &&
        line.includes(`"activeTaskId":"${taskId}"`)
      ) {
        count++;
      }
    }
    return count;
  } catch {
    return 0;
  }
}

/**
 * 在 completion-gate 阻断时挑出建议的 sub-agent。
 * 优先使用 lastFailureStage 对应角色（precise route），其次 currentStage，最后 fallback 到 evaluator。
 */
async function resolveCompletionRecommendedAgent(
  workDir: string,
  activeTaskId: string,
): Promise<{ agent: string | null; stage: StageMarker | null; failureStage: StageMarker | null }> {
  const manifests = await loadAgentManifests(workDir);
  const enabledRoles = collectEnabledRoles(manifests);

  let stage: StageMarker | null = null;
  let failureStage: StageMarker | null = null;
  try {
    const ctx = await new TaskManager().load(activeTaskId, workDir);
    stage = ctx.state.currentStage;
    failureStage = ctx.state.lastFailureStage ?? null;
  } catch {
    // task 工件缺失：失败 stage 取不到，下游退化为按 enabledRoles 选择
  }

  // 优先按 lastFailureStage 路由：让上次挂在 review/test 的任务复查时调对应角色
  // 没有任何 5 角色 enabled 时返回 null，hook 文案会提醒用户检查 .harness/agents/
  const targetStage = failureStage ?? stage;
  const agent = pickRecommendedAgent('completion_review', targetStage, enabledRoles);
  return { agent, stage, failureStage };
}

export async function runHostCompletionGate(
  flags: Record<string, string | boolean>,
  positionals: string[],
): Promise<void> {
  const workDir = process.cwd();
  const message =
    (typeof flags.message === 'string' ? flags.message : '') || positionals.join(' ').trim();
  const activeTaskId = await readActiveTaskId(workDir);

  if (!activeTaskId) {
    printJson({
      pass: true,
      reason: 'no_active_task',
    });
    return;
  }

  const paths = getHarnessPaths(workDir);
  const reportFile = path.join(paths.tasksDir, activeTaskId, 'report.json');
  const contractFile = path.join(paths.tasksDir, activeTaskId, 'contract.yaml');
  const evalCommand = `harnessly eval ${activeTaskId}`;

  // 独立 scope check — 不依赖 report.json，直接基于 contract + git diff
  const changedFiles = await collectChangedFiles(workDir);
  const contract = await loadContractIfExists(contractFile);
  const scopeCheck = runScopeCheck(contract ?? undefined, changedFiles);

  // 解析推荐角色（一次解析，全 block 路径复用）
  const recommendation = await resolveCompletionRecommendedAgent(workDir, activeTaskId);
  // 当 5 角色 manifest 都禁用时返回 null；hook 文案会提示用户检查 manifest 配置
  const recommendedAgent = recommendation.agent;
  const activeStage = recommendation.stage;
  const lastFailureStage = recommendation.failureStage;

  // scope 违规：无论是否声称完成，一律阻断
  if (scopeCheck.status === 'failed') {
    const blockCount = await countPreviousBlocks(workDir, activeTaskId);
    const requiresEvaluator = true;
    await appendHarnessEvent(workDir, {
      type: 'host.completion_gate_blocked',
      reason: 'scope_violation',
      activeTaskId,
      activeStage,
      lastFailureStage,
      detail: scopeCheck.detail,
      scopeCheck,
      blockCount: blockCount + 1,
      requiresEvaluator,
      recommendedAgent,
      evalCommand,
      nextStep: blockCount > 0 ? 'must_fix_scope_then_eval' : 'fix_scope_violation_then_rerun',
    });
    printJson({
      pass: false,
      reason: 'scope_violation',
      activeTaskId,
      activeStage,
      lastFailureStage,
      scopeCheck,
      blockCount: blockCount + 1,
      requiresEvaluator,
      recommendedAgent,
      evalCommand,
      nextStep: blockCount > 0 ? 'must_fix_scope_then_eval' : 'fix_scope_violation_then_rerun',
    });
    return;
  }

  const hasReport = await fileExists(reportFile);
  const commitReady = hasReport ? await loadReportCommitReady(reportFile) : null;

  if (isCompletionClaim(message) && !hasReport) {
    const blockCount = await countPreviousBlocks(workDir, activeTaskId);
    const requiresEvaluator = true;
    await appendHarnessEvent(workDir, {
      type: 'host.completion_gate_blocked',
      reason: 'report_not_ready',
      activeTaskId,
      activeStage,
      lastFailureStage,
      scopeCheck,
      blockCount: blockCount + 1,
      requiresEvaluator,
      recommendedAgent,
      evalCommand,
      nextStep: blockCount > 0 ? 'must_run_eval' : 'delegate_to_evaluator_or_run_eval',
    });
    printJson({
      pass: false,
      reason: 'report_not_ready',
      activeTaskId,
      activeStage,
      lastFailureStage,
      scopeCheck,
      blockCount: blockCount + 1,
      requiresEvaluator,
      recommendedAgent,
      evalCommand,
      nextStep: blockCount > 0 ? 'must_run_eval' : 'delegate_to_evaluator_or_run_eval',
    });
    return;
  }

  if (isCompletionClaim(message) && commitReady === false) {
    const blockCount = await countPreviousBlocks(workDir, activeTaskId);
    const requiresEvaluator = true;
    await appendHarnessEvent(workDir, {
      type: 'host.completion_gate_blocked',
      reason: 'commit_gate_not_passed',
      activeTaskId,
      activeStage,
      lastFailureStage,
      scopeCheck,
      blockCount: blockCount + 1,
      requiresEvaluator,
      recommendedAgent,
      evalCommand,
      nextStep: blockCount > 0 ? 'must_fix_and_rerun_eval' : 'fix_findings_then_rerun_eval',
    });
    printJson({
      pass: false,
      reason: 'commit_gate_not_passed',
      activeTaskId,
      activeStage,
      lastFailureStage,
      scopeCheck,
      blockCount: blockCount + 1,
      requiresEvaluator,
      recommendedAgent,
      evalCommand,
      nextStep: blockCount > 0 ? 'must_fix_and_rerun_eval' : 'fix_findings_then_rerun_eval',
    });
    return;
  }

  printJson({
    pass: true,
    reason: hasReport ? (commitReady ? 'commit_ready' : 'report_ready') : 'no_completion_claim',
    activeTaskId,
    activeStage,
    scopeCheck,
  });
}
