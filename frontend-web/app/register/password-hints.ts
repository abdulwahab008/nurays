/**
 * The sign-up form's live password checks, the same rules the server applies (backend/src/utils/password-rules.ts):
 * long enough, and not built from the brand or the person's own name, e-mail or phone. The server still decides.
 */
export const MIN_PASSWORD_LENGTH = 8;

export interface PasswordOwner {
  name?: string;
  email?: string;
  phone?: string;
}

function personalWords(owner: PasswordOwner): string[] {
  const words = ['nuray'];
  const local = (owner.email ?? '').split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
  if (local.length >= 4) words.push(local);
  const digits = (owner.phone ?? '').replace(/\D/g, '');
  if (digits.length >= 8) words.push(digits.slice(-10), digits.slice(-8));
  for (const part of (owner.name ?? '').toLowerCase().split(/\s+/)) {
    const word = part.replace(/[^\p{L}\p{N}]/gu, '');
    if (word.length >= 4) words.push(word);
  }
  return words;
}

export const longEnough = (password: string) => [...password].length >= MIN_PASSWORD_LENGTH;

/** True when the password contains the brand or the person's own name, e-mail name or phone number. */
export function usesPersonalDetails(password: string, owner: PasswordOwner): boolean {
  const lower = password.toLowerCase();
  return lower.length > 0 && personalWords(owner).some((w) => lower.includes(w));
}
