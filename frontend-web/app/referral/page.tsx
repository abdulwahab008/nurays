'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient } from '@/lib/api-client';
import { useAuthStore } from '@/lib/store/auth-store';
import { useToast } from '@/components/ui/toast';
import { DashboardLayout } from '@/components/layout/DashboardShell';
import { Gift, Copy, Check, Users } from 'lucide-react';

const sidebarItems = [
  { name: 'Dashboard', href: '/dashboard', icon: '' },
  { name: 'Browse Products', href: '/products', icon: '' },
  { name: 'Favorites', href: '/favorites', icon: '' },
  { name: 'My Orders', href: '/orders', icon: '' },
  { name: 'My Cart', href: '/cart', icon: '' },
  { name: 'My Profile', href: '/profile', icon: '' },
];

export default function ReferralPage() {
  const router = useRouter();
  const { isAuthenticated } = useAuthStore();
  const { showToast } = useToast();
  const [info, setInfo] = useState<{ code: string | null; invited: number; rewardPkr: number } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }
    apiClient
      .get<{ success: boolean; data: { code: string | null; invited: number; rewardPkr: number } }>('/users/me/referral')
      .then((res) => setInfo(res.data.data))
      .catch(() => {});
  }, [isAuthenticated]);

  const link = info?.code && typeof window !== 'undefined' ? `${window.location.origin}/register?ref=${info.code}` : '';

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      showToast('Copied to clipboard', 'success');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast('Could not copy', 'error');
    }
  };

  return (
    <DashboardLayout title="Refer & Earn" subtitle="Invite friends, earn credit" sidebarItems={sidebarItems} userType="customer">
      <div className="max-w-2xl">
        <div className="rounded-3xl p-6 sm:p-8 mb-6 text-cream-50" style={{ background: 'var(--ink-900)' }}>
          <span className="w-12 h-12 rounded-full bg-forest-500 flex items-center justify-center mb-4">
            <Gift className="w-6 h-6 text-white" />
          </span>
          <h1 className="font-display text-3xl mb-2">Give Rs {info?.rewardPkr ?? 100}, get Rs {info?.rewardPkr ?? 100}</h1>
          <p className="text-cream-200 opacity-90">
            Share your code. When a friend signs up with it, you both get Rs {info?.rewardPkr ?? 100} in wallet credit.
          </p>
        </div>

        <div className="bg-card rounded-2xl border border-ink-100 shadow-sm p-6 space-y-5">
          <div>
            <p className="eyebrow mb-2">Your referral code</p>
            <div className="flex items-center gap-3">
              <code className="flex-1 text-xl font-bold tracking-widest text-ink-900 bg-cream-100 rounded-xl px-4 py-3 text-center">
                {info?.code ?? '••••••'}
              </code>
              <button
                type="button"
                onClick={() => info?.code && copy(info.code)}
                className="h-12 w-12 rounded-xl bg-forest-500 text-cream-50 flex items-center justify-center hover:bg-forest-600 transition-colors"
                aria-label="Copy code"
              >
                {copied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
              </button>
            </div>
          </div>

          <div>
            <p className="eyebrow mb-2">Invite link</p>
            <div className="flex items-center gap-3">
              <input
                readOnly
                value={link}
                className="flex-1 min-w-0 text-sm text-ink-700 bg-cream-100 rounded-xl px-4 py-3 truncate"
              />
              <button
                type="button"
                onClick={() => link && copy(link)}
                className="h-12 px-4 rounded-xl border border-ink-200 text-ink-700 font-semibold hover:border-forest-300 transition-colors whitespace-nowrap"
              >
                Copy link
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 text-ink-600 pt-1">
            <Users className="w-4 h-4 text-forest-500" />
            <span className="text-sm">
              <span className="font-semibold text-ink-900">{info?.invited ?? 0}</span> friend{(info?.invited ?? 0) === 1 ? '' : 's'} joined with your code
            </span>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
