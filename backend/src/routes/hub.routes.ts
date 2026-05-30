import { Router } from 'express';
import { getHubCenters, getHubInventory } from '../controllers/hub.controller';

const router = Router();

// Get hub centers (public)
router.get('/', getHubCenters);

// Get hub inventory (public)
router.get('/:id/inventory', getHubInventory);

export default router;

