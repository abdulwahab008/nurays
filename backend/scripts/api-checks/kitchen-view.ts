/**
 * What a kitchen may see of an order, and what the live data other people on the order receive may carry.
 * The kitchen gets the customer's name and phone, the door and its own dishes, never the customer's account
 * id, the map pin, the postcode or the checkout's internal keys; the customer still gets their whole order;
 * tracking, chat and live events name people by role, never by account id.
 */
import { io } from 'socket.io-client';
import { type Actor, acceptOrder, claimJob, deepKeys, makeAddress, makeKitchen, makeProduct, makeRider, makeUser, ok, ORIGIN, orderIdOf, placeHomeOrder, placeOrder, prisma, sleep, unique } from './lib';

const PIN = { latitude: 24.861973, longitude: 67.073189 }; // Karachi
const POSTCODE = '75599';
const PRIVATE_KEYS = ['latitude', 'longitude', 'postalCode', 'userId', 'customerId', 'idempotencyKey', 'paymentTransactionId', 'handoverCode', 'deliveryAddressSnapshot', 'deliveryAddressId', 'hubId', 'changedBy'];
/** The private keys a customer's own answer must still have: the pin, the postcode, their account id, the handover code, the address copy. */
const CORE_KEYS = ['latitude', 'longitude', 'postalCode', 'customerId', 'handoverCode', 'deliveryAddressSnapshot'];
const found = (value: unknown, keys: string[]) => keys.filter((k) => deepKeys(value).has(k));
const text = (value: unknown) => JSON.stringify(value);

/** A signed-in socket that remembers everything it hears. */
function listen(token: string) {
  const socket = io(ORIGIN, { auth: { token }, transports: ['websocket'], reconnection: false, timeout: 5000 });
  const heard: Array<{ event: string; payload: any }> = [];
  socket.onAny((event, payload) => heard.push({ event, payload }));
  const connected = new Promise<void>((resolve, reject) => {
    socket.once('connect', () => resolve());
    socket.once('connect_error', reject);
  });
  return { socket, heard, connected };
}

/** Wait (up to eight seconds) until the socket has heard all of these events. */
async function until(listener: ReturnType<typeof listen>, ...events: string[]) {
  for (let i = 0; i < 80 && !events.every((e) => listener.heard.some((h) => h.event === e)); i++) await sleep(100);
}

export default async function kitchenView() {
  // 0. one order whose data holds every private value we then look for
  const kitchen = await makeKitchen();
  const productId = await makeProduct(kitchen.sellerId, { price: 300 });
  const customerName = `Sara ${unique()}`;
  const customer = await makeUser('customer', { fullName: customerName });
  const door = { addressLine1: 'House 9, Street 5', area: 'DHA Phase 6', city: 'Karachi', landmark: 'Opposite the Karachi park' };
  const addressId = await makeAddress(customer, { ...door, ...PIN, postalCode: POSTCODE, houseNumber: 'H-55' });
  const placed = await placeOrder(customer, [{ productId, quantity: 2 }], { addressId, deliveryInstructions: 'Ring twice' });
  const orderId = orderIdOf(placed);
  const gatewayId = `gw-${unique()}`;
  await prisma.order.update({ where: { id: orderId }, data: { paymentTransactionId: gatewayId } });
  await prisma.orderStatusHistory.updateMany({ where: { orderId }, data: { changedBy: customer.id } });
  const deliveryId = await acceptOrder({ kitchen, orderId }); // adds a history row changed by the kitchen
  const rider = await makeRider();
  await claimJob(rider, deliveryId!); // a rider has the job, so it does not stay in the open pool
  const stored = await prisma.order.findUnique({ where: { id: orderId }, select: { idempotencyKey: true, handoverCode: true } });
  ok('the order holds a checkout key and a handover code to look for', !!stored?.idempotencyKey && !!stored?.handoverCode);

  // 1. the kitchen's two ways to read the order: none of the private keys or values, and still everything it works with
  const bySeller = await kitchen.owner.as('GET', `/seller/orders/${orderId}`);
  const byOrders = await kitchen.owner.as('GET', `/orders/${orderId}`);
  const secrets = [`"${POSTCODE}"`, '24.86197', '67.07318', gatewayId, stored?.idempotencyKey ?? '(none)', `"${stored?.handoverCode}"`, customer.id, rider.id, addressId];
  for (const [route, r] of [['GET /seller/orders/:id', bySeller], ['GET /orders/:id', byOrders]] as const) {
    ok(`${route} answers the kitchen`, r.status === 200, r.code);
    ok(`${route} has none of the private keys at any depth`, found(r.body, PRIVATE_KEYS).length === 0, found(r.body, PRIVATE_KEYS).join(','));
    ok(`${route} has none of the private values as text (postcode, pin, gateway id, checkout key, handover code, customer and rider account ids, address id)`, secrets.every((s) => !text(r.body).includes(s)), secrets.filter((s) => text(r.body).includes(s)).join(' | '));
  }
  const view = bySeller.body.data;
  ok('the kitchen still gets the customer\'s name and phone', view?.customer?.phone === customer.phone && view?.customer?.profile?.fullName === customerName, view?.customer);
  const seen = view?.deliveryAddress;
  ok('and the door: house number, street line, area, city, landmark', seen?.houseNumber === 'H-55' && seen?.addressLine1 === door.addressLine1 && seen?.area === door.area && seen?.city === door.city && seen?.landmark === door.landmark, seen);
  const item = view?.items?.[0];
  const dishOk = view?.items?.length === 1 && item?.productId === productId && item?.quantity === 2 && item?.totalPrice === 600;
  const totalsOk = view?.subtotal === 600 && view?.totalAmount === placed.body.data?.order?.totalAmount && view?.sellerTotals?.subtotal === 600;
  ok('and its own dish, the quantity and the totals', dishOk && totalsOk, item);
  ok('both routes give the kitchen exactly the same view', text(byOrders.body.data) === text(view));

  // 2. the customer keeps their whole order (this also shows the key and text scans can find those values)
  const mine = await customer.as('GET', `/orders/${orderId}`);
  const own = mine.body.data;
  const pinOk = Number(own?.deliveryAddress?.latitude) === PIN.latitude && Number(own?.deliveryAddress?.longitude) === PIN.longitude;
  ok('the customer still gets their own account id, the pin and the postcode', mine.status === 200 && own?.customerId === customer.id && pinOk && own?.deliveryAddress?.postalCode === POSTCODE, mine.code);
  ok('and the handover code', own?.handoverCode === stored?.handoverCode);
  const scanned = found(mine.body, CORE_KEYS).length === CORE_KEYS.length && [`"${POSTCODE}"`, '24.86197', '67.07318', customer.id, addressId].every((s) => text(mine.body).includes(s));
  ok('and the same key and text scans find all of that in the customer\'s answer, so an empty scan for the kitchen means something', scanned, found(mine.body, CORE_KEYS).join(','));

  // 3. editing the saved address afterwards does not change the door the kitchen sees
  const edit = await customer.as('PATCH', `/users/me/addresses/${addressId}`, { addressLine1: 'Plot 77, Lane 12', area: 'Clifton Block 5', landmark: 'Moved away', houseNumber: 'H-99' });
  const later = await kitchen.owner.as('GET', `/seller/orders/${orderId}`);
  ok('the saved address really was edited', edit.status === 200 && edit.body.data?.landmark === 'Moved away', edit.code);
  ok('and the door the kitchen sees is still the one from checkout', text(later.body.data?.deliveryAddress) === text(seen), later.body.data?.deliveryAddress);

  // 4. tracking: no changedBy in the history, and a kitchen lists its own dishes only
  const rows = await prisma.orderStatusHistory.findMany({ where: { orderId }, select: { changedBy: true } });
  ok('the server does record who changed the order, the customer and the kitchen (so there is something to leak)', [customer.id, kitchen.owner.id].every((id) => rows.some((r) => r.changedBy === id)), rows.length);
  for (const [who, person] of [['the kitchen', kitchen.owner], ['the customer', customer]] as const) {
    const track = await person.as('GET', `/realtime/orders/${orderId}/track`);
    const named = [customer.id, kitchen.owner.id, rider.id].some((id) => text(track.body).includes(id));
    ok(`tracking for ${who} lists the history with no changedBy and no account id`, track.status === 200 && track.body.data?.statusHistory?.length >= 2 && !deepKeys(track.body).has('changedBy') && !named, track.code);
  }
  const other = await makeKitchen();
  const otherDish = await makeProduct(other.sellerId);
  const mixed = await placeOrder(customer, [{ productId }, { productId: otherDish }], { addressId });
  ok('an order with dishes from two kitchens is refused: one kitchen per order (400 MULTI_SELLER_ORDER)', mixed.status === 400 && mixed.code === 'MULTI_SELLER_ORDER', `${mixed.status} ${mixed.code}`);
  // So a two-kitchen order can only be an older one: add the second kitchen's dish to a fresh order by hand.
  const older = await placeHomeOrder();
  const otherName = `Other kitchen dish ${unique()}`;
  await prisma.orderItem.create({
    data: { orderId: older.orderId, productId: otherDish, sellerId: other.sellerId, productName: otherName, quantity: 1, unitPrice: 100, totalPrice: 100, commissionRate: 15, commissionAmount: 15, sellerPayout: 85, promoDiscount: 0, fulfillmentType: 'direct', status: 'pending' },
  });
  const dishes = async (person: Actor) => (await person.as('GET', `/realtime/orders/${older.orderId}/track`)).body.data?.items?.map((i: any) => i.productName) as string[] | undefined;
  const [firstKitchen, secondKitchen, whole] = [await dishes(older.kitchen.owner), await dishes(other.owner), await dishes(older.customer)];
  ok('a kitchen\'s tracking lists its own dish only', firstKitchen?.length === 1 && !firstKitchen.includes(otherName) && secondKitchen?.length === 1 && secondKitchen[0] === otherName, [firstKitchen, secondKitchen]);
  ok('while the customer\'s tracking lists both', whole?.length === 2 && whole.includes(otherName), whole);

  // 5. the order chat: roles and isMe, never the sender's account id
  const hello = `Is it spicy? ${unique()}`;
  const reply = `Mild. ${unique()}`;
  const sentByCustomer = await customer.as('POST', `/orders/${orderId}/messages`, { message: hello });
  const sentByKitchen = await kitchen.owner.as('POST', `/orders/${orderId}/messages`, { message: reply });
  const writers = (await prisma.orderMessage.findMany({ where: { orderId }, select: { senderId: true } })).map((m) => m.senderId);
  ok('the server does record who wrote each message (so there is something to leak)', writers.includes(customer.id) && writers.includes(kitchen.owner.id));
  const sentRoles = sentByCustomer.body.data?.senderRole === 'customer' && sentByKitchen.body.data?.senderRole === 'seller';
  ok('a posted message is answered with the sender\'s role and no senderId', sentRoles && !deepKeys([sentByCustomer.body, sentByKitchen.body]).has('senderId'), `${sentByCustomer.status} ${sentByKitchen.status}`);
  for (const [who, reader, isCustomer] of [['the customer', customer, true], ['the kitchen', kitchen.owner, false]] as const) {
    const list = await reader.as('GET', `/orders/${orderId}/messages`);
    const messages: any[] = list.body.data ?? [];
    const byText = (t: string) => messages.find((m) => m.message === t);
    const named = [customer.id, kitchen.owner.id, rider.id].some((id) => text(list.body).includes(id));
    ok(`${who} reads both messages with no senderId and no account id anywhere`, list.status === 200 && messages.length === 2 && !deepKeys(list.body).has('senderId') && !named, list.code);
    ok(`${who} sees each message under the right role (customer, seller) and with the sender's name`, byText(hello)?.senderRole === 'customer' && byText(reply)?.senderRole === 'seller' && byText(hello)?.senderName === customerName, messages.map((m) => m.senderRole).join(','));
    ok(`${who} gets isMe on their own message only`, byText(hello)?.isMe === isCustomer && byText(reply)?.isMe === !isCustomer, messages.map((m) => m.isMe).join(','));
  }

  // 6. live events: cancel a pending order and chat; the kitchen hears it, and nothing names an account
  const second = orderIdOf(await placeOrder(customer, [{ productId }], { addressId }));
  const [forCustomer, forKitchen] = [listen(customer.access), listen(kitchen.owner.access)];
  try {
    await Promise.all([forCustomer.connected, forKitchen.connected]);
    for (const listener of [forCustomer, forKitchen]) listener.socket.emit('join:order', second);
    await sleep(500); // the server checks the person is a party to the order before it lets the socket in
    const cancelled = await customer.as('POST', `/orders/${second}/cancel`, { reason: 'Changed my mind' });
    const said = await customer.as('POST', `/orders/${second}/messages`, { message: 'Sorry, plans changed' });
    await until(forKitchen, 'order:status:update', 'order:message');
    await kitchen.owner.as('GET', `/orders/${second}/messages`); // reading the chat tells the order's parties it was read
    await until(forKitchen, 'order:messages:read');
    const heardBy = (event: string) => forKitchen.heard.filter((h) => h.event === event).map((h) => h.payload);
    ok('the order was cancelled and the message posted', cancelled.status === 200 && said.status === 201, `${cancelled.status} ${said.status}`);
    ok('the kitchen\'s socket hears the cancellation', heardBy('order:status:update').some((p) => p.orderId === second && p.status === 'cancelled'), heardBy('order:status:update'));
    ok('and the new message, by role', heardBy('order:message').some((p) => p.orderId === second && p.senderRole === 'customer' && p.messageId === said.body.data?.id), heardBy('order:message'));
    ok('and that it was read, with only the order named', heardBy('order:messages:read').some((p) => text(p) === text({ orderId: second })), heardBy('order:messages:read'));
    const all = [...forCustomer.heard, ...forKitchen.heard].map((h) => h.payload);
    const history = await prisma.orderStatusHistory.findFirst({ where: { orderId: second, status: 'cancelled' }, select: { changedBy: true } });
    ok('the server does record who cancelled (so there is something to leak)', history?.changedBy === customer.id);
    ok('no event carries changedBy, senderId or readerId', found(all, ['changedBy', 'senderId', 'readerId']).length === 0, found(all, ['changedBy', 'senderId', 'readerId']).join(','));
    ok('and none contains the customer\'s or the kitchen owner\'s account id', ![customer.id, kitchen.owner.id].some((id) => text(all).includes(id)));
  } finally {
    forCustomer.socket.close();
    forKitchen.socket.close();
  }
}
