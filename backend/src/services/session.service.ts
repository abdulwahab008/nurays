/**
 * Sessions: one row in refresh_tokens per refresh token issued, grouped by family (one device's sign-in).
 *
 * Every refresh hands out a new refresh token and marks the old one used. A used token coming back means it was
 * copied: the whole family is ended and the device has to sign in again. Two tabs refreshing at the same moment
 * both present the same token, so a token used in the last REUSE_LEEWAY_MS still gets a fresh pair in its family.
 * The access token carries the family id (`sid`), so ending a session stops its access token too, not just its
 * refresh token; tokens issued before sessions existed carry none and end with the account-wide cut-off as before.
 */
import { randomUUID } from 'crypto';
import prisma from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { recordAudit } from '../middleware/audit';
import { generateRefreshToken, generateToken, isTokenRevoked, tokenExpiry, verifyRefreshToken, JWTPayload } from '../utils/jwt';
import { requestContext } from '../utils/logger';

export const REUSE_LEEWAY_MS = 30_000;

export interface SessionUser {
  id: string;
  userType: string;
  phone: string;
}

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
  sessionId: string;
}

async function issue(user: SessionUser, familyId: string): Promise<SessionTokens> {
  const jti = randomUUID();
  const base: JWTPayload = { userId: user.id, userType: user.userType, phone: user.phone, sid: familyId };
  const refreshToken = generateRefreshToken({ ...base, jti });
  const ctx = requestContext.getStore();
  await prisma.refreshToken.create({
    data: {
      id: jti,
      userId: user.id,
      familyId,
      userAgent: ctx?.userAgent ?? null,
      ipAddress: ctx?.ip ?? null,
      expiresAt: tokenExpiry(refreshToken),
    },
  });
  return { accessToken: generateToken(base), refreshToken, sessionId: familyId };
}

/** A new sign-in on a device. */
export function startSession(user: SessionUser): Promise<SessionTokens> {
  return issue(user, randomUUID());
}

/** Ends one session (one device). Returns false when it was not this account's or had already ended. */
export async function endSession(userId: string, familyId: string): Promise<boolean> {
  const { count } = await prisma.refreshToken.updateMany({
    where: { userId, familyId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return count > 0;
}

/**
 * Ends every session the account has. The cut-off (`tokensValidAfter`) also voids any token issued before sessions
 * were recorded.
 */
export async function endAllSessions(userId: string): Promise<void> {
  const now = new Date();
  await prisma.$transaction([
    prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now } }),
    prisma.user.update({ where: { id: userId }, data: { tokensValidAfter: now } }),
  ]);
}

/** Is this session still signed in? (Ended, or every token in it expired → no.) */
export async function isSessionActive(familyId: string): Promise<boolean> {
  const row = await prisma.refreshToken.findFirst({
    where: { familyId, revokedAt: null, expiresAt: { gt: new Date() } },
    select: { id: true },
  });
  return row !== null;
}

/** Swap a refresh token for a new pair in the same session. */
export async function rotateSession(token: string): Promise<SessionTokens> {
  let payload: JWTPayload;
  try {
    payload = verifyRefreshToken(token);
  } catch {
    throw new AppError('Invalid refresh token', 401, 'INVALID_REFRESH_TOKEN');
  }
  // Issued before sessions were recorded: there is nothing to rotate it against, so it signs in again (once).
  if (!payload.jti || !payload.sid) {
    throw new AppError('Session expired, please log in again', 401, 'SESSION_REVOKED');
  }

  const row = await prisma.refreshToken.findUnique({ where: { id: payload.jti } });
  if (!row || row.userId !== payload.userId || row.familyId !== payload.sid) {
    throw new AppError('Invalid refresh token', 401, 'INVALID_REFRESH_TOKEN');
  }
  if (row.revokedAt) {
    throw new AppError('Session expired, please log in again', 401, 'SESSION_REVOKED');
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { id: true, userType: true, phone: true, status: true, tokensValidAfter: true },
  });
  if (!user || user.status !== 'active') {
    throw new AppError('User not found or inactive', 401, 'USER_INACTIVE');
  }
  if (isTokenRevoked(payload, user.tokensValidAfter)) {
    throw new AppError('Session expired, please log in again', 401, 'SESSION_REVOKED');
  }

  // Only one caller can claim an unused token; the rest see it as used.
  const now = new Date();
  const claimed = await prisma.refreshToken.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: now } });
  if (claimed.count === 0) {
    const usedAt = row.usedAt ?? (await prisma.refreshToken.findUnique({ where: { id: row.id }, select: { usedAt: true } }))?.usedAt;
    const withinLeeway = usedAt != null && now.getTime() - usedAt.getTime() <= REUSE_LEEWAY_MS;
    if (!withinLeeway) {
      await endSession(user.id, row.familyId);
      void recordAudit({
        userId: user.id,
        action: 'auth:REFRESH_REUSE',
        entityType: 'session',
        entityId: row.familyId,
        ipAddress: requestContext.getStore()?.ip ?? null,
        responseStatus: 401,
      });
      throw new AppError('This sign-in was used somewhere else, so it was ended. Please sign in again.', 401, 'REFRESH_TOKEN_REUSED');
    }
  }

  return issue({ id: user.id, userType: user.userType, phone: user.phone }, row.familyId);
}

export interface SessionSummary {
  id: string;
  current: boolean;
  userAgent: string | null;
  ipAddress: string | null;
  signedInAt: Date;
  lastActiveAt: Date;
}

/** The account's signed-in devices, most recently active first. */
export async function listSessions(userId: string, currentSid?: string): Promise<SessionSummary[]> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { tokensValidAfter: true } });
  const rows = await prisma.refreshToken.findMany({
    where: {
      userId,
      revokedAt: null,
      expiresAt: { gt: new Date() },
      ...(user?.tokensValidAfter ? { createdAt: { gte: user.tokensValidAfter } } : {}),
    },
    orderBy: { createdAt: 'asc' },
    select: { familyId: true, userAgent: true, ipAddress: true, createdAt: true },
  });
  const families = new Map<string, SessionSummary>();
  for (const r of rows) {
    const s = families.get(r.familyId);
    if (!s) {
      families.set(r.familyId, {
        id: r.familyId,
        current: r.familyId === currentSid,
        userAgent: r.userAgent,
        ipAddress: r.ipAddress,
        signedInAt: r.createdAt,
        lastActiveAt: r.createdAt,
      });
    } else {
      // The latest refresh says where the device is now.
      s.lastActiveAt = r.createdAt;
      s.userAgent = r.userAgent ?? s.userAgent;
      s.ipAddress = r.ipAddress ?? s.ipAddress;
    }
  }
  return [...families.values()].sort((a, b) => b.lastActiveAt.getTime() - a.lastActiveAt.getTime());
}

/**
 * Forget rows nobody can use: expired ones, and ended ones after a day (kept that long so a reused token in an ended
 * session still answers "ended" rather than "invalid").
 */
export async function pruneRefreshTokens(): Promise<number> {
  const now = Date.now();
  const { count } = await prisma.refreshToken.deleteMany({
    where: {
      OR: [{ expiresAt: { lt: new Date(now) } }, { revokedAt: { lt: new Date(now - 24 * 60 * 60 * 1000) } }],
    },
  });
  return count;
}
