import prisma from '../config/database';
import { AppError } from '../middleware/errorHandler';

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

    // Update user email if provided
    if (data.email && data.email !== user.email) {
      // Check if email is already taken
      const existingUser = await prisma.user.findUnique({
        where: { email: data.email },
      });

      if (existingUser && existingUser.id !== userId) {
        throw new AppError('Email already registered', 400, 'EMAIL_ALREADY_EXISTS');
      }

      await prisma.user.update({
        where: { id: userId },
        data: { email: data.email },
      });
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
    isDefault?: boolean;
  }) {
    // If this is set as default, unset other defaults
    if (data.isDefault) {
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
        isDefault: data.isDefault ?? false,
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

