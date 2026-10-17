import { applyStackedDiscount, priceOrder } from '../src/utils/pricing';
// The web app's side of the same sums. Both files import nothing, so a test can read them as they are.
import { orderTotals } from '../../frontend-web/lib/order-totals';
import { getStackedDiscountedPrice } from '../../frontend-web/lib/pricing';

// What checkout shows has to be what the server charges. The two sides write these sums separately, the web in
// frontend-web/lib/ and the server in utils/pricing.ts, so these tests fail when one is changed without the other.

/** A repeatable stream of numbers in [0, 1) (not Math.random: a failure has to be reproducible). */
function stream(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

/** -0 and 0 are the same amount of money. */
const amount = (n: number) => n + 0;

describe('the total at checkout and the total the server charges', () => {
  it('are the same total and the same GST, for goods to the paisa and any delivery fee', () => {
    const fees = [0, 40, 50, 80, 99.5, 100, 150, 250];
    // Totals that sit on a half rupee are where the rounding rule shows, so they are listed by hand before the random ones.
    const goods = [0, 0.5, 1, 9.99, 10, 99.99, 450.5, 999, 1449, 1455, 1610, 1999.99, 2000, 3500, 12345.67];
    const next = stream(7);
    for (let i = 0; i < 3000; i++) goods.push(Math.round(next() * 5_000_000) / 100); // up to Rs 50,000, to the paisa
    let compared = 0;
    for (const g of goods) {
      for (const fee of fees) {
        const web = orderTotals(g, fee);
        const server = priceOrder(g, fee);
        if (web.total !== server.totalAmount || amount(web.gst) !== amount(server.taxAmount)) {
          throw new Error(`goods ${g} and delivery ${fee}: checkout ${JSON.stringify(web)}, server ${JSON.stringify(server)}`);
        }
        compared++;
      }
    }
    expect(compared).toBeGreaterThan(20000);
  });

  it('are both nothing for goods a discount took below nothing', () => {
    for (const [g, fee] of [[-50, 100], [-0.01, 0], [-1000, 250]]) {
      const web = orderTotals(g, fee);
      const server = priceOrder(g, fee);
      expect(web.total).toBe(server.totalAmount);
      expect(amount(web.gst)).toBe(amount(server.taxAmount));
    }
  });
});

describe('the price after the kitchen\'s deals', () => {
  it('is the price the server charges, for percentage and fixed deals in any order', () => {
    const next = stream(11);
    for (let i = 0; i < 20000; i++) {
      const price = next() < 0.5 ? Math.floor(next() * 5000) + 1 : Math.round(next() * 500_000) / 100;
      const promos = Array.from({ length: Math.floor(next() * 4) }, () => {
        const percentage = next() < 0.5;
        const discountValue = percentage
          ? next() < 0.7 ? Math.floor(next() * 100) + 1 : Math.round(next() * 10_000) / 100
          : Math.floor(next() * 2000) - (next() < 0.1 ? 50 : 0);
        return { type: percentage ? 'percentage' : 'fixed', discountValue };
      });
      const server = applyStackedDiscount(price, promos.map((p) => ({ discountType: p.type, discountValue: p.discountValue })));
      const web = getStackedDiscountedPrice(price, promos);
      if (web !== server) throw new Error(`${JSON.stringify({ price, promos })}: the page shows ${web}, the server charges ${server}`);
    }
  });
});
