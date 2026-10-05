'use client';

import { useCallback, useEffect, useState } from 'react';
import { UserLayout } from '@/components/layout/UserLayout';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { apiClient, apiErrorMessage } from '@/lib/api-client';
import { formatDateTime } from '@/lib/utils';

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

/** "admin:POST /riders/:id/payouts" -> "POST riders/:id/payouts" */
const describe = (action: string) => action.replace(/^(admin|hub|admin-as-seller):/, (m) => (m === 'admin:' ? '' : m)).replace(' /', ' ');

/** Every change an admin made: who, what, on which record, with what, and whether it worked. */
export default function AdminAuditLogPage() {
  const { showToast } = useToast();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [area, setArea] = useState('');
  const [entityId, setEntityId] = useState('');
  const [query, setQuery] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [result, setResult] = useState('');
  const [page, setPage] = useState(1);
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
    } catch (error) {
      showToast(apiErrorMessage(error, 'Failed to load the audit log'), 'error');
    } finally {
      setLoading(false);
    }
  }, [area, query, dateFrom, dateTo, result, page, showToast]);

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
      showToast(apiErrorMessage(error, 'Could not export the audit log'), 'error');
    }
  };

  useEffect(() => {
    load();
  }, [load]);

  return (
    <UserLayout showSidebar={true} showNavbar={true}>
      <div className="max-w-6xl mx-auto space-y-5">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Audit log</h1>
          <p className="text-gray-600 mt-1">Every change made in the admin console, including attempts that were refused.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {AREAS.map(([id, label]) => (
            <button
              key={id || 'all'}
              type="button"
              onClick={() => {
                setArea(id);
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-lg text-sm border ${area === id ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 bg-white text-gray-700'}`}
            >
              {label}
            </button>
          ))}
          <form
            className="ms-auto flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              setQuery(entityId.trim());
              setPage(1);
            }}
          >
            <input value={entityId} onChange={(e) => setEntityId(e.target.value)} placeholder="Record id (order, rider…)" className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm w-64" aria-label="Record id" />
            <Button type="submit" variant="outline" size="sm">
              Filter
            </Button>
          </form>
        </div>

        <div className="flex flex-wrap items-end gap-3 text-sm">
          <label className="flex flex-col text-xs text-gray-500">From
            <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} className="px-2 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-900" data-testid="audit-from" />
          </label>
          <label className="flex flex-col text-xs text-gray-500">To
            <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} className="px-2 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-900" data-testid="audit-to" />
          </label>
          <label className="flex flex-col text-xs text-gray-500">Result
            <select value={result} onChange={(e) => { setResult(e.target.value); setPage(1); }} className="px-2 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-900" data-testid="audit-result">
              <option value="">All</option>
              <option value="ok">Done</option>
              <option value="refused">Refused</option>
            </select>
          </label>
          <Button type="button" variant="outline" size="sm" onClick={exportCsv} data-testid="audit-export">Export CSV</Button>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
          {loading && entries.length === 0 ? (
            <p className="p-10 text-center text-gray-500">Loading…</p>
          ) : entries.length === 0 ? (
            <p className="p-10 text-center text-gray-500">Nothing recorded yet.</p>
          ) : (
            <table className="w-full text-sm" data-testid="audit-table">
              <thead className="bg-gray-50 text-start text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-3">When</th>
                  <th className="px-4 py-3">Who</th>
                  <th className="px-4 py-3">What</th>
                  <th className="px-4 py-3">Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {entries.map((e) => (
                  <tr key={e.id} className="align-top">
                    <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{formatDateTime(e.createdAt)}</td>
                    <td className="px-4 py-3">
                      <p className="text-gray-900">{e.admin?.name || e.admin?.email || 'Unknown'}</p>
                      {e.ipAddress && <p className="text-xs text-gray-400">{e.ipAddress}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-mono text-xs text-gray-800">{describe(e.action)}</p>
                      {e.entityId && <p className="text-xs text-gray-500">Record {e.entityId}</p>}
                      {e.requestData != null && (
                        <button type="button" onClick={() => setOpen(open === e.id ? null : e.id)} className="text-xs text-green-700 underline mt-1">
                          {open === e.id ? 'Hide details' : 'Details'}
                        </button>
                      )}
                      {open === e.id && (
                        <pre className="mt-2 text-xs bg-gray-50 rounded p-2 overflow-x-auto max-w-xl whitespace-pre-wrap">{JSON.stringify(e.requestData, null, 2)}</pre>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${
                          e.responseStatus != null && e.responseStatus < 400 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
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
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 text-sm">
              <span className="text-gray-500">
                Page {page} of {totalPages}
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                  Previous
                </Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </UserLayout>
  );
}
