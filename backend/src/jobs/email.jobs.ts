import { createHash } from 'crypto';
import prisma from '../config/database';
import emailService from '../services/email.service';
import { generateVerificationToken } from '../utils/email-verification';
import { defineJob, enqueue } from './queue';

/**
 * Account emails, sent in the background so a slow or briefly unavailable mail server neither
 * holds up the request nor loses the email (queued jobs are retried with backoff).
 *
 * Job payloads are stored in Redis, so they carry ids only, never a link token: the
 * verification job reads the current token when it runs, and the reset job creates the
 * single-use reset token itself (the database keeps only its hash).
 */

const RESET_LINK_TTL_MS = 60 * 60 * 1000;

defineJob<{ userId: string }>('email.verification', async ({ userId }) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { emailVerified: true, profile: { select: { fullName: true } }, emailVerification: true },
  });
  const pending = user?.emailVerification;
  if (!user || user.emailVerified || !pending || pending.expiresAt < new Date()) return;
  await emailService.sendVerificationEmail(pending.email, user.profile?.fullName || 'there', pending.token);
});

defineJob<{ userId: string }>('email.password-reset', async ({ userId }) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, status: true, profile: { select: { fullName: true } } },
  });
  if (!user?.email || user.status !== 'active') return;

  // Only the most recent link works.
  const token = generateVerificationToken();
  await prisma.$transaction([
    prisma.passwordReset.deleteMany({ where: { userId, usedAt: null } }),
    prisma.passwordReset.create({
      data: {
        userId,
        tokenHash: createHash('sha256').update(token).digest('hex'),
        expiresAt: new Date(Date.now() + RESET_LINK_TTL_MS),
      },
    }),
  ]);
  await emailService.sendPasswordResetEmail(user.email, user.profile?.fullName || 'there', token);
});

defineJob<{ to: string; subject: string; html: string; text?: string; stockAlertId?: string }>('email.send', async (job) => {
  await emailService.sendEmail({ to: job.to, subject: job.subject, html: job.html, text: job.text });
  if (job.stockAlertId) {
    await prisma.stockAlert.update({ where: { id: job.stockAlertId }, data: { emailSent: true } }).catch(() => undefined);
  }
});

/** Email the user's pending verification link. */
export const queueVerificationEmail = (userId: string) =>
  enqueue('email.verification', { userId }, { jobId: `verify-${userId}-${Date.now()}` });

/** Create a fresh password-reset link for the user and email it. */
export const queuePasswordResetEmail = (userId: string) =>
  enqueue('email.password-reset', { userId }, { jobId: `reset-${userId}-${Date.now()}` });

/** Any other email (content is not secret). */
export const queueEmail = (email: { to: string; subject: string; html: string; text?: string; stockAlertId?: string }) =>
  enqueue('email.send', email);
