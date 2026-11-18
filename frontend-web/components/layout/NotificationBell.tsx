'use client';

/**
 * The bell in the top bar and its panel of recent notifications, the same in the customers' bar (SiteHeader) and the staff
 * bar (DashboardNavbar). `allHref` is the full list's page; without it (a rider has none) the panel has no footer.
 */
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { AlertCircle, Bell, CheckCheck, ChevronRight, Info, Package, Tag, Truck } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useAuthStore } from '@/lib/store/auth-store';
import { apiClient, apiErrorMessage } from '@/lib/api-client';
import { useSocket } from '@/lib/hooks/use-socket';
import { useT } from '@/lib/i18n';
import { shellMessages } from '@/lib/i18n/messages/shell';
import { LoadError } from '@/components/ui/LoadError';
import { useToast } from '@/components/ui/toast';

interface BellNotification {
  id: string;
  type?: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  actionUrl?: string | null;
}

const iconButton = 'relative grid h-11 w-11 shrink-0 place-items-center rounded-lg transition-colors';
// On a phone the panel spans the screen under the bar (anchored to the button it would run off the edge); from sm it hangs
// under its button.
const panel =
  'fixed inset-x-3 top-[calc(var(--header-offset)+0.5rem)] sm:absolute sm:inset-x-auto sm:top-full sm:end-0 sm:mt-2 sm:w-96 bg-surface rounded-2xl shadow-[var(--shadow-hover)] border border-line z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150';

function NotificationIcon({ type }: { type?: string }) {
  switch (type) {
    case 'order':
      return <Package className="w-4 h-4" />;
    case 'promo':
      return <Tag className="w-4 h-4" />;
    case 'delivery':
      return <Truck className="w-4 h-4" />;
    case 'warning':
      return <AlertCircle className="w-4 h-4" />;
    default:
      return <Info className="w-4 h-4" />;
  }
}

type RelativeKey = 'justNow' | 'minutesAgo' | 'hoursAgo' | 'yesterday' | 'daysAgo';

function relativeTime(dateStr: string, t: (key: RelativeKey, vars?: { n: number }) => string) {
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return '';
  const diffMinutes = Math.floor((Date.now() - date.getTime()) / 60000);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);
  if (diffMinutes < 1) return t('justNow');
  if (diffMinutes < 60) return t('minutesAgo', { n: diffMinutes });
  if (diffHours < 24) return t('hoursAgo', { n: diffHours });
  if (diffDays === 1) return t('yesterday');
  if (diffDays < 7) return t('daysAgo', { n: diffDays });
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function NotificationBell({ allHref }: { allHref?: string }) {
  const router = useRouter();
  const t = useT(shellMessages);
  const { showToast } = useToast();
  const { user } = useAuthStore(useShallow((s) => ({ user: s.user })));
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [recent, setRecent] = useState<BellNotification[]>([]);
  // Why the recent notifications could not be read; shown instead of "All caught up", which would be untrue.
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  // The unread count, so the red dot shows only when there is something unread.
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    apiClient
      .get('/notifications', { params: { limit: 1 } })
      .then((res) => {
        if (!cancelled) setUnreadCount(res.data?.data?.unreadCount ?? 0);
      })
      .catch(() => {
        if (!cancelled) setUnreadCount(0);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  // A new notification arrives live: the bell counts it straight away.
  const { socket } = useSocket();
  useEffect(() => {
    if (!socket) return;
    const onNew = () => setUnreadCount((n) => n + 1);
    socket.on('notification:new', onNew);
    return () => {
      socket.off('notification:new', onNew);
    };
  }, [socket]);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (box.current && !box.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const loadRecent = async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const res = await apiClient.get('/notifications', { params: { limit: 5 } });
      if (res.data?.success && res.data?.data) {
        const list = res.data.data.notifications || [];
        setRecent(
          (list as Array<Partial<BellNotification> & { id: string; title: string; message: string; createdAt: string; link?: string }>).map((n) => ({
            id: n.id,
            type: n.type || 'system',
            title: n.title,
            message: n.message,
            isRead: Boolean(n.isRead),
            createdAt: n.createdAt,
            actionUrl: n.actionUrl || n.link || null,
          })),
        );
        setUnreadCount(res.data.data.unreadCount ?? 0);
      }
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  const toggle = () => {
    if (!open) loadRecent();
    setOpen((v) => !v);
  };

  const markRead = async (id: string, actionUrl?: string | null) => {
    try {
      await apiClient.patch(`/notifications/${id}/read`);
      setRecent((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (err) {
      showToast(apiErrorMessage(err, t('markReadFailed')), 'error');
    }
    if (actionUrl) {
      setOpen(false);
      router.push(actionUrl);
    }
  };

  const markAllRead = async () => {
    try {
      await apiClient.patch('/notifications/read-all');
      setRecent((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch (err) {
      showToast(apiErrorMessage(err, t('markAllReadFailed')), 'error');
    }
  };

  return (
    <div className="relative" ref={box}>
      <button
        type="button"
        onClick={toggle}
        aria-label={t('notifications')}
        aria-expanded={open}
        className={`${iconButton} ${open ? 'bg-raised text-ink' : 'text-muted hover:bg-raised hover:text-ink'}`}
        title={t('notifications')}
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && <span className="absolute top-2.5 end-2.5 w-2 h-2 bg-red-500 rounded-full" aria-hidden="true" data-testid="bell-unread" />}
      </button>

      {open && (
        <div data-top-panel className={panel}>
          <div className="flex min-h-12 items-center justify-between ps-4 pe-2 border-b border-line">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm text-ink">{t('notifications')}</span>
              {unreadCount > 0 && !error && (
                <span className="px-2 py-0.5 text-[11px] font-bold rounded-full bg-accent-soft text-accent-soft-ink">{t('newCount', { count: unreadCount })}</span>
              )}
            </div>
            {/* Offline the count is stale and marking would fail: neither is offered until the list loads. */}
            {unreadCount > 0 && !error && (
              <button
                type="button"
                onClick={markAllRead}
                className="min-h-11 px-2 rounded-lg text-sm font-medium text-brand-ink hover:bg-raised flex items-center gap-1.5 transition-colors"
              >
                <CheckCheck className="w-4 h-4" aria-hidden="true" />
                <span>{t('markAllRead')}</span>
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto divide-y divide-line">
            {loading ? (
              <div className="py-8 flex flex-col items-center justify-center gap-2 text-muted">
                <div className="w-5 h-5 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
                <span className="text-xs">{t('loadingUpdates')}</span>
              </div>
            ) : error && recent.length === 0 ? (
              <LoadError compact plain error={error} onRetry={loadRecent} />
            ) : recent.length === 0 ? (
              <p className="py-10 px-4 text-center text-sm text-muted">{t('noNotifications')}</p>
            ) : (
              recent.map((notif) => (
                <button
                  type="button"
                  key={notif.id}
                  onClick={() => markRead(notif.id, notif.actionUrl)}
                  className="w-full p-3.5 flex items-start gap-3 text-start hover:bg-raised transition-colors"
                >
                  <span
                    aria-hidden="true"
                    className={`w-8 h-8 rounded-full grid place-items-center shrink-0 ${notif.type === 'warning' ? 'bg-red-50 text-red-700' : 'bg-raised text-muted'}`}
                  >
                    <NotificationIcon type={notif.type} />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="flex items-center justify-between gap-2 mb-0.5">
                      <span className={`text-sm truncate ${!notif.isRead ? 'font-semibold text-ink' : 'text-muted'}`}>{notif.title}</span>
                      <span className="text-xs text-muted shrink-0">{relativeTime(notif.createdAt, t)}</span>
                    </span>
                    <span className="block text-xs text-muted line-clamp-2 leading-relaxed">{notif.message}</span>
                  </span>
                  {!notif.isRead && (
                    <span className="w-2 h-2 rounded-full bg-brand-600 shrink-0 mt-1.5">
                      <span className="sr-only">{t('unread')}</span>
                    </span>
                  )}
                </button>
              ))
            )}
          </div>

          {allHref && (
            <div className="border-t border-line">
              <Link
                href={allHref}
                onClick={() => setOpen(false)}
                className="w-full min-h-12 px-3 text-sm font-medium text-brand-ink hover:bg-raised transition-colors flex items-center justify-center gap-1"
              >
                <span>{t('viewAllNotifications')}</span>
                <ChevronRight className="rtl:-scale-x-100 w-3.5 h-3.5" />
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
