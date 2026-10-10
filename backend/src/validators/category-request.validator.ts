import { z } from 'zod';

const name = z.string().trim().min(2).max(120);

export const createCategoryRequestSchema = z
  .object({
    productType: z.enum(['frozen', 'fresh', 'ready_to_eat', 'ready_to_cook']),
    name: name.optional(),
    suggestedName: name.optional(),
    nameUrdu: z.string().trim().max(120).optional(),
    suggestedNameUrdu: z.string().trim().max(120).optional(),
    description: z.string().trim().max(1000).optional(),
    parentCategoryId: z.string().uuid().optional().nullable(),
  })
  .refine((d) => !!(d.name || d.suggestedName), { message: 'A category name is required', path: ['name'] });

export const rejectCategoryRequestSchema = z.object({ reason: z.string().trim().max(500).optional() });
