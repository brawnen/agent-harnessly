import { HostName, HostManifest, HostLifecycleCommands } from '@harnessly/shared';

declare function getRepoLocalShellPaths(host: HostName): string[];
declare function createLifecycleCommands(binaryName?: string): HostLifecycleCommands;
declare function createHostManifest(host: HostName, binaryName?: string): HostManifest;
declare function getHostManifestFilename(host: HostName): string;
declare function serializeHostManifest(manifest: HostManifest): string;
declare function parseHostManifest(text: string): HostManifest;

export { createHostManifest, createLifecycleCommands, getHostManifestFilename, getRepoLocalShellPaths, parseHostManifest, serializeHostManifest };
