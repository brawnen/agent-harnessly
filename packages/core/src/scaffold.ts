import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { HarnessConfig } from '@harnessly/shared';

import { parseHarnessConfig, serializeHarnessConfig } from './config';

export const HARNESS_DIRNAME = '.harness';

export interface HarnessPaths {
  harnessDir: string;
  agentsDir: string;
  domainsDir: string;
  hostsDir: string;
  tasksDir: string;
  templatesDir: string;
  configFile: string;
  globalRulesFile: string;
  activeTaskFile: string;
}

export function getHarnessPaths(workDir: string): HarnessPaths {
  const harnessDir = path.join(workDir, HARNESS_DIRNAME);

  return {
    harnessDir,
    agentsDir: path.join(harnessDir, 'agents'),
    domainsDir: path.join(harnessDir, 'domains'),
    hostsDir: path.join(harnessDir, 'hosts'),
    tasksDir: path.join(harnessDir, 'tasks'),
    templatesDir: path.join(harnessDir, 'templates'),
    configFile: path.join(harnessDir, 'harness.config.yaml'),
    globalRulesFile: path.join(harnessDir, 'GLOBAL_RULES.md'),
    activeTaskFile: path.join(harnessDir, 'active-task.txt'),
  };
}

export async function ensureHarnessDirectories(workDir: string): Promise<HarnessPaths> {
  const paths = getHarnessPaths(workDir);

  await mkdir(paths.harnessDir, { recursive: true });
  await mkdir(paths.agentsDir, { recursive: true });
  await mkdir(paths.domainsDir, { recursive: true });
  await mkdir(paths.hostsDir, { recursive: true });
  await mkdir(paths.tasksDir, { recursive: true });
  await mkdir(paths.templatesDir, { recursive: true });

  return paths;
}

export function renderGlobalRulesTemplate(): string {
  return [
    '# GLOBAL_RULES',
    '',
    '在这里填写当前仓库的长期稳定规则。',
    '',
    '- 只写 repo 级事实，不写个人级习惯',
    '- 只写长期稳定约束，不写一次性任务说明',
    '- 代码验证命令、交付门禁、目录约定优先写在这里',
    '',
  ].join('\n');
}

export async function writeFileIfChanged(
  filePath: string,
  content: string,
  force = false,
): Promise<'created' | 'updated' | 'skipped'> {
  try {
    const existing = await readFile(filePath, 'utf8');
    if (existing === content) {
      return 'skipped';
    }

    if (!force) {
      return 'skipped';
    }
  } catch {
    // 文件不存在时继续写入
  }

  await writeFile(filePath, content, 'utf8');

  try {
    await readFile(filePath, 'utf8');
    return force ? 'updated' : 'created';
  } catch {
    return 'created';
  }
}

export async function loadHarnessConfig(workDir: string): Promise<HarnessConfig> {
  const configText = await readFile(getHarnessPaths(workDir).configFile, 'utf8');
  return parseHarnessConfig(configText);
}

export async function writeHarnessConfig(
  workDir: string,
  config: HarnessConfig,
  force = false,
): Promise<'created' | 'updated' | 'skipped'> {
  return writeFileIfChanged(getHarnessPaths(workDir).configFile, serializeHarnessConfig(config), force);
}
