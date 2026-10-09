import { Request, Response } from 'express';
import userProfileService from '../services/user-profile.service';
import { AppError } from '../middleware/errorHandler';
import { deleteOwnAccount } from '../services/account-deletion.service';

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


export const updateAddress = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
  }
  const address = await userProfileService.updateAddress(req.user.userId, req.params.id, req.body);
  res.status(200).json({ success: true, data: address, message: 'Address updated' });
};

export const deleteAddress = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
  }
  await userProfileService.deleteAddress(req.user.userId, req.params.id);
  res.status(200).json({ success: true, message: 'Address deleted' });
};

export const deleteOwnAccountHandler = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
  }
  const result = await deleteOwnAccount(req.user.userId, req.body?.password);
  res.status(200).json({ success: true, data: result, message: 'Your account has been closed' });
};
