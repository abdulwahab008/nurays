import test from 'node:test';
import assert from 'node:assert/strict';
import { dealsOnOneUnit, getPromotionLabel, getStackedDiscountedPrice, priceDealLines, priceTray } from '../../lib/pricing.ts';

// What the customer sees on a dish, in the cart and at checkout has to be what the server charges, so the discount maths is
// written once (the server's counterpart is computeOrderCatalogDiscounts in the backend).
const pct = (discountValue: number) => ({ type: 'percentage', discountValue });
const off = (discountValue: number) => ({ type: 'fixed', discountValue });

test('a dish with no deal costs its price', () => {
  assert.equal(getStackedDiscountedPrice(1000, []), 1000);
  assert.equal(getStackedDiscountedPrice(1000, undefined), 1000);
  assert.equal(getStackedDiscountedPrice(1000, null), 1000);
});

test('a percentage deal and a fixed deal each take what they say', () => {
  assert.equal(getStackedDiscountedPrice(1000, [pct(10)]), 900);
  assert.equal(getStackedDiscountedPrice(1000, [off(200)]), 800);
});

test('stacked, the percentage comes first and the fixed amount after, whatever order the deals arrive in', () => {
  assert.equal(getStackedDiscountedPrice(1000, [pct(10), off(200)]), 700);
  assert.equal(getStackedDiscountedPrice(1000, [off(200), pct(10)]), 700);
  assert.equal(getStackedDiscountedPrice(1000, [off(100), pct(50), off(100)]), 300);
});

test('a discounted dish never costs less than Rs 1', () => {
  assert.equal(getStackedDiscountedPrice(150, [off(200)]), 1);
  assert.equal(getStackedDiscountedPrice(150, [pct(100)]), 1);
});

// The audit's case: Rs 200 off with a Rs 1,500 minimum came off every unit of a Rs 1,250 order.
const eid200 = { id: 'eid200', type: 'fixed', discountValue: 200, minOrderAmount: 1500 };

test("a deal with a minimum order counts only once that kitchen's goods reach it", () => {
  const under = priceDealLines([{ sellerId: 'k1', unitPrice: 250, quantity: 5, promos: [eid200] }]);
  assert.deepEqual(under, { unitPrices: [250], applied: [[]] });

  const reached = priceDealLines([{ sellerId: 'k1', unitPrice: 250, quantity: 6, promos: [eid200] }]);
  assert.deepEqual(reached, { unitPrices: [50], applied: [[eid200]] });

  const otherKitchen = priceDealLines([
    { sellerId: 'k1', unitPrice: 250, quantity: 5, promos: [eid200] },
    { sellerId: 'k2', unitPrice: 1000, quantity: 1, promos: [] },
  ]);
  assert.deepEqual(otherKitchen.unitPrices, [250, 1000]);
});

test('a capped deal takes at most its cap off the whole tray', () => {
  const capped = { id: 'c', type: 'percentage', discountValue: 20, maxDiscountAmount: 300 };
  const lines = [
    { sellerId: 'k1', unitPrice: 1000, quantity: 3, promos: [capped] },
    { sellerId: 'k1', unitPrice: 455, quantity: 2, promos: [capped] },
  ];
  const { unitPrices } = priceDealLines(lines);
  const off = lines.reduce((sum, l, i) => sum + (l.unitPrice - unitPrices[i]) * l.quantity, 0);
  assert.ok(off <= 300 && off > 290, `took ${off}`);
  assert.equal(getStackedDiscountedPrice(1000, [capped]), 800);
  assert.equal(getStackedDiscountedPrice(2000, [capped]), 1700);
});

test('a capped deal is counted in the whole rupees charged, so rounding each unit cannot carry it over the cap', () => {
  // 10% of Rs 107 is 10.70 a unit: 53.50 on five, under the cap of 54, but each unit is charged Rs 11 less.
  const capped = { id: 'c', type: 'percentage', discountValue: 10, maxDiscountAmount: 54 };
  assert.deepEqual(priceDealLines([{ sellerId: 'k1', unitPrice: 107, quantity: 5, promos: [capped] }]).unitPrices, [97]);
  assert.deepEqual(priceDealLines([{ sellerId: 'k1', unitPrice: 107, quantity: 4, promos: [capped] }]).unitPrices, [96]);
});

test('the tray is priced line by line from the cart the API returns', () => {
  const items = [
    { quantity: 2, product: { id: 'samosa', price: 250 }, variant: { price: 500 }, seller: { id: 'k1' } },
    { quantity: 1, product: { id: 'biryani', price: 650 }, variant: null, seller: { id: 'k1' } },
  ];
  assert.deepEqual(priceTray(items, { samosa: [eid200] }), { unitPrices: [300, 650], applied: [[eid200], []] });
  assert.deepEqual(priceTray(items.slice(1), { biryani: [eid200] }), { unitPrices: [650], applied: [[]] });
});

test("a dish's own card shows only the deals one unit of it gets", () => {
  const tenPercent = { id: 'p', type: 'percentage', discountValue: 10 };
  assert.deepEqual(dealsOnOneUnit(650, [eid200, tenPercent]), [tenPercent]);
  assert.deepEqual(dealsOnOneUnit(1500, [eid200]), [eid200]);
  assert.deepEqual(dealsOnOneUnit(650, undefined), []);
});

test('the result is whole rupees', () => {
  assert.equal(getStackedDiscountedPrice(999, [pct(15)]), 849); // 849.15
  assert.equal(getStackedDiscountedPrice(15, [pct(10)]), 14); // 13.5 rounds up
  assert.equal(getStackedDiscountedPrice(333, [pct(33)]), 223); // 223.11
});

test('a deal with no size, a negative size or a kind the price does not use leaves the price alone', () => {
  assert.equal(getStackedDiscountedPrice(1000, [pct(0), off(0), pct(-10), off(-50)]), 1000);
  assert.equal(getStackedDiscountedPrice(1000, [{ type: 'bundle', discountValue: 300 }, { type: 'buy_x_get_y', discountValue: 1 }]), 1000);
});

const words = (key: string, vars?: Record<string, string | number>) => `${key}:${JSON.stringify(vars ?? {})}`;
const money = (n: number) => `Rs ${n}`;

test('a deal is labelled by its size, in the page\'s own words', () => {
  assert.equal(getPromotionLabel({ ...pct(10), name: 'Weekend' }, words as never, money), 'percentOff:{"value":10}');
  assert.equal(getPromotionLabel({ ...off(200), name: 'Weekend' }, words as never, money), 'amountOff:{"amount":"Rs 200"}');
});

test('a deal with no size is labelled by its own name, and by "deal" when it has none', () => {
  assert.equal(getPromotionLabel({ type: 'bundle', discountValue: 0, name: 'Family box' }, words as never, money), 'Family box');
  assert.equal(getPromotionLabel({ type: 'buy_x_get_y', discountValue: 0 }, words as never, money), 'deal:{}');
  assert.equal(getPromotionLabel({ type: 'percentage', discountValue: 0, name: 'Free tea' }, words as never, money), 'Free tea');
});
