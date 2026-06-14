'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient } from '@/lib/api-client';
import { formatPrice, formatDateTime } from '@/lib/utils';
import { useAuthStore } from '@/lib/store/auth-store';
import { useToast } from '@/components/ui/toast';
import { DashboardLayout } from '@/components/layout/DashboardShell';
import { Wallet as WalletIcon, Plus, ArrowDownLeft, ArrowUpRight } from 'lucide-react';

interface WalletTxn {
  id: string;
  type: string;
  amount: number | string;
  balanceAfter: number | string;
  description?: string | null;
  status: string;
  createdAt: string;
}
interface WalletData {
  balance: number | string;
  currency: string;
  recentTransactions: WalletTxn[];
}

const sidebarItems = [
  { name: 'Dashboard', href: '/dashboard', icon: '' },
  { name: 'Browse Products', href: '/products', icon: '' },
  { name: 'Favorites', href: '/favorites', icon: '' },
  { name: 'My Orders', href: '/orders', icon: '' },
  { name: 'Wallet', href: '/wallet', icon: '' },
  { name: 'My Profile', href: '/profile', icon: '' },
];

const TOPUP_PRESETS = [500, 1000, 2000];

export default function WalletPage() {
  const router = useRouter();
  const { isAuthenticated } = useAuthStore();
  const { showToast } = useToast();
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [amount, setAmount] = useState<number>(0);
  const [busy, setBusy] = useState(false);

  const load = () =>
    apiClient
      .get<{ success: boolean; data: WalletData }>('/payments/wallet')
      .then((res) => setWallet(res.data.data))
      .catch(() => {});

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }
    load();
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('topped_up')) {
      showToast('Wallet topped up!', 'success');
    }
  }, [isAuthenticated]);

  const topUp = async () => {
    if (amount < 100) {
      showToast('Minimum top-up is Rs 100', 'warning');
      return;
    }
    setBusy(true);
    try {
      const res = await apiClient.post<{ success: boolean; data: { redirectUrl?: string } }>(
        '/payments/wallet/topup',
        { amount }
      );
      if (res.data?.data?.redirectUrl) {
        window.location.href = res.data.data.redirectUrl;
      } else {
        showToast('Could not start top-up', 'error');
        setBusy(false);
      }
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      showToast(msg || 'Top-up unavailable right now', 'error');
      setBusy(false);
    }
  };

  return (
    <DashboardLayout title="Wallet" subtitle="Your balance & top-ups" sidebarItems={sidebarItems} userType="customer">
      <div className="max-w-2xl space-y-6">
        {/* Balance card */}
        <div className="rounded-3xl p-6 sm:p-8 text-cream-50" style={{ background: 'var(--ink-900)' }}>
          <div className="flex items-center gap-2 text-cream-200 mb-2">
            <WalletIcon className="w-5 h-5" />
            <span className="text-sm">Nuray Wallet</span>
          </div>
          <p className="font-display text-4xl">{wallet ? formatPrice(Number(wallet.balance)) : '—'}</p>
          <p className="text-cream-200 opacity-80 text-sm mt-1">Available balance</p>
        </div>

        {/* Top up */}
        <div className="bg-card rounded-2xl border border-ink-100 shadow-sm p-6">
          <h2 className="text-lg font-bold text-ink-900 mb-1">Add money</h2>
          <p className="text-sm text-ink-500 mb-4">Top up securely via Safepay. Use your balance at checkout.</p>
          <div className="flex flex-wrap gap-2 mb-4">
            {TOPUP_PRESETS.map((amt) => (
              <button
                key={amt}
                type="button"
                onClick={() => setAmount(amt)}
                className={`px-4 h-11 rounded-full font-semibold border transition-colors ${
                  amount === amt ? 'bg-forest-500 text-cream-50 border-forest-500' : 'bg-card text-ink-700 border-ink-200 hover:border-forest-300'
                }`}
              >
                {formatPrice(amt)}
              </button>
            ))}
            <input
              type="number"
              min={100}
              value={amount && !TOPUP_PRESETS.includes(amount) ? amount : ''}
              onChange={(e) => setAmount(Math.max(0, Number(e.target.value) || 0))}
              placeholder="Custom Rs"
              className="w-32 h-11 px-3 rounded-xl border border-ink-200 bg-card text-ink-900 focus:border-forest-500 focus:outline-none"
            />
          </div>
          <button
            type="button"
            onClick={topUp}
            disabled={busy || amount < 100}
            className="inline-flex items-center gap-2 h-11 px-6 rounded-full bg-forest-500 text-cream-50 font-semibold hover:bg-forest-600 disabled:opacity-50 transition-colors"
          >
            <Plus className="w-4 h-4" /> {busy ? 'Starting…' : `Add ${amount >= 100 ? formatPrice(amount) : 'money'}`}
          </button>
        </div>

        {/* History */}
        <div className="bg-card rounded-2xl border border-ink-100 shadow-sm p-6">
          <h2 className="text-lg font-bold text-ink-900 mb-4">Recent activity</h2>
          {!wallet || (wallet.recentTransactions ?? []).length === 0 ? (
            <p className="text-ink-500 text-sm py-6 text-center">No transactions yet.</p>
          ) : (
            <ul className="divide-y divide-ink-100">
              {(wallet.recentTransactions ?? []).map((t) => {
                const credit = ['credit', 'topup', 'referral', 'refund'].includes(t.type);
                return (
                  <li key={t.id} className="flex items-center gap-3 py-3">
                    <span className={`w-9 h-9 rounded-full flex items-center justify-center ${credit ? 'bg-forest-50 text-forest-600' : 'bg-cream-200 text-ink-600'}`}>
                      {credit ? <ArrowDownLeft className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-ink-900 capitalize truncate">{t.description || t.type}</p>
                      <p className="text-xs text-ink-400">{formatDateTime(t.createdAt)}{t.status !== 'completed' ? ` · ${t.status}` : ''}</p>
                    </div>
                    <span className={`font-semibold price ${credit ? 'text-forest-600' : 'text-ink-900'}`}>
                      {credit ? '+' : '−'}{formatPrice(Number(t.amount))}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
