import prisma from '../config/database';
import { generateOTP, isOTPExpired, formatPhoneNumber } from '../utils/otp';
import { AppError } from '../middleware/errorHandler';
import smsService from './sms.service';

export class OTPService {
  /**
   * Generate and store OTP for phone verification
   */
  async generateOTP(phone: string, purpose: 'registration' | 'login' | 'reset_password'): Promise<string> {
    const formattedPhone = formatPhoneNumber(phone);
    
    // Check for existing unverified OTP
    const existingOTP = await prisma.otpVerification.findFirst({
      where: {
        phone: formattedPhone,
        purpose,
        isVerified: false,
        expiresAt: {
          gt: new Date(),
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // "Resend" sends a fresh code (the previous one stops working, since verification
    // always checks the latest), but not more than once a minute. A code locked by too
    // many wrong guesses can be replaced straight away.
    const RESEND_COOLDOWN_MS = 60 * 1000;
    if (existingOTP && !isOTPExpired(existingOTP.createdAt) && existingOTP.attempts < 5) {
      const waitMs = existingOTP.createdAt.getTime() + RESEND_COOLDOWN_MS - Date.now();
      if (waitMs > 0) {
        throw new AppError(
          `Please wait ${Math.ceil(waitMs / 1000)} seconds before requesting another code.`,
          429,
          'OTP_RESEND_COOLDOWN'
        );
      }
    }

    // Cap SMS per NUMBER, not just per IP: a locked-out code forces a fresh SMS on the next request,
    // so without this a victim's phone could be pinged (and its codes locked) endlessly from rotating IPs.
    const sentLastHour = await prisma.otpVerification.count({
      where: { phone: formattedPhone, createdAt: { gt: new Date(Date.now() - 60 * 60 * 1000) } },
    });
    if (sentLastHour >= 5) {
      throw new AppError('Too many codes were sent to this number. Please try again later.', 429, 'OTP_RATE_LIMITED');
    }

    // Generate new OTP
    const otpCode = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Store OTP
    await prisma.otpVerification.create({
      data: {
        phone: formattedPhone,
        otpCode,
        purpose,
        expiresAt,
        attempts: 0,
        isVerified: false,
      },
    });

    // Send it. If the SMS can't be sent, the code is withdrawn and the caller is told,
    // instead of "code sent" for a message that never left.
    const sent = await smsService.sendOTPSMS(formattedPhone, otpCode, purpose);
    if (!sent) {
      await prisma.otpVerification.deleteMany({ where: { phone: formattedPhone, otpCode, purpose, isVerified: false } });
      throw new AppError("We couldn't send the code by SMS. Please try again in a moment.", 502, 'SMS_SEND_FAILED');
    }

    return otpCode;
  }

  /**
   * Verify OTP
   */
  async verifyOTP(
    phone: string,
    otpCode: string,
    purpose: 'registration' | 'login' | 'reset_password'
  ): Promise<boolean> {
    const formattedPhone = formatPhoneNumber(phone);

    const otpRecord = await prisma.otpVerification.findFirst({
      where: {
        phone: formattedPhone,
        purpose,
        isVerified: false,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (!otpRecord) {
      throw new AppError('OTP not found or already used', 404, 'OTP_NOT_FOUND');
    }

    // Check if expired
    if (isOTPExpired(otpRecord.createdAt)) {
      throw new AppError('OTP has expired', 400, 'OTP_EXPIRED');
    }

    // Claim an attempt atomically BEFORE comparing. Reading the count and then
    // writing count+1 let parallel guesses all see "fewer than 5" and so exceed
    // the limit; the conditional increment makes at most 5 guesses possible.
    const claimed = await prisma.otpVerification.updateMany({
      where: { id: otpRecord.id, isVerified: false, attempts: { lt: 5 } },
      data: { attempts: { increment: 1 } },
    });
    if (claimed.count === 0) {
      throw new AppError('Too many failed attempts. Please request a new OTP', 429, 'OTP_MAX_ATTEMPTS');
    }

    // Verify OTP
    if (otpRecord.otpCode !== otpCode) {
      throw new AppError('Invalid OTP', 400, 'OTP_INVALID');
    }

    // Mark as verified — only once: two parallel correct submissions must not both succeed.
    const used = await prisma.otpVerification.updateMany({
      where: { id: otpRecord.id, isVerified: false },
      data: { isVerified: true },
    });
    if (used.count === 0) {
      throw new AppError('OTP not found or already used', 404, 'OTP_NOT_FOUND');
    }

    return true;
  }

  /**
   * Clean up expired OTPs (can be run as a cron job)
   */
  async cleanupExpiredOTPs(): Promise<number> {
    const result = await prisma.otpVerification.deleteMany({
      where: {
        expiresAt: {
          lt: new Date(),
        },
      },
    });

    return result.count;
  }
}

export default new OTPService();

