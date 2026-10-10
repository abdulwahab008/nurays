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
import { auditWrites } from '../middleware/audit';
import { ifStaffRequire, requirePermission } from '../middleware/staff';
import { validate } from '../middleware/validation.middleware';
import hubService from '../services/hub.service';
import { AppError } from '../middleware/errorHandler';
import { hubsManagedBy } from '../services/admin-places.service';
import { batchIntakeSchema, batchStatusSchema, temperatureProbeSchema, assignManagerSchema } from '../validators/hub.validator';

const router = Router();

// Public routes
router.get('/', getHubCenters);

// A hub manager's own hubs (their console)
router.get('/mine', authenticate, authorize('hub_manager', 'admin'), async (req: Request, res: Response) => {
  res.status(200).json({ success: true, data: await hubsManagedBy(req.user!.userId) });
});
router.get('/:id/inventory', getHubInventory);

// A hub manager may only operate the hub they manage (admins: any hub).
const hubAccess = (req: Request, _res: Response, next: NextFunction) => {
  if (!req.user) {
    next(new AppError('Authentication required', 401, 'AUTH_REQUIRED'));
    return;
  }
  hubService.assertHubAccess(req.params.id, req.user).then(() => next(), next);
};

// Hub operations & admin routes
// Staff may look at a hub; changing its stock or temperature log is an operations action.
const staffWrites = (req: Request, res: Response, next: NextFunction) => (req.method === 'GET' ? next() : ifStaffRequire('ops.write')(req, res, next));
const ops = [authenticate, authorize('admin', 'hub_manager'), staffWrites, auditWrites('hub'), hubAccess];
router.get('/:id/stats', ...ops, getHubStats);
router.get('/:id/batches', ...ops, getHubBatches);
router.post('/:id/intake', ...ops, validate(batchIntakeSchema), recordBatchIntake);
router.patch('/:id/batches/:batchId/status', ...ops, validate(batchStatusSchema), updateBatchStatus);
router.post('/:id/temperature-logs', ...ops, validate(temperatureProbeSchema), recordTemperatureProbe);
router.get('/:id/temperature-logs', ...ops, getTemperatureLogs);

// Admin: assign (or clear) a hub's manager
router.put('/:id/manager', authenticate, authorize('admin'), requirePermission('ops.write'), auditWrites('admin'), validate(assignManagerSchema), assignHubManager);

export default router;
