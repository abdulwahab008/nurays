'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AdminShell } from '@/components/layout/AdminShell';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { LoadError } from '@/components/ui/LoadError';
import { apiClient, apiErrorMessage } from '@/lib/api-client';
import { formatDateTime } from '@/lib/utils';
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
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiClient.get('/admin/audit-logs', {
        params: { entityType: area || undefined, entityId: query || undefined, dateFrom: dateFrom || undefined, dateTo: dateTo ? `${dateTo}T23:59:59` : undefined, result: result || undefined, page, limit: 50 },
      });
      setEntries(res.data.data.logs);
      setTotalPages(res.data.data.pagination.totalPages || 1);
      setLoadError(null);
    } catch (error) {
      // The rows still on the screen belong to the filters before this change, so they go with the failure.
      setEntries([]);
      setLoadError(error);
    } finally {
      setLoading(false);
    }
  }, [area, query, dateFrom, dateTo, result, page]);

  const setView = (changes: { area?: string; page: number }) => {
    const params = new URLSearchParams(searchParams.toString());
    if (changes.area !== undefined) {
      if (changes.area) params.set('area', changes.area);
      else params.delete('area');
    }
    if (changes.page > 1) params.set('page', String(changes.page));
    else params.delete('page');
    const qs = params.toString();
    router.replace(qs ? `/admin/audit-log?${qs}` : '/admin/audit-log', { scroll: false });
  };
  const setPage = (next: number) => setView({ page: next });

  const exportCsv = async () => {
    try {
      const res = await apiClient.get('/admin/audit-logs/export', { params: { entityType: area || undefined, entityId: query || undefined, dateFrom: dateFrom || undefined, dateTo: dateTo ? `${dateTo}T23:59:59` : undefined, result: result || undefined }, responseType: 'blob' });
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

  return (
    <AdminShell>
      <div className="max-w-6xl mx-auto space-y-5">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Audit log</h1>
          <p className="text-sm text-muted mt-1">Every change made in the admin console, including attempts that were refused.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {AREAS.map(([id, label]) => (
            <button
              key={id || 'all'}
              type="button"
              onClick={() => setView({ area: id, page: 1 })}
              aria-pressed={area === id}
              className={`min-h-11 px-3 rounded-full text-sm font-medium border ${area === id ? 'border-brand bg-brand-soft text-brand-soft-ink' : 'border-line bg-surface text-ink hover:bg-raised'}`}
            >
              {label}
            </button>
          ))}
          <form
            className="ms-auto flex gap-2 w-full sm:w-auto [&>input]:min-w-0 [&>input]:flex-1"
            onSubmit={(e) => {
              e.preventDefault();
              setQuery(entityId.trim());
              setPage(1);
            }}
          >
            <input value={entityId} onChange={(e) => setEntityId(e.target.value)} placeholder="Record id (order, rider…)" className="nuray-input text-sm sm:w-64" aria-label="Record id" />
            <Button type="submit" variant="outline">
              Filter
            </Button>
          </form>
        </div>

        <div className="flex flex-wrap items-end gap-3 text-sm">
          <label className="flex flex-col gap-1 text-xs text-muted">From
            <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} className="nuray-input text-sm" data-testid="audit-from" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">To
            <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} className="nuray-input text-sm" data-testid="audit-to" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">Result
            <select value={result} onChange={(e) => { setResult(e.target.value); setPage(1); }} className="nuray-input text-sm" data-testid="audit-result">
              <option value="">All</option>
              <option value="ok">Done</option>
              <option value="refused">Refused</option>
            </select>
          </label>
          {canExport && (
            <Button type="button" variant="outline" onClick={exportCsv} data-testid="audit-export">Export CSV</Button>
          )}
        </div>

        <div className="bg-surface border border-line rounded-2xl overflow-x-auto">
          {loading && entries.length === 0 ? (
            <p className="p-10 text-center text-sm text-muted">Loading…</p>
          ) : loadError ? (
            <LoadError error={loadError} onRetry={load} title="We couldn't load the audit log" className="m-4" />
          ) : entries.length === 0 ? (
            <p className="p-10 text-center text-sm text-muted">Nothing recorded for these filters.</p>
          ) : (
            <table className="w-full text-sm" data-testid="audit-table">
              <thead className="bg-raised text-start text-xs font-medium text-muted">
                <tr>
                  <th className="px-4 py-3">When</th>
                  <th className="px-4 py-3">Who</th>
                  <th className="px-4 py-3">What</th>
                  <th className="px-4 py-3">Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {entries.map((e) => (
                  <tr key={e.id} className="align-top">
                    <td className="px-4 py-3 text-xs text-muted whitespace-nowrap">{formatDateTime(e.createdAt)}</td>
                    <td className="px-4 py-3">
                      <p className="text-ink break-words">{e.admin?.name || e.admin?.email || 'Unknown'}</p>
                      {e.ipAddress && <p className="text-xs text-muted">{e.ipAddress}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-ink break-words" title={e.action}>{describeAction(e.action)}</p>
                      {e.entityId && (() => {
                        const href = recordHref(e.entityType, e.entityId);
                        return href ? (
                          <Link href={href} className="inline-flex min-h-11 items-center text-xs text-brand-ink underline">Open the record</Link>
                        ) : (
                          <p className="text-xs text-muted break-all">Record {e.entityId}</p>
                        );
                      })()}
                      {e.requestData != null && (
                        <button type="button" onClick={() => setOpen(open === e.id ? null : e.id)} className="h-11 text-xs text-brand-ink underline">
                          {open === e.id ? 'Hide details' : 'Details'}
                        </button>
                      )}
                      {open === e.id && (
                        <pre className="mt-2 text-xs bg-raised rounded-lg p-2 overflow-x-auto max-w-xl whitespace-pre-wrap">{JSON.stringify(e.requestData, null, 2)}</pre>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${
                          e.responseStatus != null && e.responseStatus < 400 ? 'bg-brand-soft text-brand-soft-ink' : 'bg-red-50 text-red-700'
                        }`}
                      >
                        {e.responseStatus != null && e.responseStatus < 400 ? 'Done' : `Refused (${e.responseStatus ?? '?'})`}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-line text-sm">
              <span className="text-muted">
                Page {page} of {totalPages}
              </span>
              <div className="flex gap-2">
                <Button variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                  Previous
                </Button>
                <Button variant="outline" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </AdminShell>
  );
}
