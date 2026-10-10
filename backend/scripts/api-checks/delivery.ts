/**
 * Delivery fixes as the outside sees them: map pins must be inside Pakistan, a rider sees the
 * customer's door only while the job runs, a job handed back or retried goes back to the pool
 * clean, the admin order list can be cut down to one kitchen, the kitchen dashboard adds up, a
 * rider's live position reaches the customer and not the kitchen, rider jobs carry a Google
 * Maps directions link built from the pin, and the rider's job list trims its history.
 */
import { randomUUID } from 'crypto';
import { io, Socket } from 'socket.io-client';
import { acceptOrder, Actor, claimJob, deliver, makeAddress, makeKitchen, makeProduct, makeRider, makeUser, markReady, ok, ORIGIN, orderIdOf, PlacedOrder, placeHomeOrder, placeOrder, prisma, Reply, sleep, unique } from './lib';

type Pin = { latitude: number; longitude: number };
const KARACHI: Pin = { latitude: 24.8607, longitude: 67.0011 };
const DUBAI: Pin = { latitude: 25.2048, longitude: 55.2708 };
const TRACKING = 'order:delivery:tracking';
/** What a job holds of the rider who had it: none of this may survive when the job goes back to the pool. */
const TRIP = ['riderId', 'riderFee', 'riderBonus', 'assignmentMode', 'arrivedAtPickup', 'arrivedAtCustomer', 'pickupTime', 'riderLatitude', 'riderLongitude', 'riderLocationAt'] as const;

const step = (rider: Actor, jobId: string, status: string, extra: Record<string, unknown> = {}) => rider.as('PATCH', `/riders/deliveries/${jobId}/status`, { status, ...extra });
const position = (rider: Actor, jobId: string, at: Pin) => rider.as('POST', `/riders/deliveries/${jobId}/location`, at);
const outsidePakistan = (r: Reply) => r.status === 400 && r.code === 'VALIDATION_ERROR' && String(JSON.stringify(r.body?.error?.details)).includes('inside Pakistan');
const job = (id: string) => prisma.delivery.findUniqueOrThrow({ where: { id } });
const orderStatus = async (id: string) => (await prisma.order.findUniqueOrThrow({ where: { id }, select: { orderStatus: true } })).orderStatus;
const tripOf = (row: Record<string, unknown>) => TRIP.filter((k) => row[k] !== null);
const leftOver = (row: Record<string, unknown>) => `${row.status}, left over: ${tripOf(row).join() || 'nothing'}`;
const said = (r: Reply) => (r.code === r.status ? String(r.status) : `${r.status} ${r.code}`);
const until = async (done: () => boolean, ms = 4000) => {
  for (let waited = 0; !done() && waited < ms; waited += 100) await sleep(100);
};

/** The rider moves the job along; any refusal ends the run, since the checks after it would mean nothing. */
async function drive(rider: Actor, jobId: string, statuses: string[]) {
  for (const next of statuses) {
    const r = await step(rider, jobId, next);
    if (r.status !== 200) throw new Error(`the rider could not move the job to ${next}: ${said(r)}`);
  }
}

/** The kitchen accepts the order and the rider takes its job from the open pool. Returns the job id. */
async function takeJob(placed: Pick<PlacedOrder, 'kitchen' | 'orderId'>, rider: Actor): Promise<string> {
  const jobId = await acceptOrder(placed);
  if (!jobId) throw new Error('accepting the order made no rider job');
  const claimed = await claimJob(rider, jobId);
  if (claimed.status !== 200) throw new Error(`the rider could not take the job: ${said(claimed)} (the API must run with auto-assign off)`);
  return jobId;
}

async function orderFrom(customer: Actor, productIds: string[], addressId: string): Promise<string> {
  const r = await placeOrder(customer, productIds.map((productId) => ({ productId })), { addressId });
  if (r.status !== 201) throw new Error(`could not place an order: ${said(r)}`);
  return orderIdOf(r);
}

/** A signed-in socket that has joined the order's room, and the names of the events it hears from then on. */
async function listen(token: string, orderId: string, opened: Socket[]): Promise<string[]> {
  const heard: string[] = [];
  const socket = io(ORIGIN, { auth: { token }, transports: ['websocket'], timeout: 5000, reconnection: false });
  opened.push(socket);
  socket.onAny((event: string) => heard.push(event));
  await new Promise<void>((resolve, reject) => {
    socket.on('connect', () => resolve());
    socket.on('connect_error', reject);
  });
  socket.emit('join:order', orderId);
  await sleep(600); // the server checks the person is a party to the order before it lets them in
  return heard;
}

export default async function delivery() {
  const admin = await makeUser('admin');

  // 1. map pins outside Pakistan are refused (addresses on create and update, a kitchen), Karachi is accepted
  const customer = await makeUser('customer');
  const abroad = await customer.as('POST', '/users/me/addresses', { addressLine1: 'Burj Khalifa, Downtown', area: 'DHA Karachi (Phase 5 & 6)', city: 'Karachi', ...DUBAI });
  ok('an address pin in Dubai is refused', outsidePakistan(abroad), said(abroad));
  const khi = await customer.as('POST', '/users/me/addresses', { addressLine1: 'House 5, Street 9, Phase 6', area: 'DHA Phase 6', city: 'Karachi', latitude: 24.8015, longitude: 67.0655 });
  ok('a pin in Karachi is accepted', khi.status === 201, said(khi));
  const khiId: string = khi.body.data?.id ?? '';
  const moved = await customer.as('PATCH', `/users/me/addresses/${khiId}`, { latitude: 51.5, longitude: -0.12 });
  ok('moving the pin to London is refused too', outsidePakistan(moved), said(moved));
  const saved = await prisma.userAddress.findUnique({ where: { id: khiId } });
  ok('and the saved pin stays in Karachi', Number(saved?.latitude) === 24.8015 && Number(saved?.longitude) === 67.0655, `${saved?.latitude},${saved?.longitude}`);
  const pinned = await makeKitchen();
  const pinOf = () => prisma.seller.findUniqueOrThrow({ where: { id: pinned.sellerId }, select: { latitude: true, longitude: true } });
  const kitchenAbroad = await pinned.owner.as('PATCH', '/sellers/me', DUBAI);
  const unpinned = await pinOf();
  ok('a kitchen pin outside Pakistan is refused and nothing is saved', outsidePakistan(kitchenAbroad) && unpinned.latitude === null && unpinned.longitude === null, said(kitchenAbroad));
  const kitchenHome = await pinned.owner.as('PATCH', '/sellers/me', KARACHI);
  const kitchenPin = await pinOf();
  ok('a kitchen pin in Karachi is accepted and saved', kitchenHome.status === 200 && Number(kitchenPin.latitude) === KARACHI.latitude && Number(kitchenPin.longitude) === KARACHI.longitude, said(kitchenHome));

  // 2. the rider sees the door only while the job runs
  const street = `House ${unique()}, Gali 5`;
  const landmark = `Opposite ${unique()} mosque`;
  const door = await placeHomeOrder({ address: { addressLine1: street, landmark } });
  const doorRider = await makeRider();
  const doorJob = await takeJob(door, doorRider);
  const running = (await doorRider.as('GET', `/orders/${door.orderId}`)).body.data;
  ok(
    'a running job shows its rider the full address, pin and instructions',
    running?.deliveryAddress?.addressLine1 === street && running.deliveryAddress.latitude != null && running.deliveryAddressSnapshot?.addressLine1 === street && running.deliveryInstructions === 'Ring twice'
  );
  await deliver(door, doorRider, doorJob);
  const finished = await doorRider.as('GET', `/orders/${door.orderId}`);
  const f = finished.body.data ?? {};
  ok('a delivered order still opens for its rider', finished.status === 200, said(finished));
  ok('but its address is area and city only', Object.keys(f.deliveryAddress ?? {}).sort().join() === 'area,city', Object.keys(f.deliveryAddress ?? {}).join());
  ok(
    'and its snapshot, instructions and delivery row carry no door either',
    Object.keys(f.deliveryAddressSnapshot ?? {}).every((k) => ['area', 'city'].includes(k)) && f.deliveryInstructions == null && f.delivery?.deliveryLatitude == null && f.delivery?.deliveryLongitude == null
  );
  ok('the street, landmark, instructions and pin appear nowhere in the answer', ![street, landmark, 'Ring twice', '24.8015', '67.0655'].some((secret) => JSON.stringify(finished.body).includes(secret)));
  const owned = await door.customer.as('GET', `/orders/${door.orderId}`);
  ok('while the customer still sees the full address of their delivered order', owned.body.data?.deliveryAddress?.addressLine1 === street, said(owned));

  // 3. a rider cannot fail a delivery before the food is ready, but can hand the job back; the reopened job is clean
  const cooking = await placeHomeOrder();
  const cookingRider = await makeRider();
  const cookingJob = await takeJob(cooking, cookingRider);
  await position(cookingRider, cookingJob, KARACHI);
  const arrived = await step(cookingRider, cookingJob, 'arrived_at_pickup');
  ok('the rider can arrive at a kitchen that is still cooking', arrived.status === 200, said(arrived));
  const held = tripOf(await job(cookingJob));
  ok("before the hand-back the job holds the rider's pay, arrival time and position", held.length >= 8, held.join());
  const early = await step(cookingRider, cookingJob, 'delivery_failed', { reason: 'Kitchen is taking too long' });
  ok('failing a delivery before the food is ready is refused (FOOD_NOT_READY)', early.status === 409 && early.code === 'FOOD_NOT_READY', said(early));
  ok("and the order is still preparing, the job still the rider's", (await orderStatus(cooking.orderId)) === 'preparing' && (await job(cookingJob)).status === 'arrived_at_pickup');
  const handBack = await cookingRider.as('POST', `/riders/deliveries/${cookingJob}/release`, {});
  ok('the rider can hand the job back instead', handBack.status === 200, said(handBack));
  const reopened = await job(cookingJob);
  ok('the reopened job is pending and carries nothing of the previous rider', reopened.status === 'pending' && tripOf(reopened).length === 0, leftOver(reopened));
  ok('and remembers who handed it back', reopened.releasedRiderIds.includes(cookingRider.riderId), reopened.releasedRiderIds.join());
  await admin.as('POST', `/admin/orders/${cooking.orderId}/cancel`, { reason: 'Check clean-up, so the open pool stays short' });

  // 4. an admin retry of a failed delivery reopens the job the same way
  const failedOrder = await placeHomeOrder();
  const first = await makeRider();
  const failedJob = await takeJob(failedOrder, first);
  await markReady(failedOrder);
  await drive(first, failedJob, ['arrived_at_pickup', 'picked_up', 'in_transit']);
  await position(first, failedJob, KARACHI);
  await drive(first, failedJob, ['arrived_at_customer']);
  const failed = await step(first, failedJob, 'delivery_failed', { reason: 'Customer unreachable' });
  ok('once the food is ready a rider can report a failed delivery', failed.status === 200 && (await orderStatus(failedOrder.orderId)) === 'delivery_failed', said(failed));
  const trip = tripOf(await job(failedJob));
  ok('before the retry the failed job still holds the whole trip of its rider', trip.length === TRIP.length, trip.join());
  const retry = await admin.as('POST', `/admin/orders/${failedOrder.orderId}/retry-delivery`, {});
  ok('an admin can retry a failed delivery', retry.status === 200 && (await orderStatus(failedOrder.orderId)) === 'ready', said(retry));
  const retried = await job(failedJob);
  ok('the retried job is pending and as clean as a new one', retried.status === 'pending' && tripOf(retried).length === 0 && retried.deliveryNotes === null, leftOver(retried));
  ok('and is not offered back to the rider it failed with', retried.releasedRiderIds.includes(first.riderId), retried.releasedRiderIds.join());
  // The pool shows the oldest 100 open jobs: date this one first so it stays in the list however many other runs left open.
  await prisma.delivery.update({ where: { id: failedJob }, data: { createdAt: new Date('2000-01-01') } });
  const second = await makeRider();
  const pool = await second.as('GET', '/riders/deliveries/available');
  const listed = (pool.body.data ?? []).find((d: { orderId: string }) => d.orderId === failedOrder.orderId);
  ok(
    'the retried job shows in the open pool with no stale arrival',
    !!listed && listed.status === 'pending' && listed.arrivedAtPickup == null && listed.arrivedAtCustomer == null && listed.riderFee == null,
    listed ? JSON.stringify({ arrivedAtPickup: listed.arrivedAtPickup, riderFee: listed.riderFee }) : `missing among ${pool.body.data?.length} jobs`
  );
  const taken = await claimJob(second, failedJob);
  ok('another rider can take it and is paid afresh', taken.status === 200 && taken.body.data?.riderFee === listed?.standardFee, `${said(taken)} ${taken.body.data?.riderFee} vs ${listed?.standardFee}`);

  // 5. the admin order list filtered by kitchen (by the kitchen's own id, or by its owner's user id as before)
  const kitchenA = await makeKitchen();
  const kitchenB = await makeKitchen();
  const [dishA1, dishA2, dishB] = [await makeProduct(kitchenA.sellerId), await makeProduct(kitchenA.sellerId), await makeProduct(kitchenB.sellerId)];
  const shopper = await makeUser('customer');
  const shopperAddress = await makeAddress(shopper);
  await orderFrom(shopper, [dishA1, dishA2], shopperAddress); // two dishes in one order count once
  await orderFrom(shopper, [dishA1], shopperAddress);
  await orderFrom(shopper, [dishB], shopperAddress);
  const ordersOfA = (await prisma.orderItem.findMany({ where: { seller: { userId: kitchenA.owner.id } }, select: { orderId: true }, distinct: ['orderId'] })).map((i) => i.orderId);
  const byKitchen = await admin.as('GET', `/admin/orders?sellerId=${kitchenA.owner.id}&limit=100`);
  const total = byKitchen.body.data?.pagination?.total;
  const listedIds: string[] = (byKitchen.body.data?.orders ?? []).map((o: { id: string }) => o.id);
  ok("admin orders filtered by a kitchen count that kitchen's orders", byKitchen.status === 200 && ordersOfA.length === 2 && total === ordersOfA.length, `${total} vs ${ordersOfA.length}`);
  ok("and list exactly those orders, none of the other kitchen's", listedIds.length === ordersOfA.length && ordersOfA.every((id) => listedIds.includes(id)));
  const byOwnId = await admin.as('GET', `/admin/orders?sellerId=${kitchenA.sellerId}&limit=100`);
  const idsByOwnId: string[] = (byOwnId.body.data?.orders ?? []).map((o: { id: string }) => o.id);
  ok("the kitchen's own id (the one the rows carry) filters the same orders", byOwnId.status === 200 && idsByOwnId.length === ordersOfA.length && ordersOfA.every((id) => idsByOwnId.includes(id)), `${byOwnId.status} ${idsByOwnId.length} vs ${ordersOfA.length}`);
  const unknown = await admin.as('GET', `/admin/orders?sellerId=${randomUUID()}&limit=5`);
  ok('an unknown kitchen filters to nothing', unknown.status === 200 && unknown.body.data?.pagination?.total === 0 && unknown.body.data.orders.length === 0, `${unknown.status} ${unknown.body.data?.pagination?.total}`);

  // 6. promotions answer for a customer, and the kitchen dashboard adds up
  // (a self-delivering kitchen: its orders make no rider jobs, so the open pool stays free of them)
  const kitchenD = await makeKitchen({ provider: 'self' });
  const dishD = await makeProduct(kitchenD.sellerId, { price: 300 });
  const dishD2 = await makeProduct(kitchenD.sellerId, { price: 200 });
  const diner = await makeUser('customer');
  const dinerAddress = await makeAddress(diner);
  const mine = async () => ({ kitchen: kitchenD, orderId: await orderFrom(diner, [dishD], dinerAddress) });
  await orderFrom(diner, [dishD, dishD2], dinerAddress); // stays pending: two dishes, but one order
  await acceptOrder(await mine()); // preparing
  const readyOne = await mine();
  await acceptOrder(readyOne);
  await markReady(readyOne);
  const served = await mine();
  await acceptOrder(served);
  await markReady(served);
  const handoverCode = (await diner.as('GET', `/orders/${served.orderId}`)).body.data?.handoverCode;
  const handedOver = await kitchenD.owner.as('POST', `/seller/orders/${served.orderId}/deliver`, { handoverCode });
  const abandoned = await mine();
  const called = await diner.as('POST', `/orders/${abandoned.orderId}/cancel`, { reason: 'Changed my mind' });
  if (handedOver.status !== 200 || called.status !== 200) throw new Error(`could not finish the dashboard orders: ${said(handedOver)}, ${said(called)}`);
  // Orders are counted once each, whatever the number of dishes in them (one of these has two), and a cancelled order
  // is no sale. Worked out here from the database, line by line.
  const lines = await prisma.orderItem.findMany({ where: { sellerId: kitchenD.sellerId }, include: { order: { select: { orderStatus: true, paymentStatus: true, createdAt: true } } } });
  const inProgress = lines.filter((l) => l.status !== 'cancelled' && !['delivered', 'completed', 'cancelled', 'refunded', 'refund_pending'].includes(l.order.orderStatus));
  const earned = lines.filter((l) => l.status !== 'cancelled' && ['delivered', 'completed'].includes(l.order.orderStatus) && l.order.paymentStatus === 'paid');
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);
  const today = lines.filter((l) => l.order.createdAt >= midnight);
  const distinct = (rows: typeof lines) => new Set(rows.map((l) => l.orderId)).size;
  const expected: Record<string, number> = {
    activeOrders: distinct(inProgress),
    pendingOrders: distinct(inProgress.filter((l) => ['pending', 'preparing'].includes(l.order.orderStatus))),
    grossSales: earned.reduce((sum, l) => sum + Number(l.totalPrice), 0),
    todayOrders: distinct(today),
    todaySales: today.filter((l) => l.status !== 'cancelled' && !['cancelled', 'refunded'].includes(l.order.orderStatus)).reduce((sum, l) => sum + Number(l.totalPrice), 0),
  };
  const dashboard = await kitchenD.owner.as('GET', '/sellers/me/dashboard');
  const overview = dashboard.body.data?.overview ?? {};
  ok('the kitchen dashboard answers', dashboard.status === 200, said(dashboard));
  ok('the kitchen has orders in different states, so none of the numbers below is zero', Object.values(expected).every((n) => n > 0), JSON.stringify(expected));
  for (const [key, want] of Object.entries(expected)) ok(`the kitchen dashboard's ${key} equals the database`, Math.abs(Number(overview[key]) - want) < 0.01, `${overview[key]} vs ${want}`);
  ok('a two-dish order is one active order, not two', inProgress.length > distinct(inProgress) && overview.activeOrders === distinct(inProgress), `${overview.activeOrders} orders for ${inProgress.length} dishes`);
  ok("and the cancelled order's dish is not in today's sales", today.some((l) => l.order.orderStatus === 'cancelled') && Number(overview.todaySales) < today.reduce((sum, l) => sum + Number(l.totalPrice), 0), `${overview.todaySales}`);
  const promoCode = `CHK${unique()}`.toUpperCase();
  const promo = await kitchenD.owner.as('POST', '/promotions', {
    name: `Check ${promoCode}`,
    code: promoCode,
    discountType: 'fixed',
    discountValue: 25,
    validFrom: new Date(Date.now() - 3.6e6).toISOString(),
    validUntil: new Date(Date.now() + 8.64e7).toISOString(),
  });
  const browser = await makeUser('customer');
  const offered = async () => ((await browser.as('GET', '/promotions/available')).body.data ?? []).map((p: { code: string }) => p.code);
  const nothingYet = await browser.as('GET', '/promotions/available');
  ok('available promotions answer for a customer', nothingYet.status === 200 && Array.isArray(nothingYet.body.data), said(nothingYet));
  ok("a kitchen's promo code is not offered to a customer with none of its dishes in the cart", promo.status === 201 && !(await offered()).includes(promoCode), said(promo));
  await browser.as('POST', '/cart/items', { productId: dishD, quantity: 1 });
  ok('and is offered once one is', (await offered()).includes(promoCode));

  // 7. the rider's live position reaches the customer, not the kitchen in the same order room
  const live = await placeHomeOrder();
  const liveRider = await makeRider();
  const liveJob = await takeJob(live, liveRider);
  await markReady(live);
  await drive(liveRider, liveJob, ['arrived_at_pickup', 'picked_up', 'in_transit']);
  const opened: Socket[] = [];
  try {
    const [customerHeard, kitchenHeard] = await Promise.all([listen(live.customer.access, live.orderId, opened), listen(live.kitchen.owner.access, live.orderId, opened)]);
    const count = (heard: string[], event: string) => heard.filter((e) => e === event).length;
    const outside = await position(liveRider, liveJob, DUBAI);
    ok("a rider's position outside Pakistan is refused", outsidePakistan(outside), said(outside));
    const reported = await position(liveRider, liveJob, KARACHI);
    ok('the rider can report a position', reported.status === 200, said(reported));
    await until(() => count(customerHeard, TRACKING) > 0);
    await sleep(500); // a kitchen that was going to hear it has heard it by now
    ok('the customer receives the live position', count(customerHeard, TRACKING) >= 1, String(count(customerHeard, TRACKING)));
    ok('the kitchen in the same order room does not', count(kitchenHeard, TRACKING) === 0, String(count(kitchenHeard, TRACKING)));
    // The kitchen's own socket must be live for "it heard nothing" to mean anything: it does hear the order being delivered.
    const liveCode = (await prisma.order.findUniqueOrThrow({ where: { id: live.orderId }, select: { handoverCode: true } })).handoverCode;
    await drive(liveRider, liveJob, ['arrived_at_customer']);
    const handed = await step(liveRider, liveJob, 'delivered', { otp: liveCode ?? undefined });
    await until(() => count(kitchenHeard, 'order:status:update') > 0);
    ok("the kitchen's own socket is live: it hears the order's status change", handed.status === 200 && count(kitchenHeard, 'order:status:update') >= 1, `${handed.status} heard: ${kitchenHeard.join() || 'nothing'}`);
  } catch (err) {
    ok('the live position check ran to the end', false, err instanceof Error ? err.message : String(err));
  } finally {
    opened.forEach((socket) => socket.close());
  }

  // 8. rider jobs carry a Google Maps directions link built from the pin (the kitchen from section 1 has a pin)
  const buyer = await makeUser('customer');
  const mapped = { kitchen: pinned, orderId: await orderFrom(buyer, [await makeProduct(pinned.sellerId)], await makeAddress(buyer)) };
  const mapRider = await makeRider();
  const mapJob = await takeJob(mapped, mapRider);
  const link = ((await mapRider.as('GET', '/riders/deliveries/mine')).body.data ?? []).find((d: { id: string }) => d.id === mapJob);
  const DIRECTIONS = /^https:\/\/www\.google\.com\/maps\/dir\/\?api=1&destination=-?\d+(\.\d+)?,-?\d+(\.\d+)?$/;
  ok('rider jobs carry a Google Maps directions URL built from the pin', DIRECTIONS.test(link?.dropoffMapsUrl ?? '') && link.dropoffMapsUrl.endsWith('=24.8015,67.0655'), link?.dropoffMapsUrl);
  ok("and the pickup one is built from the kitchen's pin", DIRECTIONS.test(link?.pickupMapsUrl ?? '') && link.pickupMapsUrl.endsWith(`=${KARACHI.latitude},${KARACHI.longitude}`), link?.pickupMapsUrl);
  ok('and neither has an undocumented travelmode parameter', !!link && !/travelmode/.test(`${link.dropoffMapsUrl}${link.pickupMapsUrl}`));

  // 9. the rider's job list carries every running job, and finished ones only as far as asked
  const jobsOf = async (rider: Actor, query = '') => ((await rider.as('GET', `/riders/deliveries/mine${query}`)).body.data ?? []) as Array<{ id: string; status: string }>;
  ok("a rider's job list holds the job they delivered", (await jobsOf(liveRider)).some((j) => j.id === liveJob && j.status === 'delivered'));
  ok('?history=0 leaves finished jobs out', !(await jobsOf(liveRider, '?history=0')).some((j) => j.id === liveJob));
  ok('but a running job is in the list whatever the history', (await jobsOf(mapRider, '?history=0')).some((j) => j.id === mapJob && j.status === 'assigned'));
  for (const odd of ['abc', '-1', '1.5', '', '1e3', '99999999999999999999', '%00', '1&history=2']) {
    const r = await liveRider.as('GET', `/riders/deliveries/mine?history=${odd}`);
    ok(`?history=${odd} is not a server error`, r.status === 200 && Array.isArray(r.body.data), said(r));
  }
}
