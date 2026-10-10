'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { AdminShell } from '@/components/layout/AdminShell';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useAuthStore } from '@/lib/store/auth-store';
import { apiClient } from '@/lib/api-client';
import { formatPrice, formatDate } from '@/lib/utils';
import { ExternalLink } from '@/components/ExternalLink';

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

export default function AdminOrderDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;
  const { isAuthenticated, user } = useAuthStore();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [updating, setUpdating] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<string>('');
  const [showCancelForm, setShowCancelForm] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [showRefundForm, setShowRefundForm] = useState(false);
  const [refundAmount, setRefundAmount] = useState('');
  const [confirmNote, setConfirmNote] = useState('');
  const [confirmingPayment, setConfirmingPayment] = useState(false);

  const updateStatus = async () => {
    if (!order || !selectedStatus || selectedStatus === order.orderStatus) return;
    try {
      setUpdating(true);
      await apiClient.patch(`/admin/orders/${order.id}/status`, { status: selectedStatus });
      showToast('Order status updated', 'success');
      loadOrder();
      setSelectedStatus('');
    } catch (error: any) {
      showToast(error.response?.data?.error?.message || 'Failed to update status', 'error');
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
    } catch (error: any) {
      showToast(error.response?.data?.error?.message || 'Failed to cancel order', 'error');
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
    } catch (error: any) {
      showToast(error.response?.data?.error?.message || 'Failed to retry delivery', 'error');
    } finally {
      setUpdating(false);
    }
  };

  // A transfer the kitchen disputed (or hasn't confirmed): support checked it and it arrived.
  const handleConfirmPayment = async () => {
    if (!order) return;
    if (!window.confirm('Confirm that this transfer reached the kitchen? The order is then marked paid.')) return;
    try {
      setConfirmingPayment(true);
      await apiClient.post(`/admin/orders/${order.id}/confirm-payment`, { note: confirmNote.trim() || undefined });
      showToast('Payment confirmed', 'success');
      setConfirmNote('');
      await loadOrder();
    } catch (error: any) {
      showToast(error.response?.data?.error?.message || 'Could not confirm the payment', 'error');
    } finally {
      setConfirmingPayment(false);
    }
  };

  // A manual (bank / gateway) refund is owed until the admin has actually sent the money.
  const handleCompleteRefund = async (refundId: string) => {
    const entered = window.prompt('Transfer reference for this refund (optional):');
    if (entered === null) return; // cancelled the prompt: don't mark the refund as sent
    const reference = entered.trim() || undefined;
    try {
      setUpdating(true);
      await apiClient.post(`/admin/refunds/${refundId}/complete`, reference ? { reference } : {});
      showToast('Refund marked as sent', 'success');
      loadOrder();
    } catch (error: any) {
      showToast(error.response?.data?.error?.message || 'Failed to update refund', 'error');
    } finally {
      setUpdating(false);
    }
  };

  const handleDismissRefund = async (refundId: string) => {
    const reason = window.prompt('Why is this refund not owed? (min 5 characters)');
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
    } catch (error: any) {
      showToast(error.response?.data?.error?.message || 'Failed to dismiss refund', 'error');
    } finally {
      setUpdating(false);
    }
  };

  const handleProcessRefund = async () => {
    if (!order) return;
    const amount = refundAmount.trim() ? parseFloat(refundAmount.trim()) : undefined;
    if (refundAmount.trim() && (Number.isNaN(amount) || (amount ?? 0) <= 0)) {
      showToast('Enter a valid refund amount, or leave blank for a full refund', 'warning');
      return;
    }
    try {
      setUpdating(true);
      await apiClient.post(`/admin/orders/${order.id}/refund`, amount != null ? { refundAmount: amount } : {});
      showToast('Refund processed successfully', 'success');
      setShowRefundForm(false);
      setRefundAmount('');
      loadOrder();
    } catch (error: any) {
      showToast(error.response?.data?.error?.message || 'Failed to process refund', 'error');
    } finally {
      setUpdating(false);
    }
  };

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/admin/login');
      return;
    }
    if (user?.user_type !== 'admin' && user?.userType !== 'admin') {
      router.push('/products');
      showToast('Access denied. Admin privileges required.', 'error');
      return;
    }
    if (id) loadOrder();
  }, [isAuthenticated, user, id, router]);

  const loadOrder = async () => {
    try {
      setLoading(true);
      const response = await apiClient.get(`/admin/orders/${id}`);
      if (response.data.success) {
        setOrder(response.data.data);
      } else {
        setOrder(null);
      }
    } catch (error: any) {
      if (error.response?.status === 404) {
        showToast('Order not found', 'error');
      } else {
        showToast('Failed to load order', 'error');
      }
      setOrder(null);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    const map: Record<string, string> = {
      pending: 'bg-yellow-100 text-yellow-800',
      confirmed: 'bg-blue-100 text-blue-800',
      preparing: 'bg-purple-100 text-purple-800',
      ready: 'bg-indigo-100 text-indigo-800',
      in_transit: 'bg-orange-100 text-orange-800',
      delivered: 'bg-green-100 text-green-800',
      completed: 'bg-green-100 text-green-800',
      cancelled: 'bg-red-100 text-red-800',
    };
    return map[status] || 'bg-gray-100 text-gray-800';
  };

  if (!isAuthenticated || (user?.user_type !== 'admin' && user?.userType !== 'admin')) {
    return null;
  }

  // Mirrors the backend's isValidOrderStatusTransition — admin can only move
  // an order exactly one step forward at a time (or to Cancelled, handled by
  // the dedicated cancel flow below), so only ever offer that single next step.
  const ORDER_FORWARD_SEQUENCE = ['pending', 'confirmed', 'preparing', 'ready', 'dispatched', 'in_transit', 'delivered', 'completed'];
  const NEXT_STATUS_META: Record<string, { label: string; color: string }> = {
    confirmed: { label: 'Confirmed', color: 'bg-blue-500 hover:bg-blue-600' },
    preparing: { label: 'Preparing', color: 'bg-purple-500 hover:bg-purple-600' },
    ready: { label: 'Ready', color: 'bg-indigo-500 hover:bg-indigo-600' },
    dispatched: { label: 'Dispatched', color: 'bg-pink-500 hover:bg-pink-600' },
    in_transit: { label: 'In Transit', color: 'bg-orange-500 hover:bg-orange-600' },
    delivered: { label: 'Delivered', color: 'bg-green-500 hover:bg-green-600' },
  };
  const currentIndex = order ? ORDER_FORWARD_SEQUENCE.indexOf(order.orderStatus) : -1;
  const nextStatus = currentIndex >= 0 && currentIndex < ORDER_FORWARD_SEQUENCE.length - 1
    ? ORDER_FORWARD_SEQUENCE[currentIndex + 1]
    : null;
  const nextStatusOptions = nextStatus && NEXT_STATUS_META[nextStatus]
    ? [{ value: nextStatus, ...NEXT_STATUS_META[nextStatus] }]
    : [];

  return (
    <AdminShell>
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <Link
            href="/admin/orders"
            className="text-green-600 hover:text-green-700 text-sm font-medium inline-block"
          >
            ← Back to Orders
          </Link>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading order...</p>
          </div>
        ) : !order ? (
          <div className="bg-white rounded-lg shadow-sm p-12 text-center">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Order not found</h3>
            <Link href="/admin/orders">
              <Button variant="outline">Back to Orders</Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow-sm overflow-hidden">
              <div className="p-6 border-b border-gray-200">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h1 className="text-2xl font-bold text-gray-900">Order #{order.orderNumber}</h1>
                    <p className="text-sm text-gray-500 mt-1">{formatDate(order.createdAt)}</p>
                  </div>
                  <div className="flex gap-2">
                    <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(order.orderStatus)}`}>
                      {order.orderStatus.replace('_', ' ')}
                    </span>
                    <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                      order.paymentStatus === 'paid' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                    }`}>
                      {order.paymentStatus}
                    </span>
                  </div>
                </div>
              </div>

              <div className="p-6 space-y-6">
                {order.customer && (
                  <div>
                    <h2 className="text-sm font-medium text-gray-500 uppercase mb-2">Customer</h2>
                    <p className="text-gray-900">{order.customer.profile?.fullName || '—'}</p>
                    <p className="text-gray-600 text-sm">{order.customer.email || order.customer.phone}</p>
                  </div>
                )}

                {['jazzcash', 'easypaisa', 'bank'].includes(order.paymentMethod) && ['payment_submitted', 'disputed'].includes(order.paymentStatus) && (
                  <div className={`rounded-lg border p-4 ${order.paymentStatus === 'disputed' ? 'border-red-200 bg-red-50' : 'border-amber-200 bg-amber-50'}`} data-testid="transfer-check">
                    <h2 className="text-sm font-semibold text-gray-900">
                      {order.paymentStatus === 'disputed' ? 'The kitchen says this transfer never arrived' : 'Transfer waiting for the kitchen to confirm'}
                    </h2>
                    <div className="mt-2 text-sm text-gray-700 space-y-1">
                      <p>
                        {order.paymentMethod === 'bank' ? 'Bank transfer' : order.paymentMethod === 'jazzcash' ? 'JazzCash' : 'EasyPaisa'} to the kitchen
                        {order.paymentSenderAccount ? `, from ${order.paymentSenderAccount}` : ''}
                        {order.paymentReferenceNumber ? ` · reference ${order.paymentReferenceNumber}` : ''}
                      </p>
                      {order.paymentDisputeReason && <p>Kitchen: &ldquo;{order.paymentDisputeReason}&rdquo;</p>}
                      {order.paymentProofUrl && (
                        <ExternalLink href={order.paymentProofUrl} className="underline font-medium">
                          Open the customer&apos;s receipt
                        </ExternalLink>
                      )}
                    </div>
                    <p className="mt-3 text-xs text-gray-600">
                      Check the receipt with the kitchen&apos;s statement. If the money arrived, confirm it here; if not, cancel the order below.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <input
                        value={confirmNote}
                        onChange={(e) => setConfirmNote(e.target.value)}
                        placeholder="Note (optional), e.g. how it was checked"
                        className="flex-1 min-w-[220px] px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white"
                      />
                      <Button onClick={handleConfirmPayment} disabled={confirmingPayment} className="bg-green-600 hover:bg-green-700 text-white">
                        {confirmingPayment ? 'Confirming…' : 'Confirm payment received'}
                      </Button>
                    </div>
                  </div>
                )}

                {order.deliveryAddress && (
                  <div>
                    <h2 className="text-sm font-medium text-gray-500 uppercase mb-2">Delivery Address</h2>
                    <p className="text-gray-700">
                      {order.deliveryAddress.addressLine1}, {order.deliveryAddress.area}, {order.deliveryAddress.city}
                    </p>
                  </div>
                )}

                <div>
                  <h2 className="text-sm font-medium text-gray-500 uppercase mb-2">Items</h2>
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-2 text-start font-medium text-gray-600">Product</th>
                          <th className="px-4 py-2 text-start font-medium text-gray-600">Seller</th>
                          <th className="px-4 py-2 text-end font-medium text-gray-600">Qty</th>
                          <th className="px-4 py-2 text-end font-medium text-gray-600">Price</th>
                          <th className="px-4 py-2 text-end font-medium text-gray-600">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {order.items.map((item) => (
                          <tr key={item.id}>
                            <td className="px-4 py-3 font-medium text-gray-900">{item.productName}</td>
                            <td className="px-4 py-3 text-gray-600">{item.seller?.businessName || '—'}</td>
                            <td className="px-4 py-3 text-end">{item.quantity}</td>
                            <td className="px-4 py-3 text-end">{formatPrice(item.unitPrice)}</td>
                            <td className="px-4 py-3 text-end font-medium">{formatPrice(item.totalPrice)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="border-t pt-4 space-y-1 text-sm">
                  <div className="flex justify-between text-gray-600">
                    <span>Subtotal</span>
                    <span>{formatPrice(order.subtotal)}</span>
                  </div>
                  {order.deliveryFee > 0 && (
                    <div className="flex justify-between text-gray-600">
                      <span>Delivery</span>
                      <span>{formatPrice(order.deliveryFee)}</span>
                    </div>
                  )}
                  {order.discountAmount > 0 && (
                    <div className="flex justify-between text-green-600">
                      <span>Discount</span>
                      <span>-{formatPrice(order.discountAmount)}</span>
                    </div>
                  )}
                  {order.taxAmount > 0 && (
                    <div className="flex justify-between text-gray-600">
                      <span>Tax</span>
                      <span>{formatPrice(order.taxAmount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold text-lg text-gray-900 pt-2">
                    <span>Total</span>
                    <span>{formatPrice(order.totalAmount)}</span>
                  </div>
                </div>

                {/* Failed delivery — the primary action here, not just another status option */}
                {order.orderStatus === 'delivery_failed' && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                    <h2 className="text-sm font-semibold text-amber-900 mb-1">Delivery failed</h2>
                    <p className="text-sm text-amber-800 mb-3">
                      The rider or seller couldn&apos;t complete this delivery. Send it back out for another attempt, or cancel and refund below.
                    </p>
                    <button
                      onClick={handleRetryDelivery}
                      disabled={updating}
                      className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-50 transition-all"
                    >
                      {updating ? 'Retrying...' : 'Retry Delivery'}
                    </button>
                  </div>
                )}

                {/* Status Update */}
                {!['delivered', 'completed', 'cancelled', 'refunded'].includes(order.orderStatus) && (
                  <div>
                    <h2 className="text-sm font-medium text-gray-500 uppercase mb-3">Update Status</h2>
                    <div className="flex gap-3 flex-wrap">
                      {nextStatusOptions.map((s) => (
                          <button
                            key={s.value}
                            onClick={() => setSelectedStatus((prev) => (prev === s.value ? '' : s.value))}
                            className={`px-4 py-2 rounded-lg text-sm font-medium text-white transition-all ${
                              selectedStatus === s.value
                                ? s.color + ' ring-2 ring-offset-2 ring-gray-400 scale-105'
                                : s.color + ' opacity-80'
                            }`}
                          >
                            {s.label}
                          </button>
                        ))}
                    </div>
                    {selectedStatus && (
                      <div className="mt-3 flex items-center gap-3">
                        <span className="text-sm text-gray-600">
                          Change status to <strong>{selectedStatus.replace('_', ' ')}</strong>?
                        </span>
                        <button
                          onClick={updateStatus}
                          disabled={updating}
                          className="px-4 py-1.5 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-700 disabled:opacity-50"
                        >
                          {updating ? 'Updating...' : 'Confirm'}
                        </button>
                        <button
                          onClick={() => setSelectedStatus('')}
                          className="text-sm text-gray-500 hover:text-gray-700"
                        >
                          Cancel
                        </button>
                      </div>
                    )}

                    {/* Cancel Order — separate from the generic status list: this restores
                        stock, cascades to order items, and records who/why. */}
                    <div className="mt-5 pt-5 border-t border-gray-100">
                      {!showCancelForm ? (
                        <button
                          onClick={() => setShowCancelForm(true)}
                          className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-red-500 hover:bg-red-600 transition-all"
                        >
                          Cancel Order
                        </button>
                      ) : (
                        <div className="space-y-2">
                          <label className="block text-sm font-medium text-gray-700">
                            Reason for cancellation
                          </label>
                          <textarea
                            value={cancelReason}
                            onChange={(e) => setCancelReason(e.target.value)}
                            rows={2}
                            placeholder="e.g., Customer requested cancellation, out of stock..."
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500"
                          />
                          <div className="flex items-center gap-3">
                            <button
                              onClick={handleCancelOrder}
                              disabled={updating || cancelReason.trim().length < 5}
                              className="px-4 py-1.5 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 disabled:opacity-50"
                            >
                              {updating ? 'Cancelling...' : 'Confirm Cancellation'}
                            </button>
                            <button
                              onClick={() => { setShowCancelForm(false); setCancelReason(''); }}
                              className="text-sm text-gray-500 hover:text-gray-700"
                            >
                              Dismiss
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Refund */}
                {order.paymentStatus === 'paid' && (
                  <div className="pt-5 border-t border-gray-100">
                    <h2 className="text-sm font-medium text-gray-500 uppercase mb-3">Refund</h2>
                    {!showRefundForm ? (
                      <button
                        onClick={() => setShowRefundForm(true)}
                        className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-amber-500 hover:bg-amber-600 transition-all"
                      >
                        Process Refund
                      </button>
                    ) : (
                      <div className="space-y-2">
                        <label className="block text-sm font-medium text-gray-700">
                          Refund amount (leave blank for full refund of {formatPrice(order.totalAmount)})
                        </label>
                        <input
                          type="number"
                          min={0}
                          max={order.totalAmount}
                          value={refundAmount}
                          onChange={(e) => setRefundAmount(e.target.value)}
                          placeholder={String(order.totalAmount)}
                          className="w-48 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-500"
                        />
                        <div className="flex items-center gap-3">
                          <button
                            onClick={handleProcessRefund}
                            disabled={updating}
                            className="px-4 py-1.5 bg-amber-600 text-white text-sm rounded-lg hover:bg-amber-700 disabled:opacity-50"
                          >
                            {updating ? 'Processing...' : 'Confirm Refund'}
                          </button>
                          <button
                            onClick={() => { setShowRefundForm(false); setRefundAmount(''); }}
                            className="text-sm text-gray-500 hover:text-gray-700"
                          >
                            Dismiss
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {order.refunds && order.refunds.length > 0 && (
                  <div>
                    <h2 className="text-sm font-medium text-gray-500 uppercase mb-2">Refunds</h2>
                    <ul className="space-y-2 text-sm">
                      {order.refunds.map((r) => (
                        <li key={r.id} className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 px-3 py-2">
                          <div className="min-w-0">
                            <span className="font-medium text-gray-900">{formatPrice(r.amount)}</span>
                            <span className="ms-2 text-gray-500">
                              {r.method === 'wallet' ? 'to wallet' : 'manual transfer'}
                              {r.reference ? ` · ref ${r.reference}` : ''}
                            </span>
                            {r.reason && <div className="text-xs text-gray-400 truncate">{r.reason}</div>}
                          </div>
                          {r.status === 'pending' ? (
                            <button
                              onClick={() => handleCompleteRefund(r.id)}
                              disabled={updating}
                              className="shrink-0 px-3 py-1.5 bg-amber-600 text-white text-xs rounded-lg hover:bg-amber-700 disabled:opacity-50"
                            >
                              Mark as sent
                            </button>
                          ) : null}
                          {r.status === 'pending' ? (
                            <button
                              onClick={() => handleDismissRefund(r.id)}
                              disabled={updating}
                              className="shrink-0 px-3 py-1.5 border border-gray-300 text-gray-700 text-xs rounded-lg hover:bg-gray-50 disabled:opacity-50"
                            >
                              Dismiss
                            </button>
                          ) : (
                            <span className={`shrink-0 text-xs font-medium ${r.status === 'completed' ? 'text-emerald-600' : 'text-red-600'}`}>
                              {r.status === 'completed' ? 'Refunded' : 'Failed'}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {order.investigation && (
                  <div data-testid="order-investigation" className="space-y-4">
                    <h2 className="text-sm font-medium text-gray-500 uppercase">Investigation</h2>
                    {order.investigation.rider && (
                      <p className="text-sm text-gray-700" data-testid="inv-rider">
                        Rider: <strong>{order.investigation.rider.name || 'Unnamed'}</strong>
                        {order.investigation.rider.phone && <> · <span data-ltr>{order.investigation.rider.phone}</span></>}
                        {order.investigation.rider.vehicle && <> · {order.investigation.rider.vehicle}</>}
                      </p>
                    )}
                    {order.investigation.supportTickets.length > 0 && (
                      <div data-testid="inv-tickets">
                        <p className="text-xs font-medium text-gray-500 mb-1">Complaints on this order</p>
                        <ul className="text-sm text-gray-700 space-y-1">
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
                      ['Admin actions on this order', order.investigation.adminActions.map((a) => `${a.action.replace(/^admin:/, '')} by ${a.admin || 'unknown'} (${a.status ?? '?'}) · ${formatDate(a.createdAt)}`)],
                    ].map(([title, rows]) => (
                      (rows as string[]).length > 0 && (
                        <details key={title as string} className="text-sm" open={title === 'Admin actions on this order'}>
                          <summary className="cursor-pointer text-xs font-medium text-gray-500">{title as string} ({(rows as string[]).length})</summary>
                          <ul className="mt-1 space-y-0.5 text-gray-600 font-mono text-xs">
                            {(rows as string[]).map((r, i) => <li key={i}>{r}</li>)}
                          </ul>
                        </details>
                      )
                    ))}
                  </div>
                )}

                {order.statusHistory && order.statusHistory.length > 0 && (
                  <div>
                    <h2 className="text-sm font-medium text-gray-500 uppercase mb-2">Status History</h2>
                    <ul className="space-y-2 text-sm text-gray-600">
                      {order.statusHistory.map((h, i) => (
                        <li key={i}>
                          <span className="font-medium text-gray-700">{h.status}</span>
                          {h.notes && ` — ${h.notes}`}
                          {h.changedByName && <span className="text-gray-500"> · by {h.changedByName}</span>}
                          <span className="text-gray-400 ms-2">{formatDate(h.createdAt)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminShell>
  );
}
