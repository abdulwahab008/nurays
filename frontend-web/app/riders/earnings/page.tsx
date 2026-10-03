'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Wallet, Banknote, TrendingUp, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { DashboardLayout, RIDER_SIDEBAR_ITEMS } from '@/components/layout/DashboardShell';
import { useAuthStore } from '@/lib/store/auth-store';
import { apiClient, apiErrorMessage } from '@/lib/api-client';
import { useToast } from '@/components/ui/toast';
import { useLiveRefresh } from '@/lib/hooks/use-live-refresh';
import { riderService, RiderEarnings, RiderLedgerEntry } from '@/lib/services/rider.service';
import { formatPrice, formatDateTime } from '@/lib/utils';
import { useT } from '@/lib/i18n';
import { riderMessages, riderKeyFor } from '@/lib/i18n/messages/rider';

/**
 * A rider's money with Nuray: what they've earned, the cash they carry for cash orders, and
 * every movement behind both. Settling up happens at a hub: the rider hands in the cash they
 * hold, usually keeping what they're owed.
 */
export default function RiderEarningsPage() {
  const router = useRouter();
  const { isAuthenticated, user } = useAuthStore();
  const { showToast } = useToast();
  const t = useT(riderMessages);
  const [data, setData] = useState<RiderEarnings | null>(null);
  const [entries, setEntries] = useState<RiderLedgerEntry[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isRider = user?.user_type === 'rider' || user?.userType === 'rider';

  const load = useCallback(async () => {
    try {
      setError(null);
      const first = await riderService.getEarnings(1);
      setData(first);
      setEntries(first.entries);
      setPage(1);
    } catch (err) {
      setError(apiErrorMessage(err, t('earn.loadFailed')));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (!isAuthenticated && !apiClient.getAccessToken()) {
      router.push('/login');
      return;
    }
    if (!user) return;
    if (!isRider) {
      router.push('/products');
      return;
    }
    load();
  }, [isAuthenticated, user, isRider, router, load]);

  // A delivery completed (on this or another device) changes the numbers.
  useLiveRefresh(load, {
    events: ['order:status:update'],
    enabled: isAuthenticated && isRider && !!data,
    intervalMs: 120_000,
  });

  const loadMore = async () => {
    try {
      const next = await riderService.getEarnings(page + 1);
      setEntries((prev) => [...prev, ...next.entries]);
      setPage(page + 1);
    } catch {
      showToast(t('earn.olderFailed'), 'error');
    }
  };

  const cashPercent = data && data.cashLimit > 0 ? Math.min(100, Math.round((data.cashHeld / data.cashLimit) * 100)) : 0;

  return (
    <DashboardLayout title={t('earn.title')} subtitle={t('earn.subtitle')} sidebarItems={RIDER_SIDEBAR_ITEMS} userType="rider">
      <div className="max-w-4xl mx-auto space-y-5 pb-16">
        {loading ? (
          <div className="h-40 rounded-3xl bg-slate-100 animate-pulse" />
        ) : error || !data ? (
          <div className="rounded-3xl border border-red-200 bg-red-50 p-6 text-center">
            <p className="text-sm font-semibold text-red-800">{error ?? t('earn.loadFailed')}</p>
            <button type="button" onClick={load} className="mt-3 px-4 py-2 rounded-xl border border-red-300 text-sm text-red-700">
              {t('earn.retry')}
            </button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="rounded-3xl bg-slate-900 text-white p-5" data-testid="rider-balance">
                <div className="flex items-center gap-2 text-slate-300 text-xs font-semibold uppercase tracking-wider">
                  <Wallet className="w-4 h-4" /> {data.balance >= 0 ? t('nurayOwesYou') : t('youOweNuray')}
                </div>
                <div className="mt-2 text-3xl font-black">{formatPrice(Math.abs(data.balance))}</div>
                <p className="mt-2 text-[11px] text-slate-400">
                  {t('earn.balanceNote')}
                </p>
              </div>

              <div className="rounded-3xl bg-white border border-slate-200 p-5" data-testid="rider-cash-held">
                <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold uppercase tracking-wider">
                  <Banknote className="w-4 h-4" /> {t('cashInHand')}
                </div>
                <div className="mt-2 text-3xl font-black text-slate-900">{formatPrice(data.cashHeld)}</div>
                <div className="mt-3 w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${cashPercent >= 100 ? 'bg-red-500' : cashPercent > 80 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                    style={{ width: `${cashPercent}%` }}
                  />
                </div>
                <p className="mt-2 text-[11px] text-slate-500">{t('earn.limitNote', { limit: formatPrice(data.cashLimit) })}</p>
              </div>

              <div className="rounded-3xl bg-white border border-slate-200 p-5">
                <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold uppercase tracking-wider">
                  <TrendingUp className="w-4 h-4" /> {t('earn.earned')}
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <div>
                    <p className="text-[11px] text-slate-500">{t('earn.today')}</p>
                    <p className="text-lg font-black text-slate-900" data-testid="rider-earned-today">{formatPrice(data.earnedToday)}</p>
                    <p className="text-[11px] text-slate-400">{t(data.deliveriesToday === 1 ? 'earn.delivery' : 'earn.deliveries', { count: data.deliveriesToday })}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-slate-500">{t('earn.thisWeek')}</p>
                    <p className="text-lg font-black text-slate-900">{formatPrice(data.earnedThisWeek)}</p>
                    <p className="text-[11px] text-slate-400">{t(data.deliveriesThisWeek === 1 ? 'earn.delivery' : 'earn.deliveries', { count: data.deliveriesThisWeek })}</p>
                  </div>
                </div>
                <p className="mt-2 text-[11px] text-slate-400">{t('earn.allTime', { earned: formatPrice(data.earned), paid: formatPrice(data.paidOut) })}</p>
              </div>
            </div>

            <div className="rounded-3xl border border-emerald-200 bg-emerald-50/60 p-4 text-xs text-emerald-900">
              <strong>{t('earn.settleTitle')}</strong> {t('earn.settleBody')}
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white overflow-hidden">
              <h2 className="px-5 sm:px-6 pt-5 text-sm font-bold text-slate-900">{t('earn.history')}</h2>
              {entries.length === 0 ? (
                <p className="px-5 sm:px-6 py-8 text-sm text-slate-500">{t('earn.empty')}</p>
              ) : (
                <ul className="mt-3 divide-y divide-slate-100" data-testid="rider-ledger">
                  {entries.map((e) => {
                    const plus = e.amount > 0;
                    const typeKey = riderKeyFor('ledger', e.type);
                    return (
                      <li key={e.id} className="px-5 sm:px-6 py-3.5 flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${plus ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-600'}`}>
                          {plus ? <ArrowDownLeft className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-900 truncate">{typeKey ? t(typeKey) : e.type}</p>
                          <p className="text-xs text-slate-500 truncate">
                            {formatDateTime(e.createdAt)}
                            {e.note ? ` · ${e.note}` : ''}
                            {e.reference ? ` · ${t('earn.ref', { ref: e.reference })}` : ''}
                          </p>
                        </div>
                        <p className={`text-sm font-bold ${plus ? 'text-emerald-600' : 'text-slate-900'}`}>
                          {plus ? '+' : '−'}
                          {formatPrice(Math.abs(e.amount))}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              )}
              {page < data.pagination.totalPages && (
                <div className="p-4 text-center border-t border-slate-100">
                  <button type="button" onClick={loadMore} className="text-sm font-semibold text-emerald-700 hover:underline">
                    {t('earn.showOlder')}
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
