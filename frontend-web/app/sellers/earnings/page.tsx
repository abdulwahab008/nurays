'use client';

import { useState, useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { DashboardLayout, SELLER_SIDEBAR_ITEMS } from '@/components/layout/DashboardShell';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useAuthStore } from '@/lib/store/auth-store';
import { apiClient } from '@/lib/api-client';
import { formatPrice, formatDate } from '@/lib/utils';
import { useT } from '@/lib/i18n';
import { commonMessages } from '@/lib/i18n/messages/common';
import { kitchenEarningsMessages } from '@/lib/i18n/messages/kitchen-earnings';

const sidebarItems = SELLER_SIDEBAR_ITEMS;

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

/** Puts React nodes where a translated sentence has {name} placeholders. */
function withNodes(text: string, nodes: Record<string, ReactNode>) {
  return text.split(/\{(\w+)\}/g).map((part, i) => (i % 2 === 1 ? <span key={i}>{nodes[part] ?? `{${part}}`}</span> : part));
}

interface EarningsData {
  todaySales: number;
  todayOrders: number;
  grossSales: number;
  platformFees: number;
  netEarnings: number;
  pendingSettlement: number;
  paidSettlement: number;
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
  const t = useT(kitchenEarningsMessages);
  const tc = useT(commonMessages);
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
      showToast(t('accessDenied'), 'error');
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
        const ov = dashboard.overview || {};
        setEarnings({
          todaySales: ov.todaySales ?? 0,
          todayOrders: ov.todayOrders ?? 0,
          grossSales: ov.grossSales ?? (ov.totalEarnings ?? 0),
          platformFees: ov.platformFees ?? 0,
          netEarnings: ov.netEarnings ?? (ov.totalEarnings ?? 0),
          pendingSettlement: ov.pendingSettlement ?? (ov.pendingPayout ?? 0),
          paidSettlement: ov.paidSettlement ?? 0,
          totalEarnings: ov.totalEarnings ?? 0,
          pendingPayout: ov.pendingPayout ?? 0,
          availableBalance: ov.availableForPayout ?? 0,
          codCommissionOwed: ov.codCommissionOwed ?? 0,
          payouts: payoutsRes.data.success ? payoutsRes.data.data : [],
        });
      }
    } catch (error: any) {
      console.error('Failed to load earnings:', error);
      showToast(t('loadFailed'), 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleRequestPayout = async () => {
    if (!earnings || earnings.availableBalance <= 0) {
      showToast(t('noBalance'), 'warning');
      return;
    }
    if (!accountNumber.trim()) {
      showToast(t('enterAccount'), 'warning');
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
        showToast(t('payoutSubmitted'), 'success');
        setShowPayoutForm(false);
        setAccountNumber('');
        loadEarnings();
      }
    } catch (error: any) {
      showToast(error.response?.data?.error?.message || t('payoutFailed'), 'error');
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
      title={t('title')}
      subtitle={t('subtitle')}
      sidebarItems={sidebarItems}
      userType="seller"
    >
      <div className="max-w-7xl mx-auto">
        {loading ? (
          <div className="text-center py-16">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500 mx-auto mb-4"></div>
            <p className="text-gray-500">{t('loading')}</p>
          </div>
        ) : earnings ? (
          <>
            {/* Section 13 Operational Earnings Breakdown */}
            {/* Top Balance & Payout Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              {/* Available Balance */}
              <div className="bg-white rounded-2xl p-5 border border-blue-100 shadow-xs flex items-center justify-between">
                <div>
                  <span className="text-xs font-semibold text-blue-600 block">{t('available')}</span>
                  <span className="text-2xl font-black text-gray-900 mt-1 block">{formatPrice(earnings.availableBalance)}</span>
                  <span className="text-[11px] text-gray-500 mt-1 block">{t('availableHint')}</span>
                </div>
                <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center">
                  {Icons.wallet}
                </div>
              </div>

              {/* Pending Payout */}
              <div className="bg-white rounded-2xl p-5 border border-amber-100 shadow-xs flex items-center justify-between">
                <div>
                  <span className="text-xs font-semibold text-amber-600 block">{t('pendingSettlement')}</span>
                  <span className="text-2xl font-black text-gray-900 mt-1 block">{formatPrice(earnings.pendingPayout || earnings.pendingSettlement)}</span>
                  <span className="text-[11px] text-gray-500 mt-1 block">{t('pendingHint')}</span>
                </div>
                <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center">
                  {Icons.pending}
                </div>
              </div>

              {/* Total Earnings */}
              <div className="bg-white rounded-2xl p-5 border border-emerald-100 shadow-xs flex items-center justify-between">
                <div>
                  <span className="text-xs font-semibold text-emerald-600 block">{t('lifetime')}</span>
                  <span className="text-2xl font-black text-gray-900 mt-1 block">{formatPrice(earnings.totalEarnings)}</span>
                  <span className="text-[11px] text-gray-500 mt-1 block">{t('lifetimeHint')}</span>
                </div>
                <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center">
                  {Icons.earnings}
                </div>
              </div>
            </div>

            {/* Performance Overview */}
            <div className="mb-6">
              <h2 className="text-sm font-bold text-gray-900 mb-3">
                {t('breakdown')}
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-xs">
                  <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider block">{t('todaySales')}</span>
                  <span className="text-lg font-bold text-gray-900 mt-1 block">{formatPrice(earnings.todaySales)}</span>
                </div>

                <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-xs">
                  <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider block">{t('todayOrders')}</span>
                  <span className="text-lg font-bold text-gray-900 mt-1 block">{earnings.todayOrders}</span>
                </div>

                <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-xs">
                  <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider block">{t('grossVolume')}</span>
                  <span className="text-lg font-bold text-gray-900 mt-1 block">{formatPrice(earnings.grossSales)}</span>
                </div>

                <div className="bg-white p-4 rounded-xl border border-red-100 bg-red-50/20 shadow-xs">
                  <span className="text-[11px] font-semibold text-red-600 uppercase tracking-wider block">{t('platformFees')}</span>
                  <span className="text-lg font-bold text-red-600 mt-1 block" data-ltr>-{formatPrice(earnings.platformFees)}</span>
                </div>
              </div>
            </div>

            {/* Money the seller collected themselves */}
            {earnings.codCommissionOwed > 0 && (
              <div className="bg-gray-50 border border-gray-200 rounded-2xl p-5 mb-8 flex items-start gap-3">
                <div className="w-9 h-9 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0 text-gray-600 font-bold">i</div>
                <p className="text-sm text-gray-600">
                  {withNodes(t('codNote'), {
                    you: <span className="font-semibold text-gray-900">{t('codNoteYou')}</span>,
                    amount: <span className="font-semibold text-gray-900">{formatPrice(earnings.codCommissionOwed)}</span>,
                  })}
                </p>
              </div>
            )}

            {/* Request Payout Card - Enhanced */}
            {earnings.availableBalance > 0 && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-8">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-bold text-gray-900 mb-1">{t('requestPayout')}</h2>
                    <p className="text-gray-500">
                      {t('availableForWithdrawal')} <span className="font-bold text-emerald-600">{formatPrice(earnings.availableBalance)}</span>
                    </p>
                    <p className="text-sm text-gray-400 mt-1">{t('processingTime')}</p>
                  </div>
                  {!showPayoutForm && (
                    <Button
                      onClick={() => setShowPayoutForm(true)}
                      className="bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-200 flex items-center gap-2 px-6"
                      size="lg"
                    >
                      {Icons.withdraw}
                      {t('requestPayout')}
                    </Button>
                  )}
                </div>

                {showPayoutForm && (
                  <div className="mt-5 pt-5 border-t border-gray-100 space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">{t('receiveVia')}</label>
                      <select
                        value={payoutMethod}
                        onChange={(e) => setPayoutMethod(e.target.value as typeof payoutMethod)}
                        className="w-full md:w-64 px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                      >
                        <option value="jazzcash">{t('jazzcash')}</option>
                        <option value="easypaisa">{t('easypaisa')}</option>
                        <option value="bank_transfer">{t('bankTransfer')}</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        {payoutMethod === 'bank_transfer' ? t('bankAccountNumber') : t('walletNumber')}
                      </label>
                      <input
                        type="text"
                        value={accountNumber}
                        onChange={(e) => setAccountNumber(e.target.value)}
                        placeholder={t('example', { value: payoutMethod === 'bank_transfer' ? 'PK00HABB0000000000000000' : '03001234567' })}
                        dir="ltr"
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
                            {t('submitting')}
                          </>
                        ) : (
                          t('confirmRequest')
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => { setShowPayoutForm(false); setAccountNumber(''); }}
                        disabled={requestingPayout}
                      >
                        {tc('cancel')}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Payout History - Enhanced */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-6 py-4 bg-gradient-to-r from-gray-50 to-white border-b border-gray-100">
                <h2 className="text-lg font-bold text-gray-900">{t('history')}</h2>
              </div>
              <div className="p-6">
                {earnings.payouts.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      {Icons.history}
                    </div>
                    <p className="text-gray-500 font-medium">{t('noHistory')}</p>
                    <p className="text-gray-400 text-sm mt-1">{t('noHistoryHint')}</p>
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
                                {t('requested', { date: formatDate(payout.requestedAt) })}
                              </p>
                              {payout.processedAt && (
                                <p className="text-sm text-gray-500">
                                  {t('processed', { date: formatDate(payout.processedAt) })}
                                </p>
                              )}
                            </div>
                            <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${statusConfig.bg} ${statusConfig.text}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${statusConfig.dot}`}></span>
                              {`payout.${payout.status}` in kitchenEarningsMessages.en
                                ? t(`payout.${payout.status}` as keyof typeof kitchenEarningsMessages.en)
                                : payout.status.charAt(0).toUpperCase() + payout.status.slice(1)}
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
            <h2 className="text-2xl font-bold text-gray-900 mb-2">{t('noData')}</h2>
            <p className="text-gray-500">{t('noDataHint')}</p>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

