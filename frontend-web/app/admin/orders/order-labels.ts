// The words and tones the admin order screens use for an order's status and its payment.

import type { StatusTone } from '@/components/ui/StatusPill';

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

type PaymentFacts = { paymentStatus: string; paymentMethod?: string | null; orderStatus: string };

/** A cancelled order nobody paid for has no payment to speak of, so neither the list nor the order shows one. */
export const nothingToCollect = (order: PaymentFacts) => order.orderStatus === 'cancelled' && order.paymentStatus === 'pending';

/** What the payment of an order means for the admin, as words and a tone. */
export function paymentState(order: PaymentFacts): { label: string; tone: StatusTone } {
  const cash = order.paymentMethod === 'cod';
  const closed = order.orderStatus === 'cancelled';
  switch (order.paymentStatus) {
    case 'paid':
      return { label: 'Paid', tone: 'good' };
    case 'refund_pending':
      return { label: 'Refund owed', tone: 'waiting' };
    case 'refunded':
      return { label: 'Refunded', tone: 'neutral' };
    case 'disputed':
      return { label: 'Transfer disputed', tone: 'problem' };
    case 'payment_submitted':
      return { label: 'Receipt to check', tone: 'waiting' };
    case 'failed':
      return { label: 'Payment failed', tone: 'problem' };
    case 'pending':
      if (cash) return closed ? { label: 'Cash, not collected', tone: 'neutral' } : { label: 'Cash due', tone: 'waiting' };
      return closed ? { label: 'Not paid', tone: 'neutral' } : { label: 'Awaiting payment', tone: 'waiting' };
    default:
      return { label: statusLabel(order.paymentStatus), tone: 'neutral' };
  }
}
