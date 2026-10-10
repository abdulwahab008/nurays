import nodemailer from 'nodemailer';
import type { Mail } from 'nodemailer';
import { AppError } from '../middleware/errorHandler';
import { emailProvider, runtimeMode } from '../config/env';
import { logger } from '../utils/logger';

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

/** Escape text for HTML: user-chosen names must never inject markup or links into our emails. */
export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const frontendUrl = () => (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/+$/, '');

/** The common email frame. `bodyHtml` must already be escaped where it contains user data. */
export function emailLayout(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escapeHtml(title)}</title></head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #f97316; padding: 20px; text-align: center; border-radius: 10px 10px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 24px;">Nuray</h1>
  </div>
  <div style="background: #f9fafb; padding: 32px; border-radius: 0 0 10px 10px; border: 1px solid #e5e7eb;">${bodyHtml}</div>
  <p style="text-align: center; margin-top: 16px; color: #9ca3af; font-size: 12px;">© ${new Date().getFullYear()} Nuray</p>
</body></html>`;
}

export function emailButton(url: string, label: string): string {
  return `<p style="text-align:center;margin:28px 0;"><a href="${escapeHtml(url)}" style="background:#f97316;color:#fff;padding:14px 32px;text-decoration:none;border-radius:6px;font-weight:600;">${escapeHtml(label)}</a></p>
<p style="font-size:12px;color:#6b7280;word-break:break-all;">${escapeHtml(url)}</p>`;
}

/**
 * Email. Provider (see config/env.ts emailProvider):
 *  - gmail / smtp: real delivery, with connection timeouts so a slow mail server can't
 *    hold a request for minutes.
 *  - ethereal: a throwaway test inbox, development only.
 *  - console: nothing is sent; development prints the message, test stays quiet.
 * Production refuses to start without gmail or smtp (config/env.ts).
 */
class EmailService {
  private transporter: Mail | null = null;
  private initializing: Promise<void> | null = null;

  private async init(): Promise<void> {
    const provider = emailProvider();
    const timeouts = { connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000 };
    if (provider === 'gmail') {
      this.transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASSWORD },
        ...timeouts,
      });
    } else if (provider === 'smtp') {
      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587', 10),
        secure: process.env.SMTP_SECURE === 'true',
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
        ...timeouts,
      });
    } else if (provider === 'ethereal') {
      try {
        const testAccount = await nodemailer.createTestAccount();
        this.transporter = nodemailer.createTransport({
          host: 'smtp.ethereal.email',
          port: 587,
          secure: false,
          auth: { user: testAccount.user, pass: testAccount.pass },
          ...timeouts,
        });
        logger.info({ login: testAccount.user }, 'Development email goes to an Ethereal test inbox (https://ethereal.email)');
      } catch {
        logger.warn('Could not create an Ethereal test inbox; development emails are printed to the console');
        this.transporter = null;
      }
    } else {
      this.transporter = null;
    }
  }

  private ready(): Promise<void> {
    if (!this.initializing) this.initializing = this.init();
    return this.initializing;
  }

  async sendEmail(options: EmailOptions): Promise<void> {
    const { to, subject, html, text } = options;
    await this.ready();

    if (!this.transporter) {
      if (runtimeMode() === 'development') {
        // The message itself is the output here (a developer copies the link from it): printed, not logged.
        // eslint-disable-next-line no-console
        console.log(`\n📧 EMAIL (not sent, development console)\nTo: ${to}\nSubject: ${subject}\n${text || html}\n`);
      }
      return;
    }

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const info = await this.transporter.sendMail({
          from: process.env.EMAIL_FROM || 'Nuray <noreply@nuray.pk>',
          to,
          subject,
          html,
          text,
        });
        if (runtimeMode() === 'development') {
          const previewUrl = nodemailer.getTestMessageUrl(info);
          if (previewUrl) logger.info({ previewUrl }, 'Email preview');
        }
        return;
      } catch (error) {
        logger.error({ err: error, attempt, subject }, 'Email failed');
      }
    }
    throw new AppError('Failed to send email', 502, 'EMAIL_SEND_FAILED');
  }

  async sendPasswordResetEmail(email: string, name: string, token: string): Promise<void> {
    const resetUrl = `${frontendUrl()}/reset-password?token=${encodeURIComponent(token)}`;
    const html = emailLayout(
      'Reset your Nuray password',
      `<h2 style="margin-top:0;">Reset your password</h2>
<p>Hi ${escapeHtml(name)}, we received a request to reset your password. This link works once and expires in 1 hour.</p>
${emailButton(resetUrl, 'Choose a new password')}
<p style="font-size:13px;color:#6b7280;">If you didn't ask for this, ignore this email; your password won't change.</p>`
    );
    await this.sendEmail({ to: email, subject: 'Reset your Nuray password', html, text: `Reset your password: ${resetUrl}` });
  }

  async sendVerificationEmail(email: string, name: string, verificationToken: string): Promise<void> {
    const verificationUrl = `${frontendUrl()}/verify-email?token=${encodeURIComponent(verificationToken)}`;
    const html = emailLayout(
      'Verify your email',
      `<h2 style="margin-top:0;">Welcome to Nuray, ${escapeHtml(name)}!</h2>
<p>Please verify your email address to activate your account.</p>
${emailButton(verificationUrl, 'Verify email address')}
<p style="font-size:13px;color:#6b7280;">This link expires in 24 hours. If you didn't create a Nuray account, ignore this email.</p>`
    );
    const text = `Welcome to Nuray!\n\nVerify your email address: ${verificationUrl}\n\nThis link expires in 24 hours. If you didn't create a Nuray account, ignore this email.`;
    await this.sendEmail({ to: email, subject: 'Verify your email - Nuray', html, text });
  }
}

export default new EmailService();
