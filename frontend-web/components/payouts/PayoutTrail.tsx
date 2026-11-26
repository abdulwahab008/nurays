'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { StatusPill } from '@/components/ui/StatusPill';
import { useToast } from '@/components/ui/toast';
import { apiClient } from '@/lib/api-client';
import { useLocale, useT } from '@/lib/i18n';
import { kitchenEarningsMessages } from '@/lib/i18n/messages/kitchen-earnings';

export interface PayoutEvent {
  event: 'created' | 'approved' | 'sent' | 'failed' | 'received' | 'not_received' | 'payment_received';
  actorType: 'system' | 'admin' | 'kitchen';
  reference: string | null;
  note: string | null;
  at: string;
}

type TrailKey = keyof typeof kitchenEarningsMessages.en;

/**
 * A kitchen payout's history (made, sent with its reference, or why not) and, once it is sent, the kitchen's answer:
 * did the money arrive? "Not yet" asks what they see and tells Nuray, who checks the transfer.
 */
export function PayoutTrail({
  payout,
  onChanged,
}: {
  payout: { id: string; status: string; netAmount: number; kitchenConfirmation?: 'received' | 'not_received' | null; events?: PayoutEvent[] };
  onChanged: () => void;
}) {
  const t = useT(kitchenEarningsMessages);
  const { locale } = useLocale();
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const events = payout.events ?? [];
  const asking = payout.status === 'completed' && payout.netAmount > 0 && !payout.kitchenConfirmation;
  const day = (iso: string) => new Date(iso).toLocaleString(locale === 'ur' ? 'ur-PK' : 'en-PK', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

  const answer = async (kind: 'received' | 'not-received') => {
    setBusy(true);
    try {
      await apiClient.post(`/sellers/me/payouts/${payout.id}/${kind}`, kind === 'not-received' ? { note } : {});
      showToast(t(kind === 'received' ? 'confirm.thanks' : 'confirm.reported'), 'success');
      setReporting(false);
      onChanged();
    } catch {
      showToast(t('confirm.failed'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const label = (e: PayoutEvent): string => {
    const key = (e.event === 'created' ? `trail.created.${e.actorType}` : `trail.${e.event}`) as TrailKey;
    return t(key);
  };

  return (
    <div className="px-4 pb-3 space-y-2" data-testid="payout-trail">
      {payout.kitchenConfirmation && (
        <StatusPill tone={payout.kitchenConfirmation === 'received' ? 'good' : 'problem'}>
          {t(payout.kitchenConfirmation === 'received' ? 'confirm.okPill' : 'confirm.problemPill')}
        </StatusPill>
      )}
      {asking && !reporting && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-ink">{t('confirm.ask')}</span>
          <Button type="button" size="sm" className="min-h-11 rounded-xl" disabled={busy} onClick={() => void answer('received')}>{t('confirm.yes')}</Button>
          <Button type="button" size="sm" variant="outline" className="min-h-11 rounded-xl" disabled={busy} onClick={() => setReporting(true)}>{t('confirm.no')}</Button>
        </div>
      )}
      {asking && reporting && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex-1 min-w-56 text-sm text-ink">
            {t('confirm.noteLabel')}
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('confirm.notePlaceholder')} className="nuray-input mt-1 w-full" />
          </label>
          <Button type="button" variant="outline" className="min-h-11 rounded-xl" onClick={() => setReporting(false)}>{t('confirm.cancel')}</Button>
          <Button type="button" className="min-h-11 rounded-xl" disabled={busy || note.trim().length < 3} onClick={() => void answer('not-received')}>{t('confirm.send')}</Button>
        </div>
      )}
      {events.length > 0 && (
        <div>
          <button type="button" className="min-h-11 text-sm font-semibold text-brand-ink hover:underline" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
            {t(open ? 'trail.hide' : 'trail.show')}
          </button>
          {open && (
            <ol className="mt-1 space-y-1.5 border-s-2 border-line ps-3">
              {events.map((e, i) => (
                <li key={`${e.event}-${i}`} className="text-sm">
                  <span className={`font-medium ${e.event === 'failed' || e.event === 'not_received' ? 'text-red-700' : 'text-ink'}`}>{label(e)}</span>
                  <span className="text-muted"> · {day(e.at)}</span>
                  {e.reference && <span className="text-muted" dir="ltr"> · {t('trail.ref', { ref: e.reference })}</span>}
                  {e.note && e.event !== 'created' && <span className="block text-xs text-muted">{e.note}</span>}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}
