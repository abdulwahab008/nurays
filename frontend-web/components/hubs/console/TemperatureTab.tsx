'use client';

/** Logging a probe reading for a freezer, the hub's temperature figures, and every reading so far. */
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { apiClient } from '@/lib/api-client';
import { serverMessageOf } from '@/lib/load-error';
import { formatTemp, isColdEnough, type TemperatureLog, type TempStats } from '@/lib/hub-console';

export default function TemperatureTab({
  hubId,
  tempLogs,
  tempStats,
  onSaved,
}: {
  hubId: string;
  tempLogs: TemperatureLog[];
  tempStats: TempStats | null;
  onSaved: () => Promise<void>;
}) {
  const { showToast } = useToast();
  const [probeTemp, setProbeTemp] = useState<number>(-19.5);
  const [probeUnit, setProbeUnit] = useState<number>(1);
  const [probeNotes, setProbeNotes] = useState('Routine cold-chain inspection probe');
  const [submittingProbe, setSubmittingProbe] = useState(false);

  const handleProbeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hubId) return;
    try {
      setSubmittingProbe(true);
      const res = await apiClient.post(`/hubs/${hubId}/temperature-logs`, {
        temperatureCelsius: Number(probeTemp),
        freezerUnit: Number(probeUnit),
        notes: probeNotes.trim() || undefined,
      });
      if (res.data.success) {
        if (!isColdEnough(probeTemp)) {
          showToast(`🚨 TEMPERATURE ALERT: Probe reading ${probeTemp}°C breached -18°C threshold!`, 'error');
        } else {
          showToast(`✅ Temperature probe verified at ${probeTemp}°C (Sub-Zero Compliant).`, 'success');
        }
        await onSaved();
      }
    } catch (err: unknown) {
      showToast(serverMessageOf(err) || 'Failed to log temperature probe', 'error');
    } finally {
      setSubmittingProbe(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* MANUAL PROBE LOGGER FORM */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
        <h3 className="text-base font-bold text-gray-900 mb-1">Record Physical Temperature Probe</h3>
        <p className="text-xs text-gray-500 mb-4">Verify industrial freezer temperatures using a calibrated probe thermometer.</p>

        <form onSubmit={handleProbeSubmit} className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-bold uppercase text-gray-700 mb-1">Freezer Unit #</label>
            <select
              value={probeUnit}
              onChange={(e) => setProbeUnit(parseInt(e.target.value) || 1)}
              className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-cyan-500 outline-none"
            >
              <option value={1}>Freezer 01 (Walk-in Sub-Zero)</option>
              <option value={2}>Freezer 02 (Deep Chest -20°C)</option>
              <option value={3}>Freezer 03 (Quarantine Bay)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase text-gray-700 mb-1">Measured Temperature (°C) *</label>
            <input
              type="number"
              step="0.1"
              value={probeTemp}
              onChange={(e) => setProbeTemp(parseFloat(e.target.value) || 0)}
              required
              className="w-full border border-cyan-500 rounded-xl px-3 py-2 text-sm font-mono font-bold focus:ring-2 focus:ring-cyan-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase text-gray-700 mb-1">Audit Notes / Inspector</label>
            <input
              type="text"
              value={probeNotes}
              onChange={(e) => setProbeNotes(e.target.value)}
              placeholder="Inspection remarks"
              className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-cyan-500 outline-none"
            />
          </div>

          <div className="flex items-end">
            <Button
              type="submit"
              disabled={submittingProbe}
              className="w-full bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold py-2.5 rounded-xl shadow"
            >
              {submittingProbe ? 'Logging...' : 'Log Probe Reading'}
            </Button>
          </div>
        </form>
      </div>

      {/* TEMPERATURE STATS CARDS */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
          <span className="text-xs text-gray-500 font-semibold block">Total Probe Logs</span>
          <span className="text-xl font-bold text-gray-900 mt-1 block">{tempStats?.totalReadings ?? tempLogs.length}</span>
        </div>
        <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
          <span className="text-xs text-gray-500 font-semibold block">Cold Chain Breaches</span>
          <span className={`text-xl font-bold mt-1 block ${(tempStats?.breachCount ?? 0) > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
            {tempStats?.breachCount ?? 0}
          </span>
        </div>
        <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
          <span className="text-xs text-gray-500 font-semibold block">Compliance Rate</span>
          <span className="text-xl font-bold text-emerald-600 mt-1 block">{tempStats ? `${tempStats.complianceRate}%` : '—'}</span>
        </div>
        <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
          <span className="text-xs text-gray-500 font-semibold block">Average Temperature</span>
          <span className="text-xl font-bold font-mono text-cyan-700 mt-1 block">{formatTemp(tempStats?.avgTemp)}</span>
        </div>
      </div>

      {/* LOGS TABLE */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
        <h4 className="font-bold text-gray-900 text-sm mb-4">Historical Probe Logs</h4>
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full text-start text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-gray-200 text-xs uppercase text-gray-600 font-semibold">
                <th className="py-3 px-4">Recorded At</th>
                <th className="py-3 px-4">Freezer Unit</th>
                <th className="py-3 px-4">Measured Temperature</th>
                <th className="py-3 px-4">Compliance Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {tempLogs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-gray-500">
                    No temperature logs recorded yet.
                  </td>
                </tr>
              ) : (
                tempLogs.map((log) => {
                  const isCompliant = !log.isAlert && isColdEnough(Number(log.temperatureCelsius));
                  return (
                    <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3.5 px-4 text-xs text-gray-600">{new Date(log.recordedAt).toLocaleString('en-PK')}</td>
                      <td className="py-3.5 px-4 text-xs font-medium text-gray-800">Freezer Unit #{log.freezerUnit || 1}</td>
                      <td className="py-3.5 px-4 font-mono font-bold">
                        <span
                          className={`px-2 py-0.5 rounded text-xs ${
                            isCompliant ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {Number(log.temperatureCelsius).toFixed(1)}°C
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-xs">
                        {isCompliant ? (
                          <span className="text-emerald-700 font-medium">✅ Sub-Zero Verified (Optimal)</span>
                        ) : (
                          <span className="text-rose-700 font-bold">🚨 Cold Chain Breach (&gt; -18°C)</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
