import { z } from 'zod';

export const approveRejectSellerSchema = z.object({
  approved: z.boolean(),
  notes: z.string().optional(),
});

export const moderateProductSchema = z.object({
  approved: z.boolean(),
  reason: z.string().optional(),
});

