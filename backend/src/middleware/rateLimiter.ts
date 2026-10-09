import { createHash } from 'crypto';
import type { Request } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { RedisStore, type RedisReply } from 'rate-limit-redis';
import { isProduction } from '../config/env';
import { getRedis } from '../config/redis';
import { verifyToken } from '../utils/jwt';

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
 * account together, so a whole mobile network is not locked out by one person's typos
 * and one address cannot try many accounts freely.
 */
export const byIpAndAccount = (req: Request) => {
  const account = typeof req.body?.phoneOrEmail === 'string' ? req.body.phoneOrEmail.trim().toLowerCase() : '';
  return `${ipKeyGenerator(req.ip ?? '')}:${account}`;
};

function limiter(
  name: string,
  opts: { windowMs: number; limit: number; message: string; perUser?: boolean; keyGenerator?: (req: Request) => string; skipSuccessfulRequests?: boolean }
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

// OTP requests cost real SMS credits — keep this tight.
export const otpLimiter = limiter('otp', {
  windowMs: 15 * MINUTE,
  limit: 5,
  message: 'Too many OTP requests. Please try again later.',
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
