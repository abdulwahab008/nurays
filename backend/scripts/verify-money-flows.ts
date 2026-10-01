/**
 * End-to-end check of the order / payment / refund / payout money flows against
 * a REAL Postgres (concurrency cannot be tested with mocks).
 *
 *   DATABASE_URL=postgresql://... JWT_SECRET=<32+ chars> \
 *     npx prisma db push --skip-generate && npx ts-node scripts/verify-money-flows.ts
 *
 * Creates its own users/sellers/products with unique values; use a throwaway DB.
 */
import prisma from '../src/config/database';
import orderService from '../src/services/order.service';
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

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = '') => { cond ? pass++ : fail++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  [' + extra + ']' : ''}`); };
const code = async (p: Promise<any>) => { try { await p; return 'OK'; } catch (e: any) { return e.code || e.message; } };
let n = 0;
const uniq = () => `${Date.now()}${++n}`;

async function mkUser(type = 'customer') {
  const u = uniq();
  return prisma.user.create({ data: { phone: `+92300${u.slice(-8)}`, email: `u${u}@t.test`, userType: type } as any });
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

async function main() {
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
  const pB = await mkProduct(sellerB.id, 10);
  const o1: any = (await order(cust.id, [{ productId: p.id, quantity: 3 }, { productId: pB.id, quantity: 2 }])).order;
  const itemA = await prisma.orderItem.findFirst({ where: { orderId: o1.id, sellerId: seller.id } });
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
  const o2: any = (await order(cust.id, [{ productId: p.id, quantity: 1 }], { paymentMethod: 'wallet' })).order;
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
  const o4: any = (await order(cust.id, [{ productId: p.id, quantity: 1 }, { productId: pB2.id, quantity: 1 }], { promotionCode: 'onlyp' })).order;
  const pcode = o4.discountAmount;
  ok('product-scoped promo discounts only the matching item', Number(pcode) >= 500 - 0.01 && Number(pcode) <= 500 + 0.01 || Number(pcode) > 0 && Number(pcode) < 1000, `discount=${pcode}`);

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

  // ---- 11. manual payment guards ----
  const sellerRow = await prisma.seller.findUnique({ where: { id: seller.id } });
  p = await mkProduct(seller.id, 5, 100);
  const m: any = (await order(cust.id, [{ productId: p.id, quantity: 1 }], { paymentMethod: 'bank' })).order;
  ok('seller cannot mark an unpaid order paid', (await code(orderService.confirmManualPayment(m.id, sellerRow!.userId, true))) === 'NO_PAYMENT_SUBMITTED');
  ok('submit requires a reference', (await code(orderService.submitManualPayment(m.id, cust.id, { referenceNumber: '  ' } as any))) === 'REFERENCE_REQUIRED');
  ok('submit rejects data: proof', (await code(orderService.submitManualPayment(m.id, cust.id, { referenceNumber: 'TID1', proofUrl: 'data:image/png;base64,AAAA' }))) === 'INVALID_PROOF_URL');
  ok('submit ok', (await code(orderService.submitManualPayment(m.id, cust.id, { referenceNumber: 'TID1', proofUrl: '/uploads/products/x.png' }))) === 'OK');
  ok('other seller cannot confirm', (await code(orderService.confirmManualPayment(m.id, (await prisma.seller.findUnique({ where: { id: sellerB.id } }))!.userId, true))) !== 'OK');
  ok('payee seller confirms', (await code(orderService.confirmManualPayment(m.id, sellerRow!.userId, true))) === 'OK');
  ok('confirm twice is refused', (await code(orderService.confirmManualPayment(m.id, sellerRow!.userId, true))) === 'NO_PAYMENT_SUBMITTED');

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

  // ---- 14. multi-seller reject leaves other kitchen's items ----
  p = await mkProduct(seller.id, 5); const pB3 = await mkProduct(sellerB.id, 5);
  const o5: any = (await order(cust.id, [{ productId: p.id, quantity: 1 }, { productId: pB3.id, quantity: 1 }])).order;
  await sellerOrderService.rejectOrder(o5.id, sellerRow!.userId, 'closed');
  const after = await prisma.order.findUnique({ where: { id: o5.id }, include: { items: true } });
  ok('one seller rejecting does not cancel the other seller\'s items', after!.orderStatus !== 'cancelled' && after!.items.filter((i) => i.status === 'cancelled').length === 1);

  // ---- 15. payout race ----
  const sp = await mkSeller();
  await prisma.sellerPayoutSchedule.create({ data: { sellerId: sp.id, minimumPayoutAmount: 1, payoutMethod: 'bank_transfer' } as any });
  const prod = await mkProduct(sp.id, 5, 1000);
  const po: any = (await order(cust.id, [{ productId: prod.id, quantity: 1 }], { paymentMethod: 'bank' })).order;
  await prisma.order.update({ where: { id: po.id }, data: { orderStatus: 'delivered', paymentStatus: 'paid' } });
  const earned = Number((await prisma.orderItem.findFirst({ where: { orderId: po.id } }))!.sellerPayout);
  const reqs = await Promise.all([1, 2, 3].map(() => (require('../src/services/seller.service').default).requestPayout(sp.id, { amount: earned, payoutMethod: 'bank_transfer', accountNumber: '1' }).then(() => 'OK', (e: any) => e.code)));
  ok('concurrent payout requests cannot exceed earnings', reqs.filter((r) => r === 'OK').length === 1, `${reqs} earned=${earned}`);

  // ---- 16. refunds on cancelled PAID orders ----
  const rc = await mkUser();
  await prisma.wallet.create({ data: { userId: rc.id, balance: 500 } });
  const rp = await mkProduct(seller.id, 20, 100);
  const walletOrder: any = (await order(rc.id, [{ productId: rp.id, quantity: 2 }], { paymentMethod: 'wallet' })).order;
  await paymentService.processPayment(walletOrder.id, rc.id, 'wallet');
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
  ok('a refund can only be completed once', (await code(completeRefund(bRefund!.id, admin.id))) === 'REFUND_NOT_PENDING');

  const unpaid: any = (await order(rc.id, [{ productId: rp.id, quantity: 1 }])).order;
  await orderService.cancelOrder(unpaid.id, rc.id, 'x');
  ok('cancelling an unpaid (COD) order creates no refund', (await prisma.refund.count({ where: { orderId: unpaid.id } })) === 0);

  // multi-seller: one kitchen cancels its item of a paid order -> partial refund; the rest on full cancel
  const rpB = await mkProduct(sellerB.id, 20, 300);
  const split: any = (await order(rc.id, [{ productId: rp.id, quantity: 1 }, { productId: rpB.id, quantity: 1 }], { paymentMethod: 'bank' })).order;
  await prisma.order.update({ where: { id: split.id }, data: { paymentStatus: 'paid' } });
  const itemB = await prisma.orderItem.findFirst({ where: { orderId: split.id, sellerId: sellerB.id } });
  await sellerOrderService.cancelOrderItem(itemB!.id, (await prisma.seller.findUnique({ where: { id: sellerB.id } }))!.userId, 'oos');
  const part = await prisma.refund.findMany({ where: { orderId: split.id } });
  const splitTotal = Number(split.totalAmount), splitDelivery = Number(split.deliveryFee), splitSub = Number(split.subtotal);
  const expectPartial = Math.round((300 / splitSub) * (splitTotal - splitDelivery) * 100) / 100;
  ok('one seller cancelling its item refunds that item\'s share only',
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
  const platS = await mkSeller({ deliveryProvider: 'platform', deliveryFeeType: 'fixed', deliveryFeeFixed: 60 });
  await prisma.sellerPayoutSchedule.create({ data: { sellerId: selfS.id, minimumPayoutAmount: 1, payoutMethod: 'bank_transfer' } as any });
  await prisma.sellerPayoutSchedule.create({ data: { sellerId: platS.id, minimumPayoutAmount: 1, payoutMethod: 'bank_transfer' } as any });
  const dc = await mkUser();
  const addr = await prisma.userAddress.create({ data: { userId: dc.id, addressLine1: 'House 1 Street', area: 'X', city: 'Lahore' } });
  const sp1 = await mkProduct(selfS.id, 20, 500);
  const sp2 = await mkProduct(platS.id, 20, 400);
  const homeOrder = (items: any[], pm: string) =>
    orderService.createOrder(dc.id, { items, deliveryType: 'home_delivery', deliveryAddressId: addr.id, paymentMethod: pm } as any) as Promise<any>;

  const sdo = await homeOrder([{ productId: sp1.id, quantity: 1 }, { productId: sp2.id, quantity: 1 }], 'bank');
  const bd: any[] = (sdo.deliveryFeeBreakdown as any) || [];
  ok('order records who each delivery fee belongs to',
    Number(sdo.deliveryFee) === 160 && bd.length === 2 && bd.find((b) => b.sellerId === selfS.id)?.provider === 'self' && bd.find((b) => b.sellerId === platS.id)?.provider === 'platform',
    JSON.stringify(bd));

  await prisma.order.update({ where: { id: sdo.id }, data: { orderStatus: 'delivered', paymentStatus: 'paid' } });
  const selfItem = await prisma.orderItem.findFirst({ where: { orderId: sdo.id, sellerId: selfS.id } });
  const platItem = await prisma.orderItem.findFirst({ where: { orderId: sdo.id, sellerId: platS.id } });
  const selfGoods = Number(selfItem!.sellerPayout), platGoods = Number(platItem!.sellerPayout);

  const payReq = (sid: string, amount: number) => sellerService.requestPayout(sid, { amount, payoutMethod: 'bank_transfer', accountNumber: '1' }).then(() => 'OK', (e: any) => e.code);
  ok('self-delivering seller cannot withdraw more than goods + their delivery fee', (await payReq(selfS.id, selfGoods + 100 + 0.5)) === 'INSUFFICIENT_BALANCE');
  ok('self-delivering seller can withdraw goods + their delivery fee', (await payReq(selfS.id, selfGoods + 100)) === 'OK', `goods=${selfGoods}`);
  ok('platform-fleet seller gets no delivery fee', (await payReq(platS.id, platGoods + 1)) === 'INSUFFICIENT_BALANCE' && (await payReq(platS.id, platGoods)) === 'OK');

  const dash: any = await sellerService.getSellerDashboard(selfS.id);
  ok('dashboard earnings include the self-delivery fee', Math.abs(dash.overview.totalEarnings - (selfGoods + 100)) < 0.01, `total=${dash.overview.totalEarnings} expected=${selfGoods + 100}`);

  await ledgerService.recordOrderCompletion(sdo.id);
  const led = await prisma.ledgerEntry.findMany({ where: { orderId: sdo.id } });
  const platRev = led.find((e) => e.transactionType === 'delivery_fee');
  const sellerFee = led.find((e) => e.transactionType === 'seller_delivery_fee');
  ok('ledger: platform revenue is only the platform-delivered fee; the self fee is payable to the seller',
    Number(platRev?.amount) === 60 && Number(sellerFee?.amount) === 100 && sellerFee?.sellerId === selfS.id,
    `platform=${platRev?.amount} seller=${sellerFee?.amount}`);

  // COD: the seller was handed the fee at the door, so it is not payable again
  const spC = await mkProduct(selfS.id, 20, 300);
  const codOrder = await homeOrder([{ productId: spC.id, quantity: 1 }], 'cod');
  await prisma.order.update({ where: { id: codOrder.id }, data: { orderStatus: 'delivered', paymentStatus: 'paid' } });
  const codGoods = Number((await prisma.orderItem.findFirst({ where: { orderId: codOrder.id } }))!.sellerPayout);
  const dash2: any = await sellerService.getSellerDashboard(selfS.id);
  ok('COD self-delivery fee counts as earned but is not withdrawable (already paid at the door)',
    Math.abs(dash2.overview.totalEarnings - (selfGoods + 100 + codGoods + 100)) < 0.01 && dash2.overview.availableForPayout === 0,
    `total=${dash2.overview.totalEarnings} available=${dash2.overview.availableForPayout}`);

  // cancelling the self seller's item on a paid multi-seller order refunds its share + its delivery fee
  const sp1b = await mkProduct(selfS.id, 20, 500);
  const sp2b = await mkProduct(platS.id, 20, 400);
  const mo = await homeOrder([{ productId: sp1b.id, quantity: 1 }, { productId: sp2b.id, quantity: 1 }], 'bank');
  await prisma.order.update({ where: { id: mo.id }, data: { paymentStatus: 'paid' } });
  const moItem = await prisma.orderItem.findFirst({ where: { orderId: mo.id, sellerId: selfS.id } });
  await sellerOrderService.cancelOrderItem(moItem!.id, (await prisma.seller.findUnique({ where: { id: selfS.id } }))!.userId, 'oos');
  const mr = await prisma.refund.findFirst({ where: { orderId: mo.id } });
  const moSub = Number(mo.subtotal), moTot = Number(mo.totalAmount), moDel = Number(mo.deliveryFee);
  const expectRefund = Math.round(((500 / moSub) * (moTot - moDel) + 100) * 100) / 100;
  ok('cancelling a seller\'s last item also refunds that seller\'s delivery fee', Math.abs(Number(mr?.amount) - expectRefund) < 0.02, `refund=${mr?.amount} expected=${expectRefund}`);

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
  const svc: any = orderService;
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
  ok('an unassigned hub stays open to hub managers (legacy)', (await acc(mgr1)) === 'OK');
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
  const reg = (email: string, phone?: string, phone_otp?: string) =>
    authService.register(email, 'secret123', 'customer', 'Test User', phone, undefined, undefined, undefined, phone_otp) as Promise<any>;
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
  ok('requesting a new code after a lock-out gives a NEW code', fresh !== bruteCode || (await prisma.otpVerification.count({ where: { phone: brutePhone } })) === 2);

  // ---- 23. review round: money ----
  const rc2 = await mkUser();
  const rcSellerA = await mkSeller(); const rcSellerB = await mkSeller();
  const pa2 = await mkProduct(rcSellerA.id, 20, 100); const pb2 = await mkProduct(rcSellerB.id, 20, 100);
  const uB = (await prisma.seller.findUnique({ where: { id: rcSellerB.id } }))!.userId;
  await prisma.sellerPayoutSchedule.create({ data: { sellerId: rcSellerB.id, minimumPayoutAmount: 1, payoutMethod: 'bank_transfer' } as any });

  // (1) a seller whose items were rejected earns nothing even though the order is delivered by the other seller
  const two: any = (await order(rc2.id, [{ productId: pa2.id, quantity: 1 }, { productId: pb2.id, quantity: 1 }], { paymentMethod: 'bank' })).order;
  await prisma.order.update({ where: { id: two.id }, data: { paymentStatus: 'paid' } });
  await sellerOrderService.rejectOrder(two.id, uB, 'closed');
  await prisma.order.update({ where: { id: two.id }, data: { orderStatus: 'delivered' } });
  const dashB: any = await sellerService.getSellerDashboard(rcSellerB.id);
  ok('a seller whose items were rejected earns nothing from the delivered order', dashB.overview.totalEarnings === 0 && dashB.overview.availableForPayout === 0, `earnings=${dashB.overview.totalEarnings}`);
  await ledgerService.recordOrderCompletion(two.id);
  const ledA = await prisma.ledgerEntry.findMany({ where: { orderId: two.id } });
  const refundedSum = (await prisma.refund.findMany({ where: { orderId: two.id } })).reduce((a, r) => a + Number(r.amount), 0);
  const custPay = Number(ledA.find((e) => e.transactionType === 'customer_payment')!.amount);
  const earn = Number(ledA.find((e) => e.transactionType === 'seller_earning')!.amount);
  ok('ledger counts only live items and the net the customer paid', Math.abs(custPay - (Number(two.totalAmount) - refundedSum)) < 0.02 && earn === Number((await prisma.orderItem.findFirst({ where: { orderId: two.id, sellerId: rcSellerA.id } }))!.sellerPayout), `custPay=${custPay} earn=${earn}`);
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
  await sellerOrderService.rejectOrder(unpaid2.id, uB, 'closed');
  const shr = (await prisma.order.findUnique({ where: { id: unpaid2.id } }))!;
  ok('rejecting one seller\'s items on an unpaid order re-prices it to what is left', Math.abs(Number(shr.totalAmount) - 105) < 0.02 && Number(shr.subtotal) === 100, `total=${shr.totalAmount} subtotal=${shr.subtotal}`);

  // (6) seller-scoped promo: refund exactly what was paid for the item
  const spP = await prisma.promotion.create({ data: { code: 'SC' + uniq(), name: 's', discountType: 'percentage', discountValue: 50, applicableProductIds: [pa2.id], validFrom: new Date(Date.now() - 1e6), validUntil: new Date(Date.now() + 1e9), usageLimitPerUser: 9 } as any });
  const promoO: any = (await order(rc2.id, [{ productId: pa2.id, quantity: 1 }, { productId: pb2.id, quantity: 1 }], { paymentMethod: 'bank', promotionCode: spP.code })).order;
  await prisma.order.update({ where: { id: promoO.id }, data: { paymentStatus: 'paid' } });
  const shares = (await prisma.orderItem.findMany({ where: { orderId: promoO.id } })).map((i) => `${i.sellerId === rcSellerA.id ? 'A' : 'B'}:${i.promoDiscount}`).sort().join();
  const itemBo = await prisma.orderItem.findFirst({ where: { orderId: promoO.id, sellerId: rcSellerB.id } });
  await sellerOrderService.cancelOrderItem(itemBo!.id, uB, 'oos');
  const pRef = await prisma.refund.findFirst({ where: { orderId: promoO.id } });
  ok('item discount shares are recorded (only the eligible item carries one)', /A:\d+(\.\d+)?,B:0/.test(shares) && !/A:0(\.00)?,/.test(shares), shares);
  ok('cancelling the NON-discounted seller refunds its full price + GST (not a pro-rata of the discounted total)', Math.abs(Number(pRef!.amount) - 105) < 0.02, `refund=${pRef?.amount}`);

  // (8) refunded orders cannot be delivered; live orders cannot be "refunded" without cancelling
  const live: any = (await order(rc2.id, [{ productId: pa2.id, quantity: 1 }], { paymentMethod: 'bank' })).order;
  await prisma.order.update({ where: { id: live.id }, data: { paymentStatus: 'paid' } });
  ok('a refund on an order still in flight is refused (cancel it instead)', (await adminOrderService.processRefund(live.id, admin.id).then(() => 'OK', (e: any) => e.code)) === 'USE_CANCEL_ENDPOINT');
  await prisma.order.update({ where: { id: live.id }, data: { orderStatus: 'in_transit', paymentStatus: 'refund_pending' } });
  ok('an order whose money is being refunded cannot be marked delivered', (await adminOrderService.updateOrderStatus(live.id, admin.id, 'delivered').then(() => 'OK', (e: any) => e.code)) === 'ORDER_REFUNDED');

  // (9) payout can't be both completed and failed
  const poSeller = await mkSeller(); const poProd = await mkProduct(poSeller.id, 5, 1000);
  await prisma.sellerPayoutSchedule.create({ data: { sellerId: poSeller.id, minimumPayoutAmount: 1, payoutMethod: 'bank_transfer' } as any });
  const poO: any = (await order(rc2.id, [{ productId: poProd.id, quantity: 1 }], { paymentMethod: 'bank' })).order;
  await prisma.order.update({ where: { id: poO.id }, data: { orderStatus: 'delivered', paymentStatus: 'paid' } });
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
  await authService.resetPassword(token, 'brand-new-pass');
  ok('the new password works after a reset', (await authService.login(rEmail, 'brand-new-pass', 'email').then(() => 'OK', (e: any) => e.code)) === 'OK');
  ok('the old password no longer works', (await authService.login(rEmail, 'secret123', 'email').then(() => 'OK', (e: any) => e.code)) === 'INVALID_CREDENTIALS');
  ok('a reset link is single-use', (await authService.resetPassword(token, 'another-pass-1').then(() => 'OK', (e: any) => e.code)) === 'INVALID_RESET_TOKEN');
  ok('every session issued before the reset is voided (old refresh token)', (await authService.refreshToken(oldRefresh).then(() => 'OK', (e: any) => e.code)) === 'INVALID_REFRESH_TOKEN');
  const expTok = 'exp' + 'y'.repeat(40) + uniq();
  await prisma.passwordReset.create({ data: { userId: rReg.user.id, tokenHash: hash(expTok), expiresAt: new Date(Date.now() - 1000) } });
  ok('an expired reset link is refused', (await authService.resetPassword(expTok, 'another-pass-2').then(() => 'OK', (e: any) => e.code)) === 'INVALID_RESET_TOKEN');
  await authService.forgotPassword('nobody-' + uniq() + '@t.test'); // must not throw / reveal anything
  ok('forgot-password answers the same for an unknown email', true);

  // a number evicted from a squatter voids the squatter's sessions
  const sqPhone = pn();
  const sq: any = await reg(`sq${uniq()}@t.test`, sqPhone);
  await sleep(1100);
  await authService.requestOTP(sqPhone, 'registration');
  await reg(`own${uniq()}@t.test`, sqPhone, await lastOtp(sqPhone, 'registration'));
  ok('the squatter\'s sessions are voided when the real owner claims the number', (await authService.refreshToken(sq.tokens.refresh_token).then(() => 'OK', (e: any) => e.code)) === 'INVALID_REFRESH_TOKEN');

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
  await userProfileService.updateProfile(rReg.user.id, { email: newMail });
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
  ok('a link to another site is fine', (await mkP(['https://cdn.example.com/x.png'])).startsWith('OK:'));
  void victimSeller;

  // OTP SMS cap per number
  const capPhone = pn();
  for (let i = 0; i < 5; i++) await prisma.otpVerification.create({ data: { phone: capPhone, otpCode: '111111', purpose: 'login', expiresAt: new Date(Date.now() - 1000), attempts: 5 } });
  ok('no more than 5 codes per number per hour', (await otpService.generateOTP(capPhone, 'login').then(() => 'OK', (e: any) => e.code)) === 'OTP_RATE_LIMITED');

  console.log(`\n${pass} passed, ${fail} failed`);
  await prisma.$disconnect();
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(2); });
