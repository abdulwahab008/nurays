'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { formatDateTime } from '@/lib/utils';
import { useT } from '@/lib/i18n';
import { accountMessages } from '@/lib/i18n/messages/account';

interface TicketSummary {
  id: string;
  ticketNumber: string;
  subject: string;
  category: string;
  priority: string;
  status: string;
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

const statusColor = (status: string) => {
  const map: Record<string, string> = {
    open: 'bg-amber-100 text-amber-800',
    in_progress: 'bg-blue-100 text-blue-800',
    resolved: 'bg-green-100 text-green-800',
    closed: 'bg-gray-100 text-gray-700',
  };
  return map[status] || 'bg-gray-100 text-gray-700';
};

export default function MyTickets() {
  const { showToast } = useToast();
  const t = useT(accountMessages);
  const statusLabel = (status: string) => {
    const key = `ticketStatus.${status}` as keyof typeof accountMessages.en;
    return key in accountMessages.en ? t(key) : status.replace('_', ' ');
  };
  const [tickets, setTickets] = useState<TicketSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<TicketDetail | null>(null);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);

  const loadTickets = async () => {
    try {
      setLoading(true);
      const res = await apiClient.get('/support/tickets');
      if (res.data.success) setTickets(res.data.data.tickets || []);
    } catch {
      showToast(t('loadTicketsFailed'), 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTickets();
  }, []);

  const openTicket = async (id: string) => {
    try {
      const res = await apiClient.get(`/support/tickets/${id}`);
      if (res.data.success) setSelected(res.data.data);
    } catch {
      showToast(t('loadTicketFailed'), 'error');
    }
  };

  const sendReply = async () => {
    if (!selected || !reply.trim()) return;
    try {
      setSending(true);
      const res = await apiClient.post(`/support/tickets/${selected.id}/messages`, { message: reply.trim() });
      if (res.data.success) {
        setSelected(res.data.data);
        setReply('');
        loadTickets();
      }
    } catch {
      showToast(t('sendReplyFailed'), 'error');
    } finally {
      setSending(false);
    }
  };

  if (selected) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 p-6">
        <button onClick={() => setSelected(null)} className="text-sm text-gray-500 hover:text-gray-700 mb-4">
          {t('backToTickets')}
        </button>
        <div className="flex items-center gap-3 mb-1">
          <h3 className="text-lg font-semibold text-gray-900">{selected.subject}</h3>
          <span className={`px-2 py-1 rounded text-xs font-medium ${statusColor(selected.status)}`}>
            {statusLabel(selected.status)}
          </span>
        </div>
        <p className="text-xs text-gray-400 mb-4" data-ltr>{selected.ticketNumber}</p>
        <p className="text-gray-700 bg-gray-50 rounded-xl p-4 mb-4">{selected.description}</p>

        <div className="space-y-4 mb-4">
          {selected.messages.map((m) => (
            <div
              key={m.id}
              className={`rounded-xl p-3 max-w-lg ${
                m.authorType === 'admin' ? 'bg-green-50 ms-0' : 'bg-gray-50 ms-auto'
              }`}
            >
              <p className="text-xs font-medium text-gray-500 mb-1">{m.authorName}</p>
              <p className="text-sm text-gray-800">{m.message}</p>
              <p className="text-xs text-gray-400 mt-1">{formatDateTime(m.createdAt)}</p>
            </div>
          ))}
        </div>

        {selected.status !== 'closed' && (
          <div className="flex gap-2">
            <input
              type="text"
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              placeholder={t('typeReply')}
              className="flex-1 px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500"
            />
            <Button onClick={sendReply} disabled={sending || !reply.trim()}>
              {sending ? t('sendingDots') : t('send')}
            </Button>
          </div>
        )}
      </div>
    );
  }

  if (loading) {
    return <div className="text-sm text-gray-500 py-6">{t('loadingTickets')}</div>;
  }

  if (tickets.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
        <p className="text-gray-500">{t('noTickets')}</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-100">
      {tickets.map((ticket) => (
        <button
          key={ticket.id}
          onClick={() => openTicket(ticket.id)}
          className="w-full text-start px-6 py-4 hover:bg-gray-50 transition-colors flex items-center justify-between"
        >
          <div>
            <p className="font-medium text-gray-900">{ticket.subject}</p>
            <p className="text-xs text-gray-400"><span data-ltr>{ticket.ticketNumber}</span> · {formatDateTime(ticket.createdAt)}</p>
          </div>
          <span className={`px-2 py-1 rounded text-xs font-medium ${statusColor(ticket.status)}`}>
            {statusLabel(ticket.status)}
          </span>
        </button>
      ))}
    </div>
  );
}
