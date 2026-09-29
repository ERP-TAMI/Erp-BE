import { redactSensitiveData } from './redact-sensitive-data.util';

describe('redactSensitiveData', () => {
  it('redacts known sensitive keys regardless of casing', () => {
    const result = redactSensitiveData({
      email: 'user@example.com',
      password: 'secret',
      Token: 'jwt-value',
      nested: { refreshToken: 'refresh-value', keep: 'kept' },
    });

    expect(result).toEqual({
      email: 'user@example.com',
      password: '[REDACTED]',
      Token: '[REDACTED]',
      nested: { refreshToken: '[REDACTED]', keep: 'kept' },
    });
  });

  it('redacts sensitive keys inside arrays', () => {
    const result = redactSensitiveData([{ password: 'secret' }, { id: 1 }]);

    expect(result).toEqual([{ password: '[REDACTED]' }, { id: 1 }]);
  });

  it('passes through primitives and null/undefined untouched', () => {
    expect(redactSensitiveData(null)).toBeNull();
    expect(redactSensitiveData(undefined)).toBeUndefined();
    expect(redactSensitiveData('plain')).toBe('plain');
    expect(redactSensitiveData(42)).toBe(42);
  });
});
