import { describe, expect, it } from 'vitest';

import { createDefaultHarnessConfig } from './config';

describe('default harness config', () => {
  it('should use codex adapter defaults when default host is codex', () => {
    const config = createDefaultHarnessConfig('unknown', ['codex']);

    expect(config.adapterKind).toBe('codex');
    expect(config.adapterCommand).toContain('codex exec --full-auto');
    expect(config.codexUserPromptSubmitHookEnabled).toBe(true);
    expect(config.hostSubagents.planner.useHostPlanMode).toBe(true);
    expect(config.hostSubagents.planner.models.codex).toBe('gpt-5.4-mini');
    expect(config.hostSubagents.evaluator.models.codex).toBe('gpt-5.4');
  });
});
