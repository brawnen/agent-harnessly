import {
  type AdapterKind,
  type HarnessConfig,
  HARNESSLY_VERSION,
  type HostName,
  parseHarnessConfig as parseHarnessConfigFromShared,
  serializeHarnessConfig as serializeHarnessConfigFromShared,
  type ProjectType,
} from '@harnessly/shared';

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
  defaultHost: HostName = 'claude-code',
): HarnessConfig {
  return {
    version: Number(HARNESSLY_VERSION.split('.')[0] ?? '0') + 1,
    projectType,
    requiredChecks: getDefaultRequiredChecks(projectType),
    defaultHost,
    enabledHosts: [defaultHost],
    installRepoLocalShells: true,
    sourceOfTruthDir: '.harness/hosts',
    fallbackCreateTaskWithoutPlanner: false,
    codexUserPromptSubmitHookEnabled: true,
    hostSubagents: {
      planner: {
        useHostPlanMode: true,
        models: {
          'claude-code': 'haiku',
          codex: 'gpt-5.4-mini',
          'gemini-cli': 'gemini-flash',
        },
      },
      evaluator: {
        models: {
          'claude-code': 'sonnet',
          codex: 'gpt-5.4',
          'gemini-cli': 'gemini-pro',
        },
      },
    },
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
