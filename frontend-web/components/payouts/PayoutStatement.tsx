'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { LoadError } from '@/components/ui/LoadError';
import { useToast } from '@/components/ui/toast';
import { apiClient } from '@/lib/api-client';
import { formatPrice } from '@/lib/utils';
import { useT } from '@/lib/i18n';
import { kitchenEarningsMessages } from '@/lib/i18n/messages/kitchen-earnings';

type LineKind = 'online' | 'rider_cash' | 'rider_cash_waiting' | 'kitchen_collected';

/** GET …/payouts/:id/statement */
export interface Statement {
  payout: { id: string; amount: number; status: string; payoutMethod: string; periodStart: string; periodEnd: string; transactionId: string | null };
  kitchen: { id: string; businessName: string };
  lines: Array<{ orderNumber: string; deliveredOn: string; kind: LineKind; orderTotal: number; kitchenShare: number; effect: number }>;
  totals: { period: number; earlierAndAdjustments: number; waitingForRiderCash: number };
}

/**
 * One payout, order by order: what each order delivered in the payout's period added (or, for cash the kitchen took
 * itself, took off), one line for what those orders do not explain, and a CSV download. `basePath` is the kitchen's
 * own (/sellers/me/payouts) or the admin's (/admin/payouts).
 */
export function PayoutStatement({ basePath, payoutId, onClose }: { basePath: string; payoutId: string; onClose: () => void }) {
  const t = useT(kitchenEarningsMessages);
  const { showToast } = useToast();
  const [statement, setStatement] = useState<Statement | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [downloading, setDownloading] = useState(false);
  const url = `${basePath}/${encodeURIComponent(payoutId)}/statement`;

  const load = useCallback(async () => {
    try {
      setError(null);
      const res = await apiClient.get<{ data: Statement }>(url);
      setStatement(res.data.data);
    } catch (err: unknown) {
      setError(err);
    }
  }, [url]);

  useEffect(() => {
    void load();
  }, [load]);

  const download = async () => {
    setDownloading(true);
    try {
      const res = await apiClient.get<Blob>(url, { params: { format: 'csv' }, responseType: 'blob' });
      const href = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = href;
      a.download = statement ? `nuray-payout-${statement.payout.periodStart}-to-${statement.payout.periodEnd}.csv` : 'nuray-payout.csv';
      a.click();
      URL.revokeObjectURL(href);
    } catch {
      showToast(t('downloadFailed'), 'error');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="statement-title" data-testid="payout-statement">
      <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-5 sm:p-6 shadow-xl">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            <h2 id="statement-title" className="text-lg font-bold text-gray-900">{t('statementTitle')}</h2>
            {statement && (
              <p className="text-sm text-gray-600">
                {statement.kitchen.businessName} · {t('period', { from: statement.payout.periodStart, to: statement.payout.periodEnd })}
              </p>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={onClose}>{t('close')}</Button>
        </div>

        {Boolean(error) && <LoadError compact error={error} onRetry={load} title={t('statementLoadFailed')} />}
        {!statement && !error && <div className="py-10 text-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500 mx-auto" /></div>}

        {statement && (
          <>
            {statement.lines.length === 0 ? (
              <p className="text-sm text-gray-600 py-4">{t('statementNoOrders')}</p>
            ) : (
              <div className="overflow-x-auto -mx-5 sm:mx-0">
                <table className="min-w-full text-sm" data-testid="statement-lines">
                  <thead>
                    <tr className="text-start text-xs text-gray-600 border-b border-gray-200">
                      <th className="px-3 py-2 text-start font-semibold">{t('colOrder')}</th>
                      <th className="px-3 py-2 text-start font-semibold">{t('colDelivered')}</th>
                      <th className="px-3 py-2 text-start font-semibold">{t('colHeldBy')}</th>
                      <th className="px-3 py-2 text-end font-semibold">{t('colTotal')}</th>
                      <th className="px-3 py-2 text-end font-semibold">{t('colShare')}</th>
                      <th className="px-3 py-2 text-end font-semibold">{t('colEffect')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {statement.lines.map((l) => (
                      <tr key={l.orderNumber} className="border-b border-gray-100">
                        <td className="px-3 py-2 font-mono text-xs" dir="ltr">{l.orderNumber}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{l.deliveredOn}</td>
                        <td className="px-3 py-2">{t(`kind.${l.kind}`)}</td>
                        <td className="px-3 py-2 text-end" data-ltr>{formatPrice(l.orderTotal)}</td>
                        <td className="px-3 py-2 text-end" data-ltr>{formatPrice(l.kitchenShare)}</td>
                        <td className={`px-3 py-2 text-end font-semibold ${l.effect < 0 ? 'text-red-700' : 'text-gray-900'}`} data-ltr>
                          {l.effect < 0 ? '-' : ''}{formatPrice(Math.abs(l.effect))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between gap-3"><dt className="text-gray-700">{t('statementOrders')}</dt><dd className="font-semibold" data-ltr>{statement.totals.period < 0 ? '-' : ''}{formatPrice(Math.abs(statement.totals.period))}</dd></div>
              <div className="flex justify-between gap-3">
                <dt className="text-gray-700">{t('statementEarlier')}<span className="block text-xs text-gray-600">{t('statementEarlierHint')}</span></dt>
                <dd className="font-semibold" data-ltr>{statement.totals.earlierAndAdjustments < 0 ? '-' : ''}{formatPrice(Math.abs(statement.totals.earlierAndAdjustments))}</dd>
              </div>
              <div className="flex justify-between gap-3 border-t border-gray-200 pt-2 text-base"><dt className="font-bold">{t('statementPayout')}</dt><dd className="font-bold" data-ltr>{formatPrice(statement.payout.amount)}</dd></div>
              {statement.totals.waitingForRiderCash > 0 && (
                <p className="text-xs text-amber-800">{t('statementWaiting', { amount: formatPrice(statement.totals.waitingForRiderCash) })}</p>
              )}
            </dl>

            <div className="mt-5 flex justify-end">
              <Button onClick={download} disabled={downloading} data-testid="statement-download">{t('downloadCsv')}</Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
