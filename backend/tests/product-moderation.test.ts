/**
 * Turning a dish down is told to the kitchen with a reason, so there has to be one: the admin screen used to send the fixed
 * words "Rejected by admin", which told the kitchen nothing about what to fix. (A kitchen and a rider that are turned down
 * already need a reason of at least five characters.) The database is a hand-written double.
 */
const db: any = {};
jest.mock('../src/config/database', () => ({ __esModule: true, default: db }));
jest.mock('../src/config/socket', () => ({ __esModule: true, default: {} }));
jest.mock('../src/storage', () => ({ presentFile: jest.fn() }));
const notifySeller = jest.fn(async () => undefined);
jest.mock('../src/services/notify.service', () => ({ notify: jest.fn(), notifySeller: (...a: unknown[]) => (notifySeller as any)(...a) }));

import adminService from '../src/services/admin.service';
import { moderateProductSchema } from '../src/validators/admin.validator';

beforeEach(() => {
  notifySeller.mockClear();
  db.product = {
    findUnique: jest.fn(async () => ({ id: 'p1', sellerId: 's1', name: 'Chicken Karahi' })),
    update: jest.fn(async ({ data }: any) => ({ id: 'p1', approvalStatus: data.approvalStatus, isActive: data.isActive })),
  };
});

describe('turning a dish down', () => {
  it('needs a reason, and changes nothing without one', async () => {
    for (const reason of [undefined, '', '   ', 'no', 'meh!']) {
      await expect(adminService.moderateProduct('p1', 'admin1', false, reason)).rejects.toMatchObject({ statusCode: 400, code: 'REASON_REQUIRED' });
    }
    expect(db.product.update).not.toHaveBeenCalled();
    expect(notifySeller).not.toHaveBeenCalled();
  });

  it('keeps the reason as written and tells the kitchen in those words', async () => {
    await adminService.moderateProduct('p1', 'admin1', false, '  The photo does not show the dish  ');
    expect(db.product.update.mock.calls[0][0].data).toMatchObject({ approvalStatus: 'rejected', isActive: false, rejectionReason: 'The photo does not show the dish' });
    const sent = (notifySeller.mock.calls[0] as unknown[])[1] as { message: string };
    expect(sent.message).toBe('"Chicken Karahi" wasn\'t approved: The photo does not show the dish');
  });

  it('is refused by the request check too, before it reaches the service', () => {
    expect(moderateProductSchema.safeParse({ approved: false }).success).toBe(false);
    expect(moderateProductSchema.safeParse({ approved: false, reason: 'ok' }).success).toBe(false);
    expect(moderateProductSchema.safeParse({ approved: false, reason: 'Blurry photo' }).success).toBe(true);
  });
});

describe('approving a dish', () => {
  it('needs no reason and clears an earlier one', async () => {
    expect(moderateProductSchema.safeParse({ approved: true }).success).toBe(true);
    await adminService.moderateProduct('p1', 'admin1', true);
    expect(db.product.update.mock.calls[0][0].data).toMatchObject({ approvalStatus: 'approved', isActive: true, rejectionReason: null });
  });
});
