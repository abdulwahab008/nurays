import { z } from 'zod';

export const validatePromotionCodeSchema = z.object({
  code: z.string().min(1, 'Promotion code is required'),
  cartTotal: z.number().min(0, 'Cart total must be positive'),
});

export const createPromotionSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  code: z.string().min(1, 'Promo code is required').max(50).transform((s) => s.toUpperCase().replace(/\s/g, '')),
  description: z.string().max(500).optional(),
  discountType: z.enum(['percentage', 'fixed']),
  discountValue: z.number().min(0, 'Discount value must be 0 or more'),
  maxDiscountAmount: z.number().min(0).optional().nullable(),
  minOrderAmount: z.number().min(0).default(0),
  usageLimitTotal: z.number().int().min(1).optional().nullable(),
  usageLimitPerUser: z.number().int().min(1).default(1),
  validFrom: z.coerce.date(),
  validUntil: z.coerce.date(),
  applyTo: z.enum(['all', 'selected']).optional().default('all'),
  productIds: z.array(z.string().uuid()).optional().default([]),
}).refine((data) => data.validUntil > data.validFrom, {
  message: 'End date must be after start date',
  path: ['validUntil'],
}).refine((data) => data.applyTo !== 'selected' || (data.productIds && data.productIds.length > 0), {
  message: 'When applying to selected products, at least one product must be chosen',
  path: ['productIds'],
});

export const updatePromotionSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  code: z.string().min(1).max(50).optional().transform((s) => s == null ? undefined : s.toUpperCase().replace(/\s/g, '')),
  description: z.string().max(500).optional().nullable(),
  discountType: z.enum(['percentage', 'fixed']).optional(),
  discountValue: z.number().min(0).optional(),
  maxDiscountAmount: z.number().min(0).optional().nullable(),
  minOrderAmount: z.number().min(0).optional(),
  usageLimitTotal: z.number().int().min(1).optional().nullable(),
  usageLimitPerUser: z.number().int().min(1).optional(),
  validFrom: z.coerce.date().optional(),
  validUntil: z.coerce.date().optional(),
  applyTo: z.enum(['all', 'selected']).optional(),
  productIds: z.array(z.string().uuid()).optional(),
}).refine((data) => {
  if (data.validFrom != null && data.validUntil != null) return data.validUntil > data.validFrom;
  return true;
}, { message: 'End date must be after start date', path: ['validUntil'] });

