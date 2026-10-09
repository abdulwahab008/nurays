import { Request, Response } from 'express';
import { qstr } from '../utils/query';
import hubService from '../services/hub.service';

export const getHubCenters = async (req: Request, res: Response) => {
  const city = qstr(req.query.city);

  const hubs = await hubService.getHubCenters({ city });

  res.status(200).json({
    success: true,
    data: hubs,
  });
};

export const getHubInventory = async (req: Request, res: Response) => {
  const { id } = req.params;
  const categoryId = qstr(req.query.categoryId);
  const search = qstr(req.query.search)?.slice(0, 100);

  const result = await hubService.getHubInventory(id, { categoryId, search });

  res.status(200).json({
    success: true,
    data: result,
  });
};

export const recordBatchIntake = async (req: Request, res: Response) => {
  const { id } = req.params;
  const {
    productId,
    sellerId,
    quantity,
    batchNumber,
    manufacturedDate,
    expiryDate,
    measuredTemperatureCelsius,
    storageUnit,
    barcode,
  } = req.body;

  const staffUserId = (req as any).user?.userId || (req as any).user?.id;

  const result = await hubService.recordBatchIntake({
    hubId: id,
    productId,
    sellerId,
    quantity: Number(quantity),
    batchNumber,
    manufacturedDate,
    expiryDate,
    measuredTemperatureCelsius: Number(measuredTemperatureCelsius),
    storageUnit,
    barcode,
    staffUserId,
  });

  res.status(201).json({
    success: true,
    data: result,
    message: result.message,
  });
};

export const getHubBatches = async (req: Request, res: Response) => {
  const { id } = req.params;
  const status = qstr(req.query.status);
  const search = qstr(req.query.search)?.slice(0, 100);

  const result = await hubService.getHubBatches(id, { status, search });

  res.status(200).json({
    success: true,
    data: result,
  });
};

export const updateBatchStatus = async (req: Request, res: Response) => {
  const { id, batchId } = req.params;
  const { status, reason } = req.body;
  const staffUserId = (req as any).user?.userId || (req as any).user?.id;

  const result = await hubService.updateBatchStatus({
    hubId: id,
    batchId,
    status,
    reason,
    performedBy: staffUserId,
  });

  res.status(200).json({
    success: true,
    data: result,
  });
};

export const recordTemperatureProbe = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { temperatureCelsius, freezerUnit, notes } = req.body;

  const result = await hubService.recordTemperatureProbe({
    hubId: id,
    temperatureCelsius: Number(temperatureCelsius),
    freezerUnit: freezerUnit ? Number(freezerUnit) : undefined,
    notes,
  });

  res.status(201).json({
    success: true,
    data: result,
    message: result.message,
  });
};

export const getTemperatureLogs = async (req: Request, res: Response) => {
  const { id } = req.params;
  const limit = req.query.limit ? Number(req.query.limit) : 50; // bounded in the service

  const result = await hubService.getTemperatureLogs(id, limit);

  res.status(200).json({
    success: true,
    data: result,
  });
};

export const assignHubManager = async (req: Request, res: Response) => {
  const result = await hubService.assignManager(req.params.id, req.body.managerId);

  res.status(200).json({ success: true, data: result });
};

export const getHubStats = async (req: Request, res: Response) => {
  const { id } = req.params;

  const result = await hubService.getHubStats(id);

  res.status(200).json({
    success: true,
    data: result,
  });
};
