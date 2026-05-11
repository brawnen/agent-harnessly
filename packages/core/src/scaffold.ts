import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { HarnessConfig } from '@brawnen/harnessly-shared';

import { parseHarnessConfig, serializeHarnessConfig } from './config';

export const HARNESS_DIRNAME = '.harness';

export interface HarnessPaths {
  harnessDir: string;
  agentsDir: string;
  domainsDir: string;
  hostsDir: string;
  tasksDir: string;
  templatesDir: string;
  skillsDir: string;
  configFile: string;
  structureRulesFile: string;
  reviewAgentsFile: string;
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
    skillsDir: path.join(harnessDir, 'skills'),
    configFile: path.join(harnessDir, 'harness.config.yaml'),
    structureRulesFile: path.join(harnessDir, 'structure-rules.yaml'),
    reviewAgentsFile: path.join(harnessDir, 'review-agents.yaml'),
    activeTaskFile: path.join(harnessDir, 'active-task.txt'),
  };
}

export function renderStructureRulesTemplate(): string {
  return [
    'file_length:',
    '  max: 500',
    '  exclude:',
    '    - dist/',
    '    - node_modules/',
    'unique_implementations: []',
    'package_dependencies:',
    '  forbid: []',
    '  fix_hint: 保持包边界清晰，避免反向依赖',
    '',
  ].join('\n');
}

export function renderReviewAgentsTemplate(): string {
  return [
    'review_agents:',
    '  - name: reliability',
    '    triggers: [pre_merge]',
    '    model: gpt-5.5',
    '    blocking_severity: P0',
    '    prompt: |',
    '      检查可靠性、回归风险和证据缺口。',
    '',
  ].join('\n');
}

export async function ensureHarnessDirectories(workDir: string): Promise<HarnessPaths> {
  const paths = getHarnessPaths(workDir);

  await mkdir(paths.harnessDir, { recursive: true });
  await mkdir(paths.agentsDir, { recursive: true });
  await mkdir(paths.domainsDir, { recursive: true });
  await mkdir(paths.hostsDir, { recursive: true });
  await mkdir(paths.tasksDir, { recursive: true });
  await mkdir(paths.templatesDir, { recursive: true });
  await mkdir(paths.skillsDir, { recursive: true });

  return paths;
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
