import { createHmac, randomBytes, timingSafeEqual, createHash, createCipheriv, createDecipheriv, hkdfSync } from 'crypto';

/**
 * Time-based one-time codes (RFC 6238, the six-digit codes of Google Authenticator, Microsoft Authenticator and
 * the like) for staff sign-in (SEC-3), with no library: HMAC-SHA1 over the 30-second step, as the RFC sets out.
 */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export const STEP_SECONDS = 30;
export const DIGITS = 6;

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string): Buffer {
  const clean = text.toUpperCase().replace(/[\s=-]/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = ALPHABET.indexOf(ch);
    if (idx < 0) throw new Error('Not base32');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** A new secret: 20 random bytes (160 bits, the RFC's recommendation), base32 as authenticator apps take it. */
export const newTotpSecret = (): string => base32Encode(randomBytes(20));

/** The code for one counter value (RFC 4226 HOTP). */
export function hotp(secret: Buffer, counter: number, digits = DIGITS): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const mac = createHmac('sha1', secret).update(msg).digest();
  const offset = mac[mac.length - 1] & 0x0f;
  const bin = ((mac[offset] & 0x7f) << 24) | (mac[offset + 1] << 16) | (mac[offset + 2] << 8) | mac[offset + 3];
  return String(bin % 10 ** digits).padStart(digits, '0');
}

export const stepAt = (ms: number): number => Math.floor(ms / 1000 / STEP_SECONDS);

/**
 * The step a code belongs to, if it is right for now or one step either side (a phone clock a little off), and is
 * newer than `lastUsedStep` (a code works once); null otherwise.
 */
export function verifyTotp(secretBase32: string, code: string, nowMs: number, lastUsedStep?: number | null): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const secret = base32Decode(secretBase32);
  const now = stepAt(nowMs);
  for (const step of [now - 1, now, now + 1]) {
    if (lastUsedStep != null && step <= lastUsedStep) continue;
    const expected = Buffer.from(hotp(secret, step));
    if (timingSafeEqual(expected, Buffer.from(code))) return step;
  }
  return null;
}

/** The link an authenticator app opens (or a QR code carries) to add the account. */
export function otpauthUrl(secretBase32: string, account: string, issuer = 'Nuray'): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secretBase32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${STEP_SECONDS}`;
}

// ---- backup codes ----

/** Ten one-time backup codes, e.g. "k7m2-9xqa", for when the phone is lost. */
export function newBackupCodes(count = 10): string[] {
  return Array.from({ length: count }, () => {
    const raw = base32Encode(randomBytes(5)).toLowerCase().slice(0, 8);
    return `${raw.slice(0, 4)}-${raw.slice(4)}`;
  });
}

/** Backup codes are random enough that a plain SHA-256 keeps them safe at rest. */
export const hashBackupCode = (code: string): string => createHash('sha256').update(code.toLowerCase().replace(/[\s-]/g, '')).digest('hex');

// ---- the secret at rest ----

/** AES-256-GCM, with a key derived from the server's JWT secret for this one purpose. */
function secretKey(): Buffer {
  const base = process.env.JWT_SECRET;
  if (!base) throw new Error('JWT_SECRET is required');
  return Buffer.from(hkdfSync('sha256', base, 'nuray', 'staff-two-factor-secret', 32));
}

export function sealSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', secretKey(), iv);
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), body.toString('base64')].join('.');
}

export function openSecret(sealed: string): string {
  const [v, iv, tag, body] = sealed.split('.');
  if (v !== 'v1' || !iv || !tag || !body) throw new Error('Unknown secret format');
  const decipher = createDecipheriv('aes-256-gcm', secretKey(), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(body, 'base64')), decipher.final()]).toString('utf8');
}
