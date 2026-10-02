import { Router } from 'express';
import {
  getAvailableDeliveries,
  getMyDeliveries,
  claimDelivery,
  updateDeliveryStatus,
  updateRiderLocation,
  getRiderProfile,
  toggleDutyStatus,
  getRiderEarnings,
} from '../controllers/rider.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { validate } from '../middleware/validation.middleware';
import { locationLimiter } from '../middleware/rateLimiter';
import { updateDeliveryStatusSchema } from '../validators/rider.validator';

const router = Router();

router.use(authenticate);
router.use(authorize('rider'));

router.get('/me', getRiderProfile);
router.get('/me/earnings', getRiderEarnings);
router.patch('/duty-status', toggleDutyStatus);
router.get('/deliveries/available', getAvailableDeliveries);
router.get('/deliveries/mine', getMyDeliveries);
router.post('/deliveries/:id/claim', claimDelivery);
router.patch('/deliveries/:id/status', validate(updateDeliveryStatusSchema), updateDeliveryStatus);
router.post('/deliveries/:id/location', locationLimiter, updateRiderLocation);

export default router;
