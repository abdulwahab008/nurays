/**
 * The people party to one order (the customer, each kitchen, the rider) never learn each other's
 * account ids: the live events, the tracking snapshot and the chat name people by role, name and
 * `isMe`. A kitchen's tracking snapshot lists its own dishes only.
 *
 * Also here: an online-payment order is refused while no gateway is configured, but a retried
 * checkout still gets the order it already placed.
 */

jest.mock('../src/config/database', () => ({
  __esModule: true,
  default: {
    order: { findUnique: jest.fn(), findFirst: jest.fn() },
    user: { findUnique: jest.fn() },
    seller: { findUnique: jest.fn() },
    orderMessage: { updateMany: jest.fn(), findMany: jest.fn(), create: jest.fn() },
  },
}));
jest.mock('../src/config/socket', () => ({
  __esModule: true,
  default: { emitToRooms: jest.fn(), emitToRole: jest.fn(), emitToUser: jest.fn() },
}));
jest.mock('../src/services/notify.service', () => ({ notify: jest.fn(), notifyMany: jest.fn() }));
jest.mock('../src/gateways/safepay.gateway', () => ({
  safepayGateway: { isConfigured: jest.fn() },
  createSafepayCheckout: jest.fn(),
}));

import prisma from '../src/config/database';
import socketManager from '../src/config/socket';
import { notify, notifyMany } from '../src/services/notify.service';
import { safepayGateway } from '../src/gateways/safepay.gateway';
import realtimeOrderService from '../src/services/realtime-order.service';
import orderService from '../src/services/order.service';

const db = prisma as any;
const emitToRooms = (socketManager as any).emitToRooms as jest.Mock;
const gatewayConfigured = (safepayGateway as any).isConfigured as jest.Mock;

const IDS = { customer: 'user-customer-111', kitchenA: 'user-kitchen-aaa', kitchenB: 'user-kitchen-bbb', rider: 'user-rider-999' };

/** Every key and string value anywhere in a JSON-like value. */
function walk(value: unknown, keys = new Set<string>(), values = new Set<string>()) {
  if (Array.isArray(value)) value.forEach((v) => walk(v, keys, values));
  else if (value && typeof value === 'object' && !(value instanceof Date)) {
    for (const [k, v] of Object.entries(value)) {
      keys.add(k);
      walk(v, keys, values);
    }
  } else if (typeof value === 'string') values.add(value);
  return { keys, values };
}

const AUDIENCE_ORDER = {
  customerId: IDS.customer,
  orderNumber: 'FN1',
  deliveryType: 'home_delivery',
  items: [{ seller: { userId: IDS.kitchenA } }, { seller: { userId: IDS.kitchenB } }],
  delivery: { rider: { userId: IDS.rider } },
};

beforeEach(() => {
  jest.clearAllMocks();
  db.order.findUnique.mockReset().mockResolvedValue(AUDIENCE_ORDER);
  gatewayConfigured.mockReset().mockReturnValue(false);
});

describe('live order events', () => {
  it('a status update does not say whose account made the change', async () => {
    await realtimeOrderService.emitOrderStatusUpdate('o1', 'cancelled', IDS.customer);
    expect(emitToRooms).toHaveBeenCalledTimes(1);
    const [rooms, event, payload] = emitToRooms.mock.calls[0];
    expect(event).toBe('order:status:update');
    expect(rooms).toEqual(expect.arrayContaining(['order:o1', `user:${IDS.customer}`, `user:${IDS.kitchenA}`, `user:${IDS.kitchenB}`, `user:${IDS.rider}`, 'role:admin']));
    expect(payload).toEqual({ orderId: 'o1', orderNumber: 'FN1', status: 'cancelled', updatedAt: expect.any(String) });
    expect(walk(payload).keys.has('changedBy')).toBe(false);
    expect(JSON.stringify(payload)).not.toContain('user-');
  });

  it('still uses who made the change to decide who is told', async () => {
    await realtimeOrderService.emitOrderStatusUpdate('o1', 'cancelled', IDS.customer);
    // the customer cancelled it themselves: no alert for them, and both kitchens hear it was the customer
    expect((notify as jest.Mock).mock.calls[0][0]).toMatchObject({ userId: IDS.customer, channels: [] });
    const [kitchens, build] = (notifyMany as jest.Mock).mock.calls[0];
    expect(kitchens).toEqual([IDS.kitchenA, IDS.kitchenB]);
    expect(build(IDS.kitchenA).message).toContain('cancelled by the customer');

    jest.clearAllMocks();
    await realtimeOrderService.emitOrderStatusUpdate('o1', 'cancelled', IDS.kitchenA);
    // the kitchen cancelled it: it is not told about its own action
    expect((notifyMany as jest.Mock).mock.calls[0][0]).toEqual([IDS.kitchenB]);
  });

  it('a chat message event names the sender by role only', async () => {
    await realtimeOrderService.emitOrderMessage('o1', 'm1', 'customer');
    const [, event, payload] = emitToRooms.mock.calls[0];
    expect(event).toBe('order:message');
    expect(payload).toEqual({ orderId: 'o1', messageId: 'm1', senderRole: 'customer' });
  });

  it('a "messages read" event carries only the order', async () => {
    await realtimeOrderService.emitMessagesRead('o1');
    const [, event, payload] = emitToRooms.mock.calls[0];
    expect(event).toBe('order:messages:read');
    expect(payload).toEqual({ orderId: 'o1' });
  });
});

describe('the tracking snapshot', () => {
  const tracked = (over: Record<string, unknown> = {}) => ({
    id: 'o1',
    orderNumber: 'FN1',
    orderStatus: 'preparing',
    paymentStatus: 'paid',
    customerId: IDS.customer,
    estimatedDeliveryAt: null,
    deliveredAt: null,
    customer: { id: IDS.customer },
    items: [
      { id: 'i1', productName: 'Biryani (kitchen A)', quantity: 1, status: 'preparing', seller: { userId: IDS.kitchenA } },
      { id: 'i2', productName: 'Karahi (kitchen B)', quantity: 2, status: 'confirmed', seller: { userId: IDS.kitchenB } },
    ],
    delivery: null,
    statusHistory: [
      { status: 'cancelled', notes: 'Cancelled by customer. Reason: x', changedBy: IDS.customer, createdAt: new Date('2026-10-10T10:00:00Z') },
      { status: 'preparing', notes: 'Accepted', changedBy: IDS.kitchenA, createdAt: new Date('2026-10-10T09:00:00Z') },
    ],
    ...over,
  });

  beforeEach(() => {
    db.order.findUnique.mockReset().mockResolvedValue(tracked());
  });

  it("carries no account id in the history, whoever asks", async () => {
    for (const [userId, userType] of [[IDS.customer, 'customer'], [IDS.kitchenA, 'seller'], ['admin-1', 'admin']] as const) {
      db.user.findUnique.mockResolvedValue({ userType });
      const snapshot = await realtimeOrderService.getOrderTracking('o1', userId);
      expect(snapshot.statusHistory).toHaveLength(2);
      expect(walk(snapshot).keys.has('changedBy')).toBe(false);
      expect(JSON.stringify(snapshot)).not.toContain('user-');
      expect(snapshot.statusHistory[0]).toEqual({ status: 'cancelled', notes: 'Cancelled by customer. Reason: x', createdAt: expect.any(Date) });
    }
  });

  it("shows a kitchen its own dishes, and the customer and an admin all of them", async () => {
    db.user.findUnique.mockResolvedValue({ userType: 'seller' });
    const mine = await realtimeOrderService.getOrderTracking('o1', IDS.kitchenA);
    expect(mine.items.map((i) => i.productName)).toEqual(['Biryani (kitchen A)']);
    expect(JSON.stringify(mine)).not.toContain('kitchen B');

    db.user.findUnique.mockResolvedValue({ userType: 'customer' });
    expect((await realtimeOrderService.getOrderTracking('o1', IDS.customer)).items).toHaveLength(2);
    db.user.findUnique.mockResolvedValue({ userType: 'admin' });
    expect((await realtimeOrderService.getOrderTracking('o1', 'admin-1')).items).toHaveLength(2);
  });

  it('a seller ordering from their own kitchen is the customer and sees every dish', async () => {
    db.order.findUnique.mockResolvedValue(tracked({ customerId: IDS.kitchenA }));
    db.user.findUnique.mockResolvedValue({ userType: 'seller' });
    expect((await realtimeOrderService.getOrderTracking('o1', IDS.kitchenA)).items).toHaveLength(2);
  });

  it('still refuses someone with no part in the order', async () => {
    db.user.findUnique.mockResolvedValue({ userType: 'customer' });
    await expect(realtimeOrderService.getOrderTracking('o1', 'stranger')).rejects.toMatchObject({ statusCode: 403, code: 'ACCESS_DENIED' });
  });
});

describe('the order chat', () => {
  const message = (over: Record<string, unknown> = {}) => ({
    id: 'm1',
    orderId: 'o1',
    senderId: IDS.customer,
    senderRole: 'customer',
    message: 'Is it spicy?',
    messageType: 'text',
    mediaUrl: null,
    duration: null,
    isRead: false,
    readAt: null,
    createdAt: new Date('2026-10-10T10:00:00Z'),
    sender: { id: IDS.customer, userType: 'customer', profile: { fullName: 'Sara Khan', avatarUrl: null } },
    ...over,
  });

  beforeEach(() => {
    db.user.findUnique.mockReset().mockResolvedValue({ id: IDS.kitchenA, userType: 'seller' });
    db.seller.findUnique.mockReset().mockResolvedValue({ id: 's1' });
    db.order.findFirst.mockReset().mockResolvedValue({
      id: 'o1',
      customerId: IDS.customer,
      items: [{ sellerId: 's1', seller: { userId: IDS.kitchenA } }],
      delivery: null,
    });
  });

  it("lists messages with the sender's role, name and isMe, never the sender's account id", async () => {
    db.orderMessage.updateMany.mockResolvedValue({ count: 1 });
    db.orderMessage.findMany.mockResolvedValue([message(), message({ id: 'm2', senderId: IDS.kitchenA, senderRole: 'seller', sender: { id: IDS.kitchenA, userType: 'seller', profile: { fullName: 'Chef Ali', avatarUrl: null } } })]);
    const list: any[] = await orderService.getOrderMessages('o1', IDS.kitchenA);
    expect(list.map((m) => [m.senderRole, m.senderName, m.isMe])).toEqual([
      ['customer', 'Sara Khan', false],
      ['seller', 'Chef Ali', true],
    ]);
    const { keys } = walk(list);
    expect(keys.has('senderId')).toBe(false);
    expect(JSON.stringify(list)).not.toContain('user-');
    // reading marks the other side's messages read and tells the order's parties (without saying who read)
    expect(db.orderMessage.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ senderId: { not: IDS.kitchenA } }) }));
    await new Promise((resolve) => setImmediate(resolve));
    expect(emitToRooms.mock.calls.find((c) => c[1] === 'order:messages:read')?.[2]).toEqual({ orderId: 'o1' });
  });

  it('answers a posted message without the sender\'s account id, and tells the others by role', async () => {
    db.orderMessage.create.mockResolvedValue(message({ id: 'm3', senderId: IDS.kitchenA, senderRole: 'seller', message: 'Mild.', sender: { id: IDS.kitchenA, userType: 'seller', profile: { fullName: 'Chef Ali', avatarUrl: null } } }));
    const sent: any = await orderService.sendOrderMessage('o1', IDS.kitchenA, 'Mild.');
    expect(sent).toMatchObject({ id: 'm3', senderRole: 'seller', senderName: 'Chef Ali', isMe: true, message: 'Mild.' });
    expect(walk(sent).keys.has('senderId')).toBe(false);
    // the row is stored with the sender, the answer and the event do not repeat it
    expect(db.orderMessage.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ senderId: IDS.kitchenA, senderRole: 'seller' }) }));
    await new Promise((resolve) => setImmediate(resolve));
    const event = emitToRooms.mock.calls.find((c) => c[1] === 'order:message');
    expect(event?.[2]).toEqual({ orderId: 'o1', messageId: 'm3', senderRole: 'seller' });
  });
});

describe('placing an order that is paid online', () => {
  const data = (paymentMethod: string) => ({ items: [{ productId: 'p1', quantity: 1 }], deliveryType: 'self_pickup', paymentMethod }) as any;
  let loadPlaced: jest.SpyInstance;

  beforeEach(() => {
    db.user.findUnique.mockReset().mockResolvedValue(null);
    // no order exists yet for the checkout's Idempotency-Key
    db.order.findUnique.mockReset().mockResolvedValue(null);
    loadPlaced = jest.spyOn(orderService as any, 'loadPlacedOrder').mockResolvedValue({ id: 'o-existing' });
  });
  afterEach(() => loadPlaced.mockRestore());

  it.each(['safepay', 'card'])('refuses %s with 503 while no gateway is configured, before anything else is looked up', async (method) => {
    await expect(orderService.createOrder('c1', data(method), { idempotencyKey: 'k1' })).rejects.toMatchObject({ statusCode: 503, code: 'GATEWAY_UNAVAILABLE' });
    expect(db.user.findUnique).not.toHaveBeenCalled();
  });

  it.each(['cod', 'wallet', 'jazzcash', 'easypaisa', 'bank'])('does not hold %s back for the gateway', async (method) => {
    // it moves on to the next check (the customer does not exist in this test), so it was not refused as unavailable
    await expect(orderService.createOrder('c1', data(method), { idempotencyKey: 'k2' })).rejects.toMatchObject({ code: 'CUSTOMER_NOT_FOUND' });
  });

  it('takes an online order once the gateway is configured', async () => {
    gatewayConfigured.mockReturnValue(true);
    await expect(orderService.createOrder('c1', data('safepay'), { idempotencyKey: 'k3' })).rejects.toMatchObject({ code: 'CUSTOMER_NOT_FOUND' });
  });

  it('gives a retried checkout the order it already placed, even with the gateway off', async () => {
    db.order.findUnique.mockResolvedValue({ id: 'o-existing' });
    await expect(orderService.createOrder('c1', data('safepay'), { idempotencyKey: 'same-key' })).resolves.toEqual({ id: 'o-existing' });
    expect(db.order.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { customerId_idempotencyKey: { customerId: 'c1', idempotencyKey: 'same-key' } } }));
  });
});
