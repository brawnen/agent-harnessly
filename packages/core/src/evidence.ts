import { exec } from 'node:child_process';
import { promisify } from 'node:util';

import type {
  Contract,
  EvidenceResult,
  HarnessConfig,
} from '@harnessly/shared';

import { runScopeCheck } from './scope';
import { runSkillCheck } from './skill';
import { runLevel2Validation } from './validation';

const execAsync = promisify(exec);

export async function collectChangedFiles(workDir: string): Promise<string[]> {
  try {
    const { stdout } = await execAsync('git status --short', {
      cwd: workDir,
      env: process.env,
      shell: '/bin/zsh',
    });

    return stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => line.replace(/^[A-Z? ]+/, '').trim());
  } catch {
    return [];
  }
}

async function countCommand(workDir: string, command: string): Promise<number> {
  try {
    const { stdout } = await execAsync(command, {
      cwd: workDir,
      env: process.env,
      shell: '/bin/zsh',
    });
    return Number(stdout.trim()) || 0;
  } catch {
    return 0;
  }
}

export async function collectEvidence(
  workDir: string,
  config: HarnessConfig,
  contract?: Contract,
): Promise<EvidenceResult> {
  const skillChecks = await Promise.all(
    config.requiredChecks.map((checkName) => runSkillCheck(workDir, checkName, config.projectType)),
  );
  const changedFiles = await collectChangedFiles(workDir);
  const scopeCheck = runScopeCheck(contract, changedFiles);
  const level2Checks = await runLevel2Validation(workDir, contract);
  const checks = [...skillChecks, scopeCheck, ...level2Checks];

  return {
    checks,
    changedFiles,
    lintWarningsTotal: 0,
    todoCount: await countCommand(workDir, "git grep -n -E 'TODO|FIXME' -- ':!node_modules' ':!dist' | wc -l"),
    gitDirtyFiles: changedFiles.length,
  };
}
