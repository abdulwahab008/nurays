/**
 * What the authenticate middleware answers. A bad token is a 401 INVALID_TOKEN; but a database that does not answer while the token
 * is being checked used to be answered the same way, so during any database trouble every signed-in person's request said
 * "invalid token" and the web app signed them all out. It is the error handler's now (a 503), and the token is not blamed.
 */
const db: any = {};
jest.mock('../src/config/database', () => ({ __esModule: true, default: db }));
jest.mock('../src/utils/logger', () => ({ logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() }, setLogUser: jest.fn() }));

import type { Request, Response } from 'express';
import { authenticate } from '../src/middleware/auth.middleware';
import { toAppError, AppError } from '../src/middleware/errorHandler';
import { generateToken, generateRefreshToken } from '../src/utils/jwt';

const payload = { userId: 'u1', userType: 'customer', phone: '+923001110001' };
const run = async (headers: Record<string, string> = {}) => {
  const req = { headers } as unknown as Request;
  const next = jest.fn();
  await authenticate(req, {} as Response, next);
  expect(next).toHaveBeenCalledTimes(1);
  return { req, error: next.mock.calls[0][0] as unknown };
};
const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
const user = (over: Record<string, unknown> = {}) => ({ id: 'u1', status: 'active', userType: 'customer', staffRole: null, tokensValidAfter: null, ...over });

beforeEach(() => {
  db.user = { findUnique: jest.fn(async () => user()) };
});

describe('authenticate', () => {
  it('lets a good token through with the freshly read role', async () => {
    db.user.findUnique = jest.fn(async () => user({ userType: 'seller' }));
    const { req, error } = await run(bearer(generateToken(payload)));
    expect(error).toBeUndefined();
    expect(req.user).toMatchObject({ id: 'u1', userType: 'seller' });
  });

  it('answers 401 INVALID_TOKEN to a bad token, an expired one, nonsense, and a refresh token used as an access token', async () => {
    for (const header of [bearer('not-a-token'), bearer(generateToken(payload).slice(0, -3) + 'abc'), bearer(generateRefreshToken(payload))]) {
      const { error } = await run(header);
      expect(error).toBeInstanceOf(AppError);
      expect([(error as AppError).statusCode, (error as AppError).code]).toEqual([401, 'INVALID_TOKEN']);
    }
    expect(db.user.findUnique).not.toHaveBeenCalled();
  });

  it('answers 401 NO_TOKEN without one', async () => {
    const { error } = await run({});
    expect([(error as AppError).statusCode, (error as AppError).code]).toEqual([401, 'NO_TOKEN']);
  });

  it('answers what a missing, suspended or signed-out account is', async () => {
    db.user.findUnique = jest.fn(async () => null);
    expect((await run(bearer(generateToken(payload)))).error).toMatchObject({ statusCode: 401, code: 'USER_NOT_FOUND' });
    db.user.findUnique = jest.fn(async () => user({ status: 'suspended' }));
    expect((await run(bearer(generateToken(payload)))).error).toMatchObject({ statusCode: 403, code: 'ACCOUNT_SUSPENDED' });
    db.user.findUnique = jest.fn(async () => user({ tokensValidAfter: new Date(Date.now() + 60_000) }));
    expect((await run(bearer(generateToken(payload)))).error).toMatchObject({ statusCode: 401, code: 'SESSION_REVOKED' });
  });

  it('does not call a good token invalid when the database does not answer', async () => {
    const outage = Object.assign(new Error("Can't reach database server"), { name: 'PrismaClientInitializationError', clientVersion: '6.19.3' });
    db.user.findUnique = jest.fn(async () => {
      throw outage;
    });
    const { error } = await run(bearer(generateToken(payload)));
    expect(error).toBe(outage);
    // ...which the error handler answers as a 503, not as a rejected token
    const answered = toAppError(error) as AppError;
    expect([answered.statusCode, answered.code]).toEqual([503, 'SERVICE_UNAVAILABLE']);
  });

  it('also keeps a busy or timed-out database from looking like a bad token', async () => {
    for (const code of ['P2024', 'P2028']) {
      const busy = Object.assign(new Error('db'), { code, clientVersion: '6.0.0' });
      db.user.findUnique = jest.fn(async () => {
        throw busy;
      });
      const { error } = await run(bearer(generateToken(payload)));
      expect([(toAppError(error) as AppError).statusCode, (toAppError(error) as AppError).code]).toEqual([503, 'SERVICE_BUSY']);
    }
  });
});
