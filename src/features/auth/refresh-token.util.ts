import { randomBytes, createHash } from 'crypto';

export function generateRefreshToken(): string {
  return randomBytes(64).toString('hex');
}

export function hashRefreshToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}
