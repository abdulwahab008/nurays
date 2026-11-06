// The words and tag colours the admin order screens use for an order's status and its payment.

export const STATUS_LABEL: Record<string, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  preparing: 'Preparing',
  ready: 'Ready',
  dispatched: 'Picked up',
  in_transit: 'On the way',
  delivered: 'Delivered',
  delivery_failed: 'Delivery failed',
  completed: 'Completed',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
};

export const statusLabel = (status: string) => STATUS_LABEL[status] ?? status.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

const TAG = 'inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium';
export const TAG_QUIET = `${TAG} bg-raised text-muted`;
export const TAG_GOOD = `${TAG} bg-brand-soft text-brand-soft-ink`;
export const TAG_WAITING = `${TAG} bg-accent-soft text-accent-soft-ink`;
export const TAG_PROBLEM = `${TAG} bg-red-50 text-red-700`;

/** One small pill per status: done or ready is turquoise, waiting is yellow, a problem is red, the rest quiet. */
export function statusTag(status: string): string {
  if (status === 'delivery_failed') return TAG_PROBLEM;
  if (status === 'pending') return TAG_WAITING;
  if (['ready', 'delivered', 'completed'].includes(status)) return TAG_GOOD;
  return TAG_QUIET;
}

export const METHOD_LABEL: Record<string, string> = {
  cod: 'Cash on delivery',
  wallet: 'Nuray Wallet',
  safepay: 'Online (Safepay)',
  card: 'Card',
  jazzcash: 'JazzCash transfer',
  easypaisa: 'EasyPaisa transfer',
  bank: 'Bank transfer',
};

export const methodLabel = (method?: string | null) => (method ? (METHOD_LABEL[method] ?? method) : 'Not recorded');

/** What the payment of an order means for the admin, as words and a tag colour. */
export function paymentState(order: { paymentStatus: string; paymentMethod?: string | null; orderStatus: string }): { label: string; tag: string } {
  const cash = order.paymentMethod === 'cod';
  const closed = order.orderStatus === 'cancelled';
  switch (order.paymentStatus) {
    case 'paid':
      return { label: 'Paid', tag: TAG_GOOD };
    case 'refund_pending':
      return { label: 'Refund owed', tag: TAG_WAITING };
    case 'refunded':
      return { label: 'Refunded', tag: TAG_QUIET };
    case 'disputed':
      return { label: 'Transfer disputed', tag: TAG_PROBLEM };
    case 'payment_submitted':
      return { label: 'Receipt to check', tag: TAG_WAITING };
    case 'failed':
      return { label: 'Payment failed', tag: TAG_PROBLEM };
    case 'pending':
      if (cash) return closed ? { label: 'Cash, not collected', tag: TAG_QUIET } : { label: 'Cash due', tag: TAG_WAITING };
      return closed ? { label: 'Not paid', tag: TAG_QUIET } : { label: 'Awaiting payment', tag: TAG_WAITING };
    default:
      return { label: statusLabel(order.paymentStatus), tag: TAG_QUIET };
  }
}
