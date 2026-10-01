import prisma from '../config/database';
import { parseBreakdown, platformDeliveryFee } from '../utils/deliveryEarnings';

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
    const selfDeliveryShares = parseBreakdown(order.deliveryFeeBreakdown).filter((r) => r.provider === 'self');
    const platformFee = platformDeliveryFee(deliveryFee, order.deliveryFeeBreakdown);

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
      // 4. Delivery fee. Only the part that pays for the platform's own riders is
      // platform revenue; a self-delivering seller keeps the fee they charged, so it
      // is a payable to that seller (no commission, no rider cost).
      ...(platformFee > 0
        ? [
            prisma.ledgerEntry.create({
              data: {
                orderId,
                transactionType: 'delivery_fee',
                accountType: 'revenue',
                entryType: 'credit',
                amount: platformFee,
                currency: 'PKR',
                description: `Delivery & cold-chain fulfillment fee for Order #${order.orderNumber}`,
              },
            }),
          ]
        : []),
      ...selfDeliveryShares.map((share) =>
        prisma.ledgerEntry.create({
          data: {
            orderId,
            transactionType: 'seller_delivery_fee',
            accountType: 'liability',
            entryType: 'credit',
            amount: share.fee,
            currency: 'PKR',
            description: `Self-delivery fee payable to seller for Order #${order.orderNumber}`,
            sellerId: share.sellerId,
          },
        })
      ),
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
