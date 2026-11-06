'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { DashboardLayout, adminSidebarFor } from '@/components/layout/DashboardShell';
import { Button } from '@/components/ui/button';
import { AdminFilterTabs } from '@/components/admin/AdminFilterTabs';
import { LoadingLine, Pager, StatusPill } from '@/components/admin/AdminListParts';
import { useAuthStore } from '@/lib/store/auth-store';
import { useShallow } from 'zustand/react/shallow';
import { useToast } from '@/components/ui/toast';
import { LoadError } from '@/components/ui/LoadError';
import { apiClient, apiErrorMessage } from '@/lib/api-client';
import { formatDateTime } from '@/components/admin/admin-dates';

interface ReviewRow {
  id: string;
  createdAt: string;
  reportedSince: string | null;
  productId: string | null;
  productName: string | null;
  sellerId: string;
  businessName: string;
  customerId: string;
  customerName: string;
  productRating: number | null;
  sellerRating: number | null;
  deliveryRating: number | null;
  comment: string | null;
  sellerResponse: string | null;
  isVisible: boolean;
  isReported: boolean;
  reason: string | null;
  reportCount: number;
}

const TABS = [
  ['reported', 'Reported'],
  ['hidden', 'Hidden'],
  ['all', 'All reviews'],
] as const;

type Tab = (typeof TABS)[number][0];

const EMPTY: Record<Tab, string> = {
  reported: 'Nothing reported. Every review on the site stands.',
  hidden: 'No review has been hidden.',
  all: 'No reviews yet.',
};


/**
 * What customers write is public, so people can report a review and staff decide: hide it (it leaves every public
 * page and stops counting towards the dish's, the kitchen's and the rider's rating), keep it (the report is closed),
 * or show a hidden one again. Who reported what is in the audit log.
 */
export default function AdminReviewsPage() {
  const { user } = useAuthStore(useShallow((s) => ({ user: s.user })));
  const { showToast } = useToast();
  const [tab, setTab] = useState<Tab>('reported');
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  // Why the reviews could not be read; shown instead of "Nothing reported. Every review on the site stands.", which would be untrue.
  const [loadError, setLoadError] = useState<unknown>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiClient.get('/admin/reviews', { params: { status: tab, page: String(page) } });
      setRows(res.data.data.reviews);
      setTotalPages(res.data.data.pagination.totalPages || 1);
      setTotal(res.data.data.pagination.total ?? 0);
      setLoadError(null);
    } catch (error) {
      // The rows on the screen belong to the tab and page before this change, so they go with the failure.
      setRows([]);
      setLoadError(error);
    } finally {
      setLoading(false);
    }
  }, [tab, page]);

  useEffect(() => {
    load();
  }, [load]);

  const decide = async (id: string, action: 'hide' | 'keep' | 'restore') => {
    try {
      setBusyId(id);
      await apiClient.post(`/admin/reviews/${id}/${action}`);
      showToast(action === 'hide' ? 'Review hidden' : action === 'keep' ? 'Report closed; the review stays' : 'Review shown again', 'success');
      await load();
    } catch (error) {
      showToast(apiErrorMessage(error, 'That did not go through'), 'error');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <DashboardLayout
      title="Reviews"
      subtitle="A report does not hide a review: it waits here for a person to decide. A hidden review leaves every public page and stops counting towards the ratings."
      sidebarItems={adminSidebarFor(user?.permissions)}
      userType="admin"
    >
      <div className="max-w-4xl space-y-5">
        <AdminFilterTabs
          label="Which reviews"
          value={tab}
          onChange={(id) => {
            setTab(id);
            setPage(1);
          }}
          tabs={TABS.map(([id, label]) => ({ id, label }))}
        />

        {loading && rows.length === 0 ? (
          <LoadingLine text="Loading reviews" />
        ) : loadError ? (
          <LoadError error={loadError} onRetry={load} title="We couldn't load the reviews" />
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted">{EMPTY[tab]}</p>
        ) : (
          <ul className="divide-y divide-line border-y border-line" data-testid="reviews-list">
            {rows.map((r) => (
              <li key={r.id} className="py-4" data-testid="review-row">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-semibold text-accent-soft-ink tabular-nums"
                        aria-label={r.productRating ? `${r.productRating} out of 5` : 'No rating'}
                      >
                        {r.productRating ? `★ ${r.productRating} of 5` : 'No rating'}
                      </span>
                      {!r.isVisible && <StatusPill tone="problem">Hidden</StatusPill>}
                      {r.isReported && r.isVisible && <StatusPill tone="waiting">Reported</StatusPill>}
                    </div>
                    <p className="mt-1 text-sm text-muted">
                      {r.productName ? (
                        r.productId ? (
                          <Link href={`/products/${r.productId}`} className="-my-3 inline-flex min-h-11 items-center font-medium text-brand-ink hover:underline">
                            {r.productName}
                          </Link>
                        ) : (
                          r.productName
                        )
                      ) : (
                        'A dish that is gone'
                      )}{' '}
                      · <bdi>{r.businessName}</bdi> · <bdi>{formatDateTime(r.createdAt)}</bdi>
                    </p>
                  </div>
                  <p className="text-sm font-semibold text-ink">{r.customerName}</p>
                </div>

                <p className="mt-3 whitespace-pre-wrap break-words text-ink">{r.comment || <span className="text-muted">No written comment</span>}</p>
                {r.sellerResponse && <p className="mt-2 rounded-xl bg-raised px-3 py-2 text-sm text-ink">The kitchen replied: {r.sellerResponse}</p>}

                {(r.isReported || r.reason) && (
                  <p className="mt-3 rounded-xl bg-accent-soft px-3 py-2 text-sm text-accent-soft-ink" data-testid="report-reason">
                    {r.isReported ? 'Reported' : 'Was reported'}
                    {r.reportCount > 0 ? ` ${r.reportCount} time${r.reportCount === 1 ? '' : 's'}` : ''}
                    {r.reportedSince ? `, first ${formatDateTime(r.reportedSince)}` : ''}: {r.reason}
                  </p>
                )}

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {!r.isVisible ? (
                    <Button variant="outline" className="min-h-11" disabled={busyId === r.id} onClick={() => decide(r.id, 'restore')}>
                      Show again
                    </Button>
                  ) : (
                    <>
                      {r.isReported && (
                        <Button variant="outline" className="min-h-11" disabled={busyId === r.id} onClick={() => decide(r.id, 'keep')}>
                          Keep it
                        </Button>
                      )}
                      <Button variant="outline" className="min-h-11 border-red-200 text-red-700 hover:bg-red-50" disabled={busyId === r.id} onClick={() => decide(r.id, 'hide')}>
                        Hide review
                      </Button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        <Pager page={page} totalPages={totalPages} total={total} noun="reviews" one="review" onChange={setPage} />
      </div>
    </DashboardLayout>
  );
}
