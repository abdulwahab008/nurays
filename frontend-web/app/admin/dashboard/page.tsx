'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { DashboardLayout, ADMIN_SIDEBAR_ITEMS } from '@/components/layout/DashboardShell';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { LoadError } from '@/components/ui/LoadError';
import { useAuthStore } from '@/lib/store/auth-store';
import { apiClient, apiErrorMessage } from '@/lib/api-client';
import { formatPrice } from '@/lib/utils';
import { RejectReasonModal } from '@/components/admin/RejectReasonModal';
import { useShallow } from 'zustand/react/shallow';

interface PendingSeller {
  id: string;
  userId: string;
  businessName: string;
  businessNameUrdu?: string;
  description?: string;
  verificationStatus: string;
  status: string;
  createdAt: string;
  /** What the application still lacks (the server works it out); empty when it is complete. */
  missing?: string[];
  user: {
    id: string;
    email: string;
    phone: string;
    profile?: {
      fullName?: string;
    };
  };
}

interface PlatformStats {
  today: {
    orders: number;
    revenue: number;
  };
  pendingOrders: number;
  inTransitOrders: number;
  cancelledOrdersLast7Days: number;
  averageOrderValue: number;
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const { isAuthenticated, user } = useAuthStore(useShallow((s) => ({ isAuthenticated: s.isAuthenticated, user: s.user })));
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [pendingSellers, setPendingSellers] = useState<PendingSeller[]>([]);
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<PendingSeller | null>(null);
  // null: the count could not be read (not "0 waiting").
  const [pendingCategoryRequests, setPendingCategoryRequests] = useState<number | null>(0);
  // Why each part could not be read; each is said on its own, instead of "No Pending Applications" or figures left out.
  const [sellersError, setSellersError] = useState<unknown>(null);
  const [statsError, setStatsError] = useState<unknown>(null);

  const loadDashboardData = async () => {
    setLoading(true);
    // Three independent reads: one failing must not hide the other two, and none may be shown as "nothing" when it failed.
    const [sellersRes, categoriesRes, statsRes] = await Promise.allSettled([
      apiClient.get('/admin/pending-sellers'),
      apiClient.get('/category-requests/pending-count'),
      apiClient.get('/admin/statistics'),
    ]);

    if (sellersRes.status === 'fulfilled' && sellersRes.value.data.success) {
      setPendingSellers(sellersRes.value.data.data || []);
      setSellersError(null);
    } else {
      setSellersError(sellersRes.status === 'rejected' ? sellersRes.reason : new Error('The applications came back empty'));
    }

    if (categoriesRes.status === 'fulfilled' && categoriesRes.value.data.success) {
      setPendingCategoryRequests(categoriesRes.value.data.data?.count || 0);
    } else {
      setPendingCategoryRequests(null);
    }

    if (statsRes.status === 'fulfilled' && statsRes.value.data.success) {
      setStats(statsRes.value.data.data);
      setStatsError(null);
    } else {
      setStatsError(statsRes.status === 'rejected' ? statsRes.reason : new Error('The figures came back empty'));
    }
    setLoading(false);
  };

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/admin/login');
      return;
    }

    // Check if user is admin
    if (user?.user_type !== 'admin' && user?.userType !== 'admin') {
      router.push('/products');
      showToast('Access denied. Admin privileges required.', 'error');
      return;
    }

    // The dashboard shows platform figures; staff without that access start at their approvals.
    if (user?.permissions && !user.permissions.includes('read.finance')) {
      router.replace('/admin/approvals');
      return;
    }

    loadDashboardData();
  }, [isAuthenticated, user, router]);

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
        loadDashboardData(); // Reload the list
      }
    } catch (error) {
      const errorMessage = apiErrorMessage(error, `Failed to ${action} seller`);
      showToast(errorMessage, 'error');
    } finally {
      setProcessingId(null);
    }
  };

  if (!isAuthenticated || (user?.user_type !== 'admin' && user?.userType !== 'admin')) {
    return null;
  }

  return (
    <DashboardLayout
      title="Admin Dashboard"
      subtitle="Platform overview and management"
      sidebarItems={ADMIN_SIDEBAR_ITEMS}
      userType="admin"
    >
      {/* Platform Stats */}
      {Boolean(statsError) && (
        <LoadError compact error={statsError} onRetry={loadDashboardData} title={stats ? "We couldn't refresh the platform figures: the ones below may be out of date" : "We couldn't load the platform figures"} className="mb-8" />
      )}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mb-8">
          <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Today&apos;s Orders</p>
                <p className="text-3xl font-bold text-gray-900">{stats.today.orders}</p>
              </div>
              <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center">
                <span className="text-2xl">📦</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Today&apos;s Revenue</p>
                <p className="text-2xl font-bold text-gray-900">{formatPrice(stats.today.revenue)}</p>
              </div>
              <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center">
                <span className="text-2xl">💰</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Pending Orders</p>
                <p className="text-3xl font-bold text-gray-900">{stats.pendingOrders}</p>
              </div>
              <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center">
                <span className="text-2xl">⏳</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">In Transit</p>
                <p className="text-3xl font-bold text-gray-900">{stats.inTransitOrders}</p>
              </div>
              <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center">
                <span className="text-2xl">🚚</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Avg Order Value</p>
                <p className="text-2xl font-bold text-gray-900">{formatPrice(stats.averageOrderValue)}</p>
              </div>
              <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center">
                <span className="text-2xl">📊</span>
              </div>
            </div>
          </div>

          <Link href="/admin/category-requests" className="bg-white rounded-xl shadow-sm p-6 border border-gray-200 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Category Requests</p>
                <p className="text-3xl font-bold text-gray-900">{pendingCategoryRequests ?? '—'}</p>
                <p className="text-xs text-gray-500 mt-1">{pendingCategoryRequests === null ? "couldn't be read" : 'pending review'}</p>
              </div>
              <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center">
                <span className="text-2xl">📝</span>
              </div>
            </div>
          </Link>
        </div>
      )}

      {/* Pending Sellers Section */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 mb-8">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-900">Pending Seller Applications</h2>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={loadDashboardData}
                disabled={loading}
              >
                {loading ? 'Loading...' : 'Refresh'}
              </Button>
              <Link href="/admin/pending-sellers">
                <Button variant="outline" size="sm">
                  View All
                </Button>
              </Link>
            </div>
          </div>
        </div>

        <div className="p-6">
          {loading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-600 mx-auto mb-4"></div>
              <p className="text-gray-600">Loading pending applications...</p>
            </div>
          ) : sellersError && pendingSellers.length === 0 ? (
            <LoadError error={sellersError} onRetry={loadDashboardData} title="We couldn't load the applications" />
          ) : pendingSellers.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-6xl mb-4">✅</div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No Pending Applications</h3>
              <p className="text-gray-600">All seller applications have been reviewed.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {pendingSellers.slice(0, 5).map((seller) => (
                <div
                  key={seller.id}
                  className="border border-gray-200 rounded-lg p-6 hover:shadow-md transition-shadow"
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
                        <span className="px-2 py-1 bg-gray-100 text-gray-800 text-xs font-medium rounded">
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

                    <div className="flex gap-2 ms-4">
                      <Button
                        onClick={() => handleApproveReject(seller.id, 'approve')}
                        disabled={processingId === seller.id || (seller.missing?.length ?? 0) > 0}
                        title={(seller.missing?.length ?? 0) > 0 ? `Cannot be approved yet, missing: ${seller.missing!.join(', ')}` : undefined}
                        className="bg-gray-700 hover:bg-gray-800 text-white"
                        size="sm"
                      >
                        {processingId === seller.id ? 'Processing...' : 'Approve'}
                      </Button>
                      <Button
                        onClick={() => setRejecting(seller)}
                        disabled={processingId === seller.id}
                        variant="outline"
                        className="border-gray-300 text-gray-700 hover:bg-gray-50"
                        size="sm"
                      >
                        Reject
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
              {pendingSellers.length > 5 && (
                <div className="text-center pt-4">
                  <Link href="/admin/pending-sellers">
                    <Button variant="outline">
                      View All {pendingSellers.length} Applications
                    </Button>
                  </Link>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Link href="/admin/pending-sellers">
            <Button className="w-full justify-start" variant="outline">
              <span className="me-2">👥</span>
              Review Sellers
            </Button>
          </Link>
          <Link href="/admin/orders">
            <Button className="w-full justify-start" variant="outline">
              <span className="me-2">📋</span>
              Manage Orders
            </Button>
          </Link>
          <Link href="/admin/products">
            <Button className="w-full justify-start" variant="outline">
              <span className="me-2">🍽️</span>
              Moderate Products
            </Button>
          </Link>
          <Link href="/admin/analytics">
            <Button className="w-full justify-start" variant="outline">
              <span className="me-2">📈</span>
              View Analytics
            </Button>
          </Link>
        </div>
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
    </DashboardLayout>
  );
}

