'use client';

import { useCallback, useEffect, useState } from 'react';
import { DashboardLayout, adminSidebarFor } from '@/components/layout/DashboardShell';
import { Button } from '@/components/ui/button';
import { LoadError } from '@/components/ui/LoadError';
import { useToast } from '@/components/ui/toast';
import { RejectReasonModal } from '@/components/admin/RejectReasonModal';
import { AdminFilterTabs } from '@/components/admin/AdminFilterTabs';
import { LoadingLine, StatusPill, type PillTone } from '@/components/admin/AdminListParts';
import { useAuthStore } from '@/lib/store/auth-store';
import { apiClient, apiErrorMessage } from '@/lib/api-client';
import { formatDateTime } from '@/lib/utils';
import { useShallow } from 'zustand/react/shallow';

interface CategoryRequest {
  id: string;
  sellerId: string;
  productType: string;
  name: string;
  nameUrdu?: string;
  description?: string;
  parentCategoryId?: string;
  status: string;
  adminNotes?: string;
  createdAt: string;
  updatedAt: string;
  seller?: {
    id: string;
    businessName: string;
    user?: {
      name: string;
      email: string;
    };
  };
  parentCategory?: {
    id: string;
    name: string;
  };
}

const PRODUCT_TYPE_LABEL: Record<string, string> = {
  frozen: 'Frozen',
  fresh: 'Fresh',
  ready_to_eat: 'Ready to eat',
  ready_to_cook: 'Ready to cook',
};

const STATUS: Record<string, { tone: PillTone; label: string }> = {
  pending: { tone: 'waiting', label: 'Waiting' },
  approved: { tone: 'good', label: 'Approved' },
  category_created: { tone: 'good', label: 'Category created' },
  rejected: { tone: 'problem', label: 'Rejected' },
};

type Filter = 'pending' | 'approved' | 'rejected' | 'all';
const FILTERS: ReadonlyArray<{ id: Filter; label: string }> = [
  { id: 'pending', label: 'Waiting' },
  { id: 'approved', label: 'Approved' },
  { id: 'rejected', label: 'Rejected' },
  { id: 'all', label: 'All' },
];

export default function CategoryRequestsPage() {
  const { isAuthenticated, user } = useAuthStore(useShallow((s) => ({ isAuthenticated: s.isAuthenticated, user: s.user })));
  const isAdmin = user?.user_type === 'admin' || user?.userType === 'admin';
  const { showToast } = useToast();
  const [requests, setRequests] = useState<CategoryRequest[]>([]);
  const [loading, setLoading] = useState(true);
  // Why the requests could not be read; shown instead of "No requests", which would be untrue.
  const [loadError, setLoadError] = useState<unknown>(null);
  const [filter, setFilter] = useState<Filter>('pending');
  const [rejecting, setRejecting] = useState<CategoryRequest | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const loadRequests = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiClient.get('/category-requests', { params: { status: filter === 'all' ? undefined : filter } });
      if (response.data.success) setRequests(response.data.data || []);
      setLoadError(null);
    } catch (error) {
      setRequests([]);
      setLoadError(error);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    if (isAuthenticated && isAdmin) void loadRequests();
  }, [isAuthenticated, isAdmin, loadRequests]);

  const handleApprove = async (request: CategoryRequest) => {
    setActionLoading(true);
    try {
      const response = await apiClient.post(`/category-requests/${request.id}/approve`);
      if (response.data.success) {
        showToast(`${request.name} is now a category`, 'success');
        void loadRequests();
      }
    } catch (error) {
      showToast(apiErrorMessage(error, 'That did not go through'), 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async (reason: string) => {
    if (!rejecting) return;
    setActionLoading(true);
    try {
      const response = await apiClient.post(`/category-requests/${rejecting.id}/reject`, { reason });
      if (response.data.success) {
        showToast('Request rejected', 'success');
        setRejecting(null);
        void loadRequests();
      }
    } catch (error) {
      showToast(apiErrorMessage(error, 'That did not go through'), 'error');
    } finally {
      setActionLoading(false);
    }
  };

  if (!isAuthenticated || !isAdmin) return null;

  return (
    <DashboardLayout
      title="Category requests"
      subtitle="Kitchens ask for a category their dishes do not fit. Approving one creates it."
      sidebarItems={adminSidebarFor(user?.permissions)}
      userType="admin"
    >
      <div className="max-w-5xl">
        <AdminFilterTabs label="Request status" value={filter} onChange={setFilter} tabs={FILTERS} className="mb-5" />

        {loading && requests.length === 0 ? (
          <LoadingLine text="Loading requests" />
        ) : loadError ? (
          <LoadError error={loadError} onRetry={() => void loadRequests()} title="We couldn't load the category requests" />
        ) : requests.length === 0 ? (
          <p className="py-2 text-sm text-muted" data-testid="category-requests-empty">
            {filter === 'all'
              ? 'No kitchen has asked for a new category yet.'
              : filter === 'pending'
                ? 'No request is waiting. When a kitchen asks for a new category, it shows up here.'
                : `No ${FILTERS.find((f) => f.id === filter)?.label.toLowerCase()} requests.`}
          </p>
        ) : (
          <ul className="space-y-4">
            {requests.map((request) => {
              const st = STATUS[request.status] ?? { tone: 'neutral' as PillTone, label: request.status };
              const pending = request.status === 'pending';
              return (
                <li
                  key={request.id}
                  className={pending ? 'rounded-2xl border border-line bg-surface p-4 shadow-[var(--shadow-card)] sm:p-5' : 'border-t border-line py-4'}
                >
                  <div className="flex flex-col gap-4 md:flex-row md:items-start">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-[17px] font-semibold text-ink">{request.name}</h3>
                        <StatusPill tone={st.tone}>{st.label}</StatusPill>
                      </div>
                      {request.nameUrdu && (
                        <p className="text-sm text-muted" dir="rtl">
                          {request.nameUrdu}
                        </p>
                      )}
                      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                        <dt className="text-muted">Kitchen</dt>
                        <dd className="min-w-0 text-ink">
                          {request.seller?.businessName || 'Unknown kitchen'}
                          {request.seller?.user?.email && <span className="break-all text-muted"> ({request.seller.user.email})</span>}
                        </dd>
                        <dt className="text-muted">Food type</dt>
                        <dd className="text-ink">{PRODUCT_TYPE_LABEL[request.productType] ?? request.productType}</dd>
                        <dt className="text-muted">Place</dt>
                        <dd className="text-ink">{request.parentCategory ? `Under ${request.parentCategory.name}` : 'A main category'}</dd>
                        <dt className="text-muted">Asked</dt>
                        <dd className="text-ink">{formatDateTime(request.createdAt)}</dd>
                      </dl>
                      {request.description && <p className="mt-3 rounded-xl bg-raised p-3 text-sm text-ink">{request.description}</p>}
                      {request.status === 'rejected' && request.adminNotes && (
                        <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">Rejected: {request.adminNotes}</p>
                      )}
                    </div>
                    {pending && (
                      <div className="grid grid-cols-2 gap-2 md:w-56 md:shrink-0">
                        <Button
                          variant="outline"
                          className="min-h-11 border-red-200 text-red-700 hover:bg-red-50"
                          onClick={() => setRejecting(request)}
                          disabled={actionLoading}
                        >
                          Reject
                        </Button>
                        <Button className="min-h-11" onClick={() => handleApprove(request)} disabled={actionLoading}>
                          Approve
                        </Button>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <RejectReasonModal
        isOpen={!!rejecting}
        title={`Reject ${rejecting?.name ?? 'this request'}?`}
        description={`${rejecting?.seller?.businessName ?? 'The kitchen'} is told the reason.`}
        suggestions={['A category like this already exists', 'The name is unclear', 'This is not food Nuray sells']}
        confirmLabel="Reject request"
        audience="kitchen"
        helpText="It can ask again with a clearer name."
        busy={actionLoading}
        onConfirm={handleReject}
        onCancel={() => setRejecting(null)}
      />
    </DashboardLayout>
  );
}
