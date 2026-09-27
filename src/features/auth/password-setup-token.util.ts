import { createHash, randomBytes } from 'crypto';

export const PASSWORD_SETUP_TTL_HOURS = 24;

export function generatePasswordSetupToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashPasswordSetupToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function passwordSetupExpiry(now = new Date()): Date {
  return new Date(now.getTime() + PASSWORD_SETUP_TTL_HOURS * 60 * 60 * 1000);
}
