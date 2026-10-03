'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Wallet, ArrowDownLeft, ArrowUpRight, Plus, Lock } from 'lucide-react';
import { DashboardLayout, CUSTOMER_SIDEBAR_ITEMS } from '@/components/layout/DashboardShell';
import { useToast } from '@/components/ui/toast';
import { apiClient } from '@/lib/api-client';
import { useAuthStore } from '@/lib/store/auth-store';
import { paymentService, WalletSummary, WalletTransaction } from '@/lib/services/payment.service';
import { formatPrice, formatDateTime } from '@/lib/utils';
import { useT } from '@/lib/i18n';
import { paymentsMessages } from '@/lib/i18n/messages/payments';

const PRESETS = [500, 1000, 2000, 5000];

const TOPUP_MESSAGES: Record<string, { tone: 'success' | 'error' | 'info'; text: keyof typeof paymentsMessages.en }> = {
  paid: { tone: 'success', text: 'topup.paid' },
  failed: { tone: 'error', text: 'topup.failed' },
  cancelled: { tone: 'info', text: 'topup.cancelled' },
};

export default function WalletPage() {
  return (
    <Suspense fallback={null}>
      <WalletContent />
    </Suspense>
  );
}

function WalletContent() {
  const t = useT(paymentsMessages);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated } = useAuthStore();
  const { showToast } = useToast();
  const [wallet, setWallet] = useState<WalletSummary | null>(null);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [amount, setAmount] = useState<number>(1000);
  const [custom, setCustom] = useState('');
  const [starting, setStarting] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoadError(false);
      const [summary, history] = await Promise.all([paymentService.getWallet(), paymentService.getWalletTransactions(1)]);
      setWallet(summary);
      setTransactions(history.transactions);
      setPage(1);
      setTotalPages(history.pagination.totalPages || 1);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated && !apiClient.getAccessToken()) {
      router.push('/login');
      return;
    }
    load();
  }, [isAuthenticated, router, load]);

  const loadMore = async () => {
    try {
      const next = await paymentService.getWalletTransactions(page + 1);
      setTransactions((prev) => [...prev, ...next.transactions]);
      setPage(page + 1);
      setTotalPages(next.pagination.totalPages || 1);
    } catch {
      showToast(t('loadMoreFailed'), 'error');
    }
  };

  const chosen = custom.trim() ? Number(custom) : amount;
  const min = wallet?.topUp.min ?? 100;
  const max = wallet?.topUp.max ?? 50000;
  const validAmount = Number.isFinite(chosen) && chosen >= min && chosen <= max;

  const startTopUp = async () => {
    if (!validAmount) return;
    try {
      setStarting(true);
      const url = await paymentService.startTopUp(chosen);
      window.location.href = url;
    } catch (err: any) {
      showToast(err.response?.data?.error?.message || t('topUpFailed'), 'error');
      setStarting(false);
    }
  };

  const topupResult = TOPUP_MESSAGES[searchParams.get('topup') ?? ''];

  return (
    <DashboardLayout title={t('nurayWallet')} subtitle={t('walletSubtitle')} sidebarItems={CUSTOMER_SIDEBAR_ITEMS} userType="customer">
      <div className="max-w-3xl mx-auto space-y-5 pb-16">
        {topupResult && (
          <div
            role="status"
            className={`rounded-2xl border px-4 py-3 text-sm font-medium ${
              topupResult.tone === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : topupResult.tone === 'error'
                ? 'bg-red-50 border-red-200 text-red-800'
                : 'bg-slate-50 border-slate-200 text-slate-700'
            }`}
          >
            {t(topupResult.text)}
          </div>
        )}

        {loading ? (
          <div className="h-40 rounded-3xl bg-slate-100 animate-pulse" />
        ) : loadError || !wallet ? (
          <div className="rounded-3xl border border-red-200 bg-red-50 p-6 text-center">
            <p className="text-sm font-semibold text-red-800">{t('walletLoadError')}</p>
            <button type="button" onClick={load} className="mt-3 px-4 py-2 rounded-xl border border-red-300 text-sm text-red-700">
              {t('retry')}
            </button>
          </div>
        ) : (
          <>
            <div className="rounded-3xl bg-gradient-to-br from-slate-900 to-slate-800 text-white p-6 sm:p-8">
              <div className="flex items-center gap-2 text-slate-300 text-xs font-semibold uppercase tracking-wider">
                <Wallet className="w-4 h-4" /> {t('balance')}
              </div>
              <div className="mt-2 text-4xl font-black">{formatPrice(wallet.balance)}</div>
              {wallet.isLocked && (
                <p className="mt-3 flex items-center gap-2 text-sm text-amber-300">
                  <Lock className="w-4 h-4" /> {t('walletLocked')}
                </p>
              )}
              <p className="mt-3 text-xs text-slate-400 max-w-md">
                {t('walletInfo')}
              </p>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-6">
              <h2 className="text-sm font-bold text-slate-900">{t('topUpHeading')}</h2>
              {wallet.topUp.available && !wallet.isLocked ? (
                <>
                  <p className="mt-1 text-xs text-slate-500">
                    {t('topUpHint', { min: formatPrice(min), max: formatPrice(max) })}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {PRESETS.filter((p) => p >= min && p <= max).map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => {
                          setAmount(p);
                          setCustom('');
                        }}
                        className={`px-4 py-2 rounded-xl border text-sm font-semibold ${
                          !custom && amount === p ? 'border-[#FF5500] bg-orange-50 text-[#FF5500]' : 'border-slate-200 text-slate-700 hover:border-slate-300'
                        }`}
                      >
                        {formatPrice(p)}
                      </button>
                    ))}
                    <input
                      type="number"
                      inputMode="numeric"
                      min={min}
                      max={max}
                      placeholder={t('otherAmount')}
                      dir="ltr"
                      value={custom}
                      onChange={(e) => setCustom(e.target.value)}
                      className="w-36 px-3 py-2 rounded-xl border border-slate-200 text-sm"
                      aria-label={t('otherAmountAria')}
                    />
                  </div>
                  <button
                    type="button"
                    disabled={!validAmount || starting}
                    onClick={startTopUp}
                    className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#FF5500] text-white text-sm font-bold hover:bg-[#e04400] disabled:opacity-50"
                  >
                    <Plus className="w-4 h-4" />
                    {starting ? t('openingPayPage') : t('topUpButton', { amount: validAmount ? formatPrice(chosen) : '' })}
                  </button>
                </>
              ) : (
                <p className="mt-1 text-xs text-slate-500">
                  {wallet.isLocked ? t('topUpPaused') : t('topUpUnavailable')}
                </p>
              )}
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white overflow-hidden">
              <h2 className="px-5 sm:px-6 pt-5 text-sm font-bold text-slate-900">{t('history')}</h2>
              {transactions.length === 0 ? (
                <p className="px-5 sm:px-6 py-8 text-sm text-slate-500">{t('noActivity')}</p>
              ) : (
                <ul className="mt-3 divide-y divide-slate-100">
                  {transactions.map((tx) => {
                    const incoming = tx.type !== 'debit';
                    return (
                      <li key={tx.id} className="px-5 sm:px-6 py-3.5 flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${incoming ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-600'}`}>
                          {incoming ? <ArrowDownLeft className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-900 truncate">
                            {tx.description || (tx.type === 'topup' ? t('tx.topup') : incoming ? t('tx.credit') : t('tx.payment'))}
                          </p>
                          <p className="text-xs text-slate-500">
                            {formatDateTime(tx.createdAt)}
                            {tx.orderId && (
                              <>
                                {' · '}
                                <Link href={`/orders/${tx.orderId}`} className="underline">
                                  {tx.orderNumber ? t('orderNumber', { number: tx.orderNumber }) : t('viewOrder')}
                                </Link>
                              </>
                            )}
                          </p>
                        </div>
                        <div className="text-end">
                          <p className={`text-sm font-bold ${incoming ? 'text-emerald-600' : 'text-slate-900'}`}>
                            {incoming ? '+' : '−'}
                            {formatPrice(tx.amount)}
                          </p>
                          <p className="text-[11px] text-slate-400">{t('balanceAfter', { amount: formatPrice(tx.balanceAfter) })}</p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
              {page < totalPages && (
                <div className="p-4 text-center border-t border-slate-100">
                  <button type="button" onClick={loadMore} className="text-sm font-semibold text-[#FF5500] hover:underline">
                    {t('showOlder')}
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
