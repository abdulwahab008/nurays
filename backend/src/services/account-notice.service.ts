import { queueEmail } from '../jobs/email.jobs';
import { maskEmail } from '../utils/mask';
import { logger } from '../utils/logger';
import { emailButton, emailLayout, escapeHtml } from './email.service';

/**
 * E-mails that tell a person something happened to their own account, so that a change they did not make is
 * noticed: the password was changed, or the account was pointed at another e-mail address.
 *
 * They go only to an address whose owner has proven it (an address merely typed into a profile may belong to a
 * stranger), and they are queued: a mail server that is down must neither undo nor delay the change they report.
 */

const frontendUrl = () => (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/+$/, '');

export interface Notice {
  subject: string;
  html: string;
  text: string;
}

/** "10 October 2026 at 11:34 pm", on a Pakistani clock: the time a person in Pakistan would say it happened. */
export function whenInPakistan(at: Date): string {
  return new Intl.DateTimeFormat('en-PK', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Asia/Karachi' }).format(at);
}

export function passwordChangedNotice(o: { name: string; at: Date }): Notice {
  const when = whenInPakistan(o.at);
  const resetUrl = `${frontendUrl()}/forgot-password`;
  const helpUrl = `${frontendUrl()}/help`;
  const subject = 'Your Nuray password was changed';
  const html = emailLayout(
    subject,
    `<h2 style="margin-top:0;">Your password was changed</h2>
<p>Hi ${escapeHtml(o.name)}, the password of your Nuray account was changed on ${escapeHtml(when)} (Pakistan time). Every other device you were signed in on has been signed out.</p>
<p>If this was you, there is nothing to do.</p>
<p><strong>If it was not you</strong>, someone else may know your password. Choose a new one now:</p>
${emailButton(resetUrl, 'Reset my password')}
<p style="font-size:13px;color:#6b7280;">Then write to us from the <a href="${escapeHtml(helpUrl)}">help page</a> so that we can look at your account.</p>`
  );
  const text = `Hi ${o.name}, the password of your Nuray account was changed on ${when} (Pakistan time). Every other device you were signed in on has been signed out.\n\nIf this was you, there is nothing to do.\n\nIf it was not you, someone else may know your password. Choose a new one now: ${resetUrl}\nThen write to us from the help page (${helpUrl}) so that we can look at your account.`;
  return { subject, html, text };
}

export function emailChangedNotice(o: { name: string; newEmail: string; at: Date }): Notice {
  const when = whenInPakistan(o.at);
  const helpUrl = `${frontendUrl()}/help`;
  const masked = maskEmail(o.newEmail);
  const subject = 'The e-mail address of your Nuray account was changed';
  const html = emailLayout(
    subject,
    `<h2 style="margin-top:0;">Your account now uses another e-mail address</h2>
<p>Hi ${escapeHtml(o.name)}, on ${escapeHtml(when)} (Pakistan time) the e-mail address of your Nuray account was changed to <strong>${escapeHtml(masked)}</strong>. Nuray will not write to this address about the account any more.</p>
<p>If this was you, there is nothing to do.</p>
<p><strong>If it was not you</strong>, someone else may know your password. Write to us at once from the help page, so that we can protect your account:</p>
${emailButton(helpUrl, 'Contact Nuray')}`
  );
  const text = `Hi ${o.name}, on ${when} (Pakistan time) the e-mail address of your Nuray account was changed to ${masked}. Nuray will not write to this address about the account any more.\n\nIf this was you, there is nothing to do.\n\nIf it was not you, someone else may know your password. Write to us at once from the help page, so that we can protect your account: ${helpUrl}`;
  return { subject, html, text };
}

interface Recipient {
  /** The address as it stood before the change. */
  email: string | null | undefined;
  /** Only an address its owner has proven is written to. */
  emailVerified: boolean | null | undefined;
  fullName?: string | null;
}

async function send(to: string, notice: Notice, what: string): Promise<void> {
  try {
    await queueEmail({ to, ...notice });
  } catch (err) {
    // The change has been made; failing to say so must not undo it or fail the request.
    logger.warn({ err: (err as Error)?.message, to: maskEmail(to) }, `Could not queue the "${what}" notice`);
  }
}

/** Tell the owner of the (verified) address the account uses that the password was changed. */
export async function notifyPasswordChanged(user: Recipient, at: Date = new Date()): Promise<void> {
  if (!user.email || !user.emailVerified) return;
  await send(user.email, passwordChangedNotice({ name: user.fullName || 'there', at }), 'password changed');
}

/** Tell the owner of the old (verified) address that the account no longer uses it. */
export async function notifyEmailChanged(before: Recipient, newEmail: string, at: Date = new Date()): Promise<void> {
  if (!before.email || !before.emailVerified) return;
  await send(before.email, emailChangedNotice({ name: before.fullName || 'there', newEmail, at }), 'e-mail changed');
}
