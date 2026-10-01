import { Router } from 'express';
import {
  getHubCenters,
  getHubInventory,
  recordBatchIntake,
  getHubBatches,
  updateBatchStatus,
  recordTemperatureProbe,
  getTemperatureLogs,
  getHubStats,
  assignHubManager,
} from '../controllers/hub.controller';
import { NextFunction, Request, Response } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { validate } from '../middleware/validation.middleware';
import hubService from '../services/hub.service';
import { batchIntakeSchema, batchStatusSchema, temperatureProbeSchema, assignManagerSchema } from '../validators/hub.validator';

const router = Router();

// Public routes
router.get('/', getHubCenters);
router.get('/:id/inventory', getHubInventory);

// A hub manager may only operate the hub they manage (admins: any hub).
const hubAccess = (req: Request, _res: Response, next: NextFunction) => {
  hubService.assertHubAccess(req.params.id, req.user as any).then(() => next(), next);
};

// Hub operations & admin routes
const ops = [authenticate, authorize('admin', 'hub_manager'), hubAccess];
router.get('/:id/stats', ...ops, getHubStats);
router.get('/:id/batches', ...ops, getHubBatches);
router.post('/:id/intake', ...ops, validate(batchIntakeSchema), recordBatchIntake);
router.patch('/:id/batches/:batchId/status', ...ops, validate(batchStatusSchema), updateBatchStatus);
router.post('/:id/temperature-logs', ...ops, validate(temperatureProbeSchema), recordTemperatureProbe);
router.get('/:id/temperature-logs', ...ops, getTemperatureLogs);

// Admin: assign (or clear) a hub's manager
router.put('/:id/manager', authenticate, authorize('admin'), validate(assignManagerSchema), assignHubManager);

export default router;
