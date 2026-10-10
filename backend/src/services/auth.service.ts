import { maskEmail } from '../utils/mask';
import prisma from '../config/database';
import socketManager from '../config/socket';
import { generateToken, generateRefreshToken, tokenTtlSeconds, isTokenRevoked, JWTPayload } from '../utils/jwt';
import { formatPhoneNumber, isValidPhoneNumber, realPhoneOrNull } from '../utils/otp';
import { AppError } from '../middleware/errorHandler';
import bcrypt from 'bcrypt';
import { randomBytes, createHash } from 'crypto';
import otpService from './otp.service';
import { queueVerificationEmail, queuePasswordResetEmail } from '../jobs/email.jobs';
import adminService from './admin.service';
import { recordAudit } from '../middleware/audit';
import { permissionsFor } from '../utils/permissions';
import { generateVerificationToken } from '../utils/email-verification';
import { assertVerifyMailAllowed } from '../utils/mailBudget';
import { assertPasswordStrength, MIN_PASSWORD_LENGTH, MIN_STAFF_PASSWORD_LENGTH } from '../utils/password-policy';
import { assertCurrentPassword } from './reauth.service';
import { notifyPasswordChanged } from './account-notice.service';
import { logger } from '../utils/logger';

/** A unique stand-in number for an account with no (or an evicted) real phone. Never a real number: +999 isn't assigned. */
export const placeholderPhone = (seed: string): string =>
  `+999${Buffer.from(seed.toLowerCase()).toString('base64').replace(/[^A-Za-z0-9]/g, '').slice(0, 8)}${Date.now().toString().slice(-8)}${randomBytes(3).toString('hex')}`;


/** A valid bcrypt hash of a random string, for equalising login timing when the account doesn't exist. */
const DUMMY_PASSWORD_HASH = bcrypt.hashSync(randomBytes(16).toString('hex'), 10);

/** An admin account is locked for a while after this many wrong passwords. */
const ADMIN_MAX_FAILED_LOGINS = 5;
const ADMIN_LOCK_MINUTES = 15;

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

    // Validate password: long enough, not a common one, not made of the person's own details.
    // Before the phone code below is used up, so a weak password does not burn an SMS.
    assertPasswordStrength(password, { email: normalizedEmail, phone, name: fullName });

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

    // The verification email goes out in the background (retried if the mail server is
    // down), so it can neither slow down nor fail registration; the user can also resend it.
    let emailSendFailed = false;
    try {
      await queueVerificationEmail(user.id);
    } catch (err) {
      emailSendFailed = true;
      logger.error({ err, email: maskEmail(normalizedEmail) }, 'Could not queue the verification e-mail at registration; the user can resend it');
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

    // Before the old link is cancelled: an inbox only gets so many of these an hour.
    await assertVerifyMailAllowed(user.email);

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

    await queueVerificationEmail(user.id);
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

      // Admin accounts: locked after repeated wrong passwords (counted from the audit log).
      const isAdmin = user.userType === 'admin';
      if (isAdmin) {
        const since = new Date(Date.now() - ADMIN_LOCK_MINUTES * 60 * 1000);
        const lastOk = await prisma.auditLog.findFirst({ where: { action: 'auth:LOGIN', userId: user.id, createdAt: { gte: since } }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } });
        const failures = await prisma.auditLog.count({
          where: { action: 'auth:LOGIN_FAILED', entityId: user.id, createdAt: { gte: lastOk?.createdAt ?? since } },
        });
        if (failures >= ADMIN_MAX_FAILED_LOGINS) {
          void recordAudit({ action: 'auth:LOGIN_LOCKED', entityType: 'user', entityId: user.id, responseStatus: 429 });
          throw new AppError(`Too many wrong passwords. This account is locked for ${ADMIN_LOCK_MINUTES} minutes.`, 429, 'ACCOUNT_LOCKED');
        }
      }

      // Verify password
      const isPasswordValid = await bcrypt.compare(otpCodeOrPassword, user.passwordHash);
      if (!isPasswordValid) {
        if (isAdmin) await recordAudit({ action: 'auth:LOGIN_FAILED', entityType: 'user', entityId: user.id, responseStatus: 401 });
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
      if (isAdmin) await recordAudit({ userId: user.id, action: 'auth:LOGIN', entityType: 'user', entityId: user.id, responseStatus: 200 });

      return {
        user: {
          id: user.id,
          phone: user.phone,
          email: user.email,
          userType: user.userType,
          staffRole: user.staffRole,
          permissions: permissionsFor(user.staffRole),
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

      // An SMS code (open to SIM swaps) is not enough for an admin account: password only.
      if (user.userType === 'admin') {
        void recordAudit({ action: 'auth:LOGIN_REFUSED_OTP', entityType: 'user', entityId: user.id, responseStatus: 403 });
        throw new AppError('Admin accounts sign in with email and password.', 403, 'ADMIN_PASSWORD_ONLY');
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
          staffRole: user.staffRole,
          permissions: permissionsFor(user.staffRole),
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
  async requestOTP(phone: string, purpose: 'registration' | 'login') {
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
    // Only an address whose owner has already proven it gets a link: an unverified address is
    // whatever was last typed into the profile, which must not be enough to take the account over.
    if (!user || user.status !== 'active' || !user.emailVerified) return;

    // The background job creates the single-use link (only its hash is stored) and emails
    // it, so this answers just as fast for an unknown address as for a real one.
    try {
      await queuePasswordResetEmail(user.id);
    } catch (err) {
      logger.error({ err, email: maskEmail(normalizedEmail) }, 'Could not queue the password reset e-mail');
    }
  }

  /**
   * Finish a password reset. The link is single-use; on success every session the account had is
   * voided (anyone who was logged in — including an attacker — must sign in again).
   */
  async resetPassword(token: string, newPassword: string): Promise<void> {
    const tokenHash = createHash('sha256').update(token).digest('hex');
    // Whose link it is decides what the new password must be (staff: longer; nobody: made of their own
    // name or number), so the link is looked at first. It is used up below, in the step that sets the password.
    const pending = await prisma.passwordReset.findFirst({
      where: { tokenHash, usedAt: null, expiresAt: { gt: new Date() } },
      select: { user: { select: { email: true, phone: true, userType: true, profile: { select: { fullName: true } } } } },
    });
    if (!pending) {
      throw new AppError('This reset link is invalid or has expired', 400, 'INVALID_RESET_TOKEN');
    }
    assertPasswordStrength(newPassword, {
      minLength: pending.user.userType === 'admin' ? MIN_STAFF_PASSWORD_LENGTH : MIN_PASSWORD_LENGTH,
      email: pending.user.email,
      phone: realPhoneOrNull(pending.user.phone),
      name: pending.user.profile?.fullName,
    });
    const passwordHash = await bcrypt.hash(newPassword, 10);

    let resetUserId: string | null = null;
    await prisma.$transaction(async (tx) => {
      const used = await tx.passwordReset.updateMany({
        where: { tokenHash, usedAt: null, expiresAt: { gt: new Date() } },
        data: { usedAt: new Date() },
      });
      if (used.count === 0) {
        throw new AppError('This reset link is invalid or has expired', 400, 'INVALID_RESET_TOKEN');
      }
      const reset = await tx.passwordReset.findUniqueOrThrow({ where: { tokenHash } });
      resetUserId = reset.userId;
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
    // Every session ends with a password reset: leave a trail of who and when.
    if (resetUserId) socketManager.disconnectUser(resetUserId);
    if (resetUserId) void recordAudit({ userId: resetUserId, action: 'auth:PASSWORD_RESET', entityType: 'user', entityId: resetUserId, responseStatus: 200 });
  }

  /**
   * Change the password of a signed-in account.
   *
   * The current password is asked for again, and counted like the other "confirm with your password" screens, so a
   * token that leaks cannot be used to guess it. An account with no password (it signs in with Google or a code) has
   * nothing to change, and a token alone must not be able to give it one: it sets one through "forgot password",
   * which writes to the address its owner has proven. As with a password reset every other session ends, and this one
   * is handed a fresh pair of tokens so that the person stays signed in here. The owner is told by e-mail.
   */
  async changePassword(userId: string, currentPassword: string, newPassword: string, ctx: { ip?: string | null } = {}) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        emailVerified: true,
        phone: true,
        userType: true,
        status: true,
        passwordHash: true,
        profile: { select: { fullName: true } },
      },
    });
    if (!user || user.status !== 'active') {
      throw new AppError('User not found', 404, 'USER_NOT_FOUND');
    }
    if (!user.passwordHash) {
      throw new AppError('This account has no password. Use "Forgot password" to set one.', 400, 'NO_PASSWORD_SET');
    }
    // What is wrong with the new password is said before the old one is checked: it costs the person no attempt.
    assertPasswordStrength(newPassword, {
      minLength: user.userType === 'admin' ? MIN_STAFF_PASSWORD_LENGTH : MIN_PASSWORD_LENGTH,
      email: user.email,
      phone: realPhoneOrNull(user.phone),
      name: user.profile?.fullName,
    });
    await assertCurrentPassword({ id: user.id, passwordHash: user.passwordHash }, currentPassword, ctx);
    if (await bcrypt.compare(newPassword, user.passwordHash)) {
      throw new AppError('Choose a password different from the current one', 400, 'PASSWORD_UNCHANGED');
    }

    // Hashed first: the cut-off is taken as late as possible, so a session another device starts meanwhile is not spared.
    const passwordHash = await bcrypt.hash(newPassword, 10);
    const changedAt = new Date();
    await prisma.user.update({ where: { id: userId }, data: { passwordHash, tokensValidAfter: changedAt } });
    socketManager.disconnectUser(userId);
    void recordAudit({ userId, action: 'auth:PASSWORD_CHANGED', entityType: 'user', entityId: userId, ipAddress: ctx.ip ?? null, responseStatus: 200 });
    void notifyPasswordChanged({ email: user.email, emailVerified: user.emailVerified, fullName: user.profile?.fullName }, changedAt);

    // Tokens made after the cut-off: this session carries on, every older one is void.
    const tokenPayload: JWTPayload = { userId: user.id, userType: user.userType, phone: user.phone };
    const accessToken = generateToken(tokenPayload);
    const refreshToken = generateRefreshToken(tokenPayload);
    return {
      tokens: {
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_in: tokenTtlSeconds(accessToken),
      },
    };
  }

  /**
   * Refresh access token
   */
  async refreshToken(refreshToken: string) {
    const { verifyRefreshToken, generateToken } = await import('../utils/jwt');
    // Only a bad token is "invalid"; a revoked session, a closed account or a database
    // outage each answer as what they are (the client keeps its session on a 5xx).
    let payload: JWTPayload;
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch {
      throw new AppError('Invalid refresh token', 401, 'INVALID_REFRESH_TOKEN');
    }

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
      staffRole: user.staffRole,
      permissions: permissionsFor(user.staffRole),
      status: user.status,
      emailVerified: user.emailVerified,
      phoneVerified: user.phoneVerified,
      profile: user.profile,
      defaultAddress: user.addresses[0] || null,
    };
  }
}

export default new AuthService();

