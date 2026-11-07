'use client';

import { useState, useEffect, type ReactNode } from 'react';
import { loginUrlHere } from '@/lib/auth-redirect';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';
import { DashboardLayout, SELLER_SIDEBAR_ITEMS } from '@/components/layout/DashboardShell';
import { Button } from '@/components/ui/button';
import { StatusPill, type StatusTone } from '@/components/ui/StatusPill';
import { LoadError } from '@/components/ui/LoadError';
import { useDialogs } from '@/components/ui/Dialogs';
import { useToast } from '@/components/ui/toast';
import { useAuthStore } from '@/lib/store/auth-store';
import { apiClient, apiErrorMessage } from '@/lib/api-client';
import { formatPrice } from '@/lib/utils';
import { useLocale, useT } from '@/lib/i18n';
import { commonMessages } from '@/lib/i18n/messages/common';
import { kitchenEarningsMessages } from '@/lib/i18n/messages/kitchen-earnings';
import { payoutDestinationIsWrong } from '@/lib/payout-account';
import { sendAskingForPassword } from '@/lib/send-asking-for-password';
import { useShallow } from 'zustand/react/shallow';
import { PayoutStatement } from '@/components/payouts/PayoutStatement';
import { shortDay } from '@/components/sellers/order-timing';

const sidebarItems = SELLER_SIDEBAR_ITEMS;

function Figure({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="text-base font-semibold text-ink tabular-nums" data-ltr>{value}</dd>
    </div>
  );
}

function Why({ label, children }: { label: string; children: ReactNode }) {
  return (
    <details className="group">
      <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1 text-sm font-semibold text-brand-ink [&::-webkit-details-marker]:hidden">
        {label}
        <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <p className="pb-1 text-sm text-muted leading-relaxed">{children}</p>
    </details>
  );
}


interface EarningsData {
  todayEarnings: number;
  todayOrders: number;
  grossSales: number;
  platformFees: number;
  sellerDiscounts: number;
  deliveryEarned: number;
  deliveryPaid: number;
  netEarnings: number;
  pendingSettlement: number;
  paidSettlement: number;
  totalEarnings: number;
  pendingPayout: number;
  availableBalance: number;
  codCommissionOwed: number;
  awaitingRiderCash: number;
  /** Whether Nuray has an account to send the weekly payout to. */
  hasPayoutAccount: boolean;
  /** What is still owed to Nuray after netting, and the cash pause (kitchen-owing.service.ts). */
  owing: { amount: number; since: string | null; cashPausesAt: string | null; cashPaused: boolean };
  payouts: Array<{
    id: string;
    amount: number;
    netAmount: number;
    status: string;
    payoutMethod: string;
    requestedAt: string;
    processedAt?: string;
    periodStart?: string;
    periodEnd?: string;
    automatic?: boolean;
  }>;
}

export default function SellerEarningsPage() {
  const router = useRouter();
  const { isAuthenticated, user } = useAuthStore(useShallow((s) => ({ isAuthenticated: s.isAuthenticated, user: s.user })));
  const { showToast } = useToast();
  const t = useT(kitchenEarningsMessages);
  const tc = useT(commonMessages);
  const { locale } = useLocale();
  const { ask: askDialog } = useDialogs();
  const [loading, setLoading] = useState(true);
  // Why the earnings could not be read; shown instead of "no data", which would say there is nothing to see.
  const [loadError, setLoadError] = useState<unknown>(null);
  const [earnings, setEarnings] = useState<EarningsData | null>(null);
  const [requestingPayout, setRequestingPayout] = useState(false);
  const [showPayoutForm, setShowPayoutForm] = useState(false);
  const [payoutMethod, setPayoutMethod] = useState<'bank_transfer' | 'jazzcash' | 'easypaisa'>('jazzcash');
  const [accountNumber, setAccountNumber] = useState('');
  const [statementFor, setStatementFor] = useState<string | null>(null);
  const [owingWhyOpen, setOwingWhyOpen] = useState(false);

  const loadEarnings = async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const [dashboardRes, payoutsRes] = await Promise.all([
        apiClient.get('/sellers/me/dashboard'),
        apiClient.get('/sellers/me/payouts'),
      ]);
      if (dashboardRes.data.success) {
        const dashboard = dashboardRes.data.data;
        const ov = dashboard.overview || {};
        setEarnings({
          todayEarnings: ov.todayEarnings ?? 0,
          todayOrders: ov.todayOrders ?? 0,
          grossSales: ov.grossSales ?? (ov.totalEarnings ?? 0),
          platformFees: ov.platformFees ?? 0,
          sellerDiscounts: ov.sellerDiscounts ?? 0,
          deliveryEarned: ov.deliveryEarned ?? 0,
          deliveryPaid: ov.deliveryPaid ?? 0,
          netEarnings: ov.netEarnings ?? (ov.totalEarnings ?? 0),
          pendingSettlement: ov.pendingSettlement ?? (ov.pendingPayout ?? 0),
          paidSettlement: ov.paidSettlement ?? 0,
          totalEarnings: ov.totalEarnings ?? 0,
          pendingPayout: ov.pendingPayout ?? 0,
          availableBalance: ov.availableForPayout ?? 0,
          codCommissionOwed: ov.codCommissionOwed ?? 0,
          awaitingRiderCash: ov.awaitingRiderCash ?? 0,
          hasPayoutAccount: dashboard.hasPayoutAccount !== false,
          owing: ov.owing ?? { amount: 0, since: null, cashPausesAt: null, cashPaused: false },
          payouts: payoutsRes.data.success ? payoutsRes.data.data : [],
        });
      }
    } catch (error: unknown) {
      console.error('Failed to load earnings:', error);
      setLoadError(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isAuthenticated) {
      router.replace(loginUrlHere());
      return;
    }

    if (user?.userType !== 'seller' && user?.user_type !== 'seller') {
      router.push('/dashboard');
      showToast(t('accessDenied'), 'error');
      return;
    }

    loadEarnings();
  }, [isAuthenticated, user, router]);

  const handleRequestPayout = async () => {
    if (!earnings || earnings.availableBalance <= 0) {
      showToast(t('noBalance'), 'warning');
      return;
    }
    if (!accountNumber.trim()) {
      showToast(t('enterAccount'), 'warning');
      return;
    }
    // The money is sent to this account: a wrong digit pays a stranger, so it is checked here as the server checks it.
    if (payoutDestinationIsWrong(payoutMethod, accountNumber)) {
      showToast(t(payoutMethod === 'bank_transfer' ? 'accountInvalidBank' : 'accountInvalidWallet'), 'warning');
      return;
    }

    try {
      setRequestingPayout(true);
      // A stolen session must not be able to send the earnings anywhere: the server asks for the password, and we ask the person.
      const response = await sendAskingForPassword(
        (currentPassword) =>
          apiClient.post('/sellers/me/payouts', {
            amount: earnings.availableBalance,
            payoutMethod,
            accountNumber: accountNumber.trim(),
            ...(currentPassword ? { currentPassword } : {}),
          }),
        (wrongBefore) =>
          askDialog({ title: t('passwordTitle'), message: wrongBefore ? t('passwordWrong') : t('payoutPasswordPrompt'), type: 'password' })
      );
      if (response?.data.success) {
        showToast(t('payoutSubmitted'), 'success');
        setShowPayoutForm(false);
        setAccountNumber('');
        loadEarnings();
      }
    } catch (error) {
      showToast(apiErrorMessage(error, t('payoutFailed')), 'error');
    } finally {
      setRequestingPayout(false);
    }
  };

  const payoutTone = (status: string): StatusTone => {
    if (status === 'completed') return 'good';
    if (status === 'pending' || status === 'processing') return 'waiting';
    if (status === 'failed') return 'problem';
    return 'neutral';
  };

  if (!isAuthenticated) {
    return null;
  }

  const onItsWay = earnings ? earnings.pendingPayout || earnings.pendingSettlement : 0;

  return (
    <DashboardLayout
      title={t('title')}
      subtitle={t('subtitle')}
      sidebarItems={sidebarItems}
      userType="seller"
    >
      <div className="max-w-6xl mx-auto pb-16">
        {loading ? (
          <div className="py-24 text-center" role="status">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-line border-t-brand-600 mx-auto mb-4" />
            <p className="text-sm text-muted">{t('loading')}</p>
          </div>
        ) : earnings ? (
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px] lg:grid-rows-[auto_1fr] gap-x-10 gap-y-8">
            <div className="min-w-0 space-y-3 lg:col-start-1">
              <section className="rounded-[20px] bg-surface border border-line shadow-[var(--shadow-card)] p-5 sm:p-6">
                <p className="text-sm text-muted">{t('available')}</p>
                <p className="mt-1 text-4xl leading-tight font-semibold text-ink tabular-nums" data-ltr>
                  {formatPrice(earnings.availableBalance)}
                </p>
                {!earnings.hasPayoutAccount ? (
                  <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-muted">
                    {t('noPayoutAccount')}
                    <Link
                      href="/sellers/settings#payout-heading"
                      className="inline-flex min-h-11 items-center font-semibold text-brand-ink underline underline-offset-2"
                    >
                      {t('addPayoutAccount')}
                    </Link>
                  </p>
                ) : earnings.availableBalance > 0 && !earnings.owing.cashPaused ? (
                  <p className="mt-1 text-sm text-muted">{t('availableHint')}</p>
                ) : null}

                {(onItsWay > 0 || earnings.awaitingRiderCash > 0) && (
                  <dl className="mt-4 pt-2 border-t border-line">
                    {onItsWay > 0 && <Figure label={t('pendingSettlement')} value={formatPrice(onItsWay)} />}
                    {earnings.awaitingRiderCash > 0 && <Figure label={t('awaitingRiderCash')} value={formatPrice(earnings.awaitingRiderCash)} />}
                  </dl>
                )}

                {earnings.owing.amount > 0 && (
                  <div
                    className={`mt-3 rounded-xl px-3 ${earnings.owing.cashPaused ? 'bg-red-50 text-red-800' : 'bg-accent-soft text-accent-soft-ink'}`}
                    data-testid="owing-banner"
                  >
                    <div className="pt-2.5">
                      <p role="status" className="flex items-baseline justify-between gap-3 font-semibold">
                        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                          <AlertTriangle className="h-4 w-4 shrink-0 self-center" aria-hidden="true" />
                          {t('owed')}
                        </span>
                        <span className="shrink-0 text-base tabular-nums" data-ltr>{formatPrice(earnings.owing.amount)}</span>
                      </p>
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span>
                          {earnings.owing.cashPaused
                            ? t('owingCashPaused')
                            : earnings.owing.cashPausesAt
                              ? t('owingDue', { date: shortDay(earnings.owing.cashPausesAt, locale) })
                              : null}
                        </span>
                        <button
                          type="button"
                          aria-expanded={owingWhyOpen}
                          aria-controls="owing-why"
                          onClick={() => setOwingWhyOpen((open) => !open)}
                          className="inline-flex min-h-11 shrink-0 items-center gap-1 font-semibold underline underline-offset-2 focus:outline-none focus-visible:ring-3 focus-visible:ring-brand/30 rounded-md"
                        >
                          {t('why')}
                          <ChevronDown className={`h-4 w-4 transition-transform ${owingWhyOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                    {owingWhyOpen && (
                      <div id="owing-why" className="space-y-2 pb-3 text-sm leading-relaxed">
                        <p>{t('owingBody')}</p>
                        <p>
                          {earnings.owing.cashPaused
                            ? t('owingPaused')
                            : t('owingPausesOn', { date: earnings.owing.cashPausesAt ? shortDay(earnings.owing.cashPausesAt, locale) : '—' })}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {earnings.availableBalance > 0 && (
                  <div className="mt-4 pt-4 border-t border-line">
                    {!showPayoutForm ? (
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <p className="text-sm text-muted">{t('weeklyNote')}</p>
                        <Button onClick={() => setShowPayoutForm(true)} className="shrink-0">
                          {t('requestPayout')}
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="grid gap-4 sm:grid-cols-[200px_minmax(0,1fr)]">
                          <div>
                            <label htmlFor="payout-method" className="block text-sm font-medium text-ink mb-1.5">{t('receiveVia')}</label>
                            <select
                              id="payout-method"
                              value={payoutMethod}
                              onChange={(e) => setPayoutMethod(e.target.value as typeof payoutMethod)}
                              className="w-full min-h-11 px-3 rounded-xl border border-line-strong bg-surface text-ink focus:outline-none focus:border-brand-600 focus:ring-3 focus:ring-brand/30"
                            >
                              <option value="jazzcash">{t('jazzcash')}</option>
                              <option value="easypaisa">{t('easypaisa')}</option>
                              <option value="bank_transfer">{t('bankTransfer')}</option>
                            </select>
                          </div>
                          <div>
                            <label htmlFor="payout-account" className="block text-sm font-medium text-ink mb-1.5">
                              {payoutMethod === 'bank_transfer' ? t('bankAccountNumber') : t('walletNumber')}
                            </label>
                            <input
                              id="payout-account"
                              type="text"
                              value={accountNumber}
                              onChange={(e) => setAccountNumber(e.target.value)}
                              placeholder={t('example', { value: payoutMethod === 'bank_transfer' ? 'PK36SCBL0000001123456702' : '03001234567' })}
                              dir="ltr"
                              className="w-full min-h-11 px-3 rounded-xl border border-line-strong bg-surface text-ink tabular-nums placeholder:text-muted focus:outline-none focus:border-brand-600 focus:ring-3 focus:ring-brand/30"
                            />
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-3">
                          <Button onClick={handleRequestPayout} disabled={requestingPayout || !accountNumber.trim()}>
                            {requestingPayout && (
                              <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" aria-hidden="true" />
                            )}
                            {requestingPayout ? t('submitting') : t('confirmRequest')}
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
              </section>
            </div>

            <aside className="space-y-7 lg:pt-1 lg:col-start-2 lg:row-start-1 lg:row-span-2">
              <section>
                <h2 className="text-sm font-semibold text-ink">{t('today')}</h2>
                <dl className="mt-3 grid grid-cols-2 gap-4">
                  <div>
                    <dt className="text-sm text-muted">{t('todayEarnings')}</dt>
                    <dd className="text-2xl font-semibold text-ink tabular-nums" data-ltr>{formatPrice(earnings.todayEarnings)}</dd>
                  </div>
                  <div>
                    <dt className="text-sm text-muted">{t('todayOrders')}</dt>
                    <dd className="text-2xl font-semibold text-ink tabular-nums">{earnings.todayOrders}</dd>
                  </div>
                </dl>
              </section>

              <section className="pt-6 border-t border-line">
                <h2 className="text-sm font-semibold text-ink">{t('breakdown')}</h2>
                {/* Gross minus every deduction equals net, on one screen. */}
                <dl className="mt-3 text-sm">
                  {([
                    ['grossVolume', earnings.grossSales, 0],
                    ['platformFees', earnings.platformFees, -1],
                    ['sellerDiscounts', earnings.sellerDiscounts, -1],
                    ['deliveryEarned', earnings.deliveryEarned, 1],
                    ['deliveryPaid', earnings.deliveryPaid, -1],
                  ] as const)
                    .filter(([, amount, sign]) => sign === 0 || amount !== 0)
                    .map(([key, amount, sign]) => (
                      <div key={key} className="flex items-baseline justify-between gap-3 py-1.5">
                        <dt className="text-muted">{t(key)}</dt>
                        <dd className="text-ink tabular-nums" data-ltr>
                          {sign < 0 ? '−' : sign > 0 ? '+' : ''}{formatPrice(amount)}
                        </dd>
                      </div>
                    ))}
                  <div className="flex items-baseline justify-between gap-3 pt-2.5 mt-1.5 border-t border-line">
                    <dt className="font-semibold text-ink">{t('netEarnings')}</dt>
                    <dd className="text-base font-semibold text-ink tabular-nums" data-ltr>{formatPrice(earnings.netEarnings)}</dd>
                  </div>
                </dl>
              </section>

              {/* Money the seller collected themselves */}
              {earnings.codCommissionOwed > 0 && earnings.owing.amount === 0 && (
                <section className="pt-6 border-t border-line">
                  <h2 className="text-sm font-semibold text-ink">{t('codTitle')}</h2>
                  <dl className="mt-1">
                    <Figure label={t('codOwed')} value={formatPrice(earnings.codCommissionOwed)} />
                  </dl>
                  <p className="text-sm text-muted">{t('codLine')}</p>
                  <Why label={t('why')}>{t('codWhy')}</Why>
                </section>
              )}
            </aside>

            <section className="min-w-0 lg:col-start-1 max-lg:pt-6 max-lg:border-t max-lg:border-line">
              <h2 className="text-sm font-semibold text-ink">{t('history')}</h2>
              {earnings.payouts.length === 0 ? (
                <p className="mt-3 text-sm text-muted">{t('noHistory')}</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {earnings.payouts.map((payout) => {
                    const toNuray = payout.payoutMethod === 'paid_to_nuray';
                    const row = (
                      <>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold text-ink">
                            {payout.processedAt
                              ? t('processed', { date: shortDay(payout.processedAt, locale) })
                              : t('requested', { date: shortDay(payout.requestedAt, locale) })}
                          </span>
                          {payout.periodStart && payout.periodEnd && !toNuray && (
                            <span className="mt-0.5 block text-sm text-muted">
                              {t('periodShort', { from: shortDay(payout.periodStart, locale), to: shortDay(payout.periodEnd, locale) })}
                            </span>
                          )}
                          {(payout.automatic || toNuray) && (
                            <span className="mt-1.5 flex flex-wrap gap-1.5">
                              {payout.automatic && <StatusPill>{t('weekly')}</StatusPill>}
                              {toNuray && <StatusPill>{t('paidToNuray')}</StatusPill>}
                            </span>
                          )}
                        </span>
                        <span className="shrink-0 flex flex-col items-end gap-1.5">
                          <span className="text-lg font-semibold text-ink tabular-nums" data-ltr>
                            {payout.netAmount < 0 ? '-' : ''}{formatPrice(Math.abs(payout.netAmount))}
                          </span>
                          <StatusPill tone={payoutTone(payout.status)}>
                            {`payout.${payout.status}` in kitchenEarningsMessages.en
                              ? t(`payout.${payout.status}` as keyof typeof kitchenEarningsMessages.en)
                              : payout.status.charAt(0).toUpperCase() + payout.status.slice(1)}
                          </StatusPill>
                        </span>
                      </>
                    );
                    const box = 'flex w-full items-start gap-3 rounded-2xl px-4 py-3.5 text-start';
                    return (
                      <li key={payout.id}>
                        {toNuray ? (
                          <div className={box}>{row}</div>
                        ) : (
                          <button
                            type="button"
                            className={`${box} border border-line bg-surface hover:bg-raised focus:outline-none focus-visible:ring-3 focus-visible:ring-brand/30`}
                            onClick={() => setStatementFor(payout.id)}
                            data-testid="open-statement"
                          >
                            {row}
                            <span className="sr-only">{t('statement')}</span>
                            <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted rtl:-scale-x-100" aria-hidden="true" />
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>
        ) : loadError ? (
          <LoadError error={loadError} onRetry={loadEarnings} title={t('loadFailed')} />
        ) : (
          <div className="py-24 text-center">
            <h2 className="text-base font-semibold text-ink">{t('noData')}</h2>
            <p className="mt-1 text-sm text-muted">{t('noDataHint')}</p>
          </div>
        )}
      </div>
      {statementFor && <PayoutStatement basePath="/sellers/me/payouts" payoutId={statementFor} onClose={() => setStatementFor(null)} />}
    </DashboardLayout>
  );
}
