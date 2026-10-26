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
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-slate-950/70">
      <div role="dialog" aria-modal="true" aria-labelledby="bgloc-title" className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-3xl p-6 shadow-2xl" data-testid="background-location-notice">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
            <MapPin className="w-5 h-5" aria-hidden="true" />
          </div>
          <h2 id="bgloc-title" className="text-base font-bold text-white leading-snug">
            {t('bgloc.title')}
          </h2>
        </div>
        <div className="space-y-2 text-sm text-slate-300 leading-relaxed mb-6">
          <p>{t('bgloc.body1')}</p>
          <p>{t('bgloc.body2')}</p>
          <p>{t('bgloc.body3')}</p>
        </div>
        <div className="flex flex-col-reverse sm:flex-row gap-3 sm:justify-end">
          <button type="button" onClick={() => onChoice(false)} className="px-4 py-2.5 rounded-xl text-sm font-semibold border border-slate-600 text-slate-200 hover:bg-slate-800">
            {t('bgloc.notNow')}
          </button>
          <button type="button" onClick={() => onChoice(true)} className="px-5 py-2.5 rounded-xl text-sm font-bold bg-emerald-500 text-slate-950 hover:bg-emerald-400">
            {t('bgloc.allow')}
          </button>
        </div>
      </div>
    </div>
  );
}
