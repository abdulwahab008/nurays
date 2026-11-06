'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { AdminShell } from '@/components/layout/AdminShell';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { LoadError } from '@/components/ui/LoadError';
import { useDialogs } from '@/components/ui/Dialogs';
import { useAuthStore } from '@/lib/store/auth-store';
import { apiClient, apiErrorMessage, apiErrorStatus } from '@/lib/api-client';
import { formatPrice, formatDate, formatDateTime } from '@/lib/utils';
import { ExternalLink } from '@/components/ExternalLink';
import { methodLabel, paymentState, statusLabel, statusTag } from '../order-labels';

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
  const payment = order ? paymentState(order) : null;
  const deliveries = (order?.deliveryFeeBreakdown ?? []).filter((d) => Number(d.fee) > 0);
  const canChangeStatus = !!order && !['delivered', 'completed', 'cancelled', 'refunded'].includes(order.orderStatus);

  return (
    <AdminShell>
      <div className="max-w-4xl mx-auto">
        <div className="mb-4">
          <Link href="/admin/orders" className="inline-flex min-h-11 items-center text-sm font-medium text-brand-ink hover:underline">
            Back to orders
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
              <h1 className="text-2xl font-semibold text-ink break-all">Order #{order.orderNumber}</h1>
              <p className="text-sm text-muted mt-1">Placed {formatDateTime(order.createdAt)}</p>
              <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <dt className="text-muted">Order</dt>
                  <dd className={statusTag(order.orderStatus)} data-testid="order-status">{statusLabel(order.orderStatus)}</dd>
                </div>
                <div className="flex items-center gap-2">
                  <dt className="text-muted">Payment</dt>
                  <dd className={payment!.tag} data-testid="payment-status">{payment!.label}</dd>
                </div>
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
                    {order.customer.phone && <p className="text-sm text-muted" data-ltr>{order.customer.phone}</p>}
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
                  {deliveries
                    .filter((d) => d.paidBy === 'seller')
                    .map((d, i) => (
                      <div key={i} className="flex justify-between gap-3 text-muted" data-testid="delivery-paid-by-kitchen">
                        <dt>Delivery, paid by the kitchen ({d.provider === 'platform' ? 'Nuray rider' : 'own rider'})</dt>
                        <dd className="shrink-0 tabular-nums">{formatPrice(Number(d.fee))}</dd>
                      </div>
                    ))}
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
                          <span className={r.status === 'completed' ? 'inline-flex rounded-full px-2 py-0.5 text-xs font-medium bg-brand-soft text-brand-soft-ink' : 'inline-flex rounded-full px-2 py-0.5 text-xs font-medium bg-raised text-muted'}>
                            {r.status === 'completed' ? 'Refunded' : 'Not owed'}
                          </span>
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

              {order.investigation && (
                <div data-testid="order-investigation" className={`${section} space-y-3`}>
                  <h2 className={sectionTitle}>Investigation</h2>
                  {order.investigation.rider && (
                    <p className="text-sm text-ink" data-testid="inv-rider">
                      Rider: <strong>{order.investigation.rider.name || 'Unnamed'}</strong>
                      {order.investigation.rider.phone && <> · <span data-ltr>{order.investigation.rider.phone}</span></>}
                      {order.investigation.rider.vehicle && <> · {order.investigation.rider.vehicle}</>}
                    </p>
                  )}
                  {order.investigation.supportTickets.length > 0 && (
                    <div data-testid="inv-tickets">
                      <p className="text-xs font-medium text-muted mb-1">Complaints on this order</p>
                      <ul className="text-sm text-ink space-y-1">
                        {order.investigation.supportTickets.map((t) => (
                          <li key={t.id}>{t.ticketNumber} · {t.subject} · <span className="font-medium">{t.status.replace('_', ' ')}</span> · {t.priority}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {[
                    ['Payment attempts', order.investigation.paymentAttempts.map((a) => `${a.gateway} ${a.status} Rs ${a.amount}${a.settledVia ? ` via ${a.settledVia}` : ''} · ${formatDate(a.createdAt)}`)],
                    ['Wallet movements', order.investigation.walletTransactions.map((w) => `${w.transactionType} Rs ${w.amount} (${w.status}) · ${formatDate(w.createdAt)}`)],
                    ['Ledger entries', order.investigation.ledgerEntries.map((l) => `${l.transactionType} ${l.entryType} Rs ${l.amount} · ${formatDate(l.createdAt)}`)],
                    ['Rider ledger', order.investigation.riderLedgerEntries.map((l) => `${l.type} Rs ${l.amount}${l.note ? ` · ${l.note}` : ''} · ${formatDate(l.createdAt)}`)],
                    ['Admin actions on this order', order.investigation.adminActions.map((a) => `${a.action.replace(/^admin:/, '')} by ${a.admin || 'unknown'} (${a.status ?? '?'}) · ${formatDateTime(a.createdAt)}`)],
                  ].map(([title, rows]) => (
                    (rows as string[]).length > 0 && (
                      <details key={title as string} className="text-sm" open={title === 'Admin actions on this order'}>
                        <summary className="cursor-pointer min-h-11 flex items-center text-xs font-medium text-muted">{title as string} ({(rows as string[]).length})</summary>
                        <ul className="mt-1 space-y-0.5 text-muted text-xs break-words">
                          {(rows as string[]).map((r, i) => <li key={i}>{r}</li>)}
                        </ul>
                      </details>
                    )
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
