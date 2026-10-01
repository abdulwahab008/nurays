import {
  parseBreakdown,
  selfDeliveryFeeFor,
  platformDeliveryFee,
  sumSelfDeliveryFees,
} from '../src/utils/deliveryEarnings';

const breakdown = [
  { sellerId: 'self-1', fee: 100, provider: 'self' },
  { sellerId: 'plat-1', fee: 60, provider: 'platform' },
];

describe('delivery fee ownership', () => {
  it('a self-delivering seller keeps only their own fee', () => {
    expect(selfDeliveryFeeFor(breakdown, 'self-1')).toBe(100);
    expect(selfDeliveryFeeFor(breakdown, 'plat-1')).toBe(0);
    expect(selfDeliveryFeeFor(breakdown, 'someone-else')).toBe(0);
  });

  it('only the platform-delivered part of the fee is platform revenue', () => {
    expect(platformDeliveryFee(160, breakdown)).toBe(60);
  });

  it('orders from before the breakdown existed are all platform revenue', () => {
    expect(platformDeliveryFee(150, null)).toBe(150);
    expect(selfDeliveryFeeFor(null, 'self-1')).toBe(0);
  });

  it('tolerates malformed data', () => {
    expect(parseBreakdown('nope')).toEqual([]);
    expect(parseBreakdown([null, 3, { sellerId: '', fee: 5 }, { sellerId: 'a', fee: -1 }])).toEqual([]);
  });

  it('never reports a negative platform fee', () => {
    expect(platformDeliveryFee(50, [{ sellerId: 'x', fee: 100, provider: 'self' }])).toBe(0);
  });

  describe('sumSelfDeliveryFees', () => {
    const orders = [
      { id: 'o1', deliveryFeeBreakdown: breakdown, paymentMethod: 'bank' },
      { id: 'o1', deliveryFeeBreakdown: breakdown, paymentMethod: 'bank' }, // same order, second item
      { id: 'o2', deliveryFeeBreakdown: breakdown, paymentMethod: 'cod' },
      { id: 'o3', deliveryFeeBreakdown: null, paymentMethod: 'wallet' },
    ];

    it('counts each order once', () => {
      expect(sumSelfDeliveryFees(orders, 'self-1', { onlineOnly: false })).toBe(200);
    });

    it('excludes COD when only online money is payable', () => {
      expect(sumSelfDeliveryFees(orders, 'self-1', { onlineOnly: true })).toBe(100);
    });
  });
});
