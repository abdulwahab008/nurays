import prisma from '../config/database';
import { generateToken, generateRefreshToken, tokenTtlSeconds, isTokenRevoked, JWTPayload } from '../utils/jwt';
import { formatPhoneNumber, isValidPhoneNumber } from '../utils/otp';
import { AppError } from '../middleware/errorHandler';
import bcrypt from 'bcrypt';
import { randomBytes, createHash } from 'crypto';
import otpService from './otp.service';
import emailService from './email.service';
import adminService from './admin.service';
import { generateVerificationToken } from '../utils/email-verification';

/** A unique stand-in number for an account with no (or an evicted) real phone. Never a real number: +999 isn't assigned. */
const placeholderPhone = (seed: string): string =>
  `+999${Buffer.from(seed.toLowerCase()).toString('base64').replace(/[^A-Za-z0-9]/g, '').slice(0, 8)}${Date.now().toString().slice(-8)}${randomBytes(3).toString('hex')}`;


/** A valid bcrypt hash of a random string, for equalising login timing when the account doesn't exist. */
const DUMMY_PASSWORD_HASH = bcrypt.hashSync(randomBytes(16).toString('hex'), 10);

export class AuthService {
  /**
   * Register a new user (Email + Password is primary, Phone is optional)
   * For sellers, also creates a seller record with pending status
   */
  async register(
    email: string,
    password: string,
    userType: 'customer' | 'seller' | 'rider',
    fullName: string,
    phone?: string,
    city?: string,
    area?: string,
    businessName?: string, // Required for sellers
    phoneOtp?: string // Proof of the phone number (optional): without it the phone is stored UNVERIFIED
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

    // A phone number is only trusted once its owner has proven it with an OTP. Without
    // proof it is stored as an unverified contact number: it can't be used to log in, and
    // it can be claimed by whoever really owns it (see below). Previously every number
    // typed at signup was marked verified, so anyone could register a victim's number
    // and later receive the victim's OTP logins into an account they control.
    let formattedPhone: string;
    let phoneVerified = false;
    let evictedAccountId: string | null = null;
    if (phone) {
      formattedPhone = formatPhoneNumber(phone);
      if (!isValidPhoneNumber(formattedPhone)) {
        throw new AppError('Invalid phone number format', 400, 'INVALID_PHONE');
      }

      const existingUserByPhone = await prisma.user.findUnique({
        where: { phone: formattedPhone },
      });

      // A number held by a *verified* account is taken — decided BEFORE a code is consumed, so a
      // user who hits this doesn't also burn their SMS.
      if (existingUserByPhone?.phoneVerified) {
        throw new AppError('Phone number already registered', 409, 'PHONE_EXISTS');
      }

      if (phoneOtp) {
        // Throws on a wrong / expired / used code.
        await otpService.verifyOTP(formattedPhone, phoneOtp, 'registration');
        phoneVerified = true;
      }

      if (existingUserByPhone) {
        // Held by an account that only ever *claimed* it: whoever proves they own it wins.
        if (!phoneVerified) {
          throw new AppError('Phone number already registered', 409, 'PHONE_EXISTS');
        }
        evictedAccountId = existingUserByPhone.id;
      }
    } else {
      formattedPhone = placeholderPhone(email);
      const clash = await prisma.user.findUnique({ where: { phone: formattedPhone } });
      if (clash) {
        formattedPhone = placeholderPhone(email + randomBytes(4).toString('hex'));
      }
    }

    // Hash password
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Create the user. When a proven owner takes a number from an account that only claimed it, the
    // eviction and the create are ONE transaction: if the create fails (an email race, say) the
    // other account must not have lost its number for nothing.
    const user = await prisma.$transaction(async (tx) => {
      if (evictedAccountId) {
        await tx.user.update({
          where: { id: evictedAccountId },
          // tokensValidAfter: whoever held the number without owning it loses their sessions too.
          data: { phone: placeholderPhone(`evicted-${evictedAccountId}`), phoneVerified: false, tokensValidAfter: new Date() },
        });
      }
      return tx.user.create({
        data: {
          email: normalizedEmail, // Use normalized email (already lowercased and trimmed)
          passwordHash,
          phone: formattedPhone,
          userType,
          emailVerified: false, // Can be verified via email verification later
          phoneVerified,
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
    });

    // If registering as seller, create seller record with pending status
    let seller = null;
    if (userType === 'seller') {
      const sellerBusinessName = businessName?.trim() || fullName.trim() + "'s Kitchen";
      const commissionRate = await adminService.getSettingValue<number>('commissionRate');
      seller = await prisma.seller.create({
        data: {
          userId: user.id,
          businessName: sellerBusinessName,
          commissionRate,
          // status tracks active/inactive/suspended account standing and
          // defaults to 'active' — approval state lives in verificationStatus
          // alone. Setting status:'pending' here was blocking every new
          // seller from any status-gated route before they'd done anything
          // wrong.
          verificationStatus: 'pending',
        },
      });
    }

    // If registering as a rider, create the rider record too — pending admin
    // approval (verificationStatus), same as sellers. requireRider blocks all
    // delivery access until an admin approves it (see rider.service.ts).
    if (userType === 'rider') {
      await prisma.rider.create({
        data: {
          userId: user.id,
          city: city?.trim() || 'Unspecified',
          status: 'active',
          verificationStatus: 'pending',
        },
      });
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
        phoneVerified: user.phoneVerified,
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
        expires_in: tokenTtlSeconds(accessToken),
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
        // Spend the same time as a real check, so response time doesn't reveal whether the email exists.
        await bcrypt.compare(otpCodeOrPassword, DUMMY_PASSWORD_HASH);
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
          phoneVerified: user.phoneVerified,
        },
        tokens: {
          access_token: accessToken,
          refresh_token: refreshToken,
          expires_in: tokenTtlSeconds(accessToken),
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

      // OTP proves the caller controls this number — but not that the ACCOUNT's owner does. If
      // the number was never verified for this account, whoever created it may not own it
      // (they could have typed a victim's number), so logging the OTP holder in would hand them
      // an account someone else set the password for. Sign in another way and verify the number.
      if (!user.phoneVerified) {
        throw new AppError(
          'This phone number has not been verified for the account. Log in with your email, then verify your phone.',
          403,
          'PHONE_NOT_VERIFIED'
        );
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
          phoneVerified: user.phoneVerified,
        },
        tokens: {
          access_token: accessToken,
          refresh_token: refreshToken,
          expires_in: tokenTtlSeconds(accessToken),
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

      // A number held by an account that never verified it can still be claimed.
      if (existingUser && existingUser.phoneVerified) {
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

    // Generate and send OTP (the code itself is only ever sent by SMS)
    await otpService.generateOTP(formattedPhone, purpose);

    return {
      message: 'OTP sent successfully',
      phone: formattedPhone,
    };
  }

  /**
   * Start verifying a phone number for the signed-in account (also how an email/Google
   * account adds a real number). Sends an OTP to that number.
   */
  async requestPhoneVerification(userId: string, phone: string) {
    const formattedPhone = formatPhoneNumber(phone);
    if (!isValidPhoneNumber(formattedPhone)) {
      throw new AppError('Invalid phone number format', 400, 'INVALID_PHONE');
    }

    const holder = await prisma.user.findUnique({ where: { phone: formattedPhone } });
    if (holder && holder.id !== userId && holder.phoneVerified) {
      throw new AppError('Phone number already registered', 409, 'PHONE_EXISTS');
    }

    await otpService.generateOTP(formattedPhone, 'registration');
    // The code is never returned in an API response: only the SMS carries it.
    return {
      message: 'OTP sent successfully',
      phone: formattedPhone,
    };
  }

  /**
   * Finish verifying a phone number: the OTP proves the signed-in user controls it, so it
   * becomes theirs and verified. An account that merely claimed it without proof loses it.
   */
  async verifyPhone(userId: string, phone: string, otpCode: string) {
    const formattedPhone = formatPhoneNumber(phone);
    await otpService.verifyOTP(formattedPhone, otpCode, 'registration');

    return prisma.$transaction(async (tx) => {
      const holder = await tx.user.findUnique({ where: { phone: formattedPhone } });
      if (holder && holder.id !== userId) {
        if (holder.phoneVerified) {
          throw new AppError('Phone number already registered', 409, 'PHONE_EXISTS');
        }
        await tx.user.update({
          where: { id: holder.id },
          // tokensValidAfter: the squatter's sessions die with the number they never owned.
          data: { phone: placeholderPhone(`evicted-${holder.id}`), phoneVerified: false, tokensValidAfter: new Date() },
        });
      }
      const user = await tx.user.update({
        where: { id: userId },
        data: { phone: formattedPhone, phoneVerified: true },
      });
      return { phone: user.phone, phoneVerified: user.phoneVerified };
    });
  }

  /**
   * Start a password reset: email a one-time link. Always answers the same way, whether or not the
   * email has an account (no enumeration). Also how a Google-only account (password dropped) can
   * set one.
   */
  async forgotPassword(email: string): Promise<void> {
    const normalizedEmail = email.toLowerCase().trim();
    const user = await prisma.user.findFirst({
      where: { email: normalizedEmail },
      include: { profile: true },
    });
    if (!user || user.status !== 'active') return;

    // Only the most recent link works.
    await prisma.passwordReset.deleteMany({ where: { userId: user.id, usedAt: null } });

    const token = generateVerificationToken();
    await prisma.passwordReset.create({
      data: {
        userId: user.id,
        tokenHash: createHash('sha256').update(token).digest('hex'),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
      },
    });

    try {
      await emailService.sendPasswordResetEmail(normalizedEmail, user.profile?.fullName || 'there', token);
    } catch (err) {
      console.error(`[forgotPassword] Could not send the reset email to ${normalizedEmail}`, err);
    }
  }

  /**
   * Finish a password reset. The link is single-use; on success every session the account had is
   * voided (anyone who was logged in — including an attacker — must sign in again).
   */
  async resetPassword(token: string, newPassword: string): Promise<void> {
    if (!newPassword || newPassword.length < 6) {
      throw new AppError('Password must be at least 6 characters', 400, 'WEAK_PASSWORD');
    }
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const passwordHash = await bcrypt.hash(newPassword, 10);

    await prisma.$transaction(async (tx) => {
      const used = await tx.passwordReset.updateMany({
        where: { tokenHash, usedAt: null, expiresAt: { gt: new Date() } },
        data: { usedAt: new Date() },
      });
      if (used.count === 0) {
        throw new AppError('This reset link is invalid or has expired', 400, 'INVALID_RESET_TOKEN');
      }
      const reset = await tx.passwordReset.findUniqueOrThrow({ where: { tokenHash } });
      await tx.user.update({
        where: { id: reset.userId },
        data: {
          passwordHash,
          tokensValidAfter: new Date(),
          // Receiving the email proves they control the address.
          emailVerified: true,
        },
      });
    });
  }

  /**
   * Refresh access token
   */
  async refreshToken(refreshToken: string) {
    try {
      const { verifyRefreshToken, generateToken } = await import('../utils/jwt');
      const payload = verifyRefreshToken(refreshToken);

      // Verify user still exists and is active
      const user = await prisma.user.findUnique({
        where: { id: payload.userId },
      });

      if (!user || user.status !== 'active') {
        throw new AppError('User not found or inactive', 401, 'USER_INACTIVE');
      }
      if (isTokenRevoked(payload, user.tokensValidAfter)) {
        throw new AppError('Session expired, please log in again', 401, 'SESSION_REVOKED');
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
      emailVerified: user.emailVerified,
      phoneVerified: user.phoneVerified,
      profile: user.profile,
      defaultAddress: user.addresses[0] || null,
    };
  }
}

export default new AuthService();

