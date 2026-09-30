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
} from '../controllers/hub.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';

const router = Router();

// Public routes
router.get('/', getHubCenters);
router.get('/:id/inventory', getHubInventory);

// Hub operations & admin routes
router.get('/:id/stats', authenticate, authorize('admin', 'hub_manager'), getHubStats);
router.get('/:id/batches', authenticate, authorize('admin', 'hub_manager'), getHubBatches);
router.post('/:id/intake', authenticate, authorize('admin', 'hub_manager'), recordBatchIntake);
router.patch('/:id/batches/:batchId/status', authenticate, authorize('admin', 'hub_manager'), updateBatchStatus);
router.post('/:id/temperature-logs', authenticate, authorize('admin', 'hub_manager'), recordTemperatureProbe);
router.get('/:id/temperature-logs', authenticate, authorize('admin', 'hub_manager'), getTemperatureLogs);

export default router;
