/**
 * What the outside is told about where kitchens and customers are: the public product cards and
 * kitchen pages, the rider's open pool and finished jobs, and the kitchen's view of an order. Each
 * check first puts the private value into the data (a pin, a street, a postcode, a fee table), so a
 * leak would show.
 */
import { acceptOrder, call, claimJob, deepKeys, deliver, makeKitchen, makeProduct, makeRider, ok, placeHomeOrder, prisma, unique } from './lib';

/** Anything on a rider's job that points at the customer's door: the pin, the map link, the customer, the door details. */
const hasDoor = (job: any) => job.deliveryLatitude != null || job.deliveryLongitude != null || job.dropoffMapsUrl != null || job.customer != null || job.dropoffDetails != null;

export default async function privacy() {
  const u = unique();

  // 1. a public product card says nothing about where the kitchen is or how it prices, yet carries what the page reads
  const community = await prisma.community.create({
    data: {
      name: `Check Community ${u}`,
      slug: `check-community-${u}`,
      city: 'Checkville',
      centerLatitude: Number((-45 - Math.random() * 5).toFixed(6)),
      centerLongitude: Number((-150 - Math.random() * 5).toFixed(6)),
      radiusKm: 1,
    },
  });
  const kitchen = await makeKitchen({ communityId: community.id });
  const dish = await makeProduct(kitchen.sellerId);
  await prisma.seller.update({
    where: { id: kitchen.sellerId },
    data: {
      latitude: 24.86123457,
      longitude: 67.12345679,
      deliveryFeeType: 'distance',
      deliveryFeeFixed: 227,
      deliveryFeeBase: 173,
      deliveryFeePerKm: 11.37,
      distancePricingTiers: [{ maxKm: 3.17, fee: 191 }],
      maxDeliveryDistanceKm: 41.5,
      freeDeliveryRadiusKm: 2.5,
      freeDeliveryAreas: [`Free-${u}`],
      allowedPostalCodes: [`PC-${u}`],
      deliveryZones: [{ name: `Zone-${u}`, cities: ['Karachi'], areas: [`Area-${u}`], fee: 211 }],
    },
  });
  await prisma.sellerCommunityDelivery.create({ data: { sellerId: kitchen.sellerId, communityId: community.id, fee: 163 } });
  const { name } = await prisma.product.findUniqueOrThrow({ where: { id: dish }, select: { name: true } });
  const { businessName } = await prisma.seller.findUniqueOrThrow({ where: { id: kitchen.sellerId }, select: { businessName: true } });
  const secrets = ['24.86123457', '67.12345679', `Free-${u}`, `PC-${u}`, `Zone-${u}`, `Area-${u}`];
  const privateKeys = [
    'latitude', 'longitude', 'deliveryFeeType', 'deliveryFeeFixed', 'deliveryFeeBase', 'deliveryFeePerKm', 'distancePricingTiers',
    'maxDeliveryDistanceKm', 'freeDeliveryRadiusKm', 'freeDeliveryAreas', 'allowedPostalCodes', 'deliveryZones', 'communityDeliveries',
  ];
  const profile = (await kitchen.owner.as('GET', '/sellers/me')).body;
  const missing = secrets.filter((s) => !JSON.stringify(profile).includes(s));
  ok('the kitchen\'s own profile shows all of those values and keys (so a card without them means something)', missing.length === 0 && deepKeys(profile).has('latitude'), missing.join(','));

  for (const [label, where] of [['', ''], [' (with the shopper\'s location)', '&customerLat=24.8607&customerLng=67.0011']]) {
    const listing = await call(null, 'GET', `/products?search=${encodeURIComponent(name)}&limit=50${where}`);
    const cards: any[] = listing.body.data?.products ?? [];
    const card = cards.find((p) => p.id === dish) ?? {};
    ok(`the public listing finds the dish${label}`, listing.status === 200 && card.id === dish, listing.code);
    const sellerKeys = deepKeys(cards.map((p) => p.seller));
    const leakedKeys = privateKeys.filter((k) => sellerKeys.has(k));
    ok(`no kitchen coordinates or pricing internals on any product card${label}`, leakedKeys.length === 0, leakedKeys.join(','));
    const leakedValues = secrets.filter((s) => JSON.stringify(card).includes(s));
    ok(`and none of the values stored for this kitchen anywhere in its card${label}`, card.id === dish && leakedValues.length === 0, leakedValues.join(','));
    const seller = card.seller ?? {};
    const carries = seller.businessName === businessName && seller.communityId === community.id && seller.community?.name === community.name && typeof seller.availability?.isOpen === 'boolean' && 'delivery' in card;
    ok(`cards still carry what the page reads: kitchen name, community, availability, delivery${label}`, carries, Object.keys(seller).join(','));
    if (where) ok('and with a location the delivery fee and distance are worked out by the API', typeof card.delivery?.fee === 'number' && typeof card.delivery.distanceKm === 'number', card.delivery);
  }

  // 2. the public kitchen list and page have no e-mail or phone
  const publicList = await call(null, 'GET', `/sellers?search=${encodeURIComponent(businessName)}&limit=50`);
  const publicPage = await call(null, 'GET', `/sellers/${kitchen.sellerId}`);
  const publicText = JSON.stringify([publicList.body, publicPage.body]);
  const publicKeys = deepKeys([publicList.body, publicPage.body]);
  ok('the public kitchen list and page show the kitchen', (publicList.body.data ?? []).some((s: any) => s.id === kitchen.sellerId) && publicPage.body.data?.id === kitchen.sellerId, `${publicList.status} ${publicPage.status}`);
  const account = JSON.stringify((await kitchen.owner.as('GET', '/auth/me')).body);
  ok('the owner\'s own account shows both (so the e-mail and phone searched for are the ones the API prints)', account.includes(kitchen.owner.email) && account.includes(kitchen.owner.phone));
  const leakedContact = [kitchen.owner.email, kitchen.owner.phone].filter((s) => publicText.includes(s));
  ok('but the public pages carry neither its owner\'s e-mail nor phone', !publicKeys.has('email') && !publicKeys.has('phone') && leakedContact.length === 0, leakedContact.join(','));

  // 3. the open pool: an unclaimed job shows the area and city only, with a fee to judge it by
  const makeJob = async (tag: string) => {
    const placed = await placeHomeOrder({
      address: { addressLine1: `Plot ${tag}${u}, Lane 4`, addressLine2: `Flat ${tag}${u}`, area: `Area ${tag}${u}`, city: 'Karachi', landmark: `Near mosque ${tag}${u}`, postalCode: `PC${tag}${u}` },
    });
    // The kitchen's location is copied onto the job when the kitchen accepts, so the job has both ends and a distance.
    await prisma.seller.update({ where: { id: placed.kitchen.sellerId }, data: { latitude: 24.8607, longitude: 67.0011 } });
    return { ...placed, deliveryId: (await acceptOrder(placed))! };
  };
  const first = await makeJob('A');
  const second = await makeJob('B');
  const areaOfFirst = `Area A${u}, Karachi`;
  // The pool lists the 100 oldest open jobs and other suites leave theirs in it: make this one the oldest so it is listed.
  await prisma.delivery.update({ where: { id: first.deliveryId }, data: { createdAt: new Date(Math.floor(Math.random() * 1e9)) } });
  const rider = await makeRider();
  const pool = await rider.as('GET', '/riders/deliveries/available');
  const listed = (pool.body.data ?? []).find((d: any) => d.orderId === first.orderId);
  const job = listed ?? {};
  const stored = await prisma.delivery.findUniqueOrThrow({ where: { id: first.deliveryId }, select: { deliveryLatitude: true, deliveryLongitude: true, deliveryAddress: true } });
  ok('the open pool lists the new job', pool.status === 200 && !!listed, `${pool.status} ${(pool.body.data ?? []).length} jobs`);
  ok('which really holds the customer\'s pin and street (so there is something to hide)', stored.deliveryLatitude != null && stored.deliveryLongitude != null && stored.deliveryAddress.includes(`Plot A${u}`));
  ok('an unclaimed job shows no drop-off pin, door link, customer or door details', !!listed && !hasDoor(job), { lat: job.deliveryLatitude, url: job.dropoffMapsUrl });
  const street = [`Plot A${u}`, `Flat A${u}`, `Near mosque A${u}`].filter((s) => JSON.stringify(job).includes(s));
  ok('only the area and city of the drop-off are shown, none of the street, flat or landmark', job.deliveryAddress === areaOfFirst && street.length === 0, job.deliveryAddress);
  ok('but there is a fee and a distance to judge it by', typeof job.standardFee === 'number' && job.standardFee > 0 && job.distanceKm > 0, { fee: job.standardFee, km: job.distanceKm });

  // 4. the rider's history: a delivered job keeps the area only, a running one the door
  const claims = [await claimJob(rider, first.deliveryId), await claimJob(rider, second.deliveryId)];
  ok('the rider takes both jobs', claims.every((c) => c.status === 200), claims.map((c) => c.code).join(','));
  await deliver(first, rider, first.deliveryId);
  const history: any[] = (await rider.as('GET', '/riders/deliveries/mine')).body.data ?? [];
  const done = history.find((d) => d.orderId === first.orderId) ?? {};
  const running = history.find((d) => d.orderId === second.orderId) ?? {};
  ok('a delivered job shows no pin, door link, customer or door details, only the area and city', done.status === 'delivered' && !hasDoor(done) && done.deliveryAddress === areaOfFirst, { status: done.status, address: done.deliveryAddress, lat: done.deliveryLatitude });
  ok('a running job still shows the door: pin, link, street and customer', running.status === 'assigned' && running.deliveryLatitude != null && !!running.dropoffMapsUrl && String(running.deliveryAddress).includes(`Plot B${u}`) && !!running.customer, { status: running.status, lat: running.deliveryLatitude });
  const finished = await rider.as('GET', `/orders/${first.orderId}`);
  const finishedJob = finished.body.data?.delivery ?? {};
  ok('the rider\'s order view of the finished job hides the door in the delivery row too', finished.status === 200 && finishedJob.deliveryLatitude == null && finishedJob.deliveryAddress === areaOfFirst, finishedJob.deliveryAddress);
  const shown = [`Plot A${u}`, `Flat A${u}`, `Near mosque A${u}`, `PCA${u}`, 'Ring twice', '24.8015', '67.0655'].filter((s) => JSON.stringify(finished.body).includes(s));
  ok('and in the order itself: no street, flat, landmark, postcode, pin or instructions', shown.length === 0, shown.join(' | '));
  const runningOrder = await rider.as('GET', `/orders/${second.orderId}`);
  ok('while the running job\'s order still has the door', runningOrder.body.data?.delivery?.deliveryLatitude != null && runningOrder.body.data.deliveryAddress?.addressLine1 === `Plot B${u}, Lane 4`, runningOrder.code);

  // 5. the kitchen's order view: an address row with no owner id, pin or postcode
  const addressKeys = ['userId', 'latitude', 'longitude', 'postalCode'];
  const own = await second.customer.as('GET', `/orders/${second.orderId}`);
  ok('the customer\'s own order has all of those in its address row (so the kitchen not having them means something)', addressKeys.every((k) => k in (own.body.data?.deliveryAddress ?? {})), Object.keys(own.body.data?.deliveryAddress ?? {}).join(','));
  const view = await second.kitchen.owner.as('GET', `/seller/orders/${second.orderId}`);
  const address = view.body.data?.deliveryAddress ?? {};
  const leaks = [...addressKeys.filter((k) => k in address), ...[second.customer.id, `PCB${u}`, '24.8015', '67.0655'].filter((s) => JSON.stringify(view.body).includes(s))];
  ok('the kitchen\'s order view has the street but no owner id, pin or postcode anywhere in it', view.status === 200 && address.addressLine1 === `Plot B${u}, Lane 4` && leaks.length === 0, leaks.join(' | ') || view.code);
}
