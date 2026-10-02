import prisma from '../config/database';
import emailService, { emailButton, emailLayout, escapeHtml } from '../services/email.service';
import { sendSMS } from '../services/sms.service';
import { sendPushToUser } from '../services/push.service';
import { defineJob, enqueue } from './queue';

/**
 * Delivering a notification outside the app, one job per channel so each is retried on its
 * own (a failed email never sends the push twice). Payloads carry ids only; the job reads
 * the notification and the person's current contact details when it runs.
 */

export type DeliveryChannel = 'push' | 'email' | 'sms';

const appUrl = () => (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/+$/, '');

defineJob<{ notificationId: string; channel: DeliveryChannel }>('notify.deliver', async ({ notificationId, channel }) => {
  const n = await prisma.notification.findUnique({
    where: { id: notificationId },
    select: {
      id: true,
      userId: true,
      title: true,
      message: true,
      actionUrl: true,
      dedupeKey: true,
      user: { select: { status: true, email: true, emailVerified: true, phone: true, phoneVerified: true, profile: { select: { fullName: true } } } },
    },
  });
  if (!n || n.user.status !== 'active') return;
  const link = n.actionUrl ? `${appUrl()}${n.actionUrl.startsWith('/') ? '' : '/'}${n.actionUrl}` : appUrl();

  if (channel === 'push') {
    await sendPushToUser(n.userId, { title: n.title, body: n.message, url: n.actionUrl ?? '/', tag: n.dedupeKey ?? n.id });
  } else if (channel === 'email') {
    if (!n.user.email || !n.user.emailVerified) return;
    const greeting = n.user.profile?.fullName ? `<p>Hi ${escapeHtml(n.user.profile.fullName.split(' ')[0])},</p>` : '';
    await emailService.sendEmail({
      to: n.user.email,
      subject: n.title,
      html: emailLayout(n.title, `${greeting}<p>${escapeHtml(n.message)}</p>${emailButton(link, 'Open in Nuray')}`),
      text: `${n.message}\n\n${link}`,
    });
  } else if (channel === 'sms') {
    if (!n.user.phone || !n.user.phoneVerified) return;
    const sent = await sendSMS(n.user.phone, `Nuray: ${n.title}. ${n.message}`.slice(0, 300));
    if (!sent) throw new Error('SMS not sent');
  }
});

export const queueDelivery = (notificationId: string, channel: DeliveryChannel) =>
  enqueue('notify.deliver', { notificationId, channel }, { jobId: `notify-${notificationId}-${channel}` });
