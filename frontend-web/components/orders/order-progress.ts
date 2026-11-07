/**
 * Where an order stands, as the customer's tracker shows it: the same five steps on the orders list and the order page.
 * No imports, so `npm test` covers it (tests/unit/order-progress.test.ts).
 */
export type ProgressStep = 'placed' | 'accepted' | 'cooking' | 'ready' | 'onTheWay' | 'readyToCollect' | 'delivered' | 'collected';

const ONLINE_OR_TRANSFER = ['safepay', 'card', 'jazzcash', 'easypaisa', 'bank'];
const UNPAID = ['pending', 'failed', 'disputed', 'payment_submitted'];
const ENDED = ['cancelled', 'refunded', 'delivery_failed'];

export function isPickupOrder(deliveryType?: string | null): boolean {
  return deliveryType === 'self_pickup' || deliveryType === 'hub_pickup';
}

/** An order paid online or by transfer that is not paid yet: the kitchen does not start on it until it is. */
export function awaitingPayment(status: string, paymentMethod?: string | null, paymentStatus?: string | null): boolean {
  return (
    status === 'pending' &&
    ONLINE_OR_TRANSFER.includes((paymentMethod ?? '').toLowerCase()) &&
    UNPAID.includes(paymentStatus ?? 'pending')
  );
}

/**
 * The tracker's five steps and how far the order has got (the index of the step it is on), or null for an order that
 * ended without arriving (cancelled, refunded, failed), which has no tracker.
 */
export function orderProgress(status: string, deliveryType?: string | null): { steps: ProgressStep[]; reached: number } | null {
  if (ENDED.includes(status)) return null;
  const pickup = isPickupOrder(deliveryType);
  const ready = status === 'ready';
  const steps: ProgressStep[] = pickup
    ? ['placed', 'accepted', 'cooking', 'readyToCollect', 'collected']
    : ['placed', 'accepted', ready ? 'ready' : 'cooking', 'onTheWay', 'delivered'];
  const reached: Record<string, number> = {
    pending: 0,
    confirmed: 1,
    preparing: 2,
    // Cooked and packed: for a delivery it waits for the rider (the cooking step reads "Ready"), for a pickup it is the collecting step.
    ready: pickup ? 3 : 2,
    dispatched: 3,
    in_transit: 3,
    arrived: 3,
    delivered: 4,
    completed: 4,
  };
  return { steps, reached: reached[status] ?? 0 };
}

/** What the customer is told about the payment on a list card: nothing to pay on a cancelled order that was never paid. */
export type PaymentNote = 'paid' | 'onDelivery' | 'awaitingPayment' | 'notCharged' | 'refunded' | 'refundPending' | 'submitted' | 'failed';

export function paymentNote(status: string, paymentMethod?: string | null, paymentStatus?: string | null): PaymentNote {
  const pay = paymentStatus ?? 'pending';
  if (pay === 'refunded') return 'refunded';
  if (pay === 'refund_pending') return 'refundPending';
  if (pay === 'paid') return 'paid';
  if (ENDED.includes(status)) return 'notCharged';
  if (pay === 'payment_submitted') return 'submitted';
  if (pay === 'failed') return 'failed';
  return ONLINE_OR_TRANSFER.includes((paymentMethod ?? '').toLowerCase()) ? 'awaitingPayment' : 'onDelivery';
}
