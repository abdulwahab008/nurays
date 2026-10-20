'use client';

/** The hub at a glance: temperature, stock, holds and expiries, freezer capacity, and shortcuts to the other tabs. */
import { formatTemp, isColdEnough, type BatchSummary, type ConsoleTab, type HubStats, type TempStats } from '@/lib/hub-console';

export default function OverviewTab({
  hubStats,
  batchSummary,
  tempStats,
  onOpenTab,
}: {
  hubStats: HubStats | null;
  batchSummary: BatchSummary | null;
  tempStats: TempStats | null;
  onOpenTab: (tab: ConsoleTab) => void;
}) {
  const temp = hubStats?.temperatureCelsius ?? null;
  return (
    <div className="space-y-6">
      {/* KPI METRIC CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Temp Gauge */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Core Temperature</span>
            <span className="text-lg">❄️</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span
              className={`text-2xl font-black font-mono ${
                temp === null ? 'text-gray-400' : isColdEnough(temp) ? 'text-emerald-600' : 'text-rose-600'
              }`}
            >
              {formatTemp(temp)}
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Threshold: <span className="font-semibold">≤ -18.0°C</span>
          </p>
        </div>

        {/* Sellable In Stock Units */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Sellable Units</span>
            <span className="text-lg">📦</span>
          </div>
          <div className="text-2xl font-black text-gray-900">
            {batchSummary?.totalSellableUnits ?? hubStats?.metrics.totalSellableUnits ?? 0}
          </div>
          <p className="text-xs text-emerald-600 font-medium mt-1">Active for hub customer delivery</p>
        </div>

        {/* Active Batches */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Active Batches</span>
            <span className="text-lg">📋</span>
          </div>
          <div className="text-2xl font-black text-cyan-700">{batchSummary?.availableCount ?? hubStats?.metrics.totalBatches ?? 0}</div>
          <p className="text-xs text-gray-500 mt-1">FEFO prioritized queues</p>
        </div>

        {/* Quarantined Batches */}
        <div
          className={`border rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow ${
            (batchSummary?.quarantinedCount ?? 0) > 0 ? 'bg-rose-50/60 border-rose-200' : 'bg-white border-gray-200'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Quarantined</span>
            <span className="text-lg">🛡️</span>
          </div>
          <div className={`text-2xl font-black ${(batchSummary?.quarantinedCount ?? 0) > 0 ? 'text-rose-600' : 'text-gray-900'}`}>
            {batchSummary?.quarantinedCount ?? hubStats?.metrics.quarantinedBatches ?? 0}
          </div>
          <p className="text-xs text-gray-500 mt-1">Cold breach or quality hold</p>
        </div>

        {/* Expiring Soon */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Expiring &lt; 7 Days</span>
            <span className="text-lg">⏳</span>
          </div>
          <div className={`text-2xl font-black ${(batchSummary?.expiringSoonCount ?? 0) > 0 ? 'text-amber-600' : 'text-gray-900'}`}>
            {batchSummary?.expiringSoonCount ?? hubStats?.metrics.expiringSoonBatches ?? 0}
          </div>
          <p className="text-xs text-gray-500 mt-1">Immediate dispatch priority</p>
        </div>
      </div>

      {/* STORAGE CAPACITY UTILIZATION */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-base font-bold text-gray-900">Physical Freezer Capacity & Volume</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Storage unit layout across {hubStats?.freezerUnits ?? '—'} commercial sub-zero industrial chest/walk-in units
            </p>
          </div>
          <div className="text-end">
            <span className="text-lg font-black text-cyan-700">{hubStats ? `${hubStats.currentUtilization}%` : '—'}</span>
            <span className="text-xs text-gray-500 ms-1">Allocated</span>
          </div>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
          <div
            className="bg-gradient-to-r from-cyan-500 to-blue-600 h-full rounded-full transition-all duration-500"
            style={{ width: `${hubStats ? Math.min(100, Math.max(10, hubStats.currentUtilization)) : 0}%` }}
          />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4 pt-4 border-t border-gray-100 text-xs text-gray-600">
          <div>
            <span className="text-gray-500 block">Total Volume:</span>
            <span className="font-semibold text-gray-800">
              {hubStats?.capacityCubicFeet != null ? hubStats.capacityCubicFeet.toLocaleString() : '—'} cu ft
            </span>
          </div>
          <div>
            <span className="text-gray-500 block">Freezer Units:</span>
            <span className="font-semibold text-gray-800">{hubStats?.freezerUnits ?? '—'} Freezers Active</span>
          </div>
          <div>
            <span className="text-gray-500 block">Operating Hours:</span>
            <span className="font-semibold text-gray-800">24/7 Cold-Chain Active</span>
          </div>
          <div>
            <span className="text-gray-500 block">Intake Compliance:</span>
            <span className="font-semibold text-emerald-600">{tempStats ? `${tempStats.complianceRate}% Sub-Zero Pass` : '—'}</span>
          </div>
        </div>
      </div>

      {/* QUICK ACTIONS BANNER */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div
          onClick={() => onOpenTab('intake')}
          className="bg-gradient-to-br from-cyan-900 to-slate-900 text-white p-6 rounded-2xl cursor-pointer hover:shadow-lg transition-all group"
        >
          <div className="text-3xl mb-3 group-hover:scale-110 transition-transform">📦</div>
          <h4 className="font-bold text-base text-cyan-200">Receive Batch Intake</h4>
          <p className="text-xs text-slate-300 mt-1">Log physical shipment, probe temperature at arrival, and slot into freezer shelf.</p>
          <span className="inline-block mt-4 text-xs font-semibold text-cyan-400 group-hover:translate-x-1 transition-transform">
            Launch Intake Form ➔
          </span>
        </div>

        <div
          onClick={() => onOpenTab('fefo')}
          className="bg-gradient-to-br from-slate-900 to-indigo-950 text-white p-6 rounded-2xl cursor-pointer hover:shadow-lg transition-all group"
        >
          <div className="text-3xl mb-3 group-hover:scale-110 transition-transform">❄️</div>
          <h4 className="font-bold text-base text-indigo-200">Inspect FEFO Dispatch Queue</h4>
          <p className="text-xs text-slate-300 mt-1">
            View batches ordered strictly by expiration date. Review shelf-life warnings and holds.
          </p>
          <span className="inline-block mt-4 text-xs font-semibold text-indigo-400 group-hover:translate-x-1 transition-transform">
            View FEFO Batches ➔
          </span>
        </div>

        <div
          onClick={() => onOpenTab('temperature')}
          className="bg-gradient-to-br from-slate-900 to-emerald-950 text-white p-6 rounded-2xl cursor-pointer hover:shadow-lg transition-all group"
        >
          <div className="text-3xl mb-3 group-hover:scale-110 transition-transform">🌡️</div>
          <h4 className="font-bold text-base text-emerald-200">Temperature Probe Audit</h4>
          <p className="text-xs text-slate-300 mt-1">
            Record digital thermometer probe readings. Inspect automated cold-chain breach alerts.
          </p>
          <span className="inline-block mt-4 text-xs font-semibold text-emerald-400 group-hover:translate-x-1 transition-transform">
            Record Probe Reading ➔
          </span>
        </div>
      </div>
    </div>
  );
}
