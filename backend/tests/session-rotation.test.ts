/**
 * Refresh-token rotation (SEC-2): each refresh token works once, a copied one that comes back ends its session,
 * two tabs refreshing together both carry on, signing out one device leaves the others signed in, and a token from
 * before sessions were recorded signs in again. The refresh_tokens table is an in-memory double.
 */
const db: any = {};
jest.mock('../src/config/database', () => ({ __esModule: true, default: db }));
jest.mock('../src/middleware/audit', () => ({ recordAudit: jest.fn(() => Promise.resolve()) }));

import { recordAudit } from '../src/middleware/audit';
import { generateRefreshToken, verifyRefreshToken, verifyToken } from '../src/utils/jwt';
import { requestContext } from '../src/utils/logger';
import {
  REUSE_LEEWAY_MS,
  endAllSessions,
  endSession,
  isSessionActive,
  listSessions,
  pruneRefreshTokens,
  rotateSession,
  startSession,
} from '../src/services/session.service';

interface Row {
  id: string;
  userId: string;
  familyId: string;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: Date;
  expiresAt: Date;
  usedAt: Date | null;
  revokedAt: Date | null;
}

let rows: Row[];
let account: { id: string; userType: string; phone: string; status: string; tokensValidAfter: Date | null };

const matches = (r: Row, where: any): boolean =>
  Object.entries(where).every(([k, v]: [string, any]) => {
    if (k === 'OR') return v.some((w: any) => matches(r, w));
    const value = (r as any)[k];
    if (v && typeof v === 'object' && !(v instanceof Date)) {
      if ('gt' in v) return value != null && value > v.gt;
      if ('gte' in v) return value != null && value >= v.gte;
      if ('lt' in v) return value != null && value < v.lt;
    }
    return value === v;
  });

beforeEach(() => {
  rows = [];
  account = { id: 'u1', userType: 'customer', phone: '+923001234567', status: 'active', tokensValidAfter: null };
  (recordAudit as jest.Mock).mockClear();
  db.refreshToken = {
    create: jest.fn(async ({ data }: any) => {
      const row = { usedAt: null, revokedAt: null, createdAt: new Date(), ...data };
      rows.push(row);
      return row;
    }),
    findUnique: jest.fn(async ({ where }: any) => rows.find((r) => r.id === where.id) ?? null),
    findFirst: jest.fn(async ({ where }: any) => rows.find((r) => matches(r, where)) ?? null),
    findMany: jest.fn(async ({ where }: any) => rows.filter((r) => matches(r, where)).sort((a, b) => +a.createdAt - +b.createdAt)),
    updateMany: jest.fn(async ({ where, data }: any) => {
      const hit = rows.filter((r) => matches(r, where));
      hit.forEach((r) => Object.assign(r, data));
      return { count: hit.length };
    }),
    deleteMany: jest.fn(async ({ where }: any) => {
      const before = rows.length;
      rows = rows.filter((r) => !matches(r, where));
      return { count: before - rows.length };
    }),
  };
  db.user = {
    findUnique: jest.fn(async () => account),
    update: jest.fn(async ({ data }: any) => Object.assign(account, data)),
  };
  db.$transaction = jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops));
});

afterEach(() => jest.useRealTimers());

describe('sessions', () => {
  it('a sign-in records the device and ties both tokens to one session', async () => {
    const tokens = await requestContext.run({ requestId: 'r1', ip: '203.0.113.9', userAgent: 'Firefox' }, () => startSession(account));
    const access = verifyToken(tokens.accessToken);
    const refresh = verifyRefreshToken(tokens.refreshToken);
    expect(access.sid).toBe(tokens.sessionId);
    expect(refresh.sid).toBe(tokens.sessionId);
    expect(rows).toEqual([expect.objectContaining({ id: refresh.jti, userId: 'u1', familyId: tokens.sessionId, ipAddress: '203.0.113.9', userAgent: 'Firefox' })]);
    expect(await isSessionActive(tokens.sessionId)).toBe(true);
  });

  it('a refresh hands out a new pair in the same session and the old refresh token is spent', async () => {
    const first = await startSession(account);
    const second = await rotateSession(first.refreshToken);
    expect(second.sessionId).toBe(first.sessionId);
    expect(second.refreshToken).not.toBe(first.refreshToken);
    expect(rows.find((r) => r.id === verifyRefreshToken(first.refreshToken).jti)?.usedAt).toBeInstanceOf(Date);
    // the new one works in turn
    await expect(rotateSession(second.refreshToken)).resolves.toMatchObject({ sessionId: first.sessionId });
  });

  it('two tabs refreshing with the same token at the same moment both carry on', async () => {
    const first = await startSession(account);
    const [a, b] = await Promise.all([rotateSession(first.refreshToken), rotateSession(first.refreshToken)]);
    expect(a.sessionId).toBe(first.sessionId);
    expect(b.sessionId).toBe(first.sessionId);
    expect(await isSessionActive(first.sessionId)).toBe(true);
  });

  it('a spent refresh token that comes back later ends the session, says so, and leaves a trail', async () => {
    const first = await startSession(account);
    const second = await rotateSession(first.refreshToken);
    const spent = rows.find((r) => r.id === verifyRefreshToken(first.refreshToken).jti)!;
    spent.usedAt = new Date(Date.now() - REUSE_LEEWAY_MS - 1000);

    await expect(rotateSession(first.refreshToken)).rejects.toMatchObject({ statusCode: 401, code: 'REFRESH_TOKEN_REUSED' });
    expect(await isSessionActive(first.sessionId)).toBe(false);
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u1', action: 'auth:REFRESH_REUSE', entityId: first.sessionId }));
    // the thief's copy and the owner's latest token are both dead now
    await expect(rotateSession(second.refreshToken)).rejects.toMatchObject({ statusCode: 401, code: 'SESSION_REVOKED' });
  });

  it('a refresh token from before sessions were recorded signs in again', async () => {
    const legacy = generateRefreshToken({ userId: 'u1', userType: 'customer', phone: account.phone });
    await expect(rotateSession(legacy)).rejects.toMatchObject({ statusCode: 401, code: 'SESSION_REVOKED' });
  });

  it('a forged or unknown token is invalid, and an access token is not a refresh token', async () => {
    const tokens = await startSession(account);
    await expect(rotateSession('not-a-token')).rejects.toMatchObject({ statusCode: 401, code: 'INVALID_REFRESH_TOKEN' });
    await expect(rotateSession(tokens.accessToken)).rejects.toMatchObject({ statusCode: 401, code: 'INVALID_REFRESH_TOKEN' });
    rows = [];
    await expect(rotateSession(tokens.refreshToken)).rejects.toMatchObject({ statusCode: 401, code: 'INVALID_REFRESH_TOKEN' });
  });

  it('a suspended account cannot refresh', async () => {
    const tokens = await startSession(account);
    account.status = 'suspended';
    await expect(rotateSession(tokens.refreshToken)).rejects.toMatchObject({ statusCode: 401, code: 'USER_INACTIVE' });
  });

  it('signing out one device leaves the others signed in; another account cannot sign it out', async () => {
    const phone = await startSession(account);
    const laptop = await startSession(account);
    expect(await endSession('someone-else', phone.sessionId)).toBe(false);
    expect(await endSession('u1', phone.sessionId)).toBe(true);
    expect(await isSessionActive(phone.sessionId)).toBe(false);
    expect(await isSessionActive(laptop.sessionId)).toBe(true);
    await expect(rotateSession(phone.refreshToken)).rejects.toMatchObject({ code: 'SESSION_REVOKED' });
    expect(await endSession('u1', phone.sessionId)).toBe(false);
  });

  it('signing out everywhere ends every session and sets the cut-off', async () => {
    const phone = await startSession(account);
    const laptop = await startSession(account);
    await endAllSessions('u1');
    expect(await isSessionActive(phone.sessionId)).toBe(false);
    expect(await isSessionActive(laptop.sessionId)).toBe(false);
    expect(account.tokensValidAfter).toBeInstanceOf(Date);
  });

  it('lists each device once, newest activity first, marking this one', async () => {
    const phone = await requestContext.run({ requestId: 'a', userAgent: 'Phone' }, () => startSession(account));
    await new Promise((r) => setTimeout(r, 5));
    const laptop = await requestContext.run({ requestId: 'b', userAgent: 'Laptop' }, () => startSession(account));
    await new Promise((r) => setTimeout(r, 5));
    await requestContext.run({ requestId: 'c', userAgent: 'Phone v2' }, () => rotateSession(phone.refreshToken));

    const list = await listSessions('u1', laptop.sessionId);
    expect(list.map((s) => [s.id, s.current, s.userAgent])).toEqual([
      [phone.sessionId, false, 'Phone v2'],
      [laptop.sessionId, true, 'Laptop'],
    ]);
    await endSession('u1', phone.sessionId);
    expect((await listSessions('u1')).map((s) => s.id)).toEqual([laptop.sessionId]);
  });

  it('forgets expired tokens and sessions that ended a day ago', async () => {
    const kept = await startSession(account);
    const ended = await startSession(account);
    rows.push({ ...rows[0], id: 'expired', expiresAt: new Date(Date.now() - 1000) });
    await endSession('u1', ended.sessionId);
    rows.filter((r) => r.familyId === ended.sessionId).forEach((r) => (r.revokedAt = new Date(Date.now() - 25 * 3600 * 1000)));
    expect(await pruneRefreshTokens()).toBe(2);
    expect(rows.map((r) => r.familyId)).toEqual([kept.sessionId]);
  });
});
