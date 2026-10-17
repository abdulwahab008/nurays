/**
 * Someone who signs up with "Cook & Sell" starts a home kitchen: the seller row was created with the column's default type
 * ("restaurant"), which then showed on the kitchen's page and in the admin's list. The database is a hand-written double.
 */
const db: any = {};
jest.mock('../src/config/database', () => ({ __esModule: true, default: db }));
jest.mock('../src/config/socket', () => ({ __esModule: true, default: {} }));
jest.mock('../src/middleware/audit', () => ({ recordAudit: jest.fn() }));
jest.mock('../src/jobs/email.jobs', () => ({ queueVerificationEmail: jest.fn(), queuePasswordResetEmail: jest.fn(), queueEmail: jest.fn() }));
jest.mock('../src/services/admin.service', () => ({ __esModule: true, default: { getSettingValue: jest.fn(async () => 15) } }));

import authService from '../src/services/auth.service';

beforeEach(() => {
  const tx = { user: { create: jest.fn(async ({ data }: any) => ({ id: 'u1', ...data, profile: { fullName: 'Zainab' } })), update: jest.fn() } };
  db.user = { findFirst: jest.fn(async () => null), findUnique: jest.fn(async () => null), update: jest.fn(async () => ({})) };
  db.$transaction = jest.fn(async (fn: (t: unknown) => unknown) => fn(tx));
  db.seller = { create: jest.fn(async ({ data }: any) => ({ id: 's1', status: 'active', ...data })) };
  db.rider = { create: jest.fn(async () => ({})) };
  db.emailVerification = { create: jest.fn(async () => ({})) };
});

describe('signing up as a kitchen', () => {
  it('creates a home kitchen waiting for approval', async () => {
    const out = await authService.register('zainab.kitchen@example.com', 'Lantern-Quartz-71', 'seller', 'Zainab Bukhari', undefined, 'Lahore', undefined, "Zainab's Tandoor Kitchen");
    const data = db.seller.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ userId: 'u1', businessName: "Zainab's Tandoor Kitchen", businessType: 'home_kitchen', verificationStatus: 'pending' });
    expect(out.seller).toMatchObject({ id: 's1', businessName: "Zainab's Tandoor Kitchen" });
  });

  it('does not create a kitchen for a customer', async () => {
    await authService.register('ayesha@example.com', 'Lantern-Quartz-71', 'customer', 'Ayesha Khan');
    expect(db.seller.create).not.toHaveBeenCalled();
  });
});
