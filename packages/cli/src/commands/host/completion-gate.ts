import { access, readFile } from 'node:fs/promises';
import path from 'node:path';

import { getHarnessPaths } from '@harnessly/core';

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

function isCompletionClaim(message: string): boolean {
  return /(完成|done|fixed|已修复|搞定|完成了)/i.test(message);
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

  const reportFile = path.join(getHarnessPaths(workDir).tasksDir, activeTaskId, 'report.json');
  const hasReport = await fileExists(reportFile);
  const commitReady = hasReport ? await loadReportCommitReady(reportFile) : null;
  const evalCommand = `harnessly eval ${activeTaskId}`;

  if (isCompletionClaim(message) && !hasReport) {
    await appendHarnessEvent(workDir, {
      type: 'host.completion_gate_blocked',
      reason: 'report_not_ready',
      activeTaskId,
      evaluatorAgent: 'harness-evaluator',
      evalCommand,
      nextStep: 'delegate_to_evaluator_or_run_eval',
    });
    printJson({
      pass: false,
      reason: 'report_not_ready',
      activeTaskId,
      evaluatorAgent: 'harness-evaluator',
      evalCommand,
      nextStep: 'delegate_to_evaluator_or_run_eval',
    });
    return;
  }

  if (isCompletionClaim(message) && commitReady === false) {
    await appendHarnessEvent(workDir, {
      type: 'host.completion_gate_blocked',
      reason: 'commit_gate_not_passed',
      activeTaskId,
      evaluatorAgent: 'harness-evaluator',
      evalCommand,
      nextStep: 'fix_findings_then_rerun_eval',
    });
    printJson({
      pass: false,
      reason: 'commit_gate_not_passed',
      activeTaskId,
      evaluatorAgent: 'harness-evaluator',
      evalCommand,
      nextStep: 'fix_findings_then_rerun_eval',
    });
    return;
  }

  printJson({
    pass: true,
    reason: hasReport ? (commitReady ? 'commit_ready' : 'report_ready') : 'no_completion_claim',
    activeTaskId,
  });
}
