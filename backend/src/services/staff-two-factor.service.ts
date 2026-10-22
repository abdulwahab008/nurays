/**
 * Two-step sign-in for staff (SEC-3).
 *
 * After the right password a staff member gets no session yet, but a short-lived challenge token: either "enter the
 * code from your authenticator app" (two-step sign-in is on) or "set your authenticator app up" (it is not, and it is
 * required). The six-digit code (RFC 6238, utils/totp.ts) or one of ten one-time backup codes completes the sign-in.
 * Wrong codes are counted per account: after MAX_FAILED in LOCK_MINUTES the account's second step is locked for the
 * rest of that time. A super admin can reset a staff member who lost the phone and the backup codes; they set it up
 * again at their next sign-in.
 *
 * Required for every staff sign-in when STAFF_2FA_REQUIRED=true, the default in production; elsewhere (tests, local
 * development) only staff who have set it up are asked. Code and Google sign-in are already refused for staff, so
 * the password sign-in is the only way in.
 */
import prisma from '../config/database';
import { isProduction } from '../config/env';
import { AppError } from '../middleware/errorHandler';
import { recordAudit } from '../middleware/audit';
import { budgetAdd, budgetReset, budgetUsed } from '../utils/attemptBudget';
import { signChallenge } from '../utils/jwt';
import { hashBackupCode, newBackupCodes, newTotpSecret, openSecret, otpauthUrl, sealSecret, verifyTotp } from '../utils/totp';
import { endAllSessions } from './session.service';

export const MAX_FAILED = 5;
export const LOCK_MINUTES = 15;

export const staffTwoFactorRequired = (env: NodeJS.ProcessEnv = process.env): boolean =>
  env.STAFF_2FA_REQUIRED === 'true' || (env.STAFF_2FA_REQUIRED !== 'false' && isProduction(env));

export type SecondStep = { twoFactorRequired: true; challengeToken: string } | { twoFactorSetupRequired: true; challengeToken: string };

/** What a staff member with the right password gets instead of a session, or null when no second step applies. */
export async function secondStepFor(user: { id: string }): Promise<SecondStep | null> {
  const row = await prisma.staffTwoFactor.findUnique({ where: { userId: user.id }, select: { enabledAt: true } });
  if (row?.enabledAt) return { twoFactorRequired: true, challengeToken: signChallenge(user.id, 'mfa') };
  if (staffTwoFactorRequired()) return { twoFactorSetupRequired: true, challengeToken: signChallenge(user.id, 'mfa-setup') };
  return null;
}

async function activeStaff(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, phone: true, email: true, userType: true, staffRole: true, status: true, emailVerified: true, phoneVerified: true, profile: true },
  });
  if (!user || user.userType !== 'admin') throw new AppError('Two-step sign-in is for staff accounts', 403, 'NOT_STAFF');
  if (user.status !== 'active') throw new AppError(`Account is ${user.status}`, 403, 'ACCOUNT_SUSPENDED');
  return user;
}

/** Start (or start again) setting the authenticator app up: a new secret, not active until a first code confirms it. */
export async function beginSetup(userId: string) {
  const user = await activeStaff(userId);
  const existing = await prisma.staffTwoFactor.findUnique({ where: { userId }, select: { enabledAt: true } });
  if (existing?.enabledAt) throw new AppError('Two-step sign-in is already on for this account', 409, 'TWO_FACTOR_ALREADY_ON');
  const secret = newTotpSecret();
  await prisma.staffTwoFactor.upsert({
    where: { userId },
    create: { userId, secretSealed: sealSecret(secret) },
    update: { secretSealed: sealSecret(secret), lastUsedStep: null, backupCodeHashes: [] },
  });
  return { secret, otpauthUrl: otpauthUrl(secret, user.email ?? user.id) };
}

/** Confirm the set-up with a first code from the app: two-step sign-in is on, and here are the backup codes (shown once). */
export async function confirmSetup(userId: string, code: string, ip?: string | null) {
  await activeStaff(userId);
  const row = await prisma.staffTwoFactor.findUnique({ where: { userId } });
  if (!row) throw new AppError('Start the set-up first', 400, 'TWO_FACTOR_NOT_STARTED');
  if (row.enabledAt) throw new AppError('Two-step sign-in is already on for this account', 409, 'TWO_FACTOR_ALREADY_ON');
  await assertNotLocked(userId);
  const step = verifyTotp(openSecret(row.secretSealed), code.trim(), Date.now(), row.lastUsedStep);
  if (step == null) await failed(userId, ip, 'setup');
  const backupCodes = newBackupCodes();
  await prisma.staffTwoFactor.update({
    where: { userId },
    data: { enabledAt: new Date(), lastUsedStep: step, backupCodeHashes: backupCodes.map(hashBackupCode) },
  });
  await budgetReset(budgetKey(userId));
  void recordAudit({ userId, action: 'auth:2FA_ENABLED', entityType: 'user', entityId: userId, ipAddress: ip ?? null, responseStatus: 200 });
  return { backupCodes };
}

/**
 * Check the second step: a six-digit code from the app (each works once) or a backup code (each works once).
 * Throws 400 INVALID_TWO_FACTOR_CODE (never 401: the web app would take that for an expired session), or 429 TWO_FACTOR_LOCKED after too many wrong ones.
 */
export async function verifySecondStep(userId: string, code: string, ip?: string | null): Promise<{ method: 'app' | 'backup'; backupCodesLeft: number }> {
  await activeStaff(userId);
  const row = await prisma.staffTwoFactor.findUnique({ where: { userId } });
  if (!row?.enabledAt) throw new AppError('Two-step sign-in is not on for this account', 400, 'TWO_FACTOR_NOT_ON');
  await assertNotLocked(userId);
  const text = code.trim();

  if (/^\d{6}$/.test(text)) {
    const step = verifyTotp(openSecret(row.secretSealed), text, Date.now(), row.lastUsedStep);
    if (step != null) {
      // Claim the step, so the same code sent twice at once lets only one sign-in through.
      const claimed = await prisma.staffTwoFactor.updateMany({
        where: { userId, OR: [{ lastUsedStep: null }, { lastUsedStep: { lt: step } }] },
        data: { lastUsedStep: step },
      });
      if (claimed.count === 1) {
        await budgetReset(budgetKey(userId));
        return { method: 'app', backupCodesLeft: row.backupCodeHashes.length };
      }
    }
  } else {
    // A backup code is taken out of the list in one statement: used once, even by two requests at once.
    const hash = hashBackupCode(text);
    const removed = await prisma.$executeRaw`
      UPDATE staff_two_factor SET backup_code_hashes = array_remove(backup_code_hashes, ${hash}), updated_at = now()
      WHERE user_id = ${userId} AND ${hash} = ANY(backup_code_hashes)`;
    if (removed === 1) {
      await budgetReset(budgetKey(userId));
      const left = row.backupCodeHashes.length - 1;
      void recordAudit({ userId, action: 'auth:2FA_BACKUP_CODE_USED', entityType: 'user', entityId: userId, ipAddress: ip ?? null, data: { left }, responseStatus: 200 });
      return { method: 'backup', backupCodesLeft: left };
    }
  }
  return failed(userId, ip, 'sign-in');
}

/** New backup codes (the old ones stop working), confirmed with a code from the app. */
export async function regenerateBackupCodes(userId: string, code: string, ip?: string | null) {
  await activeStaff(userId);
  const row = await prisma.staffTwoFactor.findUnique({ where: { userId } });
  if (!row?.enabledAt) throw new AppError('Two-step sign-in is not on for this account', 400, 'TWO_FACTOR_NOT_ON');
  await assertNotLocked(userId);
  const step = verifyTotp(openSecret(row.secretSealed), code.trim(), Date.now(), row.lastUsedStep);
  if (step == null) await failed(userId, ip, 'backup-codes');
  const backupCodes = newBackupCodes();
  await prisma.staffTwoFactor.update({ where: { userId }, data: { lastUsedStep: step, backupCodeHashes: backupCodes.map(hashBackupCode) } });
  void recordAudit({ userId, action: 'auth:2FA_BACKUP_CODES_RENEWED', entityType: 'user', entityId: userId, ipAddress: ip ?? null, responseStatus: 200 });
  return { backupCodes };
}

export async function twoFactorStatus(userId: string) {
  const row = await prisma.staffTwoFactor.findUnique({ where: { userId }, select: { enabledAt: true, backupCodeHashes: true } });
  return { enabled: !!row?.enabledAt, enabledAt: row?.enabledAt ?? null, backupCodesLeft: row?.enabledAt ? row.backupCodeHashes.length : 0, required: staffTwoFactorRequired() };
}

/** A super admin resets a staff member's two-step sign-in (lost phone and backup codes): their sessions end too. */
export async function resetTwoFactor(staffId: string, byUserId: string, ip?: string | null) {
  if (staffId === byUserId) throw new AppError("You can't reset your own two-step sign-in here. Use a backup code; without one, the reset script on the server (npm run staff:reset-2fa) does it.", 400, 'CANNOT_RESET_SELF');
  const target = await prisma.user.findUnique({ where: { id: staffId }, select: { userType: true } });
  if (!target || target.userType !== 'admin') throw new AppError('Staff member not found', 404, 'STAFF_NOT_FOUND');
  const { count } = await prisma.staffTwoFactor.deleteMany({ where: { userId: staffId } });
  await endAllSessions(staffId);
  await budgetReset(budgetKey(staffId));
  void recordAudit({ userId: byUserId, action: 'staff:2FA_RESET', entityType: 'user', entityId: staffId, ipAddress: ip ?? null, data: { hadTwoFactor: count > 0 }, responseStatus: 200 });
  return { reset: count > 0 };
}

const budgetKey = (userId: string) => `staff-2fa:${userId}`;

async function assertNotLocked(userId: string) {
  if ((await budgetUsed(budgetKey(userId))) >= MAX_FAILED) {
    throw new AppError(`Too many wrong codes. Try again in ${LOCK_MINUTES} minutes.`, 429, 'TWO_FACTOR_LOCKED');
  }
}

async function failed(userId: string, ip: string | null | undefined, during: string): Promise<never> {
  await budgetAdd(budgetKey(userId), LOCK_MINUTES * 60 * 1000);
  void recordAudit({ action: 'auth:2FA_FAILED', entityType: 'user', entityId: userId, ipAddress: ip ?? null, data: { during }, responseStatus: 401 });
  throw new AppError('That code is not right. Check the time on your phone, or use a backup code.', 400, 'INVALID_TWO_FACTOR_CODE');
}
