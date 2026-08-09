'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { DashboardLayout } from '@/components/layout/DashboardShell';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useAuthStore } from '@/lib/store/auth-store';
import { apiClient } from '@/lib/api-client';
import { formatPrice, formatDate } from '@/lib/utils';

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
  earnings: (
    <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
    </svg>
  ),
  pending: (
    <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  wallet: (
    <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 9m18 0V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v3" />
    </svg>
  ),
  withdraw: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
    </svg>
  ),
  history: (
    <svg className="w-16 h-16 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
    </svg>
  ),
  money: (
    <svg className="w-16 h-16 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
};

interface EarningsData {
  totalEarnings: number;
  pendingPayout: number;
  availableBalance: number;
  codCommissionOwed: number;
  payouts: Array<{
    id: string;
    amount: number;
    netAmount: number;
    status: string;
    payoutMethod: string;
    requestedAt: string;
    processedAt?: string;
  }>;
}

export default function SellerEarningsPage() {
  const router = useRouter();
  const { isAuthenticated, user } = useAuthStore();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [earnings, setEarnings] = useState<EarningsData | null>(null);
  const [requestingPayout, setRequestingPayout] = useState(false);
  const [showPayoutForm, setShowPayoutForm] = useState(false);
  const [payoutMethod, setPayoutMethod] = useState<'bank_transfer' | 'jazzcash' | 'easypaisa'>('jazzcash');
  const [accountNumber, setAccountNumber] = useState('');

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

    loadEarnings();
  }, [isAuthenticated, user, router]);

  const loadEarnings = async () => {
    try {
      setLoading(true);
      const [dashboardRes, payoutsRes] = await Promise.all([
        apiClient.get('/sellers/me/dashboard'),
        apiClient.get('/sellers/me/payouts'),
      ]);
      if (dashboardRes.data.success) {
        const dashboard = dashboardRes.data.data;
        setEarnings({
          totalEarnings: dashboard.overview?.totalEarnings || 0,
          pendingPayout: dashboard.overview?.pendingPayout || 0,
          // Cash-on-delivery money is already in your hands and isn't payable
          // again here — only what we collected online can be withdrawn, net
          // of the commission you owe us on COD sales (see codCommissionOwed).
          availableBalance: dashboard.overview?.availableForPayout || 0,
          codCommissionOwed: dashboard.overview?.codCommissionOwed || 0,
          payouts: payoutsRes.data.success ? payoutsRes.data.data : [],
        });
      }
    } catch (error: any) {
      console.error('Failed to load earnings:', error);
      showToast('Failed to load earnings data', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleRequestPayout = async () => {
    if (!earnings || earnings.availableBalance <= 0) {
      showToast('No available balance to withdraw', 'warning');
      return;
    }
    if (!accountNumber.trim()) {
      showToast('Please enter the account number to receive the payout', 'warning');
      return;
    }

    try {
      setRequestingPayout(true);
      const response = await apiClient.post('/sellers/me/payouts', {
        amount: earnings.availableBalance,
        payoutMethod,
        accountNumber: accountNumber.trim(),
      });
      if (response.data.success) {
        showToast('Payout request submitted successfully', 'success');
        setShowPayoutForm(false);
        setAccountNumber('');
        loadEarnings();
      }
    } catch (error: any) {
      showToast(error.response?.data?.error?.message || 'Failed to request payout', 'error');
    } finally {
      setRequestingPayout(false);
    }
  };

  const getStatusConfig = (status: string) => {
    const statusMap: Record<string, { bg: string; text: string; dot: string }> = {
      pending: { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
      processing: { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' },
      completed: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
      failed: { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500' },
    };
    return statusMap[status] || { bg: 'bg-gray-50', text: 'text-gray-700', dot: 'bg-gray-500' };
  };

  if (!isAuthenticated) {
    return null;
  }

  return (
    <DashboardLayout
      title="Earnings & Payouts"
      subtitle="Track your earnings and request payouts"
      sidebarItems={sidebarItems}
      userType="seller"
    >
      <div className="max-w-7xl mx-auto">
        {loading ? (
          <div className="text-center py-16">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500 mx-auto mb-4"></div>
            <p className="text-gray-500">Loading earnings...</p>
          </div>
        ) : earnings ? (
          <>
            {/* Earnings Summary Cards - Enhanced */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
              {/* Total Earnings */}
              <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-2xl p-6 border border-emerald-200 hover:shadow-lg transition-all duration-300 group">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-emerald-600 mb-2">Total Earnings</p>
                    <p className="text-3xl font-bold text-gray-900">{formatPrice(earnings.totalEarnings)}</p>
                    <p className="text-xs text-emerald-600 mt-2">Lifetime, cash + online orders</p>
                  </div>
                  <div className="w-16 h-16 bg-emerald-500 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-emerald-200 group-hover:scale-110 transition-transform">
                    {Icons.earnings}
                  </div>
                </div>
              </div>

              {/* Pending Payout */}
              <div className="bg-gradient-to-br from-amber-50 to-amber-100 rounded-2xl p-6 border border-amber-200 hover:shadow-lg transition-all duration-300 group">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-amber-600 mb-2">Pending Payout</p>
                    <p className="text-3xl font-bold text-amber-700">{formatPrice(earnings.pendingPayout)}</p>
                    <p className="text-xs text-amber-600 mt-2">Processing</p>
                  </div>
                  <div className="w-16 h-16 bg-amber-500 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-amber-200 group-hover:scale-110 transition-transform">
                    {Icons.pending}
                  </div>
                </div>
              </div>

              {/* Available Balance */}
              <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-2xl p-6 border border-blue-200 hover:shadow-lg transition-all duration-300 group">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-blue-600 mb-2">Available Balance</p>
                    <p className="text-3xl font-bold text-blue-700">{formatPrice(earnings.availableBalance)}</p>
                    <p className="text-xs text-blue-600 mt-2">From online orders only</p>
                  </div>
                  <div className="w-16 h-16 bg-blue-500 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-200 group-hover:scale-110 transition-transform">
                    {Icons.wallet}
                  </div>
                </div>
              </div>
            </div>

            {/* Cash-on-delivery note */}
            {earnings.codCommissionOwed > 0 && (
              <div className="bg-gray-50 border border-gray-200 rounded-2xl p-5 mb-8 flex items-start gap-3">
                <div className="w-9 h-9 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0 text-gray-600 font-bold">i</div>
                <p className="text-sm text-gray-600">
                  Customers who paid cash on delivery paid <span className="font-semibold text-gray-900">you</span> directly — that money isn't part of your withdrawable balance.
                  You owe <span className="font-semibold text-gray-900">{formatPrice(earnings.codCommissionOwed)}</span> in platform commission on those cash orders, which we deduct from your next online-order payout automatically.
                </p>
              </div>
            )}

            {/* Request Payout Card - Enhanced */}
            {earnings.availableBalance > 0 && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-8">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-bold text-gray-900 mb-1">Request Payout</h2>
                    <p className="text-gray-500">
                      Available for withdrawal: <span className="font-bold text-emerald-600">{formatPrice(earnings.availableBalance)}</span>
                    </p>
                    <p className="text-sm text-gray-400 mt-1">Payouts are processed within 3-5 business days via JazzCash/EasyPaisa</p>
                  </div>
                  {!showPayoutForm && (
                    <Button
                      onClick={() => setShowPayoutForm(true)}
                      className="bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-200 flex items-center gap-2 px-6"
                      size="lg"
                    >
                      {Icons.withdraw}
                      Request Payout
                    </Button>
                  )}
                </div>

                {showPayoutForm && (
                  <div className="mt-5 pt-5 border-t border-gray-100 space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Receive via</label>
                      <select
                        value={payoutMethod}
                        onChange={(e) => setPayoutMethod(e.target.value as typeof payoutMethod)}
                        className="w-full md:w-64 px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                      >
                        <option value="jazzcash">JazzCash</option>
                        <option value="easypaisa">EasyPaisa</option>
                        <option value="bank_transfer">Bank Transfer</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        {payoutMethod === 'bank_transfer' ? 'Bank account number' : 'Mobile wallet number'}
                      </label>
                      <input
                        type="text"
                        value={accountNumber}
                        onChange={(e) => setAccountNumber(e.target.value)}
                        placeholder={payoutMethod === 'bank_transfer' ? 'e.g., PK00HABB0000000000000000' : 'e.g., 03001234567'}
                        className="w-full md:w-80 px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                      />
                    </div>
                    <div className="flex gap-3">
                      <Button
                        onClick={handleRequestPayout}
                        disabled={requestingPayout || !accountNumber.trim()}
                        className="bg-emerald-500 hover:bg-emerald-600 text-white flex items-center gap-2 px-6"
                      >
                        {requestingPayout ? (
                          <>
                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                            Submitting...
                          </>
                        ) : (
                          'Confirm Request'
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => { setShowPayoutForm(false); setAccountNumber(''); }}
                        disabled={requestingPayout}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Payout History - Enhanced */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-6 py-4 bg-gradient-to-r from-gray-50 to-white border-b border-gray-100">
                <h2 className="text-lg font-bold text-gray-900">Payout History</h2>
              </div>
              <div className="p-6">
                {earnings.payouts.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      {Icons.history}
                    </div>
                    <p className="text-gray-500 font-medium">No payout history yet</p>
                    <p className="text-gray-400 text-sm mt-1">Your payout transactions will appear here</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {earnings.payouts.map((payout) => {
                      const statusConfig = getStatusConfig(payout.status);
                      return (
                        <div key={payout.id} className="border border-gray-100 rounded-xl p-4 hover:shadow-md transition-all duration-200 bg-gray-50/50 hover:bg-white">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-bold text-gray-900 text-lg">{formatPrice(payout.netAmount)}</p>
                              <p className="text-sm text-gray-500 mt-1">
                                Requested: {formatDate(payout.requestedAt)}
                              </p>
                              {payout.processedAt && (
                                <p className="text-sm text-gray-500">
                                  Processed: {formatDate(payout.processedAt)}
                                </p>
                              )}
                            </div>
                            <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${statusConfig.bg} ${statusConfig.text}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${statusConfig.dot}`}></span>
                              {payout.status.charAt(0).toUpperCase() + payout.status.slice(1)}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-16 text-center">
            <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6">
              {Icons.money}
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">No earnings data</h2>
            <p className="text-gray-500">Start selling to see your earnings here</p>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

