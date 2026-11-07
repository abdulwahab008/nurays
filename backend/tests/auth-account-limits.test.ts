/**
 * AS-2 and AS-14, with production figures, through a real HTTP server: failed sign-ins are capped per account across
 * every address (a botnet gets 30 guesses per account per 15 minutes, not 10 per address), the same for an account that
 * does not exist, and /refresh and /verify-email have limits of their own.
 */
import express from 'express';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import { byLoginAccount, byRefreshTokenOrIp, loginAccountLimiter, refreshLimiter, verifyEmailLimiter } from '../src/middleware/rateLimiter';
import { generateRefreshToken, generateToken } from '../src/utils/jwt';
import type { Request } from 'express';

let server: Server;
let base: string;
const previousMode = process.env.NODE_ENV;

beforeAll(async () => {
  process.env.NODE_ENV = 'production';
  const app = express();
  app.set('trust proxy', true);
  app.use(express.json());
  // A sign-in that fails (401) unless the password is 'right'.
  app.post('/login', loginAccountLimiter, (req, res) => {
    const password = req.body?.password;
    res.status(password === 'right' ? 200 : password === 'busy' ? 503 : 401).json({ ok: password === 'right' });
  });
  app.post('/refresh', refreshLimiter, (_req, res) => res.json({ ok: true }));
  app.post('/verify-email', verifyEmailLimiter, (_req, res) => res.json({ ok: true }));
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => resolve());
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  process.env.NODE_ENV = previousMode;
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

const post = async (path: string, body: unknown, ip: string) => {
  const res = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip }, body: JSON.stringify(body) });
  return { status: res.status, body: (await res.json()) as { error?: { code: string; message: string } } };
};

describe('failed sign-ins per account', () => {
  it('stops the 31st wrong password from 31 different addresses, and then refuses the right one too', async () => {
    const statuses = [];
    for (let i = 0; i < 31; i++) statuses.push((await post('/login', { phoneOrEmail: i % 2 ? 'Stuffed@Nuray.test' : ' stuffed@nuray.test', password: `guess-${i}` }, `192.0.2.${i + 1}`)).status);
    expect(statuses.slice(0, 30)).toEqual(Array(30).fill(401));
    expect(statuses[30]).toBe(429);
    const locked = await post('/login', { phoneOrEmail: 'stuffed@nuray.test', password: 'right' }, '198.51.100.200');
    expect(locked.status).toBe(429);
    expect(locked.body.error?.code).toBe('RATE_LIMITED');
  });

  it('answers an address with no account exactly as it answers a real one', async () => {
    const statuses = [];
    for (let i = 0; i < 31; i++) statuses.push((await post('/login', { phoneOrEmail: 'nobody-here@nuray.test', password: `guess-${i}` }, `203.0.113.${i + 1}`)).status);
    expect(statuses[30]).toBe(429);
  });

  it('does not count successful sign-ins, or touch another account', async () => {
    for (let i = 0; i < 40; i++) expect((await post('/login', { phoneOrEmail: 'regular@nuray.test', password: 'right' }, '198.51.100.9')).status).toBe(200);
    expect((await post('/login', { phoneOrEmail: 'other@nuray.test', password: 'wrong' }, '192.0.2.1')).status).toBe(401);
  });

  it('does not count a sign-in turned away as busy (503), which checked no password', async () => {
    for (let i = 0; i < 40; i++) expect((await post('/login', { phoneOrEmail: 'storm@nuray.test', password: 'busy' }, '198.51.100.10')).status).toBe(503);
    expect((await post('/login', { phoneOrEmail: 'storm@nuray.test', password: 'right' }, '198.51.100.10')).status).toBe(200);
  });

  it('keys a phone number however it is written, hashed, and skips a body with no account', () => {
    const req = (phoneOrEmail?: string, loginMethod?: string) => ({ ip: '203.0.113.7', body: { phoneOrEmail, loginMethod } }) as unknown as Request;
    expect(byLoginAccount(req('0300 1234567', 'otp'))).toBe(byLoginAccount(req('+923001234567', 'otp')));
    expect(byLoginAccount(req('A@B.test '))).toBe(byLoginAccount(req('a@b.test', 'email')));
    expect(byLoginAccount(req('a@b.test'))).not.toContain('a@b.test');
    expect(byLoginAccount(req(undefined))).toBe('');
  });

  it('keys a code sign-in by its phone number even with an @ in it', () => {
    const otp = (phoneOrEmail: string) => ({ ip: '203.0.113.7', body: { phoneOrEmail, loginMethod: 'otp' } }) as unknown as Request;
    expect(byLoginAccount(otp('@0300 1234567'))).toBe(byLoginAccount(otp('+923001234567')));
    expect(byLoginAccount(otp('0300@1234567'))).toBe(byLoginAccount(otp('03001234567')));
  });
});

describe('refresh and e-mail verification limits', () => {
  it('counts a refresh by the account its token names, and anything else by address', () => {
    const refresh = generateRefreshToken({ userId: 'user-r', userType: 'customer', phone: '+923001234567' });
    const access = generateToken({ userId: 'user-r', userType: 'customer', phone: '+923001234567' });
    const req = (refreshToken: string) => ({ ip: '203.0.113.7', body: { refreshToken } }) as unknown as Request;
    expect(byRefreshTokenOrIp(req(refresh))).toBe('u:user-r');
    expect(byRefreshTokenOrIp(req(access))).toBe('203.0.113.7');
  });

  it('stops the 101st refresh from one address in 15 minutes', async () => {
    const statuses = [];
    for (let i = 0; i < 101; i++) statuses.push((await post('/refresh', { refreshToken: 'expired' }, '198.51.100.50')).status);
    expect(statuses.filter((s) => s === 200)).toHaveLength(100);
    expect(statuses[100]).toBe(429);
  });

  it('stops the 31st verification-link try from one address in 15 minutes', async () => {
    const statuses = [];
    for (let i = 0; i < 31; i++) statuses.push((await post('/verify-email', { token: `t-${i}` }, '198.51.100.60')).status);
    expect(statuses.slice(0, 30)).toEqual(Array(30).fill(200));
    expect(statuses[30]).toBe(429);
  });
});
