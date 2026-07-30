import { z } from 'zod';

export const approveRejectSellerSchema = z.object({
  approved: z.boolean(),
  notes: z.string().optional(),
});

export const moderateProductSchema = z.object({
  approved: z.boolean(),
  reason: z.string().optional(),
});

export const updateSellerStatusSchema = z.object({
  status: z.enum(['active', 'suspended']),
});

export const completePayoutSchema = z.object({
  transactionId: z.string().optional(),
});

export const failPayoutSchema = z.object({
  reason: z.string().min(1, 'A reason is required'),
});

export const updateSettingsSchema = z.object({
  platformName: z.string().min(1).optional(),
  supportEmail: z.string().email().optional(),
  supportPhone: z.string().min(1).optional(),
  commissionRate: z.number().min(0).max(100).optional(),
  minPayoutAmount: z.number().min(0).optional(),
});

