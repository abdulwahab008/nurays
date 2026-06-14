import prisma from '../config/database';
import { generateToken, generateRefreshToken, JWTPayload } from '../utils/jwt';
import { formatPhoneNumber, isValidPhoneNumber } from '../utils/otp';
import { AppError } from '../middleware/errorHandler';
import bcrypt from 'bcrypt';
import otpService from './otp.service';
import emailService from './email.service';
import walletService from './wallet.service';
import { generateVerificationToken } from '../utils/email-verification';
import { randomBytes } from 'crypto';

// Configurable referral reward (marketing spend you control; set 0 to disable).
const REFERRAL_CREDIT_PKR = Number(process.env.REFERRAL_CREDIT_PKR ?? 100);

function generateReferralCode(): string {
  return 'NRY' + randomBytes(4).toString('hex').toUpperCase().slice(0, 6);
}

export class AuthService {
  /**
   * Register a new user (Email + Password is primary, Phone is optional)
   * For sellers, also creates a seller record with pending status
   */
  async register(
    email: string,
    password: string,
    userType: 'customer' | 'seller' | 'admin' | 'hub_manager' | 'rider',
    fullName: string,
    phone?: string,
    city?: string,
    area?: string,
    businessName?: string, // Required for sellers
    referredByCode?: string // Optional referral code entered at signup
  ) {
    // Normalize and validate email
    const normalizedEmail = email.toLowerCase().trim();
    
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
      throw new AppError('Invalid email format', 400, 'INVALID_EMAIL');
    }

    // Validate password
    if (password.length < 6) {
      throw new AppError('Password must be at least 6 characters', 400, 'WEAK_PASSWORD');
    }

    // Check if user already exists by email
    // Use findFirst instead of findUnique because email is nullable and unique
    // This handles edge cases better with nullable unique fields
    const existingUserByEmail = await prisma.user.findFirst({
      where: { 
        email: normalizedEmail,
      },
    });

    if (existingUserByEmail) {
      // Provide more helpful error message
      throw new AppError(
        `Email "${normalizedEmail}" is already registered. Please login instead or use a different email.`,
        409,
        'EMAIL_EXISTS'
      );
    }

    // If phone provided, validate and check if exists
    // If not provided, generate a temporary unique phone based on email
    let formattedPhone: string;
    if (phone) {
      formattedPhone = formatPhoneNumber(phone);
      if (!isValidPhoneNumber(formattedPhone)) {
        throw new AppError('Invalid phone number format', 400, 'INVALID_PHONE');
      }

      const existingUserByPhone = await prisma.user.findUnique({
        where: { phone: formattedPhone },
      });

      if (existingUserByPhone) {
        throw new AppError('Phone number already registered', 409, 'PHONE_EXISTS');
      }
    } else {
      // Generate temporary phone number based on email hash + timestamp + random
      // This ensures uniqueness even if multiple users register with similar emails
      const emailHash = Buffer.from(email.toLowerCase()).toString('base64').slice(0, 8);
      const timestamp = Date.now().toString().slice(-8);
      const random = Math.random().toString(36).substring(2, 6);
      formattedPhone = `+999${emailHash}${timestamp}${random}`;
      
      // Ensure the generated phone doesn't already exist (very unlikely, but check anyway)
      let attempts = 0;
      let existingUserByPhone = await prisma.user.findUnique({
        where: { phone: formattedPhone },
      });
      
      while (existingUserByPhone && attempts < 5) {
        // Regenerate with more randomness
        const newRandom = Math.random().toString(36).substring(2, 8);
        formattedPhone = `+999${emailHash}${Date.now().toString().slice(-8)}${newRandom}`;
        existingUserByPhone = await prisma.user.findUnique({
          where: { phone: formattedPhone },
        });
        attempts++;
      }
      
      if (existingUserByPhone) {
        throw new AppError('Unable to generate unique phone number. Please provide a phone number.', 500, 'PHONE_GENERATION_FAILED');
      }
    }

    // Hash password
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Unique referral code for this user (retry on the rare collision).
    let referralCode = generateReferralCode();
    for (let i = 0; i < 5; i++) {
      const clash = await prisma.user.findUnique({ where: { referralCode } });
      if (!clash) break;
      referralCode = generateReferralCode();
    }

    // Create user
    const user = await prisma.user.create({
      data: {
        email: normalizedEmail, // Use normalized email (already lowercased and trimmed)
        passwordHash,
        phone: formattedPhone,
        userType,
        referralCode,
        emailVerified: false, // Can be verified via email verification later
        phoneVerified: !!formattedPhone,
        status: 'active',
        profile: {
          create: {
            fullName: fullName.trim(),
            city: city?.trim(),
            area: area?.trim(),
          },
        },
      },
      include: {
        profile: true,
      },
    });

    // If registering as seller, create seller record with pending status
    let seller = null;
    if (userType === 'seller') {
      const sellerBusinessName = businessName?.trim() || fullName.trim() + "'s Kitchen";
      seller = await prisma.seller.create({
        data: {
          userId: user.id,
          businessName: sellerBusinessName,
          status: 'pending',
          verificationStatus: 'pending',
        },
      });
    }

    // Referral reward — credit both the new user and the referrer. Marketing
    // spend you control via REFERRAL_CREDIT_PKR (0 disables it entirely).
    if (referredByCode && REFERRAL_CREDIT_PKR > 0) {
      const referrer = await prisma.user.findUnique({
        where: { referralCode: referredByCode.trim().toUpperCase() },
        select: { id: true },
      });
      if (referrer && referrer.id !== user.id) {
        await prisma.user.update({ where: { id: user.id }, data: { referredBy: referrer.id } });
        await walletService.credit(user.id, REFERRAL_CREDIT_PKR, {
          transactionType: 'referral',
          description: 'Referral signup bonus',
        });
        await walletService.credit(referrer.id, REFERRAL_CREDIT_PKR, {
          transactionType: 'referral',
          description: 'Referral reward — a friend joined with your code',
        });
      }
    }

    // Create email verification token and send confirmation email
    const verificationToken = generateVerificationToken();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    await prisma.emailVerification.create({
      data: {
        userId: user.id,
        email: normalizedEmail,
        token: verificationToken,
        expiresAt,
      },
    });

    // Sending the verification email must NOT fail registration. The user row
    // and token are already committed above; if SMTP is down we'd otherwise
    // 500 the client even though the account exists, leaving them stuck
    // (re-registering hits EMAIL_EXISTS). Instead we log, flag it on the
    // response, and let the user trigger a resend.
    let emailSendFailed = false;
    try {
      await emailService.sendVerificationEmail(
        normalizedEmail,
        fullName.trim(),
        verificationToken
      );
    } catch (err) {
      emailSendFailed = true;
      console.error(
        `[register] Verification email failed for ${normalizedEmail} — account created, user can resend.`,
        err
      );
    }

    // Generate tokens (user can use app but should verify email)
    const tokenPayload: JWTPayload = {
      userId: user.id,
      userType: user.userType,
      phone: user.phone,
    };

    const accessToken = generateToken(tokenPayload);
    const refreshToken = generateRefreshToken(tokenPayload);

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        phone: user.phone,
        userType: user.userType,
        status: user.status,
        profile: user.profile,
        emailVerified: false,
      },
      seller: seller ? {
        id: seller.id,
        businessName: seller.businessName,
        status: seller.status,
        message: 'Your seller account is pending approval. You will be able to add products once approved.',
      } : null,
      tokens: {
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_in: 3600,
      },
      requiresEmailVerification: true,
      emailSendFailed,
    };
  }

  /**
   * Verify email address with token
   */
  async verifyEmail(token: string): Promise<void> {
    const verification = await prisma.emailVerification.findUnique({
      where: { token },
      include: { user: true },
    });

    if (!verification) {
      throw new AppError('Invalid verification token', 400, 'INVALID_TOKEN');
    }

    if (verification.isVerified) {
      throw new AppError('Email already verified', 400, 'ALREADY_VERIFIED');
    }

    if (new Date() > verification.expiresAt) {
      throw new AppError('Verification token expired', 400, 'TOKEN_EXPIRED');
    }

    // Update verification status
    await prisma.emailVerification.update({
      where: { id: verification.id },
      data: {
        isVerified: true,
        verifiedAt: new Date(),
      },
    });

    // Update user email verified status
    await prisma.user.update({
      where: { id: verification.userId },
      data: { emailVerified: true },
    });
  }

  /**
   * Resend verification email
   */
  async resendVerificationEmail(userId: string): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true, emailVerification: true },
    });

    if (!user || !user.email) {
      throw new AppError('User not found or email not set', 404, 'USER_NOT_FOUND');
    }

    if (user.emailVerified) {
      throw new AppError('Email already verified', 400, 'ALREADY_VERIFIED');
    }

    // Delete old verification token if exists
    if (user.emailVerification) {
      await prisma.emailVerification.delete({
        where: { userId },
      });
    }

    // Create new verification token
    const verificationToken = generateVerificationToken();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    await prisma.emailVerification.create({
      data: {
        userId: user.id,
        token: verificationToken,
        email: user.email,
        expiresAt,
      },
    });

    // Send verification email
    await emailService.sendVerificationEmail(
      user.email,
      user.profile?.fullName || 'User',
      verificationToken
    );
  }

  /**
   * Login user with OTP or Email/Password
   */
  async login(phoneOrEmail: string, otpCodeOrPassword?: string, loginMethod: 'otp' | 'email' = 'otp') {
    if (loginMethod === 'email') {
      // Email/Password login
      if (!otpCodeOrPassword) {
        throw new AppError('Password is required for email login', 400, 'PASSWORD_REQUIRED');
      }

      // Find user by email (use findFirst for nullable unique fields)
      const normalizedEmail = phoneOrEmail.toLowerCase().trim();
      const user = await prisma.user.findFirst({
        where: { email: normalizedEmail },
        include: {
          profile: true,
        },
      });

      if (!user) {
        throw new AppError('Invalid email or password', 401, 'INVALID_CREDENTIALS');
      }

      if (!user.passwordHash) {
        throw new AppError('Password not set. Please use phone login or reset password', 400, 'PASSWORD_NOT_SET');
      }

      // Verify password
      const isPasswordValid = await bcrypt.compare(otpCodeOrPassword, user.passwordHash);
      if (!isPasswordValid) {
        throw new AppError('Invalid email or password', 401, 'INVALID_CREDENTIALS');
      }

      if (user.status !== 'active') {
        throw new AppError(`Account is ${user.status}`, 403, 'ACCOUNT_SUSPENDED');
      }

      // Check if email is verified (warn but don't block)
      if (!user.emailVerified) {
        // Allow login but indicate email needs verification
        // You can make this stricter by throwing an error if needed
      }

      // Generate tokens
      const tokenPayload: JWTPayload = {
        userId: user.id,
        userType: user.userType,
        phone: user.phone,
      };

      const accessToken = generateToken(tokenPayload);
      const refreshToken = generateRefreshToken(tokenPayload);

      // Update last login
      await prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });

      return {
        user: {
          id: user.id,
          phone: user.phone,
          email: user.email,
          userType: user.userType,
          status: user.status,
          profile: user.profile,
          emailVerified: user.emailVerified,
        },
        tokens: {
          access_token: accessToken,
          refresh_token: refreshToken,
          expires_in: 3600,
        },
        requiresEmailVerification: false, // Email verification disabled for now
      };
    } else {
      // OTP login (existing phone-based login)
      if (!otpCodeOrPassword) {
        throw new AppError('OTP code is required', 400, 'OTP_REQUIRED');
      }

      const formattedPhone = formatPhoneNumber(phoneOrEmail);

      // Verify OTP
      await otpService.verifyOTP(formattedPhone, otpCodeOrPassword, 'login');

      // Find user
      const user = await prisma.user.findUnique({
        where: { phone: formattedPhone },
        include: {
          profile: true,
        },
      });

      if (!user) {
        throw new AppError('User not found. Please register first', 404, 'USER_NOT_FOUND');
      }

      if (user.status !== 'active') {
        throw new AppError(`Account is ${user.status}`, 403, 'ACCOUNT_SUSPENDED');
      }

      // Generate tokens
      const tokenPayload: JWTPayload = {
        userId: user.id,
        userType: user.userType,
        phone: user.phone,
      };

      const accessToken = generateToken(tokenPayload);
      const refreshToken = generateRefreshToken(tokenPayload);

      // Update last login
      await prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });

      return {
        user: {
          id: user.id,
          phone: user.phone,
          email: user.email,
          userType: user.userType,
          status: user.status,
          profile: user.profile,
          emailVerified: user.emailVerified,
        },
        tokens: {
          access_token: accessToken,
          refresh_token: refreshToken,
          expires_in: 3600,
        },
        requiresEmailVerification: false, // Email verification disabled for now
      };
    }
  }

  /**
   * Request OTP for login/registration
   */
  async requestOTP(phone: string, purpose: 'registration' | 'login' | 'reset_password') {
    const formattedPhone = formatPhoneNumber(phone);

    if (!isValidPhoneNumber(formattedPhone)) {
      throw new AppError('Invalid phone number format', 400, 'INVALID_PHONE');
    }

    // For registration, check if user already exists
    if (purpose === 'registration') {
      const existingUser = await prisma.user.findUnique({
        where: { phone: formattedPhone },
      });

      if (existingUser) {
        throw new AppError('User already exists. Please login instead', 409, 'USER_EXISTS');
      }
    }

    // For login, check if user exists
    if (purpose === 'login') {
      const existingUser = await prisma.user.findUnique({
        where: { phone: formattedPhone },
      });

      if (!existingUser) {
        throw new AppError('User not found. Please register first', 404, 'USER_NOT_FOUND');
      }
    }

    // Generate and send OTP
    const otpCode = await otpService.generateOTP(formattedPhone, purpose);

    return {
      message: 'OTP sent successfully',
      phone: formattedPhone,
      // In development, return OTP for testing
      ...(process.env.NODE_ENV === 'development' && { otpCode }),
    };
  }

  /**
   * Refresh access token
   */
  async refreshToken(refreshToken: string) {
    try {
      const { verifyToken, generateToken } = await import('../utils/jwt');
      const payload = verifyToken(refreshToken);

      // Verify user still exists and is active
      const user = await prisma.user.findUnique({
        where: { id: payload.userId },
      });

      if (!user || user.status !== 'active') {
        throw new AppError('User not found or inactive', 401, 'USER_INACTIVE');
      }

      // Generate new tokens
      const tokenPayload: JWTPayload = {
        userId: user.id,
        userType: user.userType,
        phone: user.phone,
      };

      const newAccessToken = generateToken(tokenPayload);
      const newRefreshToken = generateRefreshToken(tokenPayload);

      return {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
      };
    } catch (error) {
      throw new AppError('Invalid refresh token', 401, 'INVALID_REFRESH_TOKEN');
    }
  }

  /**
   * Get current user profile
   */
  async getCurrentUser(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        profile: true,
        addresses: {
          where: { isDefault: true },
          take: 1,
        },
      },
    });

    if (!user) {
      throw new AppError('User not found', 404, 'USER_NOT_FOUND');
    }

    return {
      id: user.id,
      phone: user.phone,
      email: user.email,
      userType: user.userType,
      status: user.status,
      profile: user.profile,
      defaultAddress: user.addresses[0] || null,
    };
  }
}

export default new AuthService();

