/**
 * Shared pieces of the API checks: they run against a RUNNING API over HTTP (the way the web app
 * talks to it) and its database, and make every user, kitchen, product and order they need, with
 * unique values, so they work on any database that has had `prisma migrate deploy` and never depend
 * on seeded accounts. They leave their data behind: use a throwaway database.
 *
 *   API_URL=http://localhost:3001/api/v1 DATABASE_URL=postgresql://... npm run api-checks
 *
 * DATABASE_URL must be the database the API uses. What these add to verify-money-flows (which calls
 * the services directly): the routes, the middleware, the exact JSON that leaves the API.
 */
import bcrypt from 'bcrypt';
import prisma from '../../src/config/database';

export { prisma };

export const API = (process.env.API_URL ?? 'http://localhost:3001/api/v1').replace(/\/+$/, '');
/** The server itself, without /api/v1 (for the routes outside it, such as /files and the socket). */
export const ORIGIN = API.replace(/\/api\/v\d+$/, '');
/** A password every account made here has. It passes the sign-up rules (length, not common, nothing personal). */
export const PASSWORD = 'Lantern-Quartz-71';

// ---------------------------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------------------------

let passed = 0;
let failed = 0;

/** Record one check. */
export function ok(name: string, condition: boolean, detail: unknown = ''): void {
  if (condition) passed++;
  else failed++;
  const extra = detail === '' || detail === undefined ? '' : `  [${typeof detail === 'string' ? detail : JSON.stringify(detail)}]`;
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${extra}`);
}

export const totals = () => ({ passed, failed });

// ---------------------------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------------------------

export interface Reply {
  status: number;
  body: any;
  headers: Headers;
  /** The error code of a failed answer, else the status: handy in a check's detail. */
  code: string | number;
}

/** One request. `raw` sends exactly that text as the body (even an empty one) instead of JSON. */
export async function call(token: string | null, method: string, path: string, body?: unknown, opts: { raw?: string; headers?: Record<string, string>; origin?: boolean } = {}): Promise<Reply> {
  const url = (opts.origin ? ORIGIN : API) + path;
  const res = await fetch(url, {
    method,
    headers: { ...(opts.raw === undefined && body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...opts.headers },
    body: opts.raw ?? (body === undefined ? undefined : JSON.stringify(body)),
  });
  const text = await res.text();
  let json: any = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { text };
  }
  return { status: res.status, body: json, headers: res.headers, code: json?.error?.code ?? res.status };
}

/** The keys that appear anywhere in a JSON-like value, to prove a payload carries none of a list of private fields. */
export function deepKeys(value: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach((v) => deepKeys(v, out));
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) (out.add(k), deepKeys(v, out));
  return out;
}

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------------------------

let counter = 0;
/** A value no earlier run or other suite used. */
export const unique = () => `${Date.now().toString(36)}${(++counter).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const phone = () => `+9230${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;

export type UserType = 'customer' | 'seller' | 'rider' | 'admin';

export interface Actor {
  id: string;
  email: string;
  phone: string;
  userType: UserType;
  access: string;
  refresh: string;
  /** A request as this person. */
  as(method: string, path: string, body?: unknown, opts?: Parameters<typeof call>[4]): Promise<Reply>;
}

/** Sign in through the API (so sign-in itself is exercised). */
export async function login(email: string, password = PASSWORD): Promise<{ access: string; refresh: string }> {
  const r = await call(null, 'POST', '/auth/login', { phoneOrEmail: email, otpCodeOrPassword: password, loginMethod: 'email' });
  if (r.status !== 200) throw new Error(`could not sign in ${email}: ${r.status} ${JSON.stringify(r.body?.error ?? r.body)}`);
  return { access: r.body.data.tokens.access_token, refresh: r.body.data.tokens.refresh_token };
}

/** A person with a verified e-mail and the shared password, signed in. Staff get `staffRole` (default 'admin'). */
export async function makeUser(type: UserType, opts: { staffRole?: 'admin' | 'super_admin' | 'support'; fullName?: string } = {}): Promise<Actor> {
  const n = unique();
  const email = `chk.${type}.${n}@nuray.test`;
  const user = await prisma.user.create({
    data: {
      email,
      phone: phone(),
      passwordHash: await bcrypt.hash(PASSWORD, 4),
      userType: type,
      ...(type === 'admin' ? { staffRole: opts.staffRole ?? 'admin' } : {}),
      emailVerified: true,
      status: 'active',
      profile: { create: { fullName: opts.fullName ?? `Check ${type} ${n}` } },
    } as any,
  });
  const tokens = await login(email);
  const actor: Actor = {
    id: user.id,
    email,
    phone: user.phone,
    userType: type,
    ...tokens,
    as: (method, path, body, o) => call(actor.access, method, path, body, o),
  };
  return actor;
}

export interface Kitchen {
  owner: Actor;
  sellerId: string;
}

/** An approved, active kitchen. `provider` says who delivers its home-delivery orders. */
export async function makeKitchen(opts: { provider?: 'platform' | 'self'; communityId?: string | null } = {}): Promise<Kitchen> {
  const owner = await makeUser('seller');
  const seller = await prisma.seller.create({
    data: {
      userId: owner.id,
      businessName: `Check Kitchen ${unique()}`,
      deliveryModes: ['delivery', 'pickup'],
      status: 'active',
      verificationStatus: 'approved',
      isVerified: true,
      deliveryProvider: opts.provider ?? 'platform',
      ...(opts.communityId ? { communityId: opts.communityId } : {}),
    } as any,
  });
  return { owner, sellerId: seller.id };
}

/** An approved, orderable dish. */
export async function makeProduct(sellerId: string, opts: { price?: number; stock?: number } = {}): Promise<string> {
  const p = await prisma.product.create({
    data: {
      sellerId,
      name: `Check Dish ${unique()}`,
      slug: `check-dish-${unique()}`,
      price: opts.price ?? 300,
      unit: 'pc',
      stockQuantity: opts.stock ?? 50,
      stockType: 'direct',
      approvalStatus: 'approved',
      isActive: true,
    } as any,
  });
  return p.id;
}

/** An approved rider who is on duty. */
export async function makeRider(): Promise<Actor & { riderId: string }> {
  const user = await makeUser('rider');
  const rider = await prisma.rider.create({ data: { userId: user.id, city: 'Karachi', verificationStatus: 'approved', status: 'active', isAvailable: true } as any });
  return { ...user, riderId: rider.id };
}

/** A saved address with a map pin in Karachi (inside Pakistan), made through the API. */
export async function makeAddress(customer: Actor, over: Record<string, unknown> = {}): Promise<string> {
  const r = await customer.as('POST', '/users/me/addresses', { addressLine1: 'House 9, Street 5', area: 'DHA Phase 6', city: 'Karachi', latitude: 24.8015, longitude: 67.0655, ...over });
  if (r.status !== 201) throw new Error(`could not add an address: ${r.status} ${JSON.stringify(r.body?.error ?? r.body)}`);
  return r.body.data.id;
}

/** Place an order through the API. */
export async function placeOrder(customer: Actor, items: Array<{ productId: string; quantity?: number }>, opts: { addressId?: string; paymentMethod?: string; deliveryType?: string; deliveryInstructions?: string } = {}): Promise<Reply> {
  return customer.as(
    'POST',
    '/orders',
    {
      items: items.map((i) => ({ productId: i.productId, quantity: i.quantity ?? 1 })),
      deliveryType: opts.deliveryType ?? (opts.addressId ? 'home_delivery' : 'self_pickup'),
      paymentMethod: opts.paymentMethod ?? 'cod',
      ...(opts.addressId ? { deliveryAddressId: opts.addressId } : {}),
      ...(opts.deliveryInstructions ? { deliveryInstructions: opts.deliveryInstructions } : {}),
    },
    { headers: { 'Idempotency-Key': unique() } }
  );
}

/** The order id out of a successful POST /orders answer. */
export const orderIdOf = (r: Reply): string => r.body?.data?.order?.id ?? r.body?.data?.id;

// ---------------------------------------------------------------------------------------------
// Suites
// ---------------------------------------------------------------------------------------------

export type Suite = () => Promise<void>;

// ---------------------------------------------------------------------------------------------
// Order flows
// ---------------------------------------------------------------------------------------------

export interface PlacedOrder {
  kitchen: Kitchen;
  customer: Actor;
  productId: string;
  addressId: string;
  orderId: string;
}

/** A customer orders one dish from a new kitchen, to a new address (cash on delivery, delivered by Nuray). */
export async function placeHomeOrder(opts: { provider?: 'platform' | 'self'; address?: Record<string, unknown>; quantity?: number } = {}): Promise<PlacedOrder> {
  const kitchen = await makeKitchen({ provider: opts.provider ?? 'platform' });
  const productId = await makeProduct(kitchen.sellerId, { price: 300 });
  const customer = await makeUser('customer');
  const addressId = await makeAddress(customer, opts.address);
  const placed = await placeOrder(customer, [{ productId, quantity: opts.quantity ?? 1 }], { addressId, deliveryInstructions: 'Ring twice' });
  if (placed.status !== 201) throw new Error(`could not place an order: ${placed.status} ${JSON.stringify(placed.body?.error ?? placed.body)}`);
  return { kitchen, customer, productId, addressId, orderId: orderIdOf(placed) };
}

/** The kitchen accepts the order; for a Nuray-delivered order this puts its job in the open pool. Returns the delivery id (or null for a kitchen-delivered or pickup order). */
export async function acceptOrder(placed: Pick<PlacedOrder, 'kitchen' | 'orderId'>): Promise<string | null> {
  const r = await placed.kitchen.owner.as('POST', `/seller/orders/${placed.orderId}/accept`);
  if (r.status !== 200) throw new Error(`the kitchen could not accept the order: ${r.status} ${JSON.stringify(r.body?.error ?? r.body)}`);
  return (await prisma.delivery.findUnique({ where: { orderId: placed.orderId }, select: { id: true } }))?.id ?? null;
}

/** The kitchen marks the order ready. */
export async function markReady(placed: Pick<PlacedOrder, 'kitchen' | 'orderId'>): Promise<void> {
  const r = await placed.kitchen.owner.as('POST', `/seller/orders/${placed.orderId}/ready`);
  if (r.status !== 200) throw new Error(`the kitchen could not mark the order ready: ${r.status} ${JSON.stringify(r.body?.error ?? r.body)}`);
}

/** A rider takes a job from the open pool. */
export async function claimJob(rider: Actor, deliveryId: string): Promise<Reply> {
  return rider.as('POST', `/riders/deliveries/${deliveryId}/claim`, {});
}

/** The rider walks a claimed job through to delivered: the kitchen has the food ready, the rider picks it up, drives, and gives the customer's handover code. */
export async function deliver(placed: Pick<PlacedOrder, 'kitchen' | 'orderId'>, rider: Actor, deliveryId: string): Promise<void> {
  await markReady(placed);
  for (const status of ['arrived_at_pickup', 'picked_up', 'in_transit', 'arrived_at_customer']) {
    const r = await rider.as('PATCH', `/riders/deliveries/${deliveryId}/status`, { status });
    if (r.status !== 200) throw new Error(`the rider could not move the job to ${status}: ${r.status} ${JSON.stringify(r.body?.error ?? r.body)}`);
  }
  // The code is never returned to the rider or the kitchen, and the client leaves it out of every query unless asked for it.
  const code = (await prisma.order.findUnique({ where: { id: placed.orderId }, select: { handoverCode: true } }))?.handoverCode;
  const done = await rider.as('PATCH', `/riders/deliveries/${deliveryId}/status`, { status: 'delivered', otp: code ?? undefined });
  if (done.status !== 200) throw new Error(`the rider could not deliver the job: ${done.status} ${JSON.stringify(done.body?.error ?? done.body)}`);
}
