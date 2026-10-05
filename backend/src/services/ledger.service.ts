import prisma from '../config/database';
import { parseBreakdown, platformDeliveryFee } from '../utils/deliveryEarnings';
import { collectorOf } from '../utils/paymentCustody';

export class LedgerService {
  /**
   * Record immutable double-entry ledger entries upon successful order completion.
   * Idempotent: if ledger entries for orderId already exist, returns existing count.
   */
  async recordOrderCompletion(orderId: string) {
    // Lock the order first and check inside the transaction: two completion paths (the
    // rider's, the seller's self-delivery, an admin's) can fire at the same moment, and
    // count-then-create outside a lock posted the entries twice.
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM orders WHERE id = ${orderId} FOR UPDATE`;

      const existing = await tx.ledgerEntry.count({ where: { orderId } });
      if (existing > 0) {
        return { recorded: false, reason: 'ALREADY_RECORDED' };
      }

      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: { items: true },
      });
      if (!order) return { recorded: false, reason: 'ORDER_NOT_FOUND' };
      // Only money that was actually received is posted. A transfer the seller hasn't
      // confirmed yet is posted when they confirm it (order.service confirmManualPayment).
      if (order.paymentStatus !== 'paid') return { recorded: false, reason: 'NOT_PAID' };
      const collectedBy = collectorOf(order);

      // Only items that were actually sold. Cancelled items were refunded to the customer
      // (and restocked) and earn nothing, so they carry no earning, commission or fee.
      const liveItems = order.items.filter((i) => i.status !== 'cancelled');
      const liveSellerIds = new Set(liveItems.map((i) => i.sellerId));

      // What the customer actually paid net of refunds already given back.
      const refunded = await tx.refund.aggregate({
        where: { orderId, status: { not: 'failed' } },
        _sum: { amount: true },
      });
      const totalAmount = Math.max(0, Number(order.totalAmount) - Number(refunded._sum.amount ?? 0));

      const totalCommission = liveItems.reduce((sum, item) => sum + Number(item.commissionAmount), 0);
      const totalSellerPayout = liveItems.reduce((sum, item) => sum + Number(item.sellerPayout), 0);
      const primarySellerId = liveItems[0]?.sellerId ?? order.items[0]?.sellerId ?? null;

      // Delivery fees: a seller with nothing left to deliver had theirs refunded.
      const breakdown = parseBreakdown(order.deliveryFeeBreakdown);
      const liveBreakdown = breakdown.filter((r) => liveSellerIds.has(r.sellerId));
      const platformFee = breakdown.length
        ? liveBreakdown.filter((r) => r.provider !== 'self').reduce((sum, r) => sum + r.fee, 0)
        : platformDeliveryFee(Number(order.deliveryFee), order.deliveryFeeBreakdown); // legacy order: no split
      // A delivery fee the seller collected themselves (COD at their door, a transfer into
      // their account) is already in their hands, so there's nothing payable.
      const selfDeliveryShares =
        collectedBy === 'seller' ? [] : liveBreakdown.filter((r) => r.provider === 'self');

      const entries: Array<Record<string, unknown>> = [
        // 1. Customer Payment (Asset / Receivable debited)
        {
          orderId,
          transactionType: 'customer_payment',
          accountType: 'asset',
          entryType: 'debit',
          amount: totalAmount,
          currency: 'PKR',
          description:
            collectedBy === 'seller'
              ? `Customer payment for Order #${order.orderNumber} via ${order.paymentMethod.toUpperCase()}, collected directly by the seller (receivable from the seller)`
              : collectedBy === 'rider'
                ? `Cash for Order #${order.orderNumber} collected by the rider (receivable from the rider)`
                : `Customer payment received for Order #${order.orderNumber} via ${order.paymentMethod.toUpperCase()}`,
          userId: order.customerId,
          metadata: { paymentMethod: order.paymentMethod, collectedBy },
        },
        // 2. Seller Earnings (Liability credited to Seller payable)
        {
          orderId,
          transactionType: 'seller_earning',
          accountType: 'liability',
          entryType: 'credit',
          amount: totalSellerPayout,
          currency: 'PKR',
          description:
            collectedBy === 'seller'
              ? `Home chef's earnings for Order #${order.orderNumber}, kept from the payment they collected`
              : `Earnings payable to home chef for Order #${order.orderNumber}`,
          sellerId: primarySellerId,
          metadata: { collectedBy },
        },
        // 3. Platform Marketplace Commission (Revenue credited to Platform)
        {
          orderId,
          transactionType: 'platform_commission',
          accountType: 'revenue',
          entryType: 'credit',
          amount: totalCommission,
          currency: 'PKR',
          description: `Platform take-rate commission for Order #${order.orderNumber}`,
          sellerId: primarySellerId,
        },
      ];
      // 4. Delivery fee. Only the part that pays for the platform's own riders is
      // platform revenue; a self-delivering seller keeps the fee they charged, so it
      // is a payable to that seller (no commission, no rider cost).
      if (platformFee > 0) {
        entries.push({
          orderId,
          transactionType: 'delivery_fee',
          accountType: 'revenue',
          entryType: 'credit',
          amount: platformFee,
          currency: 'PKR',
          description: `Delivery & cold-chain fulfillment fee for Order #${order.orderNumber}`,
        });
      }
      // 5. A kitchen that pays Nuray's delivery fee: it comes off what Nuray owes the kitchen.
      for (const share of liveBreakdown.filter((r) => r.paidBy === 'seller')) {
        entries.push({
          orderId,
          transactionType: 'seller_delivery_charge',
          accountType: 'liability',
          entryType: 'debit',
          amount: share.fee,
          currency: 'PKR',
          description: `Delivery fee paid by the kitchen for Order #${order.orderNumber}, taken from its earnings`,
          sellerId: share.sellerId,
        });
      }
      for (const share of selfDeliveryShares) {
        entries.push({
          orderId,
          transactionType: 'seller_delivery_fee',
          accountType: 'liability',
          entryType: 'credit',
          amount: share.fee,
          currency: 'PKR',
          description: `Self-delivery fee payable to seller for Order #${order.orderNumber}`,
          sellerId: share.sellerId,
        });
      }

      await tx.ledgerEntry.createMany({ data: entries as any });
      return { recorded: true, orderId };
    });
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
