'use client';

import { Suspense, useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { orderService } from '@/lib/services/order.service';
import { formatPrice, formatDateTime, formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useAuthStore } from '@/lib/store/auth-store';
import { useSocket } from '@/lib/hooks/use-socket';
import { DashboardLayout, CUSTOMER_SIDEBAR_ITEMS } from '@/components/layout/DashboardShell';
import WriteReviewForm from '@/components/products/WriteReviewForm';
import { apiClient } from '@/lib/api-client';
import ManualPaymentCard from '@/components/orders/ManualPaymentCard';
import OrderChatModal from '@/components/orders/OrderChatModal';
import TriPartiteReviewModal from '@/components/orders/TriPartiteReviewModal';

function playCancelSound() {
  if (typeof window === 'undefined') return;
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
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
  };
  timeline: Array<{
    status: string;
    timestamp: string;
  }>;
}

/** Map backend order (Prisma shape) to OrderDetail for the UI */
function mapOrderToDetail(raw: any): OrderDetail {
  const addr = raw.deliveryAddress;
  const addressStr = addr
    ? [addr.addressLine1, addr.addressLine2, addr.area, addr.city].filter(Boolean).join(', ')
    : (raw.deliveryAddressSnapshot as any)?.address || '—';
  const slotDate = raw.deliverySlotDate
    ? new Date(raw.deliverySlotDate).toISOString().slice(0, 10)
    : undefined;
  const sellerName =
    raw.items?.[0]?.seller?.businessName ||
    raw.items?.[0]?.sellerName ||
    raw.seller?.businessName ||
    'Home Kitchen';
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
    customerName: raw.customer?.profile?.fullName || raw.deliveryAddress?.contactName || 'Valued Customer',
    customerPhone: raw.customer?.phone || raw.deliveryAddress?.contactPhone || '',
    createdAt: raw.createdAt ? new Date(raw.createdAt).toISOString() : new Date().toISOString(),
    sellerName,
    items: (raw.items ?? []).map((i: any) => ({
      id: i.id,
      productId: i.productId ?? i.product?.id,
      productName: i.productName ?? i.product?.name ?? '—',
      variantName: i.variantName ?? undefined,
      productImage: i.productImage ?? i.product?.images?.[0]?.url,
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
      otp: raw.delivery?.deliveryOtp ?? undefined,
      arrivedAtCustomer: raw.delivery?.arrivedAtCustomer ?? undefined,
      rider:
        raw.delivery?.rider ?
          {
            name: (raw.delivery.rider as any).user?.profile?.fullName ?? (raw.delivery.rider as any).name ?? 'Rider',
            phone: (raw.delivery.rider as any).user?.phone ?? (raw.delivery.rider as any).phone ?? '',
            vehicle: [(raw.delivery.rider as any).vehicleType, (raw.delivery.rider as any).vehicleNumber].filter(Boolean).join(' - '),
          }
        : undefined,
    },
    timeline: (raw.statusHistory ?? []).map((h: any) => ({
      status: h.status ?? 'pending',
      timestamp: typeof h.createdAt === 'string' ? h.createdAt : new Date(h.createdAt).toISOString(),
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
  const { joinOrderRoom, leaveOrderRoom, onOrderStatusUpdate, onDeliveryTracking } = useSocket();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [trackingData, setTrackingData] = useState<any>(null);
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

  useEffect(() => {
    const token = apiClient.getAccessToken();
    if (!token && !isAuthenticated) {
      router.push('/login');
      return;
    }
    if (params.id) {
      loadOrder();
      joinOrderRoom(params.id as string);

      // Set up real-time listeners
      const unsubscribeStatus = onOrderStatusUpdate((data: any) => {
        // Instantly update the status badge
        setOrder((prev) =>
          prev ? { ...prev, status: data.status, orderStatus: data.status } : null
        );
        if (data.status === 'cancelled') {
          // Reload full order so timeline, canCancel, etc. are all in sync
          loadOrder();
          showToast('Your order has been cancelled.', 'error', 10000);
          playCancelSound();
        }
      });

      const unsubscribeTracking = onDeliveryTracking((data) => {
        setTrackingData(data);
      });

      return () => {
        leaveOrderRoom(params.id as string);
        unsubscribeStatus?.();
        unsubscribeTracking?.();
      };
    }
  }, [params.id, isAuthenticated]);

  useEffect(() => {
    if (searchParams.get('placed') === '1') setShowPlacedBanner(true);
  }, [searchParams]);

  const loadOrder = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const response = await orderService.getOrderDetails(params.id as string);
      const raw = (response as any)?.data ?? response;
      setOrder(mapOrderToDetail(raw));
    } catch (error) {
      console.error('Failed to load order:', error);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  // Automated live polling loop (every 3 seconds) for real-time status updates across portals
  useEffect(() => {
    if (!isAuthenticated || !params.id) return;
    const interval = setInterval(() => {
      setOrder((current) => {
        if (!current) return current;
        const terminal = ['delivered', 'completed', 'cancelled', 'refunded', 'delivery_failed'];
        const status = current.status || current.orderStatus || '';
        if (!terminal.includes(status)) {
          loadOrder(true);
        }
        return current;
      });
    }, 3000);
    return () => clearInterval(interval);
  }, [isAuthenticated, params.id]);

  const handleCancelOrder = async () => {
    if (!cancelReason.trim()) return;
    try {
      setCancelling(true);
      await orderService.cancelOrder(params.id as string, cancelReason.trim());
      setShowCancelModal(false);
      setCancelReason('');
      loadOrder();
      showToast('Order cancelled successfully', 'success');
    } catch (error: any) {
      showToast(error.response?.data?.error?.message || 'Failed to cancel order', 'error');
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
      showToast("Report submitted — our support team will look into it.", 'success');
    } catch (error: any) {
      showToast(error.response?.data?.error?.message || 'Failed to submit report', 'error');
    } finally {
      setReporting(false);
    }
  };

  const customerSidebarItems = CUSTOMER_SIDEBAR_ITEMS;

  if (loading) {
    return (
      <DashboardLayout
        title="Order details"
        subtitle="Loading..."
        sidebarItems={customerSidebarItems}
        userType="customer"
      >
        <div className="flex items-center justify-center py-16">
          <p className="text-gray-600">Loading order...</p>
        </div>
      </DashboardLayout>
    );
  }

  if (!order) {
    return (
      <DashboardLayout
        title="Order Not Found"
        subtitle=""
        sidebarItems={customerSidebarItems}
        userType="customer"
      >
        <div className="max-w-xl mx-auto py-16 px-4 text-center">
          <div className="w-16 h-16 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center mx-auto mb-4 text-2xl shadow-xs">
            📦
          </div>
          <h1 className="text-2xl font-black text-gray-900 mb-2">Order Not Found</h1>
          <p className="text-sm text-gray-500 mb-6 leading-relaxed">
            The requested order could not be found or you do not have permission to view it.
          </p>
          <div className="flex items-center justify-center gap-3">
            <Link href="/orders">
              <Button>Back to My Orders</Button>
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
  const canCancel = orderStatus === 'pending';

  return (
    <DashboardLayout
      title={`Order ${order.orderNumber}`}
      subtitle={`${effectiveStatus.replace(/_/g, ' ')} • Payment: ${(order.paymentStatus ?? 'pending').replace(/_/g, ' ')}`}
      sidebarItems={customerSidebarItems}
      userType="customer"
    >
      <div className="print-hide space-y-6">
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
                <p className="font-semibold text-lg">Order confirmed!</p>
                <p className="text-white/90 text-sm">Thank you for your order. We&apos;ve sent the details to the seller.</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => { setShowPlacedBanner(false); router.replace(`/orders/${params.id}`, { scroll: false }); }}
              className="text-sm font-medium text-white/90 hover:text-white underline"
            >
              Dismiss
            </button>
          </div>
        )}

      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2 flex-wrap">
          <Link href="/orders">
            <Button variant="outline" size="sm">Back to Orders</Button>
          </Link>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 text-xs font-black transition-all shadow-xs active:scale-95"
            title="Print / Save PDF Receipt"
          >
            <span>🖨️</span>
            <span>Print Receipt</span>
          </button>
          <button
            onClick={() => setShowReceiptPreview(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-extrabold transition-all active:scale-95"
            title="Preview formal receipt invoice"
          >
            <span>🧾</span>
            <span>View Receipt</span>
          </button>
          <button
            onClick={() => setShowChatModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#0C1016] hover:bg-slate-800 text-white text-xs font-black transition-all shadow-xs"
          >
            <span>💬</span>
            <span>Chat with {order.sellerName || 'Kitchen'}</span>
          </button>
          {(effectiveStatus === 'delivered' || effectiveStatus === 'completed') && (
            <button
              onClick={() => setShowReviewModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#FF5500] hover:bg-[#e04400] text-white text-xs font-black transition-all shadow-xs"
            >
              <span>⭐</span>
              <span>Rate Experience</span>
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
              {effectiveStatus.replace(/_/g, ' ').toUpperCase()}
            </span>
            <span
              className={`px-3 py-1 rounded-full text-sm font-medium ${
                order.paymentStatus === 'paid'
                  ? 'bg-green-100 text-green-800'
                  : order.paymentStatus === 'refunded'
                  ? 'bg-blue-100 text-blue-800'
                  : 'bg-gray-100 text-gray-800'
              }`}
            >
              Payment: {(order.paymentStatus ?? 'pending').toUpperCase()}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Order Items */}
          <div className="lg:col-span-2 space-y-4">
            {/* Direct Manual Payment Card */}
            {order.paymentStatus !== 'paid' && (
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
              <h2 className="text-xl font-bold text-gray-900 mb-4">Order Items</h2>
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
                          No Image
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
                            Qty: {item.quantity} × {formatPrice(item.unitPrice)}
                          </p>
                          <p className="font-semibold text-gray-900">
                            {formatPrice(item.totalPrice)}
                          </p>
                        </div>
                        <span className="text-sm text-gray-600 capitalize">{item.status}</span>
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
              <h2 className="text-xl font-bold text-gray-900">Delivery Information</h2>

              {/* Doorstep Handover PIN Card */}
              {order.delivery?.otp && effectiveStatus !== 'delivered' && effectiveStatus !== 'completed' && effectiveStatus !== 'cancelled' && (
                <div className="bg-gradient-to-r from-amber-50 to-orange-50 border-2 border-amber-500/50 rounded-xl p-4 shadow-sm">
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="inline-flex h-2.5 w-2.5 rounded-full bg-amber-500 animate-pulse" />
                        <span className="text-xs uppercase font-bold tracking-wider text-amber-950">Doorstep Handover PIN</span>
                      </div>
                      <p className="text-xs text-amber-800 mt-1 max-w-sm">
                        Provide this 4-digit verification code to your rider only after physically receiving and inspecting your package.
                      </p>
                    </div>
                    <div className="bg-white border-2 border-amber-500 px-5 py-2 rounded-xl text-center shadow-inner">
                      <span className="text-[10px] uppercase font-bold text-muted-foreground block">Confirmation PIN</span>
                      <span className="text-3xl font-mono font-black tracking-widest text-amber-600">{order.delivery.otp}</span>
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-2 text-gray-700">
                <p>
                  <span className="font-semibold">Address:</span> {order.delivery?.address ?? '—'}
                </p>
                {order.delivery?.slotDate && (
                  <p>
                    <span className="font-semibold">Slot:</span> {order.delivery.slotDate} (
                    {order.delivery.slotTime})
                  </p>
                )}
                {order.delivery?.estimatedAt && (
                  <p>
                    <span className="font-semibold">Estimated Delivery:</span>{' '}
                    {formatDateTime(order.delivery.estimatedAt)}
                  </p>
                )}
                {order.delivery?.rider && (
                  <div className="mt-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
                    <p className="font-semibold mb-2 text-gray-900">Assigned Rider</p>
                    <p className="text-sm"><span className="text-muted-foreground">Name:</span> {order.delivery.rider.name}</p>
                    {order.delivery.rider.phone && (
                      <p className="text-sm"><span className="text-muted-foreground">Phone:</span> {order.delivery.rider.phone}</p>
                    )}
                    {order.delivery.rider.vehicle && (
                      <p className="text-sm"><span className="text-muted-foreground">Vehicle:</span> {order.delivery.rider.vehicle}</p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Real-time Tracking */}
            {trackingData && (
              <div className="bg-white rounded-lg shadow-sm p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-4">Live Tracking</h2>
                {trackingData.location && (
                  <div className="space-y-2">
                    <p>
                      <span className="font-semibold">Distance:</span>{' '}
                      {trackingData.distanceKm?.toFixed(1)} km
                    </p>
                    {trackingData.estimatedArrival && (
                      <p>
                        <span className="font-semibold">ETA:</span>{' '}
                        {formatDateTime(trackingData.estimatedArrival)}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Timeline */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Order Timeline</h2>
              <div className="space-y-3">
                {(order.timeline ?? []).map((event, index) => (
                  <div key={index} className="flex items-start gap-3">
                    <div className="w-2 h-2 rounded-full bg-green-600 mt-2"></div>
                    <div>
                      <p className="font-semibold capitalize">{(event.status ?? '').replace(/_/g, ' ')}</p>
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
              <h2 className="text-xl font-bold text-gray-900 mb-4">Order Summary</h2>
              <div className="space-y-2 mb-4">
                <div className="flex justify-between text-gray-600">
                  <span>Subtotal</span>
                  <span>{formatPrice(order.pricing?.subtotal ?? 0)}</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>Delivery Fee</span>
                  <span>{formatPrice(order.pricing?.deliveryFee ?? 0)}</span>
                </div>
                {(order.pricing?.discount ?? 0) > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>Discount</span>
                    <span>-{formatPrice(order.pricing?.discount ?? 0)}</span>
                  </div>
                )}
                <div className="flex justify-between text-gray-600">
                  <span>GST (5%)</span>
                  <span>{formatPrice(order.pricing?.tax ?? 0)}</span>
                </div>
                <div className="border-t pt-2 mt-2">
                  <div className="flex justify-between font-bold text-lg">
                    <span>Total</span>
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
                  Cancel Order
                </Button>
              )}
              {(effectiveStatus === 'delivered' || effectiveStatus === 'completed') && (
                reported ? (
                  <p className="text-sm text-gray-500 text-center mt-2">
                    Report submitted — our support team is on it.
                  </p>
                ) : (
                  <Button
                    variant="outline"
                    className="w-full mt-2 border-red-200 text-red-600 hover:bg-red-50"
                    onClick={() => setShowReportModal(true)}
                  >
                    I didn't receive this order
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
              <h2 className="text-white font-bold text-lg">Report a problem</h2>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-gray-600">
                This order is marked delivered, but if you never actually received it, tell us what happened and our support team will follow up.
              </p>
              <textarea
                value={reportDetails}
                onChange={(e) => setReportDetails(e.target.value)}
                rows={4}
                placeholder="e.g., I never received this order, or it was left at the wrong address..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500"
              />
              <div className="flex items-center gap-3">
                <Button
                  variant="destructive"
                  onClick={handleReportNonReceipt}
                  disabled={reporting || !reportDetails.trim()}
                >
                  {reporting ? 'Submitting...' : 'Submit Report'}
                </Button>
                <button
                  onClick={() => { setShowReportModal(false); setReportDetails(''); }}
                  className="text-sm text-gray-500 hover:text-gray-700"
                >
                  Cancel
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
                <h2 className="text-white font-bold text-lg">Cancel Order</h2>
              </div>
              <button onClick={() => { setShowCancelModal(false); setCancelReason(''); }} className="text-white/70 hover:text-white">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            {/* Body */}
            <div className="px-6 py-5">
              <p className="text-gray-600 text-sm mb-4">
                Are you sure you want to cancel order <strong>#{order.orderNumber}</strong>? This action cannot be undone.
              </p>
              <label className="block text-sm font-medium text-gray-700 mb-1">Reason for cancellation <span className="text-red-500">*</span></label>
              <textarea
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-red-400 resize-none"
                rows={3}
                placeholder="e.g. Changed my mind, ordered by mistake..."
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
              />
              <div className="flex gap-3 mt-4">
                <button
                  onClick={handleCancelOrder}
                  disabled={!cancelReason.trim() || cancelling}
                  className="flex-1 bg-red-500 hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-xl text-sm transition-all active:scale-95"
                >
                  {cancelling ? 'Cancelling...' : 'Yes, Cancel Order'}
                </button>
                <button
                  onClick={() => { setShowCancelModal(false); setCancelReason(''); }}
                  className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-2.5 rounded-xl text-sm transition-all active:scale-95"
                >
                  Keep Order
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
        sellerName={order.sellerName || order.items[0]?.sellerName || 'Home Kitchen'}
        customerName={order.customerName || 'Customer'}
        currentRole={user?.userType === 'seller' ? 'seller' : 'customer'}
        isOpen={showChatModal}
        onClose={() => setShowChatModal(false)}
      />

      {/* Tri-Partite Review Modal */}
      <TriPartiteReviewModal
        orderId={order.id}
        orderNumber={order.orderNumber}
        sellerName={order.sellerName || order.items[0]?.sellerName || 'Home Kitchen'}
        riderName={order.delivery?.rider?.name || 'Delivery Partner'}
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
              <span className="text-[10px] font-black bg-emerald-100 text-emerald-900 px-2 py-0.5 rounded-full uppercase">Verified Kitchen</span>
            </div>
            <p className="text-xs text-slate-600">Pakistan&apos;s Domestic Food Delivery Network • Karachi, PK</p>
            <p className="text-[11px] text-slate-500 font-medium">Official Tax Invoice &amp; Customer Order Receipt</p>
          </div>
          <div className="text-right">
            <h2 className="text-xl font-black text-slate-900 tracking-tight">RECEIPT / INVOICE</h2>
            <p className="text-xs font-mono font-bold text-slate-700">Order #{order.orderNumber}</p>
            <p className="text-[11px] text-slate-500 mt-0.5">Date: {formatDate(order.createdAt || new Date().toISOString())}</p>
          </div>
        </div>

        {/* Kitchen & Customer Credentials */}
        <div className="grid grid-cols-2 gap-6 border-b border-slate-200 pb-4 mb-5 text-xs">
          <div>
            <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider block mb-1">
              Prepared &amp; Sold By
            </span>
            <h4 className="font-extrabold text-sm text-slate-900">{order.sellerName || 'Verified Home Kitchen'}</h4>
            <p className="text-slate-600">Certified Domestic Home Chef</p>
            <p className="text-slate-500 text-[11px]">Karachi Community Cluster, Pakistan</p>
          </div>

          <div>
            <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider block mb-1">
              Billed &amp; Delivered To
            </span>
            <h4 className="font-extrabold text-sm text-slate-900">{order.customerName || 'Valued Customer'}</h4>
            {order.customerPhone && <p className="text-slate-600 font-mono text-[11px]">{order.customerPhone}</p>}
            <p className="text-slate-600 text-[11px] leading-relaxed mt-0.5">{order.delivery.address}</p>
          </div>
        </div>

        {/* Itemized Portion Table */}
        <div className="mb-5">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b-2 border-slate-800 text-[11px] uppercase tracking-wider text-slate-600">
                <th className="py-2 pr-2 font-black">#</th>
                <th className="py-2 px-2 font-black">Item Description / Portion</th>
                <th className="py-2 px-2 font-black text-center">Qty</th>
                <th className="py-2 px-2 font-black text-right">Unit Price</th>
                <th className="py-2 pl-2 font-black text-right">Amount (PKR)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {order.items.map((item, idx) => (
                <tr key={item.id} className="text-slate-800">
                  <td className="py-2.5 pr-2 font-bold text-slate-400">{idx + 1}</td>
                  <td className="py-2.5 px-2 font-semibold">
                    <span className="font-bold text-slate-900 block">{item.productName}</span>
                    {item.variantName && (
                      <span className="text-[10px] text-slate-500 font-medium">{item.variantName}</span>
                    )}
                  </td>
                  <td className="py-2.5 px-2 text-center font-bold">{item.quantity}</td>
                  <td className="py-2.5 px-2 text-right font-mono">{formatPrice(item.unitPrice)}</td>
                  <td className="py-2.5 pl-2 text-right font-mono font-bold text-slate-900">
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
            <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider block">
              Payment &amp; Settlement Details
            </span>
            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-700">Payment Channel:</span>
                <span className="font-extrabold text-slate-900">
                  {order.paymentSenderAccount || (
                    order.paymentMethod?.toLowerCase().includes('jazz')
                      ? 'JazzCash Mobile Wallet'
                      : order.paymentMethod?.toLowerCase().includes('easy')
                      ? 'EasyPaisa Mobile Wallet'
                      : order.paymentMethod?.toLowerCase().includes('bank') || order.paymentMethod?.toLowerCase().includes('alfalah')
                      ? 'Bank Alfalah / Raast IBFT'
                      : order.paymentMethod?.toUpperCase() || 'Direct Kitchen Transfer'
                  )}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-700">Verification Status:</span>
                <span className="font-extrabold text-emerald-700">
                  {order.paymentStatus === 'paid'
                    ? '✓ PAID & VERIFIED BY KITCHEN'
                    : order.paymentStatus === 'payment_submitted'
                    ? '✓ PROOF SUBMITTED (PENDING VERIFICATION)'
                    : 'PENDING'}
                </span>
              </div>
              {order.paymentReferenceNumber && (
                <div className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-200">
                  <span className="text-slate-500">Reference:</span>
                  <span className="font-mono font-bold text-slate-800">{order.paymentReferenceNumber}</span>
                </div>
              )}
              {order.paymentProofUrl && (
                <div className="pt-2 border-t border-slate-200 flex items-center gap-2">
                  <span className="text-xs">🧾</span>
                  <span className="text-[10px] text-emerald-800 font-bold">
                    Payment proof screenshot attached &amp; archived on platform
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Pricing Totals */}
          <div className="space-y-1.5 text-right font-medium">
            <div className="flex justify-between">
              <span className="text-slate-500">Subtotal:</span>
              <span className="font-mono text-slate-800">{formatPrice(order.pricing.subtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Community Delivery:</span>
              <span className="font-mono text-slate-800">{formatPrice(order.pricing.deliveryFee)}</span>
            </div>
            {order.pricing.tax > 0 && (
              <div className="flex justify-between">
                <span className="text-slate-500">Sales Tax (GST):</span>
                <span className="font-mono text-slate-800">{formatPrice(order.pricing.tax)}</span>
              </div>
            )}
            {order.pricing.discount > 0 && (
              <div className="flex justify-between text-emerald-600 font-bold">
                <span>Promotional Discount:</span>
                <span className="font-mono">-{formatPrice(order.pricing.discount)}</span>
              </div>
            )}
            <div className="flex justify-between border-t-2 border-slate-300 pt-2 text-base font-black text-slate-950">
              <span>Grand Total (PKR):</span>
              <span className="text-emerald-700 font-mono">{formatPrice(order.pricing.total)}</span>
            </div>
          </div>
        </div>

        {/* Footer & Watermark */}
        <div className="border-t border-slate-200 pt-4 text-center text-[10px] text-slate-500 space-y-1">
          <p className="font-extrabold text-slate-700">Thank you for supporting domestic home kitchens across Karachi!</p>
          <p>For order queries or delivery assistance, WhatsApp: +92 300 0000000 • Email: support@nurayfood.pk</p>
          <p className="text-[9px] text-slate-400">Computer-generated receipt issued by Nuray Food &amp; Frost platform. No physical signature required.</p>
        </div>
      </div>

      {/* Interactive Receipt Preview Modal */}
      {showReceiptPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
            <div className="px-6 py-4 bg-[#0C1016] text-white flex items-center justify-between border-b border-slate-800">
              <div className="flex items-center gap-2">
                <span className="text-xl">🧾</span>
                <h3 className="font-black text-sm">Receipt Preview</h3>
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
                  <span>Print Now</span>
                </button>
                <button
                  onClick={() => setShowReceiptPreview(false)}
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
                    <span className="text-[11px] text-slate-500 font-medium">Domestic Kitchen Tax Invoice &amp; Receipt</span>
                  </div>
                  <div className="text-right">
                    <span className="font-mono font-bold text-sm text-slate-900 block">#{order.orderNumber}</span>
                    <span className="text-[11px] text-slate-400">{formatDate(order.createdAt || new Date().toISOString())}</span>
                  </div>
                </div>

                {/* Details */}
                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Sold By</span>
                    <span className="font-bold text-slate-900 block">{order.sellerName || 'Verified Home Kitchen'}</span>
                    <span className="text-slate-500 text-[11px]">Karachi Community Kitchen</span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Delivered To</span>
                    <span className="font-bold text-slate-900 block">{order.customerName || 'Valued Customer'}</span>
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
                    <span className="font-bold text-slate-700">Payment Channel:</span>
                    <span className="font-extrabold text-slate-900">
                      {order.paymentSenderAccount || (
                        order.paymentMethod?.toLowerCase().includes('jazz')
                          ? 'JazzCash Mobile Wallet'
                          : order.paymentMethod?.toLowerCase().includes('easy')
                          ? 'EasyPaisa Mobile Wallet'
                          : order.paymentMethod?.toLowerCase().includes('bank') || order.paymentMethod?.toLowerCase().includes('alfalah')
                          ? 'Bank Alfalah / Raast IBFT'
                          : order.paymentMethod?.toUpperCase() || 'Direct Transfer'
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-bold text-slate-700">Payment Status:</span>
                    <span className="font-extrabold text-emerald-700">
                      {order.paymentStatus === 'paid' ? '✓ PAID & VERIFIED' : 'PENDING / SUBMITTED'}
                    </span>
                  </div>
                  {order.paymentProofUrl && (
                    <div className="pt-2 border-t border-slate-200 flex items-center gap-3">
                      <div className="w-12 h-12 rounded-lg border border-slate-200 overflow-hidden flex-shrink-0">
                        <img src={order.paymentProofUrl} alt="Receipt proof" className="w-full h-full object-cover" />
                      </div>
                      <span className="text-[11px] text-emerald-800 font-bold">
                        Proof screenshot attached by customer
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between border-t border-slate-200 pt-2 text-sm font-black text-slate-950">
                    <span>Grand Total:</span>
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

