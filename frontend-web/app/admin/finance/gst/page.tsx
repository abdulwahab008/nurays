'use client';

import { useCallback, useEffect, useState } from 'react';
import { DashboardLayout, adminSidebarFor } from '@/components/layout/DashboardShell';
import { LoadError } from '@/components/ui/LoadError';
import { Figure, LoadingLine } from '@/components/admin/AdminListParts';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useAuthStore } from '@/lib/store/auth-store';
import { apiClient } from '@/lib/api-client';
import { formatPrice } from '@/lib/utils';
import { useShallow } from 'zustand/react/shallow';

interface GstMonth {
  month: string;
  orders: number;
  taxableSales: number;
  gst: number;
  heldBy: { nuray: number; kitchens: number; riders: number };
}

interface GstLine {
  orderNumber: string;
  deliveredOn: string;
  kitchens: string;
  paymentMethod: string;
  heldBy: 'Nuray' | 'Kitchen' | 'Rider';
  taxableSales: number;
  gst: number;
}

const monthName = (m: string) => new Date(`${m}-01T00:00:00`).toLocaleDateString('en-PK', { month: 'long', year: 'numeric' });

/**
 * The GST Nuray owes the tax office, month by month (an order counts in the month it was delivered, Pakistan time),
 * and who holds it until it reaches Nuray. A month opens to its orders and downloads as a spreadsheet for the accountant.
 */
export default function AdminGstReportPage() {
  const { isAuthenticated, user } = useAuthStore(useShallow((s) => ({ isAuthenticated: s.isAuthenticated, user: s.user })));
  const isAdmin = user?.user_type === 'admin' || user?.userType === 'admin';
  const { showToast } = useToast();
  const [months, setMonths] = useState<GstMonth[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [lines, setLines] = useState<GstLine[] | null>(null);
  const [linesError, setLinesError] = useState<unknown>(null);
  const [downloading, setDownloading] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await apiClient.get('/admin/finance/gst');
      setMonths(res.data.data.months);
      setError(null);
    } catch (err) {
      setError(err);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated && isAdmin) void load();
  }, [isAuthenticated, isAdmin, load]);

  const openMonth = async (month: string) => {
    setOpen(month);
    setLines(null);
    setLinesError(null);
    try {
      const res = await apiClient.get(`/admin/finance/gst/${month}`);
      setLines(res.data.data.lines);
    } catch (err) {
      setLinesError(err);
    }
  };

  const download = async (month: string) => {
    setDownloading(true);
    try {
      const res = await apiClient.get<Blob>(`/admin/finance/gst/${month}`, { params: { format: 'csv' }, responseType: 'blob' });
      const href = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = href;
      a.download = `nuray-gst-${month}.csv`;
      a.click();
      URL.revokeObjectURL(href);
    } catch {
      showToast("We couldn't download the report. Please try again.", 'error');
    } finally {
      setDownloading(false);
    }
  };

  if (!isAuthenticated || !isAdmin) return null;
  const current = months?.find((m) => m.month === open) ?? null;

  return (
    <DashboardLayout title="GST report" subtitle="GST owed to the tax office, by the month orders were delivered" sidebarItems={adminSidebarFor(user?.permissions)} userType="admin">
      <div className="max-w-5xl space-y-8">
        {error ? <LoadError compact error={error} onRetry={() => void load()} title="We couldn't load the GST report" /> : null}
        {!months ? (
          error ? null : <LoadingLine text="Adding up the GST" />
        ) : months.length === 0 ? (
          <p className="text-sm text-muted">No GST yet. It is recorded when an order is delivered and paid.</p>
        ) : (
          <section aria-labelledby="months-heading">
            <h2 id="months-heading" className="mb-3 text-sm font-semibold text-ink">Months</h2>
            <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
              <table className="w-full text-sm" data-testid="gst-months">
                <thead>
                  <tr className="text-left text-xs text-muted">
                    <th className="px-4 py-2 font-medium">Month</th>
                    <th className="px-4 py-2 font-medium text-right">Orders</th>
                    <th className="px-4 py-2 font-medium text-right">Taxable sales</th>
                    <th className="px-4 py-2 font-medium text-right">GST owed</th>
                    <th className="px-4 py-2 font-medium" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {months.map((m) => (
                    <tr key={m.month} className={open === m.month ? 'bg-raised' : undefined}>
                      <td className="px-4 py-3 font-medium text-ink">{monthName(m.month)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{m.orders}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{formatPrice(m.taxableSales)}</td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums">{formatPrice(m.gst)}</td>
                      <td className="px-4 py-3 text-right">
                        <button type="button" onClick={() => void openMonth(m.month)} className="min-h-11 text-sm font-semibold text-brand-ink hover:underline">
                          {open === m.month ? 'Showing' : 'Open'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {current && (
          <section aria-labelledby="month-heading" className="border-t border-line pt-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="month-heading" className="text-sm font-semibold text-ink">{monthName(current.month)}</h2>
              <Button type="button" variant="outline" className="rounded-xl min-h-11" disabled={downloading} onClick={() => void download(current.month)}>
                {downloading ? 'Downloading…' : 'Download for the accountant (CSV)'}
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4" data-testid="gst-month-figures">
              <Figure label="GST owed" value={formatPrice(current.gst)} sub={`${current.orders} orders`} />
              <Figure label="Held by Nuray" value={formatPrice(current.heldBy.nuray)} sub="Paid online" />
              <Figure label="Held by kitchens" value={formatPrice(current.heldBy.kitchens)} sub="Owed to Nuray" />
              <Figure label="Held by riders" value={formatPrice(current.heldBy.riders)} sub="Owed to Nuray until handed in" />
            </div>
            {linesError ? (
              <LoadError compact error={linesError} onRetry={() => void openMonth(current.month)} title="We couldn't load this month's orders" />
            ) : !lines ? (
              <LoadingLine text="Loading the orders" />
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
                <table className="w-full text-sm" data-testid="gst-lines">
                  <thead>
                    <tr className="text-left text-xs text-muted">
                      <th className="px-4 py-2 font-medium">Order</th>
                      <th className="px-4 py-2 font-medium">Delivered</th>
                      <th className="px-4 py-2 font-medium">Kitchen</th>
                      <th className="px-4 py-2 font-medium">Money held by</th>
                      <th className="px-4 py-2 font-medium text-right">Taxable sales</th>
                      <th className="px-4 py-2 font-medium text-right">GST</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {lines.map((l) => (
                      <tr key={l.orderNumber}>
                        <td className="px-4 py-3 font-medium text-ink">{l.orderNumber}</td>
                        <td className="px-4 py-3">{l.deliveredOn}</td>
                        <td className="px-4 py-3">{l.kitchens}</td>
                        <td className="px-4 py-3">{l.heldBy}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{formatPrice(l.taxableSales)}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{formatPrice(l.gst)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
      </div>
    </DashboardLayout>
  );
}
