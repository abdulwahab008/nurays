/**
 * Bad input as the outside sees it: paging values and repeated query keys that used to crash a list,
 * a request with no body or the wrong type in it, over-long text and oversized bodies, malformed
 * opening hours, a hot-linked cover photo, a category update that tries to write to its relations,
 * and bad order bodies. The answer must be a clean 4xx and nothing may be stored.
 */
import { call, makeKitchen, makeProduct, makeRider, makeUser, ok, placeHomeOrder, prisma, unique } from './lib';

export default async function validation() {
  const u = unique();
  const customer = await makeUser('customer');
  const admin = await makeUser('admin');
  const rider = await makeRider();
  const kitchen = await makeKitchen();
  const dish = await makeProduct(kitchen.sellerId);
  const dishName = (await prisma.product.findUniqueOrThrow({ where: { id: dish }, select: { name: true } })).name;

  // 1. bad paging values and repeated query keys never make a list answer 500
  const lists: Array<[token: string | null, path: string]> = [
    [customer.access, '/notifications?page=-1'],
    [customer.access, '/orders/me?page=-1'],
    [admin.access, '/admin/sellers?page=-1'],
    [admin.access, '/admin/orders?page=-1'],
    [null, '/sellers?limit=abc'],
    [customer.access, '/notifications?limit=-5'],
    [null, '/promotions/catalog?productIds=a&productIds=b'],
    [null, '/hubs?city=a&city=b'],
    [admin.access, '/admin/sellers?status=a&status=b'],
    [admin.access, '/admin/support/tickets?status=a&status=b'],
    [customer.access, '/cart/delivery-estimate?addressId=a&addressId=b'],
  ];
  for (const [token, path] of lists) {
    const r = await call(token, 'GET', path);
    ok(`GET ${path} answers 200 or 400, not a server error`, r.status === 200 || r.status === 400, r.code);
  }
  const paged = await customer.as('GET', '/notifications?page=-1&limit=-5');
  const pagination = paged.body.data?.pagination;
  ok('a negative page and page size fall back to the first page', paged.status === 200 && pagination?.page === 1 && pagination.limit >= 1, pagination);

  // 2. community detection by GET works and rejects junk. The database may hold no community at all, so make one,
  // far from where the other suites put addresses; it is the nearest to a point at its own centre.
  const lat = Number((-45 - Math.random() * 5).toFixed(6));
  const lng = Number((-150 - Math.random() * 5).toFixed(6));
  const community = await prisma.community.create({ data: { name: `Check Community ${u}`, slug: `check-community-${u}`, city: 'Checkville', centerLatitude: lat, centerLongitude: lng, radiusKm: 1 } });
  const detected = await call(null, 'GET', `/communities/detect?lat=${lat}&lng=${lng}`);
  ok('GET /communities/detect finds the community nearest to the point', detected.status === 200 && detected.body.data?.community?.id === community.id && detected.body.data.isInsideRadius === true, detected.code);
  const karachi = await call(null, 'GET', '/communities/detect?lat=24.86&lng=67.01');
  ok('and answers 200 for a point in Karachi', karachi.status === 200 && !!karachi.body.data?.community?.id, karachi.code);
  const junk = await call(null, 'GET', '/communities/detect?lat=x');
  ok('GET /communities/detect with junk is a 400', junk.status === 400, junk.code);

  // 3. a request with no body does not crash the routes that read one
  const noBody: Array<[token: string | null, method: string, path: string, emptyJson: number[], nothing: number[]]> = [
    [rider.access, 'PATCH', '/riders/duty-status', [200], [400]],
    [customer.access, 'POST', '/communities/me/primary', [400], [400]],
    [null, 'POST', '/auth/google', [400, 401], [400, 401]],
  ];
  for (const [token, method, path, emptyJson, nothing] of noBody) {
    const empty = await call(token, method, path, undefined, { raw: '' });
    ok(`${method} ${path} with an empty JSON body answers ${emptyJson.join(' or ')}`, emptyJson.includes(empty.status), empty.code);
    const bare = await call(token, method, path);
    ok(`${method} ${path} with no body at all answers ${nothing.join(' or ')}`, nothing.includes(bare.status), bare.code);
  }
  await rider.as('PATCH', '/riders/duty-status', { isAvailable: true }); // the empty body above toggled duty

  // 4. the wrong type is refused with 400
  const duty = await rider.as('PATCH', '/riders/duty-status', { isAvailable: 'yes' });
  ok('a duty status that is not true or false is refused', duty.status === 400 && duty.code === 'VALIDATION_ERROR', duty.code);
  const objectId = await customer.as('POST', '/communities/me/primary', { communityId: { contains: 'a' } });
  ok('an object where a community id is expected is refused', objectId.status === 400, objectId.code);
  const realId = await customer.as('POST', '/communities/me/primary', { communityId: community.id });
  ok('while the community id itself is accepted', realId.status === 200, realId.code);

  // 5. free text has a length limit and a request body has a size limit
  const longCity = await customer.as('PATCH', '/users/me', { city: 'C'.repeat(200_000) });
  ok('a 200 KB city is refused with 400 on the city field', longCity.status === 400 && longCity.body.error?.details?.[0]?.field === 'city', longCity.code);
  const limitCity = await customer.as('PATCH', '/users/me', { city: 'C'.repeat(100) });
  ok('while a city at the limit is accepted', limitCity.status === 200, limitCity.code);
  const huge = await customer.as('PATCH', '/users/me', undefined, { raw: JSON.stringify({ city: 'C'.repeat(2 * 1024 * 1024) }) });
  ok('a 2 MB JSON body is refused with 413', huge.status === 413, huge.status);

  // 6. the kitchen's opening hours and cover photo
  const stored = () => prisma.seller.findUniqueOrThrow({ where: { id: kitchen.sellerId }, select: { scheduleMode: true, operatingHours: true, coverImageUrl: true } });
  const malformed = [{ fixedDaily: { open: 1, close: 2 } }, { fixedDaily: { open: '25:00', close: '22:00' } }, { weekly: { monday: { closed: false } } }];
  for (const operatingHours of malformed) {
    const r = await kitchen.owner.as('PATCH', '/sellers/me', { scheduleMode: 'fixed_daily', operatingHours });
    ok(`malformed operating hours ${JSON.stringify(operatingHours)} are refused with 400`, r.status === 400, r.code);
  }
  const untouched = await stored();
  ok('and none of them was stored', untouched.scheduleMode === '24_7' && untouched.operatingHours === null, untouched);
  const good = await kitchen.owner.as('PATCH', '/sellers/me', { scheduleMode: 'fixed_daily', operatingHours: { fixedDaily: { open: '10:00', close: '22:00' } } });
  const saved = await stored();
  ok('well-formed operating hours are accepted and stored', good.status === 200 && saved.scheduleMode === 'fixed_daily' && JSON.stringify(saved.operatingHours) === '{"fixedDaily":{"open":"10:00","close":"22:00"}}', good.code);
  const listing = await call(null, 'GET', `/products?search=${encodeURIComponent(dishName)}&limit=50`);
  const card = (listing.body.data?.products ?? []).find((p: any) => p.id === dish);
  ok('the public listing still renders that kitchen (its availability never throws)', listing.status === 200 && card?.seller?.scheduleMode === 'fixed_daily' && typeof card.seller.availability?.isOpen === 'boolean', listing.code);
  const hot = await kitchen.owner.as('PATCH', '/sellers/me', { coverImageUrl: 'https://evil.example/p.png' });
  ok('a hot-linked cover photo is refused (INVALID_IMAGE) and not stored', hot.status === 400 && hot.code === 'INVALID_IMAGE' && (await stored()).coverImageUrl === null, hot.code);

  // 6b. a kitchen's profile choices are the ones the screens offer (and a null no column can hold is a 400, not a 500)
  const choices = () => prisma.seller.findUniqueOrThrow({ where: { id: kitchen.sellerId }, select: { businessType: true, deliveryModes: true, availabilityOverride: true, orderCutoffTime: true } });
  const choicesBefore = await choices();
  const refusedChoices: Array<[string, Record<string, unknown>]> = [
    ['a business type the app does not offer', { businessType: 'palace' }],
    ['a null business type (the column cannot hold one)', { businessType: null }],
    ['a delivery mode the app does not offer', { deliveryModes: ['teleport'] }],
    ['null delivery modes (the column cannot hold them)', { deliveryModes: null }],
    ['an availability override the app does not know', { availabilityOverride: 'party' }],
    ['a cut-off time that is not HH:MM', { orderCutoffTime: 'soon' }],
    ['a cut-off time past 23:59', { orderCutoffTime: '25:00' }],
  ];
  for (const [what, body] of refusedChoices) {
    const r = await kitchen.owner.as('PATCH', '/sellers/me', body);
    ok(`${what} is refused with 400`, r.status === 400 && r.code === 'VALIDATION_ERROR', `${r.status} ${r.code}`);
  }
  ok('and none of them was stored', JSON.stringify(await choices()) === JSON.stringify(choicesBefore), JSON.stringify(await choices()));
  const offered = await kitchen.owner.as('PATCH', '/sellers/me', { businessType: 'bakery', deliveryModes: ['delivery', 'pickup', 'dine_in'], availabilityOverride: 'holiday', orderCutoffTime: '21:30' });
  const offeredStored = await choices();
  ok('the values the app offers are accepted and stored', offered.status === 200 && offeredStored.businessType === 'bakery' && offeredStored.deliveryModes.join() === 'delivery,pickup,dine_in' && offeredStored.availabilityOverride === 'holiday' && offeredStored.orderCutoffTime === '21:30', `${offered.status} ${JSON.stringify(offeredStored)}`);
  const cleared = await kitchen.owner.as('PATCH', '/sellers/me', { availabilityOverride: null, orderCutoffTime: null });
  const clearedStored = await choices();
  ok('and an override and a cut-off can be cleared with null', cleared.status === 200 && clearedStored.availabilityOverride === null && clearedStored.orderCutoffTime === null, `${cleared.status} ${JSON.stringify(clearedStored)}`);
  const styles = await kitchen.owner.as('PATCH', '/sellers/me', { mealCategories: ['Biryani', 'lunch'] });
  ok('meal categories stay free text (sign-up sends dish styles, the settings page meal times)', styles.status === 200, `${styles.status} ${styles.code}`);

  // 7. a category update cannot carry relation writes
  const category = await prisma.category.create({ data: { name: `Check Category ${u}`, slug: `check-category-${u}` } });
  await prisma.product.update({ where: { id: dish }, data: { categoryId: category.id } });
  const edited = await admin.as('PATCH', `/categories/${category.id}`, { sortOrder: 7, products: { deleteMany: {} } });
  const after = await prisma.category.findUniqueOrThrow({ where: { id: category.id }, select: { sortOrder: true, _count: { select: { products: true } } } });
  const outcome = { status: edited.status, sortOrder: after.sortOrder, products: after._count.products };
  ok('a category update applies its own fields but ignores a relation write in the body', outcome.status === 200 && outcome.sortOrder === 7 && outcome.products === 1, outcome);

  // 8. order bodies
  const placed = await placeHomeOrder();
  const path = `/orders/${placed.orderId}`;
  const emptyMessage = await placed.customer.as('POST', `${path}/messages`, undefined, { raw: '' });
  ok('an order message with an empty body is a 400', emptyMessage.status === 400, emptyMessage.code);
  const noMessage = await placed.customer.as('POST', `${path}/messages`);
  ok('and so is one with no body at all', noMessage.status === 400, noMessage.code);
  const longRef = await placed.customer.as('POST', `${path}/submit-payment`, { referenceNumber: 'x'.repeat(500) });
  ok('an over-long payment reference is refused as a validation error on that field', longRef.status === 400 && longRef.code === 'VALIDATION_ERROR' && longRef.body.error?.details?.[0]?.field === 'referenceNumber', longRef.code);
  const okRef = await placed.customer.as('POST', `${path}/submit-payment`, { referenceNumber: 'x'.repeat(100) });
  ok('while a reference at the limit passes that rule (this cash order is refused for another reason)', okRef.code !== 'VALIDATION_ERROR', okRef.code);

  // 8. a page number too large for the database is an empty page or a client error, never a server error
  const hugePage = '99999999999999999999';
  const deepPages: Array<[token: string, path: string]> = [
    [admin.access, '/admin/refunds'],
    [admin.access, '/admin/audit-logs'],
    [admin.access, '/admin/sellers'],
    [admin.access, '/admin/users'],
    [admin.access, '/admin/products'],
    [admin.access, '/admin/payouts'],
    [admin.access, '/admin/support/tickets'],
    [admin.access, '/admin/riders/money'],
    [customer.access, '/notifications'],
    [customer.access, '/payments/wallet/transactions'],
    [rider.access, '/riders/me/earnings'],
    [kitchen.owner.access, '/seller/orders'],
  ];
  for (const [token, path] of deepPages) {
    const r = await call(token, 'GET', `${path}?page=${hugePage}`);
    ok(`GET ${path}?page=${hugePage} answers 200 or 400, not a server error`, r.status === 200 || r.status === 400, r.code);
  }

  // 9. a date that is not a date is refused
  for (const dateFrom of ['abc', '2026-13-45']) {
    const r = await kitchen.owner.as('GET', `/seller/orders?dateFrom=${dateFrom}`);
    ok(`GET /seller/orders?dateFrom=${dateFrom} is a 400, not a server error`, r.status === 400, r.code);
  }

  // 10. a price filter that is not a finite number is left out or refused, never a server error (this one is public)
  for (const query of ['minPrice=1e999', 'maxPrice=Infinity', 'minPrice=abc&customerLat=1e999']) {
    const r = await call(null, 'GET', `/products?${query}`);
    ok(`GET /products?${query} answers 200 or 400, not a server error`, r.status === 200 || r.status === 400, r.code);
  }

  // 11. numbers the database column cannot hold, and an unreal date, are refused by the kitchen's and the dish's forms
  const tooBig: Array<Record<string, unknown>> = [
    { deliveryFeePerKm: 99999999 }, { minOrderAmountForDelivery: 1e12 }, { freeDeliveryThreshold: 1e12 }, { maxDailyOrders: 3000000000 },
    { minPrepTimeMinutes: 3000000000 }, { advanceBookingMinDays: 3000000000 }, { lowStockThreshold: 3000000000 }, { deliveryFeeFixed: 3000000000 },
    { deliveryFeeBase: 3000000000 }, { availabilityOverrideUntil: 'not a date' },
  ];
  for (const body of tooBig) {
    const r = await kitchen.owner.as('PATCH', '/sellers/me', body);
    ok(`PATCH /sellers/me ${JSON.stringify(body)} is a 400, not a server error`, r.status === 400, r.code);
  }
  const dishBodies: Array<Record<string, unknown>> = [
    { price: 1e12 }, { originalPrice: 1e12 }, { costPrice: 1e12 }, { stockQuantity: 3000000000 }, { shelfLifeHours: 3000000000 }, { preparationTime: 3000000000 },
    { weightGrams: 3000000000 }, { storageDays: 3000000000 }, { minOrderQuantity: 3000000000 }, { maxOrderQuantity: 3000000000 }, { menuType: 'daily', menuDate: '2026-13-45' },
  ];
  for (const body of dishBodies) {
    const r = await kitchen.owner.as('PATCH', `/products/${dish}`, body);
    ok(`PATCH /products/:id ${JSON.stringify(body)} is a 400, not a server error`, r.status === 400, r.code);
  }
  const created = await kitchen.owner.as('POST', '/products', { name: 'Too Dear', price: 1e12, unit: 'plate', stockQuantity: 1, stockType: 'direct' });
  ok('POST /products with a price of a trillion is a 400, not a server error', created.status === 400, created.code);
  const dishAfter = await prisma.product.findUniqueOrThrow({ where: { id: dish }, select: { price: true, stockQuantity: true } });
  ok("and none of the refused changes was stored", Number(dishAfter.price) === 300 && dishAfter.stockQuantity === 50, dishAfter);
}
