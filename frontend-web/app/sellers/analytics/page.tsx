'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { DashboardLayout } from '@/components/layout/DashboardShell';
import { useToast } from '@/components/ui/toast';
import { useAuthStore } from '@/lib/store/auth-store';
import { apiClient } from '@/lib/api-client';
import { formatPrice } from '@/lib/utils';

const sidebarItems = [
  { name: 'Dashboard', href: '/sellers/dashboard', icon: '' },
  { name: 'Orders', href: '/sellers/orders', icon: '' },
  { name: 'Products', href: '/sellers/products', icon: '' },
  { name: 'Inventory', href: '/sellers/products?view=inventory', icon: '' },
  { name: 'Promotions', href: '/sellers/promotions', icon: '' },
  { name: 'Delivery', href: '/sellers/settings#delivery', icon: '' },
  { name: 'Earnings', href: '/sellers/earnings', icon: '' },
  { name: 'Analytics', href: '/sellers/analytics', icon: '' },
  { name: 'Notifications', href: '/sellers/notifications', icon: '' },
  { name: 'Settings', href: '/sellers/settings', icon: '' },
];

// Icons
const Icons = {
  today: (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
    </svg>
  ),
  week: (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
    </svg>
  ),
  month: (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5m-9-6h.008v.008H12v-.008zM12 15h.008v.008H12V15zm0 2.25h.008v.008H12v-.008zM9.75 15h.008v.008H9.75V15zm0 2.25h.008v.008H9.75v-.008zM7.5 15h.008v.008H7.5V15zm0 2.25h.008v.008H7.5v-.008zm6.75-4.5h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V15zm0 2.25h.008v.008h-.008v-.008zm2.25-4.5h.008v.008H16.5v-.008zm0 2.25h.008v.008H16.5V15z" />
    </svg>
  ),
  total: (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
    </svg>
  ),
  chart: (
    <svg className="w-16 h-16 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
    </svg>
  ),
  trophy: (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 01-.982-3.172M9.497 14.25a7.454 7.454 0 00.981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 007.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M7.73 9.728a6.726 6.726 0 002.748 1.35m8.272-6.842V4.5c0 2.108-.966 3.99-2.48 5.228m2.48-5.492a46.32 46.32 0 012.916.52 6.003 6.003 0 01-5.395 4.972m0 0a6.726 6.726 0 01-2.749 1.35m0 0a6.772 6.772 0 01-3.044 0" />
    </svg>
  ),
};

interface AnalyticsData {
  sales: {
    today: number;
    thisWeek: number;
    thisMonth: number;
    total: number;
  };
  revenue: {
    today: number;
    thisWeek: number;
    thisMonth: number;
    total: number;
  };
  orders: {
    total: number;
    completed: number;
    cancelled: number;
  };
  topProducts: Array<{
    name: string;
    quantity: number;
    revenue: number;
  }>;
}

export default function SellerAnalyticsPage() {
  const router = useRouter();
  const { isAuthenticated, user } = useAuthStore();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }

    if (user?.userType !== 'seller' && user?.user_type !== 'seller') {
      router.push('/dashboard');
      showToast('Access denied. Seller privileges required.', 'error');
      return;
    }

    loadAnalytics();
  }, [isAuthenticated, user, router]);

  const loadAnalytics = async () => {
    try {
      setLoading(true);
      const response = await apiClient.get('/sellers/me/analytics');
      if (response.data.success) {
        setAnalytics(response.data.data);
      }
    } catch (error: any) {
      console.error('Failed to load analytics:', error);
      // Show placeholder data if endpoint doesn't exist
      setAnalytics({
        sales: { today: 0, thisWeek: 0, thisMonth: 0, total: 0 },
        revenue: { today: 0, thisWeek: 0, thisMonth: 0, total: 0 },
        orders: { total: 0, completed: 0, cancelled: 0 },
        topProducts: [],
      });
    } finally {
      setLoading(false);
    }
  };

  if (!isAuthenticated) {
    return null;
  }

  const statsCards = analytics ? [
    {
      label: "Today's Sales",
      value: analytics.sales?.today || 0,
      revenue: analytics.revenue?.today || 0,
      icon: Icons.today,
      gradient: 'from-rose-50 to-rose-100',
      border: 'border-rose-200',
      iconBg: 'bg-rose-500',
      shadow: 'shadow-rose-200',
      textColor: 'text-rose-600',
    },
    {
      label: 'This Week',
      value: analytics.sales?.thisWeek || 0,
      revenue: analytics.revenue?.thisWeek || 0,
      icon: Icons.week,
      gradient: 'from-violet-50 to-violet-100',
      border: 'border-violet-200',
      iconBg: 'bg-violet-500',
      shadow: 'shadow-violet-200',
      textColor: 'text-violet-600',
    },
    {
      label: 'This Month',
      value: analytics.sales?.thisMonth || 0,
      revenue: analytics.revenue?.thisMonth || 0,
      icon: Icons.month,
      gradient: 'from-cyan-50 to-cyan-100',
      border: 'border-cyan-200',
      iconBg: 'bg-cyan-500',
      shadow: 'shadow-cyan-200',
      textColor: 'text-cyan-600',
    },
    {
      label: 'All Time',
      value: analytics.sales?.total || 0,
      revenue: analytics.revenue?.total || 0,
      icon: Icons.total,
      gradient: 'from-emerald-50 to-emerald-100',
      border: 'border-emerald-200',
      iconBg: 'bg-emerald-500',
      shadow: 'shadow-emerald-200',
      textColor: 'text-emerald-600',
    },
  ] : [];

  return (
    <DashboardLayout
      title="Analytics"
      subtitle="Track your sales performance and insights"
      sidebarItems={sidebarItems}
      userType="seller"
    >
      <div className="max-w-7xl mx-auto">
        {loading ? (
          <div className="text-center py-16">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500 mx-auto mb-4"></div>
            <p className="text-gray-500">Loading analytics...</p>
          </div>
        ) : analytics ? (
          <>
            {/* Sales Overview - Enhanced */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
              {statsCards.map((card, index) => (
                <div
                  key={index}
                  className={`bg-gradient-to-br ${card.gradient} rounded-2xl p-5 border ${card.border} hover:shadow-lg transition-all duration-300 group`}
                >
                  <div className="flex items-center justify-between mb-4">
                    <p className={`text-sm font-medium ${card.textColor}`}>{card.label}</p>
                    <div className={`w-12 h-12 ${card.iconBg} rounded-xl flex items-center justify-center text-white shadow-lg ${card.shadow} group-hover:scale-110 transition-transform`}>
                      {card.icon}
                    </div>
                  </div>
                  <p className="text-3xl font-bold text-gray-900 mb-1">{card.value}</p>
                  <p className={`text-sm font-semibold ${card.textColor}`}>{formatPrice(card.revenue)}</p>
                </div>
              ))}
            </div>

            {/* Top Products - Enhanced */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-6 py-4 bg-gradient-to-r from-gray-50 to-white border-b border-gray-100">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center text-amber-600">
                    {Icons.trophy}
                  </div>
                  <h2 className="text-lg font-bold text-gray-900">Top Selling Products</h2>
                </div>
              </div>
              <div className="p-6">
                {analytics.topProducts.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      {Icons.chart}
                    </div>
                    <p className="text-gray-500 font-medium">No product sales data yet</p>
                    <p className="text-gray-400 text-sm mt-1">Start selling to see your top products here</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {analytics.topProducts.map((product, index) => (
                      <div
                        key={`${product.name}-${index}`}
                        className="flex items-center justify-between p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors"
                      >
                        <div className="flex items-center gap-4">
                          <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-bold text-white shadow-lg ${
                            index === 0 ? 'bg-gradient-to-br from-amber-400 to-amber-600' :
                            index === 1 ? 'bg-gradient-to-br from-gray-400 to-gray-600' :
                            index === 2 ? 'bg-gradient-to-br from-orange-400 to-orange-600' :
                            'bg-gradient-to-br from-blue-400 to-blue-600'
                          }`}>
                            #{index + 1}
                          </div>
                          <div>
                            <p className="font-semibold text-gray-900">{product.name}</p>
                            <p className="text-sm text-gray-500">{product.quantity} units sold</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-emerald-600 text-lg">{formatPrice(product.revenue)}</p>
                          <p className="text-xs text-gray-500">Revenue</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-16 text-center">
            <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6">
              {Icons.chart}
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">No analytics data</h2>
            <p className="text-gray-500">Start selling to see your analytics here</p>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

