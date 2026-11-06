'use client';

import { useState, useEffect } from 'react';
import { AdminShell } from '@/components/layout/AdminShell';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { LoadError } from '@/components/ui/LoadError';
import { useDialogs } from '@/components/ui/Dialogs';
import { useAuthStore } from '@/lib/store/auth-store';
import { apiClient, apiErrorMessage } from '@/lib/api-client';
import { formatPrice, formatDate } from '@/lib/utils';
import { PayoutStatement } from '@/components/payouts/PayoutStatement';

interface Payout {
  id: string;
  seller: { id: string; businessName: string };
  amount: number;
  netAmount: number;
  payoutMethod: string;
  accountDetails: { accountNumber?: string } | null;
  status: string;
  failedReason?: string;
  requestedAt: string;
  processedAt?: string;
  periodStart?: string;
  periodEnd?: string;
  automatic?: boolean;
}

/** GET /admin/kitchens-owing */
interface OwingKitchen {
  sellerId: string;
  businessName: string;
  owed: number;
  owesSince: string | null;
  cashPausesAt: string | null;
  cashPaused: boolean;
}

const FILTERS = ['pending', 'completed', 'failed', 'all'] as const;

export default function AdminPayoutsPage() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const { showToast } = useToast();
  const { ask: askDialog } = useDialogs();
  const [loading, setLoading] = useState(true);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  // Why the payouts could not be read; shown instead of "No payouts", which would be untrue.
  const [loadError, setLoadError] = useState<unknown>(null);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('pending');
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [failReasonFor, setFailReasonFor] = useState<string | null>(null);
  const [failReason, setFailReason] = useState('');
  const [statementFor, setStatementFor] = useState<string | null>(null);
  const [owing, setOwing] = useState<OwingKitchen[]>([]);
  const [owingError, setOwingError] = useState<unknown>(null);
  const [recordingFor, setRecordingFor] = useState<string | null>(null);

  // Kitchens whose commission on cash they took themselves is more than Nuray owes them (kitchen-owing.service.ts).
  const loadOwing = async () => {
    try {
      const res = await apiClient.get<{ data: { kitchens: OwingKitchen[] } }>('/admin/kitchens-owing');
      setOwing(res.data.data.kitchens);
      setOwingError(null);
    } catch (error) {
      setOwingError(error);
    }
  };

  const recordPayment = async (k: OwingKitchen) => {
    const amountText = await askDialog({
      title: `${k.businessName} paid Nuray`,
      message: `They owe ${formatPrice(k.owed)}. Enter what they paid (up to that). Only record money that has arrived in Nuray's account.`,
      label: 'Amount (Rs)',
      placeholder: String(k.owed),
      confirmText: 'Next',
    });
    if (amountText === null) return;
    const amount = Number(amountText.replace(/[,\s]/g, ''));
    if (!Number.isFinite(amount) || amount <= 0) {
      showToast('Enter an amount above zero', 'warning');
      return;
    }
    const reference = await askDialog({
      title: 'Payment reference',
      message: `${formatPrice(amount)} from ${k.businessName}. The transaction or receipt reference is kept with it and shown to the kitchen.`,
      label: 'Reference',
      confirmText: 'Record payment',
    });
    if (!reference) return;
    try {
      setRecordingFor(k.sellerId);
      await apiClient.post(`/admin/sellers/${k.sellerId}/payments-to-nuray`, { amount, reference });
      showToast('Payment recorded', 'success');
      loadOwing();
      loadPayouts();
    } catch (error) {
      showToast(apiErrorMessage(error, 'Could not record the payment'), 'error');
    } finally {
      setRecordingFor(null);
    }
  };

  const loadPayouts = async () => {
    try {
      setLoading(true);
      const response = await apiClient.get(`/admin/payouts${filter !== 'all' ? `?status=${filter}` : ''}`);
      if (response.data.success) {
        setPayouts(response.data.data.payouts || []);
      }
      setLoadError(null);
    } catch (error) {
      // The payouts on the screen belong to the filter before this change, so they go with the failure.
      setPayouts([]);
      setLoadError(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isAuthenticated) return;
    loadPayouts();
    loadOwing();
  }, [isAuthenticated, filter]);

  const handleComplete = async (payout: Payout) => {
    // Marking a payout as sent is final and the kitchen is told it has been paid: ask first, and keep the transfer reference.
    const reference = await askDialog({
      title: 'Mark this payout as sent',
      message: `${formatPrice(payout.netAmount)} to ${payout.seller.businessName} by ${payout.payoutMethod.replace('_', ' ')}${payout.accountDetails?.accountNumber ? ` (${payout.accountDetails.accountNumber})` : ''}. Only do this after the money has been sent. The reference is shown to the kitchen.`,
      label: 'Transfer reference',
      optional: true,
      confirmText: 'Mark as sent',
    });
    if (reference === null) return;
    const payoutId = payout.id;
    try {
      setProcessingId(payoutId);
      await apiClient.post(`/admin/payouts/${payoutId}/complete`, reference ? { transactionId: reference } : {});
      showToast('Payout marked as completed', 'success');
      loadPayouts();
    } catch (error) {
      showToast(apiErrorMessage(error, 'Failed to complete payout'), 'error');
    } finally {
      setProcessingId(null);
    }
  };

  const handleFail = async (payoutId: string) => {
    if (failReason.trim().length < 1) {
      showToast('Please enter a reason', 'warning');
      return;
    }
    try {
      setProcessingId(payoutId);
      await apiClient.post(`/admin/payouts/${payoutId}/fail`, { reason: failReason.trim() });
      showToast('Payout marked as failed', 'success');
      setFailReasonFor(null);
      setFailReason('');
      loadPayouts();
    } catch (error) {
      showToast(apiErrorMessage(error, 'Failed to update payout'), 'error');
    } finally {
      setProcessingId(null);
    }
  };

  const statusColor = (status: string) => {
    const map: Record<string, string> = {
      pending: 'bg-accent-soft text-accent-soft-ink',
      completed: 'bg-brand-soft text-brand-soft-ink',
      failed: 'bg-red-50 text-red-700',
    };
    return map[status] || 'bg-raised text-muted';
  };
  const statusWord = (status: string) => ({ pending: 'To send', completed: 'Sent', failed: 'Failed' })[status] ?? status;

  return (
    <AdminShell>
      <div className="max-w-7xl mx-auto">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-ink">Kitchen payouts</h1>
            <p className="text-sm text-muted mt-1">Money owed to kitchens, and what kitchens owe Nuray.</p>
          </div>
          <Button variant="outline" onClick={loadPayouts} disabled={loading}>
            {loading ? 'Loading…' : 'Refresh'}
          </Button>
        </div>

        {/* Kitchens that owe Nuray */}
        {owingError ? (
          <div className="mb-6"><LoadError compact error={owingError} onRetry={loadOwing} title="We couldn't load the kitchens that owe Nuray" /></div>
        ) : owing.length > 0 ? (
          <div className="mb-6 bg-accent-soft rounded-2xl p-4" data-testid="owing-kitchens">
            <h2 className="font-semibold text-ink">Kitchens that owe Nuray</h2>
            <p className="text-sm text-ink mb-3">Commission on cash they collected themselves, after netting against their online earnings. After two weeks owing, their new cash orders pause until they pay.</p>
            <ul className="divide-y divide-line">
              {owing.map((k) => (
                <li key={k.sellerId} className="flex flex-wrap items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <p className="font-medium text-ink">{k.businessName} <span className="font-semibold tabular-nums">{formatPrice(k.owed)}</span></p>
                    <p className="text-xs text-muted">
                      {k.owesSince ? `Owing since ${formatDate(k.owesSince)}` : ''}
                      {k.cashPaused ? ' · cash orders paused' : k.cashPausesAt ? ` · cash pauses ${formatDate(k.cashPausesAt)}` : ''}
                    </p>
                  </div>
                  <Button variant="outline" disabled={recordingFor === k.sellerId} onClick={() => recordPayment(k)} data-testid="record-kitchen-payment">
                    {recordingFor === k.sellerId ? 'Saving…' : 'Record payment'}
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="flex gap-2 mb-6 overflow-x-auto no-scrollbar">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
              className={`shrink-0 min-h-11 px-4 rounded-full text-sm font-medium border transition-colors ${
                filter === f ? 'border-ink bg-ink text-page' : 'border-line bg-surface text-ink hover:bg-raised'
              }`}
            >
              {f === 'all' ? 'All' : statusWord(f)}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-3 py-12 text-sm text-muted" role="status">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-line-strong border-t-brand-ink" aria-hidden="true" />
            Loading payouts…
          </div>
        ) : loadError ? (
          <LoadError error={loadError} onRetry={loadPayouts} title="We couldn't load the payouts" />
        ) : payouts.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted">
            {filter === 'pending' ? 'No payouts to send. Weekly payouts appear here when they are due.' : 'No payouts here yet.'}
          </p>
        ) : (
          <div className="space-y-4">
            {payouts.map((payout) => (
              <div key={payout.id} className="bg-surface border border-line rounded-2xl p-4 sm:p-6">
                <div className="flex items-start justify-between flex-wrap gap-4">
                  <div className="flex-1 min-w-[240px]">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <h3 className="text-base font-semibold text-ink">{payout.seller.businessName}</h3>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColor(payout.status)}`}>
                        {statusWord(payout.status)}
                      </span>
                      {payout.automatic && <span className="rounded-full px-2 py-0.5 text-xs font-medium bg-raised text-muted">Weekly</span>}
                      {payout.payoutMethod === 'paid_to_nuray' && <span className="rounded-full px-2 py-0.5 text-xs font-medium bg-raised text-muted">Kitchen paid Nuray</span>}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                      <div><span className="text-muted">Requested:</span> <span className="font-medium">{formatPrice(payout.amount)}</span></div>
                      <div><span className="text-muted">Net payout:</span> <span className="font-medium">{formatPrice(payout.netAmount)}</span></div>
                      <div><span className="text-muted">Method:</span> <span className="font-medium capitalize">{payout.payoutMethod.replace('_', ' ')}</span></div>
                      <div><span className="text-muted">Account:</span> <span className="font-medium">{payout.accountDetails?.accountNumber || '—'}</span></div>
                      <div><span className="text-muted">Requested at:</span> <span className="font-medium">{formatDate(payout.requestedAt)}</span></div>
                      {payout.periodStart && payout.periodEnd && payout.payoutMethod !== 'paid_to_nuray' && (
                        <div><span className="text-muted">Covers:</span> <span className="font-medium">{payout.periodStart} to {payout.periodEnd}</span></div>
                      )}
                      {payout.processedAt && (
                        <div><span className="text-muted">Processed at:</span> <span className="font-medium">{formatDate(payout.processedAt)}</span></div>
                      )}
                      {payout.failedReason && (
                        <div className="md:col-span-2"><span className="text-muted">Failure reason:</span> <span className="font-medium text-red-700">{payout.failedReason}</span></div>
                      )}
                    </div>
                  </div>

                  {payout.payoutMethod !== 'paid_to_nuray' && (
                    <Button variant="outline" onClick={() => setStatementFor(payout.id)} data-testid="open-statement">
                      Statement
                    </Button>
                  )}
                  {payout.status === 'pending' && (
                    <div className="flex flex-col gap-2 items-end">
                      <div className="flex gap-2">
                        <Button onClick={() => handleComplete(payout)} disabled={processingId === payout.id}>
                          {processingId === payout.id ? 'Saving…' : 'Mark as sent'}
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => setFailReasonFor(failReasonFor === payout.id ? null : payout.id)}
                          disabled={processingId === payout.id}
                          className="border-red-200 text-red-700 hover:bg-red-50"
                        >
                          Mark as failed
                        </Button>
                      </div>
                      {failReasonFor === payout.id && (
                        <div className="flex gap-2 items-center mt-1">
                          <input
                            type="text"
                            value={failReason}
                            onChange={(e) => setFailReason(e.target.value)}
                            placeholder="Why it failed"
                            aria-label="Why the payout failed"
                            className="nuray-input text-sm"
                          />
                          <Button variant="destructive" onClick={() => handleFail(payout.id)} disabled={processingId === payout.id}>
                            Confirm
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {statementFor && <PayoutStatement basePath="/admin/payouts" payoutId={statementFor} onClose={() => setStatementFor(null)} />}
    </AdminShell>
  );
}
