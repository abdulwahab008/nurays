import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import * as profitLossController from '../controllers/profit-loss.controller';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Get seller P&L statement
router.get('/', profitLossController.getProfitLoss);

// Get product profitability
router.get('/product/:productId', profitLossController.getProductProfitability);

export default router;
