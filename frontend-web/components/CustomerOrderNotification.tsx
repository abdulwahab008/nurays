'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/store/auth-store';
import { useSocket } from '@/lib/hooks/use-socket';

interface OrderItemUpdate {
  orderItemId: string;
  orderId: string;
  orderNumber: string;
  status: string;
  updatedAt: string;
}

interface Notification extends OrderItemUpdate {
  id: string;
}

/**
 * Light, airy 3-note ascending chime — much softer than the seller cha-ching.
 * Think gentle xylophone / iOS-style notification ping.
 */
function playCustomerNotificationSound() {
  if (typeof window === 'undefined') return;
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const t = ctx.currentTime;

    const tone = (freq: number, start: number, vol: number, decay: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      // Add a light reverb-like effect with a second quieter osc
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, t + start);
      gain.gain.linearRampToValueAtTime(vol, t + start + 0.012);
      gain.gain.setTargetAtTime(0.001, t + start + 0.018, decay);

      // Slight harmonic shimmer at 2× freq, very quiet
      osc2.type = 'sine';
      osc2.frequency.value = freq * 2;
      gain2.gain.setValueAtTime(0, t + start);
      gain2.gain.linearRampToValueAtTime(vol * 0.08, t + start + 0.012);
      gain2.gain.setTargetAtTime(0.001, t + start + 0.018, decay * 0.5);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);

      osc.start(t + start);
      osc.stop(t + start + decay * 4 + 0.05);
      osc2.start(t + start);
      osc2.stop(t + start + decay * 4 + 0.05);
    };

    const go = () => {
      tone(1047, 0.00, 0.13, 0.22); // C6 — warm base note
      tone(1319, 0.10, 0.11, 0.20); // E6 — rising middle
      tone(1568, 0.20, 0.09, 0.18); // G6 — bright top note (completes the triad)
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

const STATUS_CONFIG: Record<string, { label: string; emoji: string; headerClass: string; dotClass: string }> = {
  confirmed: {
    label: 'Order Accepted!',
    emoji: '✓',
    headerClass: 'from-blue-500 to-blue-600',
    dotClass: 'bg-white',
  },
  preparing: {
    label: 'Being Prepared',
    emoji: '🍳',
    headerClass: 'from-amber-500 to-orange-500',
    dotClass: 'bg-white',
  },
  ready: {
    label: 'Ready for Pickup',
    emoji: '✔',
    headerClass: 'from-emerald-500 to-emerald-600',
    dotClass: 'bg-white',
  },
  dispatched: {
    label: 'On the Way!',
    emoji: '🚚',
    headerClass: 'from-violet-500 to-purple-600',
    dotClass: 'bg-white',
  },
  delivered: {
    label: 'Delivered!',
    emoji: '🎉',
    headerClass: 'from-teal-500 to-cyan-600',
    dotClass: 'bg-white',
  },
};

// Only notify customers about these positive status changes
const NOTIFY_STATUSES = new Set(['confirmed', 'preparing', 'ready', 'dispatched', 'delivered']);

export function CustomerOrderNotification() {
  const { user } = useAuthStore();
  const { onOrderItemStatusUpdate } = useSocket();
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const mountedRef = useRef(false);

  const isCustomer = user?.userType === 'customer' || user?.user_type === 'customer';

  const dismiss = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  useEffect(() => {
    if (!isCustomer || !onOrderItemStatusUpdate) return;
    mountedRef.current = true;

    const unsubscribe = onOrderItemStatusUpdate((data) => {
      if (!mountedRef.current) return;
      if (!NOTIFY_STATUSES.has(data.status)) return;

      playCustomerNotificationSound();

      const notif: Notification = { ...data, id: `${data.orderItemId}-${Date.now()}` };
      setNotifications((prev) => [...prev, notif]);

      // Auto-dismiss after 30 seconds
      setTimeout(() => {
        if (mountedRef.current) dismiss(notif.id);
      }, 30_000);
    });

    return () => {
      mountedRef.current = false;
      unsubscribe?.();
    };
  }, [isCustomer, onOrderItemStatusUpdate, dismiss]);

  if (!isCustomer || notifications.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-[9998] flex flex-col gap-3 pointer-events-none">
      {notifications.map((n) => {
        const cfg = STATUS_CONFIG[n.status] || {
          label: n.status.charAt(0).toUpperCase() + n.status.slice(1),
          emoji: '•',
          headerClass: 'from-gray-500 to-gray-600',
          dotClass: 'bg-white',
        };

        return (
          <div
            key={n.id}
            className="pointer-events-auto w-[320px] bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden"
            style={{ animation: 'slideInRight 0.32s cubic-bezier(0.34,1.56,0.64,1)' }}
          >
            {/* Coloured header */}
            <div className={`bg-gradient-to-r ${cfg.headerClass} px-4 py-2.5 flex items-center justify-between`}>
              <div className="flex items-center gap-2">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-70"></span>
                  <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${cfg.dotClass}`}></span>
                </span>
                <span className="text-white font-bold text-sm tracking-wide">{cfg.label}</span>
              </div>
              <button
                onClick={() => dismiss(n.id)}
                className="text-white/70 hover:text-white transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Body */}
            <div className="px-4 py-3">
              <p className="text-gray-500 text-xs mb-1">Your order</p>
              <p className="text-gray-900 font-bold text-sm mb-3">#{n.orderNumber}</p>

              <div className="flex gap-2">
                <button
                  onClick={() => { router.push(`/orders/${n.orderId}`); dismiss(n.id); }}
                  className="flex-1 bg-gray-900 hover:bg-gray-800 active:scale-95 text-white text-xs font-semibold py-2 rounded-xl transition-all"
                >
                  View Order
                </button>
                <button
                  onClick={() => dismiss(n.id)}
                  className="px-3 bg-gray-100 hover:bg-gray-200 active:scale-95 text-gray-500 text-xs font-medium py-2 rounded-xl transition-all"
                >
                  OK
                </button>
              </div>
            </div>
          </div>
        );
      })}

      <style>{`
        @keyframes slideInRight {
          from { opacity: 0; transform: translateX(110%); }
          to   { opacity: 1; transform: translateX(0);    }
        }
      `}</style>
    </div>
  );
}
