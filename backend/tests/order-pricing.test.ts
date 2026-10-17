import { Prisma } from '@prisma/client';
import { codeDiscount, priceLines, shareCodeDiscount, splitDeliveryFees } from '../src/utils/orderPricing';
import { priceOrder, roundMoney } from '../src/utils/pricing';

// The arithmetic of placing an order: no database, so every figure below can be worked out by hand.

describe('priceLines', () => {
  it('prices each line at its discounted unit price, with the commission on it and the kitchen\'s payout', () => {
    const { lines, subtotal } = priceLines(
      [
        { quantity: 2, commissionRate: 15 },
        { quantity: 3, commissionRate: 10 },
      ],
      [300, 100]
    );
    expect(lines).toEqual([
      { unitPrice: 300, totalPrice: 600, commissionAmount: 90, sellerPayout: 510 },
      { unitPrice: 100, totalPrice: 300, commissionAmount: 30, sellerPayout: 270 },
    ]);
    expect(subtotal).toBe(900);
  });

  it('reads the kitchen\'s rate as a database decimal, as text, or as a number', () => {
    const { lines, subtotal } = priceLines(
      [
        { quantity: 1, commissionRate: new Prisma.Decimal('12.5') },
        { quantity: 4, commissionRate: 0 },
        { quantity: 2, commissionRate: '20' },
      ],
      [800, 125, 250]
    );
    expect(lines.map((l) => [l.totalPrice, l.commissionAmount, l.sellerPayout])).toEqual([
      [800, 100, 700],
      [500, 0, 500],
      [500, 100, 400],
    ]);
    expect(subtotal).toBe(1800);
  });

  it('is nothing for an empty cart', () => {
    expect(priceLines([], [])).toEqual({ lines: [], subtotal: 0 });
  });

  it('leaves what it is given as it was', () => {
    const lines = Object.freeze([Object.freeze({ quantity: 2, commissionRate: 15 })]);
    const prices = Object.freeze([300]);
    expect(() => priceLines(lines, prices)).not.toThrow();
  });
});

describe('codeDiscount', () => {
  const percent = (discountValue: unknown, maxDiscountAmount?: unknown) => ({ discountType: 'percentage', discountValue, maxDiscountAmount });
  const fixed = (discountValue: unknown) => ({ discountType: 'fixed', discountValue });

  it('takes a percentage of the part of the order the code covers', () => {
    expect(codeDiscount(percent(10), 1000)).toBe(100);
    expect(codeDiscount(percent(100), 850)).toBe(850);
    expect(codeDiscount(percent(15), 0)).toBe(0);
  });

  it('stops a percentage at the code\'s cap, when the cap is the smaller', () => {
    expect(codeDiscount(percent(50, 300), 2000)).toBe(300);
    expect(codeDiscount(percent(10, 500), 1000)).toBe(100);
    expect(codeDiscount(percent(10, null), 1000)).toBe(100);
  });

  it('takes a fixed amount', () => {
    expect(codeDiscount(fixed(200), 1000)).toBe(200);
  });

  it('never takes more than the part of the order it covers', () => {
    expect(codeDiscount(fixed(500), 300)).toBe(300);
    expect(codeDiscount(percent(100), 300)).toBe(300);
  });

  it('reads the values as database decimals', () => {
    expect(codeDiscount(fixed(new Prisma.Decimal('250')), 1000)).toBe(250);
    expect(codeDiscount(percent(new Prisma.Decimal('15'), new Prisma.Decimal('90')), 1000)).toBe(90);
  });

  it('is exact for a whole-rupee total and a whole percentage, with nothing left in the last place', () => {
    // Dividing the percentage by 100 first made the first of these 1890.0000000000002.
    expect(codeDiscount(percent(54), 3500)).toBe(1890);
    expect(codeDiscount(percent(55), 200)).toBe(110);
    for (let total = 100; total <= 20000; total += 37) {
      for (const value of [5, 10, 15, 20, 25, 33, 50, 54, 55, 56, 67, 81]) {
        const discount = codeDiscount(percent(value), total);
        if (roundMoney(discount) !== discount) throw new Error(`${value}% of ${total} is ${discount}`);
      }
    }
  });

  it('gives the total checkout adds up: 54% off Rs 3,500 leaves Rs 1,610 and a total of Rs 1,691', () => {
    // The total is whole rupees: 1,610 + 5% GST is 1,690.50, which rounds up. A discount of 1890.0000000000002 rounded it down.
    const total = (price: number, value: number) => priceOrder(price - codeDiscount(percent(value), price), 0).totalAmount;
    expect(total(3500, 54)).toBe(1691);
    expect(total(6500, 54)).toBe(3140);
    expect(total(200, 55)).toBe(95);
    expect(total(1000, 10)).toBe(945);
  });
});

describe('shareCodeDiscount', () => {
  const line = (totalPrice: number, commissionRate: number) => {
    const commissionAmount = (totalPrice * commissionRate) / 100;
    return { totalPrice, commissionRate, commissionAmount, sellerPayout: totalPrice - commissionAmount };
  };

  it('splits the discount over the covered lines in proportion to what they cost', () => {
    const shares = shareCodeDiscount([line(100, 10), line(200, 10), line(300, 10)], 60, false);
    expect(shares.map((s) => s.promoDiscount)).toEqual([10, 20, 30]);
  });

  it('gives the rounding left over to the last line, so the parts add up to the discount', () => {
    const shares = shareCodeDiscount([line(100, 10), line(100, 10), line(100, 10)], 100, false);
    expect(shares.map((s) => s.promoDiscount)).toEqual([33.33, 33.33, 33.34]);
  });

  it('leaves the kitchen\'s side alone when the platform funds the code', () => {
    const shares = shareCodeDiscount([line(100, 10), line(200, 10), line(300, 10)], 60, false);
    expect(shares.map((s) => [s.commissionAmount, s.sellerPayout])).toEqual([
      [10, 90],
      [20, 180],
      [30, 270],
    ]);
  });

  it('works the commission and the payout out again on what the customer pays when the kitchen funds the code', () => {
    // 1,000 less the 100 off is 900: commission 10% of 900, not of 1,000, and the kitchen is paid the rest.
    expect(shareCodeDiscount([line(1000, 10)], 100, true)).toEqual([{ promoDiscount: 100, commissionAmount: 90, sellerPayout: 810 }]);
    // Each line at its own rate: 400 at 15% takes 100 off (net 300), 600 at 20% takes 150 off (net 450).
    expect(shareCodeDiscount([line(400, 15), line(600, 20)], 250, true)).toEqual([
      { promoDiscount: 100, commissionAmount: 45, sellerPayout: 255 },
      { promoDiscount: 150, commissionAmount: 90, sellerPayout: 360 },
    ]);
  });

  it('is nothing for no lines, and leaves what it is given as it was', () => {
    expect(shareCodeDiscount([], 100, true)).toEqual([]);
    const lines = Object.freeze([Object.freeze(line(1000, 10))]);
    expect(() => shareCodeDiscount(lines, 100, true)).not.toThrow();
  });
});

describe('splitDeliveryFees', () => {
  it('has the customer pay a fee the kitchen set', () => {
    expect(splitDeliveryFees([{ sellerId: 'k1', fee: 150, pricedByPlatform: false }])).toEqual({
      deliveryFee: 150,
      sellerDeliveryCharge: 0,
      breakdown: [{ sellerId: 'k1', fee: 150, provider: 'self', paidBy: 'customer' }],
    });
  });

  it('has the kitchen pay a fee Nuray priced, for a Nuray rider, and the customer nothing', () => {
    expect(splitDeliveryFees([{ sellerId: 'k1', fee: 120, pricedByPlatform: true }])).toEqual({
      deliveryFee: 0,
      sellerDeliveryCharge: 120,
      breakdown: [{ sellerId: 'k1', fee: 120, provider: 'platform', paidBy: 'seller' }],
    });
  });

  it('adds the two kinds separately, and keeps a kitchen with no fee out of the record', () => {
    expect(
      splitDeliveryFees([
        { sellerId: 'k1', fee: 0, pricedByPlatform: false },
        { sellerId: 'k2', fee: 80, pricedByPlatform: false },
        { sellerId: 'k3', fee: 100, pricedByPlatform: true },
        { sellerId: 'k4', fee: 0, pricedByPlatform: true },
        { sellerId: 'k5', fee: 70, pricedByPlatform: false },
      ])
    ).toEqual({
      deliveryFee: 150,
      sellerDeliveryCharge: 100,
      breakdown: [
        { sellerId: 'k2', fee: 80, provider: 'self', paidBy: 'customer' },
        { sellerId: 'k3', fee: 100, provider: 'platform', paidBy: 'seller' },
        { sellerId: 'k5', fee: 70, provider: 'self', paidBy: 'customer' },
      ],
    });
  });

  it('is nothing for no kitchens', () => {
    expect(splitDeliveryFees([])).toEqual({ deliveryFee: 0, sellerDeliveryCharge: 0, breakdown: [] });
  });
});
