import { z } from 'zod';

export const createCategorySchema = z.object({
  name: z.string().min(2).max(255),
  nameUrdu: z.string().max(255).optional(),
  description: z.string().max(1000).optional(),
  iconUrl: z.string().max(500).optional().nullable().or(z.literal('')), // Can be URL, emoji, or icon name
  parentId: z.string().uuid().optional().nullable().or(z.literal('')),
  productType: z.enum(['frozen', 'fresh', 'ready_to_eat', 'ready_to_cook']).optional().nullable(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
}).passthrough(); // Allow additional fields

export const updateCategorySchema = createCategorySchema.partial();

