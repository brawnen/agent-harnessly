import {
  type AdapterKind,
  type HarnessConfig,
  HARNESSLY_VERSION,
  type HostName,
  parseHarnessConfig as parseHarnessConfigFromShared,
  serializeHarnessConfig as serializeHarnessConfigFromShared,
  type ProjectType,
} from '@brawnen/harnessly-shared';

import { getDefaultRequiredChecks } from './project';

function getDefaultAdapterKind(defaultHost: HostName): AdapterKind {
  switch (defaultHost) {
    case 'codex':
      return 'codex';
    default:
      return 'claude-code';
  }
}

function getDefaultAdapterCommand(defaultHost: HostName): string {
  switch (defaultHost) {
    case 'codex':
      return 'codex exec --full-auto - < "$HARNESSLY_PROMPT_FILE"';
    default:
      return '';
  }
}

export function createDefaultHarnessConfig(
  projectType: ProjectType,
  hosts: HostName[] = ['claude-code'],
): HarnessConfig {
  const defaultHost = hosts[0] ?? 'claude-code';
  return {
    version: Number(HARNESSLY_VERSION.split('.')[0] ?? '0') + 1,
    projectType,
    requiredChecks: getDefaultRequiredChecks(projectType),
    defaultHost,
    enabledHosts: hosts,
    installRepoLocalShells: true,
    sourceOfTruthDir: '.harness/hosts',
    fallbackCreateTaskWithoutPlanner: false,
    codexUserPromptSubmitHookEnabled: true,
    adapterKind: getDefaultAdapterKind(defaultHost),
    adapterCommand: getDefaultAdapterCommand(defaultHost),
  };
}

export function serializeHarnessConfig(config: HarnessConfig): string {
  return serializeHarnessConfigFromShared(config);
}

export function parseHarnessConfig(text: string): HarnessConfig {
  return parseHarnessConfigFromShared(text);
}
