'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { formatPrice } from '@/lib/utils';
import { useLocale, useT } from '@/lib/i18n';
import { kitchenEarningsMessages } from '@/lib/i18n/messages/kitchen-earnings';

interface InvoiceSummary { month: string; number: string; orders: number; total: number }

export const monthLabel = (month: string, locale: string) =>
  new Date(`${month}-01T00:00:00`).toLocaleDateString(locale === 'ur' ? 'ur-PK-u-nu-latn' : 'en-PK', { month: 'long', year: 'numeric' });

/** The kitchen's monthly invoices from Nuray, each opening to a printable invoice. */
export function KitchenInvoices() {
  const t = useT(kitchenEarningsMessages);
  const { locale } = useLocale();
  const [invoices, setInvoices] = useState<InvoiceSummary[] | null>(null);

  useEffect(() => {
    apiClient.get('/sellers/me/invoices').then((res) => setInvoices(res.data.data), () => setInvoices([]));
  }, []);

  if (!invoices) return null;
  return (
    <section className="min-w-0 lg:col-start-1 pt-6 border-t border-line" data-testid="kitchen-invoices">
      <h2 className="text-sm font-semibold text-ink">{t('inv.title')}</h2>
      {invoices.length === 0 ? (
        <p className="mt-3 text-sm text-muted">{t('inv.none')}</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {invoices.map((inv) => (
            <li key={inv.month}>
              <Link href={`/sellers/invoices/${inv.month}`} className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3.5 hover:bg-raised focus:outline-none focus-visible:ring-3 focus-visible:ring-brand/30">
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-ink">{monthLabel(inv.month, locale)}</span>
                  <span className="block text-sm text-muted">{inv.orders === 1 ? t('inv.oneOrder') : t('inv.orders', { count: inv.orders })}</span>
                </span>
                <span className="text-base font-semibold text-ink tabular-nums" data-ltr>{formatPrice(inv.total)}</span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted rtl:-scale-x-100" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
