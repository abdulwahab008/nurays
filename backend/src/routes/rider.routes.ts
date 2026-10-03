import { Router } from 'express';
import {
  getAvailableDeliveries,
  getMyDeliveries,
  claimDelivery,
  releaseDelivery,
  updateDeliveryStatus,
  updateRiderLocation,
  getRiderProfile,
  toggleDutyStatus,
  getRiderEarnings,
  getMyApplication,
  submitApplication,
} from '../controllers/rider.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { validate } from '../middleware/validation.middleware';
import { locationLimiter } from '../middleware/rateLimiter';
import { updateDeliveryStatusSchema, riderApplicationSchema } from '../validators/rider.validator';
import { submissionLimiter } from '../middleware/rateLimiter';

const router = Router();

router.use(authenticate);
router.use(authorize('rider'));

router.get('/me', getRiderProfile);
router.get('/me/earnings', getRiderEarnings);
router.get('/me/application', getMyApplication);
router.put('/me/application', submissionLimiter, validate(riderApplicationSchema), submitApplication);
router.patch('/duty-status', toggleDutyStatus);
router.get('/deliveries/available', getAvailableDeliveries);
router.get('/deliveries/mine', getMyDeliveries);
router.post('/deliveries/:id/claim', claimDelivery);
router.post('/deliveries/:id/release', releaseDelivery);
router.patch('/deliveries/:id/status', validate(updateDeliveryStatusSchema), updateDeliveryStatus);
router.post('/deliveries/:id/location', locationLimiter, updateRiderLocation);

export default router;
