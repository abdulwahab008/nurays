'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { DashboardLayout, SELLER_SIDEBAR_ITEMS } from '@/components/layout/DashboardShell';
import { useToast } from '@/components/ui/toast';
import { useAuthStore } from '@/lib/store/auth-store';
import { apiClient } from '@/lib/api-client';
import { formatPrice, formatDateTime, imageVariant } from '@/lib/utils';
import SelfHandoverActions from '@/components/orders/SelfHandoverActions';
import OrderChatModal from '@/components/orders/OrderChatModal';

interface SellerOrderDetail {
  id: string;
  orderNumber: string;
  orderStatus: string;
  paymentStatus: string;
  paymentMethod: string;
  deliveryType: string;
  sellerHandsOver: boolean;
  totalAmount: number;
  subtotal: number;
  deliveryFee: number;
  discountAmount: number;
  taxAmount: number;
  createdAt: string;
  deliveryInstructions?: string | null;
  notes?: string | null;
  cancellationReason?: string | null;
  paymentReferenceNumber?: string | null;
  paymentSenderName?: string | null;
  paymentProofUrl?: string | null;
  customer?: { phone?: string | null; profile?: { fullName?: string | null } | null } | null;
  deliveryAddress?: { label?: string; addressLine1?: string; area?: string; city?: string; landmark?: string } | null;
  items: Array<{
    id: string;
    productName: string;
    variantName?: string | null;
    quantity: number;
    totalPrice: number | string;
    status: string;
    product?: { images?: Array<{ imageUrl: string }> } | null;
  }>;
  statusHistory: Array<{ status: string; notes?: string | null; createdAt: string }>;
  sellerTotals?: { subtotal: number; commission: number; payout: number; deliveryFeeKept: number };
}

const STATUS_LABEL: Record<string, string> = {
  pending: 'New order',
  confirmed: 'Confirmed',
  preparing: 'Preparing',
  ready: 'Ready',
  dispatched: 'Out for delivery',
  in_transit: 'On the way',
  delivered: 'Delivered',
  completed: 'Completed',
  delivery_failed: 'Delivery failed',
  cancelled: 'Cancelled',
};

export default function SellerOrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const orderId = params?.id as string;
  const { isAuthenticated, user } = useAuthStore();
  const { showToast } = useToast();
  const [order, setOrder] = useState<SellerOrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await apiClient.get(`/seller/orders/${orderId}`);
      setOrder(res.data?.data ?? null);
      setNotFound(!res.data?.data);
    } catch (err: any) {
      if (err.response?.status === 404 || err.response?.status === 403) setNotFound(true);
      else showToast('Could not load the order', 'error');
    } finally {
      setLoading(false);
    }
  }, [orderId, showToast]);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }
    const role = user?.userType || (user as any)?.user_type;
    if (role !== 'seller' && role !== 'admin') {
      router.push('/dashboard');
      return;
    }
    load();
  }, [isAuthenticated, user, router, load]);

  const act = async (key: string, path: string, body: object, ok: string) => {
    try {
      setBusy(key);
      await apiClient.post(path, body);
      showToast(ok, 'success');
      await load();
    } catch (err: any) {
      showToast(err.response?.data?.error?.message || 'Could not update the order', 'error');
    } finally {
      setBusy(null);
    }
  };

  if (!isAuthenticated) return null;

  return (
    <DashboardLayout title="Order details" subtitle="Everything about this order" sidebarItems={SELLER_SIDEBAR_ITEMS} userType="seller">
      <div className="max-w-4xl mx-auto space-y-6">
        <Link href="/sellers/orders" className="text-sm text-gray-600 hover:underline">
          ← All orders
        </Link>

        {loading && <div className="bg-white rounded-2xl p-8 text-center text-gray-500">Loading…</div>}

        {!loading && notFound && (
          <div className="bg-white rounded-2xl p-8 text-center">
            <p className="font-semibold text-gray-900">Order not found</p>
            <p className="text-sm text-gray-500 mt-1">It may belong to another kitchen, or the link is wrong.</p>
          </div>
        )}

        {!loading && order && (
          <>
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h1 className="text-xl font-bold text-gray-900">Order #{order.orderNumber}</h1>
                  <p className="text-sm text-gray-500">{formatDateTime(order.createdAt)}</p>
                </div>
                <div className="flex flex-wrap gap-2 text-xs font-semibold">
                  <span className="px-3 py-1 rounded-full bg-gray-900 text-white">{STATUS_LABEL[order.orderStatus] ?? order.orderStatus}</span>
                  <span className="px-3 py-1 rounded-full bg-gray-100 text-gray-800">
                    Payment: {order.paymentMethod.toUpperCase()} · {order.paymentStatus.replace(/_/g, ' ')}
                  </span>
                  <span className="px-3 py-1 rounded-full bg-gray-100 text-gray-800">
                    {order.deliveryType === 'self_pickup'
                      ? 'Customer pickup'
                      : order.sellerHandsOver
                        ? 'You deliver'
                        : 'Nuray rider delivers'}
                  </span>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {order.orderStatus === 'pending' && (
                  <button
                    type="button"
                    disabled={!!busy}
                    onClick={() => act('accept', `/seller/orders/${order.id}/accept`, {}, 'Order accepted.')}
                    className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-semibold disabled:opacity-50"
                  >
                    Accept order
                  </button>
                )}
                {['confirmed', 'preparing'].includes(order.orderStatus) && (
                  <button
                    type="button"
                    disabled={!!busy}
                    onClick={() => act('ready', `/seller/orders/${order.id}/ready`, {}, 'Marked ready.')}
                    className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold disabled:opacity-50"
                  >
                    Mark ready
                  </button>
                )}
                {order.paymentStatus === 'payment_submitted' && (
                  <>
                    <button
                      type="button"
                      disabled={!!busy}
                      onClick={() => act('pay', `/orders/${order.id}/confirm-payment`, { confirmed: true }, 'Payment confirmed.')}
                      className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold disabled:opacity-50"
                    >
                      Payment received
                    </button>
                    <button
                      type="button"
                      disabled={!!busy}
                      onClick={() =>
                        act('dispute', `/orders/${order.id}/confirm-payment`, { confirmed: false, disputeReason: 'Payment transfer not found in kitchen account' }, 'Payment disputed.')
                      }
                      className="px-4 py-2 rounded-lg border border-red-300 text-red-700 text-sm font-semibold disabled:opacity-50"
                    >
                      Not received
                    </button>
                  </>
                )}
                <button type="button" onClick={() => setChatOpen(true)} className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-semibold">
                  Message customer
                </button>
              </div>

              {order.sellerHandsOver && (
                <div className="mt-4">
                  <SelfHandoverActions orderId={order.id} orderStatus={order.orderStatus} deliveryType={order.deliveryType} onChanged={load} />
                </div>
              )}
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 space-y-2 text-sm">
                <h2 className="font-bold text-gray-900">Customer</h2>
                <p>{order.customer?.profile?.fullName || 'Customer'}</p>
                {order.customer?.phone && <p className="text-gray-600">{order.customer.phone}</p>}
                {order.deliveryType === 'home_delivery' && order.deliveryAddress && (
                  <p className="text-gray-600">
                    {[order.deliveryAddress.addressLine1, order.deliveryAddress.area, order.deliveryAddress.city].filter(Boolean).join(', ')}
                    {order.deliveryAddress.landmark ? ` (near ${order.deliveryAddress.landmark})` : ''}
                  </p>
                )}
                {order.deliveryInstructions && <p className="text-gray-600">Instructions: {order.deliveryInstructions}</p>}
                {order.notes && <p className="text-gray-600">Notes: {order.notes}</p>}
              </div>

              <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 space-y-2 text-sm">
                <h2 className="font-bold text-gray-900">Payment</h2>
                {order.paymentReferenceNumber && <p>Reference: <span className="font-mono">{order.paymentReferenceNumber}</span></p>}
                {order.paymentSenderName && <p>Sent by: {order.paymentSenderName}</p>}
                {order.paymentProofUrl && (
                  <a href={order.paymentProofUrl} target="_blank" rel="noopener noreferrer" className="text-indigo-700 underline">
                    View receipt
                  </a>
                )}
                {order.sellerTotals && (
                  <div className="pt-2 border-t border-gray-100 space-y-1">
                    <p className="flex justify-between"><span>Your items</span><span>{formatPrice(order.sellerTotals.subtotal)}</span></p>
                    <p className="flex justify-between text-gray-600"><span>Nuray commission</span><span>-{formatPrice(order.sellerTotals.commission)}</span></p>
                    {order.sellerTotals.deliveryFeeKept > 0 && (
                      <p className="flex justify-between text-gray-600"><span>Delivery fee you keep</span><span>{formatPrice(order.sellerTotals.deliveryFeeKept)}</span></p>
                    )}
                    <p className="flex justify-between font-semibold"><span>Your earnings</span><span>{formatPrice(order.sellerTotals.payout + (order.sellerTotals.deliveryFeeKept || 0))}</span></p>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
              <h2 className="font-bold text-gray-900 mb-3">Items</h2>
              <ul className="divide-y divide-gray-100">
                {order.items.map((item) => (
                  <li key={item.id} className="py-3 flex items-center gap-3 text-sm">
                    <div className="w-12 h-12 rounded-lg bg-gray-100 overflow-hidden shrink-0">
                      {item.product?.images?.[0]?.imageUrl && (
                        <img src={imageVariant(item.product.images[0].imageUrl, 'sm')} alt={item.productName} className="w-full h-full object-cover" />
                      )}
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold text-gray-900">
                        {item.quantity} × {item.productName}
                        {item.variantName ? ` (${item.variantName})` : ''}
                      </p>
                      <p className="text-xs text-gray-500">{STATUS_LABEL[item.status] ?? item.status}</p>
                    </div>
                    <span className="font-semibold">{formatPrice(Number(item.totalPrice))}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
              <h2 className="font-bold text-gray-900 mb-3">History</h2>
              <ol className="space-y-2 text-sm">
                {order.statusHistory.map((h, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="text-gray-400 shrink-0 w-40">{formatDateTime(h.createdAt)}</span>
                    <span>
                      <span className="font-semibold">{STATUS_LABEL[h.status] ?? h.status}</span>
                      {h.notes ? ` · ${h.notes}` : ''}
                    </span>
                  </li>
                ))}
              </ol>
            </div>

            <OrderChatModal
              isOpen={chatOpen}
              onClose={() => setChatOpen(false)}
              orderId={order.id}
              orderNumber={order.orderNumber}
              currentRole="seller"
            />
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
