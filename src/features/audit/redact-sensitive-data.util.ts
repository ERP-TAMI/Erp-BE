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

// Link S3 đã ký (presigned) là thông tin đăng nhập tạm thời: query string chứa
// access key + chữ ký còn hiệu lực. FE đôi khi gửi lại nguyên link này trong
// body (VD section1ImageUrl), nên phải cắt bỏ query trước khi ghi nhật ký.
const PRESIGNED_URL_RE = /X-Amz-(Signature|Credential)=/i;

function stripPresignedQuery(value: string): string {
  if (!PRESIGNED_URL_RE.test(value)) return value;
  return value.split('?')[0];
}

export function redactSensitiveData(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined || depth > 5) return value;

  if (typeof value === 'string') return stripPresignedQuery(value);

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
