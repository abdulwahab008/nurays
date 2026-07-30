import { z } from 'zod';

export const registerSellerSchema = z.object({
  businessName: z.string().min(3, 'Business name must be at least 3 characters'),
  businessNameUrdu: z.string().optional(),
  description: z.string().optional(),
  kitchenVideoUrl: z.string().url('Invalid video URL').optional(),
  coverImageUrl: z.string().url('Invalid image URL').optional(),
  cnicFrontUrl: z.string().url('Invalid image URL').optional(),
  cnicBackUrl: z.string().url('Invalid image URL').optional(),
  kitchenPhotoUrls: z.array(z.string().url('Invalid image URL')).optional(),
});

export const updateSellerSchema = z.object({
  businessName: z.string().min(1, 'Business name is required').optional(),
  businessNameUrdu: z.string().optional(),
  description: z.string().optional(),
  kitchenVideoUrl: z.string().optional(),
  coverImageUrl: z.string().optional(),
  jazzcashNumber: z.string().optional(),
  easypaisaNumber: z.string().optional(),
  bankAccountName: z.string().optional(),
  bankAccountNumber: z.string().optional(),
  bankName: z.string().optional(),
  lowStockThreshold: z.number().int().min(0).optional(),
  enableStockAlerts: z.boolean().optional(),
  freeDeliveryAreas: z.array(z.string().min(1)).optional(),
  freeDeliveryRadiusKm: z.number().min(0).optional().nullable(),
  latitude: z.number().min(-90).max(90).optional().nullable(),
  longitude: z.number().min(-180).max(180).optional().nullable(),
  deliveryFeeType: z.enum(['fixed', 'distance']).optional().nullable(),
  deliveryFeeFixed: z.number().int().min(0).optional().nullable(),
  deliveryFeeBase: z.number().int().min(0).optional().nullable(),
  deliveryFeePerKm: z.number().min(0).optional().nullable(),
});

export const requestPayoutSchema = z.object({
  amount: z.number().min(100, 'Minimum payout amount is 100 PKR'),
  payoutMethod: z.enum(['bank_transfer', 'jazzcash', 'easypaisa']),
  accountNumber: z.string().min(1, 'Account number is required'),
});

