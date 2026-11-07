'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { DashboardLayout, adminSidebarFor } from '@/components/layout/DashboardShell';
import { LoadError } from '@/components/ui/LoadError';
import { Figure, LoadingLine, StatusPill } from '@/components/admin/AdminListParts';
import { useAuthStore } from '@/lib/store/auth-store';
import { apiClient } from '@/lib/api-client';
import { useLiveRefresh } from '@/lib/hooks/use-live-refresh';
import { formatPrice } from '@/lib/utils';
import { useShallow } from 'zustand/react/shallow';

interface Queue {
  key: string;
  label: string;
  href: string;
  count: number;
  oldestWaitingSince: string | null;
}

interface PendingKitchen {
  id: string;
  missing?: string[];
}

interface PlatformStats {
  today: { orders: number; cancelled?: number; revenue: number };
  pendingOrders: number;
  waitingForKitchen?: number;
  beingPrepared?: number;
  inTransitOrders: number;
  failedDeliveries?: number;
  averageOrderValue: number;
}

/** The problems first: a red count says something has gone wrong, the rest is work waiting. */
const PROBLEM_QUEUES = new Set(['failedDeliveries', 'transfers', 'refunds', 'tickets']);

function waitedFor(since: string | null): string | null {
  if (!since) return null;
  const mins = Math.max(0, Math.round((Date.now() - new Date(since).getTime()) / 60000));
  if (mins < 60) return `${mins} min`;
  const hours = Math.round(mins / 60);
  return hours < 48 ? `${hours} h` : `${Math.round(hours / 24)} days`;
}

/**
 * What needs an admin now (approvals, refunds, problem orders) first, then today's figures. The side menu is the way
 * into each section, so the page does not repeat it. The one raised surface is the list of things waiting.
 */
export default function AdminDashboardPage() {
  const router = useRouter();
  const { isAuthenticated, user } = useAuthStore(useShallow((s) => ({ isAuthenticated: s.isAuthenticated, user: s.user })));
  const isAdmin = user?.user_type === 'admin' || user?.userType === 'admin';
  const [loading, setLoading] = useState(true);
  const [queues, setQueues] = useState<Queue[] | null>(null);
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [readyKitchens, setReadyKitchens] = useState<number | null>(null);
  // Each part is said on its own when it could not be read, instead of "nothing waiting" or figures left out.
  const [queuesError, setQueuesError] = useState<unknown>(null);
  const [statsError, setStatsError] = useState<unknown>(null);

  const load = useCallback(async () => {
    const [queuesRes, statsRes, kitchensRes] = await Promise.allSettled([
      apiClient.get('/admin/approvals'),
      apiClient.get('/admin/statistics'),
      apiClient.get('/admin/pending-sellers'),
    ]);
    if (queuesRes.status === 'fulfilled' && queuesRes.value.data.success) {
      setQueues(queuesRes.value.data.data.items);
      setQueuesError(null);
    } else {
      setQueuesError(queuesRes.status === 'rejected' ? queuesRes.reason : new Error('The approvals came back empty'));
    }
    if (statsRes.status === 'fulfilled' && statsRes.value.data.success) {
      setStats(statsRes.value.data.data);
      setStatsError(null);
    } else {
      setStatsError(statsRes.status === 'rejected' ? statsRes.reason : new Error('The figures came back empty'));
    }
    setReadyKitchens(
      kitchensRes.status === 'fulfilled' && kitchensRes.value.data.success
        ? (kitchensRes.value.data.data as PendingKitchen[]).filter((k) => (k.missing?.length ?? 0) === 0).length
        : null
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!isAuthenticated || !isAdmin) return;
    // The dashboard shows platform figures; staff without that access start at their approvals.
    if (user?.permissions && !user.permissions.includes('read.finance')) {
      router.replace('/admin/approvals');
      return;
    }
    void load();
  }, [isAuthenticated, isAdmin, user?.permissions, router, load]);

  // Every order on the platform sends events here, and each reload is three of the heaviest reads: at most one per 30 s.
  useLiveRefresh(() => void load(), {
    events: ['order:new', 'order:status:update', 'notification:new', 'delivery:new'],
    intervalMs: 60_000,
    coalesceMs: 30_000,
    enabled: isAuthenticated && isAdmin,
  });

  if (!isAuthenticated || !isAdmin) return null;

  const waiting = (queues ?? []).filter((q) => q.count > 0).sort((a, b) => Number(PROBLEM_QUEUES.has(b.key)) - Number(PROBLEM_QUEUES.has(a.key)));
  const total = waiting.reduce((n, q) => n + q.count, 0);

  return (
    <DashboardLayout title="Overview" sidebarItems={adminSidebarFor(user?.permissions)} userType="admin">
      <div className="max-w-5xl space-y-8">
        <section aria-labelledby="waiting-heading">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 id="waiting-heading" className="text-sm font-semibold text-ink">
              Waiting for you
            </h2>
            <Link href="/admin/approvals" className="text-sm font-medium text-brand-ink hover:underline min-h-11 inline-flex items-center">
              All approvals
            </Link>
          </div>
          {loading && !queues ? (
            <LoadingLine text="Checking what is waiting" />
          ) : queuesError && !queues ? (
            <LoadError compact error={queuesError} onRetry={() => void load()} title="We couldn't check what is waiting" />
          ) : (
            <>
              {Boolean(queuesError) && (
                <LoadError compact error={queuesError} onRetry={() => void load()} title="We couldn't refresh this list: it may be out of date" className="mb-3" />
              )}
              {waiting.length === 0 ? (
                <p className="text-sm text-muted" data-testid="nothing-waiting">
                  Nothing is waiting. New applications, dishes, refunds and complaints will show up here.
                </p>
              ) : (
                <ul
                  className="divide-y divide-line rounded-2xl border border-line bg-surface shadow-[var(--shadow-card)]"
                  data-testid="waiting-list"
                  aria-label={`${total} waiting`}
                >
                  {waiting.map((q) => {
                    const problem = PROBLEM_QUEUES.has(q.key);
                    const kitchenNote =
                      q.key === 'sellers' && readyKitchens != null
                        ? readyKitchens > 0
                          ? `${readyKitchens} ready to approve`
                          : 'None complete yet'
                        : null;
                    return (
                      <li key={q.key}>
                        <Link
                          href={q.href}
                          className="flex min-h-16 items-center gap-3 px-4 py-3 hover:bg-raised first:rounded-t-2xl last:rounded-b-2xl focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand/40"
                          data-testid={`waiting-${q.key}`}
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-[15px] font-semibold text-ink">{q.label}</p>
                            <p className="text-xs text-muted">
                              Oldest has waited {waitedFor(q.oldestWaitingSince)}
                              {kitchenNote ? ` · ${kitchenNote}` : ''}
                            </p>
                          </div>
                          <StatusPill tone={problem ? 'problem' : 'waiting'} className="min-w-8 justify-center text-sm tabular-nums">
                            {q.count}
                          </StatusPill>
                          <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-muted rtl:rotate-180" />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}
        </section>

        <section aria-labelledby="today-heading" className="border-t border-line pt-6">
          <h2 id="today-heading" className="mb-4 text-sm font-semibold text-ink">
            Orders
          </h2>
          {statsError ? (
            <LoadError
              compact
              error={statsError}
              onRetry={() => void load()}
              title={stats ? "We couldn't refresh today's figures: these may be out of date" : "We couldn't load today's figures"}
              className="mb-4"
            />
          ) : null}
          {!stats && loading ? (
            <LoadingLine text="Loading today's figures" />
          ) : stats ? (
            <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3" data-testid="today-figures">
              <Figure
                label="Placed today"
                value={stats.today.orders}
                sub={stats.today.cancelled ? `Plus ${stats.today.cancelled} cancelled` : 'None cancelled'}
                href="/admin/orders"
              />
              <Figure label="Paid sales today" value={formatPrice(stats.today.revenue)} />
              <Figure label="Waiting for a kitchen" value={stats.waitingForKitchen ?? stats.pendingOrders} sub="Not accepted yet" href="/admin/orders?status=pending" />
              <Figure label="Being prepared" value={stats.beingPrepared ?? 0} sub="Accepted, cooking or ready" />
              <Figure label="On the way" value={stats.inTransitOrders} sub="With a rider" />
              <Figure label="Average order" value={formatPrice(Math.round(stats.averageOrderValue))} sub="Over the last 30 days" />
            </div>
          ) : null}
        </section>

      </div>
    </DashboardLayout>
  );
}
