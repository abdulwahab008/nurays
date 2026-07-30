'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { UserLayout } from '@/components/layout/UserLayout';
import { useToast } from '@/components/ui/toast';
import { useAuthStore } from '@/lib/store/auth-store';
import { apiClient } from '@/lib/api-client';
import { formatPrice } from '@/lib/utils';

interface AnalyticsData {
  overview: {
    totalUsers: number;
    totalSellers: number;
    totalOrders: number;
    totalRevenue: number;
  };
  revenue: {
    today: number;
    thisWeek: number;
    thisMonth: number;
    total: number;
  };
  orders: {
    today: number;
    thisWeek: number;
    thisMonth: number;
    total: number;
  };
  revenueByDay?: Array<{ date: string; revenue: number }>;
}

export default function AdminAnalyticsPage() {
  const router = useRouter();
  const { isAuthenticated, user } = useAuthStore();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);

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

    loadAnalytics();
  }, [isAuthenticated, user, router]);

  const loadAnalytics = async () => {
    try {
      setLoading(true);
      const response = await apiClient.get('/admin/analytics');
      if (response.data.success) {
        setAnalytics(response.data.data);
      } else {
        // Show placeholder data if endpoint doesn't exist
        setAnalytics({
          overview: { totalUsers: 0, totalSellers: 0, totalOrders: 0, totalRevenue: 0 },
          revenue: { today: 0, thisWeek: 0, thisMonth: 0, total: 0 },
          orders: { today: 0, thisWeek: 0, thisMonth: 0, total: 0 },
        });
      }
    } catch (error: any) {
      console.error('Failed to load analytics:', error);
      setAnalytics({
        overview: { totalUsers: 0, totalSellers: 0, totalOrders: 0, totalRevenue: 0 },
        revenue: { today: 0, thisWeek: 0, thisMonth: 0, total: 0 },
        orders: { today: 0, thisWeek: 0, thisMonth: 0, total: 0 },
      });
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
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Platform Analytics</h1>
          <p className="text-gray-600 mt-1">View platform-wide statistics and insights</p>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading analytics...</p>
          </div>
        ) : analytics ? (
          <>
            {/* Overview Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
              <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Total Users</p>
                    <p className="text-3xl font-bold text-gray-900">{analytics.overview.totalUsers}</p>
                  </div>
                  <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                    <span className="text-2xl">👥</span>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Total Sellers</p>
                    <p className="text-3xl font-bold text-gray-900">{analytics.overview.totalSellers}</p>
                  </div>
                  <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                    <span className="text-2xl">🏪</span>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Total Orders</p>
                    <p className="text-3xl font-bold text-gray-900">{analytics.overview.totalOrders}</p>
                  </div>
                  <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                    <span className="text-2xl">📦</span>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Total Revenue</p>
                    <p className="text-2xl font-bold text-green-600">{formatPrice(analytics.overview.totalRevenue)}</p>
                  </div>
                  <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center">
                    <span className="text-2xl">💰</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Revenue & Orders */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              <div className="bg-white rounded-lg shadow-sm p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-4">Revenue</h2>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Today</span>
                    <span className="font-semibold text-gray-900">{formatPrice(analytics.revenue?.today ?? 0)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">This Week</span>
                    <span className="font-semibold text-gray-900">{formatPrice(analytics.revenue?.thisWeek ?? 0)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">This Month</span>
                    <span className="font-semibold text-gray-900">{formatPrice(analytics.revenue?.thisMonth ?? 0)}</span>
                  </div>
                  <div className="flex justify-between border-t pt-3">
                    <span className="font-medium text-gray-900">Total</span>
                    <span className="font-bold text-green-600">{formatPrice(analytics.revenue?.total ?? analytics.overview?.totalRevenue ?? 0)}</span>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow-sm p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-4">Orders</h2>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Today</span>
                    <span className="font-semibold text-gray-900">{analytics.orders?.today ?? 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">This Week</span>
                    <span className="font-semibold text-gray-900">{analytics.orders?.thisWeek ?? 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">This Month</span>
                    <span className="font-semibold text-gray-900">{analytics.orders?.thisMonth ?? 0}</span>
                  </div>
                  <div className="flex justify-between border-t pt-3">
                    <span className="font-medium text-gray-900">Total (all time)</span>
                    <span className="font-bold text-green-600">{analytics.overview?.totalOrders ?? 0}</span>
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="bg-white rounded-lg shadow-sm p-12 text-center">
            <div className="text-6xl mb-4">📊</div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">No analytics data</h2>
            <p className="text-gray-600">Analytics data will appear here once the platform has activity</p>
          </div>
        )}
      </div>
    </UserLayout>
  );
}

