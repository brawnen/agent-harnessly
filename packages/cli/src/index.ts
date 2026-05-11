#!/usr/bin/env node

import { fileURLToPath } from 'node:url';

import { getCorePackageInfo } from '@brawnen/harnessly-core';

import { runCli } from './run-cli';
import { CLI_PACKAGE_NAME, CLI_VERSION } from './version';

export interface CliRuntimeSummary {
  packageName: string;
  version: string;
  core: ReturnType<typeof getCorePackageInfo>;
}

export function getCliRuntimeSummary(): CliRuntimeSummary {
  return {
    packageName: CLI_PACKAGE_NAME,
    version: CLI_VERSION,
    core: getCorePackageInfo(),
  };
}

function formatCliError(error: unknown): string {
  if (error instanceof Error) {
    const errorWithDetails = error as Error & { path?: string; code?: string };
    const pathValue = typeof errorWithDetails.path === 'string' ? errorWithDetails.path : undefined;
    const isHarnessConfigMissing =
      errorWithDetails.code === 'ENOENT' &&
      (pathValue?.includes('.harness/harness.config.yaml') ||
        error.message.includes('.harness/harness.config.yaml'));

    if (isHarnessConfigMissing) {
      return '当前仓库尚未初始化 Harnessly。先执行 harnessly init。';
    }

    return error.message;
  }

  return String(error);
}

function isDirectExecution(): boolean {
  const entryPath = process.argv[1];
  if (!entryPath) {
    return false;
  }

  return fileURLToPath(import.meta.url) === entryPath;
}

if (isDirectExecution()) {
  runCli(process.argv.slice(2)).catch((error: unknown) => {
    const message = formatCliError(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
