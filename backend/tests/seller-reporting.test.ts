/**
 * A kitchen's money reporting: on the same day one order delivered and paid, one cancelled, one fully refunded and
 * one still being cooked. Only the first has earned anything (net of the delivery fee the kitchen pays Nuray), and
 * the dashboard and the analytics screen must say so with the same numbers. The one being cooked is not money yet,
 * but it is an order of today.
 */

const mockPrisma: any = {
  seller: { findUnique: jest.fn() },
  orderItem: { findMany: jest.fn() },
  order: { findMany: jest.fn() },
  product: { findMany: jest.fn() },
  review: { findMany: jest.fn() },
  sellerPayout: { findMany: jest.fn() },
  riderLedgerEntry: { findMany: jest.fn(), aggregate: jest.fn() },
  $queryRaw: jest.fn(),
};

jest.mock('../src/config/database', () => ({ __esModule: true, default: mockPrisma }));

import sellerService from '../src/services/seller.service';

const SELLER = 'seller-1';
const today = new Date();

const riderFee = [{ sellerId: SELLER, fee: 150, provider: 'platform', paidBy: 'seller' }];

/** Delivered and still paid: 1,000 sold, 100 commission, 900 payout, 150 paid to Nuray for the rider. */
const earnedOrder = {
  id: 'order-earned',
  orderStatus: 'delivered',
  paymentStatus: 'paid',
  createdAt: today,
  deliveryFeeBreakdown: riderFee,
};
/** Cancelled before it went out. */
const cancelledOrder = {
  id: 'order-cancelled',
  orderStatus: 'cancelled',
  paymentStatus: 'pending',
  createdAt: today,
  deliveryFeeBreakdown: riderFee,
};
/** Delivered, then refunded to the customer in full. */
const refundedOrder = {
  id: 'order-refunded',
  orderStatus: 'delivered',
  paymentStatus: 'refunded',
  createdAt: today,
  deliveryFeeBreakdown: riderFee,
};
/** Accepted and being cooked: not earned yet. */
const cookingOrder = {
  id: 'order-cooking',
  orderStatus: 'preparing',
  paymentStatus: 'pending',
  createdAt: today,
  deliveryFeeBreakdown: riderFee,
};

const product = { productId: 'p1', productName: 'Biryani', product: { id: 'p1', name: 'Biryani' } };
const lines = [
  { status: 'delivered', quantity: 2, sellerPayout: 900, ...product, order: earnedOrder },
  { status: 'cancelled', quantity: 1, sellerPayout: 180, ...product, order: cancelledOrder },
  { status: 'delivered', quantity: 4, sellerPayout: 1620, ...product, order: refundedOrder },
  { status: 'preparing', quantity: 1, sellerPayout: 450, ...product, order: cookingOrder },
];

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.seller.findUnique.mockResolvedValue({
    id: SELLER,
    status: 'active',
    scheduleMode: 'always',
    operatingHours: null,
    availabilityOverride: null,
    availabilityOverrideUntil: null,
    ratingAverage: 4.5,
    totalReviews: 3,
    products: [],
  });
  // Lifetime aggregate over earned lines only (the query filters in SQL); the order being cooked is the one active order.
  mockPrisma.$queryRaw.mockResolvedValue([
    { active_orders: 1, pending_orders: 1, gross_sales: 1000, platform_fees: 100, item_payouts: 900 },
  ]);
  mockPrisma.orderItem.findMany.mockResolvedValue(lines);
  // What computeSellerBalance sees: the earned order and the refunded one.
  mockPrisma.order.findMany.mockResolvedValue([
    { ...earnedOrder, totalAmount: 1150, paymentMethod: 'card', paymentCollectedBy: 'platform', paidAt: today, deliveryType: 'home_delivery', deliveryProvider: 'platform', items: [{ sellerId: SELLER, status: 'delivered', sellerPayout: 900 }], refunds: [] },
    { ...refundedOrder, totalAmount: 1800, paymentMethod: 'card', paymentCollectedBy: 'platform', paidAt: today, deliveryType: 'home_delivery', deliveryProvider: 'platform', deliveryFeeBreakdown: [], items: [{ sellerId: SELLER, status: 'delivered', sellerPayout: 1620 }], refunds: [{ amount: 1800, status: 'completed' }] },
  ]);
  mockPrisma.sellerPayout.findMany.mockResolvedValue([]);
  mockPrisma.riderLedgerEntry.findMany.mockResolvedValue([]);
  mockPrisma.riderLedgerEntry.aggregate.mockResolvedValue({ _sum: { amount: 0 } });
  mockPrisma.product.findMany.mockResolvedValue([]);
  mockPrisma.review.findMany.mockResolvedValue([]);
});

it('counts only the delivered, still-paid order as earned, net of the delivery fee, counts live orders as orders, and reconciles', async () => {
  const dashboard = await sellerService.getSellerDashboard(SELLER);
  const analytics = await sellerService.getSellerAnalytics(SELLER, '30d');
  const ov = dashboard.overview;

  // Cancelled (180), refunded (1,620) and the order still being cooked (450) never reach today's earnings. The kitchen paid
  // Nuray 150 for the rider, so the earned order is worth 900 - 150 = 750: what the ledger credits (netEarnings).
  expect(ov.todayEarnings).toBe(750);
  expect(ov.todayEarnings).toBe(ov.netEarnings);
  expect(ov.todayUnitsSold).toBe(2);
  expect(analytics.revenue.total).toBe(750);
  expect(analytics.revenue.dishes).toBe(900);
  expect(analytics.revenue.graph).toEqual([{ date: today.toISOString().split('T')[0], revenue: 750 }]);

  // "Orders today" are the orders of today that are still alive: the earned one and the one being cooked, not the cancelled
  // or the refunded ones. A kitchen with orders in the pot does not see 0.
  expect(ov.todayOrders).toBe(2);

  // The order counts split the four orders into buckets that add up: one earned, one in progress, two that earned nothing
  // (cancelled; refunded after delivery). "Completed" is the order the revenue comes from, so the average order value the page
  // shows (dishes / completed) is that order's Rs 900, not Rs 450 (what counting the refunded delivery as completed gave).
  expect(analytics.orders).toEqual({ total: 4, completed: 1, cancelled: 2, inProgress: 1, awaitingPayment: 0 });
  expect(analytics.revenue.dishes / analytics.orders.completed).toBe(900);

  // Both screens, same day, same numbers.
  expect(analytics.revenue.today).toBe(ov.todayEarnings);
  expect(analytics.ordersByPeriod.today).toBe(ov.todayOrders);
  expect(analytics.unitsSold.today).toBe(ov.todayUnitsSold);

  // Gross - fees - discounts + delivery kept - delivery paid to Nuray = net.
  expect(ov.deliveryPaid).toBe(150);
  expect(ov.grossSales - ov.platformFees - ov.sellerDiscounts + ov.deliveryEarned - ov.deliveryPaid).toBe(ov.netEarnings);
  expect(ov.netEarnings).toBe(750);
});
