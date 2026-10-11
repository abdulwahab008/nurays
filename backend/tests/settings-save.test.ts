/**
 * Saving the platform settings is all or nothing: the settings belong together (the delivery prices, the commission), and a save
 * that stopped half way used to leave some of the boxes the admin filled in applied and others not. The database is a double.
 */
const db: any = {};
jest.mock('../src/config/database', () => ({ __esModule: true, default: db }));
jest.mock('../src/config/socket', () => ({ __esModule: true, default: {} }));
jest.mock('../src/storage', () => ({ presentFile: jest.fn() }));
jest.mock('../src/services/notify.service', () => ({ notify: jest.fn(), notifySeller: jest.fn() }));
jest.mock('../src/services/delivery-pricing.service', () => ({
  DELIVERY_SETTING_DEFAULTS: { deliveryPerKm: 20, deliveryIncludedKm: 3, deliveryMaxKm: 20, deliveryFallbackFee: 150 },
  invalidateDeliveryPricing: jest.fn(),
}));

import adminService from '../src/services/admin.service';

beforeEach(() => {
  db.systemSetting = {
    upsert: jest.fn((args: any) => ({ __op: args })),
    findMany: jest.fn(async () => []),
  };
  db.$transaction = jest.fn(async (ops: unknown) => (Array.isArray(ops) ? ops : []));
});

describe('saving platform settings', () => {
  it('writes every box in one transaction', async () => {
    await adminService.updateSettings({ commissionRate: 12, minPayoutAmount: 500, deliveryPerKm: 25 }, 'admin1');
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    const ops = db.$transaction.mock.calls[0][0] as Array<{ __op: { where: { key: string } } }>;
    expect(ops.map((o) => o.__op.where.key).sort()).toEqual(['commissionRate', 'deliveryPerKm', 'minPayoutAmount']);
  });

  it('is refused whole when a delivery price is out of range, with nothing written', async () => {
    await expect(adminService.updateSettings({ commissionRate: 12, deliveryMaxKm: 0 }, 'admin1')).rejects.toMatchObject({ statusCode: 400, code: 'INVALID_SETTING' });
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(db.systemSetting.upsert).not.toHaveBeenCalled();
  });

  it('leaves everything as it was when the transaction fails', async () => {
    db.$transaction = jest.fn(async () => {
      throw new Error('connection lost');
    });
    await expect(adminService.updateSettings({ commissionRate: 12, minPayoutAmount: 500 }, 'admin1')).rejects.toThrow('connection lost');
    // the writes are one batch handed to the transaction: none is awaited on its own
    expect(db.$transaction).toHaveBeenCalledTimes(1);
  });
});
