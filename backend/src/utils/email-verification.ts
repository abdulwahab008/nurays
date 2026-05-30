import crypto from 'crypto';

/**
 * Generate a secure random token for email verification
 */
export function generateVerificationToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Check if verification token is expired
 */
export function isVerificationTokenExpired(expiresAt: Date): boolean {
  return new Date() > expiresAt;
}

