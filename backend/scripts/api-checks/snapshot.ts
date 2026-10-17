/**
 * The door an order goes to is written down when the order is placed (house number, landmark, map pin).
 * The rider reads that copy, not the saved address, so editing the saved address later cannot move an
 * order that is already on its way.
 */
import { Prisma } from '@prisma/client';
import { type Actor, acceptOrder, claimJob, makeAddress, makeKitchen, makeProduct, makeRider, makeUser, ok, orderIdOf, placeHomeOrder, placeOrder, prisma } from './lib';

/** One of the rider's jobs, as the rider's own list shows it. */
const jobOf = async (rider: Actor, deliveryId: string) => (await rider.as('GET', '/riders/deliveries/mine')).body.data?.find((j: any) => j.id === deliveryId);
/** Whether the door details of a job are these three values. */
const doorIs = (d: any, want: { houseNumber: string; landmark: string; addressLine2: string }) => d?.houseNumber === want.houseNumber && d?.landmark === want.landmark && d?.addressLine2 === want.addressLine2;

export default async function snapshot() {
  // 1. read path: the rider's job shows the order's copy of the door, not the saved address
  const COPY = { addressLine1: 'Snap Street 1', addressLine2: 'Flat 2', area: 'Snap Area', city: 'Karachi', houseNumber: 'SNAP-77', landmark: 'Near the snapshot mosque' };
  const LIVE = { addressLine2: 'Live line 2', landmark: 'Near the live market', houseNumber: 'LIVE-11' };
  const placed = await placeHomeOrder();
  const rider = await makeRider();
  const deliveryId = (await acceptOrder(placed))!;
  const claimed = await claimJob(rider, deliveryId);
  ok('the rider has an assigned job', claimed.status === 200 && (await jobOf(rider, deliveryId))?.status === 'assigned', claimed.code);

  // The saved address now says other things.
  await placed.customer.as('PATCH', `/users/me/addresses/${placed.addressId}`, { addressLine2: LIVE.addressLine2, landmark: LIVE.landmark, houseNumber: LIVE.houseNumber });
  await prisma.order.update({ where: { id: placed.orderId }, data: { deliveryAddressSnapshot: Prisma.DbNull } });
  const fallback = (await jobOf(rider, deliveryId))?.dropoffDetails;
  ok('with no copy on the order the rider gets the saved address (so the next check can tell the two apart)', doorIs(fallback, LIVE), fallback);
  await prisma.order.update({ where: { id: placed.orderId }, data: { deliveryAddressSnapshot: COPY } });
  const door = (await jobOf(rider, deliveryId))?.dropoffDetails;
  ok('door details come from the order\'s copy, not from the live saved address', doorIs(door, COPY), door);

  // 2. write path: an order freezes the house number, the landmark and the map pin
  const kitchen = await makeKitchen();
  const productId = await makeProduct(kitchen.sellerId);
  const customer = await makeUser('customer');
  const addressId = await makeAddress(customer, { landmark: 'Opposite the park', latitude: 24.8607, longitude: 67.0011, houseNumber: 'H-55' });
  const order = await placeOrder(customer, [{ productId }], { addressId });
  const orderId = orderIdOf(order);
  const copyOf = async () => (await prisma.order.findUnique({ where: { id: orderId }, select: { deliveryAddressSnapshot: true } }))?.deliveryAddressSnapshot as Record<string, unknown> | null;
  const frozen = await copyOf();
  ok('an order is placed to that address', order.status === 201, order.code);
  ok('its copy of the address holds the house number, the landmark and the map pin as numbers', frozen?.houseNumber === 'H-55' && frozen?.landmark === 'Opposite the park' && frozen?.latitude === 24.8607 && frozen?.longitude === 67.0011, frozen);

  const edit = await customer.as('PATCH', `/users/me/addresses/${addressId}`, { addressLine1: 'Plot 1, Lane 2', area: 'Gulshan Block 7', landmark: 'Moved away', latitude: 31.5204, longitude: 74.3587, houseNumber: 'H-99' });
  ok('the saved address was edited afterwards (street, area, landmark, pin)', edit.status === 200 && edit.body.data?.landmark === 'Moved away' && edit.body.data?.coordinates?.latitude === 31.5204, edit.code);
  ok('changing the saved address later leaves the order\'s copy untouched', JSON.stringify(await copyOf()) === JSON.stringify(frozen), await copyOf());

  // The same order, now taken by a rider: its job is made after the edit, so it must still use what was written down.
  const rider2 = await makeRider();
  const deliveryId2 = (await acceptOrder({ kitchen, orderId }))!;
  await claimJob(rider2, deliveryId2);
  const job = await jobOf(rider2, deliveryId2);
  ok('the rider is shown the door as it was at checkout (house number, landmark)', job?.dropoffDetails?.houseNumber === 'H-55' && job?.dropoffDetails?.landmark === 'Opposite the park', job?.dropoffDetails);
  ok('and the map pin as it was at checkout', Math.abs(job?.deliveryLatitude - 24.8607) < 1e-6 && Math.abs(job?.deliveryLongitude - 67.0011) < 1e-6, [job?.deliveryLatitude, job?.deliveryLongitude]);
  ok('and the street line as it was at checkout, not the edited one', String(job?.deliveryAddress).includes('House 9, Street 5') && !String(job?.deliveryAddress).includes('Plot 1'), job?.deliveryAddress);
  const page = (await rider2.as('GET', `/orders/${orderId}`)).body.data?.deliveryAddress;
  ok('the rider\'s order page shows the same door: street, landmark and pin as at checkout', page?.addressLine1 === 'House 9, Street 5' && page?.landmark === 'Opposite the park' && Math.abs(Number(page?.latitude) - 24.8607) < 1e-6, page);

  // The customer's own order page reads the same copy: not moved by a later edit, and not lost when the saved address is deleted.
  const mine = (await customer.as('GET', `/orders/${orderId}`)).body.data?.deliveryAddress;
  ok(
    "the customer's own order shows the street, the landmark and the pin as ordered, not as the saved address was edited",
    mine?.addressLine1 === 'House 9, Street 5' && mine?.area !== 'Gulshan Block 7' && mine?.landmark === 'Opposite the park' && Math.abs(Number(mine?.latitude) - 24.8607) < 1e-6,
    mine
  );
  const removed = await customer.as('DELETE', `/users/me/addresses/${addressId}`);
  const afterDelete = (await customer.as('GET', `/orders/${orderId}`)).body.data;
  ok('the saved address can be deleted', removed.status === 200, removed.code);
  ok(
    'and the order still says where it went: street, area, house number, landmark and pin',
    afterDelete?.deliveryAddress?.addressLine1 === 'House 9, Street 5' &&
      afterDelete?.deliveryAddress?.area === frozen?.area &&
      afterDelete?.deliveryAddress?.houseNumber === 'H-55' &&
      afterDelete?.deliveryAddress?.landmark === 'Opposite the park' &&
      Math.abs(Number(afterDelete?.deliveryAddress?.latitude) - 24.8607) < 1e-6,
    afterDelete?.deliveryAddress
  );

  // 3. a customer can enter a house number: it is trimmed, listed, editable, limited, and reaches the rider's door details
  const typed = await makeUser('customer');
  const base = { addressLine1: 'Street 5', area: 'DHA Phase 6', city: 'Karachi', latitude: 24.8015, longitude: 67.0655 };
  const created = await typed.as('POST', '/users/me/addresses', { ...base, houseNumber: '  12-B ' });
  ok('an address is saved with a house number (spaces trimmed)', created.status === 201 && created.body.data?.houseNumber === '12-B', created.body.data?.houseNumber ?? created.code);
  const listed = ((await typed.as('GET', '/users/me/addresses')).body.data ?? []).find((a: { id: string }) => a.id === created.body.data?.id);
  ok('and the address list carries it', listed?.houseNumber === '12-B', listed?.houseNumber);
  const without = await typed.as('POST', '/users/me/addresses', { ...base, addressLine1: 'Street 6' });
  ok('an address with none still saves, and has none', without.status === 201 && (without.body.data?.houseNumber ?? null) === null, without.body.data?.houseNumber ?? without.code);
  const changed = await typed.as('PATCH', `/users/me/addresses/${created.body.data?.id}`, { houseNumber: 'Flat 4' });
  ok('the house number can be changed', changed.status === 200 && changed.body.data?.houseNumber === 'Flat 4', changed.body.data?.houseNumber ?? changed.code);
  const tooLong = await typed.as('PATCH', `/users/me/addresses/${created.body.data?.id}`, { houseNumber: 'x'.repeat(51) });
  ok('and one over 50 characters is refused', tooLong.status === 400 && tooLong.code === 'VALIDATION_ERROR', `${tooLong.status} ${tooLong.code}`);
  const placed3 = await placeHomeOrder({ address: { houseNumber: '7-C', landmark: 'Next to the bakery' } });
  const rider3 = await makeRider();
  const deliveryId3 = (await acceptOrder(placed3))!;
  await claimJob(rider3, deliveryId3);
  const door3 = (await jobOf(rider3, deliveryId3))?.dropoffDetails;
  ok("a house number entered through the API reaches the rider's door details", door3?.houseNumber === '7-C' && door3?.landmark === 'Next to the bakery', door3);
}
