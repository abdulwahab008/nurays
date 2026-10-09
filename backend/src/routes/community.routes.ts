import { Router } from 'express';
import {
  getCommunities,
  getCommunity,
  detectCommunity,
  setBuyerCommunity,
} from '../controllers/community.controller';
import { authenticate } from '../middleware/auth.middleware';
import { validate, validateQuery } from '../middleware/validation.middleware';
import { detectCommunityBodySchema, detectCommunityQuerySchema, setPrimaryCommunitySchema } from '../validators/community.validator';

const router = Router();

// Public community routes
router.get('/', getCommunities);
router.post('/detect', validate(detectCommunityBodySchema), detectCommunity);
router.get('/detect', validateQuery(detectCommunityQuerySchema), detectCommunity);
router.get('/:identifier', getCommunity);

// Authenticated buyer route to set primary community
router.post('/me/primary', authenticate, validate(setPrimaryCommunitySchema), setBuyerCommunity);

export default router;
