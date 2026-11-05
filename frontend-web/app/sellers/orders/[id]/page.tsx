'use client';

import { useCallback, useEffect, useState } from 'react';
import { loginUrlHere } from '@/lib/auth-redirect';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DashboardLayout, SELLER_SIDEBAR_ITEMS } from '@/components/layout/DashboardShell';
import { useToast } from '@/components/ui/toast';
import { LoadError } from '@/components/ui/LoadError';
import { useAuthStore } from '@/lib/store/auth-store';
import { apiClient, apiErrorMessage, apiErrorStatus } from '@/lib/api-client';
import { formatPrice, formatDateTime } from '@/lib/utils';
import SelfHandoverActions from '@/components/orders/SelfHandoverActions';
import OrderChatModal from '@/components/orders/OrderChatModal';
import { useLiveRefresh } from '@/lib/hooks/use-live-refresh';
import { useT } from '@/lib/i18n';
import { commonMessages } from '@/lib/i18n/messages/common';
import { kitchenOrderMessages, kitchenStatusLabel, paymentMethodLabel, paymentStatusLabel } from '@/lib/i18n/messages/kitchen-orders';
import { ExternalLink } from '@/components/ExternalLink';
import { useShallow } from 'zustand/react/shallow';

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
  /** Why the phone and door are not shown (PRIV-4), or null when they are. */
  contactHidden?: 'nuray_rider' | 'not_accepted' | 'closed' | null;
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
  const { isAuthenticated, user } = useAuthStore(useShallow((s) => ({ isAuthenticated: s.isAuthenticated, user: s.user })));
  const { showToast } = useToast();
  const t = useT(kitchenOrderMessages);
  const tc = useT(commonMessages);
  const statusLabel = (s: string) => kitchenStatusLabel(s, t, tc);
  const [order, setOrder] = useState<SellerOrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  // Why the order could not be read (anything but "it is not there"); shown with a retry instead of a blank page.
  const [loadError, setLoadError] = useState<unknown>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoadError(null);
      const res = await apiClient.get(`/seller/orders/${orderId}`);
      setOrder(res.data?.data ?? null);
      setNotFound(!res.data?.data);
    } catch (err) {
      // 400 is an address that is not an order id at all (the server refuses it before looking).
      if (apiErrorStatus(err) === 404 || apiErrorStatus(err) === 403 || apiErrorStatus(err) === 400) setNotFound(true);
      else setLoadError(err);
    } finally {
      setLoading(false);
    }
  }, [orderId, showToast, t]);

  useEffect(() => {
    if (!isAuthenticated) {
      router.replace(loginUrlHere());
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
    } catch (err) {
      showToast(apiErrorMessage(err, t('couldNotUpdate')), 'error');
    } finally {
      setBusy(null);
    }
  };

  if (!isAuthenticated) return null;

  const total = (order?.sellerTotals?.payout ?? 0) + (order?.sellerTotals?.deliveryFeeKept || 0) - (order?.sellerTotals?.deliveryFeePaid || 0);
  const handoverLabel = order?.deliveryType === 'self_pickup'
    ? t('detail.customerPickup')
    : order?.sellerHandsOver
      ? t('detail.youDeliver')
      : t('detail.riderDelivers');

  return (
    <DashboardLayout
      title=""
      sidebarItems={SELLER_SIDEBAR_ITEMS}
      userType="seller"
    >
      <div className="max-w-6xl">
        <div className="-mt-3 mb-6 sm:mb-8">
          <Link href="/sellers/orders" className="-ms-1 px-1 inline-flex items-center gap-1.5 min-h-11 rounded text-sm font-medium text-muted hover:text-ink focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand/40">
            <ArrowLeft className="w-4 h-4 rtl:-scale-x-100" aria-hidden="true" />
            {t('detail.allOrders')}
          </Link>
          <h1 className="text-[28px] sm:text-[32px] lg:text-[36px] leading-tight font-extrabold text-ink tracking-tight">
            {order ? <>{t('orderLabel')} <span data-ltr>#{order.orderNumber}</span></> : t('detail.title')}
          </h1>
          {order && <p className="mt-1.5 text-sm sm:text-[15px] text-muted">{formatDateTime(order.createdAt)}</p>}
        </div>

        {loading && (
          <div className="py-24 text-center" role="status">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-line border-t-brand-600 mx-auto mb-4" />
            <p className="text-sm text-muted">{tc('loading')}</p>
          </div>
        )}

        {!loading && Boolean(loadError) && !order && !notFound && (
          <LoadError error={loadError} onRetry={load} title={t('detail.loadFailed')} />
        )}

        {!loading && notFound && (
          <div className="py-16 text-center">
            <p className="text-lg font-semibold text-ink">{t('detail.notFound')}</p>
            <p className="text-sm text-muted mt-1">{t('detail.notFoundHint')}</p>
          </div>
        )}

        {!loading && order && (
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px] gap-x-10 gap-y-8">
            <article className="min-w-0 self-start rounded-[20px] bg-surface border border-line shadow-[var(--shadow-card)] overflow-hidden">
              <header className="px-5 pt-5 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-lg font-semibold text-ink first-letter:uppercase">{statusLabel(order.orderStatus)}</p>
                  <p className="text-sm text-muted mt-0.5">{handoverLabel}</p>
                </div>
                <p className="shrink-0 text-lg font-semibold text-ink tabular-nums">{formatPrice(order.totalAmount)}</p>
              </header>

              <section className="px-5 mt-5">
                <h2 className="text-sm text-muted">{t(['pending', 'confirmed', 'preparing'].includes(order.orderStatus) ? 'detail.items' : 'detail.itemsDone')}</h2>
                <ul className="mt-1 divide-y divide-line">
                  {order.items.map((item) => (
                    <li key={item.id} className="py-3 flex items-baseline justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-[15px] text-ink">
                          <span className="font-semibold tabular-nums">{item.quantity} ×</span> {item.productName}
                          {item.variantName ? ` (${item.variantName})` : ''}
                        </p>
                        {item.status !== order.orderStatus && <p className="text-xs text-muted">{statusLabel(item.status)}</p>}
                      </div>
                      <span className="text-sm text-muted tabular-nums shrink-0">{formatPrice(Number(item.totalPrice))}</span>
                    </li>
                  ))}
                </ul>
              </section>

              {(order.deliveryInstructions || order.notes) && (
                <div className="mx-5 mt-2 rounded-lg bg-raised px-3 py-2 text-sm text-ink space-y-1">
                  {order.deliveryInstructions && <p>{t('detail.instructions', { text: order.deliveryInstructions })}</p>}
                  {order.notes && <p>{t('detail.notes', { text: order.notes })}</p>}
                </div>
              )}

              {order.paymentStatus === 'payment_submitted' && (
                <div className="mx-5 mt-4 rounded-xl bg-accent-soft text-accent-soft-ink p-3.5 text-sm">
                  <p>{t('detail.paymentClaim')}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      className="h-11"
                      disabled={!!busy}
                      onClick={() => act('pay', `/orders/${order.id}/confirm-payment`, { confirmed: true }, t('detail.paymentConfirmed'))}
                    >
                      {t('detail.paymentReceived')}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-11 bg-surface border-red-200 text-red-700 hover:bg-red-50"
                      disabled={!!busy}
                      onClick={() =>
                        act('dispute', `/orders/${order.id}/confirm-payment`, { confirmed: false, disputeReason: 'Payment transfer not found in kitchen account' }, t('detail.paymentDisputed'))
                      }
                    >
                      {t('detail.notReceived')}
                    </Button>
                  </div>
                </div>
              )}

              <div className="px-5 pt-5 pb-5 space-y-3">
                {order.orderStatus === 'pending' && (
                  <Button
                    className="w-full"
                    disabled={!!busy}
                    onClick={() => act('accept', `/seller/orders/${order.id}/accept`, {}, t('detail.accepted'))}
                  >
                    {t('detail.acceptOrder')}
                  </Button>
                )}
                {['confirmed', 'preparing'].includes(order.orderStatus) && (
                  <Button
                    className="w-full"
                    disabled={!!busy}
                    onClick={() => act('ready', `/seller/orders/${order.id}/ready`, {}, t('detail.markedReady'))}
                  >
                    {t('detail.markReady')}
                  </Button>
                )}
                {order.sellerHandsOver && (
                  <SelfHandoverActions orderId={order.id} orderStatus={order.orderStatus} deliveryType={order.deliveryType} onChanged={load} />
                )}
                <Button variant="outline" className="w-full" onClick={() => setChatOpen(true)}>
                  <MessageCircle className="w-4 h-4" aria-hidden="true" />
                  {t('detail.messageCustomer')}
                </Button>
              </div>
            </article>

            <aside className="space-y-7 lg:pt-1 text-sm">
              <section>
                <h2 className="text-sm font-semibold text-ink">{t('customer')}</h2>
                <p className="mt-2 text-[15px] text-ink">{order.customer?.profile?.fullName || t('customer')}</p>
                {order.customer?.phone && (
                  <a href={`tel:${order.customer.phone}`} className="inline-flex items-center min-h-11 font-semibold text-brand-ink hover:underline" data-ltr>
                    {order.customer.phone}
                  </a>
                )}
                {order.deliveryType === 'home_delivery' && order.deliveryAddress && (
                  <p className="text-muted mt-1">
                    {[order.deliveryAddress.addressLine1, order.deliveryAddress.area, order.deliveryAddress.city].filter(Boolean).join(', ')}
                    {order.deliveryAddress.landmark ? t('detail.near', { landmark: order.deliveryAddress.landmark }) : ''}
                  </p>
                )}
                {order.contactHidden && (
                  <p className="text-xs text-muted mt-2" data-testid="contact-hidden">{t(`contact.${order.contactHidden}`)}</p>
                )}
              </section>

              <section className="pt-6 border-t border-line">
                <h2 className="text-sm font-semibold text-ink">{t('detail.payment')}</h2>
                <p className="mt-2 text-ink">
                  {paymentMethodLabel(order.paymentMethod, tc)}, {paymentStatusLabel(order.paymentStatus, t)}
                </p>
                {(order.paymentReferenceNumber || order.paymentSenderName || order.paymentProofUrl) && (
                  <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
                    {order.paymentReferenceNumber && (
                      <>
                        <dt className="text-muted">{t('detail.reference')}</dt>
                        <dd className="text-ink font-mono truncate" data-ltr>{order.paymentReferenceNumber}</dd>
                      </>
                    )}
                    {order.paymentSenderName && (
                      <>
                        <dt className="text-muted">{t('detail.sentBy')}</dt>
                        <dd className="text-ink truncate">{order.paymentSenderName}</dd>
                      </>
                    )}
                  </dl>
                )}
                {order.paymentProofUrl && (
                  <ExternalLink href={order.paymentProofUrl} className="inline-flex items-center min-h-11 font-semibold text-brand-ink hover:underline">
                    {t('detail.viewReceipt')}
                  </ExternalLink>
                )}
                {order.sellerTotals && (
                  <dl className="mt-3 space-y-1.5">
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted">{t('detail.yourItems')}</dt>
                      <dd className="text-ink tabular-nums">{formatPrice(order.sellerTotals.subtotal)}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted">{t('detail.commission')}</dt>
                      <dd className="text-ink tabular-nums" data-ltr>-{formatPrice(order.sellerTotals.commission)}</dd>
                    </div>
                    {order.sellerTotals.deliveryFeeKept > 0 && (
                      <div className="flex justify-between gap-3">
                        <dt className="text-muted">{t('detail.deliveryFeeKept')}</dt>
                        <dd className="text-ink tabular-nums">{formatPrice(order.sellerTotals.deliveryFeeKept)}</dd>
                      </div>
                    )}
                    {(order.sellerTotals.deliveryFeePaid ?? 0) > 0 && (
                      <div className="flex justify-between gap-3">
                        <dt className="text-muted">{t('detail.deliveryFeePaid')}</dt>
                        <dd className="text-ink tabular-nums" data-ltr>-{formatPrice(order.sellerTotals.deliveryFeePaid ?? 0)}</dd>
                      </div>
                    )}
                    <div className="flex items-baseline justify-between gap-3 pt-2 border-t border-line">
                      <dt className="font-semibold text-ink">{t('detail.yourEarnings')}</dt>
                      <dd className="text-2xl font-semibold text-ink tabular-nums">{formatPrice(total)}</dd>
                    </div>
                  </dl>
                )}
              </section>

              <section className="pt-6 border-t border-line">
                <h2 className="text-sm font-semibold text-ink">{t('detail.history')}</h2>
                {order.statusHistory.length === 0 ? (
                  <p className="mt-2 text-muted">{t('detail.noHistory')}</p>
                ) : (
                  <ol className="mt-2 space-y-2.5">
                    {order.statusHistory.map((h, i) => (
                      <li key={i}>
                        <p className="text-ink first-letter:uppercase">
                          {statusLabel(h.status)}
                          {h.notes ? <span className="text-muted">, {h.notes}</span> : null}
                        </p>
                        <p className="text-xs text-muted">{formatDateTime(h.createdAt)}</p>
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            </aside>

            <OrderChatModal
              isOpen={chatOpen}
              onClose={() => setChatOpen(false)}
              orderId={order.id}
              orderNumber={order.orderNumber}
              currentRole="seller"
            />
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
