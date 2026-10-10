/**
 * The limits on codes and links, with production figures, through a real HTTP server:
 * generous per address (a mobile network is one address), tight per phone number or e-mail
 * (whoever asks, from wherever), and failed sign-ins only per address.
 */
import express from 'express';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import {
  forgotIpLimiter,
  forgotTargetLimiter,
  loginAddressLimiter,
  otpIpLimiter,
  otpTargetLimiter,
  byEmailTarget,
  byPhoneTarget,
} from '../src/middleware/rateLimiter';

let server: Server;
let base: string;
const previousMode = process.env.NODE_ENV;

beforeAll(async () => {
  // The limits are read per request: switch to the figures production runs with.
  process.env.NODE_ENV = 'production';
  const app = express();
  app.set('trust proxy', true);
  app.use(express.json());
  app.post('/otp', otpIpLimiter, otpTargetLimiter, (_req, res) => res.json({ ok: true }));
  app.post('/forgot', forgotIpLimiter, forgotTargetLimiter, (_req, res) => res.json({ ok: true }));
  // A sign-in that fails (status 401) when the password is 'wrong'.
  app.post('/login', loginAddressLimiter, (req, res) => res.status(req.body?.password === 'wrong' ? 401 : 200).json({ ok: req.body?.password !== 'wrong' }));
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => resolve());
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  process.env.NODE_ENV = previousMode;
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

const post = async (path: string, body: unknown, ip = '203.0.113.10') => {
  const res = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip }, body: JSON.stringify(body) });
  return { status: res.status, body: (await res.json()) as any };
};

describe('codes to a phone number', () => {
  it('lets many customers behind one address each ask for a code', async () => {
    const results = [];
    for (let i = 0; i < 8; i++) results.push((await post('/otp', { phone: `0300555000${i}` }, '198.51.100.1')).status);
    expect(results).toEqual(Array(8).fill(200));
  });

  it('stops a fourth code to the same number in fifteen minutes, however it is written and from wherever', async () => {
    const forms = ['0300 7770001', '+923007770001', '923007770001', '0300-7770001'];
    const statuses = [];
    for (let i = 0; i < forms.length; i++) statuses.push((await post('/otp', { phone: forms[i] }, `192.0.2.${i + 1}`)).status);
    expect(statuses).toEqual([200, 200, 200, 429]);
    const blocked = await post('/otp', { phone: '03007770001' }, '192.0.2.99');
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('RATE_LIMITED');
  });

  it('does not touch another number', async () => {
    expect((await post('/otp', { phone: '03007770002' }, '192.0.2.1')).status).toBe(200);
  });

  it('still stops one address that sprays a great many numbers', async () => {
    const statuses = [];
    for (let i = 0; i < 32; i++) statuses.push((await post('/otp', { phone: `03008${String(i).padStart(6, '0')}` }, '198.51.100.77')).status);
    expect(statuses.filter((s) => s === 200)).toHaveLength(30);
    expect(statuses.slice(30)).toEqual([429, 429]);
  });
});

describe('password-reset links', () => {
  it('stops a fourth request for one e-mail in an hour, whatever the case or the address it comes from', async () => {
    const statuses = [];
    const forms = ['victim@example.com', 'Victim@Example.com', ' victim@example.com ', 'VICTIM@EXAMPLE.COM'];
    for (let i = 0; i < forms.length; i++) statuses.push((await post('/forgot', { email: forms[i] }, `192.0.2.${100 + i}`)).status);
    expect(statuses).toEqual([200, 200, 200, 429]);
  });

  it('answers the same whether or not the address has an account, and leaves other e-mails alone', async () => {
    const statuses = [];
    for (let i = 0; i < 3; i++) statuses.push((await post('/forgot', { email: 'nobody-here@example.com' }, '192.0.2.150')).status);
    expect(statuses).toEqual([200, 200, 200]);
    expect((await post('/forgot', { email: 'someone-else@example.com' }, '192.0.2.150')).status).toBe(200);
  });
});

describe('failed sign-ins from one address', () => {
  it('counts only the failures, and lets a shared address keep signing in', async () => {
    const ip = '198.51.100.200';
    for (let i = 0; i < 150; i++) expect((await post('/login', { password: 'right' }, ip)).status).toBe(200);
    const failures = [];
    for (let i = 0; i < 101; i++) failures.push((await post('/login', { password: 'wrong' }, ip)).status);
    expect(failures.slice(0, 100).every((s) => s === 401)).toBe(true);
    expect(failures[100]).toBe(429);
    // Another address is unaffected.
    expect((await post('/login', { password: 'wrong' }, '198.51.100.201')).status).toBe(401);
  }, 30_000);
});

describe('what the counters are keyed by', () => {
  const req = (body: unknown, ip = '203.0.113.7') => ({ ip, body, headers: {} }) as any;

  it('never holds a raw phone number or e-mail address', () => {
    const phoneKey = byPhoneTarget(req({ phone: '0300 1234567' }));
    const emailKey = byEmailTarget(req({ email: 'Someone@Example.com' }));
    expect(phoneKey).toMatch(/^p:[0-9a-f]{32}$/);
    expect(emailKey).toMatch(/^e:[0-9a-f]{32}$/);
    expect(phoneKey).not.toContain('1234567');
    expect(emailKey.toLowerCase()).not.toContain('someone');
  });

  it('treats the same number or address written differently as one', () => {
    expect(byPhoneTarget(req({ phone: '0300 1234567' }))).toBe(byPhoneTarget(req({ phone: '+923001234567' })));
    expect(byEmailTarget(req({ email: ' Someone@Example.com' }))).toBe(byEmailTarget(req({ email: 'someone@example.com' })));
  });

  it('falls back to the address when the request names no number or e-mail', () => {
    expect(byPhoneTarget(req({}))).toBe('203.0.113.7');
    expect(byEmailTarget(req({ email: 12345 }))).toBe('203.0.113.7');
  });
});
