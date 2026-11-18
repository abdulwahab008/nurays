'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/store/auth-store';
import { useSocket } from '@/lib/hooks/use-socket';
import { useT } from '@/lib/i18n';
import { commonMessages, statusKey } from '@/lib/i18n/messages/common';
import { ordersMessages } from '@/lib/i18n/messages/orders';
import { newAudioContext } from '@/lib/audio';
import { useShallow } from 'zustand/react/shallow';

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
    const ctx = newAudioContext();
    if (!ctx) return;
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

// labelKey: the toast's heading, from ordersMessages.
const STATUS_LABEL: Record<string, keyof typeof ordersMessages.en> = {
  confirmed: 'notif.confirmed',
  preparing: 'notif.preparing',
  ready: 'notif.ready',
  dispatched: 'notif.dispatched',
  delivered: 'notif.delivered',
};

// Only notify customers about these positive status changes
const NOTIFY_STATUSES = new Set(['confirmed', 'preparing', 'ready', 'dispatched', 'delivered']);

export function CustomerOrderNotification() {
  const { user } = useAuthStore(useShallow((s) => ({ user: s.user })));
  const { onOrderItemStatusUpdate } = useSocket();
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const mountedRef = useRef(false);
  const t = useT(ordersMessages);
  const tc = useT(commonMessages);

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
    <div className="fixed top-[calc(1rem+var(--safe-top))] end-[calc(1rem+var(--safe-end))] z-[9998] flex flex-col gap-3 pointer-events-none">
      {notifications.map((n) => {
        const known = STATUS_LABEL[n.status];
        const label = known
          ? t(known)
          : statusKey(n.status) in commonMessages.en
            ? tc(statusKey(n.status))
            : n.status.charAt(0).toUpperCase() + n.status.slice(1);

        return (
          <div
            key={n.id}
            className="pointer-events-auto w-[320px] bg-surface rounded-2xl shadow-[var(--shadow-hover)] border border-line overflow-hidden"
            style={{ animation: 'notifIn 0.3s cubic-bezier(0.22,1,0.36,1)' }}
          >
            <div className="px-4 pt-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-brand" aria-hidden />
                <span className="text-ink font-semibold text-sm">{label}</span>
              </div>
              <button
                onClick={() => dismiss(n.id)}
                aria-label={t('notif.dismiss')}
                className="text-muted hover:text-ink transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Body */}
            <div className="px-4 py-3">
              <p className="text-muted text-xs mb-1">{t('notif.yourOrder')}</p>
              <p className="text-ink font-semibold text-sm mb-3"><span data-ltr>#{n.orderNumber}</span></p>

              <div className="flex gap-2">
                <button
                  onClick={() => { router.push(`/orders/${n.orderId}`); dismiss(n.id); }}
                  className="flex-1 bg-brand hover:bg-brand-500 active:scale-[0.98] text-on-brand text-xs font-semibold py-2 rounded-xl transition-[color,background-color,border-color,opacity,transform]"
                >
                  {t('notif.viewOrder')}
                </button>
                <button
                  onClick={() => dismiss(n.id)}
                  className="px-3 bg-raised hover:bg-line active:scale-[0.98] text-muted text-xs font-medium py-2 rounded-xl transition-[color,background-color,border-color,opacity,transform]"
                >
                  {t('notif.ok')}
                </button>
              </div>
            </div>
          </div>
        );
      })}

      <style>{`
        @keyframes notifIn {
          from { opacity: 0; transform: translateY(-8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
