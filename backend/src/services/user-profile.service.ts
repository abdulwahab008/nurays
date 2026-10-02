import prisma from '../config/database';
import { isStoredFile, storedFileOwner } from '../storage';
import { AppError } from '../middleware/errorHandler';
import { communityService } from './community.service';
import emailService from './email.service';
import { generateVerificationToken } from '../utils/email-verification';

export class UserProfileService {
  /**
   * Get current user profile
   */
  async getCurrentUserProfile(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        profile: true,
      },
    });

    if (!user) {
      throw new AppError('User not found', 404, 'USER_NOT_FOUND');
    }

    return {
      id: user.id,
      phone: user.phone,
      phoneVerified: user.phoneVerified,
      email: user.email,
      userType: user.userType,
      status: user.status,
      profile: user.profile
        ? {
            fullName: user.profile.fullName,
            avatarUrl: user.profile.avatarUrl,
            city: user.profile.city,
            area: user.profile.area,
            languagePreference: user.profile.languagePreference,
          }
        : null,
      createdAt: user.createdAt,
    };
  }

  /**
   * Update user profile
   */
  async updateProfile(userId: string, data: {
    fullName?: string;
    email?: string;
    city?: string;
    area?: string;
    languagePreference?: string;
  }) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new AppError('User not found', 404, 'USER_NOT_FOUND');
    }

    // Changing the email is changing who owns the account: the new address is unverified until its
    // owner clicks the link we send to it. (It used to be swapped in silently and stay "verified",
    // so someone could put a victim's email on an account they controlled and later catch the victim
    // when they signed in with Google.)
    const newEmail = data.email?.toLowerCase().trim();
    if (newEmail && newEmail !== user.email) {
      // Check if email is already taken
      const existingUser = await prisma.user.findUnique({
        where: { email: newEmail },
      });

      if (existingUser && existingUser.id !== userId) {
        throw new AppError('Email already registered', 400, 'EMAIL_ALREADY_EXISTS');
      }

      const token = generateVerificationToken();
      await prisma.$transaction([
        prisma.user.update({
          where: { id: userId },
          data: { email: newEmail, emailVerified: false },
        }),
        prisma.emailVerification.deleteMany({ where: { userId } }),
        prisma.emailVerification.create({
          data: { userId, email: newEmail, token, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) },
        }),
      ]);
      try {
        await emailService.sendVerificationEmail(newEmail, data.fullName || 'there', token);
      } catch (err) {
        console.error(`[updateProfile] Could not send verification email to ${newEmail}`, err);
      }
    }

    // Get or create profile
    let profile = await prisma.userProfile.findUnique({
      where: { userId },
    });

    if (!profile) {
      profile = await prisma.userProfile.create({
        data: {
          userId,
          fullName: data.fullName || 'User',
          city: data.city,
          area: data.area,
          languagePreference: data.languagePreference || 'en',
        },
      });
    } else {
      profile = await prisma.userProfile.update({
        where: { userId },
        data: {
          fullName: data.fullName ?? profile.fullName,
          city: data.city ?? profile.city,
          area: data.area ?? profile.area,
          languagePreference: data.languagePreference ?? profile.languagePreference,
        },
      });
    }

    const updatedUser = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        profile: true,
      },
    });

    return {
      id: updatedUser!.id,
      phone: updatedUser!.phone,
      email: updatedUser!.email,
      userType: updatedUser!.userType,
      profile: updatedUser!.profile
        ? {
            fullName: updatedUser!.profile.fullName,
            avatarUrl: updatedUser!.profile.avatarUrl,
            city: updatedUser!.profile.city,
            area: updatedUser!.profile.area,
            languagePreference: updatedUser!.profile.languagePreference,
          }
        : null,
    };
  }

  /**
   * Update avatar
   */
  async updateAvatar(userId: string, avatarUrl: string) {
    // A profile photo is shown to other people: it must be one this user uploaded
    // (POST /upload/avatar), never an arbitrary external link.
    if (!isStoredFile(avatarUrl, { public: 'avatars' }) || storedFileOwner(avatarUrl) !== userId) {
      throw new AppError('Please upload your profile photo through the app', 400, 'INVALID_AVATAR_URL');
    }
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new AppError('User not found', 404, 'USER_NOT_FOUND');
    }

    // Get or create profile
    let profile = await prisma.userProfile.findUnique({
      where: { userId },
    });

    if (!profile) {
      profile = await prisma.userProfile.create({
        data: {
          userId,
          fullName: 'User',
          avatarUrl,
        },
      });
    } else {
      profile = await prisma.userProfile.update({
        where: { userId },
        data: { avatarUrl },
      });
    }

    return {
      avatarUrl: profile.avatarUrl,
    };
  }

  /**
   * Get user addresses
   */
  async getUserAddresses(userId: string) {
    const addresses = await prisma.userAddress.findMany({
      where: { userId },
      orderBy: [
        { isDefault: 'desc' },
        { createdAt: 'desc' },
      ],
    });

    return addresses.map((addr) => ({
      id: addr.id,
      label: addr.label,
      addressLine1: addr.addressLine1,
      addressLine2: addr.addressLine2,
      area: addr.area,
      city: addr.city,
      postalCode: addr.postalCode,
      landmark: addr.landmark,
      isDefault: addr.isDefault,
      communityId: addr.communityId,
      coordinates: addr.latitude && addr.longitude
        ? {
            latitude: Number(addr.latitude),
            longitude: Number(addr.longitude),
          }
        : null,
      createdAt: addr.createdAt,
    }));
  }

  /**
   * Add address
   */
  async addAddress(userId: string, data: {
    label?: string;
    addressLine1: string;
    addressLine2?: string;
    area: string;
    city: string;
    postalCode?: string;
    landmark?: string;
    latitude?: number;
    longitude?: number;
    communityId?: string;
    isDefault?: boolean;
  }) {
    // The community decides which sellers deliver here and at what fee: use the
    // one the buyer picked, otherwise infer it from the address.
    let communityId: string | null = null;
    if (data.communityId) {
      const community = await prisma.community.findFirst({ where: { id: data.communityId, isActive: true } });
      if (!community) throw new AppError('Community not found', 404, 'COMMUNITY_NOT_FOUND');
      // The chosen community has to be consistent with the pin: a GPS point that sits
      // outside it (or resolves to a different community) can't be filed under it,
      // or the buyer could dodge a seller's per-community rules.
      if (data.latitude != null && data.longitude != null) {
        const dist = communityService.distanceToCommunityKm(community, Number(data.latitude), Number(data.longitude));
        if (dist > community.radiusKm) {
          throw new AppError('The pinned location is outside the selected community', 400, 'COMMUNITY_LOCATION_MISMATCH');
        }
      }
      communityId = community.id;
    } else {
      communityId = await communityService.resolveCommunityIdForAddress(data, userId);
    }

    // A user's very first address is always their default, regardless of what was passed.
    const existingCount = await prisma.userAddress.count({ where: { userId } });
    const isDefault = data.isDefault || existingCount === 0;

    // If this is set as default, unset other defaults
    if (isDefault) {
      await prisma.userAddress.updateMany({
        where: { userId, isDefault: true },
        data: { isDefault: false },
      });
    }

    const address = await prisma.userAddress.create({
      data: {
        userId,
        label: data.label,
        addressLine1: data.addressLine1,
        addressLine2: data.addressLine2,
        area: data.area,
        city: data.city,
        postalCode: data.postalCode,
        landmark: data.landmark,
        latitude: data.latitude,
        longitude: data.longitude,
        communityId,
        isDefault,
      },
    });

    return {
      id: address.id,
      label: address.label,
      addressLine1: address.addressLine1,
      addressLine2: address.addressLine2,
      area: address.area,
      city: address.city,
      postalCode: address.postalCode,
      landmark: address.landmark,
      isDefault: address.isDefault,
      communityId: address.communityId,
      coordinates: address.latitude && address.longitude
        ? {
            latitude: Number(address.latitude),
            longitude: Number(address.longitude),
          }
        : null,
      createdAt: address.createdAt,
    };
  }
}

export default new UserProfileService();

