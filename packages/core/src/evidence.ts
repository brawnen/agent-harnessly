import { access, readFile } from 'node:fs/promises';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

import type {
  Contract,
  EvidenceCheckResult,
  EvidenceResult,
  HarnessConfig,
  RequiredCheck,
} from '@harnessly/shared';

import { runScopeCheck } from './scope';
import { runLevel2Validation } from './validation';

const execAsync = promisify(exec);

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function loadPackageScripts(workDir: string): Promise<Record<string, string>> {
  const packageFile = path.join(workDir, 'package.json');
  if (!(await fileExists(packageFile))) {
    return {};
  }

  const pkg = JSON.parse(await readFile(packageFile, 'utf8')) as { scripts?: Record<string, string> };
  return pkg.scripts ?? {};
}

async function runNodeScriptCheck(
  workDir: string,
  checkName: RequiredCheck,
  scripts: Record<string, string>,
): Promise<EvidenceCheckResult> {
  if (!scripts[checkName]) {
    return {
      name: checkName,
      status: 'skipped',
      command: `npm run ${checkName}`,
      detail: 'script 未定义',
    };
  }

  try {
    await execAsync(`npm run ${checkName}`, {
      cwd: workDir,
      env: process.env,
      shell: '/bin/zsh',
    });

    return {
      name: checkName,
      status: 'passed',
      command: `npm run ${checkName}`,
      detail: 'script 执行通过',
    };
  } catch (error) {
    const execError = error as { stderr?: string };

    return {
      name: checkName,
      status: 'failed',
      command: `npm run ${checkName}`,
      detail: execError.stderr?.trim() || 'script 执行失败',
    };
  }
}

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

export async function collectEvidence(
  workDir: string,
  config: HarnessConfig,
  contract?: Contract,
): Promise<EvidenceResult> {
  const scripts = await loadPackageScripts(workDir);
  const scriptChecks = await Promise.all(
    config.requiredChecks.map((checkName) => runNodeScriptCheck(workDir, checkName, scripts)),
  );
  const changedFiles = await collectChangedFiles(workDir);
  const scopeCheck = runScopeCheck(contract, changedFiles);
  const level2Checks = await runLevel2Validation(workDir, contract);
  const checks = [...scriptChecks, scopeCheck, ...level2Checks];

  return {
    checks,
    changedFiles,
  };
}
