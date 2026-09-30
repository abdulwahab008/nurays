import prisma from '../config/database';

export class LedgerService {
  /**
   * Record immutable double-entry ledger entries upon successful order completion.
   * Idempotent: if ledger entries for orderId already exist, returns existing count.
   */
  async recordOrderCompletion(orderId: string) {
    const existing = await prisma.ledgerEntry.count({
      where: { orderId },
    });
    if (existing > 0) {
      return { recorded: false, reason: 'ALREADY_RECORDED' };
    }

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: true,
      },
    });

    if (!order) return { recorded: false, reason: 'ORDER_NOT_FOUND' };

    const totalAmount = Number(order.totalAmount);
    const deliveryFee = Number(order.deliveryFee);
    const totalCommission = order.items.reduce((sum, item) => sum + Number(item.commissionAmount), 0);
    const totalSellerPayout = order.items.reduce((sum, item) => sum + Number(item.sellerPayout), 0);
    const primarySellerId = order.items[0]?.sellerId ?? null;

    await prisma.$transaction([
      // 1. Customer Payment (Asset / Receivable debited)
      prisma.ledgerEntry.create({
        data: {
          orderId,
          transactionType: 'customer_payment',
          accountType: 'asset',
          entryType: 'debit',
          amount: totalAmount,
          currency: 'PKR',
          description: `Customer payment received for Order #${order.orderNumber} via ${order.paymentMethod.toUpperCase()}`,
          userId: order.customerId,
          metadata: { paymentMethod: order.paymentMethod },
        },
      }),
      // 2. Seller Earnings (Liability credited to Seller payable)
      prisma.ledgerEntry.create({
        data: {
          orderId,
          transactionType: 'seller_earning',
          accountType: 'liability',
          entryType: 'credit',
          amount: totalSellerPayout,
          currency: 'PKR',
          description: `Earnings payable to home chef for Order #${order.orderNumber}`,
          sellerId: primarySellerId,
        },
      }),
      // 3. Platform Marketplace Commission (Revenue credited to Platform)
      prisma.ledgerEntry.create({
        data: {
          orderId,
          transactionType: 'platform_commission',
          accountType: 'revenue',
          entryType: 'credit',
          amount: totalCommission,
          currency: 'PKR',
          description: `Platform take-rate commission for Order #${order.orderNumber}`,
          sellerId: primarySellerId,
        },
      }),
      // 4. Logistics & Delivery Surcharge (Revenue/Pass-through for rider delivery)
      ...(deliveryFee > 0
        ? [
            prisma.ledgerEntry.create({
              data: {
                orderId,
                transactionType: 'delivery_fee',
                accountType: 'revenue',
                entryType: 'credit',
                amount: deliveryFee,
                currency: 'PKR',
                description: `Delivery & cold-chain fulfillment fee for Order #${order.orderNumber}`,
              },
            }),
          ]
        : []),
    ]);

    return { recorded: true, orderId };
  }

  /**
   * Get financial ledger entries with filters
   */
  async getLedgerEntries(filters: {
    orderId?: string;
    sellerId?: string;
    transactionType?: string;
    page?: number;
    limit?: number;
  }) {
    const page = filters.page || 1;
    const limit = Math.min(filters.limit || 50, 100);
    const skip = (page - 1) * limit;

    const where: any = {};
    if (filters.orderId) where.orderId = filters.orderId;
    if (filters.sellerId) where.sellerId = filters.sellerId;
    if (filters.transactionType) where.transactionType = filters.transactionType;

    const [entries, total] = await Promise.all([
      prisma.ledgerEntry.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.ledgerEntry.count({ where }),
    ]);

    return {
      entries,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}

export default new LedgerService();
