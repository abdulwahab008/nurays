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

    // If OTP exists and not expired, return existing OTP (for testing)
    // In production, you might want to rate limit this
    if (existingOTP && !isOTPExpired(existingOTP.createdAt)) {
      return existingOTP.otpCode;
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

    // Send OTP via SMS (Twilio when configured, otherwise logged to console)
    await smsService.sendOTPSMS(formattedPhone, otpCode, purpose);
    if (process.env.NODE_ENV === 'development') {
      console.log(`📱 OTP for ${formattedPhone}: ${otpCode}`);
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

    // Check attempts (max 5 attempts)
    if (otpRecord.attempts >= 5) {
      throw new AppError('Too many failed attempts. Please request a new OTP', 429, 'OTP_MAX_ATTEMPTS');
    }

    // Verify OTP
    if (otpRecord.otpCode !== otpCode) {
      // Increment attempts
      await prisma.otpVerification.update({
        where: { id: otpRecord.id },
        data: { attempts: otpRecord.attempts + 1 },
      });
      throw new AppError('Invalid OTP', 400, 'OTP_INVALID');
    }

    // Mark as verified
    await prisma.otpVerification.update({
      where: { id: otpRecord.id },
      data: { isVerified: true },
    });

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

