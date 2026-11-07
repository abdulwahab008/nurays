'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronDown } from 'lucide-react';
import { FilterChips, LoadingLine, PageHeader, Pager, StatusPill } from '@/components/admin/AdminListParts';
import { AdminShell } from '@/components/layout/AdminShell';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { LoadError } from '@/components/ui/LoadError';
import { apiClient, apiErrorMessage } from '@/lib/api-client';
import { formatDateTime } from '@/components/admin/admin-dates';
import { useAuthStore } from '@/lib/store/auth-store';
import { describeAction, recordHref } from './describe';

interface AuditEntry {
  id: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  responseStatus: number | null;
  requestData: unknown;
  ipAddress: string | null;
  createdAt: string;
  admin: { id: string; name: string | null; email: string | null } | null;
}

const AREAS = [
  ['', 'Everything'],
  ['orders', 'Orders'],
  ['refunds', 'Refunds'],
  ['riders', 'Riders'],
  ['sellers', 'Kitchens'],
  ['users', 'People'],
  ['payouts', 'Payouts'],
  ['hubs', 'Hubs'],
  ['communities', 'Communities'],
  ['promotions', 'Promo codes'],
  ['settings', 'Settings'],
  ['support', 'Support'],
  ['categories', 'Categories'],
  ['access', 'Refused access'],
  ['user', 'Sign-ins'],
] as const;

/** The message of a failed export: the answer was asked for as a file, so a refusal arrives as a Blob holding the JSON. */
async function exportFailure(error: unknown): Promise<string> {
  const res = (error as { response?: { status?: number; data?: unknown } })?.response;
  if (res?.status === 403) return 'Only the super admin can export the audit log.';
  if (res?.data instanceof Blob) {
    try {
      const body = JSON.parse(await res.data.text()) as { error?: { message?: string }; message?: string };
      const message = body.error?.message ?? body.message;
      if (message) return message;
    } catch {
      // Not JSON: fall through to the general message.
    }
  }
  return apiErrorMessage(error, 'Could not export the audit log');
}

/** Every change an admin made: who, what, on which record, with what, and whether it worked. */
export default function AdminAuditLogPage() {
  return (
    <Suspense fallback={null}>
      <AdminAuditLog />
    </Suspense>
  );
}

function AdminAuditLog() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  const canExport = useAuthStore((st) => !!st.user?.permissions?.includes('audit.export'));
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  // Why the log could not be read; shown instead of "Nothing recorded yet", which would be untrue.
  const [loadError, setLoadError] = useState<unknown>(null);
  const areaParam = searchParams.get('area') ?? '';
  const area = AREAS.some(([id]) => id === areaParam) ? areaParam : '';
  const [entityId, setEntityId] = useState('');
  const [query, setQuery] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [result, setResult] = useState('');
  const page = Math.max(1, Number(searchParams.get('page')) || 1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const showSignIns = searchParams.get('signins') === '1';
  const hideSignIns = !showSignIns && area !== 'user';

  const filterParams = useMemo(
    () => ({
      entityType: area || undefined,
      entityId: query || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo ? `${dateTo}T23:59:59` : undefined,
      result: result || undefined,
      hideSignIns: hideSignIns ? '1' : undefined,
    }),
    [area, query, dateFrom, dateTo, result, hideSignIns]
  );

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiClient.get('/admin/audit-logs', {
        params: { ...filterParams, page, limit: 50 },
      });
      setEntries(res.data.data.logs);
      setTotalPages(res.data.data.pagination.totalPages || 1);
      setTotal(res.data.data.pagination.total ?? 0);
      setLoadError(null);
    } catch (error) {
      // The rows still on the screen belong to the filters before this change, so they go with the failure.
      setEntries([]);
      setLoadError(error);
    } finally {
      setLoading(false);
    }
  }, [filterParams, page]);

  const setView = (changes: { area?: string; signIns?: boolean; page: number }) => {
    const params = new URLSearchParams(searchParams.toString());
    if (changes.area !== undefined) {
      if (changes.area) params.set('area', changes.area);
      else params.delete('area');
    }
    if (changes.signIns !== undefined) {
      if (changes.signIns) params.set('signins', '1');
      else params.delete('signins');
    }
    if (changes.page > 1) params.set('page', String(changes.page));
    else params.delete('page');
    const qs = params.toString();
    router.replace(qs ? `/admin/audit-log?${qs}` : '/admin/audit-log', { scroll: false });
  };
  const setPage = (next: number) => setView({ page: next });

  const exportCsv = async () => {
    try {
      const res = await apiClient.get('/admin/audit-logs/export', { params: filterParams, responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'audit-log.csv';
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      showToast(await exportFailure(error), 'error');
    }
  };

  useEffect(() => {
    load();
  }, [load]);

  const filtersOn = [query, dateFrom, dateTo, result].filter(Boolean).length;
  const done = (e: AuditEntry) => e.responseStatus != null && e.responseStatus < 400;
  const resultPill = (e: AuditEntry) => <StatusPill tone={done(e) ? 'good' : 'problem'}>{done(e) ? 'Done' : 'Refused'}</StatusPill>;
  const who = (e: AuditEntry) => e.admin?.name || e.admin?.email || 'Unknown';
  const recordLink = (e: AuditEntry) => {
    const href = recordHref(e.entityType, e.entityId);
    return (
      href && (
        <Link href={href} aria-label="Open the record" className="inline-flex min-h-11 shrink-0 items-center text-xs font-medium text-brand-ink hover:underline">
          Open
        </Link>
      )
    );
  };
  const detailsToggle = (e: AuditEntry) => (
    <button type="button" onClick={() => setOpen(open === e.id ? null : e.id)} aria-expanded={open === e.id} className="min-h-11 shrink-0 text-xs font-medium text-brand-ink hover:underline">
      {open === e.id ? 'Hide details' : 'Details'}
    </button>
  );
  const details = (e: AuditEntry) =>
    open === e.id && (
      <dl className="mt-1 max-w-xl space-y-1 rounded-lg bg-raised p-2 text-xs text-muted" data-ltr>
        <div>
          <dt className="inline font-medium text-ink">Action: </dt>
          <dd className="inline break-all">{e.action} ({e.responseStatus ?? 'no answer'})</dd>
        </div>
        {e.entityId && (
          <div>
            <dt className="inline font-medium text-ink">Record: </dt>
            <dd className="inline break-all">{e.entityType ? `${e.entityType} ` : ''}{e.entityId}</dd>
          </div>
        )}
        {e.ipAddress && (
          <div>
            <dt className="inline font-medium text-ink">IP address: </dt>
            <dd className="inline">{e.ipAddress}</dd>
          </div>
        )}
        {e.requestData != null && <pre className="overflow-x-auto whitespace-pre-wrap">{JSON.stringify(e.requestData, null, 2)}</pre>}
      </dl>
    );

  return (
    <AdminShell>
      <div className="max-w-6xl space-y-4">
        <PageHeader
          title="Audit log"
          subtitle="Every change made in the admin console, including attempts that were refused."
          actions={
            canExport && (
              <Button type="button" variant="outline" onClick={exportCsv} data-testid="audit-export">
                Export CSV
              </Button>
            )
          }
        />

        <FilterChips label="Area" value={area} onChange={(id) => setView({ area: id, page: 1 })} options={AREAS.map(([id, label]) => ({ id, label }))} />
        {area !== 'user' && (
          <button
            type="button"
            aria-pressed={showSignIns}
            onClick={() => setView({ signIns: !showSignIns, page: 1 })}
            className={`min-h-11 rounded-full border px-4 text-sm font-medium transition-colors ${showSignIns ? 'border-brand bg-brand-soft text-brand-soft-ink' : 'border-line bg-surface text-ink hover:bg-raised'}`}
            data-testid="audit-signins"
          >
            Include sign-ins and sign-outs
          </button>
        )}

        <details className="group rounded-2xl border border-line bg-surface" open={filtersOn > 0 || undefined}>
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 text-sm font-medium text-ink [&::-webkit-details-marker]:hidden">
            <span>
              More filters
              {filtersOn > 0 && <span className="ms-2 text-muted">{filtersOn} on</span>}
            </span>
            <ChevronDown aria-hidden="true" className="h-4 w-4 text-muted transition-transform group-open:rotate-180" />
          </summary>
          <div className="grid gap-3 border-t border-line p-4 sm:grid-cols-2 lg:grid-cols-4">
            <form
              className="flex items-end gap-2 sm:col-span-2 lg:col-span-1"
              onSubmit={(e) => {
                e.preventDefault();
                setQuery(entityId.trim());
                setPage(1);
              }}
            >
              <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-muted">
                Record id
                <input value={entityId} onChange={(e) => setEntityId(e.target.value)} placeholder="Order, rider, kitchen…" className="nuray-input text-sm" />
              </label>
              <Button type="submit" variant="outline">
                Filter
              </Button>
            </form>
            <label className="flex flex-col gap-1 text-xs text-muted">
              From
              <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} className="nuray-input text-sm" data-testid="audit-from" />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              To
              <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} className="nuray-input text-sm" data-testid="audit-to" />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              Result
              <select value={result} onChange={(e) => { setResult(e.target.value); setPage(1); }} className="nuray-input text-sm" data-testid="audit-result">
                <option value="">All</option>
                <option value="ok">Done</option>
                <option value="refused">Refused</option>
              </select>
            </label>
          </div>
        </details>

        {loading && entries.length === 0 ? (
          <LoadingLine text="Loading the audit log" />
        ) : loadError ? (
          <LoadError error={loadError} onRetry={load} title="We couldn't load the audit log" />
        ) : entries.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted">Nothing recorded for these filters.</p>
        ) : (
          <>
            <ul className={`md:hidden divide-y divide-line border-y border-line ${loading ? 'opacity-60' : ''}`} data-testid="audit-list">
              {entries.map((e) => (
                <li key={e.id} className="py-2">
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 text-sm font-medium text-ink break-words">{describeAction(e.action, { refused: !done(e) })}</p>
                    {resultPill(e)}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted">
                    <span className="min-w-0 flex-1 truncate">
                      <bdi>{who(e)}</bdi> · <bdi>{formatDateTime(e.createdAt)}</bdi>
                    </span>
                    {recordLink(e)}
                    {detailsToggle(e)}
                  </div>
                  {details(e)}
                </li>
              ))}
            </ul>
            <div className={`hidden md:block overflow-x-auto rounded-2xl border border-line bg-surface ${loading ? 'opacity-60' : ''}`}>
              <table className="w-full text-sm" data-testid="audit-table">
                <thead className="bg-raised text-start text-xs font-medium text-muted">
                  <tr>
                    <th className="px-4 py-3 text-start">When</th>
                    <th className="px-4 py-3 text-start">Who</th>
                    <th className="px-4 py-3 text-start">What</th>
                    <th className="px-4 py-3 text-start">Result</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {entries.map((e) => (
                    <tr key={e.id} className="align-top">
                      <td className="px-4 py-3 text-xs text-muted whitespace-nowrap">{formatDateTime(e.createdAt)}</td>
                      <td className="px-4 py-3">
                        <p className="text-ink break-words">{who(e)}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-ink break-words">{describeAction(e.action, { refused: !done(e) })}</p>
                        <div className="flex flex-wrap items-center gap-x-4">
                          {recordLink(e)}
                          {detailsToggle(e)}
                        </div>
                        {details(e)}
                      </td>
                      <td className="px-4 py-3">{resultPill(e)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager page={page} totalPages={totalPages} total={total} noun="entries" one="entry" onChange={setPage} />
          </>
        )}
      </div>
    </AdminShell>
  );
}
