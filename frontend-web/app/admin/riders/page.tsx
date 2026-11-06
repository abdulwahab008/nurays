'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { RejectReasonModal } from '@/components/admin/RejectReasonModal';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { DashboardLayout, adminSidebarFor } from '@/components/layout/DashboardShell';
import { Button } from '@/components/ui/button';
import { LoadError } from '@/components/ui/LoadError';
import { useToast } from '@/components/ui/toast';
import { useDialogs } from '@/components/ui/Dialogs';
import { apiClient, apiErrorMessage } from '@/lib/api-client';
import { formatPrice } from '@/lib/utils';
import { formatDate, formatDateTime } from '@/components/admin/admin-dates';
import { useAuthStore } from '@/lib/store/auth-store';
import { useShallow } from 'zustand/react/shallow';
import DocumentList from '@/components/admin/DocumentList';
import { AdminFilterTabs } from '@/components/admin/AdminFilterTabs';
import { Figure, LoadingLine, Pager, PhoneText, SearchForm, StatusPill } from '@/components/admin/AdminListParts';

interface PendingRider {
  id: string;
  city: string;
  vehicleType: string | null;
  vehicleNumber: string | null;
  licenseNumber: string | null;
  documents: Array<{ id: string; type: string; url: string | null }>;
  applicationComplete: boolean;
  user: {
    id: string;
    phone: string | null;
    email: string | null;
    profile: { fullName: string; city: string | null } | null;
  } | null;
  createdAt: string;
}

interface RiderWithMoney {
  id: string;
  name: string | null;
  phone: string | null;
  city: string;
  vehicleType: string | null;
  vehicleNumber: string | null;
  status: string;
  isAvailable: boolean;
  totalDeliveries: number;
  balance: number;
  cashHeld: number;
  cashLimit: number;
  lastEntryAt: string | null;
}

interface RidersMoneyResponse {
  riders: RiderWithMoney[];
  totals: { cashHeld: number; owedToRiders: number };
  pagination: { page: number; totalPages: number; total: number };
}

type Tab = 'riders' | 'applications';

export default function AdminRidersPage() {
  return (
    <Suspense fallback={null}>
      <AdminRidersContent />
    </Suspense>
  );
}

function AdminRidersContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab: Tab = searchParams.get('tab') === 'applications' ? 'applications' : 'riders';

  const { user } = useAuthStore(useShallow((st) => ({ user: st.user })));

  return (
    <DashboardLayout
      title="Riders"
      subtitle="Cash riders carry for cash orders, what they're owed, and new applications."
      sidebarItems={adminSidebarFor(user?.permissions)}
      userType="admin"
    >
      <div className="max-w-6xl">
        <AdminFilterTabs
          label="Riders"
          value={tab}
          onChange={(id) => router.replace(id === 'riders' ? '/admin/riders' : '/admin/riders?tab=applications')}
          tabs={[
            { id: 'riders', label: 'Riders and cash' },
            { id: 'applications', label: 'Applications' },
          ]}
          className="mb-5"
        />
        {tab === 'riders' ? <RidersMoney /> : <Applications />}
      </div>
    </DashboardLayout>
  );
}

const FILTERS = [
  ['all', 'All'],
  ['holding_cash', 'Holding cash'],
  ['owed', 'Owed pay'],
] as const;

function RidersMoney() {
  const [data, setData] = useState<RidersMoneyResponse | null>(null);
  const [loading, setLoading] = useState(true);
  // Why the riders could not be read; shown instead of "No riders here", which would be untrue.
  const [loadError, setLoadError] = useState<unknown>(null);
  const [filter, setFilter] = useState<(typeof FILTERS)[number][0]>('all');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const res = await apiClient.get('/admin/riders/money', {
        params: { filter: filter === 'all' ? undefined : filter, search: query || undefined, page },
      });
      setData(res.data.data);
    } catch (error) {
      setLoadError(error);
    } finally {
      setLoading(false);
    }
  }, [filter, query, page]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-5">
      {data && (
        <div className="grid grid-cols-2 gap-x-6 gap-y-4">
          <Figure label="Cash held by riders" value={<span data-testid="riders-total-cash">{formatPrice(data.totals.cashHeld)}</span>} sub="Collected at the door, not handed in yet" />
          <Figure label="Owed to riders" value={formatPrice(data.totals.owedToRiders)} sub="Pay due beyond the cash they hold" />
        </div>
      )}

      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <AdminFilterTabs
          label="Which riders"
          value={filter}
          onChange={(id) => {
            setFilter(id);
            setPage(1);
          }}
          tabs={FILTERS.map(([id, label]) => ({ id, label }))}
          className="md:flex-1"
        />
        <SearchForm
          placeholder="Name, phone or bike number"
          label="Search riders"
          onSearch={(q) => {
            setQuery(q);
            setPage(1);
          }}
        />
      </div>

      {loading && !data ? (
        <LoadingLine text="Loading riders" />
      ) : loadError && !data ? (
        <LoadError error={loadError} onRetry={load} title="We couldn't load the riders" />
      ) : !data || data.riders.length === 0 ? (
        <p className="py-6 text-sm text-muted">{query || filter !== 'all' ? 'No rider matches this search or filter.' : 'Approved riders will show up here.'}</p>
      ) : (
        <>
          <ul className="divide-y divide-line border-y border-line md:hidden" data-testid="riders-money-list">
            {data.riders.map((r) => {
              const overLimit = r.cashHeld >= r.cashLimit && r.cashHeld > 0;
              return (
                <li key={r.id}>
                  <Link href={`/admin/riders/${r.id}`} className="flex min-h-[72px] items-center gap-3 py-3 hover:bg-page">
                    <span className="min-w-0 flex-1">
                      <span className="flex items-start justify-between gap-2">
                        <span className="text-sm font-semibold text-ink">{r.name || 'Name not set'}</span>
                        <span className={`text-end text-sm font-semibold tabular-nums ${overLimit ? 'text-red-700' : 'text-ink'}`}>
                          {formatPrice(r.cashHeld)}
                          <span className="block text-xs font-normal text-muted">{overLimit ? 'at cash limit' : 'cash in hand'}</span>
                        </span>
                      </span>
                      <span className="block truncate text-xs text-muted">
                        {[r.phone, r.city, r.vehicleNumber].filter(Boolean).join(' · ')}
                        {r.status !== 'active' ? ` · ${r.status === 'suspended' ? 'Suspended' : 'Inactive'}` : ''}
                      </span>
                      <span className="block text-xs text-muted">
                        {r.balance > 0 ? `Owed ${formatPrice(r.balance)}` : r.balance < 0 ? `Owes ${formatPrice(Math.abs(r.balance))}` : 'Settled'} · {r.totalDeliveries} {r.totalDeliveries === 1 ? 'delivery' : 'deliveries'}
                      </span>
                    </span>
                    <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-muted rtl:rotate-180" />
                  </Link>
                </li>
              );
            })}
          </ul>
          <div className="hidden overflow-x-auto rounded-2xl border border-line bg-surface md:block">
            <table className="w-full text-sm [&_th]:text-start" data-testid="riders-money-table">
              <thead className="border-b border-line text-xs text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">Rider</th>
                  <th className="px-4 py-3 font-medium">Cash in hand</th>
                  <th className="px-4 py-3 font-medium">Balance</th>
                  <th className="px-4 py-3 font-medium">Deliveries</th>
                  <th className="px-4 py-3 font-medium">Last activity</th>
                  <th className="px-4 py-3 font-medium">
                    <span className="sr-only">Settle up</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.riders.map((r) => {
                  const overLimit = r.cashHeld >= r.cashLimit && r.cashHeld > 0;
                  return (
                    <tr key={r.id} className="hover:bg-page">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-ink">{r.name || 'Name not set'}</p>
                        <p className="text-xs text-muted">
                          {[r.phone, r.city, r.vehicleNumber].filter(Boolean).join(' · ')}
                          {r.status !== 'active' ? ` · ${r.status === 'suspended' ? 'Suspended' : 'Inactive'}` : ''}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <p className={`font-semibold tabular-nums ${overLimit ? 'text-red-700' : 'text-ink'}`}>{formatPrice(r.cashHeld)}</p>
                        <p className="text-xs text-muted">of {formatPrice(r.cashLimit)}{overLimit ? ', at limit' : ''}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-semibold tabular-nums text-ink">{formatPrice(Math.abs(r.balance))}</p>
                        <p className="text-xs text-muted">{r.balance > 0 ? 'Owed to rider' : r.balance < 0 ? 'Rider owes' : 'Settled'}</p>
                      </td>
                      <td className="px-4 py-3 tabular-nums text-ink">{r.totalDeliveries}</td>
                      <td className="px-4 py-3 text-xs text-muted">{r.lastEntryAt ? formatDateTime(r.lastEntryAt) : 'None yet'}</td>
                      <td className="px-4 py-3 text-end">
                        <Link href={`/admin/riders/${r.id}`} className="inline-flex min-h-11 items-center text-sm font-semibold text-brand-ink hover:underline">
                          Settle up
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pager page={data.pagination.page} totalPages={data.pagination.totalPages} total={data.pagination.total} noun="riders" one="rider" onChange={setPage} />
        </>
      )}
    </div>
  );
}

function Applications() {
  const { showToast } = useToast();
  const { confirm: confirmDialog } = useDialogs();
  const [loading, setLoading] = useState(true);
  // Why the applications could not be read; shown instead of "No riders awaiting approval", which would be untrue.
  const [loadError, setLoadError] = useState<unknown>(null);
  const [riders, setRiders] = useState<PendingRider[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<PendingRider | null>(null);

  const loadRiders = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const response = await apiClient.get('/admin/pending-riders');
      if (response.data.success) {
        setRiders(response.data.data || []);
      }
    } catch (error) {
      setLoadError(error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRiders();
  }, [loadRiders]);

  const handleApprove = async (rider: PendingRider) => {
    const riderId = rider.id;
    const ok = await confirmDialog({
      title: `Approve ${rider.user?.profile?.fullName || 'this rider'}?`,
      message: 'They can start seeing and claiming deliveries.',
      confirmText: 'Approve',
      variant: 'warning',
    });
    if (!ok) return;
    try {
      setBusyId(riderId);
      await apiClient.post(`/admin/riders/${riderId}/approve`, { approved: true });
      showToast('Rider approved', 'success');
      setRiders((prev) => prev.filter((r) => r.id !== riderId));
    } catch (error) {
      showToast(apiErrorMessage(error, 'Failed to approve rider'), 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = async (riderId: string, reason: string) => {
    try {
      setBusyId(riderId);
      await apiClient.post(`/admin/riders/${riderId}/reject`, { approved: false, reason });
      showToast('Rider rejected', 'success');
      setRiders((prev) => prev.filter((r) => r.id !== riderId));
      setRejecting(null);
    } catch (error) {
      showToast(apiErrorMessage(error, 'Failed to reject rider'), 'error');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <p className="mb-4 text-sm text-muted">A rider can&apos;t see or claim any delivery until approved here.</p>

      {loading && riders.length === 0 ? (
        <LoadingLine text="Loading applications" />
      ) : loadError && riders.length === 0 ? (
        <LoadError error={loadError} onRetry={loadRiders} title="We couldn't load the applications" />
      ) : riders.length === 0 ? (
        <p className="text-sm text-muted">No rider is waiting. New applications show up here.</p>
      ) : (
        <ul className="space-y-4">
          {riders.map((rider) => {
            const busy = busyId === rider.id;
            return (
              <li key={rider.id} className="rounded-2xl border border-line bg-surface p-4 shadow-[var(--shadow-card)] sm:p-5">
                <div className="flex flex-col gap-4 md:flex-row md:items-start">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-[17px] font-semibold text-ink">{rider.user?.profile?.fullName || 'Name not given'}</h3>
                      {rider.applicationComplete ? <StatusPill tone="waiting">Ready to approve</StatusPill> : <StatusPill tone="problem">Incomplete</StatusPill>}
                    </div>
                    <dl className="mt-3 grid grid-cols-[auto_1fr] items-baseline gap-x-4 gap-y-1.5 text-sm">
                      <dt className="text-muted">Phone</dt>
                      <dd className="min-w-0">
                        <PhoneText phone={rider.user?.phone} />
                      </dd>
                      <dt className="text-muted">Email</dt>
                      <dd className="min-w-0 break-all text-ink">{rider.user?.email || <span className="text-muted">Not given</span>}</dd>
                      <dt className="text-muted">City</dt>
                      <dd className="min-w-0 text-ink">{rider.city}</dd>
                      <dt className="text-muted">Vehicle</dt>
                      <dd className="min-w-0 text-ink">
                        {[rider.vehicleType, rider.vehicleNumber].filter(Boolean).join(' ') || <span className="text-muted">Not given</span>}
                      </dd>
                      <dt className="text-muted">Licence no.</dt>
                      <dd className="min-w-0 text-ink">{rider.licenseNumber || <span className="text-muted">Not given</span>}</dd>
                      <dt className="text-muted">Applied</dt>
                      <dd className="min-w-0 text-ink">{formatDate(rider.createdAt)}</dd>
                    </dl>
                    <DocumentList documents={rider.documents} />
                    {!rider.applicationComplete && (
                      <p className="mt-3 text-xs text-red-700">
                        Missing: vehicle details or CNIC and licence photos. The rider adds them from the rider app.
                      </p>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2 md:w-56 md:shrink-0">
                    <Button variant="outline" className="min-h-11 border-red-200 text-red-700 hover:bg-red-50" onClick={() => setRejecting(rider)} disabled={busy}>
                      Reject
                    </Button>
                    <Button className="min-h-11" onClick={() => handleApprove(rider)} disabled={busy || !rider.applicationComplete}>
                      {busy ? 'Working…' : 'Approve'}
                    </Button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <RejectReasonModal
        isOpen={!!rejecting}
        title={`Reject ${rejecting?.user?.profile?.fullName ?? 'this rider'}?`}
        description="The rider is told the reason. They can fix it and apply again."
        suggestions={['The CNIC photos are unclear', 'The licence photo is missing or unreadable', 'The vehicle details do not match the documents']}
        confirmLabel="Reject application"
        busy={!!rejecting && busyId === rejecting.id}
        onConfirm={(reason) => rejecting && handleReject(rejecting.id, reason)}
        onCancel={() => setRejecting(null)}
      />
    </div>
  );
}

