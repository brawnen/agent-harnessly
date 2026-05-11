import { describe, expect, it } from 'vitest';

import { createDefaultHarnessConfig } from './config';

describe('default harness config', () => {
  it('should use codex adapter defaults when default host is codex', () => {
    const config = createDefaultHarnessConfig('unknown', ['codex']);

    expect(config.adapterKind).toBe('codex');
    expect(config.adapterCommand).toContain('codex exec --full-auto');
    expect(config.codexUserPromptSubmitHookEnabled).toBe(true);
    expect(config.defaultHost).toBe('codex');
    expect(config.enabledHosts).toEqual(['codex']);
  });

  it('places the first listed host as defaultHost when multiple hosts requested', () => {
    const config = createDefaultHarnessConfig('node', ['claude-code', 'codex']);

    expect(config.defaultHost).toBe('claude-code');
    expect(config.enabledHosts).toEqual(['claude-code', 'codex']);
  });
});
