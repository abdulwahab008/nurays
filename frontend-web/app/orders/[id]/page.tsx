'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { loginUrlHere } from '@/lib/auth-redirect';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { orderService, type OrderDetails } from '@/lib/services/order.service';
import { formatPrice, formatDateTime, formatDate } from '@/lib/utils';
import { cancellationNotice } from '@/lib/order-cancellation';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { LoadError } from '@/components/ui/LoadError';
import { useAuthStore } from '@/lib/store/auth-store';
import { useSocket, type DeliveryTrackingEvent } from '@/lib/hooks/use-socket';
import { useLiveRefresh } from '@/lib/hooks/use-live-refresh';
import { DashboardLayout, CUSTOMER_SIDEBAR_ITEMS } from '@/components/layout/DashboardShell';
import { apiClient, apiErrorMessage } from '@/lib/api-client';
import { newAudioContext } from '@/lib/audio';
import ManualPaymentCard from '@/components/orders/ManualPaymentCard';
import OnlinePaymentCard from '@/components/orders/OnlinePaymentCard';
import OrderChatModal from '@/components/orders/OrderChatModal';
import TriPartiteReviewModal from '@/components/orders/TriPartiteReviewModal';
import { OrderProgress } from '@/components/orders/OrderProgress';
import { awaitingPayment, isPickupOrder } from '@/components/orders/order-progress';
import { Mark } from '@/components/ui/Mark';
import { CoverImage } from '@/components/ui/CoverImage';
import dynamic from 'next/dynamic';
import { ArrowLeft, Bike, ChevronDown, LifeBuoy, MapPin, MessageCircle, Phone, Printer, Receipt, Star, X } from 'lucide-react';
import { useT } from '@/lib/i18n';
import { commonMessages, statusKey } from '@/lib/i18n/messages/common';
import { ordersMessages } from '@/lib/i18n/messages/orders';
import { checkoutMessages } from '@/lib/i18n/messages/checkout';
import { useShallow } from 'zustand/react/shallow';
import { useNow } from '@/components/sellers/order-timing';

type OrdersT = ReturnType<typeof useT<typeof ordersMessages.en>>;

const CANCEL_CHOICES = ['mistake', 'changedMind', 'tooLong', 'other'] as const;
type CancelChoice = (typeof CANCEL_CHOICES)[number];
/** The server refuses a shorter reason (cancelOrderSchema). */
const MIN_CANCEL_REASON = 5;
const SLOT_TIMES = ['morning', 'afternoon', 'evening'];

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
  cancelledBy?: string | null;
  cancellationReason?: string | null;
  customerName?: string;
  customerPhone?: string;
  createdAt?: string;
  sellerName?: string;
  /** Whether the customer has already rated this order (sent by servers that include the order's reviews). */
  hasReview?: boolean;
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
    cancelledBy: raw.cancelledBy ?? null,
    cancellationReason: raw.cancellationReason ?? null,
    createdAt: raw.createdAt ? new Date(raw.createdAt).toISOString() : new Date().toISOString(),
    sellerName,
    hasReview: Boolean((raw as OrderDetails & { reviews?: unknown[] }).reviews?.length),
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
            // Sent to the order's customer only while the rider holds the job.
            phone: (raw.delivery.rider as { phone?: string | null }).phone ?? '',
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
        <div className="min-h-screen bg-page flex items-center justify-center">
          <div className="w-10 h-10 border-3 border-brand border-t-transparent rounded-full animate-spin" />
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
  const { isAuthenticated, user } = useAuthStore(useShallow((s) => ({ isAuthenticated: s.isAuthenticated, user: s.user })));
  const { showToast } = useToast();
  const { joinOrderRoom, onOrderStatusUpdate, onDeliveryTracking } = useSocket();
  const now = useNow();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  // Why the order could not be read when it was not a 404: an order that could not be read is not an order that does not exist.
  const [loadError, setLoadError] = useState<unknown>(null);
  const [trackingData, setTrackingData] = useState<DeliveryTrackingEvent | null>(null);
  const [showPlacedBanner, setShowPlacedBanner] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelChoice, setCancelChoice] = useState<CancelChoice | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [reviewed, setReviewed] = useState(false);
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
  const tco = useT(checkoutMessages);
  const statusText = (s: string) =>
    statusKey(s) in commonMessages.en ? tc(statusKey(s)) : s.replace(/_/g, ' ');

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
      setLoadError(null);
    } catch (error) {
      console.error('Failed to load order:', error);
      // An order already on the screen stays (a refresh that fails changes nothing); with none, only a 404 says it does not exist.
      if (seq === loadSeqRef.current) setLoadError((error as { response?: { status?: number } })?.response?.status === 404 ? null : error);
    } finally {
      if (seq === loadSeqRef.current) inFlightRef.current = false;
      if (!silent) setLoading(false);
    }
  };

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
    const token = apiClient.getAccessToken();
    if (!token && !isAuthenticated) {
      router.replace(loginUrlHere());
      return;
    }
    if (params.id) {
      loadOrder();
    }
  }, [params.id, isAuthenticated]);

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

  // The kitchen reads the reason, so a chosen one is sent in the words its screens use (English); "Other" as typed.
  const cancelReasonText = cancelChoice === 'other' ? cancelReason.trim() : cancelChoice ? ordersMessages.en[`detail.cancelChoice.${cancelChoice}`] : '';
  const cancelReasonValid = cancelChoice !== null && (cancelChoice !== 'other' || cancelReasonText.length >= MIN_CANCEL_REASON);
  const closeCancelModal = () => {
    setShowCancelModal(false);
    setCancelChoice(null);
    setCancelReason('');
  };

  const handleCancelOrder = async () => {
    if (!cancelReasonValid) return;
    try {
      setCancelling(true);
      const res = await orderService.cancelOrder(params.id as string, cancelReasonText);
      closeCancelModal();
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
          <p className="text-muted">{t('detail.loadingOrder')}</p>
        </div>
      </DashboardLayout>
    );
  }

  if (!order && loadError) {
    return (
      <DashboardLayout title={tc('loadFailedTitle')} subtitle="" sidebarItems={customerSidebarItems} userType="customer">
        <div className="max-w-xl mx-auto py-10 px-4">
          <LoadError error={loadError} onRetry={() => void loadOrder()} />
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
          <div className="w-16 h-16 rounded-full bg-raised text-muted flex items-center justify-center mx-auto mb-4">
            <Receipt className="w-7 h-7" aria-hidden />
          </div>
          <h1 className="text-2xl font-bold text-ink mb-2">{t('detail.notFound')}</h1>
          <p className="text-sm text-muted mb-6 leading-relaxed">
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
  const notice = effectiveStatus === 'cancelled' ? cancellationNotice(order.cancelledBy, order.cancellationReason) : null;

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
  // The receipt is the signed-in customer's own order, so their name is the one on their profile.
  const customerName = order.customerName || user?.profile?.fullName || t('detail.customer');
  const riderName = order.delivery?.rider ? order.delivery.rider.name.trim().split(/\s+/)[0] || t('detail.yourRider') : t('detail.deliveryPartner');

  const pickup = isPickupOrder(order.delivery?.type);
  const unpaid = awaitingPayment(effectiveStatus, order.paymentMethod, order.paymentStatus);
  const delivered = effectiveStatus === 'delivered' || effectiveStatus === 'completed';
  const active = !['delivered', 'completed', 'cancelled', 'refunded', 'delivery_failed'].includes(effectiveStatus);
  const method = (order.paymentMethod ?? '').toLowerCase();
  const headline = unpaid
    ? t('headline.awaitingPayment')
    : effectiveStatus === 'ready' && pickup
      ? t('headline.readyToCollect')
      : `headline.${effectiveStatus}` in ordersMessages.en
        ? t(`headline.${effectiveStatus}` as keyof typeof ordersMessages.en)
        : statusText(effectiveStatus);
  // The window the customer chose: a day (today when none was given) and a part of it.
  const slotLine = (() => {
    const time = order.delivery?.slotTime;
    if (!time || !SLOT_TIMES.includes(time)) return null;
    const window = t(`slot.${time}` as keyof typeof ordersMessages.en);
    return order.delivery?.slotDate ? t('detail.slotOn', { date: formatDate(order.delivery.slotDate), window }) : t('detail.slotToday', { window });
  })();
  // An estimate that has already gone by says nothing useful; the slot and the tracker still show.
  const etaLine =
    active && !unpaid && order.delivery?.estimatedAt && new Date(order.delivery.estimatedAt).getTime() > now
      ? t('detail.expectedBy', { time: formatDateTime(order.delivery.estimatedAt) })
      : null;
  // Items are only marked one by one when they are not all at the same stage.
  const itemsDiffer = new Set(order.items.map((i) => i.status)).size > 1;
  const pinVisible =
    !!order.delivery?.otp && !unpaid && (pickup ? ['ready', 'dispatched', 'in_transit'] : ['dispatched', 'in_transit']).includes(effectiveStatus);
  const payLine = (() => {
    if (order.paymentStatus === 'refunded') return t('detail.payLine.refunded');
    if (order.paymentStatus === 'refund_pending') return t('detail.payLine.refundPending');
    if (order.paymentStatus === 'paid') return t('detail.payLine.paid', { method: paymentChannelLabel(t, order.paymentMethod, order.paymentSenderAccount) });
    if (!active) return t('detail.payLine.notCharged');
    if (method === 'cod') return t(pickup ? 'detail.payLine.codPickup' : 'detail.payLine.cod', { amount: formatPrice(order.pricing.total) });
    return paymentStatusLabel(t, order.paymentMethod, order.paymentStatus);
  })();

  const sectionTitle = 'text-base font-semibold text-ink';
  const card = 'bg-surface rounded-[20px] border border-line p-4 sm:p-5';

  return (
    <DashboardLayout
      title={t('detail.pageTitle', { number: order.orderNumber })}
      subtitle={`\u2068${formatDateTime(order.createdAt)}\u2069`}
      sidebarItems={customerSidebarItems}
      userType="customer"
    >
      <div className="print-hide max-w-5xl mx-auto space-y-4 pb-8">
        <Link href="/orders" className="hidden lg:inline-flex items-center gap-1.5 min-h-11 text-sm font-semibold text-brand-ink hover:underline">
          <ArrowLeft className="w-4 h-4 rtl:-scale-x-100" aria-hidden />
          {t('detail.backToOrders')}
        </Link>

        {/* Back from the payment page */}
        {searchParams.get('payment') === 'paid' && (
          <div role="status" className="bg-brand-soft text-brand-soft-ink rounded-2xl p-4 text-sm font-semibold">
            {t('detail.paymentReceived')}
          </div>
        )}
        {searchParams.get('payment') === 'duplicate' && (
          <div role="status" className="bg-frozen-soft text-frozen-ink rounded-2xl p-4 text-sm font-medium">
            {t('detail.duplicateBefore')}{' '}
            <Link href="/wallet" className="underline font-semibold">
              {t('detail.duplicateLink')}
            </Link>
            {t('detail.duplicateAfter')}
          </div>
        )}

        {/* Just placed: the kitchen has not said yes yet, so this says "placed", never "confirmed" */}
        {showPlacedBanner && (
          <div role="status" className="bg-brand-soft text-brand-soft-ink rounded-[20px] p-4 flex items-start justify-between gap-3" data-testid="placed-banner">
            <div>
              <p className="font-semibold">{t('detail.placedTitle')}</p>
              <p className="text-sm">
                {unpaid
                  ? t('detail.placedBodyPay', { amount: formatPrice(order.pricing.total) })
                  : t('detail.placedBody', { kitchen: sellerName })}
              </p>
              {!pickup && (
                <p className="text-sm mt-1" data-testid="placed-delivery">
                  {order.pricing.deliveryFee
                    ? t('detail.placedDelivery', { fee: formatPrice(order.pricing.deliveryFee), total: formatPrice(order.pricing.total) })
                    : t('detail.placedFreeDelivery', { total: formatPrice(order.pricing.total) })}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => { setShowPlacedBanner(false); router.replace(`/orders/${params.id}`, { scroll: false }); }}
              className="shrink-0 min-h-11 px-2 text-sm font-semibold underline hover:no-underline"
            >
              {t('detail.dismiss')}
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6 items-start">
          <div className="lg:col-span-2 space-y-4">
            {/* Where the order stands, and what happens next */}
            <section className="bg-surface rounded-[20px] border border-line shadow-[var(--shadow-card)] p-4 sm:p-5 space-y-4" data-testid="order-status-card">
              <div>
                <h2 className="text-xl font-bold text-ink" data-testid="order-headline">{headline}</h2>
                {(etaLine || slotLine) && (
                  <p className="text-sm text-muted mt-1">{etaLine ?? slotLine}</p>
                )}
              </div>
              {!unpaid && <OrderProgress status={effectiveStatus} deliveryType={order.delivery?.type} />}
              {effectiveStatus === 'cancelled' && notice && (
                <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="status">
                  <p className="font-semibold">{t(`detail.cancelledBy.${notice.who}`)}</p>
                  {notice.reason && <p className="mt-0.5">{t('detail.cancelReasonLine', { reason: notice.reason })}</p>}
                </div>
              )}
              <div className="flex items-center justify-between gap-3 pt-3 border-t border-line">
                <div className="min-w-0">
                  <p className="text-xs text-muted">{t('detail.fromKitchen')}</p>
                  <p className="font-semibold text-ink truncate">{sellerName}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowChatModal(true)}
                  aria-label={t('detail.chatWith', { name: sellerName })}
                  className="shrink-0 w-11 h-11 rounded-full bg-brand-soft text-brand-soft-ink hover:bg-brand/30 flex items-center justify-center transition-colors"
                  data-testid="open-chat"
                >
                  <MessageCircle className="w-5 h-5" aria-hidden />
                </button>
              </div>
              {active && order.delivery?.rider && (
                <div className="flex items-center justify-between gap-3 pt-3 border-t border-line" data-testid="rider-row">
                  <div className="min-w-0">
                    <p className="text-xs text-muted">{t('detail.yourRider')}</p>
                    <p className="font-semibold text-ink truncate">
                      {riderName}
                      {order.delivery.rider.vehicle && <span className="font-normal text-muted"> · {order.delivery.rider.vehicle}</span>}
                    </p>
                  </div>
                  {order.delivery.rider.phone && (
                    <a
                      href={`tel:${order.delivery.rider.phone}`}
                      aria-label={t('detail.callRider', { name: riderName })}
                      className="shrink-0 w-11 h-11 rounded-full bg-brand-soft text-brand-soft-ink hover:bg-brand/30 flex items-center justify-center transition-colors"
                      data-testid="call-rider"
                    >
                      <Phone className="w-5 h-5" aria-hidden />
                    </a>
                  )}
                </div>
              )}
            </section>

            {/* Online payment not finished yet */}
            {!['cancelled', 'refunded'].includes(orderStatus) &&
              ['safepay', 'card'].includes(method) &&
              ['pending', 'failed'].includes(order.paymentStatus ?? 'pending') && (
              <OnlinePaymentCard orderId={order.id} totalAmount={order.pricing?.total ?? 0} />
            )}

            {/* Transfer into the kitchen's own account */}
            {!['cancelled', 'refunded'].includes(orderStatus) &&
              ['jazzcash', 'easypaisa', 'bank'].includes(method) &&
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

            {/* The code that completes the handover: only once there is something to hand over */}
            {pinVisible && (
              <div className="bg-accent-soft rounded-[20px] p-4 flex items-center justify-between gap-3" data-testid="handover-pin">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-accent-soft-ink">{t('detail.pinTitle')}</p>
                  <p className="text-xs text-accent-soft-ink mt-1">{t('detail.pinBody')}</p>
                </div>
                <div className="shrink-0 bg-surface border-2 border-accent px-4 py-2 rounded-2xl text-center">
                  <span className="text-xs text-muted block">{t('detail.pinLabel')}</span>
                  <span data-ltr className="text-2xl font-mono font-bold tracking-widest text-ink">{order.delivery.otp}</span>
                </div>
              </div>
            )}

            {/* Where the rider is, while the food is on its way */}
            {liveRider && (
              <div className={card} data-testid="rider-live-tracking">
                <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
                  <h2 className={`${sectionTitle} flex items-center gap-2`}>
                    <span className="inline-flex h-2.5 w-2.5 rounded-full bg-brand animate-pulse" />
                    {t('detail.onItsWay')}
                  </h2>
                  <p className="text-xs text-muted">
                    {typeof liveRider.distanceKm === 'number' && <span className="font-semibold text-ink">{t('detail.kmAway', { km: liveRider.distanceKm.toFixed(1) })}</span>}
                    {liveRider.updatedAt ? <UpdatedAgo iso={liveRider.updatedAt} /> : t('detail.live')}
                  </p>
                </div>
                <RiderLiveMap
                  rider={{ latitude: liveRider.latitude, longitude: liveRider.longitude }}
                  destination={order.delivery?.destination ?? null}
                />
              </div>
            )}

            {/* Items */}
            <section className={card}>
              <h2 className={`${sectionTitle} mb-3`}>{t('detail.orderItems')}</h2>
              <ul className="divide-y divide-line">
                {order.items.map((item) => (
                  <li key={item.id} className="flex gap-3 py-3 first:pt-0 last:pb-0">
                    <CoverImage src={item.productImage} alt="" label={item.productName} size="sm" className="w-14 h-14 rounded-xl overflow-hidden flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-ink">{item.productName}</p>
                      {item.variantName && <p className="text-sm text-muted">{item.variantName}</p>}
                      <p className="text-sm text-muted">{t('detail.qty', { qty: item.quantity, price: formatPrice(item.unitPrice) })}</p>
                      {itemsDiffer && <p className="text-xs text-muted mt-0.5">{statusText(item.status)}</p>}
                    </div>
                    <p className="font-semibold text-ink shrink-0">{formatPrice(item.totalPrice)}</p>
                  </li>
                ))}
              </ul>
            </section>

            {/* Delivery or pickup */}
            <section className={`${card} space-y-3`}>
              <h2 className={sectionTitle}>{pickup ? t('detail.pickupInfo') : t('detail.deliveryInfo')}</h2>
              <div className="flex items-start gap-2.5 text-sm text-ink">
                <MapPin className="w-4 h-4 text-muted mt-0.5 shrink-0" aria-hidden />
                <p>{pickup ? t('detail.pickupFrom', { kitchen: sellerName }) : order.delivery?.address ?? '—'}</p>
              </div>
              {!active && order.delivery?.rider && (
                <div className="flex items-center gap-2.5 text-sm text-ink">
                  <Bike className="w-4 h-4 text-muted shrink-0" aria-hidden />
                  <p>
                    {t('detail.riderLine', { name: order.delivery.rider.name || t('detail.yourRider') })}
                    {order.delivery.rider.vehicle && <span className="text-muted"> · {order.delivery.rider.vehicle}</span>}
                  </p>
                </div>
              )}
            </section>

            {/* Timeline */}
            {(order.timeline ?? []).length > 0 && (
              <details className={`${card} group`}>
                <summary className="flex items-center justify-between gap-3 min-h-11 -my-2 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                  <h2 className={sectionTitle}>{t('detail.timeline')}</h2>
                  <ChevronDown className="w-4 h-4 text-muted transition-transform group-open:rotate-180" aria-hidden />
                </summary>
                <ol className="space-y-3 mt-3">
                  {order.timeline.map((event, index) => (
                    <li key={index} className="flex items-start gap-3">
                      <span className="w-2.5 h-2.5 rounded-full bg-brand mt-1.5 ring-4 ring-brand/20 flex-shrink-0" />
                      <div>
                        <p className="font-medium text-ink">{statusText(event.status ?? '')}</p>
                        <p className="text-sm text-muted">{formatDateTime(event.timestamp)}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </details>
            )}
          </div>

          {/* Payment and the things to do with the order */}
          <div className="lg:col-span-1 space-y-4 lg:sticky lg:top-[calc(5rem+var(--safe-top))]">
            <section className={card} data-testid="payment-card">
              <h2 className={`${sectionTitle} mb-1`}>{t('detail.summary')}</h2>
              <p className="text-sm text-muted mb-3" data-testid="pay-line">{payLine}</p>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between text-muted">
                  <dt>{tc('subtotal')}</dt>
                  <dd>{formatPrice(order.pricing?.subtotal ?? 0)}</dd>
                </div>
                {!pickup && (
                  <div className="flex justify-between text-muted">
                    <dt>{t('detail.deliveryFee')}</dt>
                    <dd>{order.pricing?.deliveryFee ? formatPrice(order.pricing.deliveryFee) : tc('free')}</dd>
                  </div>
                )}
                {(order.pricing?.discount ?? 0) > 0 && (
                  <div className="flex justify-between text-brand-ink font-medium">
                    <dt>{tc('discount')}</dt>
                    <dd><bdi dir="ltr">-{formatPrice(order.pricing?.discount ?? 0)}</bdi></dd>
                  </div>
                )}
                <div className="flex justify-between text-muted">
                  <dt>{tco('salesTax5')}</dt>
                  <dd>{formatPrice(order.pricing?.tax ?? 0)}</dd>
                </div>
                <div className="flex justify-between font-bold text-lg text-ink border-t border-line pt-3 mt-1">
                  <dt>{tc('total')}</dt>
                  <dd>{formatPrice(order.pricing?.total ?? 0)}</dd>
                </div>
              </dl>
            </section>

            {delivered && (
              <section className={`${card} space-y-2`}>
                {reviewed || order.hasReview ? (
                  <p className="text-sm text-muted flex items-center gap-2" data-testid="reviewed-note">
                    <Star className="w-4 h-4 fill-accent text-accent" aria-hidden />
                    {t('detail.reviewedNote')}
                  </p>
                ) : (
                  <Button className="w-full min-h-11" onClick={() => setShowReviewModal(true)} data-testid="rate-order">
                    <Star className="w-4 h-4" aria-hidden />
                    {t('detail.rateExperience')}
                  </Button>
                )}
                <Link href={`/support?orderId=${order.id}&category=quality`} className="block">
                  <Button variant="outline" className="w-full min-h-11">
                    <LifeBuoy className="w-4 h-4" aria-hidden />
                    {t('detail.getHelp')}
                  </Button>
                </Link>
                {reported ? (
                  <p className="text-sm text-muted text-center">{t('detail.reportedNote')}</p>
                ) : (
                  <Button variant="ghost" className="w-full min-h-11 text-red-700 hover:bg-red-50" onClick={() => setShowReportModal(true)}>
                    {t('detail.didntReceive')}
                  </Button>
                )}
              </section>
            )}

            <section className={`${card} flex items-center justify-between gap-2`}>
              <p className="text-sm font-medium text-ink">{t('detail.receipt')}</p>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setShowReceiptPreview(true)}
                  className="min-h-11 px-3 rounded-xl text-sm font-semibold text-brand-ink hover:bg-brand-soft inline-flex items-center gap-1.5"
                >
                  <Receipt className="w-4 h-4" aria-hidden />
                  {t('detail.viewReceipt')}
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  aria-label={t('detail.printReceipt')}
                  title={t('detail.printReceipt')}
                  className="w-11 h-11 rounded-xl text-ink hover:bg-raised inline-flex items-center justify-center"
                >
                  <Printer className="w-4 h-4" aria-hidden />
                </button>
              </div>
            </section>

            {canCancel && (
              <Button
                variant="outline"
                className="w-full min-h-11 text-red-700 border-red-200 hover:bg-red-50"
                onClick={() => setShowCancelModal(true)}
              >
                {t('detail.cancelOrder')}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Report Non-Receipt Modal */}
      {showReportModal && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) { setShowReportModal(false); setReportDetails(''); } }}
        >
          <div role="dialog" aria-modal="true" aria-labelledby="report-title" className="bg-surface rounded-2xl shadow-2xl w-full max-w-md p-5 space-y-4">
            <h2 id="report-title" className="text-lg font-semibold text-ink">{t('detail.reportTitle')}</h2>
            <p className="text-sm text-muted">{t('detail.reportBody')}</p>
            <textarea
              value={reportDetails}
              onChange={(e) => setReportDetails(e.target.value)}
              rows={4}
              placeholder={t('detail.reportPlaceholder')}
              className="w-full px-3 py-2 border border-line-strong rounded-xl text-sm bg-surface text-ink focus:ring-2 focus:ring-brand/30 focus:border-brand outline-none"
            />
            <div className="flex gap-3">
              <Button className="flex-1" onClick={handleReportNonReceipt} disabled={reporting || !reportDetails.trim()}>
                {reporting ? t('detail.submitting') : t('detail.submitReport')}
              </Button>
              <Button variant="outline" className="flex-1" onClick={() => { setShowReportModal(false); setReportDetails(''); }}>
                {tc('cancel')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Order Modal */}
      {showCancelModal && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) closeCancelModal(); }}
        >
          <div role="dialog" aria-modal="true" aria-labelledby="cancel-title" className="bg-surface rounded-2xl shadow-2xl w-full max-w-md p-5 space-y-4" data-testid="cancel-dialog">
            <div>
              <h2 id="cancel-title" className="text-lg font-semibold text-ink">{t('detail.cancelTitle', { number: order.orderNumber })}</h2>
              <p className="text-sm text-muted mt-1">{t('detail.cancelBody')}</p>
            </div>
            <div role="radiogroup" aria-label={t('detail.cancelReason')} className="flex flex-wrap gap-2">
              {CANCEL_CHOICES.map((choice) => (
                <button
                  key={choice}
                  type="button"
                  role="radio"
                  aria-checked={cancelChoice === choice}
                  onClick={() => setCancelChoice(choice)}
                  className={`min-h-11 px-4 rounded-full border text-sm font-medium transition-colors ${
                    cancelChoice === choice ? 'border-brand bg-brand-soft text-brand-soft-ink' : 'border-line text-ink hover:border-line-strong'
                  }`}
                >
                  {t(`detail.cancelChoice.${choice}`)}
                </button>
              ))}
            </div>
            {cancelChoice === 'other' && (
              <div>
                <label htmlFor="cancel-reason" className="block text-sm font-medium text-ink mb-1">{t('detail.cancelReason')}</label>
                <textarea
                  id="cancel-reason"
                  className="w-full border border-line-strong rounded-xl px-3 py-2 text-sm text-ink bg-surface focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand resize-none"
                  rows={3}
                  placeholder={t('detail.cancelPlaceholder')}
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  aria-describedby="cancel-reason-hint"
                />
                <p id="cancel-reason-hint" className="text-xs text-muted mt-1">{t('detail.cancelReasonHint', { count: MIN_CANCEL_REASON })}</p>
              </div>
            )}
            <div className="flex gap-3">
              <Button variant="destructive" className="flex-1" onClick={handleCancelOrder} disabled={!cancelReasonValid || cancelling} data-testid="confirm-cancel">
                {cancelling ? t('detail.cancelling') : t('detail.yesCancel')}
              </Button>
              <Button variant="outline" className="flex-1" onClick={closeCancelModal}>
                {t('detail.keepOrder')}
              </Button>
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
        onReviewed={() => setReviewed(true)}
      />

      {/* Official Professional Printable Tax Invoice & Receipt (Displayed cleanly on window.print()) */}
      <div id="printable-order-receipt" className="hidden print:block font-sans text-ink bg-surface p-6 max-w-3xl mx-auto">
        {/* Receipt Header */}
        <div className="flex items-start justify-between border-b-2 border-ink pb-4 mb-5">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Mark size={28} />
              <span className="text-2xl font-bold text-ink">Nuray</span>
            </div>
            <p className="text-xs text-muted">{t('receipt.network')}</p>
          </div>
          <div className="text-end">
            <h2 className="text-xl font-bold text-ink">{t('receipt.heading')}</h2>
            <p className="text-xs font-mono font-bold text-ink">{t('receipt.orderNumber', { number: order.orderNumber })}</p>
            <p className="text-[11px] text-muted mt-0.5">{t('receipt.date', { date: formatDate(order.createdAt || new Date().toISOString()) })}</p>
          </div>
        </div>

        {/* Kitchen & Customer Credentials */}
        <div className="grid grid-cols-2 gap-6 border-b border-line pb-4 mb-5 text-xs">
          <div>
            <span className="text-xs font-medium text-muted block mb-1">
              {t('receipt.preparedBy')}
            </span>
            <h4 className="font-bold text-sm text-ink">{sellerName}</h4>
          </div>

          <div>
            <span className="text-xs font-medium text-muted block mb-1">
              {t(pickup ? 'receipt.billedToPickup' : 'receipt.billedTo')}
            </span>
            <h4 className="font-bold text-sm text-ink">{customerName}</h4>
            {order.customerPhone && <p data-ltr className="text-muted font-mono text-[11px]">{order.customerPhone}</p>}
            {!pickup && <p className="text-muted text-[11px] leading-relaxed mt-0.5">{order.delivery.address}</p>}
          </div>
        </div>

        {/* Itemized Portion Table */}
        <div className="mb-5">
          <table className="w-full text-start text-xs border-collapse">
            <thead>
              <tr className="border-b-2 border-ink text-xs text-muted">
                <th className="py-2 pe-2 font-semibold">#</th>
                <th className="py-2 px-2 font-semibold">{t('receipt.colItem')}</th>
                <th className="py-2 px-2 font-semibold text-center">{t('receipt.colQty')}</th>
                <th className="py-2 px-2 font-semibold text-end">{t('receipt.colUnitPrice')}</th>
                <th className="py-2 ps-2 font-semibold text-end">{t('receipt.colAmount')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {order.items.map((item, idx) => (
                <tr key={item.id} className="text-ink">
                  <td className="py-2.5 pe-2 font-bold text-muted">{idx + 1}</td>
                  <td className="py-2.5 px-2 font-semibold">
                    <span className="font-bold text-ink block">{item.productName}</span>
                    {item.variantName && (
                      <span className="text-[11px] text-muted font-medium">{item.variantName}</span>
                    )}
                  </td>
                  <td className="py-2.5 px-2 text-center font-bold">{item.quantity}</td>
                  <td className="py-2.5 px-2 text-end font-mono">{formatPrice(item.unitPrice)}</td>
                  <td className="py-2.5 ps-2 text-end font-mono font-bold text-ink">
                    {formatPrice(item.totalPrice)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Payment Summary & Financial Totals */}
        <div className="grid grid-cols-2 gap-6 border-t-2 border-ink pt-4 mb-6 text-xs">
          {/* Payment Method Statement */}
          <div className="space-y-2">
            <span className="text-xs font-medium text-muted block">
              {t('receipt.paymentDetails')}
            </span>
            <div className="bg-raised p-3.5 rounded-xl border border-line space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-bold text-ink">{t('receipt.paymentChannel')}</span>
                <span className="font-extrabold text-ink">
                  {paymentChannelLabel(t, order.paymentMethod, order.paymentSenderAccount)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-bold text-ink">{t('receipt.verificationStatus')}</span>
                <span className="font-extrabold text-brand-soft-ink">
                  {paymentStatusLabel(t, order.paymentMethod, order.paymentStatus)}
                </span>
              </div>
              {order.paymentReferenceNumber && (
                <div className="flex items-center justify-between text-[11px] pt-1 border-t border-line">
                  <span className="text-muted">{t('receipt.reference')}</span>
                  <span data-ltr className="font-mono font-bold text-ink">{order.paymentReferenceNumber}</span>
                </div>
              )}
              {order.paymentProofUrl && (
                <div className="pt-2 border-t border-line flex items-center gap-2">
                  <span className="text-[11px] text-brand-soft-ink font-bold">
                    {t('receipt.proofArchived')}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Pricing Totals */}
          <div className="space-y-1.5 text-end font-medium">
            <div className="flex justify-between">
              <span className="text-muted">{t('receipt.subtotal')}</span>
              <span className="font-mono text-ink">{formatPrice(order.pricing.subtotal)}</span>
            </div>
            {!pickup && (
              <div className="flex justify-between">
                <span className="text-muted">{t('receipt.communityDelivery')}</span>
                <span className="font-mono text-ink">{order.pricing.deliveryFee ? formatPrice(order.pricing.deliveryFee) : tc('free')}</span>
              </div>
            )}
            {order.pricing.tax > 0 && (
              <div className="flex justify-between">
                <span className="text-muted">{t('receipt.salesTax')}</span>
                <span className="font-mono text-ink">{formatPrice(order.pricing.tax)}</span>
              </div>
            )}
            {order.pricing.discount > 0 && (
              <div className="flex justify-between text-brand-soft-ink font-bold">
                <span>{t('receipt.promoDiscount')}</span>
                <bdi dir="ltr" className="font-mono">-{formatPrice(order.pricing.discount)}</bdi>
              </div>
            )}
            <div className="flex justify-between border-t-2 border-line-strong pt-2 text-base font-bold text-ink">
              <span>{t('receipt.grandTotalPkr')}</span>
              <span className="text-brand-soft-ink font-mono">{formatPrice(order.pricing.total)}</span>
            </div>
          </div>
        </div>

        {/* Footer & Watermark */}
        <div className="border-t border-line pt-4 text-center text-[11px] text-muted space-y-1">
          <p className="font-semibold text-ink">{t('receipt.thanks')}</p>
          <p>{t('receipt.support')}</p>
          <p className="text-[11px] text-muted">{t('receipt.computerGenerated')}</p>
        </div>
      </div>

      {/* Interactive Receipt Preview Modal */}
      {showReceiptPreview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-4 animate-in fade-in duration-200"
          onClick={(e) => { if (e.target === e.currentTarget) setShowReceiptPreview(false); }}
        >
          <div role="dialog" aria-modal="true" aria-labelledby="receipt-title" className="relative w-full max-w-2xl bg-surface rounded-3xl shadow-2xl border border-line overflow-hidden flex flex-col max-h-[92vh]">
            <div className="px-4 py-3 flex items-center justify-between gap-2 border-b border-line">
              <h3 id="receipt-title" className="font-semibold text-ink">{t('receipt.preview')}</h3>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  onClick={() => {
                    setShowReceiptPreview(false);
                    setTimeout(() => window.print(), 150);
                  }}
                >
                  <Printer className="w-4 h-4" aria-hidden />
                  {t('receipt.printNow')}
                </Button>
                <button
                  type="button"
                  onClick={() => setShowReceiptPreview(false)}
                  aria-label={t('detail.closeAria')}
                  className="w-11 h-11 rounded-full bg-raised hover:bg-line text-ink flex items-center justify-center transition-colors"
                >
                  <X className="w-5 h-5" aria-hidden />
                </button>
              </div>
            </div>

            <div className="p-3 sm:p-6 overflow-y-auto bg-raised/50">
              <div className="bg-surface p-4 sm:p-6 rounded-2xl border border-line space-y-5">
                {/* Header */}
                <div className="flex items-start justify-between border-b-2 border-ink pb-4">
                  <div>
                    <span className="flex items-center gap-2">
                      <Mark size={24} />
                      <span className="text-xl font-bold text-ink">Nuray</span>
                    </span>
                    <span className="text-xs text-muted">{t('receipt.kitchenInvoice')}</span>
                  </div>
                  <div className="text-end">
                    <span className="font-mono font-bold text-sm text-ink block"><span data-ltr>#{order.orderNumber}</span></span>
                    <span className="text-[11px] text-muted">{formatDate(order.createdAt || new Date().toISOString())}</span>
                  </div>
                </div>

                {/* Details */}
                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div>
                    <span className="text-xs text-muted block">{t('receipt.soldBy')}</span>
                    <span className="font-semibold text-ink block">{sellerName}</span>
                  </div>
                  <div>
                    <span className="text-xs text-muted block">{t(pickup ? 'receipt.collectedBy' : 'receipt.deliveredTo')}</span>
                    <span className="font-semibold text-ink block">{customerName}</span>
                    {!pickup && <span className="text-muted text-xs">{order.delivery.address}</span>}
                  </div>
                </div>

                {/* Line Items */}
                <div className="border border-line rounded-xl overflow-hidden divide-y divide-line text-xs">
                  {order.items.map((it, idx) => (
                    <div key={idx} className="p-2.5 flex items-center justify-between">
                      <span className="font-semibold text-ink">{it.quantity} × {it.productName}</span>
                      <span className="font-mono font-bold text-ink">{formatPrice(it.totalPrice)}</span>
                    </div>
                  ))}
                </div>

                {/* Summary */}
                <div className="bg-raised p-4 rounded-xl border border-line space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="font-bold text-ink">{t('receipt.paymentChannel')}</span>
                    <span className="font-extrabold text-ink">
                      {paymentChannelLabel(t, order.paymentMethod, order.paymentSenderAccount)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-bold text-ink">{t('receipt.paymentStatus')}</span>
                    <span className="font-extrabold text-brand-soft-ink">
                      {paymentStatusLabel(t, order.paymentMethod, order.paymentStatus)}
                    </span>
                  </div>
                  {order.paymentProofUrl && (
                    <div className="pt-2 border-t border-line flex items-center gap-3">
                      <div className="w-12 h-12 rounded-lg border border-line overflow-hidden flex-shrink-0">
                        <img src={order.paymentProofUrl} alt={t('receipt.proofAlt')} className="w-full h-full object-cover" />
                      </div>
                      <span className="text-[11px] text-brand-soft-ink font-bold">
                        {t('receipt.proofByCustomer')}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between border-t border-line pt-2 text-sm font-bold text-ink">
                    <span>{t('receipt.grandTotal')}</span>
                    <span className="text-brand-soft-ink font-mono">{formatPrice(order.pricing.total)}</span>
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

