import { packageInfo as sharedPackageInfo } from '@harnessly/shared';

export * from './agent';
export * from './archive';
export * from './config';
export * from './contract';
export * from './evidence';
export * from './evidence-baseline';
export * from './execute';
export * from './feedback-pool';
export * from './gate';
export * from './llm';
export * from './project';
export * from './plan';
export * from './promote';
export * from './prompt';
export * from './report';
export * from './review';
export * from './scaffold';
export * from './scope';
export * from './task';
export * from './template';
export * from './validation';
export * from './workflow';

export const CORE_PACKAGE_NAME = '@harnessly/core';

export interface CorePackageInfo {
  name: string;
  version: string;
  dependsOn: string[];
}

export function getCorePackageInfo(): CorePackageInfo {
  return {
    name: CORE_PACKAGE_NAME,
    version: '0.0.0',
    dependsOn: [sharedPackageInfo.name],
  };
}
