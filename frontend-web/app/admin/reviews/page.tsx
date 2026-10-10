'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AdminShell } from '@/components/layout/AdminShell';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { apiClient, apiErrorMessage } from '@/lib/api-client';
import { formatDateTime } from '@/lib/utils';

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

const stars = (n: number | null) => (n ? `${'★'.repeat(n)}${'☆'.repeat(5 - n)}` : 'no rating');

/**
 * What customers write is public, so people can report a review and staff decide: hide it (it leaves every public
 * page and stops counting towards the dish's, the kitchen's and the rider's rating), keep it (the report is closed),
 * or show a hidden one again. Who reported what is in the audit log.
 */
export default function AdminReviewsPage() {
  const { showToast } = useToast();
  const [tab, setTab] = useState<Tab>('reported');
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiClient.get('/admin/reviews', { params: { status: tab, page: String(page) } });
      setRows(res.data.data.reviews);
      setTotalPages(res.data.data.pagination.totalPages || 1);
    } catch (error) {
      showToast(apiErrorMessage(error, 'Failed to load reviews'), 'error');
    } finally {
      setLoading(false);
    }
  }, [tab, page, showToast]);

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
    <AdminShell>
      <div className="max-w-5xl mx-auto space-y-5">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Reviews</h1>
          <p className="text-gray-600 mt-1">
            Customers can report a review. A report does not hide it: it waits here for a person to decide. A hidden review leaves every public page and stops counting towards the ratings.
          </p>
        </div>

        <div className="inline-flex rounded-xl border border-gray-200 bg-white p-1">
          {TABS.map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setTab(id);
                setPage(1);
              }}
              className={`px-4 py-2 rounded-lg text-sm font-semibold ${tab === id ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
            >
              {label}
            </button>
          ))}
        </div>

        {loading && rows.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-lg p-10 text-center text-gray-500">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-lg p-10 text-center text-gray-500">{EMPTY[tab]}</div>
        ) : (
          <div className="space-y-3" data-testid="reviews-list">
            {rows.map((r) => (
              <div key={r.id} className="bg-white border border-gray-200 rounded-lg p-5" data-testid="review-row">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-amber-500 text-lg" aria-label={`${r.productRating ?? 0} out of 5`}>
                      {stars(r.productRating)}
                    </p>
                    <p className="text-sm text-gray-600 mt-1">
                      {r.productName ? (
                        r.productId ? (
                          <Link href={`/products/${r.productId}`} className="underline font-medium">
                            {r.productName}
                          </Link>
                        ) : (
                          r.productName
                        )
                      ) : (
                        'A dish that is gone'
                      )}{' '}
                      · {r.businessName} · {formatDateTime(r.createdAt)}
                    </p>
                  </div>
                  <div className="text-sm text-end">
                    <p className="font-semibold text-gray-900">{r.customerName}</p>
                    <Link href={`/admin/users?search=${encodeURIComponent(r.customerName)}`} className="text-gray-500 text-xs underline">
                      find this person
                    </Link>
                  </div>
                </div>

                <p className="mt-3 text-gray-800 whitespace-pre-wrap break-words">{r.comment || <span className="text-gray-400">No written comment</span>}</p>
                {r.sellerResponse && <p className="mt-2 text-sm bg-gray-50 rounded-lg px-3 py-2 text-gray-600">The kitchen replied: {r.sellerResponse}</p>}

                {(r.isReported || r.reason) && (
                  <p className="mt-3 text-sm bg-amber-50 border border-amber-200 text-amber-900 rounded-lg px-3 py-2" data-testid="report-reason">
                    {r.isReported ? 'Reported' : 'Was reported'}
                    {r.reportCount > 0 ? ` ${r.reportCount} time${r.reportCount === 1 ? '' : 's'}` : ''}
                    {r.reportedSince ? `, first ${formatDateTime(r.reportedSince)}` : ''}: {r.reason}
                  </p>
                )}

                <div className="mt-4 flex flex-wrap gap-2 items-center">
                  {!r.isVisible ? (
                    <>
                      <span className="text-xs font-semibold text-red-700 bg-red-50 rounded-full px-3 py-1">Hidden from the public</span>
                      <Button size="sm" variant="outline" disabled={busyId === r.id} onClick={() => decide(r.id, 'restore')}>
                        Show again
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button size="sm" variant="destructive" disabled={busyId === r.id} onClick={() => decide(r.id, 'hide')}>
                        Hide review
                      </Button>
                      {r.isReported && (
                        <Button size="sm" variant="outline" disabled={busyId === r.id} onClick={() => decide(r.id, 'keep')}>
                          Keep it (close the report)
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              Previous
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
              Next
            </Button>
          </div>
        )}
      </div>
    </AdminShell>
  );
}
