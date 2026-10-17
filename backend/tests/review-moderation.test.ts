/**
 * Reporting a review and the staff queue behind it: who may report, what a report does (it puts the review in the
 * queue and does not hide it), what hiding, keeping and restoring do to the review and to the ratings it feeds, and
 * what the queue shows. The database is a hand-written double.
 */
const db: any = {};
jest.mock('../src/config/database', () => ({ __esModule: true, default: db }));
jest.mock('../src/middleware/audit', () => ({ recordAudit: jest.fn(() => Promise.resolve()) }));
jest.mock('../src/services/review.service', () => ({ __esModule: true, default: { refreshRatingsFor: jest.fn(() => Promise.resolve()) } }));

import reviewService from '../src/services/review.service';
import { recordAudit } from '../src/middleware/audit';
import { hideReview, keepReview, listReviewsForStaff, reportReview, restoreReview } from '../src/services/review-moderation.service';

const refresh = reviewService.refreshRatingsFor as jest.Mock;

const review = (over: Record<string, unknown> = {}) => ({
  id: 'r1',
  customerId: 'author',
  productId: 'p1',
  sellerId: 's1',
  orderId: 'o1',
  deliveryRating: 4,
  isApproved: true,
  isFlagged: false,
  flagReason: null,
  ...over,
});

function given(row: Record<string, unknown> | null) {
  db.review = {
    findUnique: jest.fn(async () => (row ? { ...row } : null)),
    update: jest.fn(async (args: any) => args),
    findMany: jest.fn(async () => []),
    count: jest.fn(async () => 0),
  };
  db.auditLog = { groupBy: jest.fn(async () => []) };
}

beforeEach(() => {
  refresh.mockClear();
  (recordAudit as jest.Mock).mockClear();
});

describe('reporting a review', () => {
  it('puts it in the queue with the reason and the note, and leaves it visible', async () => {
    given(review());
    await reportReview('someone', 'r1', { reason: 'abusive', note: 'calls the cook names' }, { ip: '203.0.113.5' });
    expect(db.review.update).toHaveBeenCalledWith({ where: { id: 'r1' }, data: { isFlagged: true, flagReason: 'Abusive or offensive: calls the cook names' } });
    expect(db.review.update.mock.calls[0][0].data).not.toHaveProperty('isApproved');
    expect(refresh).not.toHaveBeenCalled(); // nothing is hidden, so no rating moves
  });

  it('keeps a trail of who reported it, from where, and what they said', async () => {
    given(review());
    await reportReview('someone', 'r1', { reason: 'spam' }, { ip: '203.0.113.5' });
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ userId: 'someone', action: 'review:REPORT', entityType: 'review', entityId: 'r1', ipAddress: '203.0.113.5', data: { reason: 'spam', note: null } }));
  });

  it('a second report does not change the reason or the place in the queue, but is still on record', async () => {
    given(review({ isFlagged: true, flagReason: 'Spam or advertising' }));
    await reportReview('another', 'r1', { reason: 'false' });
    expect(db.review.update).not.toHaveBeenCalled();
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ userId: 'another', action: 'review:REPORT', data: { reason: 'false', note: null } }));
  });

  it("is refused for the author's own review, for a review that does not exist and for one that is hidden", async () => {
    given(review());
    await expect(reportReview('author', 'r1', { reason: 'other' })).rejects.toMatchObject({ statusCode: 400, code: 'OWN_REVIEW' });
    given(null);
    await expect(reportReview('someone', 'nope', { reason: 'other' })).rejects.toMatchObject({ statusCode: 404, code: 'REVIEW_NOT_FOUND' });
    given(review({ isApproved: false }));
    await expect(reportReview('someone', 'r1', { reason: 'other' })).rejects.toMatchObject({ statusCode: 404, code: 'REVIEW_NOT_FOUND' });
    expect(db.review.update).not.toHaveBeenCalled();
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it('keeps the reason within what the column holds, however long the note is', async () => {
    given(review());
    await reportReview('someone', 'r1', { reason: 'other', note: 'x'.repeat(300) });
    expect(String(db.review.update.mock.calls[0][0].data.flagReason).length).toBeLessThanOrEqual(500);
  });
});

describe('staff decisions', () => {
  it('hiding takes it off the public pages, closes the report and works out the ratings again', async () => {
    given(review({ isFlagged: true, flagReason: 'Abusive or offensive' }));
    await hideReview('r1');
    expect(db.review.update).toHaveBeenCalledWith({ where: { id: 'r1' }, data: { isApproved: false, isFlagged: false } });
    expect(refresh).toHaveBeenCalledWith(expect.objectContaining({ productId: 'p1', sellerId: 's1', orderId: 'o1', deliveryRating: 4 }));
  });

  it('hiding one that is already hidden changes no rating', async () => {
    given(review({ isApproved: false }));
    await hideReview('r1');
    expect(db.review.update).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('keeping closes the report and leaves the review and the ratings alone', async () => {
    given(review({ isFlagged: true, flagReason: 'Spam or advertising' }));
    await keepReview('r1');
    expect(db.review.update).toHaveBeenCalledWith({ where: { id: 'r1' }, data: { isFlagged: false, flagReason: null } });
    expect(refresh).not.toHaveBeenCalled();
  });

  it('restoring shows it again and works out the ratings again; one that is already shown changes nothing', async () => {
    given(review({ isApproved: false }));
    await restoreReview('r1');
    expect(db.review.update).toHaveBeenCalledWith({ where: { id: 'r1' }, data: { isApproved: true, isFlagged: false, flagReason: null } });
    expect(refresh).toHaveBeenCalledTimes(1);
    given(review());
    refresh.mockClear();
    await restoreReview('r1');
    expect(db.review.update).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('each answers 404 for a review that is not there', async () => {
    given(null);
    for (const act of [hideReview, keepReview, restoreReview]) await expect(act('nope')).rejects.toMatchObject({ statusCode: 404, code: 'REVIEW_NOT_FOUND' });
  });
});

describe('the staff queue', () => {
  const row = (over: Record<string, unknown> = {}) => ({
    id: 'r1', createdAt: new Date('2026-10-01T00:00:00Z'), updatedAt: new Date('2026-10-05T00:00:00Z'),
    product: { id: 'p1', name: 'Biryani' }, seller: { id: 's1', businessName: 'Aisha Kitchen' },
    customer: { id: 'c1', profile: { fullName: 'Sam Li' } },
    productRating: 1, sellerRating: 2, deliveryRating: null, comment: 'rude', photos: [], sellerResponse: null,
    isApproved: true, isFlagged: true, flagReason: 'Abusive or offensive', ...over,
  });

  it('shows what was reported, by whom it was written, and how many reports there are', async () => {
    given(null);
    db.review.findMany.mockResolvedValue([row()]);
    db.review.count.mockResolvedValue(1);
    db.auditLog.groupBy.mockResolvedValue([{ entityId: 'r1', _count: { _all: 3 } }]);
    const result = await listReviewsForStaff({});
    expect(result.reviews[0]).toMatchObject({ id: 'r1', productName: 'Biryani', businessName: 'Aisha Kitchen', customerId: 'c1', customerName: 'Sam Li', comment: 'rude', isVisible: true, isReported: true, reason: 'Abusive or offensive', reportCount: 3 });
    expect(result.reviews[0].reportedSince).toEqual(new Date('2026-10-05T00:00:00Z'));
    expect(result.pagination).toEqual({ page: 1, limit: 20, total: 1, totalPages: 1 });
  });

  it('asks for the reported ones by default, oldest report first; for the hidden ones, the latest decision first', async () => {
    given(null);
    await listReviewsForStaff({});
    expect(db.review.findMany.mock.calls[0][0]).toMatchObject({ where: { isFlagged: true, isApproved: true }, orderBy: { updatedAt: 'asc' } });
    await listReviewsForStaff({ status: 'hidden' });
    expect(db.review.findMany.mock.calls[1][0]).toMatchObject({ where: { isApproved: false }, orderBy: { updatedAt: 'desc' } });
    await listReviewsForStaff({ status: 'all' });
    expect(db.review.findMany.mock.calls[2][0]).toMatchObject({ where: {}, orderBy: { createdAt: 'desc' } });
  });

  it('names no report date for a review nobody reported, and does not ask the audit log when the page is empty', async () => {
    given(null);
    expect((await listReviewsForStaff({ status: 'all' })).reviews).toEqual([]);
    expect(db.auditLog.groupBy).not.toHaveBeenCalled();
    db.review.findMany.mockResolvedValue([row({ isFlagged: false, flagReason: null })]);
    expect((await listReviewsForStaff({ status: 'all' })).reviews[0].reportedSince).toBeNull();
  });
});
