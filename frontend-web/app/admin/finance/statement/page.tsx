'use client';

import { useState } from 'react';
import Link from 'next/link';
import { DashboardLayout, adminSidebarFor } from '@/components/layout/DashboardShell';
import { Figure, StatusPill } from '@/components/admin/AdminListParts';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useAuthStore } from '@/lib/store/auth-store';
import { apiClient, apiErrorMessage } from '@/lib/api-client';
import { formatPrice } from '@/lib/utils';
import { useShallow } from 'zustand/react/shallow';

type Account = 'bank_transfer' | 'jazzcash' | 'easypaisa';
interface Line { row: number; date: string; description: string; amount: number }
interface NurayRecord { kind: string; id: string; date: string; amount: number; reference: string | null; label: string }
interface Result {
  from: string;
  to: string;
  matched: Array<{ line: Line; record: NurayRecord; by: 'reference' | 'amount_and_date' }>;
  amountDiffers: Array<{ line: Line; record: NurayRecord }>;
  unmatchedLines: Line[];
  unmatchedRecords: NurayRecord[];
}

const ACCOUNTS: Array<[Account, string]> = [['bank_transfer', 'Bank account'], ['jazzcash', 'JazzCash'], ['easypaisa', 'EasyPaisa']];
const signed = (n: number) => (n < 0 ? `−${formatPrice(-n)}` : `+${formatPrice(n)}`);

function Section({ title, tone, count, children }: { title: string; tone: 'good' | 'problem'; count: number; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold text-ink">
        {title} <StatusPill tone={count === 0 ? 'good' : tone}>{count}</StatusPill>
      </h2>
      {count > 0 && <div className="overflow-x-auto rounded-2xl border border-line bg-surface">{children}</div>}
    </section>
  );
}

const th = 'px-4 py-2 font-medium';
const td = 'px-4 py-3 align-top';

/** Match a Nuray account statement against the payouts, refunds and deposits Nuray recorded. */
export default function StatementMatchPage() {
  const { isAuthenticated, user } = useAuthStore(useShallow((s) => ({ isAuthenticated: s.isAuthenticated, user: s.user })));
  const isAdmin = user?.user_type === 'admin' || user?.userType === 'admin';
  const { showToast } = useToast();
  const [account, setAccount] = useState<Account>('bank_transfer');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  const run = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    try {
      const res = await apiClient.post('/admin/finance/statement-match', { account, csv: await file.text() });
      setResult(res.data.data);
    } catch (err) {
      showToast(apiErrorMessage(err, "We couldn't read that statement. Export it as CSV and try again."), 'error');
    } finally {
      setBusy(false);
    }
  };

  if (!isAuthenticated || !isAdmin) return null;

  return (
    <DashboardLayout title="Match a statement" subtitle="Check every line on a Nuray account statement against Nuray's records" sidebarItems={adminSidebarFor(user?.permissions)} userType="admin">
      <div className="max-w-5xl space-y-6">
        <Link href="/admin/finance/accounts" className="inline-flex min-h-11 items-center text-sm font-semibold text-brand-ink hover:underline">← Accounts</Link>

        <form onSubmit={(e) => void run(e)} className="flex flex-wrap items-end gap-3">
          <label className="text-sm text-muted">
            Account
            <select value={account} onChange={(e) => setAccount(e.target.value as Account)} className="mt-1 block min-h-11 rounded-xl border border-line bg-surface px-3 text-ink">
              {ACCOUNTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <label className="text-sm text-muted">
            Statement (CSV)
            <input type="file" accept=".csv,text/csv" required onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="mt-1 block min-h-11 text-ink file:me-3 file:min-h-11 file:rounded-xl file:border file:border-line file:bg-surface file:px-3" />
          </label>
          <Button type="submit" className="rounded-xl min-h-11" disabled={busy || !file}>{busy ? 'Matching…' : 'Match'}</Button>
        </form>
        <p className="text-xs text-muted">Export the statement from the bank or wallet as CSV. Lines are matched by the reference first, then by the same amount within three days. Nothing is saved.</p>

        {result && (
          <>
            <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4" data-testid="match-figures">
              <Figure label="Statement lines" value={String(result.matched.length + result.amountDiffers.length + result.unmatchedLines.length)} sub={`${result.from} to ${result.to}`} />
              <Figure label="Matched" value={String(result.matched.length)} sub="Lines that are a Nuray record" />
              <Figure label="Not in Nuray's records" value={String(result.unmatchedLines.length + result.amountDiffers.length)} sub="Lines to look at" />
              <Figure label="Not on the statement" value={String(result.unmatchedRecords.length)} sub="Records to look at" />
            </div>

            <Section title="Reference matches, amount differs" tone="problem" count={result.amountDiffers.length}>
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs text-muted"><th className={th}>Date</th><th className={th}>Statement line</th><th className={`${th} text-right`}>Statement</th><th className={th}>Nuray record</th><th className={`${th} text-right`}>Recorded</th></tr></thead>
                <tbody className="divide-y divide-line">
                  {result.amountDiffers.map(({ line, record }) => (
                    <tr key={line.row}><td className={td}>{line.date}</td><td className={td}>{line.description}</td><td className={`${td} text-right tabular-nums`}>{signed(line.amount)}</td><td className={td}>{record.label}</td><td className={`${td} text-right tabular-nums text-red-700`}>{signed(record.amount)}</td></tr>
                  ))}
                </tbody>
              </table>
            </Section>

            <Section title="On the statement, not in Nuray's records" tone="problem" count={result.unmatchedLines.length}>
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs text-muted"><th className={th}>Date</th><th className={th}>Statement line</th><th className={`${th} text-right`}>Amount</th></tr></thead>
                <tbody className="divide-y divide-line">
                  {result.unmatchedLines.map((l) => (
                    <tr key={l.row}><td className={td}>{l.date}</td><td className={td}>{l.description || `Row ${l.row}`}</td><td className={`${td} text-right tabular-nums`}>{signed(l.amount)}</td></tr>
                  ))}
                </tbody>
              </table>
            </Section>

            <Section title="In Nuray's records, not on the statement" tone="problem" count={result.unmatchedRecords.length}>
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs text-muted"><th className={th}>Date</th><th className={th}>Record</th><th className={th}>Reference</th><th className={`${th} text-right`}>Amount</th></tr></thead>
                <tbody className="divide-y divide-line">
                  {result.unmatchedRecords.map((r) => (
                    <tr key={r.id}><td className={td}>{r.date}</td><td className={td}>{r.label}</td><td className={td}>{r.reference ?? '—'}</td><td className={`${td} text-right tabular-nums`}>{signed(r.amount)}</td></tr>
                  ))}
                </tbody>
              </table>
            </Section>

            <Section title="Matched" tone="good" count={result.matched.length}>
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs text-muted"><th className={th}>Date</th><th className={th}>Statement line</th><th className={th}>Nuray record</th><th className={th}>By</th><th className={`${th} text-right`}>Amount</th></tr></thead>
                <tbody className="divide-y divide-line">
                  {result.matched.map(({ line, record, by }) => (
                    <tr key={line.row}><td className={td}>{line.date}</td><td className={td}>{line.description}</td><td className={td}>{record.label}</td><td className={td}>{by === 'reference' ? 'Reference' : 'Amount and date'}</td><td className={`${td} text-right tabular-nums`}>{signed(line.amount)}</td></tr>
                  ))}
                </tbody>
              </table>
            </Section>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
