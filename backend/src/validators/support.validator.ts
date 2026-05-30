import { z } from 'zod';

export const createTicketSchema = z.object({
  orderId: z.string().uuid('Invalid order ID').optional(),
  category: z.string().min(1, 'Category is required'),
  subject: z.string().min(5, 'Subject must be at least 5 characters'),
  description: z.string().min(10, 'Description must be at least 10 characters'),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
});

export const getUserTicketsQuerySchema = z.object({
  status: z.enum(['open', 'in_progress', 'resolved', 'closed']).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

