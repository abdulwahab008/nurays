'use client';

import Link from 'next/link';
import { loginUrlHere } from '@/lib/auth-redirect';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { DashboardLayout, SELLER_SIDEBAR_ITEMS } from '@/components/layout/DashboardShell';
import { Button } from '@/components/ui/button';
import { LoadError } from '@/components/ui/LoadError';
import { useToast } from '@/components/ui/toast';
import { useAuthStore } from '@/lib/store/auth-store';
import { apiClient, apiErrorMessage } from '@/lib/api-client';
import { formatTime } from '@/lib/utils';
import { dateClock } from '@/components/sellers/order-timing';
import { useLocale, useT } from '@/lib/i18n';
import { accountMessages } from '@/lib/i18n/messages/account';
import { useShallow } from 'zustand/react/shallow';

const sidebarItems = SELLER_SIDEBAR_ITEMS;

interface Notification {
  id: string;
  type: 'order' | 'payment' | 'product' | 'system' | 'warning' | 'success';
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  link?: string;
}

export default function SellerNotificationsPage() {
  const router = useRouter();
  const { isAuthenticated, user } = useAuthStore(useShallow((s) => ({ isAuthenticated: s.isAuthenticated, user: s.user })));
  const { showToast } = useToast();
  const t = useT(accountMessages);
  const { locale } = useLocale();
  // Today's alerts by the clock (a kitchen reads several a day), older ones with their date.
  const when = (iso: string) => (new Date(iso).toDateString() === new Date().toDateString() ? formatTime(iso) : dateClock(iso, locale));
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  // Why the notifications could not be read; shown instead of "No notifications", which would be untrue.
  const [loadError, setLoadError] = useState<unknown>(null);

  const loadNotifications = async () => {
    setLoadError(null);
    try {
      setLoading(true);
      const response = await apiClient.get('/notifications');
      if (response.data.success) {
        const list = response.data.data.notifications || [];
        setNotifications(
          (list as Array<Notification & { actionUrl?: string }>).map((n) => ({
            ...n,
            link: n.link ?? n.actionUrl,
          }))
        );
      }
    } catch (error: unknown) {
      // What is already on the screen stays (a refresh that fails must not wipe the list).
      setLoadError(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isAuthenticated) {
      router.replace(loginUrlHere());
      return;
    }

    if (user?.userType !== 'seller' && user?.user_type !== 'seller') {
      router.push('/dashboard');
      showToast(t('sellerAccessDenied'), 'error');
      return;
    }

    loadNotifications();
  }, [isAuthenticated, user, router]);

  // The page only changes after the server has agreed, so what it shows is what the next load will show.
  const handleMarkAsRead = async (notificationId: string) => {
    try {
      await apiClient.patch(`/notifications/${notificationId}/read`);
      setNotifications(prev => prev.map(n => (n.id === notificationId ? { ...n, isRead: true } : n)));
    } catch (error: unknown) {
      showToast(apiErrorMessage(error, t('markReadFailed')), 'error');
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await apiClient.patch('/notifications/read-all');
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      showToast(t('allMarkedRead'), 'success');
    } catch (error: unknown) {
      showToast(apiErrorMessage(error, t('markAllReadFailed')), 'error');
    }
  };

  const filteredNotifications = filter === 'unread' 
    ? notifications.filter(n => !n.isRead)
    : notifications;

  const unreadCount = notifications.filter(n => !n.isRead).length;
  // Nothing could be read and nothing older is on the screen: no counters and no "No notifications", which would say what the page does not know.
  const couldNotRead = !loading && Boolean(loadError) && notifications.length === 0;

  if (!isAuthenticated) {
    return null;
  }

  return (
    <DashboardLayout
      title={t('notifications')}
      sidebarItems={sidebarItems}
      userType="seller"
    >
      <div className="max-w-3xl">
        {!couldNotRead && notifications.length > 0 && (
          <div className="flex items-end justify-between gap-4 border-b border-line mb-2">
            <div role="tablist" aria-label={t('notifications')} className="flex gap-6">
              {(['all', 'unread'] as const).map((tab) => {
                const selected = filter === tab;
                return (
                  <button
                    key={tab}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    onClick={() => setFilter(tab)}
                    className={`relative -mb-px flex items-center gap-2 min-h-11 pb-1 text-[15px] whitespace-nowrap border-b-2 transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand/40 ${
                      selected ? 'border-brand-600 text-ink font-semibold' : 'border-transparent text-muted hover:text-ink'
                    }`}
                  >
                    {t(tab)}
                    {tab === 'unread' && unreadCount > 0 && (
                      <span className="min-w-6 px-1.5 py-0.5 rounded-full text-xs font-semibold tabular-nums bg-raised text-muted">
                        {unreadCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            {unreadCount > 0 && (
              <Button variant="ghost" onClick={handleMarkAllAsRead} className="mb-1 px-3">
                {t('markAllRead')}
              </Button>
            )}
          </div>
        )}

        {Boolean(loadError) && !loading && (
          <LoadError compact={!couldNotRead} error={loadError} onRetry={() => loadNotifications()} title={t('loadNotificationsFailed')} className="my-4" />
        )}
        {loading ? (
          <div className="flex items-center gap-3 py-10 text-sm text-muted" role="status">
            <span className="h-5 w-5 rounded-full border-2 border-line-strong border-t-brand-600 motion-safe:animate-spin" aria-hidden="true" />
            {t('loadingNotifications')}
          </div>
        ) : couldNotRead ? null : filteredNotifications.length === 0 ? (
          <p className={`${notifications.length === 0 ? 'pt-2' : 'py-10'} text-[15px] text-muted`}>
            {filter === 'unread' ? t('noUnreadNotifications') : t('noNotificationsYetLong')}
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {filteredNotifications.map((notification) => (
              <li key={notification.id}>
                <button
                  type="button"
                  onClick={() => {
                    if (!notification.isRead) {
                      handleMarkAsRead(notification.id);
                    }
                    if (notification.link) {
                      router.push(notification.link);
                    }
                  }}
                  className="w-full flex gap-3 py-4 px-2 -mx-2 text-start rounded-lg hover:bg-raised transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand/40"
                >
                  <span className="w-2 shrink-0 pt-2" aria-hidden={notification.isRead}>
                    {!notification.isRead && (
                      <span className="block h-2 w-2 rounded-full bg-brand-600">
                        <span className="sr-only">{t('unread')}</span>
                      </span>
                    )}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="flex items-baseline justify-between gap-x-3">
                      <span className={`min-w-0 text-[15px] ${notification.isRead ? 'text-ink' : 'text-ink font-semibold'}`}>
                        {notification.title}
                      </span>
                      <span className="shrink-0 text-xs text-muted whitespace-nowrap">{when(notification.createdAt)}</span>
                    </span>
                    <span className="block text-sm text-muted mt-0.5">{notification.message}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {!couldNotRead && !loading && (
          <p className={notifications.length === 0 ? 'mt-1' : 'mt-6'}>
            <Link
              href="/notifications/settings"
              className="inline-flex items-center min-h-11 text-sm font-medium text-brand-ink hover:underline underline-offset-4 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand/40 rounded"
            >
              {t('alertSettings')}
            </Link>
          </p>
        )}
      </div>
    </DashboardLayout>
  );
}
