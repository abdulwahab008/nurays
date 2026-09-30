import { Request, Response } from 'express';
import hubService from '../services/hub.service';

export const getHubCenters = async (req: Request, res: Response) => {
  const city = req.query.city as string | undefined;

  const hubs = await hubService.getHubCenters({ city });

  res.status(200).json({
    success: true,
    data: hubs,
  });
};

export const getHubInventory = async (req: Request, res: Response) => {
  const { id } = req.params;
  const categoryId = req.query.categoryId as string | undefined;
  const search = req.query.search as string | undefined;

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
  const status = req.query.status as string | undefined;
  const search = req.query.search as string | undefined;

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
  const limit = req.query.limit ? Number(req.query.limit) : 50;

  const result = await hubService.getTemperatureLogs(id, limit);

  res.status(200).json({
    success: true,
    data: result,
  });
};

export const getHubStats = async (req: Request, res: Response) => {
  const { id } = req.params;

  const result = await hubService.getHubStats(id);

  res.status(200).json({
    success: true,
    data: result,
  });
};
