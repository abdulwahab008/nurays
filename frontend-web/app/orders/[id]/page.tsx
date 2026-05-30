'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { orderService } from '@/lib/services/order.service';
import { formatPrice, formatDateTime } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useAuthStore } from '@/lib/store/auth-store';
import { useSocket } from '@/lib/hooks/use-socket';
import { DashboardLayout } from '@/components/layout/DashboardShell';

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
  items: Array<{
    id: string;
    productName: string;
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
    total: number;
  };
  delivery: {
    type: string;
    address: string;
    slotDate?: string;
    slotTime?: string;
    estimatedAt?: string;
    rider?: {
      name: string;
      phone: string;
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
  return {
    id: raw.id,
    orderNumber: raw.orderNumber ?? '',
    status: raw.orderStatus ?? raw.status,
    orderStatus: raw.orderStatus,
    paymentStatus: raw.paymentStatus ?? 'pending',
    items: (raw.items ?? []).map((i: any) => ({
      id: i.id,
      productName: i.productName ?? i.product?.name ?? '—',
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
      rider:
        raw.delivery?.rider ?
          { name: (raw.delivery.rider as any).name ?? 'Rider', phone: (raw.delivery.rider as any).phone ?? '' }
        : undefined,
    },
    timeline: (raw.statusHistory ?? []).map((h: any) => ({
      status: h.status ?? 'pending',
      timestamp: typeof h.createdAt === 'string' ? h.createdAt : new Date(h.createdAt).toISOString(),
    })),
  };
}

export default function OrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated } = useAuthStore();
  const { showToast } = useToast();
  const { joinOrderRoom, leaveOrderRoom, onOrderStatusUpdate, onDeliveryTracking } = useSocket();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [trackingData, setTrackingData] = useState<any>(null);
  const [showPlacedBanner, setShowPlacedBanner] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
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

  const loadOrder = async () => {
    setLoading(true);
    try {
      const response = await orderService.getOrderDetails(params.id as string);
      const raw = (response as any)?.data ?? response;
      setOrder(mapOrderToDetail(raw));
    } catch (error) {
      console.error('Failed to load order:', error);
    } finally {
      setLoading(false);
    }
  };

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

  const customerSidebarItems = [
    { name: 'Dashboard', href: '/dashboard', icon: '' },
    { name: 'Browse Products', href: '/products', icon: '' },
    { name: 'My Orders', href: '/orders', icon: '' },
    { name: 'My Cart', href: '/cart', icon: '' },
    { name: 'My Profile', href: '/profile', icon: '' },
    { name: 'Addresses', href: '/profile/addresses', icon: '' },
    { name: 'Help & Support', href: '/support', icon: '' },
  ];

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
        title="Order not found"
        subtitle=""
        sidebarItems={customerSidebarItems}
        userType="customer"
      >
        <div className="text-center py-16">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Order not found</h1>
          <Link href="/orders">
            <Button>Back to Orders</Button>
          </Link>
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
      <div className="space-y-6">
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
                <p className="text-green-100 text-sm">Thank you for your order. We&apos;ve sent the details to the seller.</p>
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

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <Link href="/orders">
          <Button variant="outline" size="sm">Back to Orders</Button>
        </Link>
      </div>

      <div>
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Order {order.orderNumber}</h1>
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
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Delivery Information */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Delivery Information</h2>
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
                  <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                    <p className="font-semibold mb-2">Rider Information</p>
                    <p>Name: {order.delivery.rider.name}</p>
                    <p>Phone: {order.delivery.rider.phone}</p>
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
            </div>
          </div>
        </div>
      </div>
    </div>

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
    </DashboardLayout>
  );
}

