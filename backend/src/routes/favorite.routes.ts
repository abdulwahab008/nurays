import { Router } from 'express';
import {
  getFavorites,
  getFavoriteIds,
  addFavorite,
  removeFavorite,
} from '../controllers/favorite.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

router.use(authenticate);

router.get('/', getFavorites);
router.get('/ids', getFavoriteIds);
router.post('/', addFavorite);
router.delete('/:productId', removeFavorite);

export default router;
