/**
 * A mixed day at a fixed number of virtual users, for the capacity ladder (docs/LOAD_TESTING.md): customers sign in,
 * browse the listing, open a kitchen and a dish, fill the cart, and some check out and follow their order; kitchens accept
 * and mark ready what arrives; riders take the jobs and carry them to the door with the customer's code.
 *
 *   DATABASE_URL=postgresql://.../x_load API_URLS=http://a:3201/api/v1,http://b:3202/api/v1 \
 *     npx ts-node --transpile-only scripts/load/ladder.ts --vus 1000 --duration 180 --ramp 60 --workers 4 [--json FILE]
 *
 * Who is near whom is read from the seeded *_load database (it refuses any other), so every order goes to a kitchen
 * that has a virtual user behind it. Requests go to API_URLS in turn: the generator plays the load balancer and sends
 * each virtual user's own address in X-Forwarded-For, as a balancer would (the API trusts one proxy hop by default).
 * Handover codes pass from the customer to the rider through Redis (LADDER_REDIS_URL, default redis://localhost:6379/6).
 * Virtual users are split over --workers processes so the generator is not the bottleneck; watch its CPU anyway.
 *
 * --sessions: returning users. Before the run every virtual user (and every idle rider) gets a session minted the way a
 * sign-in issues one (session.service startSession: a refresh_tokens row and an access token carrying its id), so the
 * auth middleware does its full check. Needs the API's JWT_SECRET. Only LADDER_LOGIN_SHARE of them (default 0.02) sign in
 * with a password instead. Access tokens last an hour (JWT_EXPIRES_IN), so a step must start within that.
 */
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fork } from 'child_process';
import Redis from 'ioredis';
import { databaseName, LOAD_EMAIL_DOMAIN, LOAD_PASSWORD, rng } from './common';
import { hasFlag, numberOption, option, printReport, judge, Recorder, saveResult, sleep } from './engine';

const API_URLS = (process.env.API_URLS ?? process.env.API_URL ?? 'http://localhost:3001/api/v1').split(',').map((u) => u.trim().replace(/\/+$/, ''));
const REDIS_URL = process.env.LADDER_REDIS_URL ?? 'redis://localhost:6379/6';
const CHECKOUT_SHARE = Number(process.env.LADDER_CHECKOUT_SHARE ?? 0.3);
const RANGE_KM = 12;
const SESSIONS = hasFlag('sessions');
const LOGIN_SHARE = SESSIONS ? Number(process.env.LADDER_LOGIN_SHARE ?? 0.02) : 1;

type Role = 'customer' | 'kitchen' | 'rider';
interface Vu { role: Role; email: string; addressId?: string; kitchenId?: string; productIds?: string[]; token?: string }
interface Plan { vus: Vu[]; idle: Array<{ email: string; token?: string }>; productIds: string[]; sellerIds: string[]; seconds: number; ramp: number; openJobCodes: Record<string, string> }
interface Raw { ms: Record<string, number[]>; status: Record<string, Record<string, number>>; reasons: Record<string, Record<string, number>>; counters: Record<string, number> }

const think = (min: number, max: number) => sleep(min + Math.random() * (max - min));
const pick = <T>(list: T[]): T => list[Math.floor(Math.random() * list.length)];

function km(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const rad = Math.PI / 180;
  const h = Math.sin(((b.lat - a.lat) * rad) / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(((b.lng - a.lng) * rad) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

// ---------------------------------------------------------------------------------------------
// Main: plan the roles from the database, fork the workers, merge what they measured
// ---------------------------------------------------------------------------------------------

async function plan(total: number, seconds: number, ramp: number): Promise<Plan> {
  const name = databaseName(process.env.DATABASE_URL);
  if (!name || !name.endsWith('_load')) throw new Error(`Refusing to plan from "${name ?? 'unknown'}": the ladder reads only a database whose name ends in _load.`);
  const { default: prisma } = await import('../../src/config/database');
  const kitchens = await prisma.$queryRaw<Array<{ id: string; email: string; lat: number; lng: number; products: string[] }>>`
    SELECT s.id, u.email, s.latitude::float8 AS lat, s.longitude::float8 AS lng, array_agg(p.id) AS products
    FROM sellers s JOIN users u ON u.id = s.user_id JOIN products p ON p.seller_id = s.id AND p.is_active
    WHERE s.status = 'active' AND s.verification_status = 'approved' AND s.latitude IS NOT NULL AND u.email LIKE ${'%@' + LOAD_EMAIL_DOMAIN}
    GROUP BY s.id, u.email`;
  const customers = await prisma.$queryRaw<Array<{ email: string; address_id: string; lat: number; lng: number }>>`
    SELECT DISTINCT ON (u.id) u.email, a.id AS address_id, a.latitude::float8 AS lat, a.longitude::float8 AS lng
    FROM users u JOIN user_addresses a ON a.user_id = u.id
    WHERE u.user_type = 'customer' AND u.email LIKE ${'%@' + LOAD_EMAIL_DOMAIN} AND a.latitude IS NOT NULL ORDER BY u.id, a.is_default DESC`;
  const riders = await prisma.$queryRaw<Array<{ email: string }>>`
    SELECT u.email FROM users u JOIN riders r ON r.user_id = u.id
    WHERE u.email LIKE ${'%@' + LOAD_EMAIL_DOMAIN} AND r.verification_status = 'approved' ORDER BY u.email`;
  const products = await prisma.$queryRaw<Array<{ id: string }>>`SELECT id FROM products WHERE is_active LIMIT 5000`;
  const openJobs = await prisma.$queryRaw<Array<{ order_id: string; handover_code: string }>>`
    SELECT o.id AS order_id, o.handover_code FROM orders o JOIN deliveries d ON d."orderId" = o.id
    WHERE d.status NOT IN ('delivered', 'delivery_failed', 'cancelled') AND o.handover_code IS NOT NULL`;

  const random = rng(7);
  const shuffled = [...kitchens].sort(() => random() - 0.5);
  const kitchenCount = Math.min(shuffled.length, Math.max(5, Math.round(total * 0.07)));
  const riderCount = Math.min(riders.length, Math.max(10, Math.round(total * 0.03)));
  const active = shuffled.slice(0, kitchenCount);
  const vus: Vu[] = [
    ...active.map((k): Vu => ({ role: 'kitchen', email: k.email, kitchenId: k.id })),
    ...riders.slice(0, riderCount).map((r): Vu => ({ role: 'rider', email: r.email })),
  ];
  const customerCount = Math.max(0, total - vus.length);
  for (let i = 0; i < customerCount; i++) {
    const c = customers[i % customers.length];
    let best: (typeof active)[number] | null = null;
    let bestKm = RANGE_KM;
    for (const k of active) {
      const d = km(c, k);
      if (d < bestKm) {
        best = k;
        bestKm = d;
      }
    }
    vus.push({ role: 'customer', email: c.email, addressId: c.address_id, kitchenId: best?.id, productIds: best?.products.slice(0, 3) });
  }
  // Riders without a virtual user go off duty, so no job is given to someone who will never carry it.
  const idle: Plan['idle'] = riders.slice(riderCount).map((r) => ({ email: r.email }));
  if (SESSIONS) {
    const { startSession } = await import('../../src/services/session.service');
    const users = await prisma.$queryRaw<Array<{ id: string; email: string; phone: string; user_type: string }>>`
      SELECT id, email, phone, user_type::text FROM users WHERE email LIKE ${'%@' + LOAD_EMAIL_DOMAIN}`;
    const byEmail = new Map(users.map((u) => [u.email, u]));
    const needing: Array<{ email: string; token?: string }> = [...vus.filter(() => random() >= LOGIN_SHARE), ...idle];
    for (let i = 0; i < needing.length; i += 50) {
      await Promise.all(
        needing.slice(i, i + 50).map(async (v) => {
          const u = byEmail.get(v.email);
          if (u) v.token = (await startSession({ id: u.id, userType: u.user_type, phone: u.phone })).accessToken;
        })
      );
    }
  }
  await prisma.$disconnect();
  return {
    vus: vus.sort(() => random() - 0.5),
    productIds: products.map((p) => p.id),
    sellerIds: kitchens.map((k) => k.id),
    seconds,
    ramp,
    openJobCodes: Object.fromEntries(openJobs.map((j) => [j.order_id, j.handover_code])),
    idle,
  };
}

async function main() {
  const total = numberOption('vus', 100);
  const seconds = numberOption('duration', 120);
  const ramp = numberOption('ramp', Math.min(60, seconds / 3));
  const workers = numberOption('workers', Math.max(1, Math.min(6, Math.ceil(total / 1500))));
  const planned = await plan(total, seconds, ramp);
  const counts = planned.vus.reduce<Record<string, number>>((acc, v) => ((acc[v.role] = (acc[v.role] ?? 0) + 1), acc), {});
  const withKitchen = planned.vus.filter((v) => v.role === 'customer' && v.kitchenId).length;
  const minted = planned.vus.filter((v) => v.token).length;
  console.log(SESSIONS ? `Sessions: ${minted} of ${planned.vus.length} VUs start signed in; ${planned.vus.length - minted} sign in with a password.` : 'Every VU signs in with a password.');
  console.log(`Ladder step: ${total} VUs (${counts.customer ?? 0} customers, ${withKitchen} with a kitchen in range; ${counts.kitchen ?? 0} kitchens; ${counts.rider ?? 0} riders) for ${seconds} s, ramp ${ramp} s, ${workers} worker processes, targets ${API_URLS.join(' ')}`);

  const redis = new Redis(REDIS_URL);
  await redis.del('ladder:codes');
  if (Object.keys(planned.openJobCodes).length) await redis.hset('ladder:codes', planned.openJobCodes);
  await redis.quit();

  const setup = new Recorder();
  for (let i = 0; i < planned.idle.length; i += 20) {
    await Promise.all(
      planned.idle.slice(i, i + 20).map(async ({ email, token: minted }, n) => {
        const token = minted ?? (await login(setup, email, i + n));
        if (token) await call(setup, 'SETUP duty off', 'PATCH', '/riders/duty-status', token, i + n, { isAvailable: false });
      })
    );
  }

  const planFile = path.join(os.tmpdir(), `ladder-plan-${process.pid}.json`);
  fs.writeFileSync(planFile, JSON.stringify(planned));
  const started = Date.now();
  const results = await Promise.all(
    Array.from({ length: workers }, (_, w) =>
      new Promise<Raw>((resolve, reject) => {
        const child = fork(__filename, process.argv.slice(2), { env: { ...process.env, LADDER_WORKER: String(w), LADDER_WORKERS: String(workers), LADDER_PLAN: planFile }, execArgv: process.execArgv });
        child.on('message', (raw: Raw) => resolve(raw));
        child.on('exit', (code) => code !== 0 && reject(new Error(`worker ${w} exited with ${code}`)));
      })
    )
  );
  const elapsed = (Date.now() - started) / 1000;
  fs.rmSync(planFile, { force: true });

  const rec = new Recorder();
  const counters: Record<string, number> = {};
  for (const raw of results) {
    for (const [name, list] of Object.entries(raw.ms)) {
      // Statuses and reasons come back as counts: pair them with the latencies by position (the report only aggregates).
      const statuses = Object.entries(raw.status[name]).flatMap(([s, n]) => Array<number>(n).fill(Number(s)));
      const codes = new Map<number, string[]>();
      for (const [key, n] of Object.entries(raw.reasons[name] ?? {})) {
        const [status, ...code] = key.split(' ');
        codes.set(Number(status), [...(codes.get(Number(status)) ?? []), ...Array<string>(n).fill(code.join(' '))]);
      }
      list.forEach((ms, i) => {
        const status = statuses[i];
        rec.record(name, ms, status, 0, status >= 400 ? codes.get(status)?.pop() : undefined);
      });
    }
    for (const [k, v] of Object.entries(raw.counters)) counters[k] = (counters[k] ?? 0) + v;
  }
  const stats = rec.stats(elapsed);
  const verdict = judge(stats, [{ prefix: 'POST /auth/login', p95Ms: 1000 }], 20, !hasFlag('smoke'));
  printReport(`Ladder ${total} VUs`, elapsed, stats, verdict);
  const all = stats.reduce((a, s) => ({ n: a.n + s.count, bad: a.bad + s.serverErrors + s.networkErrors, c4: a.c4 + s.clientErrors, t: a.t + s.throttled }), { n: 0, bad: 0, c4: 0, t: 0 });
  const merged = results.flatMap((r) => Object.values(r.ms).flat()).sort((a, b) => a - b);
  const q = (p: number) => merged[Math.min(merged.length - 1, Math.floor(p * merged.length))] ?? 0;
  const summary = {
    vus: total,
    seconds: elapsed,
    requests: all.n,
    rps: all.n / elapsed,
    p50: q(0.5),
    p95: q(0.95),
    p99: q(0.99),
    errorPct: (100 * all.bad) / Math.max(1, all.n),
    clientErrorPct: (100 * all.c4) / Math.max(1, all.n),
    throttledPct: (100 * all.t) / Math.max(1, all.n),
    counters,
  };
  console.log(`\nAll requests: ${all.n} in ${elapsed.toFixed(0)} s = ${summary.rps.toFixed(1)}/s; p50 ${summary.p50.toFixed(0)} ms, p95 ${summary.p95.toFixed(0)} ms, p99 ${summary.p99.toFixed(0)} ms; 5xx+no answer ${summary.errorPct.toFixed(2)} %, other 4xx ${summary.clientErrorPct.toFixed(2)} %, 429 ${summary.throttledPct.toFixed(2)} %`);
  console.log(`Journey counters: ${JSON.stringify(counters)}`);
  const file = saveResult(`ladder-${total}`, { summary, stats, failures: verdict.failures, setup: setup.stats(elapsed) }, option('json'));
  console.log(`Result saved to ${file}`);
  process.exit(verdict.passed ? 0 : 1);
}

// ---------------------------------------------------------------------------------------------
// HTTP with round-robin targets and a per-user client address
// ---------------------------------------------------------------------------------------------

let nextTarget = 0;
const clientAddress = (vu: number) => `10.${(vu >> 16) & 255}.${(vu >> 8) & 255}.${vu & 255}`;

async function call(rec: Recorder, name: string, method: string, p: string, token: string | null, vu: number, body?: unknown, headers: Record<string, string> = {}): Promise<{ status: number; body: any }> {
  const base = API_URLS[nextTarget++ % API_URLS.length];
  const started = performance.now();
  try {
    const res = await fetch(base + p, {
      method,
      headers: { 'x-forwarded-for': clientAddress(vu), ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    const text = await res.text();
    let parsed: any = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
    rec.record(name, performance.now() - started, res.status, text.length, res.status >= 400 ? parsed?.error?.code : undefined);
    return { status: res.status, body: parsed };
  } catch {
    rec.record(name, performance.now() - started, 0);
    return { status: 0, body: null };
  }
}

async function login(rec: Recorder, email: string, vu: number): Promise<string | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await call(rec, 'POST /auth/login', 'POST', '/auth/login', null, vu, { phoneOrEmail: email, otpCodeOrPassword: LOAD_PASSWORD, loginMethod: 'email' });
    const token = r.body?.data?.tokens?.access_token;
    if (r.status === 200 && token) return token;
    await sleep(2000 * (attempt + 1));
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// Worker: the virtual users
// ---------------------------------------------------------------------------------------------

async function worker() {
  const w = Number(process.env.LADDER_WORKER);
  const workers = Number(process.env.LADDER_WORKERS);
  const p = JSON.parse(fs.readFileSync(process.env.LADDER_PLAN!, 'utf8')) as Plan;
  const rec = new Recorder();
  const counters: Record<string, number> = {};
  const count = (k: string) => (counters[k] = (counters[k] ?? 0) + 1);
  const redis = new Redis(REDIS_URL);
  const stopAt = Date.now() + p.seconds * 1000;
  const live = () => Date.now() < stopAt;

  async function customer(vu: number, me: Vu) {
    const token = me.token ?? (await login(rec, me.email, vu));
    if (!token) {
      count('customer login failed');
      return;
    }
    while (live()) {
      await call(rec, 'GET /products (listing)', 'GET', `/products?limit=20&page=${1 + Math.floor(Math.random() * 30)}`, token, vu);
      await think(2000, 6000);
      await call(rec, 'GET /sellers/:id (kitchen menu)', 'GET', `/sellers/${me.kitchenId ?? pick(p.sellerIds)}`, token, vu);
      await think(2000, 6000);
      const dish = me.productIds?.length ? pick(me.productIds) : pick(p.productIds);
      await call(rec, 'GET /products/:id', 'GET', `/products/${dish}`, token, vu);
      await think(2000, 5000);
      if (Math.random() < 0.3) await call(rec, 'GET /products (search)', 'GET', `/products?limit=20&search=${pick(['biryani', 'karahi', 'dish 1', 'kebab'])}`, token, vu);
      const added = await call(rec, 'POST /cart/items', 'POST', '/cart/items', token, vu, { productId: dish, quantity: 1, clearAndAdd: true });
      if (added.status < 300) await call(rec, 'GET /cart', 'GET', '/cart', token, vu);
      await think(2000, 5000);
      if (me.kitchenId && me.productIds?.length && Math.random() < CHECKOUT_SHARE && live()) {
        await call(rec, 'GET /users/me/addresses', 'GET', '/users/me/addresses', token, vu);
        const placed = await call(rec, 'POST /orders (cod)', 'POST', '/orders', token, vu, { items: [{ productId: dish, quantity: 1 }], deliveryType: 'home_delivery', paymentMethod: 'cod', deliveryAddressId: me.addressId }, { 'idempotency-key': crypto.randomUUID() });
        const id = placed.body?.data?.order?.id;
        if (placed.status === 201 && id) {
          count('orders placed');
          const detail = await call(rec, 'GET /orders/:id', 'GET', `/orders/${id}`, token, vu);
          const code = detail.body?.data?.handoverCode;
          if (code) await redis.hset('ladder:codes', id, code);
          for (let i = 0; i < 8 && live(); i++) {
            await think(8000, 12000);
            const t = await call(rec, 'GET /realtime/orders/:id/track', 'GET', `/realtime/orders/${id}/track`, token, vu);
            const status = t.body?.data?.orderStatus;
            if (status === 'delivered' || status === 'cancelled') break;
          }
        }
      } else {
        await call(rec, 'GET /orders/me', 'GET', '/orders/me?limit=10', token, vu);
      }
      await think(5000, 15000);
    }
  }

  async function kitchen(vu: number, me: Vu) {
    const token = me.token ?? (await login(rec, me.email, vu));
    if (!token) {
      count('kitchen login failed');
      return;
    }
    const readyAt = new Map<string, number>();
    while (live()) {
      const pending = await call(rec, 'GET /seller/orders?status=pending', 'GET', '/seller/orders?status=pending&limit=20', token, vu);
      for (const row of pending.body?.data?.orders ?? []) {
        const id = row?.order?.id;
        if (!id || readyAt.has(id)) continue;
        const r = await call(rec, 'POST /seller/orders/:id/accept', 'POST', `/seller/orders/${id}/accept`, token, vu, {});
        if (r.status === 200) {
          count('orders accepted');
          readyAt.set(id, Date.now() + 20_000 + Math.random() * 20_000);
        }
      }
      for (const [id, at] of readyAt) {
        if (at > Date.now()) continue;
        const r = await call(rec, 'POST /seller/orders/:id/ready', 'POST', `/seller/orders/${id}/ready`, token, vu, {});
        if (r.status === 200) count('orders ready');
        readyAt.delete(id);
      }
      await call(rec, 'GET /seller/orders (dashboard)', 'GET', '/seller/orders?limit=20', token, vu);
      await think(8000, 12000);
    }
  }

  const NEXT = ['arrived_at_pickup', 'picked_up', 'in_transit', 'arrived_at_customer', 'delivered'];
  async function rider(vu: number, me: Vu) {
    const token = me.token ?? (await login(rec, me.email, vu));
    if (!token) {
      count('rider login failed');
      return;
    }
    await call(rec, 'PATCH /riders/duty-status', 'PATCH', '/riders/duty-status', token, vu, { isAvailable: true });
    let lat = 24.86 + Math.random() * 0.05;
    let lng = 67.0 + Math.random() * 0.05;
    let loops = 0;
    while (live()) {
      const mine = await call(rec, 'GET /riders/deliveries/mine', 'GET', '/riders/deliveries/mine?history=0', token, vu);
      const running = ((mine.body?.data ?? []) as any[]).filter((d) => !['delivered', 'delivery_failed', 'cancelled'].includes(d?.status));
      const job = running[0];
      if (job) {
        lat += (Math.random() - 0.5) * 0.0004;
        lng += (Math.random() - 0.5) * 0.0004;
        await call(rec, 'POST /riders/deliveries/:id/location', 'POST', `/riders/deliveries/${job.id}/location`, token, vu, { latitude: lat, longitude: lng });
        const next = NEXT[NEXT.indexOf(job.status) + 1] ?? NEXT[0];
        let body: Record<string, string> = { status: next };
        if (next === 'delivered') {
          const code = await redis.hget('ladder:codes', job.orderId);
          if (!code) count('delivered without a known code');
          body = { status: next, otp: code ?? '0000' };
        }
        const moved = await call(rec, 'PATCH /riders/deliveries/:id/status', 'PATCH', `/riders/deliveries/${job.id}/status`, token, vu, body);
        if (moved.status === 200 && next === 'delivered') count('orders delivered');
      } else {
        const open = await call(rec, 'GET /riders/deliveries/available', 'GET', '/riders/deliveries/available', token, vu);
        const first = (open.body?.data ?? [])[Math.floor(Math.random() * Math.min(5, (open.body?.data ?? []).length))];
        if (first?.id) {
          const claimed = await call(rec, 'POST /riders/deliveries/:id/claim', 'POST', `/riders/deliveries/${first.id}/claim`, token, vu, {});
          if (claimed.status === 200) count('jobs claimed');
        }
      }
      if (loops++ % 3 === 0) await call(rec, 'GET /riders/me', 'GET', '/riders/me', token, vu);
      await think(6000, 10000);
    }
  }

  const mine = p.vus.map((v, i) => ({ v, i })).filter(({ i }) => i % workers === w);
  await Promise.all(
    mine.map(async ({ v, i }) => {
      await sleep((p.ramp * 1000 * i) / Math.max(1, p.vus.length));
      if (!live()) return;
      try {
        if (v.role === 'customer') await customer(i, v);
        else if (v.role === 'kitchen') await kitchen(i, v);
        else await rider(i, v);
      } catch {
        count('vu crashed');
      }
    })
  );
  await redis.quit();

  const raw: Raw = { ms: {}, status: {}, reasons: {}, counters };
  // Recorder keeps its data private: read it back through its own stats-free view.
  const data = (rec as unknown as { data: Map<string, { ms: number[]; codes: Map<number, number>; reasons: Map<string, { status: number; code: string; count: number }> }> }).data;
  for (const [name, entry] of data) {
    raw.ms[name] = entry.ms;
    raw.status[name] = Object.fromEntries([...entry.codes].map(([s, n]) => [String(s), n]));
    raw.reasons[name] = Object.fromEntries([...entry.reasons.values()].map((r) => [`${r.status} ${r.code}`, r.count]));
  }
  process.send!(raw, undefined, undefined, () => process.exit(0));
}

if (process.env.LADDER_WORKER !== undefined) {
  worker().catch((err) => {
    console.error(err);
    process.exit(1);
  });
} else {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(2);
  });
}
