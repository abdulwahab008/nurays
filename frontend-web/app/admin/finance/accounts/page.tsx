'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { DashboardLayout, adminSidebarFor } from '@/components/layout/DashboardShell';
import { LoadError } from '@/components/ui/LoadError';
import { Figure, LoadingLine, StatusPill } from '@/components/admin/AdminListParts';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useAuthStore } from '@/lib/store/auth-store';
import { apiClient } from '@/lib/api-client';
import { formatDateTime, formatPrice } from '@/lib/utils';
import { useShallow } from 'zustand/react/shallow';

interface KitchenAccount { id: string; name: string; status: string; balance: number; payoutOnItsWay: number; awaitingRiderCash: number; earned: number; paidOut: number }
interface RiderAccount { id: string; name: string; status: string; balance: number; cashHeld: number; earned: number; paidOut: number }
interface Accounts {
  kitchens: KitchenAccount[];
  riders: RiderAccount[];
  totals: { owedToKitchens: number; owedByKitchens: number; owedToRiders: number; owedByRiders: number; cashWithRiders: number };
}
interface NurayMonth { month: string; sales: number; commission: number; deliveryFees: number; riderPay: number; platformDiscounts: number; gst: number; revenue: number; costs: number; net: number }

interface BooksIssue { key: string; title: string; count: number; items: string[] }
interface BooksCheck { ranAt: string; trigger: 'nightly' | 'manual'; issues: BooksIssue[] }

type Tab = 'kitchens' | 'riders' | 'nuray';

const monthName = (m: string) => new Date(`${m}-01T00:00:00`).toLocaleDateString('en-PK', { month: 'long', year: 'numeric' });

/** What Nuray owes, or is owed: a positive balance is owed to them, a negative one they owe Nuray. */
function Balance({ value }: { value: number }) {
  if (Math.abs(value) < 0.005) return <span className="text-muted tabular-nums">Rs 0</span>;
  return value > 0 ? (
    <span className="tabular-nums font-semibold text-ink">{formatPrice(value)} <span className="text-xs font-normal text-muted">Nuray owes</span></span>
  ) : (
    <span className="tabular-nums font-semibold text-red-700">{formatPrice(-value)} <span className="text-xs font-normal">owes Nuray</span></span>
  );
}

/** The latest books check: every order's ledger balanced, rider cash matching, payouts and deposits not left waiting. */
function BooksCheckPanel({ check, running, onRun }: { check: BooksCheck | null; running: boolean; onRun: () => void }) {
  const problems = check?.issues ?? [];
  return (
    <section aria-labelledby="books-heading" className="rounded-2xl border border-line bg-surface p-4 space-y-3" data-testid="books-check">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="books-heading" className="text-sm font-semibold text-ink">
            Books check{' '}
            {check && (problems.length === 0 ? <StatusPill tone="good">All in order</StatusPill> : <StatusPill tone="problem">{problems.length} to look at</StatusPill>)}
          </h2>
          <p className="text-xs text-muted">
            {check ? `${check.trigger === 'nightly' ? 'Nightly run' : 'Run by staff'}, ${formatDateTime(check.ranAt)}. Runs every night at 03:00.` : 'Not run yet. It runs every night at 03:00.'}
          </p>
        </div>
        <Button type="button" variant="outline" className="rounded-xl min-h-11" disabled={running} onClick={onRun}>
          {running ? 'Checking…' : 'Check now'}
        </Button>
      </div>
      {problems.length > 0 && (
        <ul className="space-y-3">
          {problems.map((p) => (
            <li key={p.key} className="text-sm">
              <p className="font-medium text-red-700">{p.title} ({p.count})</p>
              <ul className="mt-1 list-disc ps-5 text-muted">
                {p.items.map((t) => <li key={t}>{t}</li>)}
                {p.count > p.items.length && <li>and {p.count - p.items.length} more</li>}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * Accounts: every kitchen's and rider's balance with Nuray (each opens to its statement of debits and credits), and
 * Nuray's own account month by month.
 */
export default function AdminAccountsPage() {
  const { isAuthenticated, user } = useAuthStore(useShallow((s) => ({ isAuthenticated: s.isAuthenticated, user: s.user })));
  const isAdmin = user?.user_type === 'admin' || user?.userType === 'admin';
  const [tab, setTab] = useState<Tab>('kitchens');
  const [accounts, setAccounts] = useState<Accounts | null>(null);
  const [nuray, setNuray] = useState<NurayMonth[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [books, setBooks] = useState<BooksCheck | null>(null);
  const [checking, setChecking] = useState(false);
  const { showToast } = useToast();

  const load = useCallback(async () => {
    try {
      const [a, n, b] = await Promise.all([apiClient.get('/admin/finance/accounts'), apiClient.get('/admin/finance/nuray'), apiClient.get('/admin/finance/books-check')]);
      setAccounts(a.data.data);
      setNuray(n.data.data.months);
      setBooks(b.data.data);
      setError(null);
    } catch (err) {
      setError(err);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated && isAdmin) void load();
  }, [isAuthenticated, isAdmin, load]);

  const runCheck = async () => {
    setChecking(true);
    try {
      const res = await apiClient.post('/admin/finance/books-check');
      setBooks(res.data.data);
    } catch {
      showToast("We couldn't run the books check. Please try again.", 'error');
    } finally {
      setChecking(false);
    }
  };

  if (!isAuthenticated || !isAdmin) return null;

  const tabs: Array<{ key: Tab; label: string }> = [
    { key: 'kitchens', label: 'Kitchens' },
    { key: 'riders', label: 'Riders' },
    { key: 'nuray', label: 'Nuray' },
  ];

  return (
    <DashboardLayout title="Accounts" subtitle="Who Nuray owes and who owes Nuray, with each one's statement" sidebarItems={adminSidebarFor(user?.permissions)} userType="admin">
      <div className="max-w-5xl space-y-6">
        {error ? <LoadError compact error={error} onRetry={() => void load()} title="We couldn't load the accounts" /> : null}
        {!accounts ? (
          error ? null : <LoadingLine text="Working out every balance" />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4" data-testid="account-totals">
              <Figure label="Nuray owes kitchens" value={formatPrice(accounts.totals.owedToKitchens)} sub={accounts.totals.owedByKitchens > 0 ? `Kitchens owe ${formatPrice(accounts.totals.owedByKitchens)}` : 'No kitchen owes Nuray'} />
              <Figure label="Nuray owes riders" value={formatPrice(accounts.totals.owedToRiders)} sub={accounts.totals.owedByRiders > 0 ? `Riders owe ${formatPrice(accounts.totals.owedByRiders)}` : 'No rider owes Nuray'} />
              <Figure label="Cash with riders" value={formatPrice(accounts.totals.cashWithRiders)} sub="Collected, not handed in" />
              <Figure label="GST owed (this month)" value={formatPrice(nuray?.[0]?.gst ?? 0)} href="/admin/finance/gst" sub="See the GST report" />
            </div>

            <BooksCheckPanel check={books} running={checking} onRun={() => void runCheck()} />
            <Link href="/admin/finance/statement" className="inline-flex min-h-11 items-center text-sm font-semibold text-brand-ink hover:underline">
              Match a bank or wallet statement →
            </Link>

            <div role="tablist" aria-label="Accounts" className="flex gap-2 border-b border-line">
              {tabs.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.key}
                  onClick={() => setTab(t.key)}
                  className={`min-h-11 px-3 text-sm font-semibold border-b-2 -mb-px ${tab === t.key ? 'border-brand text-brand-ink' : 'border-transparent text-muted hover:text-ink'}`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {tab === 'kitchens' && (
              <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
                <table className="w-full text-sm" data-testid="kitchen-accounts">
                  <thead>
                    <tr className="text-left text-xs text-muted">
                      <th className="px-4 py-2 font-medium">Kitchen</th>
                      <th className="px-4 py-2 font-medium text-right">Earned</th>
                      <th className="px-4 py-2 font-medium text-right">Paid out</th>
                      <th className="px-4 py-2 font-medium text-right">Waiting for rider cash</th>
                      <th className="px-4 py-2 font-medium text-right">Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {accounts.kitchens.map((k) => (
                      <tr key={k.id}>
                        <td className="px-4 py-3">
                          <Link href={`/admin/finance/accounts/kitchen/${k.id}`} className="font-medium text-brand-ink hover:underline">{k.name}</Link>
                          {k.status !== 'active' && <StatusPill tone="ended" className="ms-2">{k.status}</StatusPill>}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">{formatPrice(k.earned)}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{formatPrice(k.paidOut)}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{k.awaitingRiderCash ? formatPrice(k.awaitingRiderCash) : '—'}</td>
                        <td className="px-4 py-3 text-right"><Balance value={k.balance} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {tab === 'riders' && (
              <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
                <table className="w-full text-sm" data-testid="rider-accounts">
                  <thead>
                    <tr className="text-left text-xs text-muted">
                      <th className="px-4 py-2 font-medium">Rider</th>
                      <th className="px-4 py-2 font-medium text-right">Earned</th>
                      <th className="px-4 py-2 font-medium text-right">Paid out</th>
                      <th className="px-4 py-2 font-medium text-right">Cash in hand</th>
                      <th className="px-4 py-2 font-medium text-right">Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {accounts.riders.map((r) => (
                      <tr key={r.id}>
                        <td className="px-4 py-3">
                          <Link href={`/admin/finance/accounts/rider/${r.id}`} className="font-medium text-brand-ink hover:underline">{r.name}</Link>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">{formatPrice(r.earned)}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{formatPrice(r.paidOut)}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{formatPrice(r.cashHeld)}</td>
                        <td className="px-4 py-3 text-right"><Balance value={r.balance} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {tab === 'nuray' && (
              !nuray || nuray.length === 0 ? (
                <p className="text-sm text-muted">Nothing yet: Nuray&apos;s account fills in as orders are delivered.</p>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
                  <table className="w-full text-sm" data-testid="nuray-account">
                    <thead>
                      <tr className="text-left text-xs text-muted">
                        <th className="px-4 py-2 font-medium">Month</th>
                        <th className="px-4 py-2 font-medium text-right">Customer payments</th>
                        <th className="px-4 py-2 font-medium text-right">Commission</th>
                        <th className="px-4 py-2 font-medium text-right">Delivery fees</th>
                        <th className="px-4 py-2 font-medium text-right">Rider pay</th>
                        <th className="px-4 py-2 font-medium text-right">Discounts paid</th>
                        <th className="px-4 py-2 font-medium text-right">Net</th>
                        <th className="px-4 py-2 font-medium text-right">GST owed</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {nuray.map((m) => (
                        <tr key={m.month}>
                          <td className="px-4 py-3 font-medium text-ink">{monthName(m.month)}</td>
                          <td className="px-4 py-3 text-right tabular-nums">{formatPrice(m.sales)}</td>
                          <td className="px-4 py-3 text-right tabular-nums">{formatPrice(m.commission)}</td>
                          <td className="px-4 py-3 text-right tabular-nums">{formatPrice(m.deliveryFees)}</td>
                          <td className="px-4 py-3 text-right tabular-nums">−{formatPrice(m.riderPay)}</td>
                          <td className="px-4 py-3 text-right tabular-nums">−{formatPrice(m.platformDiscounts)}</td>
                          <td className={`px-4 py-3 text-right font-semibold tabular-nums ${m.net < 0 ? 'text-red-700' : 'text-ink'}`}>{m.net < 0 ? `−${formatPrice(-m.net)}` : formatPrice(m.net)}</td>
                          <td className="px-4 py-3 text-right tabular-nums">{formatPrice(m.gst)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
