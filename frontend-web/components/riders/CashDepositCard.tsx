'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { StatusPill } from '@/components/ui/StatusPill';
import { useToast } from '@/components/ui/toast';
import { apiClient, apiErrorMessage } from '@/lib/api-client';
import { useT } from '@/lib/i18n';
import { riderMessages } from '@/lib/i18n/messages/rider';
import { formatPrice } from '@/lib/utils';

type Method = 'bank_transfer' | 'jazzcash' | 'easypaisa';

interface Summary {
  cashHeld: number;
  waitingForApproval: number;
  keepAsPay: number;
  toDeposit: number;
  heldSince: string | null;
  dueBy: string | null;
  overdue: boolean;
  accounts: { bankName: string; bankAccountTitle: string; bankAccountNumber: string; jazzcashTitle: string; jazzcashNumber: string; easypaisaTitle: string; easypaisaNumber: string };
  deposits: Array<{ id: string; amount: number; keptAsPay: number; method: Method; transactionRef: string; status: 'pending' | 'approved' | 'rejected'; rejectionReason: string | null; createdAt: string }>;
}

const when = (iso: string) => new Date(iso).toLocaleString('en-PK', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

/**
 * The rider deposits the cash they hold into Nuray's account themselves: what to deposit (the cash less the pay they
 * keep), where, and a form for the transaction ID and a photo of the receipt. Nuray checks it and updates their cash.
 */
export function CashDepositCard({ onChanged }: { onChanged: () => void }) {
  const t = useT(riderMessages);
  const { showToast } = useToast();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [method, setMethod] = useState<Method | null>(null);
  const [amount, setAmount] = useState('');
  const [kept, setKept] = useState('');
  const [ref, setRef] = useState('');
  const [receipt, setReceipt] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await apiClient.get('/riders/me/deposits');
      const s: Summary = res.data.data;
      setSummary(s);
      setAmount(s.toDeposit > 0 ? String(s.toDeposit) : '');
      setKept(s.keepAsPay > 0 ? String(s.keepAsPay) : '0');
    } catch {
      setSummary(null);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!summary) return null;
  const a = summary.accounts;
  const offered: Array<{ method: Method; title: string; number: string; bank?: string }> = [
    ...(a.jazzcashNumber ? [{ method: 'jazzcash' as const, title: a.jazzcashTitle, number: a.jazzcashNumber }] : []),
    ...(a.easypaisaNumber ? [{ method: 'easypaisa' as const, title: a.easypaisaTitle, number: a.easypaisaNumber }] : []),
    ...(a.bankAccountNumber ? [{ method: 'bank_transfer' as const, title: a.bankAccountTitle, number: a.bankAccountNumber, bank: a.bankName }] : []),
  ];
  const chosen = method ?? offered[0]?.method ?? null;
  const overdue = summary.overdue;
  const canDeposit = summary.toDeposit + summary.keepAsPay > 0;

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const form = new FormData();
      form.append('proof', file);
      const res = await apiClient.post('/upload/payment-proof', form, { headers: { 'Content-Type': 'multipart/form-data' } });
      setReceipt(res.data.data.url);
    } catch {
      setReceipt(null);
      showToast(t('dep.uploadFailed'), 'error');
    } finally {
      setUploading(false);
    }
  };

  const keepAll = async () => {
    setSending(true);
    try {
      await apiClient.post('/riders/me/keep-as-pay', { amount: summary.keepAsPay });
      showToast(t('dep.keepDone', { amount: formatPrice(summary.keepAsPay) }), 'success');
      await load();
      onChanged();
    } catch (err) {
      showToast(apiErrorMessage(err, t('dep.uploadFailed')), 'error');
    } finally {
      setSending(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!receipt) {
      showToast(t('dep.needReceipt'), 'error');
      return;
    }
    setSending(true);
    try {
      await apiClient.post('/riders/me/deposits', { amount: Number(amount), keptAsPay: Number(kept) || 0, method: chosen, transactionRef: ref, receiptUrl: receipt });
      showToast(t('dep.sent'), 'success');
      setRef('');
      setReceipt(null);
      if (fileRef.current) fileRef.current.value = '';
      await load();
      onChanged();
    } catch (err) {
      showToast(apiErrorMessage(err, t('dep.uploadFailed')), 'error');
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="rounded-[20px] bg-surface border border-line shadow-[var(--shadow-card)] p-5 sm:p-6 space-y-5" data-testid="cash-deposit">
      <div>
        <h2 className="text-base font-semibold text-ink">{t('dep.title')}</h2>
        {summary.waitingForApproval > 0 && <p className="mt-1 text-sm text-muted">{t('dep.waiting', { amount: formatPrice(summary.waitingForApproval) })}</p>}
      </div>

      {!canDeposit ? (
        <p className="text-sm text-muted">{t('dep.none')}</p>
      ) : (
        <>
          {summary.dueBy && (
            <p role={overdue ? 'alert' : undefined} className={`rounded-xl px-3 py-2 text-sm ${overdue ? 'bg-red-50 text-red-700 font-medium' : 'bg-raised text-ink'}`}>
              {overdue ? t('dep.overdue', { when: when(summary.dueBy) }) : t('dep.dueBy', { when: when(summary.dueBy) })}
            </p>
          )}
          <dl className="grid grid-cols-2 gap-4">
            <div>
              <dt className="text-sm text-muted">{t('dep.toDeposit')}</dt>
              <dd className="text-2xl font-semibold text-ink tabular-nums">{formatPrice(summary.toDeposit)}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted">{t('dep.keep')}</dt>
              <dd className="text-2xl font-semibold text-ink tabular-nums">{formatPrice(summary.keepAsPay)}</dd>
            </div>
          </dl>
          <p className="-mt-2 text-xs text-muted">{t('dep.ofHeld', { held: formatPrice(summary.cashHeld - summary.waitingForApproval) })}</p>

          {summary.toDeposit <= 0 ? (
            <div className="space-y-3">
              <p className="text-sm text-ink">{t('dep.keepAll')}</p>
              <Button type="button" className="w-full min-h-11 rounded-xl" disabled={sending} onClick={() => void keepAll()}>
                {sending ? t('dep.sending') : t('dep.keepButton', { amount: formatPrice(summary.keepAsPay) })}
              </Button>
            </div>
          ) : offered.length === 0 ? (
            <p className="text-sm text-muted">{t('dep.noAccounts')}</p>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <fieldset>
                <legend className="text-sm font-medium text-ink mb-2">{t('dep.payTo')}</legend>
                <div className="grid gap-2">
                  {offered.map((o) => (
                    <label key={o.method} className={`flex items-start gap-3 rounded-xl border p-3 cursor-pointer ${chosen === o.method ? 'border-brand bg-brand-50/40' : 'border-line'}`}>
                      <input type="radio" name="deposit-method" className="mt-1" checked={chosen === o.method} onChange={() => setMethod(o.method)} />
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-ink">{t(`dep.method.${o.method}`)}{o.bank ? ` · ${o.bank}` : ''}</span>
                        <span className="block text-sm text-ink tabular-nums" dir="ltr">{o.number}</span>
                        {o.title && <span className="block text-xs text-muted">{o.title}</span>}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm text-ink">
                  {t('dep.amount')}
                  <input type="number" inputMode="decimal" min="1" step="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} className="nuray-input mt-1 w-full" />
                </label>
                <label className="text-sm text-ink">
                  {t('dep.kept')}
                  <input type="number" inputMode="decimal" min="0" step="0.01" value={kept} onChange={(e) => setKept(e.target.value)} className="nuray-input mt-1 w-full" />
                </label>
              </div>
              <label className="block text-sm text-ink">
                {t('dep.ref')}
                <input type="text" required minLength={4} maxLength={60} value={ref} onChange={(e) => setRef(e.target.value)} className="nuray-input mt-1 w-full" dir="ltr" aria-describedby="dep-ref-hint" />
                <span id="dep-ref-hint" className="mt-1 block text-xs text-muted">{t('dep.refHint')}</span>
              </label>
              <label className="block text-sm text-ink">
                {t('dep.receipt')}
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void upload(f);
                  }}
                  className="mt-1 block w-full text-sm"
                />
                <span className="mt-1 block text-xs text-muted" aria-live="polite">{uploading ? t('dep.uploading') : receipt ? t('dep.uploaded') : ''}</span>
              </label>
              <Button type="submit" className="w-full min-h-11 rounded-xl" disabled={sending || uploading || !chosen}>
                {sending ? t('dep.sending') : t('dep.submit')}
              </Button>
            </form>
          )}
        </>
      )}

      {summary.deposits.length > 0 && (
        <div className="pt-4 border-t border-line">
          <h3 className="text-sm font-semibold text-ink mb-2">{t('dep.history')}</h3>
          <ul className="divide-y divide-line" data-testid="deposit-history">
            {summary.deposits.map((d) => (
              <li key={d.id} className="py-2.5 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink tabular-nums">
                    {formatPrice(d.amount)} <span className="font-normal text-muted">· {t(`dep.method.${d.method}`)} · {d.transactionRef}</span>
                  </p>
                  <p className="text-xs text-muted">
                    {when(d.createdAt)}
                    {d.keptAsPay > 0 ? ` · ${t('dep.keptNote', { amount: formatPrice(d.keptAsPay) })}` : ''}
                  </p>
                  {d.status === 'rejected' && d.rejectionReason && <p className="text-xs text-red-700 mt-0.5">{d.rejectionReason}</p>}
                </div>
                <StatusPill tone={d.status === 'approved' ? 'good' : d.status === 'rejected' ? 'problem' : 'waiting'}>{t(`dep.status.${d.status}`)}</StatusPill>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
