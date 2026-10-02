import { createHash } from 'crypto';
import type { Request } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { RedisStore, type RedisReply } from 'rate-limit-redis';
import { isProduction } from '../config/env';
import { getRedis } from '../config/redis';

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

function limiter(name: string, opts: { windowMs: number; limit: number; message: string; perUser?: boolean }) {
  return rateLimit({
    windowMs: opts.windowMs,
    limit: opts.limit,
    standardHeaders: true,
    legacyHeaders: false,
    passOnStoreError: true,
    store: store(name),
    ...(opts.perUser ? { keyGenerator: byUserOrIp } : {}),
    message: { success: false, error: { message: opts.message, code: 'RATE_LIMITED' } },
  });
}

const MINUTE = 60 * 1000;

/**
 * Flood protection for the whole API, per IP. Deliberately generous: Pakistani mobile
 * networks put many customers behind one address.
 */
export const apiLimiter = limiter('api', {
  windowMs: MINUTE,
  limit: isProduction() ? 1200 : 100_000,
  message: 'Too many requests. Please slow down.',
});

// Brute-force protection on login: same IP can't hammer credentials.
export const loginLimiter = limiter('login', {
  windowMs: 15 * MINUTE,
  // Relaxed only in development / test; any other NODE_ENV gets the real limit.
  limit: isProduction() ? 10 : 1000,
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
