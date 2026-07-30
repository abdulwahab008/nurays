'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { UserLayout } from '@/components/layout/UserLayout';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useAuthStore } from '@/lib/store/auth-store';
import { apiClient } from '@/lib/api-client';

interface Hub {
  id: string;
  name: string;
  code: string;
  city: string;
  area: string;
  address: string;
  status: string;
  availableProductsCount: number;
}

export default function AdminHubsPage() {
  const router = useRouter();
  const { isAuthenticated, user } = useAuthStore();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [hubs, setHubs] = useState<Hub[]>([]);

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
    loadHubs();
  }, [isAuthenticated, user, router]);

  const loadHubs = async () => {
    try {
      setLoading(true);
      const response = await apiClient.get('/hubs');
      if (response.data.success) {
        setHubs(response.data.data || []);
      }
    } catch (error: any) {
      showToast(error.response?.data?.error?.message || 'Failed to load hubs', 'error');
    } finally {
      setLoading(false);
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
            <h1 className="text-3xl font-bold text-gray-900">Hub Centers</h1>
            <p className="text-gray-600 mt-1">Fulfillment hubs available for hub-delivery orders</p>
          </div>
          <Button variant="outline" onClick={loadHubs} disabled={loading}>
            {loading ? 'Loading...' : 'Refresh'}
          </Button>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading hubs...</p>
          </div>
        ) : hubs.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm p-12 text-center">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No hubs set up yet</h3>
            <p className="text-gray-600">Hub centers are added directly in the database — none exist yet.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {hubs.map((hub) => (
              <div key={hub.id} className="bg-white border border-gray-200 rounded-lg p-6">
                <div className="flex items-start justify-between flex-wrap gap-4">
                  <div className="flex-1 min-w-[240px]">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-semibold text-gray-900">{hub.name}</h3>
                      <span className="px-2 py-1 text-xs font-medium rounded bg-green-100 text-green-800 capitalize">
                        {hub.status}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                      <div><span className="text-gray-500">Code:</span> <span className="font-medium">{hub.code}</span></div>
                      <div><span className="text-gray-500">City/Area:</span> <span className="font-medium">{hub.city}, {hub.area}</span></div>
                      <div className="md:col-span-2"><span className="text-gray-500">Address:</span> <span className="font-medium">{hub.address}</span></div>
                      <div><span className="text-gray-500">Products in stock:</span> <span className="font-medium">{hub.availableProductsCount}</span></div>
                    </div>
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
