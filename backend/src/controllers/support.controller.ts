import { Request, Response } from 'express';
import supportService from '../services/support.service';
import { AppError } from '../middleware/errorHandler';

export const createTicket = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
  }

  const result = await supportService.createTicket(req.user.userId, req.body);

  res.status(201).json({
    success: true,
    data: result,
    message: 'Support ticket created successfully',
  });
};

export const getUserTickets = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
  }

  const status = req.query.status as string | undefined;
  const page = req.query.page ? Number(req.query.page) : 1;
  const limit = req.query.limit ? Number(req.query.limit) : 20;

  const result = await supportService.getUserTickets(req.user.userId, { status, page, limit });

  res.status(200).json({
    success: true,
    data: result,
  });
};

export const getTicketDetail = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
  }

  const ticket = await supportService.getTicketDetail(req.user.userId, req.params.id);

  res.status(200).json({
    success: true,
    data: ticket,
  });
};

export const addCustomerMessage = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
  }

  const ticket = await supportService.addCustomerMessage(req.user.userId, req.params.id, req.body.message);

  res.status(201).json({
    success: true,
    data: ticket,
  });
};

export const adminGetTickets = async (req: Request, res: Response) => {
  const status = req.query.status as string | undefined;
  const page = req.query.page ? Number(req.query.page) : 1;
  const limit = req.query.limit ? Number(req.query.limit) : 20;

  const result = await supportService.adminGetTickets({ status, page, limit });

  res.status(200).json({
    success: true,
    data: result,
  });
};

export const adminGetTicketDetail = async (req: Request, res: Response) => {
  const ticket = await supportService.adminGetTicketDetail(req.params.id);

  res.status(200).json({
    success: true,
    data: ticket,
  });
};

export const adminReplyToTicket = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
  }

  const ticket = await supportService.adminReply(req.params.id, req.user.userId, req.body.message, req.body.status);

  res.status(201).json({
    success: true,
    data: ticket,
  });
};

