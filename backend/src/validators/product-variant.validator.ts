import { z } from 'zod';

export const createProductVariantSchema = z.object({
  productId: z.string().uuid(),
  name: z.string().min(1).max(200),
  nameUrdu: z.string().max(200).optional().nullable(),
  sku: z.string().max(100).optional().nullable(),
  price: z.number().positive(),
  originalPrice: z.number().positive().optional().nullable(),
  costPrice: z.number().positive().optional().nullable(),
  stockQuantity: z.number().int().min(0).default(0),
  stockThreshold: z.number().int().min(1).default(10),
  weightGrams: z.number().int().positive().optional().nullable(),
  isDefault: z.boolean().default(false),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});

export const updateProductVariantSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  nameUrdu: z.string().max(200).optional().nullable(),
  sku: z.string().max(100).optional().nullable(),
  price: z.number().positive().optional(),
  originalPrice: z.number().positive().optional().nullable(),
  costPrice: z.number().positive().optional().nullable(),
  stockQuantity: z.number().int().min(0).optional(),
  stockThreshold: z.number().int().min(1).optional(),
  weightGrams: z.number().int().positive().optional().nullable(),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export const bulkCreateVariantsSchema = z.object({
  productId: z.string().uuid(),
  variants: z.array(createProductVariantSchema.omit({ productId: true })).min(1).max(20),
});
