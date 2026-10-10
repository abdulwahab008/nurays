'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { orderService, type OrderDetails } from '@/lib/services/order.service';
import { formatPrice, formatDateTime, formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useAuthStore } from '@/lib/store/auth-store';
import { useSocket, type DeliveryTrackingEvent } from '@/lib/hooks/use-socket';
import { useLiveRefresh } from '@/lib/hooks/use-live-refresh';
import { DashboardLayout, CUSTOMER_SIDEBAR_ITEMS } from '@/components/layout/DashboardShell';
import WriteReviewForm from '@/components/products/WriteReviewForm';
import { apiClient, apiErrorMessage } from '@/lib/api-client';
import { newAudioContext } from '@/lib/audio';
import ManualPaymentCard from '@/components/orders/ManualPaymentCard';
import OnlinePaymentCard from '@/components/orders/OnlinePaymentCard';
import OrderChatModal from '@/components/orders/OrderChatModal';
import TriPartiteReviewModal from '@/components/orders/TriPartiteReviewModal';
import dynamic from 'next/dynamic';
import { useT } from '@/lib/i18n';
import { commonMessages, statusKey } from '@/lib/i18n/messages/common';
import { ordersMessages } from '@/lib/i18n/messages/orders';

type OrdersT = ReturnType<typeof useT<typeof ordersMessages.en>>;

// Leaflet touches the DOM on import: load the map in the browser only.
const RiderLiveMap = dynamic(() => import('@/components/orders/RiderLiveMap'), { ssr: false });

function playCancelSound() {
  if (typeof window === 'undefined') return;
  try {
    const ctx = newAudioContext();
    if (!ctx) return;
    const go = () => {
      // Low descending two-tone — signals something went wrong
      const playNote = (freq: number, start: number, dur: number, vol = 0.25) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = 'sine'; osc.frequency.value = freq;
        gain.gain.setValueAtTime(vol, ctx.currentTime + start);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur);
        osc.start(ctx.currentTime + start);
        osc.stop(ctx.currentTime + start + dur + 0.05);
      };
      playNote(440, 0.00, 0.25);
      playNote(330, 0.22, 0.35);
    };
    ctx.state === 'suspended' ? ctx.resume().then(go).catch(() => {}) : go();
  } catch { /* ignore */ }
}

interface OrderDetail {
  id: string;
  orderNumber: string;
  status?: string;
  orderStatus?: string;
  paymentStatus?: string;
  paymentMethod?: string;
  paymentReferenceNumber?: string | null;
  paymentSubmittedAt?: string | null;
  paymentProofUrl?: string | null;
  paymentSenderAccount?: string | null;
  customerName?: string;
  customerPhone?: string;
  createdAt?: string;
  sellerName?: string;
  items: Array<{
    id: string;
    productId?: string;
    productName: string;
    variantName?: string;
    productImage?: string;
    sellerName: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    status: string;
  }>;
  pricing: {
    subtotal: number;
    deliveryFee: number;
    discount: number;
    tax: number;
    total: number;
  };
  delivery: {
    type: string;
    address: string;
    slotDate?: string;
    slotTime?: string;
    estimatedAt?: string;
    otp?: string;
    arrivedAtCustomer?: string;
    rider?: {
      name: string;
      phone: string;
      vehicle?: string;
    };
    /** The rider's last position, sent only while the food is on its way. */
    riderLocation?: { latitude: number; longitude: number; updatedAt?: string | null; distanceKm?: number | null } | null;
    /** The delivery address on the map, when its location is known. */
    destination?: { latitude: number; longitude: number } | null;
  };
  timeline: Array<{
    status: string;
    timestamp: string;
  }>;
}

/** "Updated just now / 2 min ago / 1 h ago", kept current while on screen. */
function UpdatedAgo({ iso }: { iso: string }) {
  const t = useT(ordersMessages);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);
  const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  const minutes = Math.round(seconds / 60);
  const label =
    seconds < 45
      ? t('detail.justNow')
      : minutes < 60
        ? t('detail.minAgo', { count: minutes })
        : t('detail.hoursAgo', { count: Math.round(minutes / 60) });
  return <>{t('detail.updated', { when: label })}</>;
}

/** How the customer paid, in words. */
function paymentChannelLabel(t: OrdersT, method?: string, senderAccount?: string | null): string {
  const m = (method ?? '').toLowerCase();
  const via = senderAccount ? t('detail.payFrom', { account: senderAccount }) : '';
  if (m === 'cod') return t('detail.channel.cod');
  if (m === 'wallet') return t('detail.channel.wallet');
  if (m === 'safepay' || m === 'card') return t('detail.channel.online');
  if (m === 'jazzcash') return t('detail.channel.jazzcash', { via });
  if (m === 'easypaisa') return t('detail.channel.easypaisa', { via });
  if (m === 'bank') return t('detail.channel.bank', { via });
  return method ? method.toUpperCase() : t('detail.channel.notRecorded');
}

/** Where the payment stands, in words. Only a transfer into the kitchen's account is confirmed by the kitchen. */
function paymentStatusLabel(t: OrdersT, method?: string, status?: string): string {
  const toKitchen = ['jazzcash', 'easypaisa', 'bank'].includes((method ?? '').toLowerCase());
  switch (status) {
    case 'paid':
      return toKitchen ? t('detail.payState.paidByKitchen') : t('detail.payState.paid');
    case 'payment_submitted':
      return t('detail.payState.submitted');
    case 'disputed':
      return t('detail.payState.disputed');
    case 'refund_pending':
      return t('detail.payState.refundPending');
    case 'refunded':
      return t('detail.payState.refunded');
    case 'failed':
      return t('detail.payState.failed');
    default:
      return (method ?? '').toLowerCase() === 'cod' ? t('detail.payState.onDelivery') : t('detail.payState.notPaid');
  }
}

function mapOrderToDetail(raw: OrderDetails): OrderDetail {
  // The server sends the address as the order was placed (even when the saved address has since been deleted).
  const addr = raw.deliveryAddress;
  const addressStr = addr
    ? [addr.addressLine1, addr.addressLine2, addr.area, addr.city].filter(Boolean).join(', ')
    : '—';
  const slotDate = raw.deliverySlotDate
    ? new Date(raw.deliverySlotDate).toISOString().slice(0, 10)
    : undefined;
  const sellerName = raw.items?.[0]?.seller?.businessName || '';
  return {
    id: raw.id,
    orderNumber: raw.orderNumber ?? '',
    status: raw.orderStatus ?? raw.status,
    orderStatus: raw.orderStatus,
    paymentStatus: raw.paymentStatus ?? 'pending',
    paymentMethod: raw.paymentMethod,
    paymentReferenceNumber: raw.paymentReferenceNumber,
    paymentSubmittedAt: raw.paymentSubmittedAt
      ? new Date(raw.paymentSubmittedAt).toISOString()
      : null,
    paymentProofUrl: raw.paymentProofUrl ?? null,
    paymentSenderAccount: raw.paymentSenderAccount ?? null,
    createdAt: raw.createdAt ? new Date(raw.createdAt).toISOString() : new Date().toISOString(),
    sellerName,
    items: (raw.items ?? []).map((i) => ({
      id: i.id,
      productId: i.productId ?? i.product?.id,
      productName: i.productName ?? i.product?.name ?? '—',
      variantName: i.variantName ?? undefined,
      productImage: i.productImage ?? i.product?.images?.[0]?.imageUrl,
      sellerName: i.seller?.businessName ?? i.seller?.businessNameUrdu ?? '—',
      quantity: i.quantity ?? 0,
      unitPrice: Number(i.unitPrice ?? 0),
      totalPrice: Number(i.totalPrice ?? 0),
      status: i.status ?? 'pending',
    })),
    pricing: {
      subtotal: Number(raw.subtotal ?? 0),
      deliveryFee: Number(raw.deliveryFee ?? 0),
      discount: Number(raw.discountAmount ?? 0),
      tax: Number(raw.taxAmount ?? 0),
      total: Number(raw.totalAmount ?? 0),
    },
    delivery: {
      type: raw.deliveryType ?? 'home_delivery',
      address: addressStr,
      slotDate: slotDate,
      slotTime: raw.deliverySlotTime ?? undefined,
      estimatedAt: raw.estimatedDeliveryAt
        ? new Date(raw.estimatedDeliveryAt).toISOString()
        : raw.delivery?.deliveryTime ?? undefined,
      // Only the customer is ever sent the handover code.
      otp: raw.handoverCode ?? undefined,
      arrivedAtCustomer: raw.delivery?.arrivedAtCustomer ?? undefined,
      riderLocation: raw.delivery?.riderLocation ?? null,
      destination:
        addr?.latitude != null && addr?.longitude != null
          ? { latitude: Number(addr.latitude), longitude: Number(addr.longitude) }
          : null,
      rider:
        raw.delivery?.rider ?
          {
            name: raw.delivery.rider.name ?? '',
            phone: '',
            vehicle: [raw.delivery.rider.vehicleType, raw.delivery.rider.vehicleNumber].filter(Boolean).join(' - '),
          }
        : undefined,
    },
    timeline: (raw.statusHistory ?? []).map((h) => ({
      status: h.status ?? 'pending',
      timestamp: h.createdAt,
    })),
  };
}


export default function OrderDetailPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center">
          <div className="w-10 h-10 border-3 border-emerald-600 border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <OrderDetailContent />
    </Suspense>
  );
}

function OrderDetailContent() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated, user } = useAuthStore();
  const { showToast } = useToast();
  const { joinOrderRoom, onOrderStatusUpdate, onDeliveryTracking } = useSocket();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [trackingData, setTrackingData] = useState<DeliveryTrackingEvent | null>(null);
  const [showPlacedBanner, setShowPlacedBanner] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportDetails, setReportDetails] = useState('');
  const [reporting, setReporting] = useState(false);
  const [reported, setReported] = useState(false);
  const [showChatModal, setShowChatModal] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [showReceiptPreview, setShowReceiptPreview] = useState(false);
  const t = useT(ordersMessages);
  const tc = useT(commonMessages);
  const statusText = (s: string) =>
    statusKey(s) in commonMessages.en ? tc(statusKey(s)) : s.replace(/_/g, ' ');
  const payStatusText = (s: string) => {
    const key = `detail.payRaw.${s}` as keyof typeof ordersMessages.en;
    return key in ordersMessages.en ? t(key) : s.replace(/_/g, ' ');
  };

  useEffect(() => {
    const token = apiClient.getAccessToken();
    if (!token && !isAuthenticated) {
      router.push('/login');
      return;
    }
    if (params.id) {
      loadOrder();
    }
  }, [params.id, isAuthenticated]);

  // Real-time updates. Depends on the socket-bound functions, so it re-runs (and
  // re-joins the order room) whenever the socket is replaced — e.g. after a token
  // refresh — instead of staying attached to a dead connection.
  useEffect(() => {
    const orderId = params.id as string | undefined;
    if (!orderId) return;

    const leaveRoom = joinOrderRoom(orderId);

    const unsubscribeStatus = onOrderStatusUpdate((data) => {
      // The server also pushes every one of this customer's other orders to their
      // personal room; only this order's updates belong on this page.
      if (data?.orderId !== orderId) return;
      // Instantly update the status badge
      setOrder((prev) =>
        prev ? { ...prev, status: data.status, orderStatus: data.status } : null
      );
      if (data.status === 'cancelled') {
        // Reload full order so timeline, canCancel, etc. are all in sync
        loadOrder();
        showToast(t('detail.toastCancelledLive'), 'error', 10000);
        playCancelSound();
      }
    });

    const unsubscribeTracking = onDeliveryTracking((data) => {
      if (data?.orderId && data.orderId !== orderId) return;
      setTrackingData(data);
    });

    return () => {
      leaveRoom?.();
      unsubscribeStatus?.();
      unsubscribeTracking?.();
    };
  }, [params.id, joinOrderRoom, onOrderStatusUpdate, onDeliveryTracking, t]);

  useEffect(() => {
    if (searchParams.get('placed') === '1') setShowPlacedBanner(true);
  }, [searchParams]);

  // Latest-wins loading: a slow response for an older request must never overwrite a
  // newer one (polling, a cancel reload and the first load can overlap).
  const loadSeqRef = useRef(0);
  const inFlightRef = useRef(false);

  const loadOrder = async (silent = false) => {
    const seq = ++loadSeqRef.current;
    inFlightRef.current = true;
    if (!silent) setLoading(true);
    try {
      const response = await orderService.getOrderDetails(params.id as string);
      if (seq !== loadSeqRef.current) return; // a newer load superseded this one
      setOrder(mapOrderToDetail(response.data));
    } catch (error) {
      console.error('Failed to load order:', error);
    } finally {
      if (seq === loadSeqRef.current) inFlightRef.current = false;
      if (!silent) setLoading(false);
    }
  };

  // Reload when anything about this order changes (status, an item, payment, a rider taking
  // the job), on reconnect, and when the tab comes back; a slow timer covers changes that
  // send no event. Stops once the order can no longer change. Never overlaps a load.
  const currentStatus = order?.status || order?.orderStatus || '';
  useLiveRefresh(
    () => {
      if (!inFlightRef.current) loadOrder(true);
    },
    {
      events: ['order:status:update', 'order:item:status:update', 'delivery:assigned'],
      match: (data) => data?.orderId === params.id,
      enabled:
        isAuthenticated &&
        !!params.id &&
        !!currentStatus &&
        !['delivered', 'completed', 'cancelled', 'refunded', 'delivery_failed'].includes(currentStatus),
    }
  );

  const handleCancelOrder = async () => {
    if (!cancelReason.trim()) return;
    try {
      setCancelling(true);
      const res = await orderService.cancelOrder(params.id as string, cancelReason.trim());
      setShowCancelModal(false);
      setCancelReason('');
      loadOrder();
      // Say what happens to money already paid, rather than a bare "cancelled".
      const d = res?.data ?? {};
      const amt = Number(d.refundAmount ?? 0);
      if (amt > 0 && d.refundStatus === 'refunded_to_wallet') {
        showToast(t('detail.toastRefundWallet', { amount: `Rs ${amt.toLocaleString()}` }), 'success', 8000);
      } else if (amt > 0) {
        showToast(t('detail.toastRefundManual', { amount: `Rs ${amt.toLocaleString()}` }), 'success', 10000);
      } else {
        showToast(t('detail.toastCancelled'), 'success');
      }
    } catch (error) {
      showToast(apiErrorMessage(error, t('detail.cancelFailed')), 'error');
    } finally {
      setCancelling(false);
    }
  };

  const handleReportNonReceipt = async () => {
    if (!order || !reportDetails.trim()) return;
    try {
      setReporting(true);
      await apiClient.post('/support/tickets', {
        orderId: order.id,
        category: 'delivery_dispute',
        subject: `Didn't receive order #${order.orderNumber}`,
        description: reportDetails.trim(),
        priority: 'high',
      });
      setShowReportModal(false);
      setReportDetails('');
      setReported(true);
      showToast(t('detail.toastReported'), 'success');
    } catch (error) {
      showToast(apiErrorMessage(error, t('detail.reportFailed')), 'error');
    } finally {
      setReporting(false);
    }
  };

  const customerSidebarItems = CUSTOMER_SIDEBAR_ITEMS;

  if (loading) {
    return (
      <DashboardLayout
        title={t('detail.title')}
        subtitle={t('detail.loadingSub')}
        sidebarItems={customerSidebarItems}
        userType="customer"
      >
        <div className="flex items-center justify-center py-16">
          <p className="text-gray-600">{t('detail.loadingOrder')}</p>
        </div>
      </DashboardLayout>
    );
  }

  if (!order) {
    return (
      <DashboardLayout
        title={t('detail.notFound')}
        subtitle=""
        sidebarItems={customerSidebarItems}
        userType="customer"
      >
        <div className="max-w-xl mx-auto py-16 px-4 text-center">
          <div className="w-16 h-16 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center mx-auto mb-4 text-2xl shadow-xs">
            📦
          </div>
          <h1 className="text-2xl font-black text-gray-900 mb-2">{t('detail.notFound')}</h1>
          <p className="text-sm text-gray-500 mb-6 leading-relaxed">
            {t('detail.notFoundBody')}
          </p>
          <div className="flex items-center justify-center gap-3">
            <Link href="/orders">
              <Button>{t('detail.backToMyOrders')}</Button>
            </Link>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // Only allow cancel while order is still pending (before seller has accepted/confirmed)
  // Also derive effective status: if all items are cancelled, treat order as cancelled
  const effectiveStatus = (() => {
    const raw = order.status ?? order.orderStatus ?? 'pending';
    if (raw === 'pending' && order.items.length > 0 && order.items.every((i) => i.status === 'cancelled')) {
      return 'cancelled';
    }
    return raw;
  })();
  const orderStatus = effectiveStatus;

  // The rider's position: the latest live update, else the last one the order came with.
  // Shown only while the food is on its way.
  const onTheWay = ['dispatched', 'in_transit'].includes(effectiveStatus);
  const liveRider: { latitude: number; longitude: number; updatedAt?: string | null; distanceKm?: number | null } | null = !onTheWay
    ? null
    : trackingData?.location
      ? { ...trackingData.location, updatedAt: trackingData.updatedAt, distanceKm: trackingData.distanceKm ?? null }
      : order.delivery?.riderLocation ?? null;
  const canCancel = orderStatus === 'pending';
  // Display names, with words for the ones the order doesn't carry.
  const sellerName = order.sellerName || t('detail.homeKitchen');
  const customerName = order.customerName || t('detail.valuedCustomer');
  const riderName = order.delivery?.rider ? order.delivery.rider.name || t('detail.yourRider') : t('detail.deliveryPartner');

  return (
    <DashboardLayout
      title={t('detail.pageTitle', { number: order.orderNumber })}
      subtitle={t('detail.pageSubtitle', { status: statusText(effectiveStatus), payment: payStatusText(order.paymentStatus ?? 'pending') })}
      sidebarItems={customerSidebarItems}
      userType="customer"
    >
      <div className="print-hide space-y-6">
        {/* Back from the payment page */}
        {searchParams.get('payment') === 'paid' && (
          <div role="status" className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl p-4 text-sm font-medium">
            {t('detail.paymentReceived')}
          </div>
        )}
        {searchParams.get('payment') === 'duplicate' && (
          <div role="status" className="bg-sky-50 border border-sky-200 text-sky-900 rounded-xl p-4 text-sm font-medium">
            {t('detail.duplicateBefore')}{' '}
            <Link href="/wallet" className="underline font-semibold">
              {t('detail.duplicateLink')}
            </Link>
            {t('detail.duplicateAfter')}
          </div>
        )}

        {/* Just-placed confirmation banner */}
        {showPlacedBanner && (
          <div className="bg-green-600 text-white rounded-xl p-4 flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20">
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </span>
              <div>
                <p className="font-semibold text-lg">{t('detail.placedTitle')}</p>
                <p className="text-white/90 text-sm">{t('detail.placedBody')}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => { setShowPlacedBanner(false); router.replace(`/orders/${params.id}`, { scroll: false }); }}
              className="text-sm font-medium text-white/90 hover:text-white underline"
            >
              {t('detail.dismiss')}
            </button>
          </div>
        )}

      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2 flex-wrap">
          <Link href="/orders">
            <Button variant="outline" size="sm">{t('detail.backToOrders')}</Button>
          </Link>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 text-xs font-black transition-all shadow-xs active:scale-95"
            title={t('detail.printTitle')}
          >
            <span>🖨️</span>
            <span>{t('detail.printReceipt')}</span>
          </button>
          <button
            onClick={() => setShowReceiptPreview(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-extrabold transition-all active:scale-95"
            title={t('detail.previewTitle')}
          >
            <span>🧾</span>
            <span>{t('detail.viewReceipt')}</span>
          </button>
          <button
            onClick={() => setShowChatModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#0C1016] hover:bg-slate-800 text-white text-xs font-black transition-all shadow-xs"
          >
            <span>💬</span>
            <span>{t('detail.chatWith', { name: sellerName })}</span>
          </button>
          {(effectiveStatus === 'delivered' || effectiveStatus === 'completed') && (
            <button
              onClick={() => setShowReviewModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#FF5500] hover:bg-[#e04400] text-white text-xs font-black transition-all shadow-xs"
            >
              <span>⭐</span>
              <span>{t('detail.rateExperience')}</span>
            </button>
          )}
        </div>
      </div>

      <div>
        <div className="mb-6">
          <div className="flex items-center gap-4">
            <span
              className={`px-3 py-1 rounded-full text-sm font-medium ${
                effectiveStatus === 'delivered' || effectiveStatus === 'completed'
                  ? 'bg-green-100 text-green-800'
                  : effectiveStatus === 'cancelled'
                  ? 'bg-red-100 text-red-800'
                  : effectiveStatus === 'pending'
                  ? 'bg-yellow-100 text-yellow-800'
                  : 'bg-blue-100 text-blue-800'
              }`}
            >
              {statusText(effectiveStatus).toUpperCase()}
            </span>
            <span
              className={`px-3 py-1 rounded-full text-sm font-medium ${
                order.paymentStatus === 'paid'
                  ? 'bg-green-100 text-green-800'
                  : order.paymentStatus === 'refunded'
                  ? 'bg-blue-100 text-blue-800'
                  : order.paymentStatus === 'refund_pending'
                  ? 'bg-amber-100 text-amber-800'
                  : 'bg-gray-100 text-gray-800'
              }`}
            >
              {t('detail.paymentBadge', { status: payStatusText(order.paymentStatus ?? 'pending').toUpperCase() })}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Order Items */}
          <div className="lg:col-span-2 space-y-4">
            {/* Online payment not finished yet */}
            {!['cancelled', 'refunded'].includes(orderStatus) &&
              ['safepay', 'card'].includes((order.paymentMethod ?? '').toLowerCase()) &&
              ['pending', 'failed'].includes(order.paymentStatus ?? 'pending') && (
              <OnlinePaymentCard orderId={order.id} totalAmount={order.pricing?.total ?? 0} />
            )}

            {/* Direct Manual Payment Card (transfer into the kitchen's own account) */}
            {!['cancelled', 'refunded'].includes(orderStatus) &&
              ['jazzcash', 'easypaisa', 'bank'].includes((order.paymentMethod ?? '').toLowerCase()) &&
              ['pending', 'failed', 'disputed', 'payment_submitted'].includes(order.paymentStatus ?? 'pending') && (
              <ManualPaymentCard
                orderId={order.id}
                totalAmount={order.pricing?.total ?? 0}
                paymentStatus={order.paymentStatus ?? 'pending'}
                paymentReferenceNumber={order.paymentReferenceNumber}
                paymentSubmittedAt={order.paymentSubmittedAt}
                paymentProofUrl={order.paymentProofUrl}
                paymentSenderAccount={order.paymentSenderAccount}
                onPaymentSubmitted={() => loadOrder(true)}
              />
            )}

            <div className="bg-white rounded-lg shadow-sm p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">{t('detail.orderItems')}</h2>
              <div className="space-y-4">
                {order.items.map((item) => (
                  <div key={item.id} className="flex gap-4 pb-4 border-b last:border-0">
                    <div className="w-20 h-20 bg-gray-200 rounded-lg overflow-hidden flex-shrink-0">
                      {item.productImage ? (
                        <img
                          src={item.productImage}
                          alt={item.productName}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">
                          {t('detail.noImage')}
                        </div>
                      )}
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900">{item.productName}</h3>
                      {item.variantName && (
                        <p className="text-sm text-gray-600">{item.variantName}</p>
                      )}
                      <p className="text-sm text-gray-600">{item.sellerName}</p>
                      <div className="flex items-center justify-between mt-2">
                        <div>
                          <p className="text-sm text-gray-600">
                            {t('detail.qty', { qty: item.quantity, price: formatPrice(item.unitPrice) })}
                          </p>
                          <p className="font-semibold text-gray-900">
                            {formatPrice(item.totalPrice)}
                          </p>
                        </div>
                        <span className="text-sm text-gray-600 capitalize">{statusText(item.status)}</span>
                      </div>
                      {(effectiveStatus === 'delivered' || effectiveStatus === 'completed') && item.productId && (
                        <WriteReviewForm orderId={order.id} orderItemId={item.id} productName={item.productName} />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Delivery Information */}
            <div className="bg-white rounded-lg shadow-sm p-6 space-y-4">
              <h2 className="text-xl font-bold text-gray-900">{t('detail.deliveryInfo')}</h2>

              {/* Doorstep Handover PIN Card */}
              {order.delivery?.otp && !['delivered', 'completed', 'cancelled', 'refunded'].includes(effectiveStatus) && (
                <div className="bg-gradient-to-r from-amber-50 to-orange-50 border-2 border-amber-500/50 rounded-xl p-4 shadow-sm">
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="inline-flex h-2.5 w-2.5 rounded-full bg-amber-500 animate-pulse" />
                        <span className="text-xs uppercase font-bold tracking-wider text-amber-950">{t('detail.pinTitle')}</span>
                      </div>
                      <p className="text-xs text-amber-800 mt-1 max-w-sm">
                        {t('detail.pinBody')}
                      </p>
                    </div>
                    <div className="bg-white border-2 border-amber-500 px-5 py-2 rounded-xl text-center shadow-inner">
                      <span className="text-[11px] uppercase font-bold text-muted-foreground block">{t('detail.pinLabel')}</span>
                      <span data-ltr className="text-3xl font-mono font-black tracking-widest text-amber-600">{order.delivery.otp}</span>
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-2 text-gray-700">
                <p>
                  <span className="font-semibold">{t('detail.address')}</span> {order.delivery?.address ?? '—'}
                </p>
                {order.delivery?.slotDate && (
                  <p>
                    <span className="font-semibold">{t('detail.slot')}</span> {order.delivery.slotDate} (
                    {order.delivery.slotTime})
                  </p>
                )}
                {order.delivery?.estimatedAt && (
                  <p>
                    <span className="font-semibold">{t('detail.estimatedDelivery')}</span>{' '}
                    {formatDateTime(order.delivery.estimatedAt)}
                  </p>
                )}
                {order.delivery?.rider && (
                  <div className="mt-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
                    <p className="font-semibold mb-2 text-gray-900">{t('detail.assignedRider')}</p>
                    <p className="text-sm"><span className="text-muted-foreground">{t('detail.riderName')}</span> {order.delivery.rider.name || t('detail.yourRider')}</p>
                    {order.delivery.rider.phone && (
                      <p className="text-sm"><span className="text-muted-foreground">{t('detail.riderPhone')}</span> <span data-ltr>{order.delivery.rider.phone}</span></p>
                    )}
                    {order.delivery.rider.vehicle && (
                      <p className="text-sm"><span className="text-muted-foreground">{t('detail.riderVehicle')}</span> {order.delivery.rider.vehicle}</p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Where the rider is, while the food is on its way */}
            {liveRider && (
              <div className="bg-white rounded-lg shadow-sm p-6" data-testid="rider-live-tracking">
                <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
                  <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                    <span className="inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
                    {t('detail.onItsWay')}
                  </h2>
                  <p className="text-xs text-gray-500">
                    {typeof liveRider.distanceKm === 'number' && <span className="font-semibold text-gray-800">{t('detail.kmAway', { km: liveRider.distanceKm.toFixed(1) })}</span>}
                    {liveRider.updatedAt ? <UpdatedAgo iso={liveRider.updatedAt} /> : t('detail.live')}
                  </p>
                </div>
                <RiderLiveMap
                  rider={{ latitude: liveRider.latitude, longitude: liveRider.longitude }}
                  destination={order.delivery?.destination ?? null}
                />
              </div>
            )}

            {/* Timeline */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">{t('detail.timeline')}</h2>
              <div className="space-y-3">
                {(order.timeline ?? []).map((event, index) => (
                  <div key={index} className="flex items-start gap-3">
                    <div className="w-2 h-2 rounded-full bg-green-600 mt-2"></div>
                    <div>
                      <p className="font-semibold capitalize">{statusText(event.status ?? '')}</p>
                      <p className="text-sm text-gray-600">{formatDateTime(event.timestamp)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Order Summary */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow-sm p-6 sticky top-4">
              <h2 className="text-xl font-bold text-gray-900 mb-4">{t('detail.summary')}</h2>
              <div className="space-y-2 mb-4">
                <div className="flex justify-between text-gray-600">
                  <span>{tc('subtotal')}</span>
                  <span>{formatPrice(order.pricing?.subtotal ?? 0)}</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>{t('detail.deliveryFee')}</span>
                  <span>{formatPrice(order.pricing?.deliveryFee ?? 0)}</span>
                </div>
                {(order.pricing?.discount ?? 0) > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>{tc('discount')}</span>
                    <span>-{formatPrice(order.pricing?.discount ?? 0)}</span>
                  </div>
                )}
                <div className="flex justify-between text-gray-600">
                  <span>{t('detail.gst')}</span>
                  <span>{formatPrice(order.pricing?.tax ?? 0)}</span>
                </div>
                <div className="border-t pt-2 mt-2">
                  <div className="flex justify-between font-bold text-lg">
                    <span>{tc('total')}</span>
                    <span className="text-green-600">{formatPrice(order.pricing?.total ?? 0)}</span>
                  </div>
                </div>
              </div>
              {canCancel && (
                <Button
                  variant="destructive"
                  className="w-full"
                  onClick={() => setShowCancelModal(true)}
                >
                  {t('detail.cancelOrder')}
                </Button>
              )}
              {(effectiveStatus === 'delivered' || effectiveStatus === 'completed') && (
                reported ? (
                  <p className="text-sm text-gray-500 text-center mt-2">
                    {t('detail.reportedNote')}
                  </p>
                ) : (
                  <Button
                    variant="outline"
                    className="w-full mt-2 border-red-200 text-red-600 hover:bg-red-50"
                    onClick={() => setShowReportModal(true)}
                  >
                    {t('detail.didntReceive')}
                  </Button>
                )
              )}
            </div>
          </div>
        </div>
      </div>
    </div>

      {/* Report Non-Receipt Modal */}
      {showReportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="bg-red-500 px-6 py-4">
              <h2 className="text-white font-bold text-lg">{t('detail.reportTitle')}</h2>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-gray-600">
                {t('detail.reportBody')}
              </p>
              <textarea
                value={reportDetails}
                onChange={(e) => setReportDetails(e.target.value)}
                rows={4}
                placeholder={t('detail.reportPlaceholder')}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500"
              />
              <div className="flex items-center gap-3">
                <Button
                  variant="destructive"
                  onClick={handleReportNonReceipt}
                  disabled={reporting || !reportDetails.trim()}
                >
                  {reporting ? t('detail.submitting') : t('detail.submitReport')}
                </Button>
                <button
                  onClick={() => { setShowReportModal(false); setReportDetails(''); }}
                  className="text-sm text-gray-500 hover:text-gray-700"
                >
                  {tc('cancel')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Order Modal */}
      {showCancelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            {/* Header */}
            <div className="bg-red-500 px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <h2 className="text-white font-bold text-lg">{t('detail.cancelOrder')}</h2>
              </div>
              <button onClick={() => { setShowCancelModal(false); setCancelReason(''); }} className="text-white/70 hover:text-white" aria-label={t('detail.closeAria')}>
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            {/* Body */}
            <div className="px-6 py-5">
              <p className="text-gray-600 text-sm mb-4">
                {t('detail.cancelConfirmBefore')}<strong data-ltr>#{order.orderNumber}</strong>{t('detail.cancelConfirmAfter')}
              </p>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('detail.cancelReason')} <span className="text-red-500">*</span></label>
              <textarea
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-red-400 resize-none"
                rows={3}
                placeholder={t('detail.cancelPlaceholder')}
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
              />
              <div className="flex gap-3 mt-4">
                <button
                  onClick={handleCancelOrder}
                  disabled={!cancelReason.trim() || cancelling}
                  className="flex-1 bg-red-500 hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-xl text-sm transition-all active:scale-95"
                >
                  {cancelling ? t('detail.cancelling') : t('detail.yesCancel')}
                </button>
                <button
                  onClick={() => { setShowCancelModal(false); setCancelReason(''); }}
                  className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-2.5 rounded-xl text-sm transition-all active:scale-95"
                >
                  {t('detail.keepOrder')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Chat with Kitchen Modal */}
      <OrderChatModal
        orderId={order.id}
        orderNumber={order.orderNumber}
        sellerName={sellerName}
        customerName={customerName}
        currentRole={user?.userType === 'seller' ? 'seller' : 'customer'}
        isOpen={showChatModal}
        onClose={() => setShowChatModal(false)}
      />

      {/* Tri-Partite Review Modal */}
      <TriPartiteReviewModal
        orderId={order.id}
        orderNumber={order.orderNumber}
        items={order.items}
        deliveryType={order.delivery?.type}
        sellerName={sellerName}
        riderName={riderName}
        isOpen={showReviewModal}
        onClose={() => setShowReviewModal(false)}
        onReviewed={() => loadOrder(true)}
      />

      {/* Official Professional Printable Tax Invoice & Receipt (Displayed cleanly on window.print()) */}
      <div id="printable-order-receipt" className="hidden print:block font-sans text-slate-900 bg-white p-6 max-w-3xl mx-auto">
        {/* Receipt Header */}
        <div className="flex items-start justify-between border-b-2 border-slate-900 pb-4 mb-5">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-2xl font-black tracking-tight text-slate-950">NURAY FOOD &amp; FROST</span>
              <span className="text-[11px] font-black bg-emerald-100 text-emerald-900 px-2 py-0.5 rounded-full uppercase">{t('receipt.verifiedKitchen')}</span>
            </div>
            <p className="text-xs text-slate-600">{t('receipt.network')}</p>
            <p className="text-[11px] text-slate-500 font-medium">{t('receipt.officialInvoice')}</p>
          </div>
          <div className="text-end">
            <h2 className="text-xl font-black text-slate-900 tracking-tight">{t('receipt.heading')}</h2>
            <p className="text-xs font-mono font-bold text-slate-700">{t('receipt.orderNumber', { number: order.orderNumber })}</p>
            <p className="text-[11px] text-slate-500 mt-0.5">{t('receipt.date', { date: formatDate(order.createdAt || new Date().toISOString()) })}</p>
          </div>
        </div>

        {/* Kitchen & Customer Credentials */}
        <div className="grid grid-cols-2 gap-6 border-b border-slate-200 pb-4 mb-5 text-xs">
          <div>
            <span className="text-[11px] font-black uppercase text-slate-400 tracking-wider block mb-1">
              {t('receipt.preparedBy')}
            </span>
            <h4 className="font-extrabold text-sm text-slate-900">{sellerName}</h4>
            <p className="text-slate-600">{t('receipt.certifiedChef')}</p>
            <p className="text-slate-500 text-[11px]">{t('receipt.cluster')}</p>
          </div>

          <div>
            <span className="text-[11px] font-black uppercase text-slate-400 tracking-wider block mb-1">
              {t('receipt.billedTo')}
            </span>
            <h4 className="font-extrabold text-sm text-slate-900">{customerName}</h4>
            {order.customerPhone && <p data-ltr className="text-slate-600 font-mono text-[11px]">{order.customerPhone}</p>}
            <p className="text-slate-600 text-[11px] leading-relaxed mt-0.5">{order.delivery.address}</p>
          </div>
        </div>

        {/* Itemized Portion Table */}
        <div className="mb-5">
          <table className="w-full text-start text-xs border-collapse">
            <thead>
              <tr className="border-b-2 border-slate-800 text-[11px] uppercase tracking-wider text-slate-600">
                <th className="py-2 pe-2 font-black">#</th>
                <th className="py-2 px-2 font-black">{t('receipt.colItem')}</th>
                <th className="py-2 px-2 font-black text-center">{t('receipt.colQty')}</th>
                <th className="py-2 px-2 font-black text-end">{t('receipt.colUnitPrice')}</th>
                <th className="py-2 ps-2 font-black text-end">{t('receipt.colAmount')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {order.items.map((item, idx) => (
                <tr key={item.id} className="text-slate-800">
                  <td className="py-2.5 pe-2 font-bold text-slate-400">{idx + 1}</td>
                  <td className="py-2.5 px-2 font-semibold">
                    <span className="font-bold text-slate-900 block">{item.productName}</span>
                    {item.variantName && (
                      <span className="text-[11px] text-slate-500 font-medium">{item.variantName}</span>
                    )}
                  </td>
                  <td className="py-2.5 px-2 text-center font-bold">{item.quantity}</td>
                  <td className="py-2.5 px-2 text-end font-mono">{formatPrice(item.unitPrice)}</td>
                  <td className="py-2.5 ps-2 text-end font-mono font-bold text-slate-900">
                    {formatPrice(item.totalPrice)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Payment Summary & Financial Totals */}
        <div className="grid grid-cols-2 gap-6 border-t-2 border-slate-800 pt-4 mb-6 text-xs">
          {/* Payment Method Statement */}
          <div className="space-y-2">
            <span className="text-[11px] font-black uppercase text-slate-400 tracking-wider block">
              {t('receipt.paymentDetails')}
            </span>
            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-700">{t('receipt.paymentChannel')}</span>
                <span className="font-extrabold text-slate-900">
                  {paymentChannelLabel(t, order.paymentMethod, order.paymentSenderAccount)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-700">{t('receipt.verificationStatus')}</span>
                <span className="font-extrabold text-emerald-700">
                  {paymentStatusLabel(t, order.paymentMethod, order.paymentStatus)}
                </span>
              </div>
              {order.paymentReferenceNumber && (
                <div className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-200">
                  <span className="text-slate-500">{t('receipt.reference')}</span>
                  <span data-ltr className="font-mono font-bold text-slate-800">{order.paymentReferenceNumber}</span>
                </div>
              )}
              {order.paymentProofUrl && (
                <div className="pt-2 border-t border-slate-200 flex items-center gap-2">
                  <span className="text-xs">🧾</span>
                  <span className="text-[11px] text-emerald-800 font-bold">
                    {t('receipt.proofArchived')}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Pricing Totals */}
          <div className="space-y-1.5 text-end font-medium">
            <div className="flex justify-between">
              <span className="text-slate-500">{t('receipt.subtotal')}</span>
              <span className="font-mono text-slate-800">{formatPrice(order.pricing.subtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">{t('receipt.communityDelivery')}</span>
              <span className="font-mono text-slate-800">{formatPrice(order.pricing.deliveryFee)}</span>
            </div>
            {order.pricing.tax > 0 && (
              <div className="flex justify-between">
                <span className="text-slate-500">{t('receipt.salesTax')}</span>
                <span className="font-mono text-slate-800">{formatPrice(order.pricing.tax)}</span>
              </div>
            )}
            {order.pricing.discount > 0 && (
              <div className="flex justify-between text-emerald-600 font-bold">
                <span>{t('receipt.promoDiscount')}</span>
                <span className="font-mono">-{formatPrice(order.pricing.discount)}</span>
              </div>
            )}
            <div className="flex justify-between border-t-2 border-slate-300 pt-2 text-base font-black text-slate-950">
              <span>{t('receipt.grandTotalPkr')}</span>
              <span className="text-emerald-700 font-mono">{formatPrice(order.pricing.total)}</span>
            </div>
          </div>
        </div>

        {/* Footer & Watermark */}
        <div className="border-t border-slate-200 pt-4 text-center text-[11px] text-slate-500 space-y-1">
          <p className="font-extrabold text-slate-700">{t('receipt.thanks')}</p>
          <p>{t('receipt.support')}</p>
          <p className="text-[11px] text-slate-400">{t('receipt.computerGenerated')}</p>
        </div>
      </div>

      {/* Interactive Receipt Preview Modal */}
      {showReceiptPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
            <div className="px-6 py-4 bg-[#0C1016] text-white flex items-center justify-between border-b border-slate-800">
              <div className="flex items-center gap-2">
                <span className="text-xl">🧾</span>
                <h3 className="font-black text-sm">{t('receipt.preview')}</h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setShowReceiptPreview(false);
                    setTimeout(() => window.print(), 150);
                  }}
                  className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center gap-1.5"
                >
                  <span>🖨️</span>
                  <span>{t('receipt.printNow')}</span>
                </button>
                <button
                  onClick={() => setShowReceiptPreview(false)}
                  aria-label={t('detail.closeAria')}
                  className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center text-sm transition-colors"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="p-6 overflow-y-auto bg-slate-50/50">
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-5">
                {/* Header */}
                <div className="flex items-start justify-between border-b-2 border-slate-900 pb-4">
                  <div>
                    <span className="text-xl font-black text-slate-950 block">NURAY FOOD &amp; FROST</span>
                    <span className="text-[11px] text-slate-500 font-medium">{t('receipt.kitchenInvoice')}</span>
                  </div>
                  <div className="text-end">
                    <span className="font-mono font-bold text-sm text-slate-900 block"><span data-ltr>#{order.orderNumber}</span></span>
                    <span className="text-[11px] text-slate-400">{formatDate(order.createdAt || new Date().toISOString())}</span>
                  </div>
                </div>

                {/* Details */}
                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div>
                    <span className="text-[11px] uppercase font-bold text-slate-400 block">{t('receipt.soldBy')}</span>
                    <span className="font-bold text-slate-900 block">{sellerName}</span>
                    <span className="text-slate-500 text-[11px]">{t('receipt.communityKitchen')}</span>
                  </div>
                  <div>
                    <span className="text-[11px] uppercase font-bold text-slate-400 block">{t('receipt.deliveredTo')}</span>
                    <span className="font-bold text-slate-900 block">{customerName}</span>
                    <span className="text-slate-500 text-[11px]">{order.delivery.address}</span>
                  </div>
                </div>

                {/* Line Items */}
                <div className="border rounded-xl overflow-hidden divide-y divide-slate-100 text-xs">
                  {order.items.map((it, idx) => (
                    <div key={idx} className="p-2.5 flex items-center justify-between">
                      <span className="font-semibold text-slate-800">{it.quantity} × {it.productName}</span>
                      <span className="font-mono font-bold text-slate-900">{formatPrice(it.totalPrice)}</span>
                    </div>
                  ))}
                </div>

                {/* Summary */}
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="font-bold text-slate-700">{t('receipt.paymentChannel')}</span>
                    <span className="font-extrabold text-slate-900">
                      {paymentChannelLabel(t, order.paymentMethod, order.paymentSenderAccount)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-bold text-slate-700">{t('receipt.paymentStatus')}</span>
                    <span className="font-extrabold text-emerald-700">
                      {paymentStatusLabel(t, order.paymentMethod, order.paymentStatus)}
                    </span>
                  </div>
                  {order.paymentProofUrl && (
                    <div className="pt-2 border-t border-slate-200 flex items-center gap-3">
                      <div className="w-12 h-12 rounded-lg border border-slate-200 overflow-hidden flex-shrink-0">
                        <img src={order.paymentProofUrl} alt={t('receipt.proofAlt')} className="w-full h-full object-cover" />
                      </div>
                      <span className="text-[11px] text-emerald-800 font-bold">
                        {t('receipt.proofByCustomer')}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between border-t border-slate-200 pt-2 text-sm font-black text-slate-950">
                    <span>{t('receipt.grandTotal')}</span>
                    <span className="text-emerald-700 font-mono">{formatPrice(order.pricing.total)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Global Print Stylesheet */}
      <style jsx global>{`
        @media print {
          body {
            background-color: #ffffff !important;
            color: #0f172a !important;
          }
          header, nav, aside, .nuray-drawer, .no-print, button, [role="dialog"], #customer-order-toast-root {
            display: none !important;
          }
          main {
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            min-height: auto !important;
          }
          .print-hide {
            display: none !important;
          }
          #printable-order-receipt {
            display: block !important;
            width: 100% !important;
            padding: 24px !important;
            border: none !important;
            position: static !important;
          }
          @page {
            margin: 1.2cm;
            size: auto;
          }
        }
      `}</style>
    </DashboardLayout>
  );
}

