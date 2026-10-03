/**
 * Rider money: signed ledger entries, settling up at a hub (cash handed in, pay kept from it),
 * payouts, the cash limit on claiming cash orders, and location reports while on a job.
 */

const mockPrisma: any = {
  riderLedgerEntry: { groupBy: jest.fn(), createMany: jest.fn(), create: jest.fn() },
  rider: { findUnique: jest.fn(), updateMany: jest.fn() },
  delivery: { findUnique: jest.fn(), findUniqueOrThrow: jest.fn(), findMany: jest.fn(), count: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
  order: { findFirst: jest.fn() },
  $queryRaw: jest.fn(),
  $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(mockPrisma)),
};

jest.mock('../src/config/database', () => ({ __esModule: true, default: mockPrisma }));

const mockEmitTracking = jest.fn().mockResolvedValue(undefined);
jest.mock('../src/services/realtime-order.service', () => ({
  __esModule: true,
  default: {
    emitDeliveryTrackingUpdate: (...args: unknown[]) => mockEmitTracking(...args),
    emitDeliveryClaimed: jest.fn().mockResolvedValue(undefined),
    emitOrderStatusUpdate: jest.fn().mockResolvedValue(undefined),
  },
}));

import { riderMoney, recordSettlement, recordPayout, postDeliveryEntries, setCashLimit, DEFAULT_CASH_LIMIT } from '../src/services/rider-ledger.service';
import riderService from '../src/services/rider.service';

/** groupBy rows for a ledger with these per-type sums. */
function ledger(sums: Partial<Record<string, number>>) {
  return Object.entries(sums).map(([type, amount]) => ({ type, _sum: { amount } }));
}

const approvedRider = { id: 'rider-1', userId: 'user-1', status: 'active', verificationStatus: 'approved', cashLimit: null, isAvailable: true };

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.$queryRaw.mockResolvedValue([{ id: 'rider-1' }]);
  mockPrisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(mockPrisma));
});

describe('riderMoney', () => {
  it('nets earnings against cash held and payouts', async () => {
    // Earned 300 + 100 bonus, collected 5,000 cash, handed in 3,000, paid 200.
    mockPrisma.riderLedgerEntry.groupBy.mockResolvedValue(
      ledger({ delivery_fee: 300, bonus: 100, cod_collected: -5000, cash_deposit: 3000, payout: -200 })
    );
    await expect(riderMoney(mockPrisma, 'rider-1')).resolves.toEqual({
      balance: -1800,
      cashHeld: 2000,
      unpaid: 200,
      earned: 400,
      paidOut: 200,
    });
  });

  it('is all zero for a new rider', async () => {
    mockPrisma.riderLedgerEntry.groupBy.mockResolvedValue([]);
    await expect(riderMoney(mockPrisma, 'rider-1')).resolves.toEqual({ balance: 0, cashHeld: 0, unpaid: 0, earned: 0, paidOut: 0 });
  });
});

describe('recordSettlement', () => {
  beforeEach(() => {
    // Holds 5,000 cash, owed 1,200 of pay.
    mockPrisma.riderLedgerEntry.groupBy.mockResolvedValue(ledger({ delivery_fee: 1200, cod_collected: -5000 }));
  });

  it('records cash handed in plus pay kept as a deposit and a payout of the same amount', async () => {
    await recordSettlement('rider-1', 'admin-1', { cashHandedIn: 3800, keptAsPay: 1200, reference: 'R-1' });
    const { data } = mockPrisma.riderLedgerEntry.createMany.mock.calls[0][0];
    expect(data).toEqual([
      expect.objectContaining({ type: 'cash_deposit', amount: 3800, reference: 'R-1', createdBy: 'admin-1' }),
      expect.objectContaining({ type: 'cash_deposit', amount: 1200 }),
      expect.objectContaining({ type: 'payout', amount: -1200 }),
    ]);
    // Together: +3,800 + 1,200 − 1,200 brings the −3,800 balance to 0 and the 5,000 cash to 0.
    const total = data.reduce((sum: number, e: { amount: number }) => sum + e.amount, 0);
    expect(-3800 + total).toBe(0);
  });

  it('refuses more cash than the rider holds', async () => {
    await expect(recordSettlement('rider-1', 'admin-1', { cashHandedIn: 5000, keptAsPay: 100 })).rejects.toMatchObject({
      code: 'DEPOSIT_EXCEEDS_CASH',
    });
    expect(mockPrisma.riderLedgerEntry.createMany).not.toHaveBeenCalled();
  });

  it('refuses keeping more pay than the rider is owed', async () => {
    await expect(recordSettlement('rider-1', 'admin-1', { cashHandedIn: 0, keptAsPay: 1500 })).rejects.toMatchObject({
      code: 'PAYOUT_EXCEEDS_BALANCE',
    });
  });

  it('refuses an empty settlement and negative amounts', async () => {
    await expect(recordSettlement('rider-1', 'admin-1', {})).rejects.toMatchObject({ code: 'INVALID_AMOUNT' });
    await expect(recordSettlement('rider-1', 'admin-1', { cashHandedIn: -5 })).rejects.toMatchObject({ code: 'INVALID_AMOUNT' });
  });

  it('locks the rider row first so two settlements cannot both pass the checks', async () => {
    await recordSettlement('rider-1', 'admin-1', { cashHandedIn: 100 });
    const sql = mockPrisma.$queryRaw.mock.calls[0][0].join('?');
    expect(sql).toMatch(/FOR UPDATE/);
  });
});

describe('recordPayout', () => {
  it('pays out no more than the platform owes the rider', async () => {
    mockPrisma.riderLedgerEntry.groupBy.mockResolvedValue(ledger({ delivery_fee: 500 }));
    await expect(recordPayout('rider-1', 'admin-1', { amount: 600 })).rejects.toMatchObject({ code: 'PAYOUT_EXCEEDS_BALANCE' });
    mockPrisma.riderLedgerEntry.create.mockResolvedValue({ id: 'e1', amount: -500 });
    await recordPayout('rider-1', 'admin-1', { amount: 500, reference: 'JC-77' });
    expect(mockPrisma.riderLedgerEntry.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ type: 'payout', amount: -500, reference: 'JC-77', createdBy: 'admin-1' }),
    });
  });

  it('refuses when a rider holding cash is owed nothing', async () => {
    mockPrisma.riderLedgerEntry.groupBy.mockResolvedValue(ledger({ delivery_fee: 150, cod_collected: -2000 }));
    await expect(recordPayout('rider-1', 'admin-1', { amount: 150 })).rejects.toMatchObject({ code: 'PAYOUT_EXCEEDS_BALANCE' });
  });
});

describe('postDeliveryEntries', () => {
  it('writes the fee, bonus and cash taken, signed, once per delivery', async () => {
    await postDeliveryEntries(mockPrisma, { riderId: 'rider-1', deliveryId: 'd1', orderId: 'o1', orderNumber: 'N1', fee: 180, bonus: 100, cashCollected: 2400 });
    const call = mockPrisma.riderLedgerEntry.createMany.mock.calls[0][0];
    expect(call.skipDuplicates).toBe(true);
    expect(call.data.map((e: { type: string; amount: number }) => [e.type, e.amount])).toEqual([
      ['delivery_fee', 180],
      ['bonus', 100],
      ['cod_collected', -2400],
    ]);
  });

  it('writes nothing for zero amounts (a prepaid order has no cash entry)', async () => {
    await postDeliveryEntries(mockPrisma, { riderId: 'rider-1', deliveryId: 'd1', orderId: 'o1', orderNumber: 'N1', fee: 150, bonus: 0, cashCollected: 0 });
    expect(mockPrisma.riderLedgerEntry.createMany.mock.calls[0][0].data).toHaveLength(1);
  });
});

describe('setCashLimit', () => {
  it('sets a custom limit, or goes back to the default with null', async () => {
    mockPrisma.rider.updateMany.mockResolvedValue({ count: 1 });
    await expect(setCashLimit('rider-1', 25000)).resolves.toEqual({ cashLimit: 25000, isDefault: false });
    await expect(setCashLimit('rider-1', null)).resolves.toEqual({ cashLimit: DEFAULT_CASH_LIMIT, isDefault: true });
    await expect(setCashLimit('rider-1', -1)).rejects.toMatchObject({ code: 'INVALID_AMOUNT' });
  });
});

describe('claimDelivery and the cash limit', () => {
  const job = { id: 'd1', orderId: 'o1', status: 'pending', riderId: null, pickupLatitude: null, pickupLongitude: null, deliveryLatitude: null, deliveryLongitude: null };

  beforeEach(() => {
    mockPrisma.rider.findUnique.mockResolvedValue(approvedRider);
    mockPrisma.delivery.count.mockResolvedValue(0);
    mockPrisma.delivery.findUnique.mockResolvedValue(job);
    mockPrisma.delivery.findMany.mockResolvedValue([]);
    mockPrisma.delivery.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.delivery.findUniqueOrThrow.mockResolvedValue({ ...job, status: 'assigned', riderId: 'rider-1', riderFee: 120, riderBonus: 0, order: { orderNumber: 'N1', totalAmount: 3000, paymentMethod: 'cod', orderStatus: 'ready' } });
    // Already carrying 8,000 of the 10,000 default.
    mockPrisma.riderLedgerEntry.groupBy.mockResolvedValue(ledger({ cod_collected: -8000 }));
  });

  it('refuses a claim from a rider who is off duty', async () => {
    mockPrisma.rider.findUnique.mockResolvedValue({ ...approvedRider, isAvailable: false });
    await expect(riderService.claimDelivery('user-1', 'd1')).rejects.toMatchObject({ code: 'RIDER_OFF_DUTY' });
  });

  it('refuses a cash order that would take the rider past their limit', async () => {
    mockPrisma.order.findFirst.mockResolvedValue({ id: 'o1', paymentMethod: 'cod', paymentStatus: 'pending', totalAmount: 3000 });
    await expect(riderService.claimDelivery('user-1', 'd1')).rejects.toMatchObject({ code: 'CASH_LIMIT_REACHED', statusCode: 409 });
    expect(mockPrisma.delivery.updateMany).not.toHaveBeenCalled();
  });

  it('counts cash still to collect on jobs the rider already has', async () => {
    mockPrisma.riderLedgerEntry.groupBy.mockResolvedValue([]); // holds nothing yet
    mockPrisma.delivery.findMany.mockResolvedValue([
      { id: 'd0', status: 'in_transit', order: { paymentMethod: 'cod', paymentStatus: 'pending', totalAmount: 8000 } },
    ]);
    mockPrisma.order.findFirst.mockResolvedValue({ id: 'o1', paymentMethod: 'cod', paymentStatus: 'pending', totalAmount: 3000 });
    await expect(riderService.claimDelivery('user-1', 'd1')).rejects.toMatchObject({ code: 'CASH_LIMIT_REACHED' });
  });

  it('still lets the rider take a prepaid order', async () => {
    mockPrisma.order.findFirst.mockResolvedValue({ id: 'o1', paymentMethod: 'safepay', paymentStatus: 'paid', totalAmount: 3000 });
    await riderService.claimDelivery('user-1', 'd1');
    expect(mockPrisma.delivery.updateMany).toHaveBeenCalled();
  });

  it('fixes the fee when the job is claimed (the standard fee when nothing is asked)', async () => {
    mockPrisma.order.findFirst.mockResolvedValue({ id: 'o1', paymentMethod: 'safepay', paymentStatus: 'paid', totalAmount: 3000 });
    await riderService.claimDelivery('user-1', 'd1');
    const { data } = mockPrisma.delivery.updateMany.mock.calls[0][0];
    // Unknown locations: the base fee, never a distance worked out from made-up points.
    expect(data).toEqual(expect.objectContaining({ riderId: 'rider-1', status: 'assigned', riderBonus: 0 }));
    expect(data.riderFee).toBeGreaterThan(0);
  });
});

describe('updateRiderLocation', () => {
  const activeJob = (overrides: Record<string, unknown> = {}) => ({
    id: 'd1',
    orderId: 'o1',
    riderId: 'rider-1',
    status: 'in_transit',
    pickupLatitude: null,
    pickupLongitude: null,
    deliveryLatitude: null,
    deliveryLongitude: null,
    riderLocationAt: null,
    order: { orderNumber: 'N1', totalAmount: 1000, paymentMethod: 'cod', orderStatus: 'in_transit' },
    ...overrides,
  });

  beforeEach(() => {
    mockPrisma.rider.findUnique.mockResolvedValue(approvedRider);
    mockPrisma.delivery.update.mockResolvedValue({});
  });

  it('stores the position and passes it to the customer while the food is on its way', async () => {
    mockPrisma.delivery.findUnique.mockResolvedValue(activeJob({ deliveryLatitude: 24.9, deliveryLongitude: 67.1 }));
    const result = await riderService.updateRiderLocation('user-1', 'd1', 24.86, 67.0);
    expect(mockPrisma.delivery.update).toHaveBeenCalledWith({
      where: { id: 'd1' },
      data: expect.objectContaining({ riderLatitude: 24.86, riderLongitude: 67.0, riderLocationAt: expect.any(Date) }),
    });
    expect(mockEmitTracking).toHaveBeenCalledWith('o1', { latitude: 24.86, longitude: 67.0 }, expect.any(Number));
    expect(result.distanceToDeliveryMeters).toBeGreaterThan(1000);
    expect(result.autoTriggeredStatus).toBeNull();
  });

  it('never triggers an arrival against an unknown location (no made-up coordinates)', async () => {
    mockPrisma.delivery.findUnique.mockResolvedValue(activeJob());
    // Exactly the point the old code fell back to for an unknown drop-off.
    const result = await riderService.updateRiderLocation('user-1', 'd1', 24.8715, 67.0594);
    expect(result.autoTriggeredStatus).toBeNull();
    expect(result.distanceToDeliveryMeters).toBeNull();
    expect(result.isInsideDeliveryGeofence).toBe(false);
  });

  it('does not show the customer where the rider is before pickup', async () => {
    mockPrisma.delivery.findUnique.mockResolvedValue(activeJob({ status: 'assigned', order: { orderNumber: 'N1', totalAmount: 1000, paymentMethod: 'cod', orderStatus: 'ready' } }));
    await riderService.updateRiderLocation('user-1', 'd1', 24.86, 67.0);
    expect(mockPrisma.delivery.update).toHaveBeenCalled();
    expect(mockEmitTracking).not.toHaveBeenCalled();
  });

  it('keeps at most one position every few seconds', async () => {
    mockPrisma.delivery.findUnique.mockResolvedValue(activeJob({ riderLocationAt: new Date(Date.now() - 1000) }));
    await riderService.updateRiderLocation('user-1', 'd1', 24.86, 67.0);
    expect(mockPrisma.delivery.update).not.toHaveBeenCalled();
    expect(mockEmitTracking).not.toHaveBeenCalled();
  });

  it('refuses positions for a finished job and nonsense coordinates', async () => {
    mockPrisma.delivery.findUnique.mockResolvedValue(activeJob({ status: 'delivered' }));
    await expect(riderService.updateRiderLocation('user-1', 'd1', 24.86, 67.0)).rejects.toMatchObject({ code: 'DELIVERY_NOT_ACTIVE' });
    await expect(riderService.updateRiderLocation('user-1', 'd1', 124.86, 67.0)).rejects.toMatchObject({ code: 'INVALID_COORDINATES' });
  });

  it("refuses another rider's job", async () => {
    mockPrisma.delivery.findUnique.mockResolvedValue(activeJob({ riderId: 'rider-2' }));
    await expect(riderService.updateRiderLocation('user-1', 'd1', 24.86, 67.0)).rejects.toMatchObject({ code: 'ACCESS_DENIED' });
  });
});
