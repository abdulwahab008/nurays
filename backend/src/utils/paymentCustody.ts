/**
 * Who holds an order's money.
 *
 * Nuray is a facilitator: depending on how the customer paid, the money lands
 * in different hands, and what each side owes the other follows from that.
 *
 *  - 'platform': wallet balance or an online gateway (Safepay). The platform holds
 *    the money and owes the seller their share.
 *  - 'seller':   a manual transfer into the seller's own JazzCash / EasyPaisa / bank
 *    account, or cash taken by the seller at a self-delivery or pickup. The seller
 *    holds everything, and owes the platform whatever isn't theirs (commission,
 *    the platform's delivery fee, tax, refunds the platform paid out).
 *  - 'rider':    cash taken at the door by a Nuray rider. The rider owes it to the
 *    platform, and the platform owes the seller their share.
 */

export type PaymentCollector = 'platform' | 'seller' | 'rider';
export type DeliveryProvider = 'platform' | 'self';

/** Payment methods that send the money straight to the seller (see getSellerPaymentDetails). */
export const SELLER_DIRECT_METHODS = ['jazzcash', 'easypaisa', 'bank'];
/** Payment methods whose money the platform receives. */
export const PLATFORM_METHODS = ['wallet', 'safepay', 'card'];

interface OrderDeliveryShape {
  deliveryType: string;
  deliveryProvider?: string | null;
  deliveryFeeBreakdown?: unknown;
}

/**
 * Who delivers this order. Pickups have no delivery. Orders created before the
 * provider was stored fall back to the provider snapshotted in the fee breakdown.
 */
export function deliveryProviderOf(order: OrderDeliveryShape, fallback?: string | null): DeliveryProvider | null {
  if (order.deliveryType !== 'home_delivery') return null;
  if (order.deliveryProvider === 'self' || order.deliveryProvider === 'platform') return order.deliveryProvider;
  const rows = Array.isArray(order.deliveryFeeBreakdown) ? (order.deliveryFeeBreakdown as Array<Record<string, unknown>>) : [];
  if (rows.length > 0) return rows.some((r) => r && r.provider === 'self') ? 'self' : 'platform';
  return fallback === 'self' ? 'self' : 'platform';
}

/** Who takes the cash for a COD order. */
export function codCollectorOf(order: OrderDeliveryShape): PaymentCollector {
  if (order.deliveryType === 'self_pickup') return 'seller';
  if (order.deliveryType === 'hub_pickup') return 'platform';
  return deliveryProviderOf(order) === 'self' ? 'seller' : 'rider';
}

/**
 * Who received the money for a paid order: the stored value when present, else
 * derived from the payment method (orders paid before it was recorded).
 */
export function collectorOf(order: OrderDeliveryShape & { paymentMethod: string; paymentCollectedBy?: string | null }): PaymentCollector {
  const stored = order.paymentCollectedBy;
  if (stored === 'platform' || stored === 'seller' || stored === 'rider') return stored;
  if (order.paymentMethod === 'cod') return codCollectorOf(order);
  if (SELLER_DIRECT_METHODS.includes(order.paymentMethod)) return 'seller';
  return 'platform';
}
