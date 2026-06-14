import { Router } from 'express';
import {
  getAvailableDeliveries,
  getMyDeliveries,
  acceptDelivery,
  updateDeliveryStatus,
  pushLocation,
} from '../controllers/rider.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';

const router = Router();

router.use(authenticate);
router.use(authorize('rider'));

router.get('/deliveries/available', getAvailableDeliveries);
router.get('/deliveries/mine', getMyDeliveries);
router.post('/deliveries/:orderId/accept', acceptDelivery);
router.patch('/deliveries/:orderId/status', updateDeliveryStatus);
router.post('/location', pushLocation);

export default router;
