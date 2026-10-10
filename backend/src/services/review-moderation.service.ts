import prisma from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { recordAudit } from '../middleware/audit';
import { pageArgs } from '../utils/pagination';
import reviewService from './review.service';

/**
 * Reviews are written by customers and read by everyone, so people must be able to report one that is abusive, and
 * staff must be able to take it down (an app-store requirement for anything users write). A report does not hide a
 * review: it puts it in the staff queue, where a person decides. Nothing here needs a table of its own: the review
 * carries the flag and the reason, hiding is `isApproved = false` (every public read already leaves those out),
 * and who reported what, and when, is in the audit log.
 */

export type ReportReason = 'abusive' | 'spam' | 'false' | 'privacy' | 'other';

const REASON_TEXT: Record<ReportReason, string> = {
  abusive: 'Abusive or offensive',
  spam: 'Spam or advertising',
  false: 'False, or about something else',
  privacy: 'Shares private information',
  other: 'Other',
};

const MAX_REASON = 500;

/** Report a review. Anyone signed in but its author may, as often as they like (the audit log keeps each one). */
export async function reportReview(
  reporterId: string,
  reviewId: string,
  input: { reason: ReportReason; note?: string },
  ctx: { ip?: string | null } = {}
) {
  const review = await prisma.review.findUnique({
    where: { id: reviewId },
    select: { id: true, customerId: true, isApproved: true, isFlagged: true },
  });
  // A hidden review is not there for the public, so there is nothing to report.
  if (!review || !review.isApproved) throw new AppError('Review not found', 404, 'REVIEW_NOT_FOUND');
  if (review.customerId === reporterId) throw new AppError('You cannot report your own review', 400, 'OWN_REVIEW');

  // The first report puts it in the queue and says why; later ones leave that as it is (the queue keeps its place).
  if (!review.isFlagged) {
    const reason = `${REASON_TEXT[input.reason]}${input.note ? `: ${input.note}` : ''}`.slice(0, MAX_REASON);
    await prisma.review.update({ where: { id: reviewId }, data: { isFlagged: true, flagReason: reason } });
  }
  await recordAudit({
    userId: reporterId,
    action: 'review:REPORT',
    entityType: 'review',
    entityId: reviewId,
    ipAddress: ctx.ip ?? null,
    data: { reason: input.reason, note: input.note ?? null },
    responseStatus: 200,
  });
}

export type StaffQueue = 'reported' | 'hidden' | 'all';

/** What staff see of a review: who wrote it, about what, what was reported, and how many reports there were. */
export async function listReviewsForStaff(filters: { status?: StaffQueue; page?: number; limit?: number }) {
  const status = filters.status ?? 'reported';
  const { page, limit, skip } = pageArgs(filters.page, filters.limit, 20, 50);
  const where = status === 'reported' ? { isFlagged: true, isApproved: true } : status === 'hidden' ? { isApproved: false } : {};
  // The ones that have waited longest come first; hidden ones, the latest decision first.
  const orderBy = status === 'reported' ? { updatedAt: 'asc' as const } : status === 'hidden' ? { updatedAt: 'desc' as const } : { createdAt: 'desc' as const };

  const [rows, total] = await Promise.all([
    prisma.review.findMany({
      where,
      orderBy,
      skip,
      take: limit,
      include: {
        product: { select: { id: true, name: true } },
        seller: { select: { id: true, businessName: true } },
        customer: { select: { id: true, profile: { select: { fullName: true } } } },
      },
    }),
    prisma.review.count({ where }),
  ]);

  const reports = rows.length
    ? await prisma.auditLog.groupBy({
        by: ['entityId'],
        where: { action: 'review:REPORT', entityType: 'review', entityId: { in: rows.map((r) => r.id) } },
        _count: { _all: true },
      })
    : [];
  const reportCount = new Map(reports.map((r) => [r.entityId, r._count._all]));

  return {
    reviews: rows.map((r) => ({
      id: r.id,
      createdAt: r.createdAt,
      reportedSince: r.isFlagged ? r.updatedAt : null,
      productId: r.product?.id ?? null,
      productName: r.product?.name ?? null,
      sellerId: r.seller.id,
      businessName: r.seller.businessName,
      customerId: r.customer.id,
      customerName: r.customer.profile?.fullName || 'Anonymous',
      productRating: r.productRating,
      sellerRating: r.sellerRating,
      deliveryRating: r.deliveryRating,
      comment: r.comment,
      photos: r.photos,
      sellerResponse: r.sellerResponse,
      isVisible: r.isApproved,
      isReported: r.isFlagged,
      reason: r.flagReason,
      reportCount: reportCount.get(r.id) ?? 0,
    })),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

async function load(reviewId: string) {
  const review = await prisma.review.findUnique({
    where: { id: reviewId },
    select: { id: true, productId: true, sellerId: true, orderId: true, deliveryRating: true, isApproved: true, isFlagged: true },
  });
  if (!review) throw new AppError('Review not found', 404, 'REVIEW_NOT_FOUND');
  return review;
}

/** Take a review down: it leaves every public page and stops counting towards the dish's, kitchen's and rider's rating. */
export async function hideReview(reviewId: string) {
  const review = await load(reviewId);
  if (review.isApproved) {
    // The reason it was reported stays on the review as the reason it was hidden.
    await prisma.review.update({ where: { id: reviewId }, data: { isApproved: false, isFlagged: false } });
    await reviewService.refreshRatingsFor(review);
  } else if (review.isFlagged) {
    await prisma.review.update({ where: { id: reviewId }, data: { isFlagged: false } });
  }
}

/** Staff looked and the review stays: the report is closed. */
export async function keepReview(reviewId: string) {
  const review = await load(reviewId);
  if (review.isFlagged) await prisma.review.update({ where: { id: reviewId }, data: { isFlagged: false, flagReason: null } });
}

/** Show a hidden review again. */
export async function restoreReview(reviewId: string) {
  const review = await load(reviewId);
  if (!review.isApproved) {
    await prisma.review.update({ where: { id: reviewId }, data: { isApproved: true, isFlagged: false, flagReason: null } });
    await reviewService.refreshRatingsFor(review);
  }
}
