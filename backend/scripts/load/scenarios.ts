/**
 * The HTTP scenarios of the launch load test: browsing, checkout, the rider's day, a login storm.
 * Each one drives the API the way the web app does and counts every call by endpoint name (engine.ts).
 */
import crypto from 'crypto';
import { Fixture, TokenFile } from './common';
import { http, pickOne, Recorder, runAtRate, runVus, Shape, sleep, think } from './engine';

export interface Context {
  rec: Recorder;
  fixture: Fixture;
  tokens: TokenFile | null;
  shape: Shape;
  /** Virtual users (browse, rider loop). */
  vus: number;
  /** Orders a minute (checkout). */
  perMinute: number;
  /** Sign-ins a second (login storm). */
  perSecond: number;
  /** Riders take open jobs and carry them to the door (rider loop). */
  claim: boolean;
  /** Open connections (sockets scenario), and jobs posted to the pool a minute while they listen. */
  sockets: number;
  jobsPerMinute: number;
}

/** What a scenario adds to the report besides the per-endpoint table. */
export interface Extra {
  notes: string[];
  failures: string[];
}

const SEARCH_WORDS = ['dish 1', 'dish 2', 'load', 'biryani', 'kebab', 'karahi'];

function need<T>(list: T[] | undefined, what: string): T[] {
  if (!list || list.length === 0) throw new Error(`This scenario needs ${what}. Run \`npm run load:tokens\` first.`);
  return list;
}

/** Customers browsing: the listing, a dish, kitchens, categories and now and then a search. Signed in, so each account has its own request budget. */
export async function browse(ctx: Context) {
  const { rec, fixture } = ctx;
  const accounts = ctx.tokens?.customers ?? [];
  await runVus(ctx.vus, ctx.shape, async (vu) => {
    const token = accounts.length ? accounts[vu % accounts.length].token : null;
    await http(rec, { name: 'GET /products (listing)', method: 'GET', path: `/products?limit=20&page=${1 + Math.floor(Math.random() * 40)}`, token });
    await think();
    await http(rec, { name: 'GET /products/:id', method: 'GET', path: `/products/${pickOne(fixture.productIds)}`, token });
    await think();
    await http(rec, { name: 'GET /sellers (kitchens)', method: 'GET', path: `/sellers?limit=20&page=${1 + Math.floor(Math.random() * 20)}`, token });
    await http(rec, { name: 'GET /sellers/:id', method: 'GET', path: `/sellers/${pickOne(fixture.sellerIds)}`, token });
    await http(rec, { name: 'GET /categories', method: 'GET', path: '/categories', token });
    if (Math.random() < 0.3) await http(rec, { name: 'GET /products (search)', method: 'GET', path: `/products?limit=20&search=${encodeURIComponent(pickOne(SEARCH_WORDS))}`, token });
    if (Math.random() < 0.2) await http(rec, { name: 'GET /products (by category)', method: 'GET', path: `/products?limit=20&categoryId=${pickOne(fixture.categoryIds)}`, token });
    await think(800, 3000);
  });
}

/** Customers placing cash-on-delivery orders at a steady rate, each from the account's own address and kitchen. */
export async function checkout(ctx: Context) {
  const { rec, fixture } = ctx;
  const accounts = need(ctx.tokens?.customers, 'customer tokens');
  const byEmail = new Map(fixture.customers.map((c) => [c.email, c]));
  await runAtRate(ctx.perMinute, ctx.shape.seconds, async (n) => {
    const account = accounts[n % accounts.length];
    const customer = byEmail.get(account.email);
    if (!customer || customer.sellerProductIds.length === 0) return;
    const token = account.token;
    await http(rec, { name: 'GET /users/me/addresses', method: 'GET', path: '/users/me/addresses', token });
    await http(rec, { name: 'GET /payments/methods', method: 'GET', path: '/payments/methods', token });
    const placed = await http(rec, {
      name: 'POST /orders (cash on delivery)',
      method: 'POST',
      path: '/orders',
      token,
      parse: true,
      headers: { 'idempotency-key': crypto.randomUUID() },
      body: { items: customer.sellerProductIds.slice(0, 2).map((productId) => ({ productId, quantity: 1 })), deliveryType: 'home_delivery', paymentMethod: 'cod', deliveryAddressId: customer.addressId },
    });
    const id = placed.body?.data?.order?.id ?? placed.body?.data?.id;
    if (placed.status === 201 && id) await http(rec, { name: 'GET /orders/:id', method: 'GET', path: `/orders/${id}`, token });
    await http(rec, { name: 'GET /orders/me', method: 'GET', path: '/orders/me?limit=10', token });
  });
}

/**
 * Riders working: the dashboard's three lists every 30 s, a position every 10 s for a rider who is on a job,
 * and (with `claim`) each rider taking one open job and carrying it to the door with the customer's code.
 */
export async function riderLoop(ctx: Context) {
  const { rec, fixture } = ctx;
  const accounts = need(ctx.tokens?.riders, 'rider tokens');
  const byEmail = new Map(fixture.riders.map((r) => [r.email, r]));
  const stopAt = Date.now() + ctx.shape.seconds * 1000;
  const openJobs = [...fixture.openJobs];

  async function rider(i: number) {
    const account = accounts[i];
    const me = byEmail.get(account.email);
    const token = account.token;
    await sleep((ctx.shape.ramp * 1000 * i) / Math.max(1, ctx.vus));
    let delivery = me?.activeDeliveryId ?? null;
    let lat = 24.86 + Math.random() * 0.05;
    let lng = 67.0 + Math.random() * 0.05;

    const lists = async () => {
      while (Date.now() < stopAt) {
        await Promise.all([
          http(rec, { name: 'GET /riders/deliveries/available', method: 'GET', path: '/riders/deliveries/available', token }),
          http(rec, { name: 'GET /riders/deliveries/mine', method: 'GET', path: '/riders/deliveries/mine', token }),
          http(rec, { name: 'GET /riders/me', method: 'GET', path: '/riders/me', token }),
        ]);
        await sleep(25_000 + Math.random() * 10_000);
      }
    };
    const position = async () => {
      while (Date.now() < stopAt) {
        if (delivery) {
          lat += (Math.random() - 0.5) * 0.0004;
          lng += (Math.random() - 0.5) * 0.0004;
          await http(rec, { name: 'POST /riders/deliveries/:id/location', method: 'POST', path: `/riders/deliveries/${delivery}/location`, token, body: { latitude: lat, longitude: lng } });
        }
        await sleep(10_000);
      }
    };
    const work = async () => {
      if (!ctx.claim) return;
      await sleep(Math.random() * 20_000);
      const job = openJobs.shift();
      if (!job || Date.now() >= stopAt) return;
      const claimed = await http(rec, { name: 'POST /riders/deliveries/:id/claim', method: 'POST', path: `/riders/deliveries/${job.deliveryId}/claim`, token, body: {} });
      if (claimed.status !== 200) return;
      delivery = job.deliveryId;
      for (const status of ['arrived_at_pickup', 'picked_up', 'in_transit', 'arrived_at_customer', 'delivered']) {
        await sleep(2000 + Math.random() * 3000);
        const moved = await http(rec, { name: 'PATCH /riders/deliveries/:id/status', method: 'PATCH', path: `/riders/deliveries/${job.deliveryId}/status`, token, body: status === 'delivered' ? { status, otp: job.handoverCode } : { status } });
        if (moved.status !== 200) return;
      }
      delivery = null;
    };
    await Promise.all([lists(), position(), work()]);
  }
  await Promise.all(Array.from({ length: Math.min(ctx.vus, accounts.length) }, (_, i) => rider(i)));
}

/** Sign-ins at a fixed rate with the known password: bcrypt is the cost here, and the throttle should stay out of the way of honest customers. */
export async function loginStorm(ctx: Context) {
  const { rec, fixture } = ctx;
  const accounts = fixture.customers;
  await runAtRate(ctx.perSecond * 60, ctx.shape.seconds, async (n) => {
    await http(rec, {
      name: 'POST /auth/login',
      method: 'POST',
      path: '/auth/login',
      body: { phoneOrEmail: accounts[n % accounts.length].email, otpCodeOrPassword: fixture.password, loginMethod: 'email' },
    });
  });
}
