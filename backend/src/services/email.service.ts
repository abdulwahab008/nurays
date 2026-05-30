import nodemailer from 'nodemailer';
import { AppError } from '../middleware/errorHandler';

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

class EmailService {
  private transporter: nodemailer.Transporter | null = null;
  private initialized = false;

  constructor() {
    this.initializeTransporter();
  }

  private async initializeTransporter() {
    // Initialize email transporter
    // Priority: Gmail > SMTP > Ethereal (for testing)
    if (process.env.EMAIL_SERVICE === 'gmail') {
      this.transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASSWORD, // Use App Password for Gmail
        },
      });
      console.log('✅ Email service configured with Gmail');
    } else if (process.env.SMTP_HOST) {
      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASSWORD,
        },
      });
      console.log('✅ Email service configured with SMTP');
    } else {
      // Create Ethereal test account for development
      // This actually sends emails to a test inbox you can view online
      try {
        const testAccount = await nodemailer.createTestAccount();
        this.transporter = nodemailer.createTransport({
          host: 'smtp.ethereal.email',
          port: 587,
          secure: false,
          auth: {
            user: testAccount.user,
            pass: testAccount.pass,
          },
        });
        console.log('✅ Email service configured with Ethereal (test mode)');
        console.log('📧 View test emails at: https://ethereal.email');
        console.log(`   Login: ${testAccount.user}`);
        console.log(`   Password: ${testAccount.pass}`);
      } catch (error) {
        console.warn('⚠️  Could not create Ethereal test account. Emails will be logged to console.');
      }
    }
    this.initialized = true;
  }

  async sendEmail(options: EmailOptions): Promise<void> {
    const { to, subject, html, text } = options;

    // Wait for initialization if needed
    if (!this.initialized) {
      await this.initializeTransporter();
    }

    // If no transporter, log to console
    if (!this.transporter) {
      console.log('\n📧 EMAIL (Console Mode - No transporter configured):');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`To: ${to}`);
      console.log(`Subject: ${subject}`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(text || html);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      return;
    }

    try {
      const info = await this.transporter.sendMail({
        from: process.env.EMAIL_FROM || 'Nuray <noreply@nuray.pk>',
        to,
        subject,
        html,
        text,
      });

      console.log(`📧 Email sent successfully to: ${to}`);
      
      // If using Ethereal, show the URL to view the email
      const previewUrl = nodemailer.getTestMessageUrl(info);
      if (previewUrl) {
        console.log(`📬 Preview URL: ${previewUrl}`);
      }
    } catch (error) {
      console.error('Failed to send email:', error);
      throw new AppError('Failed to send email', 500, 'EMAIL_SEND_FAILED');
    }
  }

  async sendVerificationEmail(email: string, name: string, verificationToken: string): Promise<void> {
    const verificationUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/verify-email?token=${verificationToken}`;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Verify Your Email - Nuray</title>
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 28px;">🍽️ Nuray</h1>
        </div>
        <div style="background: #f9fafb; padding: 40px; border-radius: 0 0 10px 10px; border: 1px solid #e5e7eb;">
          <h2 style="color: #111827; margin-top: 0;">Welcome to Nuray, ${name}!</h2>
          <p style="color: #4b5563; font-size: 16px;">Thank you for signing up. Please verify your email address to activate your account and start ordering delicious homemade food.</p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${verificationUrl}" 
               style="display: inline-block; background: #10b981; color: white; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">
              Verify Email Address
            </a>
          </div>
          
          <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">Or copy and paste this link into your browser:</p>
          <p style="color: #10b981; font-size: 12px; word-break: break-all; background: #f3f4f6; padding: 10px; border-radius: 4px;">${verificationUrl}</p>
          
          <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">This link will expire in 24 hours.</p>
          
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
          
          <p style="color: #9ca3af; font-size: 12px; margin: 0;">If you didn't create an account with Nuray, please ignore this email.</p>
        </div>
        <div style="text-align: center; margin-top: 20px; color: #9ca3af; font-size: 12px;">
          <p>© 2025 Nuray. All rights reserved.</p>
        </div>
      </body>
      </html>
    `;

    const text = `
Welcome to Nuray, ${name}!

Thank you for signing up. Please verify your email address to activate your account.

Click this link to verify: ${verificationUrl}

This link will expire in 24 hours.

If you didn't create an account with Nuray, please ignore this email.

© 2025 Nuray. All rights reserved.
    `;

    await this.sendEmail({
      to: email,
      subject: 'Verify Your Email - Nuray',
      html,
      text,
    });
  }
}

export default new EmailService();

