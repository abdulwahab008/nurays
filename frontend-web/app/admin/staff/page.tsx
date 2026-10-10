'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { AdminShell } from '@/components/layout/AdminShell';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { apiClient, apiErrorMessage } from '@/lib/api-client';
import { useAuthStore } from '@/lib/store/auth-store';
import { formatDateTime } from '@/lib/utils';

interface Member {
  id: string;
  name: string | null;
  email: string | null;
  role: 'super_admin' | 'admin' | 'support';
  status: string;
  lastLoginAt: string | null;
}

const ROLE_LABEL = { super_admin: 'Super admin', admin: 'Admin', support: 'Customer support' } as const;
const ROLE_HELP = {
  admin: 'Runs the platform: approvals, orders, refunds and payouts, places, promo codes, complaints. Cannot manage staff or settings.',
  support: 'Handles complaints and customer questions and can look things up. Cannot move money, approve anyone or change orders.',
} as const;

/** Super admin only: add, change, suspend and remove the people who work in the admin area. */
export default function AdminStaffPage() {
  const { showToast } = useToast();
  const { user } = useAuthStore();
  const allowed = !!user?.permissions?.includes('staff.manage');
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [form, setForm] = useState({ fullName: '', email: '', role: 'support' as 'admin' | 'support', password: '' });

  const load = useCallback(async () => {
    try {
      const res = await apiClient.get('/admin/staff');
      setMembers(res.data.data);
    } catch (error) {
      showToast(apiErrorMessage(error, 'Failed to load staff'), 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    if (allowed) load();
    else setLoading(false);
  }, [allowed, load]);

  const run = async (id: string, action: () => Promise<unknown>, done: string) => {
    setBusy(id);
    try {
      await action();
      showToast(done, 'success');
      await load();
    } catch (error) {
      showToast(apiErrorMessage(error, 'That did not work'), 'error');
    } finally {
      setBusy(null);
    }
  };

  const create = async (e: FormEvent) => {
    e.preventDefault();
    await run('new', () => apiClient.post('/admin/staff', form), `${ROLE_LABEL[form.role]} account created`);
    setForm({ fullName: '', email: '', role: form.role, password: '' });
  };

  const resetPassword = (m: Member) => {
    const password = window.prompt(`New password for ${m.email} (at least 12 characters). Give it to them yourself; they are signed out now.`);
    if (!password) return;
    run(m.id, () => apiClient.post(`/admin/staff/${m.id}/password`, { password }), 'Password changed');
  };

  const remove = (m: Member) => {
    if (!window.confirm(`Remove ${m.email} from the staff? Their account becomes an ordinary customer account and they are signed out.`)) return;
    run(m.id, () => apiClient.delete(`/admin/staff/${m.id}`), 'Staff access removed');
  };

  return (
    <AdminShell>
      <div className="max-w-5xl mx-auto p-4 sm:p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Staff</h1>
          <p className="text-gray-500 mt-1">There is one super admin with full access. Add an admin to run operations, or a customer support person to resolve complaints.</p>
        </div>

        {!allowed ? (
          <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900" data-testid="staff-denied">
            Only the super admin can manage staff.
          </p>
        ) : (
          <>
            <form onSubmit={create} className="mb-8 grid gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:grid-cols-2" data-testid="staff-form">
              <h2 className="sm:col-span-2 text-lg font-semibold text-gray-900">Add a staff member</h2>
              <label className="text-sm text-gray-700">
                Full name
                <input required minLength={2} value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" name="fullName" />
              </label>
              <label className="text-sm text-gray-700">
                Email
                <input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" name="email" />
              </label>
              <label className="text-sm text-gray-700">
                Role
                <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as 'admin' | 'support' })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" name="role">
                  <option value="support">Customer support</option>
                  <option value="admin">Admin</option>
                </select>
                <span className="mt-1 block text-xs text-gray-500">{ROLE_HELP[form.role]}</span>
              </label>
              <label className="text-sm text-gray-700">
                First password (at least 12 characters)
                <input required minLength={12} type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" name="password" />
              </label>
              <div className="sm:col-span-2">
                <Button type="submit" disabled={busy === 'new'}>{busy === 'new' ? 'Creating…' : 'Create account'}</Button>
              </div>
            </form>

            <h2 className="mb-3 text-lg font-semibold text-gray-900">Everyone with admin access</h2>
            {loading ? (
              <p className="text-gray-500">Loading…</p>
            ) : (
              <ul className="grid gap-3" data-testid="staff-list">
                {members.map((m) => {
                  const locked = m.role === 'super_admin' || m.id === user?.id;
                  return (
                    <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm min-w-0">
                      <div className="min-w-0 max-w-full break-words">
                        <p className="font-semibold text-gray-900">
                          {m.name ?? m.email}{' '}
                          <span className="ms-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">{ROLE_LABEL[m.role]}</span>
                          {m.status !== 'active' && <span className="ms-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">{m.status}</span>}
                        </p>
                        <p className="text-xs text-gray-500">{m.email} · {m.lastLoginAt ? `last sign-in ${formatDateTime(m.lastLoginAt)}` : 'never signed in'}</p>
                      </div>
                      {locked ? (
                        <span className="text-xs text-gray-400">{m.role === 'super_admin' ? 'Cannot be changed' : 'This is you'}</span>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          <select
                            aria-label={`Role for ${m.email}`}
                            value={m.role}
                            disabled={busy === m.id}
                            onChange={(e) => run(m.id, () => apiClient.patch(`/admin/staff/${m.id}`, { role: e.target.value }), 'Role changed; they are signed out')}
                            className="rounded-lg border border-gray-300 px-2 py-1 text-sm"
                          >
                            <option value="support">Customer support</option>
                            <option value="admin">Admin</option>
                          </select>
                          <Button variant="outline" size="sm" disabled={busy === m.id} onClick={() => run(m.id, () => apiClient.post(`/admin/staff/${m.id}/status`, { status: m.status === 'active' ? 'suspended' : 'active' }), m.status === 'active' ? 'Suspended' : 'Reactivated')}>
                            {m.status === 'active' ? 'Suspend' : 'Reactivate'}
                          </Button>
                          <Button variant="outline" size="sm" disabled={busy === m.id} onClick={() => resetPassword(m)}>Reset password</Button>
                          <Button variant="outline" size="sm" disabled={busy === m.id} onClick={() => remove(m)}>Remove</Button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </div>
    </AdminShell>
  );
}
