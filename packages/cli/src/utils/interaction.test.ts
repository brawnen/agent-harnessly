import { describe, expect, it } from 'vitest';

import { normalizeConfirmationAnswer, shouldAutoConfirm } from './interaction';

describe('interaction helpers', () => {
  it('should normalize confirmation answers', () => {
    expect(normalizeConfirmationAnswer('y')).toBe(true);
    expect(normalizeConfirmationAnswer('YES')).toBe(true);
    expect(normalizeConfirmationAnswer('n')).toBe(false);
    expect(normalizeConfirmationAnswer('No')).toBe(false);
    expect(normalizeConfirmationAnswer('maybe')).toBeNull();
  });

  it('should auto confirm in non-tty mode', () => {
    expect(
      shouldAutoConfirm(
        {},
        {
          input: { isTTY: false } as unknown as NodeJS.ReadableStream & { isTTY?: boolean },
          output: { isTTY: false } as unknown as NodeJS.WritableStream & { isTTY?: boolean },
          env: {},
        },
      ),
    ).toBe(true);
  });

  it('should require manual confirm in tty mode without skip flag', () => {
    expect(
      shouldAutoConfirm(
        {},
        {
          input: { isTTY: true } as unknown as NodeJS.ReadableStream & { isTTY?: boolean },
          output: { isTTY: true } as unknown as NodeJS.WritableStream & { isTTY?: boolean },
          env: {},
        },
      ),
    ).toBe(false);
  });
});
