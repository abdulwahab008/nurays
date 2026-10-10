'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/store/auth-store';
import { useSocket } from '@/lib/hooks/use-socket';
import { formatPrice } from '@/lib/utils';
import { useT } from '@/lib/i18n';
import { riderMessages } from '@/lib/i18n/messages/rider';
import { riderService } from '@/lib/services/rider.service';

interface JobPopup {
  key: string;
  kind: 'assigned' | 'pool';
  orderNumber?: string;
  pickupAddress?: string;
  deliveryAddress?: string;
  cashToCollect?: number;
  riderFee?: number | null;
  activeJobs?: number;
}

/** A short two-note chime. Silent if the browser blocks audio. */
function chime() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const note = (freq: number, at: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      osc.connect(gain);
      gain.connect(ctx.destination);
      gain.gain.setValueAtTime(0.25, ctx.currentTime + at);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + at + 0.45);
      osc.start(ctx.currentTime + at);
      osc.stop(ctx.currentTime + at + 0.5);
    };
    const go = () => {
      note(880, 0);
      note(1320, 0.22);
    };
    if (ctx.state === 'suspended') ctx.resume().then(go).catch(() => {});
    else go();
  } catch {
    /* audio blocked */
  }
}

/**
 * A rider gets a pop-up the moment a delivery lands on them (assigned automatically), even while
 * they are already carrying another job, and a lighter one when a job nobody took stays open in the pool.
 */
export function RiderNewJobNotification() {
  const { user } = useAuthStore();
  const { subscribe } = useSocket();
  const router = useRouter();
  const t = useT(riderMessages);
  const [popups, setPopups] = useState<JobPopup[]>([]);
  const poolTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const isRider = user?.userType === 'rider' || user?.user_type === 'rider';

  const dismiss = useCallback((key: string) => setPopups((list) => list.filter((p) => p.key !== key)), []);

  const show = useCallback(
    (popup: JobPopup) => {
      setPopups((list) => (list.some((p) => p.key === popup.key) ? list : [popup, ...list].slice(0, 3)));
      chime();
      setTimeout(() => dismiss(popup.key), popup.kind === 'assigned' ? 30_000 : 12_000);
    },
    [dismiss]
  );

  useEffect(() => {
    if (!isRider) return;
    const timers = poolTimers.current;
    const offs = [
      // Given to this rider.
      subscribe('delivery:offered', (d) => {
        const pending = timers.get(d.deliveryId);
        if (pending) clearTimeout(pending);
        show({ key: `a-${d.deliveryId}`, kind: 'assigned', ...d });
      }),
      // Posted to the riders on duty: only worth a pop-up if nobody has taken it a moment later.
      subscribe('delivery:new', (d) => {
        const timer = setTimeout(async () => {
          timers.delete(d.deliveryId);
          // Only worth a pop-up for a rider who has a free slot (the server tells only riders who are on duty).
          try {
            const mine = await riderService.getMyDeliveries();
            const active = (mine.data ?? []).filter((x) => !['delivered', 'delivery_failed', 'cancelled'].includes(x.status)).length;
            if (active >= 2) return;
          } catch {
            return;
          }
          show({ key: `p-${d.deliveryId}`, kind: 'pool' });
        }, 3500);
        timers.set(d.deliveryId, timer);
      }),
      subscribe('delivery:removed', (d) => {
        const pending = timers.get(d.deliveryId);
        if (pending) clearTimeout(pending);
        timers.delete(d.deliveryId);
        dismiss(`p-${d.deliveryId}`);
      }),
    ];
    return () => {
      offs.forEach((off) => off?.());
      timers.forEach((timer) => clearTimeout(timer));
      timers.clear();
    };
  }, [isRider, subscribe, show, dismiss]);

  if (!isRider || popups.length === 0) return null;

  return (
    <div className="fixed top-4 end-4 z-[100] w-[min(92vw,380px)] space-y-3" data-testid="rider-job-popups">
      {popups.map((p) => (
        <div key={p.key} role="alert" className="rounded-2xl bg-slate-900 text-white shadow-2xl border border-emerald-400/40 p-4" data-testid={p.kind === 'assigned' ? 'rider-assigned-popup' : 'rider-pool-popup'}>
          <div className="flex items-start justify-between gap-3">
            <p className="font-black text-sm">{p.kind === 'assigned' ? t('popupAssignedTitle') : t('popupPoolTitle')}</p>
            <button onClick={() => dismiss(p.key)} aria-label={t('popupDismiss')} className="text-slate-300 hover:text-white text-lg leading-none">×</button>
          </div>
          {p.kind === 'assigned' ? (
            <div className="mt-2 text-xs space-y-1 text-slate-200">
              <p className="font-bold text-white">{t('orderNo', { number: p.orderNumber ?? '' })}</p>
              <p>🏪 {p.pickupAddress}</p>
              <p>📍 {p.deliveryAddress}</p>
              <p className="flex flex-wrap gap-3 pt-1">
                {!!p.cashToCollect && <span className="text-amber-300 font-bold">{t('popupCollect', { amount: formatPrice(p.cashToCollect) })}</span>}
                {p.riderFee != null && <span className="text-emerald-300 font-bold">{t('popupEarn', { amount: formatPrice(p.riderFee) })}</span>}
              </p>
              {(p.activeJobs ?? 0) > 1 && <p className="text-blue-200">{t('popupJobsNow', { count: p.activeJobs ?? 0 })}</p>}
            </div>
          ) : (
            <p className="mt-2 text-xs text-slate-200">{t('popupPoolBody')}</p>
          )}
          <button
            onClick={() => {
              dismiss(p.key);
              router.push(p.kind === 'assigned' ? '/riders/dashboard#active' : '/riders/dashboard#available');
            }}
            className="mt-3 w-full rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-black py-2"
          >
            {p.kind === 'assigned' ? t('popupViewRuns') : t('popupViewPool')}
          </button>
        </div>
      ))}
    </div>
  );
}
