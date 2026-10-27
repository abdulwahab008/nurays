'use client';

import { useState, useEffect } from 'react';
import { loginUrlHere } from '@/lib/auth-redirect';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { DashboardLayout, CUSTOMER_SIDEBAR_ITEMS } from '@/components/layout/DashboardShell';
import { Button } from '@/components/ui/button';
import { LoadError } from '@/components/ui/LoadError';
import { useAuthStore } from '@/lib/store/auth-store';
import { formatDate } from '@/lib/utils';
import { apiClient, apiErrorCode, apiErrorMessage } from '@/lib/api-client';
import { useToast } from '@/components/ui/toast';
import { useT } from '@/lib/i18n';
import { commonMessages } from '@/lib/i18n/messages/common';
import { accountMessages } from '@/lib/i18n/messages/account';
import {
  Package,
  Tag,
  Bell,
  Truck,
  BellOff,
  X,
  ArrowRight,
  CheckCheck,
} from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';

interface Notification {
  id: string;
  type: 'order' | 'promo' | 'system' | 'delivery';
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  link?: string;
}

export default function NotificationsPage() {
  const router = useRouter();
  const { isAuthenticated, user } = useAuthStore(useShallow((s) => ({ isAuthenticated: s.isAuthenticated, user: s.user })));
  const { showToast } = useToast();
  const t = useT(accountMessages);
  const tc = useT(commonMessages);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [loading, setLoading] = useState(true);
  // Why the notifications could not be read; shown instead of "No notifications yet", which would be untrue.
  const [loadError, setLoadError] = useState<unknown>(null);

  const sidebarItems = CUSTOMER_SIDEBAR_ITEMS;

  const loadNotifications = async () => {
    setLoadError(null);
    setLoading(true);
    try {
      const response = await apiClient.get('/notifications');
      if (response.data?.success && response.data?.data) {
        const list = response.data.data.notifications || [];
        setNotifications(
          list.map((n: { actionUrl?: string; link?: string; [k: string]: unknown }) => ({
            ...n,
            link: (n.link ?? n.actionUrl) as string | undefined,
          }))
        );
      } else {
        setNotifications([]);
      }
    } catch (error: unknown) {
      console.error('Failed to load notifications:', error);
      // What is already on the screen stays (a refresh that fails must not wipe the list).
      setLoadError(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const token = apiClient.getAccessToken();
    if (!token && !isAuthenticated) {
      router.push(loginUrlHere());
      return;
    }
    loadNotifications();
  }, [isAuthenticated]);

  const renderNotificationIcon = (type: string) => {
    switch (type) {
      case 'order':
        return <Package className="w-5 h-5 text-brand-soft-ink" />;
      case 'promo':
        return <Tag className="w-5 h-5 text-accent-soft-ink" />;
      case 'delivery':
        return <Truck className="w-5 h-5 text-frozen-ink" />;
      case 'system':
      default:
        return <Bell className="w-5 h-5 text-muted" />;
    }
  };

  const getNotificationColor = (type: string) => {
    const colors: Record<string, string> = {
      order: 'bg-brand-soft border-transparent',
      promo: 'bg-accent-soft border-transparent',
      system: 'bg-raised border-transparent',
      delivery: 'bg-frozen-soft border-transparent',
    };
    return colors[type] || 'bg-raised border-line';
  };

  // The page only changes after the server has agreed, so what it shows is what the next load will show.
  const markAsRead = async (id: string) => {
    try {
      await apiClient.patch(`/notifications/${id}/read`);
      setNotifications(prev =>
        prev.map(n => (n.id === id ? { ...n, isRead: true } : n))
      );
    } catch (error) {
      showToast(apiErrorMessage(error, t('markReadFailed')), 'error');
    }
  };

  const markAllAsRead = async () => {
    try {
      await apiClient.patch('/notifications/read-all');
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      showToast(t('allMarkedRead'), 'success');
    } catch (error) {
      showToast(apiErrorMessage(error, t('markAllReadFailed')), 'error');
    }
  };

  const deleteNotification = async (id: string) => {
    try {
      await apiClient.delete(`/notifications/${id}`);
    } catch (error) {
      // Already gone (deleted in another tab): the list should drop it too.
      if (apiErrorCode(error) !== 'NOTIFICATION_NOT_FOUND') {
        showToast(apiErrorMessage(error, t('deleteFailed')), 'error');
        return;
      }
    }
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const filteredNotifications = notifications.filter(n =>
    filter === 'all' ? true : !n.isRead
  );

  const unreadCount = notifications.filter(n => !n.isRead).length;
  // Nothing could be read and nothing older is on the screen: no counters and no "No notifications yet", which would say what the page does not know.
  const couldNotRead = !loading && Boolean(loadError) && notifications.length === 0;

  if (!isAuthenticated) {
    return null;
  }

  return (
    <DashboardLayout
      title={t('notifications')}
      subtitle={couldNotRead ? undefined : t(unreadCount !== 1 ? 'unreadMany' : 'unreadOne', { count: unreadCount })}
      sidebarItems={sidebarItems}
      userType="customer"
    >
      {/* Header Actions */}
      {!couldNotRead && (
        <div className="flex items-center justify-between mb-6">
          <div className="flex gap-2">
            <button
              onClick={() => setFilter('all')}
              className={`h-10 px-4 rounded-full text-sm font-bold transition-colors ${
                filter === 'all'
                  ? 'bg-ink text-page'
                  : 'bg-surface text-ink border border-line hover:bg-raised'
              }`}
            >
              {t('filterAll', { count: notifications.length })}
            </button>
            <button
              onClick={() => setFilter('unread')}
              className={`h-10 px-4 rounded-full text-sm font-bold transition-colors ${
                filter === 'unread'
                  ? 'bg-ink text-page'
                  : 'bg-surface text-ink border border-line hover:bg-raised'
              }`}
            >
              {t('filterUnread', { count: unreadCount })}
            </button>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/notifications/settings" className="text-sm font-medium text-muted hover:text-ink underline">
              {t('settings')}
            </Link>
            {unreadCount > 0 && (
              <Button variant="outline" onClick={markAllAsRead} className="text-sm">
                <CheckCheck className="w-4 h-4 me-2" /> {t('markAllRead')}
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Notifications List */}
      {Boolean(loadError) && !loading && (
        <LoadError compact={!couldNotRead} error={loadError} onRetry={loadNotifications} title={t('loadNotificationsFailed')} className="mb-4" />
      )}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand mx-auto mb-4"></div>
            <p className="text-muted">{t('loadingNotifications')}</p>
          </div>
        </div>
      ) : couldNotRead ? null : filteredNotifications.length === 0 ? (
        <div className="bg-surface rounded-2xl shadow-sm border border-line p-12 text-center">
          <div className="w-20 h-20 bg-raised rounded-full flex items-center justify-center mx-auto mb-6 text-muted">
            <BellOff className="w-10 h-10" />
          </div>
          <h2 className="text-xl font-bold text-ink mb-2">
            {filter === 'unread' ? t('allCaughtUp') : t('noNotifications')}
          </h2>
          <p className="text-muted">
            {filter === 'unread'
              ? t('readAll')
              : t('notificationsWillAppear')}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredNotifications.map((notification) => (
            <div
              key={notification.id}
              className={`bg-surface rounded-[20px] border p-4 transition-colors hover:border-line-strong ${
                !notification.isRead ? 'border-line border-s-4 border-s-brand' : 'border-line'
              }`}
            >
              <div className="flex items-start gap-4">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 border ${getNotificationColor(notification.type)}`}>
                  {renderNotificationIcon(notification.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className={`font-semibold ${!notification.isRead ? 'text-ink' : 'text-ink'}`}>
                        {notification.title}
                      </h3>
                      <p className="text-muted text-sm mt-1">{notification.message}</p>
                      <p className="text-xs text-muted mt-2">
                        {formatDate(notification.createdAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {!notification.isRead && (
                        <button
                          onClick={() => markAsRead(notification.id)}
                          className="text-xs text-brand-ink hover:underline font-medium"
                        >
                          {t('markRead')}
                        </button>
                      )}
                      <button
                        onClick={() => deleteNotification(notification.id)}
                        className="p-1 rounded-lg text-muted hover:text-red-500 hover:bg-raised transition-colors"
                        title={tc('delete')}
                        aria-label={tc('delete')}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  {notification.link && (
                    <Link
                      href={notification.link}
                      className="inline-flex items-center gap-1 mt-3 text-sm text-brand-ink hover:underline font-medium"
                    >
                      <span>{t('viewDetails')}</span>
                      <ArrowRight className="rtl:-scale-x-100 w-4 h-4" />
                    </Link>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </DashboardLayout>
  );
}
