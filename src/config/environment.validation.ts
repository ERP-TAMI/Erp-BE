type Environment = Record<string, unknown>;

function hasText(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

export function validateEnvironment(environment: Environment): Environment {
  if (environment.NODE_ENV !== 'production') return environment;

  const missing: string[] = [];
  if (!hasText(environment.MAIL_HOST)) missing.push('MAIL_HOST');
  if (!hasText(environment.MAIL_PORT)) missing.push('MAIL_PORT');
  if (!hasText(environment.MAIL_USERNAME) && !hasText(environment.MAIL_USER)) {
    missing.push('MAIL_USERNAME or MAIL_USER');
  }
  if (!hasText(environment.MAIL_PASSWORD) && !hasText(environment.MAIL_PASS)) {
    missing.push('MAIL_PASSWORD or MAIL_PASS');
  }
  if (!hasText(environment.FRONTEND_URL)) missing.push('FRONTEND_URL');

  const port = Number(environment.MAIL_PORT);
  if (
    hasText(environment.MAIL_PORT) &&
    (!Number.isInteger(port) || port <= 0)
  ) {
    throw new Error('MAIL_PORT must be a positive integer in production.');
  }
  if (hasText(environment.FRONTEND_URL)) {
    try {
      new URL(String(environment.FRONTEND_URL));
    } catch {
      throw new Error(
        'FRONTEND_URL must be a valid absolute URL in production.',
      );
    }
  }
  if (missing.length > 0) {
    throw new Error(
      `Missing required production mail configuration: ${missing.join(', ')}`,
    );
  }
  return environment;
}
