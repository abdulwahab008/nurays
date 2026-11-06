'use client';

import { useEffect, useRef, useState, useCallback, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthStore } from '@/lib/store/auth-store';
import { useSocket } from '@/lib/hooks/use-socket';
import { apiClient, apiErrorMessage } from '@/lib/api-client';
import { formatPrice, formatTime } from '@/lib/utils';
import { useToast } from '@/components/ui/toast';
import { useT } from '@/lib/i18n';
import { kitchenOrderMessages } from '@/lib/i18n/messages/kitchen-orders';
import { newAudioContext } from '@/lib/audio';
import { Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RejectOrderDialog } from '@/components/sellers/RejectOrderDialog';
import { OrderNo } from '@/components/sellers/order-timing';
import {
  isNewOrderSeen,
  isNowTabOpen,
  newOrderAlertSlot,
  newOrderAlertVersion,
  subscribeNewOrderAlert,
} from '@/components/sellers/new-order-alert';
import { useShallow } from 'zustand/react/shallow';

interface NewOrderData {
  orderId: string;
  orderNumber: string;
  /** The whole order, as the customer pays it (other kitchens' dishes, tax and delivery included). */
  totalAmount: number;
  /** This kitchen's dishes in the order, and what it keeps of them, when known. */
  dishesTotal?: number;
  kitchenEarns?: number;
  items?: { productName: string; quantity: number; totalPrice?: number }[];
  createdAt: string;
}

/** What the kitchen's own dishes come to: the live event lists them with their prices, the orders list adds them up. */
function dishesTotalOf(order: NewOrderData): number {
  if (typeof order.dishesTotal === 'number') return order.dishesTotal;
  const items = order.items ?? [];
  if (items.length > 0 && items.every((i) => typeof i.totalPrice === 'number')) {
    return items.reduce((sum, i) => sum + (i.totalPrice ?? 0), 0);
  }
  return order.totalAmount;
}

const WAITING_STATUSES = ['pending', 'confirmed'];

/** Whether the order still waits for this kitchen; false once it was accepted, rejected or cancelled, on any device. */
async function stillWaiting(orderId: string): Promise<boolean> {
  try {
    const res = await apiClient.get<{ data: { orderStatus: string; items: { status: string }[] } }>(`/seller/orders/${orderId}`);
    const order = res.data.data;
    return WAITING_STATUSES.includes(order.orderStatus) && order.items.some((i) => i.status !== 'cancelled');
  } catch {
    // Unknown (offline, or the server is slow): keep ringing rather than miss an order.
    return true;
  }
}

/** What the kitchen keeps of the order, worked out as its orders list does: the live event leaves it out. */
async function kitchenEarningsOf(orderId: string): Promise<number | null> {
  try {
    const res = await apiClient.get<{ data: { sellerTotals?: { payout: number; deliveryFeeKept: number; deliveryFeePaid?: number } } }>(
      `/seller/orders/${orderId}`
    );
    const totals = res.data.data.sellerTotals;
    return totals ? totals.payout + totals.deliveryFeeKept - (totals.deliveryFeePaid ?? 0) : null;
  } catch {
    return null;
  }
}

/**
 * Cash register & bell sound using Web Audio API.
 * "Cha" = metallic noise burst, "Ching" = sustained bright bell chime.
 */
function playNewOrderSound() {
  if (typeof window === 'undefined') return;
  try {
    const ctx = newAudioContext();
    if (!ctx) return;
    const t = ctx.currentTime;

    const go = () => {
      // Metallic noise burst
      const bufferSize = Math.floor(ctx.sampleRate * 0.10);
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 6);
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      const bandpass = ctx.createBiquadFilter();
      bandpass.type = 'bandpass';
      bandpass.frequency.value = 5200;
      bandpass.Q.value = 0.6;
      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.5, t);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
      noise.connect(bandpass);
      bandpass.connect(noiseGain);
      noiseGain.connect(ctx.destination);
      noise.start(t);
      noise.stop(t + 0.10);

      // Bright sustained bell chime
      const bell = (freq: number, start: number, dur: number, vol: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(vol, t + start);
        gain.gain.setTargetAtTime(0.001, t + start + 0.05, dur * 0.35);
        osc.start(t + start);
        osc.stop(t + start + dur + 0.15);
      };

      bell(1760, 0.06, 1.2, 0.45); // A6
      bell(2637, 0.06, 0.9, 0.25); // E7
      bell(3520, 0.06, 0.6, 0.15); // A7
    };

    if (ctx.state === 'suspended') {
      ctx.resume().then(go).catch(() => {});
    } else {
      go();
    }
  } catch {
    // Silently handle if audio permissions blocked
  }
}

export function SellerNewOrderNotification() {
  const { user } = useAuthStore(useShallow((s) => ({ user: s.user })));
  const { onNewOrder, onOrderStatusUpdate } = useSocket();
  const router = useRouter();
  const pathname = usePathname();
  const { showToast } = useToast();
  const t = useT(kitchenOrderMessages);

  // Exactly ONE active incoming order popup at a time.
  const [activeOrder, setActiveOrder] = useState<NewOrderData | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  // The reasons dialog is open for the alert's order: the bell waits while the kitchen chooses.
  const [rejecting, setRejecting] = useState(false);

  // Track resolved orders so we never re-alert or re-popup an order already handled
  const handledOrderIdsRef = useRef<Set<string>>(new Set());
  const chimeTimerRef = useRef<NodeJS.Timeout | null>(null);
  const activeOrderIdRef = useRef<string | null>(null);
  useEffect(() => {
    activeOrderIdRef.current = activeOrder?.orderId ?? null;
  }, [activeOrder?.orderId]);

  // What the kitchen's screens say they show (components/sellers/new-order-alert.tsx), read again whenever it changes.
  const alertVersion = useSyncExternalStore(subscribeNewOrderAlert, newOrderAlertVersion, () => 0);
  const slot = useSyncExternalStore(subscribeNewOrderAlert, newOrderAlertSlot, () => null);

  const isSeller = user?.userType === 'seller' || user?.user_type === 'seller';
  const isSellerPage = pathname?.startsWith('/sellers');

  // Immediately stop sound interval and clear popup
  const stopChimeAndClose = useCallback((orderId?: string) => {
    if (chimeTimerRef.current) {
      clearInterval(chimeTimerRef.current);
      chimeTimerRef.current = null;
    }
    if (orderId) {
      handledOrderIdsRef.current.add(orderId);
    }
    setActiveOrder(null);
  }, []);

  // If user leaves seller studio, stop ringing and dismiss immediately
  useEffect(() => {
    if (!isSeller || !isSellerPage) {
      stopChimeAndClose();
    }
  }, [isSeller, isSellerPage, stopChimeAndClose]);

  // Real-time socket listener: ONLY triggers on a real incoming order
  useEffect(() => {
    if (!isSeller || !isSellerPage || !onNewOrder) return;

    const unsubscribe = onNewOrder((data) => {
      if (!pathname?.startsWith('/sellers')) return;

      // Ignore if order was already accepted, rejected, or dismissed
      if (handledOrderIdsRef.current.has(data.orderId)) return;

      // If this exact order is already active, don't re-trigger
      if (activeOrderIdRef.current === data.orderId) return;
      activeOrderIdRef.current = data.orderId;
      playNewOrderSound();
      setActiveOrder(data);
      void kitchenEarningsOf(data.orderId).then((kitchenEarns) => {
        if (kitchenEarns === null) return;
        setActiveOrder((current) => (current?.orderId === data.orderId ? { ...current, kitchenEarns } : current));
      });
    });

    return () => {
      unsubscribe?.();
    };
  }, [isSeller, isSellerPage, onNewOrder, pathname]);

  // An order may already be waiting when the kitchen opens the app (from a push notification,
  // after a refresh, or a dropped connection): show it too, not only orders arriving live.
  const checkedWaitingRef = useRef(false);
  useEffect(() => {
    if (!isSeller || !isSellerPage || checkedWaitingRef.current) return;
    checkedWaitingRef.current = true;
    type Waiting = {
      order: { id: string; orderNumber: string; totalAmount: number; dishesTotal?: number; kitchenEarns?: number; createdAt: string; orderStatus: string; paymentMethod: string; paymentStatus: string };
      items: { product: { name: string } | null; quantity: number; totalPrice: number }[];
    };
    apiClient
      .get<{ data: { orders: Waiting[] } }>('/seller/orders', { params: { status: 'pending', limit: 5 } })
      .then((res) => {
        if (isNowTabOpen()) return;
        const waiting = (res.data?.data?.orders ?? []).find(
          (o) =>
            !handledOrderIdsRef.current.has(o.order.id) &&
            !isNewOrderSeen(o.order.id) &&
            o.order.orderStatus === 'pending' &&
            // An online checkout not paid yet isn't the kitchen's to accept.
            !(o.order.paymentMethod === 'online' && o.order.paymentStatus !== 'paid')
        );
        if (!waiting) return;
        setActiveOrder((current) =>
          current ?? {
            orderId: waiting.order.id,
            orderNumber: waiting.order.orderNumber,
            totalAmount: waiting.order.totalAmount,
            dishesTotal: waiting.order.dishesTotal,
            kitchenEarns: waiting.order.kitchenEarns,
            createdAt: waiting.order.createdAt,
            items: waiting.items.map((i) => ({ productName: i.product?.name ?? '', quantity: i.quantity, totalPrice: i.totalPrice })),
          }
        );
        playNewOrderSound();
      })
      .catch(() => {
        // The orders page still lists it.
      });
  }, [isSeller, isSellerPage]);

  // 10-Second Repeating Bell Audio Loop:
  // Rings every 10 seconds while the order card is showing, UNLESS the chef accepts or rejects it!
  useEffect(() => {
    if (!isSeller || !isSellerPage || !activeOrder || rejecting) {
      if (chimeTimerRef.current) {
        clearInterval(chimeTimerRef.current);
        chimeTimerRef.current = null;
      }
      return;
    }

    // The order may have been accepted or rejected on the kitchen's other device while this one missed the live update.
    const orderId = activeOrder.orderId;
    chimeTimerRef.current = setInterval(() => {
      if (isNowTabOpen() || isNewOrderSeen(orderId)) {
        stopChimeAndClose(orderId);
        return;
      }
      void stillWaiting(orderId).then((waiting) => {
        if (activeOrderIdRef.current !== orderId) return;
        if (waiting) playNewOrderSound();
        else stopChimeAndClose(orderId);
      });
    }, 10_000);

    return () => {
      if (chimeTimerRef.current) {
        clearInterval(chimeTimerRef.current);
        chimeTimerRef.current = null;
      }
    };
  }, [activeOrder?.orderId, isSeller, isSellerPage, rejecting, stopChimeAndClose]);

  useEffect(() => {
    if (!isSeller || !onOrderStatusUpdate) return;
    return onOrderStatusUpdate(({ orderId, status }) => {
      if (WAITING_STATUSES.includes(status)) return;
      handledOrderIdsRef.current.add(orderId);
      if (activeOrderIdRef.current === orderId) stopChimeAndClose(orderId);
    });
  }, [isSeller, onOrderStatusUpdate, stopChimeAndClose]);

  // Listen for order status updates from the kitchen orders page
  // If an order is accepted or rejected in the orders list, close the alert immediately
  useEffect(() => {
    const handleStatusChanged = (e: Event) => {
      const orderId = (e as CustomEvent<{ orderId?: string }>).detail?.orderId;
      if (orderId) {
        handledOrderIdsRef.current.add(orderId);
        if (activeOrder?.orderId === orderId) {
          stopChimeAndClose(orderId);
        }
      }
    };

    window.addEventListener('seller-order-status-changed', handleStatusChanged);
    return () => {
      window.removeEventListener('seller-order-status-changed', handleStatusChanged);
    };
  }, [activeOrder, stopChimeAndClose]);

  // The orders list's Now tab shows every new order with Accept and Reject: the kitchen has seen them, so the bell stops
  // there rather than ringing on over the orders it is reading.
  useEffect(() => {
    const orderId = activeOrderIdRef.current;
    if (orderId && (isNowTabOpen() || isNewOrderSeen(orderId))) stopChimeAndClose(orderId);
  }, [alertVersion, activeOrder?.orderId, stopChimeAndClose]);

  useEffect(() => {
    if (activeOrder && pathname === `/sellers/orders/${activeOrder.orderId}`) stopChimeAndClose(activeOrder.orderId);
  }, [activeOrder, pathname, stopChimeAndClose]);

  // 1-Click Accept: stops bell immediately and begins kitchen preparation
  const handleQuickAccept = async () => {
    if (!activeOrder) return;
    setIsProcessing(true);
    const orderId = activeOrder.orderId;
    const orderNumber = activeOrder.orderNumber;

    // Stop bell chime right away
    stopChimeAndClose(orderId);

    try {
      const res = await apiClient.post<{ success: boolean; data: { estimatedReadyAt?: string } }>(`/seller/orders/${orderId}/accept`);
      // Without a new ready time the order had already been accepted, on the kitchen's other device: that one said so.
      if (res.data?.success && res.data.data?.estimatedReadyAt) {
        showToast(
          t('alert.acceptedReadyBy', { number: `\u2066#${orderNumber}\u2069`, time: formatTime(res.data.data.estimatedReadyAt) }),
          'success'
        );
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('seller-orders-updated'));
          window.dispatchEvent(new CustomEvent('seller-order-status-changed', { detail: { orderId, status: 'accepted' } }));
        }
      }
    } catch (err) {
      showToast(apiErrorMessage(err, t('acceptFailed')), 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDismiss = () => {
    if (activeOrder) {
      stopChimeAndClose(activeOrder.orderId);
    }
  };

  // Never render for customers or outside /sellers routes or when no active order
  if (!isSeller || !isSellerPage || !activeOrder) return null;
  // The orders list shows the order with Accept and Reject on its Now tab, and a "new orders" banner on the others.
  if (pathname === '/sellers/orders') return null;

  // The slim bar: on the dashboard and another order's page (which list the order themselves) it sits in the page's flow;
  // on a phone page with a Save or Add bar fixed at the bottom (marked data-bottom-bar) it is pinned under the header,
  // so neither the form nor the bar is covered while the order waits.
  const slimBar = (className: string) => (
    <div
      role="alert"
      className={`flex items-center gap-2 rounded-2xl border border-line bg-accent-soft ps-4 pe-1 text-accent-soft-ink ${className}`}
    >
      <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-accent-soft-ink" aria-hidden="true" />
      <p className="flex min-w-0 flex-1 items-baseline gap-1 text-sm">
        <span className="min-w-0 truncate font-semibold">{t('alert.incoming')}</span>
        <span className="shrink-0">
          <OrderNo number={activeOrder.orderNumber} />
        </span>
      </p>
      <button
        type="button"
        onClick={() => router.push(`/sellers/orders/${activeOrder.orderId}`)}
        className="inline-flex min-h-11 shrink-0 items-center rounded-lg px-2 text-sm font-semibold underline underline-offset-2 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand/40"
      >
        {t('alert.viewInOrders')}
      </button>
      <button
        type="button"
        onClick={handleDismiss}
        aria-label={t('alert.dismissAlert')}
        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-surface/60 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand/40"
      >
        <X className="h-5 w-5" aria-hidden="true" />
      </button>
    </div>
  );

  if (slot) return createPortal(slimBar('mb-5'), slot);

  const dishesTotal = dishesTotalOf(activeOrder);

  return (
    <>
      <div className="fixed inset-x-3 top-[calc(var(--header-offset)+0.5rem)] z-[9999] hidden max-sm:[body:has([data-bottom-bar])_&]:block">
        {slimBar('shadow-[var(--shadow-card)]')}
      </div>
      <div className="fixed inset-x-3 bottom-[calc(0.75rem+var(--safe-bottom,0px))] z-[9999] pointer-events-none max-sm:[body:has([data-bottom-bar])_&]:hidden sm:inset-x-auto sm:bottom-auto sm:top-[calc(4.5rem+var(--safe-top,0px))] sm:end-[calc(1rem+var(--safe-end,0px))]">
        <section
          id={`seller-alert-order-${activeOrder.orderId}`}
          role="alertdialog"
          aria-labelledby="seller-alert-title"
          aria-describedby="seller-alert-rings"
          className="pointer-events-auto w-full sm:w-[380px] max-h-[calc(100dvh-6rem)] overflow-y-auto rounded-[20px] border border-line bg-surface text-ink shadow-[var(--shadow-card)] motion-safe:animate-[sellerAlertIn_0.25s_ease-out]"
        >
          <header className="flex items-center justify-between gap-3 bg-accent-soft px-4 py-2">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="relative flex h-2.5 w-2.5 shrink-0" aria-hidden="true">
                <span className="absolute inline-flex h-full w-full rounded-full bg-accent-soft-ink opacity-60 motion-safe:animate-ping" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-accent-soft-ink" />
              </span>
              <div className="min-w-0">
                <h2 id="seller-alert-title" className="text-sm font-semibold text-accent-soft-ink">{t('alert.incoming')}</h2>
                <p id="seller-alert-rings" className="text-xs text-accent-soft-ink">{t('alert.rings')}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleDismiss}
              aria-label={t('alert.dismissAlert')}
              className="-me-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-accent-soft-ink hover:bg-surface/60 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand/40"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </header>

          <div className="space-y-3 p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm text-muted">{t('alert.ticket')}</p>
                <p className="break-all text-base font-semibold text-ink" data-ltr>#{activeOrder.orderNumber}</p>
              </div>
              <div className="shrink-0 text-end">
                <p className="text-sm text-muted">{t('list.dishesTotal')}</p>
                <p className="text-2xl font-semibold text-ink tabular-nums">{formatPrice(dishesTotal)}</p>
                {typeof activeOrder.kitchenEarns === 'number' && (
                  <p className="text-sm text-muted tabular-nums">{t('list.youEarn', { amount: formatPrice(activeOrder.kitchenEarns) })}</p>
                )}
              </div>
            </div>

            {activeOrder.items && activeOrder.items.length > 0 && (
              <ul className="max-h-28 space-y-1 overflow-y-auto border-t border-line pt-3">
                {activeOrder.items.map((item, i) => (
                  <li key={i} className="flex items-baseline gap-2 text-[15px] text-ink">
                    <span className="font-semibold tabular-nums">{item.quantity} ×</span>
                    <bdi className="min-w-0 truncate">{item.productName}</bdi>
                  </li>
                ))}
              </ul>
            )}

            <div className="flex items-center gap-2 pt-1">
              <Button
                id={`alert-accept-btn-${activeOrder.orderId}`}
                onClick={handleQuickAccept}
                disabled={isProcessing}
                className="min-h-11 flex-1 px-4"
              >
                {isProcessing && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                {t('list.acceptStart')}
              </Button>
              <Button
                id={`alert-reject-btn-${activeOrder.orderId}`}
                variant="outline"
                onClick={() => setRejecting(true)}
                disabled={isProcessing}
                className="min-h-11 px-4 text-red-700 hover:bg-red-50"
              >
                {t('reject')}
              </Button>
            </div>
            <Button
              variant="ghost"
              onClick={() => {
                router.push(`/sellers/orders/${activeOrder.orderId}`);
                handleDismiss();
              }}
              className="min-h-11 w-full"
            >
              {t('alert.viewInOrders')}
            </Button>
          </div>
        </section>

        {rejecting && (
          <div className="pointer-events-auto">
            <RejectOrderDialog
              orderId={activeOrder.orderId}
              orderNumber={activeOrder.orderNumber}
              onClose={() => setRejecting(false)}
              onRejected={() => stopChimeAndClose(activeOrder.orderId)}
            />
          </div>
        )}

        <style>{`
          @keyframes sellerAlertIn {
            from { opacity: 0; transform: translateY(12px); }
            to   { opacity: 1; transform: translateY(0); }
          }
        `}</style>
      </div>
    </>
  );
}
