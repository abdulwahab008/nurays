/**
 * Weekly payouts and what a kitchen owes, as the outside sees them: a payout's statement (JSON and CSV), who may read
 * it, the list of kitchens that owe Nuray, recording a kitchen's payment (who may, and how much), and the cash pause
 * at checkout. The weekly run itself is checked against the database in scripts/verify-money-flows.ts.
 */
import { call, makeKitchen, makeUser, ok, prisma, unique } from './lib';

export default async function kitchenMoney() {
  const kitchen = await makeKitchen();
  const other = await makeKitchen();
  const admin = await makeUser('admin');
  const support = await makeUser('admin', { staffRole: 'support' });
  const customer = await makeUser('customer');

  // A delivered online order and the payout of its money, as the Monday run makes them.
  const product = await prisma.product.create({
    data: { sellerId: kitchen.sellerId, name: `Statement Dish ${unique()}`, slug: `statement-dish-${unique()}`, price: 1500, unit: 'pc', stockQuantity: 20, stockType: 'direct', approvalStatus: 'approved', isActive: true } as any,
  });
  const placed = await call(customer.access, 'POST', '/orders', { items: [{ productId: product.id, quantity: 1 }], deliveryType: 'self_pickup', paymentMethod: 'cod' }, { headers: { 'Idempotency-Key': `km-${unique()}` } });
  const orderId = placed.body?.data?.id ?? placed.body?.data?.order?.id;
  ok('(a pickup order for the kitchen is placed)', placed.status === 201 && !!orderId, `${placed.status} ${placed.code}`);
  await prisma.order.update({ where: { id: orderId }, data: { orderStatus: 'delivered', deliveredAt: new Date(), paymentMethod: 'wallet', paymentCollectedBy: 'platform', paymentStatus: 'paid', paidAt: new Date() } });
  const share = Number((await prisma.orderItem.findFirst({ where: { orderId } }))!.sellerPayout);
  const today = new Date(new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 10) + 'T00:00:00Z');
  const payout = await prisma.sellerPayout.create({
    data: { sellerId: kitchen.sellerId, amount: share, commissionDeducted: 0, netAmount: share, payoutMethod: 'bank_transfer', accountDetails: { accountNumber: '123456789', automatic: true, runDate: 'check' }, status: 'pending', periodStart: today, periodEnd: today },
  });

  const mine = await kitchen.owner.as('GET', `/sellers/me/payouts/${payout.id}/statement`);
  ok("the kitchen reads its payout's statement: the order, what it adds, and the total", mine.status === 200 && mine.body.data.lines.length === 1 && Math.abs(mine.body.data.lines[0].effect - share) < 0.01 && Math.abs(mine.body.data.totals.period - share) < 0.01 && mine.body.data.payout.automatic === true, `${mine.status} ${JSON.stringify(mine.body.data?.totals)}`);
  const history = await kitchen.owner.as('GET', '/sellers/me/payouts');
  ok('its payout history says the payout is a weekly one and which days it covers', history.body.data?.[0]?.automatic === true && !!history.body.data?.[0]?.periodStart);
  const csv = await kitchen.owner.as('GET', `/sellers/me/payouts/${payout.id}/statement?format=csv`);
  ok('and downloads it as a CSV file', csv.status === 200 && String(csv.headers.get('content-type')).startsWith('text/csv') && String(csv.headers.get('content-disposition')).includes('attachment') && String(csv.body?.text ?? '').includes('Earlier balance and adjustments'), `${csv.status} ${csv.headers.get('content-type')}`);
  const notMine = await other.owner.as('GET', `/sellers/me/payouts/${payout.id}/statement`);
  ok("another kitchen cannot read it (404)", notMine.status === 404 && notMine.code === 'PAYOUT_NOT_FOUND', notMine.code);
  ok('nor can a customer (403)', (await customer.as('GET', `/sellers/me/payouts/${payout.id}/statement`)).status === 403);
  const asAdmin = await admin.as('GET', `/admin/payouts/${payout.id}/statement`);
  ok('an admin reads any statement', asAdmin.status === 200 && asAdmin.body.data.kitchen.id === kitchen.sellerId, asAdmin.code);
  const listed = await admin.as('GET', '/admin/payouts?status=pending');
  ok("the admin's payout list marks it weekly and shows its period", (listed.body.data?.payouts ?? []).some((p: any) => p.id === payout.id && p.automatic === true && !!p.periodEnd));

  // A kitchen that took cash itself and owes Nuray the commission.
  const owes = await makeKitchen({ provider: 'self' });
  const cashDish = await prisma.product.create({
    data: { sellerId: owes.sellerId, name: `Cash Dish ${unique()}`, slug: `cash-dish-${unique()}`, price: 2000, unit: 'pc', stockQuantity: 20, stockType: 'direct', approvalStatus: 'approved', isActive: true } as any,
  });
  const cashOrder = await call(customer.access, 'POST', '/orders', { items: [{ productId: cashDish.id, quantity: 1 }], deliveryType: 'self_pickup', paymentMethod: 'cod' }, { headers: { 'Idempotency-Key': `km-${unique()}` } });
  const cashOrderId = cashOrder.body?.data?.id ?? cashOrder.body?.data?.order?.id;
  await prisma.order.update({ where: { id: cashOrderId }, data: { orderStatus: 'delivered', deliveredAt: new Date(), paymentStatus: 'paid', paidAt: new Date(), paymentCollectedBy: 'seller' } });
  const dash = await owes.owner.as('GET', '/sellers/me/dashboard');
  const owed = dash.body.data?.overview?.owing?.amount;
  ok("the kitchen's dashboard says what it owes Nuray, and when cash would pause", owed > 0 && !!dash.body.data.overview.owing.cashPausesAt && dash.body.data.overview.owing.cashPaused === false, JSON.stringify(dash.body.data?.overview?.owing));
  const owingList = await admin.as('GET', '/admin/kitchens-owing');
  ok('the admin sees it among the kitchens that owe Nuray', owingList.status === 200 && (owingList.body.data?.kitchens ?? []).some((k: any) => k.sellerId === owes.sellerId && Math.abs(k.owed - owed) < 0.01), owingList.code);

  // Two weeks on, cash it would take itself pauses; paying online still works.
  await prisma.seller.update({ where: { id: owes.sellerId }, data: { owesSince: new Date(Date.now() - 15 * 24 * 3600e3) } });
  const refused = await call(customer.access, 'POST', '/orders', { items: [{ productId: cashDish.id, quantity: 1 }], deliveryType: 'self_pickup', paymentMethod: 'cod' }, { headers: { 'Idempotency-Key': `km-${unique()}` } });
  ok('two weeks owing, a cash order is refused with 409 CASH_UNAVAILABLE and says to pay online', refused.status === 409 && refused.code === 'CASH_UNAVAILABLE' && /pay online/i.test(refused.body?.error?.message ?? ''), `${refused.status} ${refused.code}`);

  const path = `/admin/sellers/${owes.sellerId}/payments-to-nuray`;
  ok('support staff cannot record a payment (403)', (await support.as('POST', path, { amount: 10, reference: 'R' })).status === 403);
  ok('a kitchen cannot record one for itself (403)', (await owes.owner.as('POST', path, { amount: 10, reference: 'R' })).status === 403);
  const noRef = await admin.as('POST', path, { amount: 10 });
  ok('a payment needs a reference (400)', noRef.status === 400, noRef.code);
  const tooMuch = await admin.as('POST', path, { amount: owed + 100, reference: 'R-BIG' });
  ok('a payment above what is owed is refused (400 AMOUNT_EXCEEDS_OWED)', tooMuch.status === 400 && tooMuch.code === 'AMOUNT_EXCEEDS_OWED', tooMuch.code);
  const paid = await admin.as('POST', path, { amount: owed, reference: `R-${unique()}` });
  ok('paying it all (201) clears what is owed and opens cash again', paid.status === 201 && paid.body.data.owed === 0 && paid.body.data.cashPaused === false, `${paid.status} ${JSON.stringify(paid.body.data)}`);
  const again = await call(customer.access, 'POST', '/orders', { items: [{ productId: cashDish.id, quantity: 1 }], deliveryType: 'self_pickup', paymentMethod: 'cod' }, { headers: { 'Idempotency-Key': `km-${unique()}` } });
  ok('and the next cash order goes through', again.status === 201, `${again.status} ${again.code}`);
  ok('the kitchen is no longer on the owing list', !((await admin.as('GET', '/admin/kitchens-owing')).body.data?.kitchens ?? []).some((k: any) => k.sellerId === owes.sellerId));
}
