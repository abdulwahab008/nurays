'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { AdminShell } from '@/components/layout/AdminShell';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { LoadError } from '@/components/ui/LoadError';
import { useDialogs } from '@/components/ui/Dialogs';
import { LoadingLine, PageHeader } from '@/components/admin/AdminListParts';
import { apiClient, apiErrorMessage } from '@/lib/api-client';
import { useAuthStore } from '@/lib/store/auth-store';
import { formatDateTime } from '@/components/admin/admin-dates';
import { useShallow } from 'zustand/react/shallow';

interface Member {
  id: string;
  name: string | null;
  email: string | null;
  role: 'super_admin' | 'admin' | 'support';
  status: string;
  lastLoginAt: string | null;
  /** Two-step sign-in is on (an authenticator app). */
  twoFactorEnabled?: boolean;
}

const ROLE_LABEL = { super_admin: 'Super admin', admin: 'Admin', support: 'Customer support' } as const;
const ROLE_HELP = {
  admin: 'Runs the platform: approvals, orders, refunds and payouts, places, promo codes, complaints. Cannot manage staff or settings.',
  support: 'Handles complaints and customer questions and can look things up. Cannot move money, approve anyone or change orders.',
} as const;

/** Super admin only: add, change, suspend and remove the people who work in the admin area. */
export default function AdminStaffPage() {
  const { showToast } = useToast();
  const { confirm: confirmDialog, ask: askDialog } = useDialogs();
  const { user } = useAuthStore(useShallow((s) => ({ user: s.user })));
  const allowed = !!user?.permissions?.includes('staff.manage');
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  // Why the staff could not be read; shown instead of an empty list.
  const [loadError, setLoadError] = useState<unknown>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ fullName: '', email: '', role: 'support' as 'admin' | 'support', password: '' });

  const load = useCallback(async () => {
    try {
      const res = await apiClient.get('/admin/staff');
      setMembers(res.data.data);
      setLoadError(null);
    } catch (error) {
      setLoadError(error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (allowed) load();
    else setLoading(false);
  }, [allowed, load]);

  const run = async (id: string, action: () => Promise<unknown>, done: string): Promise<boolean> => {
    setBusy(id);
    try {
      await action();
      showToast(done, 'success');
      await load();
      return true;
    } catch (error) {
      showToast(apiErrorMessage(error, 'That did not work'), 'error');
      return false;
    } finally {
      setBusy(null);
    }
  };

  const create = async (e: FormEvent) => {
    e.preventDefault();
    // What was typed stays when the account could not be made, so it can be corrected and sent again.
    if (!(await run('new', () => apiClient.post('/admin/staff', form), `${ROLE_LABEL[form.role]} account created`))) return;
    setForm({ fullName: '', email: '', role: form.role, password: '' });
    setAdding(false);
  };

  const resetPassword = async (m: Member) => {
    const password = (await askDialog({ title: 'New password', message: `New password for ${m.email} (at least 12 characters). Give it to them yourself; they are signed out now.`, label: 'New password', type: 'password', minLength: 12, confirmText: 'Set password' }));
    if (!password) return;
    run(m.id, () => apiClient.post(`/admin/staff/${m.id}/password`, { password }), 'Password changed');
  };

  const resetTwoFactor = async (m: Member) => {
    if (!(await confirmDialog({ title: 'Reset two-step sign-in?', message: `Only if ${m.email} lost both the phone and the backup codes. They are signed out and set their authenticator app up again at their next sign-in.`, confirmText: 'Reset' }))) return;
    run(m.id, () => apiClient.delete(`/admin/staff/${m.id}/two-factor`), 'Two-step sign-in reset');
  };

  const remove = async (m: Member) => {
    if (!(await confirmDialog({ title: 'Remove from the staff?', message: `Remove ${m.email} from the staff? Their account becomes an ordinary customer account and they are signed out.`, confirmText: 'Remove' }))) return;
    run(m.id, () => apiClient.delete(`/admin/staff/${m.id}`), 'Staff access removed');
  };

  return (
    <AdminShell>
      <div className="max-w-5xl">
        <PageHeader
          title="Staff"
          subtitle="There is one super admin with full access. Add an admin to run operations, or a customer support person to resolve complaints."
          actions={
            allowed && (
              <Button variant={adding ? 'outline' : 'default'} onClick={() => setAdding(!adding)} aria-expanded={adding}>
                {adding ? 'Close' : 'Add staff member'}
              </Button>
            )
          }
        />

        {!allowed ? (
          <p className="rounded-xl bg-accent-soft p-4 text-sm text-accent-soft-ink" data-testid="staff-denied">
            Only the super admin can manage staff.
          </p>
        ) : (
          <>
            {adding && (
            <form onSubmit={create} className="mb-8 grid gap-3 rounded-2xl border border-line bg-surface p-4 sm:grid-cols-2" data-testid="staff-form">
              <h2 className="sm:col-span-2 text-base font-semibold text-ink">Add a staff member</h2>
              <label className="text-sm font-medium text-ink">
                Full name
                <input required minLength={2} value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} className="nuray-input mt-1 w-full" name="fullName" />
              </label>
              <label className="text-sm font-medium text-ink">
                Email
                <input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="nuray-input mt-1 w-full" name="email" />
              </label>
              <label className="text-sm font-medium text-ink">
                Role
                <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as 'admin' | 'support' })} className="nuray-input mt-1 w-full" name="role">
                  <option value="support">Customer support</option>
                  <option value="admin">Admin</option>
                </select>
                <span className="mt-1 block text-xs font-normal text-muted">{ROLE_HELP[form.role]}</span>
              </label>
              <label className="text-sm font-medium text-ink">
                First password (at least 12 characters)
                <input required minLength={12} type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="nuray-input mt-1 w-full" name="password" />
              </label>
              <div className="sm:col-span-2">
                <Button type="submit" disabled={busy === 'new'}>{busy === 'new' ? 'Creating…' : 'Create account'}</Button>
              </div>
            </form>
            )}

            <h2 className="mb-3 text-sm font-semibold text-ink">Everyone with admin access</h2>
            {loading ? (
              <LoadingLine text="Loading the staff" />
            ) : loadError && members.length === 0 ? (
              <LoadError error={loadError} onRetry={load} title="We couldn't load the staff" />
            ) : (
              <ul className="divide-y divide-line border-y border-line" data-testid="staff-list">
                {members.map((m) => {
                  const locked = m.role === 'super_admin' || m.id === user?.id;
                  return (
                    <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 py-4 min-w-0">
                      <div className="min-w-0 max-w-full break-words">
                        <p className="font-semibold text-ink">
                          {m.name ?? m.email}{' '}
                          <span className="ms-1 rounded-full bg-raised px-2 py-0.5 text-xs font-medium text-muted">{ROLE_LABEL[m.role]}</span>
                          {m.status !== 'active' && <span className="ms-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">{m.status === 'suspended' ? 'Suspended' : 'Inactive'}</span>}
                          <span className={`ms-1 rounded-full px-2 py-0.5 text-xs font-medium ${m.twoFactorEnabled ? 'bg-brand-soft text-brand-soft-ink' : 'bg-accent-soft text-accent-soft-ink'}`} data-testid="staff-2fa">
                            {m.twoFactorEnabled ? 'Two-step on' : 'Two-step not set up'}
                          </span>
                        </p>
                        <p className="text-xs text-muted break-all">{m.email} · {m.lastLoginAt ? `last sign-in ${formatDateTime(m.lastLoginAt)}` : 'never signed in'}</p>
                      </div>
                      {locked ? (
                        <span className="text-xs text-muted">{m.role === 'super_admin' ? 'Cannot be changed' : 'This is you'}</span>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          <select
                            aria-label={`Role for ${m.email}`}
                            value={m.role}
                            disabled={busy === m.id}
                            onChange={(e) => run(m.id, () => apiClient.patch(`/admin/staff/${m.id}`, { role: e.target.value }), 'Role changed; they are signed out')}
                            className="nuray-input text-sm"
                          >
                            <option value="support">Customer support</option>
                            <option value="admin">Admin</option>
                          </select>
                          <Button variant="outline" disabled={busy === m.id} onClick={() => run(m.id, () => apiClient.post(`/admin/staff/${m.id}/status`, { status: m.status === 'active' ? 'suspended' : 'active' }), m.status === 'active' ? 'Suspended' : 'Reactivated')}>
                            {m.status === 'active' ? 'Suspend' : 'Reactivate'}
                          </Button>
                          <Button variant="outline" disabled={busy === m.id} onClick={() => resetPassword(m)}>Reset password</Button>
                          {m.twoFactorEnabled && (
                            <Button variant="outline" disabled={busy === m.id} onClick={() => resetTwoFactor(m)}>Reset two-step</Button>
                          )}
                          <Button variant="outline" className="text-red-700" disabled={busy === m.id} onClick={() => remove(m)}>Remove</Button>
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
