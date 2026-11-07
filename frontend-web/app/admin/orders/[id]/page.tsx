'use client';

import { useState, useEffect, type ReactNode } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ChevronDown, ChevronLeft } from 'lucide-react';
import { describeAction } from '../../audit-log/describe';
import { AdminShell } from '@/components/layout/AdminShell';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { LoadError } from '@/components/ui/LoadError';
import { useDialogs } from '@/components/ui/Dialogs';
import { useAuthStore } from '@/lib/store/auth-store';
import { apiClient, apiErrorMessage, apiErrorStatus } from '@/lib/api-client';
import { formatPrice } from '@/lib/utils';
import { formatDate, formatDateTime } from '@/components/admin/admin-dates';
import { ExternalLink } from '@/components/ExternalLink';
import { OrderStatusPill, PhoneText, StatusPill } from '@/components/admin/AdminListParts';
import { methodLabel, nothingToCollect, paymentState, statusLabel } from '../order-labels';

interface OrderDetail {
  id: string;
  orderNumber: string;
  subtotal: number;
  deliveryFee: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
  orderStatus: string;
  paymentStatus: string;
  paymentMethod: string;
  paymentReferenceNumber?: string | null;
  paymentSenderAccount?: string | null;
  paymentProofUrl?: string | null;
  paymentDisputeReason?: string | null;
  paymentSubmittedAt?: string | null;
  deliveryType: string;
  /** Who pays each delivery: { fee, paidBy: 'customer' | 'seller', provider: 'platform' (a Nuray rider) | 'seller' }. */
  deliveryFeeBreakdown?: Array<{ fee: number; paidBy?: string; provider?: string }> | null;
  createdAt: string;
  estimatedDeliveryAt?: string;
  deliveredAt?: string;
  deliveryAddress?: { addressLine1: string; area: string; city: string };
  customer?: { id: string; email?: string; phone?: string; profile?: { fullName?: string } };
  items: Array<{
    id: string;
    productName: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    seller?: { businessName: string };
  }>;
  statusHistory?: Array<{ status: string; notes?: string; createdAt: string; changedByName?: string | null }>;
  investigation?: {
    rider: { name: string | null; phone: string | null; email: string | null; vehicle: string } | null;
    paymentAttempts: Array<{ id: string; gateway: string; tracker: string; amount: number; status: string; settledVia: string | null; createdAt: string }>;
    walletTransactions: Array<{ id: string; transactionType: string; amount: number; status: string; description: string | null; createdAt: string }>;
    ledgerEntries: Array<{ id: string; transactionType: string; accountType: string; entryType: string; amount: number; description: string | null; createdAt: string }>;
    riderLedgerEntries: Array<{ id: string; type: string; amount: number; note: string | null; createdAt: string }>;
    supportTickets: Array<{ id: string; ticketNumber: string; subject: string; status: string; priority: string; createdAt: string }>;
    adminActions: Array<{ id: string; action: string; status: number | null; details: unknown; createdAt: string; admin: string | null }>;
  };
  refunds?: Array<{
    id: string;
    amount: number;
    method: 'wallet' | 'manual';
    status: 'pending' | 'completed' | 'failed';
    reason?: string | null;
    reference?: string | null;
    createdAt: string;
  }>;
}

// Steps a rider normally makes, checked with a pickup or delivery code; an admin can still make them, after a warning.
const RIDER_STEPS = new Set(['dispatched', 'in_transit', 'delivered']);
const ORDER_FORWARD_SEQUENCE = ['pending', 'confirmed', 'preparing', 'ready', 'dispatched', 'in_transit', 'delivered', 'completed'];

const section = 'pt-5 border-t border-line';

type Investigation = NonNullable<OrderDetail['investigation']>;
type InvestigationRow = { text: ReactNode; raw: string };

const ATTEMPT_STATUS: Record<string, string> = { pending: 'started, not finished', paid: 'paid', duplicate: 'paid a second time', expired: 'expired before it was paid' };
const SETTLED_VIA: Record<string, string> = { return: 'confirmed when the customer came back', webhook: 'confirmed by the gateway' };
const WALLET_TYPE: Record<string, string> = { credit: 'Added to the wallet', debit: 'Paid from the wallet' };
const LEDGER_TYPE: Record<string, string> = {
  customer_payment: 'Customer paid',
  seller_earning: 'Kitchen earned',
  platform_commission: 'Nuray commission',
  delivery_fee: 'Delivery fee kept by Nuray',
  seller_delivery_charge: 'Delivery taken from the kitchen',
  seller_delivery_fee: 'Own-rider delivery fee owed to the kitchen',
  refund: 'Refund',
  adjustment: 'Correction',
};
const RIDER_LEDGER_TYPE: Record<string, string> = {
  cod_collected: 'Cash collected from the customer',
  delivery_fee: 'Delivery fee earned',
  bonus: 'Bonus',
  cash_deposit: 'Cash handed in',
  payout: 'Paid out',
  adjustment: 'Correction',
};

const sentence = (s: string) => s.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
const plain = (map: Record<string, string>, key: string) => map[key] ?? sentence(key);

/** The rupees an admin action asked for (a refund's amount), so repeated attempts can be told apart. */
function actionAmount(details: unknown): number | null {
  if (details == null || typeof details !== 'object') return null;
  const { refundAmount, amount } = details as { refundAmount?: unknown; amount?: unknown };
  const value = refundAmount ?? amount;
  return typeof value === 'number' ? value : null;
}

/** The money and admin trail behind an order, in plain words; the stored values stay one tap away. */
function investigationGroups(inv: Investigation): Array<{ title: string; rows: InvestigationRow[]; open?: boolean }> {
  return [
    {
      title: 'Payment attempts',
      rows: inv.paymentAttempts.map((a) => ({
        text: `${sentence(a.gateway)} payment of ${formatPrice(a.amount)}, ${plain(ATTEMPT_STATUS, a.status)}${a.settledVia ? `, ${plain(SETTLED_VIA, a.settledVia)}` : ''} · ${formatDate(a.createdAt)}`,
        raw: `${a.gateway} ${a.status} ${a.settledVia ?? ''} tracker ${a.tracker} · ${a.id}`,
      })),
    },
    {
      title: 'Wallet movements',
      rows: inv.walletTransactions.map((w) => ({
        text: `${plain(WALLET_TYPE, w.transactionType)}: ${formatPrice(w.amount)}${w.status === 'completed' ? '' : ` (${sentence(w.status).toLowerCase()})`} · ${formatDate(w.createdAt)}`,
        raw: `${w.transactionType} ${w.status}${w.description ? ` · ${w.description}` : ''} · ${w.id}`,
      })),
    },
    {
      title: 'Ledger entries',
      rows: inv.ledgerEntries.map((l) => ({
        text: `${plain(LEDGER_TYPE, l.transactionType)}: ${formatPrice(l.amount)} · ${formatDate(l.createdAt)}`,
        raw: `${l.transactionType} ${l.accountType} ${l.entryType}${l.description ? ` · ${l.description}` : ''} · ${l.id}`,
      })),
    },
    {
      title: 'Rider ledger',
      rows: inv.riderLedgerEntries.map((l) => ({
        text: `${plain(RIDER_LEDGER_TYPE, l.type)}: ${formatPrice(l.amount)}${l.note ? ` · ${l.note}` : ''} · ${formatDate(l.createdAt)}`,
        raw: `${l.type} · ${l.id}`,
      })),
    },
    {
      title: 'Admin actions on this order',
      open: true,
      rows: inv.adminActions.map((a) => {
        const refused = a.status != null && a.status >= 400;
        const amount = actionAmount(a.details);
        return {
          text: (
            <>
              {describeAction(a.action, { refused })}
              {amount != null && (
                <>
                  {' '}of <bdi>{formatPrice(amount)}</bdi>
                </>
              )}{' '}
              by <bdi>{a.admin || 'an unknown admin'}</bdi>
              {refused ? ', refused (nothing changed)' : ''} · <bdi>{formatDateTime(a.createdAt)}</bdi>
            </>
          ),
          raw: `${a.action} (${a.status ?? 'no answer'})${a.details != null ? ` ${JSON.stringify(a.details)}` : ''}`,
        };
      }),
    },
  ].filter((g) => g.rows.length > 0);
}

function InvestigationGroup({ title, rows, open }: { title: string; rows: InvestigationRow[]; open?: boolean }) {
  const [technical, setTechnical] = useState(false);
  return (
    <details className="group text-sm" open={open}>
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 font-medium text-ink [&::-webkit-details-marker]:hidden">
        <ChevronDown aria-hidden="true" className="h-4 w-4 text-muted transition-transform group-open:rotate-180" />
        {title} <span className="font-normal text-muted">({rows.length})</span>
      </summary>
      <ul className="mt-1 space-y-1 text-sm text-ink break-words">
        {rows.map((r, i) => (
          <li key={i}>
            {r.text}
            {technical && <p className="text-xs text-muted break-all" data-ltr>{r.raw}</p>}
          </li>
        ))}
      </ul>
      <button type="button" onClick={() => setTechnical(!technical)} aria-expanded={technical} className="min-h-11 text-xs font-medium text-brand-ink hover:underline">
        {technical ? 'Hide technical details' : 'Show technical details'}
      </button>
    </details>
  );
}
const sectionTitle = 'text-sm font-semibold text-ink mb-2';

export default function AdminOrderDetailPage() {
  const params = useParams();
  const id = params?.id as string;
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const { showToast } = useToast();
  const { confirm: confirmDialog, ask: askDialog } = useDialogs();
  const [loading, setLoading] = useState(true);
  // An order that could not be read is not an order that does not exist: only a 404 says "not found".
  const [loadError, setLoadError] = useState<unknown>(null);
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [updating, setUpdating] = useState(false);
  const [showCancelForm, setShowCancelForm] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [showRefundForm, setShowRefundForm] = useState(false);
  const [refundAmount, setRefundAmount] = useState('');
  const [refundReason, setRefundReason] = useState('');
  const [confirmNote, setConfirmNote] = useState('');
  const [confirmingPayment, setConfirmingPayment] = useState(false);

  // Dismissed refunds (status "failed") were never owed, so they do not count against what can still be refunded.
  const refundedSoFar = (order?.refunds ?? []).filter((r) => r.status !== 'failed').reduce((sum, r) => sum + Number(r.amount), 0);
  const refundable = order ? Math.max(0, Math.round((Number(order.totalAmount) - refundedSoFar) * 100) / 100) : 0;

  const loadOrder = async () => {
    try {
      setLoading(true);
      const response = await apiClient.get(`/admin/orders/${id}`);
      if (response.data.success) {
        setOrder(response.data.data);
      } else {
        setOrder(null);
      }
      setLoadError(null);
    } catch (error) {
      setOrder(null);
      // Only a 404 says the order does not exist; anything else is a read that failed, and says so.
      setLoadError(apiErrorStatus(error) === 404 ? null : error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated && id) loadOrder();
  }, [isAuthenticated, id]);

  const updateStatus = async (selectedStatus: string) => {
    if (!order || selectedStatus === order.orderStatus) return;
    const label = statusLabel(selectedStatus).toLowerCase();
    const skipsRider = RIDER_STEPS.has(selectedStatus);
    if (
      !(await confirmDialog({
        title: `Mark as ${label}?`,
        message: skipsRider
          ? 'This skips the rider: no pickup or delivery code is checked. Only do it when you know the order really moved.'
          : `The kitchen and the customer see the order as ${label}.`,
        confirmText: `Mark as ${label}`,
        variant: 'warning',
      }))
    )
      return;
    try {
      setUpdating(true);
      await apiClient.patch(`/admin/orders/${order.id}/status`, { status: selectedStatus });
      showToast('Order status updated', 'success');
      loadOrder();
    } catch (error) {
      showToast(apiErrorMessage(error, 'Failed to update status'), 'error');
    } finally {
      setUpdating(false);
    }
  };

  const handleCancelOrder = async () => {
    if (!order || cancelReason.trim().length < 5) {
      showToast('Please enter a reason (at least 5 characters)', 'warning');
      return;
    }
    try {
      setUpdating(true);
      await apiClient.post(`/admin/orders/${order.id}/cancel`, { reason: cancelReason.trim() });
      showToast('Order cancelled and stock restored', 'success');
      setShowCancelForm(false);
      setCancelReason('');
      loadOrder();
    } catch (error) {
      showToast(apiErrorMessage(error, 'Failed to cancel order'), 'error');
    } finally {
      setUpdating(false);
    }
  };

  const handleRetryDelivery = async () => {
    if (!order) return;
    try {
      setUpdating(true);
      await apiClient.post(`/admin/orders/${order.id}/retry-delivery`, {});
      showToast('Delivery sent back out for dispatch', 'success');
      loadOrder();
    } catch (error) {
      showToast(apiErrorMessage(error, 'Failed to retry delivery'), 'error');
    } finally {
      setUpdating(false);
    }
  };

  // A transfer the kitchen disputed (or hasn't confirmed): support checked it and it arrived.
  const handleConfirmPayment = async () => {
    if (!order) return;
    if (!(await confirmDialog({ title: 'Confirm the payment?', message: 'Confirm that this transfer reached the kitchen? The order is then marked paid.', confirmText: 'Confirm payment', variant: 'warning' }))) return;
    try {
      setConfirmingPayment(true);
      await apiClient.post(`/admin/orders/${order.id}/confirm-payment`, { note: confirmNote.trim() || undefined });
      showToast('Payment confirmed', 'success');
      setConfirmNote('');
      await loadOrder();
    } catch (error) {
      showToast(apiErrorMessage(error, 'Could not confirm the payment'), 'error');
    } finally {
      setConfirmingPayment(false);
    }
  };

  // A manual (bank / gateway) refund is owed until the admin has actually sent the money.
  const handleCompleteRefund = async (refundId: string) => {
    const entered = (await askDialog({ title: 'Mark the refund as sent', message: 'Transfer reference for this refund (optional).', label: 'Transfer reference', optional: true, confirmText: 'Mark as sent' }));
    if (entered === null) return; // cancelled the prompt: don't mark the refund as sent
    const reference = entered.trim() || undefined;
    try {
      setUpdating(true);
      await apiClient.post(`/admin/refunds/${refundId}/complete`, reference ? { reference } : {});
      showToast('Refund marked as sent', 'success');
      loadOrder();
    } catch (error) {
      showToast(apiErrorMessage(error, 'Failed to update refund'), 'error');
    } finally {
      setUpdating(false);
    }
  };

  const handleDismissRefund = async (refundId: string) => {
    const reason = (await askDialog({ title: 'Dismiss this refund', message: 'Why is this refund not owed?', label: 'Reason', minLength: 5, confirmText: 'Dismiss refund' }));
    if (reason === null) return;
    if (reason.trim().length < 5) {
      showToast('Please give a reason (at least 5 characters)', 'warning');
      return;
    }
    try {
      setUpdating(true);
      await apiClient.post(`/admin/refunds/${refundId}/dismiss`, { reason: reason.trim() });
      showToast('Refund dismissed', 'success');
      loadOrder();
    } catch (error) {
      showToast(apiErrorMessage(error, 'Failed to dismiss refund'), 'error');
    } finally {
      setUpdating(false);
    }
  };

  const handleProcessRefund = async () => {
    if (!order) return;
    const amount = refundAmount.trim() ? parseFloat(refundAmount.trim()) : refundable;
    if (Number.isNaN(amount) || amount <= 0 || amount > refundable) {
      showToast(`Enter an amount up to ${formatPrice(refundable)}`, 'warning');
      return;
    }
    if (refundReason.trim().length < 3) {
      showToast('Say why the customer is being refunded', 'warning');
      return;
    }
    const who = order.customer?.profile?.fullName || 'the customer';
    const how = order.paymentMethod === 'wallet' ? 'to their Nuray wallet' : 'by manual transfer';
    if (!(await confirmDialog({ title: 'Refund this order?', message: `Refund ${formatPrice(amount)} to ${who} ${how}?`, confirmText: `Refund ${formatPrice(amount)}`, variant: 'warning' }))) return;
    try {
      setUpdating(true);
      const res = await apiClient.post(`/admin/orders/${order.id}/refund`, { refundAmount: amount, reason: refundReason.trim() });
      showToast(`Refund of ${formatPrice(Number(res.data?.data?.refundAmount ?? amount))} recorded`, 'success');
      setShowRefundForm(false);
      setRefundAmount('');
      setRefundReason('');
      loadOrder();
    } catch (error) {
      showToast(apiErrorMessage(error, 'Failed to process refund'), 'error');
    } finally {
      setUpdating(false);
    }
  };

  // Mirrors the backend's isValidOrderStatusTransition: an admin moves an order exactly one step forward at a time (or to
  // Cancelled, through the cancel flow below), so only that single next step is offered.
  const currentIndex = order ? ORDER_FORWARD_SEQUENCE.indexOf(order.orderStatus) : -1;
  const nextStatus = currentIndex >= 0 && currentIndex < ORDER_FORWARD_SEQUENCE.length - 2 ? ORDER_FORWARD_SEQUENCE[currentIndex + 1] : null;
  const payment = order && !nothingToCollect(order) ? paymentState(order) : null;
  const kitchenPaidDeliveries = (order?.deliveryFeeBreakdown ?? []).filter((d) => Number(d.fee) > 0 && d.paidBy === 'seller');
  const canChangeStatus = !!order && !['delivered', 'completed', 'cancelled', 'refunded'].includes(order.orderStatus);

  return (
    <AdminShell>
      <div className="max-w-4xl">
        <div className="-mt-2 mb-2">
          <Link href="/admin/orders" className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-brand-ink hover:underline">
            <ChevronLeft aria-hidden="true" className="h-4 w-4 rtl:rotate-180" />
            All orders
          </Link>
        </div>

        {loading && !order ? (
          <div className="flex items-center justify-center gap-3 py-12 text-sm text-muted" role="status">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-line-strong border-t-brand-ink" aria-hidden="true" />
            Loading the order…
          </div>
        ) : loadError ? (
          <LoadError error={loadError} onRetry={loadOrder} title="We couldn't load this order" />
        ) : !order ? (
          <div className="py-12 text-center space-y-3">
            <p className="text-sm text-muted">There is no order with this link.</p>
            <Link href="/admin/orders" className="text-sm font-medium text-brand-ink underline">Back to orders</Link>
          </div>
        ) : (
          <div className="bg-surface border border-line rounded-2xl shadow-[var(--shadow-card)]">
            <div className="p-4 sm:p-6 border-b border-line">
              <h1 className="text-xl font-semibold text-ink sm:text-2xl">
                Order <span className="whitespace-nowrap">#{order.orderNumber}</span>
              </h1>
              <p className="text-sm text-muted mt-1">Placed {formatDateTime(order.createdAt)}</p>
              <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <dt className="text-muted">Order</dt>
                  <dd data-testid="order-status">
                    <OrderStatusPill status={order.orderStatus} label={statusLabel(order.orderStatus)} />
                  </dd>
                </div>
                {payment && (
                  <div className="flex items-center gap-2">
                    <dt className="text-muted">Payment</dt>
                    <dd data-testid="payment-status">
                      <StatusPill tone={payment.tone}>{payment.label}</StatusPill>
                    </dd>
                  </div>
                )}
              </dl>
            </div>

            <div className="p-4 sm:p-6 space-y-5">
              {order.orderStatus === 'delivery_failed' && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                  <h2 className="text-sm font-semibold text-red-700 mb-1">Delivery failed</h2>
                  <p className="text-sm text-ink mb-3">
                    The rider or kitchen couldn&apos;t complete this delivery. Send it back out for another attempt, or cancel it below.
                  </p>
                  <Button onClick={handleRetryDelivery} disabled={updating}>
                    {updating ? 'Retrying…' : 'Retry delivery'}
                  </Button>
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                {order.customer && (
                  <div>
                    <h2 className={sectionTitle}>Customer</h2>
                    <p className="text-ink">{order.customer.profile?.fullName || 'No name given'}</p>
                    {order.customer.phone && (
                      <p className="text-sm" data-ltr>
                        <PhoneText phone={order.customer.phone} />
                      </p>
                    )}
                    {order.customer.email && <p className="text-sm text-muted break-all">{order.customer.email}</p>}
                  </div>
                )}
                <div>
                  <h2 className={sectionTitle}>Payment</h2>
                  <p className="text-ink">{methodLabel(order.paymentMethod)}</p>
                  {order.deliveryAddress && (
                    <>
                      <h2 className={`${sectionTitle} mt-4`}>Delivery address</h2>
                      <p className="text-sm text-ink">
                        {order.deliveryAddress.addressLine1}, {order.deliveryAddress.area}, {order.deliveryAddress.city}
                      </p>
                    </>
                  )}
                </div>
              </div>

              {['jazzcash', 'easypaisa', 'bank'].includes(order.paymentMethod) && ['payment_submitted', 'disputed'].includes(order.paymentStatus) && (
                <div className={`rounded-xl border p-4 ${order.paymentStatus === 'disputed' ? 'border-red-200 bg-red-50' : 'border-line bg-accent-soft'}`} data-testid="transfer-check">
                  <h2 className="text-sm font-semibold text-ink">
                    {order.paymentStatus === 'disputed' ? 'The kitchen says this transfer never arrived' : 'Transfer waiting for the kitchen to confirm'}
                  </h2>
                  <div className="mt-2 text-sm text-ink space-y-1">
                    <p>
                      {methodLabel(order.paymentMethod)} to the kitchen
                      {order.paymentSenderAccount ? `, from ${order.paymentSenderAccount}` : ''}
                      {order.paymentReferenceNumber ? ` · reference ${order.paymentReferenceNumber}` : ''}
                    </p>
                    {order.paymentDisputeReason && <p>Kitchen: &ldquo;{order.paymentDisputeReason}&rdquo;</p>}
                    {order.paymentProofUrl && (
                      <ExternalLink href={order.paymentProofUrl} className="font-medium text-brand-ink underline">
                        Open the customer&apos;s receipt
                      </ExternalLink>
                    )}
                  </div>
                  <p className="mt-3 text-xs text-muted">
                    Check the receipt with the kitchen&apos;s statement. If the money arrived, confirm it here; if not, cancel the order below.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <label htmlFor="confirm-note" className="sr-only">Note</label>
                    <input
                      id="confirm-note"
                      value={confirmNote}
                      onChange={(e) => setConfirmNote(e.target.value)}
                      placeholder="Note (optional), e.g. how it was checked"
                      className="nuray-input flex-1 min-w-[220px] text-sm"
                    />
                    <Button onClick={handleConfirmPayment} disabled={confirmingPayment}>
                      {confirmingPayment ? 'Confirming…' : 'Confirm payment received'}
                    </Button>
                  </div>
                </div>
              )}

              <div className={section}>
                <h2 className={sectionTitle}>Items</h2>
                <ul className="divide-y divide-line">
                  {order.items.map((item) => (
                    <li key={item.id} className="flex items-start justify-between gap-3 py-2 text-sm">
                      <div className="min-w-0">
                        <p className="text-ink">
                          {item.quantity} × {item.productName}
                        </p>
                        <p className="text-xs text-muted">
                          {item.seller?.businessName || 'Kitchen not known'} · {formatPrice(item.unitPrice)} each
                        </p>
                      </div>
                      <span className="shrink-0 font-medium text-ink tabular-nums">{formatPrice(item.totalPrice)}</span>
                    </li>
                  ))}
                </ul>

                <dl className="mt-3 space-y-1 text-sm">
                  <div className="flex justify-between text-muted">
                    <dt>Subtotal</dt>
                    <dd className="tabular-nums">{formatPrice(order.subtotal)}</dd>
                  </div>
                  {order.deliveryFee > 0 && (
                    <div className="flex justify-between text-muted">
                      <dt>Delivery, paid by the customer</dt>
                      <dd className="tabular-nums">{formatPrice(order.deliveryFee)}</dd>
                    </div>
                  )}
                  {order.discountAmount > 0 && (
                    <div className="flex justify-between text-brand-ink">
                      <dt>Discount</dt>
                      <dd className="tabular-nums">-{formatPrice(order.discountAmount)}</dd>
                    </div>
                  )}
                  {order.taxAmount > 0 && (
                    <div className="flex justify-between text-muted">
                      <dt>Tax</dt>
                      <dd className="tabular-nums">{formatPrice(order.taxAmount)}</dd>
                    </div>
                  )}
                  <div className="flex justify-between pt-2 text-lg font-semibold text-ink">
                    <dt>Total</dt>
                    <dd className="tabular-nums">{formatPrice(order.totalAmount)}</dd>
                  </div>
                  {refundedSoFar > 0 && (
                    <div className="flex justify-between text-ink" data-testid="refunded-total">
                      <dt>Refunded</dt>
                      <dd className="tabular-nums">-{formatPrice(refundedSoFar)}</dd>
                    </div>
                  )}
                </dl>

                {kitchenPaidDeliveries.length > 0 && (
                  <div className="mt-4 rounded-xl border border-line p-3 text-sm">
                    <h3 className="font-medium text-ink">Paid by the kitchen, not by the customer</h3>
                    <p className="text-xs text-muted">
                      {order.orderStatus === 'cancelled'
                        ? 'Not part of the total above. The order was cancelled, so nothing was taken from the kitchen.'
                        : 'Not part of the total above. It comes off what the kitchen earns from this order.'}
                    </p>
                    <dl className="mt-2 space-y-1">
                      {kitchenPaidDeliveries.map((d, i) => (
                        <div key={i} className="flex justify-between gap-3 text-ink" data-testid="delivery-paid-by-kitchen">
                          <dt>Delivery by {d.provider === 'platform' ? 'a Nuray rider' : 'its own rider'}</dt>
                          <dd className="shrink-0 tabular-nums">{formatPrice(Number(d.fee))}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                )}
              </div>

              {canChangeStatus && (
                <div className={section}>
                  {nextStatus && (
                    <>
                      <h2 className={sectionTitle}>Move the order on</h2>
                      {RIDER_STEPS.has(nextStatus) && (
                        <p className="text-xs text-muted mb-2">The rider normally does this with the pickup or delivery code.</p>
                      )}
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          variant={RIDER_STEPS.has(nextStatus) ? 'outline' : 'default'}
                          onClick={() => updateStatus(nextStatus)}
                          disabled={updating}
                        >
                          {updating ? 'Updating…' : `Mark as ${statusLabel(nextStatus).toLowerCase()}`}
                        </Button>
                      </div>
                    </>
                  )}

                  {/* Cancelling is its own flow: it restores stock, cascades to the items, and records who and why. */}
                  <div className={nextStatus ? 'mt-4' : ''}>
                    {!showCancelForm ? (
                      <Button variant="outline" className="text-red-700 border-red-200 hover:bg-red-50" onClick={() => setShowCancelForm(true)}>
                        Cancel order
                      </Button>
                    ) : (
                      <div className="space-y-2">
                        <label htmlFor="cancel-reason" className="block text-sm font-medium text-ink">Reason for cancelling</label>
                        <textarea
                          id="cancel-reason"
                          value={cancelReason}
                          onChange={(e) => setCancelReason(e.target.value)}
                          rows={2}
                          placeholder="e.g. Customer asked to cancel, out of stock…"
                          className="nuray-input w-full text-sm"
                        />
                        <div className="flex flex-wrap items-center gap-2">
                          <Button variant="destructive" onClick={handleCancelOrder} disabled={updating || cancelReason.trim().length < 5}>
                            {updating ? 'Cancelling…' : 'Cancel the order'}
                          </Button>
                          <Button variant="ghost" onClick={() => { setShowCancelForm(false); setCancelReason(''); }}>
                            Keep the order
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {order.paymentStatus === 'paid' && refundable > 0 && (
                <div className={section}>
                  <h2 className={sectionTitle}>Refund</h2>
                  {!showRefundForm ? (
                    <Button variant="outline" onClick={() => setShowRefundForm(true)}>Refund the customer</Button>
                  ) : (
                    <div className="space-y-3 max-w-md">
                      <div>
                        <label htmlFor="refund-amount" className="block text-sm font-medium text-ink mb-1">Amount (Rs)</label>
                        <input
                          id="refund-amount"
                          type="number"
                          inputMode="decimal"
                          min={1}
                          max={refundable}
                          value={refundAmount}
                          onChange={(e) => setRefundAmount(e.target.value)}
                          placeholder={String(refundable)}
                          className="nuray-input w-48"
                        />
                        <p className="mt-1 text-xs text-muted">
                          Up to {formatPrice(refundable)}{refundedSoFar > 0 ? ` (${formatPrice(refundedSoFar)} already refunded)` : ''}. Leave empty to refund all of it.
                        </p>
                      </div>
                      <div>
                        <label htmlFor="refund-reason" className="block text-sm font-medium text-ink mb-1">Why</label>
                        <textarea
                          id="refund-reason"
                          rows={2}
                          maxLength={300}
                          value={refundReason}
                          onChange={(e) => setRefundReason(e.target.value)}
                          placeholder="e.g. Two samosas were missing"
                          className="nuray-input w-full text-sm"
                        />
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button onClick={handleProcessRefund} disabled={updating || refundReason.trim().length < 3}>
                          {updating ? 'Recording…' : 'Refund'}
                        </Button>
                        <Button variant="ghost" onClick={() => { setShowRefundForm(false); setRefundAmount(''); setRefundReason(''); }}>
                          Not now
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {order.refunds && order.refunds.length > 0 && (
                <div className={section}>
                  <h2 className={sectionTitle}>Refunds</h2>
                  <ul className="space-y-2 text-sm">
                    {order.refunds.map((r) => (
                      <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line px-3 py-2">
                        <div className="min-w-0">
                          <span className="font-medium text-ink tabular-nums">{formatPrice(r.amount)}</span>
                          <span className="ms-2 text-muted">
                            {r.method === 'wallet' ? 'to wallet' : 'manual transfer'}
                            {r.reference ? ` · ${r.status === 'failed' ? 'why' : 'ref'}: ${r.reference}` : ''}
                          </span>
                          {r.reason && <p className="text-xs text-muted break-words">{r.reason}</p>}
                        </div>
                        {r.status === 'pending' ? (
                          <div className="flex gap-2">
                            <Button size="sm" className="h-11" onClick={() => handleCompleteRefund(r.id)} disabled={updating}>Mark as sent</Button>
                            <Button size="sm" variant="outline" className="h-11" onClick={() => handleDismissRefund(r.id)} disabled={updating}>Not owed</Button>
                          </div>
                        ) : (
                          <StatusPill tone={r.status === 'completed' ? 'good' : 'neutral'}>{r.status === 'completed' ? 'Refunded' : 'Not owed'}</StatusPill>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {order.statusHistory && order.statusHistory.length > 0 && (
                <div className={section}>
                  <h2 className={sectionTitle}>Status history</h2>
                  <ol className="space-y-2 text-sm">
                    {order.statusHistory.map((h, i) => (
                      <li key={i} className="flex flex-wrap gap-x-2">
                        <span className="font-medium text-ink">{statusLabel(h.status)}</span>
                        <span className="text-muted">{formatDateTime(h.createdAt)}</span>
                        {h.changedByName && <span className="text-muted">by {h.changedByName}</span>}
                        {h.notes && <span className="w-full text-muted break-words">{h.notes}</span>}
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              {order.investigation && (order.investigation.rider || order.investigation.supportTickets.length > 0 || investigationGroups(order.investigation).length > 0) && (
                <div data-testid="order-investigation" className={`${section} space-y-3`}>
                  <h2 className={sectionTitle}>Investigation</h2>
                  {order.investigation.rider && (
                    <dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-4 gap-y-1 text-sm" data-testid="inv-rider">
                      <dt className="text-muted">Rider</dt>
                      <dd className="font-semibold text-ink">{order.investigation.rider.name || 'Unnamed'}</dd>
                      {order.investigation.rider.phone && (
                        <>
                          <dt className="text-muted">Phone</dt>
                          <dd data-ltr>
                            <PhoneText phone={order.investigation.rider.phone} />
                          </dd>
                        </>
                      )}
                      {order.investigation.rider.vehicle && (
                        <>
                          <dt className="text-muted">Vehicle</dt>
                          <dd className="text-ink first-letter:uppercase">{order.investigation.rider.vehicle}</dd>
                        </>
                      )}
                    </dl>
                  )}
                  {order.investigation.supportTickets.length > 0 && (
                    <div data-testid="inv-tickets">
                      <p className="text-xs font-medium text-muted mb-1">Complaints on this order</p>
                      <ul className="text-sm text-ink space-y-1">
                        {order.investigation.supportTickets.map((t) => (
                          <li key={t.id}>
                            <Link href={`/admin/support?ticket=${t.id}`} className="flex min-h-11 w-fit items-center text-brand-ink hover:underline">{t.ticketNumber}</Link>
                            {t.subject} ·{' '}
                            <span className="font-medium">{({ open: 'New', in_progress: 'In progress', resolved: 'Resolved', closed: 'Closed' } as Record<string, string>)[t.status] ?? t.status}</span> ·{' '}
                            {t.priority.charAt(0).toUpperCase() + t.priority.slice(1)} priority
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {investigationGroups(order.investigation).map((group) => (
                    <InvestigationGroup key={group.title} {...group} />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </AdminShell>
  );
}
