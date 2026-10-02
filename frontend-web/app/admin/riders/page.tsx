'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { UserLayout } from '@/components/layout/UserLayout';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { apiClient, apiErrorMessage } from '@/lib/api-client';
import { formatPrice, formatDateTime } from '@/lib/utils';
import DocumentList from '@/components/admin/DocumentList';

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
    phone: string;
    email: string | null;
    profile: { fullName: string; city: string | null } | null;
  } | null;
  createdAt: string;
}

interface RiderWithMoney {
  id: string;
  name: string | null;
  phone: string;
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

  return (
    <UserLayout showSidebar={true} showNavbar={true}>
      <div className="max-w-6xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Riders</h1>
          <p className="text-gray-600 mt-1">Cash riders carry for cash orders, what they&apos;re owed, and new applications.</p>
        </div>

        <div className="mb-5 inline-flex rounded-xl border border-gray-200 bg-white p-1">
          {(
            [
              ['riders', 'Riders & cash'],
              ['applications', 'Applications'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => router.replace(id === 'riders' ? '/admin/riders' : '/admin/riders?tab=applications')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold ${tab === id ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === 'riders' ? <RidersMoney /> : <Applications />}
      </div>
    </UserLayout>
  );
}

const FILTERS = [
  ['all', 'All'],
  ['holding_cash', 'Holding cash'],
  ['owed', 'Owed pay'],
] as const;

function RidersMoney() {
  const { showToast } = useToast();
  const [data, setData] = useState<RidersMoneyResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<(typeof FILTERS)[number][0]>('all');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiClient.get('/admin/riders/money', {
        params: { filter: filter === 'all' ? undefined : filter, search: query || undefined, page },
      });
      setData(res.data.data);
    } catch (error) {
      showToast(apiErrorMessage(error, 'Failed to load riders'), 'error');
    } finally {
      setLoading(false);
    }
  }, [filter, query, page, showToast]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-4">
      {data && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-white border border-gray-200 rounded-lg p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Cash held by riders</p>
            <p className="text-2xl font-bold text-gray-900 mt-1" data-testid="riders-total-cash">{formatPrice(data.totals.cashHeld)}</p>
            <p className="text-xs text-gray-500 mt-1">Collected at the door and not yet handed in.</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Owed to riders</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{formatPrice(data.totals.owedToRiders)}</p>
            <p className="text-xs text-gray-500 mt-1">Pay due to riders who hold less cash than they&apos;ve earned.</p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              setFilter(id);
              setPage(1);
            }}
            className={`px-3 py-1.5 rounded-lg text-sm border ${filter === id ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 bg-white text-gray-700'}`}
          >
            {label}
          </button>
        ))}
        <form
          className="ml-auto flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setQuery(search.trim());
            setPage(1);
          }}
        >
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name, phone or bike number"
            className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm w-56"
            aria-label="Search riders"
          />
          <Button type="submit" variant="outline" size="sm">
            Search
          </Button>
        </form>
      </div>

      {loading && !data ? (
        <div className="bg-white rounded-lg border border-gray-200 p-12 text-center text-gray-500">Loading riders…</div>
      ) : !data || data.riders.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
          <h3 className="text-lg font-semibold text-gray-900 mb-1">No riders here</h3>
          <p className="text-gray-600 text-sm">{query || filter !== 'all' ? 'Try another search or filter.' : 'Approved riders will show up here.'}</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
          <table className="w-full text-sm" data-testid="riders-money-table">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3">Rider</th>
                <th className="px-4 py-3">Cash in hand</th>
                <th className="px-4 py-3">Balance</th>
                <th className="px-4 py-3">Deliveries</th>
                <th className="px-4 py-3">Last activity</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.riders.map((r) => {
                const overLimit = r.cashHeld >= r.cashLimit && r.cashHeld > 0;
                return (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-gray-900">{r.name || 'Name not set'}</p>
                      <p className="text-xs text-gray-500">
                        {r.phone} · {r.city}
                        {r.vehicleNumber ? ` · ${r.vehicleNumber}` : ''}
                        {r.status !== 'active' ? ` · ${r.status}` : ''}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <p className={`font-semibold ${overLimit ? 'text-red-700' : 'text-gray-900'}`}>{formatPrice(r.cashHeld)}</p>
                      <p className="text-xs text-gray-500">of {formatPrice(r.cashLimit)}{overLimit ? ' · at limit' : ''}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className={`font-semibold ${r.balance > 0 ? 'text-emerald-700' : r.balance < 0 ? 'text-amber-700' : 'text-gray-900'}`}>
                        {formatPrice(Math.abs(r.balance))}
                      </p>
                      <p className="text-xs text-gray-500">{r.balance > 0 ? 'owed to rider' : r.balance < 0 ? 'rider owes' : 'settled'}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{r.totalDeliveries}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">{r.lastEntryAt ? formatDateTime(r.lastEntryAt) : '—'}</td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/admin/riders/${r.id}`} className="text-sm font-semibold text-green-700 hover:underline">
                        Settle up →
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {data.pagination.totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 text-sm">
              <span className="text-gray-500">
                Page {data.pagination.page} of {data.pagination.totalPages}
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                  Previous
                </Button>
                <Button variant="outline" size="sm" disabled={page >= data.pagination.totalPages} onClick={() => setPage(page + 1)}>
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Applications() {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [riders, setRiders] = useState<PendingRider[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadRiders = useCallback(async () => {
    try {
      setLoading(true);
      const response = await apiClient.get('/admin/pending-riders');
      if (response.data.success) {
        setRiders(response.data.data || []);
      }
    } catch (error) {
      showToast(apiErrorMessage(error, 'Failed to load pending riders'), 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadRiders();
  }, [loadRiders]);

  const handleApprove = async (riderId: string) => {
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

  const handleReject = async (riderId: string) => {
    let reason: string | undefined;
    try {
      reason = window.prompt('Reason for rejecting this rider application (optional):') || undefined;
    } catch {
      // Some embedded/automated browser contexts block native prompt() entirely —
      // fall back to no reason rather than letting the whole action die silently.
      reason = undefined;
    }
    try {
      setBusyId(riderId);
      await apiClient.post(`/admin/riders/${riderId}/reject`, { approved: false, reason });
      showToast('Rider rejected', 'success');
      setRiders((prev) => prev.filter((r) => r.id !== riderId));
    } catch (error) {
      showToast(apiErrorMessage(error, 'Failed to reject rider'), 'error');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-gray-600 text-sm">A rider can&apos;t see or claim any delivery until approved here.</p>
        <Button variant="outline" onClick={loadRiders} disabled={loading}>
          {loading ? 'Loading...' : 'Refresh'}
        </Button>
      </div>

      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading pending riders...</p>
        </div>
      ) : riders.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm p-12 text-center">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No riders awaiting approval</h3>
          <p className="text-gray-600">New rider applications will show up here.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {riders.map((rider) => (
            <div key={rider.id} className="bg-white border border-gray-200 rounded-lg p-6">
              <div className="flex items-start justify-between flex-wrap gap-4">
                <div className="flex-1 min-w-[240px]">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-lg font-semibold text-gray-900">{rider.user?.profile?.fullName || 'Unknown applicant'}</h3>
                    <span className="px-2 py-1 text-xs font-medium rounded bg-yellow-100 text-yellow-800">Pending</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-gray-500">Phone:</span> <span className="font-medium">{rider.user?.phone || '—'}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Email:</span> <span className="font-medium">{rider.user?.email || '—'}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">City:</span> <span className="font-medium">{rider.city}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Vehicle:</span>{' '}
                      <span className="font-medium">
                        {rider.vehicleType || 'Not provided'} {rider.vehicleNumber || ''}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500">Licence no.:</span> <span className="font-medium">{rider.licenseNumber || 'Not provided'}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Applied:</span> <span className="font-medium">{new Date(rider.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <DocumentList documents={rider.documents} />
                  {!rider.applicationComplete && (
                    <p className="mt-3 text-xs font-medium text-amber-700">
                      Waiting for the rider to send their vehicle details and CNIC / licence photos (they do this from their rider app).
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={() => handleApprove(rider.id)}
                    disabled={busyId === rider.id || !rider.applicationComplete}
                    title={rider.applicationComplete ? undefined : 'The application is not complete yet'}
                    className="bg-green-600 hover:bg-green-700 text-white"
                  >
                    {busyId === rider.id ? 'Working...' : 'Approve'}
                  </Button>
                  <Button variant="outline" onClick={() => handleReject(rider.id)} disabled={busyId === rider.id}>
                    Reject
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

