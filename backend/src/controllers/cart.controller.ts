import { Request, Response } from 'express';
import cartService from '../services/cart.service';
import { AppError } from '../middleware/errorHandler';

export const getCart = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
  }

  const cart = await cartService.getCart(req.user.userId);

  res.status(200).json({
    success: true,
    data: cart,
  });
};

export const addToCart = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
  }

  const item = await cartService.addToCart(req.user.userId, req.body);

  res.status(201).json({
    success: true,
    message: 'Added to cart',
    data: item,
  });
};

export const updateCartItem = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
  }

  const { id } = req.params;
  const item = await cartService.updateCartItem(req.user.userId, id, req.body);

  if (!item) {
    res.status(200).json({
      success: true,
      message: 'Item removed from cart',
    });
    return;
  }

  res.status(200).json({
    success: true,
    message: 'Cart item updated',
    data: item,
  });
};

export const removeFromCart = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
  }

  const { id } = req.params;
  const result = await cartService.removeFromCart(req.user.userId, id);

  res.status(200).json({
    success: true,
    message: result.message,
  });
};

export const clearCart = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
  }

  const result = await cartService.clearCart(req.user.userId);

  res.status(200).json({
    success: true,
    message: result.message,
  });
};

export const validateCart = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
  }

  const result = await cartService.validateCart(req.user.userId);

  res.status(200).json({
    success: true,
    data: result,
  });
};

export const getDeliveryFeeEstimate = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
  }

  const addressId = req.query.addressId as string;
  if (!addressId) {
    throw new AppError('addressId is required', 400, 'VALIDATION_ERROR');
  }

  const result = await cartService.getDeliveryFeeEstimate(req.user.userId, addressId);

  res.status(200).json({
    success: true,
    data: result,
  });
};

