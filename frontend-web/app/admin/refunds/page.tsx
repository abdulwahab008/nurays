'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { UserLayout } from '@/components/layout/UserLayout';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { apiClient, apiErrorMessage } from '@/lib/api-client';
import { formatPrice, formatDateTime } from '@/lib/utils';

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
    } catch (error) {
      showToast(apiErrorMessage(error, 'Failed to load refunds'), 'error');
    } finally {
      setLoading(false);
    }
  }, [tab, page, showToast]);

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
    <UserLayout showSidebar={true} showNavbar={true}>
      <div className="max-w-5xl mx-auto space-y-5">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Refunds</h1>
          <p className="text-gray-600 mt-1">Money owed back to customers that has to be sent by hand. Wallet refunds happen instantly and don&apos;t appear here.</p>
        </div>

        <div className="inline-flex rounded-xl border border-gray-200 bg-white p-1">
          {TABS.map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setTab(id);
                setPage(1);
              }}
              className={`px-4 py-2 rounded-lg text-sm font-semibold ${tab === id ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
            >
              {label}
            </button>
          ))}
        </div>

        {loading && rows.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-lg p-10 text-center text-gray-500">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-lg p-10 text-center text-gray-500">
            {tab === 'pending' ? 'Nothing to send. All refunds are settled.' : 'Nothing here yet.'}
          </div>
        ) : (
          <div className="space-y-3" data-testid="refunds-list">
            {rows.map((r) => (
              <div key={r.id} className="bg-white border border-gray-200 rounded-lg p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-2xl font-bold text-gray-900">{formatPrice(r.amount)}</p>
                    <p className="text-sm text-gray-600 mt-1">
                      <Link href={`/admin/orders/${r.orderId}`} className="underline font-medium">
                        Order #{r.order.orderNumber}
                      </Link>{' '}
                      · paid by {METHOD_LABEL[r.order.paymentMethod] ?? r.order.paymentMethod} · {formatDateTime(r.createdAt)}
                    </p>
                    {r.reason && <p className="text-sm text-gray-500 mt-1">Why: {r.reason}</p>}
                  </div>
                  <div className="text-sm text-end">
                    <p className="font-semibold text-gray-900">{r.customer?.name || 'Customer'}</p>
                    <p className="text-gray-600">{r.customer?.phone}</p>
                    {r.customer?.email && <p className="text-gray-500 text-xs">{r.customer.email}</p>}
                  </div>
                </div>
                {(r.order.paymentSenderAccount || r.order.paymentReferenceNumber) && (
                  <p className="mt-3 text-xs text-gray-600 bg-gray-50 rounded-lg px-3 py-2">
                    They paid {r.order.paymentSenderAccount ? `from ${r.order.paymentSenderAccount}` : ''}
                    {r.order.paymentReferenceNumber ? ` (reference ${r.order.paymentReferenceNumber})` : ''}: send the refund back to the same account.
                  </p>
                )}
                {r.status !== 'pending' ? (
                  <p className="mt-3 text-sm text-gray-600">
                    {r.status === 'completed' ? 'Sent' : 'Dismissed'} {r.processedAt ? formatDateTime(r.processedAt) : ''}
                    {r.reference ? ` · ${r.status === 'completed' ? 'Ref' : 'Reason'}: ${r.reference}` : ''}
                  </p>
                ) : acting?.id === r.id ? (
                  <div className="mt-4 flex flex-wrap gap-2 items-center">
                    <input
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      placeholder={acting.kind === 'complete' ? 'Transaction ID / reference' : 'Why is this refund not owed?'}
                      className="flex-1 min-w-[240px] px-3 py-2 rounded-lg border border-gray-200 text-sm"
                      autoFocus
                    />
                    <Button disabled={busy || (acting.kind === 'dismiss' && text.trim().length < 5)} onClick={submit} className={acting.kind === 'complete' ? 'bg-green-600 hover:bg-green-700 text-white' : ''} variant={acting.kind === 'complete' ? 'default' : 'destructive'}>
                      {busy ? 'Saving…' : acting.kind === 'complete' ? 'Record as sent' : 'Dismiss refund'}
                    </Button>
                    <Button variant="outline" onClick={() => { setActing(null); setText(''); }}>
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <div className="mt-4 flex gap-2">
                    <Button onClick={() => { setActing({ id: r.id, kind: 'complete' }); setText(''); }} className="bg-green-600 hover:bg-green-700 text-white" size="sm">
                      I&apos;ve sent it
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => { setActing({ id: r.id, kind: 'dismiss' }); setText(''); }}>
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
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              Previous
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
              Next
            </Button>
          </div>
        )}
      </div>
    </UserLayout>
  );
}
