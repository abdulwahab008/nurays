'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { DashboardLayout, adminSidebarFor } from '@/components/layout/DashboardShell';
import { LoadError } from '@/components/ui/LoadError';
import { LoadingLine, StatusPill } from '@/components/admin/AdminListParts';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useAuthStore } from '@/lib/store/auth-store';
import { apiClient, apiErrorMessage } from '@/lib/api-client';
import { formatPrice } from '@/lib/utils';
import { useShallow } from 'zustand/react/shallow';

type Status = 'pending' | 'approved' | 'rejected';
interface Deposit {
  id: string;
  rider: { id: string; name: string; cashHeld: number };
  amount: number;
  keptAsPay: number;
  method: 'bank_transfer' | 'jazzcash' | 'easypaisa';
  transactionRef: string;
  receipt: string | null;
  status: Status;
  rejectionReason: string | null;
  createdAt: string;
  reviewedAt: string | null;
}

const METHOD: Record<Deposit['method'], string> = { bank_transfer: 'Bank transfer', jazzcash: 'JazzCash', easypaisa: 'EasyPaisa' };
const when = (iso: string) => new Date(iso).toLocaleString('en-PK', { dateStyle: 'medium', timeStyle: 'short' });

/**
 * Riders' cash deposits to check: open the receipt, check the money arrived in Nuray's account (amount and transaction
 * ID), then approve (it is posted to the rider's account and releases the kitchens' share) or reject with a reason.
 */
export default function AdminDepositsPage() {
  const { isAuthenticated, user } = useAuthStore(useShallow((s) => ({ isAuthenticated: s.isAuthenticated, user: s.user })));
  const isAdmin = user?.user_type === 'admin' || user?.userType === 'admin';
  const canAct = !!user?.permissions?.includes('money.write');
  const { showToast } = useToast();
  const [status, setStatus] = useState<Status>('pending');
  const [deposits, setDeposits] = useState<Deposit[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await apiClient.get('/admin/rider-deposits', { params: { status } });
      setDeposits(res.data.data.deposits);
      setError(null);
    } catch (err) {
      setError(err);
    }
  }, [status]);

  useEffect(() => {
    if (isAuthenticated && isAdmin) void load();
  }, [isAuthenticated, isAdmin, load]);

  const act = async (id: string, action: 'approve' | 'reject') => {
    setBusy(id);
    try {
      await apiClient.post(`/admin/rider-deposits/${id}/${action}`, action === 'reject' ? { reason } : {});
      showToast(action === 'approve' ? 'Deposit approved and posted to the rider’s account.' : 'Deposit rejected; the rider has been told why.', 'success');
      setRejecting(null);
      setReason('');
      await load();
    } catch (err) {
      showToast(apiErrorMessage(err, 'That did not work. Please try again.'), 'error');
    } finally {
      setBusy(null);
    }
  };

  if (!isAuthenticated || !isAdmin) return null;

  return (
    <DashboardLayout title="Cash deposits" subtitle="Riders' cash deposits into Nuray's account, with their receipts" sidebarItems={adminSidebarFor(user?.permissions)} userType="admin">
      <div className="max-w-5xl space-y-6">
        <div role="tablist" aria-label="Deposits" className="flex gap-2 border-b border-line">
          {(['pending', 'approved', 'rejected'] as const).map((s) => (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={status === s}
              onClick={() => {
                setDeposits(null);
                setStatus(s);
              }}
              className={`min-h-11 px-3 text-sm font-semibold border-b-2 -mb-px ${status === s ? 'border-brand text-brand-ink' : 'border-transparent text-muted hover:text-ink'}`}
            >
              {s === 'pending' ? 'To check' : s === 'approved' ? 'Approved' : 'Rejected'}
            </button>
          ))}
        </div>

        {error ? <LoadError compact error={error} onRetry={() => void load()} title="We couldn't load the deposits" /> : null}
        {!deposits ? (
          error ? null : <LoadingLine text="Loading deposits" />
        ) : deposits.length === 0 ? (
          <p className="text-sm text-muted">{status === 'pending' ? 'Nothing to check. Deposits riders send appear here.' : 'None yet.'}</p>
        ) : (
          <ul className="space-y-3" data-testid="deposit-list">
            {deposits.map((d) => (
              <li key={d.id} className="rounded-2xl border border-line bg-surface p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-base font-semibold text-ink tabular-nums">{formatPrice(d.amount)} <span className="text-sm font-normal text-muted">by {METHOD[d.method]}</span></p>
                    <p className="text-sm text-ink">
                      <Link href={`/admin/finance/accounts/rider/${d.rider.id}`} className="font-medium text-brand-ink hover:underline">{d.rider.name}</Link>
                      <span className="text-muted"> · holds {formatPrice(d.rider.cashHeld)}</span>
                    </p>
                    <p className="text-sm text-muted">
                      Transaction ID <span className="font-medium text-ink" dir="ltr">{d.transactionRef}</span>
                      {d.keptAsPay > 0 ? ` · kept ${formatPrice(d.keptAsPay)} as pay` : ''}
                    </p>
                    <p className="text-xs text-muted">Sent {when(d.createdAt)}{d.reviewedAt ? ` · checked ${when(d.reviewedAt)}` : ''}</p>
                    {d.rejectionReason && <p className="text-sm text-red-700 mt-1">Rejected: {d.rejectionReason}</p>}
                  </div>
                  <div className="flex items-center gap-3">
                    {d.receipt && (
                      <a href={d.receipt} target="_blank" rel="noopener noreferrer" className="min-h-11 inline-flex items-center text-sm font-semibold text-brand-ink hover:underline">
                        Open receipt
                      </a>
                    )}
                    {d.status !== 'pending' && <StatusPill tone={d.status === 'approved' ? 'good' : 'problem'}>{d.status === 'approved' ? 'Approved' : 'Rejected'}</StatusPill>}
                  </div>
                </div>
                {d.status === 'pending' && canAct && (
                  rejecting === d.id ? (
                    <div className="mt-3 flex flex-wrap items-end gap-2">
                      <label className="flex-1 min-w-56 text-sm text-ink">
                        Why it is rejected (the rider sees this)
                        <input value={reason} onChange={(e) => setReason(e.target.value)} className="nuray-input mt-1 w-full" placeholder="No such transaction in the statement" />
                      </label>
                      <Button type="button" variant="outline" className="min-h-11 rounded-xl" onClick={() => setRejecting(null)}>Cancel</Button>
                      <Button type="button" className="min-h-11 rounded-xl bg-red-600 hover:bg-red-700 text-white" disabled={busy === d.id || reason.trim().length < 3} onClick={() => void act(d.id, 'reject')}>
                        Reject deposit
                      </Button>
                    </div>
                  ) : (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button type="button" className="min-h-11 rounded-xl" disabled={busy === d.id} onClick={() => void act(d.id, 'approve')}>
                        The money arrived: approve
                      </Button>
                      <Button type="button" variant="outline" className="min-h-11 rounded-xl" disabled={busy === d.id} onClick={() => setRejecting(d.id)}>
                        Reject
                      </Button>
                    </div>
                  )
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </DashboardLayout>
  );
}
