import { orderFingerprint } from '../src/utils/orderFingerprint';

describe('the fingerprint of a checkout (MONEY-7)', () => {
  const base = { items: [{ productId: 'a', quantity: 1 }, { productId: 'b', quantity: 2 }], deliveryType: 'home_delivery', deliveryAddressId: 'addr1', paymentMethod: 'cod' };
  it('is the same however the same request is written', () => {
    const f = orderFingerprint(base);
    expect(orderFingerprint({ ...base, items: [{ productId: 'b', quantity: 2 }, { productId: 'a', quantity: 1 }] })).toBe(f);
    expect(orderFingerprint({ ...base, items: [{ productId: 'a', quantity: 1 }, { productId: 'b', quantity: 1 }, { productId: 'b', quantity: 1 }] })).toBe(f);
    expect(orderFingerprint({ ...base, promotionCode: ' save10 ' })).toBe(orderFingerprint({ ...base, promotionCode: 'SAVE10' }));
    expect(orderFingerprint({ ...base, deliveryInstructions: '' })).toBe(f);
  });
  it('differs when anything that changes the order differs', () => {
    const f = orderFingerprint(base);
    for (const other of [
      { ...base, items: [{ productId: 'a', quantity: 2 }, { productId: 'b', quantity: 2 }] },
      { ...base, items: [{ productId: 'a', quantity: 1 }] },
      { ...base, items: [{ productId: 'a', variantId: 'large', quantity: 1 }, { productId: 'b', quantity: 2 }] },
      { ...base, deliveryAddressId: 'addr2' },
      { ...base, deliveryType: 'self_pickup' },
      { ...base, paymentMethod: 'wallet' },
      { ...base, promotionCode: 'SAVE10' },
      { ...base, deliverySlotDate: '2026-10-23' },
      { ...base, deliveryInstructions: 'Ring twice' },
    ]) expect(orderFingerprint(other)).not.toBe(f);
  });
  it('is 64 hex characters (the column is CHAR(64))', () => {
    expect(orderFingerprint(base)).toMatch(/^[0-9a-f]{64}$/);
  });
});
