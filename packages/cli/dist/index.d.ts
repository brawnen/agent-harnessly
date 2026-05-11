#!/usr/bin/env node
import { getCorePackageInfo } from '@brawnen/harnessly-core';

interface CliRuntimeSummary {
    packageName: string;
    version: string;
    core: ReturnType<typeof getCorePackageInfo>;
}
declare function getCliRuntimeSummary(): CliRuntimeSummary;

export { type CliRuntimeSummary, getCliRuntimeSummary };
