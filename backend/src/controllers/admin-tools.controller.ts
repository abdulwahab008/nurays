import { Request, Response } from 'express';
import { AppError } from '../middleware/errorHandler';
import { listUsers, setUserStatus, setRiderStatus, makeHubManager, removeHubManager, listHubManagers } from '../services/admin-people.service';
import { listCommunitiesForAdmin, createCommunity, updateCommunity, listHubsForAdmin, createHub, updateHub } from '../services/admin-places.service';
import hubService from '../services/hub.service';
import promotionService from '../services/promotion.service';
import realtimeOrderService from '../services/realtime-order.service';

/** Admin tools: people, places and platform promo codes. */

const adminId = (req: Request) => {
  if (!req.user) throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
  return req.user.userId;
};
const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

// ---- people ----

export const getUsers = async (req: Request, res: Response) => {
  const data = await listUsers({
    search: str(req.query.search),
    type: str(req.query.type),
    status: str(req.query.status),
    page: Number(req.query.page) || 1,
    limit: Number(req.query.limit) || 25,
  });
  res.status(200).json({ success: true, data });
};

export const updateUserStatus = async (req: Request, res: Response) => {
  const data = await setUserStatus(adminId(req), req.params.id, req.body.status);
  res.status(200).json({ success: true, data, message: data.status === 'suspended' ? 'Account suspended' : 'Account reactivated' });
};

export const updateRiderStatus = async (req: Request, res: Response) => {
  const data = await setRiderStatus(req.params.id, req.body.status);
  // Jobs the rider hadn't picked up yet are back in the pool for other riders.
  for (const job of data.releasedJobs) realtimeOrderService.emitDeliveryPosted(job.deliveryId, job.orderId);
  res.status(200).json({ success: true, data, message: data.status === 'suspended' ? 'Rider suspended' : 'Rider reactivated' });
};

export const getHubManagers = async (_req: Request, res: Response) => {
  res.status(200).json({ success: true, data: await listHubManagers() });
};

export const addHubManager = async (req: Request, res: Response) => {
  const data = await makeHubManager(req.body.identifier);
  res.status(201).json({ success: true, data, message: 'They are now a hub manager; they need to sign in again.' });
};

export const deleteHubManager = async (req: Request, res: Response) => {
  const data = await removeHubManager(req.params.id);
  res.status(200).json({ success: true, data, message: 'Hub manager role removed' });
};

// ---- places ----

export const getCommunitiesAdmin = async (_req: Request, res: Response) => {
  res.status(200).json({ success: true, data: await listCommunitiesForAdmin() });
};

export const postCommunity = async (req: Request, res: Response) => {
  res.status(201).json({ success: true, data: await createCommunity(req.body), message: 'Community created' });
};

export const patchCommunity = async (req: Request, res: Response) => {
  res.status(200).json({ success: true, data: await updateCommunity(req.params.id, req.body), message: 'Community updated' });
};

export const getHubsAdmin = async (_req: Request, res: Response) => {
  res.status(200).json({ success: true, data: await listHubsForAdmin() });
};

export const postHub = async (req: Request, res: Response) => {
  res.status(201).json({ success: true, data: await createHub(req.body), message: 'Hub created' });
};

export const patchHub = async (req: Request, res: Response) => {
  res.status(200).json({ success: true, data: await updateHub(req.params.id, req.body), message: 'Hub updated' });
};

export const putHubManager = async (req: Request, res: Response) => {
  const data = await hubService.assignManager(req.params.id, req.body.managerId ?? null);
  res.status(200).json({ success: true, data, message: data.managerId ? 'Manager assigned' : 'Manager removed' });
};

// ---- platform promo codes ----

export const getPlatformPromotions = async (_req: Request, res: Response) => {
  res.status(200).json({ success: true, data: await promotionService.listPlatform() });
};

export const postPlatformPromotion = async (req: Request, res: Response) => {
  res.status(201).json({ success: true, data: await promotionService.createPlatform(req.body), message: 'Promo code created' });
};

export const patchPlatformPromotion = async (req: Request, res: Response) => {
  res.status(200).json({ success: true, data: await promotionService.updatePlatform(req.params.id, req.body), message: 'Promo code updated' });
};

export const deletePlatformPromotion = async (req: Request, res: Response) => {
  res.status(200).json({ success: true, data: await promotionService.deletePlatform(req.params.id), message: 'Promo code deleted' });
};
