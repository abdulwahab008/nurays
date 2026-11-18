import { transferAccountMissing } from '../src/services/order-placement.service';
import { createOrderSchema } from '../src/validators/order.validator';

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
    expect(createOrderSchema.safeParse({ ...base, deliverySlotTime: '12:00-15:00' }).success).toBe(true);
    expect(createOrderSchema.safeParse({ ...base, deliverySlotTime: '12:00-99:00' }).success).toBe(false);
    expect(createOrderSchema.safeParse({ ...base, deliverySlotTime: 'midnight' }).success).toBe(false);
  });

  it('takes a date for the delivery day', () => {
    expect(createOrderSchema.safeParse({ ...base, deliverySlotDate: '2026-11-07' }).success).toBe(true);
    expect(createOrderSchema.safeParse({ ...base, deliverySlotDate: 'tomorrow' }).success).toBe(false);
  });

  it('rejects impossible calendar days instead of rolling them over', () => {
    expect(createOrderSchema.safeParse({ ...base, deliverySlotDate: '2026-13-01' }).success).toBe(false);
    expect(createOrderSchema.safeParse({ ...base, deliverySlotDate: '2026-02-30' }).success).toBe(false);
    expect(createOrderSchema.safeParse({ ...base, deliverySlotDate: '2026-11-07T99:00' }).success).toBe(false);
  });
});
