/**
 * Money the kitchen collected itself (a confirmed transfer): it owes Nuray the order total T less its own share E.
 * A refund the admin dismissed cancels that debt only where the order earns nothing and no other refund returned
 * the money. Order here: T = 1,050 (goods 1,000 + GST 50), E = 850, so a delivered order owes 200.
 */
jest.mock('../src/config/database', () => ({ __esModule: true, default: {} }));

import { sellerBalanceLines } from '../src/services/seller-balance.service';

const SELLER = 'k1';
const T = 1050;
const E = 850;

function row(over: Record<string, unknown>) {
  return {
    id: 'o1',
    order_number: 'FN1',
    created_at: new Date(),
    delivered_at: new Date(),
    total_amount: T,
    payment_method: 'jazzcash',
    payment_collected_by: 'seller',
    payment_status: 'paid',
    has_paid_at: true,
    order_status: 'delivered',
    delivery_type: 'self_pickup',
    delivery_provider: null,
    delivery_fee_breakdown: [],
    live_payout: E,
    first_seller_id: SELLER,
    refunds_failed: 0,
    refunds_completed: 0,
    refunds_active: 0,
    delivery_fee: 0,
    refunds_before: 0,
    refunds_after: 0,
    ...over,
  };
}

async function owed(over: Record<string, unknown>) {
  const client = { $queryRaw: async () => [row(over)] } as unknown as Parameters<typeof sellerBalanceLines>[0];
  return (await sellerBalanceLines(client, SELLER)).sellerOwesPlatform;
}

describe('a dismissed refund on money the kitchen collected', () => {
  it('a delivered order owes T - E', async () => {
    expect(await owed({})).toBe(200);
  });

  it('a full refund dismissed on a delivered order leaves the kitchen owing T - E, not T less', async () => {
    expect(await owed({ refunds_failed: T })).toBe(200);
  });

  it('a partial refund dismissed on a delivered order changes nothing', async () => {
    expect(await owed({ refunds_failed: 300 })).toBe(200);
  });

  it('a full refund still waiting to be sent charges the kitchen the whole total', async () => {
    expect(await owed({ payment_status: 'refund_pending', refunds_active: T, refunds_after: T })).toBe(T);
  });

  it('a partial refund after delivery takes its share of the kitchen\'s earnings: half the dishes refunded, half of E', async () => {
    expect(await owed({ refunds_active: 525, refunds_after: 525 })).toBe(T - E / 2);
  });

  it('on a cancelled order a dismissed refund cancels the debt', async () => {
    expect(await owed({ order_status: 'cancelled', delivered_at: null, refunds_failed: T })).toBe(0);
  });

  it('a refund sent after an earlier one was dismissed is still recovered from the kitchen', async () => {
    expect(await owed({ order_status: 'cancelled', delivered_at: null, payment_status: 'refunded', refunds_failed: T, refunds_completed: T, refunds_active: T })).toBe(T);
  });

  it('a second refund waiting to be sent is charged too', async () => {
    expect(await owed({ order_status: 'cancelled', delivered_at: null, payment_status: 'refund_pending', refunds_failed: T, refunds_active: T })).toBe(T);
  });

  it('a dismissed part cancels only what no other refund returned', async () => {
    expect(await owed({ order_status: 'cancelled', delivered_at: null, refunds_failed: 750, refunds_completed: 300, refunds_active: 300 })).toBe(300);
  });
});
