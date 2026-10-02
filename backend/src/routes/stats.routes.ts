import { Router, Request, Response } from 'express';
import prisma from '../config/database';

const router = Router();

/**
 * Real platform numbers for the public pages (no invented social proof).
 * GET /api/v1/stats/public
 */
router.get('/public', async (_req: Request, res: Response) => {
  const [kitchens, communities, dishes, ratingAgg] = await Promise.all([
    prisma.seller.count({ where: { status: 'active', verificationStatus: 'approved' } }),
    prisma.community.count({ where: { isActive: true } }),
    prisma.product.count({ where: { isActive: true, approvalStatus: 'approved' } }),
    prisma.review.aggregate({ where: { isApproved: true, productRating: { not: null } }, _avg: { productRating: true }, _count: { _all: true } }),
  ]);
  res.set('Cache-Control', 'public, max-age=300');
  res.json({
    success: true,
    data: {
      kitchens,
      communities,
      dishes,
      reviews: ratingAgg._count._all,
      // Only meaningful with enough reviews; null otherwise so the page can hide it.
      averageRating: ratingAgg._count._all >= 20 && ratingAgg._avg.productRating != null ? Math.round(ratingAgg._avg.productRating * 10) / 10 : null,
    },
  });
});

export default router;
