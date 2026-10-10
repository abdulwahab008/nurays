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
import { useLiveRefresh } from '@/lib/hooks/use-live-refresh';
import { useT } from '@/lib/i18n';
import { commonMessages } from '@/lib/i18n/messages/common';
import { kitchenOrderMessages, kitchenStatusLabel, paymentMethodLabel, paymentStatusLabel } from '@/lib/i18n/messages/kitchen-orders';
import { ExternalLink } from '@/components/ExternalLink';

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
  sellerTotals?: { subtotal: number; commission: number; payout: number; deliveryFeeKept: number; deliveryFeePaid?: number };
}

export default function SellerOrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const orderId = params?.id as string;
  const { isAuthenticated, user } = useAuthStore();
  const { showToast } = useToast();
  const t = useT(kitchenOrderMessages);
  const tc = useT(commonMessages);
  const statusLabel = (s: string) => kitchenStatusLabel(s, t, tc);
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
      else showToast(t('detail.loadFailed'), 'error');
    } finally {
      setLoading(false);
    }
  }, [orderId, showToast, t]);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }
    const role = user?.userType || user?.user_type;
    if (role !== 'seller' && role !== 'admin') {
      router.push('/dashboard');
      return;
    }
    load();
  }, [isAuthenticated, user, router, load]);

  // Payment receipts, cancellations, riders taking the job and chat-free status changes
  // arrive as live events; stop once the order is finished.
  const finished = ['delivered', 'completed', 'cancelled', 'refunded'].includes(order?.orderStatus ?? '');
  useLiveRefresh(load, {
    events: ['order:status:update', 'order:item:status:update', 'delivery:assigned'],
    match: (data) => data?.orderId === orderId,
    enabled: isAuthenticated && !!order && !finished,
  });

  const act = async (key: string, path: string, body: object, ok: string) => {
    try {
      setBusy(key);
      await apiClient.post(path, body);
      showToast(ok, 'success');
      await load();
    } catch (err: any) {
      showToast(err.response?.data?.error?.message || t('couldNotUpdate'), 'error');
    } finally {
      setBusy(null);
    }
  };

  if (!isAuthenticated) return null;

  return (
    <DashboardLayout title={t('detail.title')} subtitle={t('detail.subtitle')} sidebarItems={SELLER_SIDEBAR_ITEMS} userType="seller">
      <div className="max-w-4xl mx-auto space-y-6">
        <Link href="/sellers/orders" className="text-sm text-gray-600 hover:underline">
          {t('detail.allOrders')}
        </Link>

        {loading && <div className="bg-white rounded-2xl p-8 text-center text-gray-500">{tc('loading')}</div>}

        {!loading && notFound && (
          <div className="bg-white rounded-2xl p-8 text-center">
            <p className="font-semibold text-gray-900">{t('detail.notFound')}</p>
            <p className="text-sm text-gray-500 mt-1">{t('detail.notFoundHint')}</p>
          </div>
        )}

        {!loading && order && (
          <>
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h1 className="text-xl font-bold text-gray-900">{t('orderLabel')} <span data-ltr>#{order.orderNumber}</span></h1>
                  <p className="text-sm text-gray-500">{formatDateTime(order.createdAt)}</p>
                </div>
                <div className="flex flex-wrap gap-2 text-xs font-semibold">
                  <span className="px-3 py-1 rounded-full bg-gray-900 text-white">{statusLabel(order.orderStatus)}</span>
                  <span className="px-3 py-1 rounded-full bg-gray-100 text-gray-800">
                    {t('detail.paymentBadge', { method: paymentMethodLabel(order.paymentMethod, tc), status: paymentStatusLabel(order.paymentStatus, t) })}
                  </span>
                  <span className="px-3 py-1 rounded-full bg-gray-100 text-gray-800">
                    {order.deliveryType === 'self_pickup'
                      ? t('detail.customerPickup')
                      : order.sellerHandsOver
                        ? t('detail.youDeliver')
                        : t('detail.riderDelivers')}
                  </span>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {order.orderStatus === 'pending' && (
                  <button
                    type="button"
                    disabled={!!busy}
                    onClick={() => act('accept', `/seller/orders/${order.id}/accept`, {}, t('detail.accepted'))}
                    className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-semibold disabled:opacity-50"
                  >
                    {t('detail.acceptOrder')}
                  </button>
                )}
                {['confirmed', 'preparing'].includes(order.orderStatus) && (
                  <button
                    type="button"
                    disabled={!!busy}
                    onClick={() => act('ready', `/seller/orders/${order.id}/ready`, {}, t('detail.markedReady'))}
                    className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold disabled:opacity-50"
                  >
                    {t('detail.markReady')}
                  </button>
                )}
                {order.paymentStatus === 'payment_submitted' && (
                  <>
                    <button
                      type="button"
                      disabled={!!busy}
                      onClick={() => act('pay', `/orders/${order.id}/confirm-payment`, { confirmed: true }, t('detail.paymentConfirmed'))}
                      className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold disabled:opacity-50"
                    >
                      {t('detail.paymentReceived')}
                    </button>
                    <button
                      type="button"
                      disabled={!!busy}
                      onClick={() =>
                        act('dispute', `/orders/${order.id}/confirm-payment`, { confirmed: false, disputeReason: 'Payment transfer not found in kitchen account' }, t('detail.paymentDisputed'))
                      }
                      className="px-4 py-2 rounded-lg border border-red-300 text-red-700 text-sm font-semibold disabled:opacity-50"
                    >
                      {t('detail.notReceived')}
                    </button>
                  </>
                )}
                <button type="button" onClick={() => setChatOpen(true)} className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-semibold">
                  {t('detail.messageCustomer')}
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
                <h2 className="font-bold text-gray-900">{t('customer')}</h2>
                <p>{order.customer?.profile?.fullName || t('customer')}</p>
                {order.customer?.phone && <p className="text-gray-600" data-ltr>{order.customer.phone}</p>}
                {order.deliveryType === 'home_delivery' && order.deliveryAddress && (
                  <p className="text-gray-600">
                    {[order.deliveryAddress.addressLine1, order.deliveryAddress.area, order.deliveryAddress.city].filter(Boolean).join(', ')}
                    {order.deliveryAddress.landmark ? t('detail.near', { landmark: order.deliveryAddress.landmark }) : ''}
                  </p>
                )}
                {order.deliveryInstructions && <p className="text-gray-600">{t('detail.instructions', { text: order.deliveryInstructions })}</p>}
                {order.notes && <p className="text-gray-600">{t('detail.notes', { text: order.notes })}</p>}
              </div>

              <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 space-y-2 text-sm">
                <h2 className="font-bold text-gray-900">{t('detail.payment')}</h2>
                {order.paymentReferenceNumber && <p>{t('detail.reference')} <span className="font-mono" data-ltr>{order.paymentReferenceNumber}</span></p>}
                {order.paymentSenderName && <p>{t('detail.sentBy', { name: order.paymentSenderName })}</p>}
                {order.paymentProofUrl && (
                  <ExternalLink href={order.paymentProofUrl} className="text-indigo-700 underline">
                    {t('detail.viewReceipt')}
                  </ExternalLink>
                )}
                {order.sellerTotals && (
                  <div className="pt-2 border-t border-gray-100 space-y-1">
                    <p className="flex justify-between"><span>{t('detail.yourItems')}</span><span>{formatPrice(order.sellerTotals.subtotal)}</span></p>
                    <p className="flex justify-between text-gray-600"><span>{t('detail.commission')}</span><span data-ltr>-{formatPrice(order.sellerTotals.commission)}</span></p>
                    {order.sellerTotals.deliveryFeeKept > 0 && (
                      <p className="flex justify-between text-gray-600"><span>{t('detail.deliveryFeeKept')}</span><span>{formatPrice(order.sellerTotals.deliveryFeeKept)}</span></p>
                    )}
                    {(order.sellerTotals.deliveryFeePaid ?? 0) > 0 && (
                      <p className="flex justify-between text-gray-600"><span>{t('detail.deliveryFeePaid')}</span><span data-ltr>-{formatPrice(order.sellerTotals.deliveryFeePaid ?? 0)}</span></p>
                    )}
                    <p className="flex justify-between font-semibold"><span>{t('detail.yourEarnings')}</span><span>{formatPrice(order.sellerTotals.payout + (order.sellerTotals.deliveryFeeKept || 0) - (order.sellerTotals.deliveryFeePaid || 0))}</span></p>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
              <h2 className="font-bold text-gray-900 mb-3">{t('detail.items')}</h2>
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
                      <p className="text-xs text-gray-500">{statusLabel(item.status)}</p>
                    </div>
                    <span className="font-semibold">{formatPrice(Number(item.totalPrice))}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
              <h2 className="font-bold text-gray-900 mb-3">{t('detail.history')}</h2>
              <ol className="space-y-2 text-sm">
                {order.statusHistory.map((h, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="text-gray-400 shrink-0 w-40">{formatDateTime(h.createdAt)}</span>
                    <span>
                      <span className="font-semibold">{statusLabel(h.status)}</span>
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
