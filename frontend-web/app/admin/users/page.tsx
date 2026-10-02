'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { UserLayout } from '@/components/layout/UserLayout';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { apiClient, apiErrorMessage } from '@/lib/api-client';
import { formatDate, formatDateTime } from '@/lib/utils';

interface AdminUser {
  id: string;
  name: string | null;
  phone: string;
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

const TYPES = [
  ['', 'Everyone'],
  ['customer', 'Customers'],
  ['seller', 'Kitchens'],
  ['rider', 'Riders'],
  ['hub_manager', 'Hub managers'],
  ['admin', 'Admins'],
] as const;

const TYPE_LABEL: Record<string, string> = {
  customer: 'Customer',
  seller: 'Kitchen',
  rider: 'Rider',
  hub_manager: 'Hub manager',
  admin: 'Admin',
};

/** Every account: find someone, see what they are, suspend or reactivate them. */
export default function AdminUsersPage() {
  const { showToast } = useToast();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiClient.get('/admin/users', {
        params: { search: query || undefined, type: type || undefined, status: status || undefined, page },
      });
      setUsers(res.data.data.users);
      setTotal(res.data.data.pagination.total);
      setTotalPages(res.data.data.pagination.totalPages || 1);
    } catch (error) {
      showToast(apiErrorMessage(error, 'Failed to load accounts'), 'error');
    } finally {
      setLoading(false);
    }
  }, [query, type, status, page, showToast]);

  useEffect(() => {
    load();
  }, [load]);

  const changeStatus = async (u: AdminUser, next: 'active' | 'suspended') => {
    const extra = u.seller ? ' Their kitchen stops taking orders too.' : u.rider ? ' Their rider account is suspended too.' : '';
    if (next === 'suspended' && !window.confirm(`Suspend ${u.name || u.phone}? They are signed out everywhere and can't sign in.${extra}`)) return;
    try {
      setBusyId(u.id);
      await apiClient.post(`/admin/users/${u.id}/status`, { status: next });
      showToast(next === 'suspended' ? 'Account suspended' : 'Account reactivated', 'success');
      setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, status: next } : x)));
    } catch (error) {
      showToast(apiErrorMessage(error, 'That did not go through'), 'error');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <UserLayout showSidebar={true} showNavbar={true}>
      <div className="max-w-6xl mx-auto space-y-5">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">People</h1>
          <p className="text-gray-600 mt-1">Every account on Nuray. Suspending someone signs them out everywhere.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {TYPES.map(([id, label]) => (
            <button
              key={id || 'all'}
              type="button"
              onClick={() => {
                setType(id);
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-lg text-sm border ${type === id ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 bg-white text-gray-700'}`}
            >
              {label}
            </button>
          ))}
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm bg-white"
            aria-label="Account status"
          >
            <option value="">Any status</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
          </select>
          <form
            className="ml-auto flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              setQuery(search.trim());
              setPage(1);
            }}
          >
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name, phone, email or kitchen"
              className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm w-64"
              aria-label="Search accounts"
            />
            <Button type="submit" variant="outline" size="sm">
              Search
            </Button>
          </form>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
          {loading && users.length === 0 ? (
            <p className="p-10 text-center text-gray-500">Loading…</p>
          ) : users.length === 0 ? (
            <p className="p-10 text-center text-gray-500">No accounts match.</p>
          ) : (
            <table className="w-full text-sm" data-testid="users-table">
              <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-3">Person</th>
                  <th className="px-4 py-3">Account</th>
                  <th className="px-4 py-3">Orders</th>
                  <th className="px-4 py-3">Joined / last sign-in</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {users.map((u) => (
                  <tr key={u.id} className="align-top">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-gray-900">{u.name || 'Name not set'}</p>
                      <p className="text-xs text-gray-500">
                        {u.phone}
                        {u.phoneVerified ? ' ✓' : ''}
                        {u.email ? ` · ${u.email}${u.emailVerified ? ' ✓' : ''}` : ''}
                      </p>
                      {u.city && <p className="text-xs text-gray-400">{u.city}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-block px-2 py-0.5 rounded text-xs font-semibold bg-gray-100 text-gray-700">{TYPE_LABEL[u.userType] ?? u.userType}</span>{' '}
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${u.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{u.status}</span>
                      {u.seller && (
                        <p className="text-xs text-gray-600 mt-1">
                          Kitchen:{' '}
                          <Link href={`/admin/sellers/${u.seller.id}`} className="underline">
                            {u.seller.businessName}
                          </Link>{' '}
                          ({u.seller.verificationStatus}, {u.seller.status})
                        </p>
                      )}
                      {u.rider && (
                        <p className="text-xs text-gray-600 mt-1">
                          Rider:{' '}
                          <Link href={`/admin/riders/${u.rider.id}`} className="underline">
                            {u.rider.verificationStatus}, {u.rider.status}
                          </Link>
                        </p>
                      )}
                      {u.managedHubs.length > 0 && <p className="text-xs text-gray-600 mt-1">Runs: {u.managedHubs.map((h) => h.name).join(', ')}</p>}
                    </td>
                    <td className="px-4 py-3 text-gray-700">{u.orderCount}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {formatDate(u.createdAt)}
                      <br />
                      {u.lastLoginAt ? formatDateTime(u.lastLoginAt) : 'Never signed in'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {u.userType === 'admin' ? null : u.status === 'active' ? (
                        <Button variant="outline" size="sm" disabled={busyId === u.id} onClick={() => changeStatus(u, 'suspended')} className="border-red-200 text-red-700">
                          Suspend
                        </Button>
                      ) : u.status === 'suspended' ? (
                        <Button variant="outline" size="sm" disabled={busyId === u.id} onClick={() => changeStatus(u, 'active')}>
                          Reactivate
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 text-sm">
              <span className="text-gray-500">
                {total} accounts · page {page} of {totalPages}
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
