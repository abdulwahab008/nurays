/**
 * Signing in someone whose e-mail a provider (Google or Apple) has verified: the account with that e-mail signs in, or
 * a customer account is made for it. A suspended account and a staff account (staff sign in with a password and their
 * second step) are refused. When the address had never been verified, whoever set the account's password may have
 * registered it before the real owner, so that password and every session issued for it are dropped.
 */
import prisma from '../config/database';
import { tokenTtlSeconds } from '../utils/jwt';
import { startSession } from './session.service';
import { AppError } from '../middleware/errorHandler';

export async function signInVerifiedEmail({ email, name, picture }: { email: string; name: string; picture: string | null }) {
  // Check if user exists by email
  let user = await prisma.user.findFirst({
    where: { email },
    include: { profile: true },
  });

  if (user) {
    // A suspended/banned account must not get fresh tokens from a provider's sign-in.
    if (user.status !== 'active') {
      throw new AppError('Account is not active', 403, 'ACCOUNT_NOT_ACTIVE');
    }
    if (user.userType === 'admin') {
      throw new AppError('Admin accounts sign in with email and password.', 403, 'ADMIN_PASSWORD_ONLY');
    }
    // User exists, log them in
    // The provider has verified the e-mail
    // Update email verification status and last login
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: { 
        lastLoginAt: new Date(),
        emailVerified: true, // the provider verified it
        // If this email was never verified, whoever set its password may have
        // registered it before the real owner (pre-hijack). The provider has now
        // proven ownership, so drop that password; the owner signs in through the provider.
        // Also void every session already issued for it: the person who set that password (and holds a
        // 30-day refresh token from signup) must not stay logged in to the real owner's account.
        ...(user.emailVerified ? {} : { passwordHash: null, tokensValidAfter: new Date() }),
      },
      include: {
        profile: true,
      },
    });

    const { accessToken, refreshToken } = await startSession(updatedUser);

    return {
      user: {
        id: updatedUser.id,
        phone: updatedUser.phone,
        email: updatedUser.email,
        userType: updatedUser.userType,
        emailVerified: true, // verified by the provider
        profile: updatedUser.profile
          ? {
              fullName: updatedUser.profile.fullName,
              avatarUrl: updatedUser.profile.avatarUrl || picture,
              city: updatedUser.profile.city,
              area: updatedUser.profile.area,
            }
          : undefined,
      },
      tokens: {
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_in: tokenTtlSeconds(accessToken),
      },
      requiresEmailVerification: false, // verified by the provider
    };
  } else {
    // New user, create account
    // Generate temporary phone number
    const emailHash = Buffer.from(email).toString('base64').slice(0, 8);
    const timestamp = Date.now().toString().slice(-8);
    const random = Math.random().toString(36).substring(2, 6);
    const formattedPhone = `+999${emailHash}${timestamp}${random}`;

    // Create user
    user = await prisma.user.create({
      data: {
        email,
        phone: formattedPhone,
        userType: 'customer',
        emailVerified: true, // the provider verified it
        phoneVerified: false,
        status: 'active',
        profile: {
          create: {
            fullName: name,
            avatarUrl: picture,
          },
        },
      },
      include: {
        profile: true,
      },
    });

    const { accessToken, refreshToken } = await startSession(user);

    return {
      user: {
        id: user.id,
        phone: user.phone,
        email: user.email,
        userType: user.userType,
        emailVerified: user.emailVerified,
        profile: user.profile
          ? {
              fullName: user.profile.fullName,
              avatarUrl: user.profile.avatarUrl,
              city: user.profile.city,
              area: user.profile.area,
            }
          : undefined,
      },
      tokens: {
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_in: tokenTtlSeconds(accessToken),
      },
      requiresEmailVerification: false, // verified by the provider
    };
  }
}
