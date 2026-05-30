import { Request, Response } from 'express';
import reviewService from '../services/review.service';
import { AppError } from '../middleware/errorHandler';

export const addReview = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
  }

  const review = await reviewService.addReview(req.user.userId, req.body);

  res.status(201).json({
    success: true,
    data: review,
    message: 'Review submitted successfully',
  });
};

export const getProductReviews = async (req: Request, res: Response) => {
  const { id } = req.params;
  const page = req.query.page ? Number(req.query.page) : 1;
  const limit = req.query.limit ? Number(req.query.limit) : 10;
  const rating = req.query.rating ? Number(req.query.rating) : undefined;

  const result = await reviewService.getProductReviews(id, { page, limit, rating });

  res.status(200).json({
    success: true,
    data: result,
  });
};

