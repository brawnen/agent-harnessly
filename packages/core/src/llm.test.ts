import { afterEach, describe, expect, it } from 'vitest';

import { AnthropicClient, createLLMClientFromEnv } from './llm';

describe('llm client env resolution', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('should return null when anthropic api key is missing', () => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.HARNESSLY_LLM_PROVIDER;

    expect(createLLMClientFromEnv(process.env)).toBeNull();
  });

  it('should create anthropic client when api key exists', () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    process.env.HARNESSLY_LLM_PROVIDER = 'anthropic';

    const client = createLLMClientFromEnv(process.env);

    expect(client).toBeInstanceOf(AnthropicClient);
    expect(client?.providerName).toBe('anthropic');
  });
});
