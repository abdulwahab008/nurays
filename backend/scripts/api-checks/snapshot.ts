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

  // The saved address now says other things (the API has no house-number field, so that one goes straight to the database).
  await placed.customer.as('PATCH', `/users/me/addresses/${placed.addressId}`, { addressLine2: LIVE.addressLine2, landmark: LIVE.landmark });
  await prisma.userAddress.update({ where: { id: placed.addressId }, data: { houseNumber: LIVE.houseNumber } });
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
  const addressId = await makeAddress(customer, { landmark: 'Opposite the park', latitude: 24.8607, longitude: 67.0011 });
  await prisma.userAddress.update({ where: { id: addressId }, data: { houseNumber: 'H-55' } });
  const order = await placeOrder(customer, [{ productId }], { addressId });
  const orderId = orderIdOf(order);
  const copyOf = async () => (await prisma.order.findUnique({ where: { id: orderId }, select: { deliveryAddressSnapshot: true } }))?.deliveryAddressSnapshot as Record<string, unknown> | null;
  const frozen = await copyOf();
  ok('an order is placed to that address', order.status === 201, order.code);
  ok('its copy of the address holds the house number, the landmark and the map pin as numbers', frozen?.houseNumber === 'H-55' && frozen?.landmark === 'Opposite the park' && frozen?.latitude === 24.8607 && frozen?.longitude === 67.0011, frozen);

  const edit = await customer.as('PATCH', `/users/me/addresses/${addressId}`, { addressLine1: 'Plot 1, Lane 2', area: 'Gulshan Block 7', landmark: 'Moved away', latitude: 31.5204, longitude: 74.3587 });
  await prisma.userAddress.update({ where: { id: addressId }, data: { houseNumber: 'H-99' } });
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
}
