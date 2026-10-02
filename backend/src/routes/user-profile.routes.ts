import { Router } from 'express';
import {
  getCurrentUserProfile,
  updateProfile,
  updateAvatar,
  getUserAddresses,
  addAddress,
  updateAddress,
  deleteAddress,
} from '../controllers/user-profile.controller';
import { authenticate } from '../middleware/auth.middleware';
import { validate } from '../middleware/validation.middleware';
import {
  updateProfileSchema,
  updateAvatarSchema,
  addAddressSchema,
  updateAddressSchema,
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

// Edit / set default, delete
router.patch('/me/addresses/:id', validate(updateAddressSchema), updateAddress);
router.delete('/me/addresses/:id', deleteAddress);

export default router;

