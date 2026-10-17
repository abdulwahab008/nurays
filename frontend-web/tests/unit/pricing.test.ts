import test from 'node:test';
import assert from 'node:assert/strict';
import { getPromotionLabel, getStackedDiscountedPrice } from '../../lib/pricing.ts';

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

test('a price never goes below zero', () => {
  assert.equal(getStackedDiscountedPrice(150, [off(200)]), 0);
  assert.equal(getStackedDiscountedPrice(150, [pct(100)]), 0);
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
