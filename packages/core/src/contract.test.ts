import { describe, expect, it } from 'vitest';

import type { Contract } from '@harnessly/shared';

import { checkContract, generateContract, generateFallbackContract } from './contract';
import type { LLMClient } from './llm';

describe('contract generation', () => {
  it('should return fallback contract when llm client is unavailable', async () => {
    const contract = await generateContract({
      goal: '修复状态展示',
      templateName: 'bug-fix',
      llmClient: null,
    });

    expect(contract).toEqual(generateFallbackContract('修复状态展示', 'bug-fix'));
    expect(checkContract(contract).passed).toBe(true);
  });

  it('should prefer llm structured output when available', async () => {
    const llmClient: LLMClient = {
      providerName: 'fake',
      async generateStructured<T>(): Promise<T> {
        return {
          goal: '模型生成的 goal',
          templateName: 'feature-simple',
          riskLevel: 'high',
          scopeInclude: ['packages/core/src/contract.ts'],
          scopeExclude: ['dist/**'],
          acceptanceCriteria: ['生成 contract', '通过 gate', '便于 verify'],
          outOfScope: ['大重构'],
        } as T;
      },
      async generateText(): Promise<string> {
        return '';
      },
    };

    const contract = await generateContract({
      goal: '修复状态展示',
      templateName: 'bug-fix',
      llmClient,
    });

    expect(contract).toEqual<Contract>({
      goal: '修复状态展示',
      templateName: 'bug-fix',
      riskLevel: 'high',
      scopeInclude: ['packages/core/src/contract.ts'],
      scopeExclude: ['dist/**'],
      acceptanceCriteria: ['生成 contract', '通过 gate', '便于 verify'],
      outOfScope: ['大重构'],
    });
  });

  it('should fall back when llm generation fails', async () => {
    const llmClient: LLMClient = {
      providerName: 'fake',
      async generateStructured(): Promise<never> {
        throw new Error('provider unavailable');
      },
      async generateText(): Promise<string> {
        return '';
      },
    };

    const contract = await generateContract({
      goal: '修复状态展示',
      templateName: 'bug-fix',
      llmClient,
    });

    expect(contract).toEqual(generateFallbackContract('修复状态展示', 'bug-fix'));
  });
});
