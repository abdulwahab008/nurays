/**
 * What people write is open to everyone, so people must be able to report it and staff to take it down. As the
 * outside sees it: anyone signed in but the author may report a review, a report puts it in the staff queue and
 * does not hide it, support staff can hide, keep or restore it, a hidden review leaves the dish page and the
 * ratings, and the kitchen's dashboard no longer lists unapproved reviews (they are the ones staff hid).
 */
import { Actor, call, makeAddress, makeKitchen, makeProduct, makeUser, ok, orderIdOf, placeOrder, prisma, Reply } from './lib';

const said = (r: Reply) => `${r.status} ${r.code}`;

export default async function moderation() {
  const kitchen = await makeKitchen();
  const productId = await makeProduct(kitchen.sellerId, { price: 300 });
  const [author, other, reporter] = [await makeUser('customer'), await makeUser('customer'), await makeUser('customer')];

  /** A review of the dish, written straight to the database (that a review needs a delivered order is checked where reviews are written). */
  async function review(by: Actor, rating: number, comment: string) {
    const order = await placeOrder(by, [{ productId }], { addressId: await makeAddress(by) });
    const orderId = orderIdOf(order);
    const item = await prisma.orderItem.findFirstOrThrow({ where: { orderId } });
    return prisma.review.create({ data: { orderId, orderItemId: item.id, customerId: by.id, sellerId: kitchen.sellerId, productId, productRating: rating, sellerRating: rating, comment } });
  }
  const rude = await review(author, 1, 'Awful, and the cook is an idiot');
  const kind = await review(other, 5, 'Lovely food');
  await prisma.product.update({ where: { id: productId }, data: { ratingAverage: 3, totalReviews: 2 } }); // as the two reviews would have left it
  const shown = async () => (await call(null, 'GET', `/products/${productId}/reviews`)).body.data as { reviews: Array<Record<string, unknown>>; summary: { averageRating: number; totalReviews: number } };
  const report = (who: Actor | null, id: string, body: unknown) => call(who?.access ?? null, 'POST', `/reviews/${id}/report`, body);
  const support = await makeUser('admin', { staffRole: 'support' });
  const staff = (method: string, path: string) => support.as(method, `/admin${path}`);

  // 1. reporting
  const nobody = await report(null, rude.id, { reason: 'abusive' });
  ok('reporting a review needs a signed-in account (401)', nobody.status === 401, said(nobody));
  const first = await report(reporter, rude.id, { reason: 'abusive', note: 'insults the cook' });
  ok('anyone signed in may report a review (200)', first.status === 200, said(first));
  const flagged = await prisma.review.findUniqueOrThrow({ where: { id: rude.id }, select: { isFlagged: true, flagReason: true, isApproved: true } });
  ok('it goes to the staff queue with the reason, and is still visible', flagged.isFlagged && flagged.isApproved && flagged.flagReason === 'Abusive or offensive: insults the cook', JSON.stringify(flagged));
  const publicList = await shown();
  const publicRow = publicList.reviews.find((r) => r.id === rude.id);
  ok('the dish page still shows it until staff decide, and shows nothing about the report', !!publicRow && !('isFlagged' in publicRow) && !('flagReason' in publicRow), JSON.stringify(Object.keys(publicRow ?? {})));
  const second = await report(other, rude.id, { reason: 'spam' });
  const unchanged = await prisma.review.findUniqueOrThrow({ where: { id: rude.id }, select: { flagReason: true } });
  ok('a second report is accepted and leaves the first reason as it was', second.status === 200 && unchanged.flagReason === flagged.flagReason, said(second));
  const own = await report(author, rude.id, { reason: 'other' });
  ok("an author cannot report their own review (400 OWN_REVIEW)", own.status === 400 && own.code === 'OWN_REVIEW', said(own));
  const unknown = await report(reporter, '00000000-0000-4000-8000-000000000000', { reason: 'abusive' });
  ok('a review that is not there is a 404', unknown.status === 404 && unknown.code === 'REVIEW_NOT_FOUND', said(unknown));
  const badReason = await report(reporter, rude.id, { reason: 'because' });
  ok('a reason that is not one of the offered ones is refused (400)', badReason.status === 400 && badReason.code === 'VALIDATION_ERROR', said(badReason));
  const longNote = await report(reporter, rude.id, { reason: 'other', note: 'x'.repeat(301) });
  ok('and so is a note over 300 characters', longNote.status === 400 && longNote.code === 'VALIDATION_ERROR', said(longNote));
  let audited = 0;
  for (let i = 0; i < 10 && audited < 2; i++) {
    audited = await prisma.auditLog.count({ where: { action: 'review:REPORT', entityType: 'review', entityId: rude.id } });
    if (audited < 2) await new Promise((r) => setTimeout(r, 150));
  }
  ok('every report is in the audit log with who made it (two so far)', audited === 2, String(audited));

  // 2. the staff queue
  const asCustomer = await reporter.as('GET', '/admin/reviews');
  ok('the queue is for staff only (403 for a customer)', asCustomer.status === 403, said(asCustomer));
  const queue = await staff('GET', '/reviews');
  const mine = queue.body.data?.reviews?.find((r: { id: string }) => r.id === rude.id);
  ok('support staff see the reported review, who wrote it and how many reported it', queue.status === 200 && !!mine && mine.reportCount === 2 && mine.customerId === author.id && mine.isVisible === true && mine.isReported === true && /Abusive/.test(mine.reason), JSON.stringify(mine));
  ok('and not the one nobody reported', !queue.body.data?.reviews?.some((r: { id: string }) => r.id === kind.id));
  const tooMany = await staff('GET', '/reviews?limit=1000');
  ok('an absurd page size is refused (400), not answered with a 500', tooMany.status === 400, said(tooMany));
  const hub = await staff('GET', '/approvals');
  const queueCount = hub.body.data?.items?.find((i: { key: string }) => i.key === 'reviews');
  ok('the approvals hub counts it for support staff', hub.status === 200 && !!queueCount && queueCount.count >= 1, JSON.stringify(queueCount));

  // 3. hiding
  const hidden = await staff('POST', `/reviews/${rude.id}/hide`);
  ok('support staff can hide it (200)', hidden.status === 200, said(hidden));
  const afterHide = await shown();
  ok('it leaves the dish page, and the dish is rated by the review that is left', !afterHide.reviews.some((r) => r.id === rude.id) && afterHide.summary.totalReviews === 1 && afterHide.summary.averageRating === 5, JSON.stringify(afterHide.summary));
  const product = await prisma.product.findUniqueOrThrow({ where: { id: productId }, select: { ratingAverage: true, totalReviews: true } });
  ok("and out of the dish's stored rating", Number(product.ratingAverage) === 5 && product.totalReviews === 1, JSON.stringify(product));
  const seller = await prisma.seller.findUniqueOrThrow({ where: { id: kitchen.sellerId }, select: { ratingAverage: true, totalReviews: true } });
  ok("and out of the kitchen's rating", Number(seller.ratingAverage) === 5, JSON.stringify(seller));
  const inHidden = await staff('GET', '/reviews?status=hidden');
  ok('staff find it among the hidden ones, no longer reported', !!inHidden.body.data?.reviews?.find((r: { id: string; isVisible: boolean; isReported: boolean }) => r.id === rude.id && !r.isVisible && !r.isReported));
  const reportHidden = await report(reporter, rude.id, { reason: 'abusive' });
  ok('a hidden review cannot be reported (it is not there for anyone)', reportHidden.status === 404, said(reportHidden));
  const dashboard = await kitchen.owner.as('GET', '/sellers/me/dashboard');
  ok("the kitchen's dashboard does not list the hidden review (the old 'pending reviews' list is gone)", dashboard.status === 200 && !('pendingReviews' in (dashboard.body.data ?? {})) && !JSON.stringify(dashboard.body).includes('idiot'), said(dashboard));

  // the kitchen's public page, the dish's count and the kitchen list read the same reviews as the dish page
  const kitchenPage = await call(null, 'GET', `/sellers/${kitchen.sellerId}`);
  const onPage = (kitchenPage.body.data?.reviews ?? []) as Array<{ id: string }>;
  ok("it is gone from the kitchen's public page too, and the other review stays", kitchenPage.status === 200 && !onPage.some((r) => r.id === rude.id) && onPage.some((r) => r.id === kind.id), `${said(kitchenPage)} ${onPage.length} listed`);
  const dish = await call(null, 'GET', `/products/${productId}`);
  ok("and the dish's review count leaves it out (1, not 2)", dish.status === 200 && dish.body.data?._count?.reviews === 1, `${said(dish)} ${JSON.stringify(dish.body.data?._count)}`);
  const ownList = await kitchen.owner.as('GET', '/products/seller/my-products');
  const ownRow = ((ownList.body.data?.products ?? []) as Array<{ id: string; _count?: { reviews: number } }>).find((x) => x.id === productId);
  ok("and so does the kitchen's own dish list (1, not 2)", ownList.status === 200 && !!ownRow && ownRow._count?.reviews === 1, `${said(ownList)} ${JSON.stringify(ownRow?._count)}`);
  const kitchenName = (await prisma.seller.findUniqueOrThrow({ where: { id: kitchen.sellerId }, select: { businessName: true } })).businessName;
  await staff('POST', `/reviews/${kind.id}/hide`);
  const listed = await call(null, 'GET', `/sellers?search=${encodeURIComponent(kitchenName)}`);
  const listedRow = ((listed.body.data ?? []) as Array<{ id: string; totalReviews: number; ratingAverage: number }>).find((x) => x.id === kitchen.sellerId);
  ok('a kitchen whose reviews are all hidden shows none in the kitchen list (not a count of hidden ones)', !!listedRow && listedRow.totalReviews === 0 && listedRow.ratingAverage === 0, JSON.stringify(listedRow && { totalReviews: listedRow.totalReviews, ratingAverage: listedRow.ratingAverage }));
  const allGone = await call(null, 'GET', `/sellers/${kitchen.sellerId}`);
  ok("and its public page lists no reviews", allGone.status === 200 && (allGone.body.data?.reviews ?? []).length === 0 && allGone.body.data?.totalReviews === 0, `${said(allGone)} ${(allGone.body.data?.reviews ?? []).length}`);
  await staff('POST', `/reviews/${kind.id}/restore`);

  // 4. showing it again, and closing a report
  const restored = await staff('POST', `/reviews/${rude.id}/restore`);
  const afterRestore = await shown();
  const product2 = await prisma.product.findUniqueOrThrow({ where: { id: productId }, select: { ratingAverage: true, totalReviews: true } });
  ok('restoring it puts it back on the page and back into the rating', restored.status === 200 && afterRestore.reviews.some((r) => r.id === rude.id) && Number(product2.ratingAverage) === 3 && product2.totalReviews === 2, `${said(restored)} ${JSON.stringify(product2)}`);
  await report(reporter, rude.id, { reason: 'false' });
  const kept = await staff('POST', `/reviews/${rude.id}/keep`);
  const after = await prisma.review.findUniqueOrThrow({ where: { id: rude.id }, select: { isFlagged: true, flagReason: true, isApproved: true } });
  ok('"keep" closes the report and leaves the review where it is', kept.status === 200 && !after.isFlagged && after.flagReason === null && after.isApproved, `${said(kept)} ${JSON.stringify(after)}`);
  const missing = await staff('POST', '/reviews/00000000-0000-4000-8000-000000000000/hide');
  ok('hiding a review that is not there is a 404', missing.status === 404, said(missing));
  const trail = await prisma.auditLog.count({ where: { userId: support.id, entityType: { not: null }, action: { contains: 'reviews' } } });
  ok("the staff decisions are in the audit log too", trail >= 3, String(trail));
}
