'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { AdminShell } from '@/components/layout/AdminShell';
import { LoadError } from '@/components/ui/LoadError';
import { LoadingLine, PageHeader, StatusPill } from '@/components/admin/AdminListParts';
import { apiClient } from '@/lib/api-client';
import { useAuthStore } from '@/lib/store/auth-store';
import { useLiveRefresh } from '@/lib/hooks/use-live-refresh';
import { useShallow } from 'zustand/react/shallow';

interface Queue {
  key: string;
  label: string;
  href: string;
  count: number;
  oldestWaitingSince: string | null;
}

// A red count says something went wrong for a customer or a kitchen; the rest is ordinary work waiting.
const PROBLEM_QUEUES = new Set(['failedDeliveries', 'transfers', 'refunds', 'tickets']);

const ROLE_LABEL: Record<string, string> = { super_admin: 'Super admin', admin: 'Admin', support: 'Support' };

function waiting(since: string | null) {
  if (!since) return null;
  const mins = Math.max(0, Math.round((Date.now() - new Date(since).getTime()) / 60000));
  if (mins < 60) return `${mins} min`;
  const hours = Math.round(mins / 60);
  return hours < 48 ? `${hours} h` : `${Math.round(hours / 24)} days`;
}

/** Everything that needs a staff decision, in one place: what this role can act on, with how long the oldest has waited. */
export default function AdminApprovalsPage() {
  const { user } = useAuthStore(useShallow((s) => ({ user: s.user })));
  const [queues, setQueues] = useState<Queue[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  // Why the queues could not be read; shown instead of "Nothing is waiting. All caught up.", which would be untrue.
  const [loadError, setLoadError] = useState<unknown>(null);

  const load = useCallback(async () => {
    try {
      const res = await apiClient.get('/admin/approvals');
      setQueues(res.data.data.items);
      setTotal(res.data.data.total);
      setLoadError(null);
    } catch (error) {
      setLoadError(error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  // Refreshes when something new arrives for a decision, when the tab comes back, and on a slow timer.
  // Every order on the platform sends events here: at most one reload per 30 s.
  useLiveRefresh(load, {
    events: ['order:new', 'order:status:update', 'notification:new', 'delivery:new'],
    intervalMs: 60_000,
    coalesceMs: 30_000,
  });

  const waitingQueues = queues.filter((q) => q.count > 0).sort((a, b) => Number(PROBLEM_QUEUES.has(b.key)) - Number(PROBLEM_QUEUES.has(a.key)));
  const clearQueues = queues.filter((q) => q.count === 0);

  return (
    <AdminShell>
      <div className="max-w-4xl">
        <PageHeader
          title="Approvals"
          subtitle={`Everything a kitchen, rider or customer has sent that needs a decision${user?.staffRole && user.staffRole !== 'super_admin' ? `, limited to what ${ROLE_LABEL[user.staffRole] ?? user.staffRole} staff can decide` : ''}.`}
        />

        {loading ? (
          <LoadingLine text="Checking what is waiting" />
        ) : loadError && queues.length === 0 ? (
          <LoadError error={loadError} onRetry={load} title="We couldn't load the approvals" />
        ) : (
          <>
            {Boolean(loadError) && <LoadError compact error={loadError} onRetry={load} title="We couldn't refresh the approvals: these numbers may be out of date" className="mb-4" />}
            <h2 className="mb-3 text-sm font-semibold text-ink" data-testid="approvals-total">
              {total === 0 ? 'Nothing is waiting. All caught up.' : `${total} waiting for you`}
            </h2>
            {waitingQueues.length > 0 && (
              <ul className="divide-y divide-line rounded-2xl border border-line bg-surface shadow-[var(--shadow-card)]" data-testid="approval-queues">
                {waitingQueues.map((q) => (
                  <li key={q.key}>
                    <Link
                      href={q.href}
                      className="flex min-h-16 items-center gap-3 px-4 py-3 hover:bg-raised first:rounded-t-2xl last:rounded-b-2xl focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand/40"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-[15px] font-semibold text-ink">{q.label}</p>
                        <p className="text-xs text-muted">Oldest has waited {waiting(q.oldestWaitingSince)}</p>
                      </div>
                      <StatusPill tone={PROBLEM_QUEUES.has(q.key) ? 'problem' : 'waiting'} className="min-w-8 justify-center text-sm tabular-nums">
                        <span data-testid={`queue-${q.key}`}>{q.count}</span>
                      </StatusPill>
                      <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-muted rtl:rotate-180" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {clearQueues.length > 0 && (
              <section aria-labelledby="clear-heading" className={waitingQueues.length > 0 ? 'mt-8 border-t border-line pt-6' : ''}>
                <h2 id="clear-heading" className="mb-1 text-sm font-semibold text-ink">
                  Nothing waiting
                </h2>
                <ul className="divide-y divide-line">
                  {clearQueues.map((q) => (
                    <li key={q.key}>
                      <Link href={q.href} className="flex min-h-12 items-center gap-3 py-2 text-sm text-muted hover:text-ink">
                        <span className="min-w-0 flex-1">{q.label}</span>
                        <span className="tabular-nums" data-testid={`queue-${q.key}`}>0</span>
                        <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 rtl:rotate-180" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </div>
    </AdminShell>
  );
}
