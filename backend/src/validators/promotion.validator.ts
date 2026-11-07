import { z } from 'zod';

/**
 * The most a fixed "Rs off" discount may take when there is no minimum order. With a minimum, the discount may not be
 * more than the minimum: either way one code can never make every order free (a Rs 99,999 code with no minimum did).
 */
export const MAX_FIXED_DISCOUNT_WITHOUT_MINIMUM = 5000;

const fixedDiscountFits = (discountValue: number, minOrderAmount: number) =>
  discountValue <= (minOrderAmount > 0 ? minOrderAmount : MAX_FIXED_DISCOUNT_WITHOUT_MINIMUM);
const FIXED_TOO_BIG = `A fixed discount can be at most the minimum order, or Rs ${MAX_FIXED_DISCOUNT_WITHOUT_MINIMUM} when there is no minimum`;

export const validatePromotionCodeSchema = z.object({
  code: z.string().min(1, 'Promotion code is required'),
  cartTotal: z.number().min(0, 'Cart total must be positive').max(10_000_000),
});

export const createPromotionSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  code: z.string().min(1, 'Promo code is required').max(50).transform((s) => s.toUpperCase().replace(/\s/g, '')),
  description: z.string().max(500).optional(),
  discountType: z.enum(['percentage', 'fixed']),
  discountValue: z.number().min(0, 'Discount value must be 0 or more').max(10_000_000),
  maxDiscountAmount: z.number().min(0).max(10_000_000).optional().nullable(),
  minOrderAmount: z.number().min(0).max(10_000_000).default(0),
  usageLimitTotal: z.number().int().min(1).max(10_000_000).optional().nullable(),
  usageLimitPerUser: z.number().int().min(1).max(10_000).default(1),
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
}).refine((data) => data.discountType !== 'percentage' || data.discountValue <= 100, {
  message: 'Percentage discount cannot exceed 100',
  path: ['discountValue'],
}).refine((data) => data.discountType !== 'fixed' || fixedDiscountFits(data.discountValue, data.minOrderAmount), {
  message: FIXED_TOO_BIG,
  path: ['discountValue'],
});

export const updatePromotionSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  code: z.string().min(1).max(50).optional().transform((s) => s == null ? undefined : s.toUpperCase().replace(/\s/g, '')),
  description: z.string().max(500).optional().nullable(),
  discountType: z.enum(['percentage', 'fixed']).optional(),
  discountValue: z.number().min(0).max(10_000_000).optional(),
  maxDiscountAmount: z.number().min(0).max(10_000_000).optional().nullable(),
  minOrderAmount: z.number().min(0).max(10_000_000).optional(),
  usageLimitTotal: z.number().int().min(1).max(10_000_000).optional().nullable(),
  usageLimitPerUser: z.number().int().min(1).max(10_000).optional(),
  validFrom: z.coerce.date().optional(),
  validUntil: z.coerce.date().optional(),
  applyTo: z.enum(['all', 'selected']).optional(),
  productIds: z.array(z.string().uuid()).optional(),
  isActive: z.boolean().optional(),
}).refine((data) => {
  if (data.validFrom != null && data.validUntil != null) return data.validUntil > data.validFrom;
  return true;
}, { message: 'End date must be after start date', path: ['validUntil'] }).refine((data) => {
  if (data.discountType === 'percentage' && data.discountValue != null) return data.discountValue <= 100;
  return true;
}, { message: 'Percentage discount cannot exceed 100', path: ['discountValue'] }).refine((data) => {
  // Only checked when the change names all three; the service sees the stored values for the rest.
  if (data.discountType === 'fixed' && data.discountValue != null && data.minOrderAmount != null) return fixedDiscountFits(data.discountValue, data.minOrderAmount);
  return true;
}, { message: FIXED_TOO_BIG, path: ['discountValue'] });

