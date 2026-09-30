import { Router } from 'express';
import {
  getFavorites,
  addFavorite,
  removeFavorite,
  checkFavorite,
} from '../controllers/favorite.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

router.use(authenticate);

router.get('/', getFavorites);
router.post('/:sellerId', addFavorite);
router.delete('/:sellerId', removeFavorite);
router.get('/check/:sellerId', checkFavorite);

export default router;
