import { maskEmail } from '../utils/mask';
import prisma from '../config/database';
import { isStoredFile, storedFileOwner } from '../storage';
import { AppError } from '../middleware/errorHandler';
import { communityService } from './community.service';
import { queueVerificationEmail } from '../jobs/email.jobs';
import { generateVerificationToken } from '../utils/email-verification';
import { assertCurrentPassword } from './reauth.service';
import { budgetAdd } from '../utils/attemptBudget';
import { assertVerifyMailAllowed } from '../utils/mailBudget';
import { notifyEmailChanged } from './account-notice.service';
import { logger } from '../utils/logger';

/** How many times an account may point itself at a new e-mail address in an hour. */
const MAX_EMAIL_CHANGES_PER_HOUR = 3;

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
      emailVerified: user.emailVerified,
      // Whether there is a password to change (a Google account has none); the password itself never leaves the server.
      hasPassword: !!user.passwordHash,
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
  async updateProfile(
    userId: string,
    data: {
      currentPassword?: string;
      fullName?: string;
      email?: string;
      city?: string;
      area?: string;
      languagePreference?: string;
    },
    ctx: { ip?: string | null } = {}
  ) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { profile: { select: { fullName: true } } },
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
      // A token alone must not be able to re-point the account (and then its password-reset
      // links) at another address: the password is asked for again, when there is one.
      if (user.passwordHash) {
        if (!data.currentPassword) throw new AppError('Enter your password to change the email address', 400, 'PASSWORD_REQUIRED');
        await assertCurrentPassword({ id: user.id, passwordHash: user.passwordHash }, data.currentPassword, ctx);
      }
      // Check if email is already taken
      const existingUser = await prisma.user.findUnique({
        where: { email: newEmail },
      });

      if (existingUser && existingUser.id !== userId) {
        throw new AppError('Email already registered', 400, 'EMAIL_ALREADY_EXISTS');
      }
      // Pointing the account at a new address mails that address: cap how often one account does it and
      // how many such e-mails one inbox gets, so this cannot be used to fill someone else's inbox.
      if ((await budgetAdd(`emailchange:${userId}`, 60 * 60 * 1000)) > MAX_EMAIL_CHANGES_PER_HOUR) {
        throw new AppError('You have changed your e-mail address too many times. Please try again in an hour.', 429, 'RATE_LIMITED');
      }
      await assertVerifyMailAllowed(newEmail);

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
        await queueVerificationEmail(userId);
      } catch (err) {
        logger.error({ err, email: maskEmail(newEmail) }, 'Could not queue the verification e-mail after an address change');
      }
      // The address the account leaves hears of it (when its owner had proven it), so that a change they did not make is noticed.
      void notifyEmailChanged({ email: user.email, emailVerified: user.emailVerified, fullName: user.profile?.fullName }, newEmail);
    }

    // Get or create profile
    const profile = await prisma.userProfile.findUnique({
      where: { userId },
    });

    if (!profile) {
      await prisma.userProfile.create({
        data: {
          userId,
          fullName: data.fullName || 'User',
          city: data.city,
          area: data.area,
          languagePreference: data.languagePreference || 'en',
        },
      });
    } else {
      await prisma.userProfile.update({
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

    return addresses.map((addr) => this.formatAddress(addr));
  }

  /**
   * Add address
   */
  async addAddress(userId: string, data: {
    label?: string;
    addressLine1: string;
    addressLine2?: string;
    houseNumber?: string;
    area: string;
    city: string;
    postalCode?: string;
    landmark?: string;
    latitude?: number;
    longitude?: number;
    communityId?: string;
    isDefault?: boolean;
  }) {
    const communityId = await this.resolveAddressCommunity(userId, data);

    const address = await prisma.$transaction(async (tx) => {
      // A user's very first address is always their default, regardless of what was passed.
      const existingCount = await tx.userAddress.count({ where: { userId } });
      const isDefault = data.isDefault || existingCount === 0;
      if (isDefault) {
        await tx.userAddress.updateMany({ where: { userId, isDefault: true }, data: { isDefault: false } });
      }
      return tx.userAddress.create({
      data: {
        userId,
        label: data.label,
        addressLine1: data.addressLine1,
        addressLine2: data.addressLine2,
        houseNumber: data.houseNumber,
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
    });

    return this.formatAddress(address);
  }

  /**
   * The community an address belongs to decides which sellers deliver there and at
   * what fee: the one the buyer picked (checked against the map pin), otherwise
   * inferred from the pin / area.
   */
  private async resolveAddressCommunity(
    userId: string,
    data: { communityId?: string | null; latitude?: number | null; longitude?: number | null; area?: string | null; city?: string | null }
  ): Promise<string | null> {
    if (data.communityId) {
      const community = await prisma.community.findFirst({ where: { id: data.communityId, isActive: true } });
      if (!community) throw new AppError('Community not found', 404, 'COMMUNITY_NOT_FOUND');
      // The chosen community has to be consistent with the pin, or a buyer could file an
      // address under a community it isn't in and dodge a seller's per-community rules.
      if (data.latitude != null && data.longitude != null) {
        const dist = communityService.distanceToCommunityKm(community, Number(data.latitude), Number(data.longitude));
        if (dist > community.radiusKm) {
          throw new AppError('The pinned location is outside the selected community', 400, 'COMMUNITY_LOCATION_MISMATCH');
        }
      }
      return community.id;
    }
    return communityService.resolveCommunityIdForAddress(
      { area: data.area ?? undefined, city: data.city ?? undefined, latitude: data.latitude ?? undefined, longitude: data.longitude ?? undefined },
      userId
    );
  }

  /**
   * Edit an address (any subset of fields). The community is worked out again whenever
   * the pin, area, city or chosen community changes.
   */
  async updateAddress(
    userId: string,
    addressId: string,
    data: Partial<{
      label: string;
      addressLine1: string;
      addressLine2: string;
      houseNumber: string;
      area: string;
      city: string;
      postalCode: string;
      landmark: string;
      latitude: number;
      longitude: number;
      communityId: string;
      isDefault: boolean;
    }>
  ) {
    const existing = await prisma.userAddress.findFirst({ where: { id: addressId, userId } });
    if (!existing) throw new AppError('Address not found', 404, 'ADDRESS_NOT_FOUND');

    const locationChanged = ['communityId', 'latitude', 'longitude', 'area', 'city'].some((k) => (data as Record<string, unknown>)[k] !== undefined);
    const merged = {
      communityId: data.communityId !== undefined ? data.communityId : null,
      latitude: data.latitude !== undefined ? data.latitude : existing.latitude != null ? Number(existing.latitude) : null,
      longitude: data.longitude !== undefined ? data.longitude : existing.longitude != null ? Number(existing.longitude) : null,
      area: data.area ?? existing.area,
      city: data.city ?? existing.city,
    };
    const communityId = locationChanged ? await this.resolveAddressCommunity(userId, merged) : existing.communityId;

    const updated = await prisma.$transaction(async (tx) => {
      if (data.isDefault === true) {
        await tx.userAddress.updateMany({ where: { userId, isDefault: true, id: { not: addressId } }, data: { isDefault: false } });
      }
      return tx.userAddress.update({
        where: { id: addressId },
        data: {
          label: data.label,
          addressLine1: data.addressLine1,
          addressLine2: data.addressLine2,
          houseNumber: data.houseNumber,
          area: data.area,
          city: data.city,
          postalCode: data.postalCode,
          landmark: data.landmark,
          latitude: data.latitude,
          longitude: data.longitude,
          communityId,
          // An address can be made the default; the default can't be "un-set" without
          // choosing another (there is always one).
          ...(data.isDefault === true ? { isDefault: true } : {}),
        },
      });
    });
    return this.formatAddress(updated);
  }

  /**
   * Delete an address. Past orders keep their own copy of where they went. If it was
   * the default, the most recently added remaining address becomes the default.
   */
  async deleteAddress(userId: string, addressId: string) {
    await prisma.$transaction(async (tx) => {
      const existing = await tx.userAddress.findFirst({ where: { id: addressId, userId } });
      if (!existing) throw new AppError('Address not found', 404, 'ADDRESS_NOT_FOUND');
      await tx.userAddress.delete({ where: { id: addressId } });
      if (existing.isDefault) {
        const next = await tx.userAddress.findFirst({ where: { userId }, orderBy: { createdAt: 'desc' } });
        if (next) await tx.userAddress.update({ where: { id: next.id }, data: { isDefault: true } });
      }
    });
    return { deleted: true };
  }

  private formatAddress(address: {
    id: string;
    label: string | null;
    addressLine1: string;
    addressLine2: string | null;
    houseNumber: string | null;
    area: string;
    city: string;
    postalCode: string | null;
    landmark: string | null;
    isDefault: boolean;
    communityId: string | null;
    latitude: unknown;
    longitude: unknown;
    createdAt: Date;
  }) {
    return {
      id: address.id,
      label: address.label,
      addressLine1: address.addressLine1,
      addressLine2: address.addressLine2,
      houseNumber: address.houseNumber,
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

