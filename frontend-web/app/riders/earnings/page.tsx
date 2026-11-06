'use client';

import { useCallback, useEffect, useState } from 'react';
import { DashboardLayout, RIDER_SIDEBAR_ITEMS } from '@/components/layout/DashboardShell';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/lib/store/auth-store';
import { apiErrorMessage } from '@/lib/api-client';
import { useToast } from '@/components/ui/toast';
import { useLiveRefresh } from '@/lib/hooks/use-live-refresh';
import { riderService, RiderEarnings, RiderLedgerEntry } from '@/lib/services/rider.service';
import { formatPrice, formatDateTime } from '@/lib/utils';
import { useT } from '@/lib/i18n';
import { riderMessages, riderKeyFor } from '@/lib/i18n/messages/rider';
import { useShallow } from 'zustand/react/shallow';

/**
 * A rider's money with Nuray: what they've earned, the cash they carry for cash orders, and
 * every movement behind both. Settling up happens at a hub: the rider hands in the cash they
 * hold, usually keeping what they're owed.
 */
export default function RiderEarningsPage() {
  const { isAuthenticated, user } = useAuthStore(useShallow((s) => ({ isAuthenticated: s.isAuthenticated, user: s.user })));
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

  // app/riders/layout.tsx sends signed-out people to sign in and other accounts to their own home.
  useEffect(() => {
    if (isRider) load();
  }, [isRider, load]);

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
      <div className="max-w-6xl mx-auto pb-16">
        {loading ? (
          <div className="py-24 text-center" role="status">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-line border-t-brand-600 mx-auto mb-4" />
            <p className="text-sm text-muted">{t('earn.loading')}</p>
          </div>
        ) : error || !data ? (
          <div className="max-w-md mx-auto py-16 text-center">
            <p className="text-base font-semibold text-ink">{error ?? t('earn.loadFailed')}</p>
            <Button variant="outline" onClick={load} className="mt-4">
              {t('earn.retry')}
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px] lg:grid-rows-[auto_1fr] gap-x-10 gap-y-8">
            <div className="min-w-0 space-y-8 lg:col-start-1">
              <section className="rounded-[20px] bg-surface border border-line shadow-[var(--shadow-card)] p-5 sm:p-6">
                <div className="grid grid-cols-1 min-[360px]:grid-cols-2 gap-x-5 sm:gap-x-10 gap-y-6">
                  <div data-testid="rider-balance">
                    <p className="text-sm text-muted">{data.balance >= 0 ? t('nurayOwesYou') : t('youOweNuray')}</p>
                    <p className="mt-1 text-[26px] sm:text-4xl leading-tight font-semibold text-ink tabular-nums">{formatPrice(Math.abs(data.balance))}</p>
                    <p className="mt-2 text-sm text-muted leading-relaxed">{t('earn.balanceNote')}</p>
                  </div>
                  <div data-testid="rider-cash-held">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="text-sm text-muted">{t('cashInHand')}</p>
                      {cashPercent > 80 && (
                        <span className={`text-xs font-medium ${cashPercent >= 100 ? 'text-red-700' : 'text-accent-soft-ink'}`}>
                          {cashPercent >= 100 ? t('limitReached') : t('nearLimit')}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-[26px] sm:text-4xl leading-tight font-semibold text-ink tabular-nums">{formatPrice(data.cashHeld)}</p>
                    <div className="mt-3 h-1.5 rounded-full bg-raised overflow-hidden" role="presentation">
                      <div
                        className={`h-full rounded-full ${cashPercent >= 100 ? 'bg-red-600' : cashPercent > 80 ? 'bg-accent-500' : 'bg-brand-600'}`}
                        style={{ width: `${cashPercent}%` }}
                      />
                    </div>
                    <p className="mt-2 text-sm text-muted leading-relaxed">{t('earn.limitNote', { limit: formatPrice(data.cashLimit) })}</p>
                  </div>
                </div>
              </section>
            </div>

            <aside className="space-y-7 lg:pt-1 lg:col-start-2 lg:row-start-1 lg:row-span-2">
              <section>
                <h2 className="text-sm font-semibold text-ink">{t('earn.earned')}</h2>
                <dl className="mt-3 grid grid-cols-2 gap-4">
                  <div>
                    <dt className="text-sm text-muted">{t('earn.today')}</dt>
                    <dd className="text-2xl font-semibold text-ink tabular-nums" data-testid="rider-earned-today">{formatPrice(data.earnedToday)}</dd>
                    <dd className="text-sm text-muted">{t(data.deliveriesToday === 1 ? 'earn.delivery' : 'earn.deliveries', { count: data.deliveriesToday })}</dd>
                  </div>
                  <div>
                    <dt className="text-sm text-muted">{t('earn.thisWeek')}</dt>
                    <dd className="text-2xl font-semibold text-ink tabular-nums">{formatPrice(data.earnedThisWeek)}</dd>
                    <dd className="text-sm text-muted">{t(data.deliveriesThisWeek === 1 ? 'earn.delivery' : 'earn.deliveries', { count: data.deliveriesThisWeek })}</dd>
                  </div>
                </dl>
              </section>

              <section className="pt-6 border-t border-line">
                <h2 className="text-sm font-semibold text-ink">{t('earn.allTimeTitle')}</h2>
                <dl className="mt-3 text-sm">
                  <div className="flex items-baseline justify-between gap-3 py-1.5">
                    <dt className="text-muted">{t('earn.allTimeEarned')}</dt>
                    <dd className="text-ink tabular-nums">{formatPrice(data.earned)}</dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-3 py-1.5">
                    <dt className="text-muted">{t('earn.allTimePaid')}</dt>
                    <dd className="text-ink tabular-nums">{formatPrice(data.paidOut)}</dd>
                  </div>
                </dl>
              </section>

              <section className="pt-6 border-t border-line">
                <h2 className="text-sm font-semibold text-ink">{t('earn.settleTitle')}</h2>
                <p className="mt-1 text-sm text-muted leading-relaxed">{t('earn.settleBody')}</p>
              </section>
            </aside>

            <section className="min-w-0 lg:col-start-1 max-lg:pt-6 max-lg:border-t max-lg:border-line">
              <h2 className="text-sm font-semibold text-ink">{t('earn.history')}</h2>
              {entries.length === 0 ? (
                <p className="mt-3 text-sm text-muted">{t('earn.empty')}</p>
              ) : (
                <ul className="mt-2 divide-y divide-line" data-testid="rider-ledger">
                  {entries.map((e) => {
                    const plus = e.amount > 0;
                    const typeKey = riderKeyFor('ledger', e.type);
                    return (
                      <li key={e.id} className="py-3.5 flex items-center justify-between gap-4">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-ink truncate">{typeKey ? t(typeKey) : e.type}</p>
                          <p className="text-sm text-muted truncate">
                            {formatDateTime(e.createdAt)}
                            {e.note ? `, ${e.note}` : ''}
                            {e.reference ? `, ${t('earn.ref', { ref: e.reference })}` : ''}
                          </p>
                        </div>
                        <p className={`shrink-0 text-sm font-semibold tabular-nums ${plus ? 'text-brand-ink' : 'text-ink'}`}>
                          {plus ? '+' : '−'}
                          {formatPrice(Math.abs(e.amount))}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              )}
              {page < data.pagination.totalPages && (
                <div className="pt-2 border-t border-line">
                  <Button variant="ghost" onClick={loadMore} className="px-3 -ms-3">
                    {t('earn.showOlder')}
                  </Button>
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
