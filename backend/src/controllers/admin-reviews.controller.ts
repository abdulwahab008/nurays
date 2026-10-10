import { Request, Response } from 'express';
import { hideReview, keepReview, listReviewsForStaff, restoreReview, StaffQueue } from '../services/review-moderation.service';

/** GET /admin/reviews?status=reported|hidden|all */
export const getReviews = async (req: Request, res: Response) => {
  const q = req.query;
  const data = await listReviewsForStaff({
    status: q.status as StaffQueue | undefined,
    page: q.page ? Number(q.page) : undefined,
    limit: q.limit ? Number(q.limit) : undefined,
  });
  res.status(200).json({ success: true, data });
};

/** POST /admin/reviews/:id/hide: off every public page, out of the ratings. */
export const postHideReview = async (req: Request, res: Response) => {
  await hideReview(req.params.id);
  res.status(200).json({ success: true, message: 'Review hidden' });
};

/** POST /admin/reviews/:id/keep: looked at, it stays; the report is closed. */
export const postKeepReview = async (req: Request, res: Response) => {
  await keepReview(req.params.id);
  res.status(200).json({ success: true, message: 'Report closed; the review stays' });
};

/** POST /admin/reviews/:id/restore: a hidden review is shown again. */
export const postRestoreReview = async (req: Request, res: Response) => {
  await restoreReview(req.params.id);
  res.status(200).json({ success: true, message: 'Review shown again' });
};
