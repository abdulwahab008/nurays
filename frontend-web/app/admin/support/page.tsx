'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { UserLayout } from '@/components/layout/UserLayout';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useAuthStore } from '@/lib/store/auth-store';
import { apiClient } from '@/lib/api-client';
import { formatDateTime } from '@/lib/utils';

interface TicketSummary {
  id: string;
  ticketNumber: string;
  subject: string;
  category: string;
  priority: string;
  status: string;
  customerName: string;
  createdAt: string;
}

interface TicketMessage {
  id: string;
  message: string;
  authorType: string;
  authorName: string;
  createdAt: string;
}

interface TicketDetail extends TicketSummary {
  description: string;
  messages: TicketMessage[];
}

const FILTERS = ['open', 'in_progress', 'resolved', 'closed', 'all'] as const;

const statusColor = (status: string) => {
  const map: Record<string, string> = {
    open: 'bg-amber-100 text-amber-800',
    in_progress: 'bg-blue-100 text-blue-800',
    resolved: 'bg-green-100 text-green-800',
    closed: 'bg-gray-100 text-gray-700',
  };
  return map[status] || 'bg-gray-100 text-gray-700';
};

export default function AdminSupportPage() {
  const router = useRouter();
  const { isAuthenticated, user } = useAuthStore();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [tickets, setTickets] = useState<TicketSummary[]>([]);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('open');
  const [selected, setSelected] = useState<TicketDetail | null>(null);
  const [reply, setReply] = useState('');
  const [nextStatus, setNextStatus] = useState('in_progress');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/admin/login');
      return;
    }
    if (user?.user_type !== 'admin' && user?.userType !== 'admin') {
      router.push('/products');
      showToast('Access denied. Admin privileges required.', 'error');
      return;
    }
    loadTickets();
  }, [isAuthenticated, user, router, filter]);

  const loadTickets = async () => {
    try {
      setLoading(true);
      const res = await apiClient.get(`/admin/support/tickets${filter !== 'all' ? `?status=${filter}` : ''}`);
      if (res.data.success) setTickets(res.data.data.tickets || []);
    } catch (error: any) {
      showToast(error.response?.data?.error?.message || 'Failed to load tickets', 'error');
    } finally {
      setLoading(false);
    }
  };

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
      });
      if (res.data.success) {
        setSelected(res.data.data);
        setReply('');
        loadTickets();
      }
    } catch (error: any) {
      showToast(error.response?.data?.error?.message || 'Failed to send reply', 'error');
    } finally {
      setSending(false);
    }
  };

  if (!isAuthenticated || (user?.user_type !== 'admin' && user?.userType !== 'admin')) {
    return null;
  }

  return (
    <UserLayout showSidebar={true} showNavbar={true}>
      <div className="max-w-6xl mx-auto">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Support Tickets</h1>
            <p className="text-gray-600 mt-1">Reply to and resolve customer support requests</p>
          </div>
          <Button variant="outline" onClick={loadTickets} disabled={loading}>
            {loading ? 'Loading...' : 'Refresh'}
          </Button>
        </div>

        {selected ? (
          <div className="bg-white rounded-lg shadow-sm p-6">
            <button onClick={() => setSelected(null)} className="text-sm text-gray-500 hover:text-gray-700 mb-4">
              ← Back to all tickets
            </button>
            <div className="flex items-center gap-3 mb-1">
              <h2 className="text-lg font-semibold text-gray-900">{selected.subject}</h2>
              <span className={`px-2 py-1 rounded text-xs font-medium ${statusColor(selected.status)}`}>
                {selected.status.replace('_', ' ')}
              </span>
            </div>
            <p className="text-xs text-gray-400 mb-4">
              {selected.ticketNumber} · {selected.customerName} · {selected.category}
            </p>
            <p className="text-gray-700 bg-gray-50 rounded-xl p-4 mb-4">{selected.description}</p>

            <div className="space-y-4 mb-4">
              {selected.messages.map((m) => (
                <div
                  key={m.id}
                  className={`rounded-xl p-3 max-w-lg ${m.authorType === 'admin' ? 'bg-green-50 ml-auto' : 'bg-gray-50'}`}
                >
                  <p className="text-xs font-medium text-gray-500 mb-1">{m.authorName}</p>
                  <p className="text-sm text-gray-800">{m.message}</p>
                  <p className="text-xs text-gray-400 mt-1">{formatDateTime(m.createdAt)}</p>
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <textarea
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                rows={3}
                placeholder="Type your reply..."
                className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500"
              />
              <div className="flex items-center gap-3">
                <select
                  value={nextStatus}
                  onChange={(e) => setNextStatus(e.target.value)}
                  className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
                >
                  <option value="open">Open</option>
                  <option value="in_progress">In Progress</option>
                  <option value="resolved">Resolved</option>
                  <option value="closed">Closed</option>
                </select>
                <Button onClick={sendReply} disabled={sending || !reply.trim()}>
                  {sending ? 'Sending...' : 'Send Reply'}
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="flex gap-2 mb-6 flex-wrap">
              {FILTERS.map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-colors ${
                    filter === f ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {f.replace('_', ' ')}
                </button>
              ))}
            </div>

            {loading ? (
              <div className="text-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto mb-4"></div>
                <p className="text-gray-600">Loading tickets...</p>
              </div>
            ) : tickets.length === 0 ? (
              <div className="bg-white rounded-lg shadow-sm p-12 text-center">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">No tickets here</h3>
                <p className="text-gray-600">Nothing matches this filter right now.</p>
              </div>
            ) : (
              <div className="bg-white rounded-lg shadow-sm divide-y divide-gray-100">
                {tickets.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => openTicket(t.id)}
                    className="w-full text-left px-6 py-4 hover:bg-gray-50 transition-colors flex items-center justify-between"
                  >
                    <div>
                      <p className="font-medium text-gray-900">{t.subject}</p>
                      <p className="text-xs text-gray-400">
                        {t.ticketNumber} · {t.customerName} · {formatDateTime(t.createdAt)}
                      </p>
                    </div>
                    <span className={`px-2 py-1 rounded text-xs font-medium ${statusColor(t.status)}`}>
                      {t.status.replace('_', ' ')}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </UserLayout>
  );
}
