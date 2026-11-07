'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { DashboardLayout, adminSidebarFor } from '@/components/layout/DashboardShell';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { LoadError } from '@/components/ui/LoadError';
import { useDialogs } from '@/components/ui/Dialogs';
import { useAuthStore } from '@/lib/store/auth-store';
import { apiClient, apiErrorMessage } from '@/lib/api-client';
import DocumentList from '@/components/admin/DocumentList';
import { ExternalLink } from '@/components/ExternalLink';
import { RejectReasonModal } from '@/components/admin/RejectReasonModal';
import { LoadingLine, PhoneText, StatusPill } from '@/components/admin/AdminListParts';
import { formatDate } from '@/components/admin/admin-dates';
import { useShallow } from 'zustand/react/shallow';

interface PendingSeller {
  id: string;
  businessName: string;
  businessNameUrdu?: string | null;
  description?: string | null;
  createdAt: string;
  primaryCommunityName?: string | null;
  /** The community the application is linked to, named (falls back to the name the kitchen typed). */
  communityName?: string | null;
  /** What the application still lacks (the server works it out); empty when it is complete. */
  missing?: string[];
  latitude?: number | null;
  longitude?: number | null;
  documents: Array<{ id: string; type: string; url: string | null }>;
  user: {
    id: string;
    email: string | null;
    phone: string | null;
    profile?: { fullName?: string | null } | null;
  };
}

export default function AdminPendingSellersPage() {
  const { isAuthenticated, user } = useAuthStore(useShallow((s) => ({ isAuthenticated: s.isAuthenticated, user: s.user })));
  const isAdmin = user?.user_type === 'admin' || user?.userType === 'admin';
  const { showToast } = useToast();
  const { confirm: confirmDialog } = useDialogs();
  const [loading, setLoading] = useState(true);
  const [pendingSellers, setPendingSellers] = useState<PendingSeller[]>([]);
  // Why the applications could not be read; shown instead of "No applications", which would be untrue.
  const [loadError, setLoadError] = useState<unknown>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<PendingSeller | null>(null);

  const loadPendingSellers = useCallback(async () => {
    try {
      setLoading(true);
      const response = await apiClient.get('/admin/pending-sellers');
      if (response.data.success) {
        const found: typeof pendingSellers = response.data.data || [];
        // Complete applications first: those are the ones an admin can approve now.
        setPendingSellers([...found].sort((a, b) => (a.missing?.length ?? 0) - (b.missing?.length ?? 0)));
      }
      setLoadError(null);
    } catch (error) {
      setLoadError(error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated && isAdmin) void loadPendingSellers();
  }, [isAuthenticated, isAdmin, loadPendingSellers]);

  const decide = async (seller: PendingSeller, action: 'approve' | 'reject', reason?: string) => {
    if (
      action === 'approve' &&
      !(await confirmDialog({
        title: `Approve ${seller.businessName}?`,
        message: 'It can start listing dishes and taking orders.',
        confirmText: 'Approve',
        variant: 'warning',
      }))
    ) {
      return;
    }
    try {
      setProcessingId(seller.id);
      const response = await apiClient.post(`/admin/sellers/${seller.id}/${action}`, {
        approved: action === 'approve',
        notes: action === 'reject' ? reason : undefined,
      });
      if (response.data.success) {
        showToast(action === 'approve' ? `${seller.businessName} is approved` : 'Application rejected', 'success');
        setRejecting(null);
        void loadPendingSellers();
      }
    } catch (error) {
      showToast(apiErrorMessage(error, 'That did not go through'), 'error');
    } finally {
      setProcessingId(null);
    }
  };

  if (!isAuthenticated || !isAdmin) return null;

  return (
    <DashboardLayout
      title="Kitchen applications"
      subtitle="A kitchen can list dishes and take orders only once it is approved here."
      sidebarItems={adminSidebarFor(user?.permissions)}
      userType="admin"
    >
      <div className="max-w-5xl">
        {loading && pendingSellers.length === 0 ? (
          <LoadingLine text="Loading applications" />
        ) : loadError && pendingSellers.length === 0 ? (
          <LoadError error={loadError} onRetry={() => void loadPendingSellers()} title="We couldn't load the applications" />
        ) : pendingSellers.length === 0 ? (
          <p className="text-sm text-muted">No kitchen is waiting. New applications show up here.</p>
        ) : (
          <ul className="space-y-4" data-testid="kitchen-applications">
            {pendingSellers.map((seller) => {
              const missing = seller.missing ?? [];
              const busy = processingId === seller.id;
              const community = seller.communityName || seller.primaryCommunityName;
              return (
                <li key={seller.id} className="rounded-2xl border border-line bg-surface p-4 shadow-[var(--shadow-card)] sm:p-5">
                  <div className="flex flex-col gap-4 md:flex-row md:items-start">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link href={`/admin/sellers/${seller.id}`} className="inline-flex min-h-11 items-center text-[17px] font-semibold text-ink hover:text-brand-ink hover:underline">
                          {seller.businessName}
                        </Link>
                        {missing.length === 0 ? (
                          <StatusPill tone="waiting">Ready to approve</StatusPill>
                        ) : (
                          <StatusPill tone="problem">
                            Missing {missing.length} {missing.length === 1 ? 'item' : 'items'}
                          </StatusPill>
                        )}
                      </div>
                      {seller.businessNameUrdu && <p className="text-sm text-muted" dir="rtl">{seller.businessNameUrdu}</p>}
                      {seller.description && <p className="mt-1 text-sm text-ink">{seller.description}</p>}

                      <dl className="mt-3 grid grid-cols-[auto_1fr] items-baseline gap-x-4 gap-y-1.5 text-sm">
                        <dt className="text-muted">Owner</dt>
                        <dd className="min-w-0 text-ink">{seller.user.profile?.fullName || 'Not given'}</dd>
                        <dt className="text-muted">Phone</dt>
                        <dd className="min-w-0">
                          <PhoneText phone={seller.user.phone} />
                        </dd>
                        <dt className="text-muted">Email</dt>
                        <dd className="min-w-0 break-all text-ink">{seller.user.email || <span className="text-muted">Not given</span>}</dd>
                        <dt className="text-muted">Community</dt>
                        <dd className="min-w-0 text-ink">{community || <span className="text-muted">Not set</span>}</dd>
                        <dt className="text-muted">Kitchen pin</dt>
                        <dd className="min-w-0">
                          {seller.latitude != null && seller.longitude != null ? (
                            <ExternalLink href={`https://www.google.com/maps?q=${seller.latitude},${seller.longitude}`} className="font-medium text-brand-ink hover:underline">
                              Open in Maps
                            </ExternalLink>
                          ) : (
                            <span className="text-muted">Not set</span>
                          )}
                        </dd>
                        <dt className="text-muted">Applied</dt>
                        <dd className="min-w-0 text-ink">{formatDate(seller.createdAt)}</dd>
                      </dl>
                      <DocumentList documents={seller.documents ?? []} />
                      {missing.length > 0 && (
                        <p className="mt-3 text-xs text-red-700" data-testid="application-incomplete">
                          Missing: {missing.join(', ')}. The kitchen can still add these, or you can reject the application and say what is missing.
                        </p>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2 md:w-56 md:shrink-0">
                      <Button
                        variant="outline"
                        className="min-h-11 border-red-200 text-red-700 hover:bg-red-50"
                        onClick={() => setRejecting(seller)}
                        disabled={busy}
                      >
                        Reject
                      </Button>
                      <Button className="min-h-11" onClick={() => decide(seller, 'approve')} disabled={busy || missing.length > 0}>
                        {busy ? 'Working…' : 'Approve'}
                      </Button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <RejectReasonModal
        isOpen={!!rejecting}
        title={`Reject ${rejecting?.businessName ?? 'this kitchen'}?`}
        description="The kitchen is told the reason. It can fix the application and send it again."
        suggestions={['The photos of the CNIC are unclear', 'The kitchen photos are missing', 'The kitchen location does not match the address', 'The application is incomplete']}
        confirmLabel="Reject application"
        busy={!!rejecting && processingId === rejecting.id}
        onConfirm={(reason) => rejecting && decide(rejecting, 'reject', reason)}
        onCancel={() => setRejecting(null)}
      />
    </DashboardLayout>
  );
}
