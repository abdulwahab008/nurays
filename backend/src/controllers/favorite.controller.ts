import { Request, Response } from 'express';
import { favoriteService } from '../services/favorite.service';
import { currentUserId } from '../middleware/auth.middleware';

export async function getFavorites(req: Request, res: Response) {
  const userId = currentUserId(req);
  const lat = req.query.lat ? Number(req.query.lat) : undefined;
  const lng = req.query.lng ? Number(req.query.lng) : undefined;

  const data = await favoriteService.getFavorites(userId, lat, lng);
  res.json({ success: true, data });
}

export async function addFavorite(req: Request, res: Response) {
  const userId = currentUserId(req);
  const { sellerId } = req.params;

  const data = await favoriteService.addFavorite(userId, sellerId);
  res.json({ success: true, data });
}

export async function removeFavorite(req: Request, res: Response) {
  const userId = currentUserId(req);
  const { sellerId } = req.params;

  const data = await favoriteService.removeFavorite(userId, sellerId);
  res.json({ success: true, data });
}

export async function checkFavorite(req: Request, res: Response) {
  const userId = currentUserId(req);
  const { sellerId } = req.params;

  const data = await favoriteService.checkFavorite(userId, sellerId);
  res.json({ success: true, data });
}
