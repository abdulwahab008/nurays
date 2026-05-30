'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { UserLayout } from '@/components/layout/UserLayout';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useAuthStore } from '@/lib/store/auth-store';
import { apiClient } from '@/lib/api-client';
import { formatDate } from '@/lib/utils';

interface Seller {
  id: string;
  businessName: string;
  businessNameUrdu?: string;
  verificationStatus: string;
  status: string;
  createdAt: string;
  user: {
    email: string;
    phone: string;
  };
}

export default function AdminAllSellersPage() {
  const router = useRouter();
  const { isAuthenticated, user } = useAuthStore();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [filter, setFilter] = useState<string>('all');

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

    loadSellers();
  }, [isAuthenticated, user, filter, router]);

  const loadSellers = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filter !== 'all') {
        // Map filter to appropriate query params
        if (['approved', 'pending', 'rejected'].includes(filter)) {
          params.append('verificationStatus', filter);
        } else if (['active', 'inactive'].includes(filter)) {
          params.append('status', filter);
        }
      }
      const queryString = params.toString();
      const response = await apiClient.get(`/admin/sellers${queryString ? `?${queryString}` : ''}`);
      if (response.data.success) {
        setSellers(response.data.data.sellers || []);
      } else {
        setSellers([]);
      }
    } catch (error: any) {
      console.error('Failed to load sellers:', error);
      // Don't show error toast for 404 - endpoint might not exist yet
      if (error.response?.status !== 404) {
        showToast('Failed to load sellers', 'error');
      }
      setSellers([]);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    const statusMap: Record<string, string> = {
      approved: 'bg-green-100 text-green-800',
      pending: 'bg-yellow-100 text-yellow-800',
      rejected: 'bg-red-100 text-red-800',
      active: 'bg-blue-100 text-blue-800',
      inactive: 'bg-gray-100 text-gray-800',
    };
    return statusMap[status] || 'bg-gray-100 text-gray-800';
  };

  if (!isAuthenticated || (user?.user_type !== 'admin' && user?.userType !== 'admin')) {
    return null;
  }

  return (
    <UserLayout showSidebar={true} showNavbar={true}>
      <div className="max-w-7xl mx-auto">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">All Sellers</h1>
            <p className="text-gray-600 mt-1">Manage all sellers on the platform</p>
          </div>
          <Button variant="outline" onClick={loadSellers} disabled={loading}>
            {loading ? 'Loading...' : 'Refresh'}
          </Button>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow-sm p-4 mb-6">
          <div className="flex gap-2 flex-wrap">
            {['all', 'approved', 'pending', 'rejected', 'active', 'inactive'].map((status) => (
              <button
                key={status}
                onClick={() => setFilter(status)}
                className={`px-4 py-2 rounded-md font-medium transition-colors ${
                  filter === status
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading sellers...</p>
          </div>
        ) : sellers.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm p-12 text-center">
            <div className="text-6xl mb-4">🏪</div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No Sellers Found</h3>
            <p className="text-gray-600">No sellers match your current filter.</p>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Business Name</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Phone</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Joined</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {sellers.map((seller) => (
                    <tr key={seller.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div className="font-medium text-gray-900">{seller.businessName}</div>
                        {seller.businessNameUrdu && (
                          <div className="text-sm text-gray-500">{seller.businessNameUrdu}</div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">{seller.user.email}</td>
                      <td className="px-6 py-4 text-sm text-gray-900">{seller.user.phone}</td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(seller.verificationStatus)}`}>
                          {seller.verificationStatus}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {formatDate(seller.createdAt)}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <Link href={`/admin/sellers/${seller.id}`}>
                          <Button variant="outline" size="sm">
                            View Details
                          </Button>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </UserLayout>
  );
}

