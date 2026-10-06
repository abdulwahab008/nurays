'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { UserLayout } from '@/components/layout/UserLayout';
import { useToast } from '@/components/ui/toast';
import { apiClient, apiErrorMessage } from '@/lib/api-client';
import { useAuthStore } from '@/lib/store/auth-store';

interface Queue {
  key: string;
  label: string;
  href: string;
  count: number;
  oldestWaitingSince: string | null;
}

const ROLE_LABEL: Record<string, string> = { super_admin: 'Super admin', admin: 'Admin', support: 'Support' };

function waiting(since: string | null) {
  if (!since) return null;
  const mins = Math.max(0, Math.round((Date.now() - new Date(since).getTime()) / 60000));
  if (mins < 60) return `${mins} min`;
  const hours = Math.round(mins / 60);
  return hours < 48 ? `${hours} h` : `${Math.round(hours / 24)} days`;
}

/** Everything that needs a staff decision, in one place: what this role can act on, with how long the oldest has waited. */
export default function AdminApprovalsPage() {
  const { showToast } = useToast();
  const { user } = useAuthStore();
  const [queues, setQueues] = useState<Queue[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await apiClient.get('/admin/approvals');
      setQueues(res.data.data.items);
      setTotal(res.data.data.total);
    } catch (error) {
      showToast(apiErrorMessage(error, 'Failed to load approvals'), 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    load();
    const timer = setInterval(load, 30000);
    return () => clearInterval(timer);
  }, [load]);

  return (
    <UserLayout showSidebar showNavbar>
      <div className="max-w-4xl mx-auto p-4 sm:p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Approvals</h1>
          <p className="text-gray-500 mt-1">
            Everything a kitchen, rider or customer has sent that needs a decision.
            {user?.staffRole ? ` You are signed in as ${ROLE_LABEL[user.staffRole] ?? user.staffRole}.` : ''}
          </p>
        </div>

        {loading ? (
          <p className="text-gray-500">Loading…</p>
        ) : (
          <>
            <p className="mb-4 text-sm font-semibold text-gray-700" data-testid="approvals-total">
              {total === 0 ? 'Nothing is waiting. All caught up.' : `${total} waiting for you`}
            </p>
            <ul className="grid gap-3" data-testid="approval-queues">
              {queues.map((q) => (
                <li key={q.key}>
                  <Link
                    href={q.href}
                    className="flex items-center justify-between gap-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm hover:shadow-md transition-shadow"
                  >
                    <div>
                      <p className="font-semibold text-gray-900">{q.label}</p>
                      <p className="text-xs text-gray-500">{q.count > 0 ? `Oldest has waited ${waiting(q.oldestWaitingSince)}` : 'Nothing waiting'}</p>
                    </div>
                    <span
                      className={`min-w-10 text-center rounded-full px-3 py-1 text-sm font-bold ${q.count > 0 ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-500'}`}
                      data-testid={`queue-${q.key}`}
                    >
                      {q.count}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </UserLayout>
  );
}
