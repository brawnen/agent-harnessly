import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { getHarnessPaths, loadAgentManifests, loadHarnessConfig } from '@brawnen/harnessly-core';
import { renderClaudeCodeManagedFiles } from '@brawnen/harnessly-host-claude-code';
import { renderCodexManagedFiles } from '@brawnen/harnessly-host-codex';
import {
  createHostManifest,
  getHostManifestFilename,
  parseHostManifest,
  serializeHostManifest,
} from '@brawnen/harnessly-host-shared';
import type {
  AgentManifest,
  HarnessConfig,
  HostManifest,
  HostName,
} from '@brawnen/harnessly-shared';

async function readFileIfExists(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, 'utf8');
  } catch {
    return null;
  }
}

function quoteShellArg(value: string): string {
  return `"${value.replace(/(["\\$`])/g, '\\$1')}"`;
}

function getCurrentHarnesslyCommand(): string {
  if (process.env.HARNESSLY_BIN?.trim()) {
    return process.env.HARNESSLY_BIN.trim();
  }

  const entry = process.argv[1];
  if (!entry) {
    return 'harnessly';
  }

  if (entry.endsWith('.js')) {
    return `${quoteShellArg(process.execPath)} ${quoteShellArg(entry)}`;
  }

  return quoteShellArg(entry);
}

function isBareHarnesslyCommand(command: string): boolean {
  return command.trim().startsWith('harnessly ');
}

function refreshManifestCommand(manifest: HostManifest, commandPrefix: string): HostManifest {
  const shouldRefresh =
    isBareHarnesslyCommand(manifest.sessionStartCommand) ||
    isBareHarnesslyCommand(manifest.userPromptSubmitCommand) ||
    isBareHarnesslyCommand(manifest.completionGateCommand);

  if (!shouldRefresh) {
    return manifest;
  }

  return {
    ...manifest,
    sessionStartCommand: `${commandPrefix} host session-start`,
    userPromptSubmitCommand: `${commandPrefix} host user-prompt-submit`,
    completionGateCommand: `${commandPrefix} host completion-gate`,
  };
}

export async function ensureHostManifest(workDir: string, host: HostName): Promise<HostManifest> {
  const manifestPath = path.join(getHarnessPaths(workDir).hostsDir, getHostManifestFilename(host));
  const existing = await readFileIfExists(manifestPath);
  const commandPrefix = getCurrentHarnesslyCommand();

  if (existing) {
    const manifest = refreshManifestCommand(parseHostManifest(existing), commandPrefix);
    await writeFile(manifestPath, serializeHostManifest(manifest), 'utf8');
    return manifest;
  }

  const manifest = createHostManifest(host, commandPrefix);
  await writeFile(manifestPath, serializeHostManifest(manifest), 'utf8');
  return manifest;
}

export async function loadEnabledHosts(workDir: string, requestedHost?: string): Promise<HostName[]> {
  if (requestedHost && requestedHost !== 'auto' && requestedHost !== 'all') {
    return [requestedHost as HostName];
  }

  const config = await loadHarnessConfig(workDir);

  if (requestedHost === 'all') {
    return config.enabledHosts;
  }

  if (config.enabledHosts.length > 0) {
    return config.enabledHosts;
  }

  return [config.defaultHost];
}

export function renderRepoLocalShell(
  manifest: HostManifest,
  config: HarnessConfig,
  agentManifests: AgentManifest[] = [],
): Record<string, string> {
  switch (manifest.host) {
    case 'claude-code':
      return renderClaudeCodeManagedFiles(manifest, { agentManifests });
    case 'codex':
      return renderCodexManagedFiles(manifest, {
        userPromptSubmitHookEnabled: config.codexUserPromptSubmitHookEnabled,
        agentManifests,
      });
    default:
      return {};
  }
}

export async function installHostShells(workDir: string, requestedHost?: string): Promise<string[]> {
  const installedPaths: string[] = [];
  const hosts = await loadEnabledHosts(workDir, requestedHost);
  const config = await loadHarnessConfig(workDir);
  // 加载 v3-core 5 角色 manifest（缺失也不报错；host renderer 会回退到老的 2 角色）
  const agentManifests = await loadAgentManifests(workDir);

  for (const host of hosts) {
    const manifest = await ensureHostManifest(workDir, host);
    const files = renderRepoLocalShell(manifest, config, agentManifests);

    for (const [relativePath, content] of Object.entries(files)) {
      const absolutePath = path.join(workDir, relativePath);
      await mkdir(path.dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, content, 'utf8');
      installedPaths.push(relativePath);
    }
  }

  return installedPaths;
}

export interface HostStatusRow {
  host: HostName;
  manifest: 'present' | 'missing';
  shell: 'installed' | 'missing' | 'drift';
  files: string[];
}

export async function collectHostStatus(workDir: string): Promise<HostStatusRow[]> {
  const config = await loadHarnessConfig(workDir);
  const agentManifests = await loadAgentManifests(workDir);
  const rows: HostStatusRow[] = [];

  for (const host of config.enabledHosts) {
    const manifestPath = path.join(getHarnessPaths(workDir).hostsDir, getHostManifestFilename(host));
    const manifestText = await readFileIfExists(manifestPath);

    if (!manifestText) {
      rows.push({
        host,
        manifest: 'missing',
        shell: 'missing',
        files: [],
      });
      continue;
    }

    const manifest = parseHostManifest(manifestText);
    const expectedFiles = renderRepoLocalShell(manifest, config, agentManifests);
    let shellStatus: HostStatusRow['shell'] = 'installed';

    for (const [relativePath, expectedContent] of Object.entries(expectedFiles)) {
      const actual = await readFileIfExists(path.join(workDir, relativePath));
      if (actual === null) {
        shellStatus = 'missing';
        break;
      }

      if (actual !== expectedContent) {
        shellStatus = 'drift';
        break;
      }
    }

    rows.push({
      host,
      manifest: 'present',
      shell: shellStatus,
      files: Object.keys(expectedFiles),
    });
  }

  return rows;
}

export async function readActiveTaskId(workDir: string): Promise<string | null> {
  const filePath = getHarnessPaths(workDir).activeTaskFile;
  const content = await readFileIfExists(filePath);
  return content?.trim() || null;
}
