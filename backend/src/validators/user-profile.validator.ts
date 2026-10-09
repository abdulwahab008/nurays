import { z } from 'zod';

export const updateProfileSchema = z.object({
  fullName: z.string().min(2, 'Full name must be at least 2 characters').max(120).optional(),
  email: z.string().email('Invalid email address').max(200).optional(),
  // Required when the email changes and the account has a password (see updateProfile).
  currentPassword: z.string().max(200).optional(),
  city: z.string().max(100).optional(),
  area: z.string().max(100).optional(),
  languagePreference: z.enum(['en', 'ur']).optional(),
});

export const updateAvatarSchema = z.object({
  avatarUrl: z.string().url('Invalid avatar URL'),
});

export const addAddressSchema = z.object({
  label: z.string().max(50).optional(),
  addressLine1: z.string().min(5, 'Address line 1 is required').max(300),
  addressLine2: z.string().max(300).optional(),
  area: z.string().min(2, 'Area is required').max(100),
  city: z.string().min(2, 'City is required').max(100),
  postalCode: z.string().max(20).optional(),
  landmark: z.string().max(300).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  communityId: z.string().min(1).optional(),
  isDefault: z.boolean().optional(),
});

// Any subset of the address fields (e.g. just { isDefault: true }).
export const updateAddressSchema = addAddressSchema.partial().refine((d) => Object.keys(d).length > 0, {
  message: 'Nothing to update',
});

// Closing the account: the word DELETE typed on purpose, and the password when the account has one.
export const deleteAccountSchema = z.object({
  confirm: z.literal('DELETE', { message: 'Type DELETE to confirm' }),
  password: z.string().max(200).optional(),
});
