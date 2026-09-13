import {
  generatePasswordSetupToken,
  hashPasswordSetupToken,
  passwordSetupExpiry,
} from './password-setup-token.util';

describe('password setup token utilities', () => {
  it('generates high-entropy unique opaque tokens and hashes them deterministically', () => {
    const first = generatePasswordSetupToken();
    const second = generatePasswordSetupToken();
    expect(first).not.toBe(second);
    expect(first.length).toBeGreaterThanOrEqual(40);
    expect(hashPasswordSetupToken(first)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashPasswordSetupToken(first)).toBe(hashPasswordSetupToken(first));
  });

  it('expires exactly 24 hours after issue', () => {
    const now = new Date('2026-09-11T00:00:00.000Z');
    expect(passwordSetupExpiry(now).toISOString()).toBe(
      '2026-09-12T00:00:00.000Z',
    );
  });
});
