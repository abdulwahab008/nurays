'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AdminShell } from '@/components/layout/AdminShell';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { LoadError } from '@/components/ui/LoadError';
import { AdminFilterTabs } from '@/components/admin/AdminFilterTabs';
import { LoadingLine, PageHeader } from '@/components/admin/AdminListParts';
import { apiClient, apiErrorMessage } from '@/lib/api-client';
import { formatPrice } from '@/lib/utils';
import { formatDateTime } from '@/components/admin/admin-dates';

interface RefundRow {
  id: string;
  orderId: string;
  amount: number;
  method: string;
  status: 'pending' | 'completed' | 'failed';
  reason: string | null;
  reference: string | null;
  processedAt: string | null;
  createdAt: string;
  order: { orderNumber: string; paymentMethod: string; totalAmount: number; paymentSenderAccount: string | null; paymentReferenceNumber: string | null };
  customer: { name: string | null; phone: string; email: string | null } | null;
}

const TABS = [
  ['pending', 'To send'],
  ['completed', 'Sent'],
  ['failed', 'Dismissed'],
] as const;

const METHOD_LABEL: Record<string, string> = {
  cod: 'Cash on delivery',
  wallet: 'Nuray Wallet',
  safepay: 'Online (Safepay)',
  card: 'Card',
  jazzcash: 'JazzCash transfer',
  easypaisa: 'EasyPaisa transfer',
  bank: 'Bank transfer',
};

/**
 * Refunds Nuray owes customers that have to be sent by hand (wallet refunds are instant).
 * Send the money, then record it with its transaction reference; or dismiss one that isn't owed.
 */
export default function AdminRefundsPage() {
  const { showToast } = useToast();
  const [tab, setTab] = useState<(typeof TABS)[number][0]>('pending');
  const [rows, setRows] = useState<RefundRow[]>([]);
  const [loading, setLoading] = useState(true);
  // Why the refunds could not be read; shown instead of "Nothing to send. All refunds are settled.", which would be untrue.
  const [loadError, setLoadError] = useState<unknown>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [acting, setActing] = useState<{ id: string; kind: 'complete' | 'dismiss' } | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiClient.get('/admin/refunds', { params: { status: tab, page: String(page) } });
      setRows(res.data.data.refunds);
      setTotalPages(res.data.data.pagination.totalPages || 1);
      setLoadError(null);
    } catch (error) {
      // The rows on the screen belong to the tab and page before this change, so they go with the failure.
      setRows([]);
      setLoadError(error);
    } finally {
      setLoading(false);
    }
  }, [tab, page]);

  useEffect(() => {
    load();
  }, [load]);

  const submit = async () => {
    if (!acting) return;
    try {
      setBusy(true);
      if (acting.kind === 'complete') {
        await apiClient.post(`/admin/refunds/${acting.id}/complete`, { reference: text.trim() || undefined });
        showToast('Refund recorded as sent', 'success');
      } else {
        await apiClient.post(`/admin/refunds/${acting.id}/dismiss`, { reason: text.trim() });
        showToast('Refund dismissed', 'success');
      }
      setActing(null);
      setText('');
      await load();
    } catch (error) {
      showToast(apiErrorMessage(error, 'That did not go through'), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminShell>
      <div className="max-w-5xl space-y-5">
        <PageHeader title="Refunds" subtitle="Money owed back to customers that has to be sent by hand. Wallet refunds happen instantly and don't appear here." />

        <AdminFilterTabs
          label="Refunds"
          value={tab}
          onChange={(id) => {
            setTab(id);
            setPage(1);
          }}
          tabs={TABS.map(([id, label]) => ({ id, label }))}
        />

        {loading && rows.length === 0 ? (
          <LoadingLine text="Loading refunds" />
        ) : loadError ? (
          <LoadError error={loadError} onRetry={load} title="We couldn't load the refunds" />
        ) : rows.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted">
            {tab === 'pending' ? 'Nothing to send. All refunds are settled.' : 'Nothing here yet.'}
          </div>
        ) : (
          <div className="space-y-3" data-testid="refunds-list">
            {rows.map((r) => (
              <div key={r.id} className="bg-surface border border-line rounded-2xl p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-2xl font-semibold text-ink tabular-nums"><bdi>{formatPrice(r.amount)}</bdi></p>
                    <p className="text-sm text-muted mt-1">
                      <Link href={`/admin/orders/${r.orderId}`} className="-my-3 inline-flex min-h-11 items-center text-brand-ink underline font-medium">
                        Order #{r.order.orderNumber}
                      </Link>{' '}
                      · paid by {METHOD_LABEL[r.order.paymentMethod] ?? r.order.paymentMethod} · <bdi>{formatDateTime(r.createdAt)}</bdi>
                    </p>
                    {r.reason && <p className="text-sm text-muted mt-1">Why: {r.reason}</p>}
                  </div>
                  <div className="text-sm min-w-0">
                    <p className="font-semibold text-ink">{r.customer?.name || 'Customer'}</p>
                    {r.customer?.phone && <p className="text-muted" data-ltr>{r.customer.phone}</p>}
                    {r.customer?.email && <p className="text-muted text-xs break-all">{r.customer.email}</p>}
                  </div>
                </div>
                {(r.order.paymentSenderAccount || r.order.paymentReferenceNumber) && (
                  <p className="mt-3 text-xs text-ink bg-raised rounded-lg px-3 py-2">
                    They paid {r.order.paymentSenderAccount ? `from ${r.order.paymentSenderAccount}` : ''}
                    {r.order.paymentReferenceNumber ? ` (reference ${r.order.paymentReferenceNumber})` : ''}: send the refund back to the same account.
                  </p>
                )}
                {r.status !== 'pending' ? (
                  <p className="mt-3 text-sm text-muted">
                    {r.status === 'completed' ? 'Sent' : 'Not owed'} {r.processedAt ? formatDateTime(r.processedAt) : ''}
                    {r.reference ? ` · ${r.status === 'completed' ? 'Ref' : 'Reason'}: ${r.reference}` : ''}
                  </p>
                ) : acting?.id === r.id ? (
                  <div className="mt-4 flex flex-wrap gap-2 items-center">
                    <input
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      placeholder={acting.kind === 'complete' ? 'Transaction ID / reference' : 'Why is this refund not owed?'}
                      className="nuray-input flex-1 min-w-0 basis-60 text-sm"
                      aria-label={acting.kind === 'complete' ? 'Transfer reference' : 'Why it is not owed'}
                      autoFocus
                    />
                    <Button disabled={busy || (acting.kind === 'dismiss' && text.trim().length < 5)} onClick={submit} variant={acting.kind === 'complete' ? 'default' : 'destructive'}>
                      {busy ? 'Saving…' : acting.kind === 'complete' ? 'Record as sent' : 'Dismiss refund'}
                    </Button>
                    <Button variant="outline" onClick={() => { setActing(null); setText(''); }}>
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <div className="mt-4 flex gap-2">
                    <Button onClick={() => { setActing({ id: r.id, kind: 'complete' }); setText(''); }}>
                      I&apos;ve sent it
                    </Button>
                    <Button variant="outline" onClick={() => { setActing({ id: r.id, kind: 'dismiss' }); setText(''); }}>
                      Not owed
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex justify-end gap-2">
            <Button variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              Previous
            </Button>
            <Button variant="outline" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
              Next
            </Button>
          </div>
        )}
      </div>
    </AdminShell>
  );
}
