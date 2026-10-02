'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthStore } from '@/lib/store/auth-store';
import { useSocket } from '@/lib/hooks/use-socket';
import { apiClient } from '@/lib/api-client';
import { formatPrice } from '@/lib/utils';
import { useToast } from '@/components/ui/toast';
import { useT } from '@/lib/i18n';
import { kitchenOrderMessages } from '@/lib/i18n/messages/kitchen-orders';

interface NewOrderData {
  orderId: string;
  orderNumber: string;
  totalAmount: number;
  items?: { productName: string; quantity: number }[];
  createdAt: string;
}

/**
 * Cash register & bell sound using Web Audio API.
 * "Cha" = metallic noise burst, "Ching" = sustained bright bell chime.
 */
function playNewOrderSound() {
  if (typeof window === 'undefined') return;
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
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
  const { user } = useAuthStore();
  const { onNewOrder } = useSocket();
  const router = useRouter();
  const pathname = usePathname();
  const { showToast } = useToast();
  const t = useT(kitchenOrderMessages);

  // Exactly ONE active incoming order popup at a time.
  const [activeOrder, setActiveOrder] = useState<NewOrderData | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // Track resolved orders so we never re-alert or re-popup an order already handled
  const handledOrderIdsRef = useRef<Set<string>>(new Set());
  const chimeTimerRef = useRef<NodeJS.Timeout | null>(null);

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
      setActiveOrder((current) => {
        if (current && current.orderId === data.orderId) {
          return current;
        }
        // Play bell chime immediately upon arrival of new order
        playNewOrderSound();
        return data;
      });
    });

    return () => {
      unsubscribe?.();
    };
  }, [isSeller, isSellerPage, onNewOrder, pathname]);

  // 10-Second Repeating Bell Audio Loop:
  // Rings every 10 seconds while the order card is showing, UNLESS the chef accepts or rejects it!
  useEffect(() => {
    if (!isSeller || !isSellerPage || !activeOrder) {
      if (chimeTimerRef.current) {
        clearInterval(chimeTimerRef.current);
        chimeTimerRef.current = null;
      }
      return;
    }

    // Set recurring 10-second bell chime
    chimeTimerRef.current = setInterval(() => {
      playNewOrderSound();
    }, 10_000);

    return () => {
      if (chimeTimerRef.current) {
        clearInterval(chimeTimerRef.current);
        chimeTimerRef.current = null;
      }
    };
  }, [activeOrder?.orderId, isSeller, isSellerPage]);

  // Listen for order status updates from the kitchen orders page
  // If an order is accepted or rejected in the orders list, close the alert immediately
  useEffect(() => {
    const handleStatusChanged = (e: any) => {
      const orderId = e.detail?.orderId;
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

  // 1-Click Accept: stops bell immediately and begins kitchen preparation
  const handleQuickAccept = async () => {
    if (!activeOrder) return;
    setIsProcessing(true);
    const orderId = activeOrder.orderId;
    const orderNumber = activeOrder.orderNumber;

    // Stop bell chime right away
    stopChimeAndClose(orderId);

    try {
      const res = await apiClient.post(`/seller/orders/${orderId}/accept`);
      if (res.data?.success) {
        showToast(t('alert.acceptedToast', { number: `\u2066#${orderNumber}\u2069` }), 'success');
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('seller-orders-updated'));
          window.dispatchEvent(new CustomEvent('seller-order-status-changed', { detail: { orderId, status: 'accepted' } }));
        }
      }
    } catch (err: any) {
      showToast(err.response?.data?.error?.message || t('acceptFailed'), 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  // 1-Click Reject: stops bell immediately and declines order
  const handleQuickReject = async () => {
    if (!activeOrder) return;
    setIsProcessing(true);
    const orderId = activeOrder.orderId;
    const orderNumber = activeOrder.orderNumber;

    // Stop bell chime right away
    stopChimeAndClose(orderId);

    try {
      const res = await apiClient.post(`/seller/orders/${orderId}/reject`, {
        reason: 'Too busy / High kitchen load',
      });
      if (res.data?.success) {
        showToast(t('alert.declinedToast', { number: `\u2066#${orderNumber}\u2069` }), 'info');
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('seller-orders-updated'));
          window.dispatchEvent(new CustomEvent('seller-order-status-changed', { detail: { orderId, status: 'rejected' } }));
        }
      }
    } catch (err: any) {
      showToast(err.response?.data?.error?.message || t('rejectFailed'), 'error');
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

  return (
    <div className="fixed top-4 end-4 z-[9999] flex flex-col gap-3 pointer-events-none">
      <div
        id={`seller-alert-order-${activeOrder.orderId}`}
        className="pointer-events-auto w-[380px] bg-white rounded-3xl shadow-2xl border-2 border-emerald-400 overflow-hidden ring-4 ring-emerald-500/10"
        style={{ animation: 'slideInRight 0.35s cubic-bezier(0.34,1.56,0.64,1)' }}
      >
        {/* Pulsing Emerald Header */}
        <div className="bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-600 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="relative flex h-3.5 w-3.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-85"></span>
              <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-white shadow-xs"></span>
            </span>
            <div>
              <span className="text-white font-black text-xs tracking-wider uppercase block">
                {t('alert.incoming')}
              </span>
              <span className="text-[10px] text-emerald-100 font-medium">
                {t('alert.rings')}
              </span>
            </div>
          </div>
          <button
            onClick={handleDismiss}
            className="text-white/80 hover:text-white hover:bg-white/20 p-1 rounded-full transition-colors"
            title={t('alert.dismissAlert')}
            aria-label={t('alert.dismissAlert')}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Card Body */}
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-gray-400 text-[11px] font-bold uppercase tracking-wider block">
                {t('alert.ticket')}
              </span>
              <span className="text-gray-900 font-black text-base" data-ltr>#{activeOrder.orderNumber}</span>
            </div>
            <div className="text-end">
              <span className="text-gray-400 text-[11px] font-bold uppercase tracking-wider block">
                {t('alert.amount')}
              </span>
              <span className="text-emerald-600 font-black text-lg">
                {typeof activeOrder.totalAmount === 'number'
                  ? formatPrice(activeOrder.totalAmount)
                  : String(activeOrder.totalAmount ?? '')}
              </span>
            </div>
          </div>

          {/* Items Preview */}
          {activeOrder.items && activeOrder.items.length > 0 && (
            <div className="bg-gray-50 rounded-2xl p-2.5 space-y-1.5 border border-gray-100 max-h-28 overflow-y-auto">
              {activeOrder.items.map((item, i) => (
                <div key={i} className="flex items-center justify-between text-xs text-gray-700">
                  <span className="truncate max-w-[220px] font-semibold">{item.productName}</span>
                  <span className="font-extrabold text-emerald-700 ms-2 shrink-0 bg-emerald-50 px-2 py-0.5 rounded-md">
                    × {item.quantity}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Action Buttons */}
          <div className="space-y-2 pt-1">
            <div className="flex items-center gap-2">
              <button
                id={`alert-accept-btn-${activeOrder.orderId}`}
                onClick={handleQuickAccept}
                disabled={isProcessing}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-black py-2.5 px-3 rounded-xl transition-all shadow-md flex items-center justify-center gap-1.5"
              >
                {isProcessing ? (
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <span>✓</span>
                )}
                <span>{t('alert.acceptPrepare')}</span>
              </button>

              <button
                id={`alert-reject-btn-${activeOrder.orderId}`}
                onClick={handleQuickReject}
                disabled={isProcessing}
                className="bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 active:scale-95 text-xs font-bold py-2.5 px-3 rounded-xl transition-all"
              >
                {t('reject')}
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  router.push('/sellers/orders');
                  handleDismiss();
                }}
                className="flex-1 bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-700 text-xs font-extrabold py-2 px-3 rounded-xl transition-all text-center"
              >
                {t('alert.viewInOrders')}
              </button>
              <button
                onClick={handleDismiss}
                className="text-gray-400 hover:text-gray-600 text-xs font-medium px-2 py-2"
              >
                {t('alert.dismiss')}
              </button>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes slideInRight {
          from { opacity: 0; transform: translateX(110%); }
          to   { opacity: 1; transform: translateX(0);    }
        }
      `}</style>
    </div>
  );
}
