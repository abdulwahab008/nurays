import type { Prisma } from '@prisma/client';
import prisma from '../config/database';
import { pageArgs } from '../utils/pagination';
import { parseBreakdown, platformDeliveryFee } from '../utils/deliveryEarnings';
import { collectorOf } from '../utils/paymentCustody';
import { roundMoney } from '../utils/pricing';
import { splitRefund } from '../utils/postDeliveryRefund';

/** A refund made at or after delivery (a goodwill refund) rather than for dishes cancelled before it. */
export const isAfterDelivery = (refundedAt: Date, deliveredAt: Date | null) => deliveredAt !== null && refundedAt >= deliveredAt;
/** The refund a reversal entry belongs to, or null for an order's own entries. */
const reversalOf = (e: { metadata: Prisma.JsonValue }) => {
  const m = e.metadata as { refundId?: unknown } | null;
  return typeof m?.refundId === 'string' ? m.refundId : null;
};

const CATCH_UP_DAYS = 14;
const CATCH_UP_SETTLE_MS = 5 * 60 * 1000;

export class LedgerService {
  /**
   * Posts delivered, paid orders that have no entries. The posting runs after the delivery commits and a failure there is
   * only logged, so without this the platform ledger would silently miss the order. Recent orders only (and not the last
   * few minutes, which the delivery path may still be posting); recordOrderCompletion skips any posted meanwhile.
   */
  async postMissedCompletions(now: Date = new Date()) {
    const since = new Date(now.getTime() - CATCH_UP_DAYS * 24 * 60 * 60 * 1000);
    const settled = new Date(now.getTime() - CATCH_UP_SETTLE_MS);
    const missed = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT o.id FROM orders o
      WHERE o.created_at > ${since}
        AND o.payment_status = 'paid'
        AND o.order_status IN ('delivered', 'completed')
        AND o.updated_at < ${settled}
        AND NOT EXISTS (SELECT 1 FROM ledger_entries l WHERE l.order_id = o.id)
      ORDER BY o.created_at
      LIMIT 100`;
    let posted = 0;
    for (const { id } of missed) {
      const result = await this.recordOrderCompletion(id);
      if (result.recorded) posted++;
    }
    return { checked: missed.length, posted };
  }

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

      // What the customer paid net of refunds made before delivery (cancelled dishes). A refund after delivery is posted
      // as its own reversal once it is paid (reverseRefund), so it never changes what was sold.
      const refunds = await tx.refund.findMany({ where: { orderId, status: { not: 'failed' } }, orderBy: { createdAt: 'asc' } });
      const afterDelivery = refunds.filter((r) => isAfterDelivery(r.createdAt, order.deliveredAt));
      const refundedAmount = refunds.filter((r) => !afterDelivery.includes(r)).reduce((sum, r) => sum + Number(r.amount), 0);
      const totalAmount = Math.max(0, Number(order.totalAmount) - refundedAmount);

      const totalCommission = liveItems.reduce((sum, item) => sum + Number(item.commissionAmount), 0);
      const totalSellerPayout = liveItems.reduce((sum, item) => sum + Number(item.sellerPayout), 0);
      const primarySellerId = liveItems[0]?.sellerId ?? order.items[0]?.sellerId ?? null;

      // Delivery fees: a seller with nothing left to deliver had theirs refunded.
      const breakdown = parseBreakdown(order.deliveryFeeBreakdown);
      const liveBreakdown = breakdown.filter((r) => liveSellerIds.has(r.sellerId));
      const platformFee = breakdown.length
        ? liveBreakdown.filter((r) => r.provider !== 'self').reduce((sum, r) => sum + r.fee, 0)
        : platformDeliveryFee(Number(order.deliveryFee), order.deliveryFeeBreakdown); // legacy order: no split
      // A self-delivering seller's fee is theirs. When they collected the payment themselves it is kept from it, like
      // their earnings; either way it is credited, or the customer payment (which includes it) would not balance.
      const selfDeliveryShares = liveBreakdown.filter((r) => r.provider === 'self');

      const entries: Prisma.LedgerEntryCreateManyInput[] = [
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
          description:
            collectedBy === 'seller'
              ? `Self-delivery fee for Order #${order.orderNumber}, kept from the payment the seller collected`
              : `Self-delivery fee payable to seller for Order #${order.orderNumber}`,
          sellerId: share.sellerId,
        });
      }

      // 6. GST the customer paid: Nuray files it with the tax office whoever held the cash (a kitchen that collected it
      // owes it to Nuray), so it is owed, not earned. After a refund only the tax on what was still sold is owed; the
      // refund gave back the tax on cancelled dishes. An order re-priced before payment already carries the right tax.
      const goods = (items: typeof order.items) => items.reduce((sum, i) => sum + Number(i.totalPrice) - Number(i.promoDiscount ?? 0), 0);
      const allGoods = goods(order.items);
      const soldShare = refundedAmount > 0 && allGoods > 0 ? goods(liveItems) / allGoods : 1;
      const gst = Math.min(totalAmount, roundMoney(Number(order.taxAmount) * soldShare));
      if (gst > 0) {
        entries.push({
          orderId,
          transactionType: 'gst_payable',
          accountType: 'liability',
          entryType: 'credit',
          amount: gst,
          currency: 'PKR',
          description: `GST (5%) collected for Order #${order.orderNumber}, payable to the tax office`,
        });
      }
      // 7. A discount Nuray pays for (a platform promo code): the customer paid less but the kitchen earns, and Nuray
      // takes commission, as on the full price. Nuray's cost is what keeps the books level.
      const side = (type: 'debit' | 'credit') => entries.filter((e) => e.entryType === type).reduce((sum, e) => sum + Number(e.amount), 0);
      const platformDiscount = roundMoney(side('credit') - side('debit'));
      if (Number(order.discountAmount) > 0 && platformDiscount > 0) {
        entries.push({
          orderId,
          transactionType: 'platform_discount',
          accountType: 'expense',
          entryType: 'debit',
          amount: Math.min(platformDiscount, Number(order.discountAmount)),
          currency: 'PKR',
          description: `Discount Nuray paid for on Order #${order.orderNumber} (platform promo code)`,
        });
      }

      await tx.ledgerEntry.createMany({ data: entries });
      for (const r of afterDelivery.filter((x) => x.status === 'completed')) await this.reverseRefund(tx, orderId, r.id, Number(r.amount));
      return { recorded: true, orderId };
    });
  }

  /**
   * A refund after delivery, once paid: reversal entries take its share off the kitchen's earnings, Nuray's commission,
   * the GST and any discount Nuray paid for, in proportion (utils/postDeliveryRefund.ts); the delivery fees stay. They are
   * dated when the refund is paid, so a month already reported or invoiced never changes. Nothing is posted while the
   * order has no entries yet: posting it includes the refund. Once per refund.
   */
  async reverseRefund(tx: Prisma.TransactionClient, orderId: string, refundId: string, amount: number) {
    const entries = await tx.ledgerEntry.findMany({ where: { orderId } });
    if (entries.length === 0 || entries.some((e) => reversalOf(e) === refundId)) return;
    const original = entries.filter((e) => !reversalOf(e));
    const total = (type: string, side: 'debit' | 'credit') =>
      original.filter((e) => e.transactionType === type && e.entryType === side).reduce((sum, e) => sum + Number(e.amount), 0);
    const base = { sellerEarning: total('seller_earning', 'credit'), commission: total('platform_commission', 'credit'), gst: total('gst_payable', 'credit'), platformDiscount: total('platform_discount', 'debit') };
    const earlier = entries.filter((e) => reversalOf(e) && e.transactionType === 'refund').reduce((sum, e) => sum + Number(e.amount), 0);
    const before = splitRefund(earlier, base);
    const after = splitRefund(earlier + amount, base);
    const sellerId = original.find((e) => e.transactionType === 'seller_earning')?.sellerId ?? null;
    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, select: { orderNumber: true } });

    const lines: Prisma.LedgerEntryCreateManyInput[] = [];
    // `side` is the side that lowers the account; a negative change (rounding) goes on the other side.
    const add = (transactionType: string, accountType: string, side: 'debit' | 'credit', change: number, description: string, seller: string | null = null) => {
      const value = roundMoney(change);
      if (value === 0) return;
      const entryType = value > 0 ? side : side === 'debit' ? 'credit' : 'debit';
      lines.push({ orderId, transactionType, accountType, entryType, amount: Math.abs(value), currency: 'PKR', description, sellerId: seller, metadata: { refundId } });
    };
    const what = `refund after delivery on Order #${order.orderNumber}`;
    add('refund', 'asset', 'credit', after.refund - before.refund, `Paid back to the customer: ${what}`);
    add('seller_earning', 'liability', 'debit', after.sellerEarning - before.sellerEarning, `The kitchen's share of the ${what}`, sellerId);
    add('platform_commission', 'revenue', 'debit', after.commission - before.commission, `Nuray's commission on the ${what}`, sellerId);
    add('gst_payable', 'liability', 'debit', after.gst - before.gst, `GST given back with the ${what}`);
    add('platform_discount', 'expense', 'credit', after.platformDiscount - before.platformDiscount, `Nuray's discount on the ${what}`);
    if (lines.length) await tx.ledgerEntry.createMany({ data: lines });
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
    const { page, limit, skip } = pageArgs(filters.page, filters.limit, 50, 100);

    const where: Prisma.LedgerEntryWhereInput = {};
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
