import { Router } from 'express';
import {
  getCommunities,
  getCommunity,
  detectCommunity,
  setBuyerCommunity,
} from '../controllers/community.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

// Public community routes
router.get('/', getCommunities);
router.post('/detect', detectCommunity);
router.get('/detect', detectCommunity);
router.get('/:identifier', getCommunity);

// Authenticated buyer route to set primary community
router.post('/me/primary', authenticate, setBuyerCommunity);

export default router;
