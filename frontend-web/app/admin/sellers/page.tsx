'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { DashboardLayout, adminSidebarFor } from '@/components/layout/DashboardShell';
import { LoadError } from '@/components/ui/LoadError';
import { AdminFilterTabs } from '@/components/admin/AdminFilterTabs';
import { LoadingLine, Pager, SearchForm, StatusPill, type PillTone } from '@/components/admin/AdminListParts';
import { useAuthStore } from '@/lib/store/auth-store';
import { apiClient } from '@/lib/api-client';
import { displayRating } from '@/lib/utils';
import { formatDate } from '@/components/admin/admin-dates';
import { useShallow } from 'zustand/react/shallow';

interface Seller {
  id: string;
  businessName: string;
  businessNameUrdu?: string | null;
  verificationStatus: string;
  status: string;
  createdAt: string;
  communityName?: string | null;
  isOpen?: boolean;
  ratingAverage?: number;
  totalReviews?: number;
  totalDishes?: number;
  liveDishes?: number;
  orders30d?: number;
  user: {
    email: string | null;
    phone: string | null;
    profile?: { fullName?: string | null } | null;
  };
}

type Filter = 'all' | 'approved' | 'pending' | 'rejected' | 'suspended';
const FILTERS: Filter[] = ['all', 'approved', 'pending', 'rejected', 'suspended'];
const FILTER_LABEL: Record<Filter, string> = { all: 'All', approved: 'Approved', pending: 'Waiting', rejected: 'Rejected', suspended: 'Suspended' };
const PAGE_SIZE = 25;

/** One pill per kitchen: what a customer would find right now, or why it is not on Nuray. */
function kitchenStatus(s: Pick<Seller, 'verificationStatus' | 'status' | 'isOpen'>): { tone: PillTone; label: string } {
  if (s.status === 'suspended') return { tone: 'problem', label: 'Suspended' };
  if (s.verificationStatus === 'pending') return { tone: 'waiting', label: 'Waiting' };
  if (s.verificationStatus === 'rejected') return { tone: 'problem', label: 'Rejected' };
  if (s.status !== 'active') return { tone: 'neutral', label: 'Inactive' };
  return s.isOpen === false ? { tone: 'neutral', label: 'Closed now' } : { tone: 'good', label: 'Live' };
}

export default function AdminAllSellersPage() {
  return (
    <Suspense fallback={null}>
      <AdminAllSellers />
    </Suspense>
  );
}

function AdminAllSellers() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated, user } = useAuthStore(useShallow((s) => ({ isAuthenticated: s.isAuthenticated, user: s.user })));
  const isAdmin = user?.user_type === 'admin' || user?.userType === 'admin';
  const param = searchParams.get('status') as Filter | null;
  const filter: Filter = param && FILTERS.includes(param) ? param : 'all';
  const [loading, setLoading] = useState(true);
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [counts, setCounts] = useState<Partial<Record<Filter, number>> | null>(null);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1 });
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState('');
  // Why the kitchens could not be read; shown instead of "No kitchens", which would be untrue.
  const [loadError, setLoadError] = useState<unknown>(null);

  const loadSellers = useCallback(async () => {
    try {
      setLoading(true);
      const response = await apiClient.get('/admin/sellers', {
        params: {
          verificationStatus: ['approved', 'pending', 'rejected'].includes(filter) ? filter : undefined,
          status: filter === 'suspended' ? 'suspended' : undefined,
          search: query || undefined,
          page,
          limit: PAGE_SIZE,
        },
      });
      const data = response.data.data;
      setSellers(data.sellers || []);
      setCounts(data.counts ?? null);
      setPagination({ total: data.pagination?.total ?? 0, totalPages: data.pagination?.totalPages || 1 });
      setLoadError(null);
    } catch (error) {
      // The kitchens on the screen belong to the filter before this change, so they go with the failure.
      setSellers([]);
      setLoadError(error);
    } finally {
      setLoading(false);
    }
  }, [filter, query, page]);

  useEffect(() => {
    if (isAuthenticated && isAdmin) void loadSellers();
  }, [isAuthenticated, isAdmin, loadSellers]);

  if (!isAuthenticated || !isAdmin) return null;

  const owner = (s: Seller) => s.user.profile?.fullName || s.user.email || 'Owner not named';
  const rating = (s: Seller) => displayRating(s.ratingAverage, s.totalReviews);

  return (
    <DashboardLayout title="Kitchens" sidebarItems={adminSidebarFor(user?.permissions)} userType="admin">
      <div className="max-w-6xl">
        <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <AdminFilterTabs
            label="Kitchen status"
            value={filter}
            onChange={(next) => {
              setPage(1);
              router.replace(next === 'all' ? '/admin/sellers' : `/admin/sellers?status=${next}`);
            }}
            tabs={FILTERS.map((f) => ({ id: f, label: FILTER_LABEL[f], count: counts?.[f] ?? null, waiting: f === 'pending' }))}
            className="md:flex-1"
          />
          <SearchForm
            placeholder="Kitchen, owner, phone or email"
            label="Search kitchens"
            onSearch={(q) => {
              setQuery(q);
              setPage(1);
            }}
          />
        </div>

        {loading && sellers.length === 0 ? (
          <LoadingLine text="Loading kitchens" />
        ) : loadError ? (
          <LoadError error={loadError} onRetry={() => void loadSellers()} title="We couldn't load the kitchens" />
        ) : sellers.length === 0 ? (
          <p className="py-6 text-sm text-muted">
            {query ? 'No kitchen matches that search.' : filter === 'all' ? 'No kitchen has signed up yet.' : `No ${FILTER_LABEL[filter].toLowerCase()} kitchens.`}
          </p>
        ) : (
          <>
            {/* Phones: one short row per kitchen, the whole row opens it. */}
            <ul className="divide-y divide-line border-y border-line md:hidden" data-testid="kitchens-list">
              {sellers.map((s) => {
                const st = kitchenStatus(s);
                return (
                  <li key={s.id}>
                    <Link href={`/admin/sellers/${s.id}`} className="flex min-h-[72px] items-center gap-3 py-3 hover:bg-page">
                      <span className="min-w-0 flex-1">
                        <span className="flex items-start justify-between gap-2">
                          <span className="text-sm font-semibold text-ink">{s.businessName}</span>
                          <StatusPill tone={st.tone}>{st.label}</StatusPill>
                        </span>
                        <span className="block truncate text-xs text-muted">
                          {owner(s)}
                          {s.communityName ? ` · ${s.communityName}` : ''}
                        </span>
                        <span className="block text-xs text-muted">
                          {s.totalDishes ? `${s.liveDishes ?? 0} of ${s.totalDishes} dishes live` : 'No dishes yet'} · {s.orders30d ?? 0} {s.orders30d === 1 ? 'order' : 'orders'} in 30 days
                          {rating(s) ? ` · ${rating(s)} stars` : ''}
                        </span>
                      </span>
                      <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-muted rtl:rotate-180" />
                    </Link>
                  </li>
                );
              })}
            </ul>

            <div className="hidden overflow-x-auto rounded-2xl border border-line bg-surface md:block">
              <table className="w-full text-sm [&_th]:text-start" data-testid="kitchens-table">
                <thead className="border-b border-line text-xs text-muted">
                  <tr>
                    <th className="px-4 py-3 font-medium">Kitchen</th>
                    <th className="px-4 py-3 font-medium">Owner</th>
                    <th className="px-4 py-3 font-medium">Dishes live</th>
                    <th className="px-4 py-3 font-medium">Orders, 30 days</th>
                    <th className="px-4 py-3 font-medium">Rating</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Joined</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {sellers.map((s) => {
                    const st = kitchenStatus(s);
                    return (
                      <tr key={s.id} className="hover:bg-page">
                        <td className="px-4 py-3">
                          <Link href={`/admin/sellers/${s.id}`} className="font-semibold text-ink hover:text-brand-ink hover:underline">
                            {s.businessName}
                          </Link>
                          <p className="text-xs text-muted">{s.communityName || 'No community set'}</p>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-ink">{owner(s)}</p>
                          <p className="text-xs text-muted">{s.user.phone || s.user.email || 'No contact given'}</p>
                        </td>
                        <td className="px-4 py-3 tabular-nums text-ink">
                          {s.liveDishes ?? 0} <span className="text-muted">of {s.totalDishes ?? 0}</span>
                        </td>
                        <td className="px-4 py-3 tabular-nums text-ink">{s.orders30d ?? 0}</td>
                        <td className="px-4 py-3 tabular-nums text-ink">{rating(s) ?? <span className="text-muted">New</span>}</td>
                        <td className="px-4 py-3">
                          <StatusPill tone={st.tone}>{st.label}</StatusPill>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-muted">{formatDate(s.createdAt)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pager page={page} totalPages={pagination.totalPages} total={pagination.total} noun="kitchens" one="kitchen" onChange={setPage} />
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
