/**
 * A kitchen's money reporting: one delivered+paid order, one cancelled order and one fully
 * refunded order on the same day. Only the first has earned anything, and the dashboard and
 * the analytics screen must say so with the same numbers.
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
};
/** Cancelled before it went out. */
const cancelledOrder = {
  id: 'order-cancelled',
  orderStatus: 'cancelled',
  paymentStatus: 'pending',
  createdAt: today,
};
/** Delivered, then refunded to the customer in full. */
const refundedOrder = {
  id: 'order-refunded',
  orderStatus: 'delivered',
  paymentStatus: 'refunded',
  createdAt: today,
};

const lines = [
  { status: 'delivered', quantity: 2, sellerPayout: 900, productId: 'p1', productName: 'Biryani', product: { id: 'p1', name: 'Biryani' }, order: earnedOrder },
  { status: 'cancelled', quantity: 1, sellerPayout: 180, productId: 'p1', productName: 'Biryani', product: { id: 'p1', name: 'Biryani' }, order: cancelledOrder },
  { status: 'delivered', quantity: 4, sellerPayout: 1620, productId: 'p1', productName: 'Biryani', product: { id: 'p1', name: 'Biryani' }, order: refundedOrder },
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
  // Lifetime aggregate over earned lines only (the query filters in SQL).
  mockPrisma.$queryRaw.mockResolvedValue([
    { active_orders: 0, pending_orders: 0, gross_sales: 1000, platform_fees: 100, item_payouts: 900 },
  ]);
  mockPrisma.orderItem.findMany.mockResolvedValue(lines);
  // What computeSellerBalance sees: the earned order and the refunded one.
  mockPrisma.order.findMany.mockResolvedValue([
    { ...earnedOrder, totalAmount: 1150, paymentMethod: 'card', paymentCollectedBy: 'platform', paidAt: today, deliveryType: 'home_delivery', deliveryProvider: 'platform', deliveryFeeBreakdown: riderFee, items: [{ sellerId: SELLER, status: 'delivered', sellerPayout: 900 }], refunds: [] },
    { ...refundedOrder, totalAmount: 1800, paymentMethod: 'card', paymentCollectedBy: 'platform', paidAt: today, deliveryType: 'home_delivery', deliveryProvider: 'platform', deliveryFeeBreakdown: [], items: [{ sellerId: SELLER, status: 'delivered', sellerPayout: 1620 }], refunds: [{ amount: 1800, status: 'completed' }] },
  ]);
  mockPrisma.sellerPayout.findMany.mockResolvedValue([]);
  mockPrisma.riderLedgerEntry.findMany.mockResolvedValue([]);
  mockPrisma.riderLedgerEntry.aggregate.mockResolvedValue({ _sum: { amount: 0 } });
  mockPrisma.product.findMany.mockResolvedValue([]);
  mockPrisma.review.findMany.mockResolvedValue([]);
});

it('counts only the delivered, still-paid order, and reconciles', async () => {
  const dashboard = await sellerService.getSellerDashboard(SELLER);
  const analytics = await sellerService.getSellerAnalytics(SELLER, '30d');
  const ov = dashboard.overview;

  // Cancelled (180) and refunded (1,620) never reach today's figures.
  expect(ov.todayEarnings).toBe(900);
  expect(ov.todayOrders).toBe(1);
  expect(ov.todayUnitsSold).toBe(2);
  expect(analytics.revenue.total).toBe(900);

  // The order counts split the three orders into buckets that add up: one earned, two that earned nothing (cancelled; refunded
  // after delivery). "Completed" is the order the revenue comes from, so the average order value the page shows
  // (revenue / completed) is that order's Rs 900, not Rs 300 (what counting the refunded delivery as completed gave).
  expect(analytics.orders).toEqual({ total: 3, completed: 1, cancelled: 2, inProgress: 0, awaitingPayment: 0 });
  expect(analytics.revenue.total / analytics.orders.completed).toBe(900);

  // Both screens, same day, same numbers.
  expect(analytics.revenue.today).toBe(ov.todayEarnings);
  expect(analytics.ordersByPeriod.today).toBe(ov.todayOrders);
  expect(analytics.unitsSold.today).toBe(ov.todayUnitsSold);

  // Gross - fees - discounts + delivery kept - delivery paid to Nuray = net.
  expect(ov.deliveryPaid).toBe(150);
  expect(ov.grossSales - ov.platformFees - ov.sellerDiscounts + ov.deliveryEarned - ov.deliveryPaid).toBe(ov.netEarnings);
  expect(ov.netEarnings).toBe(750);
});
