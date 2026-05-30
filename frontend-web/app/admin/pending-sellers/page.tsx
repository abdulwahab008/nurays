'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { UserLayout } from '@/components/layout/UserLayout';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useAuthStore } from '@/lib/store/auth-store';
import { apiClient } from '@/lib/api-client';

interface PendingSeller {
  id: string;
  userId: string;
  businessName: string;
  businessNameUrdu?: string;
  description?: string;
  verificationStatus: string;
  status: string;
  createdAt: string;
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
  const [processingId, setProcessingId] = useState<string | null>(null);

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
    } catch (error: any) {
      const errorMessage = error.response?.data?.error?.message || error.response?.data?.message || 'Failed to load pending sellers';
      showToast(errorMessage, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleApproveReject = async (sellerId: string, action: 'approve' | 'reject') => {
    try {
      setProcessingId(sellerId);
      const response = await apiClient.post(`/admin/sellers/${sellerId}/${action}`, {
        approved: action === 'approve',
        notes: action === 'reject' ? 'Rejected by admin' : undefined,
      });
      
      if (response.data.success) {
        showToast(`Seller ${action === 'approve' ? 'approved' : 'rejected'} successfully!`, 'success');
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
    <UserLayout showSidebar={true} showNavbar={true}>
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
                    </div>
                  </div>

                  <div className="flex gap-2 ml-4">
                    <Button
                      onClick={() => handleApproveReject(seller.id, 'approve')}
                      disabled={processingId === seller.id}
                      className="bg-green-600 hover:bg-green-700 text-white"
                    >
                      {processingId === seller.id ? 'Processing...' : 'Approve'}
                    </Button>
                    <Button
                      onClick={() => handleApproveReject(seller.id, 'reject')}
                      disabled={processingId === seller.id}
                      variant="outline"
                      className="border-red-300 text-red-600 hover:bg-red-50"
                    >
                      {processingId === seller.id ? 'Processing...' : 'Reject'}
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </UserLayout>
  );
}

