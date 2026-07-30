import { Router } from 'express';
import { createTicket, getUserTickets, getTicketDetail, addCustomerMessage } from '../controllers/support.controller';
import { authenticate } from '../middleware/auth.middleware';
import { validate, validateQuery } from '../middleware/validation.middleware';
import { createTicketSchema, getUserTicketsQuerySchema, addMessageSchema } from '../validators/support.validator';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Create support ticket
router.post('/tickets', validate(createTicketSchema), createTicket);

// Get user tickets
router.get('/tickets', validateQuery(getUserTicketsQuerySchema), getUserTickets);

// Get / reply to a single ticket (must own it)
router.get('/tickets/:id', getTicketDetail);
router.post('/tickets/:id/messages', validate(addMessageSchema), addCustomerMessage);

export default router;

