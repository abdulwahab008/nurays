/**
 * The demo seed (scripts/seed-ideal-flow-users.ts) never runs against production, and gives the demo rider the highest
 * per-rider cash limit an admin can set, so cash from test orders never stops them being offered cash orders. It writes
 * nothing to the rider's ledger.
 */
import { Prisma } from '@prisma/client';
import { assertDemoSeedAllowed, demoRiderCashLimit } from '../scripts/seed-ideal-flow-users';
import { MAX_RIDER_CASH_LIMIT } from '../src/validators/admin.validator';

jest.mock('../src/config/database', () => ({ __esModule: true, default: {} }));

describe('the demo seed', () => {
  it('refuses to run in production, and any unrecognised NODE_ENV counts as production', () => {
    expect(() => assertDemoSeedAllowed({ NODE_ENV: 'production' })).toThrow(/never runs in production/);
    expect(() => assertDemoSeedAllowed({})).toThrow(/never runs in production/);
    expect(() => assertDemoSeedAllowed({ NODE_ENV: 'staging' })).toThrow(/never runs in production/);
  });

  it('runs in development and test', () => {
    expect(() => assertDemoSeedAllowed({ NODE_ENV: 'development' })).not.toThrow();
    expect(() => assertDemoSeedAllowed({ NODE_ENV: 'test' })).not.toThrow();
  });

  it('gives the demo rider the highest limit an admin can set', () => {
    expect(demoRiderCashLimit(null)).toBe(MAX_RIDER_CASH_LIMIT);
    expect(demoRiderCashLimit(undefined)).toBe(MAX_RIDER_CASH_LIMIT);
    expect(demoRiderCashLimit(new Prisma.Decimal(10_000))).toBe(MAX_RIDER_CASH_LIMIT);
  });

  it('keeps a higher limit already set', () => {
    expect(demoRiderCashLimit(new Prisma.Decimal(MAX_RIDER_CASH_LIMIT + 5))).toBe(MAX_RIDER_CASH_LIMIT + 5);
  });
});
