import { Router } from 'express';
import { createTicket, getUserTickets } from '../controllers/support.controller';
import { authenticate } from '../middleware/auth.middleware';
import { validate, validateQuery } from '../middleware/validation.middleware';
import { createTicketSchema, getUserTicketsQuerySchema } from '../validators/support.validator';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Create support ticket
router.post('/tickets', validate(createTicketSchema), createTicket);

// Get user tickets
router.get('/tickets', validateQuery(getUserTicketsQuerySchema), getUserTickets);

export default router;

