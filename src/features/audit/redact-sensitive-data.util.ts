const SENSITIVE_KEYS = new Set([
  'password',
  'currentpassword',
  'newpassword',
  'confirmpassword',
  'token',
  'accesstoken',
  'refreshtoken',
  'authorization',
]);

const REDACTED = '[REDACTED]';

export function redactSensitiveData(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined || depth > 5) return value;

  if (Array.isArray(value)) {
    return value.map((item) => redactSensitiveData(item, depth + 1));
  }

  if (typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      result[key] = SENSITIVE_KEYS.has(key.toLowerCase())
        ? REDACTED
        : redactSensitiveData(val, depth + 1);
    }
    return result;
  }

  return value;
}
