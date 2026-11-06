'use client';

import { useCallback, useState, useEffect } from 'react';
import { ChevronLeft } from 'lucide-react';
import { DashboardLayout, adminSidebarFor } from '@/components/layout/DashboardShell';
import { Button } from '@/components/ui/button';
import { AdminFilterTabs } from '@/components/admin/AdminFilterTabs';
import { LoadingLine, PhoneText, SearchForm, StatusPill, type PillTone } from '@/components/admin/AdminListParts';
import { useToast } from '@/components/ui/toast';
import { LoadError } from '@/components/ui/LoadError';
import { useAuthStore } from '@/lib/store/auth-store';
import { apiClient, apiErrorMessage } from '@/lib/api-client';
import { formatDateTime } from '@/lib/utils';
import { useShallow } from 'zustand/react/shallow';

interface TicketSummary {
  id: string;
  ticketNumber: string;
  subject: string;
  category: string;
  priority: string;
  status: string;
  customerName: string;
  orderNumber?: string | null;
  order?: { id: string; orderNumber: string } | null;
  assignedTo?: string | null;
  createdAt: string;
}

interface TicketMessage {
  id: string;
  message: string;
  authorType: string;
  authorName: string;
  isInternal?: boolean;
  createdAt: string;
}

interface TicketDetail extends TicketSummary {
  description: string;
  customerEmail?: string | null;
  customerPhone?: string | null;
  messages: TicketMessage[];
}

type Filter = 'open' | 'in_progress' | 'resolved' | 'closed' | 'all';
const FILTERS: Filter[] = ['open', 'in_progress', 'resolved', 'closed', 'all'];
const STATUS_LABEL: Record<string, string> = { open: 'Open', in_progress: 'In progress', resolved: 'Resolved', closed: 'Closed', all: 'All' };
const STATUS_TONE: Record<string, PillTone> = { open: 'waiting', in_progress: 'waiting', resolved: 'good', closed: 'neutral' };
const CATEGORY_LABEL: Record<string, string> = {
  order_issue: 'Order issue',
  payment: 'Payment',
  delivery: 'Delivery',
  refund: 'Refund',
  account: 'Account',
  product_quality: 'Food quality',
  other: 'Other',
};
const PRIORITY_LABEL: Record<string, string> = { urgent: 'Urgent', high: 'High priority', medium: 'Medium priority', low: 'Low priority' };
const words = (map: Record<string, string>, v: string) => map[v] ?? v.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

export default function AdminSupportPage() {
  const { isAuthenticated, user } = useAuthStore(useShallow((s) => ({ isAuthenticated: s.isAuthenticated, user: s.user })));
  const isAdmin = user?.user_type === 'admin' || user?.userType === 'admin';
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  // Why the tickets could not be read; shown instead of "No tickets here", which would be untrue.
  const [loadError, setLoadError] = useState<unknown>(null);
  const [tickets, setTickets] = useState<TicketSummary[]>([]);
  const [filter, setFilter] = useState<Filter>('open');
  const [selected, setSelected] = useState<TicketDetail | null>(null);
  const [reply, setReply] = useState('');
  const [nextStatus, setNextStatus] = useState('in_progress');
  const [sending, setSending] = useState(false);
  const [internal, setInternal] = useState(false);
  const [priority, setPriority] = useState('');
  const [searchApplied, setSearchApplied] = useState('');

  const loadTickets = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiClient.get('/admin/support/tickets', { params: { status: filter !== 'all' ? filter : undefined, priority: priority || undefined, search: searchApplied || undefined } });
      if (res.data.success) setTickets(res.data.data.tickets || []);
      setLoadError(null);
    } catch (error) {
      // The tickets on the screen belong to the filter before this change, so they go with the failure.
      setTickets([]);
      setLoadError(error);
    } finally {
      setLoading(false);
    }
  }, [filter, priority, searchApplied]);

  // Who may open this page is decided by app/admin/layout.tsx.
  useEffect(() => {
    if (isAuthenticated && isAdmin) void loadTickets();
  }, [isAuthenticated, isAdmin, loadTickets]);

  const openTicket = async (id: string) => {
    try {
      const res = await apiClient.get(`/admin/support/tickets/${id}`);
      if (res.data.success) {
        setSelected(res.data.data);
        setNextStatus(res.data.data.status === 'open' ? 'in_progress' : res.data.data.status);
      }
    } catch {
      showToast('Failed to load ticket', 'error');
    }
  };

  const sendReply = async () => {
    if (!selected || !reply.trim()) return;
    try {
      setSending(true);
      const res = await apiClient.post(`/admin/support/tickets/${selected.id}/reply`, {
        message: reply.trim(),
        status: nextStatus,
        internal,
      });
      if (res.data.success) {
        setSelected(res.data.data);
        setReply('');
        setInternal(false);
        loadTickets();
      }
    } catch (error) {
      showToast(apiErrorMessage(error, 'Failed to send reply'), 'error');
    } finally {
      setSending(false);
    }
  };

  if (!isAuthenticated || !isAdmin) return null;

  return (
    <DashboardLayout title="Support" subtitle="Reply to and resolve what customers send." sidebarItems={adminSidebarFor(user?.permissions)} userType="admin">
      <div className="max-w-5xl">
        {selected ? (
          <div data-testid="ticket-detail">
            <button onClick={() => setSelected(null)} className="-mt-2 mb-3 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-brand-ink hover:underline">
              <ChevronLeft aria-hidden="true" className="h-4 w-4 rtl:rotate-180" />
              All tickets
            </button>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-ink">{selected.subject}</h2>
              <StatusPill tone={STATUS_TONE[selected.status]}>{words(STATUS_LABEL, selected.status)}</StatusPill>
            </div>
            <p className="mt-1 text-sm text-muted">
              {selected.ticketNumber} · {words(CATEGORY_LABEL, selected.category)} · {words(PRIORITY_LABEL, selected.priority)}
              {selected.order && (
                <>
                  {' · '}
                  <a href={`/admin/orders/${selected.order.id}`} className="font-medium text-brand-ink hover:underline" data-testid="ticket-order-link">
                    Order #{selected.order.orderNumber}
                  </a>
                </>
              )}
            </p>

            <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm" data-testid="ticket-customer">
              <dt className="text-muted">Customer</dt>
              <dd className="text-ink">{selected.customerName || 'Name not given'}</dd>
              <dt className="text-muted">Phone</dt>
              <dd>
                <PhoneText phone={selected.customerPhone} />
              </dd>
              <dt className="text-muted">Email</dt>
              <dd className="min-w-0 break-all">
                {selected.customerEmail ? (
                  <a href={`mailto:${selected.customerEmail}`} className="text-brand-ink hover:underline">
                    {selected.customerEmail}
                  </a>
                ) : (
                  <span className="text-muted">Not given</span>
                )}
              </dd>
              <dt className="text-muted">Sent</dt>
              <dd className="text-ink">{formatDateTime(selected.createdAt)}</dd>
            </dl>

            <p className="mt-4 whitespace-pre-wrap rounded-xl bg-raised p-4 text-sm text-ink">{selected.description}</p>

            <ul className="mt-4 space-y-3">
              {selected.messages.map((m) => (
                <li
                  key={m.id}
                  className={`max-w-lg rounded-xl p-3 ${
                    m.isInternal ? 'ms-auto border border-dashed border-line-strong bg-accent-soft' : m.authorType === 'admin' ? 'ms-auto bg-brand-soft' : 'bg-raised'
                  }`}
                >
                  <p className="mb-1 text-xs font-medium text-muted">
                    {m.authorName}
                    {m.isInternal ? ' · internal note, the customer cannot see it' : ''}
                  </p>
                  <p className="whitespace-pre-wrap text-sm text-ink">{m.message}</p>
                  <p className="mt-1 text-xs text-muted">{formatDateTime(m.createdAt)}</p>
                </li>
              ))}
            </ul>

            <div className="mt-5 space-y-3 border-t border-line pt-4">
              <textarea
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                rows={3}
                placeholder={internal ? 'A note for other admins' : 'Your reply to the customer'}
                aria-label="Reply"
                className="w-full rounded-xl border border-line-strong bg-surface px-4 py-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand/40"
              />
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-sm text-muted">
                  Status after sending
                  <select
                    value={nextStatus}
                    onChange={(e) => setNextStatus(e.target.value)}
                    className="min-h-11 rounded-xl border border-line-strong bg-surface px-3 text-sm text-ink"
                  >
                    <option value="open">Open</option>
                    <option value="in_progress">In progress</option>
                    <option value="resolved">Resolved</option>
                    <option value="closed">Closed</option>
                  </select>
                </label>
                <label className="flex min-h-11 items-center gap-2 text-sm text-muted">
                  <input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} data-testid="ticket-internal" className="h-4 w-4" /> Internal note
                </label>
                <Button className="min-h-11 sm:ms-auto" onClick={sendReply} disabled={sending || !reply.trim()}>
                  {sending ? 'Sending…' : internal ? 'Save note' : 'Send reply'}
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <>
            <AdminFilterTabs
              label="Ticket status"
              value={filter}
              onChange={setFilter}
              tabs={FILTERS.map((f) => ({ id: f, label: STATUS_LABEL[f] }))}
              className="mb-4"
            />
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="min-h-11 rounded-xl border border-line-strong bg-surface px-3 text-sm text-ink"
                data-testid="ticket-priority"
                aria-label="Priority"
              >
                <option value="">Any priority</option>
                <option value="urgent">Urgent</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
              <div className="sm:ms-auto" data-testid="ticket-search">
                <SearchForm placeholder="Subject, ticket, order or customer" label="Search tickets" onSearch={setSearchApplied} />
              </div>
            </div>

            {loading && tickets.length === 0 ? (
              <LoadingLine text="Loading tickets" />
            ) : loadError ? (
              <LoadError error={loadError} onRetry={loadTickets} title="We couldn't load the tickets" />
            ) : tickets.length === 0 ? (
              <p className="py-6 text-sm text-muted">
                {searchApplied || priority
                  ? 'No ticket matches this search.'
                  : filter === 'open'
                    ? 'No open tickets. New complaints from customers show up here.'
                    : `No ${STATUS_LABEL[filter].toLowerCase()} tickets.`}
              </p>
            ) : (
              <ul className="divide-y divide-line border-y border-line">
                {tickets.map((t) => (
                  <li key={t.id}>
                    <button onClick={() => openTicket(t.id)} className="flex min-h-[72px] w-full items-center gap-3 py-3 text-start hover:bg-raised">
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-ink">{t.subject}</span>
                        <span className="block text-xs text-muted">
                          {t.customerName} · {words(CATEGORY_LABEL, t.category)} · {words(PRIORITY_LABEL, t.priority)}
                          {t.orderNumber ? ` · Order #${t.orderNumber}` : ''}
                        </span>
                        <span className="block text-xs text-muted">
                          {t.ticketNumber} · {formatDateTime(t.createdAt)}
                        </span>
                      </span>
                      <StatusPill tone={STATUS_TONE[t.status]}>{words(STATUS_LABEL, t.status)}</StatusPill>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
