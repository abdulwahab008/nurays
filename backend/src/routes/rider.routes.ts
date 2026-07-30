import { Router } from 'express';
import {
  getAvailableDeliveries,
  getMyDeliveries,
  claimDelivery,
  updateDeliveryStatus,
} from '../controllers/rider.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { validate } from '../middleware/validation.middleware';
import { updateDeliveryStatusSchema } from '../validators/rider.validator';

const router = Router();

router.use(authenticate);
router.use(authorize('rider'));

router.get('/deliveries/available', getAvailableDeliveries);
router.get('/deliveries/mine', getMyDeliveries);
router.post('/deliveries/:id/claim', claimDelivery);
router.patch('/deliveries/:id/status', validate(updateDeliveryStatusSchema), updateDeliveryStatus);

export default router;
