'use client';

/** Which hub, its live temperature (or that there is no reading yet), Sync, and the four tabs. */
import { Button } from '@/components/ui/button';
import { formatTemp, isColdEnough, type BatchSummary, type ConsoleTab, type Hub, type HubStats, type TempStats } from '@/lib/hub-console';

export default function CommandBar({
  hubs,
  selectedHubId,
  onHubChange,
  hubStats,
  batchSummary,
  tempStats,
  refreshing,
  onSync,
  activeTab,
  onTab,
}: {
  hubs: Hub[];
  selectedHubId: string;
  onHubChange: (hubId: string) => void;
  hubStats: HubStats | null;
  batchSummary: BatchSummary | null;
  tempStats: TempStats | null;
  refreshing: boolean;
  onSync: () => void;
  activeTab: ConsoleTab;
  onTab: (tab: ConsoleTab) => void;
}) {
  const temp = hubStats?.temperatureCelsius ?? null;
  return (
    <>
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 text-white shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-2xl shadow-inner">
            ❄️
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs uppercase tracking-wider font-semibold text-cyan-400 bg-cyan-950/80 border border-cyan-800 px-2.5 py-0.5 rounded-full">
                Fulfillment Hub
              </span>
              {hubs.length > 1 ? (
                <select
                  value={selectedHubId}
                  onChange={(e) => onHubChange(e.target.value)}
                  className="bg-slate-800 border border-slate-700 text-sm font-semibold rounded-lg px-2.5 py-1 text-white focus:ring-2 focus:ring-cyan-500 outline-none"
                >
                  {hubs.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.name} ({h.city})
                    </option>
                  ))}
                </select>
              ) : (
                <h2 className="text-xl font-bold tracking-tight text-slate-100">
                  {hubStats?.name || hubs.find((h) => h.id === selectedHubId)?.name || '—'}
                </h2>
              )}
              <span className="text-xs text-slate-400 font-mono">
                [{hubStats?.code || hubs.find((h) => h.id === selectedHubId)?.code || '—'}]
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1 flex items-center gap-1.5">
              <span>📍 {hubStats?.address || '—'}</span>
              <span>•</span>
              <span>Capacity: {hubStats?.capacityCubicFeet != null ? hubStats.capacityCubicFeet.toLocaleString() : '—'} cu ft</span>
            </p>
          </div>
        </div>

        {/* Sub-Zero Compliance Live Indicator */}
        <div className="flex items-center gap-3 self-stretch sm:self-auto justify-between sm:justify-end">
          <div
            className={`flex items-center gap-2.5 px-4 py-2 rounded-xl border font-mono text-sm font-semibold shadow-sm transition-all ${
              temp === null
                ? 'bg-slate-800 border-slate-700 text-slate-300'
                : isColdEnough(temp)
                  ? 'bg-emerald-950/50 border-emerald-500/40 text-emerald-300'
                  : 'bg-rose-950/70 border-rose-500/50 text-rose-300 animate-pulse'
            }`}
          >
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                temp === null
                  ? 'bg-slate-500'
                  : isColdEnough(temp)
                    ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]'
                    : 'bg-rose-500 shadow-[0_0_8px_#f43f5e]'
              }`}
            />
            <span>{formatTemp(temp)}</span>
            <span className="text-xs font-sans tracking-normal opacity-90">
              {temp === null ? 'No reading yet' : isColdEnough(temp) ? 'Sub-Zero Frost (Optimal)' : '⚠️ Cold Chain Breach'}
            </span>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={onSync}
            disabled={refreshing}
            className="border-slate-700 text-slate-200 hover:bg-slate-800 text-xs flex items-center gap-1.5"
          >
            <span className={refreshing ? 'animate-spin' : ''}>🔄</span>
            <span className="hidden sm:inline">Sync</span>
          </Button>
        </div>
      </div>

      {/* NAVIGATION TABS */}
      <div className="border-b border-gray-200 flex items-center gap-2 overflow-x-auto pb-1">
        <button
          onClick={() => onTab('overview')}
          className={`px-4 py-2.5 text-sm font-semibold rounded-t-lg transition-all flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'overview'
              ? 'bg-white border-t-2 border-s border-e border-cyan-600 text-cyan-700 shadow-sm'
              : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
          }`}
        >
          <span>🏢</span>
          <span>Hub Overview & Diagnostics</span>
        </button>
        <button
          onClick={() => onTab('intake')}
          className={`px-4 py-2.5 text-sm font-semibold rounded-t-lg transition-all flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'intake'
              ? 'bg-white border-t-2 border-s border-e border-cyan-600 text-cyan-700 shadow-sm'
              : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
          }`}
        >
          <span>📦</span>
          <span>Cold Batch Intake & Inspection</span>
          <span className="text-[11px] bg-cyan-100 text-cyan-800 font-bold px-1.5 py-0.5 rounded-full">≤ -18°C</span>
        </button>
        <button
          onClick={() => onTab('fefo')}
          className={`px-4 py-2.5 text-sm font-semibold rounded-t-lg transition-all flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'fefo'
              ? 'bg-white border-t-2 border-s border-e border-cyan-600 text-cyan-700 shadow-sm'
              : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
          }`}
        >
          <span>❄️</span>
          <span>FEFO Batch Queue & Inventory</span>
          {(batchSummary?.totalBatches ?? 0) > 0 && (
            <span className="text-[11px] bg-slate-200 text-slate-800 font-bold px-1.5 py-0.5 rounded-full">
              {batchSummary?.totalBatches}
            </span>
          )}
        </button>
        <button
          onClick={() => onTab('temperature')}
          className={`px-4 py-2.5 text-sm font-semibold rounded-t-lg transition-all flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'temperature'
              ? 'bg-white border-t-2 border-s border-e border-cyan-600 text-cyan-700 shadow-sm'
              : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
          }`}
        >
          <span>🌡️</span>
          <span>Temperature Probe Logs & Alerts</span>
          {tempStats?.breachCount ? (
            <span className="text-[11px] bg-rose-100 text-rose-700 font-bold px-1.5 py-0.5 rounded-full">
              {tempStats.breachCount} Alerts
            </span>
          ) : null}
        </button>
      </div>
    </>
  );
}
