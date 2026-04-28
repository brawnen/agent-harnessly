import { access, readFile } from 'node:fs/promises';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

import type { Contract, EvidenceCheckResult } from '@harnessly/shared';

const execAsync = promisify(exec);

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function createSkippedCheck(index: number, criterion: string, detail: string): EvidenceCheckResult {
  return {
    name: `level2:${index}`,
    status: 'skipped',
    command: criterion,
    detail,
  };
}

async function runFileCheck(index: number, workDir: string, target: string): Promise<EvidenceCheckResult> {
  const filePath = path.join(workDir, target);
  const exists = await fileExists(filePath);

  return {
    name: `level2:file:${index}`,
    status: exists ? 'passed' : 'failed',
    command: `file:${target}`,
    detail: exists ? `文件存在: ${target}` : `文件不存在: ${target}`,
  };
}

async function runContainsCheck(
  index: number,
  workDir: string,
  target: string,
  needle: string,
): Promise<EvidenceCheckResult> {
  const filePath = path.join(workDir, target);
  if (!(await fileExists(filePath))) {
    return {
      name: `level2:contains:${index}`,
      status: 'failed',
      command: `contains:${target}::${needle}`,
      detail: `文件不存在: ${target}`,
    };
  }

  const content = await readFile(filePath, 'utf8');
  const matched = content.includes(needle);

  return {
    name: `level2:contains:${index}`,
    status: matched ? 'passed' : 'failed',
    command: `contains:${target}::${needle}`,
    detail: matched ? `文件包含目标文本: ${target}` : `文件未包含目标文本: ${target}`,
  };
}

async function runCommandCheck(index: number, workDir: string, command: string): Promise<EvidenceCheckResult> {
  try {
    await execAsync(command, {
      cwd: workDir,
      env: process.env,
      shell: '/bin/zsh',
    });

    return {
      name: `level2:command:${index}`,
      status: 'passed',
      command,
      detail: '命令执行通过',
    };
  } catch (error) {
    const execError = error as { stderr?: string };

    return {
      name: `level2:command:${index}`,
      status: 'failed',
      command,
      detail: execError.stderr?.trim() || '命令执行失败',
    };
  }
}

export async function runLevel2Validation(
  workDir: string,
  contract?: Contract,
): Promise<EvidenceCheckResult[]> {
  if (!contract) {
    return [
      createSkippedCheck(0, 'level2', 'contract 缺失，无法运行 Level 2 validation'),
    ];
  }

  const checks = await Promise.all(
    contract.acceptanceCriteria.map(async (criterion, index) => {
      if (criterion.startsWith('file:')) {
        return runFileCheck(index, workDir, criterion.slice('file:'.length).trim());
      }

      if (criterion.startsWith('contains:')) {
        const payload = criterion.slice('contains:'.length);
        const separatorIndex = payload.indexOf('::');
        if (separatorIndex === -1) {
          return createSkippedCheck(index, criterion, 'contains 指令格式错误，应为 contains:path::text');
        }

        const target = payload.slice(0, separatorIndex).trim();
        const needle = payload.slice(separatorIndex + 2).trim();
        return runContainsCheck(index, workDir, target, needle);
      }

      if (criterion.startsWith('command:')) {
        return runCommandCheck(index, workDir, criterion.slice('command:'.length).trim());
      }

      return createSkippedCheck(index, criterion, '非结构化 acceptance criterion，跳过 Level 2');
    }),
  );

  return checks;
}
