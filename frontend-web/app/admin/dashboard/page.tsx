'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Package, Wallet, Clock, Truck, LayoutDashboard, ClipboardList, CheckCircle2, Users, TrendingUp, UtensilsCrossed } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardShell';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useAuthStore } from '@/lib/store/auth-store';
import { apiClient } from '@/lib/api-client';
import { formatPrice } from '@/lib/utils';

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
  const { isAuthenticated, user } = useAuthStore();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [pendingSellers, setPendingSellers] = useState<PendingSeller[]>([]);
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [pendingCategoryRequests, setPendingCategoryRequests] = useState(0);

  const sidebarItems = [
    { name: 'Dashboard', href: '/admin/dashboard', icon: '' },
    { name: 'Pending Sellers', href: '/admin/pending-sellers', icon: '', badge: 0 },
    { name: 'Category Requests', href: '/admin/category-requests', icon: '', badge: 0 },
    { name: 'All Sellers', href: '/admin/sellers', icon: '' },
    { name: 'Orders', href: '/admin/orders', icon: '' },
    { name: 'Products', href: '/admin/products', icon: '' },
    { name: 'Analytics', href: '/admin/analytics', icon: '' },
    { name: 'Settings', href: '/admin/settings', icon: '' },
  ];

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

    loadDashboardData();
  }, [isAuthenticated, user, router]);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      
      // Load pending sellers
      const sellersResponse = await apiClient.get('/admin/pending-sellers');
      if (sellersResponse.data.success) {
        const sellers = sellersResponse.data.data || [];
        setPendingSellers(sellers);
        // Update badge count
        sidebarItems[1].badge = sellers.length;
      }

      // Load pending category requests count
      try {
        const categoryRequestsResponse = await apiClient.get('/category-requests/pending-count');
        if (categoryRequestsResponse.data.success) {
          const count = categoryRequestsResponse.data.data?.count || 0;
          setPendingCategoryRequests(count);
          sidebarItems[2].badge = count;
        }
      } catch (error) {
        console.log('Category requests endpoint not available');
      }

      // Load platform stats
      try {
        const statsResponse = await apiClient.get('/admin/statistics');
        if (statsResponse.data.success) {
          setStats(statsResponse.data.data);
        }
      } catch (error) {
        console.log('Stats endpoint not available yet');
      }
    } catch (error: any) {
      const errorMessage = error.response?.data?.error?.message || error.response?.data?.message || 'Failed to load dashboard';
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
        loadDashboardData(); // Reload the list
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
    <DashboardLayout
      title="Admin Dashboard"
      subtitle="Platform overview and management"
      sidebarItems={sidebarItems}
      userType="admin"
    >
      {/* Platform Stats */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mb-8">
          <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Today's Orders</p>
                <p className="text-3xl font-bold text-gray-900">{stats.today.orders}</p>
              </div>
              <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center">
                <Package className="w-6 h-6 text-ink-500" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Today's Revenue</p>
                <p className="text-2xl font-bold text-gray-900">{formatPrice(stats.today.revenue)}</p>
              </div>
              <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center">
                <Wallet className="w-6 h-6 text-ink-500" />
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
                <Clock className="w-6 h-6 text-ink-500" />
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
                <Truck className="w-6 h-6 text-ink-500" />
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
                <LayoutDashboard className="w-6 h-6 text-ink-500" />
              </div>
            </div>
          </div>

          <Link href="/admin/category-requests" className="bg-white rounded-xl shadow-sm p-6 border border-gray-200 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Category Requests</p>
                <p className="text-3xl font-bold text-gray-900">{pendingCategoryRequests}</p>
                <p className="text-xs text-gray-400 mt-1">pending review</p>
              </div>
              <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center">
                <ClipboardList className="w-6 h-6 text-ink-500" />
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
          ) : pendingSellers.length === 0 ? (
            <div className="text-center py-12">
              <CheckCircle2 className="w-16 h-16 text-forest-500 mx-auto mb-4" />
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

                    <div className="flex gap-2 ml-4">
                      <Button
                        onClick={() => handleApproveReject(seller.id, 'approve')}
                        disabled={processingId === seller.id}
                        className="bg-gray-700 hover:bg-gray-800 text-white"
                        size="sm"
                      >
                        {processingId === seller.id ? 'Processing...' : 'Approve'}
                      </Button>
                      <Button
                        onClick={() => handleApproveReject(seller.id, 'reject')}
                        disabled={processingId === seller.id}
                        variant="outline"
                        className="border-gray-300 text-gray-700 hover:bg-gray-50"
                        size="sm"
                      >
                        {processingId === seller.id ? 'Processing...' : 'Reject'}
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
              <Users className="w-4 h-4 mr-2" />
              Review Sellers
            </Button>
          </Link>
          <Link href="/admin/orders">
            <Button className="w-full justify-start" variant="outline">
              <ClipboardList className="w-4 h-4 mr-2" />
              Manage Orders
            </Button>
          </Link>
          <Link href="/admin/products">
            <Button className="w-full justify-start" variant="outline">
              <UtensilsCrossed className="w-4 h-4 mr-2" />
              Moderate Products
            </Button>
          </Link>
          <Link href="/admin/analytics">
            <Button className="w-full justify-start" variant="outline">
              <TrendingUp className="w-4 h-4 mr-2" />
              View Analytics
            </Button>
          </Link>
        </div>
      </div>
    </DashboardLayout>
  );
}

