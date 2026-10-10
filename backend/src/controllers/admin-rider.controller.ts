import { Request, Response } from 'express';
import { AppError } from '../middleware/errorHandler';
import {
  listRidersWithMoney,
  riderMoneyForAdmin,
  recordSettlement,
  recordPayout,
  recordAdjustment,
  setCashLimit,
} from '../services/rider-ledger.service';
import { setRiderCommunity } from '../services/dispatch.service';

/** Riders' cash and earnings, for settling up with them. */

export const getRidersMoney = async (req: Request, res: Response) => {
  const data = await listRidersWithMoney({
    search: typeof req.query.search === 'string' ? req.query.search : undefined,
    filter: typeof req.query.filter === 'string' ? req.query.filter : undefined,
    page: Number(req.query.page) || 1,
    limit: Number(req.query.limit) || 25,
  });
  res.status(200).json({ success: true, data });
};

export const getRiderMoney = async (req: Request, res: Response) => {
  const data = await riderMoneyForAdmin(req.params.id, Number(req.query.page) || 1);
  res.status(200).json({ success: true, data });
};

const adminId = (req: Request) => {
  if (!req.user) throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
  return req.user.userId;
};

export const createRiderSettlement = async (req: Request, res: Response) => {
  const data = await recordSettlement(req.params.id, adminId(req), req.body);
  res.status(201).json({ success: true, data, message: 'Settlement recorded' });
};

export const createRiderPayout = async (req: Request, res: Response) => {
  const entry = await recordPayout(req.params.id, adminId(req), req.body);
  res.status(201).json({ success: true, data: { id: entry.id, amount: Number(entry.amount) }, message: 'Payout recorded' });
};

export const createRiderAdjustment = async (req: Request, res: Response) => {
  const entry = await recordAdjustment(req.params.id, adminId(req), req.body);
  res.status(201).json({ success: true, data: { id: entry.id, amount: Number(entry.amount) }, message: 'Adjustment recorded' });
};

export const updateRiderCashLimit = async (req: Request, res: Response) => {
  const data = await setCashLimit(req.params.id, req.body.cashLimit);
  res.status(200).json({ success: true, data, message: 'Cash limit updated' });
};

export const updateRiderCommunity = async (req: Request, res: Response) => {
  const data = await setRiderCommunity(req.params.id, req.body.communityId);
  res.status(200).json({ success: true, data, message: 'Community updated' });
};
