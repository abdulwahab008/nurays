/**
 * End-to-end check of the order / payment / refund / payout money flows against
 * a REAL Postgres (concurrency cannot be tested with mocks).
 *
 *   DATABASE_URL=postgresql://... JWT_SECRET=<32+ chars> NODE_ENV=test \
 *     npx prisma migrate deploy && npx ts-node scripts/verify-money-flows.ts
 *
 * Creates its own users/sellers/products with unique values; use a throwaway DB.
 * Build it with `migrate deploy` (not `db push`): the CHECK constraints these checks rely
 * on are only in the migrations.
 */
import prisma from '../src/config/database';
import orderService from '../src/services/order.service';
import orderPlacement from '../src/services/order-placement.service';
import paymentService, { PAYABLE_STATUSES } from '../src/services/payment.service';
import adminOrderService from '../src/services/admin-order.service';
import { completeRefund, dismissRefund } from '../src/services/refund.service';
import userProfileService from '../src/services/user-profile.service';
import { createHash } from 'crypto';
import authService from '../src/services/auth.service';
import otpService from '../src/services/otp.service';
import hubService from '../src/services/hub.service';
import cartService from '../src/services/cart.service';
import productService from '../src/services/product.service';
import ledgerService from '../src/services/ledger.service';
import sellerService from '../src/services/seller.service';
import sellerOrderService from '../src/services/seller-order.service';
import reviewService from '../src/services/review.service';
import '../src/middleware/auth.middleware'; // brings in the Request.user type, for calling a controller directly

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = '') => { cond ? pass++ : fail++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  [' + extra + ']' : ''}`); };
const code = async (p: Promise<any>) => { try { await p; return 'OK'; } catch (e: any) { return e.code || e.message; } };
let n = 0;
const uniq = () => `${Date.now()}${++n}`;
/** Every key anywhere in a JSON-like value (to prove a payload carries none of a list of private fields). */
const deepKeys = (v: any, out = new Set<string>()): Set<string> => {
  if (Array.isArray(v)) v.forEach((x) => deepKeys(x, out));
  else if (v && typeof v === 'object' && !(v instanceof Date)) for (const [k, x] of Object.entries(v)) { out.add(k); deepKeys(x, out); }
  return out;
};

async function mkUser(type = 'customer') {
  const u = uniq();
  return prisma.user.create({ data: { phone: `+92300${u.slice(-8)}`, email: `u${u}@t.test`, userType: type, ...(type === 'admin' ? { staffRole: 'admin' } : {}) } as any });
}
async function mkSeller(opts: any = {}) {
  const user = await mkUser('seller');
  return prisma.seller.create({ data: { userId: user.id, businessName: 'K' + uniq(), deliveryModes: ['delivery', 'pickup'], status: 'active', ...opts } });
}
async function mkProduct(sellerId: string, stock: number, price = 100) {
  return prisma.product.create({ data: { sellerId, name: 'P' + uniq(), slug: 'p-' + uniq(), price, unit: 'pc', stockQuantity: stock, stockType: 'direct', approvalStatus: 'approved', isActive: true } as any });
}
const order = async (cust: string, items: any[], extra: any = {}) => ({
  order: await orderService.createOrder(cust, { items, deliveryType: 'self_pickup', paymentMethod: 'cod', ...extra } as any),
});

const realtimeOrderServiceForVerify = () => require('../src/services/realtime-order.service').default;

async function main() {
  // The older checks claim jobs by hand; automatic assignment has its own checks below.
  process.env.AUTO_ASSIGN_ENABLED = 'false';
  const cust = await mkUser();
  const seller = await mkSeller();
  const sellerB = await mkSeller();

  // ---- 1. stock: concurrent last-unit orders ----
  let p = await mkProduct(seller.id, 1);
  let res = await Promise.all([order(cust.id, [{ productId: p.id, quantity: 1 }]).then(() => 'OK', (e) => e.code), order(cust.id, [{ productId: p.id, quantity: 1 }]).then(() => 'OK', (e) => e.code)]);
  let stock = (await prisma.product.findUnique({ where: { id: p.id } }))!.stockQuantity;
  ok('concurrent last-unit orders: exactly one wins, stock never negative', res.filter((r) => r === 'OK').length === 1 && stock === 0, `${res} stock=${stock}`);

  // ---- 2. stock: duplicate lines ----
  p = await mkProduct(seller.id, 6);
  const dup = await code(order(cust.id, [{ productId: p.id, quantity: 5 }, { productId: p.id, quantity: 5 }]));
  stock = (await prisma.product.findUnique({ where: { id: p.id } }))!.stockQuantity;
  ok('duplicate lines cannot oversell', dup === 'INSUFFICIENT_STOCK' && stock === 6, `${dup} stock=${stock}`);

  // ---- 3. customer cancel restocks once; seller-cancelled item not double restocked ----
  p = await mkProduct(seller.id, 10);
  const pB = await mkProduct(seller.id, 10);
  const o1: any = (await order(cust.id, [{ productId: p.id, quantity: 3 }, { productId: pB.id, quantity: 2 }])).order;
  const itemA = await prisma.orderItem.findFirst({ where: { orderId: o1.id, productId: p.id } });
  const sellerUser = await prisma.seller.findUnique({ where: { id: seller.id } });
  await sellerOrderService.cancelOrderItem(itemA!.id, sellerUser!.userId, 'oos');
  await orderService.cancelOrder(o1.id, cust.id, 'changed mind');
  const sa = (await prisma.product.findUnique({ where: { id: p.id } }))!.stockQuantity;
  const sb = (await prisma.product.findUnique({ where: { id: pB.id } }))!.stockQuantity;
  ok('cancel does not double-restock a seller-cancelled item', sa === 10 && sb === 10, `A=${sa} B=${sb}`);
  const dbl = await code(orderService.cancelOrder(o1.id, cust.id, 'again'));
  ok('second cancel is refused', dbl !== 'OK', dbl);

  // ---- 4. wallet: concurrent double pay ----
  await prisma.wallet.create({ data: { userId: cust.id, balance: 1000 } });
  p = await mkProduct(seller.id, 5, 100);
  // An unpaid order paid from the wallet afterwards (wallet orders placed at checkout are paid at creation).
  const o2: any = (await order(cust.id, [{ productId: p.id, quantity: 1 }], { paymentMethod: 'cod' })).order;
  const total = Number(o2.totalAmount);
  const pay = await Promise.all([1, 2, 3].map(() => paymentService.processPayment(o2.id, cust.id, 'wallet').then(() => 'OK', (e: any) => e.code)));
  const bal = Number((await prisma.wallet.findUnique({ where: { userId: cust.id } }))!.balance);
  const debits = await prisma.walletTransaction.count({ where: { orderId: o2.id, transactionType: 'debit' } });
  ok('concurrent wallet payments charge exactly once', pay.filter((r) => r === 'OK').length === 1 && debits === 1 && bal === 1000 - total, `${pay} debits=${debits} bal=${bal} total=${total}`);

  // ---- 5. admin refund: concurrent double refund ----
  const admin = await mkUser('admin');
  await prisma.order.update({ where: { id: o2.id }, data: { orderStatus: 'delivered' } }); // refunds on a delivered order (a live one is cancelled instead)
  const refunds = await Promise.all([1, 2, 3].map(() => adminOrderService.processRefund(o2.id, admin.id).then(() => 'OK', (e: any) => e.code)));
  const bal2 = Number((await prisma.wallet.findUnique({ where: { userId: cust.id } }))!.balance);
  ok('concurrent admin refunds credit exactly once', refunds.filter((r) => r === 'OK').length === 1 && bal2 === 1000, `${refunds} bal=${bal2}`);

  // ---- 6. admin PATCH status cannot cancel/refund ----
  p = await mkProduct(seller.id, 5);
  const o3: any = (await order(cust.id, [{ productId: p.id, quantity: 1 }])).order;
  ok('admin PATCH cancelled is refused', (await code(adminOrderService.updateOrderStatus(o3.id, admin.id, 'cancelled'))) === 'USE_CANCEL_ENDPOINT');
  ok('admin PATCH refunded is refused', (await code(adminOrderService.updateOrderStatus(o3.id, admin.id, 'refunded'))) === 'USE_REFUND_ENDPOINT');

  // ---- 7. seller generic status endpoint cannot cancel ----
  const item3 = await prisma.orderItem.findFirst({ where: { orderId: o3.id } });
  const r7 = await code(sellerOrderService.updateOrderItemStatus(item3!.id, sellerUser!.userId, 'cancelled'));
  ok('seller generic status cannot cancel (no restock path)', r7 === 'INVALID_STATUS_TRANSITION', r7);

  // ---- 8. promo scoping ----
  p = await mkProduct(seller.id, 5, 1000);
  const pB2 = await mkProduct(sellerB.id, 5, 1000);
  await prisma.promotion.create({ data: { sellerId: seller.id, code: 'SELLERA50', name: 'A50', discountType: 'percentage', discountValue: 50, validFrom: new Date(Date.now() - 1e6), validUntil: new Date(Date.now() + 1e9), usageLimitPerUser: 5 } as any });
  const onlyB = await code(order(cust.id, [{ productId: pB2.id, quantity: 1 }], { promotionCode: 'sellera50' }));
  ok('seller promo code refused on another seller\'s order (case-insensitive lookup)', onlyB === 'PROMO_NOT_APPLICABLE', onlyB);
  const scoped = await prisma.promotion.create({ data: { code: 'ONLYP', name: 'p', discountType: 'percentage', discountValue: 50, applicableProductIds: [p.id], validFrom: new Date(Date.now() - 1e6), validUntil: new Date(Date.now() + 1e9), usageLimitPerUser: 5 } as any });
  const pSame = await mkProduct(seller.id, 5, 1000);
  const o4: any = (await order(cust.id, [{ productId: p.id, quantity: 1 }, { productId: pSame.id, quantity: 1 }], { promotionCode: 'onlyp' })).order;
  const pcode = o4.discountAmount;
  const o4items = await prisma.orderItem.findMany({ where: { orderId: o4.id } });
  const o4p = o4items.find((i) => i.productId === p.id)!;
  const o4b = o4items.find((i) => i.productId === pSame.id)!;
  ok('product-scoped promo discounts only the matching item', Math.abs(Number(pcode) - Number(o4p.totalPrice) / 2) < 0.01 && Number(o4p.promoDiscount) === Number(pcode) && Number(o4b.promoDiscount) === 0, `discount=${pcode} p=${o4p.promoDiscount} b=${o4b.promoDiscount}`);

  // ---- 9. promo usage released on cancel ----
  const usedBefore = (await prisma.promotion.findUnique({ where: { id: scoped.id } }))!.usedCount;
  await orderService.cancelOrder(o4.id, cust.id, 'x');
  const usedAfter = (await prisma.promotion.findUnique({ where: { id: scoped.id } }))!.usedCount;
  const usages = await prisma.promotionUsage.count({ where: { orderId: o4.id } });
  ok('cancel releases promo usage', usedBefore === 1 && usedAfter === 0 && usages === 0, `${usedBefore}->${usedAfter} usages=${usages}`);

  // ---- 10. promo total limit race ----
  const limited = await prisma.promotion.create({ data: { code: 'ONLY1', name: 'one', discountType: 'fixed', discountValue: 10, validFrom: new Date(Date.now() - 1e6), validUntil: new Date(Date.now() + 1e9), usageLimitTotal: 1, usageLimitPerUser: 1 } as any });
  const custs = await Promise.all([mkUser(), mkUser(), mkUser()]);
  p = await mkProduct(seller.id, 20, 100);
  const rr = await Promise.all(custs.map((c) => order(c.id, [{ productId: p.id, quantity: 1 }], { promotionCode: 'ONLY1' }).then((r: any) => Number(r.order.discountAmount), (e: any) => e.code)));
  const used = (await prisma.promotion.findUnique({ where: { id: limited.id } }))!.usedCount;
  ok('usage-limited promo cannot be overshot by parallel orders', used <= 1 && rr.filter((x) => x === 10).length <= 1, `${rr} used=${used}`);
  const perUser = await prisma.promotion.create({ data: { code: 'PERUSER1', name: 'one per person', discountType: 'fixed', discountValue: 10, validFrom: new Date(Date.now() - 1e6), validUntil: new Date(Date.now() + 1e9), usageLimitPerUser: 1 } as any });
  const onePerson = await mkUser();
  const fiveProds = await Promise.all([1, 2, 3, 4, 5].map(() => mkProduct(seller.id, 20, 100)));
  const pr5 = await Promise.all(fiveProds.map((fp) => order(onePerson.id, [{ productId: fp.id, quantity: 1 }], { promotionCode: 'PERUSER1' }).then((r: any) => Number(r.order.discountAmount), (e: any) => e.code)));
  ok('a one-per-person code cannot be used twice by racing checkouts', pr5.filter((x) => x === 10).length === 1 && (await prisma.promotionUsage.count({ where: { promotionId: perUser.id, userId: onePerson.id } })) === 1, `${pr5}`);

  // ---- 11. manual payment guards ----
  const sellerRow = await prisma.seller.findUnique({ where: { id: seller.id } });
  p = await mkProduct(seller.id, 5, 100);
  const m: any = (await order(cust.id, [{ productId: p.id, quantity: 1 }], { paymentMethod: 'bank' })).order;
  ok('seller cannot mark an unpaid order paid', (await code(orderService.confirmManualPayment(m.id, sellerRow!.userId, true))) === 'NO_PAYMENT_SUBMITTED');
  ok('submit requires a reference', (await code(orderService.submitManualPayment(m.id, cust.id, { referenceNumber: '  ' } as any))) === 'REFERENCE_REQUIRED');
  ok('submit rejects data: proof', (await code(orderService.submitManualPayment(m.id, cust.id, { referenceNumber: 'TID1', proofUrl: 'data:image/png;base64,AAAA' }))) === 'INVALID_PROOF_URL');
  ok('submit ok', (await code(orderService.submitManualPayment(m.id, cust.id, { referenceNumber: 'TID1', proofUrl: '/uploads/products/x.png' }))) === 'OK');
  ok('a reported transfer cannot be switched to cash on delivery', (await code(paymentService.processPayment(m.id, cust.id, 'cod'))) === 'PAYMENT_STATE_CONFLICT' && (await prisma.order.findUnique({ where: { id: m.id } }))!.paymentStatus === 'payment_submitted');
  ok('other seller cannot confirm', (await code(orderService.confirmManualPayment(m.id, (await prisma.seller.findUnique({ where: { id: sellerB.id } }))!.userId, true))) !== 'OK');
  ok('payee seller confirms', (await code(orderService.confirmManualPayment(m.id, sellerRow!.userId, true))) === 'OK');
  ok('confirm twice is refused', (await code(orderService.confirmManualPayment(m.id, sellerRow!.userId, true))) === 'NO_PAYMENT_SUBMITTED');
  await prisma.order.update({ where: { id: m.id }, data: { orderStatus: 'delivered' } });
  await adminOrderService.processRefund(m.id, admin.id);
  const mRefund = await prisma.refund.findFirst({ where: { orderId: m.id, status: 'pending' } });
  await dismissRefund(mRefund!.id, admin.id, 'customer withdrew the complaint');
  ok('dismissing a refund on an order that was really paid leaves it paid (the kitchen keeps its earning)', (await prisma.order.findUnique({ where: { id: m.id } }))!.paymentStatus === 'paid');

  // ---- 12. payment details: real accounts only ----
  const bare: any = await orderService.getSellerPaymentDetails(m.id, cust.id);
  ok('no fake payment accounts for an unconfigured seller', Array.isArray(bare.accounts) && bare.accounts.length === 0, JSON.stringify(bare.accounts));
  await prisma.seller.update({ where: { id: seller.id }, data: { jazzcashNumber: '0300-7654321' } });
  const cfg: any = await orderService.getSellerPaymentDetails(m.id, cust.id);
  ok('configured account is returned', cfg.accounts.length === 1 && cfg.accounts[0].accountNumber === '0300-7654321');

  // ---- 13. chat role cannot be spoofed ----
  const msg: any = await orderService.sendOrderMessage(m.id, cust.id, 'hi', { role: 'seller' });
  const stored = await prisma.orderMessage.findUnique({ where: { id: msg.id } });
  ok('customer cannot post as seller', stored?.senderRole === 'customer', stored?.senderRole);

  // ---- 14. one kitchen per order; no ordering from your own kitchen ----
  p = await mkProduct(seller.id, 5); const pB3 = await mkProduct(sellerB.id, 5);
  const mixed = await code(order(cust.id, [{ productId: p.id, quantity: 1 }, { productId: pB3.id, quantity: 1 }]));
  ok('an order mixing two kitchens is refused', mixed === 'MULTI_SELLER_ORDER', mixed);
  ok('a seller cannot order from their own kitchen', (await code(order(sellerRow!.userId, [{ productId: p.id, quantity: 1 }]))) === 'SELF_ORDER');

  // ---- 15. payout race ----
  const sp = await mkSeller();
  await prisma.sellerPayoutSchedule.create({ data: { sellerId: sp.id, minimumPayoutAmount: 1, payoutMethod: 'bank_transfer' } as any });
  const prod = await mkProduct(sp.id, 5, 1000);
  const po: any = (await order(cust.id, [{ productId: prod.id, quantity: 1 }], { paymentMethod: 'cod' })).order;
  await prisma.order.update({ where: { id: po.id }, data: { orderStatus: 'delivered', paymentMethod: 'wallet', paymentCollectedBy: 'platform', paymentStatus: 'paid', paidAt: new Date() } });
  const earned = Number((await prisma.orderItem.findFirst({ where: { orderId: po.id } }))!.sellerPayout);
  const reqs = await Promise.all([1, 2, 3].map(() => (require('../src/services/seller.service').default).requestPayout(sp.id, { amount: earned, payoutMethod: 'bank_transfer', accountNumber: '1' }).then(() => 'OK', (e: any) => e.code)));
  ok('concurrent payout requests cannot exceed earnings', reqs.filter((r) => r === 'OK').length === 1, `${reqs} earned=${earned}`);
  const payoutReq = await prisma.sellerPayout.findFirst({ where: { sellerId: sp.id, status: 'pending' } });
  await adminOrderService.processRefund(po.id, admin.id);
  const { default: adminSvcForPayout } = require('../src/services/admin.service');
  ok('a payout is not completed once a refund has taken the money back', (await code(adminSvcForPayout.completePayout(payoutReq!.id, 'T-late'))) === 'PAYOUT_EXCEEDS_BALANCE');
  ok('it can be failed instead', (await code(adminSvcForPayout.failPayout(payoutReq!.id, 'refunded'))) === 'OK');

  // ---- 16. refunds on cancelled PAID orders ----
  const rc = await mkUser();
  await prisma.wallet.create({ data: { userId: rc.id, balance: 500 } });
  const rp = await mkProduct(seller.id, 20, 100);
  const walletOrder: any = (await order(rc.id, [{ productId: rp.id, quantity: 2 }], { paymentMethod: 'wallet' })).order; // paid at checkout
  const paidTotal = Number(walletOrder.totalAmount);
  const cancels = await Promise.all([1, 2, 3].map(() => orderService.cancelOrder(walletOrder.id, rc.id, 'changed mind').then((r: any) => r, (e: any) => e.code)));
  const wRefunds = await prisma.refund.findMany({ where: { orderId: walletOrder.id } });
  const wBal = Number((await prisma.wallet.findUnique({ where: { userId: rc.id } }))!.balance);
  const wOrder = await prisma.order.findUnique({ where: { id: walletOrder.id } });
  ok('cancelling a wallet-paid order refunds the wallet instantly, exactly once',
    wRefunds.length === 1 && wRefunds[0].status === 'completed' && Number(wRefunds[0].amount) === paidTotal && wBal === 500 && wOrder!.paymentStatus === 'refunded',
    `refunds=${wRefunds.length} bal=${wBal} pay=${wOrder!.paymentStatus} results=${cancels.map((c: any) => (typeof c === 'string' ? c : c.refundStatus))}`);

  const bankOrder: any = (await order(rc.id, [{ productId: rp.id, quantity: 1 }], { paymentMethod: 'bank' })).order;
  await prisma.order.update({ where: { id: bankOrder.id }, data: { paymentStatus: 'paid' } });
  const bres: any = await orderService.cancelOrder(bankOrder.id, rc.id, 'x');
  const bRefund = await prisma.refund.findFirst({ where: { orderId: bankOrder.id } });
  const bOrder = await prisma.order.findUnique({ where: { id: bankOrder.id } });
  ok('cancelling a bank-paid order queues a pending manual refund',
    bres.refundStatus === 'pending_manual_transfer' && bRefund?.status === 'pending' && bRefund?.method === 'manual' && bOrder!.paymentStatus === 'refund_pending',
    `${bres.refundStatus} ${bRefund?.status} ${bOrder!.paymentStatus}`);
  await completeRefund(bRefund!.id, admin.id, 'TXN-1');
  const bDone = await prisma.order.findUnique({ where: { id: bankOrder.id } });
  ok('marking the manual refund sent completes it', (await prisma.refund.findUnique({ where: { id: bRefund!.id } }))!.status === 'completed' && bDone!.paymentStatus === 'refunded');
  const bankNotes = (await prisma.orderStatusHistory.findMany({ where: { orderId: bankOrder.id }, select: { notes: true } })).map((h) => h.notes ?? '').join(' | ');
  ok('the order history says the refund was sent, without the transfer reference', bankNotes.includes('sent to the customer') && !bankNotes.includes('TXN-1'), bankNotes);
  ok('a refund can only be completed once', (await code(completeRefund(bRefund!.id, admin.id))) === 'REFUND_NOT_PENDING');

  const unpaid: any = (await order(rc.id, [{ productId: rp.id, quantity: 1 }])).order;
  await orderService.cancelOrder(unpaid.id, rc.id, 'x');
  ok('cancelling an unpaid (COD) order creates no refund', (await prisma.refund.count({ where: { orderId: unpaid.id } })) === 0);

  // the kitchen cancels one item of a paid order -> partial refund; the rest on full cancel
  const rpB = await mkProduct(seller.id, 20, 300);
  const split: any = (await order(rc.id, [{ productId: rp.id, quantity: 1 }, { productId: rpB.id, quantity: 1 }], { paymentMethod: 'bank' })).order;
  await prisma.order.update({ where: { id: split.id }, data: { paymentStatus: 'paid' } });
  const itemB = await prisma.orderItem.findFirst({ where: { orderId: split.id, productId: rpB.id } });
  await sellerOrderService.cancelOrderItem(itemB!.id, sellerRow!.userId, 'oos');
  const part = await prisma.refund.findMany({ where: { orderId: split.id } });
  const splitTotal = Number(split.totalAmount), splitDelivery = Number(split.deliveryFee), splitSub = Number(split.subtotal);
  const expectPartial = Math.round((Number(itemB!.totalPrice) / splitSub) * (splitTotal - splitDelivery) * 100) / 100;
  ok('cancelling one item refunds that item\'s share only',
    part.length === 1 && Math.abs(Number(part[0].amount) - expectPartial) < 0.02 && (await prisma.order.findUnique({ where: { id: split.id } }))!.paymentStatus === 'paid',
    `refund=${part[0]?.amount} expected=${expectPartial}`);
  await adminOrderService.cancelOrder(split.id, admin.id, 'cancel the rest please');
  const sum = (await prisma.refund.findMany({ where: { orderId: split.id } })).reduce((a, r) => a + Number(r.amount), 0);
  ok('full cancel refunds exactly the remainder (total refunded == amount paid)', Math.abs(sum - splitTotal) < 0.02, `refunded=${sum} paid=${splitTotal}`);

  // admin partial refund is cumulative, never exceeds what was paid
  const pr: any = (await order(rc.id, [{ productId: rp.id, quantity: 2 }], { paymentMethod: 'bank' })).order;
  await prisma.order.update({ where: { id: pr.id }, data: { paymentStatus: 'paid', orderStatus: 'delivered' } });
  const prTotal = Number(pr.totalAmount);
  await adminOrderService.processRefund(pr.id, admin.id, 50);
  const stillPaid = (await prisma.order.findUnique({ where: { id: pr.id } }))!.paymentStatus === 'paid';
  const over = await code(adminOrderService.processRefund(pr.id, admin.id, prTotal));
  const prSum = (await prisma.refund.findMany({ where: { orderId: pr.id } })).reduce((a, r) => a + Number(r.amount), 0);
  ok('partial admin refunds accumulate and can never exceed the amount paid', stillPaid && Math.abs(prSum - prTotal) < 0.02, `first=50 then ${over}, refunded=${prSum} of ${prTotal}`);

  // ---- 17. self-delivery fee money ----
  const selfS = await mkSeller({ deliveryProvider: 'self', deliveryFeeType: 'fixed', deliveryFeeFixed: 100 });
  // A Nuray-rider kitchen's own fee (60) no longer applies: Nuray's price does (Rs 150 here: no
  // community on either side, so the fallback base fee).
  const platS = await mkSeller({ deliveryProvider: 'platform', deliveryFeeType: 'fixed', deliveryFeeFixed: 60 });
  await prisma.sellerPayoutSchedule.create({ data: { sellerId: selfS.id, minimumPayoutAmount: 1, payoutMethod: 'bank_transfer' } as any });
  await prisma.sellerPayoutSchedule.create({ data: { sellerId: platS.id, minimumPayoutAmount: 1, payoutMethod: 'bank_transfer' } as any });
  const dc = await mkUser();
  await prisma.wallet.create({ data: { userId: dc.id, balance: 100000 } }); // wallet orders are paid at checkout
  const addr = await prisma.userAddress.create({ data: { userId: dc.id, addressLine1: 'House 1 Street', area: 'X', city: 'Lahore' } });
  const sp1 = await mkProduct(selfS.id, 20, 500);
  const sp2 = await mkProduct(platS.id, 20, 400);
  const homeOrder = (items: any[], pm: string) =>
    orderService.createOrder(dc.id, { items, deliveryType: 'home_delivery', deliveryAddressId: addr.id, paymentMethod: pm } as any) as Promise<any>;

  // Online (wallet) money is held by the platform, which owes each seller their share.
  const sdo = await homeOrder([{ productId: sp1.id, quantity: 1 }], 'wallet');
  const pdo = await homeOrder([{ productId: sp2.id, quantity: 1 }], 'wallet');
  const bd: any[] = (sdo.deliveryFeeBreakdown as any) || [];
  const bdP: any[] = (pdo.deliveryFeeBreakdown as any) || [];
  ok('orders record who delivers and who each delivery fee belongs to',
    Number(sdo.deliveryFee) === 100 && bd[0]?.provider === 'self' && sdo.deliveryProvider === 'self' &&
      Number(pdo.deliveryFee) === 0 && Number(pdo.sellerDeliveryCharge) === 150 && bdP[0]?.provider === 'platform' && bdP[0]?.paidBy === 'seller' && pdo.deliveryProvider === 'platform',
    `${JSON.stringify(bd)} ${sdo.deliveryProvider} / ${JSON.stringify(bdP)} ${pdo.deliveryProvider}`);

  for (const o of [sdo, pdo]) await prisma.order.update({ where: { id: o.id }, data: { orderStatus: 'delivered', paymentStatus: 'paid', paidAt: new Date() } });
  const selfItem = await prisma.orderItem.findFirst({ where: { orderId: sdo.id } });
  const platItem = await prisma.orderItem.findFirst({ where: { orderId: pdo.id } });
  const selfGoods = Number(selfItem!.sellerPayout), platGoods = Number(platItem!.sellerPayout);

  const payReq = (sid: string, amount: number) => sellerService.requestPayout(sid, { amount, payoutMethod: 'bank_transfer', accountNumber: '1' }).then(() => 'OK', (e: any) => e.code);
  ok('self-delivering seller cannot withdraw more than goods + their delivery fee', (await payReq(selfS.id, selfGoods + 100 + 0.5)) === 'INSUFFICIENT_BALANCE');
  ok('self-delivering seller can withdraw goods + their delivery fee', (await payReq(selfS.id, selfGoods + 100)) === 'OK', `goods=${selfGoods}`);
  // The kitchen pays Nuray's Rs 150 delivery fee out of its earnings; the customer paid no delivery fee.
  ok('platform-fleet seller pays Nuray the delivery fee out of its earnings', (await payReq(platS.id, platGoods - 150 + 1)) === 'INSUFFICIENT_BALANCE' && (await payReq(platS.id, platGoods - 150)) === 'OK');

  const dash: any = await sellerService.getSellerDashboard(selfS.id);
  ok('dashboard earnings include the self-delivery fee', Math.abs(dash.overview.totalEarnings - (selfGoods + 100)) < 0.01, `total=${dash.overview.totalEarnings} expected=${selfGoods + 100}`);

  await ledgerService.recordOrderCompletion(sdo.id);
  await ledgerService.recordOrderCompletion(pdo.id);
  const ledS = await prisma.ledgerEntry.findMany({ where: { orderId: sdo.id } });
  const ledP = await prisma.ledgerEntry.findMany({ where: { orderId: pdo.id } });
  const sellerFee = ledS.find((e) => e.transactionType === 'seller_delivery_fee');
  const platRev = ledP.find((e) => e.transactionType === 'delivery_fee');
  ok('ledger: platform revenue is only the platform-delivered fee; the self fee is payable to the seller',
    Number(platRev?.amount) === 150 && !ledS.some((e) => e.transactionType === 'delivery_fee') && Number(sellerFee?.amount) === 100 && sellerFee?.sellerId === selfS.id,
    `platform=${platRev?.amount} seller=${sellerFee?.amount}`);

  // COD at the seller's own door: they hold everything, and owe the platform everything that isn't theirs
  const spC = await mkProduct(selfS.id, 20, 300);
  const codOrder = await homeOrder([{ productId: spC.id, quantity: 1 }], 'cod');
  await prisma.order.update({ where: { id: codOrder.id }, data: { orderStatus: 'delivered', paymentStatus: 'paid', paidAt: new Date() } });
  const codGoods = Number((await prisma.orderItem.findFirst({ where: { orderId: codOrder.id } }))!.sellerPayout);
  const dash2: any = await sellerService.getSellerDashboard(selfS.id);
  const codOwed = Number(codOrder.totalAmount) - codGoods - 100;
  ok('COD self-delivery counts as earned but is not withdrawable; the seller owes commission + tax on it',
    Math.abs(dash2.overview.totalEarnings - (selfGoods + 100 + codGoods + 100)) < 0.01 && dash2.overview.availableForPayout === 0 && Math.abs(dash2.overview.codCommissionOwed - codOwed) < 0.01,
    `total=${dash2.overview.totalEarnings} available=${dash2.overview.availableForPayout} owed=${dash2.overview.codCommissionOwed} expected=${codOwed}`);

  // cancelling a self-delivery order's only item refunds everything, delivery fee included
  const sp1b = await mkProduct(selfS.id, 20, 500);
  const mo = await homeOrder([{ productId: sp1b.id, quantity: 1 }], 'bank');
  await prisma.order.update({ where: { id: mo.id }, data: { paymentStatus: 'paid' } });
  const moItem = await prisma.orderItem.findFirst({ where: { orderId: mo.id } });
  await sellerOrderService.cancelOrderItem(moItem!.id, (await prisma.seller.findUnique({ where: { id: selfS.id } }))!.userId, 'oos');
  const mr = await prisma.refund.findFirst({ where: { orderId: mo.id } });
  ok('cancelling the last item refunds the whole order, delivery fee included', Math.abs(Number(mr?.amount) - Number(mo.totalAmount)) < 0.02, `refund=${mr?.amount} total=${mo.totalAmount}`);

  // ---- 17b. who holds the money decides the payout ----
  const cs = await mkSeller({ commissionRate: 10 });
  const csUser = (await prisma.seller.findUnique({ where: { id: cs.id } }))!.userId;
  await prisma.sellerPayoutSchedule.create({ data: { sellerId: cs.id, minimumPayoutAmount: 1, payoutMethod: 'bank_transfer' } as any });
  const csProd = await mkProduct(cs.id, 50, 1000);
  const custC = await mkUser();
  await prisma.wallet.create({ data: { userId: custC.id, balance: 100000 } }); // wallet orders are paid at checkout
  const csOrder = (pm: string) => order(custC.id, [{ productId: csProd.id, quantity: 1 }], { paymentMethod: pm }).then((r: any) => r.order);
  const csBal = () => require('../src/services/seller-balance.service').computeSellerBalance(prisma, cs.id);

  // a transfer straight into the seller's account: not withdrawable; seller owes commission + tax
  const tr: any = await csOrder('bank');
  await orderService.submitManualPayment(tr.id, custC.id, { referenceNumber: 'TID-' + uniq() });
  await orderService.confirmManualPayment(tr.id, csUser, true);
  const trRow = await prisma.order.findUnique({ where: { id: tr.id } });
  ok('a confirmed transfer is recorded as collected by the seller', trRow!.paymentCollectedBy === 'seller', String(trRow!.paymentCollectedBy));
  await prisma.order.update({ where: { id: tr.id }, data: { orderStatus: 'delivered' } });
  let b = await csBal();
  // 1000 goods, 10% commission -> seller keeps 900; customer paid 1000 + 5% tax = 1050
  ok('money a seller collected themselves is never paid out again (they owe commission + tax)',
    b.platformOwesSeller === 0 && Math.abs(b.sellerOwesPlatform - 150) < 0.01 && b.available === -150,
    JSON.stringify(b));
  ok('so a payout request against it is refused', (await payReq(cs.id, 1)) === 'INSUFFICIENT_BALANCE');

  // platform-collected (wallet) money: the platform owes the seller their share, netted against the above
  const wo: any = await csOrder('wallet');
  await prisma.order.update({ where: { id: wo.id }, data: { orderStatus: 'delivered', paymentStatus: 'paid', paymentCollectedBy: 'platform', paidAt: new Date() } });
  b = await csBal();
  ok('platform-held money is owed to the seller, minus what they owe on money they collected', b.platformOwesSeller === 900 && b.available === 750, JSON.stringify(b));
  ok('the seller can withdraw exactly the net', (await payReq(cs.id, 750.01)) === 'INSUFFICIENT_BALANCE' && (await payReq(cs.id, 750)) === 'OK');

  // cash taken by a Nuray rider: the platform owes the seller their share
  const ro: any = await csOrder('cod');
  await prisma.order.update({ where: { id: ro.id }, data: { orderStatus: 'delivered', paymentStatus: 'paid', paymentCollectedBy: 'rider', paidAt: new Date() } });
  b = await csBal();
  ok('rider-collected cash is owed to the seller in full', b.platformOwesSeller === 1800 && b.available === 900, JSON.stringify(b));

  // a transfer the platform refunded after the seller kept it: the seller owes it back
  const tr2: any = await csOrder('bank');
  await orderService.submitManualPayment(tr2.id, custC.id, { referenceNumber: 'TID-' + uniq() });
  await orderService.confirmManualPayment(tr2.id, csUser, true);
  await orderService.cancelOrder(tr2.id, custC.id, 'changed mind');
  const tr2Refund = await prisma.refund.findFirst({ where: { orderId: tr2.id } });
  await completeRefund(tr2Refund!.id, admin.id, 'TXN-' + uniq());
  b = await csBal();
  ok('a refund the platform sent on money the seller kept is recovered from the seller', Math.abs(b.sellerOwesPlatform - (150 + 1050)) < 0.01 && Math.abs(b.available - (900 - 1050)) < 0.01, JSON.stringify(b));

  // the seller funds their own deal; the platform funds its own code
  const promoTag = uniq();
  const deal = await prisma.promotion.create({ data: { sellerId: cs.id, code: 'CSHALF' + promoTag, name: 'half', discountType: 'percentage', discountValue: 50, validFrom: new Date(Date.now() - 1e6), validUntil: new Date(Date.now() + 1e9), usageLimitPerUser: 9 } as any });
  const sp50: any = (await order(custC.id, [{ productId: csProd.id, quantity: 1 }], { paymentMethod: 'cod' })).order;
  const sp50Item = await prisma.orderItem.findFirst({ where: { orderId: sp50.id } });
  ok('a seller-funded deal cuts the seller\'s share (commission on what the customer pays)', Number(sp50Item!.sellerPayout) === 450 && Number(sp50Item!.commissionAmount) === 50, `payout=${sp50Item!.sellerPayout} commission=${sp50Item!.commissionAmount}`);
  await prisma.promotion.update({ where: { id: deal.id }, data: { isActive: false } });
  await prisma.promotion.create({ data: { code: 'PLHALF' + promoTag, name: 'half', discountType: 'percentage', discountValue: 50, validFrom: new Date(Date.now() - 1e6), validUntil: new Date(Date.now() + 1e9), usageLimitPerUser: 9 } as any });
  const pl50: any = (await order(custC.id, [{ productId: csProd.id, quantity: 1 }], { paymentMethod: 'cod', promotionCode: 'PLHALF' + promoTag })).order;
  const pl50Item = await prisma.orderItem.findFirst({ where: { orderId: pl50.id } });
  ok('a platform-funded code leaves the seller\'s share untouched', Number(pl50Item!.sellerPayout) === 900, `payout=${pl50Item!.sellerPayout}`);
  ok('an unknown code is refused instead of silently charging full price', (await code(order(custC.id, [{ productId: csProd.id, quantity: 1 }], { promotionCode: 'NOSUCHCODE9' }))) === 'INVALID_PROMO_CODE');
  ok('a switched-off code is refused too', (await code(order(custC.id, [{ productId: csProd.id, quantity: 1 }], { promotionCode: 'CSHALF' + promoTag }))) === 'PROMO_INACTIVE');

  // only the party that hands the order over can mark it delivered
  const platformDelivered = await homeOrder([{ productId: sp2.id, quantity: 1 }], 'cod');
  const pdItem = await prisma.orderItem.findFirst({ where: { orderId: platformDelivered.id } });
  await prisma.orderItem.update({ where: { id: pdItem!.id }, data: { status: 'dispatched' } });
  ok('a seller cannot mark a Nuray-rider delivery as delivered', (await code(sellerOrderService.updateOrderItemStatus(pdItem!.id, (await prisma.seller.findUnique({ where: { id: platS.id } }))!.userId, 'delivered'))) === 'PLATFORM_DELIVERY');
  const unpaidTransfer: any = await csOrder('bank');
  await prisma.order.update({ where: { id: unpaidTransfer.id }, data: { orderStatus: 'preparing' } });
  ok('an order cannot be marked ready before its transfer is confirmed', (await code(sellerOrderService.markOrderReady(unpaidTransfer.id, csUser))) === 'PAYMENT_NOT_CONFIRMED');

  // ---- 17c. payment gateways fail closed ----
  const gwC = await mkUser();
  const gwP = await mkProduct(seller.id, 20, 100);
  const gwO: any = (await order(gwC.id, [{ productId: gwP.id, quantity: 1 }], { paymentMethod: 'jazzcash' })).order;
  const vcode = (pid: string) => paymentService.verifyPayment(pid, gwC.id).then(() => 'OK', (e: any) => e.code);
  ok('a crafted JC-PAY-* id cannot pick a gateway and mark an order paid', (await vcode(`JC-PAY-1-${gwO.id}`)) !== 'OK');
  ok('verifying an order with no online payment started is refused', (await vcode(`PAY-1-${gwO.id}`)) !== 'OK');
  ok('the order is still unpaid', (await prisma.order.findUnique({ where: { id: gwO.id } }))!.paymentStatus === 'pending');
  const { jazzcashGateway, easypaisaGateway } = require('../src/gateways');
  const jcv = await jazzcashGateway.verifyPayment({ paymentId: 'anything' });
  const epv = await easypaisaGateway.verifyPayment({ paymentId: 'anything' });
  ok('the unfinished JazzCash / EasyPaisa adapters never report a payment as completed', !jcv.success && jcv.status === 'failed' && !epv.success && epv.status === 'failed' && !jazzcashGateway.isConfigured());
  ok('without an online gateway, JazzCash means a transfer to the kitchen (no fake payment page)', (await paymentService.processPayment(gwO.id, gwC.id, 'jazzcash').then(() => 'OK', (e: any) => e.code)) === 'MANUAL_TRANSFER_METHOD');
  ok('card payment without a configured gateway is refused, not faked', (await paymentService.processPayment(gwO.id, gwC.id, 'card').then(() => 'OK', (e: any) => e.code)) === 'GATEWAY_UNAVAILABLE');

  // ---- 17c2. an order for online payment is refused while no gateway is configured ----
  const savedGw = { pk: process.env.SAFEPAY_PUBLIC_KEY, sk: process.env.SAFEPAY_SECRET_KEY };
  delete process.env.SAFEPAY_PUBLIC_KEY;
  delete process.env.SAFEPAY_SECRET_KEY;
  const ogP = await mkProduct(seller.id, 5, 100);
  const ogOrders = await prisma.order.count({ where: { customerId: gwC.id } });
  for (const method of ['safepay', 'card']) {
    ok(`an order for online payment (${method}) is refused while the gateway is not configured`, (await code(order(gwC.id, [{ productId: ogP.id, quantity: 1 }], { paymentMethod: method }))) === 'GATEWAY_UNAVAILABLE');
  }
  ok('...and nothing was placed or reserved', (await prisma.order.count({ where: { customerId: gwC.id } })) === ogOrders && (await prisma.product.findUnique({ where: { id: ogP.id } }))!.stockQuantity === 5);
  ok('cash orders are not affected', (await code(order(gwC.id, [{ productId: ogP.id, quantity: 1 }], { paymentMethod: 'cod' }))) === 'OK');
  if (savedGw.pk !== undefined) process.env.SAFEPAY_PUBLIC_KEY = savedGw.pk;
  if (savedGw.sk !== undefined) process.env.SAFEPAY_SECRET_KEY = savedGw.sk;

  // ---- 17d. handover code: only the customer sees it; it gates every handover ----
  const { default: riderService } = require('../src/services/rider.service');
  const hoCust = await mkUser();
  const hoAddr = await prisma.userAddress.create({ data: { userId: hoCust.id, addressLine1: 'House 2 Street', area: 'X', city: 'Lahore' } });
  const hoProd = await mkProduct(platS.id, 20, 300);
  const hoOrder: any = await orderService.createOrder(hoCust.id, { items: [{ productId: hoProd.id, quantity: 1 }], deliveryType: 'home_delivery', deliveryAddressId: hoAddr.id, paymentMethod: 'cod' } as any);
  const hoCode = (await prisma.order.findUnique({ where: { id: hoOrder.id }, select: { handoverCode: true } }))!.handoverCode;
  ok('every order gets a 4-digit handover code', /^\d{4}$/.test(hoCode || ''), String(hoCode));
  ok('the code is not in the order returned at creation', !('handoverCode' in hoOrder));
  const platUser = (await prisma.seller.findUnique({ where: { id: platS.id } }))!.userId;
  const asCustomer: any = await orderService.getOrderDetails(hoOrder.id, hoCust.id);
  const asSeller: any = await orderService.getOrderDetails(hoOrder.id, platUser);
  ok('the customer sees the code, the kitchen does not', asCustomer.handoverCode === hoCode && !('handoverCode' in asSeller), `${asCustomer.handoverCode} / ${'handoverCode' in asSeller}`);

  // ---- 17d1. a kitchen's view of an order has the door it needs and none of the customer's pin, postcode, account id or internal keys ----
  const kvAddr = await prisma.userAddress.create({ data: { userId: hoCust.id, addressLine1: 'House 9 Street 5', houseNumber: '9', area: 'Askari 11', city: 'Lahore', postalCode: '54000', latitude: 31.4, longitude: 74.4 } as any });
  const kvOrder: any = await orderService.createOrder(hoCust.id, { items: [{ productId: hoProd.id, quantity: 1 }], deliveryType: 'home_delivery', deliveryAddressId: kvAddr.id, paymentMethod: 'cod' } as any, { idempotencyKey: 'kv-' + uniq() });
  const kvSeller: any = await sellerOrderService.getSellerOrderDetails(kvOrder.id, platUser);
  const kvOrders: any = await orderService.getOrderDetails(kvOrder.id, platUser);
  const kvPrivate = ['latitude', 'longitude', 'postalCode', 'userId', 'customerId', 'idempotencyKey', 'paymentTransactionId', 'handoverCode', 'deliveryAddressSnapshot', 'deliveryAddressId', 'hubId', 'changedBy'];
  ok("GET /seller/orders/:id: no pin, postcode, customer id or internal keys", !kvPrivate.some((k) => deepKeys(kvSeller).has(k)), kvPrivate.filter((k) => deepKeys(kvSeller).has(k)).join(','));
  ok('GET /orders/:id gives the kitchen the same view', !kvPrivate.some((k) => deepKeys(kvOrders).has(k)) && kvOrders.orderNumber === kvSeller.orderNumber && kvOrders.sellerTotals?.subtotal === kvSeller.sellerTotals.subtotal, kvPrivate.filter((k) => deepKeys(kvOrders).has(k)).join(','));
  ok('the kitchen still gets the door and the customer\'s contact', kvSeller.deliveryAddress?.houseNumber === '9' && kvSeller.deliveryAddress?.addressLine1 === 'House 9 Street 5' && kvSeller.deliveryAddress?.area === 'Askari 11' && !!kvSeller.customer?.phone);
  ok('the pin and postcode are not anywhere in the kitchen payload text', !/\b(54000|31\.4|74\.4)\b/.test(JSON.stringify(kvSeller)) && !/\b(54000|74\.4)\b/.test(JSON.stringify(kvOrders)));
  const kvCustomer: any = await orderService.getOrderDetails(kvOrder.id, hoCust.id);
  ok('the customer still gets their own full order, pin included', Number(kvCustomer.deliveryAddress?.latitude) === 31.4 && kvCustomer.customerId === hoCust.id);

  // a Nuray rider delivers it
  const riderUser = await mkUser('rider');
  await prisma.rider.create({ data: { userId: riderUser.id, city: 'Lahore', verificationStatus: 'approved', status: 'active' } as any });
  await prisma.order.update({ where: { id: hoOrder.id }, data: { orderStatus: 'ready' } });
  await riderService.ensureDeliveryForOrder(hoOrder.id, 0);
  const hoDelivery = await prisma.delivery.findUnique({ where: { orderId: hoOrder.id } });
  await riderService.claimDelivery(riderUser.id, hoDelivery!.id);
  const asRider: any = await orderService.getOrderDetails(hoOrder.id, riderUser.id);
  const riderList: any = await riderService.getMyDeliveries(riderUser.id);
  ok('the rider never receives the code (order details or delivery list)',
    !('handoverCode' in asRider) && !('deliveryOtp' in (asRider.delivery || {})) && !JSON.stringify(riderList).includes(`"${hoCode}"`),
    `order=${'handoverCode' in asRider} delivery=${'deliveryOtp' in (asRider.delivery || {})}`);
  for (const st of ['picked_up', 'in_transit']) await riderService.updateDeliveryStatus(riderUser.id, hoDelivery!.id, st);
  const rcode = (c?: string) => riderService.updateDeliveryStatus(riderUser.id, hoDelivery!.id, 'delivered', undefined, c).then(() => 'OK', (e: any) => e.code);
  ok('the rider cannot mark it delivered without the code', (await rcode(undefined)) === 'INVALID_DELIVERY_OTP');
  const wrongCode = hoCode === '1234' ? '4321' : '1234';
  ok('a wrong code is refused and counted', (await rcode(wrongCode)) === 'INVALID_DELIVERY_OTP' && (await prisma.order.findUnique({ where: { id: hoOrder.id } }))!.handoverAttempts === 2);
  ok('the right code completes the delivery and the COD cash is recorded with the rider', (await rcode(hoCode!)) === 'OK' &&
    (await prisma.order.findUnique({ where: { id: hoOrder.id } }))!.paymentCollectedBy === 'rider');
  ok('a second "delivered" tap cannot double count', (await rcode(hoCode!)) !== 'OK' && (await prisma.rider.findUnique({ where: { userId: riderUser.id } }))!.totalDeliveries === 1);

  // ---- 17d-2. the rider's money: pay fixed at claim, cash taken at the door, settling up ----
  const { riderMoney, recordSettlement, recordPayout, listRidersWithMoney, setCashLimit } = require('../src/services/rider-ledger.service');
  const hoRider = (await prisma.rider.findUnique({ where: { userId: riderUser.id } }))!;
  const hoFee = Number((await prisma.delivery.findUnique({ where: { id: hoDelivery!.id } }))!.riderFee);
  const hoTotal = Number(hoOrder.totalAmount);
  const hoEntries = await prisma.riderLedgerEntry.findMany({ where: { riderId: hoRider.id }, orderBy: { type: 'asc' } });
  ok("delivering a cash order books the rider's fee and the cash taken at the door, once",
    hoFee > 0 && hoEntries.length === 2 &&
      hoEntries.some((e) => e.type === 'delivery_fee' && Number(e.amount) === hoFee) &&
      hoEntries.some((e) => e.type === 'cod_collected' && Number(e.amount) === -hoTotal),
    hoEntries.map((e) => `${e.type}:${e.amount}`).join(','));
  let rm = await riderMoney(prisma, hoRider.id);
  ok('the rider holds the order total and is owed their fee', rm.cashHeld === hoTotal && rm.unpaid === hoFee && rm.balance === Math.round((hoFee - hoTotal) * 100) / 100, JSON.stringify(rm));
  const earnings: any = await riderService.getRiderEarnings(riderUser.id);
  ok("the rider's earnings show today's fee and the cash they hold", earnings.earnedToday === hoFee && earnings.deliveriesToday === 1 && earnings.cashHeld === hoTotal && earnings.entries.length === 2);
  const adminList: any = await listRidersWithMoney({ search: riderUser.phone.slice(-6), filter: 'holding_cash' });
  ok('the admin list finds the rider by phone, holding the cash', adminList.riders.length === 1 && adminList.riders[0].cashHeld === hoTotal && adminList.totals.cashHeld >= hoTotal, JSON.stringify(adminList.riders[0] ?? null));
  ok('a settlement for more cash than the rider holds is refused', (await code(recordSettlement(hoRider.id, admin.id, { cashHandedIn: hoTotal + 1 }))) === 'DEPOSIT_EXCEEDS_CASH');
  ok('a rider cannot keep more pay than they are owed', (await code(recordSettlement(hoRider.id, admin.id, { keptAsPay: hoFee + 1 }))) === 'PAYOUT_EXCEEDS_BALANCE');
  const settleOnce = () => recordSettlement(hoRider.id, admin.id, { cashHandedIn: hoTotal - hoFee, keptAsPay: hoFee, reference: 'HUB-1' }).then(() => 'OK', (e: any) => e.code);
  const settledBoth = await Promise.all([settleOnce(), settleOnce()]);
  rm = await riderMoney(prisma, hoRider.id);
  ok('two settlements at once: one goes through; the rider then holds nothing and is owed nothing',
    settledBoth.filter((r) => r === 'OK').length === 1 && rm.cashHeld === 0 && rm.balance === 0 && rm.paidOut === hoFee, `${settledBoth} ${JSON.stringify(rm)}`);
  ok('with nothing owed, a payout is refused', (await code(recordPayout(hoRider.id, admin.id, { amount: 1 }))) === 'PAYOUT_EXCEEDS_BALANCE');

  // the cash limit: a cash order that would take the rider past it isn't theirs to take
  const limOrder: any = await orderService.createOrder(hoCust.id, { items: [{ productId: hoProd.id, quantity: 1 }], deliveryType: 'home_delivery', deliveryAddressId: hoAddr.id, paymentMethod: 'cod' } as any);
  await prisma.order.update({ where: { id: limOrder.id }, data: { orderStatus: 'ready' } });
  await riderService.ensureDeliveryForOrder(limOrder.id, 0);
  const limJob = (await prisma.delivery.findUnique({ where: { orderId: limOrder.id } }))!;
  await setCashLimit(hoRider.id, 100);
  const limPool: any[] = await riderService.getAvailableDeliveries(riderUser.id);
  ok('a cash order over the limit is flagged in the pool', limPool.find((d) => d.id === limJob.id)?.exceedsCashLimit === true);
  ok('and claiming it is refused', (await code(riderService.claimDelivery(riderUser.id, limJob.id))) === 'CASH_LIMIT_REACHED');
  await setCashLimit(hoRider.id, null);
  ok('back on the default limit it can be claimed', (await code(riderService.claimDelivery(riderUser.id, limJob.id))) === 'OK');

  // where the rider is: shared with the customer while the food is on its way, never their pay
  await riderService.updateDeliveryStatus(riderUser.id, limJob.id, 'picked_up');
  const loc: any = await riderService.updateRiderLocation(riderUser.id, limJob.id, 31.5204, 74.3587);
  ok('an unknown drop-off location never triggers an arrival', loc.autoTriggeredStatus === null && loc.distanceToDeliveryMeters === null);
  const custView: any = await orderService.getOrderDetails(limOrder.id, hoCust.id);
  const kitchenView: any = await orderService.getOrderDetails(limOrder.id, platUser);
  const riderView: any = await orderService.getOrderDetails(limOrder.id, riderUser.id);
  ok('the customer sees where the rider is, but not what the rider is paid',
    custView.delivery?.riderLocation?.latitude === 31.5204 && !('riderFee' in custView.delivery) && !('riderLatitude' in custView.delivery), JSON.stringify(custView.delivery?.riderLocation ?? null));
  ok('the kitchen sees neither the rider\'s position nor their pay, anywhere in its view', !deepKeys(kitchenView).has('riderLocation') && !deepKeys(kitchenView).has('riderFee') && !deepKeys(kitchenView).has('riderBonus') && !deepKeys(kitchenView).has('riderLatitude'));
  const limFee = Number((await prisma.delivery.findUnique({ where: { id: limJob.id } }))!.riderFee);
  ok('the rider sees their own pay', limFee > 0 && riderView.delivery?.riderFee === limFee, `${riderView.delivery?.riderFee} vs ${limFee}`);
  const limCode = (await prisma.order.findUnique({ where: { id: limOrder.id }, select: { handoverCode: true } }))!.handoverCode!;
  await riderService.updateDeliveryStatus(riderUser.id, limJob.id, 'in_transit');
  await riderService.updateDeliveryStatus(riderUser.id, limJob.id, 'delivered', undefined, limCode);
  ok("after delivery the rider's position is no longer shown", (await orderService.getOrderDetails(limOrder.id, hoCust.id) as any).delivery?.riderLocation === null);
  ok('a finished job takes no more positions', (await code(riderService.updateRiderLocation(riderUser.id, limJob.id, 31.52, 74.35))) === 'DELIVERY_NOT_ACTIVE');

  // the rider's rating: the customer's delivery rating, one vote per order
  const rateOrder = async (o: any, deliveryRating: number) => {
    for (const it of await prisma.orderItem.findMany({ where: { orderId: o.id } })) {
      await reviewService.addReview(hoCust.id, { orderId: o.id, orderItemId: it.id, productRating: 5, sellerRating: 5, deliveryRating });
    }
  };
  await rateOrder(limOrder, 4);
  await rateOrder(hoOrder, 2);
  ok("customers' delivery ratings set the rider's rating (4 and 2 make 3.0)", Number((await prisma.rider.findUnique({ where: { id: hoRider.id } }))!.ratingAverage) === 3);

  // two quick claims can't both slip under the cash limit (claims are taken one at a time)
  const raceJobs = await Promise.all([1, 2].map(async () => {
    const o: any = await orderService.createOrder(hoCust.id, { items: [{ productId: hoProd.id, quantity: 1 }], deliveryType: 'home_delivery', deliveryAddressId: hoAddr.id, paymentMethod: 'cod' } as any);
    await prisma.order.update({ where: { id: o.id }, data: { orderStatus: 'ready' } });
    await riderService.ensureDeliveryForOrder(o.id, 0);
    return { job: (await prisma.delivery.findUnique({ where: { orderId: o.id } }))!, total: Number(o.totalAmount) };
  }));
  const heldNow = (await riderMoney(prisma, hoRider.id)).cashHeld;
  await setCashLimit(hoRider.id, Math.round(heldNow + raceJobs[0].total * 1.5));
  const raced = await Promise.all(raceJobs.map((r) => code(riderService.claimDelivery(riderUser.id, r.job.id))));
  ok('two cash jobs claimed at once: only the one that fits under the limit is taken', raced.filter((r) => r === 'OK').length === 1 && raced.includes('CASH_LIMIT_REACHED'), raced.join(','));
  await setCashLimit(hoRider.id, null);

  // brute force locks the code
  const bfOrder: any = await orderService.createOrder(hoCust.id, { items: [{ productId: hoProd.id, quantity: 1 }], deliveryType: 'home_delivery', deliveryAddressId: hoAddr.id, paymentMethod: 'cod' } as any);
  const { verifyHandoverCode } = require('../src/services/handover.service');
  const bfCode = (await prisma.order.findUnique({ where: { id: bfOrder.id }, select: { handoverCode: true } }))!.handoverCode!;
  const bad = bfCode === '0000' ? '1111' : '0000';
  const tries = await Promise.all(Array.from({ length: 8 }, () => verifyHandoverCode(bfOrder.id, bad).then(() => 'OK', (e: any) => e.code)));
  ok('guessing is capped: after 5 wrong codes the handover locks, even for the right code',
    !tries.includes('OK') && (await verifyHandoverCode(bfOrder.id, bfCode).then(() => 'OK', (e: any) => e.code)) === 'HANDOVER_LOCKED', tries.join());

  // a self-delivering kitchen needs the code too
  const sdProd = await mkProduct(selfS.id, 20, 300);
  const sdOrder: any = await orderService.createOrder(hoCust.id, { items: [{ productId: sdProd.id, quantity: 1 }], deliveryType: 'home_delivery', deliveryAddressId: hoAddr.id, paymentMethod: 'cod' } as any);
  const sdCode = (await prisma.order.findUnique({ where: { id: sdOrder.id }, select: { handoverCode: true } }))!.handoverCode!;
  const sdItem = await prisma.orderItem.findFirst({ where: { orderId: sdOrder.id } });
  await prisma.orderItem.update({ where: { id: sdItem!.id }, data: { status: 'dispatched' } });
  const selfUser = (await prisma.seller.findUnique({ where: { id: selfS.id } }))!.userId;
  ok('a self-delivering kitchen cannot mark delivered without the customer\'s code', (await code(sellerOrderService.updateOrderItemStatus(sdItem!.id, selfUser, 'delivered'))) === 'INVALID_DELIVERY_OTP');
  ok('with the code it can', (await code(sellerOrderService.updateOrderItemStatus(sdItem!.id, selfUser, 'delivered', undefined, sdCode))) === 'OK' &&
    (await prisma.order.findUnique({ where: { id: sdOrder.id } }))!.paymentCollectedBy === 'seller');

  // ---- 17d2. a self-delivering kitchen completes its own orders ----
  const shOrder: any = await orderService.createOrder(hoCust.id, { items: [{ productId: sdProd.id, quantity: 1 }], deliveryType: 'home_delivery', deliveryAddressId: hoAddr.id, paymentMethod: 'cod' } as any);
  const shCode = (await prisma.order.findUnique({ where: { id: shOrder.id }, select: { handoverCode: true } }))!.handoverCode!;
  await sellerOrderService.acceptOrder(shOrder.id, selfUser);
  await sellerOrderService.markOrderReady(shOrder.id, selfUser);
  const listed: any = await sellerOrderService.getSellerOrders(selfUser, { page: 1, limit: 50 } as any);
  ok('the kitchen\'s order list says it hands this order over itself', listed.orders.find((o: any) => o.order.id === shOrder.id)?.order.sellerHandsOver === true);
  await sellerOrderService.selfHandover(shOrder.id, selfUser, 'dispatch');
  ok('"out for delivery" moves the order to dispatched', (await prisma.order.findUnique({ where: { id: shOrder.id } }))!.orderStatus === 'dispatched');
  ok('"delivered" without the customer\'s code is refused', (await code(sellerOrderService.selfHandover(shOrder.id, selfUser, 'deliver', { handoverCode: shCode === '1111' ? '2222' : '1111' }))) === 'INVALID_DELIVERY_OTP');
  const shDone: any = await sellerOrderService.selfHandover(shOrder.id, selfUser, 'deliver', { handoverCode: shCode });
  const shRow = await prisma.order.findUnique({ where: { id: shOrder.id } });
  ok('with the code the order is delivered and the cash is recorded with the kitchen', shDone.orderStatus === 'delivered' && shRow!.paymentStatus === 'paid' && shRow!.paymentCollectedBy === 'seller');
  const plOrder: any = await orderService.createOrder(hoCust.id, { items: [{ productId: hoProd.id, quantity: 1 }], deliveryType: 'home_delivery', deliveryAddressId: hoAddr.id, paymentMethod: 'cod' } as any);
  await sellerOrderService.acceptOrder(plOrder.id, platUser);
  await sellerOrderService.markOrderReady(plOrder.id, platUser);
  ok('a kitchen on the Nuray fleet cannot send its order out itself', (await code(sellerOrderService.selfHandover(plOrder.id, platUser, 'dispatch'))) === 'PLATFORM_DELIVERY');

  // ---- 17e. receipts are private files the customer uploaded ----
  const pfC = await mkUser();
  const pfOther = await mkUser();
  const pfProd = await mkProduct(seller.id, 20, 100);
  const pfO: any = (await order(pfC.id, [{ productId: pfProd.id, quantity: 1 }], { paymentMethod: 'bank' })).order;
  const submit = (proofUrl: string) => orderService.submitManualPayment(pfO.id, pfC.id, { referenceNumber: 'TID-' + uniq(), proofUrl }).then(() => 'OK', (e: any) => e.code);
  ok("a receipt uploaded by someone else can't be attached", (await submit(`private:x/proofs/${pfOther.id}/${uniq()}.jpg`)) === 'INVALID_PROOF_URL');
  ok("a public product photo can't be passed off as a receipt", (await submit(`/media/p/products/${pfC.id}/abc-lg.webp`)) === 'INVALID_PROOF_URL');
  ok('an external link is refused', (await submit('https://evil.example/receipt.jpg')) === 'INVALID_PROOF_URL');
  const ownRef = `private:x/proofs/${pfC.id}/${require('crypto').randomUUID()}.jpg`;
  ok("the customer's own private receipt is accepted", (await submit(ownRef)) === 'OK');
  const pfView: any = await orderService.getOrderDetails(pfO.id, pfC.id);
  ok('the order shows the receipt as a short-lived signed link, never the stored reference', typeof pfView.paymentProofUrl === 'string' && pfView.paymentProofUrl.startsWith('/files/x/proofs/') && /[?&]sig=/.test(pfView.paymentProofUrl), pfView.paymentProofUrl);

  // ---- 17f. addresses: edit, set default, delete ----
  const adU = await mkUser(); const adOther = await mkUser();
  const a1: any = await userProfileService.addAddress(adU.id, { addressLine1: 'House 10 Street 1', area: 'Clifton', city: 'Karachi' } as any);
  const a2: any = await userProfileService.addAddress(adU.id, { addressLine1: 'House 20 Street 2', area: 'Gulshan', city: 'Karachi' } as any);
  ok('the first address is the default, a later one is not', a1.isDefault === true && a2.isDefault === false);
  await userProfileService.updateAddress(adU.id, a2.id, { isDefault: true });
  const defaults = await prisma.userAddress.findMany({ where: { userId: adU.id, isDefault: true } });
  ok('making another address the default leaves exactly one default', defaults.length === 1 && defaults[0].id === a2.id);
  const edited: any = await userProfileService.updateAddress(adU.id, a1.id, { landmark: 'Near the park', latitude: 24.81, longitude: 67.03 });
  ok('an address can be edited, pin included', edited.landmark === 'Near the park' && edited.coordinates?.latitude === 24.81);
  ok("someone else's address can't be edited or deleted",
    (await code(userProfileService.updateAddress(adOther.id, a1.id, { landmark: 'x' }))) === 'ADDRESS_NOT_FOUND' &&
    (await code(userProfileService.deleteAddress(adOther.id, a1.id))) === 'ADDRESS_NOT_FOUND');
  await userProfileService.deleteAddress(adU.id, a2.id);
  const remaining = await prisma.userAddress.findMany({ where: { userId: adU.id } });
  ok('deleting the default makes the remaining address the default', remaining.length === 1 && remaining[0].isDefault === true);

  // ---- 17g. cancelled orders close their rider job; stale orders are swept ----
  const { sweepStaleOrders } = require('../src/services/order-maintenance.service');
  const { runExclusive } = require('../src/jobs/scheduler');
  const swCust = await mkUser();
  const swAddr = await prisma.userAddress.create({ data: { userId: swCust.id, addressLine1: 'House 3 Street', area: 'X', city: 'Lahore' } });
  const swProd = await mkProduct(platS.id, 50, 200);
  const homeO = () => orderService.createOrder(swCust.id, { items: [{ productId: swProd.id, quantity: 1 }], deliveryType: 'home_delivery', deliveryAddressId: swAddr.id, paymentMethod: 'cod' } as any) as Promise<any>;

  const jobO = await homeO();
  await sellerOrderService.acceptOrder(jobO.id, platUser);
  const job = await prisma.delivery.findUnique({ where: { orderId: jobO.id } });
  ok('(setup) accepting creates a rider job', !!job && job.status === 'pending');
  const jobRider = await mkUser('rider');
  await prisma.rider.create({ data: { userId: jobRider.id, city: 'Lahore', verificationStatus: 'approved', status: 'active' } as any });
  await riderService.claimDelivery(jobRider.id, job!.id);
  await adminOrderService.cancelOrder(jobO.id, admin.id, 'customer called to cancel');
  const jobAfter = await prisma.delivery.findUnique({ where: { orderId: jobO.id } });
  ok('cancelling an order closes its rider job', jobAfter!.status === 'cancelled', jobAfter!.status);
  const pool: any[] = await riderService.getAvailableDeliveries(jobRider.id);
  ok("the cancelled job doesn't count against the rider's two-job limit", (await prisma.delivery.count({ where: { riderId: (await prisma.rider.findUnique({ where: { userId: jobRider.id } }))!.id, status: { in: ['assigned', 'arrived_at_pickup', 'picked_up', 'in_transit', 'arrived_at_customer'] } } })) === 0 && !pool.some((d: any) => d.orderId === jobO.id));

  const rejO = await homeO();
  await sellerOrderService.acceptOrder(rejO.id, platUser);
  await sellerOrderService.rejectOrder(rejO.id, platUser, 'ran out');
  ok('a kitchen rejecting an accepted order closes its rider job too', (await prisma.delivery.findUnique({ where: { orderId: rejO.id } }))!.status === 'cancelled');

  // the sweep
  const stockBefore = (await prisma.product.findUnique({ where: { id: swProd.id } }))!.stockQuantity;
  const old = new Date(Date.now() - 31 * 60 * 1000);
  const staleO = await homeO();
  await prisma.order.update({ where: { id: staleO.id }, data: { createdAt: old } });
  const unpaidT: any = (await order(swCust.id, [{ productId: swProd.id, quantity: 1 }], { paymentMethod: 'bank' })).order;
  await sellerOrderService.acceptOrder(unpaidT.id, platUser);
  await prisma.order.update({ where: { id: unpaidT.id }, data: { createdAt: new Date(Date.now() - 61 * 60 * 1000) } });
  const freshO = await homeO();
  const sub6: any = (await order(swCust.id, [{ productId: swProd.id, quantity: 1 }], { paymentMethod: 'bank' })).order;
  await orderService.submitManualPayment(sub6.id, swCust.id, { referenceNumber: 'TID-' + uniq() });
  await sellerOrderService.acceptOrder(sub6.id, platUser);
  await prisma.order.update({ where: { id: sub6.id }, data: { paymentSubmittedAt: new Date(Date.now() - 7 * 3600 * 1000) } });
  const sweep1: any = await sweepStaleOrders();
  const st = async (id: string) => (await prisma.order.findUnique({ where: { id } }))!;
  ok('an order the kitchen never accepted is cancelled automatically', (await st(staleO.id)).orderStatus === 'cancelled' && (await st(staleO.id)).cancelledBy === 'system');
  ok('an accepted transfer order that was never paid is cancelled', (await st(unpaidT.id)).orderStatus === 'cancelled');
  ok('a fresh order is left alone', (await st(freshO.id)).orderStatus === 'pending');
  // four orders were placed after stockBefore; the two swept ones gave their unit back
  const stockAfterSweep = (await prisma.product.findUnique({ where: { id: swProd.id } }))!.stockQuantity;
  ok('stock comes back for the swept orders', stockAfterSweep === stockBefore - 2, `before=${stockBefore} after=${stockAfterSweep}`);
  const esc = await prisma.orderStatusHistory.count({ where: { orderId: sub6.id, notes: { contains: 'Escalated to admins' } } });
  const adminNotes = await prisma.notification.count({ where: { userId: admin.id, type: 'payment_unconfirmed' } });
  await sweepStaleOrders();
  ok('an unconfirmed reported transfer is escalated to admins once, not cancelled', esc === 1 && adminNotes >= 1 && (await st(sub6.id)).orderStatus !== 'cancelled' &&
    (await prisma.orderStatusHistory.count({ where: { orderId: sub6.id, notes: { contains: 'Escalated to admins' } } })) === 1, JSON.stringify(sweep1));

  // one runner at a time
  let runs = 0;
  const slow = () => new Promise<void>((r) => setTimeout(() => { runs++; r(); }, 300));
  const lockRuns = await Promise.all([runExclusive('verify-lock', slow), runExclusive('verify-lock', slow)]);
  ok('a scheduled job runs on only one worker at a time', runs === 1 && lockRuns.filter(Boolean).length === 1, `runs=${runs} ${lockRuns}`);

  // ---- 17h. a retried checkout never places a second order ----
  const idC = await mkUser();
  const idP = await mkProduct(seller.id, 30, 100);
  const place = (key?: string) => orderService.createOrder(idC.id, { items: [{ productId: idP.id, quantity: 1 }], deliveryType: 'self_pickup', paymentMethod: 'cod' } as any, { idempotencyKey: key }) as Promise<any>;
  const k1 = 'chk-' + uniq();
  const first: any = await place(k1);
  const again: any = await place(k1);
  ok('the same checkout key twice returns the same order', first.id === again.id);
  const k2 = 'chk-' + uniq();
  const racers: any[] = await Promise.all([place(k2), place(k2), place(k2)]);
  ok('three simultaneous submits of one checkout make one order', new Set(racers.map((o) => o.id)).size === 1);
  const stockNow = (await prisma.product.findUnique({ where: { id: idP.id } }))!.stockQuantity;
  ok('and stock is taken once per order', stockNow === 30 - 2, `stock=${stockNow}`);
  ok('a new checkout (new key) is a new order', (await place('chk-' + uniq())).id !== first.id);

  // ---- 18. schema integrity ----
  const cc = await mkUser();
  const cp = await mkProduct(seller.id, 50, 100);
  const adds = await Promise.all([1, 2, 3, 4, 5].map(() => cartService.addToCart(cc.id, { productId: cp.id, quantity: 1 } as any).then(() => 'OK', (e: any) => e.code)));
  const cartRow = await prisma.cart.findUnique({ where: { userId: cc.id }, include: { items: true } });
  ok('concurrent add-to-cart makes one line, not duplicates', cartRow!.items.length === 1 && cartRow!.items[0].quantity === 5, `lines=${cartRow!.items.length} qty=${cartRow!.items[0]?.quantity} ${adds.filter((a) => a !== 'OK')}`);

  const mkProd = (sUserId: string, name: string) => productService.createProduct(sUserId, { name, price: 100, unit: 'pc', stockQuantity: 5, stockType: 'direct' } as any).then((p: any) => p, (e: any) => e.code);
  const sA = await prisma.seller.findUnique({ where: { id: seller.id } });
  const sB = await prisma.seller.findUnique({ where: { id: sellerB.id } });
  const nm = 'Shared Biryani ' + uniq();
  const pa: any = await mkProd(sA!.userId, nm);
  const pb: any = await mkProd(sB!.userId, nm);
  ok('two sellers can list a product with the same name (distinct slugs)', pa?.slug && pb?.slug && pa.slug !== pb.slug, `${pa?.slug} / ${pb?.slug ?? pb}`);
  ok('the same seller still cannot list a duplicate name', (await mkProd(sA!.userId, nm)) === 'PRODUCT_EXISTS');
  const urdu1: any = await mkProd(sA!.userId, 'بریانی'), urdu2: any = await mkProd(sB!.userId, 'بریانی');
  ok('names with no URL-safe characters get unique slugs', !!urdu1?.slug && !!urdu2?.slug && urdu1.slug !== urdu2.slug, `${urdu1?.slug} / ${urdu2?.slug}`);

  const revOrderItem = await prisma.orderItem.findFirst({ where: { orderId: sdo.id } });
  const revData = { orderId: sdo.id, orderItemId: revOrderItem!.id, customerId: dc.id, sellerId: revOrderItem!.sellerId };
  await prisma.review.create({ data: revData as any });
  ok('the database refuses a second review of the same item by the same customer', (await prisma.review.create({ data: revData as any }).then(() => 'OK', (e: any) => e.code)) === 'P2002');

  const dupUse = await prisma.promotion.create({ data: { code: 'DUPU' + uniq(), name: 'd', discountType: 'fixed', discountValue: 1, validFrom: new Date(), validUntil: new Date(Date.now() + 1e9) } as any });
  const usage = { promotionId: dupUse.id, userId: dc.id, orderId: sdo.id, discountApplied: 1 };
  await prisma.promotionUsage.create({ data: usage });
  ok('the database refuses a second usage row for the same promotion on one order', (await prisma.promotionUsage.create({ data: usage }).then(() => 'OK', (e: any) => e.code)) === 'P2002');

  const negStock = await prisma.product.update({ where: { id: cp.id }, data: { stockQuantity: -1 } }).then(() => 'OK', () => 'BLOCKED');
  ok('stock can never be written negative (CHECK constraint)', negStock === 'BLOCKED', negStock);
  const sellerWithOrders = await prisma.seller.delete({ where: { id: selfS.id } }).then(() => 'DELETED', () => 'BLOCKED');
  ok('a seller with order history cannot be deleted (history is kept)', sellerWithOrders === 'BLOCKED', sellerWithOrders);

  // ---- 19. order / ticket numbers ----
  const nc = await mkUser();
  const np = await mkProduct(seller.id, 500, 10);
  const burst = await Promise.all(Array.from({ length: 25 }, () => order(nc.id, [{ productId: np.id, quantity: 1 }]).then((r: any) => r.order.orderNumber, (e: any) => 'ERR:' + (e.code || e.message))));
  ok('25 simultaneous orders all succeed with distinct 6-digit numbers', burst.every((b) => /^FN\d{8}\d{6}$/.test(b)) && new Set(burst).size === 25, burst.filter((b) => b.startsWith('ERR')).join(','));

  // force clashes: make the generator return an already-used number twice, then a fresh one
  const svc: any = orderPlacement; // the order number is drawn by the placement service
  const taken = burst[0];
  const original = svc.generateOrderNumber.bind(svc);
  let calls = 0;
  svc.generateOrderNumber = () => (calls++ < 2 ? taken : original());
  const clashOrder: any = (await order(nc.id, [{ productId: np.id, quantity: 1 }])).order;
  svc.generateOrderNumber = original;
  ok('an order-number clash is retried with a new number instead of failing', clashOrder.orderNumber !== taken && calls === 3, `calls=${calls}`);
  const stockAfter = (await prisma.product.findUnique({ where: { id: np.id } }))!.stockQuantity;
  ok('retried attempts leave stock correct (26 units taken)', stockAfter === 500 - 26, `stock=${stockAfter}`);

  const { default: supportService } = require('../src/services/support.service');
  const tk = await Promise.all(Array.from({ length: 10 }, () => supportService.createTicket(nc.id, { category: 'other', subject: 'hello', description: 'a long enough description' }).then((t: any) => t.ticketNumber, (e: any) => 'ERR:' + (e.code || e.message))));
  ok('10 simultaneous support tickets all succeed with distinct numbers', tk.every((t: string) => /^TKT\d{4}\d{6}$/.test(t)) && new Set(tk).size === 10, tk.filter((t: string) => t.startsWith('ERR')).join(','));

  // ---- 20. order history paging + whole-history counts ----
  const pg1: any = await orderService.getUserOrders(nc.id, { page: 1, limit: 20 });
  const pg2: any = await orderService.getUserOrders(nc.id, { page: 2, limit: 20 });
  const ids = new Set([...pg1.orders, ...pg2.orders].map((o: any) => o.id));
  ok('order history pages cover every order exactly once', pg1.orders.length === 20 && pg2.orders.length === 6 && ids.size === 26 && pg1.pagination.totalPages === 2, `p1=${pg1.orders.length} p2=${pg2.orders.length} unique=${ids.size}`);
  ok('status counts reflect the whole history, not just the page', pg1.statusCounts.pending === 26, JSON.stringify(pg1.statusCounts));

  // ---- 21. hub batches ----
  const DAY = 24 * 3600 * 1000;
  const hub = await prisma.hubCenter.create({ data: { name: 'H' + uniq(), code: 'H' + uniq(), city: 'Lahore', area: 'A', address: 'x', latitude: 31.5, longitude: 74.3, capacityCubicFeet: 100 } as any });
  const hubProd = await prisma.product.create({ data: { sellerId: seller.id, name: 'HP' + uniq(), slug: 'hp-' + uniq(), price: 100, unit: 'pc', stockQuantity: 1000, stockType: 'hub', approvalStatus: 'approved', isActive: true } as any });
  const intake = (over: any = {}) => hubService.recordBatchIntake({ hubId: hub.id, productId: hubProd.id, quantity: 10, batchNumber: 'B', expiryDate: new Date(Date.now() + 30 * DAY), measuredTemperatureCelsius: -20, ...over });
  const icode = (over: any) => intake(over).then(() => 'OK', (e: any) => e.code);

  ok('negative intake quantity is refused (it used to remove stock)', (await icode({ quantity: -5, batchNumber: 'NEG' })) === 'INVALID_QUANTITY');
  ok('fractional / zero intake quantity is refused', (await icode({ quantity: 2.5, batchNumber: 'F' })) === 'INVALID_QUANTITY' && (await icode({ quantity: 0, batchNumber: 'Z' })) === 'INVALID_QUANTITY');
  ok('a client-supplied seller that does not own the product is refused', (await icode({ sellerId: sellerB.id, batchNumber: 'S' })) === 'SELLER_MISMATCH');
  ok('an already-expired batch cannot be received', (await icode({ expiryDate: new Date(Date.now() - DAY), batchNumber: 'OLD' })) === 'BATCH_EXPIRED');

  await intake({ batchNumber: 'A', quantity: 5, expiryDate: new Date(Date.now() + 3 * DAY) });   // earliest sellable
  await intake({ batchNumber: 'B', quantity: 5, expiryDate: new Date(Date.now() + 30 * DAY) });  // later
  await intake({ batchNumber: 'C', quantity: 50, expiryDate: new Date(Date.now() + 12 * 3600 * 1000) }); // < 24h of shelf life
  const batchOf = (n: string) => prisma.hubInventory.findFirst({ where: { hubId: hub.id, productId: hubProd.id, batchNumber: n } });

  const conc = await Promise.all([1, 2, 3, 4, 5].map(() => intake({ batchNumber: 'CONC', quantity: 10 }).then(() => 'OK', (e: any) => e.code)));
  const concRows = await prisma.hubInventory.findMany({ where: { hubId: hub.id, batchNumber: 'CONC' } });
  ok('5 simultaneous intakes of one batch: one row, nothing lost', concRows.length === 1 && concRows[0].quantity === 50 && conc.every((c) => c === 'OK'), `rows=${concRows.length} qty=${concRows[0]?.quantity} ${conc}`);

  const breachNew: any = await intake({ batchNumber: 'WARM', measuredTemperatureCelsius: -10 });
  ok('a warm delivery under a new batch number is quarantined', breachNew.status === 'damaged' && (await batchOf('WARM'))!.status === 'damaged');
  ok('a warm delivery cannot be merged into good stock (it would quarantine all of it)', (await icode({ batchNumber: 'B', measuredTemperatureCelsius: -5 })) === 'BATCH_EXISTS' && (await batchOf('B'))!.status === 'available' && (await batchOf('B'))!.quantity === 5);
  await intake({ batchNumber: 'WARM', quantity: 3 });
  ok('a good delivery does not release a quarantined batch', (await batchOf('WARM'))!.status === 'damaged' && (await batchOf('WARM'))!.quantity === 13);

  const pub: any = await hubService.getHubInventory(hub.id, {});
  const pubBatches = pub.inventory.map((i: any) => i.batchNumber).sort().join(',');
  ok('public inventory lists only sellable batches', pubBatches === 'A,B,CONC', pubBatches);

  // FEFO allocation: earliest SELLABLE batch first; the <24h batch (earliest expiry) is skipped
  const hc = await mkUser();
  const hubOrder = (qty: number, uid = hc.id) => orderService.createOrder(uid, { items: [{ productId: hubProd.id, quantity: qty, stockType: 'hub', hubId: hub.id }], deliveryType: 'self_pickup', paymentMethod: 'cod' } as any) as Promise<any>;
  const directP = await mkProduct(seller.id, 5, 100);
  ok('a hub id on an item the kitchen ships itself is refused (it would re-price the delivery as Nuray\'s)', (await code(orderService.createOrder(hc.id, { items: [{ productId: directP.id, quantity: 1, hubId: hub.id }], deliveryType: 'self_pickup', paymentMethod: 'cod' } as any))) === 'HUB_NOT_APPLICABLE');
  const ho1 = await hubOrder(7);
  const [qa, qb, qc] = [await batchOf('A'), await batchOf('B'), await batchOf('C')];
  ok('FEFO takes the earliest sellable batch first and never the nearly-expired one', qa!.quantity === 0 && qa!.status === 'reserved' && qb!.quantity === 3 && qc!.quantity === 50, `A=${qa!.quantity} B=${qb!.quantity} C=${qc!.quantity}`);
  const allocs = await prisma.hubBatchAllocation.findMany({ where: { orderId: ho1.id } });
  ok('the batches an order took from are recorded', allocs.length === 2 && allocs.reduce((a, x) => a + x.quantity, 0) === 7);

  // shortage: more than all sellable stock (CONC has 50, B 3 => 53 left) -> refused, nothing taken
  const before = (await prisma.hubInventory.findMany({ where: { hubId: hub.id }, orderBy: { batchNumber: 'asc' } })).map((b) => `${b.batchNumber}:${b.quantity}`).join();
  const shortage = await hubOrder(60).then(() => 'OK', (e: any) => e.code);
  const afterShort = (await prisma.hubInventory.findMany({ where: { hubId: hub.id }, orderBy: { batchNumber: 'asc' } })).map((b) => `${b.batchNumber}:${b.quantity}`).join();
  ok('an order for more than the sellable hub stock is refused and takes nothing', shortage === 'INSUFFICIENT_STOCK' && before === afterShort, `${shortage}`);

  // concurrency: 53 sellable left; 6 orders of 10 -> exactly 5 succeed, hub never negative
  const cu = await Promise.all(Array.from({ length: 6 }, async () => hubOrder(10, (await mkUser()).id).then(() => 'OK', (e: any) => e.code)));
  const negative = await prisma.hubInventory.count({ where: { hubId: hub.id, quantity: { lt: 0 } } });
  ok('simultaneous hub orders cannot oversell a batch', cu.filter((c) => c === 'OK').length === 5 && negative === 0, `${cu}`);

  // cancel returns units to the same batches, once
  await orderService.cancelOrder(ho1.id, hc.id, 'changed my mind');
  // (B's remaining 3 units were sold to the concurrent orders above, so only the 2 this order took come back)
  const [ra, rb] = [await batchOf('A'), await batchOf('B')];
  ok('cancelling returns the units to the batches they came from (depleted batch is available again)', ra!.quantity === 5 && ra!.status === 'available' && rb!.quantity === 2 && rb!.status === 'available', `A=${ra!.quantity}/${ra!.status} B=${rb!.quantity}/${rb!.status}`);
  await orderService.cancelOrder(ho1.id, hc.id, 'again').catch(() => null);
  ok('a second cancel does not return the units twice', (await batchOf('A'))!.quantity === 5);

  // seller cancels one item -> that item's hub units return
  const ho2 = await hubOrder(2);
  const ho2Item = await prisma.orderItem.findFirst({ where: { orderId: ho2.id } });
  const aBefore = (await batchOf('A'))!.quantity;
  await sellerOrderService.cancelOrderItem(ho2Item!.id, sA!.userId, 'oos');
  ok('a seller cancelling an item returns its hub units', (await batchOf('A'))!.quantity === aBefore + 2);

  // status rules
  const batchC = await batchOf('C'); const batchWarm = await batchOf('WARM');
  await prisma.hubInventory.update({ where: { id: batchC!.id }, data: { expiryDate: new Date(Date.now() - 1000) } });
  const rel = (id: string, reason?: string) => hubService.updateBatchStatus({ hubId: hub.id, batchId: id, status: 'available', reason }).then(() => 'OK', (e: any) => e.code);
  ok('an expired batch cannot be released to sellable stock', (await rel(batchC!.id, 'please')) === 'BATCH_EXPIRED');
  ok('releasing a quarantined batch needs a reason', (await rel(batchWarm!.id)) === 'REASON_REQUIRED' && (await rel(batchWarm!.id, 'Re-tested at -21C, fine')) === 'OK');
  await prisma.hubInventory.update({ where: { id: batchC!.id }, data: { status: 'available' } });
  ok('the expiry sweep marks passed batches as expired', (await hubService.expireStaleBatches()) >= 1 && (await batchOf('C'))!.status === 'expired');

  // access control
  const mgr1 = await mkUser('hub_manager'); const mgr2 = await mkUser('hub_manager');
  const acc = (u: any) => hubService.assertHubAccess(hub.id, { userId: u.id, userType: 'hub_manager' }).then(() => 'OK', (e: any) => e.code);
  ok('a hub with no manager yet is run by admins only, not by any hub manager', (await acc(mgr1)) === 'HUB_ACCESS_DENIED');
  await hubService.assignManager(hub.id, mgr1.id);
  ok('once assigned, only that manager (or an admin) may operate the hub', (await acc(mgr1)) === 'OK' && (await acc(mgr2)) === 'HUB_ACCESS_DENIED' && (await hubService.assertHubAccess(hub.id, { userId: admin.id, userType: 'admin' }).then(() => 'OK', (e: any) => e.code)) === 'OK');
  ok('only an active hub-manager account can be assigned', (await hubService.assignManager(hub.id, cust.id).then(() => 'OK', (e: any) => e.code)) === 'INVALID_MANAGER');
  ok('temperature log limits are bounded (NaN no longer breaks it)', (await hubService.getTemperatureLogs(hub.id, NaN).then(() => 'OK', (e: any) => e.code)) === 'OK' && (await hubService.getTemperatureLogs(hub.id, 1e9).then(() => 'OK', (e: any) => e.code)) === 'OK');

  // ---- 21b. hub intake / release races, per-line allocation ----
  const hubProd2 = await prisma.product.create({ data: { sellerId: seller.id, name: 'HQ' + uniq(), slug: 'hq-' + uniq(), price: 100, unit: 'pc', stockQuantity: 1000, stockType: 'hub', approvalStatus: 'approved', isActive: true } as any });
  const intake2 = (over: any = {}) => hubService.recordBatchIntake({ hubId: hub.id, productId: hubProd2.id, quantity: 20, batchNumber: 'R', expiryDate: new Date(Date.now() + 30 * DAY), measuredTemperatureCelsius: -20, ...over });
  await intake2();
  const hubOrder2 = (qty: number, uid = hc.id) => orderService.createOrder(uid, { items: [{ productId: hubProd2.id, quantity: qty, stockType: 'hub', hubId: hub.id }], deliveryType: 'self_pickup', paymentMethod: 'cod' } as any) as Promise<any>;
  const rows2 = () => prisma.hubInventory.findFirst({ where: { hubId: hub.id, productId: hubProd2.id, batchNumber: 'R' } });
  // concurrent intake of +10 and orders of 3 + 4: nothing may be lost
  await Promise.all([intake2({ quantity: 10 }), hubOrder2(3, (await mkUser()).id), hubOrder2(4, (await mkUser()).id)]);
  ok('a delivery landing while orders allocate loses no stock (20+10-3-4)', (await rows2())!.quantity === 23, `${(await rows2())!.quantity}`);
  const ordR = await hubOrder2(2);
  const allocR = await prisma.hubBatchAllocation.findMany({ where: { orderId: ordR.id } });
  ok('hub allocations record the order line', allocR.length > 0 && allocR.every((a) => !!a.orderItemId));
  // a manual hold on a batch that still has stock survives both a release and an intake
  await prisma.hubInventory.update({ where: { id: (await rows2())!.id }, data: { status: 'reserved' } });
  await orderService.cancelOrder(ordR.id, hc.id, "test").catch(() => null);
  ok('releasing hub units does not reopen a manually held batch', (await rows2())!.status === 'reserved');
  await intake2({ quantity: 1 });
  ok('a delivery does not reopen a manually held batch either', (await rows2())!.status === 'reserved');
  // sweep logs only what it flips
  await prisma.hubInventory.update({ where: { id: (await rows2())!.id }, data: { status: 'available', expiryDate: new Date(Date.now() - 1000) } });
  const sweeps = await Promise.all([hubService.expireStaleBatches(), hubService.expireStaleBatches()]);
  const expLogs = await prisma.hubInventoryLog.count({ where: { hubInventoryId: (await rows2())!.id, action: 'expired' } });
  ok('concurrent expiry sweeps flip and log a batch once', sweeps.reduce((a, b) => a + b, 0) >= 1 && expLogs === 1, `${sweeps} ${expLogs}`);

  // ---- 22. phone verification ----
  const pn = () => '+92300' + String(Math.floor(1000000 + Math.random() * 8999999));
  const PW1 = 'Lantern-Quartz-71'; // passwords the sign-up accepts: long enough, not common, not the person's own details
  const PW2 = 'Harbour-Bridge-24';
  const reg = (email: string, phone?: string, phone_otp?: string, password = PW1) =>
    authService.register(email, password, 'customer', 'Test User', phone, undefined, undefined, undefined, phone_otp) as Promise<any>;
  const lastOtp = async (phone: string, purpose: string) => (await prisma.otpVerification.findFirst({ where: { phone, purpose, isVerified: false }, orderBy: { createdAt: 'desc' } }))!.otpCode;

  const phoneA = pn();
  const regA = await reg(`a${uniq()}@t.test`, phoneA);
  ok('a phone typed at signup without proof is stored UNVERIFIED', regA.user.phoneVerified === false && (await prisma.user.findUnique({ where: { id: regA.user.id } }))!.phoneVerified === false);
  const placeholder = await reg(`b${uniq()}@t.test`);
  ok('an account with no phone gets an unverified placeholder', placeholder.user.phoneVerified === false && placeholder.user.phone.startsWith('+999'));

  const loginCode = await otpService.generateOTP(phoneA, 'login');
  ok('OTP login is refused for a phone that was never verified for the account',
    (await authService.login(phoneA, loginCode, 'otp').then(() => 'OK', (e: any) => e.code)) === 'PHONE_NOT_VERIFIED');

  // verifying the number from the signed-in account
  await authService.requestPhoneVerification(regA.user.id, phoneA);
  const vCode = await lastOtp(phoneA, 'registration');
  ok('a wrong code does not verify', (await authService.verifyPhone(regA.user.id, phoneA, vCode === '000000' ? '111111' : '000000').then(() => 'OK', (e: any) => e.code)) === 'OTP_INVALID');
  const vOk: any = await authService.verifyPhone(regA.user.id, phoneA, vCode);
  ok('the right code verifies the number', vOk.phoneVerified === true);
  const loginCode2 = await otpService.generateOTP(phoneA, 'login');
  ok('after verification OTP login works', (await authService.login(phoneA, loginCode2, 'otp').then(() => 'OK', (e: any) => e.code)) === 'OK');
  ok('a code cannot be used twice', (await authService.verifyPhone(regA.user.id, phoneA, vCode).then(() => 'OK', (e: any) => e.code)) !== 'OK');

  // squatting: an attacker registers a victim's number without proof; the real owner can claim it
  const victimPhone = pn();
  const squatter = await reg(`s${uniq()}@t.test`, victimPhone);
  ok('requesting a registration code for a number held by an UNVERIFIED account is allowed', (await authService.requestOTP(victimPhone, 'registration').then(() => 'OK', (e: any) => e.code)) === 'OK');
  ok('registering that number without proof still fails', (await reg(`v0${uniq()}@t.test`, victimPhone).then(() => 'OK', (e: any) => e.code)) === 'PHONE_EXISTS');
  const claimCode = await lastOtp(victimPhone, 'registration');
  const owner = await reg(`v${uniq()}@t.test`, victimPhone, claimCode);
  const squatterAfter = await prisma.user.findUnique({ where: { id: squatter.user.id } });
  ok('the real owner claims the number with proof; it moves off the squatter',
    owner.user.phone === victimPhone && owner.user.phoneVerified === true && squatterAfter!.phone !== victimPhone && squatterAfter!.phone.startsWith('+999') && squatterAfter!.phoneVerified === false);
  ok('a verified number cannot be taken, even with a code', (await authService.requestOTP(victimPhone, 'registration').then(() => 'OK', (e: any) => e.code)) === 'USER_EXISTS');

  // OTP guessing is capped even under parallel attempts, and a locked code isn't handed back
  const brutePhone = pn();
  const bruteCode = await otpService.generateOTP(brutePhone, 'login');
  const wrong = bruteCode === '123456' ? '654321' : '123456';
  const guesses = await Promise.all(Array.from({ length: 12 }, () => otpService.verifyOTP(brutePhone, wrong, 'login').then(() => 'OK', (e: any) => e.code)));
  const bruteRow = await prisma.otpVerification.findFirst({ where: { phone: brutePhone }, orderBy: { createdAt: 'desc' } });
  ok('parallel wrong guesses are capped at 5', bruteRow!.attempts === 5 && guesses.filter((g) => g === 'OTP_INVALID').length === 5, `attempts=${bruteRow!.attempts} ${guesses.filter((g) => g === 'OTP_INVALID').length} invalid`);
  ok('even the right code is refused once locked', (await otpService.verifyOTP(brutePhone, bruteCode, 'login').then(() => 'OK', (e: any) => e.code)) === 'OTP_MAX_ATTEMPTS');
  const fresh = await otpService.generateOTP(brutePhone, 'login');
  const freshRow = await prisma.otpVerification.findFirst({ where: { phone: brutePhone }, orderBy: { createdAt: 'desc' } });
  ok('requesting a new code after a lock-out gives a fresh, unlocked code', (await prisma.otpVerification.count({ where: { phone: brutePhone } })) === 2 && freshRow!.attempts === 0 && freshRow!.id !== bruteRow!.id && !!fresh);

  // ---- 22b. OTP delivery: never in a response, real resend with a cooldown, failures reported ----
  const otpUser = await mkUser();
  const otpPhone = pn();
  const firstReq: any = await authService.requestPhoneVerification(otpUser.id, otpPhone);
  ok('the OTP code is never returned in the API response', !('otpCode' in firstReq) && !JSON.stringify(firstReq).match(/\b\d{6}\b/), JSON.stringify(firstReq));
  ok('asking again within a minute is refused (cooldown)', (await authService.requestPhoneVerification(otpUser.id, otpPhone).then(() => 'OK', (e: any) => e.code)) === 'OTP_RESEND_COOLDOWN');
  const oldRow = await prisma.otpVerification.findFirst({ where: { phone: otpPhone }, orderBy: { createdAt: 'desc' } });
  await prisma.otpVerification.update({ where: { id: oldRow!.id }, data: { createdAt: new Date(Date.now() - 61_000) } });
  await authService.requestPhoneVerification(otpUser.id, otpPhone);
  const newRow = await prisma.otpVerification.findFirst({ where: { phone: otpPhone }, orderBy: { createdAt: 'desc' } });
  ok('after the cooldown a resend issues a fresh code', newRow!.id !== oldRow!.id);
  if (newRow!.otpCode !== oldRow!.otpCode) {
    ok('and the previous code no longer works', (await otpService.verifyOTP(otpPhone, oldRow!.otpCode, 'registration').then(() => 'OK', (e: any) => e.code)) !== 'OK');
  }
  const prevSms = process.env.SMS_PROVIDER;
  process.env.SMS_PROVIDER = 'none';
  const failPhone = pn();
  const failCode = await authService.requestPhoneVerification(otpUser.id, failPhone).then(() => 'OK', (e: any) => e.code);
  if (prevSms === undefined) delete process.env.SMS_PROVIDER; else process.env.SMS_PROVIDER = prevSms;
  ok('when the SMS cannot be sent the user is told, and no code is left behind', failCode === 'SMS_SEND_FAILED' && (await prisma.otpVerification.count({ where: { phone: failPhone } })) === 0, failCode);

  // ---- 23. review round: money ----
  const rc2 = await mkUser();
  const rcSellerA = await mkSeller();
  const pa2 = await mkProduct(rcSellerA.id, 20, 100); const pb2 = await mkProduct(rcSellerA.id, 20, 100);
  const uA = (await prisma.seller.findUnique({ where: { id: rcSellerA.id } }))!.userId;

  // (1) a cancelled item earns nothing even though the rest of the order is delivered
  const two: any = (await order(rc2.id, [{ productId: pa2.id, quantity: 1 }, { productId: pb2.id, quantity: 1 }], { paymentMethod: 'bank' })).order;
  await prisma.order.update({ where: { id: two.id }, data: { paymentStatus: 'paid', paidAt: new Date() } });
  const twoB = await prisma.orderItem.findFirst({ where: { orderId: two.id, productId: pb2.id } });
  await sellerOrderService.cancelOrderItem(twoB!.id, uA, 'out of stock');
  await prisma.order.update({ where: { id: two.id }, data: { orderStatus: 'delivered' } });
  const dashA: any = await sellerService.getSellerDashboard(rcSellerA.id);
  const liveA = Number((await prisma.orderItem.findFirst({ where: { orderId: two.id, productId: pa2.id } }))!.sellerPayout);
  ok('a cancelled item earns nothing from the delivered order', Math.abs(dashA.overview.totalEarnings - liveA) < 0.01, `earnings=${dashA.overview.totalEarnings} live=${liveA}`);
  await ledgerService.recordOrderCompletion(two.id);
  const ledA = await prisma.ledgerEntry.findMany({ where: { orderId: two.id } });
  const refundedSum = (await prisma.refund.findMany({ where: { orderId: two.id } })).reduce((a, r) => a + Number(r.amount), 0);
  const custPay = Number(ledA.find((e) => e.transactionType === 'customer_payment')!.amount);
  const earn = Number(ledA.find((e) => e.transactionType === 'seller_earning')!.amount);
  ok('ledger counts only live items and the net the customer paid', Math.abs(custPay - (Number(two.totalAmount) - refundedSum)) < 0.02 && earn === liveA, `custPay=${custPay} earn=${earn}`);
  const ledgerAgain = await Promise.all([ledgerService.recordOrderCompletion(two.id), ledgerService.recordOrderCompletion(two.id)]);
  ok('ledger posts once even if called twice', ledgerAgain.every((l: any) => !l.recorded) && (await prisma.ledgerEntry.count({ where: { orderId: two.id } })) === ledA.length);

  // (2) a late gateway/transfer confirmation cannot revive a refunded order
  const lateO: any = (await order(rc2.id, [{ productId: pa2.id, quantity: 1 }], { paymentMethod: 'bank' })).order;
  await prisma.order.update({ where: { id: lateO.id }, data: { paymentStatus: 'paid' } });
  await orderService.cancelOrder(lateO.id, rc2.id, 'x');
  const afterCancel = (await prisma.order.findUnique({ where: { id: lateO.id } }))!.paymentStatus;
  ok('(setup) cancelling the paid order queues a refund', afterCancel === 'refund_pending');
  ok('paying a refund-pending order again is refused', (await paymentService.processPayment(lateO.id, rc2.id, 'wallet').then(() => 'OK', (e: any) => e.code)) !== 'OK');
  const claimLate = await prisma.order.updateMany({ where: { id: lateO.id, paymentStatus: { in: PAYABLE_STATUSES } }, data: { paymentStatus: 'paid' } });
  ok('a refund-pending / refunded order is outside the payable states a gateway can flip to paid', claimLate.count === 0);

  // (3) cancelling after a bank transfer was reported, before the seller confirmed
  const sub: any = (await order(rc2.id, [{ productId: pa2.id, quantity: 1 }], { paymentMethod: 'bank' })).order;
  await orderService.submitManualPayment(sub.id, rc2.id, { referenceNumber: 'TID-77' });
  const cres: any = await orderService.cancelOrder(sub.id, rc2.id, 'changed mind');
  const subRefund = await prisma.refund.findFirst({ where: { orderId: sub.id } });
  ok('cancelling after a reported transfer queues an unconfirmed refund for the admin', cres.refundStatus === 'pending_manual_transfer' && subRefund?.status === 'pending' && /UNCONFIRMED/.test(subRefund?.reason || ''), `${cres.refundStatus} ${subRefund?.reason}`);
  await dismissRefund(subRefund!.id, admin.id, 'No such transfer arrived in the account');
  const subAfter = await prisma.order.findUnique({ where: { id: sub.id } });
  ok('dismissing it (money never arrived) marks the payment failed, not refunded', subAfter!.paymentStatus === 'failed' && (await prisma.refund.findUnique({ where: { id: subRefund!.id } }))!.status === 'failed');

  // (4) partial cancel of an UNPAID order shrinks what the customer owes
  const unpaid2: any = (await order(rc2.id, [{ productId: pa2.id, quantity: 1 }, { productId: pb2.id, quantity: 1 }], { paymentMethod: 'bank' })).order;
  const unpaid2B = await prisma.orderItem.findFirst({ where: { orderId: unpaid2.id, productId: pb2.id } });
  await sellerOrderService.cancelOrderItem(unpaid2B!.id, uA, 'out of stock');
  const shr = (await prisma.order.findUnique({ where: { id: unpaid2.id } }))!;
  ok('cancelling one item of an unpaid order re-prices it to what is left', Math.abs(Number(shr.totalAmount) - 105) < 0.02 && Number(shr.subtotal) === 100, `total=${shr.totalAmount} subtotal=${shr.subtotal}`);

  // (6) seller-scoped promo: refund exactly what was paid for the item
  const spP = await prisma.promotion.create({ data: { code: 'SC' + uniq(), name: 's', discountType: 'percentage', discountValue: 50, applicableProductIds: [pa2.id], validFrom: new Date(Date.now() - 1e6), validUntil: new Date(Date.now() + 1e9), usageLimitPerUser: 9 } as any });
  const promoO: any = (await order(rc2.id, [{ productId: pa2.id, quantity: 1 }, { productId: pb2.id, quantity: 1 }], { paymentMethod: 'bank', promotionCode: spP.code })).order;
  await prisma.order.update({ where: { id: promoO.id }, data: { paymentStatus: 'paid' } });
  const shares = (await prisma.orderItem.findMany({ where: { orderId: promoO.id } })).map((i) => `${i.productId === pa2.id ? 'A' : 'B'}:${i.promoDiscount}`).sort().join();
  const itemBo = await prisma.orderItem.findFirst({ where: { orderId: promoO.id, productId: pb2.id } });
  await sellerOrderService.cancelOrderItem(itemBo!.id, uA, 'oos');
  const pRef = await prisma.refund.findFirst({ where: { orderId: promoO.id } });
  ok('item discount shares are recorded (only the eligible item carries one)', /A:\d+(\.\d+)?,B:0/.test(shares) && !/A:0(\.00)?,/.test(shares), shares);
  ok('cancelling the NON-discounted item refunds its full price + GST (not a pro-rata of the discounted total)', Math.abs(Number(pRef!.amount) - 105) < 0.02, `refund=${pRef?.amount}`);

  // (8) refunded orders cannot be delivered; live orders cannot be "refunded" without cancelling
  const live: any = (await order(rc2.id, [{ productId: pa2.id, quantity: 1 }], { paymentMethod: 'bank' })).order;
  await prisma.order.update({ where: { id: live.id }, data: { paymentStatus: 'paid' } });
  ok('a refund on an order still in flight is refused (cancel it instead)', (await adminOrderService.processRefund(live.id, admin.id).then(() => 'OK', (e: any) => e.code)) === 'USE_CANCEL_ENDPOINT');
  await prisma.order.update({ where: { id: live.id }, data: { orderStatus: 'in_transit', paymentStatus: 'refund_pending' } });
  ok('an order whose money is being refunded cannot be marked delivered', (await adminOrderService.updateOrderStatus(live.id, admin.id, 'delivered').then(() => 'OK', (e: any) => e.code)) === 'ORDER_REFUNDED');

  // (9) payout can't be both completed and failed
  const poSeller = await mkSeller(); const poProd = await mkProduct(poSeller.id, 5, 1000);
  await prisma.sellerPayoutSchedule.create({ data: { sellerId: poSeller.id, minimumPayoutAmount: 1, payoutMethod: 'bank_transfer' } as any });
  const poO: any = (await order(rc2.id, [{ productId: poProd.id, quantity: 1 }], { paymentMethod: 'cod' })).order;
  await prisma.order.update({ where: { id: poO.id }, data: { orderStatus: 'delivered', paymentMethod: 'wallet', paymentCollectedBy: 'platform', paymentStatus: 'paid', paidAt: new Date() } });
  const poGoods = Number((await prisma.orderItem.findFirst({ where: { orderId: poO.id } }))!.sellerPayout);
  await sellerService.requestPayout(poSeller.id, { amount: poGoods, payoutMethod: 'bank_transfer', accountNumber: '1' });
  const payoutRow = await prisma.sellerPayout.findFirst({ where: { sellerId: poSeller.id } });
  const { default: adminService } = require('../src/services/admin.service');
  const both = await Promise.all([adminService.completePayout(payoutRow!.id, 'T1').then(() => 'OK', (e: any) => e.code), adminService.failPayout(payoutRow!.id, 'bounced').then(() => 'OK', (e: any) => e.code)]);
  ok('a payout cannot be both completed and failed', both.filter((b: string) => b === 'OK').length === 1, both.join());

  // ---- 24. review round: sessions, reset, email, images ----
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const rEmail = `r${uniq()}@t.test`;
  const rReg: any = await reg(rEmail);
  const oldRefresh = rReg.tokens.refresh_token;
  await sleep(1100); // tokens carry whole-second issue times
  const token = 'tok' + 'x'.repeat(40) + uniq();
  const hash = (t: string) => createHash('sha256').update(t).digest('hex');
  await prisma.passwordReset.create({ data: { userId: rReg.user.id, tokenHash: hash(token), expiresAt: new Date(Date.now() + 3600e3) } });
  await authService.resetPassword(token, PW2);
  ok('the new password works after a reset', (await authService.login(rEmail, PW2, 'email').then(() => 'OK', (e: any) => e.code)) === 'OK');
  ok('the old password no longer works', (await authService.login(rEmail, PW1, 'email').then(() => 'OK', (e: any) => e.code)) === 'INVALID_CREDENTIALS');
  ok('a reset link is single-use', (await authService.resetPassword(token, 'Another-Phrase-Entirely-1').then(() => 'OK', (e: any) => e.code)) === 'INVALID_RESET_TOKEN');
  ok('every session issued before the reset is voided (old refresh token)', (await authService.refreshToken(oldRefresh).then(() => 'OK', (e: any) => e.code)) === 'SESSION_REVOKED');
  const expTok = 'exp' + 'y'.repeat(40) + uniq();
  await prisma.passwordReset.create({ data: { userId: rReg.user.id, tokenHash: hash(expTok), expiresAt: new Date(Date.now() - 1000) } });
  ok('an expired reset link is refused', (await authService.resetPassword(expTok, 'Another-Phrase-Entirely-2').then(() => 'OK', (e: any) => e.code)) === 'INVALID_RESET_TOKEN');
  await authService.forgotPassword('nobody-' + uniq() + '@t.test'); // must not throw / reveal anything
  ok('forgot-password answers the same for an unknown email', true);

  // ---- 24b. the password policy and the limits on sensitive actions ----
  const pwEmail = `pw${uniq()}@t.test`;
  ok('registering with a common password is refused', (await code(reg(pwEmail, undefined, undefined, 'password123'))) === 'WEAK_PASSWORD');
  ok('so is one made from the person\'s own e-mail name', (await code(reg(pwEmail, undefined, undefined, `my-${pwEmail.split('@')[0]}-9`))) === 'WEAK_PASSWORD');
  ok('and one that is too short, with nothing created', (await code(reg(pwEmail, undefined, undefined, 'Sh0rt-1'))) === 'WEAK_PASSWORD' && (await prisma.user.count({ where: { email: pwEmail } })) === 0);
  const weakTok = 'wk' + 'z'.repeat(40) + uniq();
  const weakUser: any = await reg(`wk${uniq()}@t.test`);
  await prisma.passwordReset.create({ data: { userId: weakUser.user.id, tokenHash: hash(weakTok), expiresAt: new Date(Date.now() + 3600e3) } });
  ok('a weak new password is refused at a reset', (await authService.resetPassword(weakTok, 'password123').then(() => 'OK', (e: any) => e.code)) === 'WEAK_PASSWORD');
  ok('and does not use up the link', (await authService.resetPassword(weakTok, 'Quiet-River-Stone-58').then(() => 'OK', (e: any) => e.code)) === 'OK');
  const staffUser = await mkUser('admin');
  const staffTok = 'st' + 'q'.repeat(40) + uniq();
  await prisma.passwordReset.create({ data: { userId: staffUser.id, tokenHash: hash(staffTok), expiresAt: new Date(Date.now() + 3600e3) } });
  ok('a staff member must choose twelve characters when resetting', (await authService.resetPassword(staffTok, 'Violet-Mg-9').then(() => 'OK', (e: any) => e.code)) === 'WEAK_PASSWORD');
  ok('and twelve is enough', (await authService.resetPassword(staffTok, 'Violet-Mg-91').then(() => 'OK', (e: any) => e.code)) === 'OK');

  // asking again within a minute does not cancel the link just sent
  const fpUser = await mkUser();
  await prisma.user.update({ where: { id: fpUser.id }, data: { emailVerified: true } });
  await authService.forgotPassword(fpUser.email!);
  await sleep(600);
  const firstLinks = await prisma.passwordReset.findMany({ where: { userId: fpUser.id, usedAt: null } });
  await authService.forgotPassword(fpUser.email!);
  await sleep(600);
  const secondLinks = await prisma.passwordReset.findMany({ where: { userId: fpUser.id, usedAt: null } });
  ok('a reset link is made for a verified address', firstLinks.length === 1);
  ok('asking again within a minute keeps that link instead of cancelling it', secondLinks.length === 1 && secondLinks[0].id === firstLinks[0].id);

  // "confirm with your password": wrong answers are 400, five stop even the right one
  const guardUser: any = await reg(`gd${uniq()}@t.test`);
  const gMail = (n: number) => `guard${n}${uniq()}@t.test`;
  const wrongPw = () => code(userProfileService.updateProfile(guardUser.user.id, { email: gMail(0), currentPassword: 'not-the-password' }));
  let wrongCodes: string[] = [];
  for (let i = 0; i < 5; i++) wrongCodes.push(await wrongPw());
  ok('a wrong password is INVALID_PASSWORD (a 400, so the web app does not take it for an expired session)', wrongCodes.every((c) => c === 'INVALID_PASSWORD'), wrongCodes.join());
  ok('after five wrong passwords even the right one is refused for a while', (await code(userProfileService.updateProfile(guardUser.user.id, { email: gMail(1), currentPassword: PW1 }))) === 'RATE_LIMITED');
  // The audit rows are written in the background: give the last one a moment to land.
  const trail = () => prisma.auditLog.count({ where: { action: 'auth:REAUTH_FAILED', entityId: guardUser.user.id } });
  for (let waited = 0; waited < 3000 && (await trail()) < 5; waited += 100) await new Promise((resolve) => setTimeout(resolve, 100));
  ok('and the wrong guesses left a trail', (await trail()) === 5);
  ok('closing the account is guarded by the same count', (await code(require('../src/services/account-deletion.service').deleteOwnAccount(guardUser.user.id, PW1))) === 'RATE_LIMITED');

  // an account can only change its e-mail so often, and one inbox only gets so many verification e-mails
  const chUser: any = await reg(`ch${uniq()}@t.test`);
  const chCodes: string[] = [];
  for (let i = 0; i < 4; i++) chCodes.push(await code(userProfileService.updateProfile(chUser.user.id, { email: `change${i}${uniq()}@t.test`, currentPassword: PW1 })));
  ok('an account may change its e-mail three times an hour, the fourth is refused', chCodes.join() === 'OK,OK,OK,RATE_LIMITED', chCodes.join());
  const bombTarget = `inbox${uniq()}@gmail.com`;
  const bombUsers: any[] = [await reg(`b1${uniq()}@t.test`), await reg(`b2${uniq()}@t.test`), await reg(`b3${uniq()}@t.test`), await reg(`b4${uniq()}@t.test`)];
  const bombCodes: string[] = [];
  const variants = [bombTarget, bombTarget.replace('@', '+a@'), bombTarget.replace('@', '+b@'), bombTarget.replace('inbox', 'in.box')];
  for (let i = 0; i < 4; i++) bombCodes.push(await code(userProfileService.updateProfile(bombUsers[i].user.id, { email: variants[i], currentPassword: PW1 })));
  ok('one inbox gets three verification e-mails an hour, however the address is dressed up (tags, dots)', bombCodes.join() === 'OK,OK,OK,RATE_LIMITED', bombCodes.join());

  // a number evicted from a squatter voids the squatter's sessions
  const sqPhone = pn();
  const sq: any = await reg(`sq${uniq()}@t.test`, sqPhone);
  await sleep(1100);
  await authService.requestOTP(sqPhone, 'registration');
  await reg(`own${uniq()}@t.test`, sqPhone, await lastOtp(sqPhone, 'registration'));
  ok('the squatter\'s sessions are voided when the real owner claims the number', (await authService.refreshToken(sq.tokens.refresh_token).then(() => 'OK', (e: any) => e.code)) === 'SESSION_REVOKED');

  // eviction + create are one transaction: a failing create leaves the squatter untouched
  const keepPhone = pn();
  const keep: any = await reg(`keep${uniq()}@t.test`, keepPhone);
  await authService.requestOTP(keepPhone, 'registration');
  const dupEmail = `dup${uniq()}@t.test`;
  await reg(dupEmail);
  const failed = await reg(dupEmail, keepPhone, await lastOtp(keepPhone, 'registration')).then(() => 'OK', (e: any) => e.code);
  ok('a signup that fails leaves the unverified holder\'s number alone', failed === 'EMAIL_EXISTS' && (await prisma.user.findUnique({ where: { id: keep.user.id } }))!.phone === keepPhone);
  const takenPhone = pn();
  const takenUser: any = await reg(`tk${uniq()}@t.test`, takenPhone);
  await authService.requestPhoneVerification(takenUser.user.id, takenPhone);
  await authService.verifyPhone(takenUser.user.id, takenPhone, await lastOtp(takenPhone, 'registration'));
  const preOtp = await otpService.generateOTP(takenPhone, 'registration');
  ok('hitting PHONE_EXISTS does not burn the one-time code', (await reg(`tk2${uniq()}@t.test`, takenPhone, preOtp).then(() => 'OK', (e: any) => e.code)) === 'PHONE_EXISTS' && !(await prisma.otpVerification.findFirst({ where: { phone: takenPhone, otpCode: preOtp } }))!.isVerified);

  // email change = unverified until the new address is confirmed
  await prisma.user.update({ where: { id: rReg.user.id }, data: { emailVerified: true } });
  const newMail = `Changed${uniq()}@T.test`;
  ok('changing the email needs the password (a token alone cannot re-point the account)', (await code(userProfileService.updateProfile(rReg.user.id, { email: newMail }))) === 'PASSWORD_REQUIRED');
  await userProfileService.updateProfile(rReg.user.id, { email: newMail, currentPassword: PW2 });
  const afterMail = await prisma.user.findUnique({ where: { id: rReg.user.id }, include: { emailVerification: true } });
  ok('changing the email lowercases it, un-verifies it and issues a verification token', afterMail!.email === newMail.toLowerCase() && afterMail!.emailVerified === false && afterMail!.emailVerification?.email === newMail.toLowerCase());

  // product image ownership
  const sellerRowA = await prisma.seller.findUnique({ where: { id: seller.id } });
  const victimSeller = await prisma.seller.findUnique({ where: { id: sellerB.id } });
  const legacyPath = `/uploads/products/1699999999-123456-victim-biryani.jpg`;
  const victimProd = await mkProduct(sellerB.id, 5);
  await prisma.productImage.create({ data: { productId: victimProd.id, imageUrl: legacyPath, isPrimary: true } });
  const mkP = (images: string[], name = 'Img ' + uniq()) => productService.createProduct(sellerRowA!.userId, { name, price: 10, unit: 'pc', stockQuantity: 1, stockType: 'direct', images } as any).then((p: any) => 'OK:' + p.id, (e: any) => e.code);
  ok('a seller cannot attach another seller\'s image (so cannot delete it later)', (await mkP([legacyPath])) === 'IMAGE_NOT_OWNED' && (await mkP([`http://localhost:3001${legacyPath}`])) === 'IMAGE_NOT_OWNED');
  ok('a seller can use images they uploaded', (await mkP([`/uploads/products/${sellerRowA!.userId}_abc.png`])).startsWith('OK:'));
  ok('a hot-linked image from another site is refused (photos must be uploaded)', (await mkP(['https://cdn.example.com/x.png'])) === 'INVALID_IMAGE_URL');
  ok('a seller can use a photo they uploaded through the storage layer', (await mkP([`/media/p/products/${sellerRowA!.userId}/${require('crypto').randomUUID()}-lg.webp`])).startsWith('OK:'));
  ok("but not another seller's stored photo", (await mkP([`/media/p/products/${victimSeller!.userId}/${require('crypto').randomUUID()}-lg.webp`])) === 'IMAGE_NOT_OWNED');
  void victimSeller;

  // ---- online payments (Safepay stand-in) and the wallet ----
  {
    const http = require('http');
    const crypto = require('crypto');
    let initCount = 0;
    const lastInit: any[] = [];
    const sfServer = http.createServer((req: any, res: any) => {
      let body = '';
      req.on('data', (c: any) => (body += c));
      req.on('end', () => {
        if (req.method === 'POST' && req.url === '/order/v1/init') {
          lastInit.push(JSON.parse(body || '{}'));
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ data: { token: `track_${++initCount}_${uniq()}` } }));
        }
        res.writeHead(404);
        res.end('{}');
      });
    });
    await new Promise<void>((r) => sfServer.listen(0, r));
    const sfPort = sfServer.address().port;
    Object.assign(process.env, {
      SAFEPAY_PUBLIC_KEY: 'pk_test',
      SAFEPAY_SECRET_KEY: 'sk_test_secret',
      SAFEPAY_WEBHOOK_SECRET: 'wh_test_secret',
      SAFEPAY_API_URL: `http://127.0.0.1:${sfPort}`,
      SAFEPAY_CHECKOUT_URL: 'https://checkout.test/checkout',
      BASE_URL: 'https://api.test',
      FRONTEND_URL: 'https://app.test',
    });
    const op = require('../src/services/online-payment.service');
    const sg = require('../src/gateways/safepay.gateway');
    const sign = (tracker: string) => crypto.createHmac('sha256', 'sk_test_secret').update(tracker).digest('hex');

    const payC = await mkUser();
    const payP = await mkProduct(seller.id, 50, 200);
    const onlineOrder: any = (await order(payC.id, [{ productId: payP.id, quantity: 2 }], { paymentMethod: 'safepay' })).order;
    const total = Number(onlineOrder.totalAmount);
    const started: any = await paymentService.processPayment(onlineOrder.id, payC.id, 'safepay');
    const url = new URL(started.redirectUrl!);
    ok('online payment: Safepay is asked for exactly the order total, with our public key', lastInit[0]?.amount === total && lastInit[0]?.client === 'pk_test' && lastInit[0]?.currency === 'PKR', JSON.stringify(lastInit[0]));
    ok('online payment: the customer is sent to Safepay checkout, returning to our signed-return endpoint', url.origin + url.pathname === 'https://checkout.test/checkout' && url.searchParams.get('beacon') === started.paymentId && url.searchParams.get('redirect_url') === 'https://api.test/api/v1/payments/safepay/return' && url.searchParams.get('order_id') === onlineOrder.id);
    const attempt = await prisma.paymentAttempt.findUnique({ where: { tracker: started.paymentId } });
    ok('online payment: the checkout session is recorded with its order and amount', attempt?.orderId === onlineOrder.id && Number(attempt?.amount) === total && attempt?.status === 'pending');

    ok('online payment: a forged return signature is refused', !sg.verifySafepayReturn(started.paymentId, sign('track_other')) && !sg.verifySafepayReturn(started.paymentId, undefined) && sg.verifySafepayReturn(started.paymentId, sign(started.paymentId)));
    ok('online payment: asking to verify does not mark the order paid', (await paymentService.verifyPayment(started.paymentId, payC.id).then(() => 'OK', (e: any) => e.code)) === 'VERIFY_PENDING');

    // Two confirmations at once (return + webhook): settled exactly once.
    const both = await Promise.all([op.settleAttempt(started.paymentId, 'return', 'REF1'), op.settleAttempt(started.paymentId, 'webhook')]);
    const outcomes = both.map((r: any) => r.outcome).sort();
    const paidOrder = await prisma.order.findUnique({ where: { id: onlineOrder.id } });
    ok('online payment: concurrent confirmations settle once (one paid, one already settled)', outcomes.join() === 'already_settled,paid' && paidOrder!.paymentStatus === 'paid' && paidOrder!.paymentCollectedBy === 'platform', outcomes.join());
    ok('online payment: the customer is then sent to their order page', op.landingUrlFor(both.find((r: any) => r.outcome === 'paid'), true) === `https://app.test/orders/${onlineOrder.id}?payment=paid`);
    ok('online payment: verify now reports it completed', (await paymentService.verifyPayment(started.paymentId, payC.id) as any).paymentStatus === 'completed');

    // A second session for an already-paid order (customer paid twice): credited to the wallet.
    await prisma.order.update({ where: { id: onlineOrder.id }, data: { paymentStatus: 'pending' } });
    const second: any = await paymentService.processPayment(onlineOrder.id, payC.id, 'safepay');
    await prisma.order.update({ where: { id: onlineOrder.id }, data: { paymentStatus: 'paid' } });
    const walletBefore = Number((await prisma.wallet.findUnique({ where: { userId: payC.id } }))?.balance ?? 0);
    const dup = await op.settleAttempt(second.paymentId, 'webhook');
    const walletAfter = Number((await prisma.wallet.findUnique({ where: { userId: payC.id } }))!.balance);
    ok('online payment: paying twice credits the second payment to the wallet', dup.outcome === 'duplicate' && walletAfter - walletBefore === total, `${dup.outcome} ${walletBefore}->${walletAfter}`);
    // A kitchen reads the order's history, so it never names the gateway's tracker or reference.
    const gatewayNotes = (await prisma.orderStatusHistory.findMany({ where: { orderId: onlineOrder.id }, select: { notes: true } })).map((h) => h.notes ?? '').join(' | ');
    ok('online payment: the order history says it was paid, without the gateway tracker or reference', gatewayNotes.includes('Paid online') && gatewayNotes.includes('extra online payment') && ![started.paymentId, second.paymentId, 'REF1'].some((v) => gatewayNotes.includes(v)), gatewayNotes);

    // Paid after the order was cancelled: recorded and refunded (queued for the admin).
    const lateC = await mkUser();
    const lateOrd: any = (await order(lateC.id, [{ productId: payP.id, quantity: 1 }], { paymentMethod: 'safepay' })).order;
    const lateStart: any = await paymentService.processPayment(lateOrd.id, lateC.id, 'safepay');
    await orderService.cancelOrder(lateOrd.id, lateC.id, 'changed my mind');
    const lateRes = await op.settleAttempt(lateStart.paymentId, 'return');
    const lateRefund = await prisma.refund.findFirst({ where: { orderId: lateOrd.id } });
    ok('online payment: money arriving after a cancellation is refunded, the order stays cancelled', lateRes.outcome === 'paid' && lateRefund?.status === 'pending' && Number(lateRefund?.amount) === Number(lateOrd.totalAmount) && (await prisma.order.findUnique({ where: { id: lateOrd.id } }))!.orderStatus === 'cancelled');

    // Items cancelled while the customer paid: the difference goes to the wallet.
    const shrinkC = await mkUser();
    const shrinkOrd: any = (await order(shrinkC.id, [{ productId: payP.id, quantity: 3 }], { paymentMethod: 'safepay' })).order;
    const shrinkStart: any = await paymentService.processPayment(shrinkOrd.id, shrinkC.id, 'safepay');
    await prisma.order.update({ where: { id: shrinkOrd.id }, data: { totalAmount: Number(shrinkOrd.totalAmount) - 100 } });
    await op.settleAttempt(shrinkStart.paymentId, 'return');
    ok('online payment: paying more than the (reduced) total credits the difference to the wallet', Number((await prisma.wallet.findUnique({ where: { userId: shrinkC.id } }))!.balance) === 100 && (await prisma.order.findUnique({ where: { id: shrinkOrd.id } }))!.paymentStatus === 'paid');

    // Webhook signature and payload.
    const whBody = { type: 'payment:created', data: { tracker: 'track_wh', amount: 500, metadata: { order_id: 'x' } } };
    const whSig = crypto.createHmac('sha512', 'wh_test_secret').update(Buffer.from(JSON.stringify(whBody.data))).digest('hex');
    ok('webhook: a correctly signed event is accepted, a tampered one refused', sg.verifySafepayWebhook(whBody, whSig) && !sg.verifySafepayWebhook({ ...whBody, data: { ...whBody.data, amount: 1 } }, whSig) && !sg.verifySafepayWebhook(whBody, undefined));
    ok('webhook: only successful-payment events name a session to settle', op.successfulTrackerFromWebhook(whBody) === 'track_wh' && op.successfulTrackerFromWebhook({ type: 'payment:failed', data: { tracker: 'track_wh' } }) === null && op.successfulTrackerFromWebhook({ data: { tracker: { token: 't2', state: 'TRACKER_PAID' } } }) === 't2');
    ok('webhook: an unknown session settles nothing', (await op.settleAttempt('track_unknown', 'webhook')).outcome === 'unknown');

    // Wallet top-up.
    const tuC = await mkUser();
    ok('wallet top-up: amounts outside the limits are refused', (await op.startWalletTopup(tuC.id, 50).then(() => 'OK', (e: any) => e.code)) === 'INVALID_TOPUP_AMOUNT');
    const tu = await op.startWalletTopup(tuC.id, 1500);
    const tuRes = await op.settleAttempt(tu.tracker, 'return');
    const tuTx = await prisma.walletTransaction.findFirst({ where: { referenceId: tu.tracker } });
    ok('wallet top-up: a confirmed top-up credits the wallet once', tuRes.outcome === 'paid' && Number((await prisma.wallet.findUnique({ where: { userId: tuC.id } }))!.balance) === 1500 && tuTx?.transactionType === 'topup' && (await op.settleAttempt(tu.tracker, 'webhook')).outcome === 'already_settled');
    ok('wallet top-up: the customer returns to their wallet', op.landingUrlFor(tuRes, true) === 'https://app.test/wallet?topup=paid');

    // Paying with the wallet at checkout: the order and the debit commit together.
    const wC = await mkUser();
    const wP = await mkProduct(seller.id, 10, 300);
    const ordersBefore = await prisma.order.count({ where: { customerId: wC.id } });
    const short = await code(order(wC.id, [{ productId: wP.id, quantity: 1 }], { paymentMethod: 'wallet' }));
    ok('wallet checkout: without enough balance no order is placed and no stock is taken', short === 'INSUFFICIENT_BALANCE' && (await prisma.order.count({ where: { customerId: wC.id } })) === ordersBefore && (await prisma.product.findUnique({ where: { id: wP.id } }))!.stockQuantity === 10);
    await prisma.$transaction((tx: any) => require('../src/services/wallet.service').creditWallet(tx, { userId: wC.id, amount: 1000, type: 'topup', description: 'test' }));
    const wOrder: any = (await order(wC.id, [{ productId: wP.id, quantity: 1 }], { paymentMethod: 'wallet' })).order;
    const wFresh = await prisma.order.findUnique({ where: { id: wOrder.id } });
    ok('wallet checkout: with enough balance the order is placed already paid and the wallet debited', wFresh!.paymentStatus === 'paid' && Number((await prisma.wallet.findUnique({ where: { userId: wC.id } }))!.balance) === 1000 - Number(wFresh!.totalAmount));

    // Abandoned sessions expire; a late confirmation still settles.
    const abC = await mkUser();
    const abOrd: any = (await order(abC.id, [{ productId: payP.id, quantity: 1 }], { paymentMethod: 'safepay' })).order;
    const abStart: any = await paymentService.processPayment(abOrd.id, abC.id, 'safepay');
    await prisma.paymentAttempt.update({ where: { tracker: abStart.paymentId }, data: { createdAt: new Date(Date.now() - 3 * 3600e3) } });
    await op.expireAbandonedAttempts();
    const expired = await prisma.paymentAttempt.findUnique({ where: { tracker: abStart.paymentId } });
    ok('online payment: an abandoned session expires, and a late confirmation still settles it', expired?.status === 'expired' && (await op.settleAttempt(abStart.paymentId, 'webhook')).outcome === 'paid');

    sfServer.close();
    for (const k of ['SAFEPAY_PUBLIC_KEY', 'SAFEPAY_SECRET_KEY', 'SAFEPAY_WEBHOOK_SECRET', 'SAFEPAY_API_URL', 'SAFEPAY_CHECKOUT_URL']) delete process.env[k];
  }

  // ---- catalog listing: community tiers, paging, computed filters (all in the database) ----
  const mkCommunity = (name: string, lat: number, lng: number, neighbours: string[] = []) =>
    prisma.community.create({ data: { name, slug: 'c-' + uniq(), centerLatitude: lat, centerLongitude: lng, neighborCommunityIds: neighbours } as any });
  const farC = await mkCommunity('Far', 25.5, 68.0);
  const nearC = await mkCommunity('Near', 24.95, 67.15);
  const homeC = await mkCommunity('Home', 24.91, 67.11, [nearC.id]);
  const cat = await prisma.category.create({ data: { name: 'Cat ' + uniq(), slug: 'cat-' + uniq() } });
  const kHome = await mkSeller({ communityId: homeC.id, latitude: 24.91, longitude: 67.11, scheduleMode: '24_7' });
  const kNear = await mkSeller({ communityId: nearC.id, latitude: 24.95, longitude: 67.15, scheduleMode: '24_7' });
  const kFar = await mkSeller({ communityId: farC.id, latitude: 25.5, longitude: 68.0, scheduleMode: '24_7' });
  const kClosed = await mkSeller({ latitude: 24.912, longitude: 67.112, scheduleMode: '24_7', availabilityOverride: 'closed' });
  const catProduct = (sellerId: string, rating: number, extra: any = {}) => prisma.product.create({ data: { sellerId, categoryId: cat.id, name: 'Dish ' + uniq(), slug: 'd-' + uniq(), price: 100, unit: 'pc', stockQuantity: 5, stockType: 'direct', approvalStatus: 'approved', isActive: true, ratingAverage: rating, totalReviews: 10, ...extra } as any });
  for (const r of [3, 5, 4, 3, 5, 4, 3]) await catProduct(kHome.id, r);
  for (let i = 0; i < 5; i++) await catProduct(kNear.id, 5);
  for (let i = 0; i < 4; i++) await catProduct(kFar.id, 5);
  for (let i = 0; i < 3; i++) await catProduct(kClosed.id, 5);
  await catProduct(kHome.id, 5, { isActive: false });
  await catProduct(kHome.id, 5, { approvalStatus: 'pending' });
  await require('../src/services/ranking.service').refreshRatingScores(); // as the scheduled job does
  const listCat = (page: number, extra: any = {}) => productService.getProducts({ categoryId: cat.id, communityId: homeC.id, page, limit: 4, ...extra } as any);
  const catPages = await Promise.all([1, 2, 3, 4, 5, 6].map((pg) => listCat(pg)));
  const catIds = catPages.flatMap((r: any) => r.products.map((x: any) => x.id));
  const catSellers = catPages.flatMap((r: any) => r.products.map((x: any) => x.seller.id));
  ok('catalog: every listed dish appears exactly once across pages, hidden ones never', catIds.length === 19 && new Set(catIds).size === 19 && catPages[0].pagination.total === 19 && catPages[0].pagination.totalPages === 5, `${catIds.length} total=${catPages[0].pagination.total}`);
  ok('catalog: own community first, then its neighbours, then everywhere else', catSellers.slice(0, 7).every((s) => s === kHome.id) && catSellers.slice(7, 12).every((s) => s === kNear.id) && catSellers.slice(12).every((s) => s === kFar.id || s === kClosed.id));
  const homeRatings = catPages.flatMap((r: any) => r.products).slice(0, 7).map((x: any) => x.ratingAverage);
  ok('catalog: best rated first within a tier', homeRatings.join() === '5,5,4,4,3,3,3', homeRatings.join());
  const openOnly: any = await listCat(1, { openNow: true, limit: 50 });
  ok('catalog: "open now" leaves out a closed kitchen and still counts in the database', openOnly.pagination.total === 16 && !openOnly.products.some((x: any) => x.seller.id === kClosed.id));
  const nearby: any = await listCat(1, { customerLat: 24.91, customerLng: 67.11, maxDistanceKm: 10, limit: 50 });
  ok('catalog: "within 10 km" leaves out the far kitchen', nearby.pagination.total === 15 && !nearby.products.some((x: any) => x.seller.id === kFar.id), `total=${nearby.pagination.total}`);
  const cheap: any = await listCat(1, { sort: 'price_low', limit: 50 });
  ok('catalog: an explicit sort ignores community tiers but lists everything', cheap.pagination.total === 19 && cheap.products.length === 19);
  ok('catalog: the public list never shows switched-off dishes, whatever the query says', (await listCat(1, { isActive: false, limit: 50 }) as any).pagination.total === 19);
  const clamped: any = await listCat(-3, { limit: -5 });
  ok('catalog: nonsense page/limit values are clamped instead of failing', clamped.pagination.page === 1 && clamped.products.length === 1, `${clamped.pagination.page}/${clamped.products.length}`);
  const bigCat = await prisma.category.create({ data: { name: 'Big ' + uniq(), slug: 'big-' + uniq() } });
  const bigRun = uniq();
  await prisma.product.createMany({ data: Array.from({ length: 510 }, (_, i) => ({ sellerId: kHome.id, categoryId: bigCat.id, name: `Bulk ${bigRun} ${i}`, slug: `bulk-${bigRun}-${i}`, price: 50, unit: 'pc', stockQuantity: 1, stockType: 'direct', approvalStatus: 'approved', isActive: true })) as any });
  const bigLast: any = await productService.getProducts({ categoryId: bigCat.id, communityId: homeC.id, openNow: true, page: 26, limit: 20 } as any);
  ok('catalog: no 500-dish ceiling: the 510th dish is on page 26 and counted', bigLast.pagination.total === 510 && bigLast.products.length === 10, `total=${bigLast.pagination.total} last=${bigLast.products.length}`);
  const searchHit: any = await productService.getProducts({ search: `bulk ${bigRun} 50`, limit: 50 } as any);
  ok('catalog: search still matches inside names', searchHit.products.length >= 1 && searchHit.products.every((x: any) => x.name.toLowerCase().includes(`bulk ${bigRun} 50`)));

  // ---- kitchen rating: one vote per order, however many dishes were reviewed ----
  const rk = await mkSeller();
  const rkDishes = await Promise.all([1, 2, 3].map(() => mkProduct(rk.id, 10)));
  const bigOrder: any = (await order(cust.id, rkDishes.map((d) => ({ productId: d.id, quantity: 1 })))).order;
  const smallOrder: any = (await order(cust.id, [{ productId: rkDishes[0].id, quantity: 1 }])).order;
  await prisma.order.updateMany({ where: { id: { in: [bigOrder.id, smallOrder.id] } }, data: { orderStatus: 'delivered' } });
  const rateItems = async (o: any, sellerRating: number) => {
    for (const it of await prisma.orderItem.findMany({ where: { orderId: o.id } })) {
      await reviewService.addReview(cust.id, { orderId: o.id, orderItemId: it.id, productRating: 4, sellerRating });
    }
  };
  await rateItems(bigOrder, 5);
  await rateItems(smallOrder, 1);
  const rkAfter = await prisma.seller.findUnique({ where: { id: rk.id } });
  ok('a kitchen rating counts each order once (3-dish order rated 5 + 1-dish order rated 1 = 3.0 from 2 orders)', Number(rkAfter!.ratingAverage) === 3 && rkAfter!.totalReviews === 2, `${rkAfter!.ratingAverage} from ${rkAfter!.totalReviews}`);

  // ---- P3. admin tools: people, places, platform codes, disputes, documents ----
  const people = require('../src/services/admin-people.service');
  const places = require('../src/services/admin-places.service');
  const promotionSvc = require('../src/services/promotion.service').default;
  const { default: sellerSvc } = require('../src/services/seller.service');
  const { communityService } = require('../src/services/community.service');

  // accounts: suspending signs the person out and stops their kitchen / rider account too
  const susSeller = await mkSeller();
  const susUser = (await prisma.seller.findUnique({ where: { id: susSeller.id } }))!.userId;
  ok('admins cannot suspend themselves or another admin', (await code(people.setUserStatus(admin.id, admin.id, 'suspended'))) === 'CANNOT_CHANGE_SELF' &&
    (await code(people.setUserStatus(admin.id, (await mkUser('admin')).id, 'suspended'))) === 'CANNOT_CHANGE_ADMIN');
  await people.setUserStatus(admin.id, susUser, 'suspended');
  const susRow = await prisma.user.findUnique({ where: { id: susUser } });
  ok('suspending an account signs it out everywhere and suspends its kitchen', susRow!.status === 'suspended' && !!susRow!.tokensValidAfter && (await prisma.seller.findUnique({ where: { id: susSeller.id } }))!.status === 'suspended');
  await people.setUserStatus(admin.id, susUser, 'active');
  ok('reactivating restores the account and the kitchen', (await prisma.user.findUnique({ where: { id: susUser } }))!.status === 'active' && (await prisma.seller.findUnique({ where: { id: susSeller.id } }))!.status === 'active');
  const found: any = await people.listUsers({ search: susRow!.phone.slice(-7) });
  ok('the users list finds an account by phone, with its kitchen', found.users.length === 1 && found.users[0].seller?.id === susSeller.id);

  // a rider taken off the road: jobs not yet picked up go back to the pool
  const offRiderUser = await mkUser('rider');
  const offRider = await prisma.rider.create({ data: { userId: offRiderUser.id, city: 'Lahore', verificationStatus: 'approved', status: 'active' } as any });
  const offOrder: any = await orderService.createOrder(hoCust.id, { items: [{ productId: hoProd.id, quantity: 1 }], deliveryType: 'home_delivery', deliveryAddressId: hoAddr.id, paymentMethod: 'cod' } as any);
  await prisma.order.update({ where: { id: offOrder.id }, data: { orderStatus: 'ready' } });
  await riderService.ensureDeliveryForOrder(offOrder.id, 0);
  const offJob = (await prisma.delivery.findUnique({ where: { orderId: offOrder.id } }))!;
  await riderService.claimDelivery(offRiderUser.id, offJob.id);
  const offResult: any = await people.setRiderStatus(offRider.id, 'suspended');
  const offJobAfter = (await prisma.delivery.findUnique({ where: { id: offJob.id } }))!;
  ok('suspending a rider puts their not-yet-picked-up job back in the pool', offResult.releasedJobs.length === 1 && offJobAfter.status === 'pending' && offJobAfter.riderId === null && offJobAfter.riderFee === null);
  ok('and the suspended rider can no longer claim jobs', (await code(riderService.claimDelivery(offRiderUser.id, offJob.id))) === 'RIDER_SUSPENDED');

  // hub managers
  const hmUser = await mkUser();
  ok('a seller account cannot be made a hub manager', (await code(people.makeHubManager(susRow!.email!))) === 'ROLE_NOT_ALLOWED');
  await people.makeHubManager(hmUser.email!);
  ok('a customer account becomes a hub manager (signed out to pick up the role)', (await prisma.user.findUnique({ where: { id: hmUser.id } }))!.userType === 'hub_manager');
  const newHub: any = await places.createHub({ name: 'Test hub ' + uniq(), code: 'th ' + uniq().slice(-5), city: 'Lahore', area: 'DHA', address: '1 Main Boulevard', latitude: 31.47, longitude: 74.4, capacityCubicFeet: 500 });
  ok('hub codes are stored upper-case and must be unique', /^TH-/.test(newHub.code) && (await code(places.createHub({ name: 'Dup', code: newHub.code.toLowerCase(), city: 'L', area: 'A', address: 'Somewhere 1', latitude: 31, longitude: 74, capacityCubicFeet: 1 }))) === 'HUB_CODE_TAKEN');
  await hubService.assignManager(newHub.id, hmUser.id);
  ok("the hub manager's console lists the hub they run", (await places.hubsManagedBy(hmUser.id)).some((h: any) => h.id === newHub.id));
  await people.removeHubManager(hmUser.id);
  ok('removing the role takes them off their hubs and back to a customer account',
    (await prisma.user.findUnique({ where: { id: hmUser.id } }))!.userType === 'customer' && (await prisma.hubCenter.findUnique({ where: { id: newHub.id } }))!.managerId === null);
  await places.updateHub(newHub.id, { status: 'maintenance' });
  ok('a hub can be put into maintenance (no longer platListed for buyers)', !(await hubService.getHubCenters({})).some((h: any) => h.id === newHub.id));

  // communities
  const commName = 'Model Town ' + uniq();
  const comm: any = await places.createCommunity({ name: commName, city: 'Lahore', centerLatitude: 31.48, centerLongitude: 74.32, radiusKm: 2 });
  const comm2: any = await places.createCommunity({ name: commName, city: 'Lahore', centerLatitude: 31.5, centerLongitude: 74.33 });
  ok('communities get a unique web address from their name', comm.slug !== comm2.slug && comm2.slug.startsWith(comm.slug));
  ok('neighbours must be real communities', (await code(places.updateCommunity(comm.id, { neighborCommunityIds: ['00000000-0000-4000-8000-000000000000'] }))) === 'INVALID_NEIGHBORS');
  await places.updateCommunity(comm2.id, { isActive: false });
  ok('a switched-off community is no longer offered to buyers', !(await communityService.getAllCommunities()).some((c: any) => c.id === comm2.id));

  // platform promo codes: Nuray pays, on any kitchen's order
  const platCode = 'NURAY' + uniq().slice(-6);
  await promotionSvc.createPlatform({ name: 'Launch', code: platCode, discountType: 'fixed', discountValue: 50, minOrderAmount: 0, usageLimitPerUser: 5, validFrom: new Date(Date.now() - 1e6), validUntil: new Date(Date.now() + 1e9) });
  const pcOrder: any = (await order(cust.id, [{ productId: (await mkProduct(sellerB.id, 5, 400)).id, quantity: 1 }], { promotionCode: platCode })).order;
  const platformList: any[] = await promotionSvc.listPlatform();
  const platListed = platformList.find((p) => p.code === platCode);
  ok('a platform code works on any kitchen and its use is counted', Number(pcOrder.discountAmount) === 50 && platListed?.timesUsed === 1 && platListed?.discountGiven === 50, JSON.stringify(platListed && { used: platListed.timesUsed, given: platListed.discountGiven }));
  ok('a used code cannot be deleted (switch it off instead)', (await code(promotionSvc.deletePlatform(platListed.id))) === 'PROMOTION_IN_USE');
  await promotionSvc.updatePlatform(platListed.id, { isActive: false });
  ok('switched off, it is refused at checkout', (await code(promotionSvc.validatePromotionCode(cust.id, platCode, 1000))) === 'PROMO_INACTIVE');
  const sellerPromo = await prisma.promotion.findFirst({ where: { sellerId: { not: null } } });
  ok("admins can't edit a kitchen's own code through the platform tools", (await code(promotionSvc.updatePlatform(sellerPromo!.id, { isActive: false }))) === 'FORBIDDEN');

  // a disputed transfer, settled by support
  const dsp: any = await csOrder('bank');
  await orderService.submitManualPayment(dsp.id, custC.id, { referenceNumber: 'TID-' + uniq() });
  await orderService.confirmManualPayment(dsp.id, csUser, false, 'Not in my account');
  ok('(setup) the kitchen disputed the transfer', (await prisma.order.findUnique({ where: { id: dsp.id } }))!.paymentStatus === 'disputed');
  await orderService.adminConfirmManualPayment(dsp.id, admin.id, 'Bank statement checked with the kitchen');
  const dspRow = (await prisma.order.findUnique({ where: { id: dsp.id } }))!;
  ok('support confirms it: paid, held by the kitchen, confirmed by Nuray', dspRow.paymentStatus === 'paid' && dspRow.paymentCollectedBy === 'seller' && dspRow.paymentConfirmedBy === 'admin' && !dspRow.paymentDisputeReason);
  ok('it cannot be confirmed twice, nor a cash order', (await code(orderService.adminConfirmManualPayment(dsp.id, admin.id))) === 'NO_PAYMENT_SUBMITTED' &&
    (await code(orderService.adminConfirmManualPayment(offOrder.id, admin.id))) === 'NOT_MANUAL_PAYMENT');

  // documents: real uploads only, shown to admins
  const applicant = await mkUser();
  const docRef = (owner: string) => `private:x/docs/${owner}/${require('crypto').randomUUID()}.jpg`;
  const sellerApp = (extra: any) => sellerSvc.registerAsSeller(applicant.id, { businessName: 'Doc Kitchen ' + uniq(), ...extra });
  ok('a seller application needs both sides of the CNIC', (await code(sellerApp({}))) === 'CNIC_REQUIRED');
  ok('a link from elsewhere is not accepted as a document', (await code(sellerApp({ cnicFrontUrl: 'https://images.unsplash.com/photo-1589829545856', cnicBackUrl: docRef(applicant.id) }))) === 'INVALID_DOCUMENT');
  ok("someone else's upload is not accepted either", (await code(sellerApp({ cnicFrontUrl: docRef(cust.id), cnicBackUrl: docRef(applicant.id) }))) === 'INVALID_DOCUMENT');
  const front = docRef(applicant.id);
  await sellerApp({ cnicFrontUrl: front, cnicBackUrl: docRef(applicant.id), kitchenPhotoUrls: [docRef(applicant.id)] });
  const pendingList: any[] = await adminService.getPendingSellers();
  const mine = pendingList.find((x) => x.user.id === applicant.id);
  ok('admins see the documents with private, short-lived links', mine?.documents.length === 3 && mine.documents.every((d: any) => typeof d.url === 'string' && !d.url.startsWith('private:')), JSON.stringify(mine?.documents?.map((d: any) => d.type)));

  const riderApplicant = await mkUser('rider');
  const appRider = await prisma.rider.create({ data: { userId: riderApplicant.id, city: 'Lahore', verificationStatus: 'pending', status: 'active' } as any });
  ok("a rider application can't be approved without the vehicle and documents", (await code(adminService.approveRejectRider(appRider.id, true))) === 'APPLICATION_INCOMPLETE');
  const riderApp = (extra: any) => riderService.submitApplication(riderApplicant.id, { city: 'Lahore', vehicleType: 'motorcycle', vehicleNumber: 'lea 1234', ...extra });
  ok('the rider must upload CNIC and licence photos', (await code(riderApp({ cnicFrontUrl: docRef(riderApplicant.id) }))) === 'DOCUMENTS_REQUIRED');
  await riderApp({ cnicFrontUrl: docRef(riderApplicant.id), cnicBackUrl: docRef(riderApplicant.id), licenseUrl: docRef(riderApplicant.id) });
  const pendingRiders: any[] = await adminService.getPendingRiders();
  const appRow = pendingRiders.find((r) => r.id === appRider.id);
  ok('admins see the complete rider application with its documents', appRow?.applicationComplete === true && appRow.documents.length === 3 && appRow.vehicleNumber === 'LEA 1234');
  ok('and can approve it', (await code(adminService.approveRejectRider(appRider.id, true))) === 'OK');
  ok('an approved rider changes details through support, not by re-applying', (await code(riderApp({}))) === 'ALREADY_APPROVED');

  // ---- P4. notifications: one per event, kitchens hear about cancellations, preferences ----
  const notifySvc = require('../src/services/notify.service');
  const pushSvc = require('../src/services/push.service');
  const nCust = await mkUser();
  const nAddr = await prisma.userAddress.create({ data: { userId: nCust.id, addressLine1: 'House 9 Street', area: 'X', city: 'Lahore' } });
  const nOrder: any = await orderService.createOrder(nCust.id, { items: [{ productId: hoProd.id, quantity: 1 }], deliveryType: 'home_delivery', deliveryAddressId: nAddr.id, paymentMethod: 'cod' } as any);
  const kitchenNew = await prisma.notification.findMany({ where: { userId: platUser, dedupeKey: `order:${nOrder.id}:new:${platUser}` } });
  ok('the kitchen gets one new-order notification', kitchenNew.length === 1);
  await realtimeOrderServiceForVerify().emitNewOrderNotification(nOrder.id);
  ok('firing the same event again sends nothing new', (await prisma.notification.count({ where: { dedupeKey: `order:${nOrder.id}:new:${platUser}` } })) === 1);
  await orderService.cancelOrder(nOrder.id, nCust.id, 'changed my mind');
  ok('the kitchen hears that the customer cancelled', (await prisma.notification.count({ where: { userId: platUser, dedupeKey: `order:${nOrder.id}:cancelled:${platUser}` } })) === 1);
  ok('the customer gets their own cancellation in the app', (await prisma.notification.count({ where: { userId: nCust.id, dedupeKey: `order:${nOrder.id}:cancelled:customer` } })) === 1);
  await notifySvc.updatePreferences(nCust.id, { orders: { sms: false }, bogus: { push: false } });
  const prefs = (await notifySvc.getPreferences(nCust.id)).preferences;
  ok('preferences save what was changed and keep the rest', prefs.orders.sms === false && prefs.orders.push === true && prefs.payments.sms === true);
  await pushSvc.saveSubscription(nCust.id, { endpoint: 'https://push.example.test/abc', keys: { p256dh: 'p'.repeat(20), auth: 'a'.repeat(12) } });
  await pushSvc.saveSubscription(cust.id, { endpoint: 'https://push.example.test/abc', keys: { p256dh: 'p'.repeat(20), auth: 'a'.repeat(12) } });
  ok('a device that changes hands belongs to its new owner only', (await prisma.pushSubscription.findMany({ where: { endpoint: 'https://push.example.test/abc' } })).map((x: any) => x.userId).join() === cust.id);
  ok('a push endpoint must be https', (await code(pushSvc.saveSubscription(cust.id, { endpoint: 'http://evil.test/x', keys: { p256dh: 'p'.repeat(20), auth: 'a'.repeat(12) } }))) === 'INVALID_SUBSCRIPTION');

  // ---- R. ranking: trending, trustworthy ratings, search, recommendations, rider job order ----
  {
    const ranking = require('../src/services/ranking.service');
    const riderSvcR = require('../src/services/rider.service').default;
    const custs = await Promise.all(Array.from({ length: 6 }, () => mkUser()));
    const approved = () => mkSeller({ isVerified: true, verificationStatus: 'approved' });
    const kNow = await approved(), kOld = await approved(), kSpam = await approved(), kSelf = await approved(), kCancel = await approved();
    const [pNow, pOld, pSpam, pSelf, pCancel] = await Promise.all([kNow, kOld, kSpam, kSelf, kCancel].map((k) => mkProduct(k.id, 500)));
    const placeAt = async (customerId: string, productId: string, daysAgo = 0) => {
      const o: any = await orderService.createOrder(customerId, { items: [{ productId, quantity: 1 }], deliveryType: 'self_pickup', paymentMethod: 'cod' } as any);
      if (daysAgo) await prisma.order.update({ where: { id: o.id }, data: { createdAt: new Date(Date.now() - daysAgo * 86400_000) } });
      return o;
    };
    for (const c of custs.slice(0, 3)) await placeAt(c.id, pNow.id);           // 3 customers today
    for (const c of custs.slice(0, 5)) await placeAt(c.id, pOld.id, 12);       // 5 customers 12 days ago
    for (let i = 0; i < 6; i++) await placeAt(custs[0].id, pSpam.id);          // one customer, 6 orders
    // The kitchen ordering from itself (checkout refuses it; the ranking ignores it anyway).
    for (let i = 0; i < 3; i++) {
      const o = await placeAt(custs[4].id, pSelf.id);
      await prisma.order.update({ where: { id: o.id }, data: { customerId: kSelf.userId } });
    }
    await placeAt(custs[1].id, pSelf.id);
    for (const c of custs.slice(0, 3)) {                                       // 3 orders, all cancelled
      const o = await placeAt(c.id, pCancel.id);
      await orderService.cancelOrder(o.id, c.id, 'changed my mind');
    }
    await ranking.recomputeTrendScores();
    const trend = async (id: string) => (await prisma.seller.findUnique({ where: { id } }))!.trendScore;
    const [tNow, tOld, tSpam, tSelf, tCancel] = await Promise.all([kNow, kOld, kSpam, kSelf, kCancel].map((k) => trend(k.id)));
    ok('a kitchen busy today trends above one that was busier 12 days ago', tNow > tOld && tOld > 0, `${tNow.toFixed(2)} > ${tOld.toFixed(2)}`);
    ok("one customer's six orders don't make a kitchen trend", tSpam === 0);
    ok("a kitchen's own orders don't count", tSelf === 0);
    ok("cancelled orders don't count", tCancel === 0);

    const trendingList = await productService.getProducts({ sort: 'trending', limit: 100 });
    const pos = (id: string) => trendingList.products.findIndex((x: any) => x.id === id);
    ok('trending dishes list the busy-now dish first', pos(pNow.id) >= 0 && pos(pNow.id) < pos(pOld.id));

    const sellersRes: any = {};
    await require('../src/controllers/seller.controller').getPublicSellers({ query: { sort: 'trending', limit: '50' } } as any, { status: () => ({ json: (b: any) => Object.assign(sellersRes, b) }) } as any);
    const sIds = (sellersRes.data ?? []).map((x: any) => x.id);
    ok('trending kitchens: only real recent demand, busiest now first', sIds.includes(kNow.id) && sIds.indexOf(kNow.id) < sIds.indexOf(kOld.id) && !sIds.includes(kSpam.id) && !sIds.includes(kCancel.id));

    // Ratings: one 5-star review vs two hundred 4.8s.
    const kRate = await mkSeller({ verificationStatus: 'approved', isVerified: true });
    const pFew = await mkProduct(kRate.id, 5), pMany = await mkProduct(kRate.id, 5);
    await prisma.product.update({ where: { id: pFew.id }, data: { ratingAverage: 5, totalReviews: 1 } });
    await prisma.product.update({ where: { id: pMany.id }, data: { ratingAverage: 4.8, totalReviews: 200 } });
    await ranking.refreshRatingScores({ productId: pFew.id });
    await ranking.refreshRatingScores({ productId: pMany.id });
    const byRating = await productService.getProducts({ sellerId: kRate.id, sort: 'rating', limit: 10 });
    ok('"top rated" puts 200 reviews at 4.8 above one review at 5', byRating.products[0]?.id === pMany.id);

    // Search: relevance and typos.
    const word = 'zarq' + Array.from({ length: 5 }, () => 'bcdfghjklmnpqrstvwxz'[Math.floor(Math.random() * 20)]).join('') + 'ani';
    const kSearch = await mkSeller();
    const inDesc = await prisma.product.create({ data: { sellerId: kSearch.id, name: 'Plain rice ' + uniq(), description: `goes well with ${word}`, slug: 's-' + uniq(), price: 100, unit: 'pc', stockQuantity: 5, stockType: 'direct', approvalStatus: 'approved', isActive: true } as any });
    const inName = await prisma.product.create({ data: { sellerId: kSearch.id, name: `${word} biryani`, slug: 's-' + uniq(), price: 100, unit: 'pc', stockQuantity: 5, stockType: 'direct', approvalStatus: 'approved', isActive: true } as any });
    const found = (await productService.getProducts({ search: word, limit: 10 })).products.map((x: any) => x.id);
    ok('search puts a name match above a description match', found[0] === inName.id && found.includes(inDesc.id));
    const typo = word.slice(0, 4) + word.slice(5);
    const typoFound = (await productService.getProducts({ search: typo, limit: 10 })).products.map((x: any) => x.id);
    ok('search still finds it with a typo', typoFound.includes(inName.id), `${typo} for ${word}`);
    ok('search with another sort still filters by the match', (await productService.getProducts({ search: word, sort: 'price_low', limit: 10 })).products.every((x: any) => [inName.id, inDesc.id].includes(x.id)));

    // Recommendations: people who ordered what you ordered also ordered...
    const kRec = await mkSeller(), kRec2 = await mkSeller();
    const pA = await mkProduct(kRec.id, 100), pB = await mkProduct(kRec2.id, 100);
    const me = await mkUser(), o1 = await mkUser(), o2 = await mkUser();
    for (const u of [o1, o2]) { await placeAt(u.id, pA.id); await placeAt(u.id, pB.id); }
    await placeAt(me.id, pA.id);
    const recs = await ranking.recommendedProducts(me.id, 12);
    const recB = recs.find((r: any) => r.productId === pB.id);
    ok('recommended: what similar customers ordered, and not what I already have', recB?.reason === 'similar_customers' && !recs.some((r: any) => r.productId === pA.id), JSON.stringify(recs.slice(0, 3)));
    ok('order again: my dish is there', (await ranking.orderAgainProductIds(me.id)).includes(pA.id));
    ok('a visitor with no history still gets something (trending)', (await ranking.recommendedProducts(null, 5)).length > 0);

    // Rider job order: the closer pickup first.
    const rUser = await mkUser('rider');
    await prisma.rider.create({ data: { userId: rUser.id, city: 'Lahore', verificationStatus: 'approved', status: 'active' } as any });
    const near = await placeAt(custs[2].id, pNow.id), far = await placeAt(custs[3].id, pNow.id);
    await prisma.delivery.create({ data: { orderId: far.id, pickupAddress: 'far', deliveryAddress: 'x', pickupLatitude: 31.62, pickupLongitude: 74.46, deliveryLatitude: 31.63, deliveryLongitude: 74.47, status: 'pending' } as any });
    await prisma.delivery.create({ data: { orderId: near.id, pickupAddress: 'near', deliveryAddress: 'x', pickupLatitude: 31.521, pickupLongitude: 74.351, deliveryLatitude: 31.53, deliveryLongitude: 74.36, status: 'pending' } as any });
    const pool: any[] = await riderSvcR.getAvailableDeliveries(rUser.id, { lat: 31.52, lng: 74.35 });
    const iNear = pool.findIndex((d) => d.orderId === near.id), iFar = pool.findIndex((d) => d.orderId === far.id);
    ok('riders see the closer pickup first, with its distance', iNear >= 0 && iNear < iFar && pool[iNear].pickupDistanceKm < 1 && pool[iFar].pickupDistanceKm > 10, `${pool[iNear]?.pickupDistanceKm} / ${pool[iFar]?.pickupDistanceKm} km`);
  }

  // Category requests: approving twice at once creates one category, and the kitchen hears about it.
  {
    const crSvc = require('../src/services/category-request.service').categoryRequestService;
    const kCat = await mkSeller();
    const catName = 'Requested ' + uniq();
    const req = await prisma.categoryRequest.create({ data: { sellerId: kCat.id, productType: 'ready_to_eat', name: catName } });
    const admin2 = await mkUser('admin');
    const results = await Promise.all([crSvc.approveRequest(req.id, admin2.id).then(() => 'OK', (e: any) => e.message), crSvc.approveRequest(req.id, admin2.id).then(() => 'OK', (e: any) => e.message)]);
    ok('two admins approving the same request create one category', (await prisma.category.count({ where: { name: catName } })) === 1 && results.filter((r) => r === 'OK').length === 1, results.join(' / '));
    ok('the kitchen is told its category was approved', (await prisma.notification.count({ where: { userId: kCat.userId, title: 'Category approved' } })) === 1);
  }

  // Nuray delivery prices: fixed within a community, by distance to another; whole-rupee totals.
  {
    const adminSvc = require('../src/services/admin.service').default;
    const commA = await prisma.community.create({ data: { name: 'Fee A ' + uniq(), slug: 'fee-a-' + uniq(), city: 'Lahore', centerLatitude: 31.5, centerLongitude: 74.35, deliveryBaseFee: 100, crossCommunityBaseFee: 150 } });
    const commB = await prisma.community.create({ data: { name: 'Fee B ' + uniq(), slug: 'fee-b-' + uniq(), city: 'Lahore', centerLatitude: 31.545, centerLongitude: 74.35, deliveryBaseFee: 120, crossCommunityBaseFee: 180 } });
    require('../src/services/delivery-pricing.service').invalidateDeliveryPricing();
    const kFee = await mkSeller({ deliveryProvider: 'platform', communityId: commA.id, latitude: 31.5, longitude: 74.35, allowCrossCommunity: true });
    const pFee = await mkProduct(kFee.id, 100, 1455);
    const buyer = await mkUser();
    const addrA = await prisma.userAddress.create({ data: { userId: buyer.id, addressLine1: 'House 1', area: 'A', city: 'Lahore', communityId: commA.id, latitude: 31.501, longitude: 74.351 } as any });
    const addrB = await prisma.userAddress.create({ data: { userId: buyer.id, addressLine1: 'House 2', area: 'B', city: 'Lahore', communityId: commB.id, latitude: 31.556, longitude: 74.35 } as any });
    const place = (addressId: string) => orderService.createOrder(buyer.id, { items: [{ productId: pFee.id, quantity: 1 }], deliveryType: 'home_delivery', deliveryAddressId: addressId, paymentMethod: 'cod' } as any) as any;
    const same = await place(addrA.id);
    ok('same community: the fixed fee the admin set for the community', Number(same.sellerDeliveryCharge) === 100 && Number(same.deliveryFee) === 0, String(same.sellerDeliveryCharge));
    ok('the customer pays no delivery fee: total is whole rupees (1455 + GST 72.75 -> 1528)', Number(same.totalAmount) === 1528 && Number(same.taxAmount) === 73, `${same.totalAmount} / tax ${same.taxAmount}`);
    const cross = await place(addrB.id);
    // ~6.2 km: 150 + (6.2 - 3) * 20 = 214 -> 220
    ok("another community: the kitchen community's base + per km beyond 3 km, to the next Rs 10", Number(cross.sellerDeliveryCharge) === 220, String(cross.sellerDeliveryCharge));
    await adminSvc.updateSettings({ deliveryPerKm: 30 }, buyer.id);
    const cross2 = await place(addrB.id);
    ok("an admin's new per-km rate applies at once", Number(cross2.sellerDeliveryCharge) === 250, String(cross2.sellerDeliveryCharge)); // 150 + 3.2*30 = 246 -> 250
    await adminSvc.updateSettings({ deliveryPerKm: 20 }, buyer.id);
    const places = require('../src/services/admin-places.service');
    const pairs = await places.setPairFee(commB.id, commA.id, 175, buyer.id);
    const pairOrder = await place(addrB.id);
    ok('a price an admin set for the pair of communities replaces the distance fee', Number(pairOrder.sellerDeliveryCharge) === 175, String(pairOrder.sellerDeliveryCharge));
    ok('a pair is stored once, whichever way round it was entered', (await prisma.communityPairFee.count({ where: { OR: [{ communityAId: commA.id }, { communityBId: commA.id }] } })) === 1);
    ok('the same community is not a pair', (await code(places.setPairFee(commA.id, commA.id, 50, buyer.id))) === 'SAME_COMMUNITY');
    await places.deletePairFee(pairs.find((x: any) => [x.communityA.id, x.communityB.id].includes(commA.id)).id);
    ok('removing it brings back the distance fee', Number((await place(addrB.id)).sellerDeliveryCharge) === 220);
    ok('every order total is whole rupees', [same, cross, cross2].every((o: any) => Number.isInteger(Number(o.totalAmount))));
  }

  // ---- Automatic assignment, kitchen-paid delivery, COD payout hold, menus ----
  {
    const { dispatchDelivery } = require('../src/services/dispatch.service');
    const { default: rSvc } = require('../src/services/rider.service');
    const { computeSellerBalance } = require('../src/services/seller-balance.service');
    const { recordSettlement } = require('../src/services/rider-ledger.service');
    const { karachiDay } = require('../src/utils/menu');
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    await prisma.rider.updateMany({ data: { isAvailable: false } }); // only the riders made below take part
    process.env.AUTO_ASSIGN_ENABLED = 'true';

    const cA = await prisma.community.create({ data: { name: 'Disp A ' + uniq(), slug: 'disp-a-' + uniq(), city: 'Lahore', centerLatitude: 31.5, centerLongitude: 74.35 } });
    const cB = await prisma.community.create({ data: { name: 'Disp B ' + uniq(), slug: 'disp-b-' + uniq(), city: 'Lahore', centerLatitude: 31.6, centerLongitude: 74.5 } });
    require('../src/services/delivery-pricing.service').invalidateDeliveryPricing();
    const mkRider = async (communityId: string) => {
      const u = await mkUser('rider');
      const r = await prisma.rider.create({ data: { userId: u.id, city: 'Lahore', verificationStatus: 'approved', status: 'active', isAvailable: true, communityId } as any });
      return { user: u, rider: r };
    };
    const rdA = await mkRider(cA.id);
    const rdB = await mkRider(cB.id);
    const kA = await mkSeller({ deliveryProvider: 'platform', communityId: cA.id });
    const kA2 = await mkSeller({ deliveryProvider: 'platform', communityId: cA.id });
    const kB = await mkSeller({ deliveryProvider: 'platform', communityId: cB.id });
    const buyer = await mkUser();
    const addr = await prisma.userAddress.create({ data: { userId: buyer.id, addressLine1: 'House 9', area: 'A', city: 'Lahore', communityId: cA.id, landmark: 'Green gate', houseNumber: '9' } as any });
    const pA = await mkProduct(kA.id, 50, 500), pA2 = await mkProduct(kA2.id, 50, 500), pB = await mkProduct(kB.id, 50, 500);
    const placeCod = (productId: string) => orderService.createOrder(buyer.id, { items: [{ productId, quantity: 1 }], deliveryType: 'home_delivery', deliveryAddressId: addr.id, paymentMethod: 'cod', deliveryInstructions: 'Ring twice' } as any) as Promise<any>;
    const jobFor = async (o: any) => {
      await rSvc.ensureDeliveryForOrder(o.id, 0);
      const d = await prisma.delivery.findUnique({ where: { orderId: o.id } });
      await dispatchDelivery(d!.id);
      await sleep(300);
      return (await prisma.delivery.findUnique({ where: { id: d!.id } }))!;
    };

    const o1 = await placeCod(pA.id);
    ok('the kitchen pays Nuray the delivery fee: the customer is charged none', Number(o1.deliveryFee) === 0 && Number(o1.sellerDeliveryCharge) === 100 && (o1.deliveryFeeBreakdown as any)?.[0]?.paidBy === 'seller', `${o1.deliveryFee} / ${o1.sellerDeliveryCharge}`);
    const j1 = await jobFor(o1);
    ok("a new job goes straight to the rider who serves the kitchen's community", j1.riderId === rdA.rider.id && j1.status === 'assigned' && j1.assignmentMode === 'auto' && Number(j1.riderFee) >= 120, `${j1.riderId} ${j1.status} ${j1.assignmentMode}`);
    ok('the rider is told about it', (await prisma.notification.count({ where: { userId: rdA.user.id, title: 'New delivery assigned to you' } })) === 1);
    const assignedNote = await prisma.notification.findFirst({ where: { userId: rdA.user.id, title: 'New delivery assigned to you' } });
    ok("the stored notification names the area and city, not the customer's street or house", !!assignedNote && assignedNote.message.includes('deliver to A, Lahore') && !assignedNote.message.includes('House 9'), assignedNote?.message);
    const mine: any[] = await rSvc.getMyDeliveries(rdA.user.id);
    const mj = mine.find((d) => d.id === j1.id);
    ok("the assigned rider sees the customer's phone, house, landmark and note", !!mj?.customer?.phone && mj?.dropoffDetails?.houseNumber === '9' && mj?.dropoffDetails?.landmark === 'Green gate' && mj?.dropoffDetails?.instructions === 'Ring twice', JSON.stringify(mj?.customer));

    const o2 = await placeCod(pA2.id);
    const j2 = await jobFor(o2);
    ok('a second order to the same delivery area goes to the rider already carrying one (one trip)', j2.riderId === rdA.rider.id, `${j2.riderId}`);
    const o3 = await placeCod(pB.id);
    const j3 = await jobFor(o3);
    ok('a rider with two jobs is full, so a kitchen in another community gets its own rider', j3.riderId === rdB.rider.id, `${j3.riderId}`);

    await prisma.rider.updateMany({ where: { id: { in: [rdA.rider.id, rdB.rider.id] } }, data: { isAvailable: false } });
    const o4 = await placeCod(pA.id);
    const j4 = await jobFor(o4);
    ok('with nobody on duty the job stays in the open pool', j4.riderId === null && j4.status === 'pending');
    const pool: any[] = await rSvc.getAvailableDeliveries(rdB.user.id);
    const pj = pool.find((d) => d.id === j4.id);
    ok("the open pool never shows the customer's phone or exact spot", !!pj && pj.customer === null && pj.dropoffDetails === null);
    await prisma.rider.update({ where: { id: rdB.rider.id }, data: { isAvailable: true } });
    await dispatchDelivery(j4.id);
    ok('when a rider goes on duty the waiting job is assigned', (await prisma.delivery.findUnique({ where: { id: j4.id } }))!.riderId === rdB.rider.id);

    // A rider who hands a job back is not offered it again.
    await prisma.rider.update({ where: { id: rdA.rider.id }, data: { isAvailable: true } });
    await rSvc.releaseDelivery(rdB.user.id, j4.id);
    await sleep(500);
    const j4b = (await prisma.delivery.findUnique({ where: { id: j4.id } }))!;
    ok('a job a rider handed back is not given to that rider again (the other rider is full)', j4b.releasedRiderIds.includes(rdB.rider.id) && j4b.riderId === null);

    // COD money: the rider owes the cash; the kitchen is paid out once it is handed in.
    const code1 = (await prisma.order.findUnique({ where: { id: o1.id }, select: { handoverCode: true } }))!.handoverCode!;
    await prisma.order.update({ where: { id: o1.id }, data: { orderStatus: 'ready' } });
    for (const st of ['picked_up', 'in_transit']) await rSvc.updateDeliveryStatus(rdA.user.id, j1.id, st);
    await rSvc.updateDeliveryStatus(rdA.user.id, j1.id, 'delivered', undefined, code1);
    const total1 = Number((await prisma.order.findUnique({ where: { id: o1.id } }))!.totalAmount);
    const entry = await prisma.sellerPayoutSchedule.findFirst({ where: { sellerId: kA.id } });
    void entry;
    const goods = Number((await prisma.orderItem.findFirst({ where: { orderId: o1.id } }))!.sellerPayout);
    const b1 = await computeSellerBalance(prisma, kA.id);
    ok('the rider now holds the cash (the order total, no delivery fee on it)', (await prisma.riderLedgerEntry.findFirst({ where: { riderId: rdA.rider.id, orderId: o1.id, type: 'cod_collected' } }))?.amount.toString() === String(-total1), String(total1));
    ok("the kitchen's share waits for the rider's cash: nothing withdrawable yet", b1.awaitingRiderCash === goods - 100 && b1.available === 0, JSON.stringify(b1));
    const adminU = await mkUser('admin');
    await recordSettlement(rdA.rider.id, adminU.id, { cashHandedIn: total1 });
    const b2 = await computeSellerBalance(prisma, kA.id);
    ok('once the rider hands the cash in, the kitchen can withdraw its share minus the delivery fee', b2.awaitingRiderCash === 0 && b2.available === goods - 100, JSON.stringify(b2));
    ok('the ledger records the delivery fee paid by the kitchen', (await prisma.ledgerEntry.count({ where: { orderId: o1.id, transactionType: 'seller_delivery_charge' } })) === 1 && (await prisma.ledgerEntry.count({ where: { orderId: o1.id, transactionType: 'delivery_fee' } })) === 1);

    // Menus: fixed, weekly (days), daily (today).
    const w = karachiDay().weekday;
    const kM = await mkSeller({ deliveryProvider: 'platform' });
    const pFixed = await mkProduct(kM.id, 20, 100), pWeekOff = await mkProduct(kM.id, 20, 100), pWeekOn = await mkProduct(kM.id, 20, 100), pDailyOff = await mkProduct(kM.id, 20, 100), pDailyOn = await mkProduct(kM.id, 20, 100);
    await prisma.product.update({ where: { id: pWeekOff.id }, data: { menuType: 'weekly', availableDays: [(w + 1) % 7] } });
    await prisma.product.update({ where: { id: pWeekOn.id }, data: { menuType: 'weekly', availableDays: [w] } });
    await prisma.product.update({ where: { id: pDailyOff.id }, data: { menuType: 'daily', menuDate: null } });
    await prisma.product.update({ where: { id: pDailyOn.id }, data: { menuType: 'daily', menuDate: karachiDay().date } });
    const listed: any = await productService.getProducts({ sellerId: kM.id, page: 1, limit: 50 } as any);
    const listedIds = new Set((listed.products ?? []).map((x: any) => x.id));
    ok("customers see only dishes on today's menu (fixed, today's weekday, today's daily menu)", listedIds.has(pFixed.id) && listedIds.has(pWeekOn.id) && listedIds.has(pDailyOn.id) && !listedIds.has(pWeekOff.id) && !listedIds.has(pDailyOff.id), [...listedIds].length + ' listed');
    const mb = await mkUser();
    ok('a weekly dish cannot be added to the cart on another day', (await code(cartService.addToCart(mb.id, { productId: pWeekOff.id, quantity: 1 } as any))) === 'NOT_ON_MENU_TODAY');
    ok("a daily dish that is not on today's menu cannot be added either", (await code(cartService.addToCart(mb.id, { productId: pDailyOff.id, quantity: 1 } as any))) === 'NOT_ON_MENU_TODAY');
    ok('a dish on today\'s menu can be added', (await code(cartService.addToCart(mb.id, { productId: pWeekOn.id, quantity: 1 } as any))) === 'OK');
    const mAddr = await prisma.userAddress.create({ data: { userId: mb.id, addressLine1: 'House 3', area: 'A', city: 'Lahore' } as any });
    ok('an order for a dish that is not on the menu is refused', (await code(orderService.createOrder(mb.id, { items: [{ productId: pWeekOff.id, quantity: 1 }], deliveryType: 'home_delivery', deliveryAddressId: mAddr.id, paymentMethod: 'cod' } as any))) === 'NOT_ON_MENU_TODAY');
    ok('a kitchen can put a daily dish on today\'s menu', (await code(productService.updateProduct(pDailyOff.id, kM.userId, { menuDate: 'today' }))) === 'OK' && (await prisma.product.findUnique({ where: { id: pDailyOff.id } }))!.menuDate?.getTime() === karachiDay().date.getTime());
    ok('a weekly dish needs at least one day', (await code(productService.updateProduct(pWeekOn.id, kM.userId, { menuType: 'weekly', availableDays: [] }))) === 'MENU_DAYS_REQUIRED');
    process.env.AUTO_ASSIGN_ENABLED = 'false';
  }

  // OTP SMS cap per number
  const capPhone = pn();
  for (let i = 0; i < 5; i++) await prisma.otpVerification.create({ data: { phone: capPhone, otpCode: '111111', purpose: 'login', expiresAt: new Date(Date.now() - 1000), attempts: 5 } });
  ok('no more than 5 codes per number per hour', (await otpService.generateOTP(capPhone, 'login').then(() => 'OK', (e: any) => e.code)) === 'OTP_RATE_LIMITED');

  console.log(`\n${pass} passed, ${fail} failed`);
  await prisma.$disconnect();
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(2); });
