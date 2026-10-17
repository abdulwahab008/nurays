import { z } from 'zod';

export const createCategorySchema = z.object({
  name: z.string().min(2).max(255),
  nameUrdu: z.string().max(255).optional(),
  description: z.string().max(1000).optional(),
  iconUrl: z.string().max(500).optional().nullable().or(z.literal('')), // Can be URL, emoji, or icon name
  parentId: z.string().uuid().optional().nullable().or(z.literal('')),
  productType: z.enum(['frozen', 'fresh', 'ready_to_eat', 'ready_to_cook']).optional().nullable(),
  sortOrder: z.number().int().min(-1_000_000).max(1_000_000).optional(),
  isActive: z.boolean().optional(),
}); // unknown keys are dropped: the update is spread into Prisma, so nothing but these fields may reach it

export const updateCategorySchema = createCategorySchema.partial();

