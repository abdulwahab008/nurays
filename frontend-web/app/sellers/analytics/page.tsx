'use client';

import { useState, useEffect, useMemo } from 'react';
import { loginUrlHere } from '@/lib/auth-redirect';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { DashboardLayout, SELLER_SIDEBAR_ITEMS } from '@/components/layout/DashboardShell';
import { LoadError } from '@/components/ui/LoadError';
import { useToast } from '@/components/ui/toast';
import { useAuthStore } from '@/lib/store/auth-store';
import { apiClient } from '@/lib/api-client';
import { formatPrice } from '@/lib/utils';
import { useShallow } from 'zustand/react/shallow';
import { RefreshCw } from 'lucide-react';

type PeriodType = '7d' | '30d' | '90d' | '1y';

const PERIODS: { id: PeriodType; label: string; words: string }[] = [
  { id: '7d', label: '7 days', words: 'The last 7 days' },
  { id: '30d', label: '30 days', words: 'The last 30 days' },
  { id: '90d', label: '90 days', words: 'The last 90 days' },
  { id: '1y', label: '12 months', words: 'The last 12 months' },
];

interface AnalyticsData {
  unitsSold: {
    today: number;
    thisWeek: number;
    thisMonth: number;
    total: number;
  };
  revenue: {
    today: number;
    thisWeek: number;
    thisMonth: number;
    /** What the kitchen earned on delivered and paid orders: its dishes' payout plus the delivery fee it kept, minus the one it paid Nuray. */
    total: number;
    /** Of which the dishes alone. */
    dishes?: number;
    graph?: Array<{ date: string; revenue: number }>;
  };
  orders: {
    total: number;
    /** Delivered and still paid: the orders the revenue comes from. */
    completed: number;
    /** Cancelled, or refunded to the customer. */
    cancelled: number;
    /** Not delivered yet. */
    inProgress?: number;
    /** Delivered, but the money has not arrived yet. */
    awaitingPayment?: number;
  };
  topProducts: Array<{
    name: string;
    quantity: number;
    /** What the kitchen earned on the dish, after Nuray's fee. */
    revenue: number;
    /** What customers paid for it. */
    sales?: number;
  }>;
}

/** A day's key as the server writes it (YYYY-MM-DD, Pakistan day), from the phone's own calendar. */
const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export default function SellerAnalyticsPage() {
  const router = useRouter();
  const { isAuthenticated, user } = useAuthStore(useShallow((s) => ({ isAuthenticated: s.isAuthenticated, user: s.user })));
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodType>('30d');
  const [chartView, setChartView] = useState<'bar' | 'line'>('bar');
  const [activeTooltip, setActiveTooltip] = useState<{
    date: string;
    revenue: number;
    x: number;
    y: number;
  } | null>(null);

  const loadAnalytics = async (period: PeriodType) => {
    try {
      setLoading(true);
      setError(null);
      const response = await apiClient.get(`/sellers/me/analytics?period=${period}`);
      if (response.data.success) {
        setAnalytics(response.data.data);
      } else {
        throw new Error(response.data.message || 'Failed to load analytics');
      }
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isAuthenticated) {
      router.replace(loginUrlHere());
      return;
    }

    if (user?.userType !== 'seller' && user?.user_type !== 'seller') {
      router.push('/dashboard');
      showToast('Access denied. Seller privileges required.', 'error');
      return;
    }

    loadAnalytics(selectedPeriod);
  }, [isAuthenticated, user, router, selectedPeriod]);

  // Compute calculated metrics
  const totalRevenue = analytics?.revenue?.total ?? 0;
  // The dishes' part of it. A dish's share and the average order are measured against this: a delivery fee is not a dish's.
  const dishRevenue = analytics?.revenue?.dishes ?? totalRevenue;
  const totalUnits = analytics?.unitsSold?.total ?? 0;
  const totalOrders = analytics?.orders?.total ?? 0;
  const completedOrders = analytics?.orders?.completed ?? 0;
  const cancelledOrders = analytics?.orders?.cancelled ?? 0;
  // The API puts each order in exactly one of four buckets (completed, in progress, awaiting payment, cancelled or refunded).
  const inProgressOrders = analytics?.orders?.inProgress ?? Math.max(0, totalOrders - completedOrders - cancelledOrders);
  const awaitingPaymentOrders = analytics?.orders?.awaitingPayment ?? 0;

  const fulfillmentRate = totalOrders > 0
    ? Math.round((completedOrders / totalOrders) * 100)
    : 100;

  const averageOrderValue = completedOrders > 0
    ? Math.round(dishRevenue / completedOrders)
    : 0;

  // Normalize graph data points across the selected time period
  const chartData = useMemo(() => {
    const rawGraph = analytics?.revenue?.graph || [];
    const dateMap = new Map<string, number>();
    rawGraph.forEach((item) => {
      dateMap.set(item.date, Number(item.revenue));
    });

    const now = new Date();
    const days = selectedPeriod === '7d' ? 7 : selectedPeriod === '30d' ? 30 : selectedPeriod === '90d' ? 90 : 365;
    
    // For 1y, group by month to keep the chart legible; otherwise group by day
    if (selectedPeriod === '1y') {
      const months: { label: string; date: string; revenue: number }[] = [];
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const monthName = d.toLocaleString('en-US', { month: 'short' });
        
        let monthRev = 0;
        dateMap.forEach((rev, dateStr) => {
          if (dateStr.startsWith(monthKey)) {
            monthRev += rev;
          }
        });
        months.push({ label: monthName, date: monthKey, revenue: monthRev });
      }
      return months;
    }

    const result: { label: string; date: string; revenue: number }[] = [];
    const step = selectedPeriod === '90d' ? 3 : 1; // sample every 3 days if 90d to prevent clutter

    for (let i = days - 1; i >= 0; i -= step) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const isoDate = dayKey(d);
      const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      
      let rev = 0;
      if (step === 1) {
        rev = dateMap.get(isoDate) || 0;
      } else {
        // Sum window
        for (let s = 0; s < step; s++) {
          const windowDate = dayKey(new Date(d.getTime() + s * 24 * 60 * 60 * 1000));
          rev += dateMap.get(windowDate) || 0;
        }
      }
      result.push({ label, date: isoDate, revenue: rev });
    }

    return result;
  }, [analytics?.revenue?.graph, selectedPeriod]);

  const maxRevenueInChart = useMemo(() => {
    const maxVal = Math.max(...chartData.map((d) => d.revenue), 0);
    return maxVal === 0 ? 1000 : maxVal;
  }, [chartData]);

  const peakDay = useMemo(() => {
    if (chartData.length === 0) return null;
    return chartData.reduce((prev, curr) => (curr.revenue > prev.revenue ? curr : prev), chartData[0]);
  }, [chartData]);

  // A day can earn less than nothing (a small order whose Nuray rider cost more than its dishes): the tooltip says so, the drawing stays on its axis.
  const plotHeight = (revenue: number) => (Math.max(0, revenue) / maxRevenueInChart) * 220;

  if (!isAuthenticated) {
    return null;
  }

  const periodWords = PERIODS.find((p) => p.id === selectedPeriod)?.words ?? '';
  const noSales = totalRevenue === 0 && chartData.every((d) => d.revenue === 0);
  const cancelledShare = totalOrders > 0 ? ((cancelledOrders / totalOrders) * 100).toFixed(1) : '0';
  const stepX = 920 / Math.max(1, chartData.length);
  const xAt = (i: number) => 55 + i * stepX + stepX / 2;
  const showTooltip = (d: { label: string; revenue: number }, cx: number, y: number) =>
    setActiveTooltip({ date: d.label, revenue: d.revenue, x: ((cx - 40) / 940) * 100, y: y * (288 / 300) - 10 });

  return (
    <DashboardLayout
      title="Reports"
      subtitle="What you sold and what you earned"
      sidebarItems={SELLER_SIDEBAR_ITEMS}
      userType="seller"
    >
      <div className="max-w-6xl mx-auto">
        <div className="flex items-end justify-between gap-4 border-b border-line mb-6">
          <div role="tablist" aria-label="Time period" className="flex gap-5 sm:gap-6 overflow-x-auto [scrollbar-width:none]">
            {PERIODS.map((p) => {
              const selected = selectedPeriod === p.id;
              return (
                <button
                  key={p.id}
                  id={`period-btn-${p.id}`}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setSelectedPeriod(p.id)}
                  disabled={loading}
                  className={`-mb-px min-h-11 pb-1 text-[15px] whitespace-nowrap border-b-2 transition-colors disabled:cursor-wait ${
                    selected ? 'border-brand-600 text-ink font-semibold' : 'border-transparent text-muted hover:text-ink'
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => loadAnalytics(selectedPeriod)}
            disabled={loading}
            aria-label="Refresh"
            className="shrink-0 mb-1 inline-flex items-center gap-1.5 min-h-11 px-2 rounded-lg text-sm font-medium text-muted hover:text-ink disabled:cursor-wait focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand/40"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'motion-safe:animate-spin' : ''}`} aria-hidden="true" />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>

        {Boolean(error) && analytics && (
          <LoadError compact error={error} onRetry={() => loadAnalytics(selectedPeriod)} title="We couldn't refresh your sales" className="mb-6" />
        )}

        {loading && !analytics ? (
          <div className="py-24 text-center" role="status">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-line border-t-brand-600 mx-auto mb-4" />
            <p className="text-sm text-muted">Loading your sales…</p>
          </div>
        ) : !analytics ? (
          // Nothing could be read: no figures, which would read "Rs 0" and "0 sold".
          error ? <LoadError error={error} onRetry={() => loadAnalytics(selectedPeriod)} title="We couldn't load your sales" /> : null
        ) : (
          <>
            <dl className="grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-6 mb-8">
              <div>
                <dt className="text-sm text-muted">Earned</dt>
                <dd className="text-2xl font-semibold text-ink tabular-nums mt-0.5">{formatPrice(totalRevenue)}</dd>
                <dd className="text-xs text-muted mt-1 tabular-nums">
                  Today {formatPrice(analytics.revenue?.today ?? 0)}, this month {formatPrice(analytics.revenue?.thisMonth ?? 0)}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-muted">Dishes sold</dt>
                <dd className="text-2xl font-semibold text-ink tabular-nums mt-0.5">{totalUnits}</dd>
                <dd className="text-xs text-muted mt-1 tabular-nums">
                  Today {analytics.unitsSold?.today ?? 0}, this week {analytics.unitsSold?.thisWeek ?? 0}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-muted">Orders delivered</dt>
                <dd className="text-2xl font-semibold text-ink tabular-nums mt-0.5">
                  {completedOrders}
                  <span className="text-sm font-normal text-muted"> of {totalOrders}</span>
                </dd>
                <dd className="text-xs text-muted mt-1 tabular-nums">
                  {totalOrders > 0 ? `${fulfillmentRate}% of your orders` : 'No orders yet'}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-muted">Average you earn per order</dt>
                <dd className="text-2xl font-semibold text-ink tabular-nums mt-0.5">{formatPrice(averageOrderValue)}</dd>
                <dd className="text-xs text-muted mt-1">From your dishes, after Nuray&apos;s fee</dd>
              </div>
            </dl>

            <section className="border-t border-line pt-6 mb-10">
              <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 mb-4">
                <div>
                  <h2 className="text-sm font-semibold text-ink">
                    {selectedPeriod === '1y' ? 'Earnings by month' : 'Earnings by day'}
                  </h2>
                  {!noSales && (
                    <p className="text-xs text-muted mt-0.5 tabular-nums">
                      {peakDay && peakDay.revenue > 0
                        ? `Best ${selectedPeriod === '1y' ? 'month' : 'day'}: ${peakDay.label}, ${formatPrice(peakDay.revenue)}`
                        : periodWords}
                    </p>
                  )}
                </div>
                {!noSales && (
                  <div role="group" aria-label="Chart style" className="flex rounded-lg border border-line p-0.5 text-xs">
                    {(['bar', 'line'] as const).map((view) => (
                      <button
                        key={view}
                        type="button"
                        aria-pressed={chartView === view}
                        onClick={() => setChartView(view)}
                        className={`min-h-10 px-3 rounded-md transition-colors ${
                          chartView === view ? 'bg-raised text-ink font-semibold' : 'text-muted hover:text-ink'
                        }`}
                      >
                        {view === 'bar' ? 'Bars' : 'Line'}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {noSales ? (
                <p className="text-sm text-muted">
                  No sales in {periodWords.toLowerCase()}.{' '}
                  <Link
                    href="/sellers/products"
                    className="inline-flex items-center min-h-11 font-semibold text-brand-ink underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand/40 rounded"
                  >
                    Check your dishes
                  </Link>
                </p>
              ) : (
                <div className="relative">
                  {activeTooltip && (
                    <div
                      className="absolute z-20 pointer-events-none bg-surface border border-line text-xs rounded-lg px-2.5 py-1.5 shadow-[var(--shadow-card)] -translate-x-1/2 -translate-y-full"
                      style={{ left: `${activeTooltip.x}%`, top: `${activeTooltip.y}px` }}
                    >
                      <p className="text-muted">{activeTooltip.date}</p>
                      <p className="font-semibold text-ink tabular-nums">{formatPrice(activeTooltip.revenue)}</p>
                    </div>
                  )}

                  <div className="relative w-full h-56 sm:h-72 select-none">
                    <svg viewBox="0 0 1000 300" preserveAspectRatio="none" className="w-full h-full overflow-visible">
                      {[0, 0.5, 1].map((ratio) => {
                        const y = 260 - ratio * 220;
                        return (
                          <line key={ratio} x1="40" y1={y} x2="980" y2={y} stroke={ratio === 0 ? 'var(--border-rule)' : 'var(--border-hair)'} strokeWidth="1" vectorEffect="non-scaling-stroke" />
                        );
                      })}

                      {chartView === 'bar' &&
                        chartData.map((d, i) => {
                          const barWidth = Math.max(6, Math.min(28, stepX * 0.6));
                          const cx = xAt(i);
                          const barHeight = d.revenue > 0 ? Math.max(3, plotHeight(d.revenue)) : 0;
                          const y = 260 - barHeight;
                          return (
                            <g
                              key={d.date}
                              className="cursor-pointer"
                              onMouseEnter={() => showTooltip(d, cx, y)}
                              onMouseLeave={() => setActiveTooltip(null)}
                            >
                              <rect x={cx - stepX / 2} y={40} width={stepX} height={220} fill="transparent" />
                              <rect
                                x={cx - barWidth / 2}
                                y={y}
                                width={barWidth}
                                height={barHeight}
                                rx={2}
                                fill="var(--color-brand-600)"
                                className="hover:opacity-80"
                              />
                            </g>
                          );
                        })}

                      {chartView === 'line' && (
                        <>
                          <path
                            d={`M ${xAt(0)} 260 ${chartData.map((d, i) => `L ${xAt(i)} ${260 - plotHeight(d.revenue)}`).join(' ')} L ${xAt(chartData.length - 1)} 260 Z`}
                            fill="var(--color-brand-600)"
                            fillOpacity="0.08"
                          />
                          <path
                            d={chartData.map((d, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i)} ${260 - plotHeight(d.revenue)}`).join(' ')}
                            fill="none"
                            stroke="var(--color-brand-600)"
                            strokeWidth="2"
                            vectorEffect="non-scaling-stroke"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          {chartData.map((d, i) => {
                            const cx = xAt(i);
                            const y = 260 - plotHeight(d.revenue);
                            return (
                              <rect
                                key={d.date}
                                x={cx - stepX / 2}
                                y={40}
                                width={stepX}
                                height={220}
                                fill="transparent"
                                className="cursor-pointer"
                                onMouseEnter={() => showTooltip(d, cx, y)}
                                onMouseLeave={() => setActiveTooltip(null)}
                              />
                            );
                          })}
                        </>
                      )}

                    </svg>
                    {/* Words sit outside the stretched drawing so they are not squashed on a narrow screen. */}
                    {[0, 0.5, 1].map((ratio) => {
                      const labelValue = Math.round(maxRevenueInChart * ratio);
                      return (
                        <span
                          key={ratio}
                          className="absolute start-0 w-[3.5%] min-w-7 -translate-y-1/2 text-end text-[11px] text-muted tabular-nums"
                          style={{ top: `${((260 - ratio * 220) / 300) * 100}%` }}
                        >
                          {labelValue >= 1000 ? `${(labelValue / 1000).toFixed(labelValue < 10000 ? 1 : 0)}k` : labelValue}
                        </span>
                      );
                    })}
                    {chartData.map((d, i) => {
                      const total = chartData.length;
                      const modulo = total > 12 ? Math.ceil(total / 5) : total > 7 ? 2 : 1;
                      if (i % modulo !== 0) return null;
                      return (
                        <span
                          key={d.date}
                          className="absolute bottom-0 -translate-x-1/2 whitespace-nowrap text-[11px] text-muted"
                          style={{ left: `${(xAt(i) / 1000) * 100}%` }}
                        >
                          {d.label}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
            </section>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-12 gap-y-10">
              <section className="pt-3 border-t border-line">
                <div className="flex items-center justify-between gap-3 mb-1">
                  <h2 className="text-sm font-semibold text-ink">Orders</h2>
                  <Link href="/sellers/orders" className="inline-flex items-center min-h-11 px-2 -me-2 text-sm font-semibold text-brand-ink rounded-lg hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand/40">
                    See orders
                  </Link>
                </div>
                <dl className="divide-y divide-line text-sm">
                  <div className="flex items-center justify-between py-2.5">
                    <dt className="text-muted">Delivered and paid</dt>
                    <dd className="font-semibold text-ink tabular-nums">{completedOrders}</dd>
                  </div>
                  <div className="flex items-center justify-between py-2.5">
                    <dt className="text-muted">Being made or on the way</dt>
                    <dd className="font-semibold text-ink tabular-nums">{inProgressOrders}</dd>
                  </div>
                  {awaitingPaymentOrders > 0 && (
                    <div className="flex items-center justify-between py-2.5">
                      <dt className="text-muted">Delivered, payment not in yet</dt>
                      <dd>
                        <span className="rounded-full px-2 py-0.5 text-xs font-medium bg-accent-soft text-accent-soft-ink tabular-nums">{awaitingPaymentOrders}</span>
                      </dd>
                    </div>
                  )}
                  <div className="flex items-center justify-between py-2.5">
                    <dt className="text-muted">Cancelled or refunded</dt>
                    <dd className={`font-semibold tabular-nums ${cancelledOrders > 0 ? 'text-red-700' : 'text-ink'}`}>
                      {cancelledOrders}
                      {cancelledOrders > 0 && <span className="font-normal text-muted"> ({cancelledShare}%)</span>}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between py-2.5">
                    <dt className="text-ink font-medium">All orders</dt>
                    <dd className="font-semibold text-ink tabular-nums">{totalOrders}</dd>
                  </div>
                </dl>
              </section>

              <section className="pt-3 border-t border-line">
                <div className="flex items-center justify-between gap-3 mb-1">
                  <h2 className="text-sm font-semibold text-ink">Best-selling dishes</h2>
                  <Link href="/sellers/products" className="inline-flex items-center min-h-11 px-2 -me-2 text-sm font-semibold text-brand-ink rounded-lg hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand/40">
                    Your dishes
                  </Link>
                </div>
                {(!analytics.topProducts || analytics.topProducts.length === 0) ? (
                  <p className="py-6 text-sm text-muted">Your dishes will be ranked here by what they earn, once they sell.</p>
                ) : (
                  <ol className="divide-y divide-line">
                    {analytics.topProducts.map((product, idx) => {
                      const productRevenue = Number(product.revenue);
                      const revenueShare = dishRevenue > 0 ? Math.round((productRevenue / dishRevenue) * 100) : 0;
                      const sales = product.sales != null ? Number(product.sales) : null;
                      return (
                        <li key={idx} className="py-3">
                          <div className="flex items-baseline justify-between gap-3">
                            <p className="min-w-0 truncate text-sm text-ink">
                              <span className="inline-block w-5 text-muted tabular-nums">{idx + 1}</span>
                              <span className="font-medium">{product.name}</span>
                            </p>
                            <p className="shrink-0 text-sm font-semibold text-ink tabular-nums">{formatPrice(productRevenue)}</p>
                          </div>
                          <div className="ms-5 mt-1.5 h-1 rounded-full bg-raised overflow-hidden" aria-hidden="true">
                            <div style={{ width: `${revenueShare}%` }} className="h-full bg-brand-600 rounded-full" />
                          </div>
                          <p className="ms-5 mt-1.5 text-xs text-muted tabular-nums">
                            {product.quantity} sold{sales != null ? `, ${formatPrice(sales)} in sales` : ''}, {formatPrice(productRevenue)} to you ({revenueShare}% of what your dishes earned)
                          </p>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </section>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
