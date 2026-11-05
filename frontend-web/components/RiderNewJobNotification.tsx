'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/store/auth-store';
import { useSocket } from '@/lib/hooks/use-socket';
import { formatPrice } from '@/lib/utils';
import { useT } from '@/lib/i18n';
import { riderMessages } from '@/lib/i18n/messages/rider';
import { riderService } from '@/lib/services/rider.service';
import { useShallow } from 'zustand/react/shallow';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';

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
  const { user } = useAuthStore(useShallow((s) => ({ user: s.user })));
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
            const mine = await riderService.getMyDeliveries({ history: 0 }); // only the running jobs are counted
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
    <div className="fixed top-[calc(1rem+var(--safe-top))] end-[calc(1rem+var(--safe-end))] z-[100] w-[min(92vw,380px)] space-y-3" data-testid="rider-job-popups">
      {popups.map((p) => (
        <div key={p.key} role="alert" className="rounded-[20px] bg-surface border border-line-strong shadow-[var(--shadow-card)] p-4" data-testid={p.kind === 'assigned' ? 'rider-assigned-popup' : 'rider-pool-popup'}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 pt-2.5">
              <p className="text-[15px] font-semibold text-ink leading-snug">{p.kind === 'assigned' ? t('popupAssignedTitle') : t('popupPoolTitle')}</p>
              {p.kind === 'assigned' && <p className="text-sm text-muted">{t('orderNo', { number: p.orderNumber ?? '' })}</p>}
            </div>
            <button
              type="button"
              onClick={() => dismiss(p.key)}
              aria-label={t('popupDismiss')}
              className="-me-2 -mt-1 w-11 h-11 shrink-0 flex items-center justify-center rounded-full text-muted hover:text-ink hover:bg-raised focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand/40"
            >
              <X className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>
          {p.kind === 'assigned' ? (
            <div className="mt-3 space-y-2">
              <dl className="space-y-2 text-sm">
                <div>
                  <dt className="text-muted">{t('pickupKitchen')}</dt>
                  <dd className="text-ink leading-snug">{p.pickupAddress}</dd>
                </div>
                <div>
                  <dt className="text-muted">{t('dropoffCustomer')}</dt>
                  <dd className="text-ink leading-snug">{p.deliveryAddress}</dd>
                </div>
              </dl>
              {(!!p.cashToCollect || p.riderFee != null) && (
                <div className="flex flex-wrap items-center gap-2 pt-1 text-sm">
                  {!!p.cashToCollect && (
                    <span className="rounded-full bg-accent-soft text-accent-soft-ink px-2.5 py-0.5 font-medium tabular-nums">{t('popupCollect', { amount: formatPrice(p.cashToCollect) })}</span>
                  )}
                  {p.riderFee != null && <span className="text-ink font-medium tabular-nums">{t('popupEarn', { amount: formatPrice(p.riderFee) })}</span>}
                </div>
              )}
              {(p.activeJobs ?? 0) > 1 && <p className="text-sm text-muted">{t('popupJobsNow', { count: p.activeJobs ?? 0 })}</p>}
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted">{t('popupPoolBody')}</p>
          )}
          <Button
            type="button"
            onClick={() => {
              dismiss(p.key);
              router.push(p.kind === 'assigned' ? '/riders/dashboard#active' : '/riders/dashboard#available');
            }}
            className="mt-4 w-full"
          >
            {p.kind === 'assigned' ? t('popupViewRuns') : t('popupViewPool')}
          </Button>
        </div>
      ))}
    </div>
  );
}
