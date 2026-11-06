'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { AdminShell } from '@/components/layout/AdminShell';
import { Figure, LoadingLine, PageHeader, PhoneText, StatusPill } from '@/components/admin/AdminListParts';
import { AdminFilterTabs } from '@/components/admin/AdminFilterTabs';
import { LoadError } from '@/components/ui/LoadError';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useDialogs } from '@/components/ui/Dialogs';
import { apiClient, apiErrorMessage } from '@/lib/api-client';
import { formatPrice } from '@/lib/utils';
import { formatDateTime } from '@/components/admin/admin-dates';
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
    communityId?: string | null;
  };
  entries: RiderLedgerEntry[];
  pagination: { page: number; totalPages: number; total: number };
}

type MoneyForm = 'settle' | 'payout' | 'adjust';

const STANDING_LABEL: Record<string, string> = { active: 'Active', suspended: 'Suspended', inactive: 'Inactive' };

const toAmount = (v: string) => (v.trim() === '' ? 0 : Number(v));
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Settling up with one rider: the cash they hand in, pay they keep or are sent, corrections, their cash limit. */
export default function AdminRiderMoneyPage() {
  const params = useParams();
  const riderId = params.id as string;
  const { showToast } = useToast();
  const { confirm: confirmDialog } = useDialogs();
  const [data, setData] = useState<RiderMoneyDetail | null>(null);
  const [entries, setEntries] = useState<RiderLedgerEntry[]>([]);
  const [page, setPage] = useState(1);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadErrorRaw, setLoadErrorRaw] = useState<unknown>(null);
  const [form, setForm] = useState<MoneyForm | null>(null);
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
  const [communities, setCommunities] = useState<Array<{ id: string; name: string }>>([]);
  const [communityId, setCommunityId] = useState('');

  const load = useCallback(async () => {
    try {
      setLoadError(null);
      const res = await apiClient.get(`/admin/riders/${riderId}/money`);
      const d: RiderMoneyDetail = res.data.data;
      setData(d);
      setEntries(d.entries);
      setPage(1);
      setLimit(d.rider.cashLimitIsDefault ? '' : String(d.cashLimit));
      setCommunityId(d.rider.communityId ?? '');
    } catch (error) {
      setLoadErrorRaw(error);
      setLoadError(apiErrorMessage(error, "We couldn't load this rider"));
    }
  }, [riderId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    apiClient
      .get('/admin/communities')
      .then((res) => setCommunities((res.data.data ?? []).map((c: { id: string; name: string }) => ({ id: c.id, name: c.name }))))
      .catch(() => {});
  }, []);

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
      <AdminShell>
        <div className="max-w-5xl">
          <PageHeader title="Rider" back={{ href: '/admin/riders', label: 'All riders' }} />
          <LoadError error={loadErrorRaw} onRetry={load} title={loadError} />
        </div>
      </AdminShell>
    );
  }

  if (!data) {
    return (
      <AdminShell>
        <LoadingLine text="Loading the rider" />
      </AdminShell>
    );
  }

  const { rider } = data;

  const changeStanding = async (status: 'active' | 'suspended') => {
    if (status === 'suspended' && !(await confirmDialog({ title: 'Suspend this rider?', message: 'Suspend this rider? Jobs they have not picked up go back to the pool, and they cannot take new ones.', confirmText: 'Suspend', variant: 'warning' }))) return;
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

  const shownForm: MoneyForm = form ?? (data.cashHeld > 0 ? 'settle' : data.balance > 0 ? 'payout' : 'settle');
  const cashOverLimit = data.cashHeld >= data.cashLimit && data.cashHeld > 0;
  const field = 'nuray-input mt-1 w-full text-sm';
  const fieldLabel = 'block text-sm font-medium text-ink';

  return (
    <AdminShell>
      <div className="max-w-5xl pb-16">
        <PageHeader
          back={{ href: '/admin/riders', label: 'All riders' }}
          title={rider.name || 'Name not set'}
          badges={
            <>
              <StatusPill tone={rider.status === 'active' ? 'good' : 'problem'}>{STANDING_LABEL[rider.status] ?? rider.status}</StatusPill>
              {rider.isAvailable && rider.status === 'active' && <StatusPill tone="good">On duty</StatusPill>}
            </>
          }
          subtitle={
            <>
              {[
                rider.city,
                [rider.vehicleType ? rider.vehicleType.charAt(0).toUpperCase() + rider.vehicleType.slice(1) : null, rider.vehicleNumber].filter(Boolean).join(' '),
                `${rider.totalDeliveries} ${rider.totalDeliveries === 1 ? 'delivery' : 'deliveries'}`,
                rider.ratingAverage > 0 ? `${rider.ratingAverage.toFixed(1)} stars` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
              <span className="block">
                <PhoneText phone={rider.phone} />
              </span>
            </>
          }
          actions={
            rider.verificationStatus === 'approved' && (
              <Button
                variant="outline"
                disabled={busy !== null}
                onClick={() => changeStanding(rider.status === 'active' ? 'suspended' : 'active')}
                className={rider.status === 'active' ? 'text-red-700' : ''}
              >
                {rider.status === 'active' ? 'Suspend rider' : 'Reactivate rider'}
              </Button>
            )
          }
        />

        <div className="grid grid-cols-2 gap-x-6 gap-y-5 lg:grid-cols-4">
          <div>
            <p className="text-sm text-muted">Cash in hand</p>
            <p className={`mt-0.5 text-2xl font-semibold tabular-nums ${cashOverLimit ? 'text-red-700' : 'text-ink'}`} data-testid="admin-rider-cash">
              {formatPrice(data.cashHeld)}
            </p>
            <p className={`mt-0.5 text-xs ${cashOverLimit ? 'text-red-700' : 'text-muted'}`}>{cashOverLimit ? 'At the limit: no cash orders' : `Limit ${formatPrice(data.cashLimit)}`}</p>
          </div>
          <div>
            <p className="text-sm text-muted">{data.balance >= 0 ? 'Nuray owes the rider' : 'Rider owes Nuray'}</p>
            <p className="mt-0.5 text-2xl font-semibold text-ink tabular-nums" data-testid="admin-rider-balance">
              {formatPrice(Math.abs(data.balance))}
            </p>
            <p className="mt-0.5 text-xs text-muted">Pay earned, less cash held and payouts</p>
          </div>
          <Figure label="Unpaid pay" value={formatPrice(Math.max(0, data.unpaid))} sub="Earned and not yet paid" />
          <Figure
            label="Earned this week"
            value={formatPrice(data.earnedThisWeek)}
            sub={`Today ${formatPrice(data.earnedToday)} · ${data.deliveriesThisWeek} ${data.deliveriesThisWeek === 1 ? 'delivery' : 'deliveries'}`}
          />
        </div>

        <section aria-label="Record money" className="mt-8 rounded-2xl border border-line bg-surface p-4 shadow-[var(--shadow-card)] sm:p-5">
          <AdminFilterTabs
            label="What to record"
            value={shownForm}
            onChange={setForm}
            tabs={[
              { id: 'settle', label: 'Settle up' },
              { id: 'payout', label: 'Pay by transfer' },
              { id: 'adjust', label: 'Correction' },
            ]}
            className="mb-4"
          />

          {shownForm === 'settle' && (
            <div className="space-y-3">
              <p className="text-sm text-muted">
                Count the cash the rider hands in at a hub. They can keep up to their unpaid pay from it; that part is recorded as a payout.
              </p>
              {data.cashHeld > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  className="px-0"
                  onClick={() => {
                    setKept(suggestedKeep ? String(suggestedKeep) : '');
                    setHandedIn(String(round2(data.cashHeld - suggestedKeep)));
                  }}
                >
                  Fill in a full settle-up: keeps {formatPrice(suggestedKeep)}, hands in {formatPrice(round2(data.cashHeld - suggestedKeep))}
                </Button>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <label className={fieldLabel}>
                  Cash handed in (Rs)
                  <input type="number" inputMode="decimal" min={0} step="0.01" value={handedIn} onChange={(e) => setHandedIn(e.target.value)} className={field} data-testid="settle-handed-in" />
                </label>
                <label className={fieldLabel}>
                  Pay kept from the cash (Rs)
                  <input type="number" inputMode="decimal" min={0} step="0.01" value={kept} onChange={(e) => setKept(e.target.value)} className={field} data-testid="settle-kept" />
                </label>
                <label className={fieldLabel}>
                  Receipt or reference <span className="font-normal text-muted">(optional)</span>
                  <input value={settleRef} onChange={(e) => setSettleRef(e.target.value)} className={field} />
                </label>
                <label className={fieldLabel}>
                  Note <span className="font-normal text-muted">(optional)</span>
                  <input value={settleNote} onChange={(e) => setSettleNote(e.target.value)} placeholder="Which hub, for example" className={field} />
                </label>
              </div>
              {settleTotal > 0 && (
                <p className={`text-sm ${settleValid ? 'text-muted' : 'text-red-700'}`} role="status">
                  {settleValid
                    ? `After this: cash in hand ${formatPrice(cashAfter)}, ${balanceAfter >= 0 ? 'Nuray owes the rider' : 'the rider owes Nuray'} ${formatPrice(Math.abs(balanceAfter))}.`
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
                data-testid="settle-submit"
              >
                {busy === 'settle' ? 'Recording…' : 'Record settlement'}
              </Button>
            </div>
          )}

          {shownForm === 'payout' && (
            <div className="space-y-3">
              <p className="text-sm text-muted">
                {data.balance > 0 ? `Nuray owes this rider ${formatPrice(data.balance)}.` : 'Nuray owes this rider nothing right now.'} Record a bank, JazzCash or
                EasyPaisa transfer after sending it.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className={fieldLabel}>
                  Amount sent (Rs)
                  <input type="number" inputMode="decimal" min={0} step="0.01" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} className={field} />
                </label>
                <label className={fieldLabel}>
                  Transaction id <span className="font-normal text-muted">(optional)</span>
                  <input value={payRef} onChange={(e) => setPayRef(e.target.value)} className={field} />
                </label>
              </div>
              {toAmount(payAmount) > data.balance + 0.009 && (
                <p className="text-sm text-red-700" role="status">
                  That is more than Nuray owes the rider ({formatPrice(Math.max(0, data.balance))}).
                </p>
              )}
              <Button
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
            </div>
          )}

          {shownForm === 'adjust' && (
            <div className="space-y-3">
              <p className="text-sm text-muted">
                A positive amount adds to what Nuray owes the rider, for example pay for a failed delivery that wasn&apos;t their fault. A negative one takes it away.
              </p>
              <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
                <label className={fieldLabel}>
                  Amount (Rs, + or −)
                  <input type="number" inputMode="decimal" step="0.01" value={adjAmount} onChange={(e) => setAdjAmount(e.target.value)} className={field} />
                </label>
                <label className={fieldLabel}>
                  What it&apos;s for
                  <input value={adjNote} onChange={(e) => setAdjNote(e.target.value)} className={field} />
                </label>
              </div>
              <Button
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
            </div>
          )}
        </section>

        <section aria-labelledby="assignment-heading" className="mt-8 border-t border-line pt-6">
          <h2 id="assignment-heading" className="mb-4 text-sm font-semibold text-ink">
            Jobs and cash
          </h2>
          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              <label htmlFor="rider-community" className={fieldLabel}>
                Community served
              </label>
              <p className="text-xs text-muted">New jobs in or from this community go to this rider first.</p>
              <div className="mt-1 flex gap-2">
                <select id="rider-community" value={communityId} onChange={(e) => setCommunityId(e.target.value)} className="nuray-input min-w-0 flex-1 text-sm" data-testid="admin-rider-community">
                  <option value="">No community (any job)</option>
                  {communities.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <Button
                  variant="outline"
                  disabled={busy !== null || communityId === (rider.communityId ?? '')}
                  onClick={() => submit('community', () => apiClient.patch(`/admin/riders/${riderId}/community`, { communityId: communityId || null }), 'Community updated', () => {})}
                >
                  {busy === 'community' ? 'Saving…' : 'Save'}
                </Button>
              </div>
            </div>
            <div>
              <label htmlFor="rider-cash-limit" className={fieldLabel}>
                Cash limit (Rs)
              </label>
              <p className="text-xs text-muted">
                Cash orders stop being offered at this much. {rider.cashLimitIsDefault ? 'Using the default.' : 'Set for this rider.'}
              </p>
              <div className="mt-1 flex gap-2">
                <input id="rider-cash-limit" type="number" inputMode="numeric" min={0} step="100" value={limit} onChange={(e) => setLimit(e.target.value)} placeholder={`Default (${formatPrice(data.cashLimit)})`} className="nuray-input min-w-0 flex-1 text-sm" />
                <Button
                  variant="outline"
                  disabled={busy !== null}
                  onClick={() =>
                    submit('limit', () => apiClient.patch(`/admin/riders/${riderId}/cash-limit`, { cashLimit: limit.trim() === '' ? null : Number(limit) }), 'Cash limit updated', () => {})
                  }
                >
                  {busy === 'limit' ? 'Saving…' : limit.trim() === '' ? 'Use default' : 'Save'}
                </Button>
              </div>
            </div>
          </div>
        </section>

        <section aria-labelledby="history-heading" className="mt-8 border-t border-line pt-6">
          <h2 id="history-heading" className="mb-2 text-sm font-semibold text-ink">
            History
          </h2>
          {entries.length === 0 ? (
            <p className="text-sm text-muted">Nothing yet. Cash collected, pay earned and settlements show up here.</p>
          ) : (
            <ul className="divide-y divide-line border-y border-line" data-testid="admin-rider-ledger">
              {entries.map((e) => {
                const body = (
                  <>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-ink">{LEDGER_LABELS[e.type] ?? e.type}</p>
                      <p className="text-xs text-muted break-words">
                        {formatDateTime(e.createdAt)}
                        {e.note ? ` · ${e.note}` : ''}
                        {e.reference ? ` · Ref ${e.reference}` : ''}
                      </p>
                    </div>
                    <span className={`shrink-0 text-sm font-semibold tabular-nums ${e.amount > 0 ? 'text-brand-ink' : 'text-ink'}`}>
                      {e.amount > 0 ? '+' : '−'}
                      {formatPrice(Math.abs(e.amount))}
                    </span>
                  </>
                );
                return (
                  <li key={e.id}>
                    {e.orderId ? (
                      <Link href={`/admin/orders/${e.orderId}`} className="flex min-h-14 items-center gap-3 py-2.5 hover:bg-page">
                        {body}
                        <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-muted rtl:rotate-180" />
                      </Link>
                    ) : (
                      <div className="flex min-h-14 items-center gap-3 py-2.5">{body}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {page < data.pagination.totalPages && (
            <Button variant="outline" onClick={loadMore} className="mt-4">
              Show older
            </Button>
          )}
        </section>
      </div>
    </AdminShell>
  );
}
