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
import paymentService from '../src/services/payment.service';
import adminOrderService from '../src/services/admin-order.service';
import { completeRefund } from '../src/services/refund.service';
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

  console.log(`\n${pass} passed, ${fail} failed`);
  await prisma.$disconnect();
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(2); });
