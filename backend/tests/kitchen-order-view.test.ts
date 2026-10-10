/**
 * What a kitchen sees of an order: the order, its own items, the customer's name and phone and the
 * door, never the customer's account id, the map pin, the postcode or the checkout's internal keys.
 * Both routes a kitchen can use (GET /seller/orders/:id and GET /orders/:id) give the same view.
 */

jest.mock('../src/config/database', () => ({
  __esModule: true,
  default: {
    user: { findUnique: jest.fn() },
    seller: { findUnique: jest.fn() },
    rider: { findUnique: jest.fn() },
    userProfile: { findUnique: jest.fn() },
    order: { findFirst: jest.fn(), findUnique: jest.fn() },
  },
}));

import prisma from '../src/config/database';
import orderService from '../src/services/order.service';
import sellerOrderService from '../src/services/seller-order.service';
import { kitchenOrderSelect, presentKitchenOrder, KitchenOrderRow } from '../src/utils/kitchenOrderView';

const db = prisma as any;

/** Every key anywhere in a JSON-like value. */
function allKeys(value: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach((v) => allKeys(v, out));
  else if (value && typeof value === 'object' && !(value instanceof Date)) {
    for (const [k, v] of Object.entries(value)) {
      out.add(k);
      allKeys(v, out);
    }
  }
  return out;
}

const FORBIDDEN_KEYS = [
  'latitude', 'longitude', 'postalCode', 'userId', 'customerId', 'communityId', 'idempotencyKey', 'paymentTransactionId',
  'handoverCode', 'hubId', 'deliveryAddressId', 'deliveryAddressSnapshot', 'deliveryFeeBreakdown', 'sellerDeliveryCharge',
  'tipAmount', 'paymentCollectedBy', 'changedBy', 'sellerId', 'isDefault',
];

/** A row as the database might hand it back: everything the kitchen may see, plus everything it must not. */
function hostileRow(over: Record<string, unknown> = {}) {
  return {
    id: 'o1',
    orderNumber: 'FN20261010123456',
    orderStatus: 'confirmed',
    createdAt: new Date('2026-10-10T10:00:00Z'),
    updatedAt: new Date('2026-10-10T10:05:00Z'),
    estimatedDeliveryAt: null,
    deliveredAt: null,
    cancellationReason: null,
    cancelledBy: null,
    notes: 'less spicy',
    deliveryInstructions: 'ring twice',
    deliverySlotDate: null,
    deliverySlotTime: null,
    deliveryType: 'home_delivery',
    deliveryProvider: 'self',
    subtotal: '1000.00',
    deliveryFee: '100.00',
    discountAmount: '0.00',
    taxAmount: '0.00',
    totalAmount: '1100.00',
    paymentMethod: 'jazzcash',
    paymentStatus: 'payment_submitted',
    paymentReferenceNumber: 'TX123',
    paymentSenderName: 'Ali',
    paymentSenderAccount: '03001234567',
    paymentProofUrl: 'private/receipts/o1.jpg',
    paymentNotes: null,
    paymentSubmittedAt: new Date('2026-10-10T10:02:00Z'),
    paymentDisputeReason: null,
    paymentConfirmedBy: null,
    paymentConfirmedAt: null,
    paidAt: null,
    deliveryFeeBreakdown: [{ sellerId: 's1', fee: 100, provider: 'self', paidBy: 'customer' }],
    deliveryAddressSnapshot: {
      addressLine1: 'Street 5', addressLine2: null, area: 'Askari 11', city: 'Lahore', postalCode: '54000',
      houseNumber: '12', landmark: 'blue gate', latitude: 31.4, longitude: 74.4,
    },
    deliveryAddress: {
      label: 'Home', addressLine1: 'Street 5 (edited)', addressLine2: null, houseNumber: '99', landmark: null, area: 'Askari 11', city: 'Lahore',
      // not selected by the real query, but a hostile row has them
      userId: 'cust-1', latitude: 31.4, longitude: 74.4, postalCode: '54000', communityId: 'com-1', isDefault: true,
    },
    customer: { id: 'cust-1', phone: '+923001112222', profile: { fullName: 'Sara Khan', userId: 'cust-1' } },
    items: [
      {
        id: 'i1', productId: 'p1', variantId: null, productName: 'Biryani', variantName: 'Full', productImage: null, quantity: 2,
        unitPrice: '500.00', totalPrice: '1000.00', commissionRate: '10.00', commissionAmount: '100.00', sellerPayout: '900.00',
        promoDiscount: '0.00', fulfillmentType: 'direct', status: 'confirmed', createdAt: new Date('2026-10-10T10:00:00Z'),
        sellerId: 's1', hubId: 'hub-1',
        product: { id: 'p1', name: 'Biryani', slug: 'biryani', images: [{ imageUrl: '/media/b.jpg', id: 'img1', productId: 'p1' }] },
      },
    ],
    statusHistory: [{ id: 'h1', status: 'pending', notes: null, createdAt: new Date('2026-10-10T10:00:00Z'), changedBy: 'cust-1' }],
    // columns the kitchen must never get
    customerId: 'cust-1',
    idempotencyKey: 'idem-secret-key',
    paymentTransactionId: 'gateway-txn-secret',
    handoverCode: '482913',
    hubId: 'hub-1',
    deliveryAddressId: 'addr-1',
    sellerDeliveryCharge: '0.00',
    tipAmount: '50.00',
    paymentCollectedBy: 'seller',
    aColumnAddedNextYear: 'should-not-leak',
    ...over,
  } as unknown as KitchenOrderRow;
}

const ctx = { sellerId: 's1', businessName: 'Sara Kitchen', businessNameUrdu: null, sellerDeliveryProvider: 'platform', paymentProofUrl: 'https://signed.example/o1.jpg' };

describe('presentKitchenOrder', () => {
  it('leaves out the pin, postcode, account ids and internal keys, at any depth', () => {
    const view = presentKitchenOrder(hostileRow(), ctx);
    const keys = allKeys(view);
    for (const forbidden of FORBIDDEN_KEYS) expect(keys.has(forbidden)).toBe(false);
    expect(keys.has('aColumnAddedNextYear')).toBe(false);
    const json = JSON.stringify(view);
    for (const secret of ['idem-secret-key', 'gateway-txn-secret', '482913', 'cust-1', '54000', '31.4', '74.4', 'should-not-leak']) {
      expect(json).not.toContain(secret);
    }
  });

  it('keeps what the kitchen works with', () => {
    const view = presentKitchenOrder(hostileRow(), ctx);
    expect(view).toMatchObject({
      id: 'o1',
      orderNumber: 'FN20261010123456',
      orderStatus: 'confirmed',
      paymentStatus: 'payment_submitted',
      paymentReferenceNumber: 'TX123',
      paymentSenderName: 'Ali',
      paymentProofUrl: 'https://signed.example/o1.jpg',
      deliveryInstructions: 'ring twice',
      notes: 'less spicy',
      customer: { phone: '+923001112222', profile: { fullName: 'Sara Khan' } },
      subtotal: 1000,
      deliveryFee: 100,
      totalAmount: 1100,
    });
    expect(view.items).toHaveLength(1);
    expect(view.items[0]).toMatchObject({ productName: 'Biryani', quantity: 2, totalPrice: 1000, product: { images: [{ imageUrl: '/media/b.jpg' }] } });
    expect(view.items[0].product?.images[0]).toEqual({ imageUrl: '/media/b.jpg' });
    expect(view.statusHistory).toEqual([{ id: 'h1', status: 'pending', notes: null, createdAt: expect.any(Date) }]);
    expect(view.customer).toEqual({ phone: '+923001112222', profile: { fullName: 'Sara Khan' } });
  });

  it('shows the door as it was at checkout, with the saved address label', () => {
    const view = presentKitchenOrder(hostileRow(), ctx);
    expect(view.deliveryAddress).toEqual({
      label: 'Home', addressLine1: 'Street 5', addressLine2: null, houseNumber: '12', landmark: 'blue gate', area: 'Askari 11', city: 'Lahore',
    });
  });

  it('falls back to the saved address for orders placed before snapshots, and to nothing for pickups', () => {
    const old = presentKitchenOrder(hostileRow({ deliveryAddressSnapshot: null }), ctx);
    expect(old.deliveryAddress).toMatchObject({ addressLine1: 'Street 5 (edited)', houseNumber: '99' });
    expect(Object.keys(old.deliveryAddress ?? {}).sort()).toEqual(['addressLine1', 'addressLine2', 'area', 'city', 'houseNumber', 'label', 'landmark']);
    expect(presentKitchenOrder(hostileRow({ deliveryAddressSnapshot: null, deliveryAddress: null, deliveryType: 'self_pickup' }), ctx).deliveryAddress).toBeNull();
  });

  it("takes a field the snapshot does not have from the saved address, and never overrides one it has", () => {
    // Placed before snapshots kept the house number and landmark: only the saved address knows them.
    const older = presentKitchenOrder(
      hostileRow({
        deliveryAddressSnapshot: { addressLine1: 'Street 5', addressLine2: null, area: 'Askari 11', city: 'Lahore', postalCode: '54000' },
        deliveryAddress: { label: 'Home', addressLine1: 'Street 5 (edited)', addressLine2: 'Lane 2', houseNumber: '99', landmark: 'Green gate', area: 'Askari 11', city: 'Lahore' },
      }),
      ctx
    );
    expect(older.deliveryAddress).toEqual({
      label: 'Home', addressLine1: 'Street 5', addressLine2: null, houseNumber: '99', landmark: 'Green gate', area: 'Askari 11', city: 'Lahore',
    });
    // A snapshot that has the keys is final: a field the customer left empty is not filled from an address they edited later.
    const current = presentKitchenOrder(
      hostileRow({
        deliveryAddressSnapshot: { addressLine1: 'Street 5', addressLine2: null, area: 'Askari 11', city: 'Lahore', houseNumber: null, landmark: null },
        deliveryAddress: { label: 'Home', addressLine1: 'Street 5 (edited)', addressLine2: 'Lane 2', houseNumber: '99', landmark: 'Green gate', area: 'Askari 11', city: 'Lahore' },
      }),
      ctx
    );
    expect(current.deliveryAddress).toMatchObject({ addressLine1: 'Street 5', houseNumber: null, landmark: null });
  });

  it('says who hands the order over', () => {
    expect(presentKitchenOrder(hostileRow({ deliveryProvider: 'self' }), ctx).sellerHandsOver).toBe(true);
    expect(presentKitchenOrder(hostileRow({ deliveryProvider: 'platform' }), ctx).sellerHandsOver).toBe(false);
    expect(presentKitchenOrder(hostileRow({ deliveryType: 'self_pickup', deliveryProvider: null }), ctx).sellerHandsOver).toBe(true);
  });

  it("works out this kitchen's earnings from its own items and the fee split", () => {
    const view = presentKitchenOrder(hostileRow(), ctx);
    expect(view.sellerTotals).toEqual({ subtotal: 1000, commission: 100, payout: 900, deliveryFeeKept: 100, deliveryFeePaid: 0 });
    const platform = presentKitchenOrder(
      hostileRow({ deliveryProvider: 'platform', deliveryFeeBreakdown: [{ sellerId: 's1', fee: 120, provider: 'platform', paidBy: 'seller' }] }),
      ctx
    );
    expect(platform.sellerTotals).toMatchObject({ deliveryFeeKept: 0, deliveryFeePaid: 120 });
  });
});

describe('kitchenOrderSelect', () => {
  it('asks the database only for what the view uses', () => {
    const select = kitchenOrderSelect('s1') as Record<string, any>;
    for (const forbidden of ['customerId', 'idempotencyKey', 'paymentTransactionId', 'handoverCode', 'hubId', 'deliveryAddressId', 'tipAmount', 'sellerDeliveryCharge', 'paymentCollectedBy']) {
      expect(select[forbidden]).toBeUndefined();
    }
    expect(allKeys(select.customer).has('id')).toBe(false);
    for (const k of ['latitude', 'longitude', 'postalCode', 'userId', 'communityId']) expect(select.deliveryAddress.select[k]).toBeUndefined();
    expect(allKeys(select.statusHistory).has('changedBy')).toBe(false);
    expect(select.items.where).toEqual({ sellerId: 's1' });
  });
});

describe('the two routes a kitchen can use', () => {
  const sellerRow = { id: 's1', userId: 'kitchen-user', businessName: 'Sara Kitchen', businessNameUrdu: null, deliveryProvider: 'platform' };

  beforeEach(() => {
    db.seller.findUnique.mockReset().mockResolvedValue(sellerRow);
    db.rider.findUnique.mockReset().mockResolvedValue(null);
    db.userProfile.findUnique.mockReset().mockResolvedValue(null);
    db.order.findUnique.mockReset().mockResolvedValue(hostileRow());
    db.order.findFirst.mockReset();
  });

  it('GET /seller/orders/:id reads with the explicit select and returns the kitchen view', async () => {
    const view: any = await sellerOrderService.getSellerOrderDetails('o1', 'kitchen-user');
    expect(db.order.findUnique).toHaveBeenCalledWith({ where: { id: 'o1' }, select: kitchenOrderSelect('s1') });
    for (const forbidden of FORBIDDEN_KEYS) expect(allKeys(view).has(forbidden)).toBe(false);
  });

  it('refuses an order with none of the kitchen\'s items', async () => {
    db.order.findUnique.mockResolvedValue(hostileRow({ items: [] }));
    await expect(sellerOrderService.getSellerOrderDetails('o1', 'kitchen-user')).rejects.toMatchObject({ code: 'NO_ITEMS_FOUND' });
  });

  it('GET /orders/:id gives a kitchen the same view, not the customer\'s row', async () => {
    db.user.findUnique.mockReset().mockResolvedValue({ userType: 'seller', email: 'k@example.com' });
    db.order.findFirst.mockResolvedValue({ ...(hostileRow() as any), customerId: 'cust-1', items: [{ sellerId: 's1' }], delivery: null, hub: null });
    const view: any = await orderService.getOrderDetails('o1', 'kitchen-user');
    for (const forbidden of FORBIDDEN_KEYS) expect(allKeys(view).has(forbidden)).toBe(false);
    expect(view.orderNumber).toBe('FN20261010123456');
    expect(view.sellerTotals).toBeDefined();
  });

  it('GET /orders/:id still gives the customer their own full order', async () => {
    db.user.findUnique.mockReset().mockResolvedValue({ userType: 'customer', email: 'c@example.com' });
    db.seller.findUnique.mockResolvedValue(null);
    db.order.findFirst.mockResolvedValue({ ...(hostileRow() as any), customerId: 'cust-1', items: [{ sellerId: 's1' }], delivery: null, hub: null });
    db.order.findUnique.mockResolvedValue({ handoverCode: '482913' });
    const view: any = await orderService.getOrderDetails('o1', 'cust-1');
    expect(view.customerId).toBe('cust-1');
    expect(view.deliveryAddress.latitude).toBe(31.4);
    expect(view.handoverCode).toBe('482913');
  });

  it('GET /orders/:id gives an admin the full order', async () => {
    db.user.findUnique.mockReset().mockResolvedValue({ userType: 'admin', email: 'a@example.com' });
    db.seller.findUnique.mockResolvedValue(null);
    db.order.findFirst.mockResolvedValue({ ...(hostileRow() as any), customerId: 'cust-1', items: [{ sellerId: 's1' }], delivery: null, hub: null });
    const view: any = await orderService.getOrderDetails('o1', 'admin-1');
    expect(view.customerId).toBe('cust-1');
  });
});
