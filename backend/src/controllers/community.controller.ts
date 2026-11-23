import { Request, Response } from 'express';
import { qstr } from '../utils/query';
import { communityService } from '../services/community.service';
import { kitchensDeliveringTo } from '../services/product.service';
import { currentUserId } from '../middleware/auth.middleware';

export async function getCommunities(_req: Request, res: Response): Promise<void> {
  const data = await communityService.getAllCommunities();
  res.json({ success: true, data });
}

export async function getCommunity(req: Request, res: Response): Promise<void> {
  const { identifier } = req.params;
  const lat = Number(qstr(req.query.customerLat));
  const lng = Number(qstr(req.query.customerLng));
  const customer = Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
  const data = await communityService.getCommunity(identifier, customer);
  // The kitchens a customer here can order from: the area's own, then other areas' that deliver here (as the dish list).
  const { measuredFrom, ...area } = data;
  const others = await kitchensDeliveringTo(area.id, measuredFrom);
  const deliveringHere = [...area.sellers, ...(await communityService.sellerCards(others, measuredFrom))];
  res.json({ success: true, data: { ...area, deliveringHere } });
}

export async function detectCommunity(req: Request, res: Response): Promise<void> {
  // validateQuery has already turned lat/lng into numbers on a GET; a POST carries them in the body.
  const num = (v: unknown) => (typeof v === 'number' ? v : Number(qstr(v)));
  const lat = req.body?.latitude != null ? Number(req.body.latitude) : num(req.query.lat);
  const lng = req.body?.longitude != null ? Number(req.body.longitude) : num(req.query.lng);

  if (isNaN(lat) || isNaN(lng)) {
    res.status(400).json({
      success: false,
      message: 'Valid latitude and longitude numbers are required',
    });
    return;
  }

  const data = await communityService.detectCommunity(lat, lng);
  res.json({ success: true, data });
}

export async function setBuyerCommunity(req: Request, res: Response): Promise<void> {
  const userId = currentUserId(req);
  const { communityId } = req.body;

  if (!communityId) {
    res.status(400).json({
      success: false,
      message: 'communityId is required',
    });
    return;
  }

  const data = await communityService.setBuyerCommunity(userId, communityId);
  res.json({ success: true, data });
}

