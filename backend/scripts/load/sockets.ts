/**
 * Open connections and fan-out: a few thousand sockets (a fifth of them riders on duty) stay connected
 * while jobs are posted to the open pool at a steady rate, and every rider socket is timed from the moment
 * the kitchen accepts the order to the moment it hears `delivery:new`. This is the worst case for the pool
 * announcement, so run it against an API with AUTO_ASSIGN_ENABLED=false: with automatic assignment on, most
 * jobs are given to one rider and never announced (which is the point of PERF-5, and is reported as such).
 */
import crypto from 'crypto';
import { io, Socket } from 'socket.io-client';
import { Context, Extra } from './scenarios';
import { http, ORIGIN, runAtRate, sleep } from './engine';

export async function sockets(ctx: Context): Promise<Extra> {
  const { rec, fixture } = ctx;
  const tokens = ctx.tokens;
  if (!tokens || tokens.riders.length === 0 || tokens.customers.length === 0 || tokens.kitchens.length === 0) {
    throw new Error('The sockets scenario needs tokens for customers, riders and kitchens. Run `npm run load:tokens`.');
  }
  const notes: string[] = [];
  const failures: string[] = [];
  const total = ctx.sockets;
  const riderTotal = Math.max(1, Math.round(total * 0.2));
  const open: Socket[] = [];
  let riderSockets = 0;
  let unexpectedClosures = 0;
  let closing = false;

  /** orderId -> when the kitchen's accept was sent, and how many rider sockets have heard about the order since. */
  const announced = new Map<string, { at: number; heard: number }>();

  function connect(token: string, isRider: boolean): Promise<void> {
    return new Promise((resolve) => {
      const started = performance.now();
      const socket = io(ORIGIN, { auth: { token }, transports: ['websocket'], reconnection: false, timeout: 15_000 });
      open.push(socket);
      let settled = false;
      const settle = (status: number) => {
        if (settled) return;
        settled = true;
        rec.record('SOCKET connect', performance.now() - started, status);
        if (status === 200 && isRider) riderSockets++;
        resolve();
      };
      socket.on('connect', () => settle(200));
      socket.on('connect_error', () => settle(0));
      socket.on('disconnect', () => {
        if (!closing && settled) unexpectedClosures++;
      });
      if (isRider) {
        socket.on('delivery:new', (data: { orderId?: string }) => {
          const job = data?.orderId ? announced.get(data.orderId) : undefined;
          if (!job) return;
          job.heard++;
          rec.record('EVENT delivery:new reaches a rider', performance.now() - job.at, 200);
        });
      }
    });
  }

  // Connect in waves so the server is not asked for thousands of handshakes in one instant.
  const waves = Math.max(1, Math.ceil(ctx.shape.ramp));
  const perWave = Math.ceil(total / waves);
  for (let w = 0; w < waves; w++) {
    const from = w * perWave;
    const to = Math.min(total, from + perWave);
    const started = Date.now();
    await Promise.all(
      Array.from({ length: Math.max(0, to - from) }, (_, k) => {
        const i = from + k;
        const rider = i < riderTotal;
        const list = rider ? tokens.riders : tokens.customers;
        return connect(list[i % list.length].token, rider);
      })
    );
    await sleep(Math.max(0, 1000 - (Date.now() - started)));
  }
  await sleep(1000); // the server places a rider's connection in the on-duty room a moment after the handshake
  notes.push(`${open.filter((s) => s.connected).length} of ${total} sockets connected (${riderSockets} of them riders on duty)`);

  // Jobs into the pool while everyone listens.
  const customers = new Map(fixture.customers.map((c) => [c.email, c]));
  const kitchens = new Map(fixture.kitchens.map((k) => [k.email, k]));
  let posted = 0;
  await runAtRate(ctx.jobsPerMinute, ctx.shape.seconds, async (n) => {
    const kitchenAccount = tokens.kitchens[n % tokens.kitchens.length];
    const kitchen = kitchens.get(kitchenAccount.email);
    // A customer the kitchen can deliver to (Nuray riders go up to 20 km) and who has a token.
    const reachable = kitchen ? tokens.customers.filter((c) => kitchen.nearbyCustomers.includes(c.email)) : [];
    const customerAccount = reachable[n % Math.max(1, reachable.length)];
    const customer = customerAccount ? customers.get(customerAccount.email) : undefined;
    if (!kitchen || !customerAccount || !customer || kitchen.productIds.length === 0) return;
    const placed = await http(rec, {
      name: 'POST /orders (cash on delivery)',
      method: 'POST',
      path: '/orders',
      token: customerAccount.token,
      parse: true,
      headers: { 'idempotency-key': crypto.randomUUID() },
      body: { items: [{ productId: kitchen.productIds[0], quantity: 1 }], deliveryType: 'home_delivery', paymentMethod: 'cod', deliveryAddressId: customer.addressId },
    });
    const orderId = placed.body?.data?.order?.id ?? placed.body?.data?.id;
    if (placed.status !== 201 || !orderId) return;
    announced.set(orderId, { at: performance.now(), heard: 0 });
    posted++;
    await http(rec, { name: 'POST /seller/orders/:id/accept', method: 'POST', path: `/seller/orders/${orderId}/accept`, token: kitchenAccount.token });
  });
  await sleep(3000); // stragglers

  // What the riders heard.
  const heard = [...announced.values()].map((j) => j.heard);
  if (posted === 0) failures.push('no job could be posted: no kitchen with a token has a customer with a token in its range');
  const announcedJobs = heard.filter((h) => h > 0).length;
  notes.push(`${posted} jobs posted; ${announcedJobs} of them were announced to the pool`);
  if (posted > 0 && announcedJobs === 0) notes.push('No job reached the pool: automatic assignment gave them to riders. Run the API with AUTO_ASSIGN_ENABLED=false to measure the worst-case fan-out.');
  if (announcedJobs > 0 && riderSockets > 0) {
    const lowest = Math.min(...heard.filter((h) => h > 0));
    notes.push(`each announced job reached ${lowest} to ${Math.max(...heard)} of ${riderSockets} rider sockets`);
    if (lowest < riderSockets * 0.99) failures.push(`a job reached only ${lowest} of ${riderSockets} rider sockets (99% expected)`);
  }

  // Connections that were up must have stayed up.
  const connected = open.filter((s) => s.connected).length;
  if (unexpectedClosures > 0) failures.push(`${unexpectedClosures} sockets were closed by the server or the network while the test ran`);
  if (total - connected - unexpectedClosures > total * 0.01) failures.push(`${total - connected - unexpectedClosures} of ${total} sockets never connected (1% allowed)`);

  closing = true;
  open.forEach((s) => s.close());
  return { notes, failures };
}
