import { z } from 'zod';

export const createTicketSchema = z.object({
  orderId: z.string().uuid('Invalid order ID').optional(),
  category: z.string().min(1, 'Category is required').max(50),
  subject: z.string().min(5, 'Subject must be at least 5 characters').max(200),
  description: z.string().min(10, 'Description must be at least 10 characters').max(5000),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
});

export const getUserTicketsQuerySchema = z.object({
  status: z.enum(['open', 'in_progress', 'resolved', 'closed']).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const addMessageSchema = z.object({
  message: z.string().min(1, 'Message cannot be empty').max(5000),
});

export const adminReplySchema = z.object({
  message: z.string().min(1, 'Message cannot be empty').max(5000),
  status: z.enum(['open', 'in_progress', 'resolved', 'closed']).optional(),
  // An internal note is only seen by admins; a normal reply is sent to the customer.
  internal: z.boolean().optional(),
});

