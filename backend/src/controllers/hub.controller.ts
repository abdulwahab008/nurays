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

