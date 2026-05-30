'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/store/auth-store';
import { useSocket } from '@/lib/hooks/use-socket';
import { formatPrice } from '@/lib/utils';

interface NewOrderData {
  orderId: string;
  orderNumber: string;
  totalAmount: number;
  items?: { productName: string; quantity: number }[];
  createdAt: string;
}

/**
 * Shopify-style "cha-ching" cash register sound using Web Audio API.
 * "Cha" = metallic noise burst, "Ching" = sustained bright bell ring.
 */
function playNewOrderSound() {
  if (typeof window === 'undefined') return;
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const t = ctx.currentTime;

    const go = () => {
      // --- "CHA" — metallic noise burst ---
      const bufferSize = Math.floor(ctx.sampleRate * 0.12);
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 6);
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      const bandpass = ctx.createBiquadFilter();
      bandpass.type = 'bandpass';
      bandpass.frequency.value = 5500;
      bandpass.Q.value = 0.6;
      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.55, t);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.10);
      noise.connect(bandpass);
      bandpass.connect(noiseGain);
      noiseGain.connect(ctx.destination);
      noise.start(t);
      noise.stop(t + 0.12);

      // --- "CHING" — bright bell ring with overtone ---
      const bell = (freq: number, start: number, dur: number, vol: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(vol, t + start);
        gain.gain.setTargetAtTime(0.001, t + start + 0.05, dur * 0.28);
        osc.start(t + start);
        osc.stop(t + start + dur + 0.1);
      };

      bell(1760, 0.07, 0.9, 0.40);   // A6  — fundamental
      bell(2637, 0.07, 0.7, 0.22);   // E7  — bright overtone
      bell(3520, 0.07, 0.45, 0.10);  // A7  — sparkle
    };

    if (ctx.state === 'suspended') {
      ctx.resume().then(go).catch(() => {});
    } else {
      go();
    }
  } catch {
    // silently fail
  }
}

export function SellerNewOrderNotification() {
  const { user } = useAuthStore();
  const { onNewOrder } = useSocket();
  const router = useRouter();
  const [notifications, setNotifications] = useState<(NewOrderData & { id: string })[]>([]);
  const isSeller = user?.userType === 'seller' || user?.user_type === 'seller';
  const mountedRef = useRef(false);

  const dismiss = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  useEffect(() => {
    if (!isSeller || !onNewOrder) return;
    mountedRef.current = true;

    const unsubscribe = onNewOrder((data) => {
      if (!mountedRef.current) return;
      playNewOrderSound();
      const notif = { ...data, id: `${data.orderId}-${Date.now()}` };
      setNotifications((prev) => [...prev, notif]);
      // Auto-dismiss after 60 seconds
      setTimeout(() => {
        if (mountedRef.current) dismiss(notif.id);
      }, 60_000);
    });

    return () => {
      mountedRef.current = false;
      unsubscribe?.();
    };
  }, [isSeller, onNewOrder, dismiss]);

  if (!isSeller || notifications.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-3 pointer-events-none">
      {notifications.map((n) => (
        <div
          key={n.id}
          className="pointer-events-auto w-[360px] bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden"
          style={{ animation: 'slideInRight 0.35s cubic-bezier(0.34,1.56,0.64,1)' }}
        >
          {/* Green header bar */}
          <div className="bg-gradient-to-r from-emerald-500 to-emerald-600 px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-white"></span>
              </span>
              <span className="text-white font-bold text-sm tracking-wide uppercase">New Order!</span>
            </div>
            <button
              onClick={() => dismiss(n.id)}
              className="text-white/70 hover:text-white transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Body */}
          <div className="px-4 py-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-400 text-xs font-medium uppercase tracking-wider">Order</span>
              <span className="text-gray-900 font-bold text-sm">#{n.orderNumber}</span>
            </div>

            <div className="flex items-center justify-between mb-3">
              <span className="text-gray-400 text-xs font-medium uppercase tracking-wider">Total</span>
              <span className="text-emerald-600 font-extrabold text-xl">
                {typeof n.totalAmount === 'number' ? formatPrice(n.totalAmount) : String(n.totalAmount ?? '')}
              </span>
            </div>

            {n.items && n.items.length > 0 && (
              <div className="mb-3 bg-gray-50 rounded-xl px-3 py-2 space-y-1">
                {n.items.slice(0, 3).map((item, i) => (
                  <div key={i} className="flex items-center justify-between text-xs text-gray-600">
                    <span className="truncate max-w-[200px]">{item.productName}</span>
                    <span className="font-semibold ml-2 shrink-0">× {item.quantity}</span>
                  </div>
                ))}
                {n.items.length > 3 && (
                  <p className="text-xs text-gray-400 pt-0.5">+{n.items.length - 3} more items</p>
                )}
              </div>
            )}

            <div className="flex gap-2 mt-1">
              <button
                onClick={() => { router.push('/sellers/orders'); dismiss(n.id); }}
                className="flex-1 bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-white text-sm font-semibold py-2 rounded-xl transition-all"
              >
                View Order
              </button>
              <button
                onClick={() => dismiss(n.id)}
                className="px-4 bg-gray-100 hover:bg-gray-200 active:scale-95 text-gray-600 text-sm font-medium py-2 rounded-xl transition-all"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      ))}

      <style>{`
        @keyframes slideInRight {
          from { opacity: 0; transform: translateX(110%); }
          to   { opacity: 1; transform: translateX(0);    }
        }
      `}</style>
    </div>
  );
}
