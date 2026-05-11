import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type { EvidenceCheckResult } from '@harnessly/shared';

import { getHarnessPaths } from './scaffold';

interface StructureRules {
  fileLengthMax?: number;
  fileLengthExclude: string[];
}

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'ENOENT'
  );
}

function parseStructureRules(text: string): StructureRules {
  const max = text.match(/^\s*max:\s*(\d+)\s*$/m)?.[1];
  const excludes: string[] = [];
  let inExclude = false;
  for (const line of text.split(/\r?\n/)) {
    if (/^\s*exclude:\s*$/.test(line)) {
      inExclude = true;
      continue;
    }
    if (inExclude && /^\S/.test(line)) {
      inExclude = false;
    }
    const item = inExclude ? line.match(/^\s*-\s+(.+)$/)?.[1]?.trim() : null;
    if (item) excludes.push(item);
  }
  return {
    fileLengthMax: max ? Number(max) : undefined,
    fileLengthExclude: excludes,
  };
}

function matchesPrefix(filePath: string, pattern: string): boolean {
  if (pattern.endsWith('/')) return filePath.startsWith(pattern);
  if (pattern.includes('*')) {
    const re = new RegExp(pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*'));
    return re.test(filePath);
  }
  return filePath === pattern || filePath.startsWith(pattern);
}

export async function runStructureCheck(workDir: string, changedFiles: string[]): Promise<EvidenceCheckResult[]> {
  const rulesPath = path.join(getHarnessPaths(workDir).harnessDir, 'structure-rules.yaml');
  let text: string;
  try {
    text = await readFile(rulesPath, 'utf8');
  } catch (error) {
    if (isMissingFileError(error)) {
      return [
        {
          name: 'structure.rules',
          status: 'skipped',
          command: 'structure-check',
          detail: '.harness/structure-rules.yaml 未配置',
          fixHint: '运行 harnessly init 或创建 structure-rules.yaml',
        },
      ];
    }
    throw error;
  }

  const rules = parseStructureRules(text);
  const results: EvidenceCheckResult[] = [];

  if (rules.fileLengthMax === undefined) {
    results.push({
      name: 'structure.file_length',
      status: 'skipped',
      command: 'structure-check:file_length',
      detail: 'file_length.max 未配置',
    });
  } else {
    const violations: string[] = [];
    for (const file of changedFiles) {
      if (rules.fileLengthExclude.some((pattern) => matchesPrefix(file, pattern))) continue;
      try {
        const content = await readFile(path.join(workDir, file), 'utf8');
        const lines = content.split(/\r?\n/).length;
        if (lines > rules.fileLengthMax) {
          violations.push(`${file}=${lines}`);
        }
      } catch {
        // 删除文件或二进制文件不参与 file_length
      }
    }
    results.push({
      name: 'structure.file_length',
      status: violations.length > 0 ? 'failed' : 'passed',
      command: 'structure-check:file_length',
      detail:
        violations.length > 0
          ? `文件长度超过 max=${rules.fileLengthMax}: ${violations.join(', ')}`
          : `变更文件均未超过 max=${rules.fileLengthMax}`,
      fixHint: violations.length > 0 ? '拆分文件或更新 structure-rules.yaml 的 exclude' : undefined,
    });
  }

  results.push({
    name: 'structure.unique_implementations',
    status: 'skipped',
    command: 'structure-check:unique_implementations',
    detail: 'unique_implementations 尚未配置具体规则',
  });
  results.push({
    name: 'structure.package_dependencies',
    status: 'skipped',
    command: 'structure-check:package_dependencies',
    detail: 'package_dependencies.forbid 尚未配置具体规则',
  });

  return results;
}
