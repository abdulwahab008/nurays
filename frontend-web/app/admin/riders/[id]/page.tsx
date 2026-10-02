'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { UserLayout } from '@/components/layout/UserLayout';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { apiClient, apiErrorMessage } from '@/lib/api-client';
import { formatPrice, formatDateTime } from '@/lib/utils';
import { LEDGER_LABELS, RiderLedgerEntry, RiderMoneySummary } from '@/lib/services/rider.service';

interface RiderMoneyDetail extends RiderMoneySummary {
  rider: {
    id: string;
    name: string | null;
    phone: string | null;
    email: string | null;
    city: string;
    vehicleType: string | null;
    vehicleNumber: string | null;
    status: string;
    verificationStatus: string;
    isAvailable: boolean;
    totalDeliveries: number;
    ratingAverage: number;
    cashLimitIsDefault: boolean;
  };
  entries: RiderLedgerEntry[];
  pagination: { page: number; totalPages: number; total: number };
}

const toAmount = (v: string) => (v.trim() === '' ? 0 : Number(v));
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Settling up with one rider: the cash they hand in, pay they keep or are sent, corrections, their cash limit. */
export default function AdminRiderMoneyPage() {
  const params = useParams();
  const riderId = params.id as string;
  const { showToast } = useToast();
  const [data, setData] = useState<RiderMoneyDetail | null>(null);
  const [entries, setEntries] = useState<RiderLedgerEntry[]>([]);
  const [page, setPage] = useState(1);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [handedIn, setHandedIn] = useState('');
  const [kept, setKept] = useState('');
  const [settleRef, setSettleRef] = useState('');
  const [settleNote, setSettleNote] = useState('');
  const [payAmount, setPayAmount] = useState('');
  const [payRef, setPayRef] = useState('');
  const [adjAmount, setAdjAmount] = useState('');
  const [adjNote, setAdjNote] = useState('');
  const [limit, setLimit] = useState('');

  const load = useCallback(async () => {
    try {
      setLoadError(null);
      const res = await apiClient.get(`/admin/riders/${riderId}/money`);
      const d: RiderMoneyDetail = res.data.data;
      setData(d);
      setEntries(d.entries);
      setPage(1);
      setLimit(d.rider.cashLimitIsDefault ? '' : String(d.cashLimit));
    } catch (error) {
      setLoadError(apiErrorMessage(error, 'Failed to load this rider'));
    }
  }, [riderId]);

  useEffect(() => {
    load();
  }, [load]);

  const loadMore = async () => {
    try {
      const res = await apiClient.get(`/admin/riders/${riderId}/money`, { params: { page: page + 1 } });
      setEntries((prev) => [...prev, ...res.data.data.entries]);
      setPage(page + 1);
    } catch {
      showToast('Could not load older entries', 'error');
    }
  };

  const submit = async (key: string, action: () => Promise<unknown>, success: string, reset: () => void) => {
    try {
      setBusy(key);
      await action();
      showToast(success, 'success');
      reset();
      await load();
    } catch (error) {
      showToast(apiErrorMessage(error, 'That did not go through'), 'error');
    } finally {
      setBusy(null);
    }
  };

  if (loadError) {
    return (
      <UserLayout showSidebar={true} showNavbar={true}>
        <div className="max-w-3xl mx-auto bg-white border border-red-200 rounded-lg p-8 text-center">
          <p className="text-red-700 font-semibold">{loadError}</p>
          <Link href="/admin/riders" className="text-sm text-gray-600 underline mt-3 inline-block">
            Back to riders
          </Link>
        </div>
      </UserLayout>
    );
  }

  if (!data) {
    return (
      <UserLayout showSidebar={true} showNavbar={true}>
        <div className="max-w-5xl mx-auto py-16 text-center text-gray-500">Loading rider…</div>
      </UserLayout>
    );
  }

  const { rider } = data;

  const changeStanding = async (status: 'active' | 'suspended') => {
    if (status === 'suspended' && !window.confirm('Suspend this rider? Jobs they have not picked up go back to the pool, and they cannot take new ones.')) return;
    try {
      setBusy('standing');
      const res = await apiClient.post(`/admin/riders/${riderId}/status`, { status });
      const withFood: Array<{ orderId: string }> = res.data.data.jobsWithFood ?? [];
      showToast(
        status === 'suspended'
          ? `Rider suspended${res.data.data.releasedJobs?.length ? `; ${res.data.data.releasedJobs.length} job(s) back in the pool` : ''}${withFood.length ? `. ${withFood.length} delivery still has food on board: resolve it from the order.` : ''}`
          : 'Rider reactivated',
        withFood.length ? 'warning' : 'success'
      );
      await load();
    } catch (error) {
      showToast(apiErrorMessage(error, 'That did not go through'), 'error');
    } finally {
      setBusy(null);
    }
  };
  const suggestedKeep = round2(Math.max(0, Math.min(data.cashHeld, data.unpaid)));
  const settleTotal = round2(toAmount(handedIn) + toAmount(kept));
  const settleValid =
    Number.isFinite(settleTotal) && settleTotal > 0 && toAmount(handedIn) >= 0 && toAmount(kept) >= 0 && settleTotal <= data.cashHeld + 0.009 && toAmount(kept) <= Math.max(0, data.unpaid) + 0.009;
  const cashAfter = round2(data.cashHeld - settleTotal);
  const balanceAfter = round2(data.balance + toAmount(handedIn));
  const payValid = toAmount(payAmount) > 0 && toAmount(payAmount) <= data.balance + 0.009;
  const adjValid = Number.isFinite(toAmount(adjAmount)) && toAmount(adjAmount) !== 0 && adjNote.trim().length > 0;

  return (
    <UserLayout showSidebar={true} showNavbar={true}>
      <div className="max-w-5xl mx-auto space-y-5 pb-16">
        <div>
          <Link href="/admin/riders" className="text-sm text-gray-500 hover:underline">
            ← Riders
          </Link>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-bold text-gray-900">{rider.name || 'Name not set'}</h1>
            <span className={`px-2 py-1 rounded text-xs font-semibold ${rider.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
              {rider.status}
            </span>
            {rider.isAvailable && rider.status === 'active' && <span className="px-2 py-1 rounded text-xs font-semibold bg-blue-100 text-blue-800">On duty</span>}
            {rider.verificationStatus === 'approved' && (
              <Button
                variant="outline"
                size="sm"
                disabled={busy !== null}
                onClick={() => changeStanding(rider.status === 'active' ? 'suspended' : 'active')}
                className={rider.status === 'active' ? 'border-red-200 text-red-700' : ''}
              >
                {rider.status === 'active' ? 'Suspend rider' : 'Reactivate rider'}
              </Button>
            )}
          </div>
          <p className="text-sm text-gray-600 mt-1">
            {rider.phone || '—'} · {rider.city}
            {rider.vehicleType ? ` · ${rider.vehicleType}` : ''}
            {rider.vehicleNumber ? ` ${rider.vehicleNumber}` : ''} · {rider.totalDeliveries} {rider.totalDeliveries === 1 ? 'delivery' : 'deliveries'}
            {rider.ratingAverage > 0 ? ` · ★ ${rider.ratingAverage.toFixed(1)}` : ''}
          </p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Stat label="Cash in hand" value={formatPrice(data.cashHeld)} hint={`Limit ${formatPrice(data.cashLimit)}`} tone={data.cashHeld >= data.cashLimit && data.cashHeld > 0 ? 'red' : undefined} testId="admin-rider-cash" />
          <Stat
            label={data.balance >= 0 ? 'Nuray owes rider' : 'Rider owes Nuray'}
            value={formatPrice(Math.abs(data.balance))}
            hint="Pay earned, less cash held and payouts"
            testId="admin-rider-balance"
          />
          <Stat label="Unpaid pay" value={formatPrice(Math.max(0, data.unpaid))} hint="Earned and not yet paid" />
          <Stat label="Earned this week" value={formatPrice(data.earnedThisWeek)} hint={`Today ${formatPrice(data.earnedToday)} · ${data.deliveriesThisWeek} ${data.deliveriesThisWeek === 1 ? 'delivery' : 'deliveries'}`} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <section className="bg-white border border-gray-200 rounded-lg p-5 space-y-3">
            <h2 className="font-bold text-gray-900">Settle up (cash handed in at a hub)</h2>
            <p className="text-xs text-gray-500">
              Count the cash the rider hands over. They can keep up to their unpaid pay from the cash they hold; that is recorded
              as a payout.
            </p>
            {data.cashHeld > 0 && (
              <button
                type="button"
                className="text-xs font-semibold text-green-700 hover:underline"
                onClick={() => {
                  setKept(suggestedKeep ? String(suggestedKeep) : '');
                  setHandedIn(String(round2(data.cashHeld - suggestedKeep)));
                }}
              >
                Fill in a full settle-up (keeps {formatPrice(suggestedKeep)}, hands in {formatPrice(round2(data.cashHeld - suggestedKeep))})
              </button>
            )}
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs font-semibold text-gray-700">
                Cash handed in (Rs)
                <input type="number" min={0} step="0.01" value={handedIn} onChange={(e) => setHandedIn(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-200 text-sm" data-testid="settle-handed-in" />
              </label>
              <label className="text-xs font-semibold text-gray-700">
                Pay kept from cash (Rs)
                <input type="number" min={0} step="0.01" value={kept} onChange={(e) => setKept(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-200 text-sm" data-testid="settle-kept" />
              </label>
            </div>
            <input value={settleRef} onChange={(e) => setSettleRef(e.target.value)} placeholder="Receipt / reference (optional)" className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm" />
            <input value={settleNote} onChange={(e) => setSettleNote(e.target.value)} placeholder="Note (optional), e.g. which hub" className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm" />
            {settleTotal > 0 && (
              <p className={`text-xs ${settleValid ? 'text-gray-600' : 'text-red-700'}`}>
                {settleValid
                  ? `After this: cash in hand ${formatPrice(cashAfter)}, ${balanceAfter >= 0 ? 'Nuray owes rider' : 'rider owes Nuray'} ${formatPrice(Math.abs(balanceAfter))}.`
                  : settleTotal > data.cashHeld
                    ? `The rider only holds ${formatPrice(data.cashHeld)}.`
                    : `The rider can keep at most ${formatPrice(Math.max(0, data.unpaid))} of pay.`}
              </p>
            )}
            <Button
              disabled={!settleValid || busy !== null}
              onClick={() =>
                submit(
                  'settle',
                  () =>
                    apiClient.post(`/admin/riders/${riderId}/settlements`, {
                      cashHandedIn: toAmount(handedIn),
                      keptAsPay: toAmount(kept),
                      reference: settleRef || undefined,
                      note: settleNote || undefined,
                    }),
                  'Settlement recorded',
                  () => {
                    setHandedIn('');
                    setKept('');
                    setSettleRef('');
                    setSettleNote('');
                  }
                )
              }
              className="bg-green-600 hover:bg-green-700 text-white"
              data-testid="settle-submit"
            >
              {busy === 'settle' ? 'Recording…' : 'Record settlement'}
            </Button>
          </section>

          <div className="space-y-5">
            <section className="bg-white border border-gray-200 rounded-lg p-5 space-y-3">
              <h2 className="font-bold text-gray-900">Pay the rider by transfer</h2>
              <p className="text-xs text-gray-500">
                {data.balance > 0 ? `Nuray owes this rider ${formatPrice(data.balance)}.` : 'Nuray owes this rider nothing right now.'} Record a bank,
                JazzCash or EasyPaisa transfer after sending it.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <input type="number" min={0} step="0.01" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} placeholder="Amount (Rs)" className="px-3 py-2 rounded-lg border border-gray-200 text-sm" />
                <input value={payRef} onChange={(e) => setPayRef(e.target.value)} placeholder="Transaction ID" className="px-3 py-2 rounded-lg border border-gray-200 text-sm" />
              </div>
              <Button
                variant="outline"
                disabled={!payValid || busy !== null}
                onClick={() =>
                  submit(
                    'payout',
                    () => apiClient.post(`/admin/riders/${riderId}/payouts`, { amount: toAmount(payAmount), reference: payRef || undefined }),
                    'Payout recorded',
                    () => {
                      setPayAmount('');
                      setPayRef('');
                    }
                  )
                }
              >
                {busy === 'payout' ? 'Recording…' : 'Record payout'}
              </Button>
            </section>

            <section className="bg-white border border-gray-200 rounded-lg p-5 space-y-3">
              <h2 className="font-bold text-gray-900">Correction</h2>
              <p className="text-xs text-gray-500">Positive adds to what Nuray owes the rider (e.g. pay for a failed delivery that wasn&apos;t their fault); negative takes away.</p>
              <div className="grid grid-cols-3 gap-3">
                <input type="number" step="0.01" value={adjAmount} onChange={(e) => setAdjAmount(e.target.value)} placeholder="± Rs" className="px-3 py-2 rounded-lg border border-gray-200 text-sm" />
                <input value={adjNote} onChange={(e) => setAdjNote(e.target.value)} placeholder="What it's for (required)" className="col-span-2 px-3 py-2 rounded-lg border border-gray-200 text-sm" />
              </div>
              <Button
                variant="outline"
                disabled={!adjValid || busy !== null}
                onClick={() =>
                  submit(
                    'adjust',
                    () => apiClient.post(`/admin/riders/${riderId}/adjustments`, { amount: toAmount(adjAmount), note: adjNote }),
                    'Correction recorded',
                    () => {
                      setAdjAmount('');
                      setAdjNote('');
                    }
                  )
                }
              >
                {busy === 'adjust' ? 'Recording…' : 'Record correction'}
              </Button>
            </section>

            <section className="bg-white border border-gray-200 rounded-lg p-5 space-y-3">
              <h2 className="font-bold text-gray-900">Cash limit</h2>
              <p className="text-xs text-gray-500">
                Cash orders stop being offered once the rider holds this much. {rider.cashLimitIsDefault ? 'Using the default.' : 'Custom for this rider.'}
              </p>
              <div className="flex gap-2">
                <input type="number" min={0} step="100" value={limit} onChange={(e) => setLimit(e.target.value)} placeholder={`Default (${formatPrice(data.cashLimit)})`} className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm" />
                <Button
                  variant="outline"
                  disabled={busy !== null}
                  onClick={() =>
                    submit(
                      'limit',
                      () => apiClient.patch(`/admin/riders/${riderId}/cash-limit`, { cashLimit: limit.trim() === '' ? null : Number(limit) }),
                      'Cash limit updated',
                      () => {}
                    )
                  }
                >
                  {busy === 'limit' ? 'Saving…' : limit.trim() === '' ? 'Use default' : 'Save'}
                </Button>
              </div>
            </section>
          </div>
        </div>

        <section className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <h2 className="px-5 pt-5 font-bold text-gray-900">History</h2>
          {entries.length === 0 ? (
            <p className="px-5 py-8 text-sm text-gray-500">No entries yet.</p>
          ) : (
            <table className="w-full text-sm mt-3" data-testid="admin-rider-ledger">
              <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-5 py-2">When</th>
                  <th className="px-5 py-2">What</th>
                  <th className="px-5 py-2">Details</th>
                  <th className="px-5 py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {entries.map((e) => (
                  <tr key={e.id}>
                    <td className="px-5 py-2.5 text-xs text-gray-500 whitespace-nowrap">{formatDateTime(e.createdAt)}</td>
                    <td className="px-5 py-2.5 font-medium text-gray-900">{LEDGER_LABELS[e.type] ?? e.type}</td>
                    <td className="px-5 py-2.5 text-xs text-gray-600">
                      {e.note}
                      {e.reference ? ` · Ref ${e.reference}` : ''}
                      {e.orderId && (
                        <>
                          {' · '}
                          <Link href={`/admin/orders/${e.orderId}`} className="underline">
                            order
                          </Link>
                        </>
                      )}
                    </td>
                    <td className={`px-5 py-2.5 text-right font-semibold ${e.amount > 0 ? 'text-emerald-700' : 'text-gray-900'}`}>
                      {e.amount > 0 ? '+' : '−'}
                      {formatPrice(Math.abs(e.amount))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {page < data.pagination.totalPages && (
            <div className="p-4 text-center border-t border-gray-100">
              <button type="button" onClick={loadMore} className="text-sm font-semibold text-green-700 hover:underline">
                Show older
              </button>
            </div>
          )}
        </section>
      </div>
    </UserLayout>
  );
}

function Stat({ label, value, hint, tone, testId }: { label: string; value: string; hint?: string; tone?: 'red'; testId?: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${tone === 'red' ? 'text-red-700' : 'text-gray-900'}`} data-testid={testId}>
        {value}
      </p>
      {hint && <p className="text-xs text-gray-500 mt-1">{hint}</p>}
    </div>
  );
}
