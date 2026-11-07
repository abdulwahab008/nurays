/**
 * The refresh token as an httpOnly cookie: set on every sign-in answer, read by /refresh and /logout only when the
 * request comes from the website's own origin, and cleared on sign-out. The real controller and cookie helpers run
 * behind a small Express app; the session store and auth service are doubles.
 */
import express from 'express';
import type { AddressInfo } from 'net';
import type { Server } from 'http';

jest.mock('../src/config/database', () => ({ __esModule: true, default: {} }));
jest.mock('../src/config/socket', () => ({ __esModule: true, default: { disconnectSession: jest.fn(), disconnectUser: jest.fn() } }));
jest.mock('../src/middleware/audit', () => ({ recordAudit: jest.fn(() => Promise.resolve()) }));
jest.mock('../src/services/push.service', () => ({ removeSubscription: jest.fn(() => Promise.resolve()), removeAllSubscriptions: jest.fn(() => Promise.resolve()) }));
jest.mock('../src/services/session.service', () => ({ endSession: jest.fn(() => Promise.resolve(true)), listSessions: jest.fn() }));
jest.mock('../src/services/auth.service', () => ({
  __esModule: true,
  default: { refreshToken: jest.fn(async () => ({ accessToken: 'new-access', refreshToken: 'new-refresh' })) },
}));

import authService from '../src/services/auth.service';
import { endSession } from '../src/services/session.service';
import socketManager from '../src/config/socket';
import { refreshToken, logout } from '../src/controllers/auth.controller';
import { errorHandler } from '../src/middleware/errorHandler';
import { generateRefreshToken } from '../src/utils/jwt';
import { readRefreshCookie, refreshCookieOnSignIn, REFRESH_COOKIE } from '../src/utils/refresh-cookie';

const SITE = 'http://localhost:3000';
let server: Server;
let base: string;

beforeAll(async () => {
  process.env.CORS_ORIGIN = SITE;
  const app = express();
  app.use(express.json());
  const auth = express.Router();
  auth.use(refreshCookieOnSignIn);
  auth.post('/login', (_req, res) => {
    res.json({ success: true, data: { tokens: { access_token: 'a', refresh_token: generateRefreshToken({ userId: 'u1', userType: 'customer', phone: '+92', sid: 's1', jti: 'j1' }) } } });
  });
  auth.post('/refresh', (req, res, next) => refreshToken(req, res).catch(next));
  auth.post('/logout', (req, res, next) => logout(req, res).catch(next));
  app.use('/api/v1/auth', auth);
  app.use(errorHandler);
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => resolve());
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1/auth`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));
beforeEach(() => jest.clearAllMocks());

const post = (path: string, headers: Record<string, string> = {}, body: unknown = {}) =>
  fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });

const cookieFor = (sid = 's1') => `${REFRESH_COOKIE}=${generateRefreshToken({ userId: 'u1', userType: 'customer', phone: '+92', sid, jti: 'j9' })}`;

describe('signing in', () => {
  it('puts the refresh token in an httpOnly cookie scoped to the auth routes', async () => {
    const res = await post('/login', { Origin: SITE });
    const set = res.headers.get('set-cookie') ?? '';
    expect(set).toMatch(new RegExp(`^${REFRESH_COOKIE}=`));
    expect(set).toMatch(/HttpOnly/i);
    expect(set).toMatch(/SameSite=Lax/i);
    expect(set).toMatch(/Path=\/api\/v1\/auth/);
    expect(set).toMatch(/Expires=/);
  });

  it('sets no cookie for a sign-in posted by another site, so it cannot plant its own account', async () => {
    expect((await post('/login', { Origin: 'https://evil.example' })).headers.get('set-cookie')).toBeNull();
    expect((await post('/login')).headers.get('set-cookie')).toBeNull();
  });

  it('sets no cookie for a developer-login tab that keeps its own session', async () => {
    expect((await post('/login', { Origin: SITE, 'X-Nuray-Isolated-Tab': '1' })).headers.get('set-cookie')).toBeNull();
  });
});

describe('what the answer carries', () => {
  const env = process.env.NODE_ENV;
  afterEach(() => {
    process.env.NODE_ENV = env;
  });

  it('keeps the refresh token in the answer outside production', async () => {
    const body = (await (await post('/login')).json()) as { data: { tokens: Record<string, unknown> } };
    expect(typeof body.data.tokens.refresh_token).toBe('string');
  });

  it('takes it out of every answer in production, leaving only the cookie (marked Secure)', async () => {
    process.env.NODE_ENV = 'production';
    const login = await post('/login', { Origin: SITE });
    const loginBody = (await login.json()) as { data: { tokens: Record<string, unknown> } };
    expect(loginBody.data.tokens).toEqual({ access_token: 'a' });
    expect(login.headers.get('set-cookie')).toMatch(/Secure/);

    const refresh = await post('/refresh', { Origin: SITE, Cookie: cookieFor() });
    const refreshBody = (await refresh.json()) as { data: Record<string, unknown> };
    expect(refreshBody.data).toEqual({ accessToken: 'new-access' });
    expect(refresh.headers.get('set-cookie')).toMatch(new RegExp(`^${REFRESH_COOKIE}=new-refresh`));
  });
});

describe('refreshing', () => {
  it('takes the cookie from the website and sets the new refresh token as the cookie', async () => {
    const cookie = cookieFor();
    const res = await post('/refresh', { Origin: SITE, Cookie: cookie });
    expect(res.status).toBe(200);
    expect(authService.refreshToken).toHaveBeenCalledWith(cookie.slice(REFRESH_COOKIE.length + 1));
    expect(res.headers.get('set-cookie')).toMatch(new RegExp(`^${REFRESH_COOKIE}=new-refresh`));
  });

  it('refuses the cookie from any other origin', async () => {
    const res = await post('/refresh', { Origin: 'https://evil.example', Cookie: cookieFor() });
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('ORIGIN_NOT_ALLOWED');
    expect(authService.refreshToken).not.toHaveBeenCalled();
  });

  it('refuses the cookie when no origin is given', async () => {
    const res = await post('/refresh', { Cookie: cookieFor() });
    expect(res.status).toBe(403);
  });

  it('still takes a refresh token in the body', async () => {
    const res = await post('/refresh', {}, { refreshToken: 'from-body' });
    expect(res.status).toBe(200);
    expect(authService.refreshToken).toHaveBeenCalledWith('from-body');
  });

  it('is a 401 with neither', async () => {
    const res = await post('/refresh', { Origin: SITE });
    expect(res.status).toBe(401);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('NO_REFRESH_TOKEN');
  });
});

describe('signing out', () => {
  it('ends the session the cookie names and clears the cookie, with no access token in hand', async () => {
    const res = await post('/logout', { Origin: SITE, Cookie: cookieFor('s7') });
    expect(res.status).toBe(200);
    expect(endSession).toHaveBeenCalledWith('u1', 's7');
    expect(socketManager.disconnectSession).toHaveBeenCalledWith('s7');
    expect(res.headers.get('set-cookie')).toMatch(new RegExp(`^${REFRESH_COOKIE}=;.*Expires=Thu, 01 Jan 1970`));
  });

  it('neither ends a session nor clears the cookie for another site', async () => {
    const res = await post('/logout', { Origin: 'https://evil.example', Cookie: cookieFor('s7') });
    expect(res.status).toBe(200);
    expect(endSession).not.toHaveBeenCalled();
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('leaves the browser\'s cookie alone when a developer-login tab signs out', async () => {
    const res = await post('/logout', { Origin: SITE, Cookie: cookieFor('s7'), 'X-Nuray-Isolated-Tab': '1' });
    expect(endSession).not.toHaveBeenCalled();
    expect(res.headers.get('set-cookie')).toBeNull();
  });
});

describe('readRefreshCookie', () => {
  const read = (cookie?: string) => readRefreshCookie({ headers: { cookie } } as never);
  it('finds the cookie among others', () => expect(read(`a=1; ${REFRESH_COOKIE}=tok; b=2`)).toBe('tok'));
  it('is null without it', () => expect(read('a=1')).toBeNull());
  it('is null with no cookie header', () => expect(read(undefined)).toBeNull());
  it('is null for a malformed value', () => expect(read(`${REFRESH_COOKIE}=%E0%A4%A`)).toBeNull());
});
