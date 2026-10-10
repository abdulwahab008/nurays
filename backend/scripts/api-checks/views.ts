/**
 * Dish page views are counted without rewriting the dish, the kitchen's own looks do not count,
 * product listings are compressed for clients that accept it, and the rate-limit headers are the
 * standard ones.
 */
import { API, call, makeKitchen, makeProduct, makeUser, ok, prisma, sleep } from './lib';

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
}
