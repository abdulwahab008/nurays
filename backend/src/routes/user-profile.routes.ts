import { Router } from 'express';
import {
  getCurrentUserProfile,
  updateProfile,
  updateAvatar,
  getUserAddresses,
  addAddress,
} from '../controllers/user-profile.controller';
import { authenticate } from '../middleware/auth.middleware';
import { validate } from '../middleware/validation.middleware';
import {
  updateProfileSchema,
  updateAvatarSchema,
  addAddressSchema,
} from '../validators/user-profile.validator';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Get current user profile
router.get('/me', getCurrentUserProfile);

// Update profile
router.patch('/me', validate(updateProfileSchema), updateProfile);

// Update avatar
router.post('/me/avatar', validate(updateAvatarSchema), updateAvatar);

// Get user addresses
router.get('/me/addresses', getUserAddresses);

// Add address
router.post('/me/addresses', validate(addAddressSchema), addAddress);

export default router;

