'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, X } from 'lucide-react';
import { DashboardLayout, adminSidebarFor } from '@/components/layout/DashboardShell';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { LoadError } from '@/components/ui/LoadError';
import { useDialogs } from '@/components/ui/Dialogs';
import { AdminFilterTabs } from '@/components/admin/AdminFilterTabs';
import { LoadingLine, Pager, PhoneText, SearchForm, StatusPill } from '@/components/admin/AdminListParts';
import { useAuthStore } from '@/lib/store/auth-store';
import { apiClient, apiErrorMessage } from '@/lib/api-client';
import { formatDate, formatDateTime } from '@/lib/utils';
import { useShallow } from 'zustand/react/shallow';

interface AdminUser {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  userType: string;
  status: string;
  emailVerified: boolean;
  phoneVerified: boolean;
  city: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  orderCount: number;
  seller: { id: string; businessName: string; status: string; verificationStatus: string } | null;
  rider: { id: string; status: string; verificationStatus: string } | null;
  managedHubs: Array<{ id: string; name: string }>;
}

type TypeFilter = 'all' | 'customer' | 'seller' | 'rider' | 'hub_manager' | 'admin';
const TYPES: ReadonlyArray<{ id: TypeFilter; label: string }> = [
  { id: 'all', label: 'Everyone' },
  { id: 'customer', label: 'Customers' },
  { id: 'seller', label: 'Kitchens' },
  { id: 'rider', label: 'Riders' },
  { id: 'hub_manager', label: 'Hub managers' },
  { id: 'admin', label: 'Admins' },
];

const TYPE_LABEL: Record<string, string> = {
  customer: 'Customer',
  seller: 'Kitchen',
  rider: 'Rider',
  hub_manager: 'Hub manager',
  admin: 'Admin',
};

const STATUS_LABEL: Record<string, string> = { active: 'Active', suspended: 'Suspended', banned: 'Banned', deleted: 'Deleted' };

const contactLine = (u: AdminUser) => [u.phone, u.email].filter(Boolean).join(' · ') || 'No contact given';
const identify = (u: AdminUser) => `${u.name || 'This account'}${u.email || u.phone ? ` (${u.email || u.phone})` : ''}`;

/** Every account: find someone, see what they are, suspend or reactivate them. */
export default function AdminUsersPage() {
  const { user: me } = useAuthStore(useShallow((s) => ({ user: s.user })));
  const { showToast } = useToast();
  const { confirm: confirmDialog } = useDialogs();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [type, setType] = useState<TypeFilter>('all');
  const [status, setStatus] = useState('');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  // Why the accounts could not be read; shown instead of "No accounts match", which would be untrue.
  const [loadError, setLoadError] = useState<unknown>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [open, setOpen] = useState<AdminUser | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiClient.get('/admin/users', {
        params: { search: query || undefined, type: type === 'all' ? undefined : type, status: status || undefined, page },
      });
      setUsers(res.data.data.users);
      setTotal(res.data.data.pagination.total);
      setTotalPages(res.data.data.pagination.totalPages || 1);
      setLoadError(null);
    } catch (error) {
      // The accounts on the screen belong to the search before this change, so they go with the failure.
      setUsers([]);
      setLoadError(error);
    } finally {
      setLoading(false);
    }
  }, [query, type, status, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const changeStatus = async (u: AdminUser, next: 'active' | 'suspended') => {
    const extra = u.seller ? ' Their kitchen stops taking orders too.' : u.rider ? ' Their rider account is suspended too.' : '';
    if (
      next === 'suspended' &&
      !(await confirmDialog({
        title: 'Suspend this account?',
        message: `Suspend ${identify(u)}? They are signed out everywhere and can't sign in.${extra}`,
        confirmText: 'Suspend',
        variant: 'danger',
      }))
    )
      return;
    try {
      setBusyId(u.id);
      await apiClient.post(`/admin/users/${u.id}/status`, { status: next });
      showToast(next === 'suspended' ? 'Account suspended' : 'Account reactivated', 'success');
      setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, status: next } : x)));
      setOpen((cur) => (cur && cur.id === u.id ? { ...cur, status: next } : cur));
    } catch (error) {
      showToast(apiErrorMessage(error, 'That did not go through'), 'error');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <DashboardLayout
      title="People"
      subtitle="Every account on Nuray. Open someone to suspend or reactivate them."
      sidebarItems={adminSidebarFor(me?.permissions)}
      userType="admin"
    >
      <div className="max-w-6xl space-y-4">
        <AdminFilterTabs
          label="Kind of account"
          value={type}
          onChange={(next) => {
            setType(next);
            setPage(1);
          }}
          tabs={TYPES}
        />
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            className="min-h-11 rounded-xl border border-line-strong bg-surface px-3 text-sm text-ink"
            aria-label="Account status"
          >
            <option value="">Any status</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
          </select>
          <div className="sm:ms-auto">
            <SearchForm
              placeholder="Name, phone, email or kitchen"
              label="Search accounts"
              onSearch={(q) => {
                setQuery(q);
                setPage(1);
              }}
            />
          </div>
        </div>

        {loading && users.length === 0 ? (
          <LoadingLine text="Loading accounts" />
        ) : loadError ? (
          <LoadError error={loadError} onRetry={() => void load()} title="We couldn't load the accounts" />
        ) : users.length === 0 ? (
          <p className="py-6 text-sm text-muted">No accounts match.</p>
        ) : (
          <>
            {/* Phones: one short row per person; the row opens their details. */}
            <ul className="divide-y divide-line border-y border-line md:hidden" data-testid="users-list">
              {users.map((u) => (
                <li key={u.id}>
                  <button type="button" onClick={() => setOpen(u)} className="flex min-h-[72px] w-full items-center gap-3 py-3 text-start hover:bg-raised">
                    <span className="min-w-0 flex-1">
                      <span className="flex items-start justify-between gap-2">
                        <span className="text-sm font-semibold text-ink">{u.name || 'Name not set'}</span>
                        <span className="flex shrink-0 gap-1">
                          <StatusPill>{TYPE_LABEL[u.userType] ?? u.userType}</StatusPill>
                          {u.status !== 'active' && <StatusPill tone="problem">{STATUS_LABEL[u.status] ?? u.status}</StatusPill>}
                        </span>
                      </span>
                      <span className="block truncate text-xs text-muted">{contactLine(u)}</span>
                      <span className="block truncate text-xs text-muted">
                        {u.seller ? `${u.seller.businessName} · ` : ''}
                        {u.orderCount} orders · joined {formatDate(u.createdAt)}
                      </span>
                    </span>
                    <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-muted rtl:rotate-180" />
                  </button>
                </li>
              ))}
            </ul>

            <div className="hidden overflow-x-auto rounded-2xl border border-line bg-surface md:block">
              <table className="w-full text-sm [&_th]:text-start" data-testid="users-table">
                <thead className="border-b border-line text-xs text-muted">
                  <tr>
                    <th className="px-4 py-3 font-medium">Person</th>
                    <th className="px-4 py-3 font-medium">Account</th>
                    <th className="px-4 py-3 font-medium">Orders</th>
                    <th className="px-4 py-3 font-medium">Joined</th>
                    <th className="px-4 py-3 font-medium">Last sign-in</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {users.map((u) => (
                    <tr key={u.id} className="align-top hover:bg-raised">
                      <td className="px-4 py-3">
                        <button type="button" onClick={() => setOpen(u)} className="min-h-11 text-start font-semibold text-ink hover:text-brand-ink hover:underline">
                          {u.name || 'Name not set'}
                        </button>
                        <p className="text-xs text-muted">{contactLine(u)}</p>
                        {u.city && <p className="text-xs text-muted">{u.city}</p>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          <StatusPill>{TYPE_LABEL[u.userType] ?? u.userType}</StatusPill>
                          <StatusPill tone={u.status === 'active' ? 'good' : 'problem'}>{STATUS_LABEL[u.status] ?? u.status}</StatusPill>
                        </div>
                        {u.seller && (
                          <Link href={`/admin/sellers/${u.seller.id}`} className="mt-1 flex min-h-11 items-center text-xs text-brand-ink hover:underline">
                            {u.seller.businessName}
                          </Link>
                        )}
                        {u.managedHubs.length > 0 && <p className="mt-1 text-xs text-muted">Runs {u.managedHubs.map((h) => h.name).join(', ')}</p>}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-ink">{u.orderCount}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-muted">{formatDate(u.createdAt)}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-muted">{u.lastLoginAt ? formatDateTime(u.lastLoginAt) : 'Never'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager page={page} totalPages={totalPages} total={total} noun="accounts" onChange={setPage} />
          </>
        )}
      </div>

      {open && <PersonSheet person={open} busy={busyId === open.id} onClose={() => setOpen(null)} onChangeStatus={(next) => changeStatus(open, next)} />}
    </DashboardLayout>
  );
}

function PersonSheet({
  person: u,
  busy,
  onClose,
  onChangeStatus,
}: {
  person: AdminUser;
  busy: boolean;
  onClose: () => void;
  onChangeStatus: (next: 'active' | 'suspended') => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  const rows: Array<[string, React.ReactNode]> = [
    ['Account', `${TYPE_LABEL[u.userType] ?? u.userType}, ${(STATUS_LABEL[u.status] ?? u.status).toLowerCase()}`],
    ['Phone', <span key="p"><PhoneText phone={u.phone} />{u.phone && u.phoneVerified ? <span className="text-muted"> (verified)</span> : null}</span>],
    ['Email', u.email ? <span key="e" className="break-all">{u.email}{u.emailVerified ? <span className="text-muted"> (verified)</span> : null}</span> : <span className="text-muted">Not given</span>],
    ['City', u.city || <span className="text-muted">Not given</span>],
    ['Orders', String(u.orderCount)],
    ['Joined', formatDate(u.createdAt)],
    ['Last sign-in', u.lastLoginAt ? formatDateTime(u.lastLoginAt) : 'Never signed in'],
  ];

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-labelledby="person-sheet-title">
      <div className="absolute inset-0 bg-[rgba(6,20,18,0.55)]" onClick={onClose} aria-hidden="true" />
      <div className="relative flex h-full w-full flex-col bg-surface shadow-xl md:max-w-md" data-testid="person-sheet">
        <div className="flex items-start gap-3 border-b border-line px-4 pb-3 pt-[calc(env(safe-area-inset-top)+12px)]">
          <h2 id="person-sheet-title" className="min-w-0 flex-1 text-lg font-semibold text-ink">
            {u.name || 'Name not set'}
          </h2>
          <Button variant="ghost" className="h-11 w-11 shrink-0 px-0 text-ink" onClick={onClose} aria-label="Close">
            <X className="h-5 w-5" aria-hidden="true" />
          </Button>
        </div>
        <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            {rows.map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="text-muted">{label}</dt>
                <dd className="min-w-0 text-ink">{value}</dd>
              </div>
            ))}
          </dl>
          {(u.seller || u.rider || u.managedHubs.length > 0) && (
            <ul className="space-y-1 border-t border-line pt-4 text-sm">
              {u.seller && (
                <li>
                  <Link href={`/admin/sellers/${u.seller.id}`} className="inline-flex min-h-11 items-center font-medium text-brand-ink hover:underline">
                    Kitchen: {u.seller.businessName}
                  </Link>
                </li>
              )}
              {u.rider && (
                <li>
                  <Link href={`/admin/riders/${u.rider.id}`} className="inline-flex min-h-11 items-center font-medium text-brand-ink hover:underline">
                    Rider account
                  </Link>
                </li>
              )}
              {u.managedHubs.length > 0 && <li className="text-muted">Runs {u.managedHubs.map((h) => h.name).join(', ')}</li>}
            </ul>
          )}
        </div>
        {u.userType !== 'admin' && (u.status === 'active' || u.status === 'suspended') && (
          <div className="border-t border-line px-4 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3">
            {u.status === 'active' ? (
              <Button variant="outline" className="min-h-11 w-full border-red-200 text-red-700 hover:bg-red-50" disabled={busy} onClick={() => onChangeStatus('suspended')}>
                Suspend account
              </Button>
            ) : (
              <Button className="min-h-11 w-full" disabled={busy} onClick={() => onChangeStatus('active')}>
                Reactivate account
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
