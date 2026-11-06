'use client';

import { useState, useEffect, type ReactNode } from 'react';
import { loginUrlHere } from '@/lib/auth-redirect';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { DashboardLayout, SELLER_SIDEBAR_ITEMS } from '@/components/layout/DashboardShell';
import { Button } from '@/components/ui/button';
import { LoadError } from '@/components/ui/LoadError';
import { useDialogs } from '@/components/ui/Dialogs';
import { useToast } from '@/components/ui/toast';
import { useAuthStore } from '@/lib/store/auth-store';
import { apiClient, apiErrorMessage } from '@/lib/api-client';
import { formatPrice, formatDate } from '@/lib/utils';
import { useT } from '@/lib/i18n';
import { commonMessages } from '@/lib/i18n/messages/common';
import { kitchenEarningsMessages } from '@/lib/i18n/messages/kitchen-earnings';
import { payoutDestinationIsWrong } from '@/lib/payout-account';
import { sendAskingForPassword } from '@/lib/send-asking-for-password';
import { useShallow } from 'zustand/react/shallow';
import { PayoutStatement } from '@/components/payouts/PayoutStatement';

const sidebarItems = SELLER_SIDEBAR_ITEMS;

/** Puts React nodes where a translated sentence has {name} placeholders. */
function withNodes(text: string, nodes: Record<string, ReactNode>) {
  return text.split(/\{(\w+)\}/g).map((part, i) => (i % 2 === 1 ? <span key={i}>{nodes[part] ?? `{${part}}`}</span> : part));
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

  const statusPill = (status: string) => {
    if (status === 'completed') return 'bg-brand-soft text-brand-soft-ink';
    if (status === 'pending' || status === 'processing') return 'bg-accent-soft text-accent-soft-ink';
    if (status === 'failed') return 'bg-red-50 text-red-700';
    return 'bg-raised text-muted';
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
      <div className="max-w-6xl mx-auto pb-16">
        {loading ? (
          <div className="py-24 text-center" role="status">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-line border-t-brand-600 mx-auto mb-4" />
            <p className="text-sm text-muted">{t('loading')}</p>
          </div>
        ) : earnings ? (
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px] lg:grid-rows-[auto_1fr] gap-x-10 gap-y-8">
            <div className="min-w-0 space-y-8 lg:col-start-1">
              {/* Still owed to Nuray after netting: and when (or that) cash orders pause */}
              {earnings.owing.amount > 0 && (
                <div
                  className={`rounded-2xl px-5 py-4 ${earnings.owing.cashPaused ? 'bg-red-50 text-red-800' : 'bg-accent-soft text-accent-soft-ink'}`}
                  role="status"
                  data-testid="owing-banner"
                >
                  <p className="font-semibold">{t('owingTitle', { amount: formatPrice(earnings.owing.amount) })}</p>
                  <p className="text-sm mt-1 leading-relaxed">{t('owingBody')}</p>
                  <p className="text-sm mt-2 font-medium leading-relaxed">
                    {earnings.owing.cashPaused
                      ? t('owingPaused')
                      : t('owingPausesOn', { date: earnings.owing.cashPausesAt ? formatDate(earnings.owing.cashPausesAt) : '—' })}
                  </p>
                </div>
              )}

              <section className="rounded-[20px] bg-surface border border-line shadow-[var(--shadow-card)] p-5 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-x-10 gap-y-4">
                  <div>
                    <p className="text-sm text-muted">{t('available')}</p>
                    <p className="mt-1 text-4xl leading-tight font-semibold text-ink tabular-nums" data-ltr>
                      {formatPrice(earnings.availableBalance)}
                    </p>
                  </div>
                  {(earnings.pendingPayout || earnings.pendingSettlement) > 0 && (
                    <div>
                      <p className="text-sm text-muted">{t('pendingSettlement')}</p>
                      <p className="mt-1 text-2xl font-semibold text-ink tabular-nums" data-ltr>
                        {formatPrice(earnings.pendingPayout || earnings.pendingSettlement)}
                      </p>
                    </div>
                  )}
                </div>
                {earnings.hasPayoutAccount ? (
                  <p className="mt-3 text-sm text-muted leading-relaxed">{t('availableHint')}</p>
                ) : (
                  <p className="mt-3 rounded-lg bg-accent-soft px-3 py-2.5 text-sm text-accent-soft-ink leading-relaxed">
                    {t('noPayoutAccount')}{' '}
                    <Link href="/sellers/settings#payout-heading" className="font-semibold underline underline-offset-2">
                      {t('addPayoutAccount')}
                    </Link>
                  </p>
                )}
                {earnings.awaitingRiderCash > 0 && (
                  <p className="mt-2 text-sm font-medium text-accent-soft-ink">
                    {t('awaitingRiderCash', { amount: formatPrice(earnings.awaitingRiderCash) })}
                  </p>
                )}

                {earnings.availableBalance > 0 && (
                  <div className="mt-5 pt-5 border-t border-line">
                    {!showPayoutForm ? (
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <p className="text-sm text-muted leading-relaxed">{t('weeklyNote')}</p>
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
                  <p className="text-sm text-muted leading-relaxed">
                    {withNodes(t('codNote'), {
                      you: <span className="font-semibold text-ink">{t('codNoteYou')}</span>,
                      amount: <span className="font-semibold text-ink tabular-nums">{formatPrice(earnings.codCommissionOwed)}</span>,
                    })}
                  </p>
                </section>
              )}
            </aside>

            <section className="min-w-0 lg:col-start-1 max-lg:pt-6 max-lg:border-t max-lg:border-line">
              <h2 className="text-sm font-semibold text-ink">{t('history')}</h2>
              {earnings.payouts.length === 0 ? (
                <p className="mt-3 text-sm text-muted">{t('noHistory')}</p>
              ) : (
                <ul className="mt-2 divide-y divide-line">
                  {earnings.payouts.map((payout) => (
                    <li key={payout.id} className="py-4 flex items-start sm:items-center justify-between gap-4">
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="text-base font-semibold text-ink tabular-nums" data-ltr>
                            {payout.netAmount < 0 ? '-' : ''}{formatPrice(Math.abs(payout.netAmount))}
                          </span>
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusPill(payout.status)}`}>
                            {`payout.${payout.status}` in kitchenEarningsMessages.en
                              ? t(`payout.${payout.status}` as keyof typeof kitchenEarningsMessages.en)
                              : payout.status.charAt(0).toUpperCase() + payout.status.slice(1)}
                          </span>
                          {payout.automatic && <span className="rounded-full px-2 py-0.5 text-xs font-medium bg-raised text-muted">{t('weekly')}</span>}
                          {payout.payoutMethod === 'paid_to_nuray' && <span className="rounded-full px-2 py-0.5 text-xs font-medium bg-raised text-muted">{t('paidToNuray')}</span>}
                        </p>
                        <p className="mt-1 text-sm text-muted">
                          {[
                            payout.periodStart && payout.periodEnd && payout.payoutMethod !== 'paid_to_nuray'
                              ? t('period', { from: payout.periodStart, to: payout.periodEnd })
                              : null,
                            t('requested', { date: formatDate(payout.requestedAt) }),
                            payout.processedAt ? t('processed', { date: formatDate(payout.processedAt) }) : null,
                          ].filter(Boolean).join(', ')}
                        </p>
                      </div>
                      {payout.payoutMethod !== 'paid_to_nuray' && (
                        <Button variant="ghost" className="shrink-0 px-3 -me-3" onClick={() => setStatementFor(payout.id)} data-testid="open-statement">
                          {t('statement')}
                        </Button>
                      )}
                    </li>
                  ))}
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

