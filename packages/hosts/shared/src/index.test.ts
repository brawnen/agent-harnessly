import { describe, expect, it } from 'vitest';

import { createHostManifest, parseHostManifest, serializeHostManifest } from './index';

describe('host shared helpers', () => {
  it('should round-trip a codex host manifest', () => {
    const manifest = createHostManifest('codex', 'harnessly-local');

    expect(parseHostManifest(serializeHostManifest(manifest))).toEqual(manifest);
  });
});
