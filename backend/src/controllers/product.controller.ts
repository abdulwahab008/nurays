import { Request, Response } from 'express';
import { orderAgainProductIds, recommendedProducts } from '../services/ranking.service';
import productService from '../services/product.service';
import { AppError } from '../middleware/errorHandler';

export const getProducts = async (req: Request, res: Response) => {
  const filters = {
    page: req.query.page as number | undefined,
    limit: req.query.limit as number | undefined,
    categoryId: req.query.categoryId as string | undefined,
    sellerId: req.query.sellerId as string | undefined,
    city: req.query.city as string | undefined,
    area: req.query.area as string | undefined,
    minPrice: req.query.minPrice as number | undefined,
    maxPrice: req.query.maxPrice as number | undefined,
    dietary: req.query.dietary as string[] | undefined,
    stockType: req.query.stockType as string | undefined,
    search: req.query.search as string | undefined,
    sort: req.query.sort as string | undefined,
    isActive: req.query.isActive as boolean | undefined,
    mealCategory: req.query.mealCategory as string | undefined,
    openNow: req.query.openNow as boolean | undefined,
    open247: req.query.open247 as boolean | undefined,
    deliveryAvailable: req.query.deliveryAvailable as boolean | undefined,
    pickupAvailable: req.query.pickupAvailable as boolean | undefined,
    offersAvailable: req.query.offersAvailable as boolean | undefined,
    freeDelivery: req.query.freeDelivery as boolean | undefined,
    businessType: req.query.businessType as string | undefined,
    preOrderOnly: req.query.preOrderOnly as boolean | undefined,
    currentlyBusy: req.query.currentlyBusy as boolean | undefined,
    newKitchens: req.query.newKitchens as boolean | undefined,
    fastDelivery: req.query.fastDelivery as boolean | undefined,
    customerLat: req.query.customerLat as number | undefined,
    customerLng: req.query.customerLng as number | undefined,
    maxDistanceKm: req.query.maxDistanceKm as number | undefined,
    communityId: req.query.communityId as string | undefined,
  };

  const result = await productService.getProducts(filters);

  res.status(200).json({
    success: true,
    data: result,
  });
};

/** Location and community from the query, for delivery fees and ETAs on the cards. */
function cardContext(req: Request) {
  const num = (v: unknown) => (v != null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : undefined);
  return {
    customerLat: num(req.query.customerLat),
    customerLng: num(req.query.customerLng),
    communityId: typeof req.query.communityId === 'string' ? req.query.communityId : undefined,
  };
}

const listLimit = (req: Request) => Math.min(Math.max(Math.trunc(Number(req.query.limit) || 12), 1), 24);

/** "Recommended for you" (trending dishes for visitors and new customers). */
export const getRecommendedProducts = async (req: Request, res: Response) => {
  const limit = listLimit(req);
  const picks = await recommendedProducts(req.user?.id ?? null, limit);
  const result = await productService.getProducts({ ...cardContext(req), rankedIds: picks.map((p) => p.productId), limit });
  const reasons = new Map(picks.map((p) => [p.productId, p.reason]));
  res.status(200).json({
    success: true,
    data: { products: result.products.map((p) => ({ ...p, recommendationReason: reasons.get(p.id) ?? 'trending' })) },
  });
};

/** "Order again": the signed-in customer's dishes, often-and-recent first. */
export const getOrderAgainProducts = async (req: Request, res: Response) => {
  const limit = listLimit(req);
  const ids = await orderAgainProductIds(req.user!.id, limit);
  const result = await productService.getProducts({ ...cardContext(req), rankedIds: ids, limit });
  res.status(200).json({ success: true, data: { products: result.products } });
};

export const getProduct = async (req: Request, res: Response) => {
  const { identifier } = req.params;

  const product = await productService.getProductByIdentifier(
    identifier,
    req.user?.id,
    req.query.customerLat as number | undefined,
    req.query.customerLng as number | undefined,
    req.query.communityId as string | undefined
  );

  res.status(200).json({
    success: true,
    data: product,
  });
};

export const createProduct = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
  }

  const product = await productService.createProduct(req.user.userId, req.body);

  res.status(201).json({
    success: true,
    message: 'Product created successfully.',
    data: product,
  });
};

export const updateProduct = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
  }

  const { id } = req.params;
  const product = await productService.updateProduct(id, req.user.userId, req.body);

  res.status(200).json({
    success: true,
    message: 'Product updated successfully.',
    data: product,
  });
};

export const deleteProduct = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
  }

  const { id } = req.params;
  const result = await productService.deleteProduct(id, req.user.userId);

  res.status(200).json({
    success: true,
    message: result.message,
  });
};

export const getSellerProducts = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
  }

  const filters = {
    page: req.query.page as number | undefined,
    limit: req.query.limit as number | undefined,
    isActive: req.query.isActive as boolean | undefined,
    approvalStatus: req.query.approvalStatus as string | undefined,
  };

  const result = await productService.getSellerProducts(req.user.userId, filters);

  res.status(200).json({
    success: true,
    data: result,
  });
};

