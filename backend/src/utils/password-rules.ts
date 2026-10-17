import { COMMON_PASSWORDS } from '../data/common-passwords';

/**
 * What a new password has to be: long enough, not one of the most common passwords, and not made of
 * the person's own name, phone number or e-mail. Checked when a password is chosen (sign-up, reset,
 * a staff member's first password), never at sign-in, so existing accounts keep working.
 *
 * Pure rules, no framework: the command-line admin scripts use them too (utils/password-policy.ts
 * turns a problem into the API's error).
 */

export const MIN_PASSWORD_LENGTH = 8;
export const MIN_STAFF_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 200;

export type PasswordProblem = 'TOO_SHORT' | 'TOO_LONG' | 'COMMON' | 'PERSONAL';

export interface PasswordContext {
  /** Shortest allowed length (staff accounts use MIN_STAFF_PASSWORD_LENGTH). */
  minLength?: number;
  email?: string | null;
  phone?: string | null;
  name?: string | null;
}

let common: Set<string> | null = null;
const commonSet = () => (common ??= new Set(COMMON_PASSWORDS.split('\n').filter(Boolean)));

/** Characters as a person counts them: an emoji or an Urdu letter with its marks is one, not two or three. */
const length = (s: string) => [...s].length;

function isCommon(password: string): boolean {
  const lower = password.toLowerCase();
  const set = commonSet();
  if (set.has(lower)) return true;
  // "Password123!" is the common word with a decoration: look at the word without its tail.
  const stem = lower.replace(/[^a-z]+$/u, '');
  return stem.length >= 5 && stem !== lower && set.has(stem);
}

/** Words that must not appear inside the password: the brand, and what the account says about its owner. */
function personalWords(ctx: PasswordContext): string[] {
  const words = ['nuray'];
  const local = (ctx.email ?? '').split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
  if (local.length >= 4) words.push(local);
  const digits = (ctx.phone ?? '').replace(/\D/g, '');
  if (digits.length >= 8) words.push(digits.slice(-10), digits.slice(-8));
  for (const part of (ctx.name ?? '').toLowerCase().split(/\s+/)) {
    const word = part.replace(/[^\p{L}\p{N}]/gu, '');
    if (word.length >= 4) words.push(word);
  }
  return words;
}

/** The first thing wrong with a password, or null when it is acceptable. */
export function checkPassword(password: string, ctx: PasswordContext = {}): PasswordProblem | null {
  const min = ctx.minLength ?? MIN_PASSWORD_LENGTH;
  const chars = length(password);
  if (chars < min) return 'TOO_SHORT';
  if (chars > MAX_PASSWORD_LENGTH) return 'TOO_LONG';
  if (isCommon(password)) return 'COMMON';
  const lower = password.toLowerCase();
  if (personalWords(ctx).some((w) => lower.includes(w))) return 'PERSONAL';
  return null;
}
