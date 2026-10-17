/**
 * Fills a database with the volume the launch load test needs (docs/LOAD_TESTING.md): kitchens, dishes,
 * customers with addresses, riders, order history, open and running delivery jobs, notifications, audit
 * rows and complaints. Sizes can be changed with LOAD_* variables or shrunk with LOAD_SCALE.
 *
 *   DATABASE_URL=postgresql://.../nuray_load npm run load:seed
 *
 * It refuses to run unless the database is named *_load and holds no other people's accounts, and it writes
 * .generated/fixture.json (ids and accounts for the runner). Run `prisma migrate deploy` on the database first.
 */
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { Prisma } from '@prisma/client';
import prisma from '../../src/config/database';
import { seedCommunities } from '../../prisma/seed-communities';
import { databaseName, FIXTURE_FILE, Fixture, LOAD_EMAIL_DOMAIN, LOAD_PASSWORD, pad, rng, size, writeJson } from './common';

const DAY = 86_400_000;
const SEED = Number(process.env.LOAD_SEED ?? 1);
const rand = rng(SEED);
const pick = <T>(list: T[]): T => list[Math.floor(rand() * list.length)];
/** An index in 0..n-1 that favours the low ones: a few customers and kitchens do most of the ordering. */
const skewed = (n: number, power = 1.6) => Math.min(n - 1, Math.floor(n * Math.pow(rand(), power)));
const uuid = () => crypto.randomUUID();
const jitter = (centre: number, spread = 0.02) => Number((centre + (rand() - 0.5) * 2 * spread).toFixed(6));
const phone = (kind: 0 | 1 | 2 | 3, i: number) => `+923${kind}${pad(i, 8)}`;
const email = (kind: string, i: number) => `load.${kind}.${i}@${LOAD_EMAIL_DOMAIN}`;

/** Straight-line kilometres between two pins. */
function kmBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = Math.PI / 180;
  const h = Math.sin(((b.lat - a.lat) * rad) / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(((b.lng - a.lng) * rad) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

async function insert<T>(label: string, rows: T[], write: (batch: T[]) => Promise<unknown>, batchSize = 2000) {
  for (let i = 0; i < rows.length; i += batchSize) await write(rows.slice(i, i + batchSize));
  console.log(`  ${label}: ${rows.length}`);
}

async function guard() {
  const name = databaseName(process.env.DATABASE_URL);
  if (!name || !name.endsWith('_load')) {
    console.error(`Refusing to run: the database is "${name ?? 'unknown'}", and this script only fills a database whose name ends in _load.`);
    process.exit(2);
  }
  const others = await prisma.user.count({ where: { NOT: { email: { endsWith: `@${LOAD_EMAIL_DOMAIN}` } } } });
  if (others > 0) {
    console.error(`Refusing to run: ${name} holds ${others} accounts that are not load-test accounts. Use an empty database.`);
    process.exit(2);
  }
  if ((await prisma.user.count({ where: { email: { endsWith: `@${LOAD_EMAIL_DOMAIN}` } } })) > 0) {
    console.error(`Refusing to run: ${name} has already been seeded. Drop and recreate it to start again.`);
    process.exit(2);
  }
}

async function main() {
  await guard();
  const started = Date.now();
  const K = size('KITCHENS', 2000);
  const P = size('PRODUCTS', 10000);
  const C = size('CUSTOMERS', 5000);
  const R = size('RIDERS', 300);
  const O = size('ORDERS', 50000);
  const OPEN = Math.min(size('OPEN_JOBS', 400), O);
  const RUNNING = Math.min(Math.floor(R / 2), O - OPEN);
  const AUDIT = size('AUDIT_LOGS', 300000);
  const TICKETS = size('TICKETS', 20000);
  const NOTIFICATIONS_PER_CUSTOMER = Number(process.env.LOAD_NOTIFICATIONS_PER_CUSTOMER ?? 10);
  console.log(`Seeding ${K} kitchens, ${P} dishes, ${C} customers, ${R} riders, ${O} orders (${OPEN} open jobs, ${RUNNING} running), ${AUDIT} audit rows, ${TICKETS} complaints`);

  // Bcrypt at the cost production uses, so sign-in costs what it will cost: one hash for every account.
  const passwordHash = await bcrypt.hash(LOAD_PASSWORD, Number(process.env.BCRYPT_ROUNDS ?? 10));

  await seedCommunities();
  const communities = (await prisma.community.findMany({ where: { isActive: true }, select: { id: true, name: true, city: true, centerLatitude: true, centerLongitude: true } })).map((c) => ({
    id: c.id,
    name: c.name,
    city: c.city,
    lat: Number(c.centerLatitude),
    lng: Number(c.centerLongitude),
  }));
  if (communities.length === 0) throw new Error('No communities after seeding them');

  // ---- people -------------------------------------------------------------------------------
  const now = Date.now();
  const adminId = uuid();
  const kitchenUserIds = Array.from({ length: K }, uuid);
  const customerIds = Array.from({ length: C }, uuid);
  const riderUserIds = Array.from({ length: R }, uuid);
  const user = (id: string, userType: string, em: string, ph: string, extra: Partial<Prisma.UserCreateManyInput> = {}): Prisma.UserCreateManyInput => ({
    id,
    userType,
    email: em,
    phone: ph,
    passwordHash,
    status: 'active',
    emailVerified: true,
    phoneVerified: true,
    createdAt: new Date(now - rand() * 200 * DAY),
    ...extra,
  });
  const users: Prisma.UserCreateManyInput[] = [
    user(adminId, 'admin', email('admin', 1), phone(0, 1), { staffRole: 'super_admin' }),
    ...kitchenUserIds.map((id, i) => user(id, 'seller', email('kitchen', i + 1), phone(1, i + 1))),
    ...customerIds.map((id, i) => user(id, 'customer', email('customer', i + 1), phone(2, i + 1))),
    ...riderUserIds.map((id, i) => user(id, 'rider', email('rider', i + 1), phone(3, i + 1))),
  ];
  await insert('accounts', users, (data) => prisma.user.createMany({ data }));
  const names = (kind: string, ids: string[]) => ids.map((userId, i): Prisma.UserProfileCreateManyInput => ({ userId, fullName: `Load ${kind} ${i + 1}`, city: 'Karachi' }));
  await insert('profiles', [{ userId: adminId, fullName: 'Load admin' }, ...names('kitchen', kitchenUserIds), ...names('customer', customerIds), ...names('rider', riderUserIds)], (data) => prisma.userProfile.createMany({ data }));

  // ---- kitchens and dishes ------------------------------------------------------------------
  const sellerIds = Array.from({ length: K }, uuid);
  const sellerPlace = kitchenUserIds.map(() => pick(communities));
  const sellerPin = sellerPlace.map((place) => ({ lat: jitter(place.lat), lng: jitter(place.lng) }));
  const sellers: Prisma.SellerCreateManyInput[] = kitchenUserIds.map((userId, i) => ({
    id: sellerIds[i],
    userId,
    businessName: `Load Kitchen ${i + 1}`,
    description: 'Home cooking for the load test.',
    verificationStatus: 'approved',
    isVerified: true,
    status: 'active',
    businessType: 'home_kitchen',
    deliveryProvider: 'platform',
    communityId: sellerPlace[i].id,
    latitude: sellerPin[i].lat,
    longitude: sellerPin[i].lng,
    ratingAverage: Number((3.5 + rand() * 1.5).toFixed(2)),
    totalReviews: Math.floor(rand() * 200),
    ratingScore: Number((3.5 + rand() * 1.5).toFixed(3)),
    trendScore: rand(),
    createdAt: new Date(now - rand() * 180 * DAY),
  }));
  await insert('kitchens', sellers, (data) => prisma.seller.createMany({ data }));

  const categoryIds: string[] = [];
  for (let i = 1; i <= 8; i++) {
    const row = await prisma.category.upsert({
      where: { slug: `load-category-${i}` },
      update: {},
      create: { name: `Load category ${i}`, slug: `load-category-${i}`, productType: 'ready_to_eat', sortOrder: i, isActive: true },
    });
    categoryIds.push(row.id);
  }

  const productIds = Array.from({ length: P }, uuid);
  const kitchensWithDishes = Math.min(K, P);
  /** The dishes of each kitchen, for the orders below. */
  const dishesOf: Array<Array<{ id: string; name: string; price: number }>> = Array.from({ length: K }, () => []);
  const products: Prisma.ProductCreateManyInput[] = productIds.map((id, i) => {
    const kitchen = i % kitchensWithDishes;
    const price = Math.round((150 + rand() * 2350) / 10) * 10;
    const name = `Load Dish ${i + 1}`;
    dishesOf[kitchen].push({ id, name, price });
    return {
      id,
      sellerId: sellerIds[kitchen],
      categoryId: pick(categoryIds),
      name,
      slug: `load-dish-${i + 1}`,
      description: 'A dish for the load test.',
      price,
      unit: 'pc',
      productType: 'ready_to_eat',
      stockQuantity: 100_000,
      stockType: 'direct',
      approvalStatus: 'approved',
      isActive: true,
      viewsCount: Math.floor(rand() * 5000),
      totalOrders: Math.floor(rand() * 300),
      ratingAverage: Number((3.5 + rand() * 1.5).toFixed(2)),
      ratingScore: Number((3.5 + rand() * 1.5).toFixed(3)),
      trendScore: rand(),
      createdAt: new Date(now - rand() * 180 * DAY),
    };
  });
  await insert('dishes', products, (data) => prisma.product.createMany({ data }), 1500);
  const images: Prisma.ProductImageCreateManyInput[] = productIds.flatMap((productId, i) => [
    { productId, imageUrl: `/media/load/dish-${i % 60}-a.jpg`, isPrimary: true, sortOrder: 0 },
    { productId, imageUrl: `/media/load/dish-${i % 60}-b.jpg`, isPrimary: false, sortOrder: 1 },
  ]);
  await insert('dish photos', images, (data) => prisma.productImage.createMany({ data }), 4000);

  // ---- customers' addresses, riders ----------------------------------------------------------
  const addressIds = Array.from({ length: C }, uuid);
  const customerPlace = customerIds.map(() => pick(communities));
  const customerPin = customerPlace.map((place) => ({ lat: jitter(place.lat), lng: jitter(place.lng) }));
  const addresses: Prisma.UserAddressCreateManyInput[] = customerIds.map((userId, i) => ({
    id: addressIds[i],
    userId,
    label: 'Home',
    addressLine1: `House ${1 + Math.floor(rand() * 400)}, Street ${1 + Math.floor(rand() * 40)}`,
    area: customerPlace[i].name,
    city: customerPlace[i].city,
    communityId: customerPlace[i].id,
    latitude: customerPin[i].lat,
    longitude: customerPin[i].lng,
    isDefault: true,
  }));
  await insert('addresses', addresses, (data) => prisma.userAddress.createMany({ data }));

  const riderIds = Array.from({ length: R }, uuid);
  const riders: Prisma.RiderCreateManyInput[] = riderUserIds.map((userId, i) => ({
    id: riderIds[i],
    userId,
    city: 'Karachi',
    vehicleType: 'motorcycle',
    vehicleNumber: `LD-${pad(i + 1, 5)}`,
    verificationStatus: 'approved',
    status: 'active',
    isAvailable: true,
    communityId: pick(communities).id,
  }));
  await insert('riders', riders, (data) => prisma.rider.createMany({ data }));

  // ---- orders, their lines, history and delivery jobs ----------------------------------------
  // Nuray riders deliver up to 20 km from the kitchen, so an order is placed with one of the kitchens near the customer.
  const nearCache = new Map<number, number[]>();
  const nearestKitchens = (customer: number): number[] => {
    let near = nearCache.get(customer);
    if (!near) {
      near = Array.from({ length: kitchensWithDishes }, (_, k) => ({ k, km: kmBetween(customerPin[customer], sellerPin[k]) }))
        .sort((a, b) => a.km - b.km)
        .slice(0, 8)
        .map((n) => n.k);
      nearCache.set(customer, near);
    }
    return near;
  };
  const orders: Prisma.OrderCreateManyInput[] = [];
  const lines: Prisma.OrderItemCreateManyInput[] = [];
  const history: Prisma.OrderStatusHistoryCreateManyInput[] = [];
  const deliveries: Prisma.DeliveryCreateManyInput[] = [];
  const openJobs: Fixture['openJobs'] = [];
  const runningRider = new Map<number, string>(); // rider index -> delivery id
  let nextRunning = 0;

  for (let i = 0; i < O; i++) {
    const kind = i < OPEN ? 'open' : i < OPEN + RUNNING ? 'running' : 'history';
    const c = skewed(C);
    const k = pick(nearestKitchens(c));
    const dishes = dishesOf[k];
    const home = kind !== 'history' || rand() < 0.85;
    const count = Math.min(dishes.length, 1 + Math.floor(rand() * 3));
    const start = Math.floor(rand() * dishes.length);
    const chosen = Array.from({ length: count }, (_, n) => dishes[(start + n) % dishes.length]);

    const orderId = uuid();
    const created = new Date(kind === 'history' ? now - (1 + rand() * 120) * DAY : now - rand() * 40 * 60_000);
    const cancelled = kind === 'history' && rand() < 0.07;
    const status = kind === 'open' ? 'ready' : kind === 'running' ? 'dispatched' : cancelled ? 'cancelled' : 'delivered';
    const method = kind === 'history' ? (rand() < 0.7 ? 'cod' : rand() < 0.67 ? 'safepay' : 'wallet') : 'cod';
    const payment = status === 'delivered' ? 'paid' : cancelled && method !== 'cod' ? 'refunded' : 'pending';
    const quantities = chosen.map(() => 1 + Math.floor(rand() * 3));
    const subtotal = chosen.reduce((sum, d, n) => sum + d.price * quantities[n], 0);
    const fee = home ? pick([100, 120, 150, 200]) : 0;
    const handoverCode = kind === 'open' ? '4821' : pad(Math.floor(rand() * 10000), 4);
    const place = customerPlace[c];
    const snapshot = { addressLine1: addresses[c].addressLine1, area: place.name, city: place.city, latitude: customerPin[c].lat, longitude: customerPin[c].lng };

    orders.push({
      id: orderId,
      orderNumber: `LD${pad(i + 1, 8)}`,
      customerId: customerIds[c],
      subtotal,
      deliveryFee: fee,
      totalAmount: subtotal + fee,
      paymentMethod: method,
      paymentStatus: payment,
      deliveryType: home ? 'home_delivery' : 'self_pickup',
      deliveryProvider: home ? 'platform' : null,
      handoverCode,
      deliveryAddressId: home ? addressIds[c] : null,
      deliveryAddressSnapshot: home ? snapshot : Prisma.JsonNull,
      orderStatus: status,
      deliveredAt: status === 'delivered' ? new Date(created.getTime() + 60 * 60_000) : null,
      createdAt: created,
    });
    chosen.forEach((d, n) => {
      const total = d.price * quantities[n];
      lines.push({
        orderId,
        productId: d.id,
        sellerId: sellerIds[k],
        productName: d.name,
        quantity: quantities[n],
        unitPrice: d.price,
        totalPrice: total,
        commissionRate: 15,
        commissionAmount: Number((total * 0.15).toFixed(2)),
        sellerPayout: Number((total * 0.85).toFixed(2)),
        status,
        fulfillmentType: 'direct',
        createdAt: created,
      });
    });
    history.push({ orderId, status: 'pending', createdAt: created });
    history.push({ orderId, status, createdAt: new Date(created.getTime() + 45 * 60_000) });

    if (home && status !== 'cancelled') {
      const deliveryId = uuid();
      const rider = kind === 'history' ? skewed(R, 1.5) : kind === 'running' ? nextRunning++ : -1;
      deliveries.push({
        id: deliveryId,
        orderId,
        riderId: rider >= 0 ? riderIds[rider] : null,
        status: kind === 'open' ? 'pending' : kind === 'running' ? 'in_transit' : 'delivered',
        assignmentMode: rider >= 0 ? 'auto' : null,
        riderFee: rider >= 0 ? 120 : null,
        pickupAddress: `Load Kitchen ${k + 1}, ${sellerPlace[k].name}`,
        pickupLatitude: sellerPin[k].lat,
        pickupLongitude: sellerPin[k].lng,
        deliveryAddress: `${addresses[c].addressLine1}, ${place.name}, ${place.city}`,
        deliveryLatitude: customerPin[c].lat,
        deliveryLongitude: customerPin[c].lng,
        deliveryTime: status === 'delivered' ? new Date(created.getTime() + 60 * 60_000) : null,
        createdAt: created,
      });
      if (kind === 'open') openJobs.push({ deliveryId, orderId, handoverCode });
      if (kind === 'running') runningRider.set(rider, deliveryId);
    }
  }
  await insert('orders', orders, (data) => prisma.order.createMany({ data }), 1500);
  await insert('order lines', lines, (data) => prisma.orderItem.createMany({ data }), 1800);
  await insert('order history', history, (data) => prisma.orderStatusHistory.createMany({ data }), 4000);
  await insert('delivery jobs', deliveries, (data) => prisma.delivery.createMany({ data }), 1500);

  // ---- notifications, complaints, audit rows -------------------------------------------------
  const notifications: Prisma.NotificationCreateManyInput[] = customerIds.flatMap((userId) =>
    Array.from({ length: NOTIFICATIONS_PER_CUSTOMER }, (_, n) => ({
      userId,
      type: 'order',
      title: 'Order update',
      message: `Your order status changed (${n + 1}).`,
      isRead: rand() < 0.5,
      createdAt: new Date(now - rand() * 90 * DAY),
    }))
  );
  await insert('notifications', notifications, (data) => prisma.notification.createMany({ data }), 4000);
  const tickets: Prisma.SupportTicketCreateManyInput[] = Array.from({ length: TICKETS }, (_, i) => {
    const resolved = rand() < 0.6;
    return {
      ticketNumber: `LD-T-${pad(i + 1, 7)}`,
      userId: customerIds[skewed(C)],
      orderId: rand() < 0.7 ? orders[Math.floor(rand() * orders.length)].id : null,
      category: pick(['order', 'payment', 'delivery', 'account']),
      subject: 'A problem with an order',
      description: 'Written for the load test.',
      priority: pick(['low', 'medium', 'high']),
      status: resolved ? 'resolved' : pick(['open', 'in_progress']),
      createdAt: new Date(now - rand() * 120 * DAY),
    };
  });
  await insert('complaints', tickets, (data) => prisma.supportTicket.createMany({ data }), 2500);

  // Audit rows are the biggest table: generated by the database itself.
  const orderSample = orders.slice(0, Math.min(5000, orders.length)).map((o) => o.id as string);
  await prisma.$executeRaw`
    INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, ip_address, response_status, created_at)
    SELECT gen_random_uuid(), ${adminId}, (ARRAY['order:update','seller:approve','product:update','auth:LOGIN','rider:status'])[1 + floor(random() * 5)::int],
           'order', (${orderSample}::text[])[1 + floor(random() * ${orderSample.length})::int], '10.0.0.1', 200,
           now() - (random() * interval '180 days')
    FROM generate_series(1, ${AUDIT})`;
  console.log(`  audit rows: ${AUDIT}`);

  await prisma.$executeRawUnsafe('ANALYZE');

  // ---- what the runner needs to know -----------------------------------------------------------
  const sampleProducts = Array.from({ length: Math.min(P, 3000) }, () => Math.floor(rand() * P));
  // The fixture's customers order from a kitchen near them, and each fixture kitchen knows its nearest customers.
  const fixtureCustomers = Math.min(C, 3000);
  const fixtureKitchens = Math.min(K, 500);
  const nearbyCustomers = (k: number) =>
    Array.from({ length: fixtureCustomers }, (_, i) => ({ i, km: kmBetween(customerPin[i], sellerPin[k]) }))
      .filter((n) => n.km <= 15)
      .sort((a, b) => a.km - b.km)
      .slice(0, 10)
      .map((n) => email('customer', n.i + 1));
  const fixture: Fixture = {
    createdAt: new Date().toISOString(),
    password: LOAD_PASSWORD,
    admin: { email: email('admin', 1), phone: phone(0, 1), userId: adminId },
    productIds: sampleProducts.map((i) => productIds[i]),
    productSlugs: sampleProducts.map((i) => `load-dish-${i + 1}`),
    sellerIds: sellerIds.slice(0, Math.min(K, 1000)),
    categoryIds,
    communityIds: communities.map((c) => c.id),
    customers: customerIds.slice(0, fixtureCustomers).map((userId, i) => {
      const kitchen = pick(nearestKitchens(i));
      return { email: email('customer', i + 1), phone: phone(2, i + 1), userId, addressId: addressIds[i], sellerProductIds: dishesOf[kitchen].slice(0, 3).map((d) => d.id) };
    }),
    riders: riderUserIds.map((userId, i) => ({ email: email('rider', i + 1), phone: phone(3, i + 1), userId, riderId: riderIds[i], activeDeliveryId: runningRider.get(i) ?? null })),
    kitchens: kitchenUserIds.slice(0, fixtureKitchens).map((userId, i) => ({ email: email('kitchen', i + 1), phone: phone(1, i + 1), userId, sellerId: sellerIds[i], productIds: dishesOf[i].slice(0, 3).map((d) => d.id), nearbyCustomers: nearbyCustomers(i) })),
    openJobs,
  };
  writeJson(FIXTURE_FILE, fixture);
  console.log(`Done in ${((Date.now() - started) / 1000).toFixed(0)} s. Fixture: ${FIXTURE_FILE}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
