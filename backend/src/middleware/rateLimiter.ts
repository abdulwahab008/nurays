import { createHash } from 'crypto';
import type { Request } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { RedisStore, type RedisReply } from 'rate-limit-redis';
import { isProduction } from '../config/env';
import { getRedis } from '../config/redis';
import { verifyToken } from '../utils/jwt';
import { formatPhoneNumber } from '../utils/otp';

/**
 * Counters live in Redis when it is configured, so every app instance enforces the same
 * limit and a restart doesn't reset it; otherwise in this process's memory. If Redis is
 * unreachable a request is let through (and the error logged) rather than refused: an
 * outage must not lock everyone out of signing in or ordering.
 */
function store(name: string) {
  const redis = getRedis();
  if (!redis) return undefined;
  return new RedisStore({
    prefix: `rl:${name}:`,
    sendCommand: async (command: string, ...args: string[]) => {
      // The store loads its Lua script once, at startup, and never retries a failed load, so
      // a Redis that wasn't reachable yet would disable the limit until a restart. SCRIPT LOAD
      // only returns the script's SHA1: answer that locally if Redis can't be reached, and the
      // store's NOSCRIPT handling loads the script for real once it can (also after a Redis
      // restart, which forgets loaded scripts).
      if (command === 'SCRIPT' && args[0] === 'LOAD') {
        try {
          return (await redis.call(command, ...args)) as RedisReply;
        } catch {
          return createHash('sha1').update(args[1]).digest('hex');
        }
      }
      return redis.call(command, ...args) as Promise<RedisReply>;
    },
  });
}

/** Signed-in callers by account (many people can share one mobile-network IP), others by IP. */
const byUserOrIp = (req: Request) => req.user?.userId ?? ipKeyGenerator(req.ip ?? '');

/**
 * The same, for limiters that run before authenticate(): a valid bearer token names the
 * account (a pure signature check, no database), anything else is counted by IP.
 */
export const byTokenOrIp = (req: Request) => {
  const header = req.headers.authorization;
  if (typeof header === 'string' && header.startsWith('Bearer ')) {
    try {
      return `u:${verifyToken(header.slice(7)).userId}`;
    } catch {
      /* expired or forged: counted with the address it came from */
    }
  }
  return ipKeyGenerator(req.ip ?? '');
};

/**
 * Credential guessing is one attacker trying one account: counted per address and
 * account together, so a whole mobile network is not locked out by one person's typos.
 * (An address trying many accounts is counted separately: loginAddressLimiter.)
 */
export const byIpAndAccount = (req: Request) => {
  const account = typeof req.body?.phoneOrEmail === 'string' ? req.body.phoneOrEmail.trim().toLowerCase() : '';
  return `${ipKeyGenerator(req.ip ?? '')}:${account}`;
};

const digest = (value: string) => createHash('sha256').update(value).digest('hex').slice(0, 32);

/**
 * Counted by the phone number a code is for, whoever asks and from wherever: "0300 1234567" and
 * "+923001234567" are one number. Hashed, so the counter store never holds a phone number. A
 * request with no usable number is counted by address instead.
 */
export const byPhoneTarget = (req: Request) => {
  const raw = typeof req.body?.phone === 'string' ? req.body.phone.trim() : '';
  return raw ? `p:${digest(formatPhoneNumber(raw))}` : ipKeyGenerator(req.ip ?? '');
};

/** The same for an e-mail address (what a link is sent to): case and stray spaces do not make a new address. */
export const byEmailTarget = (req: Request) => {
  const raw = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  return raw ? `e:${digest(raw)}` : ipKeyGenerator(req.ip ?? '');
};

/** One address, whatever it asks for. */
export const byAddress = (req: Request) => ipKeyGenerator(req.ip ?? '');

function limiter(
  name: string,
  opts: { windowMs: number; limit: number | (() => number); message: string; perUser?: boolean; keyGenerator?: (req: Request) => string; skipSuccessfulRequests?: boolean }
) {
  return rateLimit({
    windowMs: opts.windowMs,
    limit: opts.limit,
    standardHeaders: true,
    legacyHeaders: false,
    passOnStoreError: true,
    store: store(name),
    ...(opts.keyGenerator ? { keyGenerator: opts.keyGenerator } : opts.perUser ? { keyGenerator: byUserOrIp } : {}),
    ...(opts.skipSuccessfulRequests ? { skipSuccessfulRequests: true } : {}),
    message: { success: false, error: { message: opts.message, code: 'RATE_LIMITED' } },
  });
}

const MINUTE = 60 * 1000;

/**
 * Flood protection for the whole API: signed-in traffic per account, the rest per IP.
 * Deliberately generous: Pakistani mobile networks put many customers behind one address.
 */
export const apiLimiter = limiter('api', {
  windowMs: MINUTE,
  limit: isProduction() ? 1200 : 100_000,
  keyGenerator: byTokenOrIp,
  message: 'Too many requests. Please slow down.',
});

// Brute-force protection on login: failed attempts per address and account. Signing in
// successfully costs nothing, so a shared address never runs out of logins.
export const loginLimiter = limiter('login', {
  windowMs: 15 * MINUTE,
  // Relaxed only in development / test; any other NODE_ENV gets the real limit.
  limit: isProduction() ? 10 : 1000,
  keyGenerator: byIpAndAccount,
  skipSuccessfulRequests: true,
  message: 'Too many login attempts. Please try again later.',
});

/** Production gets the real figure; development and tests one nobody reaches. Read per request, so a test can switch modes. */
const live = (real: number, relaxed = 10_000) => () => (isProduction() ? real : relaxed);

// Codes and links cost real SMS credits and e-mail reputation, and a person typing a wrong number is the common case.
// Two limits do the work: the address (loose: a mobile network puts many customers behind one address) and the
// number or e-mail the message goes to (tight, whoever asks). The database also caps each number (otp.service).
export const otpIpLimiter = limiter('otp-ip', {
  windowMs: 15 * MINUTE,
  limit: live(30),
  keyGenerator: byAddress,
  message: 'Too many OTP requests. Please try again later.',
});
export const otpTargetLimiter = limiter('otp-phone', {
  windowMs: 15 * MINUTE,
  limit: live(3),
  keyGenerator: byPhoneTarget,
  message: 'A code was already sent to this number. Please wait a few minutes before asking again.',
});
// Adding a phone number to a signed-in account: counted by account.
export const phoneVerifyRequestLimiter = limiter('phone-request', {
  windowMs: 60 * MINUTE,
  limit: live(5),
  perUser: true,
  message: 'Too many verification codes requested. Please try again later.',
});

// "Forgot password" mails a one-time link, and every new link cancels the last one.
export const forgotIpLimiter = limiter('forgot-ip', {
  windowMs: 15 * MINUTE,
  limit: live(20),
  keyGenerator: byAddress,
  message: 'Too many requests. Please try again later.',
});
export const forgotTargetLimiter = limiter('forgot-email', {
  windowMs: 60 * MINUTE,
  limit: live(3),
  keyGenerator: byEmailTarget,
  message: 'A reset link was already requested for this address. Please check your e-mail, or try again in an hour.',
});

// Re-sending the e-mail-verification link.
export const resendVerificationLimiter = limiter('resend-verification', {
  windowMs: 60 * MINUTE,
  limit: live(3),
  perUser: true,
  message: 'Too many verification e-mails requested. Please try again later.',
});

// Guessing across accounts from one address: failed sign-ins only, so a shared address never runs out of logins.
// Generous (a mobile network is one address); loginLimiter covers one address trying one account.
export const loginAddressLimiter = limiter('login-ip', {
  windowMs: 15 * MINUTE,
  limit: live(100, 100_000),
  keyGenerator: byAddress,
  skipSuccessfulRequests: true,
  message: 'Too many login attempts. Please try again later.',
});

// Prevent scripted mass account creation from one IP.
export const registerLimiter = limiter('register', {
  windowMs: 60 * MINUTE,
  limit: isProduction() ? 10 : 10000,
  message: 'Too many registration attempts. Please try again later.',
});

// Prevent brute-forcing/guessing promo codes.
export const promoValidateLimiter = limiter('promo', {
  windowMs: MINUTE,
  limit: 20,
  message: 'Too many attempts. Please slow down.',
});

// Uploads are processed (decoded, resized) and stored: cap them per user.
export const uploadLimiter = limiter('upload', {
  windowMs: 10 * MINUTE,
  limit: 60,
  perUser: true,
  message: 'Too many uploads. Please wait a few minutes.',
});

// Placing orders reserves stock and notifies kitchens.
export const orderLimiter = limiter('order', {
  windowMs: 10 * MINUTE,
  limit: isProduction() ? 20 : 10_000,
  perUser: true,
  message: 'Too many orders in a short time. Please wait a few minutes.',
});

// Chat messages and support ticket replies.
export const messageLimiter = limiter('message', {
  windowMs: 5 * MINUTE,
  limit: isProduction() ? 60 : 10_000,
  perUser: true,
  message: 'You are sending messages too quickly. Please wait a moment.',
});

// Reviews, support tickets and payment receipts: things a person does a few times a day.
export const submissionLimiter = limiter('submission', {
  windowMs: 60 * MINUTE,
  limit: isProduction() ? 30 : 10_000,
  perUser: true,
  message: 'Too many submissions. Please try again later.',
});

// A rider's phone reporting its position while on a job: about one a second at most.
export const locationLimiter = limiter('location', {
  windowMs: MINUTE,
  limit: isProduction() ? 90 : 10_000,
  perUser: true,
  message: 'Location updates are coming in too fast.',
});
