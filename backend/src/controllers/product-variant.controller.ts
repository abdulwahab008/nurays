import { Request, Response } from 'express';
import * as productVariantService from '../services/product-variant.service';
import { AppError } from '../middleware/errorHandler';

export const createVariant = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
  }

  const variant = await productVariantService.createProductVariant(req.user.userId, req.body);

  res.status(201).json({
    success: true,
    message: 'Product variant created successfully',
    data: variant,
  });
};

export const bulkCreateVariants = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
  }

  const { productId, variants } = req.body;
  const created = await productVariantService.bulkCreateProductVariants(req.user.userId, productId, variants);

  res.status(201).json({
    success: true,
    message: `${created.length} variants created successfully`,
    data: created,
  });
};

export const updateVariant = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
  }

  const { variantId } = req.params;
  const variant = await productVariantService.updateProductVariant(req.user.userId, variantId, req.body);

  res.status(200).json({
    success: true,
    message: 'Variant updated successfully',
    data: variant,
  });
};

export const deleteVariant = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
  }

  const { variantId } = req.params;
  const result = await productVariantService.deleteProductVariant(req.user.userId, variantId);

  res.status(200).json({
    success: true,
    message: result.message,
  });
};

export const getProductVariants = async (req: Request, res: Response) => {
  const { productId } = req.params;
  const variants = await productVariantService.getProductVariants(productId);

  res.status(200).json({
    success: true,
    data: variants,
  });
};

export const getVariant = async (req: Request, res: Response) => {
  const { variantId } = req.params;
  const variant = await productVariantService.getVariantById(variantId);

  res.status(200).json({
    success: true,
    data: variant,
  });
};
