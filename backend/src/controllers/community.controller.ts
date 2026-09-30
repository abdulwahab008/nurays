import { Request, Response } from 'express';
import { communityService } from '../services/community.service';

export async function getCommunities(_req: Request, res: Response): Promise<void> {
  const data = await communityService.getAllCommunities();
  res.json({ success: true, data });
}

export async function getCommunity(req: Request, res: Response): Promise<void> {
  const { identifier } = req.params;
  const data = await communityService.getCommunity(identifier);
  res.json({ success: true, data });
}

export async function detectCommunity(req: Request, res: Response): Promise<void> {
  const lat = Number(req.body.latitude || req.query.lat);
  const lng = Number(req.body.longitude || req.query.lng);

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
  const userId = (req as any).user?.userId || (req as any).user?.id;
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

