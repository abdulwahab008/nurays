/**
 * A seller who delivers themselves (deliveryProvider = 'self') must not have
 * their orders posted to the platform rider pool. Sellers on the platform fleet
 * (the default) still get a rider job, and a mixed order still gets one.
 */

jest.mock('../src/config/database', () => ({
  __esModule: true,
  default: {
    order: { findUnique: jest.fn() },
    delivery: { findUnique: jest.fn(), create: jest.fn() },
  },
}));

import riderService from '../src/services/rider.service';
import prisma from '../src/config/database';

const db = prisma as any;

function item(deliveryProvider: string, businessName = deliveryProvider) {
  return { seller: { businessName, latitude: 31.5, longitude: 74.3, deliveryProvider } };
}

function order(items: ReturnType<typeof item>[]) {
  return {
    id: 'order-1',
    deliveryType: 'home_delivery',
    items,
    deliveryAddress: { addressLine1: 'House 1', area: 'Askari 11', city: 'Lahore', latitude: 31.4, longitude: 74.4 },
    deliveryAddressSnapshot: null,
  };
}

beforeEach(() => {
  db.order.findUnique.mockReset();
  db.delivery.findUnique.mockReset().mockResolvedValue(null);
  db.delivery.create.mockReset().mockResolvedValue({});
});

describe('ensureDeliveryForOrder — delivery provider', () => {
  it('creates a rider job for a platform-delivered order', async () => {
    db.order.findUnique.mockResolvedValue(order([item('platform')]));
    await riderService.ensureDeliveryForOrder('order-1');
    expect(db.delivery.create).toHaveBeenCalledTimes(1);
  });

  it('does not create a rider job when the only seller delivers themselves', async () => {
    db.order.findUnique.mockResolvedValue(order([item('self')]));
    await riderService.ensureDeliveryForOrder('order-1');
    expect(db.delivery.create).not.toHaveBeenCalled();
  });

  it('still creates a rider job when any seller on the order uses the platform', async () => {
    db.order.findUnique.mockResolvedValue(order([item('self', 'Self Kitchen'), item('platform', 'Fleet Kitchen')]));
    await riderService.ensureDeliveryForOrder('order-1');
    expect(db.delivery.create).toHaveBeenCalledTimes(1);
    // pickup is the platform-delivered seller, not the self-delivering one
    expect(db.delivery.create.mock.calls[0][0].data.pickupAddress).toBe('Fleet Kitchen');
  });
});
