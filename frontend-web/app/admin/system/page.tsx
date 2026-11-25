'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { DashboardLayout, adminSidebarFor } from '@/components/layout/DashboardShell';
import { LoadError } from '@/components/ui/LoadError';
import { Figure, LoadingLine, StatusPill } from '@/components/admin/AdminListParts';
import { useAuthStore } from '@/lib/store/auth-store';
import { apiClient } from '@/lib/api-client';
import { useShallow } from 'zustand/react/shallow';

interface Lane {
  lane: 'default' | 'email' | 'sms';
  waiting: number;
  active: number;
  delayed: number;
  failed: number;
  workers: number;
}

interface JobProblem {
  lane: Lane['lane'];
  name: string;
  id: string | null;
  reason: string;
  attempts: number;
  at: string | null;
}

interface SystemHealth {
  checkedAt: string;
  ops: {
    openDeliveries: number;
    oldestOpenDeliveryMinutes: number;
    activeDeliveries: number;
    ridersOnDuty: number;
    ordersLastHour: number;
    cancelledLastHour: number;
    paymentsFailedLastHour: number;
    readyNoRiderStuck: number;
    oldestReadyNoRiderMinutes: number;
    openTickets: number;
  };
  queue: { lanes: Lane[]; failed: JobProblem[]; retrying: JobProblem[] } | null;
  fullKitchens: Array<{ id: string; name: string; limit: number; openOrders: number }>;
}

const LANE_LABEL: Record<Lane['lane'], string> = {
  default: 'Push and quick jobs',
  email: 'Email',
  sms: 'SMS',
};

const minutes = (n: number) => (n < 60 ? `${n} min` : n < 48 * 60 ? `${Math.round(n / 60)} h` : `${Math.round(n / 1440)} days`);
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-PK', { dateStyle: 'medium', timeStyle: 'short' }) : 'unknown time');

function ProblemList({ title, empty, jobs, testId }: { title: string; empty: string; jobs: JobProblem[]; testId: string }) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-ink">{title}</h3>
      {jobs.length === 0 ? (
        <p className="text-sm text-muted">{empty}</p>
      ) : (
        <ul className="divide-y divide-line rounded-2xl border border-line bg-surface" data-testid={testId}>
          {jobs.map((j) => (
            <li key={`${j.lane}-${j.id}`} className="px-4 py-3">
              <p className="text-sm font-medium text-ink">
                {j.name} <span className="font-normal text-muted">· {LANE_LABEL[j.lane]} · {j.attempts} {j.attempts === 1 ? 'try' : 'tries'} · {when(j.at)}</span>
              </p>
              <p className="mt-0.5 break-words text-xs text-muted">{j.reason}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Whether the machinery behind the orders is keeping up: the background job lanes (and whether any worker is taking
 * their jobs), the latest jobs that failed, orders stuck without a rider and kitchens at their order limit.
 * Logs and an outside monitor are for history and alerts; this is the live look.
 */
export default function AdminSystemHealthPage() {
  const { isAuthenticated, user } = useAuthStore(useShallow((s) => ({ isAuthenticated: s.isAuthenticated, user: s.user })));
  const isAdmin = user?.user_type === 'admin' || user?.userType === 'admin';
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(async () => {
    try {
      const res = await apiClient.get('/admin/system-health');
      setHealth(res.data.data);
      setError(null);
    } catch (err) {
      setError(err);
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated || !isAdmin) return;
    void load();
    const timer = setInterval(() => void load(), 30_000);
    return () => clearInterval(timer);
  }, [isAuthenticated, isAdmin, load]);

  if (!isAuthenticated || !isAdmin) return null;

  return (
    <DashboardLayout title="System health" subtitle="Refreshes every 30 seconds" sidebarItems={adminSidebarFor(user?.permissions)} userType="admin">
      <div className="max-w-5xl space-y-8">
        {error ? <LoadError compact error={error} onRetry={() => void load()} title={health ? "We couldn't refresh: this may be out of date" : "We couldn't read the system's health"} /> : null}
        {!health ? (
          error ? null : <LoadingLine text="Checking the system" />
        ) : (
          <>
            <p className="text-xs text-muted">Checked {when(health.checkedAt)}</p>

            <section aria-labelledby="orders-heading">
              <h2 id="orders-heading" className="mb-4 text-sm font-semibold text-ink">Orders and riders</h2>
              <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3" data-testid="ops-figures">
                <Figure label="Orders in the last hour" value={health.ops.ordersLastHour} sub={`${health.ops.cancelledLastHour} cancelled`} />
                <Figure
                  label="Ready, no rider for 20 min"
                  value={health.ops.readyNoRiderStuck}
                  sub={health.ops.readyNoRiderStuck > 0 ? `Oldest ${minutes(health.ops.oldestReadyNoRiderMinutes)}` : 'None stuck'}
                  href="/admin/orders"
                />
                <Figure
                  label="Jobs waiting for a rider"
                  value={health.ops.openDeliveries}
                  sub={health.ops.openDeliveries > 0 ? `Oldest ${minutes(health.ops.oldestOpenDeliveryMinutes)}` : 'None waiting'}
                />
                <Figure label="Deliveries on the way" value={health.ops.activeDeliveries} />
                <Figure label="Riders on duty" value={health.ops.ridersOnDuty} />
                <Figure label="Failed online payments (1 h)" value={health.ops.paymentsFailedLastHour} />
              </div>
            </section>

            <section aria-labelledby="kitchens-heading" className="border-t border-line pt-6">
              <h2 id="kitchens-heading" className="mb-2 text-sm font-semibold text-ink">Kitchens at their order limit</h2>
              {health.fullKitchens.length === 0 ? (
                <p className="text-sm text-muted">No kitchen is full. A kitchen with a limit set under &ldquo;Most orders at a time&rdquo; shows here while it refuses new orders.</p>
              ) : (
                <ul className="divide-y divide-line rounded-2xl border border-line bg-surface" data-testid="full-kitchens">
                  {health.fullKitchens.map((k) => (
                    <li key={k.id} className="flex items-center justify-between gap-3 px-4 py-3">
                      <Link href={`/admin/sellers/${k.id}`} className="text-sm font-medium text-brand-ink hover:underline">{k.name}</Link>
                      <StatusPill tone="waiting" className="tabular-nums">{k.openOrders} of {k.limit} orders</StatusPill>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section aria-labelledby="jobs-heading" className="border-t border-line pt-6 space-y-6">
              <h2 id="jobs-heading" className="text-sm font-semibold text-ink">Background jobs</h2>
              {!health.queue ? (
                <p className="text-sm text-muted">The job queue is not available (no Redis): jobs run inside the API right away and are not kept.</p>
              ) : (
                <>
                  <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
                    <table className="w-full text-sm" data-testid="job-lanes">
                      <thead>
                        <tr className="text-left text-xs text-muted">
                          <th className="px-4 py-2 font-medium">Lane</th>
                          <th className="px-4 py-2 font-medium text-right">Waiting</th>
                          <th className="px-4 py-2 font-medium text-right">Running</th>
                          <th className="px-4 py-2 font-medium text-right">Retrying</th>
                          <th className="px-4 py-2 font-medium text-right">Gave up</th>
                          <th className="px-4 py-2 font-medium text-right">Workers</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line">
                        {health.queue.lanes.map((l) => (
                          <tr key={l.lane}>
                            <td className="px-4 py-3 font-medium text-ink">{LANE_LABEL[l.lane]}</td>
                            <td className="px-4 py-3 text-right tabular-nums">{l.waiting}</td>
                            <td className="px-4 py-3 text-right tabular-nums">{l.active}</td>
                            <td className="px-4 py-3 text-right tabular-nums">{l.delayed}</td>
                            <td className="px-4 py-3 text-right tabular-nums">
                              {l.failed > 0 ? <StatusPill tone="problem">{l.failed}</StatusPill> : 0}
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums">
                              {l.workers > 0 ? l.workers : <StatusPill tone="problem">None</StatusPill>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {health.queue.lanes.some((l) => l.workers === 0) && (
                    <p className="text-sm text-red-700" role="alert">
                      A lane has no worker: its jobs are piling up. Check that the worker process (or the API with PROCESS_ROLE=all) is running.
                    </p>
                  )}
                  <ProblemList title="Latest jobs that gave up" empty="No job has given up." jobs={health.queue.failed} testId="failed-jobs" />
                  <ProblemList title="Latest jobs waiting to retry" empty="Nothing is retrying." jobs={health.queue.retrying} testId="retrying-jobs" />
                </>
              )}
            </section>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
