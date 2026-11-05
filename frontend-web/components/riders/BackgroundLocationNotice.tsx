'use client';

import { MapPin } from 'lucide-react';
import { useT } from '@/lib/i18n';
import { riderMessages } from '@/lib/i18n/messages/rider';

/**
 * In the store app, before the phone is asked for background location: what Nuray does with it, when, and when it
 * stops (the stores ask for this in the app itself, ahead of the system prompt). Shown once, when the rider first has a
 * job; "Only while the app is open" keeps the old behaviour, and the dashboard offers the question again.
 */
export function BackgroundLocationNotice({ onChoice }: { onChoice: (allow: boolean) => void }) {
  const t = useT(riderMessages);
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-ink/40">
      <div role="dialog" aria-modal="true" aria-labelledby="bgloc-title" className="w-full sm:max-w-md bg-surface rounded-t-3xl sm:rounded-3xl p-6 pb-[calc(1.5rem+var(--safe-bottom))] sm:pb-6 shadow-2xl" data-testid="background-location-notice">
        <span className="w-11 h-11 rounded-full flex items-center justify-center bg-brand-soft text-brand-soft-ink mb-4" aria-hidden="true">
          <MapPin className="w-5 h-5" />
        </span>
        <h2 id="bgloc-title" className="text-xl font-semibold text-ink leading-snug">
          {t('bgloc.title')}
        </h2>
        <div className="space-y-2 text-[15px] text-muted leading-relaxed mt-3 mb-6">
          <p>{t('bgloc.body1')}</p>
          <p>{t('bgloc.body2')}</p>
          <p>{t('bgloc.body3')}</p>
        </div>
        <div className="flex flex-col gap-2">
          <button type="button" onClick={() => onChoice(true)} className="min-h-12 rounded-xl text-[15px] font-semibold bg-brand text-on-brand hover:bg-brand-500">
            {t('bgloc.allow')}
          </button>
          <button type="button" onClick={() => onChoice(false)} className="min-h-12 rounded-xl text-[15px] font-medium text-ink hover:bg-raised">
            {t('bgloc.notNow')}
          </button>
        </div>
      </div>
    </div>
  );
}
