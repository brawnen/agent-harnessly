import { writeFile } from 'node:fs/promises';

import {
  createDefaultHarnessConfig,
  detectProjectType,
  ensureHarnessDirectories,
  renderGlobalRulesTemplate,
  writeDefaultAgentManifests,
  writeFileIfChanged,
  writeHarnessConfig,
} from '@harnessly/core';
import type { HostName } from '@harnessly/shared';

import { installHostShells, ensureHostManifest } from '../utils/hosts';
import { printLines } from '../utils/output';

export async function runInit(flags: Record<string, string | boolean>): Promise<void> {
  const workDir = process.cwd();
  const rawHost =
    (typeof flags.host === 'string' ? flags.host : 'claude-code');
  const hosts = rawHost
    .split(',')
    .map((h) => h.trim())
    .filter(Boolean) as HostName[];
  const force = flags.force === true;

  const projectType = await detectProjectType(workDir);
  const paths = await ensureHarnessDirectories(workDir);
  const config = createDefaultHarnessConfig(projectType, hosts);

  const configStatus = await writeHarnessConfig(workDir, config, force);
  const globalRulesStatus = await writeFileIfChanged(
    paths.globalRulesFile,
    renderGlobalRulesTemplate(),
    force,
  );

  // 写入 5 角色 sub-agent 默认 manifest（v3-core SPEC §4）
  const agentResults = await writeDefaultAgentManifests(workDir, force);
  const agentSummary = agentResults
    .map((r) => `${r.role}=${r.manifestStatus}/${r.promptStatus}`)
    .join(', ');

  for (const host of hosts) {
    await ensureHostManifest(workDir, host);
  }
  const installedPaths = config.installRepoLocalShells
    ? await installHostShells(workDir)
    : [];

  await writeFile(paths.activeTaskFile, '', 'utf8');

  printLines([
    'Harnessly 初始化完成',
    `- project_type: ${projectType}`,
    `- config: ${configStatus}`,
    `- global_rules: ${globalRulesStatus}`,
    `- agents: ${agentSummary}`,
    `- hosts: ${hosts.join(', ')}`,
    `- default_host: ${config.defaultHost}`,
    `- installed_shells: ${installedPaths.length > 0 ? installedPaths.join(', ') : 'none'}`,
  ]);
}
