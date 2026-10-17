import { z } from 'zod';

export const createProductVariantSchema = z.object({
  productId: z.string().uuid(),
  name: z.string().min(1).max(200),
  nameUrdu: z.string().max(200).optional().nullable(),
  sku: z.string().max(100).optional().nullable(),
  price: z.number().positive().max(1_000_000),
  originalPrice: z.number().positive().max(1_000_000).optional().nullable(),
  costPrice: z.number().positive().max(1_000_000).optional().nullable(),
  stockQuantity: z.number().int().min(0).max(1_000_000).default(0),
  stockThreshold: z.number().int().min(1).max(1_000_000).default(10),
  weightGrams: z.number().int().positive().max(1_000_000).optional().nullable(),
  isDefault: z.boolean().default(false),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().min(-1_000_000).max(1_000_000).default(0),
});

export const updateProductVariantSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  nameUrdu: z.string().max(200).optional().nullable(),
  sku: z.string().max(100).optional().nullable(),
  price: z.number().positive().max(1_000_000).optional(),
  originalPrice: z.number().positive().max(1_000_000).optional().nullable(),
  costPrice: z.number().positive().max(1_000_000).optional().nullable(),
  stockQuantity: z.number().int().min(0).max(1_000_000).optional(),
  stockThreshold: z.number().int().min(1).max(1_000_000).optional(),
  weightGrams: z.number().int().positive().max(1_000_000).optional().nullable(),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(-1_000_000).max(1_000_000).optional(),
});

export const bulkCreateVariantsSchema = z.object({
  productId: z.string().uuid(),
  variants: z.array(createProductVariantSchema.omit({ productId: true })).min(1).max(20),
});
