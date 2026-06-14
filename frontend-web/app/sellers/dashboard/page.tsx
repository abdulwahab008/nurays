'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { DashboardLayout } from '@/components/layout/DashboardShell';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useAuthStore } from '@/lib/store/auth-store';
import { apiClient } from '@/lib/api-client';
import { formatPrice } from '@/lib/utils';
import { SellerOnboardingModal } from '@/components/SellerOnboardingModal';

// Professional SVG Icons
const Icons = {
  products: (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
    </svg>
  ),
  orders: (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
    </svg>
  ),
  pending: (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  earnings: (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
    </svg>
  ),
  payout: (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
    </svg>
  ),
  add: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  ),
  view: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
  analytics: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
    </svg>
  ),
  money: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  check: (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  warning: (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
    </svg>
  ),
  package: (
    <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0l-3-3m3 3l3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
    </svg>
  ),
  food: (
    <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8.25v-1.5m0 1.5c-1.355 0-2.697.056-4.024.166C6.845 8.51 6 9.473 6 10.608v2.513m6-4.87c1.355 0 2.697.055 4.024.165C17.155 8.51 18 9.473 18 10.608v2.513m-3-4.87v-1.5m-6 1.5v-1.5m12 9.75l-1.5.75a3.354 3.354 0 01-3 0 3.354 3.354 0 00-3 0 3.354 3.354 0 01-3 0 3.354 3.354 0 00-3 0 3.354 3.354 0 01-3 0L3 16.5m15-3.38a48.474 48.474 0 00-6-.37c-2.032 0-4.034.125-6 .37m12 0c.39.049.777.102 1.163.16 1.07.16 1.837 1.094 1.837 2.175v5.17c0 .62-.504 1.124-1.125 1.124H4.125A1.125 1.125 0 013 20.625v-5.17c0-1.08.768-2.014 1.837-2.174A47.78 47.78 0 016 13.12M12.265 3.11a.375.375 0 11-.53 0L12 2.845l.265.265zm-3 0a.375.375 0 11-.53 0L9 2.845l.265.265zm6 0a.375.375 0 11-.53 0L15 2.845l.265.265z" />
    </svg>
  ),
};

interface SellerDashboard {
  id: string;
  businessName: string;
  businessNameUrdu?: string;
  verificationStatus: string;
  overview: {
    totalProducts: number;
    activeOrders: number;
    pendingOrders: number;
    totalEarnings: number;
    pendingPayout: number;
  };
  recentOrders: Array<{
    orderId: string;
    orderNumber: string;
    productName: string;
    quantity: number;
    totalAmount: number;
    orderStatus: string;
    createdAt: string;
  }>;
  lowStockProducts: Array<{
    id: string;
    name: string;
    stockQuantity: number;
    images?: Array<{ imageUrl: string }>;
  }>;
}

export default function SellerDashboardPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
      </div>
    }>
      <SellerDashboardContent />
    </Suspense>
  );
}

function SellerDashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated, user } = useAuthStore();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [dashboard, setDashboard] = useState<SellerDashboard | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);

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

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }

    // Check if user is a seller
    if (user?.userType !== 'seller' && user?.user_type !== 'seller') {
      router.push('/dashboard');
      showToast('Access denied. Seller privileges required.', 'error');
      return;
    }

    // Check if onboarding modal should be shown
    const onboardingParam = searchParams.get('onboarding');
    if (onboardingParam === 'true') {
      setShowOnboarding(true);
      // Clean URL
      window.history.replaceState({}, '', '/sellers/dashboard');
    }

    loadDashboard();
  }, [isAuthenticated, user, router, searchParams]);

  const loadDashboard = async () => {
    try {
      setLoading(true);
      const response = await apiClient.get('/sellers/me/dashboard');
      if (response.data.success) {
        setDashboard(response.data.data);
        setNeedsOnboarding(false);
      }
    } catch (error: any) {
      console.error('Failed to load seller dashboard:', error);
      
      // If seller profile doesn't exist (404), show onboarding modal
      if (error.response?.status === 404) {
        setNeedsOnboarding(true);
        setShowOnboarding(true);
        return; // Don't show error toast for this case
      }
      
      const errorMessage = error.response?.data?.error?.message || error.response?.data?.message || 'Failed to load dashboard';
      showToast(errorMessage, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleOnboardingComplete = () => {
    setShowOnboarding(false);
    setNeedsOnboarding(false);
    loadDashboard();
    showToast('🎉 Seller profile created! Your application is under review.', 'success');
  };

  const handleOnboardingClose = () => {
    if (needsOnboarding) {
      // If they haven't completed onboarding, show a warning
      if (confirm('You need to complete your seller profile to start selling. Are you sure you want to close?')) {
        setShowOnboarding(false);
        router.push('/products');
      }
    } else {
      setShowOnboarding(false);
    }
  };

  const getStatusColor = (status: string) => 'bg-gray-100 text-gray-800';

  const getVerificationBadge = (status: string) => {
    if (status === 'approved') {
      return <span className="px-3 py-1 bg-gray-200 text-gray-800 text-xs font-medium rounded-full">Approved</span>;
    } else if (status === 'pending') {
      return <span className="px-3 py-1 bg-gray-100 text-gray-700 text-xs font-medium rounded-full">Pending</span>;
    } else if (status === 'rejected') {
      return <span className="px-3 py-1 bg-gray-200 text-gray-700 text-xs font-medium rounded-full">Rejected</span>;
    }
    return null;
  };

  if (!isAuthenticated) {
    return null;
  }

  if (loading) {
    return (
      <DashboardLayout
        title="Seller Dashboard"
        subtitle="Loading your dashboard..."
        sidebarItems={sidebarItems}
        userType="seller"
      >
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-600"></div>
        </div>
      </DashboardLayout>
    );
  }

  if (!dashboard && !loading) {
    return (
      <>
        <SellerOnboardingModal
          isOpen={showOnboarding}
          onClose={handleOnboardingClose}
          onComplete={handleOnboardingComplete}
        />
        <DashboardLayout
          title="Seller Dashboard"
          subtitle="Complete your seller registration"
          sidebarItems={sidebarItems}
          userType="seller"
        >
          <div className="text-center py-12">
            <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-12 h-12 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">Complete Your Seller Profile</h3>
            <p className="text-gray-600 mb-6 max-w-md mx-auto">
              You're just a few steps away from starting to sell your delicious homemade food on Nuray!
            </p>
            <Button 
              onClick={() => setShowOnboarding(true)}
              className="bg-gray-700 hover:bg-gray-800 text-white px-8 py-3"
            >
              Start Seller Registration
            </Button>
          </div>
        </DashboardLayout>
      </>
    );
  }

  return (
    <>
      {/* Onboarding Modal - can be triggered manually */}
      <SellerOnboardingModal
        isOpen={showOnboarding}
        onClose={handleOnboardingClose}
        onComplete={handleOnboardingComplete}
      />
      
      <DashboardLayout
        title="Seller Dashboard"
        subtitle={`Welcome, ${dashboard?.businessName || 'Seller'}${dashboard?.businessNameUrdu ? ` (${dashboard.businessNameUrdu})` : ''}`}
        sidebarItems={sidebarItems}
        userType="seller"
      >
        {/* Verification Status */}
        {dashboard && dashboard.verificationStatus !== 'approved' && (
          <div className="mb-6 bg-gray-50 border-l-4 border-gray-400 p-4 rounded">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium text-gray-800">
                  {dashboard.verificationStatus === 'pending' 
                    ? 'Your seller application is under review'
                    : 'Your seller application was rejected'}
                </h3>
                <p className="text-sm text-gray-700 mt-1">
                  {dashboard.verificationStatus === 'pending'
                    ? 'We will notify you once your application is reviewed.'
                    : 'Please contact support for more information.'}
                </p>
              </div>
              {getVerificationBadge(dashboard.verificationStatus)}
            </div>
          </div>
        )}

      {/* Stats Cards - Enhanced with gradients */}
      {dashboard && (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        {/* Products Card */}
        <div className="bg-gray-50 rounded-2xl p-5 border border-gray-200 hover:shadow-lg transition-all duration-300 group">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 mb-1">Products</p>
              <p className="text-3xl font-bold text-gray-900">{dashboard.overview.totalProducts}</p>
            </div>
            <div className="w-14 h-14 bg-gray-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-gray-200 group-hover:scale-110 transition-transform">
              {Icons.products}
            </div>
          </div>
        </div>

        {/* Active Orders Card */}
        <div className="bg-gray-50 rounded-2xl p-5 border border-gray-200 hover:shadow-lg transition-all duration-300 group">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 mb-1">Active Orders</p>
              <p className="text-3xl font-bold text-gray-900">{dashboard.overview.activeOrders}</p>
            </div>
            <div className="w-14 h-14 bg-gray-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-gray-200 group-hover:scale-110 transition-transform">
              {Icons.orders}
            </div>
          </div>
        </div>

        {/* Pending Orders Card */}
        <div className="bg-gray-50 rounded-2xl p-5 border border-gray-200 hover:shadow-lg transition-all duration-300 group">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 mb-1">Pending</p>
              <p className="text-3xl font-bold text-gray-900">{dashboard.overview.pendingOrders}</p>
            </div>
            <div className="w-14 h-14 bg-gray-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-gray-200 group-hover:scale-110 transition-transform">
              {Icons.pending}
            </div>
          </div>
        </div>

        {/* Total Earnings Card */}
        <div className="bg-gray-50 rounded-2xl p-5 border border-gray-200 hover:shadow-lg transition-all duration-300 group">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 mb-1">Total Earnings</p>
              <p className="text-2xl font-bold text-gray-900">{formatPrice(dashboard.overview.totalEarnings)}</p>
            </div>
            <div className="w-14 h-14 bg-gray-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-gray-200 group-hover:scale-110 transition-transform">
              {Icons.earnings}
            </div>
          </div>
        </div>

        {/* Pending Payout Card */}
        <div className="bg-gray-50 rounded-2xl p-5 border border-gray-200 hover:shadow-lg transition-all duration-300 group">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 mb-1">Pending Payout</p>
              <p className="text-2xl font-bold text-gray-900">{formatPrice(dashboard.overview.pendingPayout)}</p>
            </div>
            <div className="w-14 h-14 bg-gray-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-gray-200 group-hover:scale-110 transition-transform">
              {Icons.payout}
            </div>
          </div>
        </div>
      </div>
      )}

      {dashboard && (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Orders - Enhanced */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 bg-gradient-to-r from-gray-50 to-white border-b border-gray-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center text-gray-600">
                  {Icons.orders}
                </div>
                <h2 className="text-lg font-bold text-gray-900">Recent Orders</h2>
              </div>
              <Link href="/sellers/orders">
                <Button variant="outline" size="sm" className="text-sm hover:bg-gray-50">
                  View All
                </Button>
              </Link>
            </div>
          </div>

          <div className="p-6">
            {dashboard.recentOrders.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-gray-300 mb-4">{Icons.package}</div>
                <p className="text-gray-500 font-medium">No orders yet</p>
                <p className="text-gray-400 text-sm mt-1">Orders will appear here when customers place them</p>
              </div>
            ) : (
              <div className="space-y-3">
                {dashboard.recentOrders.map((order, index) => (
                  <Link
                    key={index}
                    href={`/sellers/orders/${order.orderId}`}
                    className="block border border-gray-100 rounded-xl p-4 hover:shadow-md hover:border-gray-200 transition-all duration-200 bg-cream-100 hover:bg-cream-200"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold text-gray-900">#{order.orderNumber}</h3>
                          <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${getStatusColor(order.orderStatus)}`}>
                            {order.orderStatus.replace('_', ' ')}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600">{order.productName} × {order.quantity}</p>
                        <p className="text-sm font-bold text-gray-900 mt-1">{Number.isFinite(order.totalAmount) ? formatPrice(order.totalAmount) : '—'}</p>
                      </div>
                      <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Low Stock Products - Enhanced */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 bg-gradient-to-r from-gray-50 to-white border-b border-gray-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center text-gray-600">
                  {Icons.warning}
                </div>
                <h2 className="text-lg font-bold text-gray-900">Low Stock Alert</h2>
              </div>
              <Link href="/sellers/products">
                <Button variant="outline" size="sm" className="text-sm hover:bg-gray-50">
                  Manage
                </Button>
              </Link>
            </div>
          </div>

          <div className="p-6">
            {dashboard.lowStockProducts.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-600">
                  {Icons.check}
                </div>
                <p className="text-gray-500 font-medium">All products are well stocked</p>
                <p className="text-gray-400 text-sm mt-1">You're doing great! Keep it up.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {dashboard.lowStockProducts.map((product) => (
                  <Link
                    key={product.id}
                    href={`/sellers/products/${product.id}`}
                    className="flex items-center gap-4 border border-gray-100 rounded-xl p-4 hover:shadow-md hover:border-gray-200 transition-all duration-200 bg-cream-100 hover:bg-cream-200"
                  >
                    <div className="w-14 h-14 bg-gray-100 rounded-xl flex items-center justify-center overflow-hidden flex-shrink-0">
                      {product.images && product.images[0] ? (
                        <img src={product.images[0].imageUrl} alt={product.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="text-gray-400">{Icons.food}</div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-900 truncate">{product.name}</h3>
                      <p className="text-sm text-gray-700 font-medium flex items-center gap-1">
                        <svg className="w-4 h-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        Only {product.stockQuantity} left
                      </p>
                    </div>
                    <Button size="sm" className="bg-gray-700 hover:bg-gray-800 text-white">
                      Restock
                    </Button>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      )}

      {/* Quick Actions - Enhanced */}
      <div className="mt-8 bg-white rounded-2xl shadow-sm p-6 border border-gray-100">
        <h2 className="text-lg font-bold text-gray-900 mb-5">Quick Actions</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Link href="/sellers/products/new" className="group">
            <div className="flex items-center gap-4 p-4 rounded-xl border-2 border-dashed border-gray-200 hover:border-gray-400 hover:bg-gray-50 transition-all duration-200">
              <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center text-gray-600 group-hover:bg-gray-600 group-hover:text-white transition-colors">
                {Icons.add}
              </div>
              <div>
                <p className="font-semibold text-gray-900">Add Product</p>
                <p className="text-sm text-gray-500">Create new listing</p>
              </div>
            </div>
          </Link>
          
          <Link href="/sellers/orders" className="group">
            <div className="flex items-center gap-4 p-4 rounded-xl border-2 border-dashed border-gray-200 hover:border-gray-400 hover:bg-gray-50 transition-all duration-200">
              <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center text-gray-600 group-hover:bg-gray-600 group-hover:text-white transition-colors">
                {Icons.view}
              </div>
              <div>
                <p className="font-semibold text-gray-900">View Orders</p>
                <p className="text-sm text-gray-500">Manage all orders</p>
              </div>
            </div>
          </Link>
          
          <Link href="/sellers/earnings" className="group">
            <div className="flex items-center gap-4 p-4 rounded-xl border-2 border-dashed border-gray-200 hover:border-gray-400 hover:bg-gray-50 transition-all duration-200">
              <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center text-gray-600 group-hover:bg-gray-600 group-hover:text-white transition-colors">
                {Icons.money}
              </div>
              <div>
                <p className="font-semibold text-gray-900">Request Payout</p>
                <p className="text-sm text-gray-500">Withdraw earnings</p>
              </div>
            </div>
          </Link>
          
          <Link href="/sellers/analytics" className="group">
            <div className="flex items-center gap-4 p-4 rounded-xl border-2 border-dashed border-gray-200 hover:border-gray-400 hover:bg-gray-50 transition-all duration-200">
              <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center text-gray-600 group-hover:bg-gray-600 group-hover:text-white transition-colors">
                {Icons.analytics}
              </div>
              <div>
                <p className="font-semibold text-gray-900">View Analytics</p>
                <p className="text-sm text-gray-500">Sales insights</p>
              </div>
            </div>
          </Link>
        </div>
      </div>
      </DashboardLayout>
    </>
  );
}

