import prisma from '../config/database';
import { generateToken, generateRefreshToken, JWTPayload } from '../utils/jwt';
import { AppError } from '../middleware/errorHandler';

export class GoogleAuthService {
  /**
   * Authenticate user with Google OAuth token
   * Creates new user if doesn't exist, otherwise logs in
   */
  async authenticateWithGoogle(accessToken: string) {
    try {
      // Get user info from Google using access token
      const response = await fetch(`https://www.googleapis.com/oauth2/v2/userinfo?access_token=${accessToken}`);
      
      if (!response.ok) {
        throw new AppError('Invalid Google access token', 401, 'INVALID_GOOGLE_TOKEN');
      }

      const payload = await response.json() as {
        email?: string;
        name?: string;
        picture?: string;
        id?: string;
      };
      
      const email = payload.email?.toLowerCase().trim();
      const name = payload.name || '';
      const picture = payload.picture || null;

      if (!email) {
        throw new AppError('Email not provided by Google', 400, 'GOOGLE_EMAIL_MISSING');
      }

      // Check if user exists by email
      let user = await prisma.user.findFirst({
        where: { email },
        include: { profile: true },
      });

      if (user) {
        // User exists, log them in
        // Since they're logging in with Google, their email is verified by Google
        // Update email verification status and last login
        const updatedUser = await prisma.user.update({
          where: { id: user.id },
          data: { 
            lastLoginAt: new Date(),
            emailVerified: true, // Google emails are pre-verified
          },
          include: {
            profile: true,
          },
        });

        // Generate tokens
        const tokenPayload: JWTPayload = {
          userId: updatedUser.id,
          userType: updatedUser.userType,
          phone: updatedUser.phone,
        };

        const accessToken = generateToken(tokenPayload);
        const refreshToken = generateRefreshToken(tokenPayload);

        return {
          user: {
            id: updatedUser.id,
            phone: updatedUser.phone,
            email: updatedUser.email,
            userType: updatedUser.userType,
            emailVerified: true, // Always true for Google OAuth
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
            expires_in: 3600,
          },
          requiresEmailVerification: false, // Google emails are always verified
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
            emailVerified: true, // Google emails are pre-verified
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

        // Generate tokens
        const tokenPayload: JWTPayload = {
          userId: user.id,
          userType: user.userType,
          phone: user.phone,
        };

        const accessToken = generateToken(tokenPayload);
        const refreshToken = generateRefreshToken(tokenPayload);

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
            expires_in: 3600,
          },
          requiresEmailVerification: false, // Google emails are pre-verified
        };
      }
    } catch (error: any) {
      if (error instanceof AppError) {
        throw error;
      }
      console.error('Google authentication error:', error);
      throw new AppError('Google authentication failed', 401, 'GOOGLE_AUTH_FAILED');
    }
  }
}

export default new GoogleAuthService();

