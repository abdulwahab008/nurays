/**
 * Dish page views are counted without rewriting the dish, the kitchen's own looks do not count,
 * product listings are compressed for clients that accept it, the rate-limit headers are the
 * standard ones, and the tray and the delivery estimate say only what they know.
 */
import { API, call, makeAddress, makeKitchen, makeProduct, makeUser, ok, orderIdOf, placeOrder, prisma, sleep, unique } from './lib';

export default async function views() {
  const kitchen = await makeKitchen();
  const dish = await makeProduct(kitchen.sellerId);
  const customer = await makeUser('customer');
  const row = () => prisma.product.findUniqueOrThrow({ where: { id: dish }, select: { viewsCount: true, updatedAt: true } });
  /** The dish once its counter has reached `atLeast` and stopped moving (a view is counted after the answer is sent). */
  const settled = async (atLeast: number) => {
    for (let i = 0; i < 50 && (await row()).viewsCount < atLeast; i++) await sleep(100);
    await sleep(400);
    return row();
  };

  // 1. views: a visitor and a customer each add one, without touching when the dish was last edited
  const before = await row();
  const visitor = await call(null, 'GET', `/products/${dish}`);
  const signedIn = await customer.as('GET', `/products/${dish}`);
  const two = await settled(before.viewsCount + 2);
  ok('the dish page answers for a visitor and a customer', visitor.status === 200 && signedIn.status === 200, `${visitor.status} ${signedIn.status}`);
  ok('two views count two', two.viewsCount === before.viewsCount + 2, `${before.viewsCount} -> ${two.viewsCount}`);
  ok('without touching when the kitchen last edited the dish', two.updatedAt.getTime() === before.updatedAt.getTime(), `${before.updatedAt.toISOString()} vs ${two.updatedAt.toISOString()}`);

  // 2. the kitchen looking at its own dish is not a view (the visitor after it is, so counting is alive)
  const own = await kitchen.owner.as('GET', `/products/${dish}`);
  await call(null, 'GET', `/products/${dish}`);
  const three = await settled(before.viewsCount + 3);
  ok('the kitchen looking at its own dish is not a view, a later visitor is', own.status === 200 && three.viewsCount === before.viewsCount + 3, `${two.viewsCount} -> ${three.viewsCount}`);

  // 3. listings are compressed when the client accepts it, and left alone when it does not
  const gzip = await fetch(`${API}/products?limit=20`, { headers: { 'Accept-Encoding': 'gzip' } });
  ok('a product listing is gzip-compressed when the client accepts it', gzip.status === 200 && gzip.headers.get('content-encoding') === 'gzip', String(gzip.headers.get('content-encoding')));
  const identity = await fetch(`${API}/products?limit=20`, { headers: { 'Accept-Encoding': 'identity' } });
  ok('and sent as it is when the client does not', identity.status === 200 && identity.headers.get('content-encoding') === null, String(identity.headers.get('content-encoding')));

  // 4. rate-limit headers are the standard ones (RateLimit-Limit, -Remaining, -Reset), not the old X-RateLimit ones
  const limited = await call(null, 'GET', '/categories');
  const header = (name: string) => limited.headers.get(name) ?? '';
  const numeric = ['ratelimit-limit', 'ratelimit-remaining', 'ratelimit-reset'].every((name) => /^\d+$/.test(header(name)));
  const seen = `limit ${header('ratelimit-limit')}, remaining ${header('ratelimit-remaining')}, reset ${header('ratelimit-reset')}`;
  ok('rate-limit headers are the standard ones', limited.status === 200 && numeric && !limited.headers.has('x-ratelimit-limit'), seen);

  // 5. the tray holds what it holds, and the delivery estimate says what it knows: the fee, the amount that waives it and
  //    the amount it counted, which is the amount an order for the same dishes is charged on (so the fee shown is the fee paid)
  const selfKitchen = await makeKitchen({ provider: 'self' });
  await prisma.seller.update({ where: { id: selfKitchen.sellerId }, data: { deliveryFeeType: 'fixed', deliveryFeeFixed: 90, freeDeliveryThreshold: 1200 } as never });
  const [dish300, dish1000] = [await makeProduct(selfKitchen.sellerId, { price: 300 }), await makeProduct(selfKitchen.sellerId, { price: 1000 })];

  /** A customer with these dishes in the tray: what the tray and the delivery estimate say, and the delivery fee of an order for the same dishes. */
  async function trayEstimateAndOrder(lines: Array<{ productId: string; quantity: number }>) {
    const shopper = await makeUser('customer');
    const addressId = await makeAddress(shopper);
    for (const line of lines) await shopper.as('POST', '/cart/items', line);
    const tray = (await shopper.as('GET', '/cart')).body.data;
    const estimate = (await shopper.as('GET', `/cart/delivery-estimate?addressId=${addressId}`)).body.data;
    const order = await placeOrder(shopper, lines, { addressId });
    const stored = order.status === 201 ? await prisma.order.findUnique({ where: { id: orderIdOf(order) }, select: { deliveryFee: true } }) : null;
    return { tray, estimate, charged: stored ? Number(stored.deliveryFee) : null, placed: `${order.status} ${order.code ?? ''}` };
  }

  const short = await trayEstimateAndOrder([{ productId: dish300, quantity: 2 }]);
  ok('the tray adds up what it holds and nothing it does not know yet', short.tray?.summary?.subtotal === 600 && short.tray.summary.totalItems === 2, JSON.stringify(short.tray?.summary));
  ok('the tray has no delivery fee, discount or total of its own to show (they were always placeholders)', !['deliveryFee', 'discount', 'total'].some((k) => k in (short.tray?.summary ?? {})), JSON.stringify(Object.keys(short.tray?.summary ?? {})));
  ok("below the kitchen's amount the estimate charges its fee, names the amount that waives it and the amount it counted", short.estimate?.deliveryFee === 90 && short.estimate.isFree === false && short.estimate.freeDeliveryThreshold === 1200 && short.estimate.deliverySubtotal === 600, JSON.stringify(short.estimate));
  ok('an order for the same dishes is charged that fee', short.charged === 90 && short.charged === short.estimate?.deliveryFee, `${short.charged} vs ${short.estimate?.deliveryFee} (${short.placed})`);

  const enough = await trayEstimateAndOrder([{ productId: dish300, quantity: 2 }, { productId: dish1000, quantity: 1 }]);
  ok('at that amount the fee is waived and the estimate still names the amount that did it', enough.estimate?.deliveryFee === 0 && enough.estimate.isFree === true && enough.estimate.freeDeliveryThreshold === 1200 && enough.estimate.deliverySubtotal === 1600 && /1200/.test(enough.estimate.reason ?? ''), JSON.stringify(enough.estimate));
  ok('an order for the same dishes is charged no delivery', enough.charged === 0 && enough.charged === enough.estimate?.deliveryFee, `${enough.charged} vs ${enough.estimate?.deliveryFee} (${enough.placed})`);

  // a deal from the kitchen lowers what is charged for the dishes, and with it the amount the free-delivery rule sees
  await prisma.promotion.create({
    data: {
      sellerId: selfKitchen.sellerId, code: `HALF${unique()}`.toUpperCase(), name: 'Half price', discountType: 'percentage', discountValue: 50, applicableTo: 'all',
      usageLimitPerUser: 100, validFrom: new Date(Date.now() - 3_600_000), validUntil: new Date(Date.now() + 86_400_000), isActive: true,
    } as never,
  });
  const dealt = await trayEstimateAndOrder([{ productId: dish300, quantity: 2 }, { productId: dish1000, quantity: 1 }]);
  ok("the estimate counts the dishes after the kitchen's deals, as checkout does", dealt.tray?.summary?.subtotal === 1600 && dealt.estimate?.deliverySubtotal === 800 && dealt.estimate.deliveryFee === 90 && dealt.estimate.freeDeliveryThreshold === 1200 && dealt.estimate.isFree === false, JSON.stringify(dealt.estimate));
  ok('an order for the same dishes is charged the fee the estimate showed', dealt.charged === 90 && dealt.charged === dealt.estimate?.deliveryFee, `${dealt.charged} vs ${dealt.estimate?.deliveryFee} (${dealt.placed})`);

  const nurayKitchen = await makeKitchen();
  const nurayDish = await makeProduct(nurayKitchen.sellerId, { price: 300 });
  const byRider = await trayEstimateAndOrder([{ productId: nurayDish, quantity: 1 }]);
  ok("a Nuray rider's delivery has no threshold to show: the kitchen pays it, the customer's fee is nothing", byRider.estimate?.deliveryFee === 0 && byRider.estimate.freeDeliveryThreshold === null && byRider.estimate.kitchenPaysDelivery === true, JSON.stringify(byRider.estimate));
  ok("and an order for it charges the customer no delivery", byRider.charged === 0 && byRider.charged === byRider.estimate?.deliveryFee, `${byRider.charged} vs ${byRider.estimate?.deliveryFee} (${byRider.placed})`);
}
