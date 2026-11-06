import { slotProblem, transferAccountMissing } from '../src/services/order-placement.service';
import { createOrderSchema } from '../src/validators/order.validator';

// 2026-11-06 12:40 in Pakistan (UTC+5) is 07:40 UTC.
const LUNCHTIME_PKT = new Date('2026-11-06T07:40:00Z');
// 2026-11-07 02:00 in Pakistan is still 2026-11-06 in UTC.
const AFTER_MIDNIGHT_PKT = new Date('2026-11-06T21:00:00Z');

describe('slotProblem', () => {
  it("refuses today's morning window once it has closed", () => {
    expect(slotProblem('morning', undefined, LUNCHTIME_PKT)).toMatch(/already passed/);
    expect(slotProblem('morning', '2026-11-06', LUNCHTIME_PKT)).toMatch(/already passed/);
  });

  it("accepts today's windows that are still open, and any window on a later day", () => {
    expect(slotProblem('afternoon', undefined, LUNCHTIME_PKT)).toBeNull();
    expect(slotProblem('evening', undefined, LUNCHTIME_PKT)).toBeNull();
    expect(slotProblem('morning', '2026-11-07', LUNCHTIME_PKT)).toBeNull();
  });

  it('works out today in Pakistan time, not UTC', () => {
    expect(slotProblem('morning', '2026-11-06', AFTER_MIDNIGHT_PKT)).toMatch(/day has already passed/);
    expect(slotProblem('morning', '2026-11-07', AFTER_MIDNIGHT_PKT)).toBeNull();
    expect(slotProblem('morning', undefined, AFTER_MIDNIGHT_PKT)).toBeNull();
  });

  it('accepts an order with no window', () => {
    expect(slotProblem(undefined, undefined, LUNCHTIME_PKT)).toBeNull();
  });
});

describe('transferAccountMissing', () => {
  const none = { bankAccountNumber: null, jazzcashNumber: null, easypaisaNumber: '  ' };
  const all = { bankAccountNumber: 'PK36SCBL0000001123456702', jazzcashNumber: '03001234567', easypaisaNumber: '03451234567' };

  it('refuses a transfer to a kitchen that has no account for it', () => {
    expect(transferAccountMissing('bank', none)).toBe(true);
    expect(transferAccountMissing('jazzcash', none)).toBe(true);
    expect(transferAccountMissing('easypaisa', none)).toBe(true);
  });

  it('accepts a transfer when the account is there, and never blocks cash, wallet or online payment', () => {
    expect(transferAccountMissing('bank', all)).toBe(false);
    expect(transferAccountMissing('jazzcash', all)).toBe(false);
    expect(transferAccountMissing('easypaisa', all)).toBe(false);
    for (const method of ['cod', 'wallet', 'safepay']) expect(transferAccountMissing(method, none)).toBe(false);
  });
});

describe('createOrderSchema delivery slot', () => {
  const base = {
    items: [{ productId: '7d0f2b0e-4b8a-4c1e-9a3b-2f6d9e1c5a10', quantity: 1 }],
    deliveryType: 'home_delivery',
    paymentMethod: 'cod',
  };

  it('takes only the three windows checkout offers', () => {
    expect(createOrderSchema.safeParse({ ...base, deliverySlotTime: 'evening' }).success).toBe(true);
    expect(createOrderSchema.safeParse({ ...base, deliverySlotTime: 'midnight' }).success).toBe(false);
  });

  it('takes a date for the delivery day', () => {
    expect(createOrderSchema.safeParse({ ...base, deliverySlotDate: '2026-11-07' }).success).toBe(true);
    expect(createOrderSchema.safeParse({ ...base, deliverySlotDate: 'tomorrow' }).success).toBe(false);
  });
});
