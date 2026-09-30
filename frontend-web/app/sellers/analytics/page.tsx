'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { DashboardLayout, SELLER_SIDEBAR_ITEMS } from '@/components/layout/DashboardShell';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useAuthStore } from '@/lib/store/auth-store';
import { apiClient } from '@/lib/api-client';
import { formatPrice } from '@/lib/utils';

type PeriodType = '7d' | '30d' | '90d' | '1y';

interface AnalyticsData {
  sales: {
    today: number;
    thisWeek: number;
    thisMonth: number;
    total: number;
  };
  revenue: {
    today: number;
    thisWeek: number;
    thisMonth: number;
    total: number;
    graph?: Array<{ date: string; revenue: number }>;
  };
  orders: {
    total: number;
    completed: number;
    cancelled: number;
  };
  topProducts: Array<{
    name: string;
    quantity: number;
    revenue: number;
  }>;
}

export default function SellerAnalyticsPage() {
  const router = useRouter();
  const { isAuthenticated, user } = useAuthStore();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodType>('30d');
  const [chartView, setChartView] = useState<'bar' | 'line'>('bar');
  const [activeTooltip, setActiveTooltip] = useState<{
    date: string;
    revenue: number;
    x: number;
    y: number;
  } | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }

    if (user?.userType !== 'seller' && user?.user_type !== 'seller') {
      router.push('/dashboard');
      showToast('Access denied. Seller privileges required.', 'error');
      return;
    }

    loadAnalytics(selectedPeriod);
  }, [isAuthenticated, user, router, selectedPeriod]);

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
    } catch (err: any) {
      console.error('Failed to load analytics:', err);
      const message =
        err.response?.data?.error?.message ||
        err.response?.data?.message ||
        err.message ||
        'Failed to fetch seller analytics';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  // Compute calculated metrics
  const totalRevenue = analytics?.revenue?.total ?? 0;
  const totalUnits = analytics?.sales?.total ?? 0;
  const totalOrders = analytics?.orders?.total ?? 0;
  const completedOrders = analytics?.orders?.completed ?? 0;
  const cancelledOrders = analytics?.orders?.cancelled ?? 0;
  const inProgressOrders = Math.max(0, totalOrders - completedOrders - cancelledOrders);

  const fulfillmentRate = totalOrders > 0
    ? Math.round((completedOrders / totalOrders) * 100)
    : 100;

  const averageOrderValue = completedOrders > 0
    ? Math.round(totalRevenue / completedOrders)
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
      const isoDate = d.toISOString().split('T')[0];
      const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      
      let rev = 0;
      if (step === 1) {
        rev = dateMap.get(isoDate) || 0;
      } else {
        // Sum window
        for (let s = 0; s < step; s++) {
          const windowDate = new Date(d.getTime() + s * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
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

  if (!isAuthenticated) {
    return null;
  }

  return (
    <DashboardLayout
      title="Analytics"
      subtitle="Sales, orders, and revenue trends"
      sidebarItems={SELLER_SIDEBAR_ITEMS}
      userType="seller"
    >
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Top Control Bar: Period Filter & Refresh */}
        <div className="bg-white rounded-2xl p-3 sm:p-4 border border-slate-200 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <h2 className="text-sm font-bold text-slate-900 tracking-tight">
              Performance Overview
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            {/* Period Pills */}
            <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-semibold">
              {(
                [
                  { id: '7d', label: '7D' },
                  { id: '30d', label: '30D' },
                  { id: '90d', label: '90D' },
                  { id: '1y', label: '1Y' },
                ] as const
              ).map((p) => (
                <button
                  key={p.id}
                  id={`period-btn-${p.id}`}
                  onClick={() => setSelectedPeriod(p.id)}
                  disabled={loading}
                  className={`px-3 py-1.5 rounded-lg transition-all ${
                    selectedPeriod === p.id
                      ? 'bg-slate-900 text-white shadow-xs font-bold'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => loadAnalytics(selectedPeriod)}
              disabled={loading}
              className="rounded-xl border-slate-200 text-xs hover:bg-slate-50"
            >
              <svg
                className={`w-3.5 h-3.5 mr-1 text-slate-500 ${loading ? 'animate-spin' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh
            </Button>
          </div>
        </div>

        {/* Error Alert with Retry */}
        {error && (
          <div className="bg-rose-50 border border-rose-200 rounded-2xl p-5 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <span className="w-8 h-8 rounded-xl bg-rose-500 text-white flex items-center justify-center font-bold text-base shrink-0">
                ✕
              </span>
              <div>
                <h3 className="text-sm font-bold text-rose-900">Analytics Service Alert</h3>
                <p className="text-xs text-rose-700 mt-0.5">{error}</p>
              </div>
            </div>
            <Button
              size="sm"
              onClick={() => loadAnalytics(selectedPeriod)}
              className="bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl"
            >
              Retry Connection
            </Button>
          </div>
        )}

        {/* Loading Skeleton or Content */}
        {loading && !analytics ? (
          <div className="bg-white rounded-3xl p-16 border border-slate-200 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500 mx-auto mb-4"></div>
            <h3 className="text-base font-bold text-slate-900">Aggregating Kitchen Telemetry...</h3>
            <p className="text-xs text-slate-400 mt-1">Calculating sales velocity, gross margins, and order fulfillment</p>
          </div>
        ) : (
          <>
            {/* 4 Core KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Card 1: Period Revenue */}
              <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm hover:shadow-md transition-all duration-200 relative overflow-hidden group">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-black uppercase tracking-wider text-slate-500">
                    Net Revenue ({selectedPeriod})
                  </span>
                  <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold text-base shadow-sm">
                    ₨
                  </div>
                </div>
                <div className="text-3xl font-black text-slate-900 tracking-tight">
                  {formatPrice(totalRevenue)}
                </div>
                <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 font-medium">
                  <span>Today: <strong className="text-slate-900">{formatPrice(analytics?.revenue?.today ?? 0)}</strong></span>
                  <span>Month: <strong className="text-slate-900">{formatPrice(analytics?.revenue?.thisMonth ?? 0)}</strong></span>
                </div>
              </div>

              {/* Card 2: Units Sold */}
              <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm hover:shadow-md transition-all duration-200 group">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-black uppercase tracking-wider text-slate-500">
                    Dishes Sold ({selectedPeriod})
                  </span>
                  <div className="w-10 h-10 rounded-2xl bg-orange-50 text-orange-600 flex items-center justify-center font-bold text-base shadow-sm">
                    🍽️
                  </div>
                </div>
                <div className="text-3xl font-black text-slate-900 tracking-tight">
                  {totalUnits} <span className="text-sm font-semibold text-slate-400">units</span>
                </div>
                <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 font-medium">
                  <span>Today: <strong className="text-slate-900">{analytics?.sales?.today ?? 0} sold</strong></span>
                  <span>Week: <strong className="text-slate-900">{analytics?.sales?.thisWeek ?? 0} sold</strong></span>
                </div>
              </div>

              {/* Card 3: Fulfillment Health */}
              <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm hover:shadow-md transition-all duration-200 group">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-black uppercase tracking-wider text-slate-500">
                    Fulfillment Rate
                  </span>
                  <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-base shadow-sm">
                    📦
                  </div>
                </div>
                <div className="text-3xl font-black text-slate-900 tracking-tight">
                  {fulfillmentRate}%
                </div>
                <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                  <span className="text-slate-500">
                    {completedOrders} completed of {totalOrders}
                  </span>
                  <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                    fulfillmentRate >= 95
                      ? 'bg-emerald-100 text-emerald-800'
                      : fulfillmentRate >= 80
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-rose-100 text-rose-800'
                  }`}>
                    {fulfillmentRate >= 95 ? 'Excellent' : fulfillmentRate >= 80 ? 'Good' : 'Needs Review'}
                  </span>
                </div>
              </div>

              {/* Card 4: Average Order Value (AOV) */}
              <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm hover:shadow-md transition-all duration-200 group">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-black uppercase tracking-wider text-slate-500">
                    Avg. Order Value (AOV)
                  </span>
                  <div className="w-10 h-10 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold text-base shadow-sm">
                    📈
                  </div>
                </div>
                <div className="text-3xl font-black text-slate-900 tracking-tight">
                  {formatPrice(averageOrderValue)}
                </div>
                <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 font-medium">
                  <span>Per completed order</span>
                  <span>Active in kitchen: <strong className="text-purple-600">{inProgressOrders}</strong></span>
                </div>
              </div>
            </div>

            {/* Interactive Revenue Chart & Sales Trajectory */}
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-8">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6 pb-6 border-b border-slate-100">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-black text-slate-900 tracking-tight">
                      Revenue Velocity & Trajectory
                    </h3>
                    <span className="px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-[10px] font-bold">
                      PKR Daily
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">
                    Interactive daily earnings progression across the selected time horizon
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  {peakDay && peakDay.revenue > 0 && (
                    <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-bold">
                      <span>🏆 Peak Day:</span>
                      <span className="font-semibold">{peakDay.label} ({formatPrice(peakDay.revenue)})</span>
                    </div>
                  )}

                  {/* Chart Style Switcher */}
                  <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-bold">
                    <button
                      type="button"
                      onClick={() => setChartView('bar')}
                      className={`px-3 py-1.5 rounded-lg transition-all ${
                        chartView === 'bar' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'
                      }`}
                    >
                      Bars
                    </button>
                    <button
                      type="button"
                      onClick={() => setChartView('line')}
                      className={`px-3 py-1.5 rounded-lg transition-all ${
                        chartView === 'line' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'
                      }`}
                    >
                      Wave
                    </button>
                  </div>
                </div>
              </div>

              {/* Chart Body */}
              {totalRevenue === 0 && chartData.every((d) => d.revenue === 0) ? (
                <div className="py-16 text-center border-2 border-dashed border-slate-200 rounded-2xl">
                  <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3 text-2xl">
                    📊
                  </div>
                  <h4 className="text-base font-bold text-slate-900">No Sales Recorded in this Horizon</h4>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 font-medium">
                    When customers purchase meals and dishes from your kitchen, your daily revenue timeline will render here.
                  </p>
                  <Link href="/sellers/products" className="inline-block mt-4">
                    <Button size="sm" className="bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl">
                      Manage Food Catalog →
                    </Button>
                  </Link>
                </div>
              ) : (
                <div className="relative">
                  {/* Tooltip Overlay */}
                  {activeTooltip && (
                    <div
                      className="absolute z-20 pointer-events-none bg-slate-900 text-white text-xs rounded-xl p-2.5 shadow-xl transition-all duration-75 -translate-x-1/2 -translate-y-full mb-2"
                      style={{ left: `${activeTooltip.x}%`, top: `${activeTooltip.y}px` }}
                    >
                      <p className="font-semibold text-slate-400 text-[10px]">{activeTooltip.date}</p>
                      <p className="font-bold text-emerald-400 text-sm mt-0.5">{formatPrice(activeTooltip.revenue)}</p>
                      <div className="w-2 h-2 bg-slate-900 rotate-45 absolute -bottom-1 left-1/2 -translate-x-1/2" />
                    </div>
                  )}

                  {/* SVG Chart */}
                  <div className="w-full h-64 sm:h-72 select-none">
                    <svg
                      viewBox="0 0 1000 300"
                      preserveAspectRatio="none"
                      className="w-full h-full overflow-visible"
                    >
                      <defs>
                        <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#10B981" stopOpacity="0.35" />
                          <stop offset="100%" stopColor="#10B981" stopOpacity="0.0" />
                        </linearGradient>
                        <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#10B981" />
                          <stop offset="100%" stopColor="#059669" />
                        </linearGradient>
                      </defs>

                      {/* Horizontal Grid lines */}
                      {[0, 0.25, 0.5, 0.75, 1].map((ratio, idx) => {
                        const y = 260 - ratio * 220;
                        const labelValue = Math.round(maxRevenueInChart * ratio);
                        return (
                          <g key={idx}>
                            <line
                              x1="40"
                              y1={y}
                              x2="980"
                              y2={y}
                              stroke="#F1F5F9"
                              strokeWidth="1.5"
                              strokeDasharray={idx === 0 ? '0' : '4 4'}
                            />
                            <text
                              x="35"
                              y={y + 4}
                              textAnchor="end"
                              className="text-[11px] fill-slate-400 font-medium"
                            >
                              ₨{labelValue >= 1000 ? `${(labelValue / 1000).toFixed(0)}k` : labelValue}
                            </text>
                          </g>
                        );
                      })}

                      {/* Bar View */}
                      {chartView === 'bar' &&
                        chartData.map((d, i) => {
                          const totalBars = chartData.length;
                          const usableWidth = 920;
                          const barWidth = Math.max(6, Math.min(28, (usableWidth / totalBars) * 0.65));
                          const stepX = usableWidth / totalBars;
                          const cx = 55 + i * stepX + stepX / 2;
                          const barHeight = Math.max(4, (d.revenue / maxRevenueInChart) * 220);
                          const y = 260 - barHeight;

                          return (
                            <g
                              key={i}
                              className="cursor-pointer group/bar"
                              onMouseEnter={() => {
                                setActiveTooltip({
                                  date: d.date,
                                  revenue: d.revenue,
                                  x: ((cx - 40) / 940) * 100,
                                  y: y * (288 / 300) - 10,
                                });
                              }}
                              onMouseLeave={() => setActiveTooltip(null)}
                            >
                              <rect
                                x={cx - barWidth / 2}
                                y={y}
                                width={barWidth}
                                height={barHeight}
                                rx={barWidth / 3}
                                fill={d.revenue > 0 ? 'url(#barGradient)' : '#E2E8F0'}
                                className="transition-all duration-150 hover:opacity-80"
                              />
                            </g>
                          );
                        })}

                      {/* Wave / Line View */}
                      {chartView === 'line' && (
                        <>
                          {/* Area fill */}
                          <path
                            d={`
                              M 55 260
                              ${chartData
                                .map((d, i) => {
                                  const stepX = 920 / chartData.length;
                                  const cx = 55 + i * stepX + stepX / 2;
                                  const y = 260 - (d.revenue / maxRevenueInChart) * 220;
                                  return `L ${cx} ${y}`;
                                })
                                .join(' ')}
                              L 965 260 Z
                            `}
                            fill="url(#chartGradient)"
                          />

                          {/* Line stroke */}
                          <path
                            d={`
                              ${chartData
                                .map((d, i) => {
                                  const stepX = 920 / chartData.length;
                                  const cx = 55 + i * stepX + stepX / 2;
                                  const y = 260 - (d.revenue / maxRevenueInChart) * 220;
                                  return `${i === 0 ? 'M' : 'L'} ${cx} ${y}`;
                                })
                                .join(' ')}
                            `}
                            fill="none"
                            stroke="#10B981"
                            strokeWidth="3.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />

                          {/* Data point dots */}
                          {chartData.map((d, i) => {
                            const stepX = 920 / chartData.length;
                            const cx = 55 + i * stepX + stepX / 2;
                            const y = 260 - (d.revenue / maxRevenueInChart) * 220;

                            return (
                              <circle
                                key={i}
                                cx={cx}
                                cy={y}
                                r={d.revenue > 0 ? 5 : 2}
                                fill={d.revenue > 0 ? '#10B981' : '#CBD5E1'}
                                stroke="#FFFFFF"
                                strokeWidth="2"
                                className="cursor-pointer hover:r-7 transition-all"
                                onMouseEnter={() => {
                                  setActiveTooltip({
                                    date: d.date,
                                    revenue: d.revenue,
                                    x: ((cx - 40) / 940) * 100,
                                    y: y * (288 / 300) - 10,
                                  });
                                }}
                                onMouseLeave={() => setActiveTooltip(null)}
                              />
                            );
                          })}
                        </>
                      )}

                      {/* X-Axis Tick Labels */}
                      {chartData.map((d, i) => {
                        // Sample dates so labels don't collide
                        const total = chartData.length;
                        const modulo = total > 20 ? Math.ceil(total / 7) : total > 10 ? 2 : 1;
                        if (i % modulo !== 0 && i !== total - 1) return null;

                        const stepX = 920 / total;
                        const cx = 55 + i * stepX + stepX / 2;

                        return (
                          <text
                            key={i}
                            x={cx}
                            y="285"
                            textAnchor="middle"
                            className="text-[10px] fill-slate-400 font-medium"
                          >
                            {d.label}
                          </text>
                        );
                      })}
                    </svg>
                  </div>
                </div>
              )}
            </div>

            {/* Bottom Grid: Order Fulfillment Health & Top Performing Dishes */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Card: Order Status & Kitchen Fulfillment Quality */}
              <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-lg">
                        🎯
                      </div>
                      <div>
                        <h3 className="text-base font-black text-slate-900 tracking-tight">
                          Kitchen Fulfillment Quality
                        </h3>
                        <p className="text-xs text-slate-500 font-medium">
                          Delivery completion & cancellation health
                        </p>
                      </div>
                    </div>
                    <Link href="/sellers/orders">
                      <Button variant="outline" size="sm" className="rounded-xl border-slate-200 font-bold text-xs">
                        Kitchen Orders →
                      </Button>
                    </Link>
                  </div>

                  {/* Multi-segment Progress Bar */}
                  <div className="my-6">
                    <div className="h-4 w-full bg-slate-100 rounded-full overflow-hidden flex shadow-inner">
                      <div
                        style={{ width: `${totalOrders > 0 ? (completedOrders / totalOrders) * 100 : 0}%` }}
                        className="bg-emerald-500 transition-all duration-500"
                        title={`Completed: ${completedOrders}`}
                      />
                      <div
                        style={{ width: `${totalOrders > 0 ? (inProgressOrders / totalOrders) * 100 : 0}%` }}
                        className="bg-purple-500 transition-all duration-500"
                        title={`In Kitchen: ${inProgressOrders}`}
                      />
                      <div
                        style={{ width: `${totalOrders > 0 ? (cancelledOrders / totalOrders) * 100 : 0}%` }}
                        className="bg-rose-500 transition-all duration-500"
                        title={`Cancelled: ${cancelledOrders}`}
                      />
                    </div>

                    <div className="flex items-center justify-between text-xs font-bold mt-2.5">
                      <div className="flex items-center gap-1.5 text-emerald-700">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                        <span>Completed ({completedOrders})</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-purple-700">
                        <span className="w-2.5 h-2.5 rounded-full bg-purple-500" />
                        <span>In Kitchen ({inProgressOrders})</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-rose-700">
                        <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                        <span>Cancelled ({cancelledOrders})</span>
                      </div>
                    </div>
                  </div>

                  {/* Metric Tiles */}
                  <div className="grid grid-cols-3 gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                    <div className="text-center">
                      <p className="text-[11px] font-bold text-slate-400 uppercase">Total Orders</p>
                      <p className="text-xl font-black text-slate-900 mt-0.5">{totalOrders}</p>
                    </div>
                    <div className="text-center border-x border-slate-200">
                      <p className="text-[11px] font-bold text-slate-400 uppercase">Success Rate</p>
                      <p className="text-xl font-black text-emerald-600 mt-0.5">{fulfillmentRate}%</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[11px] font-bold text-slate-400 uppercase">Dispute Rate</p>
                      <p className="text-xl font-black text-slate-900 mt-0.5">
                        {totalOrders > 0 ? ((cancelledOrders / totalOrders) * 100).toFixed(1) : 0}%
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 font-medium">
                  <span>💡 Fast cooking handoffs to riders protect your 5-star seller rating</span>
                </div>
              </div>

              {/* Card: Top Performing Dishes Matrix */}
              <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold text-lg">
                        🏆
                      </div>
                      <div>
                        <h3 className="text-base font-black text-slate-900 tracking-tight">
                          Top Performing Dishes
                        </h3>
                        <p className="text-xs text-slate-500 font-medium">
                          Best sellers ranked by total customer revenue contribution
                        </p>
                      </div>
                    </div>
                    <Link href="/sellers/products">
                      <Button variant="outline" size="sm" className="rounded-xl border-slate-200 font-bold text-xs">
                        View Menu →
                      </Button>
                    </Link>
                  </div>

                  {(!analytics?.topProducts || analytics.topProducts.length === 0) ? (
                    <div className="py-12 text-center border-2 border-dashed border-slate-200 rounded-2xl">
                      <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-2 text-xl">
                        🍽️
                      </div>
                      <p className="text-sm font-bold text-slate-800">No Food Sales in this Range</p>
                      <p className="text-xs text-slate-400 mt-0.5">Dishes ordered by buyers will rank here automatically</p>
                    </div>
                  ) : (
                    <div className="space-y-3 mt-4">
                      {analytics.topProducts.map((product, idx) => {
                        const productRevenue = Number(product.revenue);
                        const revenueShare = totalRevenue > 0
                          ? Math.round((productRevenue / totalRevenue) * 100)
                          : 0;
                        const avgPrice = product.quantity > 0
                          ? Math.round(productRevenue / product.quantity)
                          : 0;

                        return (
                          <div
                            key={idx}
                            className="p-3.5 bg-slate-50 hover:bg-slate-100/80 rounded-2xl border border-slate-100 transition-all"
                          >
                            <div className="flex items-center justify-between mb-1.5">
                              <div className="flex items-center gap-2.5 min-w-0">
                                <span
                                  className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-black shrink-0 ${
                                    idx === 0
                                      ? 'bg-amber-400 text-amber-950'
                                      : idx === 1
                                      ? 'bg-slate-300 text-slate-800'
                                      : idx === 2
                                      ? 'bg-orange-300 text-orange-950'
                                      : 'bg-slate-200 text-slate-600'
                                  }`}
                                >
                                  #{idx + 1}
                                </span>
                                <p className="font-bold text-slate-900 text-sm truncate">{product.name}</p>
                              </div>
                              <p className="font-black text-emerald-700 text-sm shrink-0">
                                {formatPrice(productRevenue)}
                              </p>
                            </div>

                            {/* Revenue Share Bar */}
                            <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden mb-2">
                              <div
                                style={{ width: `${revenueShare}%` }}
                                className="h-full bg-emerald-500 rounded-full"
                              />
                            </div>

                            <div className="flex items-center justify-between text-[11px] text-slate-500 font-medium">
                              <span>{product.quantity} portions sold</span>
                              <span>Avg: <strong className="text-slate-800">{formatPrice(avgPrice)}</strong>/unit</span>
                              <span className="font-bold text-slate-700">{revenueShare}% share</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 font-medium">
                  <span>💡 Consider creating meal combos for your top seller to increase AOV</span>
                </div>
              </div>
            </div>

            {/* Quick Action Dock */}
            <div className="bg-slate-900 text-white rounded-3xl p-6 sm:p-8 shadow-md">
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                <div>
                  <span className="px-3 py-1 rounded-full bg-orange-500 text-white font-bold text-[10px] uppercase tracking-wider">
                    Seller Studio Shortcuts
                  </span>
                  <h3 className="text-lg sm:text-xl font-black mt-2 tracking-tight">
                    Optimize Your Kitchen Operations
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-400 font-medium mt-1 max-w-xl">
                    Expand menus, launch promotional discounts, or review active orders to accelerate your sales velocity.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                  <Link href="/sellers/products/new">
                    <Button className="bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs rounded-xl px-4 py-2.5">
                      + Add New Dish
                    </Button>
                  </Link>
                  <Link href="/sellers/promotions">
                    <Button variant="outline" className="bg-slate-800 border-slate-700 text-white hover:bg-slate-700 font-bold text-xs rounded-xl px-4 py-2.5">
                      Discount Code
                    </Button>
                  </Link>
                  <Link href="/sellers/earnings">
                    <Button variant="outline" className="bg-slate-800 border-slate-700 text-white hover:bg-slate-700 font-bold text-xs rounded-xl px-4 py-2.5">
                      Request Payout
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
