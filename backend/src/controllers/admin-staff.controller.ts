import { Request, Response } from 'express';
import { AppError } from '../middleware/errorHandler';
import { getApprovals } from '../services/approvals.service';
import { listStaff, createStaff, changeStaffRole, setStaffStatus, resetStaffPassword, removeStaff } from '../services/staff.service';

const actor = (req: Request) => {
  if (!req.user) throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
  return req.user.userId;
};

export const getStaff = async (_req: Request, res: Response) => {
  res.status(200).json({ success: true, data: await listStaff() });
};
export const postStaff = async (req: Request, res: Response) => {
  actor(req);
  res.status(201).json({ success: true, data: await createStaff(req.body), message: 'Staff member created' });
};
export const patchStaffRole = async (req: Request, res: Response) => {
  res.status(200).json({ success: true, data: await changeStaffRole(actor(req), req.params.id, req.body.role), message: 'Role changed' });
};
export const postStaffStatus = async (req: Request, res: Response) => {
  res.status(200).json({ success: true, data: await setStaffStatus(actor(req), req.params.id, req.body.status) });
};
export const postStaffPassword = async (req: Request, res: Response) => {
  res.status(200).json({ success: true, data: await resetStaffPassword(actor(req), req.params.id, req.body.password), message: 'Password changed' });
};
export const deleteStaff = async (req: Request, res: Response) => {
  res.status(200).json({ success: true, data: await removeStaff(actor(req), req.params.id), message: 'Staff access removed' });
};

/** Everything waiting for a decision, limited to what this staff role can act on. */
export const getApprovalQueues = async (req: Request, res: Response) => {
  res.status(200).json({ success: true, data: await getApprovals(req.user?.staffRole) });
};
