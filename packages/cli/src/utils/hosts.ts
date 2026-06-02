import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { getHarnessPaths, loadAgentManifests, loadHarnessConfig, writeHarnessConfig } from '@brawnen/harnessly-core';
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

/**
 * 解析写进 host manifest 的 harnessly 命令前缀。
 *
 * 关键设计（修复机器特定绝对路径写进仓库的 bug）：
 * - `.harness/hosts/*.yaml` 是 commit 进仓库的 source-of-truth，因此命令前缀
 *   必须可移植，不能是 `/opt/homebrew/bin/harnessly` 这种当前机器的绝对路径
 *   （旧实现用 process.argv[1] 取当前入口绝对路径 → 换机器 / 团队协作即失效）
 * - 默认统一用 bare `harnessly`（依赖 PATH，跨机器/跨安装方式可移植）
 * - 特殊环境（如 GUI 启动 PATH 不全、或开发期指向特定 dist）通过 `HARNESSLY_BIN`
 *   环境变量显式覆盖，例如 `HARNESSLY_BIN='node /path/to/dist/index.js'`
 * - host hook 脚本在命令找不到时本就优雅降级（continue:true，不阻断），
 *   因此 bare 命令在边缘环境也不会卡住用户
 */
export function getCurrentHarnesslyCommand(): string {
  const override = process.env.HARNESSLY_BIN?.trim();
  return override && override.length > 0 ? override : 'harnessly';
}

/**
 * 用当前环境的命令前缀刷新 manifest 的三个生命周期命令。
 *
 * 总是覆盖（而非旧实现的「仅刷新 bare 命令」）：command 是纯生成物，应始终反映
 * 当前环境的正确命令。这样旧的机器特定绝对路径脏数据会在下次 init/install 时自愈纠正。
 */
function refreshManifestCommand(manifest: HostManifest, commandPrefix: string): HostManifest {
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
  workDir: string,
  config: HarnessConfig,
  agentManifests: AgentManifest[] = [],
): Record<string, string> {
  switch (manifest.host) {
    case 'claude-code':
      return renderClaudeCodeManagedFiles(manifest, workDir, { agentManifests });
    case 'codex':
      return renderCodexManagedFiles(manifest, workDir, {
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

  // 将新安装的 host 写入 enabledHosts，确保后续 init / sync 可见
  const newHosts = hosts.filter((h) => !config.enabledHosts.includes(h));
  if (newHosts.length > 0) {
    await writeHarnessConfig(workDir, {
      ...config,
      enabledHosts: newHosts,
    });
  }

  // 加载 v3-core 5 角色 manifest（缺失也不报错；host renderer 会回退到老的 2 角色）
  const agentManifests = await loadAgentManifests(workDir);

  for (const host of hosts) {
    const manifest = await ensureHostManifest(workDir, host);
    const files = renderRepoLocalShell(manifest, workDir, config, agentManifests);

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
    const expectedFiles = renderRepoLocalShell(manifest, workDir, config, agentManifests);
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
