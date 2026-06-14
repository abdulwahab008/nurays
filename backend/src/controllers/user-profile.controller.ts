import { Request, Response } from 'express';
import userProfileService from '../services/user-profile.service';
import { AppError } from '../middleware/errorHandler';

export const getCurrentUserProfile = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
  }

  const profile = await userProfileService.getCurrentUserProfile(req.user.userId);

  res.status(200).json({
    success: true,
    data: profile,
  });
};

export const updateProfile = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
  }

  const updatedProfile = await userProfileService.updateProfile(req.user.userId, req.body);

  res.status(200).json({
    success: true,
    data: updatedProfile,
    message: 'Profile updated successfully',
  });
};

export const updateAvatar = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
  }

  const { avatarUrl } = req.body;
  const result = await userProfileService.updateAvatar(req.user.userId, avatarUrl);

  res.status(200).json({
    success: true,
    data: result,
    message: 'Avatar updated successfully',
  });
};

export const getUserAddresses = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
  }

  const addresses = await userProfileService.getUserAddresses(req.user.userId);

  res.status(200).json({
    success: true,
    data: addresses,
  });
};

export const addAddress = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
  }

  const address = await userProfileService.addAddress(req.user.userId, req.body);

  res.status(201).json({
    success: true,
    data: address,
    message: 'Address added successfully',
  });
};


export const getReferralInfo = async (req: Request, res: Response) => {
  if (!req.user) throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
  const prisma = (await import('../config/database')).default;
  const { randomBytes } = await import('crypto');
  const userId = req.user.userId;

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { referralCode: true } });
  let code = user?.referralCode ?? null;

  // Backfill a code for users created before referral codes existed.
  if (!code) {
    for (let i = 0; i < 5; i++) {
      const candidate = 'NRY' + randomBytes(4).toString('hex').toUpperCase().slice(0, 6);
      const clash = await prisma.user.findUnique({ where: { referralCode: candidate } });
      if (!clash) {
        await prisma.user.update({ where: { id: userId }, data: { referralCode: candidate } });
        code = candidate;
        break;
      }
    }
  }

  const invited = await prisma.user.count({ where: { referredBy: userId } });
  const rewardPkr = Number(process.env.REFERRAL_CREDIT_PKR ?? 100);
  res.status(200).json({ success: true, data: { code, invited, rewardPkr } });
};
