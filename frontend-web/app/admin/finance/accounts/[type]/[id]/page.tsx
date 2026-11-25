'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { DashboardLayout, adminSidebarFor } from '@/components/layout/DashboardShell';
import { LoadError } from '@/components/ui/LoadError';
import Link from 'next/link';
import { Figure, LoadingLine } from '@/components/admin/AdminListParts';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useAuthStore } from '@/lib/store/auth-store';
import { apiClient } from '@/lib/api-client';
import { formatPrice } from '@/lib/utils';
import { useShallow } from 'zustand/react/shallow';

interface Line { date: string; description: string; reference: string | null; debit: number; credit: number; balance: number }
interface Statement {
  party: { type: 'kitchen' | 'rider'; id: string; name: string };
  from: string | null;
  to: string | null;
  openingBalance: number;
  totalDebit: number;
  totalCredit: number;
  closingBalance: number;
  lines: Line[];
  awaitingRiderCash?: number;
  cashHeld?: number;
}

const signed = (n: number) => (n < 0 ? `−${formatPrice(-n)}` : formatPrice(n));

/** One kitchen's or rider's statement: opening balance, every debit and credit with the running balance, closing balance. */
export default function AccountStatementPage() {
  const params = useParams<{ type: string; id: string }>();
  const { isAuthenticated, user } = useAuthStore(useShallow((s) => ({ isAuthenticated: s.isAuthenticated, user: s.user })));
  const isAdmin = user?.user_type === 'admin' || user?.userType === 'admin';
  const { showToast } = useToast();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [statement, setStatement] = useState<Statement | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [downloading, setDownloading] = useState(false);
  const url = `/admin/finance/accounts/${params.type}/${params.id}`;
  const period = { ...(from ? { from } : {}), ...(to ? { to } : {}) };

  const load = useCallback(async () => {
    try {
      const res = await apiClient.get(url, { params: { ...(from ? { from } : {}), ...(to ? { to } : {}) } });
      setStatement(res.data.data);
      setError(null);
    } catch (err) {
      setError(err);
    }
  }, [url, from, to]);

  useEffect(() => {
    if (isAuthenticated && isAdmin) void load();
  }, [isAuthenticated, isAdmin, load]);

  const download = async () => {
    setDownloading(true);
    try {
      const res = await apiClient.get<Blob>(url, { params: { ...period, format: 'csv' }, responseType: 'blob' });
      const href = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = href;
      a.download = `nuray-${params.type}-statement-${from || 'start'}-to-${to || 'today'}.csv`;
      a.click();
      URL.revokeObjectURL(href);
    } catch {
      showToast("We couldn't download the statement. Please try again.", 'error');
    } finally {
      setDownloading(false);
    }
  };

  if (!isAuthenticated || !isAdmin) return null;

  return (
    <DashboardLayout title={statement?.party.name ?? 'Statement'} subtitle={params.type === 'rider' ? 'Rider account' : 'Kitchen account'} sidebarItems={adminSidebarFor(user?.permissions)} userType="admin">
      <div className="max-w-5xl space-y-6">
        <Link href="/admin/finance/accounts" className="inline-flex min-h-11 items-center text-sm font-semibold text-brand-ink hover:underline">← All accounts</Link>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm text-muted">
            From
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1 block min-h-11 rounded-xl border border-line bg-surface px-3 text-ink" />
          </label>
          <label className="text-sm text-muted">
            To
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="mt-1 block min-h-11 rounded-xl border border-line bg-surface px-3 text-ink" />
          </label>
          <Button type="button" variant="outline" className="rounded-xl min-h-11" disabled={downloading || !statement} onClick={() => void download()}>
            {downloading ? 'Downloading…' : 'Download statement (CSV)'}
          </Button>
        </div>

        {error ? <LoadError compact error={error} onRetry={() => void load()} title="We couldn't load this statement" /> : null}
        {!statement ? (
          error ? null : <LoadingLine text="Building the statement" />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4" data-testid="statement-figures">
              <Figure label="Opening balance" value={signed(statement.openingBalance)} sub={statement.from ? `On ${statement.from}` : 'From the start'} />
              <Figure label="Debits" value={formatPrice(statement.totalDebit)} sub="Lower what Nuray owes" />
              <Figure label="Credits" value={formatPrice(statement.totalCredit)} sub="Raise what Nuray owes" />
              <Figure
                label="Closing balance"
                value={signed(statement.closingBalance)}
                sub={statement.closingBalance >= 0 ? 'Nuray owes them' : 'They owe Nuray'}
              />
            </div>
            {statement.awaitingRiderCash ? (
              <p className="text-sm text-muted">Not in the balance yet: {formatPrice(statement.awaitingRiderCash)} of this kitchen&apos;s share is cash a rider has not handed in.</p>
            ) : null}
            {statement.cashHeld ? <p className="text-sm text-muted">Cash in hand (part of the balance): {formatPrice(statement.cashHeld)}.</p> : null}

            {statement.lines.length === 0 ? (
              <p className="text-sm text-muted">No entries in this period.</p>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
                <table className="w-full text-sm" data-testid="statement-lines">
                  <thead>
                    <tr className="text-left text-xs text-muted">
                      <th className="px-4 py-2 font-medium">Date</th>
                      <th className="px-4 py-2 font-medium">Description</th>
                      <th className="px-4 py-2 font-medium">Reference</th>
                      <th className="px-4 py-2 font-medium text-right">Debit</th>
                      <th className="px-4 py-2 font-medium text-right">Credit</th>
                      <th className="px-4 py-2 font-medium text-right">Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {statement.lines.map((l, i) => (
                      <tr key={`${l.date}-${l.reference}-${i}`}>
                        <td className="px-4 py-3 whitespace-nowrap">{l.date}</td>
                        <td className="px-4 py-3 min-w-64">{l.description}</td>
                        <td className="px-4 py-3">{l.reference ?? '—'}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{l.debit ? formatPrice(l.debit) : ''}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{l.credit ? formatPrice(l.credit) : ''}</td>
                        <td className={`px-4 py-3 text-right tabular-nums font-medium ${l.balance < 0 ? 'text-red-700' : 'text-ink'}`}>{signed(l.balance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
