'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AdminShell } from '@/components/layout/AdminShell';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { LoadError } from '@/components/ui/LoadError';
import { useAuthStore } from '@/lib/store/auth-store';
import { apiClient } from '@/lib/api-client';
import DocumentList from '@/components/admin/DocumentList';
import { ExternalLink } from '@/components/ExternalLink';
import { RejectReasonModal } from '@/components/admin/RejectReasonModal';

interface PendingSeller {
  id: string;
  userId: string;
  businessName: string;
  businessNameUrdu?: string;
  description?: string;
  verificationStatus: string;
  status: string;
  createdAt: string;
  primaryCommunityName?: string | null;
  /** What the application still lacks (the server works it out); empty when it is complete. */
  missing?: string[];
  latitude?: number | null;
  longitude?: number | null;
  documents: Array<{ id: string; type: string; url: string | null }>;
  user: {
    id: string;
    email: string;
    phone: string;
    profile?: {
      fullName?: string;
    };
  };
}

export default function AdminPendingSellersPage() {
  const router = useRouter();
  const { isAuthenticated, user } = useAuthStore();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [pendingSellers, setPendingSellers] = useState<PendingSeller[]>([]);
  // Why the applications could not be read; shown instead of "No Pending Applications", which would be untrue.
  const [loadError, setLoadError] = useState<unknown>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<PendingSeller | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/admin/login');
      return;
    }

    if (user?.user_type !== 'admin' && user?.userType !== 'admin') {
      router.push('/products');
      showToast('Access denied. Admin privileges required.', 'error');
      return;
    }

    loadPendingSellers();
  }, [isAuthenticated, user, router]);

  const loadPendingSellers = async () => {
    try {
      setLoading(true);
      const response = await apiClient.get('/admin/pending-sellers');
      if (response.data.success) {
        setPendingSellers(response.data.data || []);
      }
      setLoadError(null);
    } catch (error: any) {
      setLoadError(error);
    } finally {
      setLoading(false);
    }
  };

  const handleApproveReject = async (sellerId: string, action: 'approve' | 'reject', reason?: string) => {
    try {
      setProcessingId(sellerId);
      const response = await apiClient.post(`/admin/sellers/${sellerId}/${action}`, {
        approved: action === 'approve',
        notes: action === 'reject' ? reason : undefined,
      });
      
      if (response.data.success) {
        showToast(`Seller ${action === 'approve' ? 'approved' : 'rejected'} successfully!`, 'success');
        setRejecting(null);
        loadPendingSellers();
      }
    } catch (error: any) {
      const errorMessage = error.response?.data?.error?.message || error.response?.data?.message || `Failed to ${action} seller`;
      showToast(errorMessage, 'error');
    } finally {
      setProcessingId(null);
    }
  };

  if (!isAuthenticated || (user?.user_type !== 'admin' && user?.userType !== 'admin')) {
    return null;
  }

  return (
    <AdminShell>
      <div className="max-w-7xl mx-auto">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Pending Seller Applications</h1>
            <p className="text-gray-600 mt-1">Review and approve seller applications</p>
          </div>
          <Button variant="outline" onClick={loadPendingSellers} disabled={loading}>
            {loading ? 'Loading...' : 'Refresh'}
          </Button>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading pending applications...</p>
          </div>
        ) : loadError && pendingSellers.length === 0 ? (
          <LoadError error={loadError} onRetry={loadPendingSellers} title="We couldn't load the applications" />
        ) : pendingSellers.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm p-12 text-center">
            <div className="text-6xl mb-4">✅</div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No Pending Applications</h3>
            <p className="text-gray-600">All seller applications have been reviewed.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {pendingSellers.map((seller) => (
              <div
                key={seller.id}
                className="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-semibold text-gray-900">
                        {seller.businessName}
                      </h3>
                      {seller.businessNameUrdu && (
                        <span className="text-sm text-gray-500">({seller.businessNameUrdu})</span>
                      )}
                      <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs font-medium rounded">
                        {seller.verificationStatus}
                      </span>
                    </div>

                    {seller.description && (
                      <p className="text-gray-600 text-sm mb-3 line-clamp-2">
                        {seller.description}
                      </p>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-gray-500">Seller:</span>{' '}
                        <span className="font-medium">
                          {seller.user.profile?.fullName || seller.user.email}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500">Email:</span>{' '}
                        <span className="font-medium">{seller.user.email}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Phone:</span>{' '}
                        <span className="font-medium">{seller.user.phone}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Applied:</span>{' '}
                        <span className="font-medium">
                          {new Date(seller.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500">Community:</span>{' '}
                        <span className="font-medium">{seller.primaryCommunityName || 'Not set'}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Kitchen location:</span>{' '}
                        {seller.latitude != null && seller.longitude != null ? (
                          <ExternalLink
                            href={`https://www.google.com/maps?q=${seller.latitude},${seller.longitude}`}
                            className="font-medium underline"
                          >
                            Open in Maps
                          </ExternalLink>
                        ) : (
                          <span className="font-medium">Not set</span>
                        )}
                      </div>
                    </div>
                    <DocumentList documents={seller.documents ?? []} />
                    {(seller.missing?.length ?? 0) > 0 && (
                      <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900" data-testid="application-incomplete">
                        Cannot be approved yet: this kitchen has not sent its {seller.missing!.join(', ')}. It can still add them to this
                        application; or reject it and say what is missing.
                      </p>
                    )}
                  </div>

                  <div className="flex gap-2 ms-4">
                    <Button
                      onClick={() => handleApproveReject(seller.id, 'approve')}
                      disabled={processingId === seller.id || (seller.missing?.length ?? 0) > 0}
                      title={(seller.missing?.length ?? 0) > 0 ? `Missing: ${seller.missing!.join(', ')}` : undefined}
                      className="bg-green-600 hover:bg-green-700 text-white"
                    >
                      {processingId === seller.id ? 'Processing...' : 'Approve'}
                    </Button>
                    <Button
                      onClick={() => setRejecting(seller)}
                      disabled={processingId === seller.id}
                      variant="outline"
                      className="border-red-300 text-red-600 hover:bg-red-50"
                    >
                      Reject
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <RejectReasonModal
        isOpen={!!rejecting}
        title={`Reject ${rejecting?.businessName ?? 'this kitchen'}?`}
        description="The kitchen is told the reason. It can fix the application and send it again."
        suggestions={['The photos of the CNIC are unclear', 'The kitchen photos are missing', 'The kitchen location does not match the address', 'The application is incomplete']}
        confirmLabel="Reject application"
        busy={!!rejecting && processingId === rejecting.id}
        onConfirm={(reason) => rejecting && handleApproveReject(rejecting.id, 'reject', reason)}
        onCancel={() => setRejecting(null)}
      />
    </AdminShell>
  );
}

