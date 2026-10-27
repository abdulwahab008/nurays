'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { LoadError } from '@/components/ui/LoadError';
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
    open: 'bg-accent-soft text-accent-soft-ink',
    in_progress: 'bg-frozen-soft text-frozen-ink',
    resolved: 'bg-brand-soft text-brand-soft-ink',
    closed: 'bg-raised text-ink',
  };
  return map[status] || 'bg-raised text-ink';
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
  // Why the tickets could not be read; shown instead of "no tickets", which would say the person never wrote to support.
  const [loadError, setLoadError] = useState<unknown>(null);
  const [selected, setSelected] = useState<TicketDetail | null>(null);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);

  const loadTickets = async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const res = await apiClient.get('/support/tickets');
      if (res.data.success) setTickets(res.data.data.tickets || []);
    } catch (error) {
      setLoadError(error);
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
      <div className="bg-surface rounded-2xl border border-line p-6">
        <button onClick={() => setSelected(null)} className="text-sm text-muted hover:text-ink mb-4">
          {t('backToTickets')}
        </button>
        <div className="flex items-center gap-3 mb-1">
          <h3 className="text-lg font-semibold text-ink">{selected.subject}</h3>
          <span className={`px-2 py-1 rounded text-xs font-medium ${statusColor(selected.status)}`}>
            {statusLabel(selected.status)}
          </span>
        </div>
        <p className="text-xs text-muted mb-4" data-ltr>{selected.ticketNumber}</p>
        <p className="text-ink bg-raised rounded-xl p-4 mb-4">{selected.description}</p>

        <div className="space-y-4 mb-4">
          {selected.messages.map((m) => (
            <div
              key={m.id}
              className={`rounded-xl p-3 max-w-lg ${
                m.authorType === 'admin' ? 'bg-brand-soft ms-0' : 'bg-raised ms-auto'
              }`}
            >
              <p className="text-xs font-medium text-muted mb-1">{m.authorName}</p>
              <p className="text-sm text-ink">{m.message}</p>
              <p className="text-xs text-muted mt-1">{formatDateTime(m.createdAt)}</p>
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
              className="flex-1 px-4 py-2 border border-line rounded-xl bg-surface text-ink focus:ring-2 focus:ring-brand/30 focus:border-brand"
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
    return <div className="text-sm text-muted py-6">{t('loadingTickets')}</div>;
  }

  if (loadError && tickets.length === 0) {
    return <LoadError error={loadError} onRetry={loadTickets} title={t('loadTicketsFailed')} />;
  }

  if (tickets.length === 0) {
    return (
      <div className="bg-surface rounded-2xl border border-line p-8 text-center">
        <p className="text-muted">{t('noTickets')}</p>
      </div>
    );
  }

  return (
    <div className="bg-surface rounded-2xl border border-line divide-y divide-line">
      {tickets.map((ticket) => (
        <button
          key={ticket.id}
          onClick={() => openTicket(ticket.id)}
          className="w-full text-start px-6 py-4 hover:bg-raised transition-colors flex items-center justify-between"
        >
          <div>
            <p className="font-medium text-ink">{ticket.subject}</p>
            <p className="text-xs text-muted"><span data-ltr>{ticket.ticketNumber}</span> · {formatDateTime(ticket.createdAt)}</p>
          </div>
          <span className={`px-2 py-1 rounded text-xs font-medium ${statusColor(ticket.status)}`}>
            {statusLabel(ticket.status)}
          </span>
        </button>
      ))}
    </div>
  );
}
