'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { LoadError } from '@/components/ui/LoadError';
import { useAuthStore } from '@/lib/store/auth-store';
import { apiClient } from '@/lib/api-client';
import { formatPrice } from '@/lib/utils';
import { useLocale, useT } from '@/lib/i18n';
import { kitchenEarningsMessages } from '@/lib/i18n/messages/kitchen-earnings';
import { monthLabel } from '@/components/sellers/KitchenInvoices';

interface Invoice {
  month: string;
  number: string;
  issuedOn: string;
  orders: number;
  commission: number;
  deliveryCharges: number;
  total: number;
  from: { name: string; email: string };
  to: { name: string; address: string | null };
  lines: Array<{ orderNumber: string; deliveredOn: string; commission: number; deliveryCharge: number }>;
}

/**
 * One month's invoice from Nuray to the kitchen, laid out as a document to print or save as PDF (the browser's own
 * print dialog does both). No app shell, so only the invoice prints.
 */
export default function KitchenInvoicePage() {
  const { month } = useParams<{ month: string }>();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const t = useT(kitchenEarningsMessages);
  const { locale } = useLocale();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(async () => {
    try {
      setInvoice((await apiClient.get(`/sellers/me/invoices/${month}`)).data.data);
      setError(null);
    } catch (err) {
      setError(err);
    }
  }, [month]);

  useEffect(() => {
    if (isAuthenticated) void load();
  }, [isAuthenticated, load]);

  if (!isAuthenticated) return null;
  const hasDelivery = (invoice?.deliveryCharges ?? 0) > 0;

  return (
    <main className="mx-auto max-w-3xl bg-surface px-4 py-8 sm:px-8 text-ink print:p-0" data-testid="kitchen-invoice">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href="/sellers/earnings" className="inline-flex min-h-11 items-center text-sm font-semibold text-brand-ink hover:underline">← {t('inv.back')}</Link>
        {invoice && <Button type="button" onClick={() => window.print()} className="rounded-xl min-h-11">{t('inv.print')}</Button>}
      </div>

      {error ? <LoadError error={error} onRetry={() => void load()} title={t('inv.loadFailed')} /> : null}
      {invoice && (
        <article className="space-y-6">
          <header className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-4">
            <div>
              <h1 className="text-2xl font-semibold">{t('inv.heading')}</h1>
              <p className="text-sm text-muted">{t('inv.period')} {monthLabel(invoice.month, locale)}</p>
            </div>
            <dl className="grid grid-cols-[auto_auto] gap-x-3 gap-y-1 text-sm">
              <dt className="text-muted">{t('inv.number')}</dt>
              <dd className="font-mono" data-ltr>{invoice.number}</dd>
              <dt className="text-muted">{t('inv.issued')}</dt>
              <dd data-ltr>{invoice.issuedOn}</dd>
            </dl>
          </header>

          <div className="grid gap-4 sm:grid-cols-2 text-sm">
            <div>
              <p className="text-muted">{t('inv.from')}</p>
              <p className="font-semibold">{invoice.from.name}</p>
              <p data-ltr>{invoice.from.email}</p>
            </div>
            <div>
              <p className="text-muted">{t('inv.to')}</p>
              <p className="font-semibold">{invoice.to.name}</p>
              {invoice.to.address && <p>{invoice.to.address}</p>}
            </div>
          </div>

          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-start text-xs text-muted">
                <th className="py-2 text-start font-medium">{t('inv.order')}</th>
                <th className="py-2 text-start font-medium">{t('inv.delivered')}</th>
                <th className="py-2 text-end font-medium">{t('inv.commission')}</th>
                {hasDelivery && <th className="py-2 text-end font-medium">{t('inv.delivery')}</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {invoice.lines.map((l) => (
                <tr key={l.orderNumber}>
                  <td className="py-2 font-mono" data-ltr>#{l.orderNumber}</td>
                  <td className="py-2" data-ltr>{l.deliveredOn}</td>
                  <td className="py-2 text-end tabular-nums">{formatPrice(l.commission)}</td>
                  {hasDelivery && <td className="py-2 text-end tabular-nums">{l.deliveryCharge ? formatPrice(l.deliveryCharge) : ''}</td>}
                </tr>
              ))}
            </tbody>
          </table>

          <dl className="ms-auto w-full max-w-xs space-y-1.5 text-sm">
            <div className="flex justify-between gap-3"><dt className="text-muted">{t('inv.commission')}</dt><dd className="tabular-nums">{formatPrice(invoice.commission)}</dd></div>
            {hasDelivery && <div className="flex justify-between gap-3"><dt className="text-muted">{t('inv.delivery')}</dt><dd className="tabular-nums">{formatPrice(invoice.deliveryCharges)}</dd></div>}
            <div className="flex justify-between gap-3 border-t border-line pt-2 text-base font-semibold"><dt>{t('inv.total')}</dt><dd className="tabular-nums">{formatPrice(invoice.total)}</dd></div>
          </dl>

          <p className="text-xs text-muted">{t('inv.note')}</p>
        </article>
      )}
    </main>
  );
}
