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

const PRESETS = [500, 1000, 2000, 5000];

const TOPUP_MESSAGES: Record<string, { tone: 'success' | 'error' | 'info'; text: string }> = {
  paid: { tone: 'success', text: 'Top-up received. Your balance is updated.' },
  failed: { tone: 'error', text: "We couldn't confirm that payment. If money left your account, it will show here once the payment provider confirms it." },
  cancelled: { tone: 'info', text: 'Top-up cancelled. Nothing was charged.' },
};

export default function WalletPage() {
  return (
    <Suspense fallback={null}>
      <WalletContent />
    </Suspense>
  );
}

function WalletContent() {
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
      showToast('Could not load more transactions', 'error');
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
      showToast(err.response?.data?.error?.message || 'Could not start the top-up', 'error');
      setStarting(false);
    }
  };

  const topupResult = TOPUP_MESSAGES[searchParams.get('topup') ?? ''];

  return (
    <DashboardLayout title="Nuray Wallet" subtitle="Your balance, top-ups and refunds" sidebarItems={CUSTOMER_SIDEBAR_ITEMS} userType="customer">
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
            {topupResult.text}
          </div>
        )}

        {loading ? (
          <div className="h-40 rounded-3xl bg-slate-100 animate-pulse" />
        ) : loadError || !wallet ? (
          <div className="rounded-3xl border border-red-200 bg-red-50 p-6 text-center">
            <p className="text-sm font-semibold text-red-800">We couldn&apos;t load your wallet.</p>
            <button type="button" onClick={load} className="mt-3 px-4 py-2 rounded-xl border border-red-300 text-sm text-red-700">
              Retry
            </button>
          </div>
        ) : (
          <>
            <div className="rounded-3xl bg-gradient-to-br from-slate-900 to-slate-800 text-white p-6 sm:p-8">
              <div className="flex items-center gap-2 text-slate-300 text-xs font-semibold uppercase tracking-wider">
                <Wallet className="w-4 h-4" /> Balance
              </div>
              <div className="mt-2 text-4xl font-black">{formatPrice(wallet.balance)}</div>
              {wallet.isLocked && (
                <p className="mt-3 flex items-center gap-2 text-sm text-amber-300">
                  <Lock className="w-4 h-4" /> Your wallet is locked. Please contact support.
                </p>
              )}
              <p className="mt-3 text-xs text-slate-400 max-w-md">
                Pay for orders with it at checkout. Refunds of orders you paid from the wallet come back here straight away.
              </p>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-6">
              <h2 className="text-sm font-bold text-slate-900">Top up</h2>
              {wallet.topUp.available && !wallet.isLocked ? (
                <>
                  <p className="mt-1 text-xs text-slate-500">
                    By card, JazzCash or EasyPaisa on our payment provider&apos;s secure page. Between {formatPrice(min)} and {formatPrice(max)}.
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
                      placeholder="Other amount"
                      value={custom}
                      onChange={(e) => setCustom(e.target.value)}
                      className="w-36 px-3 py-2 rounded-xl border border-slate-200 text-sm"
                      aria-label="Other amount in rupees"
                    />
                  </div>
                  <button
                    type="button"
                    disabled={!validAmount || starting}
                    onClick={startTopUp}
                    className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#FF5500] text-white text-sm font-bold hover:bg-[#e04400] disabled:opacity-50"
                  >
                    <Plus className="w-4 h-4" />
                    {starting ? 'Opening the payment page…' : `Top up ${validAmount ? formatPrice(chosen) : ''}`}
                  </button>
                </>
              ) : (
                <p className="mt-1 text-xs text-slate-500">
                  {wallet.isLocked ? 'Top-ups are paused while your wallet is locked.' : "Online top-ups aren't available right now."}
                </p>
              )}
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white overflow-hidden">
              <h2 className="px-5 sm:px-6 pt-5 text-sm font-bold text-slate-900">History</h2>
              {transactions.length === 0 ? (
                <p className="px-5 sm:px-6 py-8 text-sm text-slate-500">No wallet activity yet.</p>
              ) : (
                <ul className="mt-3 divide-y divide-slate-100">
                  {transactions.map((t) => {
                    const incoming = t.type !== 'debit';
                    return (
                      <li key={t.id} className="px-5 sm:px-6 py-3.5 flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${incoming ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-600'}`}>
                          {incoming ? <ArrowDownLeft className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-900 truncate">
                            {t.description || (t.type === 'topup' ? 'Top-up' : incoming ? 'Credit' : 'Payment')}
                          </p>
                          <p className="text-xs text-slate-500">
                            {formatDateTime(t.createdAt)}
                            {t.orderId && (
                              <>
                                {' · '}
                                <Link href={`/orders/${t.orderId}`} className="underline">
                                  {t.orderNumber ? `Order #${t.orderNumber}` : 'View order'}
                                </Link>
                              </>
                            )}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className={`text-sm font-bold ${incoming ? 'text-emerald-600' : 'text-slate-900'}`}>
                            {incoming ? '+' : '−'}
                            {formatPrice(t.amount)}
                          </p>
                          <p className="text-[11px] text-slate-400">Balance {formatPrice(t.balanceAfter)}</p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
              {page < totalPages && (
                <div className="p-4 text-center border-t border-slate-100">
                  <button type="button" onClick={loadMore} className="text-sm font-semibold text-[#FF5500] hover:underline">
                    Show older
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
