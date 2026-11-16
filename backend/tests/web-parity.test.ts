import { priceDealLines, priceOrder } from '../src/utils/pricing';
// The web app's side of the same sums. Both files import nothing, so a test can read them as they are.
import { orderTotals } from '../../frontend-web/lib/order-totals';
import { getStackedDiscountedPrice, priceDealLines as webPriceDealLines } from '../../frontend-web/lib/pricing';

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
      const deals = promos.map((p, n) => ({ id: String(n), discountType: p.type, discountValue: p.discountValue, minOrderAmount: 0, maxDiscountAmount: null }));
      const server = priceDealLines([{ sellerId: '', unitPrice: price, quantity: 1, deals }]).unitPrices[0];
      const web = getStackedDiscountedPrice(price, promos);
      if (web !== server) throw new Error(`${JSON.stringify({ price, promos })}: the page shows ${web}, the server charges ${server}`);
    }
  });

  it('is the same on every line of a tray, for deals with a minimum order and a cap', () => {
    const next = stream(23);
    for (let i = 0; i < 5000; i++) {
      const deals = Array.from({ length: Math.floor(next() * 4) }, (_, n) => {
        const percentage = next() < 0.5;
        return {
          id: `deal-${n}`,
          sellerId: next() < 0.7 ? 'k1' : 'k2',
          type: percentage ? 'percentage' : 'fixed',
          discountValue: percentage ? Math.floor(next() * 100) + 1 : Math.floor(next() * 800) + 1,
          minOrderAmount: next() < 0.5 ? 0 : Math.floor(next() * 4000),
          maxDiscountAmount: next() < 0.5 ? null : Math.floor(next() * 600) + 1,
        };
      });
      const lines = Array.from({ length: Math.floor(next() * 4) + 1 }, () => {
        const sellerId = next() < 0.7 ? 'k1' : 'k2';
        return {
          sellerId,
          unitPrice: Math.floor(next() * 1500) + 1,
          quantity: Math.floor(next() * 5) + 1,
          promos: deals.filter((d) => d.sellerId === sellerId && next() < 0.8),
        };
      });
      const web = webPriceDealLines(lines);
      const server = priceDealLines(
        lines.map((l) => ({ ...l, deals: l.promos.map((p) => ({ ...p, discountType: p.type })) }))
      );
      const shown = { unitPrices: web.unitPrices, applied: web.applied.map((a) => a.map((p) => p.id)) };
      const charged = { unitPrices: server.unitPrices, applied: server.applied.map((a) => a.map((p) => p.id)) };
      if (JSON.stringify(shown) !== JSON.stringify(charged)) {
        throw new Error(`${JSON.stringify(lines)}: the tray shows ${JSON.stringify(shown)}, the server charges ${JSON.stringify(charged)}`);
      }
      // What both sides promise the kitchen: a capped deal never takes more than its cap, and no discounted unit is free.
      for (const deal of deals) {
        if (!deal.maxDiscountAmount) continue;
        const alone = priceDealLines(
          lines.map((l) => ({ ...l, deals: l.promos.filter((p) => p.id === deal.id).map((p) => ({ ...p, discountType: p.type })) }))
        );
        const off = lines.reduce((sum, l, n) => sum + (l.unitPrice - alone.unitPrices[n]) * l.quantity, 0);
        if (off > deal.maxDiscountAmount) throw new Error(`${JSON.stringify({ lines, deal })}: took ${off}, over the cap`);
      }
      if (server.unitPrices.some((p) => p < 1)) throw new Error(`${JSON.stringify(lines)}: a unit under Rs 1`);
    }
  });

  it('counts a capped deal in the whole rupees charged, so rounding each unit cannot carry it over the cap', () => {
    // 10% of Rs 107 is 10.70 a unit: 53.50 on five, under the cap of 54, but each unit is charged Rs 11 less.
    const capped = { id: 'c', type: 'percentage', discountValue: 10, minOrderAmount: 0, maxDiscountAmount: 54 };
    const lines = [{ sellerId: 'k1', unitPrice: 107, quantity: 5, promos: [capped] }];
    const web = webPriceDealLines(lines);
    const server = priceDealLines(lines.map((l) => ({ ...l, deals: l.promos.map((p) => ({ ...p, discountType: p.type })) })));
    expect(server.unitPrices).toEqual(web.unitPrices);
    const off = (107 - server.unitPrices[0]) * 5;
    expect(off).toBeLessThanOrEqual(54);
    expect(off).toBe(50);
    // Under the cap after rounding, nothing is scaled.
    expect(priceDealLines([{ sellerId: 'k1', unitPrice: 107, quantity: 4, deals: [{ ...capped, discountType: 'percentage' }] }]).unitPrices).toEqual([96]);
  });
});
