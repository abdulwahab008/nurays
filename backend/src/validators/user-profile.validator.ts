import { z } from 'zod';

export const updateProfileSchema = z.object({
  fullName: z.string().min(2, 'Full name must be at least 2 characters').optional(),
  email: z.string().email('Invalid email address').optional(),
  city: z.string().optional(),
  area: z.string().optional(),
  languagePreference: z.enum(['en', 'ur']).optional(),
});

export const updateAvatarSchema = z.object({
  avatarUrl: z.string().url('Invalid avatar URL'),
});

export const addAddressSchema = z.object({
  label: z.string().optional(),
  addressLine1: z.string().min(5, 'Address line 1 is required'),
  addressLine2: z.string().optional(),
  area: z.string().min(2, 'Area is required'),
  city: z.string().min(2, 'City is required'),
  postalCode: z.string().optional(),
  landmark: z.string().optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  isDefault: z.boolean().optional(),
});

