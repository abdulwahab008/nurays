'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { DashboardLayout, adminSidebarFor } from '@/components/layout/DashboardShell';
import { LoadError } from '@/components/ui/LoadError';
import { AdminFilterTabs } from '@/components/admin/AdminFilterTabs';
import { Figure, LoadingLine } from '@/components/admin/AdminListParts';
import { useAuthStore } from '@/lib/store/auth-store';
import { apiClient } from '@/lib/api-client';
import { formatPrice } from '@/lib/utils';
import { useShallow } from 'zustand/react/shallow';
import { statusLabel } from '../orders/order-labels';

interface AnalyticsData {
  overview: {
    totalUsers: number;
    totalSellers: number;
    newUsersThisWeek?: number;
    newSellersThisWeek?: number;
    totalOrders: number;
    totalRevenue: number;
    periodOrders: number;
    periodRevenue: number;
    activeUsers: number;
    activeSellers: number;
    totalCommission: number;
  };
  ordersByStatus: Record<string, number>;
  revenueByDay?: Array<{ date: string; orders: number; revenue: number }>;
}

type Period = '7' | '30' | '90';
const PERIODS: ReadonlyArray<{ id: Period; label: string }> = [
  { id: '7', label: '7 days' },
  { id: '30', label: '30 days' },
  { id: '90', label: '90 days' },
];

const STATUS_ORDER = ['pending', 'confirmed', 'preparing', 'ready', 'dispatched', 'in_transit', 'delivered', 'delivery_failed', 'cancelled', 'refunded'];

/** Paid sales for every day of the period, with the days that had none as zero. */
function dailySeries(rows: AnalyticsData['revenueByDay'], days: number) {
  const byDate = new Map((rows ?? []).map((r) => [r.date, r]));
  const out: Array<{ date: string; revenue: number; orders: number }> = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const row = byDate.get(key);
    out.push({ date: key, revenue: row?.revenue ?? 0, orders: row?.orders ?? 0 });
  }
  return out;
}

const shortDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

function SalesChart({ series }: { series: Array<{ date: string; revenue: number; orders: number }> }) {
  const max = Math.max(1, ...series.map((d) => d.revenue));
  const best = series.reduce((a, b) => (b.revenue > a.revenue ? b : a), series[0]);
  return (
    <figure>
      <div className="flex h-40 items-end gap-[2px]" role="img" aria-label={`Paid sales by day. Best day ${shortDate(best.date)}, ${formatPrice(best.revenue)}.`}>
        {series.map((d) => (
          <div key={d.date} className="group relative flex h-full flex-1 items-end">
            <div
              className={`w-full rounded-t-sm ${d.revenue > 0 ? 'bg-brand' : 'bg-line'}`}
              style={{ height: d.revenue > 0 ? `${Math.max(3, (d.revenue / max) * 100)}%` : '2px' }}
              title={`${shortDate(d.date)}: ${formatPrice(d.revenue)}, ${d.orders} paid orders`}
            />
          </div>
        ))}
      </div>
      <figcaption className="mt-2 flex justify-between text-xs text-muted">
        <span>{shortDate(series[0].date)}</span>
        <span>Best day {formatPrice(best.revenue)}</span>
        <span>{shortDate(series[series.length - 1].date)}</span>
      </figcaption>
    </figure>
  );
}

export default function AdminAnalyticsPage() {
  const { isAuthenticated, user } = useAuthStore(useShallow((s) => ({ isAuthenticated: s.isAuthenticated, user: s.user })));
  const isAdmin = user?.user_type === 'admin' || user?.userType === 'admin';
  const [period, setPeriod] = useState<Period>('30');
  const [loading, setLoading] = useState(true);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  // Why the figures could not be read: never shown as zeros, which would read as "no business at all".
  const [loadError, setLoadError] = useState<unknown>(null);

  const loadAnalytics = useCallback(async () => {
    try {
      setLoading(true);
      const now = new Date();
      const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (Number(period) - 1));
      const response = await apiClient.get('/admin/analytics', { params: { dateFrom: from.toISOString(), dateTo: now.toISOString() } });
      if (!response.data.success) throw new Error('The analytics answer carried no figures');
      setAnalytics(response.data.data);
      setLoadError(null);
    } catch (error: unknown) {
      setLoadError(error);
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    if (isAuthenticated && isAdmin) void loadAnalytics();
  }, [isAuthenticated, isAdmin, loadAnalytics]);

  const series = useMemo(() => dailySeries(analytics?.revenueByDay, Number(period)), [analytics, period]);

  if (!isAuthenticated || !isAdmin) return null;

  const o = analytics?.overview;
  const paidOrders = series.reduce((n, d) => n + d.orders, 0);
  const statuses = analytics
    ? Object.entries(analytics.ordersByStatus).sort(([a], [b]) => STATUS_ORDER.indexOf(a) - STATUS_ORDER.indexOf(b))
    : [];

  return (
    <DashboardLayout title="Analytics" sidebarItems={adminSidebarFor(user?.permissions)} userType="admin">
      <div className="max-w-5xl space-y-6">
        <AdminFilterTabs label="Period" value={period} onChange={setPeriod} tabs={PERIODS} />

        {loading && !analytics ? (
          <LoadingLine text="Loading the figures" />
        ) : loadError && !analytics ? (
          <LoadError error={loadError} onRetry={() => void loadAnalytics()} title="We couldn't load the analytics" />
        ) : analytics && o ? (
          <>
            {Boolean(loadError) && (
              <LoadError compact error={loadError} onRetry={() => void loadAnalytics()} title="We couldn't refresh the figures: these are for the period before" />
            )}
            <section aria-labelledby="period-heading">
              <h2 id="period-heading" className="mb-4 text-sm font-semibold text-ink">
                Last {period} days
              </h2>
              <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3" data-testid="period-figures">
                <Figure label="Paid sales" value={formatPrice(o.periodRevenue)} />
                <Figure label="Orders" value={o.periodOrders} />
                <Figure label="Commission earned" value={formatPrice(o.totalCommission)} />
                <Figure label="Customers who ordered" value={o.activeUsers} />
                <Figure label="Kitchens with orders" value={o.activeSellers} />
                <Figure label="Average paid order" value={formatPrice(paidOrders ? Math.round(o.periodRevenue / paidOrders) : 0)} />
              </div>
            </section>

            <section aria-labelledby="sales-heading" className="border-t border-line pt-5">
              <h2 id="sales-heading" className="mb-4 text-sm font-semibold text-ink">
                Paid sales by day
              </h2>
              <SalesChart series={series} />
            </section>

            <div className="grid grid-cols-1 gap-x-10 gap-y-6 md:grid-cols-2">
              <section aria-labelledby="status-heading" className="border-t border-line pt-5">
                <h2 id="status-heading" className="mb-2 text-sm font-semibold text-ink">
                  Orders by status
                </h2>
                {statuses.length === 0 ? (
                  <p className="text-sm text-muted">No orders in this period.</p>
                ) : (
                  <ul className="divide-y divide-line text-sm">
                    {statuses.map(([status, count]) => (
                      <li key={status} className="flex justify-between gap-3 py-2">
                        <span className={status === 'delivery_failed' || status === 'cancelled' ? 'text-red-700' : 'text-ink'}>{statusLabel(status)}</span>
                        <span className="font-medium tabular-nums text-ink">{count}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section aria-labelledby="alltime-heading" className="border-t border-line pt-5">
                <h2 id="alltime-heading" className="mb-4 text-sm font-semibold text-ink">
                  All time
                </h2>
                <div className="grid grid-cols-2 gap-x-6 gap-y-5">
                  <Figure label="Paid sales" value={formatPrice(o.totalRevenue)} />
                  <Figure label="Orders" value={o.totalOrders} />
                  <Figure
                    label="Customers"
                    value={o.totalUsers}
                    sub={o.newUsersThisWeek != null ? `${o.newUsersThisWeek} joined this week` : 'Active accounts'}
                    href="/admin/users"
                  />
                  <Figure
                    label="Live kitchens"
                    value={o.totalSellers}
                    sub={o.newSellersThisWeek != null ? `${o.newSellersThisWeek} joined this week` : 'Approved and active'}
                    href="/admin/sellers?status=approved"
                  />
                </div>
              </section>
            </div>
          </>
        ) : null}
      </div>
    </DashboardLayout>
  );
}
