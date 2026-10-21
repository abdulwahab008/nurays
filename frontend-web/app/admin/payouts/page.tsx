'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AdminShell } from '@/components/layout/AdminShell';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { LoadError } from '@/components/ui/LoadError';
import { useDialogs } from '@/components/ui/Dialogs';
import { useAuthStore } from '@/lib/store/auth-store';
import { apiClient, apiErrorMessage } from '@/lib/api-client';
import { formatPrice, formatDate } from '@/lib/utils';
import { useShallow } from 'zustand/react/shallow';
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
  const router = useRouter();
  const { isAuthenticated, user } = useAuthStore(useShallow((s) => ({ isAuthenticated: s.isAuthenticated, user: s.user })));
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

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/admin/login');
      return;
    }
    if (user?.user_type !== 'admin' && user?.userType !== 'admin') {
      router.push('/products');
      showToast('Access denied. Admin privileges required.', 'error');
      return;
    }
    loadPayouts();
    loadOwing();
  }, [isAuthenticated, user, router, filter]);

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
      pending: 'bg-amber-100 text-amber-800',
      completed: 'bg-green-100 text-green-800',
      failed: 'bg-red-100 text-red-800',
    };
    return map[status] || 'bg-gray-100 text-gray-800';
  };

  if (!isAuthenticated || (user?.user_type !== 'admin' && user?.userType !== 'admin')) {
    return null;
  }

  return (
    <AdminShell>
      <div className="max-w-7xl mx-auto">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Seller Payouts</h1>
            <p className="text-gray-600 mt-1">Review and process seller payout requests</p>
          </div>
          <Button variant="outline" onClick={loadPayouts} disabled={loading}>
            {loading ? 'Loading...' : 'Refresh'}
          </Button>
        </div>

        {/* Kitchens that owe Nuray */}
        {owingError ? (
          <div className="mb-6"><LoadError compact error={owingError} onRetry={loadOwing} title="We couldn't load the kitchens that owe Nuray" /></div>
        ) : owing.length > 0 ? (
          <div className="mb-6 bg-amber-50 border border-amber-200 rounded-lg p-4" data-testid="owing-kitchens">
            <h2 className="font-semibold text-gray-900">Kitchens that owe Nuray</h2>
            <p className="text-sm text-gray-700 mb-3">Commission on cash they collected themselves, after netting against their online earnings. After two weeks owing, their new cash orders pause until they pay.</p>
            <ul className="divide-y divide-amber-200">
              {owing.map((k) => (
                <li key={k.sellerId} className="flex flex-wrap items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900">{k.businessName} <span className="font-bold">{formatPrice(k.owed)}</span></p>
                    <p className="text-xs text-gray-700">
                      {k.owesSince ? `Owing since ${formatDate(k.owesSince)}` : ''}
                      {k.cashPaused ? ' · cash orders paused' : k.cashPausesAt ? ` · cash pauses ${formatDate(k.cashPausesAt)}` : ''}
                    </p>
                  </div>
                  <Button size="sm" variant="outline" disabled={recordingFor === k.sellerId} onClick={() => recordPayment(k)} data-testid="record-kitchen-payment">
                    {recordingFor === k.sellerId ? 'Saving…' : 'Record payment'}
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="flex gap-2 mb-6">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-colors ${
                filter === f ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading payouts...</p>
          </div>
        ) : loadError ? (
          <LoadError error={loadError} onRetry={loadPayouts} title="We couldn't load the payouts" />
        ) : payouts.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm p-12 text-center">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No {filter !== 'all' ? filter : ''} payouts</h3>
            <p className="text-gray-600">Nothing to show here right now.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {payouts.map((payout) => (
              <div key={payout.id} className="bg-white border border-gray-200 rounded-lg p-6">
                <div className="flex items-start justify-between flex-wrap gap-4">
                  <div className="flex-1 min-w-[240px]">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-semibold text-gray-900">{payout.seller.businessName}</h3>
                      <span className={`px-2 py-1 text-xs font-medium rounded ${statusColor(payout.status)}`}>
                        {payout.status}
                      </span>
                      {payout.automatic && <span className="px-2 py-1 text-xs font-medium rounded bg-blue-100 text-blue-800">weekly</span>}
                      {payout.payoutMethod === 'paid_to_nuray' && <span className="px-2 py-1 text-xs font-medium rounded bg-gray-100 text-gray-800">kitchen paid Nuray</span>}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                      <div><span className="text-gray-500">Requested:</span> <span className="font-medium">{formatPrice(payout.amount)}</span></div>
                      <div><span className="text-gray-500">Net payout:</span> <span className="font-medium">{formatPrice(payout.netAmount)}</span></div>
                      <div><span className="text-gray-500">Method:</span> <span className="font-medium capitalize">{payout.payoutMethod.replace('_', ' ')}</span></div>
                      <div><span className="text-gray-500">Account:</span> <span className="font-medium">{payout.accountDetails?.accountNumber || '—'}</span></div>
                      <div><span className="text-gray-500">Requested at:</span> <span className="font-medium">{formatDate(payout.requestedAt)}</span></div>
                      {payout.periodStart && payout.periodEnd && payout.payoutMethod !== 'paid_to_nuray' && (
                        <div><span className="text-gray-500">Covers:</span> <span className="font-medium">{payout.periodStart} to {payout.periodEnd}</span></div>
                      )}
                      {payout.processedAt && (
                        <div><span className="text-gray-500">Processed at:</span> <span className="font-medium">{formatDate(payout.processedAt)}</span></div>
                      )}
                      {payout.failedReason && (
                        <div className="md:col-span-2"><span className="text-gray-500">Failure reason:</span> <span className="font-medium text-red-600">{payout.failedReason}</span></div>
                      )}
                    </div>
                  </div>

                  {payout.payoutMethod !== 'paid_to_nuray' && (
                    <Button variant="outline" size="sm" onClick={() => setStatementFor(payout.id)} data-testid="open-statement">
                      Statement
                    </Button>
                  )}
                  {payout.status === 'pending' && (
                    <div className="flex flex-col gap-2 items-end">
                      <div className="flex gap-2">
                        <Button
                          onClick={() => handleComplete(payout)}
                          disabled={processingId === payout.id}
                          className="bg-green-600 hover:bg-green-700 text-white"
                        >
                          {processingId === payout.id ? 'Processing...' : 'Mark Completed'}
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => setFailReasonFor(failReasonFor === payout.id ? null : payout.id)}
                          disabled={processingId === payout.id}
                          className="border-red-300 text-red-600 hover:bg-red-50"
                        >
                          Mark Failed
                        </Button>
                      </div>
                      {failReasonFor === payout.id && (
                        <div className="flex gap-2 items-center mt-1">
                          <input
                            type="text"
                            value={failReason}
                            onChange={(e) => setFailReason(e.target.value)}
                            placeholder="Reason for failure"
                            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
                          />
                          <button
                            onClick={() => handleFail(payout.id)}
                            className="px-3 py-1.5 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700"
                          >
                            Confirm
                          </button>
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
