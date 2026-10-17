/**
 * What an order earns a kitchen on the dashboard and analytics screens, and how many orders a day has. The money is the
 * ledger's (seller-balance.service.ts): the dishes' payout plus the delivery fee the kitchen keeps minus the one it pays
 * Nuray, once the order is delivered and still paid. The last test holds the two to each other on random data.
 */
jest.mock('../src/config/database', () => ({ __esModule: true, default: {} }));

import { computeSellerBalance } from '../src/services/seller-balance.service';
import { earnedOrders, earningsOf, orderCounts, periodTotals, type ReportLine, type ReportOrder } from '../src/services/seller-reporting';

const SELLER = 'k1';
const startOfToday = new Date('2026-03-10T00:00:00Z');
const NOW = new Date('2026-03-10T10:00:00Z');
const YESTERDAY = new Date('2026-03-09T10:00:00Z');

const keeps = (fee: number, sellerId = SELLER) => ({ sellerId, fee, provider: 'self', paidBy: 'customer' });
const pays = (fee: number, sellerId = SELLER) => ({ sellerId, fee, provider: 'platform', paidBy: 'seller' });
const orderOf = (id: string, orderStatus: string, paymentStatus: string, breakdown: unknown[] = [], createdAt = NOW): ReportOrder => ({ id, orderStatus, paymentStatus, createdAt, deliveryFeeBreakdown: breakdown });
const lineOf = (order: ReportOrder, sellerPayout: number, quantity = 1, status = 'delivered'): ReportLine => ({ status, quantity, sellerPayout, order });

describe('what an earned order is worth', () => {
  it('is its dishes plus the delivery fee the kitchen keeps', () => {
    const o = orderOf('o1', 'delivered', 'paid', [keeps(100)]);
    const [e, ...rest] = earnedOrders([lineOf(o, 400, 1), lineOf(o, 500, 2)], SELLER);
    expect(rest).toHaveLength(0); // one entry for the order, however many dishes it holds
    expect(e).toMatchObject({ dishes: 900, unitsSold: 3, deliveryKept: 100, deliveryPaid: 0 });
    expect(earningsOf(e)).toBe(1000); // the fee once, not once per dish
  });

  it('is its dishes minus the delivery fee the kitchen pays Nuray for a rider', () => {
    const [e] = earnedOrders([lineOf(orderOf('o1', 'completed', 'paid', [pays(150)]), 900)], SELLER);
    expect(e).toMatchObject({ dishes: 900, deliveryKept: 0, deliveryPaid: 150 });
    expect(earningsOf(e)).toBe(750);
  });

  it("leaves out another kitchen's part of the delivery fee", () => {
    const [e] = earnedOrders([lineOf(orderOf('o1', 'delivered', 'paid', [keeps(80, 'k2'), pays(60, 'k3'), keeps(100)]), 900)], SELLER);
    expect(e).toMatchObject({ deliveryKept: 100, deliveryPaid: 0 });
  });

  it('is nothing when the order has not earned, whatever delivery fee it carries', () => {
    const fees = [keeps(100), pays(150)];
    const notEarned = [
      orderOf('cooking', 'preparing', 'pending', fees),
      orderOf('on-the-road', 'in_transit', 'paid', fees),
      orderOf('unpaid', 'delivered', 'pending', fees),
      orderOf('transfer', 'delivered', 'payment_submitted', fees),
      orderOf('refund-owed', 'delivered', 'refund_pending', fees),
      orderOf('refunded', 'delivered', 'refunded', fees),
      orderOf('cancelled', 'cancelled', 'pending', fees),
    ];
    const lines = notEarned.map((o) => lineOf(o, 500));
    expect(earnedOrders(lines, SELLER)).toEqual([]);
    expect(periodTotals(lines, startOfToday, SELLER)).toMatchObject({ revenue: 0, dishes: 0, unitsSold: 0 });
  });

  it("counts a cancelled line of the kitchen's for nothing, but the order's delivery fee still as the ledger does", () => {
    const o = orderOf('o1', 'delivered', 'paid', [pays(150)]);
    const [e] = earnedOrders([lineOf(o, 900, 2, 'cancelled'), lineOf(o, 300, 1)], SELLER);
    expect(e).toMatchObject({ dishes: 300, unitsSold: 1, deliveryPaid: 150 });
    const [onlyCancelled] = earnedOrders([lineOf(o, 900, 2, 'cancelled')], SELLER);
    expect(onlyCancelled).toMatchObject({ dishes: 0, unitsSold: 0, deliveryPaid: 150 });
    expect(earningsOf(onlyCancelled)).toBe(-150); // what computeSellerBalance gives such an order (see the last test)
  });

  it('adds up to the paisa, without float dust', () => {
    const lines = [lineOf(orderOf('a', 'delivered', 'paid'), 0.1), lineOf(orderOf('b', 'delivered', 'paid'), 0.2)];
    const totals = periodTotals(lines, startOfToday, SELLER);
    expect(totals.revenue).toBe(0.3);
    expect(totals.dishes).toBe(0.3);
  });
});

describe('the figures of one day', () => {
  const lines = [
    lineOf(orderOf('earned', 'delivered', 'paid', [pays(150)]), 900, 2), // earned: 750
    lineOf(orderOf('earned-2', 'completed', 'paid', [keeps(100)]), 300, 1), // earned: 400
    lineOf(orderOf('cooking', 'preparing', 'pending', [pays(150)]), 450), // an order, no money yet
    lineOf(orderOf('on-the-road', 'in_transit', 'paid'), 450), // an order, no money yet
    lineOf(orderOf('unpaid', 'delivered', 'pending'), 450), // delivered, the money has not arrived: still an order
    lineOf(orderOf('cancelled', 'cancelled', 'pending'), 450, 1, 'cancelled'), // not an order of the day
    lineOf(orderOf('refunded', 'delivered', 'refunded'), 450), // not an order of the day
    lineOf(orderOf('refund-owed', 'refund_pending', 'refund_pending'), 450), // not an order of the day
    lineOf(orderOf('rejected', 'preparing', 'pending'), 450, 1, 'cancelled'), // none of the kitchen's lines is left
    lineOf(orderOf('yesterday', 'delivered', 'paid', [keeps(100)], YESTERDAY), 800), // another day
  ];

  it('counts the orders that are still alive, not only those that earned, and the money only of those that did', () => {
    const today = periodTotals(lines, startOfToday, SELLER);
    expect(today.orders).toBe(5); // earned, earned-2, cooking, on-the-road, unpaid
    expect(today.revenue).toBe(1150); // 750 + 400
    expect(today.dishes).toBe(1200);
    expect(today.unitsSold).toBe(3);
  });

  it('keeps an order of another day out', () => {
    expect(periodTotals(lines, YESTERDAY, SELLER)).toMatchObject({ orders: 6, revenue: 1150 + 900, unitsSold: 4 });
    expect(periodTotals(lines.filter((l) => l.order!.createdAt >= startOfToday), startOfToday, SELLER)).toEqual(periodTotals(lines, startOfToday, SELLER));
  });

  it('has as many orders as the buckets that are not cancelled', () => {
    const counts = orderCounts(lines.filter((l) => l.order!.createdAt >= startOfToday));
    expect(counts).toEqual({ total: 9, completed: 2, cancelled: 4, inProgress: 2, awaitingPayment: 1 });
    expect(periodTotals(lines, startOfToday, SELLER).orders).toBe(counts.completed + counts.inProgress + counts.awaitingPayment);
  });

  it('shows a kitchen with orders in the pot and nothing delivered yet one order for each, and no money', () => {
    const totals = periodTotals([lineOf(orderOf('a', 'preparing', 'pending'), 500), lineOf(orderOf('b', 'ready', 'paid'), 500)], startOfToday, SELLER);
    expect(totals).toEqual({ orders: 2, unitsSold: 0, revenue: 0, dishes: 0 });
  });
});

describe('the ledger and the reports', () => {
  // A small seeded generator, so a failure can be reproduced.
  const generator = (seed: number) => () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  it('agree to the paisa on any mix of orders: what the reports call earned is what the ledger credits', async () => {
    const rand = generator(20261016);
    const pick = <T>(xs: T[]): T => xs[Math.floor(rand() * xs.length)];
    const orderStatuses = ['pending', 'preparing', 'ready', 'in_transit', 'delivered', 'delivered', 'delivered', 'completed', 'cancelled', 'refunded', 'refund_pending'];
    const paymentStatuses = ['pending', 'paid', 'paid', 'paid', 'payment_submitted', 'failed', 'refund_pending', 'refunded'];
    const lineStatuses = ['pending', 'preparing', 'delivered', 'delivered', 'delivered', 'cancelled'];
    const breakdowns: unknown[][] = [[], [], [keeps(100)], [keeps(75.5)], [pays(150)], [pays(99.99)], [keeps(60), pays(90, 'other')], [pays(90, 'other')], [keeps(20), pays(20)]];
    const payout = () => Math.round((50 + rand() * 1500) * 100) / 100;

    const ledgerOrders: any[] = [];
    const lines: ReportLine[] = [];
    for (let i = 0; i < 600; i++) {
      const o = orderOf(`o${i}`, pick(orderStatuses), pick(paymentStatuses), pick(breakdowns));
      const mine = Array.from({ length: 1 + Math.floor(rand() * 3) }, () => ({ sellerId: SELLER, status: pick(lineStatuses), sellerPayout: payout(), quantity: 1 + Math.floor(rand() * 3) }));
      const others = rand() < 0.3 ? [{ sellerId: 'other', status: 'delivered', sellerPayout: payout(), quantity: 1 }] : [];
      ledgerOrders.push({
        id: o.id,
        orderStatus: o.orderStatus,
        paymentStatus: o.paymentStatus,
        deliveryFeeBreakdown: o.deliveryFeeBreakdown,
        totalAmount: 1000,
        paymentMethod: 'card',
        paymentCollectedBy: 'platform',
        paidAt: new Date(),
        deliveryType: 'home_delivery',
        deliveryProvider: 'platform',
        items: [...mine, ...others],
        refunds: [],
      });
      for (const m of mine) lines.push({ status: m.status, quantity: m.quantity, sellerPayout: m.sellerPayout, order: o });
    }
    const client: any = { order: { findMany: async () => ledgerOrders }, sellerPayout: { findMany: async () => [] } };
    const ledger = await computeSellerBalance(client, SELLER);

    const earned = earnedOrders(lines, SELLER);
    const sum = (pickPart: (e: (typeof earned)[number]) => number) => Math.round(earned.reduce((s, e) => s + pickPart(e), 0) * 100) / 100;
    expect(earned.length).toBeGreaterThan(50); // the data does exercise it
    expect(sum(earningsOf)).toBe(ledger.totalEarnings);
    expect(sum((e) => e.deliveryKept)).toBe(ledger.deliveryEarned);
    expect(sum((e) => e.deliveryPaid)).toBe(ledger.deliveryPaid);
    expect(periodTotals(lines, new Date(0), SELLER).revenue).toBe(ledger.totalEarnings);
    expect(ledger.deliveryEarned).toBeGreaterThan(0);
    expect(ledger.deliveryPaid).toBeGreaterThan(0);

    // And the buckets still add up, whatever the mix.
    const counts = orderCounts(lines);
    expect(counts.completed + counts.cancelled + counts.inProgress + counts.awaitingPayment).toBe(counts.total);
    expect(periodTotals(lines, new Date(0), SELLER).orders).toBe(counts.total - counts.cancelled);
  });
});
